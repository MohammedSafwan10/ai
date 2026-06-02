export type ProviderId = "cliproxy" | "gemini" | "openrouter" | "privora-cloud";

export type ReasoningEffort = "none" | "low" | "medium" | "high" | "extra_high";

export type PermissionMode = "ask_risky" | "yolo";

export type CollaborationMode = "default" | "plan";

export interface ModelOption {
  id: string;
  label: string;
  provider: ProviderId;
  supportsTools: boolean;
  supportsImageInput: boolean;
  supportsReasoning: boolean;
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  defaultOutputTokens?: number;
  upstreamModelId?: string;
  deprecatedReplacementId?: string;
  description: string;
}

export interface ModelProviderGroup {
  id: ProviderId;
  label: string;
  description: string;
  models: ModelOption[];
}

export const GEMINI_35_FLASH_MODEL_ID = "gemini-3.5-flash";
export const GEMINI_31_FLASH_LITE_MODEL_ID = "gemini-3.1-flash-lite";
export const PRIVORA_DEEPSEEK_V4_FLASH_MODEL_ID = "privora/deepseek-v4-flash";
export const PRIVORA_DEEPSEEK_V4_PRO_MODEL_ID = "privora/deepseek-v4-pro";
export const PRIVORA_MINIMAX_M3_MODEL_ID = "privora/minimax-m3";

const legacyModelReplacements: Record<string, string> = {
  "gemini-3-flash-preview": GEMINI_35_FLASH_MODEL_ID,
  "gemini-3.1-flash-lite-preview": GEMINI_31_FLASH_LITE_MODEL_ID,
  "anthropic/claude-3.7-sonnet": "gpt-5.5",
  "google/gemini-2.5-pro": "gemini-3.1-pro-preview",
  "deepseek/deepseek-chat": "deepseek/deepseek-v4-flash:free",
};

const GPT_55_CONTEXT_TOKENS = 1_050_000;
const GPT_55_MAX_OUTPUT_TOKENS = 128_000;
const GEMINI_LONG_CONTEXT_TOKENS = 1_048_576;
const GEMINI_MAX_OUTPUT_TOKENS = 65_536;

const geminiLongContext = {
  supportsImageInput: true,
  supportsReasoning: true,
  contextWindowTokens: GEMINI_LONG_CONTEXT_TOKENS,
  maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
} satisfies Partial<ModelOption>;

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
  {
    id: "privora-cloud",
    label: "Privora Cloud",
    description: "Hosted Privora AI credits. BYOK usage does not consume credits.",
  },
];

