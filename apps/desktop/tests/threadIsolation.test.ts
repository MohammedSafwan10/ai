import { describe, expect, it } from "vitest";
import { applyRefreshSnapshot, coalescePrivoraEvents, prependHistoryPage, reducePrivoraEvents } from "../src/renderer/state/useDesktopState";
import { PRIVORA_EVENT_PROTOCOL_VERSION } from "../src/shared/types";
import type { ChatMessageRecord, PrivoraEventEnvelope, PrivoraEventPayload, ToolEventRecord } from "../src/shared/types";

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
    deepseekApiKeyStored: false,
    opencodeGoApiKeyStored: false,
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
  it("does not duplicate tool output when replacements arrive between deltas in one frame", () => {
    const current = { ...baseSnapshot(), toolEvents: [{ ...tool("old-tool", "old-thread", "old-message"), output: "", status: "running" as const }] };
    const events = [
      envelope({ type: "tool.output_delta", callId: "old-tool-call", delta: "first " }),
      envelope({ type: "tool.upserted", tool: { ...current.toolEvents[0], output: "first " } }),
      envelope({ type: "tool.output_delta", callId: "old-tool-call", delta: "second" }),
    ];
    expect(reducePrivoraEvents(current, coalescePrivoraEvents(events)).toolEvents[0].output).toBe("first second");
  });
  it("removes undone messages from an authoritative same-thread snapshot", () => {
    const current = { ...baseSnapshot(), messages: [...baseSnapshot().messages, message("removed", "old-thread", "undone response")], toolEvents: [tool("removed-tool", "old-thread", "removed")] };
    const next = reducePayloadEvents(current, [{ type: "snapshot.updated", snapshot: { ...baseSnapshot(), historyPage: { threadId: "old-thread", messages: baseSnapshot().messages, toolEvents: [], turnUndos: [], hasOlder: false } } }]);
    expect(next.messages.map((item) => item.id)).toEqual(["old-message"]);
    expect(next.toolEvents).toEqual([]);
  });
  it("keeps previously paginated older messages when a fresh tail snapshot arrives", () => {
    const current = { ...baseSnapshot(), messages: [message("earlier", "old-thread", "older")], historyPage: { threadId: "old-thread", messages: [], toolEvents: [], turnUndos: [], hasOlder: false } };
    const recent = { ...message("recent", "old-thread", "newer"), createdAt: 10 };
    const next = reducePayloadEvents(current, [{ type: "snapshot.updated", snapshot: { ...baseSnapshot(), messages: [recent], historyPage: { threadId: "old-thread", messages: [recent], toolEvents: [], turnUndos: [], hasOlder: true, beforeCursor: "tail-cursor" } } }]);
    expect(next.messages.map((item) => item.id)).toEqual(["earlier", "recent"]);
    expect(next.historyPage?.hasOlder).toBe(false);
  });
  it("finishes a matching turn immediately and prevents an older refresh from resurrecting Stop", () => {
    const run = { threadId: "old-thread", assistantMessageId: "old-assistant", phase: "running" as const, status: "running" as const, updatedAt: 10 };
    const current = { ...baseSnapshot(), activeRun: run, activeRuns: [run], activeRunsByThread: { "old-thread": run } };
    const completed = envelope({ type: "turn.completed", threadId: "old-thread", turnId: "old-assistant", message: message("old-assistant", "old-thread", "Done") });
    const finished = reducePrivoraEvents(current, [completed]);
    expect(finished.activeRun).toBeNull();
    expect(finished.messages.find((item) => item.id === "old-assistant")?.content).toBe("Done");
    expect(applyRefreshSnapshot(finished, current, completed.sequence - 1).activeRun).toBeNull();
  });
  it("ignores a late old-turn completion while a newer turn is active", () => {
    const run = { threadId: "old-thread", assistantMessageId: "new-turn", phase: "running" as const, status: "running" as const };
    const next = reducePayloadEvents({ ...baseSnapshot(), activeRun: run, activeRunsByThread: { "old-thread": run } }, [{ type: "turn.stopped", threadId: "old-thread", turnId: "old-turn" }]);
    expect(next.activeRun?.assistantMessageId).toBe("new-turn");
  });
  it("does not revert a pushed chat selection with a refresh that began earlier", () => {
    const changed = envelope({ type: "snapshot.updated", snapshot: { ...baseSnapshot(), activeThreadId: "new-thread", messages: [] } });
    const current = reducePrivoraEvents(baseSnapshot(), [changed]);
    expect(applyRefreshSnapshot(current, baseSnapshot(), changed.sequence - 1).activeThreadId).toBe("new-thread");
  });
  it("rejects an older history response from a different chat", () => {
    const current = baseSnapshot();
    expect(prependHistoryPage(current, { threadId: "new-thread", messages: [message("wrong", "new-thread", "wrong")], toolEvents: [], turnUndos: [], hasOlder: false })).toBe(current);
  });
  it("clears the ended turn's pending question without clearing a newer question", () => {
    const request = { threadId: "old-thread", assistantMessageId: "old-turn", callId: "question", questions: [], createdAt: 1 };
    const current = { ...baseSnapshot(), pendingUserInputsByThread: { "old-thread": request }, pendingUserInput: request };
    expect(reducePayloadEvents(current, [{ type: "turn.stopped", threadId: "old-thread", turnId: "old-turn" }]).pendingUserInput).toBeNull();
    expect(reducePayloadEvents(current, [{ type: "turn.stopped", threadId: "old-thread", turnId: "previous-turn" }]).pendingUserInput).toEqual(request);
  });
  it("does not drop active-chat context usage when another chat updates in the same frame", () => {
    const tokens = { inputTokens: 20, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, totalTokens: 20 };
    const usage = { threadId: "old-thread", modelId: "model", usedTokens: 20, budgetMode: "normal" as const, estimated: true, lastTokenUsage: tokens, totalTokenUsage: tokens, updatedAt: 1 };
    const events = [envelope({ type: "context.usage_updated", usage }), envelope({ type: "context.usage_updated", usage: { ...usage, threadId: "new-thread", usedTokens: 90 } })];
    const next = reducePrivoraEvents(baseSnapshot(), coalescePrivoraEvents(events));
    expect(next.contextUsage?.usedTokens).toBe(20);
  });
  it("ignores live message and tool events from inactive threads", () => {
    const snapshot = reducePayloadEvents(baseSnapshot(), [
      { type: "message.upserted", message: message("new-message", "new-thread", "new prompt should not show here") },
      { type: "tool.upserted", tool: tool("new-tool", "new-thread", "new-message") },
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

    const afterOtherRun = reducePayloadEvents(current, [
      {
        type: "turn.status_changed",
        threadId: "new-thread",
        run: {
          threadId: "new-thread",
          assistantMessageId: "new-assistant",
          phase: "running",
          status: "running",
          updatedAt: 20,
        },
      },
      { type: "turn.status_changed", threadId: "new-thread", run: null },
    ]);

    expect(afterOtherRun.activeRun?.threadId).toBe("old-thread");
    expect(afterOtherRun.activeRun?.assistantMessageId).toBe("old-assistant");
  });

  it("accepts events from the active thread", () => {
    const next = reducePayloadEvents(baseSnapshot(), [
      { type: "message.upserted", message: message("old-assistant", "old-thread", "assistant text") },
      { type: "tool.upserted", tool: tool("old-tool", "old-thread", "old-assistant") },
      {
        type: "turn.status_changed",
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
    const next = reducePayloadEvents(current, [
      {
        type: "snapshot.updated",
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
    const current = reducePayloadEvents(baseSnapshot(), [
      {
        type: "snapshot.updated",
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

    const next = reducePayloadEvents(current, [
      { type: "tool.upserted", tool: tool("child-tool", "agent-thread", "child-assistant") },
    ]);

    expect(next.toolEvents.map((item) => item.id)).toContain("child-tool");
    expect(next.toolEvents.find((item) => item.id === "child-tool")?.messageId).toBe("old-assistant");
  });

  it("coalesces run states independently per thread", () => {
    const events = coalescePayloadEvents([
      {
        type: "turn.status_changed",
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
        type: "turn.status_changed",
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

    expect(events.filter((event) => event.type === "turn.status_changed")).toHaveLength(2);
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

let sequence = 0;

const envelope = <T extends PrivoraEventPayload>(payload: T): PrivoraEventEnvelope<T> => ({
  protocolVersion: PRIVORA_EVENT_PROTOCOL_VERSION,
  eventId: `test-${++sequence}`,
  sequence,
  emittedAt: sequence,
  payload,
});

const reducePayloadEvents = (
  snapshot: Parameters<typeof reducePrivoraEvents>[0],
  payloads: PrivoraEventPayload[],
) => reducePrivoraEvents(snapshot, payloads.map(envelope));

const coalescePayloadEvents = (payloads: PrivoraEventPayload[]) =>
  coalescePrivoraEvents(payloads.map(envelope)).map((event) => event.payload);
