import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppSnapshot,
  ActiveRunState,
  ChatMessageRecord,
  DesktopEvent,
  SettingsRecord,
  ThreadRecord,
  ToolEventRecord,
  TurnUndoRecord,
  WorkspaceRecord,
  RequestUserInputRequestRecord,
  SubagentRecord,
} from "../../shared/types";
import { GEMINI_35_FLASH_MODEL_ID } from "../../shared/models";

const emptySettings: SettingsRecord = {
  id: "default",
  model: GEMINI_35_FLASH_MODEL_ID,
  reasoningEffort: "medium",
  permissionMode: "ask_risky",
  collaborationMode: "default",
  theme: "system",
  cliproxyBaseUrl: "http://127.0.0.1:8317",
  openRouterApiKeyStored: false,
  geminiApiKeyStored: false,
};

const emptySnapshot: AppSnapshot = {
  settings: emptySettings,
  workspaces: [],
  threads: [],
  messages: [],
  toolEvents: [],
  subagents: [],
  turnUndos: [],
  approvalScopes: [],
  approvalHistory: [],
  activeThreadId: null,
  activeWorkspaceId: null,
  activeRun: null,
  activeRuns: [],
};

type ThreadBuckets<T> = Record<string, T[]>;

type DesktopUiSnapshot = AppSnapshot & {
  messagesByThread: ThreadBuckets<ChatMessageRecord>;
  toolEventsByThread: ThreadBuckets<ToolEventRecord>;
  turnUndosByThread: ThreadBuckets<TurnUndoRecord>;
  subagentsByThread: ThreadBuckets<SubagentRecord>;
  activeRunsByThread: Record<string, ActiveRunState>;
  pendingUserInputsByThread: Record<string, RequestUserInputRequestRecord>;
  pendingUserInput: RequestUserInputRequestRecord | null;
};

const emptyUiSnapshot: DesktopUiSnapshot = {
  ...emptySnapshot,
  messagesByThread: {},
  toolEventsByThread: {},
  turnUndosByThread: {},
  subagentsByThread: {},
  activeRunsByThread: {},
  pendingUserInputsByThread: {},
  pendingUserInput: null,
};

export const useDesktopState = () => {
  const [snapshot, setSnapshot] = useState<DesktopUiSnapshot>(emptyUiSnapshot);
  const [toast, setToast] = useState<string | null>(null);
  const queuedEventsRef = useRef<DesktopEvent[]>([]);
  const frameRef = useRef<number | null>(null);
  const eventStatsRef = useRef({ startedAt: performance.now(), events: 0, bytes: 0, flushes: 0 });

  const refresh = useCallback(async () => {
    const next = await window.privoraDesktop.getSnapshot();
    setSnapshot((current) => applySnapshot(current, next));
  }, []);

  const flushEvents = useCallback(() => {
    frameRef.current = null;
    const started = performance.now();
    const events = coalesceDesktopEvents(queuedEventsRef.current);
    queuedEventsRef.current = [];
    if (events.length === 0) return;
    setSnapshot((current) => reduceDesktopEvents(current, events));
    recordEventFlush(eventStatsRef.current, events, performance.now() - started);
  }, []);

  const enqueueEvent = useCallback((event: DesktopEvent) => {
    if (event.type === "toast") {
      setToast(event.message);
      window.setTimeout(() => setToast(null), 4500);
      return;
    }
    queuedEventsRef.current.push(event);
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(flushEvents);
  }, [flushEvents]);

  useEffect(() => {
    void refresh();
    const unsubscribe = window.privoraDesktop.onEvent(enqueueEvent);
    return () => {
      unsubscribe();
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      queuedEventsRef.current = [];
    };
  }, [enqueueEvent, refresh]);

  const activeThread = useMemo(
    () => snapshot.threads.find((thread) => thread.id === snapshot.activeThreadId) || null,
    [snapshot.activeThreadId, snapshot.threads],
  );
  const activeWorkspace = useMemo(
    () => snapshot.workspaces.find((workspace) => workspace.id === snapshot.activeWorkspaceId) || null,
    [snapshot.activeWorkspaceId, snapshot.workspaces],
  );

  return {
    snapshot,
    activeThread,
    activeWorkspace,
    toast,
    refresh,
    setSnapshot,
  };
};

