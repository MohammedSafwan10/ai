import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OpenRouterCatalogService,
  setOpenRouterCatalogGuard,
} from "../src/main/agent/providers/openRouterCatalog";
import { OpenRouterAdapter } from "../src/main/agent/providers/openrouter";
import {
  getModelOption,
  getModelProviderGroups,
  normalizeModelId,
  resolveModelRuntimeBudget,
} from "../src/shared/models";
import {
  isFreeOpenRouterModel,
  openRouterModelOption,
  parseOpenRouterCatalog,
  parseOpenRouterModel,
  registerOpenRouterModels,
  withOpenRouterModels,
  type OpenRouterCatalogState,
} from "../src/shared/openRouterModels";
import type { ProviderStreamOptions } from "../src/main/agent/providers/types";

const raw = (
  id = "example/new-model",
  pricing: Record<string, unknown> = { prompt: "0", completion: "0" },
) => ({
  id,
  name: "New model",
  context_length: 32768,
  top_provider: { max_completion_tokens: 4096 },
  architecture: {
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
  },
  supported_parameters: ["tools", "reasoning", "max_tokens"],
  pricing,
});
const empty = (): OpenRouterCatalogState => ({
  models: [],
  selections: [],
  freeOnly: false,
  fetchedAt: 0,
});
function setup(records: unknown[] = [raw()]) {
  let state: OpenRouterCatalogState | null = null;
  let key = "private-test-key";
  const store = {
    getSecret: () => key,
    getOpenRouterCatalog: () => state,
    setOpenRouterCatalog: (next: OpenRouterCatalogState) => {
      state = structuredClone(next);
      registerOpenRouterModels(next.models.map(openRouterModelOption));
    },
  };
  const fetcher = vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({ data: records })),
  );
  const changed = vi.fn();
  const service = new OpenRouterCatalogService(
    store,
    changed,
    fetcher as typeof fetch,
  );
  return {
    service,
    fetcher,
    changed,
    store,
    state: () => state!,
    setKey: (value: string) => {
      key = value;
    },
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  registerOpenRouterModels([]);
  setOpenRouterCatalogGuard(undefined);
});

