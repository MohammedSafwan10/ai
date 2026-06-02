import type { CollaborationMode, ModelRuntimeBudgetMode, PermissionMode, ReasoningEffort } from "./models";

export type MessageRole = "user" | "assistant";

export type TurnStatus =
  | "idle"
  | "sampling"
  | "running"
  | "executing_tool"
  | "waiting_tool"
  | "awaiting_approval"
  | "draining"
  | "completing"
  | "completed"
  | "stopped"
  | "stalled"
  | "failed";

export type ToolEventStatus =
  | "preparing"
  | "awaiting_approval"
  | "running"
  | "done"
  | "failed"
  | "cancelled"
  | "stopped";

export type ToolRisk = "safe" | "risky" | "blocked";

export type ApprovalDecisionScope = "once" | "this_thread" | "this_workspace" | "command_prefix";

export type ApprovalScopeKind = "tool_thread" | "tool_workspace" | "terminal_prefix";

export interface ApprovalScopeRecord {
  id: string;
  workspaceId: string | null;
  threadId?: string;
  kind: ApprovalScopeKind;
  toolName?: string;
  commandPrefix?: string;
  cwd?: string;
  expiresAt?: number;
  maxUses?: number;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
  useCount: number;
}

export interface ApprovalHistoryRecord {
  id: string;
  threadId: string;
  messageId: string;
  workspaceId: string | null;
  callId: string;
  toolName: string;
  approved: boolean;
  scopeId?: string;
  scopeKind?: ApprovalScopeKind;
  reason?: string;
  argsSummary: string;
  createdAt: number;
}

export interface WorkspaceRecord {
  id: string;
  path: string;
  name: string;
  lastOpenedAt: number;
}

export interface WorkspaceDirectoryEntry {
  name: string;
  path: string;
  kind: "file" | "directory" | "symlink";
  sizeBytes: number;
  modifiedAtMs: number;
}

export interface WorkspaceDirectoryListing {
  path: string;
  entries: WorkspaceDirectoryEntry[];
}

export interface WorkspaceFileReadResult {
  path: string;
  content: string;
  encoding: "utf8" | "binary";
  binary: boolean;
  sizeBytes: number;
  modifiedAtMs: number;
  totalLines: number;
  truncated: boolean;
  truncatedBecauseSize: boolean;
}

export type ThreadTitleSource = "placeholder" | "agent" | "user" | "fallback";

export interface SettingsRecord {
  id: "default";
  model: string;
  reasoningEffort: ReasoningEffort;
  permissionMode: PermissionMode;
  collaborationMode: CollaborationMode;
  theme: "light" | "dark" | "system";
  cliproxyBaseUrl: string;
  openRouterApiKeyStored: boolean;
  geminiApiKeyStored: boolean;
}

