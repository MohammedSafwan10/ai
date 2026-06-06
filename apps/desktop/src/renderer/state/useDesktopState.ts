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
  ThreadHistoryPage,
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
  appwriteEndpoint: "https://sgp.cloud.appwrite.io/v1",
  appwriteProjectId: "69af9f0700103b7f3482",
  privoraGatewayFunctionId: "model-gateway",
  openRouterApiKeyStored: false,
  geminiApiKeyStored: false,
  privoraAccountConnected: false,
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
  contextUsage: undefined,
  aiCredits: undefined,
};

type DesktopUiSnapshot = AppSnapshot & {
  activeRunsByThread: Record<string, ActiveRunState>;
  pendingUserInputsByThread: Record<string, RequestUserInputRequestRecord>;
  pendingUserInput: RequestUserInputRequestRecord | null;
};

const emptyUiSnapshot: DesktopUiSnapshot = {
  ...emptySnapshot,
  activeRunsByThread: {},
  pendingUserInputsByThread: {},
  pendingUserInput: null,
};

export const useDesktopState = () => {
  const [snapshot, setSnapshot] = useState<DesktopUiSnapshot>(emptyUiSnapshot);
  const [toast, setToast] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const queuedEventsRef = useRef<DesktopEvent[]>([]);
  const frameRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const eventStatsRef = useRef({ startedAt: performance.now(), events: 0, bytes: 0, flushes: 0 });

  const refresh = useCallback(async () => {
    const next = await window.privoraDesktop.getSnapshot();
    setSnapshot((current) => applySnapshot(current, next));
  }, []);

  const loadOlderMessages = useCallback(async () => {
    const threadId = snapshot.activeThreadId;
    const before = snapshot.historyPage?.beforeCursor;
    if (!threadId || !snapshot.historyPage?.hasOlder || !before || historyLoading) return false;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const page = await window.privoraDesktop.getThreadHistoryPage({ threadId, before, limit: 50 });
      setSnapshot((current) => current.activeThreadId === threadId ? prependHistoryPage(current, page) : current);
      return true;
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setHistoryLoading(false);
    }
  }, [historyLoading, snapshot.activeThreadId, snapshot.historyPage?.beforeCursor, snapshot.historyPage?.hasOlder]);

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
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
      setToast(event.message);
      toastTimerRef.current = window.setTimeout(() => {
        setToast(null);
        toastTimerRef.current = null;
      }, 4500);
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
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
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
    loadOlderMessages,
    historyLoading,
    historyError,
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
      if (event.message.threadId === next.activeThreadId) next = { ...next, messages: upsertById(next.messages, event.message) };
      continue;
    }
    if (event.type === "tool_updated") {
      const parent = next.subagents.find((agent) => agent.threadId === event.tool.threadId);
      if (event.tool.threadId === next.activeThreadId || parent?.parentThreadId === next.activeThreadId) {
        next = { ...next, toolEvents: upsertById(next.toolEvents, parent ? { ...event.tool, messageId: parent.parentMessageId } : event.tool) };
      }
      continue;
    }
    if (event.type === "turn_undo_updated") {
      if (event.undo.threadId === next.activeThreadId) next = { ...next, turnUndos: upsertById(next.turnUndos, event.undo) };
      continue;
    }
    if (event.type === "context_usage_updated") {
      if (event.usage.threadId === next.activeThreadId) {
        next = { ...next, contextUsage: event.usage };
      }
      continue;
    }
    if (event.type === "ai_credit_summary_updated") {
      next = { ...next, aiCredits: event.summary };
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
      const toolEvents = next.toolEvents.map((tool) => {
        if (tool.callId !== event.callId) return tool;
        changed = true;
        return { ...tool, output: compactLiveOutput(`${tool.output || ""}${event.delta}`), updatedAt: timestamp };
      });
      if (changed) next = { ...next, toolEvents };
    }
  }
  return next;
};

