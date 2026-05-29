import fs from "node:fs/promises";
import path from "node:path";
import type {
  ToolEventRecord,
  TurnUndoConflictRecord,
  TurnUndoOperationRecord,
  TurnUndoRecord,
} from "../../shared/types";
import type { DesktopStore } from "../db/store";
import { resolveWorkspacePath } from "../security/pathSandbox";

const now = () => Date.now();

export class TurnUndoCoordinator {
  constructor(
    private store: DesktopStore,
    private isThreadBusy: (threadId: string) => boolean,
  ) {}

  prepare(messageId: string): TurnUndoRecord | null {
    const existing = this.store.getTurnUndo(messageId);
    if (existing && existing.status !== "available" && existing.status !== "failed") return existing;

    const message = this.store.getMessage(messageId);
    if (!message || message.role !== "assistant") return null;

    const thread = this.store.getThread(message.threadId);
    const tools = this.store.listToolEvents(message.threadId).filter((tool) => tool.messageId === messageId);
    const operations = collectUndoOperations(tools);
    if (operations.length === 0) return null;

    const timestamp = now();
    const summary = summarizeTurnUndo(tools, operations);
    const record: TurnUndoRecord = {
      id: existing?.id || messageId,
      threadId: message.threadId,
      messageId,
      workspaceId: thread?.workspaceId ?? null,
      status: "available",
      operations,
      summary,
      conflicts: [],
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    return this.store.upsertTurnUndo(record);
  }

  async undo(messageId: string): Promise<TurnUndoRecord | null> {
    const prepared = this.prepare(messageId);
    if (!prepared) return null;
    if (this.isThreadBusy(prepared.threadId)) {
      return this.store.upsertTurnUndo({
        ...prepared,
        status: "failed",
        error: "Wait for the current run to finish before undoing this turn.",
        updatedAt: now(),
      });
    }
    if (prepared.status === "undone") return prepared;

    const workspace = this.store.getWorkspace(prepared.workspaceId);
    if (!workspace) {
      return this.store.upsertTurnUndo({
        ...prepared,
        status: "failed",
        error: "Workspace is no longer available.",
        updatedAt: now(),
      });
    }

    let record = this.store.upsertTurnUndo({
      ...prepared,
      status: "undoing",
      error: undefined,
      conflicts: [],
      updatedAt: now(),
    });

    const conflicts: TurnUndoConflictRecord[] = [];
    for (const operation of [...record.operations].reverse()) {
      const conflict = await applyUndoOperation(workspace.path, operation);
      if (conflict) conflicts.push(conflict);
    }

    record = this.store.upsertTurnUndo({
      ...record,
      status: conflicts.length > 0 ? "partially_undone" : "undone",
      conflicts,
      updatedAt: now(),
    });
    return record;
  }
}

const collectUndoOperations = (tools: ToolEventRecord[]): TurnUndoOperationRecord[] =>
  tools
    .filter((tool) => tool.status === "done" && tool.result?.success !== false)
    .sort((a, b) => a.createdAt - b.createdAt)
    .flatMap((tool) => normalizeUndoPayload(tool.result?.data?.undo));

const normalizeUndoPayload = (value: unknown): TurnUndoOperationRecord[] => {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.filter(isUndoOperation);
};

const isUndoOperation = (value: unknown): value is TurnUndoOperationRecord => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.type === "restore_file") {
    return typeof candidate.path === "string" &&
      typeof candidate.existed === "boolean" &&
      typeof candidate.previous === "string";
  }
  if (candidate.type === "rename_path") {
    return typeof candidate.fromPath === "string" && typeof candidate.toPath === "string";
  }
  return false;
};

const summarizeTurnUndo = (tools: ToolEventRecord[], operations: TurnUndoOperationRecord[]): TurnUndoRecord["summary"] => {
  const diffFiles = tools.flatMap((tool) => tool.diffFiles || []);
  const paths = Array.from(new Set([
    ...diffFiles.map((file) => file.path),
    ...operations.flatMap((operation) => operation.type === "restore_file"
      ? [operation.path, operation.restorePath].filter((item): item is string => Boolean(item))
      : [operation.fromPath, operation.toPath]),
  ]));
  return {
    files: paths.length,
    additions: diffFiles.reduce((sum, file) => sum + file.additions, 0),
    deletions: diffFiles.reduce((sum, file) => sum + file.deletions, 0),
    paths,
  };
};

const applyUndoOperation = async (
  workspaceRoot: string,
  operation: TurnUndoOperationRecord,
): Promise<TurnUndoConflictRecord | null> => {
  if (operation.type === "rename_path") return undoRename(workspaceRoot, operation);
  return undoRestore(workspaceRoot, operation);
};

const undoRename = async (
  workspaceRoot: string,
  operation: Extract<TurnUndoOperationRecord, { type: "rename_path" }>,
): Promise<TurnUndoConflictRecord | null> => {
  const from = resolveWorkspacePath(workspaceRoot, operation.fromPath);
  const to = resolveWorkspacePath(workspaceRoot, operation.toPath);
  const fromExists = await pathExists(from.absolutePath);
  const toExists = await pathExists(to.absolutePath);
  if (!fromExists) return { path: operation.fromPath, reason: "Current renamed path no longer exists." };
  if (toExists) return { path: operation.toPath, reason: "Original path already exists." };
  await fs.mkdir(path.dirname(to.absolutePath), { recursive: true });
  await fs.rename(from.absolutePath, to.absolutePath);
  return null;
};

const undoRestore = async (
  workspaceRoot: string,
  operation: Extract<TurnUndoOperationRecord, { type: "restore_file" }>,
): Promise<TurnUndoConflictRecord | null> => {
  const currentTarget = resolveWorkspacePath(workspaceRoot, operation.path);
  const restoreTarget = resolveWorkspacePath(workspaceRoot, operation.restorePath || operation.path);
  const current = await readTextIfExists(currentTarget.absolutePath);
  if (operation.expectedCurrent !== undefined && current !== operation.expectedCurrent) {
    return { path: operation.path, reason: "File changed after this turn." };
  }

  if (!operation.existed) {
    if (current !== null) await fs.rm(currentTarget.absolutePath, { force: false });
    return null;
  }

  await fs.mkdir(path.dirname(restoreTarget.absolutePath), { recursive: true });
  await fs.writeFile(restoreTarget.absolutePath, operation.previous, "utf8");
  if (operation.restorePath && currentTarget.absolutePath !== restoreTarget.absolutePath && current !== null) {
    await fs.rm(currentTarget.absolutePath, { force: false });
  }
  return null;
};

const readTextIfExists = async (filePath: string) => {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return null;
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
};

const pathExists = async (filePath: string) => {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
};
