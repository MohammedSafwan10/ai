import { useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin, { Draggable, type EventReceiveArg } from "@fullcalendar/interaction";
import type { DateSelectArg, EventChangeArg, EventClickArg } from "@fullcalendar/core";
import { CalendarDays, Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import type { CommandScheduleBlockRecord, CommandTaskRecord } from "../../../lib/db";
import {
  createCommandScheduleBlock,
  deleteCommandScheduleBlock,
  updateCommandScheduleBlock,
} from "../lib/storage";
import { cn } from "../../../lib/utils";

interface CommandSchedulePanelProps {
  tasks: CommandTaskRecord[];
  blocks: CommandScheduleBlockRecord[];
  selectedItemId?: string | null;
  onRefresh: () => Promise<void>;
}

const toDateTimeInput = (timestamp?: number) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

const fromDateTimeInput = (value: string) => {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : undefined;
};

const defaultBlockDraft = () => {
  const start = new Date();
  start.setMinutes(Math.ceil(start.getMinutes() / 30) * 30, 0, 0);
  return {
    title: "",
    startAt: toDateTimeInput(start.getTime()),
    endAt: toDateTimeInput(start.getTime() + 30 * 60_000),
    allDay: false,
    taskId: "",
    notes: "",
  };
};

export function CommandSchedulePanel({ tasks, blocks, selectedItemId, onRefresh }: CommandSchedulePanelProps) {
  const taskTrayRef = useRef<HTMLDivElement | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(selectedItemId || null);
  const [isTaskTrayOpen, setIsTaskTrayOpen] = useState(true);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [draft, setDraft] = useState(defaultBlockDraft);
  const selectedBlock = blocks.find(block => block.id === selectedBlockId) || null;
  const openTasks = tasks.filter(task => task.status !== "done" && task.status !== "archived");

  useEffect(() => {
    if (selectedItemId) setSelectedBlockId(selectedItemId);
  }, [selectedItemId]);

  useEffect(() => {
    if (!selectedBlock) return;
    setDraft({
      title: selectedBlock.title,
      startAt: toDateTimeInput(selectedBlock.startAt),
      endAt: toDateTimeInput(selectedBlock.endAt),
      allDay: selectedBlock.allDay,
      taskId: selectedBlock.taskId || "",
      notes: selectedBlock.notes || "",
    });
  }, [selectedBlock]);

  useEffect(() => {
    if (!taskTrayRef.current) return;
    const draggable = new Draggable(taskTrayRef.current, {
      itemSelector: "[data-schedule-task]",
      eventData: element => ({
        title: element.getAttribute("data-title") || "Task block",
        duration: "00:30",
        extendedProps: { taskId: element.getAttribute("data-task-id") || "" },
      }),
    });
    return () => draggable.destroy();
  }, [openTasks.length]);

  const events = useMemo(() => blocks.map(block => {
    const task = tasks.find(item => item.id === block.taskId);
    return {
      id: block.id,
      title: block.title,
      start: block.startAt,
      end: block.endAt,
      allDay: block.allDay,
      extendedProps: { taskId: block.taskId, completed: task?.status === "done" },
      classNames: task?.status === "done" ? ["schedule-event-completed"] : [],
    };
  }), [blocks, tasks]);

  const resetDraft = (range?: { start: number; end: number; allDay?: boolean }) => {
    const next = defaultBlockDraft();
    setSelectedBlockId(null);
    setDeleteCandidateId(null);
    setDraft(range ? {
      ...next,
      startAt: toDateTimeInput(range.start),
      endAt: toDateTimeInput(range.end),
      allDay: Boolean(range.allDay),
    } : next);
  };

  const saveBlock = async () => {
    const startAt = fromDateTimeInput(draft.startAt);
    const endAt = fromDateTimeInput(draft.endAt);
    if (!startAt || !endAt || endAt <= startAt) return;
    if (selectedBlock) {
      await updateCommandScheduleBlock(selectedBlock.id, {
        title: draft.title,
        startAt,
        endAt,
        allDay: draft.allDay,
        taskId: draft.taskId || undefined,
        notes: draft.notes,
      });
    } else {
      await createCommandScheduleBlock({
        title: draft.title || tasks.find(task => task.id === draft.taskId)?.title || "Scheduled block",
        startAt,
        endAt,
        allDay: draft.allDay,
        taskId: draft.taskId || undefined,
        notes: draft.notes,
      });
    }
    await onRefresh();
  };

  const acceptCalendarChange = async ({ event, revert }: EventChangeArg) => {
    const startAt = event.start?.getTime();
    const endAt = event.end?.getTime() || (startAt ? startAt + 30 * 60_000 : undefined);
    if (!startAt || !endAt) {
      revert();
      return;
    }
    await updateCommandScheduleBlock(event.id, { startAt, endAt, allDay: event.allDay });
    await onRefresh();
  };

  const receiveTask = async ({ event }: EventReceiveArg) => {
    const startAt = event.start?.getTime();
    const endAt = event.end?.getTime() || (startAt ? startAt + 30 * 60_000 : undefined);
    if (!startAt || !endAt) return;
    await createCommandScheduleBlock({
      title: event.title,
      startAt,
      endAt,
      allDay: event.allDay,
      taskId: String(event.extendedProps.taskId || "") || undefined,
    });
    event.remove();
    await onRefresh();
  };

  const selectRange = ({ start, end, allDay }: DateSelectArg) => resetDraft({ start: start.getTime(), end: end.getTime(), allDay });
  const selectEvent = ({ event }: EventClickArg) => setSelectedBlockId(event.id);

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[17rem_minmax(0,1fr)_20rem]">
      <aside className="min-w-0 xl:border-r xl:border-[var(--privora-border)]/45 xl:pr-5">
        <button
          type="button"
          onClick={() => setIsTaskTrayOpen(value => !value)}
          className="mb-3 flex w-full items-center justify-between text-left text-[13px] font-semibold text-[var(--privora-muted)]"
        >
          <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Unscheduled tasks</span>
          <ChevronDown className={cn("h-4 w-4 transition-transform xl:hidden", !isTaskTrayOpen && "-rotate-90")} />
        </button>
        <div ref={taskTrayRef} className={cn("space-y-1.5", !isTaskTrayOpen && "hidden xl:block")}>
          {openTasks.map(task => (
            <button
              key={task.id}
              type="button"
              data-schedule-task
              data-task-id={task.id}
              data-title={task.title}
              onClick={() => setDraft(previous => ({ ...previous, title: task.title, taskId: task.id }))}
              className="w-full cursor-grab border-l border-[var(--privora-border)]/65 px-3 py-2.5 text-left transition hover:bg-[var(--privora-text)]/[0.03] active:cursor-grabbing"
            >
              <div className="truncate text-[13px] font-semibold">{task.title}</div>
              <div className="mt-1 text-[11px] capitalize text-[var(--privora-muted)]">{task.priority} priority</div>
            </button>
          ))}
          {openTasks.length === 0 && <div className="py-6 text-[13px] text-[var(--privora-muted)]">No open tasks to plan.</div>}
        </div>
      </aside>

      <section className="schedule-calendar min-w-0">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView={window.innerWidth < 720 ? "timeGridDay" : "timeGridWeek"}
          headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }}
          buttonText={{ today: "Today", month: "Month", week: "Week", day: "Day" }}
          events={events}
          selectable
          editable
          droppable
          eventResizableFromStart
          nowIndicator
          allDaySlot
          selectMirror
          dayMaxEvents
          slotMinTime="06:00:00"
          slotMaxTime="23:00:00"
          slotDuration="00:30:00"
          height="auto"
          eventReceive={receiveTask}
          eventDrop={acceptCalendarChange}
          eventResize={acceptCalendarChange}
          select={selectRange}
          eventClick={selectEvent}
          eventContent={info => (
            <div className={cn("min-w-0 px-1 py-0.5", info.event.extendedProps.completed && "line-through opacity-60")}>
              <div className="truncate font-semibold">{info.event.title}</div>
              {info.timeText && <div className="truncate text-[10px] opacity-70">{info.timeText}</div>}
            </div>
          )}
        />
        <style>{`
          .schedule-calendar .fc { --fc-border-color: color-mix(in srgb, var(--privora-border) 55%, transparent); --fc-page-bg-color: transparent; --fc-neutral-bg-color: color-mix(in srgb, var(--privora-text) 3%, transparent); --fc-today-bg-color: color-mix(in srgb, var(--privora-accent) 7%, transparent); --fc-event-bg-color: color-mix(in srgb, var(--privora-accent) 14%, var(--privora-surface)); --fc-event-border-color: color-mix(in srgb, var(--privora-accent) 34%, transparent); --fc-event-text-color: var(--privora-text); font-size: 13px; }
          .schedule-calendar .fc .fc-toolbar { align-items: center; gap: 10px; margin-bottom: 16px; }
          .schedule-calendar .fc .fc-toolbar-title { font-size: 16px; font-weight: 600; }
          .schedule-calendar .fc .fc-button { background: transparent; border-color: color-mix(in srgb, var(--privora-border) 70%, transparent); color: var(--privora-muted); box-shadow: none; font-size: 12px; font-weight: 600; padding: 7px 10px; text-transform: none; }
          .schedule-calendar .fc .fc-button-primary:not(:disabled).fc-button-active, .schedule-calendar .fc .fc-button:hover { background: color-mix(in srgb, var(--privora-text) 5%, transparent); border-color: var(--privora-border); color: var(--privora-text); }
          .schedule-calendar .fc .fc-col-header-cell-cushion, .schedule-calendar .fc .fc-timegrid-axis-cushion { color: var(--privora-muted); font-size: 11px; font-weight: 600; padding: 8px 4px; }
          .schedule-calendar .fc .fc-timegrid-slot-label-cushion { color: var(--privora-muted); font-size: 11px; }
          .schedule-calendar .fc-theme-standard td, .schedule-calendar .fc-theme-standard th, .schedule-calendar .fc-theme-standard .fc-scrollgrid { border-color: color-mix(in srgb, var(--privora-border) 52%, transparent); }
          .schedule-calendar .fc .fc-event { border-radius: 5px; cursor: pointer; }
          .schedule-calendar .fc .schedule-event-completed { opacity: .7; }
          @media (max-width: 720px) { .schedule-calendar .fc .fc-toolbar { flex-wrap: wrap; } .schedule-calendar .fc .fc-toolbar-title { font-size: 14px; } }
        `}</style>
      </section>

      <aside className="min-w-0 xl:border-l xl:border-[var(--privora-border)]/45 xl:pl-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[13px] font-semibold text-[var(--privora-muted)]">{selectedBlock ? "Edit block" : "New block"}</div>
          <button type="button" onClick={() => resetDraft()} className="rounded-md p-1.5 text-[var(--privora-muted)] hover:bg-[var(--privora-text)]/5" title="New schedule block">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-3">
          <input value={draft.title} onChange={event => setDraft(previous => ({ ...previous, title: event.target.value }))} placeholder="Block title" className="h-11 rounded-lg border border-[var(--privora-border)]/70 bg-transparent px-3 outline-none" />
          <select value={draft.taskId} onChange={event => setDraft(previous => ({ ...previous, taskId: event.target.value }))} className="h-11 rounded-lg border border-[var(--privora-border)]/70 bg-[var(--privora-bg)] px-3 outline-none">
            <option value="">No linked task</option>
            {tasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}
          </select>
          <label className="grid gap-1 text-[12px] font-semibold text-[var(--privora-muted)]">
            Starts
            <input type="datetime-local" value={draft.startAt} onChange={event => setDraft(previous => ({ ...previous, startAt: event.target.value }))} className="h-11 rounded-lg border border-[var(--privora-border)]/70 bg-transparent px-3 text-[var(--privora-text)] outline-none" />
          </label>
          <label className="grid gap-1 text-[12px] font-semibold text-[var(--privora-muted)]">
            Ends
            <input type="datetime-local" value={draft.endAt} onChange={event => setDraft(previous => ({ ...previous, endAt: event.target.value }))} className="h-11 rounded-lg border border-[var(--privora-border)]/70 bg-transparent px-3 text-[var(--privora-text)] outline-none" />
          </label>
          <label className="inline-flex items-center gap-2 text-[13px] text-[var(--privora-muted)]">
            <input type="checkbox" checked={draft.allDay} onChange={event => setDraft(previous => ({ ...previous, allDay: event.target.checked }))} />
            All day
          </label>
          <textarea value={draft.notes} onChange={event => setDraft(previous => ({ ...previous, notes: event.target.value }))} placeholder="Notes" rows={4} className="resize-none rounded-lg border border-[var(--privora-border)]/70 bg-transparent px-3 py-2 outline-none" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => void saveBlock()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--privora-accent)] px-4 text-[13px] font-semibold text-[var(--privora-accent-fg)]">
            <Check className="h-4 w-4" /> Save
          </button>
          {selectedBlock && !deleteCandidateId && (
            <button type="button" onClick={() => setDeleteCandidateId(selectedBlock.id)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-500/30 px-3 text-[13px] font-semibold text-red-500">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          )}
        </div>
        {selectedBlock && deleteCandidateId === selectedBlock.id && (
          <div className="mt-3 border-l border-red-500/35 pl-3 text-[12px]">
            <div className="mb-2">Delete this scheduled block?</div>
            <div className="flex gap-2">
              <button type="button" onClick={async () => { await deleteCommandScheduleBlock(selectedBlock.id); resetDraft(); await onRefresh(); }} className="rounded-md border border-red-500/30 px-2 py-1 font-semibold text-red-500">Confirm</button>
              <button type="button" onClick={() => setDeleteCandidateId(null)} className="px-2 py-1 font-semibold text-[var(--privora-muted)]">Cancel</button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
