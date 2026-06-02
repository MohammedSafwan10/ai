import {
  createId,
  db,
  type CommandActivityRecord,
  type CommandAgentAction,
  type CommandScheduleBlockRecord,
  type CommandTargetType,
  type CommandTaskPriority,
  type CommandTaskStatus,
  type FinanceEntryType,
} from "../../../lib/db";
import {
  appendCommandNote,
  createCommandNote,
  createCommandTask,
  createFinanceEntry,
  createCommandScheduleBlock,
  deleteCommandNote,
  deleteCommandTask,
  deleteFinanceEntry,
  recordCommandActivity,
  searchCommandNotes,
  searchCommandTasks,
  searchFinanceEntries,
  searchCommandScheduleBlocks,
  updateCommandNote,
  updateCommandTask,
  updateFinanceEntry,
  updateCommandScheduleBlock,
  deleteCommandScheduleBlock,
} from "./storage";
import type { CommandFunctionResponse } from "./provider";

export type CommandToolName =
  | "createTask"
  | "updateTask"
  | "completeTask"
  | "deleteTask"
  | "searchTasks"
  | "createNote"
  | "appendNote"
  | "updateNote"
  | "deleteNote"
  | "searchNotes"
  | "createScheduleBlock"
  | "updateScheduleBlock"
  | "deleteScheduleBlock"
  | "searchScheduleBlocks"
  | "findFreeSlots"
  | "addFinanceEntry"
  | "updateFinanceEntry"
  | "deleteFinanceEntry"
  | "summarizeFinance";

export interface CommandToolCall {
  id?: string;
  tool: CommandToolName;
  arguments: Record<string, unknown>;
}

export interface CommandToolExecutionContext {
  chatId: string;
  messageId: string;
  userMessageId: string;
  sessionId?: string;
}

export interface CommandToolExecutionResult {
  action: CommandAgentAction;
  summary: string;
  pendingCall?: CommandToolCall;
  response: CommandFunctionResponse;
}

const taskTools = new Set<CommandToolName>(["createTask", "updateTask", "completeTask", "deleteTask", "searchTasks"]);
const noteTools = new Set<CommandToolName>(["createNote", "appendNote", "updateNote", "deleteNote", "searchNotes"]);
const scheduleTools = new Set<CommandToolName>(["createScheduleBlock", "updateScheduleBlock", "deleteScheduleBlock", "searchScheduleBlocks", "findFreeSlots"]);

const getTargetTypeForTool = (tool: CommandToolName): CommandTargetType => {
  if (taskTools.has(tool)) return "task";
  if (noteTools.has(tool)) return "note";
  if (scheduleTools.has(tool)) return "schedule";
  return "finance";
};

const getCommandTargetLabel = (targetType: CommandTargetType) => {
  if (targetType === "finance") return "finance entry";
  if (targetType === "schedule") return "scheduled block";
  return targetType;
};

const describeCommandActionTarget = (action: Pick<CommandAgentAction, "targetType" | "targetTitle">) => {
  const label = getCommandTargetLabel(action.targetType);
  const title = action.targetTitle?.trim();
  return title ? `the ${label} "${title}"` : `this ${label}`;
};

export const getCommandPendingConfirmationMessage = (action?: Pick<CommandAgentAction, "action" | "targetType" | "targetTitle" | "confirmationKind">) => {
  if (!action) return "I need your confirmation before making that change.";
  const target = describeCommandActionTarget(action);
  if (action.confirmationKind === "duplicate") {
    return action.targetType === "task"
      ? `I found an existing match for ${target}. Update that task, create another, or cancel?`
      : `I found an existing match for ${target}. Keep the existing entry, create another, or cancel?`;
  }
  if (action.confirmationKind === "conflict") return `That time overlaps with another scheduled block. Schedule it anyway, find another time, or cancel?`;
  if (action.action === "delete") return `I found ${target}. Delete it?`;
  if (action.targetType === "finance") return `I can update ${target}. Confirm before I change the amount or date.`;
  if (action.targetType === "schedule") return `I can update ${target}. Confirm before I change its time.`;
  return `I can update ${target}. Confirm before I change it.`;
};

