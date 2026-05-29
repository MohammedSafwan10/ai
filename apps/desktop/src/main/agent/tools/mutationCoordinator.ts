import fs from "node:fs/promises";
import path from "node:path";
import type { DesktopToolCall, ToolDiffFileRecord, ToolResult } from "../../../shared/types";
import { resolveWorkspacePath } from "../../security/pathSandbox";
import {
  createRenameDiff,
  createStructuredDiff,
  formatDeltaFromDiffFiles,
  formatUnifiedDiffFiles,
} from "./diffFormatter";
import { applyPatchHunks, parsePatchEnvelope, type PatchHunk } from "./patch";

export interface ToolExecutionContext {
  workspaceRoot: string;
  signal: AbortSignal;
  onCommandOutput: (callId: string, delta: string) => void;
}

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

export class FileMutationCoordinator {
  async writeFile(call: DesktopToolCall, context: ToolExecutionContext): Promise<ToolResult & { diff?: string; diffFiles?: ToolDiffFileRecord[] }> {
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
    const structured = createStructuredDiff({
      path: target.relativePath,
      before: previous,
      after: content,
      status: existed ? "modified" : "created",
    });
    emitLiveDiff(context, call.id, structured.diff);
    await fs.mkdir(path.dirname(target.absolutePath), { recursive: true });
    await fs.writeFile(target.absolutePath, content, "utf8");
    context.onCommandOutput(call.id, `${existed ? "Edited" : "Created"} ${target.relativePath} ${formatDeltaFromDiffFiles(structured.diffFiles)}\n`);
    return {
      success: true,
      output: `${existed ? "Updated" : "Created"} ${target.relativePath}`,
      data: {
        path: target.relativePath,
        bytes: Buffer.byteLength(content, "utf8"),
        undo,
      },
      diff: structured.diff,
      diffFiles: structured.diffFiles,
    };
  }

