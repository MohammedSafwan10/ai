import {
  desktopToolDefinitionsForMode,
  isDesktopToolName,
  openRouterDesktopTools,
  parseDesktopToolCall,
  parsePartialDesktopToolCall,
} from "../tools/definitions";
import type { ProviderAdapter, ProviderMessage, ProviderStreamOptions } from "./types";
import { readSse } from "./sse";
import { normalizeProviderUsage } from "./usage";
import {
  completedResponsesFunctionCall,
  responsesTextDelta,
  responsesThoughtDelta,
  toResponsesInput,
  webSearchEventFromResponse,
} from "./cliproxy";
import {
  OPENCODE_GO_CHAT_COMPLETIONS_URL,
  OPENCODE_GO_MESSAGES_URL,
  OPENCODE_GO_RESPONSES_URL,
  OPENCODE_GO_USER_AGENT,
  goRouteFor,
  goSessionId,
  normalizeGoError,
  stripGoPrefix,
} from "../../../shared/opencodeGo";
import { getModelOption, type ReasoningEffort } from "../../../shared/models";

export const openCodeGoThinkingConfig = (modelId: string, effort: ReasoningEffort) => {
  const model = getModelOption(modelId);
  if (effort === "none" || !model.supportsReasoning) return {};
  // Pass official effort values straight through (minimal/low/medium/high/
  // xhigh). Privora's "max" is clamped to xhigh: on Go it is tier-restricted
  // (e.g. Muse Spark 1.3 Standard tier only) and may be rejected.
  return { reasoning_effort: effort === "max" ? "xhigh" : effort };
};

const authHeaders = (apiKey: string, threadId?: string): Record<string, string> => ({
  "Content-Type": "application/json",
  Accept: "text/event-stream",
  Authorization: `Bearer ${apiKey}`,
  // Required by the Go gateway: stable per-conversation id for routing and
  // prompt caching, plus a real client user agent (not a generic SDK name).
  // See https://opencode.ai/docs/go/#where-can-i-use-it
  "User-Agent": OPENCODE_GO_USER_AGENT,
  "x-opencode-session": goSessionId(threadId),
});

