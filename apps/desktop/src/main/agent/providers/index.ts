import type { ProviderAdapter, ProviderStreamOptions } from "./types";
import { CliproxyAdapter } from "./cliproxy";
import { GeminiAdapter } from "./gemini";
import { OpenRouterAdapter } from "./openrouter";

const adapters: Record<string, ProviderAdapter> = {
  cliproxy: new CliproxyAdapter(),
  gemini: new GeminiAdapter(),
  openrouter: new OpenRouterAdapter(),
};

export const streamProviderResponse = (options: ProviderStreamOptions) =>
  adapters[options.provider].stream(options);
