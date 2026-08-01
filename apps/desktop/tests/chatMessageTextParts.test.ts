import { describe, expect, it } from "vitest";
import { buildAssistantRenderParts, normalizeTextParts, normalizeThoughtMarkdown, splitTextByPhaseForTest } from "../src/renderer/components/ChatMessage";
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
  it("separates legacy reasoning summaries that arrived without a part boundary", () => {
    expect(normalizeThoughtMarkdown("**Planning****Designing**")).toBe("**Planning**\n\n**Designing**");
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
