import { getModelOption } from "../../../lib/models";
import { getOpenRouterModelCapabilities } from "../../../lib/openrouter/models";

export interface ModelRuntimeLimits {
  contextWindow: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsThinking: boolean;
  supportsImages: boolean;
}

const fallbackLimits: ModelRuntimeLimits = {
  contextWindow: 128000,
  maxOutputTokens: 8192,
  supportsTools: true,
  supportsThinking: false,
  supportsImages: false,
};

const staticLimits: Record<string, ModelRuntimeLimits> = {
  "gemini-3.1-flash-lite-preview": {
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    supportsTools: true,
    supportsThinking: true,
    supportsImages: true,
  },
  "gemini-3.5-flash": {
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    supportsTools: true,
    supportsThinking: true,
    supportsImages: true,
  },
  "gemini-3.1-pro-preview": {
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    supportsTools: true,
    supportsThinking: true,
    supportsImages: true,
  },
  "gpt-5.5": {
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    supportsTools: true,
    supportsThinking: true,
    supportsImages: true,
  },
};

export const getModelRuntimeLimits = (modelId: string): ModelRuntimeLimits => {
  if (staticLimits[modelId]) return staticLimits[modelId];
  const option = getModelOption(modelId);
  if (option?.provider === "openrouter") {
    const capabilities = getOpenRouterModelCapabilities(modelId);
    return {
      contextWindow: capabilities?.contextLength || fallbackLimits.contextWindow,
      maxOutputTokens: capabilities?.maxCompletionTokens || fallbackLimits.maxOutputTokens,
      supportsTools: Boolean(capabilities?.supportsTools),
      supportsThinking: Boolean(capabilities?.supportsReasoning),
      supportsImages: Boolean(capabilities?.inputModalities.includes("image")),
    };
  }
  return {
    ...fallbackLimits,
    supportsTools: true,
    supportsThinking: true,
    supportsImages: true,
  };
};

export const getSafeWebDevMaxOutput = (modelId: string, estimatedInputTokens: number) => {
  const limits = getModelRuntimeLimits(modelId);
  const safety = Math.max(1200, Math.floor(limits.contextWindow * 0.01));
  const available = limits.contextWindow - estimatedInputTokens - safety;
  return Math.max(1024, Math.min(limits.maxOutputTokens, available));
};
