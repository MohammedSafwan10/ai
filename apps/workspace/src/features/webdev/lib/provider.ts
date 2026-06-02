import { getOpenRouterModelCapabilities, getOpenRouterReasoningEffort, modelSupportsOpenRouterParameter } from "../../../lib/openrouter/models";
import { normalizeProviderErrorMessage } from "../../../lib/providerErrors";
import {
  geminiWebDevFunctionDeclarations,
  openRouterWebDevTools,
  parsePartialWebDevToolCall,
  parseWebDevToolCall,
  webDevToolDefinitions,
} from "./tools";
import type { WebDevProviderMessage, WebDevProviderOptions } from "./types";
import type { Attachment } from "../../../lib/attachments";

const getCliproxyApiKey = () =>
  ((import.meta as any).env?.VITE_CLIPROXY_API_KEY as string | undefined) || "dummy-key";

const isSupportedCliproxyVisionImage = (attachment: Attachment) =>
  ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(attachment.mimeType);

const toDataUrl = (attachment: Attachment) =>
  `data:${attachment.mimeType || "application/octet-stream"};base64,${attachment.base64}`;

const toCliproxyWebDevInput = (userPrompt: string, attachments: Attachment[] = []) => {
  const content: Array<Record<string, unknown>> = [{ type: "input_text", text: userPrompt }];
  attachments.forEach((attachment) => {
    if (isSupportedCliproxyVisionImage(attachment)) {
      content.push({ type: "input_image", image_url: toDataUrl(attachment), detail: "auto" });
      return;
    }
    content.push({ type: "input_file", filename: attachment.name, file_data: toDataUrl(attachment) });
  });
  return content;
};

const toCliproxyInput = (messages: WebDevProviderMessage[], attachments: Attachment[] = []) => {
  const input: Array<Record<string, unknown>> = [];
  messages.forEach((message, messageIndex) => {
    const parts = message.parts || [];
    const functionCalls = parts.filter(part => part.type === "function_call");
    const functionResponses = parts.filter(part => part.type === "function_response");
    const textParts = parts.filter(part => part.type === "text" || part.type === "image" || part.type === "file");

    if (message.content || textParts.length > 0) {
      const content: Array<Record<string, unknown>> = [];
      if (message.content) {
        content.push({
          type: message.role === "assistant" ? "output_text" : "input_text",
          text: message.content,
        });
      }
      textParts.forEach(part => {
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
        output: JSON.stringify(part.response || {}),
      });
    });

    if (messageIndex === messages.length - 1 && attachments.length > 0 && parts.length === 0) {
      input.push({ role: "user", content: toCliproxyWebDevInput("", attachments) });
    }
  });
  return input;
};

const toOpenRouterMessages = (systemInstruction: string, messages: WebDevProviderMessage[]) => {
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
          content: JSON.stringify(part.response || {}),
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

const toGeminiContents = (messages: WebDevProviderMessage[]) =>
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
        if (part.type === "function_response") parts.push({ functionResponse: { name: part.name, response: part.response || {} } });
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
    return normalizeProviderErrorMessage(parsed?.error?.message || parsed?.message || value);
  } catch {
    return normalizeProviderErrorMessage(value);
  }
};

