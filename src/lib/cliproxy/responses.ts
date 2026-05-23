import type { Attachment } from "../attachments";
import { artifactToolDefinition, parseArtifactToolArguments, parsePartialArtifactToolArguments, type ArtifactDraftPayload, type ArtifactPayload } from "../artifacts";
import { appLogger } from "../logger";

export interface CliproxyMessage {
  role: "user" | "model";
  content: string;
  attachments?: Attachment[];
}

interface StreamCliproxyResponseOptions {
  model: string;
  instructions: string;
  history: CliproxyMessage[];
  reasoningEffort: "none" | "medium";
  webSearchEnabled: boolean;
  artifactToolsEnabled?: boolean;
  signal: AbortSignal;
  onTextDelta: (delta: string) => void;
  onThoughtDelta: (delta: string) => void;
  onWebSearch?: (event: { status: "searching" | "searched"; queries?: string[] }) => void;
  onArtifactToolDelta?: (payload: ArtifactDraftPayload) => void;
  onArtifactToolCall?: (payload: ArtifactPayload) => void;
}

interface GenerateCliproxyArtifactSummaryOptions {
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

const getCliproxyApiKey = () =>
  ((import.meta as any).env?.VITE_CLIPROXY_API_KEY as string | undefined) || "dummy-key";

const isSupportedVisionImage = (attachment: Attachment) =>
  ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(attachment.mimeType);

const toDataUrl = (attachment: Attachment) =>
  `data:${attachment.mimeType || "application/octet-stream"};base64,${attachment.base64}`;

const toInputContent = (message: CliproxyMessage) => {
  const content: Array<Record<string, unknown>> = [];
  const textType = message.role === "model" ? "output_text" : "input_text";

  if (message.content) {
    content.push({
      type: textType,
      text: message.content,
    });
  }

  if (message.role === "model") {
    return content.length > 0 ? content : [{ type: "output_text", text: "" }];
  }

  message.attachments?.forEach((attachment) => {
    if (isSupportedVisionImage(attachment)) {
      content.push({
        type: "input_image",
        image_url: toDataUrl(attachment),
        detail: "auto",
      });
      return;
    }

    content.push({
      type: "input_file",
      filename: attachment.name,
      file_data: toDataUrl(attachment),
    });
  });

  return content.length > 0 ? content : [{ type: "input_text", text: "" }];
};

const toResponsesInput = (history: CliproxyMessage[]) =>
  history.map((message) => ({
    role: message.role === "model" ? "assistant" : "user",
    content: toInputContent(message),
  }));

const extractTextDelta = (event: string | undefined, data: any) => {
  if (typeof data?.delta === "string" && event?.includes("output_text")) {
    return data.delta;
  }

  if (typeof data?.choices?.[0]?.delta?.content === "string") {
    return data.choices[0].delta.content;
  }

  if (typeof data?.message?.content === "string") {
    return data.message.content;
  }

  return "";
};

type ExtractedThought = {
  text: string;
  mode: "delta" | "snapshot";
};

const extractThoughtDelta = (event: string | undefined, data: any): ExtractedThought | null => {
  if (
    typeof data?.delta === "string" &&
    (event?.includes("reasoning_summary") || data?.type === "response.reasoning_summary_text.delta")
  ) {
    return { text: data.delta, mode: "delta" };
  }

  if (typeof data?.delta === "string" && event?.includes("reasoning")) {
    return { text: data.delta, mode: "delta" };
  }

  if (typeof data?.text === "string" && data?.type === "summary_text") {
    return { text: data.text, mode: "snapshot" };
  }

  if (typeof data?.part?.text === "string" && data?.part?.type === "summary_text") {
    return { text: data.part.text, mode: "snapshot" };
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
    if (text) return { text, mode: "snapshot" };
  }

  const reasoningItems = [
    data?.item,
    data?.output_item,
    ...(Array.isArray(data?.response?.output) ? data.response.output : []),
  ];
  for (const item of reasoningItems) {
    if (item?.type !== "reasoning" || !Array.isArray(item?.content)) continue;
    const text = item.content
      .map((part: any) => part?.text || part?.content)
      .filter(Boolean)
      .join("");
    return text ? { text, mode: "snapshot" } : null;
  }

  return null;
};

const extractWebSearchEvent = (event: string | undefined, data: any) => {
  const payload = data?.item || data?.output_item || data;
  const type = `${event || ""} ${data?.type || ""} ${payload?.type || ""}`;

  if (!type.includes("web_search")) {
    return null;
  }

  const rawQueries = [
    payload?.action?.query,
    data?.action?.query,
    ...(Array.isArray(payload?.action?.queries) ? payload.action.queries : []),
    ...(Array.isArray(data?.action?.queries) ? data.action.queries : []),
  ];
  const queries = rawQueries.filter((query): query is string => typeof query === "string" && query.trim().length > 0);
  const status: "searching" | "searched" =
    payload?.status === "completed" || data?.status === "completed" ? "searched" : "searching";

  return { status, queries: queries.length > 0 ? queries : undefined };
};

const extractResponseText = (data: any): string => {
  if (data?.response && data.response !== data) return extractResponseText(data.response);
  if (data?.result && data.result !== data) return extractResponseText(data.result);
  if (typeof data?.output_text === "string") return data.output_text;
  if (typeof data?.text === "string") return data.text;
  if (typeof data?.message?.content === "string") return data.message.content;
  if (Array.isArray(data?.output)) {
    return data.output
      .flatMap((item: any) => item?.content || [])
      .map((content: any) => content?.text || content?.content || "")
      .filter(Boolean)
      .join("\n");
  }
  if (Array.isArray(data?.choices)) {
    return data.choices
      .map((choice: any) => choice?.message?.content || choice?.text || "")
      .filter(Boolean)
      .join("\n");
  }
  return "";
};

const extractFunctionCallDelta = (event: string | undefined, data: any) => {
  const type = `${event || ""} ${data?.type || ""}`;
  if (!type.includes("function_call_arguments.delta")) return null;
  return typeof data?.delta === "string" ? data.delta : null;
};

const extractCompletedFunctionCall = (event: string | undefined, data: any) => {
  const type = `${event || ""} ${data?.type || ""}`;
  const candidates = [
    data?.item,
    data?.output_item,
    data,
    ...(Array.isArray(data?.response?.output) ? data.response.output : []),
  ];

  const item = candidates.find(candidate =>
    candidate &&
    (candidate?.name === "create_or_update_artifact" || candidate?.type === "function_call") &&
    typeof candidate?.arguments === "string"
  );
  const name = item?.name || data?.name;
  const argumentsText = item?.arguments || data?.arguments;

  if (!type.includes("function_call") && item?.type !== "function_call") return null;
  if (name !== "create_or_update_artifact") return null;
  if (typeof argumentsText !== "string") return null;

  return parseArtifactToolArguments(argumentsText);
};

export async function streamCliproxyResponse({
  model,
  instructions,
  history,
  reasoningEffort,
  webSearchEnabled,
  artifactToolsEnabled = false,
  signal,
  onTextDelta,
  onThoughtDelta,
  onWebSearch,
  onArtifactToolDelta,
  onArtifactToolCall,
}: StreamCliproxyResponseOptions) {
  const body: Record<string, unknown> = {
    model,
    instructions,
    input: toResponsesInput(history),
    stream: true,
    temperature: 0.85,
  };

  if (reasoningEffort === "medium") {
    body.reasoning = {
      effort: "medium",
      summary: "auto",
    };
  }

  const tools: unknown[] = [];
  if (webSearchEnabled) {
    tools.push({ type: "web_search_preview" });
  }
  if (artifactToolsEnabled) {
    tools.push(artifactToolDefinition);
  }
  if (tools.length > 0) {
    body.tools = tools;
  }

  const startedAt = Date.now();
  let chunkCount = 0;
  let eventCount = 0;
  let textDeltaCount = 0;
  let thoughtDeltaCount = 0;
  let webSearchEventCount = 0;
  let artifactDeltaCount = 0;
  let artifactCallCount = 0;
  let firstChunkMs: number | undefined;

  appLogger.debug("CLIProxy stream request started", {
    model,
    historyLength: history.length,
    reasoningEffort,
    webSearchEnabled,
    artifactToolsEnabled,
    toolCount: tools.length,
  });

  const response = await fetch("/cliproxy/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getCliproxyApiKey()}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text().catch(() => "");
    appLogger.error("CLIProxy stream request rejected", {
      model,
      status: response.status,
      durationMs: Date.now() - startedAt,
      errorText,
    });
    throw new Error(errorText || `CLIProxy request failed with ${response.status}`);
  }

  appLogger.debug("CLIProxy stream response opened", {
    model,
    status: response.status,
    contentType: response.headers.get("content-type"),
    durationMs: Date.now() - startedAt,
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let functionArgumentBuffer = "";
  let hasStreamedThoughtDelta = false;
  let hasEmittedThoughtSnapshot = false;

  const flushEvent = (rawEvent: string) => {
    eventCount += 1;
    const lines = rawEvent.split("\n");
    const event = lines
      .find((line) => line.startsWith("event:"))
      ?.slice("event:".length)
      .trim();
    const dataLines = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim());

    for (const dataLine of dataLines) {
      if (!dataLine || dataLine === "[DONE]") continue;

      try {
        const data = JSON.parse(dataLine);
        const thoughtDelta = extractThoughtDelta(event, data);
        const textDelta = extractTextDelta(event, data);
        const webSearchEvent = extractWebSearchEvent(event, data);
        const functionDelta = extractFunctionCallDelta(event, data);
        const completedFunctionCall = extractCompletedFunctionCall(event, data);

        if (webSearchEvent) {
          webSearchEventCount += 1;
          onWebSearch?.(webSearchEvent);
        }
        if (functionDelta) {
          artifactDeltaCount += 1;
          functionArgumentBuffer += functionDelta;
          const partialArtifact = parsePartialArtifactToolArguments(functionArgumentBuffer);
          if (partialArtifact) onArtifactToolDelta?.(partialArtifact);
        }
        if (completedFunctionCall) {
          artifactCallCount += 1;
          onArtifactToolCall?.(completedFunctionCall);
          functionArgumentBuffer = "";
        } else if (functionArgumentBuffer && `${event || ""} ${data?.type || ""}`.includes("function_call_arguments.done")) {
          const parsed = parseArtifactToolArguments(functionArgumentBuffer);
          if (parsed) {
            artifactCallCount += 1;
            onArtifactToolCall?.(parsed);
          }
          functionArgumentBuffer = "";
        }
        if (thoughtDelta?.text) {
          if (thoughtDelta.mode === "delta") {
            hasStreamedThoughtDelta = true;
            thoughtDeltaCount += 1;
            onThoughtDelta(thoughtDelta.text);
          } else if (!hasStreamedThoughtDelta && !hasEmittedThoughtSnapshot) {
            hasEmittedThoughtSnapshot = true;
            thoughtDeltaCount += 1;
            onThoughtDelta(thoughtDelta.text);
          }
        }
        if (textDelta) {
          textDeltaCount += 1;
          onTextDelta(textDelta);
        }
      } catch {
        if (!event || event.includes("output_text")) {
          textDeltaCount += 1;
          onTextDelta(dataLine);
        }
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunkCount += 1;
    firstChunkMs ??= Date.now() - startedAt;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    events.forEach(flushEvent);
  }

  if (buffer.trim()) {
    flushEvent(buffer);
  }

  appLogger.debug("CLIProxy stream completed", {
    model,
    durationMs: Date.now() - startedAt,
    firstChunkMs,
    chunkCount,
    eventCount,
    textDeltaCount,
    thoughtDeltaCount,
    webSearchEventCount,
    artifactDeltaCount,
    artifactCallCount,
  });
}

export async function generateCliproxyArtifactSummary({
  model,
  userRequest,
  artifact,
  operation,
  signal,
}: GenerateCliproxyArtifactSummaryOptions) {
  const response = await fetch("/cliproxy/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getCliproxyApiKey()}`,
    },
    body: JSON.stringify({
      model,
      instructions: [
        "You are finishing a Canvas artifact turn in Privora.",
        "The artifact has already been created or updated and opened in Canvas.",
        "Reply with exactly one short, natural sentence.",
        "Do not mention tool calls, implementation details, filenames, or code.",
        "Do not list features. Do not use markdown.",
      ].join("\n"),
      input: [{
        role: "user",
        content: [{
          type: "input_text",
          text: [
            `User request: ${userRequest}`,
            `Artifact operation: ${operation}`,
            `Artifact title: ${artifact.title}`,
            `Artifact kind: ${artifact.kind}`,
            artifact.status ? `Artifact status: ${artifact.status}` : "",
          ].filter(Boolean).join("\n"),
        }],
      }],
      stream: false,
      temperature: 0.25,
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(errorText || `CLIProxy artifact summary failed with ${response.status}`);
  }

  const text = extractResponseText(await response.json());
  return text.trim();
}
