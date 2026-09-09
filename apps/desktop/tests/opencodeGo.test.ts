import { describe, expect, it, vi } from "vitest";
import {
  fetchGoModelIds,
  goRouteFor,
  goSessionId,
  normalizeGoError,
  prettifyGoLabel,
  synthesizeGoModelOption,
} from "../src/shared/opencodeGo";
import {
  findModelOption,
  getModelOption,
  getModelProviderGroups,
  withDiscoveredGoModels,
} from "../src/shared/models";
import { OpenCodeGoAdapter } from "../src/main/agent/providers/opencodeGo";
import type { ProviderStreamOptions } from "../src/main/agent/providers/types";

describe("opencode go model discovery", () => {
  it("synthesizes safe options for chat-route families", () => {
    const flash = synthesizeGoModelOption("opencode-go/deepseek-v4-flash");
    expect(flash).toMatchObject({
      id: "opencode-go/deepseek-v4-flash",
      provider: "opencode-go",
      supportsImageInput: false,
      upstreamModelId: "deepseek-v4-flash",
    });
    const vision = synthesizeGoModelOption("deepseek-v4-flash-vision-exp");
    expect(vision?.supportsImageInput).toBe(true);
    expect(vision?.id).toBe("opencode-go/deepseek-v4-flash-vision-exp");
    expect(synthesizeGoModelOption("kimi-k2.7-code")?.provider).toBe("opencode-go");
  });

  it("returns null only for unrecognized families", () => {
    expect(synthesizeGoModelOption("opencode-go/gpt-5.6-luna")?.provider).toBe("opencode-go");
    expect(synthesizeGoModelOption("opencode-go/minimax-m3")?.provider).toBe("opencode-go");
    expect(synthesizeGoModelOption("opencode-go/qwen3.7-max")?.provider).toBe("opencode-go");
    expect(synthesizeGoModelOption("opencode-go/totally-unknown-xyz")).toBeNull();
    expect(synthesizeGoModelOption("")).toBeNull();
  });

  it("resolves static and discovered go models through the shared registry", () => {
    expect(getModelOption("opencode-go/deepseek-v4-flash").provider).toBe("opencode-go");
    const dynamic = findModelOption("opencode-go/grok-4.5");
    expect(dynamic?.provider).toBe("opencode-go");
    expect(getModelOption("opencode-go/gpt-5.6-luna").provider).toBe("opencode-go");
    expect(findModelOption("opencode-go/totally-unknown-xyz")).toBeUndefined();
    expect(() => getModelOption("opencode-go/totally-unknown-xyz")).toThrow(/unknown or removed model/i);
  });

  it("merges discovered ids into the go picker group without duplicates", () => {
    const groups = withDiscoveredGoModels(getModelProviderGroups(), [
      "deepseek-v4-flash",
      "opencode-go/grok-4.5",
      "opencode-go/gpt-5.6-luna",
    ]);
    const go = groups.find((group) => group.id === "opencode-go");
    expect(go).toBeDefined();
    const ids = go?.models.map((model) => model.id) || [];
    expect(ids.filter((id) => id === "opencode-go/deepseek-v4-flash")).toHaveLength(1);
    expect(ids).toContain("opencode-go/grok-4.5");
    expect(ids).toContain("opencode-go/gpt-5.6-luna");
  });

  it("marks native-vision models from every verified family", () => {
    const vision = [
      "opencode-go/deepseek-v4-flash-vision-exp",
      "opencode-go/kimi-k3",
      "opencode-go/kimi-k2.7-code",
      "opencode-go/muse-spark-1.3-contributor",
      "opencode-go/muse-spark-1.2-contributor",
      "opencode-go/grok-4.6",
      "opencode-go/gpt-5.6-luna",
      "opencode-go/minimax-m3",
      "opencode-go/qwen3.7-plus",
      "opencode-go/qwen3.5-plus",
      "opencode-go/qwen3.8-flash",
      "opencode-go/mimo-v2.5",
    ];
    for (const id of vision) {
      expect(synthesizeGoModelOption(id)?.supportsImageInput, id).toBe(true);
    }
    const textOnly = [
      "opencode-go/deepseek-v4-flash",
      "opencode-go/deepseek-v4-pro",
      "opencode-go/glm-5.2",
      "opencode-go/glm-5.3",
      "opencode-go/qwen3.7-max",
      "opencode-go/qwen3.8-max",
      "opencode-go/minimax-m2.7",
      "opencode-go/longcat-2.0",
      "opencode-go/hy3",
      "opencode-go/omen-alpha",
    ];
    for (const id of textOnly) {
      expect(synthesizeGoModelOption(id)?.supportsImageInput, id).toBe(false);
    }
  });

  it("uses verified 1M-class context windows", () => {
    expect(synthesizeGoModelOption("kimi-k3")?.contextWindowTokens).toBe(1_048_576);
    expect(synthesizeGoModelOption("muse-spark-1.3-contributor")?.contextWindowTokens).toBe(1_048_576);
    expect(synthesizeGoModelOption("grok-4.6")?.contextWindowTokens).toBe(500_000);
    expect(getModelOption("opencode-go/minimax-m3")).toMatchObject({
      supportsImageInput: true,
      contextWindowTokens: 1_048_576,
    });
  });

  it("gives muse spark its official ladder without the unsupported off switch", () => {
    const spark = synthesizeGoModelOption("opencode-go/muse-spark-1.3-contributor");
    expect(spark?.reasoningEfforts).toEqual(["minimal", "low", "medium", "high", "xhigh"]);
    expect(spark?.defaultReasoningEffort).toBe("medium");
    expect(spark?.supportsReasoning).toBe(true);
    expect(findModelOption("opencode-go/muse-spark-1.2-contributor")?.provider).toBe("opencode-go");
    expect(getModelOption("opencode-go/grok-4.6").provider).toBe("opencode-go");
  });

  it("derives stable session ids with a random fallback", () => {
    expect(goSessionId("thread-123")).toBe("thread-123");
    expect(goSessionId("Thread_ABC!!")).toBe("threadabc");
    expect(goSessionId()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("prettifies go model ids for display", () => {
    expect(prettifyGoLabel("kimi-k2.7-code")).toBe("Kimi K2.7 Code");
    expect(prettifyGoLabel("deepseek-v4-flash")).toBe("Deepseek V4 Flash");
  });

  it("fetches and splits the live catalog", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      object: "list",
      data: [{ id: "deepseek-v4-flash" }, { id: "gpt-5.6-luna" }, { id: "future-unknown-zzz" }, { id: 42 }, {}],
    }), { status: 200 }));
    const result = await fetchGoModelIds("go-key", fetchMock as unknown as typeof fetch);
    expect(result.ids).toEqual(["deepseek-v4-flash", "gpt-5.6-luna"]);
    expect(result.unsupported).toEqual(["future-unknown-zzz"]);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer go-key");
  });

  it("normalizes auth and cap errors", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }));
    await expect(fetchGoModelIds("bad-key", fetchMock as unknown as typeof fetch)).rejects.toThrow(/rejected the saved api key/i);
    expect(normalizeGoError("rate limit exceeded", 429)).toMatch(/usage cap/i);
  });

  it("routes families to the right go endpoint", () => {
    expect(goRouteFor("opencode-go/deepseek-v4-flash")).toBe("chat");
    expect(goRouteFor("opencode-go/kimi-k2.7-code")).toBe("chat");
    expect(goRouteFor("opencode-go/gpt-5.6-luna")).toBe("responses");
    expect(goRouteFor("opencode-go/grok-4.6")).toBe("responses");
    expect(goRouteFor("opencode-go/muse-spark-1.3-contributor")).toBe("responses");
    expect(goRouteFor("opencode-go/minimax-m3")).toBe("messages");
    expect(goRouteFor("opencode-go/qwen3.7-max")).toBe("messages");
    expect(goRouteFor("something-else")).toBe("chat");
  });

  it("sends the required session and user-agent headers on the chat route", async () => {
    const fetchMock = vi.fn(async () => sseResponseWith([]));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await new OpenCodeGoAdapter().stream(goOptions({ threadId: "thread-123" }));
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://opencode.ai/zen/go/v1/chat/completions");
      const headers = init.headers as Record<string, string>;
      expect(headers["x-opencode-session"]).toBe("thread-123");
      expect(headers["User-Agent"]).toBe("Privora-Desktop");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("streams luna through the go responses route", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => sseResponseWith([
      "event: response.output_text.delta\n",
      "data: {\"type\":\"response.output_text.delta\",\"delta\":\"luna says hi\"}\n\n",
      "event: response.output_item.done\n",
      "data: {\"type\":\"response.output_item.done\",\"item\":{\"type\":\"function_call\",\"call_id\":\"call-1\",\"name\":\"desktop_list_dir\",\"arguments\":\"{}\" }}\n\n",
    ]));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const onTextDelta = vi.fn();
      const onToolCall = vi.fn();
      await new OpenCodeGoAdapter().stream(goOptions({
        model: "opencode-go/gpt-5.6-luna",
        threadId: "thread-123",
        onTextDelta,
        onToolCall,
      }));
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://opencode.ai/zen/go/v1/responses");
      const body = JSON.parse(String(init.body));
      expect(body.model).toBe("gpt-5.6-luna");
      expect(body.instructions).toBe("system");
      expect(body.reasoning).toEqual({ effort: "high", summary: "auto" });
      expect((init.headers as Record<string, string>)["x-opencode-session"]).toBe("thread-123");
      expect(onTextDelta).toHaveBeenCalledWith("luna says hi");
      expect(onToolCall).toHaveBeenCalledTimes(1);
      expect(onToolCall.mock.calls[0][0]).toMatchObject({ name: "desktop_list_dir" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("never sends temperature on any go route", async () => {    const fetchMock = vi.fn(async () => sseResponseWith([]));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await new OpenCodeGoAdapter().stream(goOptions({ model: "opencode-go/deepseek-v4-flash" }));
      await new OpenCodeGoAdapter().stream(goOptions({ model: "opencode-go/gpt-5.6-luna" }));
      await new OpenCodeGoAdapter().stream(goOptions({ model: "opencode-go/minimax-m3" }));
      for (const [, init] of fetchMock.mock.calls as unknown as Array<[string, RequestInit]>) {
        expect(JSON.parse(String(init.body))).not.toHaveProperty("temperature");
      }
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("omits reasoning on the responses route when effort is none", async () => {
    const fetchMock = vi.fn(async () => sseResponseWith([]));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await new OpenCodeGoAdapter().stream(goOptions({
        model: "opencode-go/gpt-5.6-luna",
        reasoning: "none",
      }));
      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(JSON.parse(String(init.body)).reasoning).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("streams minimax through the go messages route with required max_tokens", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => sseResponseWith([
      "event: message_start\n",
      "data: {\"type\":\"message_start\",\"message\":{\"usage\":{\"input_tokens\":12}}}\n\n",
      "event: content_block_start\n",
      "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\"}}\n\n",
      "event: content_block_delta\n",
      "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"mini says\"}}\n\n",
      "event: content_block_start\n",
      "data: {\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"tool_use\",\"id\":\"tool-1\",\"name\":\"desktop_list_dir\"}}\n\n",
      "event: content_block_delta\n",
      "data: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{}\" }}\n\n",
      "event: content_block_stop\n",
      "data: {\"type\":\"content_block_stop\",\"index\":1}\n\n",
      "event: message_delta\n",
      "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"tool_use\"},\"usage\":{\"output_tokens\":7}}\n\n",
    ]));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const onTextDelta = vi.fn();
      const onToolCall = vi.fn();
      const onUsage = vi.fn();
      await new OpenCodeGoAdapter().stream(goOptions({
        model: "opencode-go/minimax-m3",
        maxOutputTokens: undefined,
        onTextDelta,
        onToolCall,
        onUsage,
      }));
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://opencode.ai/zen/go/v1/messages");
      expect((init.headers as Record<string, string>)["anthropic-version"]).toBe("2023-06-01");
      expect((init.headers as Record<string, string>)["x-api-key"]).toBe("go-key");
      expect((init.headers as Record<string, string>)["x-opencode-session"]).toMatch(/^[a-z0-9-]+$/);
      const body = JSON.parse(String(init.body));
      expect(body.model).toBe("minimax-m3");
      expect(body.max_tokens).toBe(32_768);
      expect(body.system).toBe("system");
      expect(onTextDelta).toHaveBeenCalledWith("mini says");
      expect(onToolCall).toHaveBeenCalledTimes(1);
      expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: 12, outputTokens: 7 }));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("fails loudly when thought alone exhausts the chat output budget", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponseWith([
      "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"long thought\"},\"finish_reason\":null}]}\n\n",
      "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"length\"}]}\n\n",
    ])));
    try {
      const onThoughtDelta = vi.fn();
      await expect(new OpenCodeGoAdapter().stream(goOptions({
        model: "opencode-go/kimi-k3",
        maxOutputTokens: 4_096,
        onThoughtDelta,
      }))).rejects.toThrow(/4,096-token output limit.*Continue/);
      expect(onThoughtDelta).toHaveBeenCalledWith("long thought");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("fails loudly on messages max_tokens stops", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponseWith([
      "event: message_start\n",
      "data: {\"type\":\"message_start\",\"message\":{\"usage\":{\"input_tokens\":5}}}\n\n",
      "event: message_delta\n",
      "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"max_tokens\"},\"usage\":{\"output_tokens\":9}}\n\n",
    ])));
    try {
      await expect(new OpenCodeGoAdapter().stream(goOptions({
        model: "opencode-go/minimax-m3",
        maxOutputTokens: 4_096,
      }))).rejects.toThrow(/output limit/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("gives go thinkers room with a 16k default output budget", async () => {
    const { resolveModelRuntimeBudget } = await import("../src/shared/models");
    expect(getModelOption("opencode-go/kimi-k3").defaultOutputTokens).toBe(16_384);
    expect(resolveModelRuntimeBudget("opencode-go/kimi-k3", "normal").outputTokens).toBe(16_384);
    expect(resolveModelRuntimeBudget("opencode-go/gpt-5.6-luna", "normal").outputTokens).toBe(16_384);
  });
});

const sseResponseWith = (chunks: string[]) => new Response(new ReadableStream({
  start(controller) {
    const encoder = new TextEncoder();
    chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    controller.close();
  },
}), { status: 200 });

const goOptions = (overrides: Partial<ProviderStreamOptions> = {}): ProviderStreamOptions => ({
  provider: "opencode-go",
  model: "opencode-go/deepseek-v4-flash",
  systemInstruction: "system",
  messages: [{ role: "user", content: "hi", parts: [{ type: "text", text: "hi" }] }],
  reasoning: "high",
  collaborationMode: "default",
  signal: new AbortController().signal,
  maxOutputTokens: 4_096,
  cliproxyBaseUrl: "http://127.0.0.1:8317",
  appwriteEndpoint: "https://sgp.cloud.appwrite.io/v1",
  appwriteProjectId: "project",
  privoraGatewayFunctionId: "model-gateway",
  privoraSessionCookie: "a_session_project=test",
  privoraUserJwt: "",
  openRouterApiKey: "openrouter-key",
  geminiApiKey: "gemini-key",
  deepseekApiKey: "deepseek-key",
  opencodeGoApiKey: "go-key",
  onTextDelta: vi.fn(),
  onThoughtDelta: vi.fn(),
  onToolDraft: vi.fn(),
  onToolCall: vi.fn(),
  ...overrides,
});
