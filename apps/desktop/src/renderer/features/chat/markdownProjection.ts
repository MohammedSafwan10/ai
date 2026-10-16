import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remend from "remend";

export interface MarkdownBlock {
  start: number;
  raw: string;
  markdown: string;
  code?: { text: string; language: string };
}
export interface MarkdownProjection { text: string; blocks: MarkdownBlock[]; global: boolean }
const parser = unified().use(remarkParse).use(remarkGfm);
type SyntaxNode = { type: string; children?: SyntaxNode[] };
const containsDefinitions = (nodes: SyntaxNode[]) => {
  const pending = [...nodes];
  while (pending.length) {
    const node = pending.pop()!;
    if (node.type === "definition" || node.type === "footnoteDefinition") return true;
    if (node.children) pending.push(...node.children);
  }
  return false;
};

/** Keep the last syntax block mutable: a new line can extend a list, table or fence. */
export function projectMarkdown(previous: MarkdownProjection | undefined, text: string, active: boolean): MarkdownProjection {
  // References and plan markers can affect earlier content. Preserve document-wide
  // semantics instead of rendering independently scoped fragments in these cases.
  const global = Boolean(previous?.global && text.startsWith(previous.text)) || text.includes("<proposed_plan>");
  if (global) return { text, global, blocks: [{ start: 0, raw: text, markdown: text }] };
  const reusable = previous && !previous.global && text.startsWith(previous.text);
  const stable = reusable ? previous.blocks.slice(0, -1) : [];
  const start = reusable ? previous.blocks.at(-1)?.start || 0 : 0;
  const source = text.slice(start);
  const nodes = parser.parse(source).children;
  // Definitions in lists and blockquotes also resolve links elsewhere in the
  // document. Inspect syntax nodes rather than only matching top-level lines.
  if (containsDefinitions(nodes)) return { text, global: true, blocks: [{ start: 0, raw: text, markdown: text }] };
  const blocks = nodes.map((node, index): MarkdownBlock => {
    const offset = node.position?.start.offset || 0;
    const end = nodes[index + 1]?.position?.start.offset ?? source.length;
    const raw = source.slice(offset, end);
    return {
      start: start + offset, raw,
      markdown: active && index === nodes.length - 1 ? remend(raw, { linkMode: "text-only", katex: false }) : raw,
      ...(node.type === "code" ? { code: { text: node.value, language: node.lang?.split(/\s+/)[0] || "text" } } : {}),
    };
  });
  return { text, global, blocks: [...stable, ...blocks] };
}
