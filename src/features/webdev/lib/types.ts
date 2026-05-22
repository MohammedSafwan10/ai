import type { ProviderId } from "../../../lib/models";
import type { WebDevFileRecord, WebDevMessageRecord, WebDevProjectRecord } from "../../../lib/db";
import type { Attachment } from "../../../lib/attachments";

export type WebDevProject = WebDevProjectRecord;
export type WebDevFile = WebDevFileRecord;
export type WebDevMessage = WebDevMessageRecord;

export type WebDevIdeTab = "code" | "preview";

export interface WebDevFileDiff {
  path: string;
  beforeContent: string;
  afterContent: string;
  status?: "previewing" | "committed";
}

export interface WebDevRuntimeState {
  status: "idle" | "booting" | "installing" | "starting" | "running" | "error" | "unsupported";
  previewUrl?: string;
  terminalLines: string[];
  errors: string[];
}

export interface WebDevToolCall {
  id?: string;
  name: string;
  arguments: Record<string, unknown>;
  thoughtSignature?: string;
}

export interface WebDevToolDraft {
  id?: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface WebDevFunctionResponse {
  success: boolean;
  output?: string;
  error?: string;
  meta?: Record<string, unknown>;
  data?: Record<string, unknown>;
  warnings?: string[];
}

export type WebDevProviderContentPart =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; data: string }
  | { type: "file"; name: string; mimeType: string; data: string }
  | { type: "function_call"; id: string; name: string; arguments: Record<string, unknown>; thoughtSignature?: string }
  | { type: "function_response"; id: string; name: string; response: WebDevFunctionResponse };

export interface WebDevProviderMessage {
  role: "system" | "user" | "assistant";
  content: string;
  parts?: WebDevProviderContentPart[];
}

export interface WebDevProviderOptions {
  provider: ProviderId | undefined;
  model: string;
  systemInstruction: string;
  providerMessages: WebDevProviderMessage[];
  maxOutputTokens?: number;
  files: WebDevFile[];
  messages: WebDevMessage[];
  attachments?: Attachment[];
  reasoningEnabled: boolean;
  signal: AbortSignal;
  onTextDelta: (delta: string) => void;
  onThoughtDelta: (delta: string) => void;
  onToolDelta: (draft: WebDevToolDraft) => void;
  onToolCall: (call: WebDevToolCall) => void;
}
