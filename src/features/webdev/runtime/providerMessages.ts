import type { WebDevMessageRecord } from "../../../lib/db";
import type { WebDevProviderMessage, WebDevToolCall } from "../lib/types";

export interface WebDevToolResultEntry {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  response: {
    success: boolean;
    output?: string;
    error?: string;
    meta?: Record<string, unknown>;
    data?: Record<string, unknown>;
    warnings?: string[];
  };
}

export const createToolCallId = () =>
  `webdev_call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const withToolCallId = (call: WebDevToolCall): Required<Pick<WebDevToolCall, "id">> & WebDevToolCall => ({
  ...call,
  id: call.id || createToolCallId(),
});

export const messagesToProviderHistory = (messages: WebDevMessageRecord[]): WebDevProviderMessage[] => {
  const providerMessages: WebDevProviderMessage[] = [];
  for (const message of messages) {
    const isHiddenToolCall =
      message.role === "assistant" &&
      Boolean(message.toolCallId && message.toolName && message.toolArguments);
    if (message.hiddenFromChat && !message.isSummary && message.role !== "tool" && !isHiddenToolCall) continue;
    if (message.role === "activity") continue;
    if (message.role === "user") {
      providerMessages.push({ role: "user", content: message.content });
      continue;
    }
    if (message.role === "assistant") {
      if (message.toolCallId && message.toolName && message.toolArguments) {
        providerMessages.push({
          role: "assistant",
          content: message.content || "",
          parts: [{
            type: "function_call",
            id: message.toolCallId,
            name: message.toolName,
            arguments: message.toolArguments,
          }],
        });
        continue;
      }
      providerMessages.push({ role: "assistant", content: message.content || "" });
      continue;
    }
    if (message.role === "tool" && message.toolCallId && message.toolName && message.toolResult) {
      providerMessages.push({
        role: "user",
        content: "",
        parts: [{
          type: "function_response",
          id: message.toolCallId,
          name: message.toolName,
          response: {
            success: message.toolStatus !== "failed",
            output: typeof message.toolResult.output === "string" ? message.toolResult.output : undefined,
            error: typeof message.toolResult.error === "string" ? message.toolResult.error : undefined,
            meta: typeof message.toolResult.meta === "object" && message.toolResult.meta ? message.toolResult.meta as Record<string, unknown> : undefined,
            data: typeof message.toolResult.data === "object" && message.toolResult.data ? message.toolResult.data as Record<string, unknown> : undefined,
          },
        }],
      });
    }
  }
  return providerMessages;
};

export const appendAssistantToolCalls = (
  messages: WebDevProviderMessage[],
  content: string,
  calls: Array<Required<Pick<WebDevToolCall, "id">> & WebDevToolCall>
) => [
  ...messages,
  {
    role: "assistant" as const,
    content,
    parts: [
      ...(content.trim() ? [{ type: "text" as const, text: content }] : []),
      ...calls.map(call => ({
        type: "function_call" as const,
        id: call.id,
        name: call.name,
        arguments: call.arguments,
        thoughtSignature: call.thoughtSignature,
      })),
    ],
  },
];

export const appendToolResults = (messages: WebDevProviderMessage[], results: WebDevToolResultEntry[]) => [
  ...messages,
  ...results.map(result => ({
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

export const appendInternalInstruction = (messages: WebDevProviderMessage[], content: string) => [
  ...messages,
  {
    role: "user" as const,
    content: `Web Dev runtime note:\n${content}`,
  },
];
