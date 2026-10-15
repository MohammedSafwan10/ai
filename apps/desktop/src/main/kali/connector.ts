import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import {
  KALI_PROTOCOL_VERSION,
  type KaliArtifact, type KaliCapabilities, type KaliEnvironment,
  type KaliJob, type KaliJobRequest, type KaliOutputEvent, type KaliOutputPage,
} from "../../shared/kali";
import { HeadTailOutputBuffer } from "../terminal/outputBuffer";
import { redactSecrets } from "../security/redact";
import { waitWithAbort } from "../abort";

const RPC_LIMIT = 2 * 1024 * 1024;
const TERMINAL = new Set(["succeeded", "failed", "cancelled", "timed_out"]);
const STATES = new Set([...TERMINAL, "queued", "running", "stop_requested", "unknown"]);
const quote = (value: string) => "'" + value.replaceAll("'", "'\"'\"'") + "'";
const remotePath = (value: string) =>
  value.startsWith("/") && !value.includes("\0") && !value.includes("\n") &&
  !value.split("/").includes("..");
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export class KaliConnectionError extends Error {
  constructor(message: string, readonly connectionLost = true) {
    super(message + " Remote job state is unconfirmed; reconcile before retrying.");
    this.name = "KaliConnectionError";
  }
}

/** A definitive local validation failure or acknowledged runner rejection. */
export class KaliRequestError extends Error {
  constructor(message: string, readonly notSubmitted = false) {
    super(message);
    this.name = "KaliRequestError";
  }
}

export interface KaliRpcTransport {
  request(environment: KaliEnvironment, request: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
}

export const buildKaliSshArgs = (environment: KaliEnvironment) => {
  if (!environment.id || !/^[a-zA-Z0-9][a-zA-Z0-9.:-]*$/.test(environment.host) ||
      !/^[a-z_][a-z0-9_-]*$/.test(environment.username) ||
      !Number.isInteger(environment.port) || environment.port < 1 || environment.port > 65535 ||
      !remotePath(environment.runnerPath) || !remotePath(environment.jobRoot) ||
      !environment.identityFile || !environment.knownHostsFile ||
      !/^SHA256:[A-Za-z0-9+/]{43}$/.test(environment.hostFingerprint)) {
    throw new Error("Invalid Kali environment configuration.");
  }
  return [
    "-F", process.platform === "win32" ? "NUL" : "/dev/null",
    "-T", "-p", String(environment.port), "-i", environment.identityFile,
    "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=5", "-o", "ConnectionAttempts=1",
    "-o", "ServerAliveInterval=3", "-o", "ServerAliveCountMax=1",
    "-o", "StrictHostKeyChecking=yes",
    "-o", "UserKnownHostsFile=" + environment.knownHostsFile,
    "-o", "GlobalKnownHostsFile=" + (process.platform === "win32" ? "NUL" : "/dev/null"),
    environment.username + "@" + environment.host,
    "python3 -I " + quote(environment.runnerPath) + " --root " + quote(environment.jobRoot),
  ];
};

const verifyHostPin = async (environment: KaliEnvironment) => {
  const pinned = (await fs.readFile(environment.knownHostsFile, "utf8"))
    .split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("#"));
  const expectedHost = environment.port === 22
    ? environment.host : "[" + environment.host + "]:" + environment.port;
  if (pinned.length !== 1) throw new Error("Use a dedicated single-host pin file for Kali.");
  const fields = pinned[0].trim().split(/\s+/);
  if (fields[0] !== expectedHost || fields[1] !== "ssh-ed25519" ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(fields[2] ?? "")) {
    throw new Error("Kali pin must contain the selected endpoint's ED25519 key.");
  }
  const fingerprint = "SHA256:" + createHash("sha256")
    .update(Buffer.from(fields[2], "base64")).digest("base64").replace(/=+$/, "");
  if (fingerprint !== environment.hostFingerprint) throw new Error("Kali host fingerprint mismatch.");
};

