import { copyTextToClipboard } from "./clipboard";
import type { ArtifactKind, ArtifactRecord } from "./db";

export const ARTIFACT_SYSTEM_INSTRUCTION = `
When the user asks you to create or substantially revise code, documents, JSON, YAML, SQL, SVG, Mermaid diagrams, prompts, static HTML, or comparison tables, prefer creating/updating an artifact instead of only writing the full content in chat.

Use the create_or_update_artifact tool with complete artifact content when that tool is available. Keep chat text minimal and let Canvas carry the work.

Artifact conversation flow:
- Do not write a preamble before creating or updating an artifact.
- While the artifact is being created, do not paste the full artifact content into chat; let the Canvas carry the work.
- After creating or updating the artifact, the app will ask for a separate short final response. Do not include verbose implementation notes in the artifact turn.
- If the user explicitly says they do not want an artifact/canvas/file, or they only want a normal answer, do not call the artifact tool.
- If the user is reacting casually to an artifact ("ok", "nice", "done", "don't need artifact", "explain this"), answer normally unless they clearly ask to create or revise the artifact.

Artifact rules:
- Use "create" for a new standalone artifact.
- Use "update" when the user asks to revise, extend, fix, rewrite, or transform the most relevant existing artifact.
- Pick a concise title and the closest kind.
- For code, include the language.
- For Markdown documents, use kind "markdown".
- For comparison tables, use kind "table" unless the table is part of a larger document.
- Put metadata only in tool fields. Never wrap the content in custom tags like <artifact>, <canvas>, or XML metadata.
- For SVG artifacts, content must be the raw <svg>...</svg> only. Do not include Markdown fences or artifact wrapper tags.
- For HTML artifacts, content must be the raw HTML document or fragment only. Do not include Markdown fences or artifact wrapper tags.
- Never simulate tool calls in chat text. If the artifact tool is unavailable, answer normally with concise fenced content.
- Do not use artifacts for tiny snippets, short answers, casual chat, or normal explanation unless the user asks for a file/canvas/artifact.
`.trim();

export const artifactToolParameters = {
  type: "object",
  additionalProperties: false,
  properties: {
    operation: {
      type: "string",
      enum: ["create", "update"],
    },
    targetArtifactId: {
      type: "string",
      description: "Existing artifact id when updating one.",
    },
    kind: {
      type: "string",
      enum: ["markdown", "code", "html", "svg", "mermaid", "json", "yaml", "sql", "text", "table", "prompt"],
    },
    title: {
      type: "string",
    },
    language: {
      type: "string",
      description: "Programming or markup language when relevant.",
    },
    content: {
      type: "string",
      description: "Full artifact content.",
    },
  },
  required: ["operation", "kind", "title", "content"],
} as const;

export const artifactToolDefinition = {
  type: "function",
  name: "create_or_update_artifact",
  description: "Create or update a Privora Canvas artifact for substantial code, docs, tables, prompts, diagrams, or structured content.",
  parameters: artifactToolParameters,
} as const;

export const geminiArtifactFunctionDeclaration = {
  name: artifactToolDefinition.name,
  description: artifactToolDefinition.description,
  parametersJsonSchema: artifactToolParameters,
} as const;

export interface ArtifactPayload {
  operation: "create" | "update";
  targetArtifactId?: string;
  kind: ArtifactKind;
  title: string;
  language?: string;
  content: string;
}

export interface ArtifactDraftPayload {
  operation?: "create" | "update";
  targetArtifactId?: string;
  kind: ArtifactKind;
  title: string;
  language?: string;
  content: string;
}

const artifactKinds = ["markdown", "code", "html", "svg", "mermaid", "json", "yaml", "sql", "text", "table", "prompt"] as const;

const getAttributeValue = (attributes: string, name: string) => {
  const match = attributes.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match?.[1] || match?.[2] || match?.[3];
};

