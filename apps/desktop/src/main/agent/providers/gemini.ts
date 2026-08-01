import { GoogleGenAI, type ToolConfig } from "@google/genai";
import { geminiDesktopFunctionDeclarations, parseDesktopToolCall, parsePartialDesktopToolCall } from "../tools/definitions";
import type { ProviderAdapter, ProviderMessage, ProviderStreamOptions } from "./types";
import { createToolCallId } from "./types";
import { normalizeProviderUsage } from "./usage";

interface GeminiGroundingMetadata {
  webSearchQueries?: string[];
  groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
  groundingSupports?: Array<{
    segment?: { endIndex?: number };
    groundingChunkIndices?: number[];
  }>;
}

const geminiThinkingLevel = (effort: ProviderStreamOptions["reasoning"]) => {
  if (effort === "minimal") return "minimal";
  if (effort === "low") return "low";
  if (effort === "medium") return "medium";
  if (effort === "high") return "high";
  throw new Error(`Gemini 3.6 Flash does not support ${effort} thinking.`);
};

export const toGeminiContents = (messages: ProviderMessage[]) =>
  messages.map((message) => {
    const parts: Array<Record<string, unknown>> = [];
    message.parts?.forEach((part) => {
      if (part.type === "text") parts.push({ text: part.text });
      if (part.type === "image") {
        parts.push({
          inlineData: {
            mimeType: part.mimeType,
            data: part.data,
          },
        });
      }
      if (part.type === "function_call") {
        parts.push({
          functionCall: { id: part.id, name: part.name, args: part.arguments || {} },
          ...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {}),
        });
      }
      if (part.type === "function_response") {
        parts.push({ functionResponse: { id: part.id, name: part.name, response: part.response || {} } });
      }
      if (part.type === "server_tool_call") {
        parts.push({
          toolCall: {
            ...(part.id ? { id: part.id } : {}),
            ...(part.toolType ? { toolType: part.toolType } : {}),
            ...(part.arguments ? { args: part.arguments } : {}),
          },
        });
      }
      if (part.type === "server_tool_response") {
        parts.push({
          toolResponse: {
            ...(part.id ? { id: part.id } : {}),
            ...(part.toolType ? { toolType: part.toolType } : {}),
            ...(part.response ? { response: part.response } : {}),
          },
        });
      }
    });
    if (parts.length === 0) parts.push({ text: message.content || "" });
    return {
      role: message.role === "assistant" ? "model" : "user",
      parts,
    };
  });

export const supportsGeminiGoogleSearch = (model: string) =>
  /^gemini-(?:2|3)(?:\.|-)/.test(model);

export const geminiToolsForModel = (
  model: string,
  collaborationMode: ProviderStreamOptions["collaborationMode"],
  disableTools = false,
) => {
  if (disableTools) return [];
  const tools: Array<Record<string, unknown>> = [
    { functionDeclarations: geminiDesktopFunctionDeclarations(collaborationMode) as any },
  ];
  if (supportsGeminiGoogleSearch(model)) {
    tools.push({ googleSearch: {} });
  }
  return tools;
};

export const geminiToolConfigForModel = (model: string): ToolConfig => {
  const combinesBuiltInAndFunctionTools = supportsGeminiGoogleSearch(model);
  return {
    functionCallingConfig: { mode: combinesBuiltInAndFunctionTools ? "VALIDATED" : "AUTO" },
    ...(combinesBuiltInAndFunctionTools ? { includeServerSideToolInvocations: true } : {}),
  } as ToolConfig;
};

export const toGeminiInteractionInput = (messages: ProviderMessage[]) => {
  const input: Array<Record<string, unknown>> = [];
  for (const message of messages) {
    const parts = message.parts?.length ? message.parts : [{ type: "text" as const, text: message.content || "" }];
    let content: Array<Record<string, unknown>> = [];
    const flushContent = () => {
      if (content.length === 0) return;
      input.push({ role: message.role === "assistant" ? "model" : "user", content });
      content = [];
    };
    for (const part of parts) {
      if (part.type === "text") {
        content.push({ type: "text", text: part.text });
        continue;
      }
      if (part.type === "image") {
        content.push({ type: "image", data: part.data, mime_type: part.mimeType });
        continue;
      }
      flushContent();
      if (part.type === "function_call") {
        input.push({ type: "function_call", id: part.id, name: part.name, arguments: part.arguments || {} });
      } else if (part.type === "function_response") {
        input.push({
          type: "function_result",
          call_id: part.id,
          name: part.name,
          is_error: part.response.success === false,
          result: [{ type: "text", text: JSON.stringify(part.response) }],
        });
      }
    }
    flushContent();
  }
  return input;
};

