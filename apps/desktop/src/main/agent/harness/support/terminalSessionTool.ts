import type { TerminalSessionRecord, ToolEventRecord } from "../../../../shared/types";

export function withTerminalSession(tool: ToolEventRecord, session: TerminalSessionRecord): ToolEventRecord {
  if (tool.name !== "exec_command" || tool.terminal?.sessionId !== session.sessionId) return tool;
  return { ...tool, terminal: { ...tool.terminal,
    running: session.running, status: session.status, exitCode: session.exitCode,
    startedAt: session.startedAt, endedAt: session.endedAt,
    processDurationMs: Math.max(0, (session.endedAt ?? session.updatedAt) - session.startedAt),
    timedOut: session.status === "timed_out",
  } };
}