export const reduceDesktopEvents = (snapshot: DesktopUiSnapshot, events: DesktopEvent[]): DesktopUiSnapshot => {
  let next = snapshot;
  for (const event of events) {
    if (event.type === "snapshot") {
      next = applySnapshot(next, event.snapshot);
      continue;
    }
    if (event.type === "message_updated") {
      const messagesByThread = upsertBucketById(next.messagesByThread, event.message.threadId, event.message);
      const messages = event.message.threadId === next.activeThreadId ? messagesByThread[event.message.threadId] || [] : next.messages;
      if (messagesByThread !== next.messagesByThread || messages !== next.messages) next = { ...next, messagesByThread, messages };
      continue;
    }
    if (event.type === "tool_updated") {
      const toolEventsByThread = upsertBucketById(next.toolEventsByThread, event.tool.threadId, event.tool);
      const childParentId = parentThreadForChildTool(next, event.tool.threadId);
      const parentThreadId = childParentId || event.tool.threadId;
      const parentBuckets = childParentId && next.activeThreadId === childParentId
        ? upsertBucketById(toolEventsByThread, childParentId, { ...event.tool, messageId: childParentMessageId(next, event.tool.threadId) || event.tool.messageId })
        : toolEventsByThread;
      const toolEvents = parentThreadId === next.activeThreadId ? parentBuckets[parentThreadId] || [] : next.toolEvents;
      if (parentBuckets !== next.toolEventsByThread || toolEvents !== next.toolEvents) next = { ...next, toolEventsByThread: parentBuckets, toolEvents };
      continue;
    }
    if (event.type === "turn_undo_updated") {
      const turnUndosByThread = upsertBucketById(next.turnUndosByThread, event.undo.threadId, event.undo);
      const turnUndos = event.undo.threadId === next.activeThreadId ? turnUndosByThread[event.undo.threadId] || [] : next.turnUndos;
      if (turnUndosByThread !== next.turnUndosByThread || turnUndos !== next.turnUndos) next = { ...next, turnUndosByThread, turnUndos };
      continue;
    }
    if (event.type === "run_state") {
      const activeRunsByThread = { ...next.activeRunsByThread };
      if (next.activeRun) activeRunsByThread[next.activeRun.threadId] = next.activeRun;
      if (event.run) activeRunsByThread[event.threadId] = event.run;
      else delete activeRunsByThread[event.threadId];
      const activeRuns = Object.values(activeRunsByThread);
      const activeRun = next.activeThreadId ? activeRunsByThread[next.activeThreadId] || null : null;
      next = { ...next, activeRunsByThread, activeRuns, activeRun };
      continue;
    }
    if (event.type === "request_user_input") {
      const pendingUserInputsByThread = {
        ...next.pendingUserInputsByThread,
        [event.request.threadId]: event.request,
      };
      next = {
        ...next,
        pendingUserInputsByThread,
        pendingUserInput: next.activeThreadId ? pendingUserInputsByThread[next.activeThreadId] || null : null,
      };
      continue;
    }
    if (event.type === "request_user_input_resolved") {
      const pendingUserInputsByThread = { ...next.pendingUserInputsByThread };
      if (pendingUserInputsByThread[event.threadId]?.callId === event.callId) {
        delete pendingUserInputsByThread[event.threadId];
      }
      next = {
        ...next,
        pendingUserInputsByThread,
        pendingUserInput: next.activeThreadId ? pendingUserInputsByThread[next.activeThreadId] || null : null,
      };
      continue;
    }
    if (event.type === "command_output_delta") {
      const timestamp = Date.now();
      let changed = false;
      const toolEventsByThread = mapBuckets(next.toolEventsByThread, (tool) => {
        if (tool.callId !== event.callId) return tool;
        changed = true;
        return { ...tool, output: compactLiveOutput(`${tool.output || ""}${event.delta}`), updatedAt: timestamp };
      });
      if (changed) {
        const toolEvents = next.activeThreadId ? toolEventsByThread[next.activeThreadId] || [] : [];
        next = { ...next, toolEventsByThread, toolEvents };
      }
    }
  }
  return next;
};

