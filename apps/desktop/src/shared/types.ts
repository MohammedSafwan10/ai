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

export type BrowserViewportPreset = "responsive" | "mobile" | "tablet" | "desktop";

export interface BrowserViewportRecord {
  width: number;
  height: number;
}

export interface BrowserTabRecord {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  createdAt: number;
  updatedAt: number;
}

export type BrowserDownloadState = "blocked" | "pending" | "progressing" | "completed" | "cancelled" | "failed";

export interface BrowserDownloadRecord {
  id: string;
  tabId: string;
  url: string;
  filename: string;
  mimeType: string;
  state: BrowserDownloadState;
  receivedBytes: number;
  totalBytes: number;
  path?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export type NoteScope = "global" | "workspace" | "file";
export type NoteLargeMode = "normal" | "large" | "readonly";

export interface NoteRecord {
  id: string;
  scope: NoteScope;
  workspaceId?: string;
  title: string;
  filePath?: string;
  dirty: boolean;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
  sizeBytes: number;
  excerpt?: string;
}

export interface NoteOpenResult {
  note: NoteRecord;
  content: string;
  largeMode: NoteLargeMode;
  readonly: boolean;
  truncated: boolean;
  warning?: string;
}

export interface NotesPanelStateRecord {
  workspaceId?: string;
  notes: NoteRecord[];
  openTabs: NoteRecord[];
  activeNoteId?: string;
}

export interface NotesListInput {
  workspaceId?: string;
  query?: string;
}

export interface NotesCreateInput {
  workspaceId?: string;
  scope: NoteScope;
  title?: string;
  content?: string;
  pinned?: boolean;
}

export interface NotesOpenInput {
  workspaceId?: string;
  noteId: string;
}

export interface NotesOpenFileInput {
  workspaceId?: string;
  filePath?: string;
}

export interface NotesUpdateInput {
  workspaceId?: string;
  noteId: string;
  title?: string;
  content?: string;
  scope?: Extract<NoteScope, "global" | "workspace">;
  pinned?: boolean;
}

export interface NotesSaveInput {
  workspaceId?: string;
  noteId: string;
  filePath?: string;
}

export interface NotesRenameInput {
  workspaceId?: string;
  noteId: string;
  title: string;
}

export interface NotesDeleteInput {
  workspaceId?: string;
  noteId: string;
  deleteFile?: boolean;
  permanent?: boolean;
}

export interface NotesCloseTabInput {
  workspaceId?: string;
  noteId: string;
}

export type BrowserShieldsMode = "off" | "standard";

export interface BrowserShieldsBlockedRequestRecord {
  id: string;
  url: string;
  displayUrl: string;
  resourceType: string;
  sourceUrl?: string;
  blockedReason: string;
  ruleSource?: string;
  timestamp: number;
}

export interface BrowserShieldsStateRecord {
  mode: BrowserShieldsMode;
  effectiveMode: BrowserShieldsMode;
  origin: string;
  siteOverride?: BrowserShieldsMode;
  blockedCount: number;
  recentBlocked: BrowserShieldsBlockedRequestRecord[];
  engineReady: boolean;
  loadError?: string;
  updatedAt: number;
}

export type BrowserFormRisk = "safe" | "sensitive" | "sensitive_payment" | "irreversible";

export interface BrowserFormControlRecord {
  id: string;
  type: string;
  name: string;
  label: string;
  placeholder: string;
  required: boolean;
  sensitive: boolean;
  disabled: boolean;
  checked?: boolean;
  options?: string[];
}

export interface BrowserFormRecord {
  id: string;
  action: string;
  method: string;
  label: string;
  submitLabel: string;
  risk: BrowserFormRisk;
  controls: BrowserFormControlRecord[];
  valid?: boolean;
  validationErrors?: string[];
  lastResult?: string;
  updatedAt: number;
}

export type BrowserWorkflowStatus = "recording" | "idle";
export type BrowserWorkflowRunStatus = "running" | "passed" | "failed" | "cancelled";
export type BrowserWorkflowStepStatus = "passed" | "failed" | "skipped";
export type BrowserWorkflowAssertionKind =
  | "text_present"
  | "text_absent"
  | "url_contains"
  | "no_console_errors"
  | "no_failed_requests"
  | "element_visible"
  | "form_valid"
  | "screenshot_changed"
  | "pdf_contains";
export type BrowserWorkflowDiagnosisKind =
  | "element_missing"
  | "element_disabled"
  | "validation_failed"
  | "navigation_failed"
  | "network_error"
  | "auth_error"
  | "console_error"
  | "timeout"
  | "stale_target"
  | "blocked_by_policy"
  | "unknown";

export interface BrowserWorkflowTargetStrategy {
  ref?: string;
  role?: string;
  name?: string;
  text?: string;
  formId?: string;
  formLabel?: string;
  fieldId?: string;
  fieldName?: string;
  fieldLabel?: string;
  x?: number;
  y?: number;
}

export interface BrowserWorkflowStep {
  id: string;
  action: DesktopToolName | string;
  args: Record<string, unknown>;
  targetStrategy?: BrowserWorkflowTargetStrategy;
  waitBefore?: string;
  waitAfter?: string;
  redactionLevel: "none" | "standard" | "sensitive";
  createdFromToolEventId?: string;
  createdAt: number;
}

export interface BrowserWorkflowAssertion {
  id: string;
  kind: BrowserWorkflowAssertionKind;
  value?: string;
  ref?: string;
  formId?: string;
  screenshotPath?: string;
  createdAt: number;
}

export interface BrowserWorkflowRecord {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  steps: BrowserWorkflowStep[];
  assertions: BrowserWorkflowAssertion[];
  createdAt: number;
  updatedAt: number;
}

export interface BrowserWorkflowAssertionResult {
  id: string;
  kind: BrowserWorkflowAssertionKind;
  passed: boolean;
  finding: string;
}

export interface BrowserWorkflowStepResult {
  stepId: string;
  action: string;
  status: BrowserWorkflowStepStatus;
  output?: string;
  error?: string;
  evidenceId?: string;
  diagnosis?: BrowserWorkflowDiagnosisRecord;
  startedAt: number;
  endedAt: number;
}

export interface BrowserWorkflowDiagnosisRecord {
  kind: BrowserWorkflowDiagnosisKind;
  finding: string;
  evidenceId?: string;
  details?: string[];
}

export interface BrowserWorkflowRunRecord {
  id: string;
  workspaceId: string;
  workflowId: string;
  status: BrowserWorkflowRunStatus;
  startedAt: number;
  endedAt?: number;
  stepResults: BrowserWorkflowStepResult[];
  assertionResults: BrowserWorkflowAssertionResult[];
  evidenceIds: string[];
  diagnosis?: BrowserWorkflowDiagnosisRecord;
}

export interface BrowserEvidenceRecord {
  id: string;
  workspaceId: string;
  workflowId?: string;
  runId?: string;
  tabId?: string;
  url: string;
  title: string;
  timestamp: string;
  artifactPaths: string[];
  consoleSummary: string[];
  networkSummary: string[];
  textSummary: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface BrowserWorkflowSummaryRecord {
  id: string;
  name: string;
  stepCount: number;
  assertionCount: number;
  updatedAt: number;
  lastRunStatus?: BrowserWorkflowRunStatus;
}

export interface BrowserWorkflowPanelStateRecord {
  status: BrowserWorkflowStatus;
  activeWorkflowId?: string;
  activeWorkflowName?: string;
  stepCount: number;
  assertionCount: number;
  workflows: BrowserWorkflowSummaryRecord[];
  lastRun?: BrowserWorkflowRunRecord;
  recentEvidence: BrowserEvidenceRecord[];
  updatedAt: number;
}

export interface BrowserWorkspaceStateRecord {
  workspaceId: string;
  tabs: BrowserTabRecord[];
  activeTabId: string;
  updatedAt: number;
}

export interface BrowserPanelStateRecord {
  workspaceId: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  visible: boolean;
  agentActive: boolean;
  lastAction?: string;
  lastFinding?: string;
  consoleErrorCount: number;
  failedRequestCount: number;
  viewport: BrowserViewportRecord;
  viewportPreset: BrowserViewportPreset;
  tabs: BrowserTabRecord[];
  activeTabId: string;
  downloads: BrowserDownloadRecord[];
  forms: BrowserFormRecord[];
  shields: BrowserShieldsStateRecord;
  workflow: BrowserWorkflowPanelStateRecord;
  evidenceUpdatedAt?: number;
  updatedAt: number;
}

export interface BrowserBoundsInput {
  workspaceId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserOpenInput {
  workspaceId: string;
  url: string;
  viewport?: BrowserViewportRecord;
  tabId?: string;
  newTab?: boolean;
}

export interface BrowserActionInput {
  action: string;
  ref?: string;
  text?: string;
  key?: string;
  x?: number;
  y?: number;
  deltaX?: number;
  deltaY?: number;
  value?: string;
  width?: number;
  height?: number;
  includeScreenshot?: boolean;
}

export interface BrowserOpenLinkInput {
  ref?: string;
  text?: string;
  href?: string;
  tabId?: string;
  newTab?: boolean;
}

export interface BrowserNavigationInput {
  workspaceId: string;
  direction: "back" | "forward" | "reload" | "stop";
  tabId?: string;
}

export interface BrowserInspectInput {
  workspaceId: string;
  kind: "console" | "network" | "dom" | "screenshot" | "source";
  tabId?: string;
}

export interface BrowserViewportInput {
  workspaceId: string;
  preset: BrowserViewportPreset;
}

export interface BrowserTabInput {
  workspaceId: string;
  action: "list" | "new" | "switch" | "close" | "close_all_except";
  tabId?: string;
  url?: string;
}

export interface BrowserDownloadInput {
  workspaceId: string;
  action: "list" | "allow_next" | "cancel" | "reveal";
  downloadId?: string;
}

export interface BrowserShieldsInput {
  workspaceId: string;
  action: "get" | "set_mode" | "toggle_site" | "list_blocked";
  mode?: BrowserShieldsMode;
  enabled?: boolean;
  origin?: string;
}

export interface BrowserFormFieldValueInput {
  fieldId?: string;
  name?: string;
  label?: string;
  value: string | boolean;
}

export interface BrowserFormAnalyzeInput {
  workspaceId: string;
  tabId?: string;
}

export interface BrowserFormFillInput {
  workspaceId: string;
  tabId?: string;
  formId?: string;
  fields: BrowserFormFieldValueInput[];
}

export interface BrowserFormValidateInput {
  workspaceId: string;
  tabId?: string;
  formId?: string;
}

export interface BrowserFormSubmitInput {
  workspaceId: string;
  tabId?: string;
  formId?: string;
  includeScreenshot?: boolean;
}

export interface BrowserWorkflowInput {
  workspaceId: string;
  action: "start_recording" | "stop_recording" | "list" | "get" | "replay" | "delete" | "rename";
  workflowId?: string;
  name?: string;
  description?: string;
  newTab?: boolean;
}

export interface BrowserWorkflowAssertInput {
  workspaceId: string;
  action: "add" | "list" | "remove" | "run";
  workflowId?: string;
  assertionId?: string;
  kind?: BrowserWorkflowAssertionKind;
  value?: string;
  ref?: string;
  formId?: string;
}

export interface BrowserEvidenceVaultInput {
  workspaceId: string;
  action: "save_current" | "list" | "get" | "prune";
  evidenceId?: string;
  workflowId?: string;
  runId?: string;
  includeScreenshot?: boolean;
}

export interface BrowserDiagnoseInput {
  workspaceId: string;
  runId?: string;
  workflowId?: string;
}

export type StorageCleanupCategoryId =
  | "browser_artifacts"
  | "browser_workflow_history"
  | "browser_cache"
  | "browser_downloads";

export interface StorageUsageCategoryRecord {
  id: StorageCleanupCategoryId;
  label: string;
  description: string;
  bytes: number;
  files: number;
  directories: number;
  safeToClean: boolean;
  userFiles: boolean;
  path?: string;
  errors: string[];
}

export interface StorageUsageSnapshot {
  categories: StorageUsageCategoryRecord[];
  totalBytes: number;
  scannedAt: number;
}

export interface StorageCleanupInput {
  categoryIds: StorageCleanupCategoryId[];
}

export interface StorageCleanupCategoryResult {
  id: StorageCleanupCategoryId;
  bytesFreed: number;
  filesRemoved: number;
  errors: string[];
}

export interface StorageCleanupResult {
  before: StorageUsageSnapshot;
  after: StorageUsageSnapshot;
  categories: StorageCleanupCategoryResult[];
  totalBytesFreed: number;
  completedAt: number;
}

export type BrowserToolsMenuAction =
  | "current_evidence"
  | "forms"
  | "record_workflow"
  | "replay_workflow"
  | "save_evidence"
  | "downloads"
  | "toggle_shields_site"
  | "list_shields_blocked"
  | "workflow_vault";

export interface BrowserToolsMenuInput {
  workspaceId: string;
  hasUrl: boolean;
  hasWorkflows: boolean;
  recording: boolean;
  shieldsEnabled?: boolean;
}

export interface BrowserOverlayInput {
  title: string;
  body: string;
  width?: number;
  height?: number;
}

export type ComputerUseBackendId = "privora_windows_native" | "cua_driver";

export type ComputerUseCapability =
  | "uia_direct"
  | "window_message"
  | "send_input_foreground"
  | "blocked_by_uipi"
  | "elevated"
  | "secure_desktop"
  | "unsupported_canvas";

export type ComputerUseActionKind =
  | "click"
  | "double_click"
  | "type"
  | "press"
  | "scroll"
  | "drag"
  | "set_value"
  | "invoke"
  | "select"
  | "focus";

export type ComputerUseDiagnosisKind =
  | "ok"
  | "element_missing"
  | "element_disabled"
  | "validation_failed"
  | "navigation_failed"
  | "network_error"
  | "auth_error"
  | "console_error"
  | "timeout"
  | "stale_target"
  | "blocked_by_policy"
  | "blocked_by_uipi"
  | "secure_desktop"
  | "unsupported_surface"
  | "backend_unavailable";

export interface ComputerUseRectRecord {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ComputerWindowRecord {
  id: string;
  title: string;
  processName: string;
  processId: number;
  executablePath?: string;
  bounds?: ComputerUseRectRecord;
  focused: boolean;
  elevated?: boolean;
  capabilities: ComputerUseCapability[];
  updatedAt: number;
}

export interface ComputerAppRecord {
  id: string;
  name: string;
  source: "start_menu" | "app_paths" | "registry" | "path" | "common_folder";
  executablePath?: string;
  shortcutPath?: string;
  arguments?: string;
  installLocation?: string;
  score: number;
}

export interface ComputerSnapshotNodeRecord {
  ref: string;
  role: string;
  name: string;
  value?: string;
  automationId?: string;
  enabled?: boolean;
  focused?: boolean;
  sensitive?: boolean;
  bounds?: ComputerUseRectRecord;
  capability?: ComputerUseCapability;
  children?: ComputerSnapshotNodeRecord[];
}

export interface ComputerSnapshotRecord {
  backend: ComputerUseBackendId;
  mode: "uia" | "vision" | "summary";
  window?: ComputerWindowRecord;
  nodes: ComputerSnapshotNodeRecord[];
  text: string;
  artifactPaths?: string[];
  diagnosis?: ComputerUseDiagnosisRecord;
  createdAt: number;
}

export interface ComputerUseDiagnosisRecord {
  kind: ComputerUseDiagnosisKind;
  message: string;
  capability?: ComputerUseCapability;
}

export interface ComputerUseActionResultRecord {
  backend: ComputerUseBackendId;
  action?: ComputerUseActionKind | string;
  success: boolean;
  finding: string;
  diagnosis?: ComputerUseDiagnosisRecord;
  window?: ComputerWindowRecord;
  artifactPaths?: string[];
  startedAt: number;
  endedAt: number;
}

export interface ComputerUseTraceRecord {
  id: string;
  backend: ComputerUseBackendId;
  action: ComputerUseActionKind | string;
  before?: ComputerSnapshotRecord;
  after?: ComputerSnapshotRecord;
  result: ComputerUseActionResultRecord;
  finding: string;
  diagnosis?: ComputerUseDiagnosisRecord;
  artifactPaths?: string[];
  startedAt: number;
  endedAt: number;
}

export interface ComputerUseStateRecord {
  enabled: boolean;
  backend: ComputerUseBackendId;
  active: boolean;
  lastAction?: string;
  lastFinding?: string;
  activeWindow?: ComputerWindowRecord;
  recentTraces: ComputerUseTraceRecord[];
  updatedAt: number;
}

export interface ComputerUseInputBase {
  backend?: ComputerUseBackendId;
  windowId?: string;
}

export interface ComputerUseActionInput extends ComputerUseInputBase {
  action: ComputerUseActionKind | string;
  ref?: string;
  targetRef?: string;
  text?: string;
  key?: string;
  value?: string;
  x?: number;
  y?: number;
  deltaX?: number;
  deltaY?: number;
  durationMs?: number;
  includeScreenshot?: boolean;
}

export type ThreadTitleSource = "placeholder" | "agent" | "user" | "fallback";

export interface SettingsRecord {
  id: "default";
  model: string;
  reasoningEffort: ReasoningEffort;
  permissionMode: PermissionMode;
  collaborationMode: CollaborationMode;
  computerUseEnabled: boolean;
  keepRunningInTray: boolean;
  theme: "light" | "dark" | "system";
  cliproxyBaseUrl: string;
  appwriteEndpoint: string;
  appwriteProjectId: string;
  privoraGatewayFunctionId: string;
  openRouterApiKeyStored: boolean;
  geminiApiKeyStored: boolean;
  privoraAccountConnected: boolean;
  privoraAccountEmail?: string;
  privoraAccountName?: string;
}

export interface ThreadRecord {
  id: string;
  title: string;
  titleSource?: ThreadTitleSource;
  titleUpdatedAt?: number;
  workspaceId: string | null;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  collaborationMode?: CollaborationMode;
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

export interface ThreadHistoryPage {
  threadId: string;
  messages: ChatMessageRecord[];
  toolEvents: ToolEventRecord[];
  turnUndos: TurnUndoRecord[];
  beforeCursor?: string;
  hasOlder: boolean;
  toolEventsTruncated?: boolean;
}

export interface ThreadHistoryCursor {
  value: string;
}

export interface ThreadHistoryPageInput {
  threadId: string;
  before?: string;
  limit?: number;
}

export interface MessageDetailRecord {
  message: ChatMessageRecord;
}

export interface ToolEventDetailRecord {
  tool: ToolEventRecord;
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
  artifactId: string;
  url: string;
  base64?: string;
  createdAt: number;
}

export interface ImportAttachmentInput {
  id: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
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
  sessionId?: number;
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

export type TerminalSessionStatus = "running" | "stop_requested" | "exited" | "stopped" | "timed_out" | "not_found" | "failed" | "orphaned";

export interface TerminalSessionRecord {
  sessionId: number;
  processId: number | null;
  command: string;
  cwd: string;
  status: TerminalSessionStatus;
  running: boolean;
  exitCode: number | null;
  backend: "pty" | "process";
  tty: boolean;
  streamsMerged: boolean;
  outputPreview: string;
  omittedBytes: number;
  startedAt: number;
  updatedAt: number;
  endedAt?: number;
}

export interface TerminalStateRecord {
  sessions: TerminalSessionRecord[];
  updatedAt: number;
}

export interface TerminalReadInput {
  sessionId: number;
  maxOutputChars?: number;
}

export interface TerminalStopInput {
  sessionId: number;
}

export interface TerminalResizeInput {
  sessionId: number;
  rows: number;
  cols: number;
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
  detailAvailable?: boolean;
  outputSizeBytes?: number;
  approvalGroupId?: string;
  approvalReason?: string;
  startedAt?: number;
  endedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export type GeneratedImageLifecycleStatus = "started" | "completed" | "failed";

export interface GeneratedImageEventRecord {
  id: string;
  callId: string;
  threadId: string;
  messageId: string;
  status: GeneratedImageLifecycleStatus;
  provider: string;
  model: string;
  prompt: string;
  previewUrl?: string;
  path?: string;
  workspacePath?: string;
  mimeType?: string;
  sizeBytes?: number;
  error?: string;
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

export type ContextCompactionTrigger = "pre_turn" | "mid_turn" | "fallback";
export type ContextCompactionReason = "context_limit" | "model_compaction_failed";
export type ContextCompactionStatus = "completed" | "failed";

export interface CompactionCheckpointRecord {
  id: string;
  threadId: string;
  assistantMessageId?: string;
  compactedThroughMessageId?: string;
  compactedThroughMessageCreatedAt?: number;
  workspaceRoot: string;
  model: string;
  trigger: ContextCompactionTrigger;
  reason: ContextCompactionReason;
  status: ContextCompactionStatus;
  summary: string;
  replacementHistory: unknown[];
  beforeTokens: number;
  afterTokens: number;
  error?: string;
  createdAt: number;
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
  historyPage?: ThreadHistoryPage;
  contextUsage?: ContextUsageRecord;
  aiCredits?: AiCreditSummaryRecord;
  terminal?: TerminalStateRecord;
  recoveryNotice?: StoreRecoveryNoticeRecord;
}

export type PrivoraPlanId = "free" | "plus" | "pro";

export interface AiCreditUsageRecord {
  id: string;
  modelId: string;
  creditsCharged: number;
  inputTokens: number;
  outputTokens: number;
  rawCostUsd: number;
  createdAt: number;
}

export interface AiCreditSummaryRecord {
  authenticated: boolean;
  userId?: string;
  email?: string;
  plan: PrivoraPlanId;
  status: "active" | "trialing" | "past_due" | "cancelled" | "disabled" | "unknown";
  hostedAccessDisabled: boolean;
  monthlyCreditAllowance: number;
  monthlyCreditsRemaining: number;
  topUpCreditsRemaining: number;
  monthlyCreditsUsed: number;
  dailyCreditsUsed: number;
  perRunCreditCap: number;
  dailyCreditCap: number;
  resetDate?: string;
  renewalDate?: string;
  recentUsage: AiCreditUsageRecord[];
  message?: string;
  updatedAt: number;
}

export interface PrivoraAccountRecord {
  authenticated: boolean;
  userId?: string;
  email?: string;
  name?: string;
  emailVerification?: boolean;
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
  | "context_compaction"
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
  | "exec_command"
  | "write_stdin"
  | "terminal_stop"
  | "terminal_resize"
  | "terminal_list"
  | "terminal_read"
  | "desktop_run_diagnostics"
  | "desktop_git_status"
  | "desktop_git_diff"
  | "generate_image"
  | "edit_image"
  | "list_generated_images"
  | "save_generated_image"
  | "notes_list"
  | "notes_create"
  | "notes_read"
  | "notes_update"
  | "notes_save"
  | "notes_delete"
  | "computer_capabilities"
  | "computer_list_windows"
  | "computer_find_apps"
  | "computer_focus_window"
  | "computer_snapshot"
  | "computer_inspect"
  | "computer_act"
  | "computer_wait"
  | "computer_trace"
  | "computer_verify"
  | "computer_screenshot"
  | "computer_stop"
  | "computer_open_app"
  | "computer_clipboard"
  | "browser_open"
  | "browser_open_link"
  | "browser_snapshot"
  | "browser_act"
  | "browser_inspect"
  | "browser_extract"
  | "browser_wait"
  | "browser_screenshot"
  | "browser_evidence"
  | "browser_search"
  | "browser_tab"
  | "browser_downloads"
  | "browser_shields"
  | "browser_pdf"
  | "browser_form_analyze"
  | "browser_form_fill"
  | "browser_form_validate"
  | "browser_form_submit"
  | "browser_capabilities"
  | "browser_workflow"
  | "browser_assert"
  | "browser_evidence_vault"
  | "browser_diagnose"
  | "browser_trace"
  | "browser_verify"
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

export interface GeneratedImageFileInput {
  id?: string;
  sourcePath?: string;
}

export interface GeneratedImageDownloadResult {
  path: string;
  filename: string;
  sizeBytes: number;
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
  | { type: "ai_credit_summary_updated"; summary: AiCreditSummaryRecord }
  | { type: "browser_state_updated"; state: BrowserPanelStateRecord }
  | { type: "computer_state_updated"; state: ComputerUseStateRecord }
  | { type: "browser_tools_menu_action"; workspaceId: string; action: BrowserToolsMenuAction }
  | { type: "image_generation_started"; image: GeneratedImageEventRecord }
  | { type: "image_generation_completed"; image: GeneratedImageEventRecord }
  | { type: "image_generation_failed"; image: GeneratedImageEventRecord }
  | { type: "request_user_input"; request: RequestUserInputRequestRecord }
  | { type: "request_user_input_resolved"; threadId: string; callId: string }
  | { type: "command_output_delta"; callId: string; delta: string }
  | { type: "terminal_session_started"; session: TerminalSessionRecord }
  | { type: "terminal_output_delta"; sessionId: number; stream: "stdout" | "stderr"; delta: string; chunkId: string; updatedAt: number }
  | { type: "terminal_session_updated"; session: TerminalSessionRecord }
  | { type: "terminal_session_ended"; session: TerminalSessionRecord }
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
  model?: string;
  reasoningEffort?: ReasoningEffort;
  collaborationMode?: CollaborationMode;
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
  computerUseEnabled?: boolean;
  keepRunningInTray?: boolean;
  theme?: "light" | "dark" | "system";
  cliproxyBaseUrl?: string;
  appwriteEndpoint?: string;
  appwriteProjectId?: string;
  privoraGatewayFunctionId?: string;
  openRouterApiKey?: string;
  geminiApiKey?: string;
}

export interface SaveThreadSettingsInput {
  threadId: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  collaborationMode?: CollaborationMode;
}

export interface PrivoraAuthInput {
  email: string;
  password: string;
  name?: string;
}

export interface PrivoraBrowserAuthStartRecord {
  url: string;
  expiresAt: number;
}

export interface PrivoraDesktopApi {
  debugEnabled: boolean;
  getSnapshot(): Promise<AppSnapshot>;
  getThreadHistoryPage(input: ThreadHistoryPageInput): Promise<ThreadHistoryPage>;
  getMessageDetail(messageId: string): Promise<MessageDetailRecord>;
  getToolEventDetail(toolId: string): Promise<ToolEventDetailRecord>;
  importAttachment(input: ImportAttachmentInput): Promise<DesktopAttachmentRecord>;
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
  listNotes(input: NotesListInput): Promise<NotesPanelStateRecord>;
  createNote(input: NotesCreateInput): Promise<NoteOpenResult>;
  openNote(input: NotesOpenInput): Promise<NoteOpenResult>;
  openNoteFile(input: NotesOpenFileInput): Promise<NoteOpenResult | null>;
  updateNote(input: NotesUpdateInput): Promise<NoteOpenResult>;
  saveNote(input: NotesSaveInput): Promise<NoteOpenResult>;
  saveNoteAs(input: NotesSaveInput): Promise<NoteOpenResult | null>;
  renameNote(input: NotesRenameInput): Promise<NoteOpenResult>;
  deleteNote(input: NotesDeleteInput): Promise<NotesPanelStateRecord>;
  closeNoteTab(input: NotesCloseTabInput): Promise<NotesPanelStateRecord>;
  revealNote(input: NotesOpenInput): Promise<void>;
  saveSettings(input: SaveSettingsInput): Promise<SettingsRecord>;
  saveThreadSettings(input: SaveThreadSettingsInput): Promise<ThreadRecord | null>;
  startPrivoraBrowserAuth(): Promise<PrivoraBrowserAuthStartRecord>;
  signInPrivora(input: PrivoraAuthInput): Promise<AiCreditSummaryRecord>;
  signUpPrivora(input: PrivoraAuthInput): Promise<AiCreditSummaryRecord>;
  signOutPrivora(): Promise<AiCreditSummaryRecord>;
  refreshAiCredits(): Promise<AiCreditSummaryRecord>;
  getBrowserState(workspaceId: string): Promise<BrowserPanelStateRecord | null>;
  setBrowserVisible(workspaceId: string, visible: boolean): Promise<BrowserPanelStateRecord | null>;
  setBrowserBounds(input: BrowserBoundsInput): Promise<BrowserPanelStateRecord | null>;
  openBrowserUrl(input: BrowserOpenInput): Promise<BrowserPanelStateRecord>;
  navigateBrowser(input: BrowserNavigationInput): Promise<BrowserPanelStateRecord>;
  setBrowserViewport(input: BrowserViewportInput): Promise<BrowserPanelStateRecord>;
  inspectBrowser(input: BrowserInspectInput): Promise<{ output: string; data?: Record<string, unknown> }>;
  browserTab(input: BrowserTabInput): Promise<BrowserPanelStateRecord>;
  browserDownload(input: BrowserDownloadInput): Promise<{ output: string; data?: Record<string, unknown> }>;
  browserShields(input: BrowserShieldsInput): Promise<{ output: string; data?: Record<string, unknown> }>;
  browserFormAnalyze(input: BrowserFormAnalyzeInput): Promise<{ output: string; data?: Record<string, unknown> }>;
  browserFormFill(input: BrowserFormFillInput): Promise<{ output: string; data?: Record<string, unknown> }>;
  browserFormValidate(input: BrowserFormValidateInput): Promise<{ output: string; data?: Record<string, unknown> }>;
  browserFormSubmit(input: BrowserFormSubmitInput): Promise<{ output: string; data?: Record<string, unknown> }>;
  browserWorkflow(input: BrowserWorkflowInput): Promise<{ output: string; data?: Record<string, unknown> }>;
  browserAssert(input: BrowserWorkflowAssertInput): Promise<{ output: string; data?: Record<string, unknown> }>;
  browserEvidenceVault(input: BrowserEvidenceVaultInput): Promise<{ output: string; data?: Record<string, unknown> }>;
  browserDiagnose(input: BrowserDiagnoseInput): Promise<{ output: string; data?: Record<string, unknown> }>;
  browserEvidence(workspaceId: string): Promise<{ output: string; data?: Record<string, unknown> }>;
  getStorageUsage(): Promise<StorageUsageSnapshot>;
  cleanupStorage(input: StorageCleanupInput): Promise<StorageCleanupResult>;
  listTerminalSessions(): Promise<TerminalStateRecord>;
  readTerminal(input: TerminalReadInput): Promise<{ output: string; data?: Record<string, unknown> }>;
  stopTerminal(input: TerminalStopInput): Promise<{ output: string; data?: Record<string, unknown> }>;
  resizeTerminal(input: TerminalResizeInput): Promise<{ output: string; data?: Record<string, unknown> }>;
  downloadGeneratedImage(input: GeneratedImageFileInput): Promise<GeneratedImageDownloadResult>;
  revealGeneratedImage(input: GeneratedImageFileInput): Promise<void>;
  openBrowserDevTools(workspaceId: string): Promise<void>;
  showBrowserToolsMenu(input: BrowserToolsMenuInput): Promise<void>;
  showBrowserOverlay(input: BrowserOverlayInput): Promise<void>;
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