export const getCommandCompletedMessage = (action: Pick<CommandAgentAction, "action" | "detail" | "targetType" | "targetTitle">) => {
  const target = describeCommandActionTarget(action);
  if (action.action === "delete") return `Deleted ${target}.`;
  if (action.action === "complete") return `Marked ${target} done.`;
  if (action.action === "create") return `Created ${target}.`;
  if (action.action === "update") return `Updated ${target}.`;
  return action.detail ? `${action.detail}: ${action.targetTitle}.` : "Done.";
};

export const getCommandCancelledMessage = (action: Pick<CommandAgentAction, "targetType" | "targetTitle" | "confirmationKind">) =>
  action.confirmationKind === "duplicate"
    ? `Okay, I did not create another item matching ${describeCommandActionTarget(action)}.`
    : `Okay, I left ${describeCommandActionTarget(action)} unchanged.`;

const asString = (value: unknown, fallback = "") => typeof value === "string" ? value.trim() : fallback;
const asNumber = (value: unknown, fallback = 0) => {
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : fallback;
};
const asBoolean = (value: unknown) => value === true || value === "true";
const asTags = (value: unknown) => {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map(item => item.trim()).filter(Boolean);
  return undefined;
};
const asTimestamp = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeComparableText = (value?: string) => (value || "").trim().toLowerCase().replace(/\s+/g, " ");
const localDay = (timestamp?: number) => timestamp ? new Date(timestamp).toLocaleDateString("en-CA") : "";
const formatScheduleMoment = (timestamp?: number) => timestamp
  ? new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(timestamp))
  : "";

const resolveScheduleRange = (args: Record<string, unknown>) => {
  const startAt = asTimestamp(args.startAt);
  if (!startAt) return undefined;
  const durationMinutes = Math.max(15, asNumber(args.durationMinutes, 30));
  const endAt = asTimestamp(args.endAt) || startAt + durationMinutes * 60 * 1000;
  return { startAt, endAt: endAt > startAt ? endAt : startAt + 30 * 60 * 1000 };
};

const findScheduleOverlap = async (range: { startAt: number; endAt: number }, excludeId?: string) =>
  (await db.commandScheduleBlocks.toArray()).find(block =>
    block.id !== excludeId && block.startAt < range.endAt && block.endAt > range.startAt
  );

const findDuplicateTarget = async (call: CommandToolCall) => {
  const args = call.arguments || {};
  if (call.tool === "createTask") {
    const title = normalizeComparableText(asString(args.title));
    const dueDay = localDay(asTimestamp(args.dueAt || args.date));
    if (!title) return undefined;
    return (await db.commandTasks.toArray()).find(task =>
      task.status !== "archived" &&
      normalizeComparableText(task.title) === title &&
      localDay(task.dueAt) === dueDay
    );
  }
  if (call.tool === "addFinanceEntry") {
    const date = asTimestamp(args.occurredAt || args.date) || Date.now();
    const type = (asString(args.type, "expense") as FinanceEntryType) === "income" ? "income" : "expense";
    const currency = asString(args.currency, "INR").toUpperCase();
    const amount = asNumber(args.amount);
    const category = normalizeComparableText(asString(args.category, "General"));
    const note = normalizeComparableText(asString(args.note));
    return (await db.financeEntries.toArray()).find(entry =>
      entry.type === type &&
      entry.currency === currency &&
      entry.amount === amount &&
      normalizeComparableText(entry.category) === category &&
      normalizeComparableText(entry.note) === note &&
      localDay(entry.occurredAt) === localDay(date)
    );
  }
  if (call.tool === "createScheduleBlock") {
    const range = resolveScheduleRange(args);
    const title = normalizeComparableText(asString(args.title));
    if (!range || !title) return undefined;
    return (await db.commandScheduleBlocks.toArray()).find(block =>
      block.startAt === range.startAt &&
      block.endAt === range.endAt &&
      (normalizeComparableText(block.title) === title || (asString(args.taskId) && block.taskId === asString(args.taskId)))
    );
  }
  return undefined;
};

