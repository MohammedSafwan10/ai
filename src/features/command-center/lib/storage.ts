import {
  createId,
  db,
  type CommandActivityAction,
  type CommandActivityRecord,
  type CommandActivitySource,
  type CommandActivityStatus,
  type CommandAgentSessionRecord,
  type CommandNoteRecord,
  type CommandScheduleBlockRecord,
  type CommandTargetType,
  type CommandTaskPriority,
  type CommandTaskRecord,
  type CommandTaskStatus,
  type FinanceEntryRecord,
  type FinanceEntryType,
} from "../../../lib/db";

export type CommandSection = "tasks" | "schedule" | "notes" | "finance" | "activity";

const normalizeTags = (tags?: string[] | string) => {
  if (Array.isArray(tags)) {
    return tags.map(tag => tag.trim()).filter(Boolean).slice(0, 12);
  }
  return (tags || "")
    .split(",")
    .map(tag => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
};

const includesQuery = (values: Array<string | undefined>, query: string) => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return values.some(value => (value || "").toLowerCase().includes(needle));
};

export const sectionForTargetType = (targetType?: CommandTargetType): CommandSection => {
  if (targetType === "task") return "tasks";
  if (targetType === "schedule") return "schedule";
  if (targetType === "note") return "notes";
  if (targetType === "finance") return "finance";
  return "activity";
};

export async function loadCommandTasks() {
  return db.commandTasks.orderBy("updatedAt").reverse().toArray();
}

export async function loadCommandNotes() {
  return db.commandNotes.orderBy("updatedAt").reverse().toArray();
}

export async function loadFinanceEntries() {
  return db.financeEntries.orderBy("occurredAt").reverse().toArray();
}

export async function loadCommandScheduleBlocks() {
  return db.commandScheduleBlocks.orderBy("startAt").toArray();
}

export async function loadCommandActivity(limit = 120) {
  const activity = await db.commandActivity.orderBy("createdAt").reverse().toArray();
  return activity.filter(item => !item.archivedAt).slice(0, limit);
}

export async function loadCommandSessions(limit = 80) {
  const sessions = await db.commandSessions.orderBy("updatedAt").reverse().toArray();
  return sessions.filter(session => !session.archivedAt).slice(0, limit);
}

export async function archiveCommandHistory() {
  const archivedAt = Date.now();
  await db.transaction("rw", db.commandActivity, db.commandSessions, async () => {
    await db.commandActivity.toCollection().modify({ archivedAt });
    await db.commandSessions.toCollection().modify({ archivedAt });
  });
}

export async function createCommandSession(input: Omit<CommandAgentSessionRecord, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
  const now = Date.now();
  const session: CommandAgentSessionRecord = {
    ...input,
    id: input.id || createId("cmd_session"),
    createdAt: now,
    updatedAt: now,
  };
  await db.commandSessions.put(session);
  return session;
}

export async function updateCommandSession(id: string, patch: Partial<CommandAgentSessionRecord>) {
  await db.commandSessions.update(id, { ...patch, updatedAt: Date.now() });
  return db.commandSessions.get(id);
}

export async function searchCommandTasks(query: string) {
  const tasks = await loadCommandTasks();
  return tasks.filter(task =>
    includesQuery([task.title, task.description, task.tags?.join(" ")], query) &&
    task.status !== "archived"
  );
}

export async function searchCommandNotes(query: string) {
  const notes = await loadCommandNotes();
  return notes.filter(note =>
    includesQuery([note.title, note.markdown, note.tags?.join(" ")], query) &&
    !note.archived
  );
}

export async function searchFinanceEntries(query: string) {
  const entries = await loadFinanceEntries();
  return entries.filter(entry =>
    includesQuery([entry.category, entry.note, entry.currency], query)
  );
}

export async function searchCommandScheduleBlocks(query: string) {
  const blocks = await loadCommandScheduleBlocks();
  return blocks.filter(block => includesQuery([block.title, block.notes], query));
}

