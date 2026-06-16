import fs from "node:fs/promises";
import path from "node:path";
import type { DesktopToolCall, ToolDiffFileRecord, ToolResult } from "../../../shared/types";
import { resolveExistingWorkspacePath, resolveWorkspacePath, revalidateResolvedWorkspacePath } from "../../security/pathSandbox";
import { atomicWriteFile, atomicWriteFileNoOverwrite } from "../../storage/atomicWrite";
import {
  createRenameDiff,
  createStructuredDiff,
  formatDeltaFromDiffFiles,
  formatUnifiedDiffFiles,
} from "./diffFormatter";
import {
  assertFreshFileState,
  changeMetadata,
  createMissingFileSnapshot,
  FileOperationService,
  hashBuffer,
  hashText,
  isStaleFileError,
  recordFileObservation,
  type FileChangeMetadata,
  type FileSnapshot,
} from "./fileOperationService";
import { applyPatchHunks, parsePatchEnvelope, type ParsedPatchOperation, type PatchHunk } from "./patch";

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
  encoding?: "utf8" | "base64";
}

interface RenameUndo {
  type: "rename_path";
  fromPath: string;
  toPath: string;
}

type UndoOperation = RestoreFileUndo | RenameUndo;

export class FileMutationCoordinator {
  constructor(
    private options: {
      beforePatchCommit?: (change: PlannedPatchChange, index: number) => Promise<void> | void;
      beforePatchRollback?: (change: PlannedPatchChange, index: number) => Promise<void> | void;
      beforeWriteCommit?: () => Promise<void> | void;
      beforeEditCommit?: () => Promise<void> | void;
      beforeDeleteCommit?: () => Promise<void> | void;
      beforeRenameCommit?: () => Promise<void> | void;
    } = {},
    private files = new FileOperationService(),
  ) {}

