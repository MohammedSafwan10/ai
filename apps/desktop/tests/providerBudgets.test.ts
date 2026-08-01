import { afterEach, describe, expect, it, vi } from "vitest";
import { CliproxyAdapter, cliproxyPromptCacheKey, resolveCliproxyModelId } from "../src/main/agent/providers/cliproxy";
import { OpenRouterAdapter } from "../src/main/agent/providers/openrouter";
import type { ProviderStreamOptions } from "../src/main/agent/providers/types";

const sseResponse = () => new Response(new ReadableStream({
  start(controller) {
    controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
    controller.close();
  },
}), { status: 200 });

const sseResponseWith = (chunks: string[]) => new Response(new ReadableStream({
  start(controller) {
    const encoder = new TextEncoder();
    chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    controller.close();
  },
}), { status: 200 });

const baseOptions = (overrides: Partial<ProviderStreamOptions> = {}): ProviderStreamOptions => ({
  provider: "cliproxy",
  model: "gpt-5.6-sol",
  systemInstruction: "system",
  messages: [{ role: "user", content: "hi", parts: [{ type: "text", text: "hi" }] }],
  reasoning: "medium",
  collaborationMode: "default",
  signal: new AbortController().signal,
  maxOutputTokens: 32_000,
  cliproxyBaseUrl: "http://127.0.0.1:8317",
  appwriteEndpoint: "https://sgp.cloud.appwrite.io/v1",
  appwriteProjectId: "project",
  privoraGatewayFunctionId: "model-gateway",
  privoraSessionCookie: "a_session_project=test",
  privoraUserJwt: "",
  openRouterApiKey: "openrouter-key",
  geminiApiKey: "gemini-key",
  onTextDelta: vi.fn(),
  onThoughtDelta: vi.fn(),
  onToolDraft: vi.fn(),
  onToolCall: vi.fn(),
  ...overrides,
});

const requestBodyAt = (fetchMock: ReturnType<typeof vi.fn>, index: number) => {
  const init = fetchMock.mock.calls[index]?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body || "{}"));
};

const requestHeadersAt = (fetchMock: ReturnType<typeof vi.fn>, index: number) => {
  const init = fetchMock.mock.calls[index]?.[1] as RequestInit | undefined;
  return init?.headers as Record<string, string> | undefined;
};

