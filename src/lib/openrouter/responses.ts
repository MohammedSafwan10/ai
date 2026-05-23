import { artifactToolDefinition, parseArtifactToolArguments, parsePartialArtifactToolArguments, type ArtifactDraftPayload, type ArtifactPayload } from "../artifacts";
import { appLogger } from "../logger";
import { getOpenRouterModelCapabilities, getOpenRouterReasoningEffort, modelSupportsOpenRouterParameter } from "./models";

export interface OpenRouterMessage {
  role: "user" | "model";
  content: string;
}

interface StreamOpenRouterResponseOptions {
  model: string;
  instructions: string;
  history: OpenRouterMessage[];
  reasoningEnabled: boolean;
  webSearchEnabled: boolean;
  webSearchRequired?: boolean;
  artifactToolsEnabled?: boolean;
  signal: AbortSignal;
  onTextDelta: (delta: string) => void;
  onThoughtDelta: (delta: string) => void;
  onWebSearch?: (event: { status: "searching" | "searched"; queries?: string[] }) => void;
  onArtifactToolDelta?: (payload: ArtifactDraftPayload) => void;
  onArtifactToolCall?: (payload: ArtifactPayload) => void;
}

interface GenerateOpenRouterArtifactSummaryOptions {
  model: string;
  userRequest: string;
  artifact: {
    title: string;
    kind: string;
    status?: string;
  };
  operation: "create" | "update";
  signal: AbortSignal;
}

const toOpenRouterMessages = (instructions: string, history: OpenRouterMessage[]) => [
  ...(instructions ? [{ role: "system" as const, content: instructions }] : []),
  ...history.map(message => ({
    role: message.role === "model" ? "assistant" as const : "user" as const,
    content: message.content || "",
  })),
];

const artifactToolForChatCompletions = {
  type: "function",
  function: {
    name: artifactToolDefinition.name,
    description: artifactToolDefinition.description,
    parameters: artifactToolDefinition.parameters,
  },
} as const;

const getChoice = (data: any) => data?.choices?.[0] || {};

const extractTextDelta = (data: any) => {
  const choice = getChoice(data);
  const delta = choice?.delta || {};
  if (typeof delta.content === "string") return delta.content;
  if (typeof data?.delta === "string") return data.delta;
  return "";
};

const extractThoughtDelta = (data: any) => {
  const choice = getChoice(data);
  const delta = choice?.delta || {};
  const reasoningDetails = Array.isArray(delta.reasoning_details) ? delta.reasoning_details : [];
  const candidates = [
    delta.reasoning,
    delta.reasoning_content,
    delta.reasoningContent,
    delta.thought,
    ...reasoningDetails.flatMap((detail: any) => [
      detail?.text,
      detail?.summary,
      detail?.content,
    ]),
    data?.reasoning,
    data?.reasoning_content,
  ];
  return candidates.find((value): value is string => typeof value === "string" && value.length > 0) || "";
};

const extractResponseText = (data: any): string => {
  if (typeof data?.output_text === "string") return data.output_text;
  if (typeof data?.text === "string") return data.text;
  if (typeof data?.message?.content === "string") return data.message.content;
  if (Array.isArray(data?.choices)) {
    return data.choices
      .map((choice: any) => choice?.message?.content || choice?.text || "")
      .filter(Boolean)
      .join("\n");
  }
  return "";
};

const extractOpenRouterErrorMessage = (value: string) => {
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed?.error === "string") {
      return extractOpenRouterErrorMessage(parsed.error);
    }
    const candidates = [
      parsed?.error?.message,
      parsed?.error?.error?.message,
      parsed?.message,
    ];
    return candidates.find((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0) || value;
  } catch {
    return value;
  }
};

const splitSseEvents = (buffer: string) => {
  const events: string[] = [];
  const delimiter = /\r?\n\r?\n/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = delimiter.exec(buffer))) {
    events.push(buffer.slice(cursor, match.index));
    cursor = delimiter.lastIndex;
  }

  return {
    events,
    remaining: buffer.slice(cursor),
  };
};

