import { describe, expect, it } from "vitest";
import { applyAgentEvent, reduceAgentTranscript, type AgentTranscript } from "../src/renderer/features/chat/SubagentsPanel";
import { envelopePrivoraEvent } from "../src/main/agent/harness/eventBus";
import type { ChatMessageRecord } from "../src/shared/types";
const initial = (): AgentTranscript => ({ sequence: 0, run: null, page: { threadId: "child", messages: [], toolEvents: [], turnUndos: [], hasOlder: false } });
const message: ChatMessageRecord = { id: "answer", threadId: "child", role: "assistant", status: "running", content: "First", createdAt: 1, updatedAt: 1 };
describe("live subagent transcript", () => {
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
  });
});
