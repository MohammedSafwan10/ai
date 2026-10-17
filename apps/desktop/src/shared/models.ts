import { findCatalogModel } from "./providerCatalog";
export type ProviderId = "openai" | "anthropic" | "cliproxy" | "gemini" | "openrouter" | "deepseek" | "opencode-go";

import { OPENCODE_GO_DEFAULT_OUTPUT_TOKENS, OPENCODE_GO_ID_PREFIX, isGoModelId, synthesizeGoModelOption } from "./opencodeGo";
import { findRegisteredOpenRouterModel } from "./openRouterModels";

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
  supportedParameters?: string[];
  unavailable?: boolean;
}

export interface ModelProviderGroup {
  id: ProviderId;
  label: string;
  description: string;
  models: ModelOption[];
}

export const GEMINI_37_FLASH_MODEL_ID = "gemini-3.7-flash";
export const DEEPSEEK_V41_FLASH_EXP_MODEL_ID = "deepseek-v4.1-flash-expires-on-0910";
export const DEEPSEEK_V4_FLASH_VISION_EXP_MODEL_ID = "deepseek-v4-flash-vision-exp";
export const OPENCODE_GO_DEEPSEEK_V41_FLASH_MODEL_ID = "opencode-go/deepseek-v4.1-flash";
export const OPENCODE_GO_DEEPSEEK_V4_FLASH_MODEL_ID = "opencode-go/deepseek-v4-flash";
export const OPENCODE_GO_DEEPSEEK_V4_PRO_MODEL_ID = "opencode-go/deepseek-v4-pro";
export const OPENCODE_GO_DEEPSEEK_VISION_EXP_MODEL_ID = "opencode-go/deepseek-v4-flash-vision-exp";
export const OPENCODE_GO_KIMI_K27_CODE_MODEL_ID = "opencode-go/kimi-k2.7-code";
export const OPENCODE_GO_KIMI_K3_MODEL_ID = "opencode-go/kimi-k3";
export const OPENCODE_GO_GLM_52_MODEL_ID = "opencode-go/glm-5.2";
export const OPENCODE_GO_GPT_56_LUNA_MODEL_ID = "opencode-go/gpt-5.6-luna";
export const OPENCODE_GO_MINIMAX_M3_MODEL_ID = "opencode-go/minimax-m3";
export const OPENCODE_GO_GROK_46_MODEL_ID = "opencode-go/grok-4.6";
export const OPENCODE_GO_MUSE_SPK_13_MODEL_ID = "opencode-go/muse-spark-1.3-contributor";
export const OPENCODE_GO_GPT_6_LUNA_MODEL_ID = "opencode-go/gpt-6-luna";
export const OPENCODE_GO_HAIKU_55_MODEL_ID = "opencode-go/claude-haiku-5-5";
export const GPT_56_SOL_MODEL_ID = "gpt-5.6-sol";
export const GPT_56_TERRA_MODEL_ID = "gpt-5.6-terra";
export const GPT_56_LUNA_MODEL_ID = "gpt-5.6-luna";

const GPT_56_SOL_TERRA_CONTEXT_TOKENS = 1_050_000;
const GPT_56_MAX_OUTPUT_TOKENS = 128_000;
const GEMINI_LONG_CONTEXT_TOKENS = 1_048_576;
const GEMINI_MAX_OUTPUT_TOKENS = 65_536;

const geminiLongContext = {
  supportsImageInput: true,
  supportsReasoning: true,
  reasoningEfforts: ["low", "medium", "high"],
  defaultReasoningEffort: "medium",
  inputLimitTokens: GEMINI_LONG_CONTEXT_TOKENS,
  contextWindowTokens: GEMINI_LONG_CONTEXT_TOKENS,
  maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
} satisfies Partial<ModelOption>;

