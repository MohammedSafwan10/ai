import { z } from "zod";
import type { ModelOption, ReasoningEffort } from "./models";

export const catalogProviderSchema = z.enum(["openai", "anthropic", "gemini", "deepseek", "opencode-go", "cliproxy"]);
export type CatalogProvider = z.infer<typeof catalogProviderSchema>;
export const catalogProviders = catalogProviderSchema.options;
export const catalogLabels: Record<CatalogProvider, string> = {
  openai: "OpenAI", anthropic: "Claude", gemini: "Gemini", deepseek: "DeepSeek", "opencode-go": "OpenCode Go", cliproxy: "CLIProxy",
};
export const catalogIdSchema = z.string().min(1).max(200).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/);
export const catalogSelectionSchema = z.object({
  provider: catalogProviderSchema, id: catalogIdSchema, enabled: z.boolean(),
  capabilities: z.object({ tools: z.boolean(), images: z.boolean() }).optional(),
});
export interface CatalogModel extends ModelOption {
  provider: CatalogProvider;
  catalogSource: "provider" | "provider+metadata";
  capabilitiesKnown: boolean;
  route?: "chat" | "responses" | "messages" | "gemini";
  thinkingType?: "adaptive" | "enabled";
  supportsReasoningToggle?: boolean;
}
export interface ProviderCatalogState {
  provider: CatalogProvider;
  models: CatalogModel[];
  enabledIds: string[];
  overrides?: Record<string, { tools: boolean; images: boolean }>;
  fetchedAt: number;
  accountTag?: string;
  unavailableIds?: string[];
  stale?: boolean;
  error?: string;
}
const registry = new Map<string, CatalogModel>();
export function registerCatalogModels(models: CatalogModel[]) {
  for (const model of models) registry.set(model.id, model);
}
export const findCatalogModel = (id: string | undefined) => id ? registry.get(id) : undefined;
export const catalogInternalId = (provider: CatalogProvider, id: string) => `${provider}/${id}`;
export function catalogModelOptions(state: ProviderCatalogState): CatalogModel[] {
  return state.models.map((model) => {
    const override = state.overrides && Object.hasOwn(state.overrides, model.upstreamModelId!) ? state.overrides[model.upstreamModelId!] : undefined;
    return { ...model, ...(override ? { supportsTools: override.tools, supportsImageInput: override.images } : {}), unavailable: Boolean(state.unavailableIds?.includes(model.upstreamModelId!)) };
  });
}
const object = (v: unknown): Record<string, any> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {};
const positive = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : undefined;
const clean = (v: unknown, limit = 200) => typeof v === "string" ? v.replace(/[\x00-\x1f\x7f]/g, " ").slice(0, limit) : "";
const efforts = ["none", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export function parseCatalogModel(provider: CatalogProvider, raw: unknown, enrichment?: unknown): CatalogModel | null {
  const v = object(raw), meta = object(enrichment);
  const id = catalogIdSchema.safeParse(provider === "gemini" ? clean(v.name).replace(/^models\//, "") : v.id);
  if (!id.success || v.lifecycle === "retired") return null;
  if (provider === "gemini" && (!Array.isArray(v.supportedGenerationMethods) || !v.supportedGenerationMethods.includes("generateContent"))) return null;
  const output = v.output_modalities || meta.modalities?.output;
  if (Array.isArray(output) && (output.length !== 1 || output[0] !== "text")) return null;
  const cap = object(v.capabilities);
  const supports = (key: string) => typeof cap[key]?.supported === "boolean" ? cap[key].supported as boolean : undefined;
  const inputs = v.input_modalities || meta.modalities?.input;
  const tools = supports("tools") ?? v.tool_call ?? meta.tool_call;
  const images = supports("image_input") ?? (Array.isArray(inputs) ? inputs.includes("image") : undefined);
  const reasoningOptions = Array.isArray(meta.reasoning_options) ? meta.reasoning_options : [];
  const thinkingType = cap.thinking?.types?.adaptive?.supported ? "adaptive" : cap.thinking?.types?.enabled?.supported || reasoningOptions.some((o: any) => o.type === "budget_tokens") ? "enabled" : undefined;
  const reportedEfforts = Array.isArray(v.effort?.supported_levels) ? v.effort.supported_levels
    : cap.effort?.supported ? efforts.filter((e) => cap.effort[e]?.supported) : reasoningOptions.flatMap((o: any) => o.type === "effort" && Array.isArray(o.values) ? o.values : []);
  const levels = efforts.filter((e) => reportedEfforts.includes(e));
  // No guessed reasoning controls for catalogs that do not publish them.
  const toggle = thinkingType || reasoningOptions.some((o: any) => o.type === "toggle");
  const reasoningEfforts: ReasoningEffort[] = levels.length ? [...(toggle ? ["none" as const] : []), ...levels] : toggle ? ["none", "high"] : ["none"];
  const maxOutput = positive(v.max_output_tokens ?? v.outputTokenLimit ?? v.max_tokens ?? meta.limit?.output);
  const context = positive(v.context_window ?? v.inputTokenLimit ?? v.max_input_tokens ?? meta.limit?.context);
  const protocol = v.provider?.npm || meta.provider?.npm || v.npm;
  const route = provider === "anthropic" || protocol === "@ai-sdk/anthropic" ? "messages"
    : provider === "openai" || provider === "cliproxy" || protocol === "@ai-sdk/openai" ? "responses"
    : provider === "gemini" || protocol === "@ai-sdk/google" ? "gemini" : "chat";
  return {
    id: catalogInternalId(provider, id.data), upstreamModelId: id.data, provider,
    label: clean(v.display_name || v.displayName || meta.name || (provider === "gemini" ? id.data : v.name) || id.data),
    description: clean(v.description || meta.description, 1000),
    supportsTools: tools === true || provider === "anthropic", supportsImageInput: images === true,
    supportsReasoning: reasoningEfforts.some((e) => e !== "none"), reasoningEfforts: [...new Set(reasoningEfforts)],
    defaultReasoningEffort: reasoningEfforts.includes(v.effort?.default_level) ? v.effort.default_level : reasoningEfforts[0]!,
    contextWindowTokens: context, inputLimitTokens: context, maxOutputTokens: maxOutput,
    defaultOutputTokens: Math.min(16_384, maxOutput || 16_384),
    capabilitiesKnown: (typeof tools === "boolean" || provider === "anthropic") && typeof images === "boolean",
    catalogSource: Object.keys(meta).length ? "provider+metadata" : "provider", route, thinkingType, supportsReasoningToggle: Boolean(toggle),
  };
}
