import { afterEach, describe, expect, it, vi } from "vitest";
import { CliproxyAdapter } from "../src/main/agent/providers/cliproxy";
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

  it("sends max_tokens to OpenRouter only when a budget is provided", async () => {
    const fetchMock = vi.fn(async () => sseResponse());
    vi.stubGlobal("fetch", fetchMock);

    await new OpenRouterAdapter().stream(baseOptions({ provider: "openrouter", model: "deepseek/deepseek-v4-flash:free", maxOutputTokens: undefined }));
    let body = requestBodyAt(fetchMock, 0);
    expect(body.max_tokens).toBeUndefined();

    await new OpenRouterAdapter().stream(baseOptions({ provider: "openrouter", model: "gpt-test", maxOutputTokens: 12_000 }));
    body = requestBodyAt(fetchMock, 1);
    expect(body.max_tokens).toBe(12_000);
  });
});