const parentThreadForChildTool = (snapshot: DesktopUiSnapshot, childThreadId: string) =>
  Object.values(snapshot.subagentsByThread)
    .flat()
    .find((agent) => agent.threadId === childThreadId)?.parentThreadId || null;

const childParentMessageId = (snapshot: DesktopUiSnapshot, childThreadId: string) =>
  Object.values(snapshot.subagentsByThread)
    .flat()
    .find((agent) => agent.threadId === childThreadId)?.parentMessageId || null;

const applySnapshot = (current: DesktopUiSnapshot, snapshot: AppSnapshot): DesktopUiSnapshot => {
  const activeThreadId = snapshot.activeThreadId;
  const messagesByThread = { ...current.messagesByThread };
  const toolEventsByThread = { ...current.toolEventsByThread };
  const turnUndosByThread = { ...current.turnUndosByThread };
  const subagentsByThread = { ...current.subagentsByThread };

  if (activeThreadId) {
    messagesByThread[activeThreadId] = snapshot.messages;
    toolEventsByThread[activeThreadId] = snapshot.toolEvents;
    turnUndosByThread[activeThreadId] = snapshot.turnUndos;
    subagentsByThread[activeThreadId] = snapshot.subagents || [];
  }

  const liveThreadIds = new Set(snapshot.threads.map((thread) => thread.id));
  pruneBuckets(messagesByThread, liveThreadIds);
  pruneBuckets(toolEventsByThread, liveThreadIds);
  pruneBuckets(turnUndosByThread, liveThreadIds);
  pruneBuckets(subagentsByThread, liveThreadIds);

  const activeRunsByThread = Object.fromEntries((snapshot.activeRuns || []).map((run) => [run.threadId, run]));
  if (snapshot.activeRun) activeRunsByThread[snapshot.activeRun.threadId] = snapshot.activeRun;

  return {
    ...snapshot,
    messages: activeThreadId ? messagesByThread[activeThreadId] || [] : [],
    toolEvents: activeThreadId ? toolEventsByThread[activeThreadId] || [] : [],
    turnUndos: activeThreadId ? turnUndosByThread[activeThreadId] || [] : [],
    subagents: activeThreadId ? subagentsByThread[activeThreadId] || [] : [],
    activeRun: activeThreadId ? activeRunsByThread[activeThreadId] || null : null,
    activeRuns: Object.values(activeRunsByThread),
    messagesByThread,
    toolEventsByThread,
    turnUndosByThread,
    subagentsByThread,
    activeRunsByThread,
    pendingUserInputsByThread: current.pendingUserInputsByThread,
    pendingUserInput: activeThreadId ? current.pendingUserInputsByThread[activeThreadId] || null : null,
  };
};

export const coalesceDesktopEvents = (events: DesktopEvent[]): DesktopEvent[] => {
  const coalesced: DesktopEvent[] = [];
  let messages = new Map<string, ChatMessageRecord>();
  let tools = new Map<string, ToolEventRecord>();
  let undos = new Map<string, TurnUndoRecord>();
  let runStates = new Map<string, Extract<DesktopEvent, { type: "run_state" }>>();
  const commandDeltas = new Map<string, string>();

  const flush = () => {
    messages.forEach((message) => coalesced.push({ type: "message_updated", message }));
    tools.forEach((tool) => coalesced.push({ type: "tool_updated", tool }));
    undos.forEach((undo) => coalesced.push({ type: "turn_undo_updated", undo }));
    commandDeltas.forEach((delta, callId) => coalesced.push({ type: "command_output_delta", callId, delta }));
    runStates.forEach((event) => coalesced.push(event));
    messages = new Map();
    tools = new Map();
    undos = new Map();
    runStates = new Map();
    commandDeltas.clear();
  };

  for (const event of events) {
    if (event.type === "snapshot") {
      flush();
      coalesced.push(event);
      continue;
    }
    if (event.type === "message_updated") {
      messages.set(event.message.id, event.message);
      continue;
    }
    if (event.type === "tool_updated") {
      tools.set(event.tool.id, event.tool);
      continue;
    }
    if (event.type === "turn_undo_updated") {
      undos.set(event.undo.id, event.undo);
      continue;
    }
    if (event.type === "run_state") {
      runStates.set(event.threadId, event);
      continue;
    }
    if (event.type === "command_output_delta") {
      commandDeltas.set(event.callId, `${commandDeltas.get(event.callId) || ""}${event.delta}`);
      continue;
    }
    flush();
    coalesced.push(event);
  }
  flush();
  return coalesced;
};

