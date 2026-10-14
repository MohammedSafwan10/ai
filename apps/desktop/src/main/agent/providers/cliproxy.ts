import {
  desktopToolDefinitionsForMode,
  isDesktopToolName,
  parseDesktopToolCall,
  parsePartialDesktopToolCall,
} from "../tools/definitions";
import type { ProviderAdapter, ProviderMessage, ProviderStreamOptions } from "./types";
import type { ProviderWebSearchEvent } from "./types";
import { normalizeLocalServiceBaseUrl } from "../../security/serviceUrls";
import { readSse } from "./sse";
import { emitResponsesDisposition } from "./disposition";
import { normalizeProviderUsage } from "./usage";

export const resolveCliproxyModelId = (modelId: string) =>
  modelId;

export const cliproxyPromptCacheKey = (threadId: string | undefined) => {
  const trimmed = threadId?.trim();
  return trimmed ? `privora:thread:${trimmed}:v1` : undefined;
};

export const normalizeCliproxyError = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "CLIProxy request failed.";
  let message = trimmed;
  try {
    const parsed = JSON.parse(trimmed);
    message = String(parsed?.error?.message || parsed?.message || trimmed);
  } catch {
    message = trimmed;
  }

  if (/authentication token is expired|invalidated oauth token|auth_unavailable|no auth available/i.test(message)) {
    return "CLIProxy could not authenticate its upstream account. Stop CLIProxy, remove stale Codex auth files from ~/.cli-proxy-api, run `cliproxy -codex-login`, then start CLIProxy again.";
  }

  if (/cf_chl|challenge-platform|cloudflare challenge|enable javascript and cookies|chatgpt\.com\/backend-api\/codex/i.test(message)) {
    return "CLIProxy reached ChatGPT/Codex upstream, but ChatGPT returned a Cloudflare challenge instead of a model response. Open ChatGPT in the same browser/network and complete the check, then restart CLIProxy and retry; if it keeps happening, use a different network or wait for CLIProxy's cooldown to clear.";
  }

  if (/upstream connect error|disconnect\/reset before headers|connection timeout|internal_server_error/i.test(message)) {
    return "CLIProxy reached its local server, but the upstream Codex connection timed out before returning headers. Restart CLIProxy and retry with a small prompt; if it repeats, ChatGPT/Codex upstream is likely blocked, challenged, or temporarily unavailable on this network.";
  }

  return message;
};

export const cliproxyToolsForModel = (
  _model: string,
  collaborationMode: ProviderStreamOptions["collaborationMode"],
  environment: ProviderStreamOptions["toolEnvironment"] = "development",
) => [
  ...desktopToolDefinitionsForMode(collaborationMode, environment),
  {
    type: "web_search",
    external_web_access: true,
    search_content_types: ["text", "image"],
  },
];

// Shared Responses-API helpers, also used by the OpenCode Go /responses route.
export const toResponsesInput = (messages: ProviderMessage[]) => {
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

export const responsesTextDelta = (event: string | undefined, data: any) => {
  if (event === "response.output_text.delta" && data?.type === "response.output_text.delta" && typeof data?.delta === "string") {
    return data.delta;
  }
  return "";
};

export const responsesThoughtDelta = (event: string | undefined, data: any) => {
  const type = data?.type;
  if (
    typeof data?.delta === "string" &&
    event === "response.reasoning_summary_text.delta" &&
    type === "response.reasoning_summary_text.delta"
  ) {
    return data.delta;
  }
  return "";
};

export const completedResponsesFunctionCall = (event: string | undefined, data: any) => {
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
    (isDesktopToolName(candidate?.name) || candidate?.type === "function_call")
  );
  const name = item?.name || data?.name;
  const argumentsText = item?.arguments ?? data?.arguments;
  if (!type.includes("function_call") && item?.type !== "function_call") return null;
  if (!isDesktopToolName(name)) return null;
  if (typeof argumentsText !== "string") return null;
  return { id: item?.call_id || data?.call_id, name, argumentsText };
};

interface ResponsesCallBuffer {
  id?: string;
  name?: string;
  argumentsText: string;
  completed: boolean;
}

