import type { ModelOption, ReasoningEffort } from "./models";

export const OPENCODE_GO_BASE_URL = "https://opencode.ai/inference/go";
export const OPENCODE_GO_CHAT_COMPLETIONS_URL = `${OPENCODE_GO_BASE_URL}/openai/v1/chat/completions`;
export const OPENCODE_GO_RESPONSES_URL = `${OPENCODE_GO_BASE_URL}/openai/v1/responses`;
export const OPENCODE_GO_MESSAGES_URL = `${OPENCODE_GO_BASE_URL}/anthropic/v1/messages`;
export const OPENCODE_GO_MODELS_URL = `${OPENCODE_GO_BASE_URL}/v1/models`;
export const OPENCODE_GO_ID_PREFIX = "opencode-go/";
export const OPENCODE_GO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// Reasoning + answer share one output budget, and heavy thinkers burn several
// thousand tokens on thought alone. 16K keeps answers intact; unused budget
// is not billed and Go caps are dollar-based, so this costs nothing extra.
export const OPENCODE_GO_DEFAULT_OUTPUT_TOKENS = 16_384;
export const OPENCODE_GO_USER_AGENT = "Privora-Desktop";

export type OpenCodeGoRoute = "chat" | "responses" | "messages";

export interface OpenCodeGoModelCache {
  accountId?: string;
  ids: string[];
  unsupported: string[];
  fetchedAt: number;
}

export interface OpenCodeGoModelList {
  ids: string[];
  unsupported: string[];
  fetchedAt: number;
  source: "live" | "cache" | "static";
}

interface OpenCodeGoFamily {
  prefixes: string[];
  route: OpenCodeGoRoute;
  contextWindowTokens: number;
  maxOutputTokens: number;
  reasoningEfforts: ReasoningEffort[];
  defaultReasoningEffort: ReasoningEffort;
  // Family-wide vision default. Per-id overrides below win for mixed
  // families (e.g. Qwen3.7 Max is text-only, while Qwen3.8 Max sees images).
  vision: boolean;
  visionIds?: string[];
  novisionIds?: string[];
}

