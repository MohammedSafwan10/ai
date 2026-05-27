import { GoogleGenAI, type ThinkingLevel } from "@google/genai";
import { geminiDesktopFunctionDeclarations, parseDesktopToolCall } from "../tools/definitions";
import type { ProviderAdapter, ProviderMessage, ProviderStreamOptions } from "./types";
import { createToolCallId } from "./types";

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
        ...(options.reasoning !== "none"
          ? {
              thinkingConfig: {
                thinkingLevel: geminiThinkingLevel(options.reasoning) as ThinkingLevel,
                includeThoughts: true,
              },
            }
          : {}),
        tools: [{ functionDeclarations: geminiDesktopFunctionDeclarations as any }],
        toolConfig: { functionCallingConfig: { mode: "AUTO" } } as any,
      },
    });

    for await (const chunk of responseStream) {
      if (options.signal.aborted) throw new DOMException("Aborted", "AbortError");
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
          options.onThoughtDelta(part.text);
        } else if (!part.thought && part.text) {
          options.onTextDelta(part.text);
        }
      }
      if (parts.length === 0 && chunk.text) options.onTextDelta(chunk.text);
    }
  }
}
