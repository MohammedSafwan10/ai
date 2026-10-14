import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildKaliSshArgs, KaliConnector, KaliConnectionError, OpenSshKaliTransport } from "../src/main/kali/connector";
import type { KaliEnvironment, KaliJob, KaliOutputEvent } from "../src/shared/kali";

const environment: KaliEnvironment = {
  id: "kali-test", host: "kali.example", port: 2222, username: "privora",
  identityFile: "/private/key", knownHostsFile: "/private/pin",
  hostFingerprint: "SHA256:" + "A".repeat(43),
  runnerPath: "/home/privora/runner.py", jobRoot: "/home/privora/privora-jobs",
};
const job: KaliJob = {
  id: "ab000000-0000-4000-8000-000000000001", projectId: "test", state: "running",
  exitCode: null, error: null, createdAt: 1, outputBytes: 0, omittedBytes: 0,
};
const page = (events: KaliOutputEvent[] = [], state: KaliJob["state"] = "running", hasMore = false) => ({
  job: { ...job, state }, events, nextSequence: events.at(-1)?.sequence ?? 0, hasMore,
});

describe("Kali connector", () => {
  it("pins SSH identity and never places a job command in SSH shell arguments", async () => {
    const request = vi.fn().mockResolvedValue(job);
    const connector = new KaliConnector(environment, { request });
    const argv = ["python3", "-c", "print('$(touch /tmp/should-not-exist)')"];
    await connector.submit({ projectId: "test", idempotencyKey: "request-1", argv });
    expect(request.mock.calls[0][1].argv).toEqual(argv);
    const args = buildKaliSshArgs(environment);
    expect(args).toContain("StrictHostKeyChecking=yes");
    expect(args).toContain("BatchMode=yes");
    expect(args).toContain("IdentitiesOnly=yes");
    expect(args.join(" ")).not.toContain("touch");
  });

  it("quotes configured remote paths and rejects endpoint option injection", () => {
    const args = buildKaliSshArgs({ ...environment, runnerPath: "/home/a'b/runner.py" });
    expect(args.at(-1)).toContain("'/home/a'\"'\"'b/runner.py'");
    expect(() => buildKaliSshArgs({ ...environment, host: "-oProxyCommand=evil" })).toThrow();
    expect(() => buildKaliSshArgs({ ...environment, runnerPath: "/home/../etc/runner.py" })).toThrow();
  });

  it("does not start a transport for invalid or already-empty job commands", async () => {
    const request = vi.fn();
    const connector = new KaliConnector(environment, { request });
    await expect(connector.submit({ projectId: "../outside", idempotencyKey: "one", argv: ["echo"] })).rejects.toThrow();
    await expect(connector.submit({ projectId: "test", idempotencyKey: "one", argv: [] })).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects a changed host pin before invoking SSH", async () => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), "privora-kali-pin-"));
    try {
      const pin = path.join(folder, "known_hosts");
      await fs.writeFile(pin, "[kali.example]:2222 ssh-ed25519 " + Buffer.from("different-key").toString("base64"));
      await expect(new OpenSshKaliTransport().request({
        ...environment, knownHostsFile: pin, sshExecutable: "must-not-execute",
      }, { operation: "capabilities" })).rejects.toThrow("fingerprint mismatch");
    } finally {
      await fs.rm(folder, { recursive: true, force: true });
    }
  });

  it("does not retry or substitute local execution after transport failure", async () => {
    const request = vi.fn().mockRejectedValue(new KaliConnectionError("Disconnected."));
    const connector = new KaliConnector(environment, { request });
    await expect(connector.submit({ projectId: "test", idempotencyKey: "stable", argv: ["echo", "test"] }))
      .rejects.toThrow("reconcile");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("retries a lost read-only response once using the same output cursor", async () => {
    const request = vi.fn().mockRejectedValueOnce(new KaliConnectionError("Temporary timeout"))
      .mockResolvedValueOnce(page([{ sequence: 1, stream: "stdout", data: "YQ==" }]));
    const result = await new KaliConnector(environment, { request }).output(job.id);
    expect(result.nextSequence).toBe(1);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][1]).toEqual(request.mock.calls[1][1]);
  });

  it("bounds read retries and never retries cancellation or protocol errors", async () => {
    const request = vi.fn().mockRejectedValue(new KaliConnectionError("Offline"));
    const connector = new KaliConnector(environment, { request });
    await expect(connector.lookup("stable")).rejects.toThrow("Offline");
    expect(request).toHaveBeenCalledTimes(2);
    request.mockClear();
    await expect(connector.cancel(job.id)).rejects.toThrow("Offline");
    expect(request).toHaveBeenCalledTimes(1);
    request.mockClear().mockRejectedValue(new Error("Invalid response"));
    await expect(connector.inspect(job.id)).rejects.toThrow("Invalid response");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("rejects missing, duplicated, and out-of-order output", async () => {
    const request = vi.fn().mockResolvedValue(page([
      { sequence: 2, stream: "stdout", data: "YQ==" },
    ]));
    const connector = new KaliConnector(environment, { request });
    await expect(connector.output(job.id, 0)).rejects.toThrow("out-of-order");
    request.mockResolvedValue(page([{ sequence: 1, stream: "stdout", data: "YQ==" }]));
    await expect(connector.output(job.id, 1)).rejects.toThrow("out-of-order");
  });

  it("rejects responses attributed to another job or project", async () => {
    const request = vi.fn().mockResolvedValue({ ...job, id: "cd000000-0000-4000-8000-000000000002" });
    const connector = new KaliConnector(environment, { request });
    await expect(connector.inspect(job.id)).rejects.toThrow("Invalid Kali job");
    request.mockResolvedValue({ ...job, projectId: "another-project" });
    await expect(connector.submit({ projectId: "test", idempotencyKey: "one", argv: ["echo"] }))
      .rejects.toThrow("another project");
  });

  it("drains final pages before declaring completion", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(page([{ sequence: 1, stream: "stdout", data: "YQ==" }], "succeeded", true))
      .mockResolvedValueOnce(page([{ sequence: 2, stream: "stderr", data: "Yg==" }], "succeeded"));
    const events: KaliOutputEvent[] = [];
    const connector = new KaliConnector(environment, { request });
    const result = await connector.watch(job.id, { onOutput: (event) => events.push(event) });
    expect(result.state).toBe("succeeded");
    expect(events.map((event) => event.sequence)).toEqual([1, 2]);
    expect(request.mock.calls[1][1].afterSequence).toBe(1);
  });

  it("resumes from a saved cursor without resubmitting the job", async () => {
    const request = vi.fn().mockResolvedValue(page([
      { sequence: 8, stream: "stdout", data: "ZmluYWw=" },
    ], "succeeded"));
    const connector = new KaliConnector(environment, { request });
    await connector.watch(job.id, { afterSequence: 7 });
    expect(request.mock.calls[0][1]).toMatchObject({ operation: "output", afterSequence: 7 });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("waits for confirmed cancellation rather than treating the stop request as stopped", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ ...job, state: "stop_requested" })
      .mockResolvedValueOnce(page([], "cancelled"));
    const controller = new AbortController();
    controller.abort();
    const connector = new KaliConnector(environment, { request });
    const result = await connector.watch(job.id, { signal: controller.signal });
    expect(request.mock.calls.map((call) => call[1].operation)).toEqual(["cancel", "output"]);
    expect(result.state).toBe("cancelled");
  });

  it("reports unknown worker state without inventing successful cancellation", async () => {
    const connector = new KaliConnector(environment, { request: vi.fn().mockResolvedValue(page([], "unknown")) });
    await expect(connector.watch(job.id)).rejects.toThrow("unconfirmed");
  });

  it("checks transferred artifact size and hash", async () => {
    const data = Buffer.from("€ 😀 漢字");
    const artifact = {
      path: "result.txt", data: data.toString("base64"), size: data.length,
      sha256: createHash("sha256").update(data).digest("hex"),
    };
    const request = vi.fn().mockResolvedValue(artifact);
    const connector = new KaliConnector(environment, { request });
    expect((await connector.artifact(job.id, "result.txt")).sha256).toBe(artifact.sha256);
    request.mockResolvedValue({ ...artifact, data: Buffer.from("tampered").toString("base64") });
    await expect(connector.artifact(job.id, "result.txt")).rejects.toThrow("integrity");
  });
});
