import fs from "node:fs/promises";
import { prepareGitReversal, readGitHead } from "./rewindGit";
import path from "node:path";
import type {
  ToolEventRecord,
  TurnUndoConflictRecord,
  TurnUndoOperationRecord,
  TurnUndoRecord,
  RewindMessageResult,
} from "../../shared/types";
import type { DesktopStore } from "../db/store";
import { resolveExistingWorkspacePath, resolveWorkspacePath } from "../security/pathSandbox";

const now = () => Date.now();

export class TurnUndoCoordinator {
  constructor(
    private store: DesktopStore,
    private isThreadBusy: (threadId: string) => boolean,
  ) {}

  async rewind(messageId: string): Promise<RewindMessageResult> {
    const message = this.store.getMessage(messageId);
    if (!message || message.role !== "user") throw new Error("Choose a user message to edit.");
    if (message.steeredTurnId) throw new Error("Edit the original prompt for this turn; a steer cannot undo only part of a turn.");
    const thread = this.store.getThread(message.threadId);
    if (!thread) throw new Error("Chat is no longer available.");
    if (thread.lastWorkspaceMove && message.createdAt <= thread.lastWorkspaceMove.at) throw new Error("This message belongs to the chat’s previous project. Rewinding across a project move is disabled to protect files in both folders.");
    const removed = [message, ...this.store.listMessagesAfter(thread.id, message.id)];
    const allChildren = this.store.listSubagents(thread.id);
    const roots = allChildren.filter((agent) => agent.parentThreadId === thread.id && removed.some((item) => item.id === agent.parentMessageId));
    const children = allChildren.filter((agent) => roots.some((root) => agent.agentPath === root.agentPath || agent.agentPath.startsWith(`${root.agentPath}/`)));
    if (this.isThreadBusy(thread.id) || children.some((agent) => this.isThreadBusy(agent.threadId))) {
      throw new Error("Stop the current run before editing an earlier message.");
    }
    // A remote command can outlive its chat turn. Never erase its audit record or replay it.
    if (thread.workspaceId && this.store.listSecurityJobs(thread.workspaceId)
      .some((job) => [thread.id, ...children.map((agent) => agent.threadId)].includes(job.threadId) && ["submitting", "queued", "running", "unknown", "stop_requested"].includes(job.state))) {
      throw new Error("Finish or reconcile the remaining Kali jobs before rewinding this chat.");
    }
    const turns = [...removed, ...children.flatMap((agent) => this.store.listMessages(agent.threadId))].filter((item) => item.role === "assistant");
    const tools = turns.flatMap((item) => this.store.listToolEventsForMessage(item.threadId, item.id))
      .sort((a, b) => (a.endedAt || a.updatedAt) - (b.endedAt || b.updatedAt) || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    const records = turns.map((item) => this.prepare(item.id)).filter((item): item is TurnUndoRecord => Boolean(item));
    if (records.some((record) => ["undoing", "partially_undone"].includes(record.status))) {
      throw new Error("Resolve the existing partial undo before rewinding this chat.");
    }
    const alreadyUndone = new Set(records.filter((record) => record.status === "undone").map((record) => record.messageId));
    const operations = [...tools].reverse().filter((tool) => !alreadyUndone.has(tool.messageId) && tool.status === "done" && tool.result?.success !== false)
      .flatMap((tool) => [...normalizeUndoPayload(tool.result?.data?.undo)].reverse());
    let gitReversal: Awaited<ReturnType<typeof prepareGitReversal>> = null;
    let notice: string | undefined;
    if (operations.length) {
      const workspace = this.store.getWorkspace(thread.workspaceId);
      if (!workspace) throw new Error("Workspace is no longer available.");
      if (!tools.some((tool) => typeof tool.result?.data?.gitHeadBefore === "string") && await readGitHead(workspace.path)) {
        notice = "Recorded files were restored. This older turn has no Git checkpoint, so its commits were kept.";
      }
      gitReversal = await prepareGitReversal(workspace.path, tools, operations);
      await preflightUndo(workspace.path, operations);
      // Parent and child tools can interleave. Restore their combined mutation
      // chain by completion order rather than undoing each child independently.
      try {
        for (const operation of operations) {
          const conflict = await applyUndoOperation(workspace.path, operation);
          if (conflict) throw new Error(`${conflict.path}: ${conflict.reason}`);
        }
      } catch (error) {
        for (const record of records) this.store.upsertTurnUndo({ ...record, status: "partially_undone", updatedAt: now(), error: "File restoration was interrupted. Chat history was kept; review the changes." });
        throw error;
      }
    }
    for (const record of records) this.store.upsertTurnUndo({ ...record, status: "undone", conflicts: [], error: undefined, updatedAt: now() });
    let gitCommit: string | undefined;
    try { gitCommit = await gitReversal?.commit(); }
    catch (error) {
      for (const record of records) this.store.upsertTurnUndo({ ...record, status: "partially_undone", updatedAt: now(), error: "Files were restored, but the Git reversal commit failed. Review Git before continuing." });
      throw error;
    }
    // Hydrate attachments before pruning their stored artifacts.
    message.attachments = message.attachments?.map((attachment) => ({
      ...attachment,
      url: attachment.base64 ? `data:${attachment.mimeType};base64,${attachment.base64}` : attachment.url,
    }));
    this.store.pruneThreadAfterMessage(thread.id, message.id, true);
    return { message, removedMessageIds: removed.map((item) => item.id), gitCommit, notice };
  }

  prepare(messageId: string): TurnUndoRecord | null {
    const original = this.store.getMessage(messageId);
    const moved = original && this.store.getThread(original.threadId)?.lastWorkspaceMove;
    if (moved && original.createdAt <= moved.at) return null;
    const existing = this.store.getTurnUndo(messageId);
    if (existing && existing.status !== "available" && existing.status !== "failed") return existing;

    const message = this.store.getMessage(messageId);
    if (!message || message.role !== "assistant") return null;

    const thread = this.store.getThread(message.threadId);
    const tools = this.store.listToolEventsForMessage(message.threadId, messageId);
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
    const message = this.store.getMessage(messageId);
    const moved = message && this.store.getThread(message.threadId)?.lastWorkspaceMove;
    if (moved && message.createdAt <= moved.at) throw new Error("This turn belongs to the previous project. Undo across a project move is disabled to protect both folders.");
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
      try {
        const conflict = await applyUndoOperation(workspace.path, operation);
        if (conflict) conflicts.push(conflict);
      } catch (error) {
        conflicts.push({ path: operation.type === "restore_file" ? operation.path : operation.fromPath, reason: error instanceof Error ? error.message : "File restoration failed." });
        break;
      }
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
  const from = resolveExistingWorkspacePath(workspaceRoot, operation.fromPath);
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
  const current = operation.encoding === "base64"
    ? await readBase64IfExists(currentTarget.absolutePath)
    : await readTextIfExists(currentTarget.absolutePath);
  if (operation.expectedCurrent !== undefined && current !== operation.expectedCurrent) {
    return { path: operation.path, reason: "File changed after this turn." };
  }

  if (!operation.existed) {
    if (current !== null) await fs.rm(currentTarget.absolutePath, { force: false });
    return null;
  }

  await fs.mkdir(path.dirname(restoreTarget.absolutePath), { recursive: true });
  if (operation.encoding === "base64") {
    await fs.writeFile(restoreTarget.absolutePath, Buffer.from(operation.previous, "base64"));
  } else {
    await fs.writeFile(restoreTarget.absolutePath, operation.previous, "utf8");
  }
  if (operation.restorePath && currentTarget.absolutePath !== restoreTarget.absolutePath && current !== null) {
    await fs.rm(currentTarget.absolutePath, { force: false });
  }
  return null;
};

const readBase64IfExists = async (filePath: string) => {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return null;
    return (await fs.readFile(filePath)).toString("base64");
  } catch {
    return null;
  }
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

// Simulate the entire reverse chain before touching files. Later turns may have
// edited the same file; checking each turn against today's content would be wrong.
const preflightUndo = async (root: string, operations: TurnUndoOperationRecord[]) => {
  const contents = new Map<string, Buffer | null>();
  const read = async (relative: string) => {
    const target = resolveWorkspacePath(root, relative).absolutePath;
    if (!contents.has(target)) {
      try { contents.set(target, await fs.readFile(target)); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        contents.set(target, null);
      }
    }
    return { target, buffer: contents.get(target)! };
  };
  for (const operation of operations) {
    if (operation.type === "rename_path") {
      const from = await read(operation.fromPath);
      const to = await read(operation.toPath);
      if (from.buffer === null || to.buffer !== null) throw new Error(`Cannot restore ${operation.toPath}: its paths changed after the turn.`);
      contents.set(to.target, from.buffer);
      contents.set(from.target, null);
      continue;
    }
    const current = await read(operation.path);
    const encoding = operation.encoding === "base64" ? "base64" : "utf8";
    if (operation.expectedCurrent !== undefined && (current.buffer?.toString(encoding) ?? null) !== operation.expectedCurrent) {
      throw new Error(`Cannot restore ${operation.path}: it changed after the agent's turn. Your changes and chat were kept.`);
    }
    const restore = resolveWorkspacePath(root, operation.restorePath || operation.path).absolutePath;
    if (restore !== current.target) {
      const previous = await read(operation.restorePath!);
      if (previous.buffer !== null) throw new Error(`Cannot restore ${operation.restorePath}: the original path already exists.`);
      contents.set(current.target, null);
    }
    contents.set(restore, operation.existed ? Buffer.from(operation.previous, encoding) : null);
  }
};