  async applyPatch(call: DesktopToolCall, context: ToolExecutionContext): Promise<ToolResult & { diff?: string; diffFiles?: ToolDiffFileRecord[] }> {
    const patch = String(call.arguments.patch || "");
    const operations = parsePatchEnvelope(patch);
    const changed: string[] = [];
    const diffFiles: ToolDiffFileRecord[] = [];
    const undo: UndoOperation[] = [];

    for (const operation of operations) {
      if (operation.kind === "add") {
        const target = resolveWorkspacePath(context.workspaceRoot, operation.path);
        context.onCommandOutput(call.id, `Creating ${target.relativePath}\n`);
        const exists = await fs.stat(target.absolutePath).then(() => true).catch(() => false);
        if (exists) throw new Error(`Cannot add ${target.relativePath}: file already exists.`);
        const structured = createStructuredDiff({
          path: target.relativePath,
          before: "",
          after: operation.content,
          status: "created",
        });
        emitLiveDiff(context, call.id, structured.diff);
        await fs.mkdir(path.dirname(target.absolutePath), { recursive: true });
        await fs.writeFile(target.absolutePath, operation.content, "utf8");
        changed.push(`Created ${target.relativePath}`);
        diffFiles.push(...structured.diffFiles);
        context.onCommandOutput(call.id, `Created ${target.relativePath} ${formatDeltaFromDiffFiles(structured.diffFiles)}\n`);
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
        const structured = createStructuredDiff({
          path: target.relativePath,
          before: previous,
          after: "",
          status: "deleted",
        });
        emitLiveDiff(context, call.id, structured.diff);
        await fs.rm(target.absolutePath, { recursive: false, force: false });
        changed.push(`Deleted ${target.relativePath}`);
        diffFiles.push(...structured.diffFiles);
        context.onCommandOutput(call.id, `Deleted ${target.relativePath} ${formatDeltaFromDiffFiles(structured.diffFiles)}\n`);
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
      operation.hunks.forEach((hunk) => emitPatchPreview(context, call.id, target.relativePath, hunk.lines));
      const previous = await fs.readFile(target.absolutePath, "utf8");
      const next = operation.hunks.length ? applyPatchHunks(previous, operation.hunks, target.relativePath) : previous;
      const finalTarget = operation.moveTo
        ? resolveWorkspacePath(context.workspaceRoot, operation.moveTo)
        : target;
      const structured = createStructuredDiff({
        path: finalTarget.relativePath,
        oldPath: operation.moveTo ? target.relativePath : undefined,
        before: previous,
        after: next,
        status: operation.moveTo ? "renamed" : "modified",
      });
      emitLiveDiff(context, call.id, structured.diff);
      await fs.mkdir(path.dirname(finalTarget.absolutePath), { recursive: true });
      await fs.writeFile(finalTarget.absolutePath, next, "utf8");
      if (operation.moveTo && finalTarget.absolutePath !== target.absolutePath) {
        await fs.rm(target.absolutePath, { force: false });
      }
      changed.push(operation.moveTo ? `Moved ${target.relativePath} to ${finalTarget.relativePath}` : `Patched ${target.relativePath}`);
      diffFiles.push(...structured.diffFiles);
      context.onCommandOutput(
        call.id,
        `${operation.moveTo ? "Moved" : "Edited"} ${operation.moveTo ? `${target.relativePath} -> ${finalTarget.relativePath}` : finalTarget.relativePath} ${formatDeltaFromDiffFiles(structured.diffFiles)}\n`,
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
      diff: formatUnifiedDiffFiles(diffFiles),
      diffFiles,
    };
  }

  async deletePath(call: DesktopToolCall, context: ToolExecutionContext): Promise<ToolResult & { diff?: string; diffFiles?: ToolDiffFileRecord[] }> {
    const target = resolveWorkspacePath(context.workspaceRoot, String(call.arguments.path || ""));
    context.onCommandOutput(call.id, `Deleting ${target.relativePath}\n`);
    const stat = await fs.stat(target.absolutePath);
    const previous = stat.isFile() ? await readUndoText(target.absolutePath) : "";
    await fs.rm(target.absolutePath, { recursive: call.arguments.recursive === true, force: false });
    const structured = previous !== null
      ? createStructuredDiff({ path: target.relativePath, before: previous, after: "", status: "deleted" })
      : undefined;
    if (structured) emitLiveDiff(context, call.id, structured.diff);
    const undo: UndoOperation | undefined = stat.isFile() && previous !== null
      ? {
          type: "restore_file",
          path: target.relativePath,
          existed: true,
          previous,
          expectedCurrent: null,
        }
      : undefined;
    context.onCommandOutput(call.id, `Deleted ${target.relativePath}\n`);
    return {
      success: true,
      output: `Deleted ${target.relativePath}`,
      data: { path: target.relativePath, undo },
      diff: structured?.diff,
      diffFiles: structured?.diffFiles,
    };
  }

  async renamePath(call: DesktopToolCall, context: ToolExecutionContext): Promise<ToolResult & { diff?: string; diffFiles?: ToolDiffFileRecord[] }> {
    const from = resolveWorkspacePath(context.workspaceRoot, String(call.arguments.fromPath || ""));
    const to = resolveWorkspacePath(context.workspaceRoot, String(call.arguments.toPath || ""));
    context.onCommandOutput(call.id, `Renaming ${from.relativePath} -> ${to.relativePath}\n`);
    await fs.mkdir(path.dirname(to.absolutePath), { recursive: true });
    await fs.rename(from.absolutePath, to.absolutePath);
    const structured = createRenameDiff(from.relativePath, to.relativePath);
    const undo: UndoOperation = { type: "rename_path", fromPath: to.relativePath, toPath: from.relativePath };
    return {
      success: true,
      output: `Renamed ${from.relativePath} to ${to.relativePath}`,
      data: { from: from.relativePath, to: to.relativePath, path: to.relativePath, undo },
      diff: structured.diff,
      diffFiles: structured.diffFiles,
    };
  }
}

const readUndoText = async (filePath: string) => {
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size > MAX_UNDO_BYTES) return null;
  return fs.readFile(filePath, "utf8");
};

const emitLiveDiff = (context: ToolExecutionContext, callId: string, diff: string) => {
  const lines = diff.split(/\r?\n/);
  const maxLines = 56;
  const visible = lines.slice(0, maxLines);
  const hidden = lines.length - visible.length;
  context.onCommandOutput(
    callId,
    [
      "Live diff",
      ...visible,
      hidden > 0 ? `... ${hidden} more diff lines hidden from live preview ...` : "",
    ].filter(Boolean).join("\n") + "\n",
  );
};

const emitPatchPreview = (context: ToolExecutionContext, callId: string, filePath: string, lines: PatchHunk["lines"]) => {
  const visible = lines.filter((line) => line.type === "add" || line.type === "remove");
  if (visible.length === 0) return;
  const maxLines = 56;
  const preview = visible.slice(0, maxLines).map((line) => `${line.type === "add" ? "+" : "-"} ${line.text}`);
  const hidden = visible.length - preview.length;
  context.onCommandOutput(
    callId,
    [
      `Live patch ${filePath}`,
      ...preview,
      hidden > 0 ? `... ${hidden} more patch lines hidden from live preview ...` : "",
    ].filter(Boolean).join("\n") + "\n",
  );
};
