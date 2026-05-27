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

    if (message.content || textParts.length > 0 || imageParts.length > 0) {
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
        model: options.model,
        instructions: options.systemInstruction,
        input: toInput(options.messages),
        tools: desktopToolDefinitions,
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

    let currentName = "";
    let currentId = "";
    let argumentBuffer = "";
    const emitted = new Set<string>();
    const emit = (name: string, args: string, id?: string) => {
      const key = id || `${name}:${args}`;
      if (emitted.has(key)) return;
      emitted.add(key);
      const call = parseDesktopToolCall(name, args, id);
      if (call) options.onToolCall(call);
    };

    await readSse(response, (event, dataLine) => {
      try {
        const data = JSON.parse(dataLine);
        const itemName = data?.item?.name || data?.output_item?.name || data?.name;
        if (typeof itemName === "string" && itemName.startsWith("desktop_")) currentName = itemName;
        const itemId = data?.item?.call_id || data?.output_item?.call_id || data?.call_id || data?.item?.id || data?.output_item?.id || data?.id;
        if (typeof itemId === "string") currentId = itemId;

        const text = textDelta(event, data);
        if (text) options.onTextDelta(text);
        const thought = thoughtDelta(event, data);
        if (thought) options.onThoughtDelta(thought);

        const type = `${event || ""} ${data?.type || ""}`;
        if (type.includes("function_call_arguments.delta") && typeof data?.delta === "string") {
          argumentBuffer += data.delta;
          const draft = parsePartialDesktopToolCall(currentName, argumentBuffer);
          if (draft) options.onToolDraft({ ...draft, id: currentId || undefined });
        }
        const completed = completedFunctionCall(event, data);
        if (completed) {
          emit(completed.name, completed.argumentsText, completed.id);
          argumentBuffer = "";
          currentName = "";
          currentId = "";
        } else if (argumentBuffer && type.includes("function_call_arguments.done")) {
          emit(currentName, argumentBuffer, currentId || undefined);
          argumentBuffer = "";
          currentName = "";
          currentId = "";
        }
      } catch {
        if (!event || event.includes("output_text")) options.onTextDelta(dataLine);
      }
    });
  }
}
