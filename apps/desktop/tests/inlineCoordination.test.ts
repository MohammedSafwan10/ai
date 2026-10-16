import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatMessage, buildAssistantRenderParts } from "../src/renderer/components/ChatMessage";
import { groupInlineMessages } from "../src/renderer/features/chat/inlineMessages";
import { applyAgentEvent, type AgentTranscript } from "../src/renderer/features/chat/SubagentsPanel";
import { envelopePrivoraEvent } from "../src/main/agent/harness/eventBus";
import type { ChatMessageRecord, PrivoraEventPayload, ToolEventRecord } from "../src/shared/types";

const assistant: ChatMessageRecord = { id: "answer", threadId: "root", role: "assistant", content: "BeforeAfter", status: "running", createdAt: 1, updatedAt: 3 };
const coordination: ChatMessageRecord = { id: "coordination", threadId: "root", role: "user", content: "DETAILED CHILD REPORT", status: "completed", createdAt: 2, updatedAt: 2,
  steeredTurnId: "answer", steerTextOffset: 6, steerStreamOrder: 2,
  agentMessage: { id: "delivery", senderThreadId: "child", senderLabel: "Reviewer", recipientThreadId: "root", recipientLabel: "Parent", delivery: "queued" } };
const props = { tools: [], subagents: [], activeRunStatus: "running", onApprove: () => {}, onApproveAll: () => {}, onOpenReview: () => {}, turnUndo: null, onPrepareTurnUndo: async () => null, onUndoTurnChanges: async () => null };

