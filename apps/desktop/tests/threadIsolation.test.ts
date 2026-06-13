import { describe, expect, it } from "vitest";
import { coalesceDesktopEvents, prependHistoryPage, reduceDesktopEvents } from "../src/renderer/state/useDesktopState";
import type { ChatMessageRecord, ToolEventRecord } from "../src/shared/types";

const baseSnapshot = () => ({
  settings: {
    id: "default" as const,
    model: "test-model",
    reasoningEffort: "medium" as const,
    permissionMode: "ask_risky" as const,
    collaborationMode: "default" as const,
    agentHarnessMode: "standard" as const,
    computerUseEnabled: false,
    keepRunningInTray: false,
    theme: "system" as const,
    cliproxyBaseUrl: "http://127.0.0.1:8317",
    appwriteEndpoint: "https://sgp.cloud.appwrite.io/v1",
    appwriteProjectId: "project",
    privoraGatewayFunctionId: "model-gateway",
    openRouterApiKeyStored: false,
    geminiApiKeyStored: false,
    privoraAccountConnected: false,
  },
  workspaces: [],
  threads: [
    { id: "old-thread", title: "Old chat", workspaceId: null, createdAt: 1, updatedAt: 1 },
    { id: "new-thread", title: "New chat", workspaceId: null, createdAt: 2, updatedAt: 2 },
  ],
  messages: [message("old-message", "old-thread", "old visible message")],
  toolEvents: [],
  subagents: [],
  turnUndos: [],
  approvalScopes: [],
  approvalHistory: [],
  activeThreadId: "old-thread",
  activeWorkspaceId: null,
  activeRun: null,
  activeRuns: [],
  activeRunsByThread: {},
  pendingUserInputsByThread: {},
  pendingUserInput: null,
});

