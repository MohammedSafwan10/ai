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

const baseOptions = (overrides: Partial<ProviderStreamOptions> = {}): ProviderStreamOptions => ({
  provider: "cliproxy",
  model: "gpt-5.5",
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
    expect(body.model).toBe("gpt-5.5");
    expect(body.max_output_tokens).toBe(32_000);
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

  it("keeps CLIProxy model aliasing centralized and preserves GPT-5.5", () => {
    expect(resolveCliproxyModelId("gpt-5.5")).toBe("gpt-5.5");
    expect(resolveCliproxyModelId("gemini-3.5-flash-cliproxy")).toBe("gemini-3-flash-agent");
    expect(cliproxyPromptCacheKey("thread-123")).toBe("privora:thread:thread-123:v1");
  });

  it("sends max_tokens to OpenRouter only when a budget is provided", async () => {
    const fetchMock = vi.fn(async () => sseResponse());
    vi.stubGlobal("fetch", fetchMock);

    await new OpenRouterAdapter().stream(baseOptions({ provider: "openrouter", model: "deepseek/deepseek-v4-flash", maxOutputTokens: undefined }));
    let body = requestBodyAt(fetchMock, 0);
    expect(body.max_tokens).toBeUndefined();
    expect(body.prompt_cache_key).toBeUndefined();
    expect(requestHeadersAt(fetchMock, 0)?.Session_id).toBeUndefined();

    await new OpenRouterAdapter().stream(baseOptions({ provider: "openrouter", model: "gpt-test", maxOutputTokens: 12_000 }));
    body = requestBodyAt(fetchMock, 1);
    expect(body.max_tokens).toBe(12_000);
  });

  it("retries OpenRouter once with the output tokens the key can afford", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: {
          message: "This request requires more credits, or fewer max_tokens. You requested up to 4096 tokens, but can only afford 1050.",
          code: 402,
        },
      }), { status: 402 }))
      .mockResolvedValueOnce(sseResponse());
    vi.stubGlobal("fetch", fetchMock);

    await new OpenRouterAdapter().stream(baseOptions({
      provider: "openrouter",
      model: "minimax/minimax-m3",
      maxOutputTokens: 4_096,
    }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestBodyAt(fetchMock, 0).max_tokens).toBe(4_096);
    expect(requestBodyAt(fetchMock, 1).max_tokens).toBe(1_050);
  });
});
