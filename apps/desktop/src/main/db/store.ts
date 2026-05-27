import { app, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";
import type {
  AppSnapshot,
  ChatMessageRecord,
  SettingsRecord,
  ThreadRecord,
  ToolEventRecord,
  WorkspaceRecord,
} from "../../shared/types";
import { GEMINI_35_FLASH_MODEL_ID, normalizeModelId } from "../../shared/models";

type SecretName = "openrouter_api_key" | "gemini_api_key";

interface StoredSecretEnvelope {
  v: 1;
  provider: "electron.safeStorage";
  ciphertext: string;
  createdAt: number;
  updatedAt: number;
  platform: NodeJS.Platform;
}

type StoredSecret = StoredSecretEnvelope | string;

interface DesktopDataFile {
  settings: Omit<SettingsRecord, "openRouterApiKeyStored" | "geminiApiKeyStored">;
  secrets: Record<string, StoredSecret>;
  workspaces: WorkspaceRecord[];
  threads: ThreadRecord[];
  messages: ChatMessageRecord[];
  toolEvents: ToolEventRecord[];
}

const now = () => Date.now();

const defaultData = (): DesktopDataFile => ({
  settings: {
    id: "default",
    model: GEMINI_35_FLASH_MODEL_ID,
    reasoningEffort: "medium",
    permissionMode: "ask_risky",
    theme: "system",
    cliproxyBaseUrl: "http://127.0.0.1:8317",
  },
  secrets: {},
  workspaces: [],
  threads: [],
  messages: [],
  toolEvents: [],
});

export class DesktopStore {
  private data: DesktopDataFile;
  private filePath: string;

  constructor(userDataPath = app.getPath("userData")) {
    fs.mkdirSync(userDataPath, { recursive: true });
    this.filePath = path.join(userDataPath, "privora-desktop.json");
    this.data = this.readData();
    this.writeData();
  }

  close() {
    this.writeData();
  }

  snapshot(activeThreadId: string | null, activeWorkspaceId: string | null): AppSnapshot {
    return {
      settings: this.getSettings(),
      workspaces: this.listWorkspaces(),
      threads: this.listThreads(),
      messages: activeThreadId ? this.listMessages(activeThreadId) : [],
      toolEvents: activeThreadId ? this.listToolEvents(activeThreadId) : [],
      activeThreadId,
      activeWorkspaceId,
      activeRun: null,
    };
  }

  getSettings(): SettingsRecord {
    return {
      ...this.data.settings,
      openRouterApiKeyStored: Boolean(this.getSecret("openrouter_api_key")),
      geminiApiKeyStored: Boolean(this.getSecret("gemini_api_key")),
    };
  }

  saveSettings(input: Partial<SettingsRecord> & { openRouterApiKey?: string; geminiApiKey?: string }): SettingsRecord {
    this.data.settings = {
      ...this.data.settings,
      model: input.model ? normalizeModelId(input.model) : normalizeModelId(this.data.settings.model),
      reasoningEffort: input.reasoningEffort ?? this.data.settings.reasoningEffort,
      permissionMode: input.permissionMode ?? this.data.settings.permissionMode,
      theme: input.theme ?? this.data.settings.theme,
      cliproxyBaseUrl: input.cliproxyBaseUrl ?? this.data.settings.cliproxyBaseUrl,
    };
    if (input.openRouterApiKey !== undefined) this.setSecret("openrouter_api_key", input.openRouterApiKey);
    if (input.geminiApiKey !== undefined) this.setSecret("gemini_api_key", input.geminiApiKey);
    this.writeData();
    return this.getSettings();
  }

  getSecret(name: SecretName) {
    const stored = this.data.secrets[name];
    if (!stored) return "";
    try {
      const decrypted = this.decryptSecret(stored);
      if (decrypted && typeof stored === "string") {
        this.data.secrets[name] = this.encryptSecret(decrypted);
        this.writeData();
      }
      return decrypted;
    } catch {
      return "";
    }
  }

  upsertWorkspace(workspacePath: string): WorkspaceRecord {
    const resolvedPath = path.resolve(workspacePath);
    const existing = this.data.workspaces.find((workspace) => workspace.path === resolvedPath);
    const workspace: WorkspaceRecord = {
      id: existing?.id || crypto.randomUUID(),
      path: resolvedPath,
      name: path.basename(resolvedPath) || resolvedPath,
      lastOpenedAt: now(),
    };
    this.data.workspaces = upsertById(this.data.workspaces, workspace);
    this.writeData();
    return workspace;
  }

  listWorkspaces(): WorkspaceRecord[] {
    return [...this.data.workspaces].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  }

  getWorkspace(id: string | null | undefined): WorkspaceRecord | null {
    return this.data.workspaces.find((workspace) => workspace.id === id) || null;
  }

  createThread(workspaceId: string | null): ThreadRecord {
    const timestamp = now();
    const thread: ThreadRecord = {
      id: crypto.randomUUID(),
      title: "New local agent chat",
      workspaceId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.data.threads = upsertById(this.data.threads, thread);
    this.writeData();
    return thread;
  }

  updateThreadTitle(threadId: string, title: string) {
    const trimmed = title.trim();
    if (!trimmed) return this.getThread(threadId);
    this.data.threads = this.data.threads.map((thread) =>
      thread.id === threadId
        ? { ...thread, title: trimmed.slice(0, 90), updatedAt: now() }
        : thread,
    );
    this.writeData();
    return this.getThread(threadId);
  }

  toggleThreadStar(threadId: string) {
    this.data.threads = this.data.threads.map((thread) =>
      thread.id === threadId
        ? { ...thread, starred: !thread.starred, updatedAt: now() }
        : thread,
    );
    this.writeData();
    return this.getThread(threadId);
  }

  deleteThread(threadId: string) {
    this.data.threads = this.data.threads.filter((thread) => thread.id !== threadId);
    this.data.messages = this.data.messages.filter((message) => message.threadId !== threadId);
    this.data.toolEvents = this.data.toolEvents.filter((event) => event.threadId !== threadId);
    this.writeData();
  }

  listThreads(): ThreadRecord[] {
    return [...this.data.threads].sort((a, b) => {
      if (Boolean(a.starred) !== Boolean(b.starred)) return a.starred ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
  }

  getThread(threadId: string): ThreadRecord | null {
    return this.data.threads.find((thread) => thread.id === threadId) || null;
  }

  getMessage(messageId: string): ChatMessageRecord | null {
    return this.data.messages.find((message) => message.id === messageId) || null;
  }

  upsertMessage(message: ChatMessageRecord): ChatMessageRecord {
    this.data.messages = upsertById(this.data.messages, message);
    this.touchThread(message.threadId);
    this.writeData();
    return message;
  }

  listMessages(threadId: string): ChatMessageRecord[] {
    return this.data.messages
      .filter((message) => message.threadId === threadId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  listMessagesAfter(threadId: string, messageId: string): ChatMessageRecord[] {
    const anchor = this.getMessage(messageId);
    if (!anchor || anchor.threadId !== threadId) return [];
    return this.data.messages
      .filter((message) => message.threadId === threadId && message.createdAt > anchor.createdAt)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  upsertToolEvent(event: ToolEventRecord): ToolEventRecord {
    this.data.toolEvents = upsertById(this.data.toolEvents, event);
    this.touchThread(event.threadId);
    this.writeData();
    return event;
  }

  listToolEvents(threadId: string): ToolEventRecord[] {
    return this.data.toolEvents
      .filter((event) => event.threadId === threadId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  listToolEventsForMessages(threadId: string, messageIds: string[]): ToolEventRecord[] {
    const ids = new Set(messageIds);
    return this.data.toolEvents
      .filter((event) => event.threadId === threadId && ids.has(event.messageId))
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  pruneThreadAfterMessage(threadId: string, messageId: string) {
    const removedMessages = this.listMessagesAfter(threadId, messageId);
    const removedMessageIds = new Set(removedMessages.map((message) => message.id));
    const removedToolEvents = this.data.toolEvents.filter((event) => event.threadId === threadId && removedMessageIds.has(event.messageId));
    this.data.messages = this.data.messages.filter((message) => !(message.threadId === threadId && removedMessageIds.has(message.id)));
    this.data.toolEvents = this.data.toolEvents.filter((event) => !(event.threadId === threadId && removedMessageIds.has(event.messageId)));
    this.touchThread(threadId);
    this.writeData();
    return {
      removedMessages: removedMessages.length,
      removedToolEvents: removedToolEvents.length,
    };
  }

  private setSecret(name: SecretName, value: string) {
    if (!value.trim()) {
      delete this.data.secrets[name];
      return;
    }
    this.data.secrets[name] = this.encryptSecret(value.trim());
  }

  private encryptSecret(value: string): StoredSecretEnvelope {
    if (!this.canUseOsSecretStorage()) {
      throw new Error("OS-backed secret storage is unavailable. API keys were not saved.");
    }
    const timestamp = now();
    return {
      v: 1,
      provider: "electron.safeStorage",
      ciphertext: safeStorage.encryptString(value).toString("base64"),
      createdAt: timestamp,
      updatedAt: timestamp,
      platform: process.platform,
    };
  }

  private decryptSecret(stored: StoredSecret) {
    if (!this.canUseOsSecretStorage()) return "";
    if (typeof stored === "string") {
      return safeStorage.decryptString(Buffer.from(stored, "base64"));
    }
    if (stored.v !== 1 || stored.provider !== "electron.safeStorage" || !stored.ciphertext) return "";
    return safeStorage.decryptString(Buffer.from(stored.ciphertext, "base64"));
  }

  private canUseOsSecretStorage() {
    if (!safeStorage.isEncryptionAvailable()) return false;
    if (process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text") return false;
    return true;
  }

  private touchThread(threadId: string) {
    this.data.threads = this.data.threads.map((thread) =>
      thread.id === threadId ? { ...thread, updatedAt: now() } : thread,
    );
  }

  private readData(): DesktopDataFile {
    if (!fs.existsSync(this.filePath)) return defaultData();
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as Partial<DesktopDataFile>;
      return {
        ...defaultData(),
        ...parsed,
        settings: {
          ...defaultData().settings,
          ...parsed.settings,
          id: "default",
          model: normalizeModelId(parsed.settings?.model),
        },
        secrets: parsed.secrets || {},
        workspaces: Array.isArray(parsed.workspaces) ? parsed.workspaces : [],
        threads: Array.isArray(parsed.threads) ? parsed.threads : [],
        messages: Array.isArray(parsed.messages) ? parsed.messages : [],
        toolEvents: Array.isArray(parsed.toolEvents) ? parsed.toolEvents : [],
      };
    } catch {
      return defaultData();
    }
  }

  private writeData() {
    const tempPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), "utf8");
    fs.renameSync(tempPath, this.filePath);
  }
}

const upsertById = <T extends { id: string }>(items: T[], item: T) => {
  const exists = items.some((candidate) => candidate.id === item.id);
  return exists
    ? items.map((candidate) => candidate.id === item.id ? item : candidate)
    : [...items, item];
};