export async function recordCommandActivity(activity: Omit<CommandActivityRecord, "id" | "createdAt" | "updatedAt"> & { id?: string; createdAt?: number }) {
  const now = Date.now();
  const record: CommandActivityRecord = {
    ...activity,
    id: activity.id || createId("cmd_activity"),
    createdAt: activity.createdAt || now,
    updatedAt: now,
  };
  await db.commandActivity.put(record);
  return record;
}

export async function updateCommandActivity(id: string, patch: Partial<CommandActivityRecord>) {
  await db.commandActivity.update(id, { ...patch, updatedAt: Date.now() });
  return db.commandActivity.get(id);
}

export async function createCommandTask(input: {
  title: string;
  description?: string;
  status?: CommandTaskStatus;
  priority?: CommandTaskPriority;
  dueAt?: number;
  tags?: string[] | string;
  sourceChatMessageId?: string;
  source?: CommandActivitySource;
  chatId?: string;
  messageId?: string;
  toolCallId?: string;
  sessionId?: string;
}) {
  const now = Date.now();
  const task: CommandTaskRecord = {
    id: createId("task"),
    title: input.title.trim() || "Untitled task",
    description: input.description?.trim() || undefined,
    status: input.status || "todo",
    priority: input.priority || "medium",
    dueAt: input.dueAt,
    tags: normalizeTags(input.tags),
    sourceChatMessageId: input.sourceChatMessageId,
    createdAt: now,
    updatedAt: now,
  };
  const activity = await recordCommandActivity({
    source: input.source || "manual",
    action: "create",
    targetType: "task",
    targetId: task.id,
    title: task.title,
    status: "done",
    after: task,
    chatId: input.chatId,
    messageId: input.messageId,
    toolCallId: input.toolCallId,
    sessionId: input.sessionId,
    undoState: "available",
  });
  await db.commandTasks.put(task);
  return { record: task, activity };
}

export async function updateCommandTask(id: string, patch: Partial<Omit<CommandTaskRecord, "id" | "createdAt" | "tags">> & { tags?: string[] | string }, meta: {
  source?: CommandActivitySource;
  action?: CommandActivityAction;
  chatId?: string;
  messageId?: string;
  toolCallId?: string;
  sessionId?: string;
} = {}) {
  const before = await db.commandTasks.get(id);
  if (!before) throw new Error("Task not found.");
  const next: CommandTaskRecord = {
    ...before,
    ...patch,
    title: patch.title?.trim() || before.title,
    description: patch.description !== undefined ? patch.description?.trim() || undefined : before.description,
    tags: patch.tags !== undefined ? normalizeTags(patch.tags) : before.tags,
    updatedAt: Date.now(),
  };
  await db.commandTasks.put(next);
  const activity = await recordCommandActivity({
    source: meta.source || "manual",
    action: meta.action || "update",
    targetType: "task",
    targetId: next.id,
    title: next.title,
    status: "done",
    before,
    after: next,
    chatId: meta.chatId,
    messageId: meta.messageId,
    toolCallId: meta.toolCallId,
    sessionId: meta.sessionId,
    undoState: "available",
  });
  return { record: next, activity };
}

export async function deleteCommandTask(id: string, meta: {
  source?: CommandActivitySource;
  chatId?: string;
  messageId?: string;
  toolCallId?: string;
  sessionId?: string;
} = {}) {
  const before = await db.commandTasks.get(id);
  if (!before) throw new Error("Task not found.");
  await db.commandTasks.delete(id);
  const activity = await recordCommandActivity({
    source: meta.source || "manual",
    action: "delete",
    targetType: "task",
    targetId: id,
    title: before.title,
    status: "done",
    before,
    chatId: meta.chatId,
    messageId: meta.messageId,
    toolCallId: meta.toolCallId,
    sessionId: meta.sessionId,
    undoState: "available",
  });
  return { record: before, activity };
}