const hasOpenRouterWebSearchSignal = (data: any) => {
  const choice = getChoice(data);
  const delta = choice?.delta || {};
  const message = choice?.message || {};
  const usage = data?.usage || {};
  const serverToolUse = usage?.server_tool_use || data?.server_tool_use || {};
  const webSearchRequests =
    Number(serverToolUse?.web_search_requests || usage?.web_search_requests || data?.web_search_requests || 0);

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

const buildOpenRouterBody = ({
  model,
  instructions,
  history,
  reasoningEnabled,
  webSearchEnabled,
  webSearchRequired,
  artifactToolsEnabled,
  stream,
}: {
  model: string;
  instructions: string;
  history: OpenRouterMessage[];
  reasoningEnabled: boolean;
  webSearchEnabled: boolean;
  webSearchRequired?: boolean;
  artifactToolsEnabled?: boolean;
  stream: boolean;
}) => {
  const capabilities = getOpenRouterModelCapabilities(model);
  const body: Record<string, unknown> = {
    model,
    messages: toOpenRouterMessages(instructions, history),
    stream,
  };

  if (stream && webSearchEnabled) {
    body.stream_options = { include_usage: true };
  }

  if (modelSupportsOpenRouterParameter(model, "temperature")) {
    body.temperature = stream ? 0.85 : 0.25;
  }

  if (capabilities?.supportsReasoning && reasoningEnabled) {
    body.reasoning = { effort: getOpenRouterReasoningEffort(model), exclude: false };
    if (reasoningEnabled && modelSupportsOpenRouterParameter(model, "include_reasoning")) {
      body.include_reasoning = true;
    }
  }

  const tools: unknown[] = [];
  if (capabilities?.supportsTools && webSearchEnabled) {
    tools.push({
      type: "openrouter:web_search",
      parameters: {
        max_results: 5,
        max_total_results: 12,
      },
    });
  }
  if (capabilities?.supportsTools && artifactToolsEnabled) {
    tools.push(artifactToolForChatCompletions);
  }
  if (tools.length > 0) {
    body.tools = tools;
    if (capabilities?.supportsToolChoice) {
      body.tool_choice = webSearchRequired && webSearchEnabled ? "required" : "auto";
    }
  }

  return body;
};

export async function streamOpenRouterResponse({
  model,
  instructions,
  history,
  reasoningEnabled,
  webSearchEnabled,
  webSearchRequired = false,
  artifactToolsEnabled = false,
  signal,
  onTextDelta,
  onThoughtDelta,
  onWebSearch,
  onArtifactToolDelta,
  onArtifactToolCall,
}: StreamOpenRouterResponseOptions) {
  const startedAt = Date.now();
  let chunkCount = 0;
  let eventCount = 0;
  let textDeltaCount = 0;
  let thoughtDeltaCount = 0;
  let webSearchEventCount = 0;
  let toolDeltaCount = 0;
  let toolCallCount = 0;
  let firstChunkMs: number | undefined;
  const requestBody = buildOpenRouterBody({
    model,
    instructions,
    history,
    reasoningEnabled,
    webSearchEnabled,
    webSearchRequired,
    artifactToolsEnabled,
    stream: true,
  });

  appLogger.debug("OpenRouter stream request started", {
    model,
    historyLength: history.length,
    reasoningEnabled,
    webSearchEnabled,
    webSearchRequired,
    artifactToolsEnabled,
    toolCount: Array.isArray(requestBody.tools) ? requestBody.tools.length : 0,
  });

  const response = await fetch("/api/openrouter/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text().catch(() => "");
    appLogger.error("OpenRouter stream request rejected", {
      model,
      status: response.status,
      durationMs: Date.now() - startedAt,
      errorText,
    });
    throw new Error(extractOpenRouterErrorMessage(errorText) || `OpenRouter request failed with ${response.status}`);
  }

  appLogger.debug("OpenRouter stream response opened", {
    model,
    status: response.status,
    contentType: response.headers.get("content-type"),
    durationMs: Date.now() - startedAt,
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const toolBuffers = new Map<number, { name?: string; argumentsText: string }>();
  let didReportWebSearch = false;

  const flushCompletedToolCalls = () => {
    for (const value of toolBuffers.values()) {
      if (value.name !== artifactToolDefinition.name) continue;
      const parsed = parseArtifactToolArguments(value.argumentsText);
      if (parsed) {
        toolCallCount += 1;
        onArtifactToolCall?.(parsed);
      }
    }
    toolBuffers.clear();
  };

  const handleToolCallDelta = (toolCall: any, fallbackIndex: number) => {
    const index = Number.isFinite(Number(toolCall?.index)) ? Number(toolCall.index) : fallbackIndex;
    const previous = toolBuffers.get(index) || { argumentsText: "" };
    const name = toolCall?.function?.name || previous.name;
    const nextArguments = previous.argumentsText + (toolCall?.function?.arguments || "");
    toolBuffers.set(index, { name, argumentsText: nextArguments });

    if (name === artifactToolDefinition.name) {
      toolDeltaCount += 1;
      const partialArtifact = parsePartialArtifactToolArguments(nextArguments);
      if (partialArtifact) onArtifactToolDelta?.(partialArtifact);
    }
  };

  const flushEvent = (rawEvent: string) => {
    eventCount += 1;
    const dataLines = rawEvent
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.startsWith("data:"))
      .map(line => line.slice("data:".length).trim());

    for (const dataLine of dataLines) {
      if (!dataLine || dataLine === "[DONE]") continue;

      const data = JSON.parse(dataLine);
      if (data?.error) {
        const errorMessage = extractOpenRouterErrorMessage(
          typeof data.error === "string" ? data.error : JSON.stringify(data.error),
        );
        throw new Error(errorMessage || "OpenRouter stream failed.");
      }

      const choice = getChoice(data);
      const delta = choice?.delta || {};
      const finishReason = choice?.finish_reason;
      const thoughtDelta = extractThoughtDelta(data);
      const textDelta = extractTextDelta(data);
      const toolCalls = Array.isArray(delta.tool_calls)
        ? delta.tool_calls
        : Array.isArray(choice?.message?.tool_calls)
          ? choice.message.tool_calls
          : [];

      if (toolCalls.length > 0) {
        toolCalls.forEach(handleToolCallDelta);
      }

      if (thoughtDelta) {
        thoughtDeltaCount += 1;
        onThoughtDelta(thoughtDelta);
      }
      if (textDelta) {
        textDeltaCount += 1;
        onTextDelta(textDelta);
      }

      if (webSearchEnabled && !didReportWebSearch && hasOpenRouterWebSearchSignal(data)) {
        didReportWebSearch = true;
        webSearchEventCount += 1;
        onWebSearch?.({ status: "searched" });
      }

      if (finishReason === "tool_calls" || choice?.message?.tool_calls) {
        flushCompletedToolCalls();
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunkCount += 1;
    firstChunkMs ??= Date.now() - startedAt;
    buffer += decoder.decode(value, { stream: true });
    const split = splitSseEvents(buffer);
    const events = split.events;
    buffer = split.remaining;
    events.forEach(event => {
      const trimmed = event.trim();
      if (!trimmed || trimmed.startsWith(":")) return;
      flushEvent(event);
    });
  }

  if (buffer.trim() && !buffer.trim().startsWith(":")) {
    flushEvent(buffer);
  }
  if (toolBuffers.size > 0) {
    flushCompletedToolCalls();
  }

  appLogger.debug("OpenRouter stream completed", {
    model,
    durationMs: Date.now() - startedAt,
    firstChunkMs,
    chunkCount,
    eventCount,
    textDeltaCount,
    thoughtDeltaCount,
    webSearchEventCount,
    toolDeltaCount,
    toolCallCount,
  });
}

export async function generateOpenRouterArtifactSummary({
  model,
  userRequest,
  artifact,
  operation,
  signal,
}: GenerateOpenRouterArtifactSummaryOptions) {
  const response = await fetch("/api/openrouter/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildOpenRouterBody({
      model,
      instructions: [
        "You are finishing a Canvas artifact turn in Privora.",
        "The artifact has already been created or updated and opened in Canvas.",
        "Reply with exactly one short, natural sentence.",
        "Do not mention tool calls, implementation details, filenames, or code.",
        "Do not list features. Do not use markdown.",
      ].join("\n"),
      history: [{
        role: "user",
        content: [
          `User request: ${userRequest}`,
          `Artifact operation: ${operation}`,
          `Artifact title: ${artifact.title}`,
          `Artifact kind: ${artifact.kind}`,
          artifact.status ? `Artifact status: ${artifact.status}` : "",
        ].filter(Boolean).join("\n"),
      }],
      reasoningEnabled: false,
      webSearchEnabled: false,
      webSearchRequired: false,
      artifactToolsEnabled: false,
      stream: false,
    })),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(extractOpenRouterErrorMessage(errorText) || `OpenRouter artifact summary failed with ${response.status}`);
  }

  return extractResponseText(await response.json()).trim();
}
