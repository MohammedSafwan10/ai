import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatMessage, buildAssistantRenderParts } from "../src/renderer/components/ChatMessage";
import { groupInlineMessages } from "../src/renderer/features/chat/inlineMessages";
import type { ChatMessageRecord } from "../src/shared/types";

const assistant: ChatMessageRecord = { id: "answer", threadId: "root", role: "assistant", content: "BeforeAfter", status: "running", createdAt: 1, updatedAt: 3 };
const coordination: ChatMessageRecord = { id: "coordination", threadId: "root", role: "user", content: "DETAILED CHILD REPORT", status: "completed", createdAt: 2, updatedAt: 2,
  steeredTurnId: "answer", steerTextOffset: 6, steerStreamOrder: 2,
  agentMessage: { id: "delivery", senderThreadId: "child", senderLabel: "Reviewer", recipientThreadId: "root", recipientLabel: "Parent", delivery: "queued" } };
const props = { tools: [], subagents: [], activeRunStatus: "running", onApprove: () => {}, onApproveAll: () => {}, onOpenReview: () => {}, turnUndo: null, onPrepareTurnUndo: async () => null, onUndoTurnChanges: async () => null };

describe("inline coordination display", () => {
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
  it("places legacy coordination within its active assistant and leaves idle messages standalone", () => {
    const legacy = { ...coordination, steeredTurnId: undefined, steerTextOffset: undefined };
    expect(groupInlineMessages([assistant, legacy]).inlineByTurn.get("answer")).toHaveLength(1);
    const idle = { ...legacy, createdAt: 5 };
    expect(groupInlineMessages([{ ...assistant, status: "completed" }, idle]).roots).toHaveLength(2);
  });
});
