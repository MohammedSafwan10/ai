import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { SecurityWorkspaceService } from "../src/main/kali/service";
import { KaliConnector, KaliConnectionError, KaliRequestError, type KaliRpcTransport } from "../src/main/kali/connector";
import { KaliOutputDecoder, kaliArtifactMime } from "../src/main/kali/tools";
import type { DesktopStore } from "../src/main/db/store";
import type { DesktopToolCall } from "../src/shared/types";
import type { KaliEnvironment, KaliJob } from "../src/shared/kali";
import type { SecurityEnvironmentRecord, SecurityFindingRecord, SecurityJobRecord } from "../src/shared/securityWorkspace";

const environment: KaliEnvironment = {
  id: "kali", host: "kali.example", port: 2222, username: "privora",
  identityFile: "C:/keys/kali", knownHostsFile: "C:/keys/pin", hostFingerprint: "SHA256:" + "A".repeat(43),
  runnerPath: "/home/privora/runner.py", jobRoot: "/home/privora/privora-jobs",
};
const context = { workspaceId: "workspace-one", threadId: "thread-one" };
const remote: KaliJob = { id: "ab000000-0000-4000-8000-000000000001", projectId: "", state: "running", exitCode: null, error: null, createdAt: 1, outputBytes: 0, omittedBytes: 0 };
const call = (name: DesktopToolCall["name"], args: Record<string, unknown>, id = "call-one"): DesktopToolCall => ({ id, name, arguments: args });

const fixture = (request: KaliRpcTransport["request"]) => {
  const jobs = new Map<string, SecurityJobRecord>();
  const findings = new Map<string, SecurityFindingRecord>();
  const publicEnvironment: SecurityEnvironmentRecord = { id: "kali", name: "Kali", host: environment.host, port: 2222, username: "privora", status: "unchecked" };
  const workspace = { id: context.workspaceId, type: "security", security: { environmentId: "kali", objective: "local lab", scope: "VM only" } };
  const store = {
    getWorkspace: (id: string) => id === workspace.id ? workspace : id === "development" ? { id, type: "development" } : null,
    getThread: (id: string) => ({ id, workspaceId: id === "thread-one" ? workspace.id : "development" }),
    listWorkspaces: () => [workspace],
    getSecurityEnvironment: () => publicEnvironment,
    getSecurityEnvironmentConfig: () => environment,
    saveSecurityEnvironment: vi.fn((record: SecurityEnvironmentRecord) => Object.assign(publicEnvironment, record)), listSecurityEnvironments: () => [publicEnvironment],
    getSecurityJob: (id: string) => jobs.get(id) ?? null,
    listSecurityJobs: (workspaceId: string, threadId?: string) => [...jobs.values()].filter((job) => job.workspaceId === workspaceId && (!threadId || job.threadId === threadId)),
    upsertSecurityJob: (job: SecurityJobRecord) => { jobs.set(job.id, structuredClone(job)); },
    getSecurityFinding: (id: string) => findings.get(id) ?? null,
    listSecurityFindings: (workspaceId: string) => [...findings.values()].filter((finding) => finding.workspaceId === workspaceId),
    upsertSecurityFinding: (finding: SecurityFindingRecord) => { findings.set(finding.id, finding); },
    importAttachment: vi.fn((input) => ({ id: input.id, name: input.name, mimeType: input.mimeType, size: input.bytes.length, artifactId: "saved.bin", url: "privora-attachment://artifact/saved.bin", createdAt: input.createdAt })),
  };
  const service = () => new SecurityWorkspaceService(store as unknown as DesktopStore, undefined, (config) => new KaliConnector(config, { request }));
  return { jobs, findings, store, service };
};

const completeTransport = (options: { events?: { stream: "stdout" | "stderr"; data: Buffer }[]; state?: KaliJob["state"] } = {}) => {
  let current = remote;
  const request = vi.fn<KaliRpcTransport["request"]>(async (_environment, payload) => {
    switch (payload.operation) {
      case "submit": current = { ...remote, projectId: String(payload.projectId) }; return current;
      case "lookup": return current;
      case "inspect": return current;
      case "output": return {
        job: { ...current, state: options.state ?? "succeeded", exitCode: 0 },
        events: (options.events ?? []).map((event, index) => ({ sequence: index + 1, stream: event.stream, data: event.data.toString("base64") })).filter((event) => event.sequence > Number(payload.afterSequence)),
        nextSequence: Math.max(Number(payload.afterSequence), options.events?.length ?? 0), hasMore: false,
      };
      default: throw new Error("Unexpected operation");
    }
  });
  return request;
};

