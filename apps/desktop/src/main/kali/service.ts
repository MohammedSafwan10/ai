import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { waitWithAbort } from "../abort";
import { autoSaveSecurityEvidence, ensureSecurityEvidenceFolder, securityEvidenceFolder } from "../attachments/securityEvidenceAutoSave";
import { setTimeout as delay } from "node:timers/promises";
import type { DesktopStore } from "../db/store";
import type { DesktopToolCall, ToolResult } from "../../shared/types";
import type { KaliEnvironment, KaliJob } from "../../shared/kali";
import type { SecurityEnvironmentRecord, SecurityFindingRecord, SecurityJobRecord, SecurityWorkspaceState } from "../../shared/securityWorkspace";
import { KaliConnector, KaliConnectionError, KaliRequestError, buildKaliSshArgs } from "./connector";
import { KaliOutputDecoder, kaliArtifactMime, kaliCommandPreview, requiredText } from "./tools";
import { HeadTailOutputBuffer } from "../terminal/outputBuffer";
import { redactSecrets } from "../security/redact";
import { listSecurityKnowledge, readSecurityKnowledge } from "./knowledge";
import { SECURITY_CONNECTION_MAX_AGE_MS, securityConnectionStatus } from "../../shared/securityConnection";

export interface SecurityExecutionContext {
  workspaceId: string;
  threadId: string;
  messageId?: string;
  signal?: AbortSignal;
  onOutput?: (output: string) => void;
}

type SecurityStore = Pick<DesktopStore,
  "getWorkspace" | "getThread" | "listWorkspaces" | "getSecurityEnvironment" |
  "getSecurityEnvironmentConfig" | "saveSecurityEnvironment" | "listSecurityEnvironments" |
  "getSecurityJob" | "listSecurityJobs" | "upsertSecurityJob" | "getSecurityFinding" |
  "listSecurityFindings" | "upsertSecurityFinding" | "importAttachment">;
