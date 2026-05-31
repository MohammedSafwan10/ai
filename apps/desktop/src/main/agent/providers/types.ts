import type { CollaborationMode, ProviderId, ReasoningEffort } from "../../../shared/models";
import type { DesktopToolCall, ToolResult } from "../../../shared/types";

export type ProviderPart =
  | { type: "text"; text: string }
  | { type: "image"; name: string; mimeType: string; data: string }
  | { type: "function_call"; id: string; name: string; arguments: Record<string, unknown>; thoughtSignature?: string }
  | { type: "function_response"; id: string; name: string; response: ToolResult };

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
  cliproxyBaseUrl: string;
  openRouterApiKey: string;
  geminiApiKey: string;
  onTextDelta: (delta: string) => void;
  onThoughtDelta: (delta: string) => void;
  onToolDraft: (draft: { id?: string; name: string; arguments: Record<string, unknown> }) => void;
  onToolCall: (call: DesktopToolCall) => void;
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
): ProviderMessage[] => [
  ...messages,
  {
    role: "assistant",
    content,
    parts: [
      ...(content.trim() ? [{ type: "text" as const, text: content }] : []),
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