describe("Security workspace runtime", () => {
  it("peeks at running output without remote requests and follows only when requested", async () => {
    const request = completeTransport({ events: [{ stream: "stdout", data: Buffer.from("final output") }] });
    const test = fixture(request);
    const service = test.service();
    await service.execute(call("kali_exec", { argv: ["echo"] }), context);
    const job = [...test.jobs.values()][0];
    test.jobs.set(job.id, { ...job, state: "running", outputPreview: "partial output", sequence: 0 });
    request.mockClear();
    const peek = await service.execute(call("kali_job_output", { jobId: job.id }), context);
    expect(peek).toMatchObject({ success: true, output: "partial output", data: { state: "running" } });
    expect(request).not.toHaveBeenCalled();
    const follow = await service.execute(call("kali_job_output", { jobId: job.id, follow: true }), context);
    expect(follow.data?.state).toBe("succeeded");
    expect(request.mock.calls.some(([, payload]) => payload.operation === "output")).toBe(true);
    expect((await service.execute(call("kali_job_output", { jobId: job.id, follow: "yes" }), context)).error).toContain("boolean");
    service.beginShutdown();
  });
  it("persists a stable identity before delivery and never resubmits a completed call", async () => {
    const request = completeTransport();
    const test = fixture(async (env, payload) => {
      if (payload.operation === "submit") {
        const record = [...test.jobs.values()][0];
        expect(record.state).toBe("submitting");
        expect(record.idempotencyKey).toBe(payload.idempotencyKey);
        expect(record).not.toHaveProperty("argv");
      }
      return request(env, payload);
    });
    const service = test.service();
    const command = call("kali_exec", { argv: ["printf", "hello"] });
    expect((await service.execute(command, context)).data?.state).toBe("succeeded");
    expect((await service.execute(command, context)).data?.state).toBe("succeeded");
    expect(request.mock.calls.filter(([, payload]) => payload.operation === "submit")).toHaveLength(1);
  });

  it("keeps unknown delivery across a restart without replay or local fallback", async () => {
    const request = vi.fn<KaliRpcTransport["request"]>(async (_env, payload) => {
      if (payload.operation === "lookup") return null;
      throw new KaliConnectionError("Network lost");
    });
    const test = fixture(request);
    const command = call("kali_exec", { argv: ["touch", "one-file"] });
    const first = await test.service().execute(command, context);
    expect(first.data?.state).toBe("unknown");
    await test.service().recover();
    const next = await test.service().execute(command, context);
    expect(next.data?.state).toBe("unknown");
    expect(request.mock.calls.filter(([, payload]) => payload.operation === "submit")).toHaveLength(1);
    expect(next.error).toContain("not be replayed");
    expect(test.store.getSecurityEnvironment().status).toBe("connected");
  });

  it("records an acknowledged bad-cwd rejection as failed only after lookup confirms no delivery", async () => {
    const request = vi.fn<KaliRpcTransport["request"]>(async (_env, payload) => {
      if (payload.operation === "submit") throw new KaliRequestError("Kali runner: cwd does not exist");
      if (payload.operation === "lookup") return null;
      throw new Error("Unexpected operation");
    });
    const test = fixture(request);
    const command = call("kali_exec", { argv: ["echo"], cwd: "missing" });
    const service = test.service();
    const result = await service.execute(command, context);
    expect(result.data?.state).toBe("failed");
    expect(result.error).toContain("cwd");
    await service.execute(command, context);
    expect(request.mock.calls.filter(([, payload]) => payload.operation === "submit")).toHaveLength(1);
  });

  it("keeps an acknowledged rejection unknown if its delivery lookup cannot be confirmed", async () => {
    const request = vi.fn<KaliRpcTransport["request"]>(async (_env, payload) => {
      if (payload.operation === "submit") throw new KaliRequestError("Kali runner rejected");
      throw new KaliConnectionError("Lookup disconnected");
    });
    const test = fixture(request);
    expect((await test.service().execute(call("kali_exec", { argv: ["echo"] }), context)).data?.state).toBe("unknown");
  });

  it("reconciles a reconnected job during UI state polling and deduplicates concurrent checks", async () => {
    let projectId = "";
    let available = false;
    const request = vi.fn<KaliRpcTransport["request"]>(async (_env, payload) => {
      if (payload.operation === "submit") { projectId = String(payload.projectId); throw new KaliConnectionError("Delivery reply lost"); }
      if (payload.operation === "lookup") {
        if (!available) throw new KaliConnectionError("Offline");
        return { ...remote, projectId };
      }
      if (payload.operation === "output") return { job: { ...remote, projectId, state: "succeeded" }, events: [], nextSequence: 0, hasMore: false };
      throw new Error("Unexpected operation");
    });
    const test = fixture(request);
    const service = test.service();
    await service.execute(call("kali_exec", { argv: ["echo"] }), context);
    available = true;
    await Promise.all([service.getWorkspaceState(context.workspaceId), service.getWorkspaceState(context.workspaceId)]);
    await vi.waitFor(() => expect([...test.jobs.values()][0].state).toBe("succeeded"));
    expect(request.mock.calls.filter(([, payload]) => payload.operation === "lookup")).toHaveLength(1);
    expect(request.mock.calls.filter(([, payload]) => payload.operation === "submit")).toHaveLength(1);
    expect(test.store.getSecurityEnvironment().status).toBe("connected");
  });

  it("checks capabilities and immediately recovers jobs assigned to that environment", async () => {
    let projectId = "";
    const request = vi.fn<KaliRpcTransport["request"]>(async (_env, payload) => {
      if (payload.operation === "submit") { projectId = String(payload.projectId); throw new KaliConnectionError("Lost delivery reply"); }
      if (payload.operation === "lookup") return { ...remote, projectId };
      if (payload.operation === "output") return { job: { ...remote, projectId, state: "succeeded" }, events: [], nextSequence: 0, hasMore: false };
      if (payload.operation === "capabilities") return { protocolVersion: 1, os: "Linux", architecture: "aarch64", pythonVersion: "3.13", jobRoot: environment.jobRoot, tools: {}, limits: { concurrentJobs: 4, outputBytes: 1_000_000, artifactBytes: 1_000_000 } };
      throw new Error("Unexpected operation");
    });
    const test = fixture(request);
    const service = test.service();
    await service.execute(call("kali_exec", { argv: ["echo"] }), context);
    expect((await service.checkEnvironment("kali")).status).toBe("connected");
    await vi.waitFor(() => expect([...test.jobs.values()][0].state).toBe("succeeded"));
    expect(request.mock.calls.filter(([, payload]) => payload.operation === "lookup")).toHaveLength(1);
  });

  it("clears a stale connected label when capability checks lose SSH, then recovers it", async () => {
    let offline = false;
    const capabilities = { protocolVersion: 1, os: "Linux", architecture: "aarch64", pythonVersion: "3.14", jobRoot: environment.jobRoot, tools: {}, limits: { concurrentJobs: 4, outputBytes: 1_000_000, artifactBytes: 1_000_000 } };
    const request = vi.fn<KaliRpcTransport["request"]>(async () => {
      if (offline) throw new KaliConnectionError("Connect timed out");
      return capabilities;
    });
    const test = fixture(request);
    const service = test.service();
    const capabilityCall = call("kali_capabilities", { tools: [] });
    expect((await service.execute(capabilityCall, context)).success).toBe(true);
    expect(test.store.getSecurityEnvironment().status).toBe("connected");
    offline = true;
    expect((await service.execute(capabilityCall, context)).success).toBe(false);
    expect(test.store.getSecurityEnvironment().status).toBe("disconnected");
    expect(test.store.getSecurityEnvironment().error).toContain("Connect timed out");
    offline = false;
    expect((await service.execute(capabilityCall, context)).success).toBe(true);
    expect(test.store.getSecurityEnvironment().status).toBe("connected");
    expect(test.store.getSecurityEnvironment().error).toBeUndefined();
  });

  it("blocks development chats and jobs from another workspace before remote access", async () => {
    const request = completeTransport();
    const test = fixture(request);
    const service = test.service();
    const denied = await service.execute(call("kali_exec", { argv: ["echo"] }), { workspaceId: "development", threadId: "normal" });
    expect(denied.success).toBe(false);
    expect(request).not.toHaveBeenCalled();
    await service.execute(call("kali_exec", { argv: ["echo"] }), context);
    const job = [...test.jobs.values()][0];
    test.jobs.set(job.id, { ...job, workspaceId: "elsewhere" });
    request.mockClear();
    const cross = await service.execute(call("kali_job_status", { jobId: job.id }), context);
    expect(cross.error).toContain("does not belong");
    expect(request).not.toHaveBeenCalled();
  });

  it("incrementally preserves each stream across UTF-8 and arbitrary output boundaries", async () => {
    const bytes = Buffer.from("€ 😀 漢字\npassword=split-secret\n");
    const request = completeTransport({ events: Array.from(bytes, (value) => ({ stream: "stdout", data: Buffer.from([value]) })) });
    const test = fixture(request);
    const output: string[] = [];
    const result = await test.service().execute(call("kali_exec", { argv: ["echo"] }), { ...context, onOutput: (text) => output.push(text) });
    expect(result.output).toBe("€ 😀 漢字\npassword=split-secret\n");
    expect(output.join("")).toBe(result.output);
    expect(JSON.stringify([...test.jobs.values()])).toContain("split-secret");
    expect(result.output).not.toContain("�");
  });

  it("rejects remote output for a different project before exposing its contents", async () => {
    const request = completeTransport();
    const test = fixture(async (env, payload) => payload.operation === "output" ? {
      job: { ...remote, projectId: "other-project", state: "succeeded" },
      events: [{ sequence: 1, stream: "stdout", data: Buffer.from("private other project\n").toString("base64") }],
      nextSequence: 1, hasMore: false,
    } : request(env, payload));
    const output = vi.fn();
    const result = await test.service().execute(call("kali_exec", { argv: ["echo"] }), { ...context, onOutput: output });
    expect(result.data?.state).toBe("unknown");
    expect(result.output).not.toContain("private");
    expect(output).not.toHaveBeenCalled();
  });

  it("waits for confirmed cancellation rather than treating stop_requested as stopped", async () => {
    let projectId = "";
    let stopping = false;
    const request = vi.fn<KaliRpcTransport["request"]>(async (_env, payload) => {
      if (payload.operation === "submit") { projectId = String(payload.projectId); return { ...remote, projectId }; }
      if (payload.operation === "cancel") { stopping = true; return { ...remote, projectId, state: "stop_requested" }; }
      if (payload.operation === "output") return { job: { ...remote, projectId, state: stopping ? "cancelled" : "running" }, events: [], nextSequence: 0, hasMore: false };
      throw new Error("Unexpected operation");
    });
    const test = fixture(request);
    const controller = new AbortController();
    const service = test.service();
    const task = service.execute(call("kali_exec", { argv: ["sleep", "100"] }), { ...context, signal: controller.signal });
    await vi.waitFor(() => expect(request.mock.calls.some(([, payload]) => payload.operation === "output")).toBe(true));
    controller.abort();
    const result = await task;
    expect(result.data?.state).toBe("cancelled");
    expect([...test.jobs.values()][0].state).toBe("cancelled");
  });

  it("shows cancellation as unknown when the network prevents confirmation", async () => {
    let projectId = "";
    const request = vi.fn<KaliRpcTransport["request"]>(async (_env, payload) => {
      if (payload.operation === "submit") { projectId = String(payload.projectId); return { ...remote, projectId }; }
      if (payload.operation === "cancel") throw new KaliConnectionError("Disconnected during Stop");
      return { job: { ...remote, projectId }, events: [], nextSequence: 0, hasMore: false };
    });
    const test = fixture(request);
    const service = test.service();
    const task = service.execute(call("kali_exec", { argv: ["sleep"] }), context);
    await vi.waitFor(() => expect(request.mock.calls.some(([, payload]) => payload.operation === "output")).toBe(true));
    const unresolved = await service.stopThreadJobs(context.threadId);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].state).toBe("unknown");
    expect((await task).data?.state).toBe("unknown");
  });

  it("restores split UTF-8 after a disconnect by replaying retained output, never the command", async () => {
    const bytes = Buffer.from("€ ready\n");
    let projectId = "";
    let disconnect = true;
    const request = vi.fn<KaliRpcTransport["request"]>(async (_env, payload) => {
      if (payload.operation === "submit") { projectId = String(payload.projectId); return { ...remote, projectId }; }
      if (payload.operation === "inspect") return { ...remote, projectId };
      if (payload.operation === "output") {
        const cursor = Number(payload.afterSequence);
        if (disconnect && cursor === 1) throw new KaliConnectionError("Lost connection");
        const events = [{ sequence: 1, stream: "stdout", data: bytes.subarray(0, 1).toString("base64") }, { sequence: 2, stream: "stdout", data: bytes.subarray(1).toString("base64") }].filter((event) => event.sequence > cursor);
        return { job: { ...remote, projectId, state: disconnect ? "running" : "succeeded" }, events: disconnect ? events.slice(0, 1) : events, nextSequence: disconnect ? 1 : 2, hasMore: disconnect };
      }
      throw new Error("Unexpected operation");
    });
    const test = fixture(request);
    expect((await test.service().execute(call("kali_exec", { argv: ["echo"] }), context)).data?.state).toBe("unknown");
    expect([...test.jobs.values()][0].sequence).toBe(1);
    disconnect = false;
    await test.service().recover();
    await vi.waitFor(() => expect([...test.jobs.values()][0].state).toBe("succeeded"));
    expect([...test.jobs.values()][0].outputPreview).toBe("€ ready\n");
    expect(request.mock.calls.filter(([, payload]) => payload.operation === "submit")).toHaveLength(1);
  });

  it("stores verified artifacts in app-owned storage and rejects unsupported verified findings", async () => {
    const base = completeTransport({ events: [{ stream: "stdout", data: Buffer.from("evidence\n") }] });
    const bytes = Buffer.from("binary evidence");
    const test = fixture(async (env, payload) => payload.operation === "artifact" ? {
      path: payload.path, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), data: bytes.toString("base64"),
    } : base(env, payload));
    const service = test.service();
    await service.execute(call("kali_exec", { argv: ["echo"] }), context);
    const job = [...test.jobs.values()][0];
    const artifact = await service.execute(call("kali_artifact", { jobId: job.id, path: "result.bin" }), context);
    expect(artifact.success).toBe(true);
    expect(artifact.data).not.toHaveProperty("data");
    expect(test.store.importAttachment).toHaveBeenCalledOnce();
    expect(test.jobs.get(job.id)?.artifacts).toHaveLength(1);
    expect((await service.execute(call("kali_artifact", { jobId: job.id, path: "../outside" }), context)).success).toBe(false);
    const args = { title: "Finding", description: "Evidence", state: "verified", evidenceJobIds: [job.id] };
    expect((await service.execute(call("security_finding_save", args), context)).error).toContain("reproduction");
    expect((await service.execute(call("security_finding_save", { ...args, reproduction: "Reproduce locally" }), context)).success).toBe(true);
    test.jobs.set(job.id, { ...job, state: "running" });
    expect((await service.execute(call("security_finding_save", { ...args, reproduction: "Reproduce" }), context)).success).toBe(false);
  });

  it("does not submit an already aborted request", async () => {
    const request = completeTransport();
    const test = fixture(request);
    const service = test.service();
    expect((await service.execute(call("kali_exec", { argv: ["echo"] }), { ...context, signal: AbortSignal.abort() })).success).toBe(false);
    expect(request).not.toHaveBeenCalled();
    expect(test.jobs.size).toBe(0);
  });

  it("does not trust a cached Connected label after restarting the service", () => {
    const test = fixture(completeTransport());
    test.store.saveSecurityEnvironment({ ...test.store.getSecurityEnvironment(), status: "connected" });
    test.service();
    expect(test.store.getSecurityEnvironment().status).toBe("unchecked");
  });

  it("drains an in-flight connection check and blocks new writes until shutdown is cancelled", async () => {
    let release!: (value: unknown) => void;
    const capability = { protocolVersion: 1, os: "Linux", architecture: "aarch64", pythonVersion: "3.13", jobRoot: environment.jobRoot, tools: {}, limits: { concurrentJobs: 4, outputBytes: 1_000_000, artifactBytes: 1_000_000 } };
    const request = vi.fn<KaliRpcTransport["request"]>(() => new Promise((resolve) => { release = resolve; }));
    const test = fixture(request);
    const service = test.service();
    const check = service.checkEnvironment("kali");
    service.beginShutdown();
    let drained = false;
    const drain = service.waitForIdle().then(() => { drained = true; });
    await Promise.resolve();
    expect(drained).toBe(false);
    expect((await service.execute(call("kali_exec", { argv: ["echo"] }), context)).error).toContain("closing");
    await expect(service.checkEnvironment("kali")).rejects.toThrow("closing");
    await service.getWorkspaceState(context.workspaceId);
    expect(request).toHaveBeenCalledTimes(1);
    release(capability);
    await check;
    await drain;
    expect(drained).toBe(true);
    expect(test.jobs.size).toBe(0);
    service.cancelShutdown();
    const another = service.checkEnvironment("kali");
    release(capability);
    expect((await another).status).toBe("connected");
  });

  it("cancels a submit completing after shutdown began and drains its final persistence", async () => {
    let release!: (value: unknown) => void;
    let projectId = "";
    let cancelled = false;
    const request = vi.fn<KaliRpcTransport["request"]>(async (_env, payload) => {
      if (payload.operation === "submit") {
        projectId = String(payload.projectId);
        return new Promise((resolve) => { release = resolve; });
      }
      if (payload.operation === "cancel") { cancelled = true; return { ...remote, projectId, state: "stop_requested" }; }
      if (payload.operation === "output") return { job: { ...remote, projectId, state: cancelled ? "cancelled" : "running" }, events: [], nextSequence: 0, hasMore: false };
      throw new Error("Unexpected operation");
    });
    const test = fixture(request);
    const service = test.service();
    const task = service.execute(call("kali_exec", { argv: ["sleep", "100"] }), context);
    service.beginShutdown();
    const drain = service.waitForIdle();
    release({ ...remote, projectId });
    await drain;
    expect((await task).data?.state).toBe("cancelled");
    expect([...test.jobs.values()][0].state).toBe("cancelled");
  });
});

