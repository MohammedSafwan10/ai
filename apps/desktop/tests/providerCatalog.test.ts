import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderCatalogService } from "../src/main/agent/providers/providerCatalog";
import { catalogModelOptions, parseCatalogModel, registerCatalogModels, type CatalogProvider, type ProviderCatalogState } from "../src/shared/providerCatalog";
import { getModelOption, getModelProviderGroups, normalizeModelId } from "../src/shared/models";
import { OpenAIAdapter } from "../src/main/agent/providers/openai";
import { OpenCodeGoAdapter } from "../src/main/agent/providers/opencodeGo";
import type { ProviderStreamOptions } from "../src/main/agent/providers/types";

function setup(provider: CatalogProvider = "openai", extra: Record<string, unknown> = {}) {
  let key = "test-only-key"; const states = new Map<CatalogProvider, ProviderCatalogState>();
  let rows: unknown[] = [{ id: "example-model", ...extra }];
  const fetcher = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(String(url).includes("models.dev") ? {} : { data: rows, models: rows })));
  const store = {
    getSecret: () => key, getSettings: () => ({ model: "", subagentModel: null, cliproxyBaseUrl: "http://127.0.0.1:8317" }),
    getOpencodeGoCredential: () => ({ id: "test", apiKey: key }),
    getProviderCatalog: (p: CatalogProvider) => states.get(p) || null,
    setProviderCatalog: (s: ProviderCatalogState) => { states.set(s.provider, structuredClone(s)); registerCatalogModels(catalogModelOptions(s)); },
  };
  const service = new ProviderCatalogService(store as any, vi.fn(), fetcher as typeof fetch);
  return { service, store, states, fetcher, provider, setKey: (s: string) => { key = s; }, setRows: (r: unknown[]) => { rows = r; } };
}
afterEach(() => vi.unstubAllGlobals());
describe("provider discovery", () => {
  it.each(["openai", "anthropic", "gemini", "deepseek", "opencode-go", "cliproxy"] as const)("discovers %s and forwards credentials only to the provider", async (provider) => {
    const t = setup(provider, { name: "models/example-model", supportedGenerationMethods: ["generateContent"] });
    const state = await t.service.list(provider);
    expect(state.models).toHaveLength(1); expect(state.models[0].id).toBe(`${provider}/example-model`);
    const metadataCall = t.fetcher.mock.calls.find(([url]) => String(url).includes("models.dev"));
    expect(metadataCall).toBeDefined();
    expect(JSON.stringify(metadataCall?.[1]?.headers)).not.toContain("test-only-key");
    const providerCall = t.fetcher.mock.calls.find(([url]) => !String(url).includes("models.dev"));
    expect(JSON.stringify(providerCall?.[1]?.headers)).toContain(provider === "cliproxy" ? "dummy-key" : "test-only-key");
    expect(JSON.stringify(state)).not.toContain("test-only-key");
  });
  it("deduplicates refreshes, preserves concurrent selections, and uses the TTL cache", async () => {
    const t = setup(); await t.service.list("openai");
    t.service.update({ provider: "openai", id: "example-model", enabled: true });
    const before = t.fetcher.mock.calls.length;
    await Promise.all([t.service.list("openai", true), t.service.list("openai", true)]);
    expect(t.fetcher.mock.calls.length).toBe(before + 1);
    expect((await t.service.list("openai")).enabledIds).toEqual(["example-model"]);
    expect(t.fetcher.mock.calls.length).toBe(before + 1);
  });
  it("retains missing models for history, blocks inference, and restores reappearing models", async () => {
    const t = setup(); await t.service.list("openai"); t.service.update({ provider: "openai", id: "example-model", enabled: true });
    t.setRows([]); const missing = await t.service.list("openai", true);
    expect(missing.unavailableIds).toEqual(["example-model"]);
    await expect(t.service.prepare("openai", "openai/example-model")).rejects.toThrow(/available/);
    t.setRows([{ id: "example-model" }]); await t.service.list("openai", true);
    expect((await t.service.prepare("openai", "openai/example-model")).unavailable).toBe(false);
  });
  it("does not reuse a previous account catalog after clearing or replacing a key", async () => {
    const t = setup(); await t.service.list("openai"); t.setKey("");
    expect(t.service.cached("openai").models).toEqual([]);
    t.setKey("new-test-only-key"); expect(t.service.cached("openai").stale).toBe(true);
    await t.service.list("openai"); expect(t.service.cached("openai").models).toHaveLength(1);
  });
  it("blocks an inference request that captured an old credential before discovery", async () => {
    const t = setup(); await t.service.list("openai"); t.service.update({ provider: "openai", id: "example-model", enabled: true });
    t.setKey("new-key");
    await expect(t.service.prepare("openai", "openai/example-model", "test-only-key")).rejects.toThrow(/connection changed/);
  });
  it("rejects an in-flight response from a replaced key", async () => {
    const t = setup(); let resolve!: (r: Response) => void;
    t.fetcher.mockImplementation(async (url) => String(url).includes("models.dev") ? new Response("{}") : new Promise((r) => { resolve = r; }));
    const pending = t.service.list("openai"); t.setKey("changed"); resolve(new Response('{"data":[{"id":"old-account-model"}]}'));
    expect((await pending).models).toEqual([]); expect(t.states.size).toBe(0);
  });
  it("handles failed refreshes without destroying selections or exposing response bodies", async () => {
    const t = setup(); await t.service.list("openai"); t.service.update({ provider: "openai", id: "example-model", enabled: true });
    t.fetcher.mockImplementation(async () => new Response("secret-upstream-body", { status: 401 }));
    const failed = await t.service.list("openai", true);
    expect(failed.enabledIds).toEqual(["example-model"]); expect(failed.stale).toBe(true);
    expect(failed.error).toContain("key was rejected"); expect(JSON.stringify(failed)).not.toContain("secret-upstream-body");
  });
  it("follows provider pagination and rejects repeated cursors", async () => {
    const t = setup("anthropic");
    t.fetcher.mockImplementation(async (url) => new Response(JSON.stringify(String(url).includes("models.dev") ? {} : String(url).includes("after_id") ? { data: [{ id: "second" }], has_more: false } : { data: [{ id: "first" }], has_more: true, last_id: "first" })));
    expect((await t.service.list("anthropic")).models).toHaveLength(2);
    t.fetcher.mockImplementation(async (url) => new Response(JSON.stringify(String(url).includes("models.dev") ? {} : { data: [], has_more: true, last_id: "loop" })));
    expect((await t.service.list("anthropic", true)).error).toContain("pagination");
  });
  it("keeps provider identity distinct and does not silently remap retired model IDs", () => {
    const a = parseCatalogModel("openai", { id: "shared-name" })!, b = parseCatalogModel("deepseek", { id: "shared-name" })!;
    registerCatalogModels([a, b]); expect(getModelOption(a.id).provider).toBe("openai"); expect(getModelOption(b.id).provider).toBe("deepseek");
    expect(normalizeModelId("deepseek-v4-flash-vision-exp")).toBe("deepseek-v4-flash-vision-exp");
    expect(getModelProviderGroups()).toEqual([]);
  });
  it("uses live capabilities and never enables guessed tools or images", () => {
    expect(parseCatalogModel("openai", { id: "new-model" })).toMatchObject({ supportsTools: false, supportsImageInput: false, supportsReasoning: false, capabilitiesKnown: false });
    expect(parseCatalogModel("gemini", { name: "models/embedding", supportedGenerationMethods: ["embedContent"] })).toBeNull();
    expect(parseCatalogModel("openai", { id: "picture", output_modalities: ["image"] })).toBeNull();
    const model = parseCatalogModel("deepseek", { id: "new-model", context_window: 65000, input_modalities: ["text", "image"], effort: { supported_levels: ["low", "high", "max"], default_level: "high" } }, { tool_call: true });
    expect(model).toMatchObject({ supportsTools: true, supportsImageInput: true, contextWindowTokens: 65000, reasoningEfforts: ["low", "high", "max"], defaultReasoningEffort: "high" });
  });
});

