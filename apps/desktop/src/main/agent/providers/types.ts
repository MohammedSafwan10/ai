import type { CollaborationMode, ProviderId, ReasoningEffort } from "../../../shared/models";
import type { AiCreditSummaryRecord, DesktopToolCall, TokenUsageRecord, ToolResult } from "../../../shared/types";

export interface ProviderWebSearchEvent {
  id: string;
  status: "running" | "done" | "failed";
  query?: string;
  title?: string;
  output?: string;
}

export type ProviderPart =
  | { type: "text"; text: string }
  | { type: "image"; name: string; mimeType: string; data: string }
  | { type: "function_call"; id: string; name: string; arguments: Record<string, unknown>; thoughtSignature?: string }
  | { type: "function_response"; id: string; name: string; response: ToolResult }
  | { type: "server_tool_call"; id?: string; toolType?: string; arguments?: Record<string, unknown> }
  | { type: "server_tool_response"; id?: string; toolType?: string; response?: Record<string, unknown> };

export interface ProviderMessage {
  role: "user" | "assistant";
  content: string;
  parts?: ProviderPart[];
}

export interface ProviderStreamOptions {
  provider: ProviderId;
  model: string;
  systemInstruction: string;
  messages: ProviderMessage[];
  reasoning: ReasoningEffort;
  collaborationMode: CollaborationMode;
  signal: AbortSignal;
  threadId?: string;
  maxOutputTokens?: number;
  disableTools?: boolean;
  cliproxyBaseUrl: string;
  appwriteEndpoint: string;
  appwriteProjectId: string;
  privoraGatewayFunctionId: string;
  privoraSessionCookie: string;
  privoraUserJwt: string;
  openRouterApiKey: string;
  geminiApiKey: string;
  onTextDelta: (delta: string) => void;
  onThoughtDelta: (delta: string) => void;
  onToolDraft: (draft: { id?: string; name: string; arguments: Record<string, unknown> }) => void;
  onToolCall: (call: DesktopToolCall) => void;
  onProviderContextPart?: (part: Extract<ProviderPart, { type: "server_tool_call" | "server_tool_response" }>) => void;
  onUsage?: (usage: TokenUsageRecord) => void;
  onAiCredits?: (event: { creditsUsed: number; estimatedCredits: number; summary?: AiCreditSummaryRecord }) => void;
  onStreamProgress?: () => void;
  onTextReplace?: (text: string) => void;
  onWebSearch?: (event: ProviderWebSearchEvent) => void;
}

export interface ProviderAdapter {
  stream(options: ProviderStreamOptions): Promise<void>;
}

export const createToolCallId = () =>
  `desktop_call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const appendAssistantToolCalls = (
  messages: ProviderMessage[],
  content: string,
  calls: DesktopToolCall[],
  providerContextParts: ProviderPart[] = [],
): ProviderMessage[] => [
  ...messages,
  {
    role: "assistant",
    content,
    parts: [
      ...(content.trim() ? [{ type: "text" as const, text: content }] : []),
      ...providerContextParts,
      ...calls.map((call) => ({
        type: "function_call" as const,
        id: call.id,
        name: call.name,
        arguments: call.arguments,
        thoughtSignature: call.thoughtSignature,
      })),
    ],
  },
];

export const appendToolResults = (
  messages: ProviderMessage[],
  results: Array<{ id: string; name: string; response: ToolResult }>,
): ProviderMessage[] => [
  ...messages,
  ...results.map((result) => ({
    role: "user" as const,
    content: "",
    parts: [{
      type: "function_response" as const,
      id: result.id,
      name: result.name,
      response: result.response,
    }],
  })),
];
