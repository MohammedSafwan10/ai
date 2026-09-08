import { openRouterDesktopTools, parseDesktopToolCall, parsePartialDesktopToolCall } from "../tools/definitions";
import type { ProviderAdapter, ProviderMessage, ProviderStreamOptions } from "./types";
import { readSse } from "./sse";
import { normalizeProviderUsage } from "./usage";
import type { ReasoningEffort } from "../../../shared/models";

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_CHAT_COMPLETIONS_URL = `${DEEPSEEK_BASE_URL}/chat/completions`;

// Temporary internal test model. Expires Sept 10, 2026. New arch, faster,
// natively multimodal. Pricing = same as deepseek-v4-flash.
export const DEEPSEEK_V41_FLASH_EXP_MODEL_ID = "deepseek-v4.1-flash-expires-on-0910";
export const DEEPSEEK_V4_FLASH_VISION_EXP_MODEL_ID = "deepseek-v4-flash-vision-exp";

export const deepSeekThinkingConfig = (effort: ReasoningEffort) => {
  if (effort === "none") return { thinking: { type: "disabled" as const } };
  // DeepSeek docs use reasoning_effort: "high" with thinking.type "enabled".
  // Map our xhigh -> high (DeepSeek max), minimal/low/medium pass through.
  const reasoning_effort =
    effort === "xhigh" ? "high" : effort === "minimal" ? "low" : effort === "max" ? "high" : effort;
  return { thinking: { type: "enabled" as const }, reasoning_effort };
};

const getDeepSeekErrorMessage = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed);
    return String(parsed?.error?.message || parsed?.message || trimmed);
  } catch {
    return trimmed;
  }
};

export const normalizeDeepSeekError = (value: string, status?: number) => {
  const message = getDeepSeekErrorMessage(value);
  if (!message) return `DeepSeek request failed${status ? ` with ${status}` : ""}.`;
  if (status === 401 || /invalid api key|api key not valid|unauthorized|authentication/i.test(message)) {
    return "DeepSeek rejected the saved API key. Replace it in Settings > Providers with a valid DeepSeek platform key.";
  }
  if (status === 402 || /insufficient balance|top ?up|arrear|out of credit|quota/i.test(message)) {
    return `DeepSeek refused the request for billing reasons. Top up at platform.deepseek.com. (${message})`;
  }
  if (/model.*not (found|exist)|does not exist|invalid model|model_not_found/i.test(message)) {
    return `DeepSeek does not recognize this model for your key. The temp model ${DEEPSEEK_V41_FLASH_EXP_MODEL_ID} expires Sept 10, 2026 — after that it returns 404. (${message})`;
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

export class DeepSeekAdapter implements ProviderAdapter {
  async stream(options: ProviderStreamOptions): Promise<void> {
    if (!options.deepseekApiKey) {
      throw new Error("DeepSeek API key is not configured in desktop settings.");
    }

    const response = await fetch(DEEPSEEK_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Authorization: `Bearer ${options.deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages: toMessages(options.systemInstruction, options.messages),
        ...(!options.disableTools ? {
          tools: openRouterDesktopTools(options.collaborationMode),
          tool_choice: "auto",
          parallel_tool_calls: true,
        } : {}),
        ...(options.maxOutputTokens ? { max_tokens: options.maxOutputTokens } : {}),
        ...deepSeekThinkingConfig(options.reasoning),
        stream: true,
        stream_options: { include_usage: true },
        temperature: 0.35,
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(normalizeDeepSeekError(errorText || `DeepSeek request failed with ${response.status}`, response.status));
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
      if (data?.error) throw new Error(normalizeDeepSeekError(typeof data.error === "string" ? data.error : JSON.stringify(data.error)));
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
    }, options.onStreamProgress);

    if (buffers.size > 0) flush();
  }
}
