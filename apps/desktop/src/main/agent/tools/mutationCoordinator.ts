import fs from "node:fs/promises";
import path from "node:path";
import type { DesktopToolCall, ToolDiffFileRecord, ToolResult } from "../../../shared/types";
import { resolveExistingWorkspacePath, resolveWorkspacePath, revalidateResolvedWorkspacePath } from "../../security/pathSandbox";
import { atomicWriteFile } from "../../storage/atomicWrite";
import {
  createRenameDiff,
  createStructuredDiff,
  formatDeltaFromDiffFiles,
  formatUnifiedDiffFiles,
} from "./diffFormatter";
import {
  changeMetadata,
  createMissingFileSnapshot,
  FileOperationService,
  freshnessWarnings,
  hashBuffer,
  hashMatches,
  hashText,
  recordFileObservation,
  type FileChangeMetadata,
  type FileSnapshot,
} from "./fileOperationService";
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
  encoding?: "utf8" | "base64";
}

interface RenameUndo {
  type: "rename_path";
  fromPath: string;
  toPath: string;
}

type UndoOperation = RestoreFileUndo | RenameUndo;

export class FileMutationCoordinator {
  private files = new FileOperationService();

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
    const warnings = [
      ...freshnessWarnings(context.workspaceRoot, existing),
      ...collectHashWarnings(target.relativePath, call.arguments.expectedPreviousHash, existing?.sha256 || null),
    ];
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
    const warnings = [
      ...freshnessWarnings(context.workspaceRoot, before),
      ...collectHashWarnings(before.target.relativePath, call.arguments.expectedPreviousHash, before.sha256),
    ];
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
          structured,
          metadata,
          apply: async () => {
            await fs.mkdir(path.dirname(target.absolutePath), { recursive: true });
            const revalidatedTarget = revalidateResolvedWorkspacePath(target);
            await atomicWriteFile(revalidatedTarget.absolutePath, operation.content, "utf8");
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
      context.onCommandOutput(call.id, `Deleting ${before.target.relativePath}\n`);
        warnings.push(...freshnessWarnings(context.workspaceRoot, before), ...collectHashWarnings(before.target.relativePath, expectedHashes[before.target.relativePath], before.sha256));
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
      context.onCommandOutput(call.id, `${operation.moveTo ? "Moving" : "Editing"} ${before.target.relativePath}\n`);
      warnings.push(...freshnessWarnings(context.workspaceRoot, before), ...collectHashWarnings(before.target.relativePath, expectedHashes[before.target.relativePath], before.sha256));
      operation.hunks.forEach((hunk) => emitPatchPreview(context, call.id, before.target.relativePath, hunk.lines));
      const previous = before.content;
      const next = operation.hunks.length ? applyPatchHunks(previous, operation.hunks, before.target.relativePath) : previous;
      const finalTarget = operation.moveTo
        ? this.files.resolve(context.workspaceRoot, operation.moveTo)
        : before.target;
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
        structured,
        metadata,
        apply: async () => {
          await fs.mkdir(path.dirname(finalTarget.absolutePath), { recursive: true });
          const revalidatedTarget = revalidateResolvedWorkspacePath(finalTarget);
          await atomicWriteFile(revalidatedTarget.absolutePath, next, "utf8");
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

    for (const change of planned) {
      await change.apply();
      const snapshot = await this.files.maybeSnapshot(context.workspaceRoot, change.target.relativePath);
      if (snapshot) recordFileObservation(context.workspaceRoot, snapshot);
      context.onCommandOutput(call.id, `${change.description} ${formatDeltaFromDiffFiles(change.structured.diffFiles)}\n`);
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
    const from = resolveExistingWorkspacePath(context.workspaceRoot, String(call.arguments.fromPath || ""));
    const to = resolveWorkspacePath(context.workspaceRoot, String(call.arguments.toPath || ""));
    context.onCommandOutput(call.id, `Renaming ${from.relativePath} -> ${to.relativePath}\n`);
    await fs.mkdir(path.dirname(to.absolutePath), { recursive: true });
    const finalTo = revalidateResolvedWorkspacePath(to);
    await fs.rename(from.absolutePath, finalTo.absolutePath);
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

interface PlannedPatchChange {
  description: string;
  target: ReturnType<FileOperationService["resolve"]>;
  source?: ReturnType<FileOperationService["resolve"]>;
  before: FileSnapshot;
  after: string;
  structured: ReturnType<typeof createStructuredDiff>;
  metadata: FileChangeMetadata;
  apply: () => Promise<void>;
}

const readHashMap = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const collectHashWarnings = (filePath: string, expected: unknown, actual: string | null) =>
  hashMatches(expected, actual)
    ? [`${filePath} current sha256 does not match expectedPreviousHash; continuing because hash checks are warnings only.`]
    : [];

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
