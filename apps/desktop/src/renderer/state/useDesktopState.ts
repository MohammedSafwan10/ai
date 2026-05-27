import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AppSnapshot,
  ChatMessageRecord,
  DesktopEvent,
  SettingsRecord,
  ThreadRecord,
  ToolEventRecord,
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
  activeThreadId: null,
  activeWorkspaceId: null,
  activeRun: null,
};

export const useDesktopState = () => {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(emptySnapshot);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setSnapshot(await window.privoraDesktop.getSnapshot());
  }, []);

  useEffect(() => {
    void refresh();
    return window.privoraDesktop.onEvent((event: DesktopEvent) => {
      if (event.type === "snapshot") setSnapshot(event.snapshot);
      if (event.type === "message_updated") {
        setSnapshot((current) => ({
          ...current,
          messages: upsertById(current.messages, event.message),
        }));
      }
      if (event.type === "tool_updated") {
        setSnapshot((current) => ({
          ...current,
          toolEvents: upsertById(current.toolEvents, event.tool),
        }));
      }
      if (event.type === "run_state") {
        setSnapshot((current) => ({ ...current, activeRun: event.run }));
      }
      if (event.type === "command_output_delta") {
        setSnapshot((current) => ({
          ...current,
          toolEvents: current.toolEvents.map((tool) =>
            tool.callId === event.callId
              ? { ...tool, output: compactLiveOutput(`${tool.output || ""}${event.delta}`), updatedAt: Date.now() }
              : tool,
          ),
        }));
      }
      if (event.type === "toast") {
        setToast(event.message);
        window.setTimeout(() => setToast(null), 4500);
      }
    });
  }, [refresh]);

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

const upsertById = <T extends { id: string; createdAt?: number; updatedAt?: number }>(items: T[], item: T): T[] => {
  const exists = items.some((candidate) => candidate.id === item.id);
  const next = exists
    ? items.map((candidate) => candidate.id === item.id ? item : candidate)
    : [...items, item];
  return next.sort((a, b) => (a.createdAt || a.updatedAt || 0) - (b.createdAt || b.updatedAt || 0));
};

const compactLiveOutput = (value: string, maxChars = 140_000) => {
  if (value.length <= maxChars) return value;
  const head = value.slice(0, 40_000);
  const tail = value.slice(-(maxChars - 40_000));
  return `${head}\n\n[... live output compacted ...]\n\n${tail}`;
};

export type { AppSnapshot, ChatMessageRecord, ThreadRecord, ToolEventRecord, WorkspaceRecord };
