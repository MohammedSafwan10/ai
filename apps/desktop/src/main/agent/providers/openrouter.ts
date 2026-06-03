import { openRouterDesktopTools, parseDesktopToolCall, parsePartialDesktopToolCall } from "../tools/definitions";
import type { ProviderAdapter, ProviderMessage, ProviderStreamOptions } from "./types";
import { readSse } from "./sse";
import { normalizeProviderUsage } from "./usage";

const openRouterReasoningEffort = (effort: ProviderStreamOptions["reasoning"]) =>
  effort === "extra_high" ? "high" : effort;

const getOpenRouterErrorMessage = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed);
    return String(parsed?.error?.message || parsed?.message || trimmed);
  } catch {
    return trimmed;
  }
};

export const parseOpenRouterAffordableOutputTokens = (value: string) => {
  const message = getOpenRouterErrorMessage(value);
  const match = message.match(/requested up to\s+([\d,]+)\s+tokens, but can only afford\s+([\d,]+)/i);
  if (!match) return undefined;
  const requested = Number(match[1].replaceAll(",", ""));
  const affordable = Number(match[2].replaceAll(",", ""));
  return Number.isFinite(requested) && Number.isFinite(affordable)
    ? { requested, affordable }
    : undefined;
};

export const normalizeOpenRouterError = (value: string) => {
  const message = getOpenRouterErrorMessage(value);
  if (!message) return "OpenRouter request failed.";

  const affordability = parseOpenRouterAffordableOutputTokens(message);
  if (affordability) {
    return `OpenRouter rejected the request because this key can only afford ${affordability.affordable.toLocaleString()} output tokens, while the request allowed ${affordability.requested.toLocaleString()}. Try a shorter prompt or raise the key's credit limit in OpenRouter.`;
  }

  if (/no endpoints found/i.test(message)) {
    return `OpenRouter could not find an endpoint for the selected model. The model may have been renamed, removed, or disabled for your key. (${message})`;
  }

  return message;
};

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

export class OpenRouterAdapter implements ProviderAdapter {
  async stream(options: ProviderStreamOptions): Promise<void> {
    if (!options.openRouterApiKey) {
      throw new Error("OpenRouter API key is not configured in desktop settings.");
    }

    const request = (maxOutputTokens: number | undefined) => fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Authorization: `Bearer ${options.openRouterApiKey}`,
        "X-Title": "Privora Desktop",
      },
      body: JSON.stringify({
        model: options.model,
        messages: toMessages(options.systemInstruction, options.messages),
        tools: openRouterDesktopTools(options.collaborationMode),
        tool_choice: "auto",
        parallel_tool_calls: true,
        ...(maxOutputTokens ? { max_tokens: maxOutputTokens } : {}),
        ...(options.reasoning !== "none" ? { reasoning: { effort: openRouterReasoningEffort(options.reasoning), exclude: false } } : {}),
        stream: true,
        stream_options: { include_usage: true },
        temperature: 0.35,
      }),
      signal: options.signal,
    });

    let response = await request(options.maxOutputTokens);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      const affordability = response.status === 402
        ? parseOpenRouterAffordableOutputTokens(errorText)
        : undefined;
      const affordableOutputTokens = affordability?.affordable;
      if (
        options.maxOutputTokens
        && affordableOutputTokens
        && affordableOutputTokens >= 1
        && affordableOutputTokens < options.maxOutputTokens
      ) {
        response = await request(affordableOutputTokens);
      } else {
        throw new Error(normalizeOpenRouterError(errorText || `OpenRouter request failed with ${response.status}`));
      }
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(normalizeOpenRouterError(errorText || `OpenRouter request failed with ${response.status}`));
    }

    const buffers = new Map<number, { id?: string; name?: string; argumentsText: string }>();
    const emitted = new Set<string>();

    const emitBufferedCall = (value: { id?: string; name?: string; argumentsText: string }) => {
      const key = value.id || `${value.name}:${value.argumentsText}`;
      if (emitted.has(key)) return;
      const call = parseDesktopToolCall(value.name, value.argumentsText, value.id);
      if (!call) return;
      emitted.add(key);
      options.onToolCall(call);
    };

    const flush = () => {
      for (const value of buffers.values()) {
        emitBufferedCall(value);
      }
      buffers.clear();
    };

    await readSse(response, (_event, dataLine) => {
      const data = JSON.parse(dataLine);
      if (data?.error) throw new Error(normalizeOpenRouterError(typeof data.error === "string" ? data.error : JSON.stringify(data.error)));
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
        emitBufferedCall(next);
      });

      if (choice.finish_reason === "tool_calls" || choice.message?.tool_calls) flush();
    });

    if (buffers.size > 0) flush();
  }
}
