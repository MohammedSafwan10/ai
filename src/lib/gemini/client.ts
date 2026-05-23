import type { ChatMessageRecord } from "../db";
import { normalizeArtifactPayload, type ArtifactPayload } from "../artifacts";
import { appLogger } from "../logger";

interface StreamGeminiResponseOptions {
  model: string;
  contents: Array<Record<string, unknown>>;
  systemInstruction: string;
  thinkingEnabled: boolean;
  webSearchEnabled: boolean;
  artifactToolsEnabled: boolean;
  signal: AbortSignal;
  onTextDelta: (delta: string) => void;
  onThoughtDelta: (delta: string) => void;
  onWebSearch: (event: { status: "searched"; queries?: string[] }) => void;
  onArtifactToolCall: (payload: ArtifactPayload) => void;
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
  artifactToolsEnabled,
  signal,
  onTextDelta,
  onThoughtDelta,
  onWebSearch,
  onArtifactToolCall,
}: StreamGeminiResponseOptions) {
  const startedAt = Date.now();
  let chunkCount = 0;
  let eventCount = 0;
  let textEventCount = 0;
  let thoughtEventCount = 0;
  let webSearchEventCount = 0;
  let artifactToolEventCount = 0;
  let firstChunkMs: number | undefined;

  appLogger.debug("Gemini stream request started", {
    model,
    contentTurns: contents.length,
    thinkingEnabled,
    webSearchEnabled,
    artifactToolsEnabled,
  });

  const response = await fetch("/api/gemini/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      contents,
      systemInstruction,
      thinkingEnabled,
      webSearchEnabled,
      artifactToolsEnabled,
      temperature: 0.85,
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    const errorBody = await response.json().catch(() => null);
    appLogger.error("Gemini stream request rejected", {
      model,
      status: response.status,
      durationMs: Date.now() - startedAt,
      error: errorBody?.error,
    });
    throw new Error(errorBody?.error || `Gemini request failed with ${response.status}`);
  }

  appLogger.debug("Gemini stream response opened", {
    model,
    status: response.status,
    contentType: response.headers.get("content-type"),
    durationMs: Date.now() - startedAt,
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flushLine = (line: string) => {
    if (!line.trim()) return;
    eventCount += 1;
    const event = JSON.parse(line) as
      | { type: "text"; text: string }
      | { type: "thought"; text: string }
      | { type: "webSearch"; status: "searched"; queries?: string[] }
      | { type: "artifactToolCall"; payload: unknown }
      | { type: "error"; error: string };

    if (event.type === "text") {
      textEventCount += 1;
      onTextDelta(event.text);
    }
    if (event.type === "thought") {
      thoughtEventCount += 1;
      onThoughtDelta(event.text);
    }
    if (event.type === "webSearch") {
      webSearchEventCount += 1;
      onWebSearch({ status: event.status, queries: event.queries });
    }
    if (event.type === "artifactToolCall") {
      artifactToolEventCount += 1;
      const payload = normalizeArtifactPayload(event.payload);
      if (payload) onArtifactToolCall(payload);
    }
    if (event.type === "error") throw new Error(event.error);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunkCount += 1;
    firstChunkMs ??= Date.now() - startedAt;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(flushLine);
  }

  if (buffer.trim()) {
    flushLine(buffer);
  }

  appLogger.debug("Gemini stream completed", {
    model,
    durationMs: Date.now() - startedAt,
    firstChunkMs,
    chunkCount,
    eventCount,
    textEventCount,
    thoughtEventCount,
    webSearchEventCount,
    artifactToolEventCount,
  });
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
