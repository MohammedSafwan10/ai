import { app, safeStorage } from "electron";
import { DatabaseSync, type StatementSync } from "node:sqlite";
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
  DesktopAttachmentRecord,
  SettingsRecord,
  SubagentRecord,
  SubagentStatus,
  ThreadHistoryPage,
  ThreadRecord,
  ThreadTitleSource,
  ToolEventRecord,
  TurnUndoRecord,
  WorkspaceRecord,
} from "../../shared/types";
import { GEMINI_35_FLASH_MODEL_ID, normalizeModelId } from "../../shared/models";
import { ArtifactStore, type StoredBinaryArtifact, type StoredTextArtifact } from "./artifactStore";

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

interface PrivoraJwtSecret {
  jwt: string;
  expiresAt: number;
}

interface PrivoraAccountProfileSecret {
  email?: string;
  name?: string;
}

type JsonRow = { payload: string };
type StoredToolEvent = Omit<ToolEventRecord, "output" | "diff"> & {
  output?: string | StoredTextArtifact;
  diff?: string | StoredTextArtifact;
};
type StoredMessage = Omit<ChatMessageRecord, "attachments"> & {
  attachments?: Array<Omit<NonNullable<ChatMessageRecord["attachments"]>[number], "base64" | "url"> & StoredBinaryArtifact>;
};

const now = () => Date.now();
const SCHEMA_VERSION = 1;
const INITIAL_HISTORY_LIMIT = 60;
const TOOL_PAGE_LIMIT = 2_000;
const APP_TABLES = [
  "kv",
  "workspaces",
  "threads",
  "messages",
  "tool_events",
  "subagents",
  "turn_undos",
  "approval_scopes",
  "approval_history",
  "checkpoints",
  "browser_workspaces",
] as const;
export const PLACEHOLDER_THREAD_TITLE = "New chat";
const LEGACY_PLACEHOLDER_THREAD_TITLES = new Set(["New local agent chat", PLACEHOLDER_THREAD_TITLE]);

const defaultSettings = (): Omit<SettingsRecord, "openRouterApiKeyStored" | "geminiApiKeyStored" | "privoraAccountConnected"> => ({
  id: "default",
  model: GEMINI_35_FLASH_MODEL_ID,
  reasoningEffort: "medium",
  permissionMode: "ask_risky",
  collaborationMode: "default",
  computerUseEnabled: false,
  theme: "system",
  cliproxyBaseUrl: "http://127.0.0.1:8317",
  appwriteEndpoint: "https://sgp.cloud.appwrite.io/v1",
  appwriteProjectId: "69af9f0700103b7f3482",
  privoraGatewayFunctionId: "model-gateway",
});

export class DesktopStore {
  private readonly db: DatabaseSync;
  private readonly artifacts: ArtifactStore;
  private readonly statements = new Map<string, StatementSync>();
  private aiCreditSummary: AiCreditSummaryRecord | undefined;

  constructor(userDataPath = app.getPath("userData")) {
    fs.mkdirSync(userDataPath, { recursive: true });
    this.db = new DatabaseSync(path.join(userDataPath, "privora-desktop.sqlite"), {
      enableForeignKeyConstraints: true,
      defensive: true,
      timeout: 5_000,
      limits: { length: 32 * 1024 * 1024, sqlLength: 1_000_000, variableNumber: 4_000 },
    });
    this.artifacts = new ArtifactStore(userDataPath);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA temp_store = MEMORY;");
    this.resetIncompatibleSchema();
    this.createSchema();
    this.ensureDefaultSettings();
  }

  close() {
    this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    this.db.close();
  }

  snapshot(activeThreadId: string | null, activeWorkspaceId: string | null): AppSnapshot {
    const page = activeThreadId ? this.getThreadHistoryPage(activeThreadId, { limit: INITIAL_HISTORY_LIMIT }) : emptyPage();
    return {
      settings: this.getSettings(),
      workspaces: this.listWorkspaces(),
      threads: this.listThreads(),
      messages: page.messages,
      toolEvents: page.toolEvents,
      subagents: activeThreadId ? this.listSubagents(activeThreadId) : [],
      turnUndos: page.turnUndos,
      approvalScopes: this.listApprovalScopes(activeWorkspaceId, activeThreadId),
      approvalHistory: activeThreadId ? this.listApprovalHistory(activeThreadId).slice(-50) : [],
      activeThreadId,
      activeWorkspaceId,
      activeRun: null,
      activeRuns: [],
      historyPage: page,
      contextUsage: undefined,
      aiCredits: this.aiCreditSummary,
    };
  }

  getSettings(): SettingsRecord {
    const stored = this.getKv<ReturnType<typeof defaultSettings>>("settings", "default") || defaultSettings();
    const profile = this.getPrivoraAccountProfile();
    return {
      ...defaultSettings(),
      ...stored,
      model: normalizeModelId(stored.model),
      openRouterApiKeyStored: Boolean(this.getSecret("openrouter_api_key")),
      geminiApiKeyStored: Boolean(this.getSecret("gemini_api_key")),
      privoraAccountConnected: Boolean(this.getSecret("privora_session_cookie") || this.getPrivoraUserJwt()),
      privoraAccountEmail: profile.email,
      privoraAccountName: profile.name,
    };
  }