const upsertById = <T extends { id: string; createdAt?: number; updatedAt?: number }>(items: T[], item: T): T[] => {
  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index >= 0) {
    const next = items.slice();
    next[index] = item;
    return next;
  }
  const next = [...items, item];
  next.sort((a, b) => (a.createdAt || a.updatedAt || 0) - (b.createdAt || b.updatedAt || 0));
  return next;
};

const upsertBucketById = <T extends { id: string; createdAt?: number; updatedAt?: number }>(
  buckets: ThreadBuckets<T>,
  threadId: string,
  item: T,
) => {
  const current = buckets[threadId] || [];
  const nextItems = upsertById(current, item);
  if (nextItems === current) return buckets;
  return { ...buckets, [threadId]: nextItems };
};

const mapBuckets = <T,>(buckets: ThreadBuckets<T>, mapper: (item: T) => T): ThreadBuckets<T> => {
  let changed = false;
  const next: ThreadBuckets<T> = {};
  Object.entries(buckets).forEach(([threadId, items]) => {
    let bucketChanged = false;
    const mapped = items.map((item) => {
      const nextItem = mapper(item);
      if (nextItem !== item) bucketChanged = true;
      return nextItem;
    });
    next[threadId] = bucketChanged ? mapped : items;
    changed ||= bucketChanged;
  });
  return changed ? next : buckets;
};

const pruneBuckets = <T,>(buckets: ThreadBuckets<T>, liveThreadIds: Set<string>) => {
  Object.keys(buckets).forEach((threadId) => {
    if (!liveThreadIds.has(threadId)) delete buckets[threadId];
  });
};

const compactLiveOutput = (value: string, maxChars = 140_000) => {
  if (value.length <= maxChars) return value;
  const head = value.slice(0, 40_000);
  const tail = value.slice(-(maxChars - 40_000));
  return `${head}\n\n[... live output compacted ...]\n\n${tail}`;
};

const recordEventFlush = (
  stats: { startedAt: number; events: number; bytes: number; flushes: number },
  events: DesktopEvent[],
  durationMs: number,
) => {
  if (!window.privoraDesktop.debugEnabled) return;
  stats.events += events.length;
  stats.bytes += events.reduce((sum, event) => sum + approximatePayloadBytes(event), 0);
  stats.flushes += 1;
  const elapsed = performance.now() - stats.startedAt;
  if (elapsed < 1000) return;
  console.info("[privora:renderer-events]", {
    eventsPerSecond: Math.round((stats.events / elapsed) * 1000),
    kbPerSecond: Math.round((stats.bytes / elapsed) * 1000 / 1024),
    flushes: stats.flushes,
    lastFlushMs: Math.round(durationMs * 10) / 10,
  });
  stats.startedAt = performance.now();
  stats.events = 0;
  stats.bytes = 0;
  stats.flushes = 0;
};

const approximatePayloadBytes = (event: DesktopEvent) => {
  try {
    return JSON.stringify(event).length;
  } catch {
    return 0;
  }
};

export type { AppSnapshot, ChatMessageRecord, ThreadRecord, ToolEventRecord, WorkspaceRecord };
