import { z } from "zod";
import type { DesktopToolCall, DesktopToolName } from "../../../shared/types";

const textProperty = (description: string) => ({ type: "string", description });
const boolProperty = (description: string) => ({ type: "boolean", description });
const numberProperty = (description: string) => ({ type: "number", description });
const stringArrayProperty = (description: string) => ({ type: "array", items: { type: "string" }, description });
const stringMapProperty = (description: string) => ({ type: "object", additionalProperties: { type: "string" }, description });
const editOperationsProperty = (description: string) => ({
  type: "array",
  description,
  items: {
    type: "object",
    additionalProperties: true,
    properties: {
      type: textProperty("Operation type: replace_range, delete_range, replace_text, insert_text, or append."),
      startLine: numberProperty("1-based start line for range operations."),
      endLine: numberProperty("1-based end line for range operations."),
      match: textProperty("Exact text to find for text operations."),
      replacement: textProperty("Replacement text for replace_text."),
      content: textProperty("Content to insert, append, or use as range replacement."),
      occurrence: textProperty("first or all for text operations. Default first."),
      position: textProperty("before or after for insert_text. Default before."),
      caseSensitive: boolProperty("If true, text matching is case-sensitive. Default false."),
      ensureNewline: boolProperty("For append, add a newline before content when needed. Default true."),
    },
  },
});

const schema = (properties: Record<string, unknown>, required: string[]) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});

export const desktopToolDefinitions = [
  {
    type: "function",
    name: "desktop_read_file",
    description: "Read a workspace file with metadata. Supports line ranges, line numbers, truncation, hashing, and binary detection.",
    parameters: schema({
      path: textProperty("Workspace-relative file path."),
      maxBytes: numberProperty("Optional maximum bytes to return. Default 120000."),
      startLine: numberProperty("Optional 1-based first line to read."),
      endLine: numberProperty("Optional 1-based last line to read."),
      withLineNumbers: boolProperty("If true, prefix returned lines with line numbers."),
      encoding: textProperty("utf8 or base64. Default utf8. Use base64 for binary assets."),
    }, ["path"]),
  },
  {
    type: "function",
    name: "desktop_edit_file",
    description: "Apply structured UTF-8 text edits to one workspace file. Safer than full rewrites for precise edits and less format-sensitive than patches. Returns diff, hashes, warnings, undo metadata, and dry-run status.",
    parameters: schema({
      path: textProperty("Workspace-relative UTF-8 text file path."),
      operations: editOperationsProperty("Ordered edit operations to apply."),
      dryRun: boolProperty("If true, validate and return diff preview without mutating files."),
      reason: textProperty("Optional short reason for the edit, useful for review/audit UI."),
    }, ["path", "operations"]),
  },
  {
    type: "function",
    name: "desktop_write_file",
    description: "Create or replace a UTF-8 text file or base64 binary file in the selected workspace. Returns diff when text, hashes, warnings, and undo metadata.",
    parameters: schema({
      path: textProperty("Workspace-relative file path."),
      content: textProperty("Full UTF-8 file contents, or base64 bytes when encoding is base64."),
      encoding: textProperty("utf8 or base64. Default utf8. Use base64 for binary assets."),
      createOnly: boolProperty("If true, fail when the file already exists."),
      expectedPreviousHash: textProperty("Optional sha256 hash from a prior read. A mismatch is reported as a warning, not a hard block."),
      allowOverwrite: boolProperty("Optional signal that replacing an existing file is intentional."),
      reason: textProperty("Optional short reason for the write, useful for review/audit UI."),
    }, ["path", "content"]),
  },
  {
    type: "function",
    name: "desktop_apply_patch",
    description: "Apply or preview a Codex-style workspace-relative patch envelope. Supports Add File, Update File, Move to, and Delete File sections, with diff, hashes, warnings, and undo metadata.",
    parameters: schema({
      patch: textProperty("Patch text beginning with *** Begin Patch and ending with *** End Patch. File paths must be workspace-relative."),
      expectedHashes: stringMapProperty("Optional map of workspace-relative paths to sha256 hashes from prior reads. Mismatches are reported as warnings, not hard blocks."),
      dryRun: boolProperty("If true, validate and return the diff preview without mutating files."),
      reason: textProperty("Optional short reason for the patch, useful for review/audit UI."),
    }, ["patch"]),
  },
  {
    type: "function",
    name: "desktop_list_dir",
    description: "List a workspace directory.",
    parameters: schema({
      path: textProperty("Workspace-relative directory path. Use . for the workspace root."),
      depth: numberProperty("Optional directory depth. Default 1, max 3."),
      includeMetadata: boolProperty("If true, include size, modified time, and sha256 for files in structured data."),
    }, ["path"]),
  },
  {
    type: "function",
    name: "desktop_search",
    description: "Search workspace files using ripgrep.",
    parameters: schema({
      query: textProperty("Search text or regex."),
      glob: textProperty("Optional file glob such as **/*.ts."),
      maxResults: numberProperty("Optional maximum results. Default 80."),
      caseSensitive: boolProperty("If true, search is case-sensitive. Default false for friendlier code search."),
    }, ["query"]),
  },
  {
    type: "function",
    name: "desktop_delete_path",
    description: "Delete one file or empty directory. Requires approval unless YOLO mode is active.",
    parameters: schema({
      path: textProperty("Workspace-relative path to delete."),
      recursive: boolProperty("Whether directory deletion may be recursive."),
    }, ["path"]),
  },
  {
    type: "function",
    name: "desktop_rename_path",
    description: "Rename or move a file or directory inside the selected workspace.",
    parameters: schema({
      fromPath: textProperty("Existing workspace-relative path."),
      toPath: textProperty("Destination workspace-relative path."),
    }, ["fromPath", "toPath"]),
  },
  {
    type: "function",
    name: "desktop_spawn_process",
    description: "Start a native workspace process. Prefer argv for exact execution; use command only when shell syntax is required. Default tty:true uses a PTY for terminal fidelity and resize. Use tty:false when the process needs real stdin EOF via closeStdin.",
    parameters: schema({
      argv: stringArrayProperty("Preferred argv vector, for example [\"node\", \"-v\"]. Use this when pipes, redirects, and shell expansion are not needed."),
      command: textProperty("Optional shell command string. Use only when shell syntax such as pipes, redirects, or && is required."),
      cwd: textProperty("Optional workspace-relative working directory."),
      yieldTimeMs: numberProperty("Optional milliseconds to wait before yielding control. Default 2000, max 30000. Snake_case yield_time_ms is also accepted."),
      maxOutputChars: numberProperty("Optional retained output budget before head/tail compaction."),
      tty: boolProperty("Use a PTY terminal backend. Default true. Set false for pipe-backed stdin/stdout/stderr and reliable closeStdin."),
    }, []),
  },
  {
    type: "function",
    name: "desktop_write_process",
    description: "Write stdin to, close stdin for, or poll a running process returned by desktop_spawn_process. Empty input polls without writing and returns unread buffered output since the last read, not only output produced during the wait window.",
    parameters: schema({
      processId: numberProperty("Running process id returned by desktop_spawn_process."),
      input: textProperty("Input to write. Use an empty string to poll without sending input."),
      closeStdin: boolProperty("Whether to close stdin after writing/polling."),
      yieldTimeMs: numberProperty("Optional milliseconds to wait before yielding control. Default 5000 for empty polls, max 30000. Snake_case yield_time_ms is also accepted."),
      maxOutputChars: numberProperty("Optional retained output budget before head/tail compaction."),
    }, ["processId", "input"]),
  },
  {
    type: "function",
    name: "desktop_resize_process",
    description: "Resize a running native PTY process.",
    parameters: schema({
      processId: numberProperty("Running process id returned by desktop_spawn_process."),
      rows: numberProperty("Terminal rows."),
      cols: numberProperty("Terminal columns."),
    }, ["processId", "rows", "cols"]),
  },
  {
    type: "function",
    name: "desktop_kill_process",
    description: "Terminate a running process started by desktop_spawn_process. Stop is idempotent: a missing or already-ended process returns success with status:not_found because the desired not-running state is already true.",
    parameters: schema({
      processId: numberProperty("Running process id to terminate."),
    }, ["processId"]),
  },
  {
    type: "function",
    name: "desktop_run_diagnostics",
    description: "Run the best known verification command for this workspace, such as lint, typecheck, test, build, cargo check, or flutter analyze.",
    parameters: schema({
      kind: textProperty("Diagnostic kind: auto, lint, typecheck, test, or build."),
      cwd: textProperty("Optional workspace-relative working directory."),
      command: textProperty("Optional explicit command. Use only when the user asked for a specific check or auto-detection is not enough."),
      timeoutMs: numberProperty("Optional wait window for each terminal poll, max 30000."),
    }, ["kind"]),
  },
  {
    type: "function",
    name: "desktop_git_status",
    description: "Return concise git status for the selected workspace or subdirectory. If the path is not a git repository, returns a clean non-error explanation instead of noisy git help text.",
    parameters: schema({
      cwd: textProperty("Optional workspace-relative working directory."),
    }, []),
  },
  {
    type: "function",
    name: "desktop_git_diff",
    description: "Return git diff for the selected workspace or subdirectory. If the path is not a git repository, returns a clean non-error explanation instead of noisy git help text.",
    parameters: schema({
      cwd: textProperty("Optional workspace-relative working directory."),
      staged: boolProperty("If true, return staged diff."),
    }, []),
  },
] as const;

