import { afterEach, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ generate: vi.fn(), construct: vi.fn() }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class { models = { generateContentStream: sdk.generate }; constructor(config: unknown) { sdk.construct(config); } } }));
import { streamDiscoveredGemini } from "../src/main/agent/providers/geminiCatalog";
import { parseCatalogModel } from "../src/shared/providerCatalog";
import type { ProviderStreamOptions } from "../src/main/agent/providers/types";
afterEach(() => vi.clearAllMocks());
function options(): ProviderStreamOptions {
  const modelInfo = parseCatalogModel("gemini", { name: "models/test-native", supportedGenerationMethods: ["generateContent"], outputTokenLimit: 8192 }, { tool_call: true, modalities: { input: ["text", "image"], output: ["text"] } })!;
  return { provider: "gemini", model: modelInfo.id, modelInfo, messages: [{ role: "user", content: "test" }], systemInstruction: "test", reasoning: "none", collaborationMode: "default", signal: new AbortController().signal, cliproxyBaseUrl: "", openRouterApiKey: "", geminiApiKey: "fake-google", deepseekApiKey: "", opencodeGoApiKey: "fake-go", onTextDelta: vi.fn(), onThoughtDelta: vi.fn(), onToolDraft: vi.fn(), onToolCall: vi.fn(), onStreamOutcome: vi.fn() };
}
it("uses native generation, preserves tool signatures, and passes cancellation in the SDK config", async () => {
  sdk.generate.mockImplementation(async function* () {
    yield { candidates: [{ content: { parts: [{ text: "working" }, { functionCall: { id: "tool-one", name: "desktop_list_dir", args: { path: "." } }, thoughtSignature: "opaque-signature" }] }, finishReason: "STOP" }] };
  });
  const o = options(); await streamDiscoveredGemini(o);
  const request = sdk.generate.mock.calls[0][0];
  expect(request.model).toBe("test-native"); expect(request.config.abortSignal).toBe(o.signal);
  expect(o.onTextDelta).toHaveBeenCalledWith("working");
  expect(o.onToolCall).toHaveBeenCalledWith(expect.objectContaining({ id: "tool-one", thoughtSignature: "opaque-signature" }));
  expect(o.onStreamOutcome).toHaveBeenCalledWith({ status: "tool_calls", reason: "tool_calls" });
});
it("treats an interrupted stream as incomplete and never silently completes it", async () => {
  sdk.generate.mockImplementation(async function* () { yield { candidates: [{ content: { parts: [{ text: "partial" }] } }] }; });
  await expect(streamDiscoveredGemini(options())).rejects.toThrow(/stream ended|interrupted/i);
});
it("routes Google-protocol Go models through the Go gateway with session attribution", async () => {
  sdk.generate.mockImplementation(async function* () { yield { candidates: [{ finishReason: "STOP" }] }; });
  await streamDiscoveredGemini({ ...options(), provider: "opencode-go", threadId: "test-thread" });
  expect(sdk.construct).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "fake-go", httpOptions: expect.objectContaining({ baseUrl: "https://opencode.ai/inference/go/google", headers: expect.objectContaining({ "x-opencode-session": "test-thread" }) }) }));
});
