import { app, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";
import type {
  AppSnapshot,
  ApprovalHistoryRecord,
  ApprovalScopeRecord,
  AgentRunCheckpointRecord,
  AiCreditSummaryRecord,
  AssistantTextPartRecord,
  BrowserWorkspaceStateRecord,
  ChatMessageRecord,
  SettingsRecord,
  StoreRecoveryNoticeRecord,
  SubagentRecord,
  SubagentStatus,
  ThreadRecord,
  ThreadTitleSource,
  ToolEventRecord,
  TurnUndoRecord,
  WorkspaceRecord,
} from "../../shared/types";
import { GEMINI_35_FLASH_MODEL_ID, normalizeModelId } from "../../shared/models";

type SecretName =
  | "openrouter_api_key"
  | "gemini_api_key"
  | "privora_session_cookie"
  | "privora_user_jwt"
  | "privora_pending_auth"
  | "privora_account_profile";

interface StoredSecretEnvelope {
  v: 1;
  provider: "electron.safeStorage";
  ciphertext: string;
  createdAt: number;
  updatedAt: number;
  platform: NodeJS.Platform;
}

type StoredSecret = StoredSecretEnvelope | string;

interface PrivoraJwtSecret {
  jwt: string;
  expiresAt: number;
}

interface PrivoraAccountProfileSecret {
  email?: string;
  name?: string;
}

interface DesktopDataFile {
  settings: Omit<SettingsRecord, "openRouterApiKeyStored" | "geminiApiKeyStored" | "privoraAccountConnected">;
  secrets: Record<string, StoredSecret>;
  workspaces: WorkspaceRecord[];
  threads: ThreadRecord[];
  messages: ChatMessageRecord[];
  subagents: SubagentRecord[];
  toolEvents: ToolEventRecord[];
  turnUndos: TurnUndoRecord[];
  approvalScopes: ApprovalScopeRecord[];
  approvalHistory: ApprovalHistoryRecord[];
  agentRunCheckpoints: AgentRunCheckpointRecord[];
  browserWorkspaces: BrowserWorkspaceStateRecord[];
}

const now = () => Date.now();
export const PLACEHOLDER_THREAD_TITLE = "New chat";
const LEGACY_PLACEHOLDER_THREAD_TITLES = new Set(["New local agent chat", PLACEHOLDER_THREAD_TITLE]);

const defaultData = (): DesktopDataFile => ({
  settings: {
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
  },
  secrets: {},
  workspaces: [],
  threads: [],
  messages: [],
  subagents: [],
  toolEvents: [],
  turnUndos: [],
  approvalScopes: [],
  approvalHistory: [],
  agentRunCheckpoints: [],
  browserWorkspaces: [],
});

export class DesktopStore {
  private data: DesktopDataFile;
  private filePath: string;
  private writeTimer: NodeJS.Timeout | null = null;
  private dirty = false;
  private recoveryNotice: StoreRecoveryNoticeRecord | undefined;
  private aiCreditSummary: AiCreditSummaryRecord | undefined;

  constructor(userDataPath = app.getPath("userData")) {
    fs.mkdirSync(userDataPath, { recursive: true });
    this.filePath = path.join(userDataPath, "privora-desktop.json");
    this.data = this.readData();
    this.writeData();
  }

  close() {
    this.flushScheduledWrite();
  }

  snapshot(activeThreadId: string | null, activeWorkspaceId: string | null): AppSnapshot {
    return {
      settings: this.getSettings(),
      workspaces: this.listWorkspaces(),
      threads: this.listThreads(),
      messages: activeThreadId ? this.listMessages(activeThreadId) : [],
      toolEvents: activeThreadId ? this.listToolEventsWithSubagents(activeThreadId) : [],
      subagents: activeThreadId ? this.listSubagents(activeThreadId) : [],
      turnUndos: activeThreadId ? this.listTurnUndos(activeThreadId) : [],
      approvalScopes: this.listApprovalScopes(activeWorkspaceId, activeThreadId),
      approvalHistory: activeThreadId ? this.listApprovalHistory(activeThreadId).slice(-50) : [],
      activeThreadId,
      activeWorkspaceId,
      activeRun: null,
      activeRuns: [],
      contextUsage: undefined,
      aiCredits: this.aiCreditSummary,
      recoveryNotice: this.recoveryNotice,
    };
  }

  getSettings(): SettingsRecord {
    const profile = this.getPrivoraAccountProfile();
    return {
      ...this.data.settings,
      openRouterApiKeyStored: Boolean(this.getSecret("openrouter_api_key")),
      geminiApiKeyStored: Boolean(this.getSecret("gemini_api_key")),
      privoraAccountConnected: Boolean(this.getSecret("privora_session_cookie") || this.getPrivoraUserJwt()),
      privoraAccountEmail: profile.email,
      privoraAccountName: profile.name,
    };
  }

  saveSettings(input: Partial<SettingsRecord> & { openRouterApiKey?: string; geminiApiKey?: string }): SettingsRecord {
    this.data.settings = {
      ...this.data.settings,
      model: input.model ? normalizeModelId(input.model) : normalizeModelId(this.data.settings.model),
      reasoningEffort: input.reasoningEffort ?? this.data.settings.reasoningEffort,
      permissionMode: input.permissionMode ?? this.data.settings.permissionMode,
      collaborationMode: input.collaborationMode ?? this.data.settings.collaborationMode,
      theme: input.theme ?? this.data.settings.theme,
      cliproxyBaseUrl: input.cliproxyBaseUrl ?? this.data.settings.cliproxyBaseUrl,
      appwriteEndpoint: input.appwriteEndpoint ?? this.data.settings.appwriteEndpoint,
      appwriteProjectId: input.appwriteProjectId ?? this.data.settings.appwriteProjectId,
      privoraGatewayFunctionId: input.privoraGatewayFunctionId ?? this.data.settings.privoraGatewayFunctionId,
    };
    if (input.openRouterApiKey !== undefined) this.setSecret("openrouter_api_key", input.openRouterApiKey);
    if (input.geminiApiKey !== undefined) this.setSecret("gemini_api_key", input.geminiApiKey);
    this.writeData();
    return this.getSettings();
  }

  setAiCreditSummary(summary: AiCreditSummaryRecord | undefined) {
    this.aiCreditSummary = summary;
  }

  setPrivoraSessionCookie(cookieHeader: string) {
    this.setSecret("privora_session_cookie", cookieHeader);
    this.setSecret("privora_user_jwt", "");
    this.clearPrivoraPendingAuth();
    this.writeData();
  }

  setPrivoraUserJwt(jwt: string, expiresAt = Date.now() + 55 * 60 * 1000, profile?: PrivoraAccountProfileSecret) {
    this.setSecret("privora_user_jwt", JSON.stringify({ jwt, expiresAt }));
    this.setSecret("privora_session_cookie", "");
    if (profile?.email || profile?.name) this.setPrivoraAccountProfile(profile);
    this.clearPrivoraPendingAuth();
    this.writeData();
  }

  getPrivoraUserJwt() {
    const raw = this.getSecret("privora_user_jwt");
    if (!raw) return "";
    try {
      const parsed = JSON.parse(raw) as Partial<PrivoraJwtSecret>;
      if (typeof parsed.jwt !== "string" || typeof parsed.expiresAt !== "number") return "";
      if (Date.now() >= parsed.expiresAt) {
        this.setSecret("privora_user_jwt", "");
        this.aiCreditSummary = undefined;
        this.writeData();
        return "";
      }
      return parsed.jwt;
    } catch {
      return raw;
    }
  }

  clearPrivoraSession() {
    this.setSecret("privora_session_cookie", "");
    this.setSecret("privora_user_jwt", "");
    this.setSecret("privora_account_profile", "");
    this.clearPrivoraPendingAuth();
    this.aiCreditSummary = undefined;
    this.writeData();
  }

  setPrivoraAccountProfile(profile: PrivoraAccountProfileSecret) {
    this.setSecret("privora_account_profile", JSON.stringify({
      email: profile.email?.trim() || undefined,
      name: profile.name?.trim() || undefined,
    }));
  }

  getPrivoraAccountProfile(): PrivoraAccountProfileSecret {
    const raw = this.getSecret("privora_account_profile");
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as PrivoraAccountProfileSecret;
      return {
        email: typeof parsed.email === "string" ? parsed.email : undefined,
        name: typeof parsed.name === "string" ? parsed.name : undefined,
      };
    } catch {
      return {};
    }
  }

  setPrivoraPendingAuth(state: string, createdAt = Date.now()) {
    this.setSecret("privora_pending_auth", JSON.stringify({ state, createdAt }));
    this.writeData();
  }

  getPrivoraPendingAuth(): { state: string; createdAt: number } | null {
    const raw = this.getSecret("privora_pending_auth");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { state?: unknown; createdAt?: unknown };
      if (typeof parsed.state !== "string" || typeof parsed.createdAt !== "number") return null;
      return { state: parsed.state, createdAt: parsed.createdAt };
    } catch {
      return null;
    }
  }

  clearPrivoraPendingAuth() {
    this.setSecret("privora_pending_auth", "");
    this.writeData();
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

  removeWorkspace(workspaceId: string): WorkspaceRecord | null {
    const workspace = this.getWorkspace(workspaceId);
    if (!workspace) return null;
    this.data.threads
      .filter((thread) => thread.workspaceId === workspaceId)
      .forEach((thread) => this.removeThreadRecords(thread.id));
    this.data.workspaces = this.data.workspaces.filter((item) => item.id !== workspaceId);
    this.data.approvalScopes = this.data.approvalScopes.filter((item) => item.workspaceId !== workspaceId);
    this.data.approvalHistory = this.data.approvalHistory.filter((item) => item.workspaceId !== workspaceId);
    this.writeData();
    return workspace;
  }

  createThread(workspaceId: string | null, options: { hidden?: boolean; title?: string } = {}): ThreadRecord {
    const timestamp = now();
    const thread: ThreadRecord = {
      id: crypto.randomUUID(),
      title: options.title?.trim() || PLACEHOLDER_THREAD_TITLE,
      titleSource: options.title?.trim() ? "agent" : "placeholder",
      titleUpdatedAt: timestamp,
      workspaceId,
      model: normalizeModelId(this.data.settings.model),
      reasoningEffort: this.data.settings.reasoningEffort,
      collaborationMode: this.data.settings.collaborationMode,
      hidden: options.hidden === true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.data.threads = upsertById(this.data.threads, thread);
    this.writeData();
    return thread;
  }

  updateThreadTitle(threadId: string, title: string, source: ThreadTitleSource = "user") {
    const trimmed = normalizeThreadTitle(title);
    if (!trimmed) return this.getThread(threadId);
    const timestamp = now();
    this.data.threads = this.data.threads.map((thread) =>
      thread.id === threadId
        ? { ...thread, title: trimmed, titleSource: source, titleUpdatedAt: timestamp, updatedAt: timestamp }
        : thread,
    );
    this.writeData();
    return this.getThread(threadId);
  }

  updateThreadSettings(threadId: string, input: Pick<ThreadRecord, "model" | "reasoningEffort" | "collaborationMode">) {
    const thread = this.getThread(threadId);
    if (!thread) return null;
    const timestamp = now();
    this.data.threads = this.data.threads.map((item) =>
      item.id === threadId
        ? {
          ...item,
          model: input.model ? normalizeModelId(input.model) : item.model,
          reasoningEffort: input.reasoningEffort ?? item.reasoningEffort,
          collaborationMode: input.collaborationMode ?? item.collaborationMode,
          updatedAt: timestamp,
        }
        : item,
    );
    this.writeData();
    return this.getThread(threadId);
  }

  updatePlaceholderThreadTitle(threadId: string, title: string, source: Extract<ThreadTitleSource, "agent" | "fallback">) {
    const thread = this.getThread(threadId);
    if (!thread || !isPlaceholderThreadTitle(thread)) return thread;
    return this.updateThreadTitle(threadId, title, source);
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
    this.removeThreadRecords(threadId);
    this.writeData();
  }

  private removeThreadRecords(threadId: string) {
    const rootAgents = this.data.subagents.filter((agent) => agent.parentThreadId === threadId);
    const childThreadIds = this.data.subagents
      .filter((agent) =>
        rootAgents.some((root) => agent.agentPath === root.agentPath || agent.agentPath.startsWith(`${root.agentPath}/`))
      )
      .map((agent) => agent.threadId);
    const removedThreadIds = new Set([threadId, ...childThreadIds]);
    this.data.threads = this.data.threads.filter((thread) => !removedThreadIds.has(thread.id));
    this.data.messages = this.data.messages.filter((message) => !removedThreadIds.has(message.threadId));
    this.data.toolEvents = this.data.toolEvents.filter((event) => !removedThreadIds.has(event.threadId) && !removedThreadIds.has(event.args?.threadId as string));
    this.data.turnUndos = this.data.turnUndos.filter((undo) => !removedThreadIds.has(undo.threadId));
    this.data.approvalHistory = this.data.approvalHistory.filter((item) => !removedThreadIds.has(item.threadId));
    this.data.approvalScopes = this.data.approvalScopes.filter((item) => !item.threadId || !removedThreadIds.has(item.threadId));
    this.data.agentRunCheckpoints = this.data.agentRunCheckpoints.filter((checkpoint) => !removedThreadIds.has(checkpoint.threadId));
    this.data.subagents = this.data.subagents.filter((agent) => !removedThreadIds.has(agent.parentThreadId) && !removedThreadIds.has(agent.threadId));
  }

  listThreads(): ThreadRecord[] {
    return [...this.data.threads].sort((a, b) => {
      if (a.hidden !== b.hidden) return a.hidden ? 1 : -1;
      if (Boolean(a.starred) !== Boolean(b.starred)) return a.starred ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    }).filter((thread) => !thread.hidden);
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
    this.scheduleWrite();
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
    this.scheduleWrite();
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

  getTurnUndo(messageId: string): TurnUndoRecord | null {
    return this.data.turnUndos.find((undo) => undo.messageId === messageId) || null;
  }

  upsertTurnUndo(record: TurnUndoRecord): TurnUndoRecord {
    this.data.turnUndos = upsertById(this.data.turnUndos, record);
    this.touchThread(record.threadId);
    this.scheduleWrite();
    return record;
  }

  listTurnUndos(threadId: string): TurnUndoRecord[] {
    return this.data.turnUndos
      .filter((undo) => undo.threadId === threadId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  listToolEventsWithSubagents(parentThreadId: string): ToolEventRecord[] {
    const threadIds = new Set([
      parentThreadId,
      ...this.listSubagents(parentThreadId).map((agent) => agent.threadId),
    ]);
    return this.data.toolEvents
      .filter((event) => threadIds.has(event.threadId))
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  createSubagent(input: {
    parentThreadId: string;
    parentMessageId: string;
    workspaceId: string | null;
    taskName: string;
    agentPath: string;
    agentRole?: string;
    agentNickname?: string;
    prompt: string;
    model?: string;
    reasoningEffort?: SubagentRecord["reasoningEffort"];
  }): SubagentRecord {
    const timestamp = now();
    const hiddenThread = this.createThread(input.workspaceId, {
      hidden: true,
      title: input.agentNickname || input.taskName,
    });
    const record: SubagentRecord = {
      id: crypto.randomUUID(),
      parentThreadId: input.parentThreadId,
      parentMessageId: input.parentMessageId,
      threadId: hiddenThread.id,
      workspaceId: input.workspaceId,
      taskName: input.taskName,
      agentPath: input.agentPath,
      agentRole: input.agentRole,
      agentNickname: input.agentNickname,
      prompt: input.prompt,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
      status: "pending",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.data.subagents = upsertById(this.data.subagents, record);
    this.scheduleWrite();
    return record;
  }

  listSubagents(parentThreadId?: string): SubagentRecord[] {
    if (parentThreadId) {
      const parentAgent = this.getSubagentByThread(parentThreadId);
      const roots = parentAgent
        ? [parentAgent]
        : this.data.subagents.filter((agent) => agent.parentThreadId === parentThreadId);
      return this.data.subagents
        .filter((agent) =>
          roots.some((root) =>
            parentAgent
              ? agent.threadId !== root.threadId && agent.agentPath.startsWith(`${root.agentPath}/`)
              : agent.agentPath === root.agentPath || agent.agentPath.startsWith(`${root.agentPath}/`),
          )
        )
        .sort((a, b) => a.createdAt - b.createdAt);
    }
    return this.data.subagents
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  listDirectSubagents(parentThreadId: string): SubagentRecord[] {
    return this.data.subagents
      .filter((agent) => agent.parentThreadId === parentThreadId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  getSubagentByThread(threadId: string): SubagentRecord | null {
    return this.data.subagents.find((agent) => agent.threadId === threadId) || null;
  }

  findSubagent(parentThreadId: string, target: string): SubagentRecord | null {
    const normalized = target.trim().toLowerCase();
    if (!normalized) return null;
    const parentAgent = this.getSubagentByThread(parentThreadId);
    const roots = parentAgent
      ? [parentAgent]
      : this.data.subagents.filter((agent) => agent.parentThreadId === parentThreadId);
    const candidates = this.data.subagents.filter((agent) =>
      roots.some((root) => agent.agentPath === root.agentPath || agent.agentPath.startsWith(`${root.agentPath}/`))
    );
    return candidates.find((agent) =>
      [agent.id, agent.threadId, agent.taskName, agent.agentPath, agent.agentNickname || ""]
        .some((value) => value.toLowerCase() === normalized)
    ) || null;
  }

  updateSubagent(threadId: string, patch: Partial<Pick<SubagentRecord, "status" | "finalMessage" | "lastPreview" | "closedAt" | "agentNickname" | "agentRole">>): SubagentRecord | null {
    let updated: SubagentRecord | null = null;
    this.data.subagents = this.data.subagents.map((agent) => {
      if (agent.threadId !== threadId && agent.id !== threadId) return agent;
      updated = {
        ...agent,
        ...patch,
        updatedAt: now(),
      };
      return updated;
    });
    if (updated) this.scheduleWrite();
    return updated;
  }

  listApprovalScopes(workspaceId: string | null | undefined, threadId?: string | null): ApprovalScopeRecord[] {
    const timestamp = now();
    return this.data.approvalScopes
      .filter((scope) => !scope.expiresAt || scope.expiresAt > timestamp)
      .filter((scope) => !scope.maxUses || scope.useCount < scope.maxUses)
      .filter((scope) => scope.workspaceId === null || scope.workspaceId === (workspaceId ?? null))
      .filter((scope) => !scope.threadId || scope.threadId === threadId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  upsertApprovalScope(scope: ApprovalScopeRecord): ApprovalScopeRecord {
    this.data.approvalScopes = upsertById(this.data.approvalScopes, scope);
    this.scheduleWrite();
    return scope;
  }

  markApprovalScopeUsed(scopeId: string): ApprovalScopeRecord | null {
    const timestamp = now();
    let updated: ApprovalScopeRecord | null = null;
    this.data.approvalScopes = this.data.approvalScopes.map((scope) => {
      if (scope.id !== scopeId) return scope;
      updated = {
        ...scope,
        lastUsedAt: timestamp,
        updatedAt: timestamp,
        useCount: scope.useCount + 1,
      };
      return updated;
    });
    if (updated) this.scheduleWrite();
    return updated;
  }

  recordApprovalHistory(record: ApprovalHistoryRecord): ApprovalHistoryRecord {
    this.data.approvalHistory = [...this.data.approvalHistory, record].slice(-1000);
    this.scheduleWrite();
    return record;
  }

  listApprovalHistory(threadId: string): ApprovalHistoryRecord[] {
    return this.data.approvalHistory
      .filter((record) => record.threadId === threadId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  getRunCheckpoint(threadId: string): AgentRunCheckpointRecord | null {
    return this.data.agentRunCheckpoints.find((checkpoint) => checkpoint.threadId === threadId) || null;
  }

  saveRunCheckpoint(checkpoint: AgentRunCheckpointRecord) {
    const next = {
      ...checkpoint,
      updatedAt: now(),
    };
    this.data.agentRunCheckpoints = this.data.agentRunCheckpoints.some((item) => item.threadId === checkpoint.threadId)
      ? this.data.agentRunCheckpoints.map((item) => item.threadId === checkpoint.threadId ? next : item)
      : [...this.data.agentRunCheckpoints, next];
    this.scheduleWrite();
    return this.getRunCheckpoint(checkpoint.threadId);
  }

  clearRunCheckpoint(threadId: string) {
    this.data.agentRunCheckpoints = this.data.agentRunCheckpoints.filter((checkpoint) => checkpoint.threadId !== threadId);
    this.writeData();
  }

  getBrowserWorkspaceState(workspaceId: string): BrowserWorkspaceStateRecord | null {
    return this.data.browserWorkspaces.find((state) => state.workspaceId === workspaceId) || null;
  }

  saveBrowserWorkspaceState(state: BrowserWorkspaceStateRecord) {
    const timestamp = now();
    const compact: BrowserWorkspaceStateRecord = {
      workspaceId: state.workspaceId,
      activeTabId: state.activeTabId,
      updatedAt: timestamp,
      tabs: state.tabs.slice(0, 6).map((tab) => ({
        id: tab.id,
        url: tab.url,
        title: tab.title,
        loading: false,
        canGoBack: false,
        canGoForward: false,
        createdAt: tab.createdAt || timestamp,
        updatedAt: tab.updatedAt || timestamp,
      })),
    };
    this.data.browserWorkspaces = this.data.browserWorkspaces.some((item) => item.workspaceId === state.workspaceId)
      ? this.data.browserWorkspaces.map((item) => item.workspaceId === state.workspaceId ? compact : item)
      : [...this.data.browserWorkspaces, compact];
    this.scheduleWrite();
    return compact;
  }

  pruneThreadAfterMessage(threadId: string, messageId: string) {
    const removedMessages = this.listMessagesAfter(threadId, messageId);
    const removedMessageIds = new Set(removedMessages.map((message) => message.id));
    const removedToolEvents = this.data.toolEvents.filter((event) => event.threadId === threadId && removedMessageIds.has(event.messageId));
    const removedTurnUndos = this.data.turnUndos.filter((undo) => undo.threadId === threadId && removedMessageIds.has(undo.messageId));
    this.data.messages = this.data.messages.filter((message) => !(message.threadId === threadId && removedMessageIds.has(message.id)));
    this.data.toolEvents = this.data.toolEvents.filter((event) => !(event.threadId === threadId && removedMessageIds.has(event.messageId)));
    this.data.turnUndos = this.data.turnUndos.filter((undo) => !(undo.threadId === threadId && removedMessageIds.has(undo.messageId)));
    this.data.agentRunCheckpoints = this.data.agentRunCheckpoints.filter((checkpoint) =>
      !(checkpoint.threadId === threadId && removedMessageIds.has(checkpoint.assistantMessageId))
    );
    this.touchThread(threadId);
    this.writeData();
    return {
      removedMessages: removedMessages.length,
      removedToolEvents: removedToolEvents.length,
      removedTurnUndos: removedTurnUndos.length,
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
        threads: Array.isArray(parsed.threads) ? parsed.threads.map(normalizeStoredThread) : [],
        messages: Array.isArray(parsed.messages) ? parsed.messages.map(normalizeStoredMessage) : [],
        subagents: Array.isArray(parsed.subagents) ? parsed.subagents.map(normalizeStoredSubagent) : [],
        toolEvents: Array.isArray(parsed.toolEvents) ? parsed.toolEvents.map(normalizeStoredToolEvent) : [],
        turnUndos: Array.isArray(parsed.turnUndos) ? parsed.turnUndos : [],
        approvalScopes: Array.isArray(parsed.approvalScopes) ? parsed.approvalScopes : [],
        approvalHistory: Array.isArray(parsed.approvalHistory) ? parsed.approvalHistory : [],
        agentRunCheckpoints: Array.isArray(parsed.agentRunCheckpoints) ? parsed.agentRunCheckpoints : [],
        browserWorkspaces: Array.isArray(parsed.browserWorkspaces) ? parsed.browserWorkspaces : [],
      };
    } catch (error) {
      this.recoveryNotice = this.backupCorruptDataFile(error);
      return defaultData();
    }
  }

  private backupCorruptDataFile(error: unknown): StoreRecoveryNoticeRecord | undefined {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${this.filePath}.corrupt-${timestamp}.bak`;
    try {
      fs.renameSync(this.filePath, backupPath);
      return {
        kind: "corrupt_store_backup",
        message: "Privora recovered from a damaged local data file. The original file was backed up and a clean store was created.",
        backupPath,
        createdAt: now(),
      };
    } catch (backupError) {
      return {
        kind: "corrupt_store_backup",
        message: `Privora could not read the local data file and could not move it aside: ${errorMessage(backupError || error)}`,
        backupPath: this.filePath,
        createdAt: now(),
      };
    }
  }

  private writeData() {
    this.dirty = false;
    const tempPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), "utf8");
    fs.renameSync(tempPath, this.filePath);
  }

  private scheduleWrite() {
    this.dirty = true;
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      if (this.dirty) this.writeData();
    }, 250);
    this.writeTimer.unref?.();
  }

  private flushScheduledWrite() {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    if (this.dirty) this.writeData();
  }
}

const upsertById = <T extends { id: string }>(items: T[], item: T) => {
  const exists = items.some((candidate) => candidate.id === item.id);
  return exists
    ? items.map((candidate) => candidate.id === item.id ? item : candidate)
    : [...items, item];
};

export const normalizeThreadTitle = (title: string) => {
  const firstLine = title.replace(/\r/g, "\n").split("\n")[0] || "";
  return firstLine.replace(/\s+/g, " ").trim().slice(0, 48);
};

export const isPlaceholderThreadTitle = (thread: Pick<ThreadRecord, "title" | "titleSource">) =>
  thread.titleSource === "placeholder" || (!thread.titleSource && LEGACY_PLACEHOLDER_THREAD_TITLES.has(thread.title.trim()));

const normalizeStoredThread = (thread: ThreadRecord): ThreadRecord => {
  const title = thread.title?.trim() || PLACEHOLDER_THREAD_TITLE;
  const titleSource: ThreadTitleSource =
    thread.titleSource ||
    (LEGACY_PLACEHOLDER_THREAD_TITLES.has(title) ? "placeholder" : "user");
  return {
    ...thread,
    title: titleSource === "placeholder" ? PLACEHOLDER_THREAD_TITLE : normalizeThreadTitle(title) || PLACEHOLDER_THREAD_TITLE,
    titleSource,
    titleUpdatedAt: thread.titleUpdatedAt || thread.updatedAt || thread.createdAt || now(),
    hidden: thread.hidden === true,
    model: thread.model ? normalizeModelId(thread.model) : undefined,
    reasoningEffort: thread.reasoningEffort,
    collaborationMode: thread.collaborationMode,
  };
};

const normalizeStoredSubagent = (agent: SubagentRecord): SubagentRecord => {
  const timestamp = agent.updatedAt || agent.createdAt || now();
  const status: SubagentStatus = [
    "pending",
    "running",
    "waiting",
    "completed",
    "failed",
    "stopped",
    "closed",
  ].includes(agent.status) ? agent.status : "stopped";
  return {
    ...agent,
    taskName: agent.taskName?.trim() || "agent",
    agentPath: agent.agentPath?.trim() || `/${agent.taskName || "agent"}`,
    prompt: agent.prompt || "",
    status,
    createdAt: agent.createdAt || timestamp,
    updatedAt: timestamp,
  };
};

const normalizeStoredMessage = (message: ChatMessageRecord): ChatMessageRecord => {
  const content = message.content?.replace(
    /I stopped because the model iteration budget was reached\./g,
    "Paused after a long run. Completed changes were kept. Use Continue to resume from the last checkpoint.",
  );
  const normalized = content === message.content ? message : { ...message, content };
  if (normalized.role !== "assistant" || !normalized.content.trim()) return normalized;
  const textParts = normalizeAssistantTextParts(normalized.textParts, normalized.content.length);
  if (textParts.length > 0) return textParts === normalized.textParts ? normalized : { ...normalized, textParts };
  const timestamp = normalized.updatedAt || normalized.createdAt || now();
  return {
    ...normalized,
    textParts: [{
      id: `${normalized.id}-final-text`,
      phase: "final_answer",
      startOffset: 0,
      endOffset: normalized.content.length,
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
  };
};

const normalizeAssistantTextParts = (
  parts: AssistantTextPartRecord[] | undefined,
  contentLength: number,
) => {
  if (!parts?.length) return [];
  return parts
    .filter((part) =>
      (part.phase === "commentary" || part.phase === "final_answer") &&
      Number.isFinite(part.startOffset) &&
      Number.isFinite(part.endOffset)
    )
    .map((part) => ({
      ...part,
      startOffset: Math.max(0, Math.min(contentLength, part.startOffset)),
      endOffset: Math.max(0, Math.min(contentLength, part.endOffset)),
    }))
    .filter((part) => part.endOffset > part.startOffset)
    .sort((a, b) => a.startOffset - b.startOffset || a.createdAt - b.createdAt);
};

const normalizeStoredToolEvent = (event: ToolEventRecord): ToolEventRecord => {
  if (!isNoisyCommandReason(event.approvalReason)) return event;
  return { ...event, approvalReason: undefined };
};

const isNoisyCommandReason = (reason?: string) =>
  Boolean(
    reason?.toLowerCase().includes("mutate files") &&
    reason.toLowerCase().includes("chain shell operations"),
  );

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error || "unknown error");