// Routes per https://opencode.ai/docs/go endpoint table:
// chat = OpenAI chat/completions, responses = OpenAI Responses API
// (GPT Luna, Grok, Muse Spark), messages = Anthropic Messages API
// (MiniMax/Qwen). The desktop adapter speaks all three and dispatches
// per model family.
const OPENCODE_GO_FAMILIES: OpenCodeGoFamily[] = [
  {
    prefixes: ["claude-haiku-5-5"], route: "messages",
    contextWindowTokens: 1_000_000, maxOutputTokens: 128_000,
    reasoningEfforts: ["none", "low", "medium", "high", "xhigh", "max"],
    defaultReasoningEffort: "none", vision: true,
  },
  {
    prefixes: ["gpt-6-luna"], route: "responses",
    contextWindowTokens: 1_050_000, maxOutputTokens: 128_000,
    reasoningEfforts: ["none", "low", "medium", "high", "xhigh", "max"],
    defaultReasoningEffort: "none", vision: true,
  },
  {
    prefixes: ["deepseek-"],
    route: "chat",
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 131_072,
    reasoningEfforts: ["none", "high", "xhigh"],
    defaultReasoningEffort: "high",
    vision: false,
    visionIds: ["deepseek-v4.1-flash", "deepseek-v4-flash-vision-exp"],
  },
  {
    // Kimi vision verified: MoonViT native image+video, 1M ctx (K3/K2.7/K2.6).
    prefixes: ["kimi-"],
    route: "chat",
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 32_768,
    reasoningEfforts: ["none", "high"],
    defaultReasoningEffort: "high",
    vision: true,
  },
  {
    // Go's GLM-5.3 Flash supports images; 5.2 and non-Flash 5.3 remain text-only.
    // https://github.com/anomalyco/models.dev/tree/dev/providers/opencode-go/models
    prefixes: ["glm-"],
    route: "chat",
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 65_536,
    reasoningEfforts: ["none", "high"],
    defaultReasoningEffort: "high",
    vision: false,
    visionIds: ["glm-5.3-flash"],
  },
  {
    // Verified Go vision IDs only; MiMo V2.5 Pro and LongCat 2.0 remain text-only.
    prefixes: ["mimo-", "longcat-", "hy", "omen-"],
    route: "chat",
    contextWindowTokens: 262_144,
    maxOutputTokens: 32_768,
    reasoningEfforts: ["none", "medium"],
    defaultReasoningEffort: "none",
    vision: false,
    visionIds: ["mimo-v2.5", "mimo-v2.6-flash", "mimo-v2.6-pro", "longcat-2.5-preview-free"],
  },
  {
    // Per https://ai.developer.meta.com/docs/reasoning: minimal → xhigh
    // (1.3 adds "max" on Standard tier only, so it stays out of Go).
    // "none" is deliberately excluded — Spark returns HTTP 400 for it.
    // Native multimodal: text/image/video/audio/PDF in, 1M ctx.
    prefixes: ["muse-spark-"],
    route: "responses",
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 32_768,
    reasoningEfforts: ["minimal", "low", "medium", "high", "xhigh"],
    defaultReasoningEffort: "medium",
    vision: true,
  },
  {
    // Grok 4.5/4.6: text+image in, 500K ctx (xAI docs).
    prefixes: ["grok-"],
    route: "responses",
    contextWindowTokens: 500_000,
    maxOutputTokens: 32_768,
    reasoningEfforts: ["none", "high"],
    defaultReasoningEffort: "high",
    vision: true,
  },
  {
    prefixes: ["gpt-"],
    route: "responses",
    contextWindowTokens: 1_050_000,
    maxOutputTokens: 128_000,
    reasoningEfforts: ["none", "low", "medium", "high"],
    defaultReasoningEffort: "medium",
    vision: true,
  },
  {
    // Qwen3.7 Max is text-only; Qwen3.8 Max and verified Plus/Flash see images.
    // MiniMax M3 is native multimodal (1M ctx); M2.7/M2.5 unverified.
    prefixes: ["minimax-", "qwen"],
    route: "messages",
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 32_768,
    reasoningEfforts: ["none", "medium"],
    defaultReasoningEffort: "medium",
    vision: false,
    visionIds: ["minimax-m3", "qwen3.5-plus", "qwen3.6-plus", "qwen3.7-plus", "qwen3.8-flash", "qwen3.8-max"],
  },
];

export const matchGoFamily = (goModelId: string): OpenCodeGoFamily | null => {
  const normalized = goModelId.trim().toLowerCase();
  if (!normalized) return null;
  return OPENCODE_GO_FAMILIES.find((family) =>
    family.prefixes.some((prefix) => normalized.startsWith(prefix)),
  ) || null;
};

export const goRouteFor = (modelId: string): OpenCodeGoRoute => {
  const family = matchGoFamily(stripGoPrefix(modelId.trim()));
  return family?.route || "chat";
};

export const stripGoPrefix = (modelId: string) =>
  modelId.startsWith(OPENCODE_GO_ID_PREFIX)
    ? modelId.slice(OPENCODE_GO_ID_PREFIX.length)
    : modelId;

export const isGoModelId = (modelId: string | undefined) =>
  Boolean(modelId?.startsWith(OPENCODE_GO_ID_PREFIX));

// Stable per-conversation id for the required x-opencode-session header
// (routing + prompt caching). Thread ids are already safe; anything else is
// sanitized, with a random fallback so the header is never absent.
export const goSessionId = (threadId?: string) => {
  const cleaned = (threadId || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 64);
  if (cleaned) return cleaned;
  return crypto.randomUUID();
};

export const prettifyGoLabel = (goModelId: string) =>
  goModelId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((token) => (/^[a-z]/i.test(token) ? token[0]!.toUpperCase() + token.slice(1) : token))
    .join(" ");

