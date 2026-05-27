import { openRouterDesktopTools, parseDesktopToolCall, parsePartialDesktopToolCall } from "../tools/definitions";
import type { ProviderAdapter, ProviderMessage, ProviderStreamOptions } from "./types";
import { readSse } from "./sse";

const openRouterReasoningEffort = (effort: ProviderStreamOptions["reasoning"]) =>
  effort === "extra_high" ? "high" : effort;

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

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.openRouterApiKey}`,
        "X-Title": "Privora Desktop",
      },
      body: JSON.stringify({
        model: options.model,
        messages: toMessages(options.systemInstruction, options.messages),
        tools: openRouterDesktopTools,
        tool_choice: "auto",
        parallel_tool_calls: false,
        ...(options.reasoning !== "none" ? { reasoning: { effort: openRouterReasoningEffort(options.reasoning), exclude: false } } : {}),
        stream: true,
        temperature: 0.35,
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(errorText || `OpenRouter request failed with ${response.status}`);
    }

    const buffers = new Map<number, { id?: string; name?: string; argumentsText: string }>();
    const emitted = new Set<string>();

    const flush = () => {
      for (const value of buffers.values()) {
        const key = value.id || `${value.name}:${value.argumentsText}`;
        if (emitted.has(key)) continue;
        emitted.add(key);
        const call = parseDesktopToolCall(value.name, value.argumentsText, value.id);
        if (call) options.onToolCall(call);
      }
      buffers.clear();
    };

    await readSse(response, (_event, dataLine) => {
      const data = JSON.parse(dataLine);
      if (data?.error) throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
      const choice = data?.choices?.[0] || {};
      const delta = choice.delta || {};
      if (typeof delta.content === "string") options.onTextDelta(delta.content);
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
        buffers.set(index, { id, name, argumentsText: nextArguments });
        const draft = parsePartialDesktopToolCall(name, nextArguments);
        if (draft) options.onToolDraft({ ...draft, id });
      });

      if (choice.finish_reason === "tool_calls" || choice.message?.tool_calls) flush();
    });

    if (buffers.size > 0) flush();
  }
}