export const openRouterDesktopTools = desktopToolDefinitions.map((tool) => ({
  type: "function",
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  },
}));

export const geminiDesktopFunctionDeclarations = desktopToolDefinitions.map((tool) => ({
  name: tool.name,
  description: tool.description,
  parametersJsonSchema: tool.parameters,
}));

const names: Set<string> = new Set(desktopToolDefinitions.map((tool) => tool.name));

const toolCallSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()),
  thoughtSignature: z.string().optional(),
});

export const isDesktopToolName = (name: unknown): name is DesktopToolName =>
  typeof name === "string" && names.has(name as DesktopToolName);

export const parseDesktopToolCall = (name: string | undefined, rawArguments: string, id?: string): DesktopToolCall | null => {
  if (!isDesktopToolName(name)) return null;
  try {
    const parsed = JSON.parse(rawArguments);
    const result = toolCallSchema.safeParse({ id, name, arguments: parsed });
    return result.success ? { id: result.data.id || crypto.randomUUID(), name, arguments: result.data.arguments } : null;
  } catch {
    return null;
  }
};

export const parsePartialDesktopToolCall = (name: string | undefined, rawArguments: string) => {
  if (!isDesktopToolName(name)) return null;
  const args: Record<string, unknown> = {};
  for (const key of ["path", "fromPath", "toPath", "command", "query", "patch", "processId", "input", "kind", "cwd", "startLine", "endLine", "expectedPreviousHash", "reason", "encoding"]) {
    const match = rawArguments.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)`));
    if (match?.[1]) args[key] = match[1];
  }
  if (name === "desktop_apply_patch" && typeof args.patch !== "string") {
    const patchStart = rawArguments.indexOf("*** Begin Patch");
    if (patchStart !== -1) args.patch = rawArguments.slice(patchStart);
  }
  return Object.keys(args).length ? { name, arguments: args } : null;
};
