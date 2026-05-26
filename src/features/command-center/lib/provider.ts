import type { ChatMessageRecord } from "../../../lib/db";
import type { ProviderId } from "../../../lib/models";
import { appLogger } from "../../../lib/logger";
import { normalizeProviderErrorMessage } from "../../../lib/providerErrors";
import { getOpenRouterModelCapabilities, getOpenRouterReasoningEffort, modelSupportsOpenRouterParameter } from "../../../lib/openrouter/models";
import {
  commandToolDefinitions,
  geminiCommandFunctionDeclarations,
  openRouterCommandTools,
  parseCommandNativeToolCall,
  parsePartialCommandNativeToolCall,
  type CommandNativeToolCall,
  type CommandNativeToolDraft,
} from "./nativeTools";

export interface CommandFunctionResponse {
  success: boolean;
  output?: string;
  error?: string;
  status?: "done" | "pending_confirmation" | "failed";
  meta?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

export type CommandProviderContentPart =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; data: string }
  | { type: "file"; name: string; mimeType: string; data: string }
  | { type: "function_call"; id: string; name: string; arguments: Record<string, unknown>; thoughtSignature?: string }
  | { type: "function_response"; id: string; name: string; response: CommandFunctionResponse };

export interface CommandProviderMessage {
  role: "system" | "user" | "assistant";
  content: string;
  parts?: CommandProviderContentPart[];
}

export interface CommandProviderOptions {
  provider: ProviderId | undefined;
  model: string;
  systemInstruction: string;
  providerMessages: CommandProviderMessage[];
  reasoningEnabled: boolean;
  webSearchEnabled: boolean;
  signal: AbortSignal;
  onTextDelta: (delta: string) => void;
  onThoughtDelta: (delta: string) => void;
  onWebSearch: (event: { status: "searching" | "searched"; queries?: string[] }) => void;
  onToolDelta: (draft: CommandNativeToolDraft) => void;
  onToolCall: (call: CommandNativeToolCall) => void;
}

const MAX_TOOL_TEXT_CHARS = 4000;
const MAX_TOOL_DATA_CHARS = 10000;
const COMMAND_PROVIDER_IDLE_TIMEOUT_MS = 45_000;

export class CommandProviderIdleTimeoutError extends Error {
  constructor() {
    super("The model connection stalled before it returned more Agent Mode output.");
    this.name = "CommandProviderIdleTimeoutError";
  }
}

const createIdleWatchdog = (parentSignal: AbortSignal) => {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let didTimeout = false;

  const clear = () => {
    if (timeout) clearTimeout(timeout);
    timeout = undefined;
  };
  const reset = () => {
    clear();
    timeout = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, COMMAND_PROVIDER_IDLE_TIMEOUT_MS);
  };
  const abortFromParent = () => controller.abort(parentSignal.reason);
  parentSignal.addEventListener("abort", abortFromParent, { once: true });

  return {
    signal: controller.signal,
    reset,
    dispose: () => {
      clear();
      parentSignal.removeEventListener("abort", abortFromParent);
    },
    throwIfTimedOut: (error: unknown) => {
      if (didTimeout) throw new CommandProviderIdleTimeoutError();
      throw error;
    },
  };
};

const getCliproxyApiKey = () =>
  ((import.meta as any).env?.VITE_CLIPROXY_API_KEY as string | undefined) || "dummy-key";

const truncateToolText = (value?: string) => {
  if (!value || value.length <= MAX_TOOL_TEXT_CHARS) return value;
  return `${value.slice(0, MAX_TOOL_TEXT_CHARS)}\n\n[Command tool output truncated.]`;
};

const compactToolData = (value?: Record<string, unknown>) => {
  if (!value) return undefined;
  const serialized = JSON.stringify(value);
  if (serialized.length <= MAX_TOOL_DATA_CHARS) return value;
  return {
    truncated: true,
    originalChars: serialized.length,
    summary: serialized.slice(0, MAX_TOOL_DATA_CHARS),
  };
};