export async function createCommandNote(input: {
  title: string;
  markdown?: string;
  tags?: string[] | string;
  pinned?: boolean;
  archived?: boolean;
  sourceChatMessageId?: string;
  source?: CommandActivitySource;
  chatId?: string;
  messageId?: string;
  toolCallId?: string;
  sessionId?: string;
}) {
  const now = Date.now();
  const note: CommandNoteRecord = {
    id: createId("note"),
    title: input.title.trim() || "Untitled note",
    markdown: input.markdown?.trim() || "",
    tags: normalizeTags(input.tags),
    pinned: Boolean(input.pinned),
    archived: Boolean(input.archived),
    sourceChatMessageId: input.sourceChatMessageId,
    createdAt: now,
    updatedAt: now,
  };
  await db.commandNotes.put(note);
  const activity = await recordCommandActivity({
    source: input.source || "manual",
    action: "create",
    targetType: "note",
    targetId: note.id,
    title: note.title,
    status: "done",
    after: note,
    chatId: input.chatId,
    messageId: input.messageId,
    toolCallId: input.toolCallId,
    sessionId: input.sessionId,
    undoState: "available",
  });
  return { record: note, activity };
}

export async function updateCommandNote(id: string, patch: Partial<Omit<CommandNoteRecord, "id" | "createdAt" | "tags">> & { tags?: string[] | string }, meta: {
  source?: CommandActivitySource;
  action?: CommandActivityAction;
  chatId?: string;
  messageId?: string;
  toolCallId?: string;
  sessionId?: string;
} = {}) {
  const before = await db.commandNotes.get(id);
  if (!before) throw new Error("Note not found.");
  const next: CommandNoteRecord = {
    ...before,
    ...patch,
    title: patch.title?.trim() || before.title,
    markdown: patch.markdown !== undefined ? patch.markdown : before.markdown,
    tags: patch.tags !== undefined ? normalizeTags(patch.tags) : before.tags,
    updatedAt: Date.now(),
  };
  await db.commandNotes.put(next);
  const activity = await recordCommandActivity({
    source: meta.source || "manual",
    action: meta.action || "update",
    targetType: "note",
    targetId: next.id,
    title: next.title,
    status: "done",
    before,
    after: next,
    chatId: meta.chatId,
    messageId: meta.messageId,
    toolCallId: meta.toolCallId,
    sessionId: meta.sessionId,
    undoState: "available",
  });
  return { record: next, activity };
}

export async function appendCommandNote(id: string, text: string, meta: {
  source?: CommandActivitySource;
  chatId?: string;
  messageId?: string;
  toolCallId?: string;
  sessionId?: string;
} = {}) {
  const before = await db.commandNotes.get(id);
  if (!before) throw new Error("Note not found.");
  const separator = before.markdown.trim() ? "\n\n" : "";
  return updateCommandNote(id, { markdown: `${before.markdown}${separator}${text.trim()}` }, { ...meta, action: "update" });
}

export async function deleteCommandNote(id: string, meta: {
  source?: CommandActivitySource;
  chatId?: string;
  messageId?: string;
  toolCallId?: string;
  sessionId?: string;
} = {}) {
  const before = await db.commandNotes.get(id);
  if (!before) throw new Error("Note not found.");
  await db.commandNotes.delete(id);
  const activity = await recordCommandActivity({
    source: meta.source || "manual",
    action: "delete",
    targetType: "note",
    targetId: id,
    title: before.title,
    status: "done",
    before,
    chatId: meta.chatId,
    messageId: meta.messageId,
    toolCallId: meta.toolCallId,
    sessionId: meta.sessionId,
    undoState: "available",
  });
  return { record: before, activity };
}

export async function createFinanceEntry(input: {
  type: FinanceEntryType;
  amount: number;
  currency?: string;
  category?: string;
  note?: string;
  occurredAt?: number;
  sourceChatMessageId?: string;
  source?: CommandActivitySource;
  chatId?: string;
  messageId?: string;
  toolCallId?: string;
  sessionId?: string;
}) {
  const now = Date.now();
  const entry: FinanceEntryRecord = {
    id: createId("finance"),
    type: input.type,
    amount: Number.isFinite(Number(input.amount)) ? Math.max(0, Number(input.amount)) : 0,
    currency: (input.currency || "INR").trim().toUpperCase(),
    category: input.category?.trim() || "General",
    note: input.note?.trim() || undefined,
    occurredAt: input.occurredAt || now,
    sourceChatMessageId: input.sourceChatMessageId,
    createdAt: now,
    updatedAt: now,
  };
  await db.financeEntries.put(entry);
  const activity = await recordCommandActivity({
    source: input.source || "manual",
    action: "create",
    targetType: "finance",
    targetId: entry.id,
    title: `${entry.type === "income" ? "Income" : "Expense"} ${entry.currency} ${entry.amount}`,
    status: "done",
    after: entry,
    chatId: input.chatId,
    messageId: input.messageId,
    toolCallId: input.toolCallId,
    sessionId: input.sessionId,
    undoState: "available",
  });
  return { record: entry, activity };
}

