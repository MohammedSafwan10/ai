import {
  desktopToolDefinitions,
  parseDesktopToolCall,
  parsePartialDesktopToolCall,
} from "../tools/definitions";
import type { ProviderAdapter, ProviderMessage, ProviderStreamOptions } from "./types";
import { readSse } from "./sse";

const responseReasoningEffort = (effort: ProviderStreamOptions["reasoning"]) =>
  effort === "extra_high" ? "high" : effort;

const toInput = (messages: ProviderMessage[]) => {
  const input: Array<Record<string, unknown>> = [];
  messages.forEach((message) => {
    const parts = message.parts || [];
    const functionCalls = parts.filter((part) => part.type === "function_call");
    const functionResponses = parts.filter((part) => part.type === "function_response");
    const textParts = parts.filter((part) => part.type === "text");
    const imageParts = parts.filter((part) => part.type === "image");

    if (message.content || textParts.length > 0 || imageParts.length > 0 || (message.role === "assistant" && functionCalls.length > 0)) {
      const contentParts: Array<Record<string, unknown>> = [];
      const text = message.content || textParts.map((part) => part.text).join("\n") || "";
      if (text || imageParts.length === 0) {
        contentParts.push({
          type: message.role === "assistant" ? "output_text" : "input_text",
          text,
        });
      }
      if (message.role === "user") {
        imageParts.forEach((part) => {
          contentParts.push({
            type: "input_image",
            image_url: dataUrl(part.mimeType, part.data),
            detail: "auto",
          });
        });
      }
      input.push({
        role: message.role === "assistant" ? "assistant" : "user",
        content: contentParts,
      });
    }

    functionCalls.forEach((part) => {
      input.push({
        type: "function_call",
        call_id: part.id,
        name: part.name,
        arguments: JSON.stringify(part.arguments || {}),
      });
    });

    functionResponses.forEach((part) => {
      input.push({
        type: "function_call_output",
        call_id: part.id,
        output: JSON.stringify(part.response || {}),
      });
    });
  });
  return input;
};

const dataUrl = (mimeType: string, base64: string) => `data:${mimeType};base64,${base64}`;

const textDelta = (event: string | undefined, data: any) => {
  if (typeof data?.delta === "string" && event?.includes("output_text")) return data.delta;
  if (typeof data?.choices?.[0]?.delta?.content === "string") return data.choices[0].delta.content;
  if (typeof data?.message?.content === "string") return data.message.content;
  return "";
};

const thoughtDelta = (event: string | undefined, data: any) => {
  if (typeof data?.delta === "string" && (event?.includes("reasoning") || data?.type?.includes?.("reasoning"))) return data.delta;
  if (typeof data?.text === "string" && data?.type === "summary_text") return data.text;
  return "";
};

const completedFunctionCall = (event: string | undefined, data: any) => {
  const type = `${event || ""} ${data?.type || ""}`;
  const candidates = [
    data?.item,
    data?.output_item,
    data,
    ...(Array.isArray(data?.response?.output) ? data.response.output : []),
  ];
  const item = candidates.find((candidate) =>
    candidate &&
    typeof candidate?.arguments === "string" &&
    (candidate?.name?.startsWith?.("desktop_") || candidate?.type === "function_call")
  );
  const name = item?.name || data?.name;
  const argumentsText = item?.arguments || data?.arguments;
  if (!type.includes("function_call") && item?.type !== "function_call") return null;
  if (typeof name !== "string" || !name.startsWith("desktop_")) return null;
  if (typeof argumentsText !== "string") return null;
  return { id: item?.call_id || data?.call_id || item?.id || data?.id, name, argumentsText };
};

export class CliproxyAdapter implements ProviderAdapter {
  async stream(options: ProviderStreamOptions): Promise<void> {
    const response = await fetch(`${options.cliproxyBaseUrl.replace(/\/$/, "")}/v1/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer dummy-key",
      },
      body: JSON.stringify({
        model: options.model === "gemini-3.5-flash-cliproxy"
          ? "gemini-3-flash-agent"
          : options.model === "gemini-3.1-pro-cliproxy"
          ? "gemini-pro-agent"
          : options.model,
        instructions: options.systemInstruction,
        input: toInput(options.messages),
        tools: desktopToolDefinitions,
        parallel_tool_calls: true,
        ...(options.reasoning !== "none" ? { reasoning: { effort: responseReasoningEffort(options.reasoning), summary: "auto" } } : {}),
        stream: true,
        temperature: 0.35,
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(errorText || `CLIProxy request failed with ${response.status}`);
    }

    const buffers = new Map<string, { id?: string; name?: string; argumentsText: string }>();
    const emitted = new Set<string>();
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
      try {
        const data = JSON.parse(dataLine);
        const key = keyFor(data);
        const previous = buffers.get(key) || { argumentsText: "" };
        const itemName = data?.item?.name || data?.output_item?.name || data?.name;
        const name = typeof itemName === "string" && itemName.startsWith("desktop_")
          ? itemName
          : previous.name;
        const itemId = data?.item?.call_id || data?.output_item?.call_id || data?.call_id || data?.item?.id || data?.output_item?.id || data?.id;
        const id = typeof itemId === "string" ? itemId : previous.id;
        if (name || id || previous.argumentsText) {
          buffers.set(key, { ...previous, name, id });
        }

        const text = textDelta(event, data);
        if (text) options.onTextDelta(text);
        const thought = thoughtDelta(event, data);
        if (thought) options.onThoughtDelta(thought);

        const type = `${event || ""} ${data?.type || ""}`;
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
        const completed = completedFunctionCall(event, data);
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
      } catch {
        if (!event || event.includes("output_text")) options.onTextDelta(dataLine);
      }
    });
  }
}