const compactCommandFunctionResponse = (response: CommandFunctionResponse): CommandFunctionResponse => ({
  ...response,
  output: truncateToolText(response.output),
  error: truncateToolText(response.error),
  data: compactToolData(response.data),
});

export const createCommandNativeToolCallId = () =>
  `command_call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const withCommandNativeToolCallId = (call: CommandNativeToolCall): Required<Pick<CommandNativeToolCall, "id">> & CommandNativeToolCall => ({
  ...call,
  id: call.id || createCommandNativeToolCallId(),
});

export const messagesToCommandProviderHistory = (messages: ChatMessageRecord[]): CommandProviderMessage[] =>
  messages.map(message => {
    const parts: CommandProviderContentPart[] = [];
    if (message.content) parts.push({ type: "text", text: message.content });
    if (message.role === "user") {
      message.attachments?.forEach(attachment => {
        if (attachment.base64 && attachment.mimeType.startsWith("image/")) {
          parts.push({ type: "image", mimeType: attachment.mimeType, data: attachment.base64 });
          return;
        }
        if (attachment.base64) {
          parts.push({ type: "file", name: attachment.name, mimeType: attachment.mimeType, data: attachment.base64 });
        }
      });
    }
    return {
      role: message.role === "model" ? "assistant" : "user",
      content: message.content || "",
      parts: parts.length > 0 ? parts : undefined,
    };
  });

const toCliproxyInput = (messages: CommandProviderMessage[]) => {
  const input: Array<Record<string, unknown>> = [];
  messages.forEach(message => {
    const parts = message.parts || [];
    const functionCalls = parts.filter(part => part.type === "function_call");
    const functionResponses = parts.filter(part => part.type === "function_response");
    const visibleParts = parts.filter(part => part.type === "text" || part.type === "image" || part.type === "file");

    if (message.content || visibleParts.length > 0) {
      const content: Array<Record<string, unknown>> = [];
      if (message.content) {
        content.push({ type: message.role === "assistant" ? "output_text" : "input_text", text: message.content });
      }
      visibleParts.forEach(part => {
        if (part.type === "text" && part.text !== message.content) {
          content.push({ type: message.role === "assistant" ? "output_text" : "input_text", text: part.text });
        }
        if (part.type === "image") {
          content.push({ type: "input_image", image_url: `data:${part.mimeType};base64,${part.data}`, detail: "auto" });
        }
        if (part.type === "file") {
          content.push({ type: "input_file", filename: part.name, file_data: `data:${part.mimeType};base64,${part.data}` });
        }
      });
      input.push({
        role: message.role === "assistant" ? "assistant" : "user",
        content: content.length > 0 ? content : [{ type: message.role === "assistant" ? "output_text" : "input_text", text: "" }],
      });
    }

    functionCalls.forEach(part => {
      input.push({
        type: "function_call",
        call_id: part.id,
        name: part.name,
        arguments: JSON.stringify(part.arguments || {}),
      });
    });
    functionResponses.forEach(part => {
      input.push({
        type: "function_call_output",
        call_id: part.id,
        output: JSON.stringify(compactCommandFunctionResponse(part.response)),
      });
    });
  });
  return input;
};

const toOpenRouterMessages = (systemInstruction: string, messages: CommandProviderMessage[]) => {
  const out: Array<Record<string, unknown>> = [
    ...(systemInstruction ? [{ role: "system", content: systemInstruction }] : []),
  ];

  messages.forEach(message => {
    const parts = message.parts || [];
    const functionCalls = parts.filter(part => part.type === "function_call");
    const functionResponses = parts.filter(part => part.type === "function_response");
    const textParts = parts.filter(part => part.type === "text");

    if (functionCalls.length > 0) {
      out.push({
        role: "assistant",
        content: message.content || textParts.map(part => part.text).join("\n") || "",
        tool_calls: functionCalls.map(part => ({
          id: part.id,
          type: "function",
          function: {
            name: part.name,
            arguments: JSON.stringify(part.arguments || {}),
          },
        })),
      });
      return;
    }

    if (functionResponses.length > 0) {
      functionResponses.forEach(part => {
        out.push({
          role: "tool",
          tool_call_id: part.id,
          name: part.name,
          content: JSON.stringify(compactCommandFunctionResponse(part.response)),
        });
      });
      return;
    }

    out.push({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content || textParts.map(part => part.text).join("\n") || "",
    });
  });
  return out;
};

const toGeminiContents = (messages: CommandProviderMessage[]) =>
  messages
    .filter(message => message.role !== "system")
    .map(message => {
      const parts: Array<Record<string, unknown>> = [];
      message.parts?.forEach(part => {
        if (part.type === "text") parts.push({ text: part.text });
        if (part.type === "image" || part.type === "file") parts.push({ inlineData: { data: part.data, mimeType: part.mimeType } });
        if (part.type === "function_call") {
          parts.push({
            functionCall: { name: part.name, args: part.arguments || {} },
            ...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {}),
          });
        }
        if (part.type === "function_response") parts.push({ functionResponse: { name: part.name, response: compactCommandFunctionResponse(part.response) } });
      });
      if (parts.length === 0 && message.content) parts.push({ text: message.content });
      return {
        role: message.role === "assistant" ? "model" : "user",
        parts: parts.length > 0 ? parts : [{ text: "" }],
      };
    });

const splitSseEvents = (buffer: string) => {
  const events: string[] = [];
  const delimiter = /\r?\n\r?\n/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = delimiter.exec(buffer))) {
    events.push(buffer.slice(cursor, match.index));
    cursor = delimiter.lastIndex;
  }
  return { events, remaining: buffer.slice(cursor) };
};

const extractOpenRouterErrorMessage = (value: string) => {
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed?.error === "string") return extractOpenRouterErrorMessage(parsed.error);
    return normalizeProviderErrorMessage(parsed?.error?.message || parsed?.error?.error?.message || parsed?.message || value);
  } catch {
    return normalizeProviderErrorMessage(value);
  }
};

const extractCliproxyErrorMessage = (value: string) => {
  try {
    const parsed = JSON.parse(value);
    const message = parsed?.error?.message || parsed?.message || value;
    const code = parsed?.error?.code || parsed?.code || "";
    if (code === "auth_unavailable" || /auth_unavailable|invalidated oauth token|no auth available/i.test(String(message))) {
      return "CLIProxy authentication is unavailable for this model. Reconnect or restart the CLIProxy/Codex session, or switch to another configured model/provider and try again.";
    }
    return normalizeProviderErrorMessage(String(message || value));
  } catch {
    if (/auth_unavailable|invalidated oauth token|no auth available/i.test(value)) {
      return "CLIProxy authentication is unavailable for this model. Reconnect or restart the CLIProxy/Codex session, or switch to another configured model/provider and try again.";
    }
    return normalizeProviderErrorMessage(value);
  }
};

const extractCliproxyTextDelta = (event: string | undefined, data: any) => {
  if (typeof data?.delta === "string" && event?.includes("output_text")) return data.delta;
  if (typeof data?.choices?.[0]?.delta?.content === "string") return data.choices[0].delta.content;
  if (typeof data?.message?.content === "string") return data.message.content;
  return "";
};

const extractCliproxyThoughtDelta = (event: string | undefined, data: any) => {
  if (typeof data?.delta === "string" && (event?.includes("reasoning") || data?.type?.includes?.("reasoning"))) return data.delta;
  if (typeof data?.text === "string" && data?.type === "summary_text") return data.text;
  if (typeof data?.part?.text === "string" && data?.part?.type === "summary_text") return data.part.text;
  const summaryCandidates = [
    data?.summary,
    data?.item?.summary,
    data?.output_item?.summary,
    ...(Array.isArray(data?.response?.output) ? data.response.output.map((item: any) => item?.summary) : []),
  ];
  for (const summary of summaryCandidates) {
    if (!Array.isArray(summary)) continue;
    const text = summary.map((item: any) => item?.text || item?.content).filter(Boolean).join("");
    if (text) return text;
  }
  return "";
};

const extractCliproxyWebSearchEvent = (event: string | undefined, data: any) => {
  const payload = data?.item || data?.output_item || data;
  const type = `${event || ""} ${data?.type || ""} ${payload?.type || ""}`;
  if (!type.includes("web_search")) return null;
  const rawQueries = [
    payload?.action?.query,
    data?.action?.query,
    ...(Array.isArray(payload?.action?.queries) ? payload.action.queries : []),
    ...(Array.isArray(data?.action?.queries) ? data.action.queries : []),
  ];
  const queries = rawQueries.filter((query): query is string => typeof query === "string" && query.trim().length > 0);
  const status: "searching" | "searched" = payload?.status === "completed" || data?.status === "completed" ? "searched" : "searching";
  return { status, queries: queries.length > 0 ? queries : undefined };
};

const findCompletedCommandFunctionCall = (event: string | undefined, data: any) => {
  const type = `${event || ""} ${data?.type || ""}`;
  const candidates = [
    data?.item,
    data?.output_item,
    data,
    ...(Array.isArray(data?.response?.output) ? data.response.output : []),
  ];
  const item = candidates.find(candidate =>
    candidate &&
    typeof candidate?.arguments === "string" &&
    (candidate?.name?.startsWith?.("command_") || candidate?.type === "function_call")
  );
  const name = item?.name || data?.name;
  const argumentsText = item?.arguments || data?.arguments;
  if (!type.includes("function_call") && item?.type !== "function_call") return null;
  if (typeof name !== "string" || !name.startsWith("command_")) return null;
  if (typeof argumentsText !== "string") return null;
  return { id: item?.call_id || data?.call_id || item?.id || data?.id, name, argumentsText };
};

async function streamCliproxyCommandResponse({
  model,
  systemInstruction,
  providerMessages,
  reasoningEnabled,
  webSearchEnabled,
  signal,
  onTextDelta,
  onThoughtDelta,
  onWebSearch,
  onToolDelta,
  onToolCall,
}: CommandProviderOptions) {
  const tools: unknown[] = [...commandToolDefinitions];
  if (webSearchEnabled) tools.unshift({ type: "web_search_preview" });
  const watchdog = createIdleWatchdog(signal);
  watchdog.reset();

  try {
    const response = await fetch("/cliproxy/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getCliproxyApiKey()}`,
      },
      body: JSON.stringify({
        model,
        instructions: systemInstruction,
        input: toCliproxyInput(providerMessages),
        tools,
        ...(reasoningEnabled ? { reasoning: { effort: "medium", summary: "auto" } } : {}),
        stream: true,
        temperature: 0.45,
      }),
      signal: watchdog.signal,
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text().catch(() => "");
      throw new Error(extractCliproxyErrorMessage(errorText) || `CLIProxy Command Agent request failed with ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let currentFunctionName = "";
    let currentFunctionCallId = "";
    let argumentBuffer = "";
    const emittedToolCallKeys = new Set<string>();

  const emitToolCallOnce = (name: string, argumentsText: string, id?: string) => {
    const key = id || `${name}:${argumentsText}`;
    if (emittedToolCallKeys.has(key)) return;
    emittedToolCallKeys.add(key);
    const call = parseCommandNativeToolCall(name, argumentsText, id);
    if (call) onToolCall(call);
  };

  const flushEvent = (rawEvent: string) => {
    const lines = rawEvent.split("\n");
    const event = lines.find(line => line.startsWith("event:"))?.slice("event:".length).trim();
    const dataLines = lines.filter(line => line.startsWith("data:")).map(line => line.slice("data:".length).trim());

    for (const dataLine of dataLines) {
      if (!dataLine || dataLine === "[DONE]") continue;
      try {
        const data = JSON.parse(dataLine);
        const itemName = data?.item?.name || data?.output_item?.name || data?.name;
        if (typeof itemName === "string" && itemName.startsWith("command_")) currentFunctionName = itemName;
        const itemCallId = data?.item?.call_id || data?.output_item?.call_id || data?.call_id || data?.item?.id || data?.output_item?.id || data?.id;
        if (typeof itemCallId === "string") currentFunctionCallId = itemCallId;

        const webSearchEvent = extractCliproxyWebSearchEvent(event, data);
        if (webSearchEvent) onWebSearch(webSearchEvent);
        const textDelta = extractCliproxyTextDelta(event, data);
        if (textDelta) onTextDelta(textDelta);
        const thoughtDelta = extractCliproxyThoughtDelta(event, data);
        if (thoughtDelta) onThoughtDelta(thoughtDelta);

        const type = `${event || ""} ${data?.type || ""}`;
        if (type.includes("function_call_arguments.delta") && typeof data?.delta === "string") {
          argumentBuffer += data.delta;
          const draft = parsePartialCommandNativeToolCall(currentFunctionName, argumentBuffer);
          if (draft) onToolDelta(draft);
        }

        const completed = findCompletedCommandFunctionCall(event, data);
        if (completed) {
          emitToolCallOnce(completed.name, completed.argumentsText, completed.id);
          argumentBuffer = "";
          currentFunctionName = "";
          currentFunctionCallId = "";
        } else if (argumentBuffer && type.includes("function_call_arguments.done")) {
          emitToolCallOnce(currentFunctionName, argumentBuffer, currentFunctionCallId || undefined);
          argumentBuffer = "";
          currentFunctionName = "";
          currentFunctionCallId = "";
        }
      } catch {
        if (!event || event.includes("output_text")) onTextDelta(dataLine);
      }
    }
  };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      watchdog.reset();
      buffer += decoder.decode(value, { stream: true });
      const split = splitSseEvents(buffer);
      buffer = split.remaining;
      split.events.forEach(flushEvent);
    }
    if (buffer.trim()) flushEvent(buffer);
  } catch (error) {
    watchdog.throwIfTimedOut(error);
  } finally {
    watchdog.dispose();
  }
}

const getOpenRouterChoice = (data: any) => data?.choices?.[0] || {};

const extractOpenRouterThoughtDelta = (data: any) => {
  const delta = getOpenRouterChoice(data)?.delta || {};
  return delta.reasoning || delta.reasoning_content || delta.reasoningContent || delta.thought || "";
};

const hasOpenRouterWebSearchSignal = (data: any) => {
  const choice = getOpenRouterChoice(data);
  const delta = choice?.delta || {};
  const message = choice?.message || {};
  const usage = data?.usage || {};
  const serverToolUse = usage?.server_tool_use || data?.server_tool_use || {};
  const webSearchRequests = Number(serverToolUse?.web_search_requests || usage?.web_search_requests || data?.web_search_requests || 0);
  if (webSearchRequests > 0) return true;
  const annotations = [
    ...(Array.isArray(delta.annotations) ? delta.annotations : []),
    ...(Array.isArray(message.annotations) ? message.annotations : []),
    ...(Array.isArray(data?.annotations) ? data.annotations : []),
  ];
  if (annotations.length > 0) return true;
  const toolCalls = [
    ...(Array.isArray(delta.tool_calls) ? delta.tool_calls : []),
    ...(Array.isArray(message.tool_calls) ? message.tool_calls : []),
  ];
  return toolCalls.some((toolCall: any) => {
    const name = toolCall?.function?.name || toolCall?.name || toolCall?.type || "";
    return typeof name === "string" && name.includes("web_search");
  });
};

async function streamOpenRouterCommandResponse({
  model,
  systemInstruction,
  providerMessages,
  reasoningEnabled,
  webSearchEnabled,
  signal,
  onTextDelta,
  onThoughtDelta,
  onWebSearch,
  onToolDelta,
  onToolCall,
}: CommandProviderOptions) {
  const capabilities = getOpenRouterModelCapabilities(model);
  if (!capabilities?.supportsTools) {
    throw new Error("This OpenRouter model does not advertise native tool support, so Agent Mode cannot safely edit Command Center with it.");
  }

  const tools: unknown[] = [
    ...(webSearchEnabled ? [{
      type: "openrouter:web_search",
      parameters: {
        max_results: 5,
        max_total_results: 12,
      },
    }] : []),
    ...openRouterCommandTools,
  ];
  const watchdog = createIdleWatchdog(signal);
  watchdog.reset();

  try {
    const response = await fetch("/api/openrouter/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: toOpenRouterMessages(systemInstruction, providerMessages),
        tools,
        ...(capabilities.supportsToolChoice ? { tool_choice: "auto" } : {}),
        parallel_tool_calls: true,
        ...(capabilities.supportsReasoning && reasoningEnabled ? { reasoning: { effort: getOpenRouterReasoningEffort(model), exclude: false } } : {}),
        ...(reasoningEnabled && modelSupportsOpenRouterParameter(model, "include_reasoning") ? { include_reasoning: true } : {}),
        ...(modelSupportsOpenRouterParameter(model, "temperature") ? { temperature: 0.45 } : {}),
        stream: true,
        ...(webSearchEnabled ? { stream_options: { include_usage: true } } : {}),
      }),
      signal: watchdog.signal,
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text().catch(() => "");
      throw new Error(extractOpenRouterErrorMessage(errorText) || `OpenRouter Command Agent request failed with ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let didReportWebSearch = false;
    const toolBuffers = new Map<number, { id?: string; name?: string; argumentsText: string }>();
    const emittedToolCallKeys = new Set<string>();

  const handleToolCallDelta = (toolCall: any, fallbackIndex: number) => {
    const index = Number.isFinite(Number(toolCall?.index)) ? Number(toolCall.index) : fallbackIndex;
    const previous = toolBuffers.get(index) || { argumentsText: "" };
    const name = toolCall?.function?.name || previous.name;
    const id = toolCall?.id || previous.id;
    const nextArguments = previous.argumentsText + (toolCall?.function?.arguments || "");
    toolBuffers.set(index, { id, name, argumentsText: nextArguments });
    const draft = parsePartialCommandNativeToolCall(name, nextArguments);
    if (draft) onToolDelta({ ...draft, id });
  };

  const flushCompletedToolCalls = () => {
    for (const value of toolBuffers.values()) {
      const key = value.id || `${value.name}:${value.argumentsText}`;
      if (emittedToolCallKeys.has(key)) continue;
      emittedToolCallKeys.add(key);
      const call = parseCommandNativeToolCall(value.name, value.argumentsText, value.id);
      if (call) onToolCall(call);
    }
    toolBuffers.clear();
  };

  const flushEvent = (rawEvent: string) => {
    const dataLines = rawEvent
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.startsWith("data:"))
      .map(line => line.slice("data:".length).trim());

    for (const dataLine of dataLines) {
      if (!dataLine || dataLine === "[DONE]") continue;
      const data = JSON.parse(dataLine);
      if (data?.error) {
        throw new Error(extractOpenRouterErrorMessage(typeof data.error === "string" ? data.error : JSON.stringify(data.error)));
      }
      const choice = getOpenRouterChoice(data);
      const delta = choice?.delta || {};
      if (typeof delta.content === "string") onTextDelta(delta.content);
      const thoughtDelta = extractOpenRouterThoughtDelta(data);
      if (thoughtDelta) onThoughtDelta(thoughtDelta);
      const toolCalls = Array.isArray(delta.tool_calls)
        ? delta.tool_calls
        : Array.isArray(choice?.message?.tool_calls)
          ? choice.message.tool_calls
          : [];
      toolCalls.forEach(handleToolCallDelta);
      if (webSearchEnabled && !didReportWebSearch && hasOpenRouterWebSearchSignal(data)) {
        didReportWebSearch = true;
        onWebSearch({ status: "searched" });
      }
      if (choice?.finish_reason === "tool_calls" || choice?.message?.tool_calls) flushCompletedToolCalls();
    }
  };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      watchdog.reset();
      buffer += decoder.decode(value, { stream: true });
      const split = splitSseEvents(buffer);
      buffer = split.remaining;
      split.events.forEach(event => {
        const trimmed = event.trim();
        if (!trimmed || trimmed.startsWith(":")) return;
        flushEvent(event);
      });
    }
    if (buffer.trim() && !buffer.trim().startsWith(":")) flushEvent(buffer);
    if (toolBuffers.size > 0) flushCompletedToolCalls();
  } catch (error) {
    watchdog.throwIfTimedOut(error);
  } finally {
    watchdog.dispose();
  }
}

