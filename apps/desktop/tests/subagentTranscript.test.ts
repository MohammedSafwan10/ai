import { describe, expect, it } from "vitest";
import { applyAgentEvent, reduceAgentTranscript, type AgentTranscript } from "../src/renderer/features/chat/SubagentsPanel";
import { envelopePrivoraEvent } from "../src/main/agent/harness/eventBus";
import type { AppSnapshot, ChatMessageRecord } from "../src/shared/types";
const initial = (): AgentTranscript => ({ sequence: 0, run: null, page: { threadId: "child", messages: [], toolEvents: [], turnUndos: [], hasOlder: false } });
const message: ChatMessageRecord = { id: "answer", threadId: "child", role: "assistant", status: "running", content: "First", createdAt: 1, updatedAt: 1 };
describe("live subagent transcript", () => {
  it("clears Stop when the active assistant message becomes terminal", () => {
    const state = { ...initial(), run: { threadId: "child", assistantMessageId: "answer", phase: "awaiting_approval" as const, status: "awaiting_approval" as const, updatedAt: 10 } };
    expect(reduceAgentTranscript(state, "child", { type: "message.upserted", message: { ...message, status: "stopped", updatedAt: 11 } }).run).toBeNull();
    expect(reduceAgentTranscript(state, "child", { type: "message.upserted", message: { ...message, id: "older", status: "completed" } }).run).toEqual(state.run);
  });
  it("reconciles terminal agent metadata but preserves omitted recovered approvals", () => {
    const state = { ...initial(), run: { threadId: "child", assistantMessageId: "answer", phase: "awaiting_approval" as const, status: "awaiting_approval" as const, updatedAt: 10 } };
    const snapshot = { activeRuns: [], subagents: [] } as unknown as AppSnapshot;
    expect(reduceAgentTranscript(state, "child", { type: "snapshot.updated", snapshot }).run).toEqual(state.run);
    const terminal = { ...snapshot, subagents: [{ threadId: "child", status: "stopped", updatedAt: 11 }] } as AppSnapshot;
    expect(reduceAgentTranscript(state, "child", { type: "snapshot.updated", snapshot: terminal }).run).toBeNull();
    expect(reduceAgentTranscript(state, "child", { type: "snapshot.updated", snapshot: { ...terminal, subagents: [{ ...terminal.subagents[0], updatedAt: 9 }] } }).run).toEqual(state.run);
  });
  it("keeps child questions scoped and clears only the answered request", () => {
    const request = { threadId: "child", assistantMessageId: "answer", callId: "question", questions: [], createdAt: 1 };
    const waiting = reduceAgentTranscript(initial(), "child", { type: "user_input.requested", request });
    expect(waiting.pendingInput).toEqual(request);
    expect(reduceAgentTranscript(waiting, "child", { type: "user_input.resolved", threadId: "other", callId: "question" })).toBe(waiting);
    expect(reduceAgentTranscript(waiting, "child", { type: "user_input.resolved", threadId: "child", callId: "old" })).toBe(waiting);
    expect(reduceAgentTranscript(waiting, "child", { type: "user_input.resolved", threadId: "child", callId: "question" }).pendingInput).toBeNull();
    expect(reduceAgentTranscript(waiting, "child", { type: "turn.stopped", threadId: "child", turnId: "answer" }).pendingInput).toBeNull();
  });
  it("discards buffered events already represented by the history snapshot", () => {
    const stale = envelopePrivoraEvent({ type: "message.upserted", message });
    const snapshot = { ...initial(), sequence: stale.sequence, page: { ...initial().page, messages: [{ ...message, content: "Newer snapshot" }] } };
    expect(applyAgentEvent(snapshot, "child", stale)).toBe(snapshot);
    const fresh = envelopePrivoraEvent({ type: "message.upserted", message: { ...message, content: "New delta" } });
    expect(applyAgentEvent(snapshot, "child", fresh).page.messages[0].content).toBe("New delta");
  });
  it("updates streaming text in place and retains final output", () => {
    const first = reduceAgentTranscript(initial(), "child", { type: "message.upserted", message });
    const streamed = reduceAgentTranscript(first, "child", { type: "message.upserted", message: { ...message, content: "First second" } });
    expect(streamed.page.messages).toHaveLength(1);
    const final = reduceAgentTranscript(streamed, "child", { type: "turn.completed", threadId: "child", turnId: "answer", message: { ...message, status: "completed", content: "Finished" } });
    expect(final.page.messages[0]).toMatchObject({ content: "Finished", status: "completed" });
  });
  it("ignores events from unrelated threads", () => {
    const state = initial();
    expect(reduceAgentTranscript(state, "child", { type: "message.upserted", message: { ...message, threadId: "other" } })).toBe(state);
    expect(applyAgentEvent(state, "child", envelopePrivoraEvent({ type: "message.upserted", message: { ...message, threadId: "other" } }))).toBe(state);
  });
  it("bounds continuously streamed output while retaining its beginning and latest tail", () => {
    const tool = { id: "tool", threadId: "child", messageId: message.id, callId: "call", name: "kali_exec", title: "Read output", args: {}, status: "running" as const, risk: "safe" as const, createdAt: 1, updatedAt: 1, output: "START\n" };
    let state = { ...initial(), page: { ...initial().page, toolEvents: [tool] } };
    for (let index = 0; index < 500; index++) state = reduceAgentTranscript(state, "child", { type: "tool.output_delta", callId: "call", delta: "x".repeat(1000) }) as typeof state;
    state = reduceAgentTranscript(state, "child", { type: "tool.output_delta", callId: "call", delta: "\nLATEST" }) as typeof state;
    expect(state.page.toolEvents[0].output.length).toBeLessThan(40_100);
    expect(state.page.toolEvents[0].output).toMatch(/^START\n/);
    expect(state.page.toolEvents[0].output).toMatch(/LATEST$/);
  });
});
