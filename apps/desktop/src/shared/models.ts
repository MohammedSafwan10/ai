export type ProviderId = "cliproxy" | "gemini" | "openrouter" | "privora-cloud";

export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export type PermissionMode = "ask_risky" | "yolo";

export type CollaborationMode = "default" | "plan";

export type AgentHarnessMode = "standard" | "review_swarm";

export interface ModelOption {
  id: string;
  label: string;
  provider: ProviderId;
  supportsTools: boolean;
  supportsImageInput: boolean;
  supportsReasoning: boolean;
  reasoningEfforts: ReasoningEffort[];
  defaultReasoningEffort: ReasoningEffort;
  reasoningControl?: "effort" | "toggle";
  inputLimitTokens?: number;
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  defaultOutputTokens?: number;
  upstreamModelId?: string;
  description: string;
}

export interface ModelProviderGroup {
  id: ProviderId;
  label: string;
  description: string;
  models: ModelOption[];
}

export const GEMINI_36_FLASH_MODEL_ID = "gemini-3.6-flash";
export const OPENROUTER_DEEPSEEK_V4_FLASH_MODEL_ID = "deepseek/deepseek-v4-flash";
export const OPENROUTER_MINIMAX_M3_MODEL_ID = "minimax/minimax-m3";
export const PRIVORA_DEEPSEEK_V4_FLASH_MODEL_ID = "privora/deepseek-v4-flash";
export const PRIVORA_DEEPSEEK_V4_PRO_MODEL_ID = "privora/deepseek-v4-pro";
export const PRIVORA_MINIMAX_M3_MODEL_ID = "privora/minimax-m3";
export const GPT_56_SOL_MODEL_ID = "gpt-5.6-sol";
export const GPT_56_TERRA_MODEL_ID = "gpt-5.6-terra";
export const GPT_56_LUNA_MODEL_ID = "gpt-5.6-luna";

const GPT_56_SOL_TERRA_CONTEXT_TOKENS = 1_050_000;
const GPT_56_MAX_OUTPUT_TOKENS = 128_000;
const GEMINI_LONG_CONTEXT_TOKENS = 1_048_576;
const GEMINI_MAX_OUTPUT_TOKENS = 65_536;
const OPENROUTER_DEFAULT_OUTPUT_TOKENS = 4_096;

const geminiLongContext = {
  supportsImageInput: true,
  supportsReasoning: true,
  reasoningEfforts: ["minimal", "low", "medium", "high"],
  defaultReasoningEffort: "medium",
  inputLimitTokens: GEMINI_LONG_CONTEXT_TOKENS,
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
    label: "OpenRouter BYOK",
    description: "OpenRouter models using your saved API key.",
  },
  {
    id: "privora-cloud",
    label: "Privora Cloud",
    description: "Hosted Privora AI credits. BYOK usage does not consume credits.",
  },
];

