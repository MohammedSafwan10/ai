import { ResponsesToolCallTracker, responsesTextDelta, responsesThoughtDelta, toResponsesInput } from "./cliproxy";
import { desktopToolDefinitionsForMode } from "../tools/definitions";
import { ProviderRequestError } from "./requestError";
import { readSse } from "./sse";
import { normalizeProviderUsage } from "./usage";
import { emitResponsesDisposition } from "./disposition";
import type { ProviderAdapter, ProviderStreamOptions } from "./types";
export class OpenAIAdapter implements ProviderAdapter {
  async stream(options: ProviderStreamOptions) {
    if (!options.openaiApiKey) throw new Error("Save an OpenAI API key in Settings > Providers.");
    const model = options.modelInfo;
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", redirect: "error", signal: options.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.openaiApiKey}` },
      body: JSON.stringify({
        model: model?.upstreamModelId || options.model, instructions: options.systemInstruction,
        input: options.messages.flatMap((message) => [
          ...(message.parts || []).flatMap((p) => p.type === "reasoning" && p.responsesItem ? [p.responsesItem] : []),
          ...toResponsesInput([message]),
        ]), stream: true, store: false, include: ["reasoning.encrypted_content"],
        ...(!options.disableTools ? { tools: desktopToolDefinitionsForMode(options.collaborationMode, options.toolEnvironment) } : {}),
        ...(options.maxOutputTokens ? { max_output_tokens: options.maxOutputTokens } : {}),
        ...(model?.supportsReasoning ? { reasoning: { effort: options.reasoning, ...(options.reasoning !== "none" ? { summary: "auto" } : {}) } } : {}),
      }),
    });
    if (!response.ok) { await response.body?.cancel(); throw new ProviderRequestError(`OpenAI request failed (HTTP ${response.status}). Check the API key, model access, and API billing in your OpenAI account.`, response.status, response.headers.get("retry-after")); }
    const calls = new ResponsesToolCallTracker(options);
    await readSse(response, (event, raw) => {
      const data = JSON.parse(raw);
      const usage = normalizeProviderUsage(data.usage || data.response?.usage); if (usage) options.onUsage?.(usage);
      emitResponsesDisposition(options, event, data);
      const text = responsesTextDelta(event, data); if (text) options.onTextDelta(text);
      const thought = responsesThoughtDelta(event, data); if (thought) options.onThoughtDelta(thought);
      if (data.type === "response.output_item.done" && data.item?.type === "reasoning" && typeof data.item.encrypted_content === "string") {
        options.onProviderContextPart?.({ type: "reasoning", text: "", responsesItem: { id: data.item.id, type: "reasoning", summary: Array.isArray(data.item.summary) ? data.item.summary : [], encrypted_content: data.item.encrypted_content } });
      }
      calls.consume(event, data);
    }, options.onStreamProgress, options.onStreamOutcome);
    calls.assertComplete();
  }
}