export interface ThreadRecord {
  id: string;
  title: string;
  titleSource?: ThreadTitleSource;
  titleUpdatedAt?: number;
  workspaceId: string | null;
  hidden?: boolean;
  starred?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessageRecord {
  id: string;
  threadId: string;
  role: MessageRole;
  content: string;
  attachments?: DesktopAttachmentRecord[];
  contextMentions?: ContextMentionRecord[];
  textParts?: AssistantTextPartRecord[];
  thought?: string;
  thoughtParts?: AssistantThoughtPartRecord[];
  status: TurnStatus;
  createdAt: number;
  updatedAt: number;
}

export type AssistantTextPhase = "commentary" | "final_answer";

export interface AssistantTextPartRecord {
  id: string;
  phase: AssistantTextPhase;
  startOffset: number;
  endOffset: number;
  streamOrder?: number;
  createdAt: number;
  updatedAt: number;
}

export interface AssistantThoughtPartRecord {
  id: string;
  textOffset: number;
  thoughtOffset: number;
  streamOrder?: number;
  createdAt: number;
  updatedAt: number;
}

export interface DesktopAttachmentRecord {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  base64: string;
  createdAt: number;
}

export type ContextMentionType = "file" | "folder" | "terminal";

export interface ContextMentionRecord {
  id: string;
  type: ContextMentionType;
  label: string;
  path?: string;
  createdAt: number;
}

export interface ContextMentionSuggestion {
  id: string;
  type: ContextMentionType | "category";
  label: string;
  sublabel?: string;
  path?: string;
}

export interface SearchContextMentionsInput {
  threadId: string;
  query: string;
}

export type ToolEventCategory =
  | "read"
  | "search"
  | "edit"
  | "terminal"
  | "diagnostic"
  | "git"
  | "agent"
  | "question"
  | "approval"
  | "other";

export interface ToolActivityItemRecord {
  verb: string;
  path?: string;
  title?: string;
  additions?: number;
  deletions?: number;
}

export interface ToolDiffStatsRecord {
  additions: number;
  deletions: number;
}

export type ToolDiffFileStatus = "created" | "deleted" | "modified" | "renamed";

export type ToolDiffLineKind = "context" | "add" | "remove";

export interface ToolDiffLineRecord {
  kind: ToolDiffLineKind;
  oldLineNumber?: number | null;
  newLineNumber?: number | null;
  text: string;
}

export interface ToolDiffHunkRecord {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  section?: string;
  lines: ToolDiffLineRecord[];
  truncated?: boolean;
}

export interface ToolDiffFileRecord {
  path: string;
  oldPath?: string;
  status: ToolDiffFileStatus;
  additions: number;
  deletions: number;
  hunks: ToolDiffHunkRecord[];
  truncated?: boolean;
}

export interface ToolTerminalRecord {
  command: string;
  cwd?: string;
  processId?: number;
  running?: boolean;
  exitCode?: number | null;
  durationMs?: number;
  processDurationMs?: number;
  operationDurationMs?: number;
  timedOut?: boolean;
  omittedBytes?: number;
  truncated?: boolean;
  status?: string;
  backend?: string;
  tty?: boolean;
  streamsMerged?: boolean;
}

export type TurnUndoStatus = "available" | "undoing" | "undone" | "partially_undone" | "failed";

export type TurnUndoOperationRecord =
  | {
      type: "restore_file";
      path: string;
      restorePath?: string;
      existed: boolean;
      previous: string;
      expectedCurrent?: string | null;
      encoding?: "utf8" | "base64";
    }
  | {
      type: "rename_path";
      fromPath: string;
      toPath: string;
    };

export interface TurnUndoConflictRecord {
  path: string;
  reason: string;
}

export interface TurnUndoRecord {
  id: string;
  threadId: string;
  messageId: string;
  workspaceId: string | null;
  status: TurnUndoStatus;
  operations: TurnUndoOperationRecord[];
  summary: {
    files: number;
    additions: number;
    deletions: number;
    paths: string[];
  };
  conflicts: TurnUndoConflictRecord[];
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ContextPackRecord {
  workspaceRoot: string;
  generatedAt: number;
  profile?: Record<string, unknown>;
  recentToolCount: number;
  runningTerminalCount?: number;
  truncated?: boolean;
}

export interface TerminalProcessRecord {
  id: number;
  threadId?: string;
  messageId?: string;
  callId: string;
  command: string;
  cwd: string;
  status: "running" | "exited" | "stopped" | "failed";
  exitCode?: number | null;
  startedAt: number;
  updatedAt: number;
}

export interface FileMutationRecord {
  id: string;
  threadId: string;
  messageId: string;
  callId: string;
  path: string;
  kind: "create" | "update" | "delete" | "rename";
  diff?: string;
  additions: number;
  deletions: number;
  createdAt: number;
}

export interface DiagnosticRunRecord {
  id: string;
  threadId: string;
  messageId: string;
  callId: string;
  command: string;
  cwd: string;
  status: "running" | "passed" | "failed" | "stopped";
  exitCode?: number | null;
  durationMs?: number;
  output?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ToolEventRecord {
  id: string;
  threadId: string;
  messageId: string;
  callId: string;
  name: DesktopToolName | string;
  title: string;
  category?: ToolEventCategory;
  liveStatus?: string;
  textOffset?: number;
  streamOrder?: number;
  status: ToolEventStatus;
  risk: ToolRisk;
  args: Record<string, unknown>;
  result?: ToolResult;
  output?: string;
  diff?: string;
  diffFiles?: ToolDiffFileRecord[];
  diffStats?: ToolDiffStatsRecord;
  activities?: ToolActivityItemRecord[];
  terminal?: ToolTerminalRecord;
  preview?: string;
  approvalGroupId?: string;
  approvalReason?: string;
  startedAt?: number;
  endedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface AgentRunCheckpointRecord {
  threadId: string;
  assistantMessageId: string;
  workspaceRoot: string;
  history: unknown[];
  assistantText: string;
  assistantThought: string;
  iteration: number;
  toolCount: number;
  recoveryAttempts: number;
  lastProgressAt: number;
  updatedAt: number;
}

export type SubagentStatus =
  | "pending"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "stopped"
  | "closed";

export interface SubagentRecord {
  id: string;
  parentThreadId: string;
  parentMessageId: string;
  threadId: string;
  workspaceId: string | null;
  taskName: string;
  agentPath: string;
  agentRole?: string;
  agentNickname?: string;
  prompt: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  status: SubagentStatus;
  finalMessage?: string;
  lastPreview?: string;
  closedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface AppSnapshot {
  settings: SettingsRecord;
  workspaces: WorkspaceRecord[];
  threads: ThreadRecord[];
  messages: ChatMessageRecord[];
  toolEvents: ToolEventRecord[];
  subagents: SubagentRecord[];
  turnUndos: TurnUndoRecord[];
  approvalScopes: ApprovalScopeRecord[];
  approvalHistory: ApprovalHistoryRecord[];
  activeThreadId: string | null;
  activeWorkspaceId: string | null;
  activeRun: ActiveRunState | null;
  activeRuns: ActiveRunState[];
  contextUsage?: ContextUsageRecord;
  recoveryNotice?: StoreRecoveryNoticeRecord;
}

export interface TokenUsageRecord {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
}

export interface ContextUsageRecord {
  threadId: string;
  modelId: string;
  contextWindowTokens?: number;
  usedTokens: number;
  remainingPercent?: number;
  outputReserveTokens?: number;
  autoCompactAtTokens?: number;
  budgetMode: ModelRuntimeBudgetMode;
  estimated: boolean;
  lastTokenUsage: TokenUsageRecord;
  totalTokenUsage: TokenUsageRecord;
  updatedAt: number;
}

export interface StoreRecoveryNoticeRecord {
  kind: "corrupt_store_backup";
  message: string;
  backupPath: string;
  createdAt: number;
}

export interface ActiveRunState {
  threadId: string;
  assistantMessageId: string;
  phase: TurnStatus;
  status: TurnStatus;
  startedAt?: number;
  updatedAt?: number;
  iteration?: number;
  toolCount?: number;
  reason?: string;
  resumable?: boolean;
}

export type DesktopToolName =
  | "request_user_input"
  | "spawn_agent"
  | "send_message"
  | "assign_task"
  | "wait_agent"
  | "list_agents"
  | "close_agent"
  | "desktop_read_file"
  | "desktop_edit_file"
  | "desktop_write_file"
  | "desktop_apply_patch"
  | "desktop_list_dir"
  | "desktop_search"
  | "desktop_delete_path"
  | "desktop_rename_path"
  | "desktop_spawn_process"
  | "desktop_write_process"
  | "desktop_resize_process"
  | "desktop_kill_process"
  | "desktop_run_diagnostics"
  | "desktop_git_status"
  | "desktop_git_diff"
  | "web_search";

export interface DesktopToolCall {
  id: string;
  name: DesktopToolName;
  arguments: Record<string, unknown>;
  thoughtSignature?: string;
}

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  data?: Record<string, unknown>;
}

export interface RequestUserInputOptionRecord {
  label: string;
  description: string;
}

export interface RequestUserInputQuestionRecord {
  id: string;
  header: string;
  question: string;
  isOther?: boolean;
  options: RequestUserInputOptionRecord[];
}

export interface RequestUserInputRequestRecord {
  threadId: string;
  assistantMessageId: string;
  callId: string;
  questions: RequestUserInputQuestionRecord[];
  createdAt: number;
}

export interface RequestUserInputAnswerRecord {
  answers: string[];
}

export interface RequestUserInputResponseInput {
  threadId: string;
  callId: string;
  answers: Record<string, RequestUserInputAnswerRecord>;
}

export interface DesktopEventMeta {
  sequence?: number;
  emittedAt?: number;
}

export type DesktopEvent = DesktopEventMeta & (
  | { type: "snapshot"; snapshot: AppSnapshot }
  | { type: "message_updated"; message: ChatMessageRecord }
  | { type: "tool_updated"; tool: ToolEventRecord }
  | { type: "turn_undo_updated"; undo: TurnUndoRecord }
  | { type: "context_usage_updated"; usage: ContextUsageRecord }
  | { type: "request_user_input"; request: RequestUserInputRequestRecord }
  | { type: "request_user_input_resolved"; threadId: string; callId: string }
  | { type: "command_output_delta"; callId: string; delta: string }
  | { type: "run_state"; threadId: string; run: ActiveRunState | null }
  | { type: "toast"; tone: "info" | "error" | "success"; message: string }
);

export interface PrepareTurnUndoInput {
  messageId: string;
}

export interface UndoTurnChangesInput {
  messageId: string;
}

export interface StartTurnInput {
  threadId: string;
  prompt: string;
  attachments?: DesktopAttachmentRecord[];
  contextMentions?: ContextMentionRecord[];
}

export interface ApprovalDecisionInput {
  threadId: string;
  callId?: string;
  approved?: boolean;
  scope?: ApprovalDecisionScope;
  decisions?: Array<{ callId: string; approved: boolean; scope?: ApprovalDecisionScope }>;
}

export interface SaveSettingsInput {
  model?: string;
  reasoningEffort?: ReasoningEffort;
  permissionMode?: PermissionMode;
  collaborationMode?: CollaborationMode;
  theme?: "light" | "dark" | "system";
  cliproxyBaseUrl?: string;
  openRouterApiKey?: string;
  geminiApiKey?: string;
}

export interface PrivoraDesktopApi {
  debugEnabled: boolean;
  getSnapshot(): Promise<AppSnapshot>;
  createThread(workspaceId?: string | null): Promise<ThreadRecord>;
  renameThread(threadId: string, title: string): Promise<ThreadRecord | null>;
  toggleThreadStar(threadId: string): Promise<ThreadRecord | null>;
  deleteThread(threadId: string): Promise<void>;
  selectWorkspace(): Promise<WorkspaceRecord | null>;
  removeWorkspace(workspaceId: string): Promise<WorkspaceRecord | null>;
  setActiveThread(threadId: string): Promise<void>;
  startTurn(input: StartTurnInput): Promise<void>;
  continueRun(threadId: string): Promise<void>;
  stopTurn(threadId: string): Promise<void>;
  answerRequestUserInput(input: RequestUserInputResponseInput): Promise<void>;
  decideApproval(input: ApprovalDecisionInput): Promise<void>;
  prepareTurnUndo(input: PrepareTurnUndoInput): Promise<TurnUndoRecord | null>;
  undoTurnChanges(input: UndoTurnChangesInput): Promise<TurnUndoRecord | null>;
  searchContextMentions(input: SearchContextMentionsInput): Promise<ContextMentionSuggestion[]>;
  listWorkspaceDirectory(input: { path: string }): Promise<WorkspaceDirectoryListing>;
  readWorkspaceFile(input: { path: string }): Promise<WorkspaceFileReadResult>;
  saveSettings(input: SaveSettingsInput): Promise<SettingsRecord>;
  openPath(path: string): Promise<void>;
  openExternalUrl(url: string): Promise<void>;
  listWorkspaceOpenTargets(): Promise<WorkspaceOpenTargetInfo[]>;
  openWorkspaceTarget(target: WorkspaceOpenTarget): Promise<void>;
  getUpdateStatus(): Promise<UpdateStatus>;
  checkForUpdates(): Promise<UpdateStatus>;
  installUpdate(): Promise<UpdateStatus>;
  onUpdateStatusChanged(callback: (status: UpdateStatus) => void): () => void;
  onZoomChanged(callback: (percent: number) => void): () => void;
  onEvent(callback: (event: DesktopEvent) => void): () => void;
}

export type UpdateState =
  | "idle"
  | "checking"
  | "downloading"
  | "ready"
  | "installing"
  | "unsupported"
  | "error";

export interface UpdateStatus {
  state: UpdateState;
  supported: boolean;
  feedUrl: string;
  currentVersion: string;
  message?: string;
  error?: string;
  releaseName?: string;
  releaseNotes?: string;
  releaseDate?: string;
  latestVersion?: string;
  latestReleaseNotes?: string;
  latestReleaseDate?: string;
  lastCheckedAt?: number;
}

export type WorkspaceOpenTarget = string;

export interface WorkspaceOpenTargetInfo {
  id: WorkspaceOpenTarget;
  label: string;
  icon: "app" | "vscode" | "finder" | "terminal" | "xcode" | "android_studio";
  iconDataUrl?: string;
  platform: NodeJS.Platform;
  preferred?: boolean;
  isDefault?: boolean;
}