const getToolTitle = async (call: CommandToolCall): Promise<string> => {
  const args = call.arguments || {};
  const explicit = asString(args.title) || asString(args.note) || asString(args.query);
  if (explicit) return explicit.slice(0, 90);
  const id = asString(args.id);
  if (id) {
    if (getTargetTypeForTool(call.tool) === "task") return (await db.commandTasks.get(id))?.title || id;
    if (getTargetTypeForTool(call.tool) === "note") return (await db.commandNotes.get(id))?.title || id;
    if (getTargetTypeForTool(call.tool) === "schedule") return (await db.commandScheduleBlocks.get(id))?.title || id;
    const entry = await db.financeEntries.get(id);
    if (entry) return `${entry.type === "income" ? "Income" : "Expense"} ${entry.currency} ${entry.amount}`;
  }
  return call.tool;
};

const needsConfirmation = (call: CommandToolCall) => {
  if (call.tool === "deleteTask" || call.tool === "deleteNote" || call.tool === "deleteFinanceEntry") return true;
  if (call.tool === "updateFinanceEntry") {
    return call.arguments.amount !== undefined || call.arguments.occurredAt !== undefined || call.arguments.date !== undefined;
  }
  if (call.tool === "deleteScheduleBlock") return true;
  if (call.tool === "updateScheduleBlock") {
    return call.arguments.startAt !== undefined || call.arguments.endAt !== undefined || call.arguments.durationMinutes !== undefined || call.arguments.allDay !== undefined;
  }
  return false;
};

const makeAction = ({
  call,
  status,
  title,
  detail,
  activity,
  error,
  requiresConfirmation,
  confirmationKind,
  changePreview,
  existingTargetId,
}: {
  call: CommandToolCall;
  status: CommandAgentAction["status"];
  title: string;
  detail?: string;
  activity?: CommandActivityRecord;
  error?: string;
  requiresConfirmation?: boolean;
  confirmationKind?: CommandAgentAction["confirmationKind"];
  changePreview?: string;
  existingTargetId?: string;
}): CommandAgentAction => ({
  id: call.id || createId("cmd_action"),
  toolName: call.tool,
  action:
    call.tool.startsWith("search") || call.tool === "summarizeFinance" || call.tool === "findFreeSlots" ? "search" :
    call.tool.startsWith("delete") ? "delete" :
    call.tool === "completeTask" ? "complete" :
    call.tool.startsWith("create") || call.tool === "addFinanceEntry" ? "create" :
    "update",
  targetType: getTargetTypeForTool(call.tool),
  targetId: activity?.targetId || asString(call.arguments?.id) || undefined,
  targetTitle: title,
  status,
  detail,
  error,
  activityId: activity?.id,
  requiresConfirmation,
  confirmationKind,
  changePreview,
  existingTargetId,
  canUndo: activity?.undoState === "available",
  createdAt: activity?.createdAt || Date.now(),
  completedAt: status === "done" || status === "failed" ? Date.now() : undefined,
});

export async function buildCommandCenterSummary() {
  const [tasks, notes, finance] = await Promise.all([
    db.commandTasks.orderBy("updatedAt").reverse().limit(16).toArray(),
    db.commandNotes.orderBy("updatedAt").reverse().limit(12).toArray(),
    db.financeEntries.orderBy("occurredAt").reverse().limit(18).toArray(),
  ]);

  const openTasks = tasks.filter(task => task.status !== "done" && task.status !== "archived");
  const recentExpenses = finance.filter(entry => entry.type === "expense").slice(0, 8);
  return [
    "Current Command Center summary:",
    `Open tasks: ${openTasks.length ? openTasks.map(task => `${task.id}: ${task.title} (${task.status}, ${task.priority})`).join("; ") : "none"}.`,
    `Recent notes: ${notes.length ? notes.map(note => `${note.id}: ${note.title}`).join("; ") : "none"}.`,
    `Recent finance: ${recentExpenses.length ? recentExpenses.map(entry => `${entry.id}: ${entry.currency} ${entry.amount} ${entry.category}`).join("; ") : "none"}.`,
  ].join("\n");
}