  saveSettings(input: Partial<SettingsRecord> & { openRouterApiKey?: string; geminiApiKey?: string }): SettingsRecord {
    const current = this.getSettings();
    const next = {
      ...defaultSettings(),
      ...current,
      model: input.model ? normalizeModelId(input.model) : current.model,
      reasoningEffort: input.reasoningEffort ?? current.reasoningEffort,
      permissionMode: input.permissionMode ?? current.permissionMode,
      collaborationMode: input.collaborationMode ?? current.collaborationMode,
      computerUseEnabled: input.computerUseEnabled ?? current.computerUseEnabled,
      theme: input.theme ?? current.theme,
      cliproxyBaseUrl: input.cliproxyBaseUrl ?? current.cliproxyBaseUrl,
      appwriteEndpoint: input.appwriteEndpoint ?? current.appwriteEndpoint,
      appwriteProjectId: input.appwriteProjectId ?? current.appwriteProjectId,
      privoraGatewayFunctionId: input.privoraGatewayFunctionId ?? current.privoraGatewayFunctionId,
    };
    this.putKv("settings", "default", next);
    if (input.openRouterApiKey !== undefined) this.setSecret("openrouter_api_key", input.openRouterApiKey);
    if (input.geminiApiKey !== undefined) this.setSecret("gemini_api_key", input.geminiApiKey);
    return this.getSettings();
  }

