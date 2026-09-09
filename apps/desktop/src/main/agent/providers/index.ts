import type { ProviderAdapter, ProviderStreamOptions } from "./types";
import { CliproxyAdapter } from "./cliproxy";
import { DeepSeekAdapter } from "./deepseek";
import { GeminiAdapter } from "./gemini";
import { OpenCodeGoAdapter } from "./opencodeGo";
import { OpenRouterAdapter } from "./openrouter";
import { PrivoraCloudAdapter } from "./privoraCloud";

const adapters: Record<string, ProviderAdapter> = {
  cliproxy: new CliproxyAdapter(),
  deepseek: new DeepSeekAdapter(),
  gemini: new GeminiAdapter(),
  "opencode-go": new OpenCodeGoAdapter(),
  openrouter: new OpenRouterAdapter(),
  "privora-cloud": new PrivoraCloudAdapter(),
};

export const streamProviderResponse = (options: ProviderStreamOptions) =>
  adapters[options.provider].stream(options);
