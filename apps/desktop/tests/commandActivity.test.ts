import { describe, expect, it } from "vitest";
import { commandActivityLabel } from "../src/renderer/components/ToolTimeline";
import type { ToolEventRecord } from "../src/shared/types";
const tool: ToolEventRecord = { id: "tool", callId: "call", threadId: "thread", messageId: "message", name: "exec_command", title: "Ran fixture command", args: { cmd: "fixture command" }, status: "running", risk: "safe", startedAt: 1000, createdAt: 0, updatedAt: 1000 };
describe("command activity duration", () => {
  it("ticks from execution start independently of output arrival and preserves remote context", () => {
    expect(commandActivityLabel(tool, 23000)).toBe("Running command for 22s");
    expect(commandActivityLabel({ ...tool, updatedAt: 24000 }, 63000)).toBe("Running command for 1m 2s");
    expect(commandActivityLabel({ ...tool, name: "kali_exec", args: { argv: ["echo"] } }, 23000)).toBe("Kali · Running command for 22s");
  });
  it("freezes terminal durations and distinguishes failures from completion", () => {
    for (const clock of [99000, 999000]) {
      expect(commandActivityLabel({ ...tool, status: "done", endedAt: 24000 }, clock)).toContain("23s");
      expect(commandActivityLabel({ ...tool, status: "failed", endedAt: 24000 }, clock)).toBe("Command failed after 23s");
      expect(commandActivityLabel({ ...tool, status: "stopped", endedAt: 24000 }, clock)).toBe("Command stopped after 23s");
    }
  });
  it("does not imply pending commands have begun execution", () => {
    expect(commandActivityLabel({ ...tool, status: "preparing" }, 23000)).toBe("Preparing command");
    expect(commandActivityLabel({ ...tool, status: "awaiting_approval" }, 23000)).not.toContain("for 22s");
    expect(commandActivityLabel(tool, 0)).toBe("Running command for 0s");
  });
  it("retains action labels for status checks, cancellation and terminal inspection", () => {
    for (const name of ["kali_job_status", "kali_job_cancel", "terminal_list", "terminal_read", "terminal_resize", "desktop_git_status"]) {
      expect(commandActivityLabel({ ...tool, name, title: "Inspect fixture state" }, 23000)).toBe("Inspect fixture state");
    }
    expect(commandActivityLabel({ ...tool, name: "kali_exec", status: "failed", result: { success: false, data: { state: "unknown" } } }, 23000)).toBe("Kali · Command status unconfirmed");
  });
  it("keeps timing a yielded process and freezes at its actual exit", () => {
    const yielded = { ...tool, status: "done" as const, endedAt: 2000, terminal: { command: "fixture", running: true, startedAt: 1000 } };
    expect(commandActivityLabel(yielded, 23000)).toBe("Running command for 22s");
    const finished = { ...yielded, terminal: { ...yielded.terminal, running: false, endedAt: 24000, exitCode: 7, status: "exited" } };
    expect(commandActivityLabel(finished, 999000)).toBe("Command failed after 23s");
    expect(commandActivityLabel({ ...finished, terminal: { ...finished.terminal, status: "stopped" } }, 999000)).toBe("Command stopped after 23s");
    expect(commandActivityLabel({ ...tool, title: "Run fixture", status: "done", endedAt: 24000 }, 999000)).toBe("Ran fixture · 23s");
  });
});