async function streamGeminiCommandResponse({
  model,
  systemInstruction,
  providerMessages,
  reasoningEnabled,
  webSearchEnabled,
  signal,
  onTextDelta,
  onThoughtDelta,
  onWebSearch,
  onToolCall,
}: CommandProviderOptions) {
  const watchdog = createIdleWatchdog(signal);
  watchdog.reset();
  try {
    const response = await fetch("/api/gemini/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        contents: toGeminiContents(providerMessages),
        systemInstruction,
        thinkingEnabled: reasoningEnabled,
        webSearchEnabled,
        artifactToolsEnabled: false,
        functionDeclarations: geminiCommandFunctionDeclarations,
        temperature: 0.45,
      }),
      signal: watchdog.signal,
    });

    if (!response.ok || !response.body) {
      const errorBody = await response.json().catch(() => null);
      throw new Error(errorBody?.error || `Gemini Command Agent request failed with ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

  const flushLine = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as
      | { type: "text"; text: string }
      | { type: "thought"; text: string }
      | { type: "webSearch"; status: "searched"; queries?: string[] }
      | { type: "toolCall"; name: string; payload: Record<string, unknown>; thoughtSignature?: string }
      | { type: "error"; error: string };
    if (event.type === "text") onTextDelta(event.text || "");
    if (event.type === "thought") onThoughtDelta(event.text || "");
    if (event.type === "webSearch") onWebSearch({ status: event.status, queries: event.queries });
    if (event.type === "toolCall") {
      const call = parseCommandNativeToolCall(
        event.name,
        JSON.stringify(event.payload || {}),
        createCommandNativeToolCallId()
      );
      if (call) onToolCall({ ...call, thoughtSignature: event.thoughtSignature });
    }
    if (event.type === "error") throw new Error(event.error || "Gemini Command Agent stream failed.");
  };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      watchdog.reset();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      lines.forEach(flushLine);
    }
    if (buffer.trim()) flushLine(buffer);
  } catch (error) {
    watchdog.throwIfTimedOut(error);
  } finally {
    watchdog.dispose();
  }
}

export async function streamCommandAgentResponse(options: CommandProviderOptions) {
  appLogger.debug("Command Agent native stream started", {
    provider: options.provider,
    model: options.model,
    historyLength: options.providerMessages.length,
    reasoningEnabled: options.reasoningEnabled,
    webSearchEnabled: options.webSearchEnabled,
  });
  if (options.provider === "cliproxy") return streamCliproxyCommandResponse(options);
  if (options.provider === "openrouter") return streamOpenRouterCommandResponse(options);
  return streamGeminiCommandResponse(options);
}

export const appendCommandAssistantToolCalls = (
  messages: CommandProviderMessage[],
  content: string,
  calls: Array<Required<Pick<CommandNativeToolCall, "id">> & CommandNativeToolCall>
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

export const appendCommandToolResults = (
  messages: CommandProviderMessage[],
  results: Array<{ id: string; name: string; response: CommandFunctionResponse }>
) => [
  ...messages,
  ...results.map(result => ({
    role: "user" as const,
    content: "",
    parts: [{
      type: "function_response" as const,
      id: result.id,
      name: result.name,
      response: compactCommandFunctionResponse(result.response),
    }],
  })),
];