const stripMarkdownFence = (content: string) => {
  const trimmed = content.trim();
  const match = trimmed.match(/^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n?```\s*$/);
  return match ? match[1].trim() : trimmed;
};

const extractElement = (content: string, tagName: "svg" | "html") => {
  const start = content.search(new RegExp(`<${tagName}\\b`, "i"));
  if (start < 0) return undefined;
  const afterStart = content.slice(start);
  const endMatch = afterStart.match(new RegExp(`</${tagName}>`, "i"));
  if (!endMatch || endMatch.index === undefined) return afterStart.trim();
  return afterStart.slice(0, endMatch.index + endMatch[0].length).trim();
};

const normalizeArtifactContentShape = (content: string, kindHint?: unknown, titleHint?: string) => {
  let normalized = stripMarkdownFence(content);
  let title = titleHint;
  let kind = typeof kindHint === "string" ? kindHint : undefined;
  let language: string | undefined;

  const wrapperMatch = normalized.match(/^<artifact\b([^>]*)>([\s\S]*?)(?:<\/artifact>\s*)?$/i);
  if (wrapperMatch) {
    const attributes = wrapperMatch[1] || "";
    title ||= getAttributeValue(attributes, "title");
    kind = getAttributeValue(attributes, "kind") || kind;
    language = getAttributeValue(attributes, "language") || language;
    normalized = wrapperMatch[2].trim();
  }

  const normalizedKind = kind?.toLowerCase();
  const startsWithSvg = /^\s*<svg\b/i.test(normalized);
  const startsWithHtml = /^\s*(?:<!doctype\s+html\b|<html\b)/i.test(normalized);
  const explicitSvgKind = normalizedKind === "svg" || normalizedKind === "xml";
  const explicitHtmlKind = normalizedKind === "html";

  if ((explicitHtmlKind || startsWithHtml) && !startsWithSvg) {
    const html = extractElement(normalized, "html");
    if (html) {
      return { content: html, kind: "html", title, language: language || "html" };
    }
  }

  const svg = (explicitSvgKind || startsWithSvg) ? extractElement(normalized, "svg") : undefined;
  if (svg) {
    return { content: svg, kind: "svg", title, language: language || "svg" };
  }

  const html = (explicitHtmlKind || startsWithHtml) ? extractElement(normalized, "html") : undefined;
  if (html) {
    return { content: html, kind: "html", title, language: language || "html" };
  }

  return { content: normalized, kind, title, language };
};

const codeLanguages = new Set([
  "js",
  "javascript",
  "jsx",
  "ts",
  "typescript",
  "tsx",
  "css",
  "scss",
  "html",
  "py",
  "python",
  "go",
  "rs",
  "rust",
  "java",
  "c",
  "cpp",
  "cs",
  "php",
  "rb",
  "ruby",
  "swift",
  "kt",
  "kotlin",
  "sh",
  "bash",
  "ps1",
  "powershell",
]);

export const getArtifactExtension = (kind: ArtifactKind, language?: string) => {
  const lang = (language || "").toLowerCase();
  if (kind === "markdown" || kind === "table" || kind === "prompt") return "md";
  if (kind === "html") return "html";
  if (kind === "svg") return "svg";
  if (kind === "mermaid") return "mmd";
  if (kind === "json") return "json";
  if (kind === "yaml") return "yml";
  if (kind === "sql") return "sql";
  if (lang === "typescript" || lang === "ts") return "ts";
  if (lang === "tsx") return "tsx";
  if (lang === "javascript" || lang === "js") return "js";
  if (lang === "jsx") return "jsx";
  if (lang === "python" || lang === "py") return "py";
  if (lang === "css") return "css";
  if (lang === "bash" || lang === "sh") return "sh";
  return "txt";
};

export const sanitizeArtifactFilename = (title: string, kind: ArtifactKind, language?: string) => {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "privora-artifact";
  return `${base}.${getArtifactExtension(kind, language)}`;
};

export const normalizeArtifactKind = (value: unknown, language?: string, content = ""): ArtifactKind => {
  const raw = typeof value === "string" ? value.toLowerCase() : "";
  if (artifactKinds.includes(raw as ArtifactKind)) {
    return raw as ArtifactKind;
  }
  return deriveArtifactKind(language, content);
};

export const deriveArtifactKind = (language?: string, content = ""): ArtifactKind => {
  const lang = (language || "").toLowerCase();
  const shaped = normalizeArtifactContentShape(content, lang);
  const trimmed = shaped.content.trim();
  if (shaped.kind && artifactKinds.includes(shaped.kind.toLowerCase() as ArtifactKind)) {
    return shaped.kind.toLowerCase() as ArtifactKind;
  }
  if (lang === "mermaid") return "mermaid";
  if (lang === "svg" || trimmed.startsWith("<svg")) return "svg";
  if (lang === "html" || /<!doctype html|<html[\s>]/i.test(trimmed)) return "html";
  if (lang === "json") return "json";
  if (lang === "yaml" || lang === "yml") return "yaml";
  if (lang === "sql") return "sql";
  if (codeLanguages.has(lang)) return "code";
  if (/^\s*\|.+\|\s*\n\s*\|[-:\s|]+\|/m.test(trimmed)) return "table";
  if (/^#{1,3}\s+/m.test(trimmed)) return "markdown";
  return "text";
};

export const normalizeArtifactPayload = (input: unknown): ArtifactPayload | null => {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const rawContent = typeof raw.content === "string" ? raw.content : "";
  if (!rawContent.trim()) return null;
  const rawTitle = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : undefined;
  const rawLanguage = typeof raw.language === "string" && raw.language.trim() ? raw.language.trim() : undefined;
  const shaped = normalizeArtifactContentShape(rawContent, raw.kind, rawTitle);
  const content = shaped.content;
  if (!content.trim()) return null;
  const language = shaped.language || rawLanguage;
  const kind = normalizeArtifactKind(shaped.kind ?? raw.kind, language, content);
  const title = shaped.title || rawTitle || getTitleFromContent(content, kind) || "Untitled artifact";
  return {
    operation: raw.operation === "update" ? "update" : "create",
    targetArtifactId: typeof raw.targetArtifactId === "string" ? raw.targetArtifactId : undefined,
    kind,
    title,
    language,
    content,
  };
};

export const normalizeArtifactRecord = (artifact: ArtifactRecord): ArtifactRecord => {
  const shaped = normalizeArtifactContentShape(artifact.content, artifact.kind, artifact.title);
  const language = shaped.language || artifact.language;
  const kind = normalizeArtifactKind(shaped.kind ?? artifact.kind, language, shaped.content);
  return {
    ...artifact,
    title: shaped.title || artifact.title,
    kind,
    language,
    content: shaped.content,
  };
};

export const parseArtifactToolArguments = (rawArguments: string) => {
  try {
    return normalizeArtifactPayload(JSON.parse(rawArguments));
  } catch {
    return null;
  }
};

const extractJsonStringValue = (source: string, key: string) => {
  const keyIndex = source.indexOf(`"${key}"`);
  if (keyIndex < 0) return undefined;
  const colonIndex = source.indexOf(":", keyIndex);
  if (colonIndex < 0) return undefined;
  const quoteIndex = source.indexOf('"', colonIndex + 1);
  if (quoteIndex < 0) return undefined;

  let output = "";
  let escaped = false;
  for (let index = quoteIndex + 1; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) {
      if (char === "n") output += "\n";
      else if (char === "r") output += "\r";
      else if (char === "t") output += "\t";
      else if (char === "b") output += "\b";
      else if (char === "f") output += "\f";
      else if (char === "u" && /^[0-9a-fA-F]{4}/.test(source.slice(index + 1, index + 5))) {
        output += String.fromCharCode(parseInt(source.slice(index + 1, index + 5), 16));
        index += 4;
      } else {
        output += char;
      }
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') break;
    output += char;
  }

  return output;
};

export const parsePartialArtifactToolArguments = (rawArguments: string): ArtifactDraftPayload | null => {
  const parsed = parseArtifactToolArguments(rawArguments);
  if (parsed) return parsed;

  const rawContent = extractJsonStringValue(rawArguments, "content");
  if (!rawContent || rawContent.trim().length < 40) return null;

  const rawLanguage = extractJsonStringValue(rawArguments, "language");
  const shaped = normalizeArtifactContentShape(rawContent, extractJsonStringValue(rawArguments, "kind"), extractJsonStringValue(rawArguments, "title"));
  const content = shaped.content;
  const language = shaped.language || rawLanguage;
  const kind = normalizeArtifactKind(shaped.kind, language, content);
  const title = shaped.title || getTitleFromContent(content, kind);
  const operation = extractJsonStringValue(rawArguments, "operation") === "update" ? "update" : "create";
  const targetArtifactId = extractJsonStringValue(rawArguments, "targetArtifactId");

  return {
    operation,
    targetArtifactId,
    kind,
    title,
    language,
    content,
  };
};

export const detectArtifactFromMessage = (message: string): Omit<ArtifactPayload, "operation" | "targetArtifactId"> | null => {
  const fenced = [...message.matchAll(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g)];
  const bestBlock = fenced
    .map(match => ({ language: match[1] || undefined, content: match[2]?.trim() || "" }))
    .filter(block => block.content.length >= 120)
    .sort((a, b) => b.content.length - a.content.length)[0];

  if (bestBlock) {
    const shaped = normalizeArtifactContentShape(bestBlock.content, bestBlock.language);
    const kind = deriveArtifactKind(shaped.language || bestBlock.language, shaped.content);
    const title = shaped.title || getTitleFromContent(shaped.content, kind);
    return { kind, title, language: shaped.language || bestBlock.language, content: shaped.content };
  }

  const shaped = normalizeArtifactContentShape(message);
  const trimmed = shaped.content.trim();
  if (trimmed.length < 700) return null;

  const hasRenderableShape = /^#{1,3}\s+/m.test(trimmed) ||
    /^\s*\|.+\|\s*\n\s*\|[-:\s|]+\|/m.test(trimmed) ||
    trimmed.startsWith("<svg") ||
    /<!doctype html|<html[\s>]/i.test(trimmed);
  if (!hasRenderableShape) return null;

  const kind = deriveArtifactKind(shaped.language, trimmed);
  return {
    kind,
    title: shaped.title || getTitleFromContent(trimmed, kind),
    language: shaped.language,
    content: trimmed,
  };
};

export const getTitleFromContent = (content: string, kind: ArtifactKind) => {
  const heading = content.match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading.slice(0, 90);

  if (kind === "html") {
    const title = content.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]?.trim();
    if (title) return title.slice(0, 90);
  }

  if (kind === "table") return "Comparison table";
  if (kind === "mermaid") return "Mermaid diagram";
  if (kind === "svg") return "SVG graphic";
  if (kind === "json") return "JSON document";
  return "Generated artifact";
};

export const copyArtifactContent = async (content: string) => {
  await copyTextToClipboard(content);
};

export const downloadArtifactContent = (title: string, kind: ArtifactKind, content: string, language?: string) => {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = sanitizeArtifactFilename(title, kind, language);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};
