import fs from "node:fs/promises";
import path from "node:path";
import type { DesktopStore } from "../db/store";
import type { ContextMentionRecord, ContextMentionSuggestion } from "../../shared/types";
import { resolveExistingWorkspacePath, resolveWorkspacePath } from "../security/pathSandbox";
import { compactTextForModel } from "../terminal/outputBuffer";
import { searchWorkspaceIndex } from "./workspaceIndex";

const IGNORED_DIRS = new Set([".git", "node_modules", "dist", "build", "out", ".vite", ".next", ".turbo"]);
const MAX_SUGGESTIONS = 18;
const MAX_FILE_CONTEXT_CHARS = 50_000;
const MAX_FOLDER_TREE_LINES = 120;
const MAX_TERMINAL_CONTEXT_CHARS = 20_000;

type MentionKind = "file" | "folder" | "terminal";

const categories: ContextMentionSuggestion[] = [
  { id: "category:file", type: "category", label: "Files", sublabel: "Attach a file as context", path: "file:" },
  { id: "category:folder", type: "category", label: "Folders", sublabel: "Attach a small folder tree", path: "folder:" },
  { id: "category:terminal", type: "category", label: "Terminal", sublabel: "Attach recent command output", path: "terminal:" },
];

export const searchContextMentions = async (
  store: DesktopStore,
  threadId: string,
  query: string,
): Promise<ContextMentionSuggestion[]> => {
  const thread = store.getThread(threadId);
  const workspace = store.getWorkspace(thread?.workspaceId);
  const normalized = query.replace(/^@/, "").trim().toLowerCase();
  const parsed = parseMentionQuery(normalized);

  if (!parsed.kind) {
    return categories.filter((item) => item.label.toLowerCase().includes(parsed.search) || item.path?.includes(parsed.search));
  }

  if (parsed.kind === "terminal") {
    return store
      .listToolEvents(threadId)
      .filter((tool) =>
        ["desktop_spawn_process", "desktop_write_process", "desktop_resize_process", "desktop_kill_process", "desktop_run_diagnostics"].includes(tool.name) &&
        (tool.output || tool.result?.output)
      )
      .slice(-10)
      .reverse()
      .filter((tool) => {
        const command = String(tool.args.command || "");
        return !parsed.search || command.toLowerCase().includes(parsed.search);
      })
      .slice(0, MAX_SUGGESTIONS)
      .map((tool) => ({
        id: tool.callId,
        type: "terminal" as const,
        label: shortLabel(String(tool.args.command || "Terminal output"), 54),
        sublabel: tool.status === "done" ? "Completed command output" : tool.status.replace(/_/g, " "),
      }));
  }

  if (!workspace) return [];
  const kind = parsed.kind;
  if (!kind) return [];
  const root = resolveWorkspacePath(workspace.path, ".");
  const entries = await searchWorkspaceIndex(root.absolutePath, parsed.search, kind, MAX_SUGGESTIONS);
  return entries.slice(0, MAX_SUGGESTIONS).map((entry) => ({
    id: `${kind}:${entry.path}`,
    type: kind,
    label: path.basename(entry.path) || entry.path,
    sublabel: entry.path,
    path: entry.path,
  }));
};

export const buildMentionContext = async (
  store: DesktopStore,
  threadId: string,
  workspaceRoot: string,
  mentions: ContextMentionRecord[] = [],
) => {
  if (mentions.length === 0) return "";
  const blocks: string[] = [];
  for (const mention of mentions.slice(0, 12)) {
    if (mention.type === "file" && mention.path) {
      const target = resolveExistingWorkspacePath(workspaceRoot, mention.path);
      const content = await readFileContext(target.absolutePath);
      blocks.push([
        `<attached_file path="${target.relativePath}">`,
        content,
        "</attached_file>",
      ].join("\n"));
      continue;
    }
    if (mention.type === "folder" && mention.path) {
      const target = resolveExistingWorkspacePath(workspaceRoot, mention.path);
      const tree = await folderTreeContext(target.absolutePath, target.relativePath);
      blocks.push([
        `<attached_folder path="${target.relativePath}">`,
        tree,
        "</attached_folder>",
      ].join("\n"));
      continue;
    }
    if (mention.type === "terminal") {
      const tool = store.listToolEvents(threadId).find((event) => event.callId === mention.id || event.id === mention.id);
      const command = String(tool?.args.command || mention.label || "Terminal output");
      const output = compactTextForModel(tool?.output || tool?.result?.output || "", MAX_TERMINAL_CONTEXT_CHARS);
      blocks.push([
        `<attached_terminal command="${escapeAttr(command)}">`,
        output || "(no captured output)",
        "</attached_terminal>",
      ].join("\n"));
    }
  }
  return blocks.length ? `Attached context from the user:\n${blocks.join("\n\n")}` : "";
};

const parseMentionQuery = (query: string): { kind: MentionKind | null; search: string } => {
  const match = query.match(/^(file|folder|terminal):?(.*)$/);
  if (!match) return { kind: null, search: query };
  return { kind: match[1] as MentionKind, search: match[2]?.trim() || "" };
};

const readFileContext = async (filePath: string) => {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) return "(not a file)";
  const content = await fs.readFile(filePath, "utf8");
  return compactTextForModel(content, MAX_FILE_CONTEXT_CHARS);
};

const folderTreeContext = async (folderPath: string, rootLabel: string) => {
  const lines: string[] = [rootLabel || "."];
  const walk = async (dir: string, prefix: string, depth: number) => {
    if (lines.length >= MAX_FOLDER_TREE_LINES || depth > 4) return;
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (lines.length >= MAX_FOLDER_TREE_LINES) return;
      if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;
      lines.push(`${prefix}${entry.isDirectory() ? "dir " : "file "}${entry.name}`);
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), `${prefix}  `, depth + 1);
    }
  };
  await walk(folderPath, "", 0);
  if (lines.length >= MAX_FOLDER_TREE_LINES) lines.push("... folder tree truncated ...");
  return lines.join("\n");
};

const shortLabel = (value: string, max: number) =>
  value.length <= max ? value : `${value.slice(0, max - 1)}…`;

const escapeAttr = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").slice(0, 500);
