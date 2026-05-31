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
    expect(result.stdout).toContain("privora-session");
    expect(result.stderr).toBe("");
    expect(deltas.join("")).toContain("privora-session");
  });

  it("runs argv commands without shell wrapping", async () => {
    const cwd = await tempWorkspace();
    const terminal = new TerminalSessionManager();
    const result = await terminal.execCommand({
      cwd,
      argv: [process.execPath, "-e", "console.log(process.argv[1])", "argv-value"],
      signal: new AbortController().signal,
      onOutput: () => undefined,
    });

    expect(result.processId).toBeNull();
    expect(result.exitCode).toBe(0);
    expect(result.status).toBe("exited");
    expect(result.output).toContain("argv-value");
    expect(result.backend).toBe("pty");
    expect(result.tty).toBe(true);
  });

  it("resolves bare argv executables through PATH", async () => {
    const cwd = await tempWorkspace();
    const terminal = new TerminalSessionManager();
    const result = await terminal.execCommand({
      cwd,
      argv: ["node", "-v"],
      signal: new AbortController().signal,
      onOutput: () => undefined,
    });

    expect(result.success).toBe(true);
    expect(result.processId).toBeNull();
    expect(result.exitCode).toBe(0);
    expect(result.output).toMatch(/v\d+\.\d+\.\d+/);
  });

  it("returns rich metadata when spawn fails", async () => {
    const cwd = await tempWorkspace();
    const terminal = new TerminalSessionManager();
    const result = await terminal.execCommand({
      cwd,
      argv: ["privora-missing-executable-for-test"],
      signal: new AbortController().signal,
      onOutput: () => undefined,
    });

    expect(result.success).toBe(false);
    expect(result.running).toBe(false);
    expect(result.processId).toBeNull();
    expect(result.status).toBe("failed");
    expect(result.backend).toBe("pty");
    expect(result.tty).toBe(true);
    expect(result.stderr).toContain("attempted: privora-missing-executable-for-test");
    expect(result.stderr).toContain(`cwd: ${cwd}`);
  });

  it("runs native PTY commands with a merged terminal stream", async () => {
    const cwd = await tempWorkspace();
    const terminal = new TerminalSessionManager();
    const result = await terminal.execCommand({
      cwd,
      command: "node -e \"console.log('out-line'); console.error('err-line')\"",
      signal: new AbortController().signal,
      onOutput: () => undefined,
    });

    expect(result.status).toBe("exited");
    expect(result.output).toContain("out-line");
    expect(result.output).toContain("err-line");
    expect(result.stdout).toContain("out-line");
    expect(result.stdout).toContain("err-line");
    expect(result.stderr).toBe("");
    expect(result.backend).toBe("pty");
    expect(result.tty).toBe(true);
    expect(result.streamsMerged).toBe(true);
  });

  it("runs cmd argv commands without leaking argument quoting into echo output", async () => {
    if (process.platform !== "win32") return;
    const cwd = await tempWorkspace();
    const terminal = new TerminalSessionManager();
    const result = await terminal.execCommand({
      cwd,
      argv: ["cmd", "/c", "echo", "hello argv terminal"],
      signal: new AbortController().signal,
      onOutput: () => undefined,
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain("hello argv terminal");
    expect(result.output).not.toContain("\"hello argv terminal\"");
  });

  it("runs Windows command strings with cmd-compatible shell syntax", async () => {
    const cwd = await tempWorkspace();
    const terminal = new TerminalSessionManager();
    const command = process.platform === "win32"
      ? "node -e \"console.log('first')\" && node -e \"console.log('second')\""
      : "node -e \"console.log('first')\" && node -e \"console.log('second')\"";
    const result = await terminal.execCommand({
      cwd,
      command,
      signal: new AbortController().signal,
      onOutput: () => undefined,
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain("first");
    expect(result.output).toContain("second");
  });

  it("strips terminal control sequences from model-visible output", async () => {
    const cwd = await tempWorkspace();
    const terminal = new TerminalSessionManager();
    const result = await terminal.execCommand({
      cwd,
      argv: [process.execPath, "-e", "process.stdout.write('\\u001b[?9001h\\u001b[?1004h\\u001b[?25l\\u001b]0;C:\\\\nvm4w\\\\nodejs\\\\node.exe\\u0007plain\\u001b[0m\\u001b[?25h\\n')"],
      signal: new AbortController().signal,
      onOutput: () => undefined,
    });

    expect(result.output).toContain("plain");
    expect(result.output).not.toContain("[?9001h");
    expect(result.output).not.toContain("[?1004h");
    expect(result.output).not.toContain("]0;");
    expect(result.output).not.toContain("nvm4w");
    expect(result.output).not.toContain("\u001b");
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
    expect(final.processDurationMs).toBeGreaterThanOrEqual(final.operationDurationMs);
    expect(final.operationDurationMs).toBeGreaterThan(0);
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
      command: "node -e \"let i=0; setInterval(()=>console.log('tick '+(++i)),50)\"",
      signal: new AbortController().signal,
      yieldTimeMs: 400,
      onOutput: () => undefined,
    });

    expect(result.processId).toEqual(expect.any(Number));
    const stopped = await terminal.stopProcess({ processId: result.processId! });

    expect(stopped.success).toBe(true);
    expect(stopped.running).toBe(false);
    expect(stopped.processId).toBeNull();
    expect(stopped.status).toBe("stopped");
    expect(stopped.output).toBe(`Stopped process ${result.processId}.`);
    expect(stopped.output).not.toContain("tick");
    expect(stopped.operationDurationMs).toBeGreaterThan(0);
    expect(stopped.processDurationMs).toBeGreaterThanOrEqual(stopped.operationDurationMs);
  });

  it("closes stdin cleanly after writing interactive input", async () => {
    const cwd = await tempWorkspace();
    const terminal = new TerminalSessionManager();
    const result = await terminal.execCommand({
      cwd,
      argv: [process.execPath, "-e", "let s=''; process.stdin.on('data',d=>s+=d); process.stdin.on('end',()=>console.log('echo:'+s.trim()))"],
      tty: false,
      signal: new AbortController().signal,
      yieldTimeMs: 250,
      onOutput: () => undefined,
    });

    expect(result.processId).toEqual(expect.any(Number));
    const written = await terminal.writeStdin({
      processId: result.processId!,
      input: "privora stdin check\n",
      closeStdin: true,
      signal: new AbortController().signal,
      yieldTimeMs: 5000,
      onOutput: () => undefined,
    });

    expect(written.running).toBe(false);
    expect(written.status).toBe("exited");
    expect(written.exitCode).toBe(0);
    expect(written.output).toContain("echo:privora stdin check");
    expect(written.output).not.toContain("^Z");
    expect(written.output).not.toContain("\u2426");
    expect(written.backend).toBe("process");
    expect(written.tty).toBe(false);
    expect(written.streamsMerged).toBe(false);
  });

  it("keeps stdout and stderr separate in pipe mode", async () => {
    const cwd = await tempWorkspace();
    const terminal = new TerminalSessionManager();
    const result = await terminal.execCommand({
      cwd,
      argv: [process.execPath, "-e", "console.log('pipe-out'); console.error('pipe-err')"],
      tty: false,
      signal: new AbortController().signal,
      onOutput: () => undefined,
    });

    expect(result.success).toBe(true);
    expect(result.backend).toBe("process");
    expect(result.tty).toBe(false);
    expect(result.streamsMerged).toBe(false);
    expect(result.stdout).toContain("pipe-out");
    expect(result.stdout).not.toContain("pipe-err");
    expect(result.stderr).toContain("pipe-err");
  });

  it("compacts unread output when a small maxOutputChars is requested", async () => {
    const cwd = await tempWorkspace();
    const terminal = new TerminalSessionManager();
    const result = await terminal.execCommand({
      cwd,
      argv: [process.execPath, "-e", "for (let i=1;i<=200;i++) console.log('line-'+i.toString().padStart(3,'0'))"],
      maxOutputChars: 1000,
      signal: new AbortController().signal,
      onOutput: () => undefined,
    });

    expect(result.success).toBe(true);
    expect(result.omittedBytes).toBeGreaterThan(0);
    expect(result.output).toContain("omitted");
    expect(result.output).toContain("line-001");
    expect(result.output).toContain("line-200");
    expect(result.output).not.toContain("line-100");
    expect(result.stdout).toContain("omitted");
  });

  it("resizes native PTY processes", async () => {
    const cwd = await tempWorkspace();
    const terminal = new TerminalSessionManager();
    const result = await terminal.execCommand({
      cwd,
      command: "node -e \"setTimeout(()=>console.log('done'),10000)\"",
      signal: new AbortController().signal,
      yieldTimeMs: 250,
      onOutput: () => undefined,
    });

    expect(result.processId).toEqual(expect.any(Number));
    expect(result.backend).toBe("pty");
    expect(result.tty).toBe(true);
    const resized = await terminal.resizeProcess({
      processId: result.processId!,
      rows: 40,
      cols: 120,
    });

    expect(resized.running).toBe(true);
    expect(resized.backend).toBe("pty");
    expect(resized.tty).toBe(true);
    expect(resized.stderr).toBe("");
    expect(resized.output).toContain("Resized process");
    expect(resized.operationDurationMs).toBeGreaterThan(0);
    expect(resized.operationDurationMs).toBeLessThan(1500);
    await terminal.stopProcess({ processId: result.processId! });
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
