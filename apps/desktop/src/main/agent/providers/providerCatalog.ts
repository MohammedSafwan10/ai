import { createHash } from "node:crypto";
import type { DesktopStore } from "../../db/store";
import { normalizeLocalServiceBaseUrl } from "../../security/serviceUrls";
import { catalogInternalId, catalogLabels, catalogModelOptions, catalogProviders, parseCatalogModel, type CatalogProvider, type ProviderCatalogState } from "../../../shared/providerCatalog";
import { OPENCODE_GO_MODELS_URL } from "../../../shared/opencodeGo";

const TTL = 15 * 60_000;
const urls: Record<CatalogProvider, string> = {
  openai: "https://api.openai.com/v1/models", anthropic: "https://api.anthropic.com/v1/models",
  gemini: "https://generativelanguage.googleapis.com/v1beta/models", deepseek: "https://api.deepseek.com/models",
  "opencode-go": OPENCODE_GO_MODELS_URL, cliproxy: "",
};
const secrets = { openai: "openai_api_key", anthropic: "anthropic_api_key", gemini: "gemini_api_key", deepseek: "deepseek_api_key" } as const;
export class ProviderCatalogService {
  private pending = new Map<CatalogProvider, { tag: string; promise: Promise<ProviderCatalogState> }>();
  private failures = new Map<CatalogProvider, { at: number; message: string; tag: string }>();
  private metadata?: { value: Record<string, any>; at: number };
  private metadataPending?: Promise<Record<string, any>>;
  constructor(private store: Pick<DesktopStore, "getSecret" | "getSettings" | "getOpencodeGoCredential" | "getProviderCatalog" | "setProviderCatalog">, private changed = () => {}, private fetcher: typeof fetch = fetch) {}
  private credential(provider: CatalogProvider) {
    const value = provider === "opencode-go" ? this.store.getOpencodeGoCredential()?.apiKey || ""
      : provider === "cliproxy" ? normalizeLocalServiceBaseUrl(this.store.getSettings().cliproxyBaseUrl, "CLI proxy") : this.store.getSecret(secrets[provider]);
    return { value, tag: createHash("sha256").update(value).digest("hex") };
  }
  cached(provider: CatalogProvider): ProviderCatalogState {
    const cached = this.store.getProviderCatalog(provider);
    const credential = this.credential(provider);
    // Do not expose a previous account's roster as this account's availability.
    const state = cached?.accountTag === credential.tag && credential.value ? cached : { provider, models: [], enabledIds: cached?.enabledIds || [], overrides: cached?.overrides, fetchedAt: 0 };
    return { ...state, stale: !state.fetchedAt || state.fetchedAt > Date.now() + 60_000 || Date.now() - state.fetchedAt >= TTL };
  }
  async list(provider: CatalogProvider, refresh = false): Promise<ProviderCatalogState> {
    const credential = this.credential(provider);
    const pending = this.pending.get(provider);
    if (pending?.tag === credential.tag) return pending.promise;
    const cached = this.cached(provider), failure = this.failures.get(provider);
    if (!refresh && !cached.stale) return cached;
    if (!credential.value) return { ...cached, error: `Save your ${catalogLabels[provider]} key first.` };
    if (!refresh && failure?.tag === credential.tag && Date.now() - failure.at < 60_000) return { ...cached, error: failure.message };
    const promise = this.load(provider, credential).finally(() => { if (this.pending.get(provider)?.promise === promise) this.pending.delete(provider); });
    this.pending.set(provider, { tag: credential.tag, promise });
    return promise;
  }
  private async json(url: string, headers: Record<string, string>, signal: AbortSignal, maxBytes = 12_000_000): Promise<any> {
    const response = await this.fetcher(url, { headers, signal, redirect: "error" });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "This key was rejected for model discovery." : `Model discovery failed (HTTP ${response.status}).`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("The provider returned an empty catalog.");
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > maxBytes) throw new Error("The provider returned an oversized catalog."); chunks.push(part.value); } }
    finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  private async enrichment(signal: AbortSignal) {
    if (this.metadata && Date.now() - this.metadata.at < 6 * 60 * 60_000) return this.metadata.value;
    if (this.metadataPending) return this.metadataPending;
    this.metadataPending = (async () => {
      try { const value = await this.json("https://models.dev/api.json", {}, signal, 30_000_000); this.metadata = { value, at: Date.now() }; return value; }
      catch { return this.metadata?.value || {}; }
    })().finally(() => { this.metadataPending = undefined; });
    return this.metadataPending;
  }
  private async load(provider: CatalogProvider, credential: { value: string; tag: string }): Promise<ProviderCatalogState> {
    try {
      const signal = AbortSignal.timeout(15_000);
      const headers: Record<string, string> = provider === "gemini" ? { "x-goog-api-key": credential.value }
        : provider === "anthropic" ? { "x-api-key": credential.value, "anthropic-version": "2023-06-01" }
        : { Authorization: `Bearer ${provider === "cliproxy" ? "dummy-key" : credential.value}` };
      const base = provider === "cliproxy" ? `${credential.value}/v1/models` : urls[provider];
      const metaPromise = this.enrichment(AbortSignal.timeout(5_000));
      const entries: unknown[] = []; let cursor: string | undefined; const cursors = new Set<string>();
      for (let page = 0; page < 40; page++) {
        const url = new URL(base);
        if (provider === "gemini") { url.searchParams.set("pageSize", "1000"); if (cursor) url.searchParams.set("pageToken", cursor); }
        if (provider === "anthropic") { url.searchParams.set("limit", "1000"); if (cursor) url.searchParams.set("after_id", cursor); }
        const payload = await this.json(url.toString(), headers, signal);
        const items = provider === "gemini" ? payload.models : payload.data;
        if (!Array.isArray(items)) throw new Error("The provider returned an invalid catalog.");
        entries.push(...items); if (entries.length > 20_000) throw new Error("The provider returned an oversized catalog.");
        cursor = provider === "gemini" ? payload.nextPageToken : provider === "anthropic" && payload.has_more ? payload.last_id : undefined;
        if (!cursor) break;
        if (typeof cursor !== "string" || cursors.has(cursor) || page === 39) throw new Error("The provider returned invalid model pagination.");
        cursors.add(cursor);
      }
      const metadata = await metaPromise;
      if (this.credential(provider).tag !== credential.tag) return { ...this.cached(provider), error: "Connection changed. Refresh models again." };
      const metaProvider = provider === "gemini" ? "google" : provider;
      const models = [...new Map(entries.map((entry: any) => {
        const id = provider === "gemini" ? String(entry?.name || "").replace(/^models\//, "") : entry?.id;
        const model = parseCatalogModel(provider, entry, metadata[metaProvider]?.models?.[id]);
        return [model?.id, model] as const;
      }).filter((entry) => entry[1])).values()].filter((m): m is NonNullable<typeof m> => Boolean(m));
      const current = this.store.getProviderCatalog(provider);
      const ids = new Set(models.map((m) => m.upstreamModelId));
      const missing = (current?.models || []).filter((m) => !ids.has(m.upstreamModelId));
      const settings = this.store.getSettings();
      const previouslyChosen = [settings.model, settings.subagentModel].filter((id): id is string => Boolean(id));
      const initialIds = models.filter((m) => previouslyChosen.includes(m.id) || previouslyChosen.includes(m.upstreamModelId!)).map((m) => m.upstreamModelId!);
      const state: ProviderCatalogState = { provider, models: [...models, ...missing], enabledIds: current?.enabledIds || initialIds, overrides: current?.overrides, fetchedAt: Date.now(), accountTag: credential.tag, unavailableIds: missing.map((m) => m.upstreamModelId!) };
      this.store.setProviderCatalog(state); this.failures.delete(provider); this.changed(); return state;
    } catch (error) {
      const message = error instanceof Error && /^(This key|Model discovery|The provider)/.test(error.message) ? error.message : "Could not refresh models. Showing saved information.";
      this.failures.set(provider, { at: Date.now(), message, tag: credential.tag });
      return { ...this.cached(provider), stale: true, error: message };
    }
  }
  update(input: { provider: CatalogProvider; id: string; enabled: boolean; capabilities?: { tools: boolean; images: boolean } }) {
    const state = this.cached(input.provider);
    if (input.enabled && (!state.models.some((m) => m.upstreamModelId === input.id) || state.unavailableIds?.includes(input.id) || state.stale)) throw new Error("Refresh models before adding this model.");
    state.enabledIds = state.enabledIds.filter((id) => id !== input.id);
    if (input.enabled) state.enabledIds.push(input.id);
    if (input.capabilities) state.overrides = { ...state.overrides, [input.id]: input.capabilities };
    this.store.setProviderCatalog(state); this.changed(); return state;
  }
  async prepare(provider: CatalogProvider, id: string, expectedCredential?: string) {
    const assertCredential = () => {
      if (expectedCredential !== undefined && this.credential(provider).value !== expectedCredential) throw new Error("Provider connection changed before the request started. Retry with the current connection.");
    };
    assertCredential();
    const state = await this.list(provider);
    assertCredential();
    const rawId = id.startsWith(`${provider}/`) ? id.slice(provider.length + 1) : id;
    if (!this.credential(provider).value) throw new Error(`Configure ${catalogLabels[provider]} in Settings > Providers.`);
    if (!state.enabledIds.includes(rawId) || state.unavailableIds?.includes(rawId)) throw new Error(`Add an available ${catalogLabels[provider]} model in Settings > Providers before continuing.`);
    const model = catalogModelOptions(state).find((m) => m.id === catalogInternalId(provider, rawId));
    if (!model) throw new Error("This model is unavailable. Refresh models in Settings.");
    return model;
  }
}
let guard: ((provider: CatalogProvider, id: string, expectedCredential?: string) => ReturnType<ProviderCatalogService["prepare"]>) | undefined;
export const setProviderCatalogGuard = (value: typeof guard) => { guard = value; };
export const prepareCatalogModel = (provider: CatalogProvider, id: string, expectedCredential?: string) => guard?.(provider, id, expectedCredential);