  setAiCreditSummary(summary: AiCreditSummaryRecord | undefined) { this.aiCreditSummary = summary; }
  setPrivoraSessionCookie(cookieHeader: string) {
    this.setSecret("privora_session_cookie", cookieHeader);
    this.setSecret("privora_user_jwt", "");
    this.clearPrivoraPendingAuth();
  }
  setPrivoraUserJwt(jwt: string, expiresAt = Date.now() + 55 * 60 * 1000, profile?: PrivoraAccountProfileSecret) {
    this.setSecret("privora_user_jwt", JSON.stringify({ jwt, expiresAt }));
    this.setSecret("privora_session_cookie", "");
    if (profile?.email || profile?.name) this.setPrivoraAccountProfile(profile);
    this.clearPrivoraPendingAuth();
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
        return "";
      }
      return parsed.jwt;
    } catch { return raw; }
  }
  clearPrivoraSession() {
    ["privora_session_cookie", "privora_user_jwt", "privora_account_profile", "privora_pending_auth"].forEach((name) => this.setSecret(name as SecretName, ""));
    this.aiCreditSummary = undefined;
  }
  setPrivoraAccountProfile(profile: PrivoraAccountProfileSecret) {
    this.setSecret("privora_account_profile", JSON.stringify({ email: profile.email?.trim() || undefined, name: profile.name?.trim() || undefined }));
  }
  getPrivoraAccountProfile(): PrivoraAccountProfileSecret {
    try {
      const parsed = JSON.parse(this.getSecret("privora_account_profile") || "{}") as PrivoraAccountProfileSecret;
      return { email: typeof parsed.email === "string" ? parsed.email : undefined, name: typeof parsed.name === "string" ? parsed.name : undefined };
    } catch { return {}; }
  }
  setPrivoraPendingAuth(state: string, createdAt = Date.now()) { this.setSecret("privora_pending_auth", JSON.stringify({ state, createdAt })); }
  getPrivoraPendingAuth(): { state: string; createdAt: number } | null {
    try {
      const parsed = JSON.parse(this.getSecret("privora_pending_auth") || "{}") as { state?: unknown; createdAt?: unknown };
      return typeof parsed.state === "string" && typeof parsed.createdAt === "number" ? { state: parsed.state, createdAt: parsed.createdAt } : null;
    } catch { return null; }
  }
  clearPrivoraPendingAuth() { this.setSecret("privora_pending_auth", ""); }
  getSecret(name: SecretName) {
    const stored = this.getKv<StoredSecretEnvelope>("secrets", name);
    if (!stored) return "";
    try { return this.decryptSecret(stored); } catch { return ""; }
  }

  upsertWorkspace(workspacePath: string): WorkspaceRecord {
    const resolvedPath = path.resolve(workspacePath);
    const existing = this.all<WorkspaceRecord>("SELECT payload FROM workspaces WHERE path = ?", resolvedPath)[0];
    const workspace = { id: existing?.id || crypto.randomUUID(), path: resolvedPath, name: path.basename(resolvedPath) || resolvedPath, lastOpenedAt: now() };
    this.putRecord("workspaces", workspace.id, workspace, { path: workspace.path, updatedAt: workspace.lastOpenedAt });
    return workspace;
  }
  listWorkspaces() { return this.all<WorkspaceRecord>("SELECT payload FROM workspaces ORDER BY updated_at DESC"); }
  getWorkspace(id: string | null | undefined) { return id ? this.one<WorkspaceRecord>("SELECT payload FROM workspaces WHERE id = ?", id) : null; }
  removeWorkspace(workspaceId: string) {
    const workspace = this.getWorkspace(workspaceId);
    if (!workspace) return null;
    this.transaction(() => {
      this.all<ThreadRecord>("SELECT payload FROM threads WHERE workspace_id = ?", workspaceId).forEach((thread) => this.removeThreadRecords(thread.id));
      this.run("DELETE FROM approval_scopes WHERE workspace_id = ?", workspaceId);
      this.run("DELETE FROM approval_history WHERE workspace_id = ?", workspaceId);
      this.run("DELETE FROM workspaces WHERE id = ?", workspaceId);
    });
    this.pruneArtifacts();
    return workspace;
  }

  createThread(workspaceId: string | null, options: { hidden?: boolean; title?: string } = {}): ThreadRecord {
    const timestamp = now();
    const settings = this.getSettings();
    const thread: ThreadRecord = {
      id: crypto.randomUUID(), title: options.title?.trim() || PLACEHOLDER_THREAD_TITLE,
      titleSource: options.title?.trim() ? "agent" : "placeholder", titleUpdatedAt: timestamp, workspaceId,
      model: normalizeModelId(settings.model), reasoningEffort: settings.reasoningEffort, collaborationMode: settings.collaborationMode,
      hidden: options.hidden === true, createdAt: timestamp, updatedAt: timestamp,
    };
    this.putThread(thread);
    return thread;
  }
  updateThreadTitle(threadId: string, title: string, source: ThreadTitleSource = "user") {
    const thread = this.getThread(threadId); const trimmed = normalizeThreadTitle(title);
    if (!thread || !trimmed) return thread;
    const timestamp = now(); this.putThread({ ...thread, title: trimmed, titleSource: source, titleUpdatedAt: timestamp, updatedAt: timestamp });
    return this.getThread(threadId);
  }
  updateThreadSettings(threadId: string, input: Pick<ThreadRecord, "model" | "reasoningEffort" | "collaborationMode">) {
    const thread = this.getThread(threadId); if (!thread) return null;
    this.putThread({ ...thread, model: input.model ? normalizeModelId(input.model) : thread.model, reasoningEffort: input.reasoningEffort ?? thread.reasoningEffort, collaborationMode: input.collaborationMode ?? thread.collaborationMode, updatedAt: now() });
    return this.getThread(threadId);
  }
  updatePlaceholderThreadTitle(threadId: string, title: string, source: Extract<ThreadTitleSource, "agent" | "fallback">) {
    const thread = this.getThread(threadId); return !thread || !isPlaceholderThreadTitle(thread) ? thread : this.updateThreadTitle(threadId, title, source);
  }
  toggleThreadStar(threadId: string) {
    const thread = this.getThread(threadId); if (!thread) return null;
    this.putThread({ ...thread, starred: !thread.starred, updatedAt: now() }); return this.getThread(threadId);
  }
  deleteThread(threadId: string) { this.transaction(() => this.removeThreadRecords(threadId)); this.pruneArtifacts(); }
  listThreads() { return this.all<ThreadRecord>("SELECT payload FROM threads WHERE hidden = 0 ORDER BY starred DESC, updated_at DESC"); }
  getThread(threadId: string) { return this.one<ThreadRecord>("SELECT payload FROM threads WHERE id = ?", threadId); }

  getMessage(messageId: string) { const stored = this.one<StoredMessage>("SELECT payload FROM messages WHERE id = ?", messageId); return stored ? this.hydrateMessage(stored) : null; }
  getMessagePreview(messageId: string) { const stored = this.one<StoredMessage>("SELECT payload FROM messages WHERE id = ?", messageId); return stored ? this.previewMessage(stored) : null; }
  importAttachment(input: { id: string; name: string; mimeType: string; bytes: Uint8Array; createdAt: number }): DesktopAttachmentRecord {
    const artifact = this.artifacts.storeBuffer(input.bytes);
    return {
      id: input.id,
      name: input.name,
      mimeType: input.mimeType,
      size: artifact.sizeBytes,
      artifactId: artifact.artifactId,
      url: attachmentUrl(artifact.artifactId, input.mimeType),
      createdAt: input.createdAt,
    };
  }
  loadAttachment(artifactId: string) { return this.artifacts.loadBuffer(artifactId); }
  upsertMessage(message: ChatMessageRecord) {
    const normalized = normalizeStoredMessage(message);
    const stored: StoredMessage = {
      ...normalized,
      attachments: normalized.attachments?.map(({ base64, url: _url, ...attachment }) => ({
        ...attachment,
        ...(base64 ? this.artifacts.storeBase64(base64) : { artifactId: attachment.artifactId, sizeBytes: attachment.size, sha256: attachment.artifactId.replace(/\.bin$/, "") }),
      })),
    };
    this.putRecord("messages", normalized.id, stored, { threadId: normalized.threadId, createdAt: normalized.createdAt, updatedAt: normalized.updatedAt });
    this.touchThread(normalized.threadId); return normalized;
  }
  listMessages(threadId: string) { return this.all<StoredMessage>("SELECT payload FROM messages WHERE thread_id = ? ORDER BY created_at, id", threadId).map((message) => this.hydrateMessage(message)); }
  listRecentMessages(threadId: string, limit: number) {
    return this.all<StoredMessage>("SELECT payload FROM messages WHERE thread_id = ? ORDER BY created_at DESC, id DESC LIMIT ?", threadId, Math.max(1, Math.min(500, limit))).reverse().map((message) => this.hydrateMessage(message));
  }
  findFirstMessage(threadId: string, role?: ChatMessageRecord["role"]) {
    const sql = role
      ? "SELECT payload FROM messages WHERE thread_id = ? AND json_extract(payload, '$.role') = ? ORDER BY created_at, id LIMIT 1"
      : "SELECT payload FROM messages WHERE thread_id = ? ORDER BY created_at, id LIMIT 1";
    const stored = role ? this.one<StoredMessage>(sql, threadId, role) : this.one<StoredMessage>(sql, threadId);
    return stored ? this.hydrateMessage(stored) : null;
  }
  findLatestMessage(threadId: string, role?: ChatMessageRecord["role"]) {
    const sql = role
      ? "SELECT payload FROM messages WHERE thread_id = ? AND json_extract(payload, '$.role') = ? ORDER BY created_at DESC, id DESC LIMIT 1"
      : "SELECT payload FROM messages WHERE thread_id = ? ORDER BY created_at DESC, id DESC LIMIT 1";
    const stored = role ? this.one<StoredMessage>(sql, threadId, role) : this.one<StoredMessage>(sql, threadId);
    return stored ? this.hydrateMessage(stored) : null;
  }
  listMessagesAfter(threadId: string, messageId: string) {
    const anchor = this.getMessage(messageId); if (!anchor || anchor.threadId !== threadId) return [];
    return this.all<StoredMessage>("SELECT payload FROM messages WHERE thread_id = ? AND (created_at > ? OR (created_at = ? AND id > ?)) ORDER BY created_at, id", threadId, anchor.createdAt, anchor.createdAt, anchor.id).map((message) => this.hydrateMessage(message));
  }
  getThreadHistoryPage(threadId: string, input: { before?: string; limit?: number } = {}): ThreadHistoryPage {
    const queryStartedAt = performance.now();
    const limit = Math.max(1, Math.min(100, input.limit || 50));
    const cursor = decodeCursor(input.before);
    const where = cursor ? "AND (created_at < ? OR (created_at = ? AND id < ?))" : "";
    const params = cursor ? [threadId, cursor.createdAt, cursor.createdAt, cursor.id, limit + 1] : [threadId, limit + 1];
    const newestFirst = this.all<StoredMessage>(`SELECT payload FROM messages WHERE thread_id = ? ${where} ORDER BY created_at DESC, id DESC LIMIT ?`, ...params).map((message) => this.previewMessage(message));
    const hasOlder = newestFirst.length > limit;
    const messages = newestFirst.slice(0, limit).reverse();
    const messageIds = messages.map((message) => message.id);
    const toolEvents = this.listToolEventsForMessagesWithSubagents(threadId, messageIds);
    const page = {
      threadId,
      messages,
      toolEvents,
      turnUndos: this.listTurnUndosForMessages(threadId, messageIds),
      beforeCursor: hasOlder && messages[0] ? encodeCursor(messages[0]) : undefined,
      hasOlder,
      toolEventsTruncated: toolEvents.length >= TOOL_PAGE_LIMIT,
    };
    this.debugTiming("history_page", queryStartedAt, {
      threadId,
      messages: messages.length,
      tools: toolEvents.length,
      hasOlder,
    });
    return page;
  }

  upsertToolEvent(event: ToolEventRecord) {
    const stored: StoredToolEvent = {
      ...normalizeStoredToolEvent(event),
      output: this.artifacts.externalizeText(event.output, `${event.id}-output`),
      diff: this.artifacts.externalizeText(event.diff, `${event.id}-diff`),
    };
    this.putRecord("tool_events", event.id, stored, { threadId: event.threadId, messageId: event.messageId, callId: event.callId, name: event.name, status: event.status, createdAt: event.createdAt, updatedAt: event.updatedAt });
    this.touchThread(event.threadId); return event;
  }
  listToolEvents(threadId: string) { return this.allStoredTools("SELECT payload FROM tool_events WHERE thread_id = ? ORDER BY created_at, id", threadId); }
  listRecentToolEvents(threadId: string, limit: number) {
    return this.allStoredTools("SELECT payload FROM tool_events WHERE thread_id = ? ORDER BY created_at DESC, id DESC LIMIT ?", threadId, Math.max(1, Math.min(500, limit))).reverse();
  }
  findToolEventByCall(threadId: string, callId: string, name?: string) {
    const item = name
      ? this.one<StoredToolEvent>("SELECT payload FROM tool_events WHERE thread_id = ? AND call_id = ? AND name = ? LIMIT 1", threadId, callId, name)
      : this.one<StoredToolEvent>("SELECT payload FROM tool_events WHERE thread_id = ? AND call_id = ? LIMIT 1", threadId, callId);
    return item ? this.hydrateTool(item) : null;
  }
  listActiveDraftToolEvents(threadId: string, messageId: string) {
    return this.allStoredTools("SELECT payload FROM tool_events WHERE thread_id = ? AND message_id = ? AND call_id LIKE 'draft_%' AND status IN ('preparing','running') ORDER BY created_at, id", threadId, messageId);
  }
  listPreparingToolEvents(threadId: string, name: string) {
    return this.allStoredTools("SELECT payload FROM tool_events WHERE thread_id = ? AND name = ? AND status = 'preparing' ORDER BY created_at DESC, id DESC LIMIT 100", threadId, name);
  }
  listToolEventsForMessages(threadId: string, messageIds: string[]) {
    if (!messageIds.length) return [];
    return this.allStoredTools(`SELECT payload FROM tool_events WHERE thread_id = ? AND message_id IN (${placeholders(messageIds.length)}) ORDER BY created_at, id`, threadId, ...messageIds);
  }
  listToolEventsForMessage(threadId: string, messageId: string) {
    return this.allStoredTools("SELECT payload FROM tool_events WHERE thread_id = ? AND message_id = ? ORDER BY created_at, id", threadId, messageId);
  }
  hasToolEventsForMessage(threadId: string, messageId: string) {
    return Boolean(this.rawOne("SELECT payload FROM tool_events WHERE thread_id = ? AND message_id = ? LIMIT 1", threadId, messageId));
  }
  getToolEvent(toolId: string) { return this.oneStoredTool("SELECT payload FROM tool_events WHERE id = ?", toolId); }
  getTurnUndo(messageId: string) { return this.one<TurnUndoRecord>("SELECT payload FROM turn_undos WHERE message_id = ?", messageId); }
  upsertTurnUndo(record: TurnUndoRecord) {
    this.putRecord("turn_undos", record.id, record, { threadId: record.threadId, messageId: record.messageId, createdAt: record.createdAt, updatedAt: record.updatedAt });
    this.touchThread(record.threadId); return record;
  }
  listTurnUndos(threadId: string) { return this.all<TurnUndoRecord>("SELECT payload FROM turn_undos WHERE thread_id = ? ORDER BY created_at, id", threadId); }
  listToolEventsWithSubagents(parentThreadId: string) {
    const ids = [parentThreadId, ...this.listSubagents(parentThreadId).map((agent) => agent.threadId)];
    return this.allStoredTools(`SELECT payload FROM tool_events WHERE thread_id IN (${placeholders(ids.length)}) ORDER BY created_at, id`, ...ids);
  }

  createSubagent(input: { parentThreadId: string; parentMessageId: string; workspaceId: string | null; taskName: string; agentPath: string; agentRole?: string; agentNickname?: string; prompt: string; model?: string; reasoningEffort?: SubagentRecord["reasoningEffort"] }) {
    const timestamp = now(); const hiddenThread = this.createThread(input.workspaceId, { hidden: true, title: input.agentNickname || input.taskName });
    const record: SubagentRecord = { id: crypto.randomUUID(), parentThreadId: input.parentThreadId, parentMessageId: input.parentMessageId, threadId: hiddenThread.id, workspaceId: input.workspaceId, taskName: input.taskName, agentPath: input.agentPath, agentRole: input.agentRole, agentNickname: input.agentNickname, prompt: input.prompt, model: input.model, reasoningEffort: input.reasoningEffort, status: "pending", createdAt: timestamp, updatedAt: timestamp };
    this.putSubagent(record); return record;
  }
  listSubagents(parentThreadId?: string): SubagentRecord[] {
    const all = this.all<SubagentRecord>("SELECT payload FROM subagents ORDER BY created_at, id");
    if (!parentThreadId) return all;
    const parentAgent = all.find((agent) => agent.threadId === parentThreadId);
    const roots = parentAgent ? [parentAgent] : all.filter((agent) => agent.parentThreadId === parentThreadId);
    return all.filter((agent) => roots.some((root) => parentAgent ? agent.threadId !== root.threadId && agent.agentPath.startsWith(`${root.agentPath}/`) : agent.agentPath === root.agentPath || agent.agentPath.startsWith(`${root.agentPath}/`)));
  }
  listDirectSubagents(parentThreadId: string) { return this.all<SubagentRecord>("SELECT payload FROM subagents WHERE parent_thread_id = ? ORDER BY created_at, id", parentThreadId); }
  getSubagentByThread(threadId: string) { return this.one<SubagentRecord>("SELECT payload FROM subagents WHERE thread_id = ?", threadId); }
  findSubagent(parentThreadId: string, target: string) {
    const normalized = target.trim().toLowerCase(); if (!normalized) return null;
    return this.listSubagents(parentThreadId).find((agent) => [agent.id, agent.threadId, agent.taskName, agent.agentPath, agent.agentNickname || ""].some((value) => value.toLowerCase() === normalized)) || null;
  }
  updateSubagent(threadId: string, patch: Partial<Pick<SubagentRecord, "status" | "finalMessage" | "lastPreview" | "closedAt" | "agentNickname" | "agentRole">>) {
    const agent = this.getSubagentByThread(threadId) || this.one<SubagentRecord>("SELECT payload FROM subagents WHERE id = ?", threadId);
    if (!agent) return null; const updated = { ...agent, ...patch, updatedAt: now() }; this.putSubagent(updated); return updated;
  }

  listApprovalScopes(workspaceId: string | null | undefined, threadId?: string | null) {
    return this.all<ApprovalScopeRecord>("SELECT payload FROM approval_scopes ORDER BY updated_at DESC").filter((scope) => (!scope.expiresAt || scope.expiresAt > now()) && (!scope.maxUses || scope.useCount < scope.maxUses) && (scope.workspaceId === null || scope.workspaceId === (workspaceId ?? null)) && (!scope.threadId || scope.threadId === threadId));
  }
  upsertApprovalScope(scope: ApprovalScopeRecord) { this.putRecord("approval_scopes", scope.id, scope, { workspaceId: scope.workspaceId, threadId: scope.threadId, updatedAt: scope.updatedAt }); return scope; }
  markApprovalScopeUsed(scopeId: string) { const scope = this.one<ApprovalScopeRecord>("SELECT payload FROM approval_scopes WHERE id = ?", scopeId); if (!scope) return null; const updated = { ...scope, lastUsedAt: now(), updatedAt: now(), useCount: scope.useCount + 1 }; this.upsertApprovalScope(updated); return updated; }
  recordApprovalHistory(record: ApprovalHistoryRecord) { this.putRecord("approval_history", record.id, record, { workspaceId: record.workspaceId, threadId: record.threadId, createdAt: record.createdAt }); this.run("DELETE FROM approval_history WHERE id IN (SELECT id FROM approval_history ORDER BY created_at DESC LIMIT -1 OFFSET 1000)"); return record; }
  listApprovalHistory(threadId: string) { return this.all<ApprovalHistoryRecord>("SELECT payload FROM approval_history WHERE thread_id = ? ORDER BY created_at, id", threadId); }
  getRunCheckpoint(threadId: string) { return this.one<AgentRunCheckpointRecord>("SELECT payload FROM checkpoints WHERE thread_id = ?", threadId); }
  saveRunCheckpoint(checkpoint: AgentRunCheckpointRecord) { const next = { ...checkpoint, updatedAt: now() }; this.putRecord("checkpoints", checkpoint.threadId, next, { threadId: checkpoint.threadId, updatedAt: next.updatedAt }); return next; }
  clearRunCheckpoint(threadId: string) { this.run("DELETE FROM checkpoints WHERE thread_id = ?", threadId); }
  getBrowserWorkspaceState(workspaceId: string) { return this.one<BrowserWorkspaceStateRecord>("SELECT payload FROM browser_workspaces WHERE workspace_id = ?", workspaceId); }
  saveBrowserWorkspaceState(state: BrowserWorkspaceStateRecord) {
    const timestamp = now(); const compact = { workspaceId: state.workspaceId, activeTabId: state.activeTabId, updatedAt: timestamp, tabs: state.tabs.slice(0, 6).map((tab) => ({ ...tab, loading: false, canGoBack: false, canGoForward: false, createdAt: tab.createdAt || timestamp, updatedAt: tab.updatedAt || timestamp })) };
    this.putRecord("browser_workspaces", state.workspaceId, compact, { workspaceId: state.workspaceId, updatedAt: timestamp }); return compact;
  }
  pruneThreadAfterMessage(threadId: string, messageId: string) {
    const removed = this.listMessagesAfter(threadId, messageId); const ids = removed.map((message) => message.id); if (!ids.length) return { removedMessages: 0, removedToolEvents: 0, removedTurnUndos: 0 };
    const removedToolEvents = this.count(`SELECT COUNT(*) count FROM tool_events WHERE thread_id = ? AND message_id IN (${placeholders(ids.length)})`, threadId, ...ids);
    const removedTurnUndos = this.count(`SELECT COUNT(*) count FROM turn_undos WHERE thread_id = ? AND message_id IN (${placeholders(ids.length)})`, threadId, ...ids);
    this.transaction(() => { this.run(`DELETE FROM checkpoints WHERE thread_id = ? AND json_extract(payload, '$.assistantMessageId') IN (${placeholders(ids.length)})`, threadId, ...ids); this.run(`DELETE FROM messages WHERE id IN (${placeholders(ids.length)})`, ...ids); this.touchThread(threadId); });
    this.pruneArtifacts(); return { removedMessages: ids.length, removedToolEvents, removedTurnUndos };
  }

  private createSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv (scope TEXT NOT NULL, key TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(scope,key)) STRICT;
      CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, updated_at INTEGER NOT NULL, payload TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS threads (id TEXT PRIMARY KEY, workspace_id TEXT, hidden INTEGER NOT NULL, starred INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL, FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE) STRICT;
      CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL, FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE) STRICT;
      CREATE INDEX IF NOT EXISTS messages_thread_order ON messages(thread_id, created_at, id);
      CREATE TABLE IF NOT EXISTS tool_events (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, message_id TEXT NOT NULL, call_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL, FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE) STRICT;
      CREATE INDEX IF NOT EXISTS tools_thread_message ON tool_events(thread_id, message_id, created_at, id);
      CREATE INDEX IF NOT EXISTS tools_thread_call ON tool_events(thread_id, call_id);
      CREATE TABLE IF NOT EXISTS subagents (id TEXT PRIMARY KEY, parent_thread_id TEXT NOT NULL, thread_id TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS turn_undos (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, message_id TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL, FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE) STRICT;
      CREATE TABLE IF NOT EXISTS approval_scopes (id TEXT PRIMARY KEY, workspace_id TEXT, thread_id TEXT, updated_at INTEGER NOT NULL, payload TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS approval_history (id TEXT PRIMARY KEY, workspace_id TEXT, thread_id TEXT NOT NULL, created_at INTEGER NOT NULL, payload TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS checkpoints (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL UNIQUE, updated_at INTEGER NOT NULL, payload TEXT NOT NULL, FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE) STRICT;
      CREATE TABLE IF NOT EXISTS browser_workspaces (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL UNIQUE, updated_at INTEGER NOT NULL, payload TEXT NOT NULL) STRICT;
      CREATE INDEX IF NOT EXISTS threads_workspace_updated ON threads(workspace_id, updated_at DESC);
      PRAGMA user_version = ${SCHEMA_VERSION};
    `);
  }
  private resetIncompatibleSchema() {
    const existingTables = this.count(`SELECT COUNT(*) count FROM sqlite_schema WHERE type = 'table' AND name IN (${placeholders(APP_TABLES.length)})`, ...APP_TABLES);
    if (existingTables === 0) return;
    const version = Number((this.prepare("PRAGMA user_version").get() as { user_version?: number } | undefined)?.user_version || 0);
    const compatible = version === SCHEMA_VERSION && this.hasColumn("tool_events", "call_id");
    if (compatible) return;
    console.warn(`[desktop-store] Resetting incompatible SQLite schema version ${version}; development data migration is intentionally unsupported.`);
    this.statements.clear();
    this.db.exec("PRAGMA foreign_keys = OFF;");
    for (const table of [...APP_TABLES].reverse()) this.db.exec(`DROP TABLE IF EXISTS ${table};`);
    this.db.exec(`PRAGMA foreign_keys = ON; PRAGMA user_version = ${SCHEMA_VERSION};`);
    this.artifacts.deleteUnreferenced(new Set());
  }
  private ensureDefaultSettings() { if (!this.getKv("settings", "default")) this.putKv("settings", "default", defaultSettings()); }
  private removeThreadRecords(threadId: string) {
    const rootAgents = this.all<SubagentRecord>("SELECT payload FROM subagents WHERE parent_thread_id = ?", threadId);
    const allAgents = this.all<SubagentRecord>("SELECT payload FROM subagents");
    const removed = new Set([threadId, ...allAgents.filter((agent) => rootAgents.some((root) => agent.agentPath === root.agentPath || agent.agentPath.startsWith(`${root.agentPath}/`))).map((agent) => agent.threadId)]);
    this.run(`DELETE FROM subagents WHERE parent_thread_id IN (${placeholders(removed.size)}) OR thread_id IN (${placeholders(removed.size)})`, ...removed, ...removed);
    this.run(`DELETE FROM approval_scopes WHERE thread_id IN (${placeholders(removed.size)})`, ...removed);
    this.run(`DELETE FROM approval_history WHERE thread_id IN (${placeholders(removed.size)})`, ...removed);
    this.run(`DELETE FROM threads WHERE id IN (${placeholders(removed.size)})`, ...removed);
  }
  private listToolEventsForMessagesWithSubagents(parentThreadId: string, messageIds: string[]) {
    if (!messageIds.length) return [];
    const childThreads = this.listSubagents(parentThreadId).filter((agent) => messageIds.includes(agent.parentMessageId)).map((agent) => agent.threadId);
    const direct = this.listToolEventPreviewsForMessages(parentThreadId, messageIds);
    const child = childThreads.length ? this.allStoredToolPreviews(`SELECT payload FROM tool_events WHERE thread_id IN (${placeholders(childThreads.length)}) ORDER BY created_at DESC, id DESC LIMIT ${TOOL_PAGE_LIMIT}`, ...childThreads).reverse().map((tool) => ({ ...tool, messageId: this.getSubagentByThread(tool.threadId)?.parentMessageId || tool.messageId })) : [];
    return [...direct, ...child].sort((a, b) => a.createdAt - b.createdAt).slice(-TOOL_PAGE_LIMIT);
  }
  private listTurnUndosForMessages(threadId: string, ids: string[]) { return ids.length ? this.all<TurnUndoRecord>(`SELECT payload FROM turn_undos WHERE thread_id = ? AND message_id IN (${placeholders(ids.length)}) ORDER BY created_at, id`, threadId, ...ids) : []; }
  private touchThread(threadId: string) { const thread = this.getThread(threadId); if (thread) this.putThread({ ...thread, updatedAt: now() }); }
  private putThread(thread: ThreadRecord) { this.putRecord("threads", thread.id, normalizeStoredThread(thread), { workspaceId: thread.workspaceId, hidden: thread.hidden ? 1 : 0, starred: thread.starred ? 1 : 0, createdAt: thread.createdAt, updatedAt: thread.updatedAt }); }
  private putSubagent(agent: SubagentRecord) { const item = normalizeStoredSubagent(agent); this.putRecord("subagents", item.id, item, { parentThreadId: item.parentThreadId, threadId: item.threadId, createdAt: item.createdAt, updatedAt: item.updatedAt }); }
  private setSecret(name: SecretName, value: string) { if (!value.trim()) this.run("DELETE FROM kv WHERE scope = 'secrets' AND key = ?", name); else this.putKv("secrets", name, this.encryptSecret(value.trim())); }
  private encryptSecret(value: string): StoredSecretEnvelope { if (!this.canUseOsSecretStorage()) throw new Error("OS-backed secret storage is unavailable. API keys were not saved."); const timestamp = now(); return { v: 1, provider: "electron.safeStorage", ciphertext: safeStorage.encryptString(value).toString("base64"), createdAt: timestamp, updatedAt: timestamp, platform: process.platform }; }
  private decryptSecret(stored: StoredSecretEnvelope) { if (!this.canUseOsSecretStorage() || stored.v !== 1 || stored.provider !== "electron.safeStorage") return ""; return safeStorage.decryptString(Buffer.from(stored.ciphertext, "base64")); }
  private canUseOsSecretStorage() { return safeStorage.isEncryptionAvailable() && !(process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text"); }
  private putKv(scope: string, key: string, value: unknown) { this.run("INSERT INTO kv(scope,key,payload) VALUES(?,?,?) ON CONFLICT(scope,key) DO UPDATE SET payload=excluded.payload", scope, key, JSON.stringify(value)); }
  private getKv<T>(scope: string, key: string): T | null { const row = this.rawOne("SELECT payload FROM kv WHERE scope = ? AND key = ?", scope, key); return row ? JSON.parse(row.payload) as T : null; }
  private putRecord(table: string, id: string, payload: unknown, columns: Record<string, unknown>) {
    const names = Object.keys(columns).map(sqlColumn); const values = Object.values(columns);
    const allNames = ["id", ...names, "payload"]; const updates = [...names, "payload"].map((name) => `${name}=excluded.${name}`).join(",");
    this.run(`INSERT INTO ${table}(${allNames.join(",")}) VALUES(${placeholders(allNames.length)}) ON CONFLICT(id) DO UPDATE SET ${updates}`, id, ...values, JSON.stringify(payload));
  }
  private one<T>(sql: string, ...params: unknown[]): T | null { const row = this.rawOne(sql, ...params); return row ? JSON.parse(row.payload) as T : null; }
  private all<T>(sql: string, ...params: unknown[]): T[] { return (this.prepare(sql).all(...params as never[]) as JsonRow[]).map((row) => JSON.parse(row.payload) as T); }
  private rawOne(sql: string, ...params: unknown[]) { return this.prepare(sql).get(...params as never[]) as JsonRow | undefined; }
  private allStoredTools(sql: string, ...params: unknown[]) { return this.all<StoredToolEvent>(sql, ...params).map((item) => this.hydrateTool(item)); }
  private allStoredToolPreviews(sql: string, ...params: unknown[]) { return this.all<StoredToolEvent>(sql, ...params).map((item) => this.previewTool(item)); }
  private oneStoredTool(sql: string, ...params: unknown[]) { const item = this.one<StoredToolEvent>(sql, ...params); return item ? this.hydrateTool(item) : null; }
  private hydrateTool(item: StoredToolEvent): ToolEventRecord { return { ...item, output: this.artifacts.hydrateText(item.output), diff: this.artifacts.hydrateText(item.diff) }; }
  private hydrateMessage(item: StoredMessage): ChatMessageRecord {
    return {
      ...item,
      attachments: item.attachments?.map(({ artifactId, sizeBytes: _sizeBytes, sha256: _sha256, ...attachment }) => ({
        ...attachment,
        artifactId,
        url: attachmentUrl(artifactId, attachment.mimeType),
        base64: this.artifacts.loadBase64(artifactId),
      })),
    };
  }
  private previewMessage(item: StoredMessage): ChatMessageRecord {
    return {
      ...item,
      attachments: item.attachments?.map(({ artifactId, sizeBytes: _sizeBytes, sha256: _sha256, ...attachment }) => ({
        ...attachment,
        artifactId,
        url: attachmentUrl(artifactId, attachment.mimeType),
      })),
    };
  }
  private previewTool(item: StoredToolEvent): ToolEventRecord {
    const outputArtifact = item.output && typeof item.output !== "string" ? item.output : null;
    const diffArtifact = item.diff && typeof item.diff !== "string" ? item.diff : null;
    return {
      ...item,
      output: typeof item.output === "string" ? item.output : item.output?.preview,
      diff: typeof item.diff === "string" ? item.diff : item.diff?.preview,
      detailAvailable: Boolean(outputArtifact || diffArtifact),
      outputSizeBytes: outputArtifact?.sizeBytes,
    };
  }
  private listToolEventPreviewsForMessages(threadId: string, messageIds: string[]) {
    if (!messageIds.length) return [];
    return this.allStoredToolPreviews(`SELECT payload FROM tool_events WHERE thread_id = ? AND message_id IN (${placeholders(messageIds.length)}) ORDER BY created_at DESC, id DESC LIMIT ${TOOL_PAGE_LIMIT}`, threadId, ...messageIds).reverse();
  }
  private count(sql: string, ...params: unknown[]) { return Number((this.prepare(sql).get(...params as never[]) as { count: number }).count); }
  private hasColumn(table: string, column: string) {
    return (this.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>).some((row) => row.name === column);
  }
  private run(sql: string, ...params: unknown[]) { return this.prepare(sql).run(...params as never[]); }
  private prepare(sql: string) { let statement = this.statements.get(sql); if (!statement) { statement = this.db.prepare(sql); this.statements.set(sql, statement); } return statement; }
  private transaction<T>(fn: () => T): T {
    const startedAt = performance.now();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      this.debugTiming("transaction", startedAt);
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  private debugTiming(operation: string, startedAt: number, details: Record<string, unknown> = {}) {
    if (process.env.PRIVORA_DEBUG !== "1") return;
    console.info("[privora:sqlite]", { operation, durationMs: Math.round((performance.now() - startedAt) * 10) / 10, ...details });
  }
  private pruneArtifacts() {
    const refs = new Set<string>();
    this.all<StoredToolEvent>("SELECT payload FROM tool_events").forEach((tool) => [tool.output, tool.diff].forEach((value) => { if (value && typeof value !== "string") refs.add(value.artifactId); }));
    this.all<StoredMessage>("SELECT payload FROM messages").forEach((message) => message.attachments?.forEach((attachment) => refs.add(attachment.artifactId)));
    this.artifacts.deleteUnreferenced(refs);
  }
}

const emptyPage = (): ThreadHistoryPage => ({ threadId: "", messages: [], toolEvents: [], turnUndos: [], hasOlder: false });
const placeholders = (count: number) => Array.from({ length: count }, () => "?").join(",");
const sqlColumn = (value: string) => value.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
const encodeCursor = (message: Pick<ChatMessageRecord, "id" | "createdAt">) => Buffer.from(JSON.stringify({ id: message.id, createdAt: message.createdAt }), "utf8").toString("base64url");
const decodeCursor = (cursor?: string) => { try { const value = JSON.parse(Buffer.from(cursor || "", "base64url").toString("utf8")) as { id?: unknown; createdAt?: unknown }; return typeof value.id === "string" && typeof value.createdAt === "number" ? { id: value.id, createdAt: value.createdAt } : null; } catch { return null; } };
const attachmentUrl = (artifactId: string, mimeType: string) =>
  `privora-attachment://artifact/${encodeURIComponent(artifactId)}?mime=${encodeURIComponent(mimeType)}`;

export const normalizeThreadTitle = (title: string) => (title.replace(/\r/g, "\n").split("\n")[0] || "").replace(/\s+/g, " ").trim().slice(0, 48);
export const isPlaceholderThreadTitle = (thread: Pick<ThreadRecord, "title" | "titleSource">) => thread.titleSource === "placeholder" || (!thread.titleSource && LEGACY_PLACEHOLDER_THREAD_TITLES.has(thread.title.trim()));
const normalizeStoredThread = (thread: ThreadRecord): ThreadRecord => {
  const title = thread.title?.trim() || PLACEHOLDER_THREAD_TITLE; const titleSource = thread.titleSource || (LEGACY_PLACEHOLDER_THREAD_TITLES.has(title) ? "placeholder" : "user");
  return { ...thread, title: titleSource === "placeholder" ? PLACEHOLDER_THREAD_TITLE : normalizeThreadTitle(title) || PLACEHOLDER_THREAD_TITLE, titleSource, titleUpdatedAt: thread.titleUpdatedAt || thread.updatedAt || thread.createdAt || now(), hidden: thread.hidden === true, model: thread.model ? normalizeModelId(thread.model) : undefined };
};
const normalizeStoredSubagent = (agent: SubagentRecord): SubagentRecord => {
  const timestamp = agent.updatedAt || agent.createdAt || now(); const status: SubagentStatus = ["pending", "running", "waiting", "completed", "failed", "stopped", "closed"].includes(agent.status) ? agent.status : "stopped";
  return { ...agent, taskName: agent.taskName?.trim() || "agent", agentPath: agent.agentPath?.trim() || `/${agent.taskName || "agent"}`, prompt: agent.prompt || "", status, createdAt: agent.createdAt || timestamp, updatedAt: timestamp };
};
const normalizeStoredMessage = (message: ChatMessageRecord): ChatMessageRecord => {
  const content = message.content?.replace(/I stopped because the model iteration budget was reached\./g, "Paused after a long run. Completed changes were kept. Use Continue to resume from the last checkpoint.");
  const normalized = content === message.content ? message : { ...message, content }; if (normalized.role !== "assistant" || !normalized.content.trim()) return normalized;
  const textParts = normalizeAssistantTextParts(normalized.textParts, normalized.content.length); if (textParts.length) return { ...normalized, textParts };
  const timestamp = normalized.updatedAt || normalized.createdAt || now(); return { ...normalized, textParts: [{ id: `${normalized.id}-final-text`, phase: "final_answer", startOffset: 0, endOffset: normalized.content.length, createdAt: timestamp, updatedAt: timestamp }] };
};
const normalizeAssistantTextParts = (parts: AssistantTextPartRecord[] | undefined, contentLength: number) => !parts?.length ? [] : parts.filter((part) => (part.phase === "commentary" || part.phase === "final_answer") && Number.isFinite(part.startOffset) && Number.isFinite(part.endOffset)).map((part) => ({ ...part, startOffset: Math.max(0, Math.min(contentLength, part.startOffset)), endOffset: Math.max(0, Math.min(contentLength, part.endOffset)) })).filter((part) => part.endOffset > part.startOffset).sort((a, b) => a.startOffset - b.startOffset || a.createdAt - b.createdAt);
const normalizeStoredToolEvent = (event: ToolEventRecord): ToolEventRecord => isNoisyCommandReason(event.approvalReason) ? { ...event, approvalReason: undefined } : event;
const isNoisyCommandReason = (reason?: string) => Boolean(reason?.toLowerCase().includes("mutate files") && reason.toLowerCase().includes("chain shell operations"));