const applySnapshot = (current: DesktopUiSnapshot, snapshot: AppSnapshot): DesktopUiSnapshot => {
  const activeThreadId = snapshot.activeThreadId;
  const sameThread = Boolean(activeThreadId && activeThreadId === current.activeThreadId);
  const messages = sameThread ? mergeUnique(current.messages, snapshot.messages) : snapshot.messages;
  const toolEvents = sameThread ? mergeUnique(current.toolEvents, snapshot.toolEvents) : snapshot.toolEvents;
  const turnUndos = sameThread ? mergeUnique(current.turnUndos, snapshot.turnUndos) : snapshot.turnUndos;
  const activeRunsByThread = Object.fromEntries((snapshot.activeRuns || []).map((run) => [run.threadId, run]));
  if (snapshot.activeRun) activeRunsByThread[snapshot.activeRun.threadId] = snapshot.activeRun;

  return {
    ...snapshot,
    messages,
    toolEvents,
    turnUndos,
    historyPage: sameThread && current.historyPage
      ? { ...current.historyPage, messages, toolEvents, turnUndos }
      : snapshot.historyPage,
    contextUsage: snapshot.contextUsage || (
      current.contextUsage?.threadId === activeThreadId ? current.contextUsage : undefined
    ),
    activeRun: activeThreadId ? activeRunsByThread[activeThreadId] || null : null,
    activeRuns: Object.values(activeRunsByThread),
    activeRunsByThread,
    pendingUserInputsByThread: current.pendingUserInputsByThread,
    pendingUserInput: activeThreadId ? current.pendingUserInputsByThread[activeThreadId] || null : null,
  };
};

export const prependHistoryPage = (current: DesktopUiSnapshot, page: ThreadHistoryPage): DesktopUiSnapshot => {
  const messages = mergeUnique(page.messages, current.messages);
  const toolEvents = mergeUnique(page.toolEvents, current.toolEvents);
  const turnUndos = mergeUnique(page.turnUndos, current.turnUndos);
  return {
    ...current,
    messages,
    toolEvents,
    turnUndos,
    historyPage: {
      threadId: page.threadId,
      messages,
      toolEvents,
      turnUndos,
      beforeCursor: page.beforeCursor,
      hasOlder: page.hasOlder,
    },
  };
};

const mergeUnique = <T extends { id: string; createdAt?: number; updatedAt?: number }>(older: T[], current: T[]) => {
  const byId = new Map(older.map((item) => [item.id, item]));
  current.forEach((item) => byId.set(item.id, item));
  return [...byId.values()].sort((a, b) => (a.createdAt || a.updatedAt || 0) - (b.createdAt || b.updatedAt || 0) || a.id.localeCompare(b.id));
};

export const coalesceDesktopEvents = (events: DesktopEvent[]): DesktopEvent[] => {
  const coalesced: DesktopEvent[] = [];
  let messages = new Map<string, ChatMessageRecord>();
  let tools = new Map<string, ToolEventRecord>();
  let undos = new Map<string, TurnUndoRecord>();
  let contextUsage: Extract<DesktopEvent, { type: "context_usage_updated" }> | null = null;
  let runStates = new Map<string, Extract<DesktopEvent, { type: "run_state" }>>();
  const commandDeltas = new Map<string, string>();

  const flush = () => {
    messages.forEach((message) => coalesced.push({ type: "message_updated", message }));
    tools.forEach((tool) => coalesced.push({ type: "tool_updated", tool }));
    undos.forEach((undo) => coalesced.push({ type: "turn_undo_updated", undo }));
    if (contextUsage) coalesced.push(contextUsage);
    commandDeltas.forEach((delta, callId) => coalesced.push({ type: "command_output_delta", callId, delta }));
    runStates.forEach((event) => coalesced.push(event));
    messages = new Map();
    tools = new Map();
    undos = new Map();
    contextUsage = null;
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
    if (event.type === "context_usage_updated") {
      contextUsage = event;
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
