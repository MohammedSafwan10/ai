import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { describe, expect, it, vi } from "vitest";
import { projectMarkdown, type MarkdownProjection } from "../src/renderer/features/chat/markdownProjection";
import { MarkdownWorkerClient, type MarkdownResponse } from "../src/renderer/features/chat/markdownWorkerClient";
import { diffClipboardText } from "../src/renderer/components/InlineDiff";

const render = (text: string) => renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm], children: text }));
const markdownOnly = (projection: MarkdownProjection) => projection.blocks.map((block) => render(block.raw)).join("");
const normalizeBlockWhitespace = (html: string) => html.replace(/>\n(?=<)/g, ">");

describe("incremental Markdown", () => {
  it("copies only the selected diff, including an explicit truncated-preview notice", () => {
    const text = diffClipboardText({ path: "src/example.ts", status: "modified", additions: 1, deletions: 1, truncated: true,
      hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [{ kind: "remove", text: "old" }, { kind: "add", text: "new" }] }] });
    expect(text).toBe("--- src/example.ts\n+++ src/example.ts\n@@ -1 +1 @@\n-old\n+new\n[Preview truncated; open Review for the full change.]");
  });
  it("keeps completed blocks unchanged while rendering an unfinished bold tail", () => {
    const first = projectMarkdown(undefined, "# Heading\n\nFirst paragraph.\n\n**Now", true);
    const next = projectMarkdown(first, `${first.text} streaming**`, true);
    expect(next.blocks[0]).toBe(first.blocks[0]);
    expect(next.blocks[1]).toBe(first.blocks[1]);
    expect(render(first.blocks.at(-1)!.markdown)).toContain("<strong>Now</strong>");
    expect(render(next.blocks.at(-1)!.markdown)).toContain("<strong>Now streaming</strong>");
  });
  it.each([
    "# Heading\n\nParagraph with **bold** and `code`.\n\nMore text.",
    "- one\n\n- two\n  - nested\n\nAnother paragraph.",
    "| Name | Status |\n| --- | --- |\n| One | Ready |\n| Two | Done |\n\nAfter.",
    "Setext title\n============\n\nAnother paragraph.",
    "> Blockquote\n>\n> another paragraph\n\nAfter.",
    "Paragraph\n\n    indented code\n    another line\n\nAfter.",
    "Line one\nline two\n\n---\n\nAfter.",
    "```ts\nconst value = 1;\n\nconsole.log(value);\n```\n\nAfter.",
    "~~~js\nconst value = '```';\n~~~\n\nAfter.",
    "[Reference][id]\n\n[id]: https://example.com\n",
    "Footnote[^1].\n\n[^1]: Note text.\n",
    "[foo][id]\n\n> [id]: https://example.com\n",
    "[foo][id]\n\n- [id]: https://example.com\n",
    "[foo][a\\]b]\n\n> [a\\]b]: https://example.com\n",
  ])("matches whole-document rendering after arbitrary character splits: %s", (text) => {
    let projection: MarkdownProjection | undefined;
    for (let index = 1; index <= text.length; index++) projection = projectMarkdown(projection, text.slice(0, index), true);
    projection = projectMarkdown(projection, text, false);
    expect(normalizeBlockWhitespace(markdownOnly(projection))).toBe(normalizeBlockWhitespace(render(text)));
  });
  it("keeps an open fence as one code block and replaces a corrected response", () => {
    const first = projectMarkdown(undefined, "Before\n\n```ts\nconst a = 1;\n", true);
    const next = projectMarkdown(first, `${first.text}const b = 2;`, true);
    expect(next.blocks[0]).toBe(first.blocks[0]);
    expect(next.blocks[1].code).toEqual({ language: "ts", text: "const a = 1;\nconst b = 2;" });
    const corrected = projectMarkdown(next, "Replacement **answer**", false);
    expect(corrected.blocks).toHaveLength(1);
    expect(corrected.blocks[0].markdown).toBe("Replacement **answer**");
  });
  it("uses document scope for references and plan markers and leaves stored text untouched", () => {
    for (const text of ["[label][id]\n\n[id]: https://example.com", "<proposed_plan>\nSteps\n</proposed_plan>"]) {
      const projection = projectMarkdown(undefined, text, true);
      expect(projection.global).toBe(true);
      expect(projection.blocks[0].markdown).toBe(text);
    }
    const input = "Read [the docs](https://exam";
    const partial = projectMarkdown(undefined, input, true);
    expect(partial.text).toBe(input);
    expect(partial.blocks[0].raw).toBe(input);
    expect(render(partial.blocks[0].markdown)).not.toContain("href=");
    expect(projectMarkdown(partial, input, false).blocks[0].markdown).toBe(input);
  });
  it("renders executable HTML and incomplete URLs inert", () => {
    const text = '<script>alert(1)</script>\n\n[click](javascript:alert(1))';
    expect(markdownOnly(projectMarkdown(undefined, text, false))).not.toContain("<script>");
    expect(markdownOnly(projectMarkdown(undefined, text, false))).not.toContain('href="javascript:');
  });
});

describe("Markdown worker lifecycle", () => {
  const fixture = () => {
    const worker = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null as ((event: MessageEvent<MarkdownResponse>) => void) | null, onerror: null as ((event: ErrorEvent) => void) | null };
    const client = new MarkdownWorkerClient(worker);
    const result = (key: string, generation: number) => worker.onmessage!(new MessageEvent("message", { data: { key, generation, blocks: [] } }));
    return { worker, client, result };
  };
  it("coalesces rapid updates, rejects stale results and fairly processes different messages", () => {
    const { worker, client, result } = fixture();
    const receive = vi.fn();
    client.update("first", "a", true, receive);
    for (let index = 0; index < 100; index++) client.update("first", `a${index}`, true, receive);
    client.update("second", "b", true, receive);
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    result("first", 1);
    expect(receive).not.toHaveBeenCalled();
    expect(worker.postMessage.mock.calls[1][0]).toMatchObject({ text: "a99", generation: 101 });
    result("first", 101);
    expect(worker.postMessage.mock.calls[2][0]).toMatchObject({ key: "second" });
    result("second", 1);
    expect(receive).toHaveBeenCalledTimes(2);
  });
  it("discards queued updates and callbacks when a message unmounts", () => {
    const { client, worker, result } = fixture();
    const receive = vi.fn();
    client.update("first", "a", true, receive);
    client.update("first", "newer", false, receive);
    client.dispose("first");
    result("first", 1);
    expect(receive).not.toHaveBeenCalled();
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
    expect(worker.postMessage.mock.calls[1][0]).toEqual({ type: "dispose", key: "first" });
  });
  it("falls back without retaining pending work when a worker fails", () => {
    const { client, worker } = fixture();
    const receive = vi.fn();
    client.update("first", "a", true, receive);
    worker.onerror!({} as ErrorEvent);
    expect(receive).toHaveBeenCalledWith(null);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    client.update("second", "b", true, receive);
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    expect(receive).toHaveBeenCalledTimes(2);
  });
  it("falls back when posting to a worker throws", () => {
    const { client, worker } = fixture();
    worker.postMessage.mockImplementation(() => { throw new Error("worker unavailable"); });
    const receive = vi.fn();
    client.update("first", "a", true, receive);
    expect(receive).toHaveBeenCalledWith(null);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});
