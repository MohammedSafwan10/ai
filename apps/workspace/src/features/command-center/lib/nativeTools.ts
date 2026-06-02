import type { CommandToolCall, CommandToolName } from "./agentTools";

export type CommandNativeToolName =
  | "command_create_task"
  | "command_update_task"
  | "command_complete_task"
  | "command_delete_task"
  | "command_search_tasks"
  | "command_create_note"
  | "command_append_note"
  | "command_update_note"
  | "command_delete_note"
  | "command_search_notes"
  | "command_create_schedule_block"
  | "command_update_schedule_block"
  | "command_delete_schedule_block"
  | "command_search_schedule_blocks"
  | "command_find_free_slots"
  | "command_add_finance_entry"
  | "command_update_finance_entry"
  | "command_delete_finance_entry"
  | "command_summarize_finance";

export interface CommandNativeToolCall {
  id?: string;
  name: CommandNativeToolName;
  arguments: Record<string, unknown>;
  thoughtSignature?: string;
}

export interface CommandNativeToolDraft {
  id?: string;
  name: CommandNativeToolName;
  arguments: Record<string, unknown>;
}

const nativeToInternalTool: Record<CommandNativeToolName, CommandToolName> = {
  command_create_task: "createTask",
  command_update_task: "updateTask",
  command_complete_task: "completeTask",
  command_delete_task: "deleteTask",
  command_search_tasks: "searchTasks",
  command_create_note: "createNote",
  command_append_note: "appendNote",
  command_update_note: "updateNote",
  command_delete_note: "deleteNote",
  command_search_notes: "searchNotes",
  command_create_schedule_block: "createScheduleBlock",
  command_update_schedule_block: "updateScheduleBlock",
  command_delete_schedule_block: "deleteScheduleBlock",
  command_search_schedule_blocks: "searchScheduleBlocks",
  command_find_free_slots: "findFreeSlots",
  command_add_finance_entry: "addFinanceEntry",
  command_update_finance_entry: "updateFinanceEntry",
  command_delete_finance_entry: "deleteFinanceEntry",
  command_summarize_finance: "summarizeFinance",
};

const internalToNativeTool = Object.fromEntries(
  Object.entries(nativeToInternalTool).map(([native, internal]) => [internal, native])
) as Record<CommandToolName, CommandNativeToolName>;

const textProperty = (description: string) => ({ type: "string", description });
const nullableTextProperty = (description: string) => ({ type: "string", description });
const tagsProperty = {
  type: "array",
  items: { type: "string" },
  description: "Short lowercase labels. Omit when not needed.",
};

const createSchema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});