const geminiInteractionTools = (
  model: string,
  collaborationMode: ProviderStreamOptions["collaborationMode"],
) => [
  ...geminiDesktopFunctionDeclarations(collaborationMode).map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parametersJsonSchema,
  })),
  ...(supportsGeminiGoogleSearch(model) ? [{ type: "google_search" }] : []),
];

const parseNestedProviderMessage = (value: unknown): string => {
  if (value instanceof Error) return parseNestedProviderMessage(value.message);
  if (typeof value !== "string") return String(value || "").trim();
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed);
    const nested = parsed?.error?.message ?? parsed?.message;
    return nested === undefined ? trimmed : parseNestedProviderMessage(nested);
  } catch {
    return trimmed;
  }
};

export const normalizeGeminiError = (value: unknown) => {
  const message = parseNestedProviderMessage(value);
  if (!message) return "Gemini request failed.";
  if (/api key not valid|api_key_invalid|invalid api key/i.test(message)) {
    return "Gemini rejected the saved API key. Replace it in Settings > Providers with a valid Google AI Studio Gemini API key.";
  }
  if (/permission denied|permission_denied/i.test(message)) {
    return `Gemini denied access for this API key or project. Check that the Gemini API is enabled and that the selected model is available. (${message})`;
  }
  if (/quota|resource_exhausted|rate limit/i.test(message)) {
    return `Gemini quota or rate limit was reached. Check the key's Google AI Studio project quota and retry. (${message})`;
  }
  return message;
};

export const applyGeminiGroundingCitations = (text: string, metadata?: GeminiGroundingMetadata | null) => {
  const chunks = metadata?.groundingChunks || [];
  const supports = metadata?.groundingSupports || [];
  if (!text.trim() || chunks.length === 0) return text;

  const cited = [...supports]
    .filter((support) =>
      Number.isFinite(support.segment?.endIndex) &&
      (support.segment?.endIndex || 0) > 0 &&
      (support.segment?.endIndex || 0) <= text.length &&
      (support.groundingChunkIndices || []).length > 0
    )
    .sort((a, b) => (b.segment?.endIndex || 0) - (a.segment?.endIndex || 0))
    .reduce((current, support) => {
      const endIndex = support.segment?.endIndex || 0;
      const links = (support.groundingChunkIndices || [])
        .map((index) => {
          const uri = chunks[index]?.web?.uri;
          return uri ? `[${index + 1}](${uri})` : "";
        })
        .filter(Boolean);
      if (links.length === 0) return current;
      const citation = links.join(", ");
      if (current.slice(Math.max(0, endIndex - 40), endIndex + 80).includes(citation)) return current;
      return `${current.slice(0, endIndex)}${citation}${current.slice(endIndex)}`;
    }, text);

  if (cited !== text) return cited;

  const sources = chunks
    .map((chunk, index) => ({ index: index + 1, title: chunk.web?.title || chunk.web?.uri || "Source", uri: chunk.web?.uri }))
    .filter((source) => source.uri)
    .map((source) => `${source.index}. [${source.title}](${source.uri})`);
  if (sources.length === 0) return text;
  return `${text.trimEnd()}\n\nSources:\n${sources.join("\n")}`;
};

