import { isSafeWebDevPath, normalizeWebDevPath } from "./files";
import type { WebDevToolCall, WebDevToolDraft } from "./types";

const fileObjectSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    path: { type: "string" },
    content: { type: "string" },
  },
  required: ["path", "content"],
} as const;

export const webDevToolDefinitions = [
  {
    type: "function",
    name: "webdev_write_file",
    description: "Create or fully replace one file in the current Web Dev project. Prefer this for normal app builds because the UI can stream this file live into the editor.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        path: { type: "string" },
        content: { type: "string" },
        summary: { type: "string" },
      },
      required: ["path", "content", "summary"],
    },
  },
  {
    type: "function",
    name: "webdev_patch_file",
    description: "Patch a file with an exact search/replace edit. Use write_file if exact source text is uncertain.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        path: { type: "string" },
        patch: {
          type: "object",
          additionalProperties: false,
          properties: {
            search: { type: "string" },
            replace: { type: "string" },
          },
          required: ["search", "replace"],
        },
        summary: { type: "string" },
      },
      required: ["path", "patch", "summary"],
    },
  },
  {
    type: "function",
    name: "webdev_delete_path",
    description: "Delete a file or folder from the Web Dev project.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        path: { type: "string" },
        summary: { type: "string" },
      },
      required: ["path", "summary"],
    },
  },
  {
    type: "function",
    name: "webdev_rename_path",
    description: "Rename or move a file or folder in the Web Dev project.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        from: { type: "string" },
        to: { type: "string" },
        summary: { type: "string" },
      },
      required: ["from", "to", "summary"],
    },
  },
  {
    type: "function",
    name: "webdev_create_project",
    description: "Bulk replace the whole project with a title and complete file list. Use only when the user explicitly asks to reset/replace the entire project at once; otherwise use webdev_write_file per file for live editor streaming.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string" },
        files: { type: "array", items: fileObjectSchema },
      },
      required: ["title", "files"],
    },
  },
  {
    type: "function",
    name: "webdev_list_files",
    description: "List current project files with path, status, line count, and size. Use before editing when project state is uncertain.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
      required: [],
    },
  },
  {
    type: "function",
    name: "webdev_read_file",
    description: "Read one current project file by path before targeted edits when current context is insufficient.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        path: { type: "string" },
      },
      required: ["path"],
    },
  },
  {
    type: "function",
    name: "webdev_finish",
    description: "Finish the Web Dev turn with a concise summary of what changed.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
      },
      required: ["summary"],
    },
  },
] as const;

export const geminiWebDevFunctionDeclarations = webDevToolDefinitions.map(tool => ({
  name: tool.name,
  description: tool.description,
  parametersJsonSchema: tool.parameters,
}));

export const openRouterWebDevTools = webDevToolDefinitions.map(tool => ({
  type: "function",
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  },
}));

const parseJsonObject = (value: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
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

export const parseWebDevToolCall = (name: string | undefined, rawArguments: string, id?: string): WebDevToolCall | null => {
  if (!name?.startsWith("webdev_")) return null;
  const parsed = parseJsonObject(rawArguments);
  if (!parsed) return null;
  return normalizeWebDevToolCall({ id, name, arguments: parsed });
};

export const parsePartialWebDevToolCall = (name: string | undefined, rawArguments: string): WebDevToolDraft | null => {
  if (!name?.startsWith("webdev_")) return null;
  const parsed = parseJsonObject(rawArguments);
  if (parsed) return normalizeWebDevToolCall({ name, arguments: parsed });

  const path = extractJsonStringValue(rawArguments, "path");
  const content = extractJsonStringValue(rawArguments, "content");
  const summary = extractJsonStringValue(rawArguments, "summary");
  if (!path || content === undefined) return null;
  return normalizeWebDevToolCall({ name, arguments: { path, content, summary } });
};

export const normalizeWebDevToolCall = (call: WebDevToolCall): WebDevToolCall | null => {
  const args = call.arguments || {};
  if (call.name === "webdev_write_file" || call.name === "webdev_patch_file" || call.name === "webdev_delete_path") {
    const path = typeof args.path === "string" ? normalizeWebDevPath(args.path) : "";
    if (!isSafeWebDevPath(path)) return null;
    return { ...call, arguments: { ...args, path } };
  }
  if (call.name === "webdev_rename_path") {
    const from = typeof args.from === "string" ? normalizeWebDevPath(args.from) : "";
    const to = typeof args.to === "string" ? normalizeWebDevPath(args.to) : "";
    if (!isSafeWebDevPath(from) || !isSafeWebDevPath(to)) return null;
    return { ...call, arguments: { ...args, from, to } };
  }
  if (call.name === "webdev_create_project") {
    const files = Array.isArray(args.files)
      ? args.files
          .map((file: any) => ({
            path: typeof file?.path === "string" ? normalizeWebDevPath(file.path) : "",
            content: typeof file?.content === "string" ? file.content : "",
          }))
          .filter(file => isSafeWebDevPath(file.path))
      : [];
    return {
      ...call,
      name: call.name,
      arguments: {
        title: typeof args.title === "string" && args.title.trim() ? args.title.trim() : "Web app",
        files,
      },
    };
  }
  if (call.name === "webdev_list_files") {
    return { ...call, arguments: {} };
  }
  if (call.name === "webdev_read_file") {
    const path = typeof args.path === "string" ? normalizeWebDevPath(args.path) : "";
    if (!isSafeWebDevPath(path)) return null;
    return { ...call, arguments: { path } };
  }
  if (call.name === "webdev_finish") {
    return {
      ...call,
      name: call.name,
      arguments: {
        summary: typeof args.summary === "string" ? args.summary : "Done.",
      },
    };
  }
  return null;
};

export const applySearchReplacePatch = (content: string, patch: unknown) => {
  const search = typeof (patch as any)?.search === "string" ? (patch as any).search : "";
  const replace = typeof (patch as any)?.replace === "string" ? (patch as any).replace : "";
  if (!search) return null;
  if (!content.includes(search)) return null;
  return content.replace(search, replace);
};
