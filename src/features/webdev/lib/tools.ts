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
    description: "Patch an existing file. Prefer this over write_file for targeted edits. Supports either { search, replace } or a unified-diff style patch string.",
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
            diff: { type: "string" },
          },
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
    name: "webdev_set_build_plan",
    description: "Record the intended app architecture and design direction before a major fresh build or large restructure. Use this before writing files when deciding pages, component strategy, visual direction, and verification.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
        routingRequired: { type: "boolean" },
        routingStrategy: { type: "string", enum: ["browser-router", "hash-router", "state-screens", "none"] },
        componentStrategy: { type: "string", enum: ["shadcn-local", "custom-css", "minimal"] },
        designDirection: { type: "string" },
        primaryScreens: { type: "array", items: { type: "string" } },
        qualityChecklist: { type: "array", items: { type: "string" } },
        pages: { type: "array", items: { type: "string" } },
        keyFiles: { type: "array", items: { type: "string" } },
        verification: { type: "string" },
      },
      required: ["summary", "routingRequired", "routingStrategy", "componentStrategy", "designDirection", "primaryScreens", "qualityChecklist", "pages", "keyFiles", "verification"],
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
    name: "webdev_search_files",
    description: "Search current Web Dev project file contents. Use before editing when you need to find symbols, text, or likely files.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string" },
        includePattern: { type: "string" },
        caseSensitive: { type: "boolean" },
      },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "webdev_file_outline",
    description: "Get imports, exports, functions/components/types, CSS selectors, or JSON top-level keys for a file without reading all content.",
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
    name: "webdev_get_diagnostics",
    description: "Run project diagnostics/build checks in the WebContainer and return errors or warnings. Use after meaningful edits.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        paths: { type: "array", items: { type: "string" } },
      },
      required: [],
    },
  },
  {
    type: "function",
    name: "webdev_run_command",
    description: "Run one safe npm script from package.json in the WebContainer, such as build, lint, test, typecheck, or preview. No arbitrary shell.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        script: { type: "string" },
        args: { type: "array", items: { type: "string" } },
      },
      required: ["script"],
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
  const patch = extractJsonStringValue(rawArguments, "patch");
  const diff = extractJsonStringValue(rawArguments, "diff");
  const search = extractJsonStringValue(rawArguments, "search");
  const replace = extractJsonStringValue(rawArguments, "replace");
  const from = extractJsonStringValue(rawArguments, "from");
  const to = extractJsonStringValue(rawArguments, "to");
  const query = extractJsonStringValue(rawArguments, "query");
  const includePattern = extractJsonStringValue(rawArguments, "includePattern");
  const script = extractJsonStringValue(rawArguments, "script");

  if (name === "webdev_write_file") {
    if (!path || content === undefined) return null;
    return normalizeWebDevToolCall({ name, arguments: { path, content, summary } });
  }
  if (name === "webdev_patch_file") {
    if (!path) return null;
    const partialPatch = diff !== undefined
      ? { diff }
      : search !== undefined
        ? { search, replace: replace || "" }
        : patch;
    if (partialPatch === undefined) return normalizeWebDevToolCall({ name, arguments: { path, summary } });
    return normalizeWebDevToolCall({ name, arguments: { path, patch: partialPatch, summary } });
  }
  if (name === "webdev_delete_path" || name === "webdev_file_outline") {
    if (!path) return null;
    return normalizeWebDevToolCall({ name, arguments: { path, summary } });
  }
  if (name === "webdev_rename_path") {
    if (!from && !to) return null;
    return normalizeWebDevToolCall({ name, arguments: { from, to, summary } });
  }
  if (name === "webdev_search_files") {
    if (!query) return null;
    return normalizeWebDevToolCall({ name, arguments: { query, includePattern } });
  }
  if (name === "webdev_run_command") {
    if (!script) return null;
    return normalizeWebDevToolCall({ name, arguments: { script } });
  }
  if (name === "webdev_set_build_plan") {
    return normalizeWebDevToolCall({ name, arguments: parsed || {} });
  }
  if (name === "webdev_get_diagnostics") {
    return normalizeWebDevToolCall({ name, arguments: {} });
  }
  return null;
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
  if (call.name === "webdev_set_build_plan") {
    const cleanStringList = (value: unknown) =>
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string").map(item => item.trim()).filter(Boolean).slice(0, 20)
        : [];
    const pages = cleanStringList(args.pages);
    const primaryScreens = cleanStringList(args.primaryScreens);
    const keyFiles = cleanStringList(args.keyFiles).map(normalizeWebDevPath).filter(isSafeWebDevPath);
    const routingStrategy = ["browser-router", "hash-router", "state-screens", "none"].includes(String(args.routingStrategy))
      ? String(args.routingStrategy)
      : Boolean(args.routingRequired)
        ? "browser-router"
        : "none";
    const componentStrategy = ["shadcn-local", "custom-css", "minimal"].includes(String(args.componentStrategy))
      ? String(args.componentStrategy)
      : Boolean(args.routingRequired) || pages.length > 1 || primaryScreens.length > 1 || keyFiles.length > 6
        ? "shadcn-local"
        : "minimal";
    return {
      ...call,
      arguments: {
        summary: typeof args.summary === "string" ? args.summary.trim() : "Planned app architecture.",
        routingRequired: Boolean(args.routingRequired),
        routingStrategy,
        componentStrategy,
        designDirection: typeof args.designDirection === "string" ? args.designDirection.trim() : "",
        primaryScreens,
        qualityChecklist: cleanStringList(args.qualityChecklist),
        pages,
        keyFiles,
        verification: typeof args.verification === "string" ? args.verification.trim() : "Run diagnostics/build after implementation.",
      },
    };
  }
  if (call.name === "webdev_read_file") {
    const path = typeof args.path === "string" ? normalizeWebDevPath(args.path) : "";
    if (!isSafeWebDevPath(path)) return null;
    return { ...call, arguments: { path } };
  }
  if (call.name === "webdev_search_files") {
    return {
      ...call,
      arguments: {
        query: typeof args.query === "string" ? args.query : "",
        includePattern: typeof args.includePattern === "string" ? args.includePattern : undefined,
        caseSensitive: Boolean(args.caseSensitive),
      },
    };
  }
  if (call.name === "webdev_file_outline") {
    const path = typeof args.path === "string" ? normalizeWebDevPath(args.path) : "";
    if (!isSafeWebDevPath(path)) return null;
    return { ...call, arguments: { path } };
  }
  if (call.name === "webdev_get_diagnostics") {
    const paths = Array.isArray(args.paths)
      ? args.paths
          .filter((path): path is string => typeof path === "string")
          .map(normalizeWebDevPath)
          .filter(isSafeWebDevPath)
      : undefined;
    return { ...call, arguments: paths?.length ? { paths } : {} };
  }
  if (call.name === "webdev_run_command") {
    const safeArgs = Array.isArray(args.args)
      ? args.args.filter((value): value is string =>
          typeof value === "string" &&
          value.length <= 80 &&
          !/[;&|`$<>]/.test(value)
        )
      : [];
    return {
      ...call,
      arguments: {
        script: typeof args.script === "string" ? args.script.trim() : "",
        args: safeArgs,
      },
    };
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
  if (typeof patch === "string") return applyUnifiedTextPatch(content, patch);
  const diff = typeof (patch as any)?.diff === "string" ? (patch as any).diff : "";
  if (diff.trim()) return applyUnifiedTextPatch(content, diff);
  const search = typeof (patch as any)?.search === "string" ? (patch as any).search : "";
  const replace = typeof (patch as any)?.replace === "string" ? (patch as any).replace : "";
  if (!search) return null;
  if (!content.includes(search)) return null;
  return content.replace(search, replace);
};

const stripPatchEnvelope = (patch: string) =>
  patch
    .replace(/^\*\*\* Begin Patch\s*/m, "")
    .replace(/\*\*\* End Patch\s*$/m, "")
    .split(/\r?\n/)
    .filter(line => !line.startsWith("*** Update File:") && !line.startsWith("--- ") && !line.startsWith("+++ "));

const applyUnifiedTextPatch = (content: string, patch: string) => {
  const lines = stripPatchEnvelope(patch);
  const hunks: Array<{ search: string; replace: string }> = [];
  let search: string[] = [];
  let replace: string[] = [];
  let inHunk = false;

  const flush = () => {
    if (!inHunk) return;
    const searchText = search.join("\n");
    if (searchText) hunks.push({ search: searchText, replace: replace.join("\n") });
    search = [];
    replace = [];
    inHunk = false;
  };

  for (const line of lines) {
    if (line.startsWith("@@")) {
      flush();
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith("+")) {
      replace.push(line.slice(1));
      continue;
    }
    if (line.startsWith("-")) {
      search.push(line.slice(1));
      continue;
    }
    const value = line.startsWith(" ") ? line.slice(1) : line;
    search.push(value);
    replace.push(value);
  }
  flush();

  if (hunks.length === 0) return null;
  let next = content;
  for (const hunk of hunks) {
    if (!next.includes(hunk.search)) return null;
    next = next.replace(hunk.search, hunk.replace);
  }
  return next;
};
