import type { ArtifactKind } from "./db";

export const ARTIFACT_SYSTEM_INSTRUCTION = `
When the user asks you to create or substantially revise code, documents, JSON, YAML, SQL, SVG, Mermaid diagrams, prompts, static HTML, or comparison tables, prefer creating/updating an artifact instead of only writing the full content in chat.

Use the create_or_update_artifact tool with complete artifact content. Keep chat text minimal and let Canvas carry the work.

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
- Do not use artifacts for tiny snippets, short answers, casual chat, or normal explanation unless the user asks for a file/canvas/artifact.
`.trim();

export const artifactToolDefinition = {
  type: "function",
  name: "create_or_update_artifact",
  description: "Create or update a Privora Canvas artifact for substantial code, docs, tables, prompts, diagrams, or structured content.",
  parameters: {
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
  },
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
  if (["markdown", "code", "html", "svg", "mermaid", "json", "yaml", "sql", "text", "table", "prompt"].includes(raw)) {
    return raw as ArtifactKind;
  }
  return deriveArtifactKind(language, content);
};

export const deriveArtifactKind = (language?: string, content = ""): ArtifactKind => {
  const lang = (language || "").toLowerCase();
  const trimmed = content.trim();
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
  const content = typeof raw.content === "string" ? raw.content : "";
  if (!content.trim()) return null;
  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : "Untitled artifact";
  const language = typeof raw.language === "string" && raw.language.trim() ? raw.language.trim() : undefined;
  return {
    operation: raw.operation === "update" ? "update" : "create",
    targetArtifactId: typeof raw.targetArtifactId === "string" ? raw.targetArtifactId : undefined,
    kind: normalizeArtifactKind(raw.kind, language, content),
    title,
    language,
    content,
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

  const content = extractJsonStringValue(rawArguments, "content");
  if (!content || content.trim().length < 40) return null;

  const language = extractJsonStringValue(rawArguments, "language");
  const kind = normalizeArtifactKind(extractJsonStringValue(rawArguments, "kind"), language, content);
  const title = extractJsonStringValue(rawArguments, "title") || getTitleFromContent(content, kind);
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
    const kind = deriveArtifactKind(bestBlock.language, bestBlock.content);
    const title = getTitleFromContent(bestBlock.content, kind);
    return { kind, title, language: bestBlock.language, content: bestBlock.content };
  }

  const trimmed = message.trim();
  if (trimmed.length < 700) return null;

  const hasMarkdownShape = /^#{1,3}\s+/m.test(trimmed) || /^\s*\|.+\|\s*\n\s*\|[-:\s|]+\|/m.test(trimmed);
  if (!hasMarkdownShape) return null;

  const kind = deriveArtifactKind(undefined, trimmed);
  return {
    kind,
    title: getTitleFromContent(trimmed, kind),
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
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(content);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = content;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
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