export async function buildCommandCenterRequestContext(prompt: string) {
  const [tasks, notes, finance, schedule] = await Promise.all([
    db.commandTasks.toArray(),
    db.commandNotes.toArray(),
    db.financeEntries.toArray(),
    db.commandScheduleBlocks.toArray(),
  ]);
  const today = localDay(Date.now());
  const terms = normalizeComparableText(prompt).split(" ").filter(term => term.length >= 4).slice(0, 8);
  const thisMonth = new Date().getMonth();
  const thisYear = new Date().getFullYear();
  const todayTasks = tasks.filter(task => task.status !== "done" && task.status !== "archived" && (!task.dueAt || localDay(task.dueAt) === today)).slice(0, 8);
  const relevantNotes = notes.filter(note => !note.archived && terms.some(term => normalizeComparableText(`${note.title} ${note.markdown}`).includes(term))).slice(0, 5);
  const monthEntries = finance.filter(entry => {
    const date = new Date(entry.occurredAt);
    return date.getMonth() === thisMonth && date.getFullYear() === thisYear;
  });
  const expense = monthEntries.filter(entry => entry.type === "expense").reduce((sum, entry) => sum + entry.amount, 0);
  const income = monthEntries.filter(entry => entry.type === "income").reduce((sum, entry) => sum + entry.amount, 0);
  const topCategories = monthEntries
    .filter(entry => entry.type === "expense")
    .reduce<Record<string, number>>((totals, entry) => {
      totals[entry.category] = (totals[entry.category] || 0) + entry.amount;
      return totals;
    }, {});
  const categoryText = Object.entries(topCategories).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([category, amount]) => `${category} INR ${amount.toFixed(2)}`).join("; ");
  const upcomingSchedule = schedule
    .filter(block => block.endAt >= Date.now())
    .sort((left, right) => left.startAt - right.startAt)
    .slice(0, 8);
  return [
    "Relevant Command Center context:",
    `Today's incomplete tasks: ${todayTasks.length ? todayTasks.map(task => `${task.id}: ${task.title}`).join("; ") : "none"}.`,
    `Matching notes: ${relevantNotes.length ? relevantNotes.map(note => `${note.id}: ${note.title}`).join("; ") : "none"}.`,
    `This month's finance totals: income INR ${income.toFixed(2)}, expense INR ${expense.toFixed(2)}; top expense categories: ${categoryText || "none"}.`,
    `Upcoming scheduled blocks: ${upcomingSchedule.length ? upcomingSchedule.map(block => `${block.id}: ${block.title} (${formatScheduleMoment(block.startAt)} to ${formatScheduleMoment(block.endAt)})`).join("; ") : "none"}.`,
  ].join("\n");
}

