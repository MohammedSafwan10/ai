import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TerminalSessionManager } from "../src/main/terminal/sessionManager";

const tempWorkspace = async () =>
  fs.mkdtemp(path.join(os.tmpdir(), "privora-terminal-"));

describe("TerminalSessionManager", () => {
  it("runs a short command and returns completed output", async () => {
    const cwd = await tempWorkspace();
    const terminal = new TerminalSessionManager();
    const deltas: string[] = [];
    const result = await terminal.execCommand({
      cwd,
      command: "node -e \"console.log('privora-session')\"",
      signal: new AbortController().signal,
      onOutput: (delta) => deltas.push(delta),
    });

    expect(result.processId).toBeNull();
    expect(result.exitCode).toBe(0);
    expect(result.status).toBe("exited");
    expect(result.output).toContain("privora-session");
    expect(deltas.join("")).toContain("privora-session");
  });

  it("yields a long command and can poll it to completion", async () => {
    const cwd = await tempWorkspace();
    const terminal = new TerminalSessionManager();
    const result = await terminal.execCommand({
      cwd,
      command: "node -e \"setTimeout(()=>console.log('late-output'),700)\"",
      signal: new AbortController().signal,
      yieldTimeMs: 250,
      onOutput: () => undefined,
    });

    expect(result.processId).toEqual(expect.any(Number));
    expect(result.running).toBe(true);
    expect(result.status).toBe("running");
    const final = await terminal.writeStdin({
      processId: result.processId!,
      input: "",
      signal: new AbortController().signal,
      yieldTimeMs: 5000,
      onOutput: () => undefined,
    });

    expect(final.processId).toBeNull();
    expect(final.exitCode).toBe(0);
    expect(final.status).toBe("exited");
    expect(final.output).toContain("late-output");
  });

  it("honors short explicit empty polls instead of forcing the default wait", async () => {
    const cwd = await tempWorkspace();
    const terminal = new TerminalSessionManager();
    const result = await terminal.execCommand({
      cwd,
      command: "node -e \"setTimeout(()=>console.log('late-output'),2000)\"",
      signal: new AbortController().signal,
      yieldTimeMs: 250,
      onOutput: () => undefined,
    });

    expect(result.processId).toEqual(expect.any(Number));
    const startedAt = Date.now();
    const poll = await terminal.writeStdin({
      processId: result.processId!,
      input: "",
      signal: new AbortController().signal,
      yieldTimeMs: 250,
      onOutput: () => undefined,
    });
    const elapsedMs = Date.now() - startedAt;

    expect(elapsedMs).toBeLessThan(1500);
    expect(poll.running).toBe(true);
    expect(poll.status).toBe("running");
    await terminal.stopProcess({ processId: result.processId! });
  });

  it("reports stopped processes as successful stop actions", async () => {
    const cwd = await tempWorkspace();
    const terminal = new TerminalSessionManager();
    const result = await terminal.execCommand({
      cwd,
      command: "node -e \"setTimeout(()=>console.log('still-running'),10000)\"",
      signal: new AbortController().signal,
      yieldTimeMs: 250,
      onOutput: () => undefined,
    });

    expect(result.processId).toEqual(expect.any(Number));
    const stopped = await terminal.stopProcess({ processId: result.processId! });

    expect(stopped.success).toBe(true);
    expect(stopped.running).toBe(false);
    expect(stopped.processId).toBeNull();
    expect(stopped.status).toBe("stopped");
  });

  it("reports missing stop requests as already not running", async () => {
    const terminal = new TerminalSessionManager();
    const stopped = await terminal.stopProcess({ processId: 987654 });

    expect(stopped.success).toBe(true);
    expect(stopped.running).toBe(false);
    expect(stopped.processId).toBeNull();
    expect(stopped.status).toBe("not_found");
  });
});
