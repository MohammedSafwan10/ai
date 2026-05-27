import fs from "node:fs/promises";
import path from "node:path";
import { rgPath } from "@vscode/ripgrep";
import { spawn } from "node:child_process";
import type { DesktopToolCall, ToolResult } from "../../../shared/types";
import { resolveWorkspacePath } from "../../security/pathSandbox";
import { redactSecrets } from "../../security/redact";
import { TerminalRunner } from "../../terminal/runner";
import { applyPatchHunks, parsePatchEnvelope } from "./patch";

export interface ToolExecutionContext {
  workspaceRoot: string;
  signal: AbortSignal;
  onCommandOutput: (callId: string, delta: string) => void;
}

const readText = async (filePath: string, maxBytes = 120_000) => {
  const stat = await fs.stat(filePath);
  if (stat.size > maxBytes) {
    const handle = await fs.open(filePath, "r");
    try {
      const buffer = Buffer.alloc(maxBytes);
      await handle.read(buffer, 0, maxBytes, 0);
      return `${buffer.toString("utf8")}\n\n[File truncated at ${maxBytes} bytes.]`;
    } finally {
      await handle.close();
    }
  }
  return fs.readFile(filePath, "utf8");
};

const createPreviewDiff = (filePath: string, before: string, after: string) => {
  if (before === after) return `--- ${filePath}\n+++ ${filePath}\n(no changes)`;
  const beforeLines = before ? before.split(/\r?\n/) : [];
  const afterLines = after ? after.split(/\r?\n/) : [];
  let prefix = 0;
  while (prefix < beforeLines.length && prefix < afterLines.length && beforeLines[prefix] === afterLines[prefix]) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix + prefix < beforeLines.length &&
    suffix + prefix < afterLines.length &&
    beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const removed = beforeLines.slice(prefix, beforeLines.length - suffix);
  const added = afterLines.slice(prefix, afterLines.length - suffix);
  const contextBefore = beforeLines.slice(Math.max(0, prefix - 3), prefix);
  const contextAfter = beforeLines.slice(beforeLines.length - suffix, Math.min(beforeLines.length, beforeLines.length - suffix + 3));
  const maxLines = 120;
  const body = [
    ...contextBefore.map((line) => `  ${line}`),
    ...removed.slice(0, maxLines).map((line) => `- ${line}`),
    ...added.slice(0, maxLines).map((line) => `+ ${line}`),
    ...contextAfter.map((line) => `  ${line}`),
  ];
  return [
    `--- ${filePath}`,
    `+++ ${filePath}`,
    `@@ -${removed.length} +${added.length} @@`,
    ...body,
    removed.length + added.length > maxLines * 2 ? "... diff preview truncated ..." : "",
  ].filter(Boolean).join("\n");
};

const runProcess = (command: string, args: string[], cwd: string, signal: AbortSignal) =>
  new Promise<{ exitCode: number | null; output: string }>((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true });
    let output = "";
    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.stderr.on("data", (chunk) => { output += String(chunk); });
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ exitCode, output: redactSecrets(output) }));
    signal.addEventListener("abort", () => child.kill(), { once: true });
  });

const isNotGitRepository = (output: string) =>
  /not a git repository|not a git repo/i.test(output);

const MAX_UNDO_BYTES = 2_000_000;

interface RestoreFileUndo {
  type: "restore_file";
  path: string;
  restorePath?: string;
  existed: boolean;
  previous: string;
  expectedCurrent?: string | null;
}

interface RenameUndo {
  type: "rename_path";
  fromPath: string;
  toPath: string;
}

type UndoOperation = RestoreFileUndo | RenameUndo;

const readUndoText = async (filePath: string) => {
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size > MAX_UNDO_BYTES) return null;
  return fs.readFile(filePath, "utf8");
};