export const commandToolDefinitions = [
  {
    type: "function",
    name: "command_create_task",
    description: "Create one task in Privora Command Center.",
    parameters: createSchema({
      title: textProperty("Task title."),
      description: nullableTextProperty("Optional task details."),
      priority: { type: "string", enum: ["low", "medium", "high"], description: "Task priority. Use medium when unsure." },
      dueAt: nullableTextProperty("Optional ISO date/time or natural date text from the user."),
      tags: tagsProperty,
    }, ["title"]),
  },
  {
    type: "function",
    name: "command_update_task",
    description: "Update one existing Command Center task by id.",
    parameters: createSchema({
      id: textProperty("Task id."),
      title: nullableTextProperty("New task title."),
      description: nullableTextProperty("New task details."),
      status: { type: "string", enum: ["todo", "doing", "done", "archived"], description: "New task status." },
      priority: { type: "string", enum: ["low", "medium", "high"], description: "New priority." },
      dueAt: nullableTextProperty("New ISO date/time or natural date text."),
      tags: tagsProperty,
    }, ["id"]),
  },
  {
    type: "function",
    name: "command_complete_task",
    description: "Mark one existing task as done.",
    parameters: createSchema({ id: textProperty("Task id.") }, ["id"]),
  },
  {
    type: "function",
    name: "command_delete_task",
    description: "Delete one task. The app will ask the user to confirm before deleting.",
    parameters: createSchema({ id: textProperty("Task id.") }, ["id"]),
  },
  {
    type: "function",
    name: "command_search_tasks",
    description: "Search Command Center tasks before answering or updating a task when the exact id is unknown.",
    parameters: createSchema({ query: textProperty("Search query. Use an empty string to list recent open tasks.") }, ["query"]),
  },
  {
    type: "function",
    name: "command_create_note",
    description: "Create one note in Privora Command Center.",
    parameters: createSchema({
      title: textProperty("Note title."),
      markdown: textProperty("Markdown note body."),
      tags: tagsProperty,
      pinned: { type: "boolean", description: "Whether the note should be pinned." },
    }, ["title", "markdown"]),
  },
  {
    type: "function",
    name: "command_append_note",
    description: "Append markdown to one existing note by id.",
    parameters: createSchema({
      id: textProperty("Note id."),
      markdown: textProperty("Markdown to append."),
    }, ["id", "markdown"]),
  },
  {
    type: "function",
    name: "command_update_note",
    description: "Update one existing note by id.",
    parameters: createSchema({
      id: textProperty("Note id."),
      title: nullableTextProperty("New note title."),
      markdown: nullableTextProperty("Full replacement markdown body."),
      tags: tagsProperty,
      pinned: { type: "boolean", description: "Whether the note should be pinned." },
      archived: { type: "boolean", description: "Whether the note should be archived." },
    }, ["id"]),
  },
  {
    type: "function",
    name: "command_delete_note",
    description: "Delete one note. The app will ask the user to confirm before deleting.",
    parameters: createSchema({ id: textProperty("Note id.") }, ["id"]),
  },
  {
    type: "function",
    name: "command_search_notes",
    description: "Search Command Center notes before answering or updating a note when the exact id is unknown.",
    parameters: createSchema({ query: textProperty("Search query. Use an empty string to list recent notes.") }, ["query"]),
  },
  {
    type: "function",
    name: "command_create_schedule_block",
    description: "Create one scheduled time block. The start time must come from the user or a free-slot result. If end time is omitted, the app creates a 30-minute block.",
    parameters: createSchema({
      title: textProperty("Short scheduled block title."),
      startAt: textProperty("Explicit ISO date/time with local offset, or an unambiguous date/time stated by the user."),
      endAt: nullableTextProperty("Optional ISO date/time later than startAt."),
      durationMinutes: { type: "number", description: "Optional duration in minutes if endAt is absent." },
      allDay: { type: "boolean", description: "Whether this occupies an all-day slot." },
      taskId: nullableTextProperty("Optional linked Command Center task id."),
      notes: nullableTextProperty("Optional schedule notes."),
    }, ["title", "startAt"]),
  },
  {
    type: "function",
    name: "command_update_schedule_block",
    description: "Update one scheduled time block by id. Changing time requires confirmation.",
    parameters: createSchema({
      id: textProperty("Schedule block id."),
      title: nullableTextProperty("New title."),
      startAt: nullableTextProperty("New start ISO date/time."),
      endAt: nullableTextProperty("New end ISO date/time."),
      durationMinutes: { type: "number", description: "Optional new duration in minutes." },
      allDay: { type: "boolean", description: "Whether this occupies an all-day slot." },
      taskId: nullableTextProperty("Optional linked Command Center task id."),
      notes: nullableTextProperty("New notes."),
    }, ["id"]),
  },
  {
    type: "function",
    name: "command_delete_schedule_block",
    description: "Delete one scheduled time block. The app asks the user to confirm before deleting.",
    parameters: createSchema({ id: textProperty("Schedule block id.") }, ["id"]),
  },
  {
    type: "function",
    name: "command_search_schedule_blocks",
    description: "Search scheduled blocks by title or notes before answering, moving, or deleting one.",
    parameters: createSchema({ query: textProperty("Search query. Use an empty string to list upcoming blocks.") }, ["query"]),
  },
  {
    type: "function",
    name: "command_find_free_slots",
    description: "Find available schedule windows before planning work when the user did not state exact times or asked for a plan.",
    parameters: createSchema({
      startAt: textProperty("Search range start ISO date/time."),
      endAt: textProperty("Search range end ISO date/time."),
      durationMinutes: { type: "number", description: "Required slot duration in minutes." },
      dailyWindowStart: nullableTextProperty("Optional preferred local HH:mm start."),
      dailyWindowEnd: nullableTextProperty("Optional preferred local HH:mm end."),
    }, ["startAt", "endAt", "durationMinutes"]),
  },
  {
    type: "function",
    name: "command_add_finance_entry",
    description: "Add one manual income or expense entry to the Command Center finance ledger.",
    parameters: createSchema({
      type: { type: "string", enum: ["income", "expense"], description: "Finance entry type." },
      amount: { type: "number", description: "Positive numeric amount." },
      currency: textProperty("Currency code. Default to INR unless the user states another currency."),
      category: textProperty("Short category such as Food, Rent, Travel, Salary, General."),
      note: nullableTextProperty("Optional note."),
      occurredAt: nullableTextProperty("Optional ISO date/time or natural date text."),
    }, ["type", "amount"]),
  },
  {
    type: "function",
    name: "command_update_finance_entry",
    description: "Update one finance entry. Amount and date edits require user confirmation.",
    parameters: createSchema({
      id: textProperty("Finance entry id."),
      type: { type: "string", enum: ["income", "expense"], description: "New entry type." },
      amount: { type: "number", description: "New positive amount." },
      currency: textProperty("New currency code."),
      category: textProperty("New category."),
      note: nullableTextProperty("New note."),
      occurredAt: nullableTextProperty("New ISO date/time or natural date text."),
    }, ["id"]),
  },
  {
    type: "function",
    name: "command_delete_finance_entry",
    description: "Delete one finance entry. The app will ask the user to confirm before deleting.",
    parameters: createSchema({ id: textProperty("Finance entry id.") }, ["id"]),
  },
  {
    type: "function",
    name: "command_summarize_finance",
    description: "Summarize finance entries by query, month, category, income, and expense totals.",
    parameters: createSchema({
      month: nullableTextProperty("Optional month in YYYY-MM format."),
      query: nullableTextProperty("Optional category/currency/note query."),
    }),
  },
] as const;