export const modelOptions: ModelOption[] = [
  {
    id: GEMINI_36_FLASH_MODEL_ID,
    label: "Gemini 3.6 Flash",
    provider: "gemini",
    supportsTools: true,
    ...geminiLongContext,
    defaultOutputTokens: 32_000,
    description: "Latest stable Gemini Flash model for agentic, coding, and multimodal tasks.",
  },
  {
    id: GPT_56_SOL_MODEL_ID,
    label: "GPT-5.6 Sol",
    provider: "cliproxy",
    supportsTools: true,
    supportsImageInput: true,
    supportsReasoning: true,
    reasoningEfforts: ["none", "low", "medium", "high", "xhigh", "max"],
    defaultReasoningEffort: "medium",
    contextWindowTokens: GPT_56_SOL_TERRA_CONTEXT_TOKENS,
    maxOutputTokens: GPT_56_MAX_OUTPUT_TOKENS,
    defaultOutputTokens: 32_000,
    description: "Flagship GPT-5.6 model through CLIProxy.",
  },
  {
    id: GPT_56_TERRA_MODEL_ID,
    label: "GPT-5.6 Terra",
    provider: "cliproxy",
    supportsTools: true,
    supportsImageInput: true,
    supportsReasoning: true,
    reasoningEfforts: ["none", "low", "medium", "high", "xhigh", "max"],
    defaultReasoningEffort: "medium",
    contextWindowTokens: GPT_56_SOL_TERRA_CONTEXT_TOKENS,
    maxOutputTokens: GPT_56_MAX_OUTPUT_TOKENS,
    defaultOutputTokens: 32_000,
    description: "Balanced GPT-5.6 model through CLIProxy.",
  },
  {
    id: GPT_56_LUNA_MODEL_ID,
    label: "GPT-5.6 Luna",
    provider: "cliproxy",
    supportsTools: true,
    supportsImageInput: true,
    supportsReasoning: true,
    reasoningEfforts: ["none", "low", "medium", "high", "xhigh", "max"],
    defaultReasoningEffort: "medium",
    contextWindowTokens: GPT_56_SOL_TERRA_CONTEXT_TOKENS,
    maxOutputTokens: GPT_56_MAX_OUTPUT_TOKENS,
    defaultOutputTokens: 32_000,
    description: "Efficient high-volume GPT-5.6 model through CLIProxy.",
  },
  {
    id: OPENROUTER_DEEPSEEK_V4_FLASH_MODEL_ID,
    label: "DeepSeek V4 Flash",
    provider: "openrouter",
    supportsTools: true,
    supportsImageInput: false,
    supportsReasoning: true,
    reasoningEfforts: ["none", "high", "xhigh"],
    defaultReasoningEffort: "high",
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 393_216,
    defaultOutputTokens: OPENROUTER_DEFAULT_OUTPUT_TOKENS,
    description: "Fast DeepSeek MoE model with 1M context through your OpenRouter key.",
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    label: "Nemotron 3 Super",
    provider: "openrouter",
    supportsTools: true,
    supportsImageInput: false,
    supportsReasoning: true,
    reasoningEfforts: ["none", "low", "medium"],
    defaultReasoningEffort: "medium",
    contextWindowTokens: 262_144,
    maxOutputTokens: 262_144,
    defaultOutputTokens: OPENROUTER_DEFAULT_OUTPUT_TOKENS,
    description: "Free OpenRouter 120B hybrid MoE model for long-context reasoning and agent workflows.",
  },
  {
    id: OPENROUTER_MINIMAX_M3_MODEL_ID,
    label: "MiniMax M3",
    provider: "openrouter",
    supportsTools: true,
    supportsImageInput: true,
    supportsReasoning: true,
    reasoningEfforts: ["none", "medium"],
    defaultReasoningEffort: "medium",
    reasoningControl: "toggle",
    contextWindowTokens: 524_288,
    maxOutputTokens: 512_000,
    defaultOutputTokens: OPENROUTER_DEFAULT_OUTPUT_TOKENS,
    description: "Multimodal long-context MiniMax model through your OpenRouter key.",
  },
  {
    id: PRIVORA_DEEPSEEK_V4_FLASH_MODEL_ID,
    label: "DeepSeek V4 Flash",
    provider: "privora-cloud",
    supportsTools: true,
    supportsImageInput: false,
    supportsReasoning: true,
    reasoningEfforts: ["none", "high", "xhigh"],
    defaultReasoningEffort: "high",
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 8_192,
    defaultOutputTokens: 2_048,
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
    reasoningEfforts: ["none", "high", "xhigh"],
    defaultReasoningEffort: "high",
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 8_192,
    defaultOutputTokens: 2_048,
    upstreamModelId: "deepseek/deepseek-v4-pro",
    description: "Stronger hosted Privora model. Uses AI credits unless you switch to BYOK.",
  },
  {
    id: PRIVORA_MINIMAX_M3_MODEL_ID,
    label: "MiniMax M3",
    provider: "privora-cloud",
    supportsTools: true,
    supportsImageInput: true,
    supportsReasoning: true,
    reasoningEfforts: ["none", "medium"],
    defaultReasoningEffort: "medium",
    reasoningControl: "toggle",
    contextWindowTokens: 524_288,
    maxOutputTokens: 8_192,
    defaultOutputTokens: 2_048,
    upstreamModelId: "minimax/minimax-m3",
    description: "Hosted long-context Privora model. Uses AI credits unless you switch to BYOK.",
  },
];

export const normalizeModelId = (modelId: string | undefined) => {
  const normalizedId = modelId?.trim();
  return normalizedId || GEMINI_36_FLASH_MODEL_ID;
};

export const findModelOption = (modelId: string | undefined) =>
  modelOptions.find((option) => option.id === normalizeModelId(modelId));

export const getModelOption = (modelId: string) => {
  const model = findModelOption(modelId);
  if (!model) throw new Error(`Unknown or removed model: ${modelId}`);
  return model;
};

export const getProviderForModel = (modelId: string): ProviderId =>
  getModelOption(modelId).provider;

export const modelSupportsReasoningEffort = (modelId: string, effort: ReasoningEffort) =>
  getModelOption(modelId).reasoningEfforts.includes(effort);

export const assertModelSupportsReasoningEffort = (modelId: string, effort: ReasoningEffort) => {
  const model = getModelOption(modelId);
  if (model.reasoningEfforts.includes(effort)) return;
  throw new Error(`${model.label} does not support ${effort} reasoning. Choose one of: ${model.reasoningEfforts.join(", ")}.`);
};

export type ModelRuntimeBudgetMode = "normal" | "large_context";

export interface ModelRuntimeBudget {
  mode: ModelRuntimeBudgetMode;
  contextWindowTokens?: number;
  outputTokens?: number;
  safetyReserveTokens?: number;
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
  const model = getModelOption(modelId || GEMINI_36_FLASH_MODEL_ID);
  const contextWindowTokens = model.contextWindowTokens;
  const maxOutputTokens = model.maxOutputTokens;
  const defaultOutputTokens = model.defaultOutputTokens;
  const outputTokens = maxOutputTokens && defaultOutputTokens
    ? Math.min(defaultOutputTokens, maxOutputTokens)
    : defaultOutputTokens;

  const safetyReserve = contextWindowTokens ? Math.max(8_000, Math.floor(contextWindowTokens * 0.03)) : undefined;
  const hardInputBudgetTokens = contextWindowTokens
    ? Math.max(8_000, contextWindowTokens - (outputTokens || 0) - (safetyReserve || 0))
    : undefined;
  const inputBudgetTokens = hardInputBudgetTokens ?? 28_000;

  return {
    mode,
    contextWindowTokens,
    outputTokens,
    safetyReserveTokens: safetyReserve,
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