const lineStats = (before: string, after: string) => {
  const beforeLines = before ? before.split(/\r?\n/) : [];
  const afterLines = after ? after.split(/\r?\n/) : [];
  let prefix = 0;
  while (prefix < beforeLines.length && prefix < afterLines.length && beforeLines[prefix] === afterLines[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix + prefix < beforeLines.length &&
    suffix + prefix < afterLines.length &&
    beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  return {
    additions: afterLines.slice(prefix, afterLines.length - suffix).length,
    deletions: beforeLines.slice(prefix, beforeLines.length - suffix).length,
  };
};

const formatDelta = (before: string, after: string) => {
  const stats = lineStats(before, after);
  const additions = stats.additions ? `+${stats.additions}` : "+0";
  const deletions = stats.deletions ? `-${stats.deletions}` : "-0";
  return `${additions} ${deletions}`;
};

const emitLiveDiff = (context: ToolExecutionContext, callId: string, diff: string) => {
  const lines = diff.split(/\r?\n/);
  const maxLines = 160;
  context.onCommandOutput(callId, "Live diff\n");
  lines.slice(0, maxLines).forEach((line) => {
    context.onCommandOutput(callId, `${line}\n`);
  });
  if (lines.length > maxLines) {
    context.onCommandOutput(callId, `... ${lines.length - maxLines} more diff lines hidden ...\n`);
  }
};

export class DesktopToolExecutor {
  private terminal = new TerminalRunner();

  async execute(call: DesktopToolCall, context: ToolExecutionContext): Promise<ToolResult & { diff?: string }> {
    try {
      switch (call.name) {
        case "desktop_read_file":
          return this.readFile(call, context);
        case "desktop_write_file":
          return this.writeFile(call, context);
        case "desktop_apply_patch":
          return this.applyPatch(call, context);
        case "desktop_list_dir":
          return this.listDir(call, context);
        case "desktop_search":
          return this.search(call, context);
        case "desktop_delete_path":
          return this.deletePath(call, context);
        case "desktop_rename_path":
          return this.renamePath(call, context);
        case "desktop_run_command":
          return this.runCommand(call, context);
        case "desktop_git_status":
          return this.gitStatus(call, context);
        case "desktop_git_diff":
          return this.gitDiff(call, context);
        default:
          return { success: false, error: `Unknown tool ${(call as DesktopToolCall).name}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Tool execution failed.",
      };
    }
  }

  private async readFile(call: DesktopToolCall, context: ToolExecutionContext) {
    const target = resolveWorkspacePath(context.workspaceRoot, String(call.arguments.path || ""));
    context.onCommandOutput(call.id, `Reading ${target.relativePath}\n`);
    const output = await readText(target.absolutePath, Number(call.arguments.maxBytes) || 120_000);
    return { success: true, output, data: { path: target.relativePath } };
  }

  private async writeFile(call: DesktopToolCall, context: ToolExecutionContext) {
    const target = resolveWorkspacePath(context.workspaceRoot, String(call.arguments.path || ""));
    const content = String(call.arguments.content ?? "");
    context.onCommandOutput(call.id, `Writing ${target.relativePath}\n`);
    const existed = await fs.stat(target.absolutePath).then(() => true).catch(() => false);
    if (call.arguments.createOnly === true && existed) {
      return { success: false, error: "File already exists." };
    }
    const previous = existed ? await fs.readFile(target.absolutePath, "utf8") : "";
    const undo: UndoOperation | undefined = !existed || Buffer.byteLength(previous, "utf8") <= MAX_UNDO_BYTES
      ? {
          type: "restore_file",
          path: target.relativePath,
          existed,
          previous,
          expectedCurrent: content,
        }
      : undefined;
    const diff = createPreviewDiff(target.relativePath, previous, content);
    emitLiveDiff(context, call.id, diff);
    await fs.mkdir(path.dirname(target.absolutePath), { recursive: true });
    await fs.writeFile(target.absolutePath, content, "utf8");
    context.onCommandOutput(call.id, `${existed ? "Edited" : "Created"} ${target.relativePath} ${formatDelta(previous, content)}\n`);
    return {
      success: true,
      output: `${existed ? "Updated" : "Created"} ${target.relativePath}`,
      data: { path: target.relativePath, bytes: Buffer.byteLength(content, "utf8"), undo },
      diff,
    };
  }

  private async applyPatch(call: DesktopToolCall, context: ToolExecutionContext) {
    const patch = String(call.arguments.patch || "");
    const operations = parsePatchEnvelope(patch);
    const changed: string[] = [];
    const diffs: string[] = [];
    const undo: UndoOperation[] = [];

    for (const operation of operations) {
      if (operation.kind === "add") {
        const target = resolveWorkspacePath(context.workspaceRoot, operation.path);
        context.onCommandOutput(call.id, `Creating ${target.relativePath}\n`);
        const exists = await fs.stat(target.absolutePath).then(() => true).catch(() => false);
        if (exists) throw new Error(`Cannot add ${target.relativePath}: file already exists.`);
        const diff = createPreviewDiff(target.relativePath, "", operation.content);
        emitLiveDiff(context, call.id, diff);
        await fs.mkdir(path.dirname(target.absolutePath), { recursive: true });
        await fs.writeFile(target.absolutePath, operation.content, "utf8");
        changed.push(`Created ${target.relativePath}`);
        diffs.push(diff);
        context.onCommandOutput(call.id, `Created ${target.relativePath} ${formatDelta("", operation.content)}\n`);
        undo.push({
          type: "restore_file",
          path: target.relativePath,
          existed: false,
          previous: "",
          expectedCurrent: operation.content,
        });
        continue;
      }

      if (operation.kind === "delete") {
        const target = resolveWorkspacePath(context.workspaceRoot, operation.path);
        context.onCommandOutput(call.id, `Deleting ${target.relativePath}\n`);
        const previous = await fs.readFile(target.absolutePath, "utf8");
        const diff = createPreviewDiff(target.relativePath, previous, "");
        emitLiveDiff(context, call.id, diff);
        await fs.rm(target.absolutePath, { recursive: false, force: false });
        changed.push(`Deleted ${target.relativePath}`);
        diffs.push(diff);
        context.onCommandOutput(call.id, `Deleted ${target.relativePath} ${formatDelta(previous, "")}\n`);
        if (Buffer.byteLength(previous, "utf8") <= MAX_UNDO_BYTES) {
          undo.push({
            type: "restore_file",
            path: target.relativePath,
            existed: true,
            previous,
            expectedCurrent: null,
          });
        }
        continue;
      }

      const target = resolveWorkspacePath(context.workspaceRoot, operation.path);
      context.onCommandOutput(call.id, `${operation.moveTo ? "Moving" : "Editing"} ${target.relativePath}\n`);
      const previous = await fs.readFile(target.absolutePath, "utf8");
      const next = operation.hunks.length ? applyPatchHunks(previous, operation.hunks, target.relativePath) : previous;
      const finalTarget = operation.moveTo
        ? resolveWorkspacePath(context.workspaceRoot, operation.moveTo)
        : target;
      const diff = createPreviewDiff(finalTarget.relativePath, previous, next);
      emitLiveDiff(context, call.id, diff);
      await fs.mkdir(path.dirname(finalTarget.absolutePath), { recursive: true });
      await fs.writeFile(finalTarget.absolutePath, next, "utf8");
      if (operation.moveTo && finalTarget.absolutePath !== target.absolutePath) {
        await fs.rm(target.absolutePath, { force: false });
      }
      changed.push(operation.moveTo ? `Moved ${target.relativePath} to ${finalTarget.relativePath}` : `Patched ${target.relativePath}`);
      diffs.push(diff);
      context.onCommandOutput(
        call.id,
        `${operation.moveTo ? "Moved" : "Edited"} ${operation.moveTo ? `${target.relativePath} -> ${finalTarget.relativePath}` : finalTarget.relativePath} ${formatDelta(previous, next)}\n`,
      );
      if (Buffer.byteLength(previous, "utf8") <= MAX_UNDO_BYTES) {
        undo.push({
          type: "restore_file",
          path: finalTarget.relativePath,
          restorePath: target.relativePath,
          existed: true,
          previous,
          expectedCurrent: next,
        });
      }
    }

    return {
      success: true,
      output: changed.join("\n"),
      data: { changed, undo },
      diff: diffs.join("\n\n"),
    };
  }

  private async listDir(call: DesktopToolCall, context: ToolExecutionContext) {
    const target = resolveWorkspacePath(context.workspaceRoot, String(call.arguments.path || "."));
    const depth = Math.max(1, Math.min(3, Number(call.arguments.depth) || 1));
    const lines: string[] = [];
    const walk = async (dir: string, prefix: string, currentDepth: number) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 200)) {
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
        const rel = path.join(prefix, entry.name);
        lines.push(`${entry.isDirectory() ? "dir " : "file"} ${rel}`);
        if (entry.isDirectory() && currentDepth < depth) await walk(path.join(dir, entry.name), rel, currentDepth + 1);
      }
    };
    await walk(target.absolutePath, target.relativePath === "." ? "" : target.relativePath, 1);
    return { success: true, output: lines.join("\n") || "(empty)", data: { path: target.relativePath } };
  }

  private async search(call: DesktopToolCall, context: ToolExecutionContext) {
    const query = String(call.arguments.query || "");
    const args = ["--line-number", "--hidden", "--glob", "!node_modules", "--glob", "!.git", "--glob", "!dist"];
    if (call.arguments.glob) args.push("--glob", String(call.arguments.glob));
    args.push(query, ".");
    const result = await runProcess(rgPath, args, context.workspaceRoot, context.signal);
    const lines = result.output.split(/\r?\n/).filter(Boolean).slice(0, Number(call.arguments.maxResults) || 80);
    return { success: result.exitCode === 0 || result.exitCode === 1, output: lines.join("\n") || "No matches found." };
  }

  private async deletePath(call: DesktopToolCall, context: ToolExecutionContext) {
    const target = resolveWorkspacePath(context.workspaceRoot, String(call.arguments.path || ""));
    const stat = await fs.stat(target.absolutePath);
    const previous = stat.isFile() ? await readUndoText(target.absolutePath) : "";
    await fs.rm(target.absolutePath, { recursive: call.arguments.recursive === true, force: false });
    const diff = previous ? createPreviewDiff(target.relativePath, previous, "") : undefined;
    const undo: UndoOperation | undefined = stat.isFile() && previous !== null
      ? {
          type: "restore_file",
          path: target.relativePath,
          existed: true,
          previous,
          expectedCurrent: null,
        }
      : undefined;
    return { success: true, output: `Deleted ${target.relativePath}`, data: { path: target.relativePath, undo }, diff };
  }

  private async renamePath(call: DesktopToolCall, context: ToolExecutionContext) {
    const from = resolveWorkspacePath(context.workspaceRoot, String(call.arguments.fromPath || ""));
    const to = resolveWorkspacePath(context.workspaceRoot, String(call.arguments.toPath || ""));
    await fs.mkdir(path.dirname(to.absolutePath), { recursive: true });
    await fs.rename(from.absolutePath, to.absolutePath);
    const undo: UndoOperation = { type: "rename_path", fromPath: to.relativePath, toPath: from.relativePath };
    return { success: true, output: `Renamed ${from.relativePath} to ${to.relativePath}`, data: { from: from.relativePath, to: to.relativePath, undo } };
  }

  private async runCommand(call: DesktopToolCall, context: ToolExecutionContext) {
    const cwd = resolveWorkspacePath(context.workspaceRoot, String(call.arguments.cwd || ".")).absolutePath;
    const result = await this.terminal.run({
      cwd,
      command: String(call.arguments.command || ""),
      timeoutMs: Number(call.arguments.timeoutMs) || 120_000,
      signal: context.signal,
      onOutput: (delta) => context.onCommandOutput(call.id, delta),
    });
    return {
      success: result.exitCode === 0 && !result.timedOut,
      output: result.output || `Command exited with code ${result.exitCode}`,
      error: result.timedOut ? "Command timed out." : undefined,
      data: {
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        timedOut: result.timedOut,
        omittedBytes: result.omittedBytes,
      },
    };
  }

  private async gitStatus(call: DesktopToolCall, context: ToolExecutionContext) {
    const cwd = resolveWorkspacePath(context.workspaceRoot, String(call.arguments.cwd || ".")).absolutePath;
    const result = await runProcess("git", ["status", "--short", "--branch"], cwd, context.signal);
    if (isNotGitRepository(result.output)) {
      return {
        success: true,
        output: "This workspace is not initialized as a Git repository.",
        data: { isGitRepository: false },
      };
    }
    return { success: result.exitCode === 0, output: result.output || "(clean)" };
  }

  private async gitDiff(call: DesktopToolCall, context: ToolExecutionContext) {
    const cwd = resolveWorkspacePath(context.workspaceRoot, String(call.arguments.cwd || ".")).absolutePath;
    const result = await runProcess("git", ["diff", ...(call.arguments.staged === true ? ["--staged"] : [])], cwd, context.signal);
    if (isNotGitRepository(result.output)) {
      return {
        success: true,
        output: "No Git diff is available because this workspace is not initialized as a Git repository.",
        data: { isGitRepository: false },
      };
    }
    return { success: result.exitCode === 0, output: result.output || "(no diff)" };
  }
}