describe("Kali live output decoding", () => {
  it("allows only safe text and raster previews without trusting filename extensions", () => {
    expect(kaliArtifactMime("evidence.txt", Buffer.from("€ evidence"))).toBe("text/plain");
    expect(kaliArtifactMime("evidence.html", Buffer.from("<script>alert(1)</script>"))).toBe("application/octet-stream");
    expect(kaliArtifactMime("secret.txt", Buffer.from("password=secret"))).toBe("application/octet-stream");
    expect(kaliArtifactMime("invalid.txt", Buffer.from([255]))).toBe("application/octet-stream");
    expect(kaliArtifactMime("false.png", Buffer.from("not a picture"))).toBe("application/octet-stream");
    expect(kaliArtifactMime("picture.bin", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe("image/png");
  });
  it("emits partial lines immediately, keeping interleaved UTF-8 and long lines intact", () => {
    const decoder = new KaliOutputDecoder();
    const euro = Buffer.from("€\n");
    expect(decoder.push("stdout", euro.subarray(0, 1))).toBe("");
    expect(decoder.push("stderr", Buffer.from("token="))).toBe("token=");
    expect(decoder.push("stdout", euro.subarray(1))).toBe("€\n");
    expect(decoder.push("stderr", Buffer.from("sensitive\n"))).toBe("sensitive\n");
    const oversized = decoder.push("stdout", Buffer.from("password=" + "a".repeat(20_000)));
    expect(oversized).toBe("password=" + "a".repeat(20_000));
    expect(decoder.finish()).toBe("");
  });
});