export async function updateFinanceEntry(id: string, patch: Partial<Omit<FinanceEntryRecord, "id" | "createdAt">>, meta: {
  source?: CommandActivitySource;
  action?: CommandActivityAction;
  chatId?: string;
  messageId?: string;
  toolCallId?: string;
  sessionId?: string;
} = {}) {
  const before = await db.financeEntries.get(id);
  if (!before) throw new Error("Finance entry not found.");
  const next: FinanceEntryRecord = {
    ...before,
    ...patch,
    amount: patch.amount !== undefined && Number.isFinite(Number(patch.amount)) ? Math.max(0, Number(patch.amount)) : before.amount,
    currency: patch.currency !== undefined ? patch.currency.trim().toUpperCase() : before.currency,
    category: patch.category !== undefined ? patch.category.trim() || "General" : before.category,
    note: patch.note !== undefined ? patch.note?.trim() || undefined : before.note,
    updatedAt: Date.now(),
  };
  await db.financeEntries.put(next);
  const activity = await recordCommandActivity({
    source: meta.source || "manual",
    action: meta.action || "update",
    targetType: "finance",
    targetId: next.id,
    title: `${next.type === "income" ? "Income" : "Expense"} ${next.currency} ${next.amount}`,
    status: "done",
    before,
    after: next,
    chatId: meta.chatId,
    messageId: meta.messageId,
    toolCallId: meta.toolCallId,
    sessionId: meta.sessionId,
    undoState: "available",
  });
  return { record: next, activity };
}

export async function deleteFinanceEntry(id: string, meta: {
  source?: CommandActivitySource;
  chatId?: string;
  messageId?: string;
  toolCallId?: string;
  sessionId?: string;
} = {}) {
  const before = await db.financeEntries.get(id);
  if (!before) throw new Error("Finance entry not found.");
  await db.financeEntries.delete(id);
  const activity = await recordCommandActivity({
    source: meta.source || "manual",
    action: "delete",
    targetType: "finance",
    targetId: id,
    title: `${before.type === "income" ? "Income" : "Expense"} ${before.currency} ${before.amount}`,
    status: "done",
    before,
    chatId: meta.chatId,
    messageId: meta.messageId,
    toolCallId: meta.toolCallId,
    sessionId: meta.sessionId,
    undoState: "available",
  });
  return { record: before, activity };
}

export async function createCommandScheduleBlock(input: {
  title: string;
  startAt: number;
  endAt?: number;
  allDay?: boolean;
  taskId?: string;
  notes?: string;
  sourceChatMessageId?: string;
  source?: CommandActivitySource;
  chatId?: string;
  messageId?: string;
  toolCallId?: string;
  sessionId?: string;
}) {
  const now = Date.now();
  const endAt = input.endAt && input.endAt > input.startAt ? input.endAt : input.startAt + 30 * 60 * 1000;
  const block: CommandScheduleBlockRecord = {
    id: createId("schedule"),
    title: input.title.trim() || "Scheduled block",
    startAt: input.startAt,
    endAt,
    allDay: Boolean(input.allDay),
    taskId: input.taskId || undefined,
    notes: input.notes?.trim() || undefined,
    sourceChatMessageId: input.sourceChatMessageId,
    createdAt: now,
    updatedAt: now,
  };
  await db.commandScheduleBlocks.put(block);
  const activity = await recordCommandActivity({
    source: input.source || "manual",
    action: "create",
    targetType: "schedule",
    targetId: block.id,
    title: block.title,
    status: "done",
    after: block,
    chatId: input.chatId,
    messageId: input.messageId,
    toolCallId: input.toolCallId,
    sessionId: input.sessionId,
    undoState: "available",
  });
  return { record: block, activity };
}

