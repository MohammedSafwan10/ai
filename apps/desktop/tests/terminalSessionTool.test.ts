import { describe, expect, it } from "vitest";
import { withTerminalSession } from "../src/main/agent/harness/support/terminalSessionTool";
import type { TerminalSessionRecord, ToolEventRecord } from "../src/shared/types";
const tool = { name: "exec_command", status: "done", result: { success: true }, terminal: { command: "fixture", sessionId: 1, running: true } } as ToolEventRecord;
const session = { sessionId: 1, startedAt: 1000, updatedAt: 24000, endedAt: 24000, status: "exited", running: false, exitCode: 7 } as TerminalSessionRecord;
describe("terminal process projection", () => {
  it("updates process outcome without rewriting the completed tool invocation", () => {
    const updated = withTerminalSession(tool, session);
    expect(updated.status).toBe("done");
    expect(updated.result).toBe(tool.result);
    expect(updated.terminal).toMatchObject({ running: false, exitCode: 7, startedAt: 1000, endedAt: 24000, processDurationMs: 23000 });
    expect(tool.terminal?.running).toBe(true);
  });
  it("ignores unrelated session IDs and tool types", () => {
    expect(withTerminalSession(tool, { ...session, sessionId: 2 })).toBe(tool);
    const read = { ...tool, name: "write_stdin" };
    expect(withTerminalSession(read, session)).toBe(read);
  });
});
