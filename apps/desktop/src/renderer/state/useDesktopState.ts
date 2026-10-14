import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppSnapshot,
  ActiveRunState,
  ChatMessageRecord,
  PrivoraEventEnvelope,
  SettingsRecord,
  ThreadRecord,
  ToolEventRecord,
  WorkspaceRecord,
  RequestUserInputRequestRecord,
  ThreadHistoryPage,
} from "../../shared/types";
import { GEMINI_37_FLASH_MODEL_ID } from "../../shared/models";
import { isNewPrivoraEventSequence } from "../../shared/privoraProtocol";

const emptySettings: SettingsRecord = {
  id: "default",
  model: GEMINI_37_FLASH_MODEL_ID,
  reasoningEffort: "medium",
  permissionMode: "ask_risky",
  collaborationMode: "default",
  agentHarnessMode: "standard",
  computerUseEnabled: false,
  keepRunningInTray: false,
  theme: "system",
  cliproxyBaseUrl: "http://127.0.0.1:8317",
  appwriteEndpoint: "https://sgp.cloud.appwrite.io/v1",
  appwriteProjectId: "69af9f0700103b7f3482",
  privoraGatewayFunctionId: "model-gateway",
  openRouterApiKeyStored: false,
  geminiApiKeyStored: false,
  deepseekApiKeyStored: false,
  opencodeGoApiKeyStored: false,
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
  terminal: { sessions: [], updatedAt: 0 },
};