// Synthesizes a safe ModelOption for any discovered Go model on a supported
// route. Returns null only for unrecognized families.
export const synthesizeGoModelOption = (modelId: string): ModelOption | null => {
  const goId = stripGoPrefix(modelId.trim());
  if (!goId || (goId.toLowerCase().startsWith("deepseek-") && goId.toLowerCase() !== "deepseek-v4.1-flash")) return null;
  const family = matchGoFamily(goId);
  if (!family) return null;
  const normalized = goId.toLowerCase();
  const supportsImageInput = family.novisionIds?.includes(normalized) === true
    ? false
    : family.visionIds?.includes(normalized) === true
      ? true
      : family.vision;
  return {
    id: `${OPENCODE_GO_ID_PREFIX}${goId}`,
    label: `${prettifyGoLabel(goId)} (Go)`,
    provider: "opencode-go",
    supportsTools: true,
    supportsImageInput,
    supportsReasoning: family.reasoningEfforts.some((effort) => effort !== "none"),
    reasoningEfforts: family.reasoningEfforts,
    defaultReasoningEffort: family.defaultReasoningEffort,
    contextWindowTokens: family.contextWindowTokens,
    maxOutputTokens: family.maxOutputTokens,
    defaultOutputTokens: OPENCODE_GO_DEFAULT_OUTPUT_TOKENS,
    upstreamModelId: goId,
    description: "Auto-discovered OpenCode Go model. Billed to your Go subscription caps.",
  };
};

// Raised when the gateway stops a stream at the output-token limit (chat
// finish_reason "length", Responses "incomplete", Messages "max_tokens").
// Reasoning shares the budget with the answer, so heavy thinkers can exhaust
// it on thought alone. The coordinator checkpoints streamed thought/text, so
// Continue resumes from here instead of starting over.
export const truncatedOutputError = (maxOutputTokens?: number, hadThought = false) =>
  new Error(
    `Go stopped this response at the ${maxOutputTokens ? `${maxOutputTokens.toLocaleString()}-token ` : ""}output limit${hadThought ? " (reasoning used most of it)" : ""}. The thought was kept — press Continue to resume, or lower reasoning effort.`,
  );

export const classifyGoAccountError = (value: string, status?: number): "usage_limit" | "invalid_key" | undefined => {
  if (status === 401 || /invalid[ _-]*(?:api[ _-]*)?key|unauthorized|invalid_api_key/i.test(value)) return "invalid_key";
  if (/usage[ _-]*(?:limit|cap)|(?:quota|allowance)[ _-]*(?:exceeded|exhausted|reached)|(?:daily|weekly|monthly|subscription|plan)[ _-]*(?:limit|cap)|insufficient_quota/i.test(value)) return "usage_limit";
};

export const normalizeGoError = (value: string, status?: number) => {  const trimmed = value.trim();
  let message = trimmed;
  try {
    const parsed = JSON.parse(trimmed);
    message = String(parsed?.error?.message || parsed?.error || parsed?.message || trimmed);
  } catch {
    message = trimmed || `OpenCode Go request failed${status ? ` with ${status}` : ""}.`;
  }
  if (classifyGoAccountError(value, status) === "invalid_key") {
    return "OpenCode Go rejected the saved API key. Replace it in Settings > Providers with a key from your Zen console Go subscription.";
  }
  if (classifyGoAccountError(value, status) === "usage_limit") {
    return "OpenCode Go usage cap reached. Choose another saved account in Settings > Providers, then Resume. Check OpenCode Console for the allowance and reset time.";
  }
  if (status === 429) {
    return "OpenCode Go temporarily rate limited this request. Try again after the provider cooldown.";
  }
  if (/x-opencode-session/i.test(message)) {
    return `OpenCode Go rejected the request routing (missing session). Update Privora past the Go session-header support and retry. (${message})`;
  }
  return message;
};

export const fetchGoModelIds = async (
  apiKey: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ ids: string[]; unsupported: string[] }> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchFn(OPENCODE_GO_MODELS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(normalizeGoError(text, response.status));
    }
    const payload = (await response.json()) as { data?: Array<{ id?: unknown }> };
    const ids = (payload.data || [])
      .map((entry) => (typeof entry?.id === "string" ? entry.id.trim() : ""))
      .filter(Boolean);
    const supported = ids.filter((id) => synthesizeGoModelOption(id) !== null);
    const unsupported = ids.filter((id) => synthesizeGoModelOption(id) === null);
    return { ids: supported, unsupported };
  } finally {
    clearTimeout(timeout);
  }
};
