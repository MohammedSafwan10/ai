import type { PermissionMode, ReasoningEffort } from "./models";

export type MessageRole = "user" | "assistant";

export type TurnStatus =
  | "idle"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "stopped"
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

export interface WorkspaceRecord {
  id: string;
  path: string;
  name: string;
  lastOpenedAt: number;
}

export interface SettingsRecord {
  id: "default";
  model: string;
  reasoningEffort: ReasoningEffort;
  permissionMode: PermissionMode;
  theme: "light" | "dark" | "system";
  cliproxyBaseUrl: string;
  openRouterApiKeyStored: boolean;
  geminiApiKeyStored: boolean;
}

export interface ThreadRecord {
  id: string;
  title: string;
  workspaceId: string | null;
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
  thought?: string;
  status: TurnStatus;
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

export interface ToolEventRecord {
  id: string;
  threadId: string;
  messageId: string;
  callId: string;
  name: DesktopToolName | string;
  title: string;
  status: ToolEventStatus;
  risk: ToolRisk;
  args: Record<string, unknown>;
  result?: ToolResult;
  output?: string;
  diff?: string;
  approvalReason?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AppSnapshot {
  settings: SettingsRecord;
  workspaces: WorkspaceRecord[];
  threads: ThreadRecord[];
  messages: ChatMessageRecord[];
  toolEvents: ToolEventRecord[];
  activeThreadId: string | null;
  activeWorkspaceId: string | null;
  activeRun: ActiveRunState | null;
}

export interface ActiveRunState {
  threadId: string;
  assistantMessageId: string;
  status: TurnStatus;
}

export type DesktopToolName =
  | "desktop_read_file"
  | "desktop_write_file"
  | "desktop_apply_patch"
  | "desktop_list_dir"
  | "desktop_search"
  | "desktop_delete_path"
  | "desktop_rename_path"
  | "desktop_run_command"
  | "desktop_git_status"
  | "desktop_git_diff";

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

export type DesktopEvent =
  | { type: "snapshot"; snapshot: AppSnapshot }
  | { type: "message_updated"; message: ChatMessageRecord }
  | { type: "tool_updated"; tool: ToolEventRecord }
  | { type: "command_output_delta"; callId: string; delta: string }
  | { type: "run_state"; run: ActiveRunState | null }
  | { type: "toast"; tone: "info" | "error" | "success"; message: string };

export interface StartTurnInput {
  threadId: string;
  prompt: string;
  attachments?: DesktopAttachmentRecord[];
}

export interface ApprovalDecisionInput {
  threadId: string;
  callId: string;
  approved: boolean;
}

export interface SaveSettingsInput {
  model?: string;
  reasoningEffort?: ReasoningEffort;
  permissionMode?: PermissionMode;
  theme?: "light" | "dark" | "system";
  cliproxyBaseUrl?: string;
  openRouterApiKey?: string;
  geminiApiKey?: string;
}

export interface PrivoraDesktopApi {
  getSnapshot(): Promise<AppSnapshot>;
  createThread(workspaceId?: string | null): Promise<ThreadRecord>;
  renameThread(threadId: string, title: string): Promise<ThreadRecord | null>;
  toggleThreadStar(threadId: string): Promise<ThreadRecord | null>;
  deleteThread(threadId: string): Promise<void>;
  selectWorkspace(): Promise<WorkspaceRecord | null>;
  setActiveThread(threadId: string): Promise<void>;
  startTurn(input: StartTurnInput): Promise<void>;
  stopTurn(threadId: string): Promise<void>;
  decideApproval(input: ApprovalDecisionInput): Promise<void>;
  saveSettings(input: SaveSettingsInput): Promise<SettingsRecord>;
  openPath(path: string): Promise<void>;
  openWorkspaceTarget(target: WorkspaceOpenTarget): Promise<void>;
  onEvent(callback: (event: DesktopEvent) => void): () => void;
}

export type WorkspaceOpenTarget = "vscode" | "file_explorer" | "terminal" | "git_bash";