describe("inline coordination display", () => {
  it.each([false, true])("keeps live envelope ordering identical to completion, with captured mid-turn steer=%s", (includeSteer) => {
    let transcript: AgentTranscript = { sequence: 0, run: null, page: { threadId: "root", messages: [], toolEvents: [], turnUndos: [], hasOlder: false } };
    const starting = { ...coordination, id: "starting-parent-message", createdAt: 100, updatedAt: 100, steeredTurnId: undefined, steerTextOffset: undefined };
    let streamed: ChatMessageRecord = { ...assistant, content: "", createdAt: 100, updatedAt: 100 };
    const send = (payload: PrivoraEventPayload) => { transcript = applyAgentEvent(transcript, "root", envelopePrivoraEvent(payload)); };
    send({ type: "message.upserted", message: starting });
    send({ type: "message.upserted", message: streamed });
    const chunks = ["Alpha", "Bravo", "Charlie"];
    let expected: string[] = [];
    const view = () => {
      const groups = groupInlineMessages(transcript.page.messages, transcript.page.toolEvents);
      expect(groups.roots.map((message) => message.id)).toEqual(["starting-parent-message", "answer"]);
      const parts = buildAssistantRenderParts(transcript.page.messages.find((message) => message.id === "answer")!, transcript.page.toolEvents, streamed.status === "running", groups.inlineByTurn.get("answer"));
      expect(parts.filter((part) => part.type === "text").map((part) => part.text).join("")).toBe(streamed.content);
      return parts.flatMap((part) => part.type === "text" ? [part.text] : part.type === "tools" ? part.tools.map((tool) => tool.id) : [part.type]);
    };
    for (let index = 0; index < chunks.length; index++) {
      streamed = { ...streamed, content: streamed.content + chunks[index], updatedAt: 101 + index * 10 };
      send({ type: "message.upserted", message: streamed });
      expect(view()).toEqual([...expected, chunks[index]]);
      const tool: ToolEventRecord = { id: `live-tool-${index}`, threadId: "root", messageId: "answer", callId: `live-call-${index}`, name: "kali_exec", title: "Fixture command", args: {}, risk: "safe", status: "running", createdAt: 101 + index * 10, updatedAt: 101 + index * 10, textOffset: streamed.content.length };
      send({ type: "tool.upserted", tool });
      expected = [...expected, chunks[index], tool.id];
      expect(view()).toEqual(expected);
      send({ type: "tool.upserted", tool: { ...tool, status: "done", updatedAt: tool.updatedAt + 1 } });
      if (index === 0 && includeSteer) {
        send({ type: "message.upserted", message: { ...coordination, id: "captured-mid-turn", createdAt: 103, updatedAt: 103, steerTextOffset: 5 } });
        expected.push("steer");
      }
      expect(view()).toEqual(expected);
    }
    const liveOrder = view();
    streamed = { ...streamed, status: "completed", updatedAt: 140 };
    send({ type: "turn.completed", threadId: "root", turnId: "answer", message: streamed });
    expect(view()).toEqual(liveOrder);
  });
  it("uses the compact sent-message label from the reference", () => {
    const sent = { ...coordination, role: "assistant" as const, agentMessage: { ...coordination.agentMessage!, outgoing: true } };
    const html = renderToStaticMarkup(createElement(ChatMessage, { ...props, message: sent }));
    expect(html).toContain("Sent message to");
    expect(html).toContain("parent");
    expect(html).not.toContain("DETAILED CHILD REPORT");
  });
  it("positions coordination between streamed text chunks without a duplicate root row", () => {
    const groups = groupInlineMessages([assistant, coordination]);
    expect(groups.roots.map((message) => message.id)).toEqual(["answer"]);
    const parts = buildAssistantRenderParts(assistant, [], true, groups.inlineByTurn.get("answer"));
    expect(parts.map((part) => part.type === "text" ? part.text : part.type)).toEqual(["Before", "steer", "After"]);
    const html = renderToStaticMarkup(createElement(ChatMessage, { ...props, message: assistant, inlineSteers: [coordination] }));
    expect(html.indexOf("Before")).toBeLessThan(html.indexOf("agent-coordination-line"));
    expect(html.indexOf("agent-coordination-line")).toBeLessThan(html.indexOf("After"));
    expect(html).not.toContain("DETAILED CHILD REPORT");
    expect(html).not.toContain("inline-steer-label");
  });
  it("shows coordination content only in the child transcript", () => {
    const html = renderToStaticMarkup(createElement(ChatMessage, { ...props, message: assistant, inlineSteers: [coordination], coordinationDetails: true }));
    expect(html).toContain("DETAILED CHILD REPORT");
  });
  it("updates delivery status in place without changing its captured position", () => {
    const delivered = { ...coordination, agentMessage: { ...coordination.agentMessage!, delivery: "delivered" as const }, updatedAt: 4 };
    const groups = groupInlineMessages([assistant, delivered]);
    expect(groups.inlineByTurn.get("answer")?.[0].steerTextOffset).toBe(6);
    expect(groups.roots).toHaveLength(1);
  });
  it("retains messages whose anchor is outside the loaded history page", () => {
    expect(groupInlineMessages([coordination]).roots).toEqual([coordination]);
  });
  it("uses a prior captured tool position for legacy coordination and leaves idle messages standalone", () => {
    const legacy = { ...coordination, createdAt: 3, steeredTurnId: undefined, steerTextOffset: undefined };
    const tool: ToolEventRecord = { id: "tool", threadId: "root", messageId: "answer", callId: "call", name: "exec_command", title: "Inspect", args: {}, risk: "safe", status: "done", createdAt: 2, updatedAt: 2, textOffset: 6 };
    expect(groupInlineMessages([assistant, legacy], [tool]).inlineByTurn.get("answer")?.[0].steerTextOffset).toBe(6);
    expect(groupInlineMessages([{ ...assistant, content: "BeforeAfterMoreStreamedText" }, legacy], [tool]).inlineByTurn.get("answer")?.[0].steerTextOffset).toBe(6);
    const idle = { ...legacy, createdAt: 5 };
    expect(groupInlineMessages([{ ...assistant, status: "completed" }, idle]).roots).toHaveLength(2);
  });
  it("keeps same-millisecond starting coordination outside the new assistant, including when an older turn exists", () => {
    const incoming = { ...coordination, createdAt: 10, steeredTurnId: undefined, steerTextOffset: undefined };
    const previous = { ...assistant, id: "previous", createdAt: 1, updatedAt: 20 };
    const starting = { ...assistant, content: "BeforeAfterLater", createdAt: 10, updatedAt: 20 };
    const tools: ToolEventRecord[] = [6, 11].map((textOffset, index) => ({ id: `tool-${index}`, threadId: "root", messageId: "answer", callId: `call-${index}`, name: "exec_command", title: "Inspect", args: {}, risk: "safe", status: "done", createdAt: 11 + index, updatedAt: 11 + index, textOffset }));
    const groups = groupInlineMessages([previous, incoming, starting], tools);
    expect(groups.roots.map((message) => message.id)).toEqual(["previous", "coordination", "answer"]);
    expect(groups.inlineByTurn.size).toBe(0);
    const parts = buildAssistantRenderParts(starting, tools, true, groups.inlineByTurn.get("answer"));
    expect(parts.map((part) => part.type === "text" ? part.text : part.type)).toEqual(["Before", "tools", "After", "tools", "Later"]);
  });
  it("does not invent a moving end-of-text position for unanchored legacy coordination", () => {
    const legacy = { ...coordination, steeredTurnId: undefined, steerTextOffset: undefined };
    for (const content of ["Before", "BeforeAfter", "BeforeAfterMore"]) {
      const groups = groupInlineMessages([{ ...assistant, content }, legacy]);
      expect(groups.roots.map((message) => message.id)).toEqual(["answer", "coordination"]);
      expect(groups.inlineByTurn.size).toBe(0);
      expect(legacy.steerTextOffset).toBeUndefined();
    }
  });
  it("preserves explicitly captured same-millisecond coordination and its offset", () => {
    const captured = { ...coordination, createdAt: assistant.createdAt };
    const groups = groupInlineMessages([assistant, captured]);
    expect(groups.inlineByTurn.get("answer")).toEqual([captured]);
    expect(groups.inlineByTurn.get("answer")?.[0]).toBe(captured);
  });
  it("places a legacy starting user message before its same-millisecond response despite UUID order", () => {
    const incoming = { ...coordination, id: "zz-user", createdAt: 10, steeredTurnId: undefined, steerTextOffset: undefined };
    const response = { ...assistant, id: "aa-assistant", createdAt: 10 };
    const groups = groupInlineMessages([response, incoming]);
    expect(groups.roots.map((message) => message.id)).toEqual(["zz-user", "aa-assistant"]);
    expect(groups.inlineByTurn.size).toBe(0);
    expect(groupInlineMessages([incoming, response]).roots).toEqual(groups.roots);
  });
});