/** Item IDs and output indexes are aliases; only call_id identifies execution. */
export class ResponsesToolCallTracker {
  private readonly buffers = new Map<string, ResponsesCallBuffer>();
  private readonly emitted = new Set<string>();

  constructor(private readonly options: Pick<ProviderStreamOptions, "onToolCall" | "onToolDraft">) {}

  consume(event: string | undefined, data: any) {
    const type = `${event || ""} ${data?.type || ""}`;
    if (type.includes("response.completed") && Array.isArray(data?.response?.output)) {
      data.response.output.forEach((item: any, output_index: number) => {
        if (item?.type === "function_call") this.consume("response.output_item.done", { item, output_index });
      });
      return;
    }
    const item = data?.item || data?.output_item;
    if (!type.includes("function_call") && item?.type !== "function_call") return;
    const callId = item?.call_id || data?.call_id;
    const itemId = data?.item_id || item?.id || data?.id;
    const aliases: string[] = [];
    if (typeof callId === "string" && callId) aliases.push(`call:${callId}`);
    if (typeof itemId === "string" && itemId) aliases.push(`item:${itemId}`);
    if (Number.isInteger(data?.output_index) && data.output_index >= 0) aliases.push(`output:${data.output_index}`);
    // Missing all identity fields cannot safely identify a mutating call.
    if (!aliases.length) return;
    const matches = aliases.map((alias) => this.buffers.get(alias)).filter((buffer): buffer is ResponsesCallBuffer => Boolean(buffer));
    const buffer = matches[0] ?? { argumentsText: "", completed: false };
    const knownIds = new Set(matches.map((value) => value.id).filter(Boolean));
    if (typeof callId === "string" && callId) knownIds.add(callId);
    if (knownIds.size > 1) return; // Conflicting aliases are malformed, not new calls.
    for (const match of matches) {
      buffer.id ??= match.id;
      buffer.name ??= match.name;
      if (!buffer.argumentsText) buffer.argumentsText = match.argumentsText;
      buffer.completed ||= match.completed;
    }
    if (typeof callId === "string" && callId) buffer.id = callId;
    const name = item?.name || data?.name;
    if (isDesktopToolName(name)) buffer.name = name;
    for (const [alias, value] of this.buffers) {
      if (matches.includes(value)) this.buffers.set(alias, buffer);
    }
    for (const alias of aliases) this.buffers.set(alias, buffer);
    if (buffer.id) this.buffers.set(`call:${buffer.id}`, buffer);

    if (type.includes("function_call_arguments.delta") && typeof data?.delta === "string" && !buffer.completed) {
      buffer.argumentsText += data.delta;
      const draft = parsePartialDesktopToolCall(buffer.name, buffer.argumentsText);
      if (draft && buffer.id) this.options.onToolDraft({ ...draft, id: buffer.id });
    }
    if (type.includes("function_call_arguments.done") || type.includes("output_item.done")) {
      const completed = completedResponsesFunctionCall(event, data);
      const argumentsText = completed?.argumentsText ?? item?.arguments ?? data?.arguments;
      if (typeof argumentsText === "string") buffer.argumentsText = argumentsText;
      buffer.completed = true;
    }
    if (!buffer.completed || !buffer.id || !buffer.name || this.emitted.has(buffer.id)) return;
    const call = parseDesktopToolCall(buffer.name, buffer.argumentsText, buffer.id);
    if (!call) return;
    this.emitted.add(buffer.id);
    this.options.onToolCall(call);
  }
}

export const webSearchEventFromResponse = (event: string | undefined, data: any) => {
  const item = data?.item || data?.output_item || data;
  if (item?.type !== "web_search_call" && data?.type !== "web_search_call") return null;
  const id = String(item?.id || data?.item_id || data?.id || `web_search_${Date.now()}`);
  const statusText = String(item?.status || data?.status || "");
  const type = `${event || ""} ${data?.type || ""}`;
  const status: ProviderWebSearchEvent["status"] = statusText === "failed" || type.includes("failed")
    ? "failed"
    : statusText === "completed" || type.includes(".done")
      ? "done"
      : "running";
  const action = item?.action || data?.action || {};
  const query = webSearchActionDetail(action);
  return {
    id,
    status,
    query,
    title: status === "done" ? "Searched web" : "Searching web",
    output: query ? (status === "done" ? `Searched web for ${query}` : `Searching web for ${query}`) : undefined,
  };
};