export async function executeCommandToolCall(call: CommandToolCall, context: CommandToolExecutionContext, options: { force?: boolean } = {}): Promise<CommandToolExecutionResult> {
  const title = await getToolTitle(call);
  const duplicateTarget = !options.force ? await findDuplicateTarget(call) : undefined;
  const scheduleRange = call.tool === "createScheduleBlock" || call.tool === "updateScheduleBlock" ? resolveScheduleRange(call.arguments) : undefined;
  const scheduleOverlap = !options.force && scheduleRange
    ? await findScheduleOverlap(scheduleRange, call.tool === "updateScheduleBlock" ? asString(call.arguments.id) : undefined)
    : undefined;
  if (!options.force && (needsConfirmation(call) || duplicateTarget || scheduleOverlap)) {
    const financeBefore = call.tool === "updateFinanceEntry" && asString(call.arguments.id)
      ? await db.financeEntries.get(asString(call.arguments.id))
      : undefined;
    const proposedAmount = call.arguments.amount !== undefined ? asNumber(call.arguments.amount) : undefined;
    const proposedDate = asTimestamp(call.arguments.occurredAt || call.arguments.date);
    const scheduleBefore = call.tool === "updateScheduleBlock" && asString(call.arguments.id)
      ? await db.commandScheduleBlocks.get(asString(call.arguments.id))
      : undefined;
    const changePreview = financeBefore
      ? [
          proposedAmount !== undefined && proposedAmount !== financeBefore.amount
            ? `${financeBefore.currency} ${financeBefore.amount} -> ${financeBefore.currency} ${proposedAmount}` : "",
          proposedDate && localDay(proposedDate) !== localDay(financeBefore.occurredAt)
            ? `${localDay(financeBefore.occurredAt)} -> ${localDay(proposedDate)}` : "",
        ].filter(Boolean).join(" · ")
      : scheduleBefore && scheduleRange
        ? `${formatScheduleMoment(scheduleBefore.startAt)} - ${formatScheduleMoment(scheduleBefore.endAt)} -> ${formatScheduleMoment(scheduleRange.startAt)} - ${formatScheduleMoment(scheduleRange.endAt)}`
        : scheduleOverlap
          ? `Conflicts with ${scheduleOverlap.title} (${formatScheduleMoment(scheduleOverlap.startAt)} - ${formatScheduleMoment(scheduleOverlap.endAt)})`
          : undefined;
    const activity = await recordCommandActivity({
      source: "ai",
      action: call.tool.startsWith("delete") ? "delete" : call.tool.startsWith("create") ? "create" : "update",
      targetType: getTargetTypeForTool(call.tool),
      targetId: duplicateTarget?.id || asString(call.arguments.id) || undefined,
      title,
      status: "pending",
      chatId: context.chatId,
      messageId: context.messageId,
      sessionId: context.sessionId,
      toolCallId: call.id,
      before: call.arguments,
      undoState: "unavailable",
    });
    return {
      action: makeAction({
        call,
        status: "pending",
        title,
        detail: scheduleOverlap ? "Time conflict" : call.tool.startsWith("delete") ? "Confirm delete" : "Confirm update",
        activity,
        requiresConfirmation: true,
        ...(duplicateTarget ? { confirmationKind: "duplicate" as const, existingTargetId: duplicateTarget.id } : {}),
        ...(scheduleOverlap && !duplicateTarget ? { confirmationKind: "conflict" as const, existingTargetId: scheduleOverlap.id } : {}),
        ...(changePreview ? { changePreview } : {}),
      }),
      summary: duplicateTarget ? `Possible duplicate found: ${title}` : `Waiting for confirmation: ${title}`,
      pendingCall: call,
      response: {
        success: false,
        status: "pending_confirmation",
        output: duplicateTarget
          ? `A likely duplicate already exists. Wait for the user to choose whether to create another or use the existing item.`
          : scheduleOverlap
            ? `This schedule block overlaps with "${scheduleOverlap.title}". Wait for the user to choose schedule anyway, find another time, or cancel.`
          : `Waiting for user confirmation before running ${call.tool}.`,
        data: {
          tool: call.tool,
          title,
          targetType: getTargetTypeForTool(call.tool),
          targetId: asString(call.arguments.id) || undefined,
          existingTargetId: duplicateTarget?.id,
          conflictingTargetId: scheduleOverlap?.id,
          changePreview,
        },
      },
    };
  }

  const args = call.arguments || {};
  let activity: CommandActivityRecord | undefined;
  let detail = "";
  let responseData: Record<string, unknown> | undefined;

  if (call.tool === "createTask") {
    const result = await createCommandTask({
      title: asString(args.title, "Untitled task"),
      description: asString(args.description) || undefined,
      priority: (asString(args.priority, "medium") as CommandTaskPriority) || "medium",
      dueAt: asTimestamp(args.dueAt || args.date),
      tags: asTags(args.tags),
      sourceChatMessageId: context.userMessageId,
      source: "ai",
      chatId: context.chatId,
      messageId: context.messageId,
      toolCallId: call.id,
      sessionId: context.sessionId,
    });
    activity = result.activity;
    detail = "Task created";
    responseData = { task: result.record };
  } else if (call.tool === "updateTask") {
    const result = await updateCommandTask(asString(args.id), {
      title: asString(args.title) || undefined,
      description: args.description !== undefined ? asString(args.description) : undefined,
      status: asString(args.status) as CommandTaskStatus || undefined,
      priority: asString(args.priority) as CommandTaskPriority || undefined,
      dueAt: asTimestamp(args.dueAt || args.date),
      tags: args.tags !== undefined ? asTags(args.tags) : undefined,
    }, { source: "ai", chatId: context.chatId, messageId: context.messageId, sessionId: context.sessionId, toolCallId: call.id });
    activity = result.activity;
    detail = "Task updated";
    responseData = { task: result.record };
  } else if (call.tool === "completeTask") {
    const result = await updateCommandTask(asString(args.id), { status: "done" }, {
      source: "ai",
      action: "complete",
      chatId: context.chatId,
      messageId: context.messageId,
      toolCallId: call.id,
      sessionId: context.sessionId,
    });
    activity = result.activity;
    detail = "Task completed";
    responseData = { task: result.record };
  } else if (call.tool === "deleteTask") {
    const result = await deleteCommandTask(asString(args.id), { source: "ai", chatId: context.chatId, messageId: context.messageId, sessionId: context.sessionId, toolCallId: call.id });
    activity = result.activity;
    detail = "Task deleted";
    responseData = { task: result.record };
  } else if (call.tool === "searchTasks") {
    const results = await searchCommandTasks(asString(args.query));
    detail = `${results.length} task${results.length === 1 ? "" : "s"} found`;
    responseData = {
      count: results.length,
      tasks: results.slice(0, 12).map(task => ({
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        dueAt: task.dueAt,
        tags: task.tags,
      })),
    };
  } else if (call.tool === "createNote") {
    const result = await createCommandNote({
      title: asString(args.title, "Untitled note"),
      markdown: asString(args.markdown || args.content),
      tags: asTags(args.tags),
      pinned: asBoolean(args.pinned),
      sourceChatMessageId: context.userMessageId,
      source: "ai",
      chatId: context.chatId,
      messageId: context.messageId,
      toolCallId: call.id,
      sessionId: context.sessionId,
    });
    activity = result.activity;
    detail = "Note created";
    responseData = { note: result.record };
  } else if (call.tool === "appendNote") {
    const result = await appendCommandNote(asString(args.id), asString(args.markdown || args.content), {
      source: "ai",
      chatId: context.chatId,
      messageId: context.messageId,
      toolCallId: call.id, sessionId: context.sessionId,
    });
    activity = result.activity;
    detail = "Note appended";
    responseData = { note: result.record };
  } else if (call.tool === "updateNote") {
    const result = await updateCommandNote(asString(args.id), {
      title: asString(args.title) || undefined,
      markdown: args.markdown !== undefined || args.content !== undefined ? asString(args.markdown || args.content) : undefined,
      tags: args.tags !== undefined ? asTags(args.tags) : undefined,
      pinned: args.pinned !== undefined ? asBoolean(args.pinned) : undefined,
      archived: args.archived !== undefined ? asBoolean(args.archived) : undefined,
    }, { source: "ai", chatId: context.chatId, messageId: context.messageId, sessionId: context.sessionId, toolCallId: call.id });
    activity = result.activity;
    detail = "Note updated";
    responseData = { note: result.record };
  } else if (call.tool === "deleteNote") {
    const result = await deleteCommandNote(asString(args.id), { source: "ai", chatId: context.chatId, messageId: context.messageId, sessionId: context.sessionId, toolCallId: call.id });
    activity = result.activity;
    detail = "Note deleted";
    responseData = { note: result.record };
  } else if (call.tool === "searchNotes") {
    const results = await searchCommandNotes(asString(args.query));
    detail = `${results.length} note${results.length === 1 ? "" : "s"} found`;
    responseData = {
      count: results.length,
      notes: results.slice(0, 10).map(note => ({
        id: note.id,
        title: note.title,
        excerpt: note.markdown.slice(0, 700),
        tags: note.tags,
        pinned: note.pinned,
        archived: note.archived,
      })),
    };
  } else if (call.tool === "createScheduleBlock") {
    const range = resolveScheduleRange(args);
    if (!range) throw new Error("A specific start time is required before scheduling a block.");
    const result = await createCommandScheduleBlock({
      title: asString(args.title, "Scheduled block"),
      startAt: range.startAt,
      endAt: range.endAt,
      allDay: asBoolean(args.allDay),
      taskId: asString(args.taskId) || undefined,
      notes: asString(args.notes) || undefined,
      sourceChatMessageId: context.userMessageId,
      source: "ai",
      chatId: context.chatId,
      messageId: context.messageId,
      toolCallId: call.id,
      sessionId: context.sessionId,
    });
    activity = result.activity;
    detail = `Scheduled ${result.record.title} for ${formatScheduleMoment(result.record.startAt)}`;
    responseData = { scheduleBlock: result.record, usedDefaultDuration: args.endAt === undefined && args.durationMinutes === undefined };
  } else if (call.tool === "updateScheduleBlock") {
    const range = resolveScheduleRange(args);
    const result = await updateCommandScheduleBlock(asString(args.id), {
      title: asString(args.title) || undefined,
      ...(range ? { startAt: range.startAt, endAt: range.endAt } : {}),
      allDay: args.allDay !== undefined ? asBoolean(args.allDay) : undefined,
      taskId: args.taskId !== undefined ? asString(args.taskId) || undefined : undefined,
      notes: args.notes !== undefined ? asString(args.notes) || undefined : undefined,
    }, { source: "ai", chatId: context.chatId, messageId: context.messageId, sessionId: context.sessionId, toolCallId: call.id });
    activity = result.activity;
    detail = "Scheduled block updated";
    responseData = { scheduleBlock: result.record };
  } else if (call.tool === "deleteScheduleBlock") {
    const result = await deleteCommandScheduleBlock(asString(args.id), { source: "ai", chatId: context.chatId, messageId: context.messageId, sessionId: context.sessionId, toolCallId: call.id });
    activity = result.activity;
    detail = "Scheduled block deleted";
    responseData = { scheduleBlock: result.record };
  } else if (call.tool === "searchScheduleBlocks") {
    const results = await searchCommandScheduleBlocks(asString(args.query));
    detail = `${results.length} scheduled block${results.length === 1 ? "" : "s"} found`;
    responseData = { count: results.length, scheduleBlocks: results.slice(0, 12) };
  } else if (call.tool === "findFreeSlots") {
    const startAt = asTimestamp(args.startAt);
    const endAt = asTimestamp(args.endAt);
    const duration = Math.max(15, asNumber(args.durationMinutes, 30)) * 60 * 1000;
    if (!startAt || !endAt || endAt <= startAt) throw new Error("A valid time range is required to find free slots.");
    const blocks = (await db.commandScheduleBlocks.toArray()).filter(block => block.endAt > startAt && block.startAt < endAt).sort((a, b) => a.startAt - b.startAt);
    const candidates: Array<{ startAt: number; endAt: number }> = [];
    const parseClock = (value: unknown, fallbackHour: number) => {
      const match = asString(value).match(/^(\d{1,2}):(\d{2})$/);
      return match ? { hour: Math.min(23, Number(match[1])), minute: Math.min(59, Number(match[2])) } : { hour: fallbackHour, minute: 0 };
    };
    const windowStart = parseClock(args.dailyWindowStart, 6);
    const windowEnd = parseClock(args.dailyWindowEnd, 23);
    const dayCursor = new Date(startAt);
    dayCursor.setHours(0, 0, 0, 0);
    while (dayCursor.getTime() < endAt && candidates.length < 5) {
      const candidateStart = new Date(dayCursor);
      candidateStart.setHours(windowStart.hour, windowStart.minute, 0, 0);
      const candidateEnd = new Date(dayCursor);
      candidateEnd.setHours(windowEnd.hour, windowEnd.minute, 0, 0);
      const rangeStart = Math.max(startAt, candidateStart.getTime());
      const rangeEnd = Math.min(endAt, candidateEnd.getTime());
      let cursor = rangeStart;
      for (const block of blocks.filter(item => item.endAt > rangeStart && item.startAt < rangeEnd)) {
        if (block.startAt - cursor >= duration) candidates.push({ startAt: cursor, endAt: cursor + duration });
        cursor = Math.max(cursor, block.endAt);
        if (candidates.length >= 5) break;
      }
      if (candidates.length < 5 && rangeEnd - cursor >= duration) candidates.push({ startAt: cursor, endAt: cursor + duration });
      dayCursor.setDate(dayCursor.getDate() + 1);
    }
    detail = `${candidates.length} free slot${candidates.length === 1 ? "" : "s"} found`;
    responseData = { freeSlots: candidates };
  } else if (call.tool === "addFinanceEntry") {
    const result = await createFinanceEntry({
      type: (asString(args.type, "expense") as FinanceEntryType) === "income" ? "income" : "expense",
      amount: asNumber(args.amount),
      currency: asString(args.currency, "INR"),
      category: asString(args.category, "General"),
      note: asString(args.note) || undefined,
      occurredAt: asTimestamp(args.occurredAt || args.date),
      sourceChatMessageId: context.userMessageId,
      source: "ai",
      chatId: context.chatId,
      messageId: context.messageId,
      toolCallId: call.id,
      sessionId: context.sessionId,
    });
    activity = result.activity;
    detail = "Finance entry added";
    responseData = { entry: result.record };
  } else if (call.tool === "updateFinanceEntry") {
    const result = await updateFinanceEntry(asString(args.id), {
      type: args.type !== undefined ? ((asString(args.type) as FinanceEntryType) === "income" ? "income" : "expense") : undefined,
      amount: args.amount !== undefined ? asNumber(args.amount) : undefined,
      currency: asString(args.currency) || undefined,
      category: asString(args.category) || undefined,
      note: args.note !== undefined ? asString(args.note) : undefined,
      occurredAt: asTimestamp(args.occurredAt || args.date),
    }, { source: "ai", chatId: context.chatId, messageId: context.messageId, sessionId: context.sessionId, toolCallId: call.id });
    activity = result.activity;
    detail = "Finance entry updated";
    responseData = { entry: result.record };
  } else if (call.tool === "deleteFinanceEntry") {
    const result = await deleteFinanceEntry(asString(args.id), { source: "ai", chatId: context.chatId, messageId: context.messageId, sessionId: context.sessionId, toolCallId: call.id });
    activity = result.activity;
    detail = "Finance entry deleted";
    responseData = { entry: result.record };
  } else if (call.tool === "summarizeFinance") {
    const results = await searchFinanceEntries(asString(args.query || args.month));
    const totalExpense = results.filter(entry => entry.type === "expense").reduce((sum, entry) => sum + entry.amount, 0);
    const totalIncome = results.filter(entry => entry.type === "income").reduce((sum, entry) => sum + entry.amount, 0);
    detail = `Income ${totalIncome.toFixed(2)}, expense ${totalExpense.toFixed(2)}`;
    const byCategory = results.reduce<Record<string, { income: number; expense: number; count: number }>>((acc, entry) => {
      const key = entry.category || "General";
      acc[key] ||= { income: 0, expense: 0, count: 0 };
      acc[key][entry.type] += entry.amount;
      acc[key].count += 1;
      return acc;
    }, {});
    responseData = {
      count: results.length,
      totalIncome,
      totalExpense,
      net: totalIncome - totalExpense,
      byCategory,
      entries: results.slice(0, 12).map(entry => ({
        id: entry.id,
        type: entry.type,
        amount: entry.amount,
        currency: entry.currency,
        category: entry.category,
        note: entry.note,
        occurredAt: entry.occurredAt,
      })),
    };
  }

  return {
    action: makeAction({
      call,
      status: "done",
      title: activity?.title || title,
      detail,
      activity,
    }),
    summary: detail || `${call.tool} done`,
    response: {
      success: true,
      status: "done",
      output: detail || `${call.tool} done`,
      data: {
        ...responseData,
        activityId: activity?.id,
        targetId: activity?.targetId,
        targetType: activity?.targetType || getTargetTypeForTool(call.tool),
        title: activity?.title || title,
      },
    },
  };
}
