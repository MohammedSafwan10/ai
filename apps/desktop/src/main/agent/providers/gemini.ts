import { GoogleGenAI, type ThinkingLevel } from "@google/genai";
import { geminiDesktopFunctionDeclarations, parseDesktopToolCall } from "../tools/definitions";
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
  if (effort === "low") return "low";
  if (effort === "medium") return "medium";
  if (effort === "high" || effort === "extra_high") return "high";
  return "minimal";
};

const toGeminiContents = (messages: ProviderMessage[]) =>
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
          functionCall: { name: part.name, args: part.arguments || {} },
          ...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {}),
        });
      }
      if (part.type === "function_response") {
        parts.push({ functionResponse: { name: part.name, response: part.response || {} } });
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
    const ai = new GoogleGenAI({ apiKey: options.geminiApiKey });
    const responseStream = await ai.models.generateContentStream({
      model: options.model,
      contents: toGeminiContents(options.messages),
      config: {
        systemInstruction: options.systemInstruction,
        temperature: 0.35,
        ...(options.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
        ...(options.reasoning !== "none"
          ? {
              thinkingConfig: {
                thinkingLevel: geminiThinkingLevel(options.reasoning) as ThinkingLevel,
                includeThoughts: true,
              },
            }
          : {}),
        ...(!options.disableTools ? {
          tools: geminiToolsForModel(options.model, options.collaborationMode) as any,
          toolConfig: { functionCallingConfig: { mode: "AUTO" } } as any,
        } : {}),
      },
    });

    let emittedText = "";
    let emittedThought = "";
    let groundingMetadata: GeminiGroundingMetadata | null = null;
    let webSearchEventId = "";
    const emitIncrementalText = (text: string, thought = false) => {
      const previous = thought ? emittedThought : emittedText;
      const delta = text.startsWith(previous) ? text.slice(previous.length) : text;
      if (thought) {
        emittedThought = text.startsWith(previous) ? text : `${emittedThought}${delta}`;
        if (delta) options.onThoughtDelta(delta);
      } else {
        emittedText = text.startsWith(previous) ? text : `${emittedText}${delta}`;
        if (delta) options.onTextDelta(delta);
      }
    };

    for await (const chunk of responseStream) {
      if (options.signal.aborted) throw new DOMException("Aborted", "AbortError");
      const usage = normalizeProviderUsage((chunk as any).usageMetadata || (chunk as any).usage);
      if (usage) options.onUsage?.(usage);
      const candidateGroundingMetadata = chunk.candidates?.[0]?.groundingMetadata;
      if (candidateGroundingMetadata?.groundingChunks?.length || candidateGroundingMetadata?.groundingSupports?.length) {
        groundingMetadata = candidateGroundingMetadata as GeminiGroundingMetadata;
        const queries = groundingMetadata.webSearchQueries || [];
        if (!webSearchEventId) {
          webSearchEventId = createToolCallId().replace("desktop_call", "web_search");
          options.onWebSearch?.({
            id: webSearchEventId,
            status: "running",
            query: queries[0],
            title: "Searching web",
            output: queries[0] ? `Searching web for ${queries[0]}` : undefined,
          });
        }
      }
      const parts = chunk.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.functionCall?.name) {
          const call = parseDesktopToolCall(
            part.functionCall.name,
            JSON.stringify(part.functionCall.args || {}),
            createToolCallId(),
          );
          if (call) options.onToolCall({ ...call, thoughtSignature: part.thoughtSignature });
        } else if (part.thought && part.text) {
          emitIncrementalText(part.text, true);
        } else if (!part.thought && part.text) {
          emitIncrementalText(part.text);
        }
      }
      if (parts.length === 0 && chunk.text) emitIncrementalText(chunk.text);
    }

    const citedText = applyGeminiGroundingCitations(emittedText, groundingMetadata);
    if (citedText !== emittedText) options.onTextReplace?.(citedText);
    if (webSearchEventId) {
      const queries = groundingMetadata?.webSearchQueries || [];
      const query = queries[0] || "";
      options.onWebSearch?.({
        id: webSearchEventId,
        status: "done",
        query,
        title: "Searched web",
        output: query ? `Searched web for ${query}` : "Searched web",
      });
    }
  }
}