const extractCliproxyErrorMessage = (value: string) => {
  try {
    const parsed = JSON.parse(value);
    const message = parsed?.error?.message || parsed?.message || value;
    const code = parsed?.error?.code || parsed?.code || "";
    if (
      code === "auth_unavailable" ||
      /auth_unavailable|invalidated oauth token|no auth available/i.test(String(message))
    ) {
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
  if (typeof data?.delta === "string" && (event?.includes("reasoning") || data?.type?.includes?.("reasoning"))) {
    return data.delta;
  }
  if (typeof data?.text === "string" && data?.type === "summary_text") {
    return data.text;
  }
  if (typeof data?.part?.text === "string" && data?.part?.type === "summary_text") {
    return data.part.text;
  }
  const summaryCandidates = [
    data?.summary,
    data?.item?.summary,
    data?.output_item?.summary,
    ...(Array.isArray(data?.response?.output) ? data.response.output.map((item: any) => item?.summary) : []),
  ];
  for (const summary of summaryCandidates) {
    if (!Array.isArray(summary)) continue;
    const text = summary
      .map((item: any) => item?.text || item?.content)
      .filter(Boolean)
      .join("");
    if (text) return text;
  }
  return "";
};

const findCompletedFunctionCall = (event: string | undefined, data: any) => {
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
    (candidate?.name?.startsWith?.("webdev_") || candidate?.type === "function_call")
  );
  const name = item?.name || data?.name;
  const argumentsText = item?.arguments || data?.arguments;
  if (!type.includes("function_call") && item?.type !== "function_call") return null;
  if (typeof name !== "string" || !name.startsWith("webdev_")) return null;
  if (typeof argumentsText !== "string") return null;
  return { id: item?.call_id || data?.call_id || item?.id || data?.id, name, argumentsText };
};

async function streamCliproxyWebDevResponse({
  model,
  systemInstruction,
  providerMessages,
  maxOutputTokens,
  attachments = [],
  reasoningEnabled,
  signal,
  onTextDelta,
  onThoughtDelta,
  onToolDelta,
  onToolCall,
}: WebDevProviderOptions) {
  const response = await fetch("/cliproxy/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getCliproxyApiKey()}`,
    },
    body: JSON.stringify({
      model,
      instructions: systemInstruction,
      input: toCliproxyInput(providerMessages, attachments),
      tools: webDevToolDefinitions,
      ...(maxOutputTokens ? { max_output_tokens: maxOutputTokens } : {}),
      ...(reasoningEnabled ? { reasoning: { effort: "medium", summary: "auto" } } : {}),
      stream: true,
      temperature: 0.45,
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text().catch(() => "");
    throw new Error(extractCliproxyErrorMessage(errorText) || `CLIProxy Web Dev request failed with ${response.status}`);
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
    const call = parseWebDevToolCall(name, argumentsText, id);
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
        if (typeof itemName === "string" && itemName.startsWith("webdev_")) {
          currentFunctionName = itemName;
        }
        const itemCallId = data?.item?.call_id || data?.output_item?.call_id || data?.call_id || data?.item?.id || data?.output_item?.id || data?.id;
        if (typeof itemCallId === "string") {
          currentFunctionCallId = itemCallId;
        }

        const textDelta = extractCliproxyTextDelta(event, data);
        if (textDelta) onTextDelta(textDelta);
        const thoughtDelta = extractCliproxyThoughtDelta(event, data);
        if (thoughtDelta) onThoughtDelta(thoughtDelta);

        const type = `${event || ""} ${data?.type || ""}`;
        if (type.includes("function_call_arguments.delta") && typeof data?.delta === "string") {
          argumentBuffer += data.delta;
          const draft = parsePartialWebDevToolCall(currentFunctionName, argumentBuffer);
          if (draft) onToolDelta(draft);
        }

        const completed = findCompletedFunctionCall(event, data);
        if (completed) {
          emitToolCallOnce(completed.name, completed.argumentsText, (completed as any).id || (completed as any).call_id);
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
    buffer += decoder.decode(value, { stream: true });
    const split = splitSseEvents(buffer);
    buffer = split.remaining;
    split.events.forEach(flushEvent);
  }
  if (buffer.trim()) flushEvent(buffer);
}

const getOpenRouterChoice = (data: any) => data?.choices?.[0] || {};

const extractOpenRouterThoughtDelta = (data: any) => {
  const delta = getOpenRouterChoice(data)?.delta || {};
  return delta.reasoning || delta.reasoning_content || delta.thought || "";
};

async function streamOpenRouterWebDevResponse({
  model,
  systemInstruction,
  providerMessages,
  maxOutputTokens,
  attachments = [],
  reasoningEnabled,
  signal,
  onTextDelta,
  onThoughtDelta,
  onToolDelta,
  onToolCall,
}: WebDevProviderOptions) {
  const capabilities = getOpenRouterModelCapabilities(model);
  if (attachments.length > 0) {
    throw new Error("OpenRouter Web Dev is text-only here. Remove attachments or switch to Gemini/GPT for files and screenshots.");
  }
  if (!capabilities?.supportsTools) {
    throw new Error("This OpenRouter model does not advertise tool support, so it cannot safely run Web Dev edits.");
  }

  const response = await fetch("/api/openrouter/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: toOpenRouterMessages(systemInstruction, providerMessages),
      tools: openRouterWebDevTools,
      ...(maxOutputTokens && modelSupportsOpenRouterParameter(model, "max_tokens") ? { max_tokens: maxOutputTokens } : {}),
      ...(capabilities.supportsToolChoice ? { tool_choice: "auto" } : {}),
      ...(capabilities.supportsReasoning && reasoningEnabled ? { reasoning: { effort: getOpenRouterReasoningEffort(model), exclude: false } } : {}),
      ...(reasoningEnabled && modelSupportsOpenRouterParameter(model, "include_reasoning") ? { include_reasoning: true } : {}),
      ...(modelSupportsOpenRouterParameter(model, "temperature") ? { temperature: 0.45 } : {}),
      stream: true,
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text().catch(() => "");
    throw new Error(extractOpenRouterErrorMessage(errorText) || `OpenRouter Web Dev request failed with ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const toolBuffers = new Map<number, { id?: string; name?: string; argumentsText: string }>();
  const emittedToolCallKeys = new Set<string>();

  const handleToolCallDelta = (toolCall: any, fallbackIndex: number) => {
    const index = Number.isFinite(Number(toolCall?.index)) ? Number(toolCall.index) : fallbackIndex;
    const previous = toolBuffers.get(index) || { argumentsText: "" };
    const name = toolCall?.function?.name || previous.name;
    const id = toolCall?.id || previous.id;
    const nextArguments = previous.argumentsText + (toolCall?.function?.arguments || "");
    toolBuffers.set(index, { id, name, argumentsText: nextArguments });
    const draft = parsePartialWebDevToolCall(name, nextArguments);
    if (draft) onToolDelta(draft);
  };

  const flushCompletedToolCalls = () => {
    for (const value of toolBuffers.values()) {
      const key = value.id || `${value.name}:${value.argumentsText}`;
      if (emittedToolCallKeys.has(key)) continue;
      emittedToolCallKeys.add(key);
      const call = parseWebDevToolCall(value.name, value.argumentsText, value.id);
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
      if (choice?.finish_reason === "tool_calls" || choice?.message?.tool_calls) flushCompletedToolCalls();
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const split = splitSseEvents(buffer);
    buffer = split.remaining;
    split.events.forEach(event => {
      if (event.trim() && !event.trim().startsWith(":")) flushEvent(event);
    });
  }
  if (buffer.trim() && !buffer.trim().startsWith(":")) flushEvent(buffer);
  if (toolBuffers.size > 0) flushCompletedToolCalls();
}

async function streamGeminiWebDevResponse({
  model,
  systemInstruction,
  providerMessages,
  maxOutputTokens,
  attachments = [],
  reasoningEnabled,
  signal,
  onTextDelta,
  onThoughtDelta,
  onToolCall,
}: WebDevProviderOptions) {
  const response = await fetch("/api/gemini/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      contents: toGeminiContents(providerMessages),
      systemInstruction,
      thinkingEnabled: reasoningEnabled,
      webSearchEnabled: false,
      artifactToolsEnabled: false,
      functionDeclarations: geminiWebDevFunctionDeclarations,
      maxOutputTokens,
      temperature: 0.45,
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error || `Gemini Web Dev request failed with ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flushLine = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "text") onTextDelta(event.text || "");
    if (event.type === "thought") onThoughtDelta(event.text || "");
    if (event.type === "toolCall") {
      const call = event.name && event.payload ? { name: event.name, arguments: event.payload } : null;
      if (call) {
        const normalized = parseWebDevToolCall(call.name, JSON.stringify(call.arguments), `gemini_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
        if (normalized) onToolCall({ ...normalized, thoughtSignature: event.thoughtSignature });
      }
    }
    if (event.type === "error") throw new Error(event.error || "Gemini Web Dev stream failed.");
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    lines.forEach(flushLine);
  }
  if (buffer.trim()) flushLine(buffer);
}

export async function streamWebDevResponse(options: WebDevProviderOptions) {
  if (options.provider === "cliproxy") return streamCliproxyWebDevResponse(options);
  if (options.provider === "openrouter") return streamOpenRouterWebDevResponse(options);
  return streamGeminiWebDevResponse(options);
}
