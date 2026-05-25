import { openRouterModelCapabilities } from "./openrouter/models";

export type ProviderId = "gemini" | "cliproxy" | "openrouter";

export interface ModelOption {
  id: string;
  label: string;
  provider: ProviderId;
  description: string;
}

export interface ModelProviderGroup {
  id: ProviderId;
  label: string;
  description: string;
  models: ModelOption[];
}

export type ReasoningMode = "instant" | "thinking";

export const GEMINI_35_FLASH_MODEL_ID = "gemini-3.5-flash";

const legacyModelReplacements: Record<string, string> = {
  "gemini-3-flash-preview": GEMINI_35_FLASH_MODEL_ID,
};

export const modelProviderOrder: Array<Omit<ModelProviderGroup, "models">> = [
  {
    id: "gemini",
    label: "Gemini",
    description: "Native Google models with search, files, and thinking.",
  },
  {
    id: "cliproxy",
    label: "GPT / CLIProxy",
    description: "Local OpenAI-compatible routing through CLIProxy.",
  },
  {
    id: "openrouter",
    label: "OpenRouter Free",
    description: "Community text models with per-model tools and reasoning.",
  },
];

export const modelOptions: ModelOption[] = [
  {
    id: "gemini-3.1-flash-lite-preview",
    label: "Gemini 3.1 Flash Lite",
    provider: "gemini",
    description: "Fast Gemini model through Google GenAI.",
  },
  {
    id: GEMINI_35_FLASH_MODEL_ID,
    label: "Gemini 3.5 Flash",
    provider: "gemini",
    description: "Stable Gemini model for fast agentic, coding, and multimodal tasks.",
  },
  {
    id: "gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro",
    provider: "gemini",
    description: "Stronger Gemini model for harder prompts.",
  },
  {
    id: "gpt-5.5",
    label: "GPT-5.5",
    provider: "cliproxy",
    description: "GPT-5.5 through CLIProxy.",
  },
  ...openRouterModelCapabilities.map((model): ModelOption => ({
    id: model.id,
    label: model.label,
    provider: "openrouter",
    description: model.description,
  })),
];

export const getModelOption = (modelId: string) =>
  modelOptions.find((option) => option.id === modelId);

export const getModelLabel = (modelId: string) =>
  getModelOption(modelId)?.label ?? modelId;

export const getModelProviderGroups = (): ModelProviderGroup[] =>
  modelProviderOrder
    .map((provider) => ({
      ...provider,
      models: modelOptions.filter((option) => option.provider === provider.id),
    }))
    .filter((group) => group.models.length > 0);

export const isGeminiModel = (modelId: string) =>
  getModelOption(modelId)?.provider === "gemini";

export const isCliproxyModel = (modelId: string) =>
  getModelOption(modelId)?.provider === "cliproxy";

export const isOpenRouterModel = (modelId: string) =>
  getModelOption(modelId)?.provider === "openrouter";

export const getReasoningModeLabel = (provider: ProviderId | undefined, mode: ReasoningMode) => {
  if (mode === "instant") return "Instant";
  return "Medium";
};

export const normalizeModelId = (modelId: string | undefined) => {
  const normalizedId = modelId ? legacyModelReplacements[modelId] ?? modelId : undefined;
  return normalizedId && modelOptions.some((option) => option.id === normalizedId)
    ? normalizedId
    : undefined;
};