const webSearchActionDetail = (action: any) => {
  const type = action?.type;
  if (type === "search") {
    if (typeof action.query === "string" && action.query.trim()) return action.query.trim();
    if (Array.isArray(action.queries) && action.queries.length > 0) {
      const [first] = action.queries.map((item: unknown) => String(item || "").trim()).filter(Boolean);
      return action.queries.length > 1 && first ? `${first} ...` : first || "";
    }
  }
  if (type === "open_page" || type === "openPage") return String(action.url || "").trim();
  if (type === "find_in_page" || type === "findInPage") {
    const pattern = String(action.pattern || "").trim();
    const url = String(action.url || "").trim();
    if (pattern && url) return `'${pattern}' in ${url}`;
    return pattern || url;
  }
  return "";
};

export class CliproxyAdapter implements ProviderAdapter {
  async stream(options: ProviderStreamOptions): Promise<void> {
    const promptCacheKey = cliproxyPromptCacheKey(options.threadId);
    const baseUrl = normalizeLocalServiceBaseUrl(options.cliproxyBaseUrl, "CLI proxy");
    const response = await fetch(`${baseUrl}/v1/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer dummy-key",
        ...(promptCacheKey ? { Session_id: promptCacheKey } : {}),
      },
      body: JSON.stringify({
        model: resolveCliproxyModelId(options.model),
        instructions: options.systemInstruction,
        input: toResponsesInput(options.messages),
        ...(!options.disableTools ? {
          tools: cliproxyToolsForModel(options.model, options.collaborationMode, options.toolEnvironment),
          parallel_tool_calls: true,
        } : {}),
        ...(promptCacheKey ? { prompt_cache_key: promptCacheKey } : {}),
        ...(options.maxOutputTokens ? { max_output_tokens: options.maxOutputTokens } : {}),
        reasoning: { effort: options.reasoning, summary: "auto" },
        stream: true,
        temperature: 0.35,
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(normalizeCliproxyError(errorText || `CLIProxy request failed with ${response.status}`));
    }

    const toolCalls = new ResponsesToolCallTracker(options);
    let currentReasoningSummary = "";
    let hasReasoningSummary = false;

    await readSse(response, (event, dataLine) => {
      try {
        const data = JSON.parse(dataLine);
        const usage = normalizeProviderUsage(data?.usage || data?.response?.usage);
        if (usage) options.onUsage?.(usage);
        const webSearch = webSearchEventFromResponse(event, data);
        if (webSearch) options.onWebSearch?.(webSearch);

        emitResponsesDisposition(options, event, data);
        const text = responsesTextDelta(event, data);
        if (text) options.onTextDelta(text);
        const thought = responsesThoughtDelta(event, data);
        const eventType = `${event || ""} ${data?.type || ""}`;
        if (eventType.includes("reasoning_summary_part.added")) {
          if (hasReasoningSummary && currentReasoningSummary.trim()) options.onThoughtDelta("\n\n");
          currentReasoningSummary = "";
        }
        if (thought) {
          currentReasoningSummary += thought;
          hasReasoningSummary = true;
          options.onThoughtDelta(thought);
        }
        if (eventType.includes("reasoning_summary_text.done") && typeof data?.text === "string") {
          const reconciled = data.text;
          const isCompatiblePrefix = reconciled.startsWith(currentReasoningSummary);
          if (!isCompatiblePrefix && currentReasoningSummary.trim()) {
            options.onThoughtReplace?.(reconciled);
            currentReasoningSummary = reconciled;
            hasReasoningSummary = true;
          }
          const remainder = isCompatiblePrefix
            ? reconciled.slice(currentReasoningSummary.length)
            : currentReasoningSummary.trim()
              ? ""
              : reconciled;
          if (remainder) {
            currentReasoningSummary += remainder;
            hasReasoningSummary = true;
            options.onThoughtDelta(remainder);
          }
        }

        toolCalls.consume(event, data);
      } catch {
        // Ignore malformed or non-JSON SSE payloads. CLIProxy Responses streams use
        // typed events, and unknown payloads must not leak into visible assistant text.
      }
    }, options.onStreamProgress);
  }
}
