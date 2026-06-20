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
import { normalizeProviderUsage } from "./usage";

const responseReasoningEffort = (effort: ProviderStreamOptions["reasoning"]) =>
  effort === "extra_high" ? "high" : effort;

const CLIPROXY_ANTIGRAVITY_GEMINI_35_FLASH = "gemini-3-flash-agent";
const CLIPROXY_ANTIGRAVITY_GEMINI_31_PRO = "gemini-pro-agent";

const cliproxyModelAliases: Record<string, string> = {
  "gemini-3.5-flash-cliproxy": CLIPROXY_ANTIGRAVITY_GEMINI_35_FLASH,
  "gemini-3.1-pro-cliproxy": CLIPROXY_ANTIGRAVITY_GEMINI_31_PRO,
};

export const resolveCliproxyModelId = (modelId: string) =>
  cliproxyModelAliases[modelId] || modelId;

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
) => [
  ...desktopToolDefinitionsForMode(collaborationMode),
  {
    type: "web_search",
    external_web_access: true,
    search_content_types: ["text", "image"],
  },
];

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
  if (event === "response.output_text.delta" && data?.type === "response.output_text.delta" && typeof data?.delta === "string") {
    return data.delta;
  }
  return "";
};

const thoughtDelta = (event: string | undefined, data: any) => {
  const type = data?.type;
  if (
    typeof data?.delta === "string" &&
    (event === "response.reasoning_summary_text.delta" || event === "response.reasoning_text.delta") &&
    (type === "response.reasoning_summary_text.delta" || type === "response.reasoning_text.delta")
  ) {
    return data.delta;
  }
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
    (isDesktopToolName(candidate?.name) || candidate?.type === "function_call")
  );
  const name = item?.name || data?.name;
  const argumentsText = item?.arguments || data?.arguments;
  if (!type.includes("function_call") && item?.type !== "function_call") return null;
  if (!isDesktopToolName(name)) return null;
  if (typeof argumentsText !== "string") return null;
  return { id: item?.call_id || data?.call_id || item?.id || data?.id, name, argumentsText };
};

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
        input: toInput(options.messages),
        ...(!options.disableTools ? {
          tools: cliproxyToolsForModel(options.model, options.collaborationMode),
          parallel_tool_calls: true,
        } : {}),
        ...(promptCacheKey ? { prompt_cache_key: promptCacheKey } : {}),
        ...(options.maxOutputTokens ? { max_output_tokens: options.maxOutputTokens } : {}),
        ...(options.reasoning !== "none" ? { reasoning: { effort: responseReasoningEffort(options.reasoning), summary: "auto" } } : {}),
        stream: true,
        temperature: 0.35,
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(normalizeCliproxyError(errorText || `CLIProxy request failed with ${response.status}`));
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
        const usage = normalizeProviderUsage(data?.usage || data?.response?.usage);
        if (usage) options.onUsage?.(usage);
        const webSearch = webSearchEventFromResponse(event, data);
        if (webSearch) options.onWebSearch?.(webSearch);
        const key = keyFor(data);
        const previous = buffers.get(key) || { argumentsText: "" };
        const itemName = data?.item?.name || data?.output_item?.name || data?.name;
        const name = typeof itemName === "string" && isDesktopToolName(itemName)
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
        // Ignore malformed or non-JSON SSE payloads. CLIProxy Responses streams use
        // typed events, and unknown payloads must not leak into visible assistant text.
      }
    }, options.onStreamProgress);
  }
}