export async function updateCommandScheduleBlock(id: string, patch: Partial<Omit<CommandScheduleBlockRecord, "id" | "createdAt">>, meta: {
  source?: CommandActivitySource;
  action?: CommandActivityAction;
  chatId?: string;
  messageId?: string;
  toolCallId?: string;
  sessionId?: string;
} = {}) {
  const before = await db.commandScheduleBlocks.get(id);
  if (!before) throw new Error("Schedule block not found.");
  const next: CommandScheduleBlockRecord = {
    ...before,
    ...patch,
    title: patch.title?.trim() || before.title,
    notes: patch.notes !== undefined ? patch.notes?.trim() || undefined : before.notes,
    endAt: patch.endAt && patch.endAt > (patch.startAt ?? before.startAt) ? patch.endAt : before.endAt,
    updatedAt: Date.now(),
  };
  await db.commandScheduleBlocks.put(next);
  const activity = await recordCommandActivity({
    source: meta.source || "manual",
    action: meta.action || "update",
    targetType: "schedule",
    targetId: next.id,
    title: next.title,
    status: "done",
    before,
    after: next,
    chatId: meta.chatId,
    messageId: meta.messageId,
    toolCallId: meta.toolCallId,
    sessionId: meta.sessionId,
    undoState: "available",
  });
  return { record: next, activity };
}

export async function deleteCommandScheduleBlock(id: string, meta: {
  source?: CommandActivitySource;
  chatId?: string;
  messageId?: string;
  toolCallId?: string;
  sessionId?: string;
} = {}) {
  const before = await db.commandScheduleBlocks.get(id);
  if (!before) throw new Error("Schedule block not found.");
  await db.commandScheduleBlocks.delete(id);
  const activity = await recordCommandActivity({
    source: meta.source || "manual",
    action: "delete",
    targetType: "schedule",
    targetId: id,
    title: before.title,
    status: "done",
    before,
    chatId: meta.chatId,
    messageId: meta.messageId,
    toolCallId: meta.toolCallId,
    sessionId: meta.sessionId,
    undoState: "available",
  });
  return { record: before, activity };
}

export async function undoCommandActivity(activityId: string) {
  const activity = await db.commandActivity.get(activityId);
  if (!activity || activity.undoState !== "available") {
    throw new Error("Undo is not available for this action.");
  }

  if (activity.targetType === "task") {
    if (activity.action === "create" && activity.targetId) await db.commandTasks.delete(activity.targetId);
    else if (activity.before) await db.commandTasks.put(activity.before as CommandTaskRecord);
  }
  if (activity.targetType === "note") {
    if (activity.action === "create" && activity.targetId) await db.commandNotes.delete(activity.targetId);
    else if (activity.before) await db.commandNotes.put(activity.before as CommandNoteRecord);
  }
  if (activity.targetType === "finance") {
    if (activity.action === "create" && activity.targetId) await db.financeEntries.delete(activity.targetId);
    else if (activity.before) await db.financeEntries.put(activity.before as FinanceEntryRecord);
  }
  if (activity.targetType === "schedule") {
    if (activity.action === "create" && activity.targetId) await db.commandScheduleBlocks.delete(activity.targetId);
    else if (activity.before) await db.commandScheduleBlocks.put(activity.before as CommandScheduleBlockRecord);
  }

  await updateCommandActivity(activity.id, { status: "undone", undoState: "used" });
  await recordCommandActivity({
    source: "manual",
    action: "restore",
    targetType: activity.targetType,
    targetId: activity.targetId,
    title: `Undid ${activity.title}`,
    status: "done",
    before: activity.after,
    after: activity.before,
    undoState: "unavailable",
  });
  return activity;
}

const snapshotsMatch = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

