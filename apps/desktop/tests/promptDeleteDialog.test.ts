import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PromptDeleteDialog } from "../src/renderer/features/chat/PromptDeleteDialog";

describe("prompt deletion confirmation", () => {
  it("identifies the prompt and requires an explicit destructive action", () => {
    const html = renderToStaticMarkup(createElement(PromptDeleteDialog, { title: "Review <evidence>", busy: false, error: null, onCancel: () => {}, onConfirm: () => {} }));
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('aria-describedby="prompt-delete-description"');
    expect(html).toContain("Review &lt;evidence&gt;");
    expect(html).toContain(">Cancel</button>"); expect(html).toContain(">Delete prompt</button>");
  });
  it("prevents duplicate confirmation while deletion is pending and exposes failure details", () => {
    const html = renderToStaticMarkup(createElement(PromptDeleteDialog, { title: "Review", busy: true, error: "Could not delete <retry>", onCancel: () => {}, onConfirm: () => {} }));
    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).toContain("Deleting…"); expect(html).toContain('role="alert"'); expect(html).toContain("Could not delete &lt;retry&gt;");
  });
});
