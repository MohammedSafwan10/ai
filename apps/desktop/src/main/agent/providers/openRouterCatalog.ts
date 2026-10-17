import type { DesktopStore } from "../../db/store";
import {
  OPENROUTER_CATALOG_TTL,
  isExpiredOpenRouterModel,
  isFreeOpenRouterModel,
  openRouterPriceIncreased,
  parseOpenRouterCatalog,
  type OpenRouterCatalogState,
  type OpenRouterSelection,
} from "../../../shared/openRouterModels";

export class OpenRouterCatalogService {
  private pending?: Promise<OpenRouterCatalogState>;
  private failedAt = 0;
  private failureMessage = "";
  constructor(
    private store: Pick<
      DesktopStore,
      "getSecret" | "getOpenRouterCatalog" | "setOpenRouterCatalog"
    >,
    private changed = () => {},
    private fetcher: typeof fetch = fetch,
  ) {}
  cached(): OpenRouterCatalogState {
    const state = this.store.getOpenRouterCatalog() || {
      models: [],
      selections: [],
      freeOnly: false,
      fetchedAt: 0,
    };
    return {
      ...state,
      stale:
        !state.fetchedAt ||
        state.fetchedAt > Date.now() + 60_000 ||
        Date.now() - state.fetchedAt >= OPENROUTER_CATALOG_TTL,
    };
  }
  async list(refresh = false): Promise<OpenRouterCatalogState> {
    if (this.pending) return this.pending;
    const cached = this.cached();
    if (!refresh && !cached.stale) return cached;
    if (!refresh && Date.now() - this.failedAt < 60_000)
      return { ...cached, stale: true, error: this.failureMessage };
    const key = this.store.getSecret("openrouter_api_key");
    if (!key)
      return {
        ...cached,
        stale: true,
        error: "Save your OpenRouter key in Providers to refresh models.",
      };
    this.pending = this.fetchCatalog(key).finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }
  private async fetchCatalog(key: string): Promise<OpenRouterCatalogState> {
    try {
      const response = await this.fetcher(
        "https://openrouter.ai/api/v1/models/user",
        {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(12_000),
          redirect: "error",
        },
      );
      if (!response.ok)
        throw new Error(
          response.status === 401 || response.status === 403
            ? "OpenRouter did not accept this key for model discovery."
            : `OpenRouter model discovery failed (${response.status}).`,
        );
      const text = await response.text();
      if (text.length > 12_000_000)
        throw new Error("OpenRouter returned an oversized catalog.");
      const fresh = parseOpenRouterCatalog(JSON.parse(text));
      if (this.store.getSecret("openrouter_api_key") !== key)
        throw new Error("OpenRouter key changed. Refresh models again.");
      // Read selections after the request: a concurrent Add/Remove must not be overwritten.
      const current = this.cached();
      const ids = new Set(fresh.map((m) => m.id));
      const missing = current.models.filter((m) => !ids.has(m.id));
      const unavailableIds = new Set([
        ...missing.map((m) => m.id),
        ...current.selections.filter((s) => !ids.has(s.id)).map((s) => s.id),
      ]);
      const selections = current.selections.map((s) => {
        const m = fresh.find((m) => m.id === s.id);
        return !s.acceptedPricing && m && isFreeOpenRouterModel(m)
          ? { ...s, acceptedPricing: { ...m.pricing! } }
          : s;
      });
      const state: OpenRouterCatalogState = {
        models: [...fresh, ...missing],
        selections,
        freeOnly: current.freeOnly,
        fetchedAt: Date.now(),
        unavailableIds: [...unavailableIds],
      };
      this.failedAt = 0;
      this.failureMessage = "";
      this.store.setOpenRouterCatalog(state);
      this.changed();
      return state;
    } catch (error) {
      // Never expose provider response bodies or credentials across IPC.
      const message =
        error instanceof Error && /^OpenRouter |^Save your /.test(error.message)
          ? error.message
          : "Could not refresh OpenRouter models. Showing saved information.";
      this.failedAt = Date.now();
      this.failureMessage = message;
      return { ...this.cached(), stale: true, error: message };
    }
  }
  update(input: {
    id?: string;
    enabled?: boolean;
    freeOnly?: boolean;
  }): OpenRouterCatalogState {
    const state = this.cached();
    if (typeof input.freeOnly === "boolean") state.freeOnly = input.freeOnly;
    if (input.id && typeof input.enabled === "boolean") {
      if (input.enabled) {
        const model = state.models.find((m) => m.id === input.id);
        if (
          !model ||
          state.unavailableIds?.includes(input.id) ||
          isExpiredOpenRouterModel(model)
        )
          throw new Error(
            "This model is unavailable. Refresh models and choose another.",
          );
        if (state.stale || !model.pricing)
          throw new Error(
            "Refresh model information before accepting its price.",
          );
        if (state.freeOnly && !isFreeOpenRouterModel(model))
          throw new Error("Free models only is enabled.");
        state.selections = [
          ...state.selections.filter((s) => s.id !== input.id),
          { id: input.id, acceptedPricing: { ...model.pricing } },
        ];
      } else
        state.selections = state.selections.filter((s) => s.id !== input.id);
    }
    this.store.setOpenRouterCatalog(state);
    this.changed();
    return state;
  }
  async prepare(id: string): Promise<{ maxPrice: Record<string, number> }> {
    if (id.startsWith("openrouter/")) id = id.slice("openrouter/".length);
    const state = await this.list();
    const model = state.models.find((m) => m.id === id);
    const selection: OpenRouterSelection | undefined = state.selections.find(
      (s) => s.id === id,
    );
    if (!selection)
      throw new Error(
        "Add this OpenRouter model in Settings > Providers > OpenRouter models first.",
      );
    if (
      !model ||
      state.unavailableIds?.includes(id) ||
      isExpiredOpenRouterModel(model)
    )
      throw new Error(
        "This OpenRouter model is unavailable. Choose another model in Settings.",
      );
    if (openRouterPriceIncreased(model, selection))
      throw new Error(
        "Review this model's current price in Settings > Providers > OpenRouter models before continuing.",
      );
    if (state.freeOnly && !isFreeOpenRouterModel(model))
      throw new Error(
        "Free models only is enabled. Choose a free model or change this setting.",
      );
    const p = state.freeOnly
      ? { prompt: 0, completion: 0, request: 0, image: 0 }
      : selection.acceptedPricing!;
    return {
      maxPrice: {
        prompt: p.prompt * 1_000_000,
        completion: p.completion * 1_000_000,
        request: p.request ?? 0,
        image: p.image ?? 0,
      },
    };
  }
}

let guard:
  | ((id: string) => Promise<{ maxPrice: Record<string, number> }>)
  | undefined;
export const setOpenRouterCatalogGuard = (value: typeof guard) => {
  guard = value;
};
export const prepareOpenRouterModel = (id: string) =>
  guard ? guard(id) : Promise.resolve(undefined);
