import type { ChatMessageRecord } from "../db";

interface StreamGeminiResponseOptions {
  model: string;
  contents: Array<Record<string, unknown>>;
  systemInstruction: string;
  thinkingEnabled: boolean;
  webSearchEnabled: boolean;
  signal: AbortSignal;
  onTextDelta: (delta: string) => void;
  onThoughtDelta: (delta: string) => void;
  onWebSearch: (event: { status: "searched"; queries?: string[] }) => void;
}

export const toGeminiContents = (messages: ChatMessageRecord[]) =>
  messages.map((message) => {
    const parts: Array<Record<string, unknown>> = [];

    if (message.content) {
      parts.push({ text: message.content });
    }

    if (message.role === "model") {
      return {
        role: "model",
        parts: parts.length > 0 ? parts : [{ text: "" }],
      };
    }

    message.attachments?.forEach((attachment) => {
      parts.push({
        inlineData: {
          data: attachment.base64,
          mimeType: attachment.mimeType,
        },
      });
    });

    return {
      role: message.role === "user" ? "user" : "model",
      parts: parts.length > 0 ? parts : [{ text: "" }],
    };
  });

export async function streamGeminiResponse({
  model,
  contents,
  systemInstruction,
  thinkingEnabled,
  webSearchEnabled,
  signal,
  onTextDelta,
  onThoughtDelta,
  onWebSearch,
}: StreamGeminiResponseOptions) {
  const response = await fetch("/api/gemini/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      contents,
      systemInstruction,
      thinkingEnabled,
      webSearchEnabled,
      temperature: 0.85,
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error || `Gemini request failed with ${response.status}`);
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
      | { type: "error"; error: string };

    if (event.type === "text") onTextDelta(event.text);
    if (event.type === "thought") onThoughtDelta(event.text);
    if (event.type === "webSearch") onWebSearch({ status: event.status, queries: event.queries });
    if (event.type === "error") throw new Error(event.error);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(flushLine);
  }

  if (buffer.trim()) {
    flushLine(buffer);
  }
}

export async function generateGeminiTitle(model: string, contents: string) {
  const response = await fetch("/api/gemini/title", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, contents }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error || `Gemini title request failed with ${response.status}`);
  }

  const data = (await response.json()) as { text?: string };
  return data.text || "";
}