const options = (model: string, provider: "openai" | "anthropic"): ProviderStreamOptions => ({ provider, model, systemInstruction: "test", messages: [{ role: "user", content: "hello" }], reasoning: "none", collaborationMode: "default", signal: new AbortController().signal, cliproxyBaseUrl: "", geminiApiKey: "", openRouterApiKey: "", deepseekApiKey: "", opencodeGoApiKey: "", openaiApiKey: "test-key", anthropicApiKey: "test-key", onTextDelta: vi.fn(), onThoughtDelta: vi.fn(), onToolDraft: vi.fn(), onToolCall: vi.fn(), onStreamOutcome: vi.fn() });
describe("native API adapters", () => {
  it("streams OpenAI Responses with exact IDs, no subscription auth, and no unsupported reasoning/temperature", async () => {
    const model = parseCatalogModel("openai", { id: "response-model" })!;
    const request = vi.fn(async () => new Response('event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"hello"}\n\ndata: {"type":"response.completed","response":{"status":"completed"}}\n\n'));
    vi.stubGlobal("fetch", request); const o = { ...options(model.id, "openai"), modelInfo: model, disableTools: true };
    await new OpenAIAdapter().stream(o);
    const [url, init] = request.mock.calls[0] as any; expect(url).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(init.body); expect(body).toMatchObject({ model: "response-model", store: false }); expect(body.reasoning).toBeUndefined(); expect(body.temperature).toBeUndefined();
    expect(o.onTextDelta).toHaveBeenCalledWith("hello");
  });
  it("streams Claude with its own key without reusing the Go credentials", async () => {
    const model = parseCatalogModel("anthropic", { id: "claude-example", capabilities: { image_input: { supported: true } } })!;
    registerCatalogModels([model]);
    const request = vi.fn(async () => new Response('data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hello"}}\n\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}\n\ndata: {"type":"message_stop"}\n\n'));
    vi.stubGlobal("fetch", request); const o = { ...options(model.id, "anthropic"), modelInfo: model };
    await new OpenCodeGoAdapter().stream(o);
    const [url, init] = request.mock.calls[0] as any;
    expect(url).toBe("https://api.anthropic.com/v1/messages"); expect(init.headers["x-api-key"]).toBe("test-key"); expect(init.headers.Authorization).toBeUndefined();
    expect(JSON.parse(init.body).model).toBe("claude-example"); expect(o.onTextDelta).toHaveBeenCalledWith("hello");
  });
  it("sends explicit reasoning-off only when the OpenAI model advertises it", async () => {
    const model = parseCatalogModel("openai", { id: "reasoning-example", effort: { supported_levels: ["none", "high"] } })!;
    const request = vi.fn(async () => new Response('event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed"}}\n\n'));
    vi.stubGlobal("fetch", request);
    await new OpenAIAdapter().stream({ ...options(model.id, "openai"), modelInfo: model });
    expect(JSON.parse((request.mock.calls[0] as any)[1].body).reasoning).toEqual({ effort: "none" });
  });
});