type DesktopUiSnapshot = AppSnapshot & {
  activeRunsByThread: Record<string, ActiveRunState>;
  pendingUserInputsByThread: Record<string, RequestUserInputRequestRecord>;
  pendingUserInput: RequestUserInputRequestRecord | null;
  runEventSequences?: Record<string, number>;
  selectionEventSequence?: number;
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
  const queuedEventsRef = useRef<PrivoraEventEnvelope[]>([]);
  const frameRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const eventStatsRef = useRef({ startedAt: performance.now(), events: 0, bytes: 0, flushes: 0 });
  const lastEventSequenceRef = useRef(0);
  const refreshRequestRef = useRef(0);
  const historyRequestRef = useRef<{ threadId: string; before: string } | null>(null);
  const activeThreadRef = useRef(snapshot.activeThreadId);
  activeThreadRef.current = snapshot.activeThreadId;

  const refresh = useCallback(async () => {
    const request = ++refreshRequestRef.current;
    const sequenceAtRequest = lastEventSequenceRef.current;
    const next = await window.privoraDesktop.getSnapshot();
    if (request !== refreshRequestRef.current) return;
    setSnapshot((current) => applyRefreshSnapshot(current, next, sequenceAtRequest));
  }, []);

  const loadOlderMessages = useCallback(async () => {
    const threadId = snapshot.activeThreadId;
    const before = snapshot.historyPage?.beforeCursor;
    if (!threadId || !snapshot.historyPage?.hasOlder || !before || historyRequestRef.current?.threadId === threadId) return false;
    const request = { threadId, before };
    historyRequestRef.current = request;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const page = await window.privoraDesktop.getThreadHistoryPage({ threadId, before, limit: 50 });
      if (historyRequestRef.current !== request || activeThreadRef.current !== threadId) return false;
      setSnapshot((current) => current.activeThreadId === threadId ? prependHistoryPage(current, page) : current);
      return true;
    } catch (error) {
      if (historyRequestRef.current === request && activeThreadRef.current === threadId) setHistoryError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      if (historyRequestRef.current === request) { historyRequestRef.current = null; setHistoryLoading(false); }
    }
  }, [snapshot.activeThreadId, snapshot.historyPage?.beforeCursor, snapshot.historyPage?.hasOlder]);

  useEffect(() => {
    if (historyRequestRef.current?.threadId !== snapshot.activeThreadId) historyRequestRef.current = null;
    setHistoryLoading(false);
    setHistoryError(null);
  }, [snapshot.activeThreadId]);

  const flushEvents = useCallback(() => {
    frameRef.current = null;
    const started = performance.now();
    const events = coalescePrivoraEvents(queuedEventsRef.current);
    queuedEventsRef.current = [];
    if (events.length === 0) return;
    setSnapshot((current) => reducePrivoraEvents(current, events));
    recordEventFlush(eventStatsRef.current, events, performance.now() - started);
  }, []);

  const enqueueEvent = useCallback((event: PrivoraEventEnvelope) => {
    if (!isNewPrivoraEventSequence(lastEventSequenceRef.current, event)) return;
    lastEventSequenceRef.current = event.sequence;
    if (event.payload.type === "thread.rewound") {
      refreshRequestRef.current += 1;
      if (historyRequestRef.current?.threadId === event.payload.threadId) {
        historyRequestRef.current = null; setHistoryLoading(false);
      }
    }
    if (event.payload.type === "notification.created") {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
      setToast(event.payload.message);
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
    const unsubscribe = window.privoraDesktop.onPrivoraEvent(enqueueEvent);
    return () => {
      refreshRequestRef.current += 1;
      historyRequestRef.current = null;
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

export const reducePrivoraEvents = (snapshot: DesktopUiSnapshot, events: PrivoraEventEnvelope[]): DesktopUiSnapshot => {
  let next = snapshot;
  for (const envelope of events) {
    const event = envelope.payload;
    if (event.type === "snapshot.updated") {
      next = { ...applySnapshot(next, event.snapshot, true), selectionEventSequence: envelope.sequence };
      continue;
    }
    if (event.type === "thread.rewound") {
      if (event.threadId === next.activeThreadId) {
        const removed = new Set(event.removedMessageIds);
        next = { ...next,
          messages: next.messages.filter((message) => !removed.has(message.id)),
          toolEvents: next.toolEvents.filter((tool) => !removed.has(tool.messageId)),
          turnUndos: next.turnUndos.filter((undo) => !removed.has(undo.messageId)),
          subagents: next.subagents.filter((agent) => !removed.has(agent.parentMessageId)),
          contextUsage: undefined, activeRun: null, pendingUserInput: null,
        };
      }
      continue;
    }
    if (event.type === "message.upserted") {
      if (event.message.threadId === next.activeThreadId) next = { ...next, messages: upsertById(next.messages, event.message) };
      else if (event.message.role === "assistant" && !event.message.agentMessage) next = { ...next, subagents: next.subagents.map((agent) => agent.threadId === event.message.threadId ? { ...agent, lastPreview: event.message.content.slice(-240), updatedAt: event.message.updatedAt } : agent) };
      continue;
    }
    if (event.type === "tool.upserted") {
      if (event.tool.threadId === next.activeThreadId) {
        next = { ...next, toolEvents: upsertById(next.toolEvents, event.tool) };
      }
      continue;
    }
    if (event.type === "turn_undo.updated") {
      if (event.undo.threadId === next.activeThreadId) next = { ...next, turnUndos: upsertById(next.turnUndos, event.undo) };
      continue;
    }
    if (event.type === "context.usage_updated") {
      if (event.usage.threadId === next.activeThreadId) {
        next = { ...next, contextUsage: event.usage };
      }
      continue;
    }
    if (event.type === "ai_credit.summary_updated") {
      next = { ...next, aiCredits: event.summary };
      continue;
    }
    if (event.type === "turn.status_changed") {
      const activeRunsByThread = { ...next.activeRunsByThread };
      if (next.activeRun) activeRunsByThread[next.activeRun.threadId] = next.activeRun;
      if (event.run) activeRunsByThread[event.threadId] = event.run;
      else delete activeRunsByThread[event.threadId];
      const activeRuns = Object.values(activeRunsByThread);
      const activeRun = next.activeThreadId ? activeRunsByThread[next.activeThreadId] || null : null;
      next = { ...next, activeRunsByThread, activeRuns, activeRun, runEventSequences: { ...next.runEventSequences, [event.threadId]: envelope.sequence } };
      continue;
    }
    if (event.type === "turn.completed" || event.type === "turn.stopped" || event.type === "turn.failed") {
      const activeRunsByThread = { ...next.activeRunsByThread };
      const pendingUserInputsByThread = { ...next.pendingUserInputsByThread };
      if (pendingUserInputsByThread[event.threadId]?.assistantMessageId === event.turnId) delete pendingUserInputsByThread[event.threadId];
      if (next.activeRun) activeRunsByThread[next.activeRun.threadId] = next.activeRun;
      if (activeRunsByThread[event.threadId]?.assistantMessageId === event.turnId) delete activeRunsByThread[event.threadId];
      next = { ...next, activeRunsByThread, activeRuns: Object.values(activeRunsByThread), activeRun: next.activeThreadId ? activeRunsByThread[next.activeThreadId] || null : null,
        messages: event.message?.threadId === next.activeThreadId ? upsertById(next.messages, event.message) : next.messages,
        runEventSequences: { ...next.runEventSequences, [event.threadId]: envelope.sequence },
        pendingUserInputsByThread, pendingUserInput: next.activeThreadId ? pendingUserInputsByThread[next.activeThreadId] || null : null,
      };
      continue;
    }
    if (event.type === "user_input.requested") {
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
    if (event.type === "user_input.resolved") {
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
    if (event.type === "tool.output_delta") {
      const timestamp = Date.now();
      let changed = false;
      const toolEvents = next.toolEvents.map((tool) => {
        if (tool.callId !== event.callId) return tool;
        changed = true;
        return { ...tool, output: compactLiveOutput(`${tool.output || ""}${event.delta}`), updatedAt: timestamp };
      });
      if (changed) next = { ...next, toolEvents };
      continue;
    }
    if (event.type === "terminal.session_updated") {
      next = {
        ...next,
        terminal: {
          sessions: upsertBySessionId(next.terminal?.sessions || [], event.session),
          updatedAt: event.session.updatedAt,
        },
      };
      continue;
    }
    if (event.type === "terminal.output_delta") continue;
  }
  return next;
};

const applySnapshot = (current: DesktopUiSnapshot, snapshot: AppSnapshot, authoritative = false): DesktopUiSnapshot => {
  const activeThreadId = snapshot.activeThreadId;
  const sameThread = Boolean(activeThreadId && activeThreadId === current.activeThreadId);
  // A direct IPC refresh is not sequenced with pushed events. Never let an
  // older snapshot roll a streamed message/tool back to an earlier state.
  const loadedOlderMessages = authoritative ? current.messages.filter((message) => snapshot.historyPage?.hasOlder && message.createdAt < (snapshot.messages[0]?.createdAt ?? 0)) : current.messages;
  const retainedMessageIds = new Set(loadedOlderMessages.map((message) => message.id));
  const messages = sameThread ? mergeUnique(loadedOlderMessages, snapshot.messages, false) : snapshot.messages;
  const toolEvents = sameThread ? mergeUnique(authoritative ? current.toolEvents.filter((tool) => retainedMessageIds.has(tool.messageId)) : current.toolEvents, snapshot.toolEvents, false) : snapshot.toolEvents;
  const turnUndos = sameThread ? mergeUnique(authoritative ? current.turnUndos.filter((undo) => retainedMessageIds.has(undo.messageId)) : current.turnUndos, snapshot.turnUndos, false) : snapshot.turnUndos;
  const activeRunsByThread = Object.fromEntries((snapshot.activeRuns || []).map((run) => [run.threadId, run]));
  if (snapshot.activeRun) activeRunsByThread[snapshot.activeRun.threadId] = snapshot.activeRun;

  return {
    ...snapshot,
    messages,
    toolEvents,
    turnUndos,
    historyPage: sameThread && current.historyPage && (!authoritative || loadedOlderMessages.length > 0)
      ? { ...current.historyPage, messages, toolEvents, turnUndos }
      : snapshot.historyPage,
    contextUsage: snapshot.contextUsage || (
      current.contextUsage?.threadId === activeThreadId ? current.contextUsage : undefined
    ),
    terminal: snapshot.terminal || current.terminal || { sessions: [], updatedAt: 0 },
    activeRun: activeThreadId ? activeRunsByThread[activeThreadId] || null : null,
    activeRuns: Object.values(activeRunsByThread),
    activeRunsByThread,
    pendingUserInputsByThread: current.pendingUserInputsByThread,
    pendingUserInput: activeThreadId ? current.pendingUserInputsByThread[activeThreadId] || null : null,
    runEventSequences: current.runEventSequences,
    selectionEventSequence: current.selectionEventSequence,
  };
};

export const applyRefreshSnapshot = (current: DesktopUiSnapshot, snapshot: AppSnapshot, sequenceAtRequest: number): DesktopUiSnapshot => {
  if ((current.selectionEventSequence || 0) > sequenceAtRequest) return current;
  const next = applySnapshot(current, snapshot);
  const activeRunsByThread = { ...next.activeRunsByThread };
  for (const [threadId, sequence] of Object.entries(current.runEventSequences || {})) {
    if (sequence <= sequenceAtRequest) continue;
    if (current.activeRunsByThread[threadId]) activeRunsByThread[threadId] = current.activeRunsByThread[threadId];
    else delete activeRunsByThread[threadId];
  }
  return { ...next, activeRunsByThread, activeRuns: Object.values(activeRunsByThread), activeRun: next.activeThreadId ? activeRunsByThread[next.activeThreadId] || null : null };
};

export const prependHistoryPage = (current: DesktopUiSnapshot, page: ThreadHistoryPage): DesktopUiSnapshot => {
  if (page.threadId !== current.activeThreadId) return current;
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

export const mergeUniqueByFreshness = <T extends { id: string; createdAt?: number; updatedAt?: number }>(
  existing: T[],
  incoming: T[],
  preferIncomingOnTie = true,
) => {
  const byId = new Map(existing.map((item) => [item.id, item]));
  incoming.forEach((item) => {
    const previous = byId.get(item.id);
    if (!previous) {
      byId.set(item.id, item);
      return;
    }
    const previousStamp = previous.updatedAt || previous.createdAt || 0;
    const incomingStamp = item.updatedAt || item.createdAt || 0;
    if (incomingStamp > previousStamp || (preferIncomingOnTie && incomingStamp === previousStamp)) byId.set(item.id, item);
  });
  return [...byId.values()].sort((a, b) => (a.createdAt || a.updatedAt || 0) - (b.createdAt || b.updatedAt || 0) || a.id.localeCompare(b.id));
};

const mergeUnique = mergeUniqueByFreshness;

export const coalescePrivoraEvents = (events: PrivoraEventEnvelope[]): PrivoraEventEnvelope[] => {
  const coalesced: PrivoraEventEnvelope[] = [];
  let messages = new Map<string, PrivoraEventEnvelope>();
  let tools = new Map<string, PrivoraEventEnvelope>();
  let undos = new Map<string, PrivoraEventEnvelope>();
  let contextUsage = new Map<string, PrivoraEventEnvelope>();
  let runStates = new Map<string, PrivoraEventEnvelope>();
  const commandDeltas = new Map<string, PrivoraEventEnvelope>();

  const flush = () => {
    const batch: PrivoraEventEnvelope[] = [];
    messages.forEach((event) => batch.push(event));
    tools.forEach((event) => batch.push(event));
    undos.forEach((event) => batch.push(event));
    contextUsage.forEach((event) => batch.push(event));
    commandDeltas.forEach((event) => batch.push(event));
    runStates.forEach((event) => batch.push(event));
    batch.sort((a, b) => a.sequence - b.sequence);
    coalesced.push(...batch);
    messages = new Map();
    tools = new Map();
    undos = new Map();
    contextUsage = new Map();
    runStates = new Map();
    commandDeltas.clear();
  };

  for (const envelope of events) {
    const event = envelope.payload;
    if (event.type === "snapshot.updated" || event.type === "thread.rewound") {
      flush();
      coalesced.push(envelope);
      continue;
    }
    if (event.type === "message.upserted") {
      messages.set(event.message.id, envelope);
      continue;
    }
    if (event.type === "tool.upserted") {
      // The full replacement may already contain prior output deltas. Do not
      // combine deltas across this boundary and append them a second time.
      flush();
      tools.set(event.tool.id, envelope);
      continue;
    }
    if (event.type === "turn_undo.updated") {
      undos.set(event.undo.id, envelope);
      continue;
    }
    if (event.type === "context.usage_updated") {
      contextUsage.set(event.usage.threadId, envelope);
      continue;
    }
    if (event.type === "turn.status_changed") {
      runStates.set(event.threadId, envelope);
      continue;
    }
    if (event.type === "tool.output_delta") {
      const previous = commandDeltas.get(event.callId);
      const previousDelta = previous?.payload.type === "tool.output_delta" ? previous.payload.delta : "";
      commandDeltas.set(event.callId, {
        ...envelope,
        payload: { ...event, delta: `${previousDelta}${event.delta}` },
      });
      continue;
    }
    flush();
    coalesced.push(envelope);
  }
  flush();
  return coalesced;
};

const upsertById = <T extends { id: string; createdAt?: number; updatedAt?: number }>(items: T[], item: T): T[] => {
  const index = items.findIndex((candidate) => candidate.id === item.id);
  const next = index >= 0
    ? items.map((candidate, currentIndex) => currentIndex === index ? item : candidate)
    : [...items, item];
  return next.sort((a, b) =>
    (a.createdAt || a.updatedAt || 0) - (b.createdAt || b.updatedAt || 0) || a.id.localeCompare(b.id)
  );
};

const upsertBySessionId = <T extends { sessionId: number; updatedAt?: number }>(items: T[], item: T): T[] => {
  const index = items.findIndex((candidate) => candidate.sessionId === item.sessionId);
  const next = index >= 0
    ? items.map((candidate, currentIndex) => currentIndex === index ? item : candidate)
    : [item, ...items];
  return next
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || b.sessionId - a.sessionId)
    .slice(0, 24);
};

const compactLiveOutput = (value: string, maxChars = 40_000) => {
  if (value.length <= maxChars) return value;
  const head = value.slice(0, 10_000);
  const tail = value.slice(-(maxChars - 10_000));
  return `${head}\n\n[... live output compacted ...]\n\n${tail}`;
};

const recordEventFlush = (
  stats: { startedAt: number; events: number; bytes: number; flushes: number },
  events: PrivoraEventEnvelope[],
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

const approximatePayloadBytes = (event: PrivoraEventEnvelope) => {
  try {
    return JSON.stringify(event).length;
  } catch {
    return 0;
  }
};

export type { AppSnapshot, ChatMessageRecord, ThreadRecord, ToolEventRecord, WorkspaceRecord };
