import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  CalendarClock,
  CalendarDays,
  Check,
  ClipboardList,
  FileText,
  IndianRupee,
  ListFilter,
  NotebookPen,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { MarkdownRenderer } from "../../chat/components/MarkdownRenderer";
import { CommandSchedulePanel } from "./CommandSchedulePanel";
import type {
  CommandActivityRecord,
  CommandAgentSessionRecord,
  CommandNoteRecord,
  CommandScheduleBlockRecord,
  CommandTaskPriority,
  CommandTaskRecord,
  CommandTaskStatus,
  FinanceEntryRecord,
  FinanceEntryType,
} from "../../../lib/db";
import {
  archiveCommandHistory,
  createCommandNote,
  createCommandTask,
  createFinanceEntry,
  deleteCommandNote,
  deleteCommandTask,
  deleteFinanceEntry,
  loadCommandActivity,
  loadCommandSessions,
  loadCommandScheduleBlocks,
  loadCommandNotes,
  loadCommandTasks,
  loadFinanceEntries,
  sectionForTargetType,
  redoCommandSession,
  undoCommandActivity,
  undoCommandSession,
  updateCommandNote,
  updateCommandTask,
  updateFinanceEntry,
  type CommandSection,
} from "../lib/storage";
import { cn } from "../../../lib/utils";
import { useToast } from "../../ui/ToastProvider";

interface CommandCenterWorkspaceProps {
  initialSection?: CommandSection;
  selectedItemId?: string | null;
  onOpenChatSession?: (chatId: string) => void;
}

const tabs: Array<{ id: CommandSection; label: string; icon: typeof ClipboardList }> = [
  { id: "tasks", label: "Tasks", icon: ClipboardList },
  { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "notes", label: "Notes", icon: NotebookPen },
  { id: "finance", label: "Finance", icon: IndianRupee },
  { id: "activity", label: "Activity", icon: Activity },
];

const formatDate = (timestamp?: number) => {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(timestamp));
};

const toInputDate = (timestamp?: number) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 10);
};