export class OpenSshKaliTransport implements KaliRpcTransport {
  async request(environment: KaliEnvironment, request: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    signal?.throwIfAborted();
    let args: string[];
    try {
      args = buildKaliSshArgs(environment);
      await verifyHostPin(environment);
    } catch (error) {
      throw new KaliRequestError(error instanceof Error ? error.message : "Invalid SSH configuration.", true);
    }
    const payload = JSON.stringify({ ...request, version: KALI_PROTOCOL_VERSION }) + "\n";
    if (Buffer.byteLength(payload) > 128 * 1024) throw new KaliRequestError("Kali request exceeds 128 KiB.", true);
    return new Promise((resolve, reject) => {
      signal?.throwIfAborted();
      const child = spawn(environment.sshExecutable ?? "ssh", args, {
        shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
      });
      const stdout: Buffer[] = [];
      const stderr = new HeadTailOutputBuffer(4000);
      let length = 0;
      let settled = false;
      const finish = (error?: Error, value?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        if (error) {
          child.kill();
          reject(error);
        }
        else resolve(value);
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(new KaliConnectionError("SSH request timed out."));
      }, 10_000);
      const onAbort = () => finish(new DOMException("SSH read cancelled.", "AbortError"));
      signal?.addEventListener("abort", onAbort, { once: true });
      child.stdout.on("data", (data: Buffer) => {
        length += data.length;
        if (length > RPC_LIMIT) {
          child.kill();
          finish(new KaliConnectionError("Runner response exceeds the limit."));
        } else stdout.push(data);
      });
      child.stderr.on("data", (data: Buffer) => stderr.push(data));
      child.stdin.on("error", (error) => finish(new KaliConnectionError(error.message)));
      child.on("error", (error) => finish(new KaliConnectionError(error.message)));
      child.on("close", (code) => {
        if (settled) return;
        if (code !== 0) {
          finish(new KaliConnectionError("SSH failed: " + redactSecrets(stderr.toString()).trim()));
          return;
        }
        try {
          const response: unknown = JSON.parse(Buffer.concat(stdout).toString("utf8"));
          if (!record(response) || response.version !== KALI_PROTOCOL_VERSION ||
              typeof response.ok !== "boolean") throw new Error("Invalid runner handshake.");
          if (!response.ok) {
            finish(new KaliRequestError("Kali runner: " + redactSecrets(String(response.error))));
          } else finish(undefined, response.result);
        } catch (error) {
          finish(new KaliConnectionError(error instanceof Error ? error.message : "Invalid runner response."));
        }
      });
      child.stdin.end(payload);
    });
  }
}

const parseJob = (value: unknown, expectedId?: string): KaliJob => {
  if (!record(value) || typeof value.id !== "string" || !/^[a-f0-9-]{36}$/.test(value.id) ||
      (expectedId !== undefined && value.id !== expectedId) ||
      typeof value.projectId !== "string" || typeof value.state !== "string" || !STATES.has(value.state) ||
      !(value.exitCode === null || Number.isInteger(value.exitCode)) ||
      !(value.error === null || typeof value.error === "string") ||
      typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt) ||
      !integer(value.outputBytes) || !integer(value.omittedBytes)) {
    throw new Error("Invalid Kali job response.");
  }
  return value as unknown as KaliJob;
};

export class KaliConnector {
  private readonly environment: KaliEnvironment;

  constructor(environment: KaliEnvironment, private readonly transport: KaliRpcTransport = new OpenSshKaliTransport()) {
    try { buildKaliSshArgs(environment); }
    catch (error) { throw new KaliRequestError(error instanceof Error ? error.message : "Invalid SSH configuration.", true); }
    this.environment = { ...environment };
  }

  private async call(operation: string, fields: Record<string, unknown> = {}, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const request = { ...fields, operation, version: KALI_PROTOCOL_VERSION };
    try {
      return await waitWithAbort(this.transport.request(this.environment, request, signal), signal);
    } catch (error) {
      // Retry retained-state reads only. Submit/cancel must not be replayed
      // automatically when their delivery is uncertain.
      if (signal?.aborted || !(error instanceof KaliConnectionError) || !error.connectionLost ||
          !["capabilities", "lookup", "inspect", "output", "artifact"].includes(operation)) throw error;
      await delay(250, undefined, { signal });
      return waitWithAbort(this.transport.request(this.environment, request, signal), signal);
    }
  }

  async capabilities(tools: string[] = [], signal?: AbortSignal): Promise<KaliCapabilities> {
    const value = await this.call("capabilities", { tools }, signal);
    if (!record(value) || value.protocolVersion !== KALI_PROTOCOL_VERSION ||
        typeof value.os !== "string" || typeof value.architecture !== "string" ||
        typeof value.pythonVersion !== "string" || typeof value.jobRoot !== "string" ||
        !record(value.tools) || Object.values(value.tools).some((tool) => tool !== null && typeof tool !== "string") ||
        !record(value.limits) || !integer(value.limits.concurrentJobs) ||
        !integer(value.limits.outputBytes) || !integer(value.limits.artifactBytes)) {
      throw new Error("Invalid Kali capability response.");
    }
    return value as unknown as KaliCapabilities;
  }