describe("OpenRouter discovery and selections", () => {
  it("stops promptly while shared discovery is still pending", async () => {
    setOpenRouterCatalogGuard(() => new Promise(() => {}));
    const controller = new AbortController();
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    const work = new OpenRouterAdapter().stream({
      model: "openrouter/example/new-model",
      provider: "openrouter",
      openRouterApiKey: "test",
      cliproxyBaseUrl: "",
      geminiApiKey: "",
      deepseekApiKey: "",
      opencodeGoApiKey: "",
      systemInstruction: "",
      messages: [],
      reasoning: "none",
      signal: controller.signal,
      collaborationMode: "default",
      onTextDelta: vi.fn(),
      onThoughtDelta: vi.fn(),
      onToolCall: vi.fn(),
      onToolDraft: vi.fn(),
    });
    controller.abort(new Error("Stopped"));
    await expect(work).rejects.toThrow("Stopped");
    expect(request).not.toHaveBeenCalled();
  });
  it("has no hardcoded OpenRouter model roster", () => {
    expect(getModelProviderGroups().some((g) => g.id === "openrouter")).toBe(
      false,
    );
    expect(
      new OpenRouterCatalogService(setup().store).cached().selections,
    ).toEqual([]);
  });
  it("parses capabilities and prices without treating missing values as free", () => {
    expect(isFreeOpenRouterModel(parseOpenRouterModel(raw())!)).toBe(true);
    expect(
      parseOpenRouterModel({
        ...raw(),
        context_length: null,
        supported_parameters: [],
      }),
    ).toMatchObject({ contextLength: undefined, supportedParameters: [] });
    for (const pricing of [
      {},
      { prompt: "-1", completion: "0" },
      { prompt: "", completion: "0" },
      { prompt: null, completion: "0" },
    ])
      expect(
        parseOpenRouterModel(raw("example/unknown", pricing))?.pricing,
      ).toBeNull();
    expect(
      isFreeOpenRouterModel(
        parseOpenRouterModel(
          raw("example/request-fee", {
            prompt: "0",
            completion: "0",
            request: "0.01",
          }),
        )!,
      ),
    ).toBe(false);
    expect(
      parseOpenRouterModel({
        ...raw(),
        architecture: {
          input_modalities: ["text"],
          output_modalities: ["image"],
        },
      }),
    ).toBeNull();
    expect(
      openRouterModelOption(
        parseOpenRouterModel({
          ...raw(),
          supported_parameters: ["include_reasoning"],
        })!,
      ).supportsReasoning,
    ).toBe(false);
    expect(
      parseOpenRouterCatalog({
        data: [raw(), raw(), { id: "https://bad.example" }],
      }),
    ).toHaveLength(1);
    expect(() => parseOpenRouterCatalog({ data: [] })).toThrow(/no compatible/);
  });
  it("discovers with the saved key, caches, and adds exact models without an app update", async () => {
    const s = setup();
    await s.service.list();
    await s.service.list();
    expect(s.fetcher).toHaveBeenCalledTimes(1);
    expect(s.fetcher.mock.calls[0][0]).toBe(
      "https://openrouter.ai/api/v1/models/user",
    );
    expect(
      s.service.update({ id: "example/new-model", enabled: true }).selections,
    ).toHaveLength(1);
    expect(getModelOption("openrouter/example/new-model")).toMatchObject({
      provider: "openrouter",
      supportsImageInput: true,
      supportsTools: true,
      reasoningControl: "toggle",
      contextWindowTokens: 32768,
    });
    expect(await s.service.prepare("example/new-model")).toEqual({
      maxPrice: { prompt: 0, completion: 0, request: 0, image: 0 },
    });
    expect(s.changed).toHaveBeenCalled();
  });
  it("does not remap a discovered model into another provider", async () => {
    const s = setup([raw("deepseek/deepseek-v4-flash")]);
    await s.service.list();
    expect(normalizeModelId("openrouter/deepseek/deepseek-v4-flash")).toBe(
      "openrouter/deepseek/deepseek-v4-flash",
    );
    expect(
      getModelOption("openrouter/deepseek/deepseek-v4-flash").provider,
    ).toBe("openrouter");
    registerOpenRouterModels([
      openRouterModelOption(
        parseOpenRouterModel(raw("opencode-go/glm-5.3-flash"))!,
      ),
    ]);
    expect(getModelOption("opencode-go/glm-5.3-flash").provider).toBe(
      "opencode-go",
    );
    expect(
      getModelOption("openrouter/opencode-go/glm-5.3-flash").provider,
    ).toBe("openrouter");
  });
  it("blocks free-to-paid changes and enforces explicit accepted price ceilings", async () => {
    const s = setup();
    await s.service.list();
    s.service.update({ id: "example/new-model", enabled: true });
    s.fetcher.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              raw("example/new-model", {
                prompt: "0.000001",
                completion: "0.000002",
              }),
            ],
          }),
        ),
    );
    await s.service.list(true);
    await expect(s.service.prepare("example/new-model")).rejects.toThrow(
      /Review.*price/,
    );
    s.service.update({ id: "example/new-model", enabled: true });
    expect(
      (await s.service.prepare("example/new-model")).maxPrice,
    ).toMatchObject({ prompt: 1, completion: 2 });
    s.service.update({ freeOnly: true });
    await expect(s.service.prepare("example/new-model")).rejects.toThrow(
      /Free models only/,
    );
    s.fetcher.mockImplementation(
      async () => new Response(JSON.stringify({ data: [raw()] })),
    );
    await s.service.list(true);
    expect((await s.service.prepare("example/new-model")).maxPrice).toEqual({
      prompt: 0,
      completion: 0,
      request: 0,
      image: 0,
    });
  });
  it("preserves a removed model's metadata but prevents sending it", async () => {
    const s = setup();
    await s.service.list();
    s.service.update({ id: "example/new-model", enabled: true });
    s.fetcher.mockImplementation(
      async () =>
        new Response(JSON.stringify({ data: [raw("example/replacement")] })),
    );
    const next = await s.service.list(true);
    expect(next.models.some((m) => m.id === "example/new-model")).toBe(true);
    expect(next.unavailableIds).toContain("example/new-model");
    await expect(s.service.prepare("example/new-model")).rejects.toThrow(
      /unavailable/,
    );
  });
  it("retains offline data, backs off failed refreshes, and never exposes raw error bodies", async () => {
    const s = setup();
    await s.service.list();
    s.service.update({ id: "example/new-model", enabled: true });
    s.store.setOpenRouterCatalog({ ...s.state(), fetchedAt: 1 });
    s.fetcher.mockImplementation(
      async () =>
        new Response("private-test-key provider error", { status: 500 }),
    );
    const stale = await s.service.list();
    await s.service.list();
    expect(stale.stale).toBe(true);
    expect(stale.models).toHaveLength(1);
    expect(JSON.stringify(stale)).not.toContain("private-test-key");
    expect(s.fetcher).toHaveBeenCalledTimes(2);
    expect((await s.service.prepare("example/new-model")).maxPrice.prompt).toBe(
      0,
    );
  });
  it("does not save a catalog fetched for a replaced key", async () => {
    const s = setup();
    s.fetcher.mockImplementation(async () => {
      s.setKey("replacement");
      return new Response(JSON.stringify({ data: [raw()] }));
    });
    expect((await s.service.list()).error).toMatch(/key changed/i);
    expect(s.state()).toBeNull();
  });
  it("does not lose selections made while a refresh is pending", async () => {
    const s = setup();
    await s.service.list();
    let release!: (r: Response) => void;
    s.fetcher.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    const pending = s.service.list(true);
    s.service.update({ id: "example/new-model", enabled: true });
    release(new Response(JSON.stringify({ data: [raw()] })));
    expect((await pending).selections.map((s) => s.id)).toEqual([
      "example/new-model",
    ]);
  });
  it("rejects unknown, stale-price and expired selections", async () => {
    const s = setup([
      raw(),
      { ...raw("example/expired"), expiration_date: "2020-01-01" },
    ]);
    await s.service.list();
    expect(() =>
      s.service.update({ id: "example/missing", enabled: true }),
    ).toThrow(/unavailable/);
    expect(() =>
      s.service.update({ id: "example/expired", enabled: true }),
    ).toThrow(/unavailable/);
    s.store.setOpenRouterCatalog({ ...s.state(), fetchedAt: 1 });
    expect(() =>
      s.service.update({ id: "example/new-model", enabled: true }),
    ).toThrow(/Refresh/);
    expect(() =>
      s.service.update({ id: "example/new-model", enabled: false }),
    ).not.toThrow();
  });
  it("respects small context windows and merges only enabled picker models", () => {
    const model = openRouterModelOption(
      parseOpenRouterModel({
        ...raw(),
        context_length: 4096,
        top_provider: { max_completion_tokens: 2048 },
      })!,
    );
    registerOpenRouterModels([model]);
    const budget = resolveModelRuntimeBudget(model.id);
    expect(
      budget.inputBudgetTokens! +
        budget.outputTokens! +
        budget.safetyReserveTokens!,
    ).toBeLessThanOrEqual(4096);
    expect(
      withOpenRouterModels(getModelProviderGroups(), [model]).find(
        (g) => g.id === "openrouter",
      )?.models,
    ).toEqual([model]);
    expect(
      withOpenRouterModels(getModelProviderGroups(), []).some(
        (g) => g.id === "openrouter",
      ),
    ).toBe(false);
  });
  it("uses discovered request capabilities and price guards without sending unsupported controls", async () => {
    const entry = parseOpenRouterModel({
      ...raw(),
      supported_parameters: ["max_tokens"],
    })!;
    registerOpenRouterModels([openRouterModelOption(entry)]);
    setOpenRouterCatalogGuard(async () => ({
      maxPrice: { prompt: 0, completion: 0, request: 0, image: 0 },
    }));
    const request = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response("data: [DONE]\n\n"),
    );
    vi.stubGlobal("fetch", request);
    await new OpenRouterAdapter().stream({
      model: `openrouter/${entry.id}`,
      provider: "openrouter",
      openRouterApiKey: "test",
      cliproxyBaseUrl: "",
      geminiApiKey: "",
      deepseekApiKey: "",
      opencodeGoApiKey: "",
      systemInstruction: "",
      messages: [],
      reasoning: "none",
      signal: new AbortController().signal,
      collaborationMode: "default",
      onTextDelta: vi.fn(),
      onThoughtDelta: vi.fn(),
      onToolCall: vi.fn(),
      onToolDraft: vi.fn(),
    } as ProviderStreamOptions);
    const body = JSON.parse(
      (request.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("reasoning");
    expect(body).not.toHaveProperty("temperature");
    expect(body.provider).toEqual({
      require_parameters: true,
      max_price: { prompt: 0, completion: 0, request: 0, image: 0 },
    });
    expect(body.model).toBe(entry.id);
  });
});