export const openRouterCommandTools = commandToolDefinitions.map(tool => ({
  type: "function",
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  },
}));

export const geminiCommandFunctionDeclarations = commandToolDefinitions.map(tool => ({
  name: tool.name,
  description: tool.description,
  parametersJsonSchema: tool.parameters,
}));

const isNativeToolName = (name: unknown): name is CommandNativeToolName =>
  typeof name === "string" && Object.prototype.hasOwnProperty.call(nativeToInternalTool, name);

const parseJsonObject = (value: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
};

const extractJsonStringValue = (source: string, key: string) => {
  const keyIndex = source.indexOf(`"${key}"`);
  if (keyIndex < 0) return undefined;
  const colonIndex = source.indexOf(":", keyIndex);
  if (colonIndex < 0) return undefined;
  const quoteIndex = source.indexOf('"', colonIndex + 1);
  if (quoteIndex < 0) return undefined;

  let output = "";
  let escaped = false;
  for (let index = quoteIndex + 1; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) {
      if (char === "n") output += "\n";
      else if (char === "r") output += "\r";
      else if (char === "t") output += "\t";
      else if (char === "u" && /^[0-9a-fA-F]{4}/.test(source.slice(index + 1, index + 5))) {
        output += String.fromCharCode(parseInt(source.slice(index + 1, index + 5), 16));
        index += 4;
      } else {
        output += char;
      }
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') break;
    output += char;
  }
  return output;
};

export const parseCommandNativeToolCall = (name: string | undefined, rawArguments: string, id?: string): CommandNativeToolCall | null => {
  if (!isNativeToolName(name)) return null;
  const parsed = parseJsonObject(rawArguments);
  if (!parsed) return null;
  return { id, name, arguments: normalizeCommandArguments(name, parsed) };
};

export const parsePartialCommandNativeToolCall = (name: string | undefined, rawArguments: string): CommandNativeToolDraft | null => {
  if (!isNativeToolName(name)) return null;
  const parsed = parseJsonObject(rawArguments);
  if (parsed) return { name, arguments: normalizeCommandArguments(name, parsed) };

  const id = extractJsonStringValue(rawArguments, "id");
  const title = extractJsonStringValue(rawArguments, "title");
  const query = extractJsonStringValue(rawArguments, "query");
  const note = extractJsonStringValue(rawArguments, "note");
  const category = extractJsonStringValue(rawArguments, "category");

  const args: Record<string, unknown> = {};
  if (id) args.id = id;
  if (title) args.title = title;
  if (query) args.query = query;
  if (note) args.note = note;
  if (category) args.category = category;
  return Object.keys(args).length > 0 ? { name, arguments: args } : null;
};

export const commandNativeToInternalCall = (call: CommandNativeToolCall): CommandToolCall => ({
  id: call.id,
  tool: nativeToInternalTool[call.name],
  arguments: normalizeCommandArguments(call.name, call.arguments),
});

export const commandInternalToNativeName = (tool: CommandToolName): CommandNativeToolName =>
  internalToNativeTool[tool];

const cleanString = (value: unknown) =>
  typeof value === "string" ? value.trim() : undefined;

const cleanStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.map(item => String(item).trim()).filter(Boolean).slice(0, 12)
    : undefined;

const normalizeCommandArguments = (name: CommandNativeToolName, args: Record<string, unknown>) => {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (value === null || value === undefined || value === "") continue;
    if (key === "tags") {
      const tags = cleanStringArray(value);
      if (tags?.length) next.tags = tags;
      continue;
    }
    if (["title", "description", "dueAt", "date", "id", "markdown", "content", "currency", "category", "note", "notes", "occurredAt", "startAt", "endAt", "taskId", "dailyWindowStart", "dailyWindowEnd", "month", "query"].includes(key)) {
      const text = cleanString(value);
      if (text !== undefined) next[key] = text;
      continue;
    }
    if (key === "amount" || key === "durationMinutes") {
      const amount = typeof value === "number" ? value : Number(value);
      if (Number.isFinite(amount)) next[key] = amount;
      continue;
    }
    if (key === "pinned" || key === "archived" || key === "allDay") {
      next[key] = value === true || value === "true";
      continue;
    }
    next[key] = value;
  }

  if (name === "command_add_finance_entry") {
    next.currency = cleanString(next.currency) || "INR";
    next.category = cleanString(next.category) || "General";
  }
  return next;
};
