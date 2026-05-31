import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppSnapshot,
  ChatMessageRecord,
  DesktopEvent,
  SettingsRecord,
  ThreadRecord,
  ToolEventRecord,
  TurnUndoRecord,
  WorkspaceRecord,
} from "../../shared/types";
import { GEMINI_35_FLASH_MODEL_ID } from "../../shared/models";

const emptySettings: SettingsRecord = {
  id: "default",
  model: GEMINI_35_FLASH_MODEL_ID,
  reasoningEffort: "medium",
  permissionMode: "ask_risky",
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
  turnUndos: [],
  approvalScopes: [],
  approvalHistory: [],
  activeThreadId: null,
  activeWorkspaceId: null,
  activeRun: null,
};

export const useDesktopState = () => {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(emptySnapshot);
  const [toast, setToast] = useState<string | null>(null);
  const queuedEventsRef = useRef<DesktopEvent[]>([]);
  const frameRef = useRef<number | null>(null);
  const eventStatsRef = useRef({ startedAt: performance.now(), events: 0, bytes: 0, flushes: 0 });

  const refresh = useCallback(async () => {
    setSnapshot(await window.privoraDesktop.getSnapshot());
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

export const reduceDesktopEvents = (snapshot: AppSnapshot, events: DesktopEvent[]): AppSnapshot => {
  let next = snapshot;
  for (const event of events) {
    if (event.type === "snapshot") {
      next = event.snapshot;
      continue;
    }
    if (event.type === "message_updated") {
      if (event.message.threadId !== next.activeThreadId) continue;
      const messages = upsertById(next.messages, event.message);
      if (messages !== next.messages) next = { ...next, messages };
      continue;
    }
    if (event.type === "tool_updated") {
      if (event.tool.threadId !== next.activeThreadId) continue;
      const toolEvents = upsertById(next.toolEvents, event.tool);
      if (toolEvents !== next.toolEvents) next = { ...next, toolEvents };
      continue;
    }
    if (event.type === "turn_undo_updated") {
      if (event.undo.threadId !== next.activeThreadId) continue;
      const turnUndos = upsertById(next.turnUndos, event.undo);
      if (turnUndos !== next.turnUndos) next = { ...next, turnUndos };
      continue;
    }
    if (event.type === "run_state") {
      if (event.threadId !== next.activeThreadId) continue;
      if (next.activeRun !== event.run) next = { ...next, activeRun: event.run };
      continue;
    }
    if (event.type === "command_output_delta") {
      const timestamp = Date.now();
      let changed = false;
      const toolEvents = next.toolEvents.map((tool) => {
        if (tool.callId !== event.callId) return tool;
        changed = true;
        return {
          ...tool,
          output: compactLiveOutput(`${tool.output || ""}${event.delta}`),
          updatedAt: timestamp,
        };
      });
      if (changed) next = { ...next, toolEvents };
    }
  }
  return next;
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