describe("provider output budgets", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends max_output_tokens to CLIProxy Responses", async () => {
    const fetchMock = vi.fn(async () => sseResponse());
    vi.stubGlobal("fetch", fetchMock);

    await new CliproxyAdapter().stream(baseOptions());

    const body = requestBodyAt(fetchMock, 0);
    expect(body.model).toBe("gpt-5.6-sol");
    expect(body.max_output_tokens).toBe(32_000);
  });

  it("preserves exact GPT-5.6 reasoning levels including off and max", async () => {
    const fetchMock = vi.fn(async () => sseResponse());
    vi.stubGlobal("fetch", fetchMock);

    await new CliproxyAdapter().stream(baseOptions({ reasoning: "none" }));
    await new CliproxyAdapter().stream(baseOptions({ reasoning: "max" }));

    expect(requestBodyAt(fetchMock, 0).reasoning.effort).toBe("none");
    expect(requestBodyAt(fetchMock, 1).reasoning.effort).toBe("max");
  });

  it("adds thread-scoped prompt caching and session stability to CLIProxy requests", async () => {
    const fetchMock = vi.fn(async () => sseResponse());
    vi.stubGlobal("fetch", fetchMock);

    await new CliproxyAdapter().stream(baseOptions({ threadId: "thread-123" }));

    const expectedCacheKey = "privora:thread:thread-123:v1";
    expect(requestBodyAt(fetchMock, 0).prompt_cache_key).toBe(expectedCacheKey);
    expect(requestHeadersAt(fetchMock, 0)?.Session_id).toBe(expectedCacheKey);
  });

  it("does not add prompt cache fields when CLIProxy has no thread id", async () => {
    const fetchMock = vi.fn(async () => sseResponse());
    vi.stubGlobal("fetch", fetchMock);

    await new CliproxyAdapter().stream(baseOptions());

    expect(requestBodyAt(fetchMock, 0).prompt_cache_key).toBeUndefined();
    expect(requestHeadersAt(fetchMock, 0)?.Session_id).toBeUndefined();
  });

  it("keeps CLIProxy GPT model IDs unchanged", () => {
    expect(resolveCliproxyModelId("gpt-5.6-sol")).toBe("gpt-5.6-sol");
    expect(resolveCliproxyModelId("gpt-5.6-terra")).toBe("gpt-5.6-terra");
    expect(cliproxyPromptCacheKey("thread-123")).toBe("privora:thread:thread-123:v1");
  });

  it("routes CLIProxy Responses output text to visible assistant text", async () => {
    const onTextDelta = vi.fn();
    const onThoughtDelta = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => sseResponseWith([
      "event: response.output_text.delta\n",
      "data: {\"type\":\"response.output_text.delta\",\"delta\":\"hello\"}\n\n",
    ])));

    await new CliproxyAdapter().stream(baseOptions({ onTextDelta, onThoughtDelta }));

    expect(onTextDelta).toHaveBeenCalledWith("hello");
    expect(onThoughtDelta).not.toHaveBeenCalled();
  });

  it("routes CLIProxy reasoning summaries to Thought process with stable part boundaries", async () => {
    const onTextDelta = vi.fn();
    const onThoughtDelta = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => sseResponseWith([
      "event: response.reasoning_summary_text.delta\n",
      "data: {\"type\":\"response.reasoning_summary_text.delta\",\"delta\":\"Need inspect file.\"}\n\n",
      "event: response.reasoning_summary_part.added\n",
      "data: {\"type\":\"response.reasoning_summary_part.added\"}\n\n",
      "event: response.reasoning_summary_text.done\n",
      "data: {\"type\":\"response.reasoning_summary_text.done\",\"text\":\"Then edit it.\"}\n\n",
      "event: response.reasoning_text.delta\n",
      "data: {\"type\":\"response.reasoning_text.delta\",\"delta\":\"Raw hidden thought.\"}\n\n",
    ])));

    await new CliproxyAdapter().stream(baseOptions({ onTextDelta, onThoughtDelta }));

    expect(onTextDelta).not.toHaveBeenCalled();
    expect(onThoughtDelta).toHaveBeenNthCalledWith(1, "Need inspect file.");
    expect(onThoughtDelta).toHaveBeenNthCalledWith(2, "\n\n");
    expect(onThoughtDelta).toHaveBeenNthCalledWith(3, "Then edit it.");
    expect(onThoughtDelta).toHaveBeenCalledTimes(3);
  });

  it("does not show loose chat-style or malformed CLIProxy chunks as visible text", async () => {
    const onTextDelta = vi.fn();
    const onThoughtDelta = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => sseResponseWith([
      "data: {\"choices\":[{\"delta\":{\"content\":\"Need run tests.\"}}]}\n\n",
      "event: response.output_text.delta\n",
      "data: Need raw fallback should stay hidden\n\n",
    ])));

    await new CliproxyAdapter().stream(baseOptions({ onTextDelta, onThoughtDelta }));

    expect(onTextDelta).not.toHaveBeenCalled();
    expect(onThoughtDelta).not.toHaveBeenCalled();
  });

  it("sends max_tokens to OpenRouter only when a budget is provided", async () => {
    const fetchMock = vi.fn(async () => sseResponse());
    vi.stubGlobal("fetch", fetchMock);

    await new OpenRouterAdapter().stream(baseOptions({ provider: "openrouter", model: "deepseek/deepseek-v4-flash", maxOutputTokens: undefined }));
    let body = requestBodyAt(fetchMock, 0);
    expect(body.max_tokens).toBeUndefined();
    expect(body.prompt_cache_key).toBeUndefined();
    expect(requestHeadersAt(fetchMock, 0)?.Session_id).toBeUndefined();

    await new OpenRouterAdapter().stream(baseOptions({ provider: "openrouter", model: "deepseek/deepseek-v4-flash", maxOutputTokens: 12_000 }));
    body = requestBodyAt(fetchMock, 1);
    expect(body.max_tokens).toBe(12_000);
  });

  it("fails without retrying when OpenRouter rejects the configured output budget", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: {
          message: "This request requires more credits, or fewer max_tokens. You requested up to 4096 tokens, but can only afford 1050.",
          code: 402,
        },
      }), { status: 402 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new OpenRouterAdapter().stream(baseOptions({
      provider: "openrouter",
      model: "minimax/minimax-m3",
      maxOutputTokens: 4_096,
    }))).rejects.toThrow(/can only afford 1,050 output tokens/i);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestBodyAt(fetchMock, 0).max_tokens).toBe(4_096);
  });

  it("uses effort controls only where OpenRouter exposes them", async () => {
    const fetchMock = vi.fn(async () => sseResponse());
    vi.stubGlobal("fetch", fetchMock);

    await new OpenRouterAdapter().stream(baseOptions({ provider: "openrouter", model: "deepseek/deepseek-v4-flash", reasoning: "xhigh" }));
    await new OpenRouterAdapter().stream(baseOptions({ provider: "openrouter", model: "minimax/minimax-m3", reasoning: "medium" }));
    await new OpenRouterAdapter().stream(baseOptions({ provider: "openrouter", model: "minimax/minimax-m3", reasoning: "none" }));

    expect(requestBodyAt(fetchMock, 0).reasoning).toEqual({ effort: "xhigh", exclude: false });
    expect(requestBodyAt(fetchMock, 1).reasoning).toEqual({ enabled: true, exclude: false });
    expect(requestBodyAt(fetchMock, 2).reasoning).toEqual({ enabled: false, exclude: false });
  });
});