async function getCommandTargetSnapshot(activity: CommandActivityRecord) {
  if (!activity.targetId) return undefined;
  if (activity.targetType === "task") return db.commandTasks.get(activity.targetId);
  if (activity.targetType === "note") return db.commandNotes.get(activity.targetId);
  if (activity.targetType === "finance") return db.financeEntries.get(activity.targetId);
  return db.commandScheduleBlocks.get(activity.targetId);
}

export async function undoCommandSession(sessionId: string) {
  const activities = (await db.commandActivity.where("sessionId").equals(sessionId).toArray())
    .filter(activity => activity.status === "done" && activity.undoState === "available")
    .sort((a, b) => b.createdAt - a.createdAt);
  const conflicts: CommandActivityRecord[] = [];
  const undone: CommandActivityRecord[] = [];

  for (const activity of activities) {
    const current = await getCommandTargetSnapshot(activity);
    const expected = activity.action === "delete" ? undefined : activity.after;
    if (!snapshotsMatch(current, expected)) {
      conflicts.push(activity);
      continue;
    }
    await undoCommandActivity(activity.id);
    undone.push(activity);
  }

  await updateCommandSession(sessionId, {
    status: conflicts.length > 0 ? "partially_undone" : "undone",
    error: conflicts.length > 0 ? `${conflicts.length} newer change${conflicts.length === 1 ? "" : "s"} kept during undo.` : undefined,
  });
  return { undone, conflicts };
}

async function applyCommandActivityAfterSnapshot(activity: CommandActivityRecord) {
  if (!activity.targetId) return;
  if (activity.targetType === "task") {
    if (activity.after) await db.commandTasks.put(activity.after as CommandTaskRecord);
    else await db.commandTasks.delete(activity.targetId);
  }
  if (activity.targetType === "note") {
    if (activity.after) await db.commandNotes.put(activity.after as CommandNoteRecord);
    else await db.commandNotes.delete(activity.targetId);
  }
  if (activity.targetType === "finance") {
    if (activity.after) await db.financeEntries.put(activity.after as FinanceEntryRecord);
    else await db.financeEntries.delete(activity.targetId);
  }
  if (activity.targetType === "schedule") {
    if (activity.after) await db.commandScheduleBlocks.put(activity.after as CommandScheduleBlockRecord);
    else await db.commandScheduleBlocks.delete(activity.targetId);
  }
}

export async function redoCommandSession(sessionId: string) {
  const activities = (await db.commandActivity.where("sessionId").equals(sessionId).toArray())
    .filter(activity => activity.status === "undone" && activity.undoState === "used")
    .sort((a, b) => a.createdAt - b.createdAt);
  const conflicts: CommandActivityRecord[] = [];
  const redone: CommandActivityRecord[] = [];

  for (const activity of activities) {
    const current = await getCommandTargetSnapshot(activity);
    const expected = activity.action === "create" ? undefined : activity.before;
    if (!snapshotsMatch(current, expected)) {
      conflicts.push(activity);
      continue;
    }
    await applyCommandActivityAfterSnapshot(activity);
    await updateCommandActivity(activity.id, { status: "done", undoState: "available" });
    await recordCommandActivity({
      source: "manual",
      action: "restore",
      targetType: activity.targetType,
      targetId: activity.targetId,
      title: `Redid ${activity.title}`,
      status: "done",
      before: activity.before,
      after: activity.after,
      undoState: "unavailable",
    });
    redone.push(activity);
  }

  await updateCommandSession(sessionId, {
    status: conflicts.length > 0 ? "partially_redone" : "completed",
    error: conflicts.length > 0 ? `${conflicts.length} newer change${conflicts.length === 1 ? "" : "s"} kept during redo.` : undefined,
  });
  return { redone, conflicts };
}

export const getStatusTone = (status: CommandActivityStatus) => {
  if (status === "done") return "text-emerald-600 dark:text-emerald-300";
  if (status === "failed") return "text-red-500";
  if (status === "pending") return "text-amber-600 dark:text-amber-300";
  if (status === "running") return "text-[var(--privora-accent)]";
  return "text-[var(--privora-muted)]";
};