export const modelOptions: ModelOption[] = [
  {
    id: GEMINI_31_FLASH_LITE_MODEL_ID,
    label: "Gemini 3.1 Flash Lite",
    provider: "gemini",
    supportsTools: true,
    ...geminiLongContext,
    defaultOutputTokens: 16_000,
    description: "Lightweight Gemini option for quick local-agent turns.",
  },
  {
    id: GEMINI_35_FLASH_MODEL_ID,
    label: "Gemini 3.5 Flash",
    provider: "gemini",
    supportsTools: true,
    ...geminiLongContext,
    defaultOutputTokens: 32_000,
    description: "Stable Gemini model for fast agentic, coding, and multimodal tasks.",
  },
  {
    id: "gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro",
    provider: "gemini",
    supportsTools: true,
    ...geminiLongContext,
    defaultOutputTokens: 32_000,
    description: "Stronger Gemini model for harder prompts.",
  },
  {
    id: "gpt-5.5",
    label: "GPT-5.5",
    provider: "cliproxy",
    supportsTools: true,
    supportsImageInput: true,
    supportsReasoning: true,
    contextWindowTokens: GPT_55_CONTEXT_TOKENS,
    maxOutputTokens: GPT_55_MAX_OUTPUT_TOKENS,
    defaultOutputTokens: 32_000,
    description: "GPT-5.5 through CLIProxy.",
  },
  {
    id: "gemini-3.5-flash-cliproxy",
    label: "Gemini 3.5 Flash (CLIProxy)",
    provider: "cliproxy",
    supportsTools: true,
    ...geminiLongContext,
    defaultOutputTokens: 32_000,
    upstreamModelId: "gemini-3-flash-agent",
    description: "Gemini 3.5 Flash through CLIProxy.",
  },
  {
    id: "gemini-3.1-pro-cliproxy",
    label: "Gemini 3.1 Pro (CLIProxy)",
    provider: "cliproxy",
    supportsTools: true,
    ...geminiLongContext,
    defaultOutputTokens: 32_000,
    upstreamModelId: "gemini-pro-agent",
    description: "Gemini 3.1 Pro through CLIProxy.",
  },
  {
    id: "deepseek/deepseek-v4-flash:free",
    label: "DeepSeek V4 Flash",
    provider: "openrouter",
    supportsTools: true,
    supportsImageInput: false,
    supportsReasoning: true,
    contextWindowTokens: 1_000_000,
    description: "Free fast DeepSeek MoE model with 1M context for coding, chat, and agent workflows.",
  },
  {
    id: "baidu/cobuddy:free",
    label: "Baidu CoBuddy",
    provider: "openrouter",
    supportsTools: true,
    supportsImageInput: false,
    supportsReasoning: true,
    description: "Free OpenRouter code-generation model for coding tasks and AI agent workflows.",
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    label: "Nemotron 3 Super",
    provider: "openrouter",
    supportsTools: true,
    supportsImageInput: false,
    supportsReasoning: true,
    description: "Free OpenRouter 120B hybrid MoE model for long-context reasoning and agent workflows.",
  },
  {
    id: PRIVORA_DEEPSEEK_V4_FLASH_MODEL_ID,
    label: "DeepSeek V4 Flash",
    provider: "privora-cloud",
    supportsTools: true,
    supportsImageInput: false,
    supportsReasoning: true,
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 8_192,
    defaultOutputTokens: 4_096,
    upstreamModelId: "deepseek/deepseek-v4-flash",
    description: "Fast hosted Privora model. Uses AI credits unless you switch to BYOK.",
  },
  {
    id: PRIVORA_DEEPSEEK_V4_PRO_MODEL_ID,
    label: "DeepSeek V4 Pro",
    provider: "privora-cloud",
    supportsTools: true,
    supportsImageInput: false,
    supportsReasoning: true,
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 8_192,
    defaultOutputTokens: 4_096,
    upstreamModelId: "deepseek/deepseek-v4-pro",
    description: "Stronger hosted Privora model. Uses AI credits unless you switch to BYOK.",
  },
  {
    id: PRIVORA_MINIMAX_M3_MODEL_ID,
    label: "MiniMax M3",
    provider: "privora-cloud",
    supportsTools: true,
    supportsImageInput: false,
    supportsReasoning: true,
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 8_192,
    defaultOutputTokens: 4_096,
    upstreamModelId: "minimax/minimax-m3",
    description: "Hosted long-context Privora model. Uses AI credits unless you switch to BYOK.",
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

export type ModelRuntimeBudgetMode = "normal" | "large_context";

export interface ModelRuntimeBudget {
  mode: ModelRuntimeBudgetMode;
  contextWindowTokens?: number;
  outputTokens?: number;
  hardInputBudgetTokens?: number;
  inputBudgetTokens?: number;
  messageCharLimit: number;
  toolResultCharLimit: number;
  toolErrorCharLimit: number;
}

export const resolveModelRuntimeBudget = (
  modelId: string | undefined,
  mode: ModelRuntimeBudgetMode = "normal",
): ModelRuntimeBudget => {
  const model = getModelOption(modelId || GEMINI_35_FLASH_MODEL_ID);
  const contextWindowTokens = model.contextWindowTokens;
  const maxOutputTokens = model.maxOutputTokens;
  const defaultOutputTokens = model.defaultOutputTokens;
  const outputTokens = maxOutputTokens && defaultOutputTokens
    ? Math.min(defaultOutputTokens, maxOutputTokens)
    : defaultOutputTokens;

  const safetyReserve = contextWindowTokens ? Math.max(8_000, Math.floor(contextWindowTokens * 0.05)) : undefined;
  const hardInputBudgetTokens = contextWindowTokens
    ? Math.max(8_000, contextWindowTokens - (outputTokens || 0) - (safetyReserve || 0))
    : undefined;
  const inputBudgetTokens = hardInputBudgetTokens
    ? mode === "large_context"
      ? hardInputBudgetTokens
      : Math.min(hardInputBudgetTokens, 350_000)
    : 28_000;

  return {
    mode,
    contextWindowTokens,
    outputTokens,
    hardInputBudgetTokens,
    inputBudgetTokens,
    messageCharLimit: mode === "large_context" ? 40_000 : 12_000,
    toolResultCharLimit: mode === "large_context" ? 60_000 : 20_000,
    toolErrorCharLimit: 6_000,
  };
};

export const getModelProviderGroups = (): ModelProviderGroup[] =>
  modelProviderOrder
    .map((provider) => ({
      ...provider,
      models: modelOptions.filter((option) => option.provider === provider.id),
    }))
    .filter((group) => group.models.length > 0);