  async writeFile(call: DesktopToolCall, context: ToolExecutionContext): Promise<ToolResult & { diff?: string; diffFiles?: ToolDiffFileRecord[] }> {
    const target = this.files.resolve(context.workspaceRoot, String(call.arguments.path || ""));
    const encoding = normalizeEncoding(call.arguments.encoding);
    const content = String(call.arguments.content ?? "");
    context.onCommandOutput(call.id, `Writing ${target.relativePath}\n`);
    const existing = await this.files.maybeSnapshot(context.workspaceRoot, target.relativePath);
    const existed = Boolean(existing);
    if (call.arguments.createOnly === true && existed) {
      return { success: false, error: "File already exists." };
    }
    if (encoding === "utf8" && existing?.binary) {
      return { success: false, error: `${existing.target.relativePath} is binary; text replacement is not supported.` };
    }
    assertFreshFileState(context.workspaceRoot, target.relativePath, existing, call.arguments.expectedPreviousHash);
    const warnings: string[] = [];
    const parentDirectoryCreated = !(await pathExists(path.dirname(target.absolutePath)));
    if (encoding === "base64") {
      const buffer = decodeBase64Content(content);
      const previousBuffer = existing ? await readUndoBytes(existing.target.absolutePath) : null;
      const undo: UndoOperation | undefined = !existing || previousBuffer
        ? {
            type: "restore_file",
            path: target.relativePath,
            existed,
            previous: previousBuffer ? previousBuffer.toString("base64") : "",
            expectedCurrent: buffer.toString("base64"),
            encoding: "base64",
          }
        : undefined;
      await fs.mkdir(path.dirname(target.absolutePath), { recursive: true });
      await this.options.beforeWriteCommit?.();
      await assertPlannedFileFresh(this.files, context.workspaceRoot, target.relativePath, existing?.sha256 ?? null, !existing, "planned write snapshot");
      const finalTarget = revalidateResolvedWorkspacePath(target);
      await atomicWriteFile(finalTarget.absolutePath, buffer);
      const afterSnapshot = await this.files.snapshot(context.workspaceRoot, finalTarget.relativePath);
      recordFileObservation(context.workspaceRoot, afterSnapshot);
      context.onCommandOutput(call.id, `${existed ? "Edited" : "Created"} ${target.relativePath} ${buffer.length}B\n`);
      return {
        success: true,
        output: `${existed ? "Updated" : "Created"} ${target.relativePath}`,
        data: {
          path: target.relativePath,
          bytes: buffer.length,
          sha256: hashBuffer(buffer),
          beforeHash: existing?.sha256 || null,
          afterHash: hashBuffer(buffer),
          changed: [{
            path: target.relativePath,
            status: existed ? "modified" : "created",
            additions: 0,
            deletions: 0,
            beforeHash: existing?.sha256 || null,
            afterHash: hashBuffer(buffer),
            sizeBytes: buffer.length,
          }],
          warnings,
          undo,
          encoding: "base64",
          parentDirectoryCreated,
        },
      };
    }
    const previous = existing?.content || "";
    if (existed && call.arguments.allowOverwrite !== true && Buffer.byteLength(previous, "utf8") > 200_000) {
      warnings.push(`${target.relativePath} is a large existing file; full replacement is allowed but patch is usually easier to review.`);
    }
    const undo: UndoOperation | undefined = !existed || Buffer.byteLength(previous, "utf8") <= MAX_UNDO_BYTES
      ? {
          type: "restore_file",
          path: target.relativePath,
          existed,
          previous,
          expectedCurrent: content,
          encoding: "utf8",
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
    await this.options.beforeWriteCommit?.();
    await assertPlannedFileFresh(this.files, context.workspaceRoot, target.relativePath, existing?.sha256 ?? null, !existing, "planned write snapshot");
    const finalTarget = revalidateResolvedWorkspacePath(target);
    await atomicWriteFile(finalTarget.absolutePath, content, "utf8");
    const afterSnapshot = await this.files.snapshot(context.workspaceRoot, finalTarget.relativePath);
    recordFileObservation(context.workspaceRoot, afterSnapshot);
    context.onCommandOutput(call.id, `${existed ? "Edited" : "Created"} ${target.relativePath} ${formatDeltaFromDiffFiles(structured.diffFiles)}\n`);
    const changed = [changeMetadata({
      path: target.relativePath,
      status: existed ? "modified" : "created",
      before: previous,
      after: content,
      additions: structured.additions,
      deletions: structured.deletions,
    })];
    return {
      success: true,
      output: `${existed ? "Updated" : "Created"} ${target.relativePath}`,
      data: {
        path: target.relativePath,
        bytes: Buffer.byteLength(content, "utf8"),
        sha256: hashText(content),
        beforeHash: existing?.sha256 || null,
        afterHash: hashText(content),
        changed,
        warnings,
        undo,
        parentDirectoryCreated,
      },
      diff: structured.diff,
      diffFiles: structured.diffFiles,
    };
  }

  async editFile(call: DesktopToolCall, context: ToolExecutionContext): Promise<ToolResult & { diff?: string; diffFiles?: ToolDiffFileRecord[] }> {
    const before = await this.files.snapshot(context.workspaceRoot, String(call.arguments.path || ""));
    if (before.binary) return { success: false, error: `${before.target.relativePath} is binary; desktop_edit_file supports UTF-8 text only.` };
    assertFreshFileState(context.workspaceRoot, before.target.relativePath, before, call.arguments.expectedPreviousHash);
    const operations = readEditOperations(call.arguments.operations);
    const dryRun = call.arguments.dryRun === true || call.arguments.dry_run === true;
    context.onCommandOutput(call.id, `${dryRun ? "Previewing edit" : "Editing"} ${before.target.relativePath}\n`);
    const after = applyEditOperations(before.content, operations);
    const structured = createStructuredDiff({
      path: before.target.relativePath,
      before: before.content,
      after,
      status: "modified",
    });
    emitLiveDiff(context, call.id, structured.diff);
    const warnings: string[] = [];
    const metadata = changeMetadata({
      path: before.target.relativePath,
      status: "modified",
      before: before.content,
      after,
      additions: structured.additions,
      deletions: structured.deletions,
    });
    if (dryRun) {
      return {
        success: true,
        output: `Edit preview:\nEdited ${before.target.relativePath}`,
        data: { changed: [`Edited ${before.target.relativePath}`], changes: [metadata], warnings, dryRun: true, mutated: false },
        diff: structured.diff,
        diffFiles: structured.diffFiles,
      };
    }
    await this.options.beforeEditCommit?.();
    await assertPlannedFileFresh(this.files, context.workspaceRoot, before.target.relativePath, before.sha256, false, "planned edit snapshot");
    const finalTarget = revalidateResolvedWorkspacePath(before.target);
    await atomicWriteFile(finalTarget.absolutePath, after, "utf8");
    const afterSnapshot = await this.files.snapshot(context.workspaceRoot, before.target.relativePath);
    recordFileObservation(context.workspaceRoot, afterSnapshot);
    context.onCommandOutput(call.id, `Edited ${before.target.relativePath} ${formatDeltaFromDiffFiles(structured.diffFiles)}\n`);
    const undo: UndoOperation = {
      type: "restore_file",
      path: before.target.relativePath,
      existed: true,
      previous: before.content,
      expectedCurrent: after,
      encoding: "utf8",
    };
    return {
      success: true,
      output: `Edited ${before.target.relativePath}`,
      data: { changed: [`Edited ${before.target.relativePath}`], changes: [metadata], warnings, undo: [undo], dryRun: false, mutated: true },
      diff: structured.diff,
      diffFiles: structured.diffFiles,
    };
  }

  async applyPatch(call: DesktopToolCall, context: ToolExecutionContext): Promise<ToolResult & { diff?: string; diffFiles?: ToolDiffFileRecord[] }> {
    const patch = String(call.arguments.patch || "");
    const operations = parsePatchEnvelope(patch);
    assertUniquePatchTargets(operations);
    const changed: string[] = [];
    const changeRecords: FileChangeMetadata[] = [];
    const diffFiles: ToolDiffFileRecord[] = [];
    const undo: UndoOperation[] = [];
    const warnings: string[] = [];
    const planned: PlannedPatchChange[] = [];
    const expectedHashes = readHashMap(call.arguments.expectedHashes);

    for (const operation of operations) {
      if (operation.kind === "add") {
        const target = this.files.resolve(context.workspaceRoot, operation.path);
        context.onCommandOutput(call.id, `Creating ${target.relativePath}\n`);
        const existing = await this.files.maybeSnapshot(context.workspaceRoot, target.relativePath);
        if (existing) throw new Error(`Cannot add ${target.relativePath}: file already exists.`);
        assertFreshFileState(context.workspaceRoot, target.relativePath, existing, expectedHashes[normalizePatchPath(target.relativePath)], "expectedHashes");
        const structured = createStructuredDiff({
          path: target.relativePath,
          before: "",
          after: operation.content,
          status: "created",
        });
        emitLiveDiff(context, call.id, structured.diff);
        const metadata = changeMetadata({
          path: target.relativePath,
          status: "created",
          before: "",
          after: operation.content,
          additions: structured.additions,
          deletions: structured.deletions,
        });
        planned.push({
          description: `Created ${target.relativePath}`,
          target,
          before: createMissingFileSnapshot(target),
          after: operation.content,
          afterHash: hashText(operation.content),
          structured,
          metadata,
          apply: async () => {
            await fs.mkdir(path.dirname(target.absolutePath), { recursive: true });
            const revalidatedTarget = revalidateResolvedWorkspacePath(target);
            await atomicWriteFileNoOverwrite(revalidatedTarget.absolutePath, operation.content, "utf8");
          },
        });
        changed.push(`Created ${target.relativePath}`);
        diffFiles.push(...structured.diffFiles);
        changeRecords.push(metadata);
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
      const before = await this.files.snapshot(context.workspaceRoot, operation.path);
      if (before.binary) throw new Error(`${before.target.relativePath} is binary; patch delete is not supported.`);
      assertFreshFileState(context.workspaceRoot, before.target.relativePath, before, expectedHashes[normalizePatchPath(before.target.relativePath)], "expectedHashes");
      context.onCommandOutput(call.id, `Deleting ${before.target.relativePath}\n`);
        const previous = before.content;
        const structured = createStructuredDiff({
          path: before.target.relativePath,
          before: previous,
          after: "",
          status: "deleted",
        });
        emitLiveDiff(context, call.id, structured.diff);
        const metadata = changeMetadata({
          path: before.target.relativePath,
          status: "deleted",
          before: previous,
          after: "",
          additions: structured.additions,
          deletions: structured.deletions,
        });
        planned.push({
          description: `Deleted ${before.target.relativePath}`,
          target: before.target,
          before,
          after: "",
          afterHash: null,
          structured,
          metadata,
          apply: async () => {
            await fs.rm(before.target.absolutePath, { recursive: false, force: false });
          },
        });
        changed.push(`Deleted ${before.target.relativePath}`);
        diffFiles.push(...structured.diffFiles);
        changeRecords.push(metadata);
        if (Buffer.byteLength(previous, "utf8") <= MAX_UNDO_BYTES) {
          undo.push({
            type: "restore_file",
            path: before.target.relativePath,
            existed: true,
            previous,
            expectedCurrent: null,
            encoding: "utf8",
          });
        }
        continue;
      }

      const before = await this.files.snapshot(context.workspaceRoot, operation.path);
      if (before.binary) throw new Error(`${before.target.relativePath} is binary; patch update is not supported.`);
      assertFreshFileState(context.workspaceRoot, before.target.relativePath, before, expectedHashes[normalizePatchPath(before.target.relativePath)], "expectedHashes");
      context.onCommandOutput(call.id, `${operation.moveTo ? "Moving" : "Editing"} ${before.target.relativePath}\n`);
      operation.hunks.forEach((hunk) => emitPatchPreview(context, call.id, before.target.relativePath, hunk.lines));
      const previous = before.content;
      const next = operation.hunks.length ? applyPatchHunks(previous, operation.hunks, before.target.relativePath) : previous;
      const finalTarget = operation.moveTo
        ? this.files.resolve(context.workspaceRoot, operation.moveTo)
        : before.target;
      if (operation.moveTo && finalTarget.absolutePath !== before.target.absolutePath && await pathExists(finalTarget.absolutePath)) {
        throw new Error(`Cannot move ${before.target.relativePath} to ${finalTarget.relativePath}: destination already exists.`);
      }
      const structured = createStructuredDiff({
        path: finalTarget.relativePath,
        oldPath: operation.moveTo ? before.target.relativePath : undefined,
        before: previous,
        after: next,
        status: operation.moveTo ? "renamed" : "modified",
      });
      emitLiveDiff(context, call.id, structured.diff);
      const metadata = changeMetadata({
        path: finalTarget.relativePath,
        oldPath: operation.moveTo ? before.target.relativePath : undefined,
        status: operation.moveTo ? "renamed" : "modified",
        before: previous,
        after: next,
        additions: structured.additions,
        deletions: structured.deletions,
      });
      planned.push({
        description: operation.moveTo ? `Moved ${before.target.relativePath} to ${finalTarget.relativePath}` : `Patched ${before.target.relativePath}`,
        target: finalTarget,
        source: before.target,
        before,
        after: next,
        afterHash: hashText(next),
        structured,
        metadata,
        apply: async () => {
          await fs.mkdir(path.dirname(finalTarget.absolutePath), { recursive: true });
          const revalidatedTarget = revalidateResolvedWorkspacePath(finalTarget);
          if (operation.moveTo && finalTarget.absolutePath !== before.target.absolutePath) {
            await atomicWriteFileNoOverwrite(revalidatedTarget.absolutePath, next, "utf8");
          } else {
            await atomicWriteFile(revalidatedTarget.absolutePath, next, "utf8");
          }
          if (operation.moveTo && finalTarget.absolutePath !== before.target.absolutePath) {
            await fs.rm(before.target.absolutePath, { force: false });
          }
        },
      });
      changed.push(operation.moveTo ? `Moved ${before.target.relativePath} to ${finalTarget.relativePath}` : `Patched ${before.target.relativePath}`);
      diffFiles.push(...structured.diffFiles);
      changeRecords.push(metadata);
      if (Buffer.byteLength(previous, "utf8") <= MAX_UNDO_BYTES) {
        undo.push({
          type: "restore_file",
          path: finalTarget.relativePath,
          restorePath: before.target.relativePath,
          existed: true,
          previous,
          expectedCurrent: next,
          encoding: "utf8",
        });
      }
    }

    if (call.arguments.dryRun === true) {
      return {
        success: true,
        output: `Patch preview:\n${changed.join("\n")}`,
        data: { changed, changes: changeRecords, warnings, dryRun: true, mutated: false },
        diff: formatUnifiedDiffFiles(diffFiles),
        diffFiles,
      };
    }

    const applied: PlannedPatchChange[] = [];
    try {
      for (const [index, change] of planned.entries()) {
        await this.options.beforePatchCommit?.(change, index);
        await assertPlannedPatchChangeFresh(this.files, context.workspaceRoot, change);
        applied.push(change);
        await change.apply();
        const snapshot = await this.files.maybeSnapshot(context.workspaceRoot, change.target.relativePath);
        if (snapshot) recordFileObservation(context.workspaceRoot, snapshot);
        context.onCommandOutput(call.id, `${change.description} ${formatDeltaFromDiffFiles(change.structured.diffFiles)}\n`);
      }
    } catch (error) {
      const rollback = await rollbackPatchChanges(applied, context, this.options.beforePatchRollback);
      const rollbackFailed = rollback.some((item) => !item.success);
      if (isStaleFileError(error)) {
        return {
          success: false,
          error: `STALE_FILE: ${error.message}`,
          data: {
            code: error.code,
            path: error.path,
            reason: error.reason,
            expectedHash: error.expectedHash,
            actualHash: error.actualHash,
            requiresReread: true,
            changed,
            changes: changeRecords,
            warnings,
            rollback,
            dryRun: false,
            mutated: rollbackFailed,
          },
          diff: formatUnifiedDiffFiles(diffFiles),
          diffFiles,
        };
      }
      return {
        success: false,
        error: [
          `Patch failed before all changes were committed: ${error instanceof Error ? error.message : "unknown error"}`,
          rollbackFailed ? "Rollback was attempted but one or more files could not be restored." : "Rollback completed for committed changes.",
        ].join("\n"),
        data: {
          code: "PATCH_TRANSACTION_FAILED",
          changed,
          changes: changeRecords,
          warnings,
          rollback,
          dryRun: false,
          mutated: rollbackFailed,
        },
        diff: formatUnifiedDiffFiles(diffFiles),
        diffFiles,
      };
    }

    return {
      success: true,
      output: changed.join("\n"),
      data: { changed, changes: changeRecords, warnings, undo, dryRun: false, mutated: true },
      diff: formatUnifiedDiffFiles(diffFiles),
      diffFiles,
    };
  }

  async deletePath(call: DesktopToolCall, context: ToolExecutionContext): Promise<ToolResult & { diff?: string; diffFiles?: ToolDiffFileRecord[] }> {
    const target = resolveExistingWorkspacePath(context.workspaceRoot, String(call.arguments.path || ""));
    context.onCommandOutput(call.id, `Deleting ${target.relativePath}\n`);
    const stat = await fs.stat(target.absolutePath);
    const snapshot = stat.isFile() ? await this.files.snapshot(context.workspaceRoot, target.relativePath) : null;
    if (snapshot) assertFreshFileState(context.workspaceRoot, target.relativePath, snapshot, call.arguments.expectedPreviousHash);
    const previous = stat.isFile() ? (snapshot?.binary ? null : await readUndoText(target.absolutePath)) : "";
    await this.options.beforeDeleteCommit?.();
    if (snapshot) await assertPlannedFileFresh(this.files, context.workspaceRoot, target.relativePath, snapshot.sha256, false, "planned delete snapshot");
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
    const from = resolveExistingWorkspacePath(context.workspaceRoot, String(call.arguments.fromPath || ""));
    const to = resolveWorkspacePath(context.workspaceRoot, String(call.arguments.toPath || ""));
    context.onCommandOutput(call.id, `Renaming ${from.relativePath} -> ${to.relativePath}\n`);
    const fromStat = await fs.stat(from.absolutePath);
    const snapshot = fromStat.isFile() ? await this.files.snapshot(context.workspaceRoot, from.relativePath) : null;
    if (snapshot) assertFreshFileState(context.workspaceRoot, from.relativePath, snapshot, call.arguments.expectedPreviousHash);
    await fs.mkdir(path.dirname(to.absolutePath), { recursive: true });
    const finalTo = revalidateResolvedWorkspacePath(to);
    await this.options.beforeRenameCommit?.();
    if (snapshot) await assertPlannedFileFresh(this.files, context.workspaceRoot, from.relativePath, snapshot.sha256, false, "planned rename snapshot");
    if (await pathExists(finalTo.absolutePath)) {
      throw new Error(`Cannot rename ${from.relativePath} to ${to.relativePath}: destination already exists.`);
    }
    await fs.rename(from.absolutePath, finalTo.absolutePath);
    const afterSnapshot = fromStat.isFile() ? await this.files.maybeSnapshot(context.workspaceRoot, finalTo.relativePath) : null;
    if (afterSnapshot) recordFileObservation(context.workspaceRoot, afterSnapshot);
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

const readUndoBytes = async (filePath: string) => {
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size > MAX_UNDO_BYTES) return null;
  return fs.readFile(filePath);
};

const normalizeEncoding = (value: unknown): "utf8" | "base64" =>
  value === "base64" ? "base64" : "utf8";

const decodeBase64Content = (content: string) => {
  const normalized = content.replace(/\s/g, "");
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(normalized)) {
    throw new Error("content is not valid base64.");
  }
  return Buffer.from(normalized, "base64");
};

type EditOperation =
  | { type: "replace_range"; startLine: number; endLine: number; content: string }
  | { type: "delete_range"; startLine: number; endLine: number }
  | { type: "replace_text"; match: string; replacement: string; occurrence: "first" | "all"; caseSensitive: boolean }
  | { type: "insert_text"; match: string; position: "before" | "after"; content: string; occurrence: "first" | "all"; caseSensitive: boolean }
  | { type: "append"; content: string; ensureNewline: boolean };

const readEditOperations = (value: unknown): EditOperation[] => {
  if (!Array.isArray(value) || value.length === 0) throw new Error("desktop_edit_file requires a non-empty operations array.");
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Each edit operation must be an object.");
    const op = item as Record<string, unknown>;
    const type = String(op.type || op.kind || "");
    if (type === "replace_range") {
      return {
        type,
        startLine: readLineNumber(op.startLine ?? op.start_line, "startLine"),
        endLine: readLineNumber(op.endLine ?? op.end_line, "endLine"),
        content: String(op.content ?? ""),
      };
    }
    if (type === "delete_range") {
      return {
        type,
        startLine: readLineNumber(op.startLine ?? op.start_line, "startLine"),
        endLine: readLineNumber(op.endLine ?? op.end_line, "endLine"),
      };
    }
    if (type === "replace_text") {
      return {
        type,
        match: readNonEmptyString(op.match, "match"),
        replacement: String(op.replacement ?? ""),
        occurrence: op.occurrence === "all" ? "all" : "first",
        caseSensitive: op.caseSensitive === true || op.case_sensitive === true,
      };
    }
    if (type === "insert_text") {
      return {
        type,
        match: readNonEmptyString(op.match, "match"),
        position: op.position === "after" ? "after" : "before",
        content: String(op.content ?? ""),
        occurrence: op.occurrence === "all" ? "all" : "first",
        caseSensitive: op.caseSensitive === true || op.case_sensitive === true,
      };
    }
    if (type === "append") {
      return {
        type,
        content: String(op.content ?? ""),
        ensureNewline: op.ensureNewline !== false && op.ensure_newline !== false,
      };
    }
    throw new Error(`Unsupported edit operation: ${type || "(missing type)"}.`);
  });
};