describe("renderer thread isolation", () => {
  it("ignores live message and tool events from inactive threads", () => {
    const snapshot = reduceDesktopEvents(baseSnapshot(), [
      { type: "message_updated", message: message("new-message", "new-thread", "new prompt should not show here") },
      { type: "tool_updated", tool: tool("new-tool", "new-thread", "new-message") },
    ]);

    expect(snapshot.messages.map((item) => item.id)).toEqual(["old-message"]);
    expect(snapshot.messages[0].content).toBe("old visible message");
    expect(snapshot.toolEvents).toEqual([]);
  });

  it("ignores inactive-thread run state updates and clears", () => {
    const current = {
      ...baseSnapshot(),
      activeRun: {
        threadId: "old-thread",
        assistantMessageId: "old-assistant",
        phase: "running" as const,
        status: "running" as const,
        updatedAt: 10,
      },
    };

    const afterOtherRun = reduceDesktopEvents(current, [
      {
        type: "run_state",
        threadId: "new-thread",
        run: {
          threadId: "new-thread",
          assistantMessageId: "new-assistant",
          phase: "running",
          status: "running",
          updatedAt: 20,
        },
      },
      { type: "run_state", threadId: "new-thread", run: null },
    ]);

    expect(afterOtherRun.activeRun?.threadId).toBe("old-thread");
    expect(afterOtherRun.activeRun?.assistantMessageId).toBe("old-assistant");
  });

  it("accepts events from the active thread", () => {
    const next = reduceDesktopEvents(baseSnapshot(), [
      { type: "message_updated", message: message("old-assistant", "old-thread", "assistant text") },
      { type: "tool_updated", tool: tool("old-tool", "old-thread", "old-assistant") },
      {
        type: "run_state",
        threadId: "old-thread",
        run: {
          threadId: "old-thread",
          assistantMessageId: "old-assistant",
          phase: "running",
          status: "running",
          updatedAt: 30,
        },
      },
    ]);

    expect(next.messages.map((item) => item.id)).toEqual(["old-message", "old-assistant"]);
    expect(next.toolEvents.map((item) => item.id)).toEqual(["old-tool"]);
    expect(next.activeRun?.assistantMessageId).toBe("old-assistant");
  });

  it("keeps subagents scoped to the active parent thread snapshot", () => {
    const current = baseSnapshot();
    const next = reduceDesktopEvents(current, [
      {
        type: "snapshot",
        snapshot: {
          ...current,
          subagents: [{
            id: "agent-1",
            parentThreadId: "old-thread",
            parentMessageId: "old-assistant",
            threadId: "agent-thread",
            workspaceId: null,
            taskName: "reviewer",
            agentPath: "/root/reviewer",
            agentNickname: "Rook",
            agentRole: "reviewer",
            prompt: "Review this.",
            status: "running",
            createdAt: 4,
            updatedAt: 4,
          }],
        },
      },
    ]);

    expect(next.subagents.map((agent) => agent.taskName)).toEqual(["reviewer"]);
    expect(next.subagents).toHaveLength(1);
  });

  it("surfaces child tool events in the active parent timeline", () => {
    const current = reduceDesktopEvents(baseSnapshot(), [
      {
        type: "snapshot",
        snapshot: {
          ...baseSnapshot(),
          subagents: [{
            id: "agent-1",
            parentThreadId: "old-thread",
            parentMessageId: "old-assistant",
            threadId: "agent-thread",
            workspaceId: null,
            taskName: "reviewer",
            agentPath: "/root/reviewer",
            prompt: "Review this.",
            status: "running",
            createdAt: 4,
            updatedAt: 4,
          }],
        },
      },
    ]);

    const next = reduceDesktopEvents(current, [
      { type: "tool_updated", tool: tool("child-tool", "agent-thread", "child-assistant") },
    ]);

    expect(next.toolEvents.map((item) => item.id)).toContain("child-tool");
    expect(next.toolEvents.find((item) => item.id === "child-tool")?.messageId).toBe("old-assistant");
  });

  it("coalesces run states independently per thread", () => {
    const events = coalesceDesktopEvents([
      {
        type: "run_state",
        threadId: "old-thread",
        run: {
          threadId: "old-thread",
          assistantMessageId: "old-assistant",
          phase: "running",
          status: "running",
          updatedAt: 10,
        },
      },
      {
        type: "run_state",
        threadId: "new-thread",
        run: {
          threadId: "new-thread",
          assistantMessageId: "new-assistant",
          phase: "running",
          status: "running",
          updatedAt: 11,
        },
      },
    ]);

    expect(events.filter((event) => event.type === "run_state")).toHaveLength(2);
  });

  it("prepends history pages without duplicating existing messages", () => {
    const current = baseSnapshot();
    const next = prependHistoryPage(current, {
      threadId: "old-thread",
      messages: [
        message("earlier", "old-thread", "earlier"),
        message("old-message", "old-thread", "updated visible message"),
      ],
      toolEvents: [],
      turnUndos: [],
      beforeCursor: "next-cursor",
      hasOlder: true,
    });

    expect(next.messages.map((item) => item.id)).toEqual(["old-message", "earlier"]);
    expect(next.messages.find((item) => item.id === "old-message")?.content).toBe("old visible message");
    expect(next.historyPage?.beforeCursor).toBe("next-cursor");
  });
});

const message = (id: string, threadId: string, content: string): ChatMessageRecord => ({
  id,
  threadId,
  role: id.includes("assistant") ? "assistant" : "user",
  content,
  status: "completed",
  createdAt: id === "old-message" ? 1 : 2,
  updatedAt: id === "old-message" ? 1 : 2,
});

const tool = (id: string, threadId: string, messageId: string): ToolEventRecord => ({
  id,
  threadId,
  messageId,
  callId: `${id}-call`,
  name: "desktop_list_dir",
  title: "List",
  status: "done",
  risk: "safe",
  args: {},
  result: { success: true, output: "ok" },
  createdAt: 3,
  updatedAt: 3,
});
