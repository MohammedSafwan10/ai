import { GoogleGenAI } from "@google/genai";
import { geminiDesktopFunctionDeclarations, parseDesktopToolCall } from "../tools/definitions";
import { createToolCallId, type ProviderStreamOptions } from "./types";
import { normalizeProviderUsage } from "./usage";
import { normalizeFinish, ProviderStreamError } from "./streamOutcome";
import { OPENCODE_GO_USER_AGENT, goSessionId } from "../../../shared/opencodeGo";

/** Native generateContent supports the models returned by Google's model list. */
export async function streamDiscoveredGemini(options: ProviderStreamOptions) {
  const go = options.provider === "opencode-go";
  const ai = new GoogleGenAI({ apiKey: go ? options.opencodeGoApiKey : options.geminiApiKey,
    ...(go ? { httpOptions: { baseUrl: "https://opencode.ai/inference/go/google", apiVersion: "v1beta", headers: { Authorization: `Bearer ${options.opencodeGoApiKey}`, "User-Agent": OPENCODE_GO_USER_AGENT, "x-opencode-session": goSessionId(options.threadId) } } } : {}),
  });
  const contents = options.messages.map((message) => {
    const parts: any[] = [];
    if (message.content) parts.push({ text: message.content });
    for (const part of message.parts || []) {
      if (part.type === "text" && !message.content) parts.push({ text: part.text });
      if (part.type === "image") parts.push({ inlineData: { mimeType: part.mimeType, data: part.data } });
      if (part.type === "function_call") parts.push({ functionCall: { id: part.id, name: part.name, args: part.arguments }, ...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {}) });
      if (part.type === "function_response") parts.push({ functionResponse: { id: part.id, name: part.name, response: part.response } });
    }
    return { role: message.role === "assistant" ? "model" : "user", parts: parts.length ? parts : [{ text: " " }] };
  });
  const stream = await ai.models.generateContentStream({
    model: options.modelInfo!.upstreamModelId!, contents,
    config: {
      systemInstruction: options.systemInstruction,
      ...(options.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
      ...(options.modelInfo?.supportsReasoning ? { thinkingConfig: options.modelInfo.supportsReasoningToggle
        ? { thinkingBudget: options.reasoning === "none" ? 0 : -1, includeThoughts: true }
        : { thinkingLevel: options.reasoning.toUpperCase(), includeThoughts: true } } : {}),
      ...(!options.disableTools ? { tools: [{ functionDeclarations: geminiDesktopFunctionDeclarations(options.collaborationMode, options.toolEnvironment) }] } : {}),
      abortSignal: options.signal,
      httpOptions: { retryOptions: { attempts: 1 } },
    } as any,
  });
  let finish: string | undefined; let hasCalls = false;
  for await (const chunk of stream) {
    options.signal.throwIfAborted(); options.onStreamProgress?.();
    const usage = normalizeProviderUsage(chunk.usageMetadata); if (usage) options.onUsage?.(usage);
    const candidate = chunk.candidates?.[0];
    for (const part of candidate?.content?.parts || []) {
      if (part.text) (part.thought ? options.onThoughtDelta : options.onTextDelta)(part.text);
      if (part.functionCall?.name) {
        hasCalls = true;
        const call = parseDesktopToolCall(part.functionCall.name, JSON.stringify(part.functionCall.args || {}), part.functionCall.id || createToolCallId());
        if (!call) throw new ProviderStreamError({ status: "incomplete", reason: "incomplete_tool_call" });
        options.onToolCall({ ...call, thoughtSignature: part.thoughtSignature });
      }
    }
    if (candidate?.finishReason) finish = candidate.finishReason;
  }
  if (!finish) throw new ProviderStreamError({ status: "interrupted", reason: "missing_finish" });
  const outcome = normalizeFinish(finish);
  options.onStreamOutcome?.(hasCalls && outcome.status === "completed" ? { status: "tool_calls", reason: "tool_calls" } : outcome);
}