const applyEditOperations = (content: string, operations: EditOperation[]) =>
  operations.reduce((next, operation) => applyEditOperation(next, operation), content.replace(/\r\n/g, "\n").replace(/\r/g, "\n"));

const applyEditOperation = (content: string, operation: EditOperation) => {
  if (operation.type === "replace_range" || operation.type === "delete_range") {
    const lines = content.split("\n");
    if (operation.startLine > lines.length || operation.endLine > lines.length || operation.startLine > operation.endLine) {
      throw new Error(`Invalid line range ${operation.startLine}-${operation.endLine}; file has ${lines.length} line(s).`);
    }
    const replacement = operation.type === "replace_range" ? operation.content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n") : [];
    lines.splice(operation.startLine - 1, operation.endLine - operation.startLine + 1, ...replacement);
    return lines.join("\n");
  }
  if (operation.type === "append") {
    const prefix = operation.ensureNewline && content && !content.endsWith("\n") ? "\n" : "";
    return `${content}${prefix}${operation.content}`;
  }
  if (operation.type === "replace_text") {
    return replaceText(content, operation.match, operation.replacement, operation.occurrence, operation.caseSensitive);
  }
  return insertText(content, operation.match, operation.content, operation.position, operation.occurrence, operation.caseSensitive);
};