  async submit(request: KaliJobRequest): Promise<KaliJob> {
    if (!request.idempotencyKey || request.idempotencyKey.length > 128 ||
        !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(request.projectId) ||
        !Array.isArray(request.argv) || !request.argv.length ||
        request.argv.some((arg) => typeof arg !== "string" || arg.includes("\0")) ||
        !request.argv[0] ||
        (request.timeoutSeconds !== undefined &&
          (!Number.isFinite(request.timeoutSeconds) || request.timeoutSeconds < 1 || request.timeoutSeconds > 3600))) {
      throw new KaliRequestError("Invalid Kali job request.", true);
    }
    const job = parseJob(await this.call("submit", { ...request }));
    if (job.projectId !== request.projectId) throw new Error("Kali returned a job from another project.");
    return job;
  }

  async lookup(idempotencyKey: string): Promise<KaliJob | null> {
    const value = await this.call("lookup", { idempotencyKey });
    return value === null ? null : parseJob(value);
  }

  async inspect(jobId: string): Promise<KaliJob> {
    return parseJob(await this.call("inspect", { jobId }), jobId);
  }

  async cancel(jobId: string): Promise<KaliJob> {
    // A stop_requested response is not confirmed cancellation.
    return parseJob(await this.call("cancel", { jobId }), jobId);
  }

  async output(jobId: string, afterSequence = 0): Promise<KaliOutputPage> {
    if (!integer(afterSequence)) throw new Error("Invalid output cursor.");
    const value = await this.call("output", { jobId, afterSequence });
    if (!record(value) || !Array.isArray(value.events) || value.events.length > 64 ||
        !integer(value.nextSequence) || typeof value.hasMore !== "boolean") {
      throw new Error("Invalid Kali output response.");
    }
    const job = parseJob(value.job, jobId);
    let last = afterSequence;
    for (const event of value.events) {
      if (!record(event) || event.sequence !== last + 1 ||
          (event.stream !== "stdout" && event.stream !== "stderr") ||
          typeof event.data !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(event.data)) {
        throw new Error("Invalid or out-of-order Kali output event.");
      }
      last = event.sequence as number;
    }
    if (value.nextSequence !== last) throw new Error("Invalid Kali output cursor.");
    return { job, events: value.events as KaliOutputEvent[], nextSequence: last, hasMore: value.hasMore };
  }

  async artifact(jobId: string, relativePath: string): Promise<KaliArtifact> {
    const value = await this.call("artifact", { jobId, path: relativePath });
    if (!record(value) || value.path !== relativePath || !integer(value.size) ||
        value.size > 1024 * 1024 || typeof value.sha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(value.sha256) || typeof value.data !== "string") {
      throw new Error("Invalid Kali artifact response.");
    }
    const bytes = Buffer.from(value.data, "base64");
    if (bytes.length !== value.size || createHash("sha256").update(bytes).digest("hex") !== value.sha256) {
      throw new Error("Kali artifact integrity check failed.");
    }
    return value as unknown as KaliArtifact;
  }

  async watch(jobId: string, options: {
    afterSequence?: number;
    expectedProjectId?: string;
    signal?: AbortSignal;
    onOutput?: (event: KaliOutputEvent) => void;
    onState?: (job: KaliJob) => void;
  } = {}): Promise<KaliJob> {
    let cursor = options.afterSequence ?? 0;
    let lastState: string | undefined;
    let stopDeadline: number | undefined;
    while (true) {
      if (options.signal?.aborted && stopDeadline === undefined) {
        stopDeadline = Date.now() + 12_000;
        await this.cancel(jobId);
      }
      const page = await this.output(jobId, cursor);
      if (options.expectedProjectId !== undefined && page.job.projectId !== options.expectedProjectId) {
        throw new Error("Kali output belongs to another project.");
      }
      for (const event of page.events) options.onOutput?.(event);
      cursor = page.nextSequence;
      if (page.job.state !== lastState) {
        options.onState?.(page.job);
        lastState = page.job.state;
      }
      if (page.job.state === "unknown") throw new KaliConnectionError("Runner worker is no longer confirmed alive.", false);
      if (TERMINAL.has(page.job.state) && !page.hasMore) return page.job;
      if (stopDeadline !== undefined && Date.now() > stopDeadline) {
        throw new KaliConnectionError("Remote cancellation could not be confirmed.", false);
      }
      if (!page.hasMore) await delay(250);
    }
  }
}
