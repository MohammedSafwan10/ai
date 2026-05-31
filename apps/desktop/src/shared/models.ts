export type ProviderId = "cliproxy" | "gemini" | "openrouter";

export type ReasoningEffort = "none" | "low" | "medium" | "high" | "extra_high";

export type PermissionMode = "ask_risky" | "yolo";

export type CollaborationMode = "default" | "plan";

export interface ModelOption {
  id: string;
  label: string;
  provider: ProviderId;
  supportsTools: boolean;
  description: string;
}

export interface ModelProviderGroup {
  id: ProviderId;
  label: string;
  description: string;
  models: ModelOption[];
}

export const GEMINI_35_FLASH_MODEL_ID = "gemini-3.5-flash";

const legacyModelReplacements: Record<string, string> = {
  "gemini-3-flash-preview": GEMINI_35_FLASH_MODEL_ID,
  "anthropic/claude-3.7-sonnet": "gpt-5.5",
  "google/gemini-2.5-pro": "gemini-3.1-pro-preview",
  "deepseek/deepseek-chat": "deepseek/deepseek-v4-flash:free",
};

export const modelProviderOrder: Array<Omit<ModelProviderGroup, "models">> = [
  {
    id: "gemini",
    label: "Gemini",
    description: "Native Google models with coding and function calling.",
  },
  {
    id: "cliproxy",
    label: "GPT / CLIProxy",
    description: "Local OpenAI-compatible routing through CLIProxy.",
  },
  {
    id: "openrouter",
    label: "OpenRouter Free",
    description: "Free OpenRouter models with tool support where advertised.",
  },
];

export const modelOptions: ModelOption[] = [
  {
    id: "gemini-3.1-flash-lite-preview",
    label: "Gemini 3.1 Flash Lite",
    provider: "gemini",
    supportsTools: true,
    description: "Lightweight Gemini option for quick local-agent turns.",
  },
  {
    id: GEMINI_35_FLASH_MODEL_ID,
    label: "Gemini 3.5 Flash",
    provider: "gemini",
    supportsTools: true,
    description: "Stable Gemini model for fast agentic, coding, and multimodal tasks.",
  },
  {
    id: "gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro",
    provider: "gemini",
    supportsTools: true,
    description: "Stronger Gemini model for harder prompts.",
  },
  {
    id: "gpt-5.5",
    label: "GPT-5.5",
    provider: "cliproxy",
    supportsTools: true,
    description: "GPT-5.5 through CLIProxy.",
  },
  {
    id: "gemini-3.5-flash-cliproxy",
    label: "Gemini 3.5 Flash (CLIProxy)",
    provider: "cliproxy",
    supportsTools: true,
    description: "Gemini 3.5 Flash through CLIProxy.",
  },
  {
    id: "gemini-3.1-pro-cliproxy",
    label: "Gemini 3.1 Pro (CLIProxy)",
    provider: "cliproxy",
    supportsTools: true,
    description: "Gemini 3.1 Pro through CLIProxy.",
  },
  {
    id: "deepseek/deepseek-v4-flash:free",
    label: "DeepSeek V4 Flash",
    provider: "openrouter",
    supportsTools: true,
    description: "Free fast DeepSeek MoE model with 1M context for coding, chat, and agent workflows.",
  },
  {
    id: "baidu/cobuddy:free",
    label: "Baidu CoBuddy",
    provider: "openrouter",
    supportsTools: true,
    description: "Free OpenRouter code-generation model for coding tasks and AI agent workflows.",
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    label: "Nemotron 3 Super",
    provider: "openrouter",
    supportsTools: true,
    description: "Free OpenRouter 120B hybrid MoE model for long-context reasoning and agent workflows.",
  },
];

export const normalizeModelId = (modelId: string | undefined) => {
  const normalizedId = modelId ? legacyModelReplacements[modelId] ?? modelId : undefined;
  return normalizedId && modelOptions.some((option) => option.id === normalizedId)
    ? normalizedId
    : GEMINI_35_FLASH_MODEL_ID;
};

export const getModelOption = (modelId: string) =>
  modelOptions.find((option) => option.id === normalizeModelId(modelId)) ?? modelOptions[1];

export const getProviderForModel = (modelId: string): ProviderId =>
  getModelOption(modelId).provider;

export const getModelProviderGroups = (): ModelProviderGroup[] =>
  modelProviderOrder
    .map((provider) => ({
      ...provider,
      models: modelOptions.filter((option) => option.provider === provider.id),
    }))
    .filter((group) => group.models.length > 0);
