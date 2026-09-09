import type { ModelOption, ReasoningEffort } from "./models";

export const OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go";
export const OPENCODE_GO_CHAT_COMPLETIONS_URL = `${OPENCODE_GO_BASE_URL}/v1/chat/completions`;
export const OPENCODE_GO_RESPONSES_URL = `${OPENCODE_GO_BASE_URL}/v1/responses`;
export const OPENCODE_GO_MESSAGES_URL = `${OPENCODE_GO_BASE_URL}/v1/messages`;
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
  // families (e.g. Qwen Max is text-only while Plus/Flash see images).
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
    prefixes: ["deepseek-"],
    route: "chat",
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 131_072,
    reasoningEfforts: ["none", "high", "xhigh"],
    defaultReasoningEffort: "high",
    vision: false,
    visionIds: ["deepseek-v4-flash-vision-exp"],
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
    // GLM-5 base line is text-only; vision lives in GLM-5V-Turbo (not on Go).
    prefixes: ["glm-"],
    route: "chat",
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 65_536,
    reasoningEfforts: ["none", "high"],
    defaultReasoningEffort: "high",
    vision: false,
  },
  {
    // Only mimo-v2.5 documents image input; siblings stay text-only.
    prefixes: ["mimo-", "longcat-", "hy", "omen-"],
    route: "chat",
    contextWindowTokens: 262_144,
    maxOutputTokens: 32_768,
    reasoningEfforts: ["none", "medium"],
    defaultReasoningEffort: "none",
    vision: false,
    visionIds: ["mimo-v2.5"],
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
    // Qwen Max is text-only; Plus/Flash are native vision-language (1M ctx).
    // MiniMax M3 is native multimodal (1M ctx); M2.7/M2.5 unverified.
    prefixes: ["minimax-", "qwen"],
    route: "messages",
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 32_768,
    reasoningEfforts: ["none", "medium"],
    defaultReasoningEffort: "medium",
    vision: false,
    visionIds: ["minimax-m3", "qwen3.5-plus", "qwen3.6-plus", "qwen3.7-plus", "qwen3.8-flash"],
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
  if (!goId) return null;
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

export const normalizeGoError = (value: string, status?: number) => {  const trimmed = value.trim();
  let message = trimmed;
  try {
    const parsed = JSON.parse(trimmed);
    message = String(parsed?.error?.message || parsed?.error || parsed?.message || trimmed);
  } catch {
    message = trimmed || `OpenCode Go request failed${status ? ` with ${status}` : ""}.`;
  }
  if (status === 401 || /unauthorized|invalid.*key|api key/i.test(message)) {
    return "OpenCode Go rejected the saved API key. Replace it in Settings > Providers with a key from your Zen console Go subscription.";
  }
  if (status === 429 || /limit|quota|cap/i.test(message)) {
    return `OpenCode Go usage cap reached ($12/5h, $30/week, $60/month). Wait for reset or enable Zen-balance fallback. (${message})`;
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