const modelProviderOrder: Array<Omit<ModelProviderGroup, "models">> = [
  {
    id: "gemini",
    label: "Gemini",
    description: "Native Google models with coding and function calling.",
  },
  {
    id: "deepseek",
    label: "DeepSeek BYOK",
    description: "Direct DeepSeek API (api.deepseek.com) using your saved key.",
  },
  {
    id: "opencode-go",
    label: "OpenCode Go",
    description: "$10/mo subscription gateway. Uses your own Go account and its provider limits.",
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
];

// Compatibility metadata for existing chats. These entries are never a picker
// roster; current availability and inference are governed by provider catalogs.
const modelOptions: ModelOption[] = [
  {
    id: GEMINI_37_FLASH_MODEL_ID,
    label: "Gemini 3.7 Flash",
    provider: "gemini",
    supportsTools: true,
    ...geminiLongContext,
    defaultOutputTokens: 32_000,
    description: "Latest stable Gemini Flash model for agentic, coding, and multimodal tasks.",
  },
  {
    id: OPENCODE_GO_DEEPSEEK_V41_FLASH_MODEL_ID,
    label: "DeepSeek V4.1 Flash (Go)",
    provider: "opencode-go",
    supportsTools: true,
    supportsImageInput: true,
    supportsReasoning: true,
    reasoningEfforts: ["none", "high", "xhigh"],
    defaultReasoningEffort: "high",
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 131_072,
    defaultOutputTokens: OPENCODE_GO_DEFAULT_OUTPUT_TOKENS,
    upstreamModelId: "deepseek-v4.1-flash",
    description: "DeepSeek V4.1 Flash through OpenCode Go. Context and output limits use Go family defaults.",
  },
  {
    id: OPENCODE_GO_KIMI_K27_CODE_MODEL_ID,
    label: "Kimi K2.7 Code (Go)",
    provider: "opencode-go",
    supportsTools: true,
    supportsImageInput: true,
    supportsReasoning: true,
    reasoningEfforts: ["none", "high"],
    defaultReasoningEffort: "high",
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 32_768,
    defaultOutputTokens: OPENCODE_GO_DEFAULT_OUTPUT_TOKENS,
    upstreamModelId: "kimi-k2.7-code",
    description: "Native-vision agentic coding model through your Go subscription.",
  },
  {
    id: OPENCODE_GO_KIMI_K3_MODEL_ID,
    label: "Kimi K3 (Go)",
    provider: "opencode-go",
    supportsTools: true,
    supportsImageInput: true,
    supportsReasoning: true,
    reasoningEfforts: ["none", "high"],
    defaultReasoningEffort: "high",
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 32_768,
    defaultOutputTokens: OPENCODE_GO_DEFAULT_OUTPUT_TOKENS,
    upstreamModelId: "kimi-k3",
    description: "Native-vision premium agentic coding model through your Go subscription.",
  },
  {
    id: OPENCODE_GO_GLM_52_MODEL_ID,
    label: "GLM-5.2 (Go)",
    provider: "opencode-go",
    supportsTools: true,
    supportsImageInput: false,
    supportsReasoning: true,
    reasoningEfforts: ["none", "high"],
    defaultReasoningEffort: "high",
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 65_536,
    defaultOutputTokens: OPENCODE_GO_DEFAULT_OUTPUT_TOKENS,
    upstreamModelId: "glm-5.2",
    description: "Long-context reasoning model through your Go subscription.",
  },
  {
    id: OPENCODE_GO_GPT_56_LUNA_MODEL_ID,
    label: "GPT-5.6 Luna (Go)",
    provider: "opencode-go",
    supportsTools: true,
    supportsImageInput: true,
    supportsReasoning: true,
    reasoningEfforts: ["none", "low", "medium", "high"],
    defaultReasoningEffort: "medium",
    contextWindowTokens: GPT_56_SOL_TERRA_CONTEXT_TOKENS,
    maxOutputTokens: GPT_56_MAX_OUTPUT_TOKENS,
    defaultOutputTokens: OPENCODE_GO_DEFAULT_OUTPUT_TOKENS,
    upstreamModelId: "gpt-5.6-luna",
    description: "Frontier coding model via the Go Responses route. Billed to Go caps.",
  },
  {
    id: OPENCODE_GO_MINIMAX_M3_MODEL_ID,
    label: "MiniMax M3 (Go)",
    provider: "opencode-go",
    supportsTools: true,
    supportsImageInput: true,
    supportsReasoning: true,
    reasoningEfforts: ["none", "medium"],
    defaultReasoningEffort: "medium",
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 32_768,
    defaultOutputTokens: OPENCODE_GO_DEFAULT_OUTPUT_TOKENS,
    upstreamModelId: "minimax-m3",
    description: "Native-multimodal long-context model via the Go Messages route. Billed to Go caps.",
  },
  {
    id: OPENCODE_GO_GROK_46_MODEL_ID,
    label: "Grok 4.6 (Go)",
    provider: "opencode-go",
    supportsTools: true,
    supportsImageInput: true,
    supportsReasoning: true,
    reasoningEfforts: ["none", "high"],
    defaultReasoningEffort: "high",
    contextWindowTokens: 500_000,
    maxOutputTokens: 32_768,
    defaultOutputTokens: OPENCODE_GO_DEFAULT_OUTPUT_TOKENS,
    upstreamModelId: "grok-4.6",
    description: "Frontier reasoning model via the Go Responses route. Billed to Go caps.",
  },
  {
    id: OPENCODE_GO_GPT_6_LUNA_MODEL_ID,
    label: "GPT-6 Luna (Go)", provider: "opencode-go",
    supportsTools: true, supportsImageInput: true, supportsReasoning: true,
    reasoningEfforts: ["none", "low", "medium", "high", "xhigh", "max"], defaultReasoningEffort: "none",
    contextWindowTokens: 1_050_000, maxOutputTokens: 128_000, defaultOutputTokens: OPENCODE_GO_DEFAULT_OUTPUT_TOKENS,
    upstreamModelId: "gpt-6-luna",
    description: "Efficient coding and agent model through Go's Responses route. Go usage limits apply.",
  },
  {
    id: OPENCODE_GO_HAIKU_55_MODEL_ID,
    label: "Claude Haiku 5.5 (Go)", provider: "opencode-go",
    supportsTools: true, supportsImageInput: true, supportsReasoning: true,
    reasoningEfforts: ["none", "low", "medium", "high", "xhigh", "max"], defaultReasoningEffort: "none",
    contextWindowTokens: 1_000_000, maxOutputTokens: 128_000, defaultOutputTokens: OPENCODE_GO_DEFAULT_OUTPUT_TOKENS,
    upstreamModelId: "claude-haiku-5-5",
    description: "Fast multimodal Claude with adaptive thinking through Go's Messages route. Go usage limits apply.",
  },
  {
    id: OPENCODE_GO_MUSE_SPK_13_MODEL_ID,
    label: "Muse Spark 1.3 Contributor (Go)",
    provider: "opencode-go",
    supportsTools: true,
    supportsImageInput: true,
    supportsReasoning: true,
    reasoningEfforts: ["minimal", "low", "medium", "high", "xhigh"],
    defaultReasoningEffort: "medium",
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 32_768,
    defaultOutputTokens: OPENCODE_GO_DEFAULT_OUTPUT_TOKENS,
    upstreamModelId: "muse-spark-1.3-contributor",
    description: "Native-multimodal ultra-low-cost model via the Go Responses route. Prompts may train future Meta models.",
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

];

export const normalizeModelId = (modelId: string | undefined) => {
  const normalizedId = modelId?.trim();
  if (findCatalogModel(normalizedId)) return normalizedId!;
  if (findRegisteredOpenRouterModel(normalizedId)) return normalizedId!;
  return normalizedId || GEMINI_37_FLASH_MODEL_ID;
};

export const findModelOption = (modelId: string | undefined) => {
  const live = findCatalogModel(modelId);
  if (live) return live;
  const discovered = findRegisteredOpenRouterModel(modelId);
  if (discovered) return discovered;
  const normalizedId = normalizeModelId(modelId);
  return modelOptions.find((option) => option.id === normalizedId)
    // Auto-discovered Go models resolve with safe family defaults so new
    // roster entries work without a client update.
    || (isGoModelId(normalizedId) ? synthesizeGoModelOption(normalizedId) : null)
    || undefined;
};

export const getModelOption = (modelId: string) => {
  const model = findModelOption(modelId);
  if (!model) throw new Error(`Unknown or removed model: ${modelId}`);
  return model;
};

export const getProviderForModel = (modelId: string): ProviderId =>
  getModelOption(modelId).provider;

export const assertModelSupportsReasoningEffort = (modelId: string, effort: ReasoningEffort) => {
  const model = getModelOption(modelId);
  if (model.reasoningControl === "toggle" && model.supportsReasoning && effort !== "none") return;
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
  const model = getModelOption(modelId || GEMINI_37_FLASH_MODEL_ID);
  const contextWindowTokens = model.contextWindowTokens;
  const maxOutputTokens = model.maxOutputTokens;
  const defaultOutputTokens = model.defaultOutputTokens;
  const outputTokens = maxOutputTokens && defaultOutputTokens
    ? Math.min(defaultOutputTokens, maxOutputTokens)
    : defaultOutputTokens;

  const safetyReserve = contextWindowTokens ? Math.min(Math.max(8_000, Math.floor(contextWindowTokens * 0.03)), Math.floor(contextWindowTokens * 0.2)) : undefined;
  const hardInputBudgetTokens = contextWindowTokens
    ? Math.max(1, contextWindowTokens - (outputTokens || 0) - (safetyReserve || 0))
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

// Historical model definitions above are retained only to render saved chats.
// Active picker groups come exclusively from provider discovery and user selections.
export const getModelProviderGroups = (): ModelProviderGroup[] => [];

// Merges live-discovered Go model ids into the picker groups. Static entries
// win; unknown ids synthesize safe defaults; unsupported routes are dropped.
export const withDiscoveredGoModels = (groups: ModelProviderGroup[], goIds: string[]): ModelProviderGroup[] => {
  const fresh = goIds
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
    .map((id) => (id.startsWith(OPENCODE_GO_ID_PREFIX) ? id : `${OPENCODE_GO_ID_PREFIX}${id}`));
  if (fresh.length === 0) return groups;
  return groups.map((group) => {
    if (group.id !== "opencode-go") return group;
    const known = new Set(group.models.map((model) => model.id));
    const discovered = fresh
      .filter((id) => !known.has(id))
      .map((id) => synthesizeGoModelOption(id))
      .filter((option): option is ModelOption => option !== null);
    return discovered.length > 0 ? { ...group, models: [...group.models, ...discovered] } : group;
  });
};