export class GeminiAdapter implements ProviderAdapter {
  async stream(options: ProviderStreamOptions): Promise<void> {
    if (!options.geminiApiKey) {
      throw new Error("Gemini API key is not configured in desktop settings.");
    }
    try {
      await this.streamGemini(options);
    } catch (error) {
      if (options.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
      throw new Error(normalizeGeminiError(error));
    }
  }

  private async streamGemini(options: ProviderStreamOptions): Promise<void> {
    const ai = new GoogleGenAI({ apiKey: options.geminiApiKey });
    const responseStream = await ai.interactions.create({
      model: options.model,
      input: toGeminiInteractionInput(options.messages) as any,
      system_instruction: options.systemInstruction,
      stream: true,
      store: false,
      generation_config: {
        thinking_level: geminiThinkingLevel(options.reasoning) as any,
        thinking_summaries: "auto",
        ...(options.maxOutputTokens ? { max_output_tokens: options.maxOutputTokens } : {}),
        ...(!options.disableTools ? { tool_choice: supportsGeminiGoogleSearch(options.model) ? "validated" : "auto" } : {}),
      },
      ...(!options.disableTools ? { tools: geminiInteractionTools(options.model, options.collaborationMode) as any } : {}),
    } as any, { abortSignal: options.signal } as any);

    const activeSteps = new Map<number, {
      id: string;
      name: string;
      argumentsText: string;
    }>();
    const citationSources = new Map<string, string>();
    let webSearchEventId = "";
    for await (const rawEvent of responseStream as any) {
      if (options.signal.aborted) throw new DOMException("Aborted", "AbortError");
      options.onStreamProgress?.();
      const event = rawEvent as Record<string, any>;
      const usage = normalizeProviderUsage(event.metadata?.total_usage || event.interaction?.usage || event.usage);
      if (usage) options.onUsage?.(usage);
      if (event.event_type === "step.start") {
        const step = event.step || {};
        if (step.type === "function_call" && step.name) {
          activeSteps.set(event.index, {
            id: step.id || createToolCallId(),
            name: step.name,
            argumentsText: typeof step.arguments === "string"
              ? step.arguments
              : step.arguments ? JSON.stringify(step.arguments) : "",
          });
        } else if (step.type === "google_search_call") {
          const queries = Array.isArray(step.arguments?.queries) ? step.arguments.queries : [];
          webSearchEventId = step.id || createToolCallId().replace("desktop_call", "web_search");
          options.onWebSearch?.({
            id: webSearchEventId,
            status: "running",
            query: queries[0],
            title: "Searching web",
            output: queries[0] ? `Searching web for ${queries[0]}` : undefined,
          });
        }
        continue;
      }
      if (event.event_type === "step.delta") {
        const delta = event.delta || {};
        if (delta.type === "text" && typeof delta.text === "string") options.onTextDelta(delta.text);
        if ((delta.type === "thought" && typeof delta.text === "string") || delta.type === "thought_summary") {
          const thought = typeof delta.text === "string" ? delta.text : delta.content?.text;
          if (thought) options.onThoughtDelta(thought);
        }
        if (delta.type === "google_search_call") {
          const queries = Array.isArray(delta.arguments?.queries) ? delta.arguments.queries : [];
          if (!webSearchEventId) webSearchEventId = createToolCallId().replace("desktop_call", "web_search");
          options.onWebSearch?.({ id: webSearchEventId, status: "running", query: queries[0], title: "Searching web" });
        }
        if (delta.type === "text_annotation_delta" && Array.isArray(delta.annotations)) {
          delta.annotations.forEach((annotation: Record<string, unknown>) => {
            const url = typeof annotation.url === "string" ? annotation.url : "";
            if (url) citationSources.set(url, typeof annotation.title === "string" ? annotation.title : url);
          });
        }
        const argumentsDelta = delta.partial_arguments ?? (delta.type === "arguments_delta" ? delta.arguments : undefined);
        const active = activeSteps.get(event.index);
        if (active && typeof argumentsDelta === "string") {
          active.argumentsText += argumentsDelta;
          const draft = parsePartialDesktopToolCall(active.name, active.argumentsText);
          if (draft) options.onToolDraft({ ...draft, id: active.id });
        }
        continue;
      }
      if (event.event_type === "step.stop") {
        const active = activeSteps.get(event.index);
        if (active) {
          const rawArguments = active.argumentsText || "{}";
          const call = parseDesktopToolCall(active.name, rawArguments, active.id);
          if (call) options.onToolCall(call);
          activeSteps.delete(event.index);
        }
      }
    }

    if (citationSources.size > 0) {
      options.onTextDelta(`\n\nSources:\n${Array.from(citationSources, ([url, title]) => `- [${title}](${url})`).join("\n")}`);
    }

    if (webSearchEventId) {
      options.onWebSearch?.({
        id: webSearchEventId,
        status: "done",
        title: "Searched web",
        output: "Gemini completed a grounded web search.",
      });
    }
  }
}