const terminal = (state: SecurityJobRecord["state"]) => ["succeeded", "failed", "cancelled", "timed_out"].includes(state);
const errorText = (error: unknown) => redactSecrets(error instanceof Error ? error.message : String(error));
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export class SecurityWorkspaceService {
  private readonly active = new Map<string, { controller: AbortController; promise: Promise<SecurityJobRecord> }>();
  private readonly reconciling = new Map<string, Promise<SecurityWorkspaceState>>();
  private readonly checking = new Map<string, Promise<SecurityEnvironmentRecord>>();
  private readonly lastReconciled = new Map<string, number>();
  private readonly pending = new Set<Promise<unknown>>();
  private closing = false;
  private notificationTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly store: SecurityStore,
    private readonly onChange?: () => void,
    private readonly connectorFactory: (environment: KaliEnvironment) => KaliConnector = (environment) => new KaliConnector(environment),
    private readonly localEvidenceRoot?: string,
  ) {
    // A saved connection label does not establish that the VM is still online.
    for (const environment of store.listSecurityEnvironments()) {
      if (environment.status === "connected") store.saveSecurityEnvironment({ ...environment, status: "unchecked", capabilities: undefined, error: undefined });
    }
  }

  private track<T>(promise: Promise<T>): Promise<T> {
    this.pending.add(promise);
    void promise.then(() => this.pending.delete(promise), () => this.pending.delete(promise));
    return promise;
  }

  beginShutdown() {
    this.closing = true;
    if (this.notificationTimer) clearTimeout(this.notificationTimer);
    this.notificationTimer = undefined;
    for (const activity of this.active.values()) activity.controller.abort();
  }

  cancelShutdown() {
    this.closing = false;
    this.changed();
  }

  async waitForIdle() {
    while (this.pending.size || this.active.size) {
      await Promise.allSettled([...this.pending, ...[...this.active.values()].map((activity) => activity.promise)]);
    }
  }

  private requireOpen() {
    if (this.closing) throw new Error("Privora is stopping remote work before closing.");
  }

  private changed() {
    if (this.closing || !this.onChange || this.notificationTimer) return;
    this.notificationTimer = setTimeout(() => {
      this.notificationTimer = undefined;
      this.onChange?.();
    }, 100);
    this.notificationTimer.unref?.();
  }

  private persist(job: SecurityJobRecord) {
    const current = this.store.getSecurityJob(job.id);
    if (current?.artifacts?.length) {
      job = { ...job, artifacts: [...new Map([...(current.artifacts ?? []), ...(job.artifacts ?? [])].map((artifact) => [artifact.id, artifact])).values()] };
    }
    this.store.upsertSecurityJob(job);
    this.changed();
    return job;
  }

  private connector(environmentId: string) {
    const environment = this.store.getSecurityEnvironmentConfig(environmentId);
    if (!environment) throw new Error("Kali environment is not configured. Local fallback is disabled.");
    return this.connectorFactory(environment);
  }

  private connected(environmentId: string) {
    const environment = this.store.getSecurityEnvironment(environmentId);
    if (environment) {
      this.store.saveSecurityEnvironment({ ...environment, status: "connected", error: undefined, lastCheckedAt: Date.now() });
      this.changed();
    }
  }

  private workspace(workspaceId: string) {
    const workspace = this.store.getWorkspace(workspaceId);
    if (workspace?.type !== "security" || !workspace.security) throw new Error("Remote tools require a Security workspace.");
    return workspace;
  }

  private connectionFailed(environmentId: string, error: unknown) {
    const environment = this.store.getSecurityEnvironment(environmentId);
    if (environment && error instanceof KaliConnectionError && error.connectionLost) {
      this.store.saveSecurityEnvironment({ ...environment, status: "disconnected", error: errorText(error), lastCheckedAt: Date.now() });
      this.changed();
    }
  }

  private scopedJob(id: string, context: SecurityExecutionContext) {
    const workspace = this.workspace(context.workspaceId);
    const job = this.store.getSecurityJob(id);
    if (!job || job.workspaceId !== workspace.id || job.environmentId !== workspace.security?.environmentId) {
      throw new Error("Job does not belong to this Security workspace and environment.");
    }
    return job;
  }

  importEnvironmentProfile(profile: unknown): Promise<SecurityEnvironmentRecord> {
    return this.track(this.importProfile(profile));
  }

  private async importProfile(profile: unknown): Promise<SecurityEnvironmentRecord> {
    this.requireOpen();
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) throw new Error("Invalid Kali profile.");
    const input = profile as Record<string, unknown>;
    const config: KaliEnvironment = {
      id: requiredText(input.id, "environment ID", 100),
      host: requiredText(input.host, "host", 255), port: Number(input.port),
      username: requiredText(input.username, "username", 100),
      identityFile: requiredText(input.identityFile, "identity file"),
      knownHostsFile: requiredText(input.knownHostsFile, "host pin file"),
      hostFingerprint: requiredText(input.hostFingerprint, "host fingerprint", 100),
      runnerPath: requiredText(input.runnerPath, "runner path"), jobRoot: requiredText(input.jobRoot, "job root"),
    };
    if (!path.isAbsolute(config.identityFile) || !path.isAbsolute(config.knownHostsFile)) throw new Error("SSH file paths must be absolute.");
    buildKaliSshArgs(config);
    const previous = this.store.getSecurityEnvironment(config.id);
    if (previous && this.store.listWorkspaces().some((workspace) => workspace.security?.environmentId === config.id)) {
      const prior = this.store.getSecurityEnvironmentConfig(config.id);
      if (JSON.stringify(prior) !== JSON.stringify(config)) throw new Error("An environment used by a workspace cannot be replaced; import a new ID.");
    }
    const record: SecurityEnvironmentRecord = {
      id: config.id, name: typeof input.name === "string" ? requiredText(input.name, "name", 100) : config.id,
      host: config.host, port: config.port, username: config.username, status: "unchecked",
    };
    this.store.saveSecurityEnvironment(record, config);
    this.changed();
    return record;
  }

  checkEnvironment(id: string): Promise<SecurityEnvironmentRecord> {
    if (this.closing) return Promise.reject(new Error("Privora is stopping remote work before closing."));
    const existing = this.checking.get(id);
    if (existing) return existing;
    const promise = this.track(this.check(id)).finally(() => this.checking.delete(id));
    this.checking.set(id, promise);
    return promise;
  }

  private async check(id: string): Promise<SecurityEnvironmentRecord> {
    this.requireOpen();
    const current = this.store.getSecurityEnvironment(id);
    if (!current) throw new Error("Unknown Kali environment.");
    let next: SecurityEnvironmentRecord;
    try {
      const capabilities = await this.connector(id).capabilities();
      next = { ...current, status: "connected", capabilities, lastCheckedAt: Date.now(), error: undefined };
    } catch (error) {
      next = { ...current, status: "disconnected", lastCheckedAt: Date.now(), error: errorText(error) };
    }
    this.store.saveSecurityEnvironment(next);
    this.changed();
    if (!this.closing && next.status === "connected") {
      for (const workspace of this.store.listWorkspaces()) {
        if (workspace.type === "security" && workspace.security?.environmentId === id) void this.reconcileWorkspace(workspace.id).catch(() => undefined);
      }
    }
    return next;
  }

  async getWorkspaceState(workspaceId: string): Promise<SecurityWorkspaceState> {
    const state = this.workspaceState(workspaceId);
    const environment = state.environment;
    if (!this.closing && environment && Date.now() - (environment.lastCheckedAt ?? 0) >= SECURITY_CONNECTION_MAX_AGE_MS) {
      if (securityConnectionStatus(environment) === "unchecked" && environment.status === "connected") {
        state.environment = { ...environment, status: "unchecked" };
        this.store.saveSecurityEnvironment(state.environment);
        this.changed();
      }
      // UI polling checks reachability only; it never submits or replays jobs.
      void this.checkEnvironment(environment.id).catch(() => undefined);
    }
    if (!this.closing && state.jobs.some((job) => !terminal(job.state)) && Date.now() - (this.lastReconciled.get(workspaceId) ?? 0) > 5000) {
      void this.reconcileWorkspace(workspaceId).catch(() => undefined);
    }
    return state;
  }

  async ensureEvidenceFolder(workspaceId: string) {
    const workspace = this.workspace(workspaceId);
    if (!this.localEvidenceRoot) throw new Error("Automatic PC evidence storage is not configured.");
    return ensureSecurityEvidenceFolder(this.localEvidenceRoot, workspace.id, workspace.security?.evidenceFolderName ?? workspace.name);
  }

  private workspaceState(workspaceId: string): SecurityWorkspaceState {
    const workspace = this.workspace(workspaceId);
    return {
      evidenceFolder: this.localEvidenceRoot ? securityEvidenceFolder(this.localEvidenceRoot, workspace.id, workspace.security?.evidenceFolderName ?? workspace.name) : undefined,
      environment: this.store.getSecurityEnvironment(workspace.security!.environmentId),
      jobs: this.store.listSecurityJobs(workspaceId), findings: this.store.listSecurityFindings(workspaceId),
    };
  }

  private merge(job: SecurityJobRecord, remote: KaliJob) {
    if (remote.projectId !== job.projectId || (job.remoteJobId && remote.id !== job.remoteJobId)) {
      throw new Error("Kali returned a job outside the selected workspace.");
    }
    this.connected(job.environmentId);
    return this.persist({ ...job, remoteJobId: remote.id, state: remote.state, exitCode: remote.exitCode,
      error: remote.error ? redactSecrets(remote.error) : null, updatedAt: Date.now() });
  }

  private unknown(job: SecurityJobRecord, error: unknown) {
    this.connectionFailed(job.environmentId, error);
    return this.persist({ ...job, state: "unknown", error: errorText(error), updatedAt: Date.now() });
  }

  private async reconcile(job: SecurityJobRecord) {
    try {
      const connector = this.connector(job.environmentId);
      const remote = job.remoteJobId ? await connector.inspect(job.remoteJobId) : await connector.lookup(job.idempotencyKey);
      this.connected(job.environmentId);
      if (!remote) return this.unknown(job, "Delivery is unconfirmed. No job was found; the command will not be replayed automatically.");
      return this.merge(job, remote);
    } catch (error) { return this.unknown(job, error); }
  }

  reconcileWorkspace(workspaceId: string): Promise<SecurityWorkspaceState> {
    if (this.closing) return Promise.resolve(this.workspaceState(workspaceId));
    const existing = this.reconciling.get(workspaceId);
    if (existing) return existing;
    const promise = this.reconcileWorkspaceJobs(workspaceId).catch(() => this.workspaceState(workspaceId)).finally(() => {
      this.reconciling.delete(workspaceId);
      this.lastReconciled.set(workspaceId, Date.now());
    });
    this.reconciling.set(workspaceId, promise);
    return this.track(promise);
  }

  private async reconcileWorkspaceJobs(workspaceId: string) {
    this.workspace(workspaceId);
    for (const job of this.store.listSecurityJobs(workspaceId)) {
      if (this.closing) break;
      if (terminal(job.state) || this.active.has(job.id)) continue;
      const current = await this.reconcile(job);
      if (!this.closing && current.remoteJobId && current.state !== "unknown") void this.watch(current).catch(() => undefined);
    }
    return this.workspaceState(workspaceId);
  }

  recover() { return this.track(this.recoverWorkspaces()); }

  private async recoverWorkspaces() {
    for (const workspace of this.store.listWorkspaces()) {
      if (this.closing) break;
      if (workspace.type === "security") await this.reconcileWorkspace(workspace.id);
    }
  }

  private watch(job: SecurityJobRecord, context?: SecurityExecutionContext) {
    const existing = this.active.get(job.id);
    if (existing) return existing.promise;
    const controller = new AbortController();
    const abort = () => controller.abort();
    context?.signal?.addEventListener("abort", abort, { once: true });
    if (this.closing || context?.signal?.aborted) controller.abort();
    const promise = this.watchRemote(job, controller.signal, context?.onOutput).finally(() => {
      context?.signal?.removeEventListener("abort", abort);
      this.active.delete(job.id);
    });
    this.active.set(job.id, { controller, promise });
    return promise;
  }

  private async watchRemote(initial: SecurityJobRecord, signal: AbortSignal, onOutput?: (output: string) => void) {
    let job = initial;
    const decoder = new KaliOutputDecoder();
    const preview = new HeadTailOutputBuffer(32_000);
    // Replay retained bytes from zero to reconstruct UTF-8 boundaries
    // after a restart. Existing output is not emitted twice to the chat.
    const previousSequence = initial.sequence;
    const emit = (text: string, live: boolean) => {
      if (!text) return;
      preview.push(text);
      if (live) onOutput?.(text);
    };
    try {
      if (!job.remoteJobId) throw new Error("Remote job ID is unconfirmed.");
      const remote = await this.connector(job.environmentId).watch(job.remoteJobId, {
        signal, expectedProjectId: job.projectId,
        onOutput: (event) => {
          emit(decoder.push(event.stream, Buffer.from(event.data, "base64")), event.sequence > previousSequence);
          job = this.persist({ ...job, sequence: event.sequence, outputPreview: preview.toString(), updatedAt: Date.now() });
        },
        // Persist a terminal state only after the final decoder flush. A crash
        // before that flush must leave the job recoverable, not falsely complete.
        onState: (state) => { if (!terminal(state.state)) job = this.merge(job, state); },
      });
      emit(decoder.finish(), true);
      return this.merge({ ...job, outputPreview: preview.toString() }, remote);
    } catch (error) {
      // Keep emitted partial output while leaving an uncertain job recoverable.
      return this.unknown(job, error);
    }
  }

  cancelJob(id: string): Promise<SecurityJobRecord> { return this.track(this.cancel(id)); }

  private async cancel(id: string): Promise<SecurityJobRecord> {
    let job = this.store.getSecurityJob(id);
    if (!job) throw new Error("Unknown remote job.");
    const workspace = this.workspace(job.workspaceId);
    if (workspace.security?.environmentId !== job.environmentId) throw new Error("Job environment no longer matches its workspace.");
    if (terminal(job.state)) return job;
    const active = this.active.get(id);
    if (active) {
      active.controller.abort();
      return active.promise;
    }
    job = await this.reconcile(job);
    if (!job.remoteJobId || job.state === "unknown") return job;
    try {
      job = this.merge(job, await this.connector(job.environmentId).cancel(job.remoteJobId));
      const deadline = Date.now() + 12_000;
      while (!terminal(job.state) && Date.now() < deadline) {
        await delay(250);
        job = this.merge(job, await this.connector(job.environmentId).inspect(job.remoteJobId!));
      }
      return terminal(job.state) ? job : this.unknown(job, "Remote cancellation could not be confirmed.");
    } catch (error) { return this.unknown(job, error); }
  }

  async stopThreadJobs(threadId: string) {
    const thread = this.store.getThread(threadId);
    if (!thread?.workspaceId) return [];
    const workspace = this.store.getWorkspace(thread.workspaceId);
    if (workspace?.type !== "security") return [];
    const jobs = await Promise.all(this.store.listSecurityJobs(workspace.id, threadId)
      .filter((job) => !terminal(job.state)).map((job) => this.cancelJob(job.id)));
    return jobs.filter((job) => !terminal(job.state));
  }

  execute(call: DesktopToolCall, context: SecurityExecutionContext): Promise<ToolResult> {
    return this.track(this.executeOpen(call, context));
  }

  private async executeOpen(call: DesktopToolCall, context: SecurityExecutionContext): Promise<ToolResult> {
    try {
      context.signal?.throwIfAborted();
      this.requireOpen();
      const workspace = this.workspace(context.workspaceId);
      const thread = this.store.getThread(context.threadId);
      if (thread?.workspaceId !== workspace.id) throw new Error("Thread does not belong to this Security workspace.");
      const args = call.arguments;
      switch (call.name) {
        case "security_knowledge_list": {
          if (!this.localEvidenceRoot) throw new Error("The shared evidence folder is not configured.");
          const result = await waitWithAbort(listSecurityKnowledge(this.localEvidenceRoot, args.query === undefined ? "" : args.query as string, args.limit === undefined ? 50 : args.limit as number), context.signal);
          return { success: true, output: `${result.notice}\n${result.items.map((item) => `${item.path} (${item.bytes} bytes)`).join("\n") || "No matching collected documents found. This is separate from this project's findings store."}${result.truncated ? "\nListing bounded; narrow query to locate more documents." : ""}`, data: result };
        }
        case "security_knowledge_read": {
          if (!this.localEvidenceRoot) throw new Error("The shared evidence folder is not configured.");
          const result = await waitWithAbort(readSecurityKnowledge(this.localEvidenceRoot, requiredText(args.path, "knowledge path", 2000), args.offset as number | undefined, args.maxChars as number | undefined), context.signal);
          return { success: true, output: `${result.notice}\n\n${result.text}${result.nextOffset !== undefined ? `\nContinue at offset=${result.nextOffset}.` : ""}`, data: result };
        }
        case "kali_capabilities": {
          const tools = args.tools ?? [];
          if (!Array.isArray(tools) || tools.length > 64 || tools.some((tool) => typeof tool !== "string" || !/^[a-zA-Z0-9_.+-]{1,64}$/.test(tool))) throw new Error("Invalid tool list.");
          const capabilities = await this.connector(workspace.security!.environmentId).capabilities(tools as string[], context.signal);
          this.connected(workspace.security!.environmentId);
          return { success: true, output: redactSecrets(JSON.stringify(capabilities)), data: { capabilities } };
        }
        case "kali_exec": return await this.exec(call, context);
        case "kali_job_cancel": {
          const job = this.scopedJob(requiredText(args.jobId, "job ID", 100), context);
          return this.result(await this.cancelJob(job.id), true);
        }
        case "kali_job_status": {
          const job = this.scopedJob(requiredText(args.jobId, "job ID", 100), context);
          return this.result(terminal(job.state) || this.active.has(job.id) ? job : await this.reconcile(job), true);
        }
        case "kali_job_output": {
          let job = this.scopedJob(requiredText(args.jobId, "job ID", 100), context);
          if (args.follow !== undefined && typeof args.follow !== "boolean") throw new Error("follow must be a boolean.");
          if (args.follow !== true) return this.result(job, true);
          if (!terminal(job.state)) job = await this.reconcile(job);
          if (job.remoteJobId && job.state !== "unknown") job = await this.watch(job, context);
          return this.result(job, true);
        }
        case "kali_artifact": return await this.artifact(args, context);
        case "security_finding_list": return { success: true, data: { findings: this.store.listSecurityFindings(workspace.id) } };
        case "security_finding_save": return this.finding(args, context);
        default: throw new Error("Unsupported Security tool.");
      }
    } catch (error) {
      const environmentId = this.store.getWorkspace(context.workspaceId)?.security?.environmentId;
      if (environmentId) this.connectionFailed(environmentId, error);
      return { success: false, error: errorText(error) };
    }
  }

  private result(job: SecurityJobRecord, inspection = false): ToolResult {
    const success = inspection ? job.state !== "unknown" && job.state !== "submitting" : job.state === "succeeded";
    return { success, output: job.outputPreview,
      error: success ? undefined : job.error ?? `Remote job ${job.state}.`,
      data: { job, jobId: job.id, remoteJobId: job.remoteJobId, state: job.state } };
  }

  private async exec(call: DesktopToolCall, context: SecurityExecutionContext) {
    context.signal?.throwIfAborted();
    const workspace = this.workspace(context.workspaceId);
    const argv = call.arguments.argv;
    if (!Array.isArray(argv) || !argv.length || argv.length > 256 || argv.some((arg) => typeof arg !== "string" || arg.includes("\0")) || !argv[0]) throw new Error("Expected a nonempty argv array.");
    const timeoutSeconds = call.arguments.timeoutSeconds ?? 120;
    if (typeof timeoutSeconds !== "number" || !Number.isFinite(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 3600) throw new Error("Timeout must be 1–3600 seconds.");
    const cwd = call.arguments.cwd;
    if (cwd !== undefined && (typeof cwd !== "string" || cwd.startsWith("/") || cwd.split("/").includes("..") || cwd.includes("\0"))) throw new Error("cwd must be relative to the Kali project directory.");
    const id = digest(`${context.workspaceId}:${context.threadId}:${call.id}`);
    let job = this.store.getSecurityJob(id);
    if (job) {
      job = this.scopedJob(id, context);
      if (terminal(job.state)) return this.result(job);
      job = await this.reconcile(job);
      if (!job.remoteJobId || job.state === "unknown") return this.result(job);
      return this.result(await this.watch(job, context));
    }
    const now = Date.now();
    job = this.persist({ id, remoteJobId: null, workspaceId: workspace.id, threadId: context.threadId,
      messageId: context.messageId, toolCallId: call.id, environmentId: workspace.security!.environmentId,
      idempotencyKey: `privora-${id}`, projectId: `workspace-${digest(workspace.id).slice(0, 24)}`,
      state: "submitting", sequence: 0, outputPreview: "", commandPreview: kaliCommandPreview(argv),
      exitCode: null, error: null, createdAt: now, updatedAt: now });
    try {
      const remote = await this.connector(job.environmentId).submit({
        projectId: job.projectId, idempotencyKey: job.idempotencyKey, argv: argv as string[],
        timeoutSeconds, ...(cwd !== undefined ? { cwd: cwd as string } : {}),
      });
      job = this.merge(job, remote);
    } catch (error) {
      if (error instanceof KaliRequestError) {
        if (error.notSubmitted) return this.result(this.persist({ ...job, state: "failed", error: errorText(error), updatedAt: Date.now() }));
        // A rejected submit may have committed its record before worker startup
        // failed. Look up the original identity instead of assuming no delivery.
        try {
          const remote = await this.connector(job.environmentId).lookup(job.idempotencyKey);
          this.connected(job.environmentId);
          if (!remote) return this.result(this.persist({ ...job, state: "failed", error: errorText(error), updatedAt: Date.now() }));
          job = this.merge(job, remote);
        } catch (lookupError) { return this.result(this.unknown(job, lookupError)); }
      } else return this.result(this.unknown(job, error));
    }
    return this.result(await this.watch(job, context));
  }

  private async artifact(args: Record<string, unknown>, context: SecurityExecutionContext): Promise<ToolResult> {
    const job = this.scopedJob(requiredText(args.jobId, "job ID", 100), context);
    if (!job.remoteJobId || !terminal(job.state)) throw new Error("Artifacts require a confirmed completed remote job.");
    const relative = requiredText(args.path, "artifact path", 1000);
    if (relative.startsWith("/") || relative.includes("\\") || relative.split("/").includes("..")) throw new Error("Artifact path must be relative to the Kali project.");
    const artifact = await this.connector(job.environmentId).artifact(job.remoteJobId, relative);
    const bytes = Buffer.from(artifact.data, "base64");
    const attachment = this.store.importAttachment({ id: randomUUID(), name: redactSecrets(path.posix.basename(relative)),
      mimeType: kaliArtifactMime(relative, bytes), bytes, createdAt: Date.now() });
    this.persist({ ...job, artifacts: [...(job.artifacts ?? []), attachment], updatedAt: Date.now() });
    let localPath: string | undefined;
    if (this.localEvidenceRoot) {
      try {
        const workspace = this.workspace(context.workspaceId);
        localPath = await autoSaveSecurityEvidence({ root: this.localEvidenceRoot, workspaceId: workspace.id,
          workspaceName: workspace.security?.evidenceFolderName ?? workspace.name, jobId: job.id, remotePath: relative,
          name: attachment.name, sha256: artifact.sha256, bytes });
      } catch (error) {
        return { success: false, error: `Evidence retained in Privora, but automatic PC save failed: ${errorText(error)}`,
          data: { attachment, sha256: artifact.sha256, jobId: job.id, localSaved: false } };
      }
    }
    return { success: true, output: `Evidence saved: ${attachment.name} (${artifact.size} bytes).${localPath ? ` Automatically saved to PC: ${localPath}` : ""}`,
      data: { attachment, sha256: artifact.sha256, jobId: job.id, ...(localPath ? { localPath, localSaved: true } : {}) } };
  }

  private finding(args: Record<string, unknown>, context: SecurityExecutionContext): ToolResult {
    const id = args.id === undefined ? randomUUID() : requiredText(args.id, "finding ID", 100);
    const existing = this.store.getSecurityFinding(id);
    if (existing && existing.workspaceId !== context.workspaceId) throw new Error("Finding belongs to another workspace.");
    const severity = args.severity ?? existing?.severity ?? "info";
    const state = args.state ?? existing?.state ?? "candidate";
    if (!["info", "low", "medium", "high", "critical"].includes(String(severity)) || !["candidate", "observed", "verified", "rejected", "stale"].includes(String(state))) throw new Error("Invalid finding severity or state.");
    const evidenceJobIds = args.evidenceJobIds === undefined ? existing?.evidenceJobIds ?? [] : args.evidenceJobIds;
    if (!Array.isArray(evidenceJobIds) || evidenceJobIds.length > 100 || evidenceJobIds.some((id) => typeof id !== "string" || !id.trim())) throw new Error("evidenceJobIds must be an array of persisted job ID strings; no evidence was changed.");
    const preserveUnresolved = args.evidenceJobIds === undefined && existing && state !== "verified";
    const evidence = preserveUnresolved ? [] : evidenceJobIds.map((id) => this.scopedJob(id, context));
    const reproduction = typeof args.reproduction === "string" ? redactSecrets(args.reproduction).slice(0, 20_000) : existing?.reproduction ?? "";
    if (state === "verified" && (!reproduction.trim() || !evidence.length || evidence.some((job) => job.state !== "succeeded" || (!job.outputPreview.trim() && !job.artifacts?.length)))) {
      throw new Error("Verified findings require reproduction and evidenceJobIds referencing successful completed jobs with retained evidence. Supply those IDs explicitly for a new finding; omitted IDs on updates preserve existing evidence. No finding was changed.");
    }
    const record: SecurityFindingRecord = {
      id, workspaceId: context.workspaceId, title: redactSecrets(requiredText(args.title, "finding title", 300)),
      description: redactSecrets(requiredText(args.description, "finding description")),
      severity: severity as SecurityFindingRecord["severity"], state: state as SecurityFindingRecord["state"], reproduction,
      remediation: typeof args.remediation === "string" ? redactSecrets(args.remediation).slice(0, 20_000) : existing?.remediation ?? "",
      evidenceJobIds, createdAt: existing?.createdAt ?? Date.now(), updatedAt: Date.now(),
    };
    this.store.upsertSecurityFinding(record);
    this.changed();
    return { success: true, data: { finding: record } };
  }
}
