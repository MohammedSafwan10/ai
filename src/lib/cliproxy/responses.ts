import type { Attachment } from "../attachments";

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
  signal: AbortSignal;
  onTextDelta: (delta: string) => void;
  onThoughtDelta: (delta: string) => void;
  onWebSearch?: (event: { status: "searching" | "searched"; queries?: string[] }) => void;
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

const extractThoughtDelta = (event: string | undefined, data: any) => {
  if (
    typeof data?.delta === "string" &&
    (event?.includes("reasoning_summary") || data?.type === "response.reasoning_summary_text.delta")
  ) {
    return data.delta;
  }

  if (typeof data?.delta === "string" && event?.includes("reasoning")) {
    return data.delta;
  }

  if (typeof data?.text === "string" && data?.type === "summary_text") {
    return data.text;
  }

  if (typeof data?.part?.text === "string" && data?.part?.type === "summary_text") {
    return data.part.text;
  }

  if (Array.isArray(data?.summary)) {
    return data.summary
      .map((item: any) => item?.text)
      .filter(Boolean)
      .join("");
  }

  return "";
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

export async function streamCliproxyResponse({
  model,
  instructions,
  history,
  reasoningEffort,
  webSearchEnabled,
  signal,
  onTextDelta,
  onThoughtDelta,
  onWebSearch,
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

  if (webSearchEnabled) {
    body.tools = [{ type: "web_search_preview" }];
  }

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
    throw new Error(errorText || `CLIProxy request failed with ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flushEvent = (rawEvent: string) => {
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

        if (webSearchEvent) onWebSearch?.(webSearchEvent);
        if (thoughtDelta) onThoughtDelta(thoughtDelta);
        if (textDelta) onTextDelta(textDelta);
      } catch {
        if (!event || event.includes("output_text")) {
          onTextDelta(dataLine);
        }
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    events.forEach(flushEvent);
  }

  if (buffer.trim()) {
    flushEvent(buffer);
  }
}
