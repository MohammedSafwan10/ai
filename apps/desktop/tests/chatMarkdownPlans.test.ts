import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatMessage } from "../src/renderer/components/ChatMessage";
import { splitProposedPlan } from "../src/renderer/features/chat/proposedPlan";

const render = (content: string) => renderToStaticMarkup(createElement(ChatMessage, {
  message: { id: "answer", threadId: "thread", role: "assistant", status: "completed", content, createdAt: 1, updatedAt: 2 },
  tools: [], subagents: [], activeRunStatus: null, onApprove: () => {}, onApproveAll: () => {}, onOpenReview: () => {},
  turnUndo: null, onPrepareTurnUndo: async () => null, onUndoTurnChanges: async () => null,
}));

describe("chat Markdown plan boundaries", () => {
  it("keeps a fenced example of plan tags inside its code block", () => {
    const html = render("Example:\n\n```xml\n<proposed_plan>\nLiteral sample\n</proposed_plan>\n```\n");
    expect(html).not.toContain("proposed-plan-card");
    expect(html).toContain("&lt;proposed_plan&gt;");
    expect(html).toContain("<pre><code");
  });

  it("keeps inline tag examples as ordinary text rather than actionable plans", () => {
    expect(render("Use `<proposed_plan>Example</proposed_plan>` as a marker.")).not.toContain("proposed-plan-card");
  });

  it("renders each complete plan and keeps text between them", () => {
    const html = render("Intro\n<proposed_plan>\nFirst plan\n</proposed_plan>\nBetween\n<proposed_plan>\nSecond plan\n</proposed_plan>\nEnd");
    expect(html.match(/proposed-plan-card/g)).toHaveLength(2);
    expect(html).toContain("Between");
    expect(html).toContain("End");
  });

  it("does not match plan tags inside tilde fences or multiline inline code", () => {
    for (const text of ["~~~xml\n<proposed_plan>\nSample\n</proposed_plan>\n~~~", "Inline `example\n<proposed_plan>\nSample\n</proposed_plan>\nend` text"]) {
      expect(splitProposedPlan(text)).toEqual([{ type: "text", text }]);
    }
  });

  it("does not let an escaped or unmatched literal backtick swallow a later plan", () => {
    for (const prefix of ["Literal unmatched ` marker", "Escaped \\` marker"]) {
      expect(splitProposedPlan(`${prefix}\n<proposed_plan>\nActual plan\n</proposed_plan>`)).toContainEqual({ type: "plan", text: "Actual plan" });
    }
  });

  it("preserves incomplete streamed plan blocks as text until the closing marker arrives", () => {
    const text = "Intro\n<proposed_plan>\nStill streaming";
    expect(splitProposedPlan(text)).toEqual([{ type: "text", text }]);
  });
});