const toMessages = (systemInstruction: string, messages: ProviderMessage[]) => {
  const out: Array<Record<string, unknown>> = systemInstruction ? [{ role: "system", content: systemInstruction }] : [];
  messages.forEach((message) => {
    const parts = message.parts || [];
    const functionCalls = parts.filter((part) => part.type === "function_call");
    const functionResponses = parts.filter((part) => part.type === "function_response");
    const textParts = parts.filter((part) => part.type === "text");
    const imageParts = parts.filter((part) => part.type === "image");

    if (functionCalls.length > 0) {
      out.push({
        role: "assistant",
        content: message.content || "",
        tool_calls: functionCalls.map((part) => ({
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
      functionResponses.forEach((part) => {
        out.push({
          role: "tool",
          tool_call_id: part.id,
          name: part.name,
          content: JSON.stringify(part.response || {}),
        });
      });
      return;
    }

    if (message.role === "user" && imageParts.length > 0) {
      const content: Array<Record<string, unknown>> = [];
      const text = message.content || textParts.map((part) => part.text).join("\n") || "";
      if (text) content.push({ type: "text", text });
      imageParts.forEach((part) => {
        content.push({
          type: "image_url",
          image_url: { url: `data:${part.mimeType};base64,${part.data}` },
        });
      });
      out.push({ role: message.role, content });
      return;
    }

    out.push({ role: message.role, content: message.content || "" });
  });
  return out;
};

const emitChatToolCalls = (
  options: ProviderStreamOptions,
  buffers: Map<number, { id?: string; name?: string; argumentsText: string }>,
  emitted: Set<string>,
  toolCalls: any[],
) => {
  toolCalls.forEach((toolCall: any, fallbackIndex: number) => {
    const index = Number.isFinite(Number(toolCall?.index)) ? Number(toolCall.index) : fallbackIndex;
    const previous = buffers.get(index) || { argumentsText: "" };
    const name = toolCall?.function?.name || previous.name;
    const id = toolCall?.id || previous.id;
    const nextArguments = previous.argumentsText + (toolCall?.function?.arguments || "");
    const next = { id, name, argumentsText: nextArguments };
    buffers.set(index, next);
    const draft = parsePartialDesktopToolCall(name, nextArguments);
    if (draft) options.onToolDraft({ ...draft, id });
    const key = next.id || `${next.name}:${next.argumentsText}`;
    if (emitted.has(key)) return;
    const call = parseDesktopToolCall(next.name, next.argumentsText, next.id);
    if (!call) return;
    emitted.add(key);
    options.onToolCall(call);
  });
};

export class OpenCodeGoAdapter implements ProviderAdapter {
  async stream(options: ProviderStreamOptions): Promise<void> {
    if (!options.opencodeGoApiKey) {
      throw new Error("OpenCode Go API key is not configured in desktop settings.");
    }
    const route = goRouteFor(options.model);
    if (route === "responses") return this.streamResponses(options);
    if (route === "messages") return this.streamMessages(options);
    return this.streamChat(options);
  }

  private async streamChat(options: ProviderStreamOptions): Promise<void> {
    const response = await fetch(OPENCODE_GO_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: authHeaders(options.opencodeGoApiKey, options.threadId),
      body: JSON.stringify({
        model: stripGoPrefix(options.model),
        messages: toMessages(options.systemInstruction, options.messages),
        ...(!options.disableTools ? {
          tools: openRouterDesktopTools(options.collaborationMode),
          tool_choice: "auto",
          parallel_tool_calls: true,
        } : {}),
        ...(options.maxOutputTokens ? { max_tokens: options.maxOutputTokens } : {}),
        ...openCodeGoThinkingConfig(options.model, options.reasoning),
        stream: true,
        stream_options: { include_usage: true },
        // No temperature: reasoning models behind the gateway (e.g. Luna)
        // reject non-default values, and omission is safe everywhere.
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(normalizeGoError(errorText || `OpenCode Go request failed with ${response.status}`, response.status));
    }

    const buffers = new Map<number, { id?: string; name?: string; argumentsText: string }>();
    const emitted = new Set<string>();
    const flush = () => {
      for (const value of buffers.values()) {
        const key = value.id || `${value.name}:${value.argumentsText}`;
        if (emitted.has(key)) continue;
        const call = parseDesktopToolCall(value.name, value.argumentsText, value.id);
        if (!call) continue;
        emitted.add(key);
        options.onToolCall(call);
      }
      buffers.clear();
    };

    await readSse(response, (_event, dataLine) => {
      const data = JSON.parse(dataLine);
      if (data?.error) throw new Error(normalizeGoError(typeof data.error === "string" ? data.error : JSON.stringify(data.error)));
      const usage = normalizeProviderUsage(data?.usage);
      if (usage) options.onUsage?.(usage);
      const choice = data?.choices?.[0] || {};
      const delta = choice.delta || {};
      if (typeof delta.content === "string") options.onTextDelta(delta.content);
      if (typeof choice.message?.content === "string") options.onTextDelta(choice.message.content);
      const thought = delta.reasoning || delta.reasoning_content || delta.thought;
      if (typeof thought === "string") options.onThoughtDelta(thought);

      const toolCalls = Array.isArray(delta.tool_calls)
        ? delta.tool_calls
        : Array.isArray(choice.message?.tool_calls)
          ? choice.message.tool_calls
          : [];
      emitChatToolCalls(options, buffers, emitted, toolCalls);

      if (choice.finish_reason === "tool_calls" || choice.message?.tool_calls) flush();
    }, options.onStreamProgress);

    if (buffers.size > 0) flush();
  }

  private async streamResponses(options: ProviderStreamOptions): Promise<void> {
    const response = await fetch(OPENCODE_GO_RESPONSES_URL, {
      method: "POST",
      headers: authHeaders(options.opencodeGoApiKey, options.threadId),
      body: JSON.stringify({
        model: stripGoPrefix(options.model),
        instructions: options.systemInstruction,
        input: toResponsesInput(options.messages),
        ...(!options.disableTools ? {
          tools: desktopToolDefinitionsForMode(options.collaborationMode),
          parallel_tool_calls: true,
        } : {}),
        ...(options.maxOutputTokens ? { max_output_tokens: options.maxOutputTokens } : {}),
        // "none" omits reasoning entirely: some Responses models (Muse Spark)
        // answer HTTP 400 when asked to disable reasoning explicitly.
        ...(options.reasoning === "none" ? {} : { reasoning: { effort: options.reasoning, summary: "auto" } }),
        stream: true,
        // No temperature: reasoning models behind the gateway (e.g. Luna)
        // reject non-default values, and omission is safe everywhere.
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(normalizeGoError(errorText || `OpenCode Go request failed with ${response.status}`, response.status));
    }

    const buffers = new Map<string, { id?: string; name?: string; argumentsText: string }>();
    const emitted = new Set<string>();
    let currentReasoningSummary = "";
    let hasReasoningSummary = false;
    const emit = (name: string, args: string, id?: string) => {
      const key = id || `${name}:${args}`;
      if (emitted.has(key)) return;
      const call = parseDesktopToolCall(name, args, id);
      if (!call) return;
      emitted.add(key);
      options.onToolCall(call);
    };
    const keyFor = (data: any) => {
      const id = data?.item_id || data?.output_item?.id || data?.item?.id || data?.call_id || data?.id;
      if (typeof id === "string" && id) return id;
      if (data?.output_index !== undefined && data?.output_index !== null) return `output:${data.output_index}`;
      return "default";
    };

    await readSse(response, (event, dataLine) => {
      let data: any;
      try {
        data = JSON.parse(dataLine);
      } catch {
        return;
      }
      const usage = normalizeProviderUsage(data?.usage || data?.response?.usage);
      if (usage) options.onUsage?.(usage);
      const webSearch = webSearchEventFromResponse(event, data);
      if (webSearch) options.onWebSearch?.(webSearch);
      const key = keyFor(data);
      const previous = buffers.get(key) || { argumentsText: "" };
      const itemName = data?.item?.name || data?.output_item?.name || data?.name;
      const name = typeof itemName === "string" && isDesktopToolName(itemName)
        ? itemName
        : previous.name;
      const itemId = data?.item?.call_id || data?.output_item?.call_id || data?.call_id || data?.item?.id || data?.output_item?.id || data?.id;
      const id = typeof itemId === "string" ? itemId : previous.id;
      if (name || id || previous.argumentsText) {
        buffers.set(key, { ...previous, name, id });
      }

      const text = responsesTextDelta(event, data);
      if (text) options.onTextDelta(text);
      const thought = responsesThoughtDelta(event, data);
      const eventType = `${event || ""} ${data?.type || ""}`;
      if (eventType.includes("reasoning_summary_part.added")) {
        if (hasReasoningSummary && currentReasoningSummary.trim()) options.onThoughtDelta("\n\n");
        currentReasoningSummary = "";
      }
      if (thought) {
        currentReasoningSummary += thought;
        hasReasoningSummary = true;
        options.onThoughtDelta(thought);
      }
      if (eventType.includes("reasoning_summary_text.done") && typeof data?.text === "string") {
        const reconciled = data.text;
        const isCompatiblePrefix = reconciled.startsWith(currentReasoningSummary);
        if (!isCompatiblePrefix && currentReasoningSummary.trim()) {
          options.onThoughtReplace?.(reconciled);
          currentReasoningSummary = reconciled;
          hasReasoningSummary = true;
        }
        const remainder = isCompatiblePrefix
          ? reconciled.slice(currentReasoningSummary.length)
          : currentReasoningSummary.trim()
            ? ""
            : reconciled;
        if (remainder) {
          currentReasoningSummary += remainder;
          hasReasoningSummary = true;
          options.onThoughtDelta(remainder);
        }
      }

      const type = eventType;
      if (type.includes("function_call_arguments.delta") && typeof data?.delta === "string") {
        const next = {
          id,
          name,
          argumentsText: previous.argumentsText + data.delta,
        };
        buffers.set(key, next);
        const draft = parsePartialDesktopToolCall(next.name, next.argumentsText);
        if (draft) options.onToolDraft({ ...draft, id: next.id });
      }
      const completed = completedResponsesFunctionCall(event, data);
      if (completed) {
        emit(completed.name, completed.argumentsText, completed.id);
        buffers.delete(key);
      } else if (type.includes("function_call_arguments.done")) {
        const buffered = buffers.get(key);
        if (buffered?.name && buffered.argumentsText) {
          emit(buffered.name, buffered.argumentsText, buffered.id);
          buffers.delete(key);
        }
      }
    }, options.onStreamProgress);
  }

  private async streamMessages(options: ProviderStreamOptions): Promise<void> {
    const model = getModelOption(options.model);
    const response = await fetch(OPENCODE_GO_MESSAGES_URL, {
      method: "POST",
      headers: {
        ...authHeaders(options.opencodeGoApiKey, options.threadId),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: stripGoPrefix(options.model),
        ...(options.systemInstruction ? { system: options.systemInstruction } : {}),
        messages: toAnthropicMessages(options.messages),
        ...(!options.disableTools ? {
          tools: desktopToolDefinitionsForMode(options.collaborationMode).map((tool) => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.parameters,
          })),
          tool_choice: { type: "auto" },
        } : {}),
        max_tokens: options.maxOutputTokens || model.maxOutputTokens || 32_768,
        stream: true,
        // No temperature: omitted everywhere on Go — strict models reject it.
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(normalizeGoError(errorText || `OpenCode Go request failed with ${response.status}`, response.status));
    }

    const blocks = new Map<number, { kind?: string; id?: string; name?: string; json: string; emitted: boolean }>();
    let inputTokens = 0;

    const flushBlock = (index: number) => {
      const block = blocks.get(index);
      if (!block || block.emitted || block.kind !== "tool_use" || !block.name) return;
      const call = parseDesktopToolCall(block.name, block.json || "{}", block.id);
      if (!call) return;
      block.emitted = true;
      options.onToolCall(call);
    };

    await readSse(response, (_event, dataLine) => {
      let data: any;
      try {
        data = JSON.parse(dataLine);
      } catch {
        return;
      }
      if (data?.type === "error") {
        throw new Error(normalizeGoError(JSON.stringify(data.error || data), undefined));
      }
      if (data?.type === "message_start" && data?.message?.usage) {
        inputTokens = Number(data.message.usage.input_tokens) || 0;
        return;
      }
      if (data?.type === "content_block_start") {
        const block = data.content_block || {};
        blocks.set(data.index, {
          kind: typeof block.type === "string" ? block.type : undefined,
          id: typeof block.id === "string" ? block.id : undefined,
          name: typeof block.name === "string" ? block.name : undefined,
          json: "",
          emitted: false,
        });
        return;
      }
      if (data?.type === "content_block_delta") {
        const delta = data.delta || {};
        const block = blocks.get(data.index) || { json: "", emitted: false };
        if (delta.type === "text_delta" && typeof delta.text === "string") {
          options.onTextDelta(delta.text);
        } else if (delta.type === "thinking_delta" && typeof delta.thinking === "string") {
          options.onThoughtDelta(delta.thinking);
        } else if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
          block.json += delta.partial_json;
          const draft = parsePartialDesktopToolCall(block.name, block.json);
          if (draft) options.onToolDraft({ ...draft, id: block.id });
        }
        blocks.set(data.index, block);
        return;
      }
      if (data?.type === "content_block_stop") {
        flushBlock(data.index);
        blocks.delete(data.index);
        return;
      }
      if (data?.type === "message_delta" && data?.usage) {
        const usage = normalizeProviderUsage({
          input_tokens: inputTokens,
          output_tokens: data.usage.output_tokens,
        });
        if (usage) options.onUsage?.(usage);
        return;
      }
      if (data?.type === "message_stop") {
        for (const index of blocks.keys()) flushBlock(index);
        blocks.clear();
      }
    }, options.onStreamProgress);

    for (const index of blocks.keys()) flushBlock(index);
    blocks.clear();
  }
};

const toAnthropicMessages = (messages: ProviderMessage[]) => {
  const out: Array<{ role: "user" | "assistant"; content: Array<Record<string, unknown>> }> = [];
  const push = (role: "user" | "assistant", content: Array<Record<string, unknown>>) => {
    if (content.length === 0) return;
    const last = out[out.length - 1];
    if (last && last.role === role) {
      last.content.push(...content);
      return;
    }
    out.push({ role, content });
  };

  messages.forEach((message) => {
    const parts = message.parts || [];
    const functionCalls = parts.filter((part) => part.type === "function_call");
    const functionResponses = parts.filter((part) => part.type === "function_response");
    const textParts = parts.filter((part) => part.type === "text");
    const imageParts = parts.filter((part) => part.type === "image");
    const text = message.content || textParts.map((part) => part.text).join("\n") || "";

    if (functionResponses.length > 0) {
      push("user", functionResponses.map((part) => ({
        type: "tool_result",
        tool_use_id: part.id,
        content: JSON.stringify(part.response || {}),
        ...(part.response.success === false ? { is_error: true } : {}),
      })));
    }

    if (message.role === "assistant" && functionCalls.length > 0) {
      const content: Array<Record<string, unknown>> = [];
      if (text) content.push({ type: "text", text });
      functionCalls.forEach((part) => {
        content.push({
          type: "tool_use",
          id: part.id,
          name: part.name,
          input: part.arguments || {},
        });
      });
      push("assistant", content);
      return;
    }

    if (message.role === "user" && imageParts.length > 0) {
      const content: Array<Record<string, unknown>> = [];
      if (text) content.push({ type: "text", text });
      imageParts.forEach((part) => {
        content.push({
          type: "image",
          source: { type: "base64", media_type: part.mimeType, data: part.data },
        });
      });
      push("user", content);
      return;
    }

    if (text) push(message.role, [{ type: "text", text }]);
  });

  return out;
};