const fromInputDate = (value: string) => {
  if (!value) return undefined;
  const parsed = Date.parse(`${value}T12:00:00`);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const formatActivityDiff = (activity: CommandActivityRecord) => {
  const before = activity.before as CommandTaskRecord | CommandScheduleBlockRecord | CommandNoteRecord | FinanceEntryRecord | undefined;
  const after = activity.after as CommandTaskRecord | CommandScheduleBlockRecord | CommandNoteRecord | FinanceEntryRecord | undefined;
  const formatScheduleTime = (start: number, end: number) => `${new Date(start).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })} - ${new Date(end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  if (activity.targetType === "schedule" && activity.action === "create" && after) {
    const block = after as CommandScheduleBlockRecord;
    return `${block.title}: added ${formatScheduleTime(block.startAt, block.endAt)}`;
  }
  if (activity.targetType === "schedule" && activity.action === "delete" && before) {
    const block = before as CommandScheduleBlockRecord;
    return `${block.title}: removed ${formatScheduleTime(block.startAt, block.endAt)}`;
  }
  if (activity.action === "create") return `Created ${activity.targetType}: ${activity.title}`;
  if (activity.action === "delete") return `Deleted ${activity.targetType}: ${activity.title}`;

  if (activity.targetType === "finance") {
    const previous = before as FinanceEntryRecord | undefined;
    const next = after as FinanceEntryRecord | undefined;
    if (!previous || !next) return `Updated finance entry: ${activity.title}`;
    const changes: string[] = [];
    if (previous.amount !== next.amount || previous.currency !== next.currency) {
      changes.push(`${previous.currency} ${previous.amount} -> ${next.currency} ${next.amount}`);
    }
    if (previous.category !== next.category) changes.push(`${previous.category} -> ${next.category}`);
    if (formatDate(previous.occurredAt) !== formatDate(next.occurredAt)) {
      changes.push(`${formatDate(previous.occurredAt)} -> ${formatDate(next.occurredAt)}`);
    }
    return changes.length ? `${activity.title}: ${changes.join(" · ")}` : `Updated finance entry: ${activity.title}`;
  }
  if (activity.targetType === "schedule") {
    const previous = before as CommandScheduleBlockRecord | undefined;
    const next = after as CommandScheduleBlockRecord | undefined;
    if (!previous || !next) return `Updated schedule block: ${activity.title}`;
    if (previous.startAt !== next.startAt || previous.endAt !== next.endAt) {
      return `${next.title}: ${formatScheduleTime(previous.startAt, previous.endAt)} -> ${formatScheduleTime(next.startAt, next.endAt)}`;
    }
    return `Updated schedule block: ${next.title}`;
  }

  if (activity.targetType === "task") {
    const previous = before as CommandTaskRecord | undefined;
    const next = after as CommandTaskRecord | undefined;
    if (!previous || !next) return `${activity.action === "complete" ? "Completed" : "Updated"} task: ${activity.title}`;
    const changes: string[] = [];
    if (previous.status !== next.status) changes.push(`${previous.status} -> ${next.status}`);
    if (previous.priority !== next.priority) changes.push(`${previous.priority} -> ${next.priority} priority`);
    if (formatDate(previous.dueAt) !== formatDate(next.dueAt)) {
      changes.push(`${formatDate(previous.dueAt) || "no due date"} -> ${formatDate(next.dueAt) || "no due date"}`);
    }
    if (previous.title !== next.title) changes.push(`"${previous.title}" -> "${next.title}"`);
    return changes.length ? `${next.title}: ${changes.join(" · ")}` : `Updated task: ${next.title}`;
  }

  const previous = before as CommandNoteRecord | undefined;
  const next = after as CommandNoteRecord | undefined;
  if (!previous || !next) return `Updated note: ${activity.title}`;
  if (next.markdown.startsWith(previous.markdown) && next.markdown.length > previous.markdown.length) {
    const appendedText = next.markdown.slice(previous.markdown.length).trim();
    const appendedParagraphs = appendedText.split(/\n\s*\n/).filter(Boolean).length || 1;
    return `${next.title}: +${appendedParagraphs} appended paragraph${appendedParagraphs === 1 ? "" : "s"}`;
  }
  if (previous.title !== next.title) return `Note renamed: "${previous.title}" -> "${next.title}"`;
  return `Updated note content: ${next.title}`;
};

const parseCaptureFinance = (text: string) => {
  const amountMatch = text.match(/(?:rs\.?|inr|₹)?\s*(\d+(?:\.\d+)?)/i);
  const amount = amountMatch ? Number(amountMatch[1]) : 0;
  const lower = text.toLowerCase();
  const type: FinanceEntryType = /\b(income|salary|earned|received|got paid)\b/.test(lower) ? "income" : "expense";
  const category =
    /\b(food|lunch|dinner|snack|grocery|restaurant)\b/.test(lower) ? "Food" :
    /\b(rent|house|flat)\b/.test(lower) ? "Rent" :
    /\b(bus|taxi|uber|ola|fuel|petrol|travel)\b/.test(lower) ? "Transport" :
    /\b(subscription|netflix|spotify|software)\b/.test(lower) ? "Subscriptions" :
    "General";
  return { type, amount, category };
};

function CommandIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none">
      <path d="M7 5.5h10M7 18.5h10M5.5 7v10M18.5 7v10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M8.5 8.5h7v7h-7z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.75 3.75l3.2 3.2M20.25 3.75l-3.2 3.2M3.75 20.25l3.2-3.2M20.25 20.25l-3.2-3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function CommandCenterWorkspace({ initialSection = "tasks", selectedItemId, onOpenChatSession }: CommandCenterWorkspaceProps) {
  const { notify } = useToast();
  const [activeSection, setActiveSection] = useState<CommandSection>(initialSection);
  const [tasks, setTasks] = useState<CommandTaskRecord[]>([]);
  const [notes, setNotes] = useState<CommandNoteRecord[]>([]);
  const [financeEntries, setFinanceEntries] = useState<FinanceEntryRecord[]>([]);
  const [scheduleBlocks, setScheduleBlocks] = useState<CommandScheduleBlockRecord[]>([]);
  const [activity, setActivity] = useState<CommandActivityRecord[]>([]);
  const [sessions, setSessions] = useState<CommandAgentSessionRecord[]>([]);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [captureText, setCaptureText] = useState("");
  const [captureTarget, setCaptureTarget] = useState<"task" | "note" | "finance">("task");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedFinanceId, setSelectedFinanceId] = useState<string | null>(null);
  const [taskDraft, setTaskDraft] = useState({ title: "", description: "", dueAt: "", priority: "medium" as CommandTaskPriority, tags: "" });
  const [noteDraft, setNoteDraft] = useState({ title: "", markdown: "", tags: "", pinned: false });
  const [financeDraft, setFinanceDraft] = useState({ type: "expense" as FinanceEntryType, amount: "", currency: "INR", category: "", note: "", occurredAt: toInputDate(Date.now()) });
  const [noteMode, setNoteMode] = useState<"edit" | "preview">("edit");
  const [pendingSessionChange, setPendingSessionChange] = useState<{ sessionId: string; action: "undo" | "redo" } | null>(null);
  const [isClearHistoryOpen, setIsClearHistoryOpen] = useState(false);
  const [showQuietSessions, setShowQuietSessions] = useState(false);

  const refresh = async () => {
    const [nextTasks, nextNotes, nextFinance, nextScheduleBlocks, nextActivity, nextSessions] = await Promise.all([
      loadCommandTasks(),
      loadCommandNotes(),
      loadFinanceEntries(),
      loadCommandScheduleBlocks(),
      loadCommandActivity(),
      loadCommandSessions(),
    ]);
    setTasks(nextTasks);
    setNotes(nextNotes);
    setFinanceEntries(nextFinance);
    setScheduleBlocks(nextScheduleBlocks);
    setActivity(nextActivity);
    setSessions(nextSessions);
  };

  const applySessionChange = async (sessionId: string, action: "undo" | "redo") => {
    try {
      const result = action === "undo"
        ? await undoCommandSession(sessionId).then(value => ({ conflicts: value.conflicts, changed: value.undone }))
        : await redoCommandSession(sessionId).then(value => ({ conflicts: value.conflicts, changed: value.redone }));
      const changedCount = result.changed.length;
      if (result.conflicts.length > 0) {
        notify({
          title: action === "undo" ? "Session partly undone" : "Session partly redone",
          description: `${changedCount} change${changedCount === 1 ? "" : "s"} applied; ${result.conflicts.length} newer change${result.conflicts.length === 1 ? " was" : "s were"} kept.`,
          variant: "info",
        });
      } else {
        notify({
          title: action === "undo" ? "Session undone" : "Session redone",
          description: `${changedCount} change${changedCount === 1 ? "" : "s"} ${action === "undo" ? "restored" : "reapplied"}.`,
          variant: "success",
        });
      }
      await refresh();
    } catch (error) {
      notify({ title: `${action === "undo" ? "Undo" : "Redo"} failed`, description: error instanceof Error ? error.message : "Could not apply this change.", variant: "error" });
    } finally {
      setPendingSessionChange(null);
    }
  };

  useEffect(() => {
    void refresh().catch(() => notify({ title: "Command Center failed to load", variant: "error" }));
  }, []);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    if (!selectedItemId) return;
    if (initialSection === "tasks") setSelectedTaskId(selectedItemId);
    if (initialSection === "schedule") setSelectedScheduleId(selectedItemId);
    if (initialSection === "notes") setSelectedNoteId(selectedItemId);
    if (initialSection === "finance") setSelectedFinanceId(selectedItemId);
  }, [initialSection, selectedItemId]);

  const filteredTasks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tasks.filter(task => {
      if (task.status === "archived") return false;
      if (!needle) return true;
      return [task.title, task.description, task.tags?.join(" ")].some(value => (value || "").toLowerCase().includes(needle));
    });
  }, [tasks, query]);

  const filteredNotes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return notes.filter(note => {
      if (note.archived) return false;
      if (!needle) return true;
      return [note.title, note.markdown, note.tags?.join(" ")].some(value => (value || "").toLowerCase().includes(needle));
    });
  }, [notes, query]);

  const filteredFinance = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return financeEntries.filter(entry => {
      if (!needle) return true;
      return [entry.category, entry.note, entry.currency].some(value => (value || "").toLowerCase().includes(needle));
    });
  }, [financeEntries, query]);

  const financeSummary = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const monthEntries = financeEntries.filter(entry => {
      const date = new Date(entry.occurredAt);
      return date.getMonth() === month && date.getFullYear() === year;
    });
    const income = monthEntries.filter(entry => entry.type === "income").reduce((sum, entry) => sum + entry.amount, 0);
    const expense = monthEntries.filter(entry => entry.type === "expense").reduce((sum, entry) => sum + entry.amount, 0);
    const byCategory = monthEntries
      .filter(entry => entry.type === "expense")
      .reduce<Record<string, number>>((acc, entry) => {
        acc[entry.category] = (acc[entry.category] || 0) + entry.amount;
        return acc;
      }, {});
    return { income, expense, byCategory };
  }, [financeEntries]);

  const selectedTask = tasks.find(task => task.id === selectedTaskId) || null;
  const selectedNote = notes.find(note => note.id === selectedNoteId) || null;
  const selectedFinance = financeEntries.find(entry => entry.id === selectedFinanceId) || null;
  const quietSessions = sessions.filter(session => session.completedCount === 0 && session.status === "completed");
  const visibleSessions = showQuietSessions
    ? sessions
    : sessions.filter(session => session.completedCount > 0 || session.status !== "completed");

  useEffect(() => {
    if (!selectedTask) return;
    setTaskDraft({
      title: selectedTask.title,
      description: selectedTask.description || "",
      dueAt: toInputDate(selectedTask.dueAt),
      priority: selectedTask.priority,
      tags: selectedTask.tags?.join(", ") || "",
    });
  }, [selectedTask?.id]);

  useEffect(() => {
    if (!selectedNote) return;
    setNoteDraft({
      title: selectedNote.title,
      markdown: selectedNote.markdown,
      tags: selectedNote.tags?.join(", ") || "",
      pinned: Boolean(selectedNote.pinned),
    });
  }, [selectedNote?.id]);

  useEffect(() => {
    if (!selectedFinance) return;
    setFinanceDraft({
      type: selectedFinance.type,
      amount: String(selectedFinance.amount),
      currency: selectedFinance.currency,
      category: selectedFinance.category,
      note: selectedFinance.note || "",
      occurredAt: toInputDate(selectedFinance.occurredAt),
    });
  }, [selectedFinance?.id]);

  const handleCapture = async (event: FormEvent) => {
    event.preventDefault();
    const text = captureText.trim();
    if (!text) return;

    if (captureTarget === "task") {
      const result = await createCommandTask({ title: text, source: "manual" });
      setSelectedTaskId(result.record.id);
      setActiveSection("tasks");
    } else if (captureTarget === "note") {
      const result = await createCommandNote({ title: text.slice(0, 70), markdown: text, source: "manual" });
      setSelectedNoteId(result.record.id);
      setActiveSection("notes");
    } else {
      const parsed = parseCaptureFinance(text);
      const result = await createFinanceEntry({ ...parsed, note: text, source: "manual" });
      setSelectedFinanceId(result.record.id);
      setActiveSection("finance");
    }
    setCaptureText("");
    await refresh();
  };

  const saveTask = async () => {
    if (selectedTask) {
      await updateCommandTask(selectedTask.id, {
        title: taskDraft.title,
        description: taskDraft.description,
        priority: taskDraft.priority,
        dueAt: fromInputDate(taskDraft.dueAt),
        tags: taskDraft.tags,
      });
    } else {
      const result = await createCommandTask({
        title: taskDraft.title || "Untitled task",
        description: taskDraft.description,
        priority: taskDraft.priority,
        dueAt: fromInputDate(taskDraft.dueAt),
        tags: taskDraft.tags,
        source: "manual",
      });
      setSelectedTaskId(result.record.id);
    }
    await refresh();
  };

  const saveNote = async () => {
    if (selectedNote) {
      await updateCommandNote(selectedNote.id, {
        title: noteDraft.title,
        markdown: noteDraft.markdown,
        tags: noteDraft.tags,
        pinned: noteDraft.pinned,
      });
    } else {
      const result = await createCommandNote({
        title: noteDraft.title || "Untitled note",
        markdown: noteDraft.markdown,
        tags: noteDraft.tags,
        pinned: noteDraft.pinned,
        source: "manual",
      });
      setSelectedNoteId(result.record.id);
    }
    await refresh();
  };

  const saveFinance = async () => {
    const amount = Number(financeDraft.amount);
    if (selectedFinance) {
      await updateFinanceEntry(selectedFinance.id, {
        type: financeDraft.type,
        amount,
        currency: financeDraft.currency,
        category: financeDraft.category,
        note: financeDraft.note,
        occurredAt: fromInputDate(financeDraft.occurredAt),
      });
    } else {
      const result = await createFinanceEntry({
        type: financeDraft.type,
        amount,
        currency: financeDraft.currency,
        category: financeDraft.category,
        note: financeDraft.note,
        occurredAt: fromInputDate(financeDraft.occurredAt),
        source: "manual",
      });
      setSelectedFinanceId(result.record.id);
    }
    await refresh();
  };

  const openActivityTarget = (item: CommandActivityRecord) => {
    const section = sectionForTargetType(item.targetType);
    setActiveSection(section);
    if (item.targetType === "task") setSelectedTaskId(item.targetId || null);
    if (item.targetType === "schedule") setSelectedScheduleId(item.targetId || null);
    if (item.targetType === "note") setSelectedNoteId(item.targetId || null);
    if (item.targetType === "finance") setSelectedFinanceId(item.targetId || null);
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--privora-bg)] text-[var(--privora-text)]">
      <div className="border-b border-[var(--privora-border)]/45 px-4 pt-5 sm:px-6 lg:px-8 2xl:px-10">
        <div className="mx-auto flex w-full max-w-[112rem] flex-col gap-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center gap-2 text-[13px] font-semibold text-[var(--privora-muted)]">
                <CommandIcon className="h-4 w-4 text-[var(--privora-accent)]" />
                <span>Command Center</span>
              </div>
              <h1 className="font-display text-2xl font-medium tracking-normal sm:text-[2rem]">Plan time, track work, notes, and money.</h1>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-[var(--privora-border)]/70 bg-[var(--privora-surface)]/45 px-3 py-2 text-[12px] text-[var(--privora-muted)]">
              <Sparkles className="h-4 w-4 text-[var(--privora-accent)]" />
              <span>Agent Mode can edit these from chat</span>
            </div>
          </div>

          <form onSubmit={handleCapture} className="grid gap-2 rounded-xl border border-[var(--privora-border)]/70 bg-[var(--privora-surface)]/45 p-2 sm:grid-cols-[1fr_auto_auto]">
            <input
              value={captureText}
              onChange={(event) => setCaptureText(event.target.value)}
              placeholder="Capture anything: pay rent tomorrow, note Clash idea, spent 450 food"
              className="min-h-11 min-w-0 rounded-lg bg-transparent px-3 text-[14px] outline-none placeholder:text-[var(--privora-muted)]"
            />
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-[var(--privora-text)]/[0.04] p-1">
              {(["task", "note", "finance"] as const).map(target => (
                <button
                  key={target}
                  type="button"
                  onClick={() => setCaptureTarget(target)}
                  className={cn(
                    "rounded-md px-3 py-2 text-[12px] font-semibold capitalize transition-colors",
                    captureTarget === target ? "bg-[var(--privora-surface)] text-[var(--privora-text)] shadow-sm" : "text-[var(--privora-muted)] hover:text-[var(--privora-text)]"
                  )}
                >
                  {target}
                </button>
              ))}
            </div>
            <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[var(--privora-accent)] px-4 text-[13px] font-semibold text-[var(--privora-accent-fg)] transition hover:bg-[var(--privora-accent-hover)]">
              <Plus className="h-4 w-4" />
              Add
            </button>
          </form>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-1 overflow-x-auto rounded-xl border border-[var(--privora-border)]/70 bg-[var(--privora-surface)]/35 p-1">
              {tabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveSection(tab.id)}
                    className={cn(
                      "inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-[13px] font-semibold transition",
                      activeSection === tab.id ? "bg-[var(--privora-surface)] text-[var(--privora-text)] shadow-sm" : "text-[var(--privora-muted)] hover:text-[var(--privora-text)]"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
            <div className="relative min-w-0 sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--privora-muted)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search Command Center"
                className="h-10 w-full rounded-xl border border-[var(--privora-border)]/70 bg-[var(--privora-surface)]/35 pl-9 pr-3 text-[13px] outline-none transition focus:border-[var(--privora-muted)]"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8 2xl:px-10">
        <div className="mx-auto w-full max-w-[112rem]">
          {activeSection === "tasks" && (
            <div className="grid gap-5 lg:grid-cols-[minmax(18rem,27rem)_minmax(0,1fr)] xl:grid-cols-[minmax(22rem,31rem)_minmax(0,1fr)]">
              <section className="min-w-0 border-r border-[var(--privora-border)]/45 pr-0 lg:pr-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="inline-flex items-center gap-2 text-[13px] font-semibold text-[var(--privora-muted)]"><ListFilter className="h-4 w-4" /> Open tasks</div>
                  <button type="button" onClick={() => { setSelectedTaskId(null); setTaskDraft({ title: "", description: "", dueAt: "", priority: "medium", tags: "" }); }} className="rounded-md p-1.5 text-[var(--privora-muted)] hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)]" title="New task">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-1.5">
                  {filteredTasks.map(task => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => setSelectedTaskId(task.id)}
                      className={cn(
                        "w-full border-l px-3 py-2.5 text-left transition",
                        selectedTaskId === task.id ? "border-[var(--privora-accent)] bg-[var(--privora-text)]/[0.04]" : "border-[var(--privora-border)]/65 hover:bg-[var(--privora-text)]/[0.03]"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-[14px] font-semibold">{task.title}</span>
                        <span className="shrink-0 text-[11px] capitalize text-[var(--privora-muted)]">{task.status}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--privora-muted)]">
                        <span className="capitalize">{task.priority}</span>
                        {task.dueAt && <span>{formatDate(task.dueAt)}</span>}
                      </div>
                    </button>
                  ))}
                  {filteredTasks.length === 0 && <div className="py-8 text-sm text-[var(--privora-muted)]">No tasks here yet.</div>}
                </div>
              </section>

              <section className="min-w-0">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="sm:col-span-2">
                    <span className="mb-1 block text-[12px] font-semibold text-[var(--privora-muted)]">Title</span>
                    <input value={taskDraft.title} onChange={(event) => setTaskDraft(prev => ({ ...prev, title: event.target.value }))} className="h-11 w-full rounded-lg border border-[var(--privora-border)]/70 bg-transparent px-3 outline-none" />
                  </label>
                  <label>
                    <span className="mb-1 block text-[12px] font-semibold text-[var(--privora-muted)]">Priority</span>
                    <select value={taskDraft.priority} onChange={(event) => setTaskDraft(prev => ({ ...prev, priority: event.target.value as CommandTaskPriority }))} className="h-11 w-full rounded-lg border border-[var(--privora-border)]/70 bg-[var(--privora-bg)] px-3 outline-none">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-[12px] font-semibold text-[var(--privora-muted)]">Due</span>
                    <input type="date" value={taskDraft.dueAt} onChange={(event) => setTaskDraft(prev => ({ ...prev, dueAt: event.target.value }))} className="h-11 w-full rounded-lg border border-[var(--privora-border)]/70 bg-transparent px-3 outline-none" />
                  </label>
                  <label className="sm:col-span-2">
                    <span className="mb-1 block text-[12px] font-semibold text-[var(--privora-muted)]">Description</span>
                    <textarea value={taskDraft.description} onChange={(event) => setTaskDraft(prev => ({ ...prev, description: event.target.value }))} rows={6} className="w-full resize-none rounded-lg border border-[var(--privora-border)]/70 bg-transparent px-3 py-2 outline-none" />
                  </label>
                  <label className="sm:col-span-2">
                    <span className="mb-1 block text-[12px] font-semibold text-[var(--privora-muted)]">Tags</span>
                    <input value={taskDraft.tags} onChange={(event) => setTaskDraft(prev => ({ ...prev, tags: event.target.value }))} placeholder="comma, separated" className="h-11 w-full rounded-lg border border-[var(--privora-border)]/70 bg-transparent px-3 outline-none" />
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={saveTask} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--privora-accent)] px-4 text-[13px] font-semibold text-[var(--privora-accent-fg)]"><Check className="h-4 w-4" /> Save</button>
                  {selectedTask && (
                    <>
                      <button type="button" onClick={async () => { await updateCommandTask(selectedTask.id, { status: selectedTask.status === "done" ? "todo" : "done" }, { action: "complete" }); await refresh(); }} className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--privora-border)]/70 px-3 text-[13px] font-semibold">
                        <Check className="h-4 w-4" /> {selectedTask.status === "done" ? "Reopen" : "Complete"}
                      </button>
                      <button type="button" onClick={async () => { await deleteCommandTask(selectedTask.id); setSelectedTaskId(null); await refresh(); }} className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-500/30 px-3 text-[13px] font-semibold text-red-500">
                        <Trash2 className="h-4 w-4" /> Delete
                      </button>
                    </>
                  )}
                </div>
              </section>
            </div>
          )}

          {activeSection === "schedule" && (
            <CommandSchedulePanel
              tasks={tasks}
              blocks={scheduleBlocks}
              selectedItemId={selectedScheduleId}
              onRefresh={refresh}
            />
          )}

          {activeSection === "notes" && (
            <div className="grid gap-5 lg:grid-cols-[minmax(18rem,27rem)_minmax(0,1fr)] xl:grid-cols-[minmax(22rem,31rem)_minmax(0,1fr)]">
              <section className="min-w-0 border-r border-[var(--privora-border)]/45 pr-0 lg:pr-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="inline-flex items-center gap-2 text-[13px] font-semibold text-[var(--privora-muted)]"><FileText className="h-4 w-4" /> Notes</div>
                  <button type="button" onClick={() => { setSelectedNoteId(null); setNoteDraft({ title: "", markdown: "", tags: "", pinned: false }); }} className="rounded-md p-1.5 text-[var(--privora-muted)] hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)]" title="New note">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-1.5">
                  {filteredNotes.sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt - a.updatedAt).map(note => (
                    <button key={note.id} type="button" onClick={() => setSelectedNoteId(note.id)} className={cn("w-full border-l px-3 py-2.5 text-left transition", selectedNoteId === note.id ? "border-[var(--privora-accent)] bg-[var(--privora-text)]/[0.04]" : "border-[var(--privora-border)]/65 hover:bg-[var(--privora-text)]/[0.03]")}>
                      <div className="flex items-center gap-2">
                        {note.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-[var(--privora-accent)]" />}
                        <span className="min-w-0 truncate text-[14px] font-semibold">{note.title}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[var(--privora-muted)]">{note.markdown || "Empty note"}</p>
                    </button>
                  ))}
                  {filteredNotes.length === 0 && <div className="py-8 text-sm text-[var(--privora-muted)]">No notes yet.</div>}
                </div>
              </section>
              <section className="min-w-0">
                <div className="grid gap-3">
                  <input value={noteDraft.title} onChange={(event) => setNoteDraft(prev => ({ ...prev, title: event.target.value }))} placeholder="Note title" className="h-11 rounded-lg border border-[var(--privora-border)]/70 bg-transparent px-3 text-[16px] font-semibold outline-none" />
                  <div className="flex items-center justify-between gap-3">
                    <label className="inline-flex items-center gap-2 text-[13px] text-[var(--privora-muted)]">
                      <input type="checkbox" checked={noteDraft.pinned} onChange={(event) => setNoteDraft(prev => ({ ...prev, pinned: event.target.checked }))} />
                      Pinned
                    </label>
                    <div className="grid grid-cols-2 rounded-lg bg-[var(--privora-text)]/[0.04] p-1">
                      {(["edit", "preview"] as const).map(mode => (
                        <button key={mode} type="button" onClick={() => setNoteMode(mode)} className={cn("rounded-md px-3 py-1.5 text-[12px] font-semibold capitalize", noteMode === mode ? "bg-[var(--privora-surface)] shadow-sm" : "text-[var(--privora-muted)]")}>{mode}</button>
                      ))}
                    </div>
                  </div>
                  {noteMode === "edit" ? (
                    <textarea value={noteDraft.markdown} onChange={(event) => setNoteDraft(prev => ({ ...prev, markdown: event.target.value }))} rows={16} className="min-h-[22rem] resize-y rounded-lg border border-[var(--privora-border)]/70 bg-transparent px-3 py-3 outline-none" />
                  ) : (
                    <div className="markdown-body min-h-[22rem] rounded-lg border border-[var(--privora-border)]/70 px-4 py-3">
                      <MarkdownRenderer>{noteDraft.markdown || "Nothing to preview yet."}</MarkdownRenderer>
                    </div>
                  )}
                  <input value={noteDraft.tags} onChange={(event) => setNoteDraft(prev => ({ ...prev, tags: event.target.value }))} placeholder="Tags" className="h-11 rounded-lg border border-[var(--privora-border)]/70 bg-transparent px-3 outline-none" />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={saveNote} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--privora-accent)] px-4 text-[13px] font-semibold text-[var(--privora-accent-fg)]"><Check className="h-4 w-4" /> Save</button>
                  {selectedNote && <button type="button" onClick={async () => { await deleteCommandNote(selectedNote.id); setSelectedNoteId(null); await refresh(); }} className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-500/30 px-3 text-[13px] font-semibold text-red-500"><Trash2 className="h-4 w-4" /> Delete</button>}
                </div>
              </section>
            </div>
          )}

          {activeSection === "finance" && (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_minmax(23rem,28rem)] 2xl:gap-8">
              <section className="min-w-0">
                <div className="mb-4 grid gap-3 sm:grid-cols-3">
                  <div className="border-l border-[var(--privora-border)]/70 pl-3">
                    <div className="text-[12px] font-semibold text-[var(--privora-muted)]">Income this month</div>
                    <div className="mt-1 text-xl font-semibold">INR {financeSummary.income.toFixed(0)}</div>
                  </div>
                  <div className="border-l border-[var(--privora-border)]/70 pl-3">
                    <div className="text-[12px] font-semibold text-[var(--privora-muted)]">Expense this month</div>
                    <div className="mt-1 text-xl font-semibold">INR {financeSummary.expense.toFixed(0)}</div>
                  </div>
                  <div className="border-l border-[var(--privora-border)]/70 pl-3">
                    <div className="text-[12px] font-semibold text-[var(--privora-muted)]">Net</div>
                    <div className="mt-1 text-xl font-semibold">INR {(financeSummary.income - financeSummary.expense).toFixed(0)}</div>
                  </div>
                </div>
                <div className="overflow-hidden border-y border-[var(--privora-border)]/55">
                  {filteredFinance.map(entry => (
                    <button key={entry.id} type="button" onClick={() => setSelectedFinanceId(entry.id)} className={cn("grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--privora-border)]/35 px-2 py-3 text-left transition last:border-b-0 hover:bg-[var(--privora-text)]/[0.03] xl:grid-cols-[minmax(12rem,1.15fr)_minmax(11rem,1fr)_7.5rem_auto]", selectedFinanceId === entry.id && "bg-[var(--privora-text)]/[0.04]")}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn("h-2 w-2 rounded-full", entry.type === "income" ? "bg-emerald-500" : "bg-red-500")} />
                          <span className="truncate text-[14px] font-semibold">{entry.category}</span>
                        </div>
                        <div className="mt-1 truncate text-[12px] text-[var(--privora-muted)] xl:hidden">{entry.note || formatDate(entry.occurredAt)}</div>
                      </div>
                      <div className="hidden min-w-0 truncate text-[13px] text-[var(--privora-muted)] xl:block">{entry.note || "No note"}</div>
                      <div className="hidden text-[12px] text-[var(--privora-muted)] xl:block">{formatDate(entry.occurredAt)}</div>
                      <div className={cn("text-right text-[14px] font-semibold", entry.type === "income" ? "text-emerald-600 dark:text-emerald-300" : "text-red-500")}>
                        {entry.type === "income" ? "+" : "-"}{entry.currency} {entry.amount}
                      </div>
                    </button>
                  ))}
                  {filteredFinance.length === 0 && <div className="py-8 text-sm text-[var(--privora-muted)]">No finance entries yet.</div>}
                </div>
              </section>
              <aside className="min-w-0 border-l border-[var(--privora-border)]/45 pl-0 lg:pl-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-[13px] font-semibold text-[var(--privora-muted)]">{selectedFinance ? "Edit entry" : "New entry"}</div>
                  <button type="button" onClick={() => { setSelectedFinanceId(null); setFinanceDraft({ type: "expense", amount: "", currency: "INR", category: "", note: "", occurredAt: toInputDate(Date.now()) }); }} className="rounded-md p-1.5 text-[var(--privora-muted)] hover:bg-[var(--privora-text)]/5"><Plus className="h-4 w-4" /></button>
                </div>
                <div className="grid gap-3">
                  <select value={financeDraft.type} onChange={(event) => setFinanceDraft(prev => ({ ...prev, type: event.target.value as FinanceEntryType }))} className="h-11 rounded-lg border border-[var(--privora-border)]/70 bg-[var(--privora-bg)] px-3 outline-none"><option value="expense">Expense</option><option value="income">Income</option></select>
                  <div className="grid grid-cols-[5rem_1fr] gap-2">
                    <input value={financeDraft.currency} onChange={(event) => setFinanceDraft(prev => ({ ...prev, currency: event.target.value.toUpperCase() }))} className="h-11 rounded-lg border border-[var(--privora-border)]/70 bg-transparent px-3 outline-none" />
                    <input type="number" value={financeDraft.amount} onChange={(event) => setFinanceDraft(prev => ({ ...prev, amount: event.target.value }))} placeholder="Amount" className="h-11 rounded-lg border border-[var(--privora-border)]/70 bg-transparent px-3 outline-none" />
                  </div>
                  <input value={financeDraft.category} onChange={(event) => setFinanceDraft(prev => ({ ...prev, category: event.target.value }))} placeholder="Category" className="h-11 rounded-lg border border-[var(--privora-border)]/70 bg-transparent px-3 outline-none" />
                  <input type="date" value={financeDraft.occurredAt} onChange={(event) => setFinanceDraft(prev => ({ ...prev, occurredAt: event.target.value }))} className="h-11 rounded-lg border border-[var(--privora-border)]/70 bg-transparent px-3 outline-none" />
                  <textarea value={financeDraft.note} onChange={(event) => setFinanceDraft(prev => ({ ...prev, note: event.target.value }))} placeholder="Note" rows={5} className="resize-none rounded-lg border border-[var(--privora-border)]/70 bg-transparent px-3 py-2 outline-none" />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={saveFinance} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--privora-accent)] px-4 text-[13px] font-semibold text-[var(--privora-accent-fg)]"><Check className="h-4 w-4" /> Save</button>
                  {selectedFinance && <button type="button" onClick={async () => { await deleteFinanceEntry(selectedFinance.id); setSelectedFinanceId(null); await refresh(); }} className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-500/30 px-3 text-[13px] font-semibold text-red-500"><Trash2 className="h-4 w-4" /> Delete</button>}
                </div>
                <div className="mt-6">
                  <div className="mb-2 text-[12px] font-semibold text-[var(--privora-muted)]">Category view</div>
                  <div className="space-y-2">
                    {Object.entries(financeSummary.byCategory).slice(0, 8).map(([category, value]) => (
                      <div key={category} className="flex items-center justify-between border-l border-[var(--privora-border)]/70 pl-3 text-[13px]">
                        <span>{category}</span>
                        <span className="font-semibold">INR {value.toFixed(0)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </aside>
            </div>
          )}

          {activeSection === "activity" && (
            <section className="max-w-[96rem]">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2 text-[13px] font-semibold text-[var(--privora-muted)]"><CalendarClock className="h-4 w-4" /> Audit log</div>
                <div className="flex flex-wrap items-center gap-2 text-[12px]">
                  {quietSessions.length > 0 && (
                    <button type="button" onClick={() => setShowQuietSessions(value => !value)} className="px-2 py-1 font-semibold text-[var(--privora-muted)] hover:text-[var(--privora-text)]">
                      {showQuietSessions ? "Hide quiet sessions" : `Show ${quietSessions.length} quiet session${quietSessions.length === 1 ? "" : "s"}`}
                    </button>
                  )}
                  {(sessions.length > 0 || activity.length > 0) && (
                    <button type="button" onClick={() => setIsClearHistoryOpen(true)} className="inline-flex items-center gap-1.5 px-2 py-1 font-semibold text-[var(--privora-muted)] hover:text-red-500">
                      <Trash2 className="h-3.5 w-3.5" /> Clear list
                    </button>
                  )}
                </div>
              </div>
              {isClearHistoryOpen && (
                <div className="mb-4 flex max-w-[42rem] flex-col gap-3 border-l border-red-500/35 py-1 pl-3 text-[13px] sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-[var(--privora-text)]">Clear Activity history? Tasks, schedule, notes, finance, and chat undo remain unchanged.</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await archiveCommandHistory();
                        setIsClearHistoryOpen(false);
                        setExpandedSessionId(null);
                        setShowQuietSessions(false);
                        await refresh();
                        notify({ title: "Activity list cleared", description: "Your workspace data was not changed.", variant: "success" });
                      }}
                      className="rounded-md border border-red-500/30 px-2 py-1 font-semibold text-red-500"
                    >
                      Confirm clear
                    </button>
                    <button type="button" onClick={() => setIsClearHistoryOpen(false)} className="px-2 py-1 font-semibold text-[var(--privora-muted)]">Cancel</button>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {visibleSessions.map(session => {
                  const items = activity.filter(item => item.sessionId === session.id);
                  const expanded = expandedSessionId === session.id;
                  const canUndoSession = items.some(item => item.status === "done" && item.undoState === "available");
                  const canRedoSession = items.some(item => item.status === "undone" && item.undoState === "used");
                  const isReviewingSession = pendingSessionChange?.sessionId === session.id;
                  const changedItems = items.filter(item =>
                    item.undoState !== "unavailable" &&
                    item.action !== "search" &&
                    item.action !== "summarize" &&
                    (item.status === "done" || item.status === "undone")
                  );
                  return (
                    <div key={session.id} className="border-l border-[var(--privora-border)]/70 px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <button type="button" onClick={() => setExpandedSessionId(expanded ? null : session.id)} className="min-w-0 text-left">
                          <div className="truncate text-[14px] font-semibold">{session.prompt.slice(0, 86)}</div>
                          <div className="mt-1 text-[12px] text-[var(--privora-muted)]">
                            {session.completedCount} change{session.completedCount === 1 ? "" : "s"} · {session.status.replaceAll("_", " ")} · {new Date(session.updatedAt).toLocaleString()}
                          </div>
                        </button>
                        <div className="flex items-center gap-2">
                          {canUndoSession && (
                            <button type="button" onClick={() => setPendingSessionChange({ sessionId: session.id, action: "undo" })} className="px-2 py-1 text-[12px] font-semibold text-[var(--privora-muted)] hover:text-[var(--privora-text)]">Undo session</button>
                          )}
                          {canRedoSession && (
                            <button type="button" onClick={() => setPendingSessionChange({ sessionId: session.id, action: "redo" })} className="px-2 py-1 text-[12px] font-semibold text-[var(--privora-muted)] hover:text-[var(--privora-text)]">Redo session</button>
                          )}
                          {onOpenChatSession && <button type="button" onClick={() => onOpenChatSession(session.chatId)} className="px-2 py-1 text-[12px] font-semibold text-[var(--privora-muted)] hover:text-[var(--privora-text)]">Open chat</button>}
                        </div>
                      </div>
                      {isReviewingSession && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 border-l border-[var(--privora-border)]/55 pl-3 text-[12px]">
                          <span>{pendingSessionChange.action === "undo" ? "Undo this session's completed changes?" : "Redo this session's undone changes?"}</span>
                          <button type="button" onClick={() => void applySessionChange(session.id, pendingSessionChange.action)} className="rounded-md border border-[var(--privora-border)]/70 px-2 py-1 font-semibold">Confirm {pendingSessionChange.action}</button>
                          <button type="button" onClick={() => setPendingSessionChange(null)} className="px-2 py-1 font-semibold text-[var(--privora-muted)]">Cancel</button>
                        </div>
                      )}
                      {expanded && (
                        <div className="ml-1 mt-3 space-y-2 border-l border-[var(--privora-border)]/45 pl-3">
                          {changedItems.length > 0 && (
                            <div className="mb-3 space-y-1.5">
                              <div className="text-[11px] font-semibold uppercase text-[var(--privora-muted)]">Changes</div>
                              {changedItems.map(item => (
                                  <div key={`diff_${item.id}`} className="flex items-start gap-2 text-[13px] text-[var(--privora-text)]">
                                    <span className="mt-0.5 text-[var(--privora-muted)]">{item.status === "undone" ? "Undone:" : ""}</span>
                                    <span>{formatActivityDiff(item)}</span>
                                  </div>
                              ))}
                            </div>
                          )}
                          {items.map(item => (
                            <button key={item.id} type="button" onClick={() => openActivityTarget(item)} className="block w-full text-left text-[13px]">
                              <span className="font-semibold capitalize">{item.action} {item.targetType}</span>
                              <span className="ml-2 text-[var(--privora-muted)]">{item.title} · {item.status}</span>
                            </button>
                          ))}
                          {session.error && <div className="text-[12px] text-red-500">{session.error}</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
                {activity.filter(item => !item.sessionId).map(item => (
                  <div key={item.id} className="flex flex-col gap-3 border-l border-[var(--privora-border)]/70 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <button type="button" onClick={() => openActivityTarget(item)} className="min-w-0 text-left">
                      <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">
                        <span className="capitalize">{item.action}</span>
                        <span className="text-[var(--privora-muted)]">{item.targetType}</span>
                        <span className="rounded-full bg-[var(--privora-text)]/[0.05] px-2 py-0.5 text-[11px] capitalize text-[var(--privora-muted)]">{item.source}</span>
                      </div>
                      <div className="mt-1 truncate text-[14px]">{item.title}</div>
                      <div className="mt-1 text-[11px] text-[var(--privora-muted)]">{new Date(item.createdAt).toLocaleString()}</div>
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] capitalize text-[var(--privora-muted)]">{item.status}</span>
                      {item.undoState === "available" && (
                        <button type="button" onClick={async () => { await undoCommandActivity(item.id); await refresh(); }} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--privora-border)]/70 px-2.5 text-[12px] font-semibold">
                          <RotateCcw className="h-3.5 w-3.5" /> Undo
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {activity.length === 0 && visibleSessions.length === 0 && <div className="py-8 text-sm text-[var(--privora-muted)]">No activity yet.</div>}
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
