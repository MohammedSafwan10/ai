import { OpenAIAdapter } from "./openai";
import { prepareCatalogModel } from "./providerCatalog";
import { catalogProviders, type CatalogProvider } from "../../../shared/providerCatalog";
import { waitWithAbort } from "../../abort";
import type { ProviderAdapter, ProviderStreamOptions } from "./types";
import { CliproxyAdapter } from "./cliproxy";
import { DeepSeekAdapter } from "./deepseek";
import { GeminiAdapter } from "./gemini";
import { OpenCodeGoAdapter } from "./opencodeGo";
import { OpenRouterAdapter } from "./openrouter";
import { reliableProviderStream } from "./reliableStream";

const adapters: Record<string, ProviderAdapter> = {
  openai: new OpenAIAdapter(),
  anthropic: new OpenCodeGoAdapter(),
  cliproxy: new CliproxyAdapter(),
  deepseek: new DeepSeekAdapter(),
  gemini: new GeminiAdapter(),
  "opencode-go": new OpenCodeGoAdapter(),
  openrouter: new OpenRouterAdapter(),
};

export const streamProviderResponse = async (options: ProviderStreamOptions) => {
  if (catalogProviders.includes(options.provider as CatalogProvider)) {
    const credential = options.provider === "openai" ? options.openaiApiKey : options.provider === "anthropic" ? options.anthropicApiKey
      : options.provider === "gemini" ? options.geminiApiKey : options.provider === "deepseek" ? options.deepseekApiKey
      : options.provider === "opencode-go" ? options.opencodeGoApiKey : options.cliproxyBaseUrl.replace(/\/$/, "");
    const model = await waitWithAbort(Promise.resolve(prepareCatalogModel(options.provider as CatalogProvider, options.model, credential)), options.signal);
    if (model) {
      if (!model.reasoningEfforts.includes(options.reasoning)) throw new Error(`Choose a supported reasoning level for ${model.label}: ${model.reasoningEfforts.join(", ")}.`);
      if (!model.supportsImageInput && options.messages.some((m) => m.parts?.some((p) => p.type === "image"))) throw new Error("This model does not have image input enabled. Choose another model or review its capabilities in Settings.");
      options = { ...options, modelInfo: model, maxOutputTokens: Math.min(options.maxOutputTokens || model.defaultOutputTokens || 16384, model.maxOutputTokens || Infinity), disableTools: options.disableTools || !model.supportsTools };
    }
  }
  return reliableProviderStream(adapters[options.provider], options);
};
