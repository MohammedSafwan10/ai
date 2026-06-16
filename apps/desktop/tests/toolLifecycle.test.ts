import { describe, expect, it, vi } from "vitest";
import { ToolCallCoordinator } from "../src/main/agent/harness/toolCallCoordinator";
import type { ToolExecutionContext } from "../src/main/agent/tools/executor";
import { ToolLifecycleBus } from "../src/main/agent/tools/lifecycle";
import type { DesktopToolCall, ToolResult } from "../src/shared/types";

const call = (name: DesktopToolCall["name"], args: Record<string, unknown> = {}): DesktopToolCall => ({
  id: "call-1",
  name,
  arguments: args,
});

const context = (): ToolExecutionContext => ({
  workspaceRoot: "D:/workspace",
  signal: new AbortController().signal,
  onCommandOutput: () => undefined,
});

const orchestrator = (result: ToolResult = { success: true, output: "ok" }) => ({
  assess: vi.fn(() => ({ risk: "safe" as const, requiresApproval: false })),
  execute: vi.fn(async () => result),
  setComputerUseEnabled: vi.fn(),
  supportsParallelExecution: vi.fn(() => false),
  getTerminalState: vi.fn(() => ({ sessions: [], updatedAt: Date.now() })),
  readTerminalSession: vi.fn(),
  stopTerminalProcess: vi.fn(),
  resizeTerminalSession: vi.fn(),
});

describe("tool lifecycle bus", () => {
  it("can require approval during tool assessment", () => {
    const tools = orchestrator();
    const lifecycle = new ToolLifecycleBus([
      {
        assessTool: ({ decision }) => ({
          ...decision,
          risk: "risky",
          requiresApproval: true,
          reason: "Lifecycle policy requires approval.",
        }),
      },
    ]);
    const coordinator = new ToolCallCoordinator(undefined, undefined, undefined, undefined, tools, lifecycle);

    expect(coordinator.assess(call("desktop_read_file", { path: "app.ts" }), "ask_risky")).toMatchObject({
      risk: "risky",
      requiresApproval: true,
      reason: "Lifecycle policy requires approval.",
    });
  });

  it("blocks execution in pre-hooks and records an audit event", async () => {
    const tools = orchestrator();
    const lifecycle = new ToolLifecycleBus([
      {
        beforeTool: () => ({ action: "block", reason: "blocked in test" }),
      },
    ]);
    const coordinator = new ToolCallCoordinator(undefined, undefined, undefined, undefined, tools, lifecycle);

    const result = await coordinator.execute(call("desktop_read_file", { path: "app.ts" }), context());

    expect(result).toMatchObject({
      success: false,
      data: { code: "TOOL_LIFECYCLE_BLOCKED", reason: "blocked in test" },
    });
    expect(tools.execute).not.toHaveBeenCalled();
    expect(lifecycle.listAuditEvents()).toEqual([
      expect.objectContaining({
        callId: "call-1",
        name: "desktop_read_file",
        success: false,
        error: expect.stringContaining("blocked in test"),
      }),
    ]);
  });

  it("runs post-hooks after successful execution without changing the result", async () => {
    const tools = orchestrator({ success: true, output: "done" });
    const afterTool = vi.fn();
    const lifecycle = new ToolLifecycleBus([{ afterTool }]);
    const coordinator = new ToolCallCoordinator(undefined, undefined, undefined, undefined, tools, lifecycle);

    const result = await coordinator.execute(call("desktop_read_file", { path: "app.ts" }), context());

    expect(result).toEqual({ success: true, output: "done" });
    expect(afterTool).toHaveBeenCalledOnce();
    expect(lifecycle.listAuditEvents()).toEqual([
      expect.objectContaining({ callId: "call-1", success: true, durationMs: expect.any(Number) }),
    ]);
  });

  it("records audit when the orchestrator throws", async () => {
    const tools = orchestrator();
    tools.execute.mockRejectedValueOnce(new Error("backend exploded"));
    const lifecycle = new ToolLifecycleBus();
    const coordinator = new ToolCallCoordinator(undefined, undefined, undefined, undefined, tools, lifecycle);

    const result = await coordinator.execute(call("desktop_read_file", { path: "app.ts" }), context());

    expect(result).toMatchObject({ success: false, error: "backend exploded" });
    expect(lifecycle.listAuditEvents()).toEqual([
      expect.objectContaining({ callId: "call-1", success: false, error: "backend exploded" }),
    ]);
  });

  it("blocks tools when pre-hooks time out", async () => {
    const tools = orchestrator();
    const lifecycle = new ToolLifecycleBus([
      {
        beforeTool: () => new Promise(() => undefined),
      },
    ], 5);
    const coordinator = new ToolCallCoordinator(undefined, undefined, undefined, undefined, tools, lifecycle);

    const result = await coordinator.execute(call("desktop_read_file", { path: "app.ts" }), context());

    expect(result).toMatchObject({
      success: false,
      data: { code: "TOOL_LIFECYCLE_BLOCKED" },
    });
    expect(result.error).toContain("timed out");
    expect(tools.execute).not.toHaveBeenCalled();
  });
});
