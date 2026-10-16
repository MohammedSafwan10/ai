import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatMessage, buildAssistantRenderParts, messageClipboardText, normalizeTextParts, splitTextByPhaseForTest, visibleSteeredAssistantParts } from "../src/renderer/components/ChatMessage";
import type { ChatMessageRecord } from "../src/shared/types";

const message = (content: string, textParts: ChatMessageRecord["textParts"]): ChatMessageRecord => ({
  id: "assistant-1",
  threadId: "thread-1",
  role: "assistant",
  content,
  thought: "",
  status: "completed",
  attachments: [],
  textParts,
  createdAt: 1,
  updatedAt: 1,
});

describe("assistant text part rendering", () => {
  it("copies the displayed final answer without earlier progress or thought text", () => {
    const content = "Working...\nDone.\n";
    const record = { ...message(content, [part("progress", "commentary", 0, 11, 1), part("answer", "final_answer", 11, content.length, 2)]), thought: "Private reasoning" };
    expect(messageClipboardText(record)).toBe("Done.\n");
    expect(messageClipboardText({ ...record, role: "user" })).toBe(content);
    expect(messageClipboardText(message("Legacy answer", undefined))).toBe("Legacy answer");
    expect(messageClipboardText({ ...message("", []), thought: "Private reasoning" })).toBe("");
  });
  it("merges overlapping final answer ranges so final text is not repeated", () => {
    const content = "Implemented secure-notes-vault.\nVerification passed.\n";
    const parts = [
      part("a", "final_answer", 0, content.length, 1),
      part("b", "final_answer", 0, content.length, 2),
      part("c", "final_answer", 12, content.length, 3),
    ];

    expect(normalizeTextParts(parts, content.length)).toEqual([
      expect.objectContaining({ startOffset: 0, endOffset: content.length, phase: "final_answer" }),
    ]);
    expect(splitTextByPhaseForTest(message(content, parts), 0, content.length).map((item) => item.text)).toEqual([
      content,
    ]);
  });

  it("keeps adjacent commentary and final answer ranges distinct", () => {
    const content = "Working...\nDone.\n";
    const parts = [
      part("a", "commentary", 0, 11, 1),
      part("b", "final_answer", 11, content.length, 2),
    ];

    expect(splitTextByPhaseForTest(message(content, parts), 0, content.length)).toEqual([
      expect.objectContaining({ text: "Working...\n", phase: "commentary" }),
      expect.objectContaining({ text: "Done.\n", phase: "final_answer" }),
    ]);
  });

  it("recovers uncovered text instead of silently dropping it", () => {
    const content = "Visible prefix and final suffix";
    const suffixStart = content.indexOf("final");
    const parts = [part("suffix", "final_answer", suffixStart, content.length, 1)];

    expect(splitTextByPhaseForTest(message(content, parts), 0, content.length).map((item) => item.text).join(""))
      .toBe(content);
  });

  it("anchors a steer message at its exact assistant stream offset", () => {
    const assistant = message("BeforeAfter", [part("answer", "final_answer", 0, 11, 1)]);
    const steer: ChatMessageRecord = {
      ...message("Change direction", []),
      id: "steer-1",
      role: "user",
      steeredTurnId: assistant.id,
      steerTextOffset: 6,
      steerStreamOrder: 2,
      createdAt: 2,
      updatedAt: 2,
    };

    expect(buildAssistantRenderParts(assistant, [], true, [steer]).map((item) => item.type)).toEqual([
      "text",
      "steer",
      "text",
    ]);
  });

  it("keeps final answers and inline steering chronological when worked activity is collapsed", () => {
    const assistant = message("BeforeAfter", [part("answer", "final_answer", 0, 11, 1)]);
    const steer = steeringMessage(assistant, 6);
    const parts = buildAssistantRenderParts(assistant, [], false, [steer]);
    expect(visibleSteeredAssistantParts(parts, false).map((item) => item.type === "text" ? item.text : item.type)).toEqual(["Before", "steer", "After"]);
  });

  it("renders a completed steered answer as normal text and collapses only worked activity", () => {
    const assistant = message("Working...Done.", [part("progress", "commentary", 0, 10, 1), part("answer", "final_answer", 10, 15, 3)]);
    const steer = steeringMessage(assistant, 10);
    const html = renderToStaticMarkup(createElement(ChatMessage, {
      message: assistant, inlineSteers: [steer], tools: [], subagents: [], activeRunStatus: null,
      onApprove: () => {}, onApproveAll: () => {}, onOpenReview: () => {}, turnUndo: null,
      onPrepareTurnUndo: async () => null, onUndoTurnChanges: async () => null,
    }));
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Worked for");
    expect(html).toContain("inline-steer-message");
    expect(html).toContain("assistant-flow-text markdown-body");
    expect(html).toContain("Done.");
    expect(html).not.toContain("Working...");
    expect(html).not.toContain("assistant-activity-text");
    const parts = buildAssistantRenderParts(assistant, [], false, [steer]);
    expect(visibleSteeredAssistantParts(parts, true)).toEqual(parts);
  });

  it("keeps final text bright while the steered activity timeline is open", () => {
    const assistant = { ...message("Working...Done.", [part("progress", "commentary", 0, 10, 1), part("answer", "final_answer", 10, 15, 3)]), status: "running" as const };
    const html = renderToStaticMarkup(createElement(ChatMessage, {
      message: assistant, inlineSteers: [steeringMessage(assistant, 10)], tools: [], subagents: [], activeRunStatus: "running",
      onApprove: () => {}, onApproveAll: () => {}, onOpenReview: () => {}, turnUndo: null,
      onPrepareTurnUndo: async () => null, onUndoTurnChanges: async () => null,
    }));
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("assistant-activity-text is-streaming markdown-body");
    expect(html).toContain("assistant-flow-text markdown-body");
    expect(html.indexOf("Working...")).toBeLessThan(html.indexOf("inline-steer-message"));
    expect(html.indexOf("inline-steer-message")).toBeLessThan(html.indexOf("Done."));
  });

  it("does not describe plain thinking as continuing after tools", () => {
    const assistant = { ...message("", []), thought: "Considering the request", status: "running" as const };
    const html = renderToStaticMarkup(createElement(ChatMessage, {
      message: assistant, tools: [], subagents: [], activeRunStatus: "running",
      onApprove: () => {}, onApproveAll: () => {}, onOpenReview: () => {}, turnUndo: null,
      onPrepareTurnUndo: async () => null, onUndoTurnChanges: async () => null,
    }));
    expect(html).toContain("Working for");
    expect(html).not.toContain("Continuing after tools");
  });

  it("allows completed commentary to be reopened even without thoughts or tools", () => {
    const assistant = message("Checking...Done.", [part("progress", "commentary", 0, 11, 1), part("answer", "final_answer", 11, 16, 2)]);
    const html = renderToStaticMarkup(createElement(ChatMessage, {
      message: assistant, tools: [], subagents: [], activeRunStatus: null,
      onApprove: () => {}, onApproveAll: () => {}, onOpenReview: () => {}, turnUndo: null,
      onPrepareTurnUndo: async () => null, onUndoTurnChanges: async () => null,
    }));
    expect(html).toContain("assistant-run-toggle");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Done.");
  });
});

const steeringMessage = (assistant: ChatMessageRecord, offset: number): ChatMessageRecord => ({
  ...message("Change direction", []), id: "steer", role: "user", steeredTurnId: assistant.id,
  steerTextOffset: offset, steerStreamOrder: 2, createdAt: 2, updatedAt: 2,
});

const part = (
  id: string,
  phase: "commentary" | "final_answer",
  startOffset: number,
  endOffset: number,
  createdAt: number,
) => ({
  id,
  phase,
  startOffset,
  endOffset,
  streamOrder: createdAt,
  createdAt,
  updatedAt: createdAt,
});
