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
      yieldTimeMs: 5000,
      onOutput: (delta) => deltas.push(delta),
    });

    expect(result.processId).toBeNull();
    expect(result.exitCode).toBe(0);
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
    const final = await terminal.writeStdin({
      processId: result.processId!,
      input: "",
      signal: new AbortController().signal,
      yieldTimeMs: 5000,
      onOutput: () => undefined,
    });

    expect(final.processId).toBeNull();
    expect(final.exitCode).toBe(0);
    expect(final.output).toContain("late-output");
  });
});