const replaceText = (content: string, match: string, replacement: string, occurrence: "first" | "all", caseSensitive: boolean) => {
  const pattern = escapedPattern(match, caseSensitive, occurrence);
  if (!pattern.test(content)) throw new Error(`Text match not found: ${preview(match)}.`);
  pattern.lastIndex = 0;
  return content.replace(pattern, replacement);
};

const insertText = (
  content: string,
  match: string,
  insertion: string,
  position: "before" | "after",
  occurrence: "first" | "all",
  caseSensitive: boolean,
) => {
  const pattern = escapedPattern(match, caseSensitive, occurrence);
  if (!pattern.test(content)) throw new Error(`Text match not found: ${preview(match)}.`);
  pattern.lastIndex = 0;
  return content.replace(pattern, (found) => position === "before" ? `${insertion}${found}` : `${found}${insertion}`);
};

const escapedPattern = (match: string, caseSensitive: boolean, occurrence: "first" | "all") =>
  new RegExp(escapeRegExp(match), `${caseSensitive ? "" : "i"}${occurrence === "all" ? "g" : ""}`);

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const readLineNumber = (value: unknown, name: string) => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive 1-based line number.`);
  return parsed;
};

const readNonEmptyString = (value: unknown, name: string) => {
  const text = typeof value === "string" ? value : "";
  if (!text) throw new Error(`${name} must be a non-empty string.`);
  return text;
};

const preview = (value: string) =>
  JSON.stringify(value.slice(0, 120));

const assertUniquePatchTargets = (operations: ParsedPatchOperation[]) => {
  const seen = new Set<string>();
  for (const operation of operations) {
    for (const item of [operation.path, operation.kind === "update" ? operation.moveTo : undefined]) {
      if (!item) continue;
      const key = item.replace(/\\/g, "/").toLowerCase();
      if (seen.has(key)) {
        throw new Error(`Patch touches ${item} more than once; combine edits for each file into one patch section.`);
      }
      seen.add(key);
    }
  }
};

interface PlannedPatchChange {
  description: string;
  target: ReturnType<FileOperationService["resolve"]>;
  source?: ReturnType<FileOperationService["resolve"]>;
  before: FileSnapshot;
  after: string;
  afterHash: string | null;
  structured: ReturnType<typeof createStructuredDiff>;
  metadata: FileChangeMetadata;
  apply: () => Promise<void>;
}

interface PatchRollbackResult {
  path: string;
  success: boolean;
  error?: string;
}

const assertPlannedFileFresh = async (
  files: FileOperationService,
  workspaceRoot: string,
  relativePath: string,
  expectedHash: string | null,
  mustBeMissing: boolean,
  label: string,
) => {
  const current = await files.maybeSnapshot(workspaceRoot, relativePath);
  if (mustBeMissing && current) {
    throw new Error(`Cannot create ${relativePath}: file appeared after planning.`);
  }
  assertFreshFileState(workspaceRoot, relativePath, current, expectedHash, label);
};

const assertPlannedPatchChangeFresh = async (
  files: FileOperationService,
  workspaceRoot: string,
  change: PlannedPatchChange,
) => {
  if (!change.before.exists) {
    await assertPlannedFileFresh(files, workspaceRoot, change.target.relativePath, null, true, "planned patch snapshot");
    return;
  }
  const current = await files.snapshot(workspaceRoot, change.before.target.relativePath);
  assertFreshFileState(workspaceRoot, change.before.target.relativePath, current, change.before.sha256, "planned patch snapshot");
  if (change.source && change.source.absolutePath !== change.target.absolutePath && await files.maybeSnapshot(workspaceRoot, change.target.relativePath)) {
    throw new Error(`Cannot move ${change.source.relativePath} to ${change.target.relativePath}: destination appeared after patch planning.`);
  }
};

const rollbackPatchChanges = async (
  applied: PlannedPatchChange[],
  context: ToolExecutionContext,
  beforeRollback?: (change: PlannedPatchChange, index: number) => Promise<void> | void,
) => {
  const results: PatchRollbackResult[] = [];
  const reversed = [...applied].reverse();
  for (const [index, change] of reversed.entries()) {
    try {
      await beforeRollback?.(change, index);
      if (!change.before.exists) {
        await assertRollbackTargetMatches(context.workspaceRoot, change);
        await fs.rm(change.target.absolutePath, { force: true, recursive: false });
      } else {
        if (change.source && change.source.absolutePath !== change.target.absolutePath) {
          await assertRollbackTargetMatches(context.workspaceRoot, change);
          const sourceSnapshot = await new FileOperationService().maybeSnapshot(context.workspaceRoot, change.source.relativePath);
          if (sourceSnapshot) {
            if (sourceSnapshot.sha256 !== change.before.sha256) {
              throw new Error(`Cannot rollback ${change.source.relativePath}: source path was recreated after the move.`);
            }
            await fs.rm(change.target.absolutePath, { force: true, recursive: false });
            recordFileObservation(context.workspaceRoot, sourceSnapshot);
            results.push({ path: change.target.relativePath, success: true });
            continue;
          }
          await fs.rm(change.target.absolutePath, { force: true, recursive: false });
          await fs.mkdir(path.dirname(change.source.absolutePath), { recursive: true });
          await atomicWriteFile(change.source.absolutePath, change.before.content, "utf8");
          const snapshot = await new FileOperationService().maybeSnapshot(context.workspaceRoot, change.source.relativePath);
          if (snapshot) recordFileObservation(context.workspaceRoot, snapshot);
        } else {
          await assertRollbackTargetMatches(context.workspaceRoot, change);
          await fs.mkdir(path.dirname(change.target.absolutePath), { recursive: true });
          await atomicWriteFile(change.target.absolutePath, change.before.content, "utf8");
          const snapshot = await new FileOperationService().maybeSnapshot(context.workspaceRoot, change.target.relativePath);
          if (snapshot) recordFileObservation(context.workspaceRoot, snapshot);
        }
      }
      results.push({ path: change.target.relativePath, success: true });
    } catch (error) {
      results.push({
        path: change.target.relativePath,
        success: false,
        error: error instanceof Error ? error.message : "rollback failed",
      });
    }
  }
  return results;
};

const assertRollbackTargetMatches = async (workspaceRoot: string, change: PlannedPatchChange) => {
  const files = new FileOperationService();
  const current = await files.maybeSnapshot(workspaceRoot, change.target.relativePath);
  if (change.afterHash === null) {
    if (current) throw new Error(`Cannot rollback ${change.target.relativePath}: path was recreated after patch delete.`);
    return;
  }
  if (!current || current.sha256 !== change.afterHash) {
    throw new Error(`Cannot rollback ${change.target.relativePath}: current file no longer matches the patch-written content.`);
  }
};

const readHashMap = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [normalizePatchPath(key), item]))
    : {};

const normalizePatchPath = (value: string) =>
  value.replace(/\\/g, "/");

const pathExists = async (targetPath: string) => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
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
