import { z } from "zod";
import type { DesktopToolCall, DesktopToolName } from "../../../shared/types";

const textProperty = (description: string) => ({ type: "string", description });
const boolProperty = (description: string) => ({ type: "boolean", description });
const numberProperty = (description: string) => ({ type: "number", description });

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
    description: "Read a UTF-8 text file from the selected workspace.",
    parameters: schema({
      path: textProperty("Workspace-relative file path."),
      maxBytes: numberProperty("Optional maximum bytes to return. Default 120000."),
    }, ["path"]),
  },
  {
    type: "function",
    name: "desktop_write_file",
    description: "Create or replace a UTF-8 text file in the selected workspace.",
    parameters: schema({
      path: textProperty("Workspace-relative file path."),
      content: textProperty("Full file contents to write."),
      createOnly: boolProperty("If true, fail when the file already exists."),
    }, ["path", "content"]),
  },
  {
    type: "function",
    name: "desktop_apply_patch",
    description: "Apply a Codex-style workspace-relative patch envelope. Supports Add File, Update File, Move to, and Delete File sections.",
    parameters: schema({
      patch: textProperty("Patch text beginning with *** Begin Patch and ending with *** End Patch. File paths must be workspace-relative."),
    }, ["patch"]),
  },
  {
    type: "function",
    name: "desktop_list_dir",
    description: "List a workspace directory.",
    parameters: schema({
      path: textProperty("Workspace-relative directory path. Use . for the workspace root."),
      depth: numberProperty("Optional directory depth. Default 1, max 3."),
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
    name: "desktop_run_command",
    description: "Run a terminal command in the selected workspace with streamed output.",
    parameters: schema({
      command: textProperty("Command to run."),
      cwd: textProperty("Optional workspace-relative working directory."),
      timeoutMs: numberProperty("Optional timeout in milliseconds. Default 120000."),
    }, ["command"]),
  },
  {
    type: "function",
    name: "desktop_git_status",
    description: "Run git status --short --branch in the selected workspace.",
    parameters: schema({
      cwd: textProperty("Optional workspace-relative working directory."),
    }, []),
  },
  {
    type: "function",
    name: "desktop_git_diff",
    description: "Run git diff in the selected workspace.",
    parameters: schema({
      cwd: textProperty("Optional workspace-relative working directory."),
      staged: boolProperty("Whether to show staged diff."),
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

const names = new Set(desktopToolDefinitions.map((tool) => tool.name));

const toolCallSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  arguments: z.record(z.unknown()),
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
  for (const key of ["path", "fromPath", "toPath", "command", "query", "patch"]) {
    const match = rawArguments.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)`));
    if (match?.[1]) args[key] = match[1];
  }
  if (name === "desktop_apply_patch" && typeof args.patch !== "string") {
    const patchStart = rawArguments.indexOf("*** Begin Patch");
    if (patchStart !== -1) args.patch = rawArguments.slice(patchStart);
  }
  return Object.keys(args).length ? { name, arguments: args } : null;
};
