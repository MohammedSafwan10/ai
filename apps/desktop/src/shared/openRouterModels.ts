import { z } from "zod";
import type { ModelOption, ModelProviderGroup } from "./models";

export const OPENROUTER_CATALOG_TTL = 15 * 60_000;
export const openRouterModelIdSchema = z
  .string()
  .trim()
  .min(3)
  .max(200)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\/[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/);
export type OpenRouterPricing = Record<string, number>;
export interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
  contextLength?: number;
  maxOutputTokens?: number;
  inputModalities: string[];
  supportedParameters: string[];
  pricing: OpenRouterPricing | null;
  expirationDate?: string;
}
export interface OpenRouterSelection {
  id: string;
  acceptedPricing: OpenRouterPricing | null;
}
export interface OpenRouterCatalogState {
  models: OpenRouterModel[];
  selections: OpenRouterSelection[];
  freeOnly: boolean;
  fetchedAt: number;
  unavailableIds?: string[];
  stale?: boolean;
  error?: string;
}
export const openRouterSelectionInputSchema = z.object({
  id: openRouterModelIdSchema.optional(),
  enabled: z.boolean().optional(),
  freeOnly: z.boolean().optional(),
});
const positiveInteger = (v: unknown) =>
  typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : undefined;
const strings = (v: unknown): string[] =>
  Array.isArray(v)
    ? v
        .filter((s): s is string => typeof s === "string" && s.length < 200)
        .slice(0, 64)
    : [];
const clean = (v: unknown, max: number) =>
  typeof v === "string"
    ? v.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max)
    : "";
export function parseOpenRouterModel(value: unknown): OpenRouterModel | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const id = openRouterModelIdSchema.safeParse(v.id);
  const a = v.architecture as Record<string, unknown> | undefined;
  if (
    !id.success ||
    !strings(a?.output_modalities).includes("text") ||
    !strings(a?.input_modalities).includes("text")
  )
    return null;
  let pricing: OpenRouterPricing | null = null;
  if (v.pricing && typeof v.pricing === "object" && !Array.isArray(v.pricing)) {
    const entries = Object.entries(v.pricing).slice(0, 32);
    if (
      entries.length &&
      entries.every(
        ([k, n]) =>
          /^[a-z_]+$/.test(k) &&
          (typeof n === "string" || typeof n === "number") &&
          String(n).trim() !== "" &&
          Number.isFinite(Number(n)) &&
          Number(n) >= 0,
      )
    ) {
      const p = Object.fromEntries(entries.map(([k, n]) => [k, Number(n)]));
      if (p.prompt !== undefined && p.completion !== undefined) pricing = p;
    }
  }
  const top = v.top_provider as Record<string, unknown> | undefined;
  return {
    id: id.data,
    name: clean(v.name, 160) || id.data,
    description: clean(v.description, 1600),
    contextLength: positiveInteger(v.context_length),
    maxOutputTokens: positiveInteger(top?.max_completion_tokens),
    inputModalities: strings(a?.input_modalities),
    supportedParameters: strings(v.supported_parameters),
    pricing,
    expirationDate:
      typeof v.expiration_date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(v.expiration_date)
        ? v.expiration_date
        : undefined,
  };
}
export function parseOpenRouterCatalog(value: unknown): OpenRouterModel[] {
  const data = (value as { data?: unknown })?.data;
  if (!Array.isArray(data) || data.length > 10_000)
    throw new Error("OpenRouter returned an invalid model catalog.");
  const models = new Map<string, OpenRouterModel>();
  for (const entry of data) {
    const model = parseOpenRouterModel(entry);
    if (model) models.set(model.id, model);
  }
  if (!models.size)
    throw new Error("OpenRouter returned no compatible chat models.");
  return [...models.values()].sort((a, b) => a.name.localeCompare(b.name));
}
export const isFreeOpenRouterModel = (m: OpenRouterModel) =>
  Boolean(m.pricing && Object.values(m.pricing).every((n) => n === 0));
export const openRouterPriceIncreased = (
  m: OpenRouterModel,
  selection: OpenRouterSelection,
) =>
  !m.pricing ||
  !selection.acceptedPricing ||
  Object.entries(m.pricing).some(
    ([key, price]) => price > (selection.acceptedPricing?.[key] ?? 0),
  );
export const isExpiredOpenRouterModel = (m: OpenRouterModel) =>
  Boolean(
    m.expirationDate &&
    m.expirationDate < new Date().toISOString().slice(0, 10),
  );
export function openRouterModelOption(m: OpenRouterModel): ModelOption {
  const reasoning = m.supportedParameters.includes("reasoning");
  return {
    id: `openrouter/${m.id}`,
    upstreamModelId: m.id,
    provider: "openrouter",
    label: m.name,
    supportsTools: m.supportedParameters.includes("tools"),
    supportsImageInput: m.inputModalities.includes("image"),
    supportsReasoning: reasoning,
    reasoningControl: "toggle",
    reasoningEfforts: reasoning ? ["none", "medium"] : ["none"],
    defaultReasoningEffort: "none",
    contextWindowTokens: m.contextLength,
    maxOutputTokens: m.maxOutputTokens,
    defaultOutputTokens: Math.min(
      m.maxOutputTokens || 8192,
      m.contextLength ? Math.max(1, Math.floor(m.contextLength / 4)) : 8192,
      8192,
    ),
    supportedParameters: m.supportedParameters,
    description: m.description,
  };
}
let registry = new Map<string, ModelOption>();
export const registerOpenRouterModels = (models: ModelOption[]) => {
  registry = new Map(
    models.filter((m) => m.provider === "openrouter").map((m) => [m.id, m]),
  );
};
export const findRegisteredOpenRouterModel = (id?: string) =>
  id ? registry.get(id) : undefined;
export const withOpenRouterModels = (
  groups: ModelProviderGroup[],
  models: ModelOption[],
): ModelProviderGroup[] => {
  const replacement = {
    id: "openrouter" as const,
    label: "OpenRouter",
    description: "Your enabled OpenRouter models",
    models,
  };
  const existing = groups.some((g) => g.id === "openrouter");
  return (
    existing
      ? groups.map((g) => (g.id === "openrouter" ? replacement : g))
      : [...groups, replacement]
  ).filter((g) => g.models.length);
};
