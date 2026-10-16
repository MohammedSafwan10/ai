import { describe, expect, it, vi } from "vitest";
import type { ProviderPart, ProviderStreamOptions } from "../src/main/agent/providers/types";
const mocked = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class { interactions = { create: mocked.create }; } }));
import { GeminiAdapter, toGeminiInteractionInput } from "../src/main/agent/providers/gemini";
describe("Gemini interaction search history", () => {
  it("retains signed search calls and results from the actual adapter stream", async () => {
    mocked.create.mockResolvedValue((async function* () {
      yield { event_type: "step.start", index: 0, step: { type: "google_search_call", id: "search", arguments: {} } };
      yield { event_type: "step.delta", index: 0, delta: { type: "google_search_call", arguments: { queries: ["release notes"] }, signature: "call-signature" } };
      yield { event_type: "step.stop", index: 0 };
      yield { event_type: "step.start", index: 1, step: { type: "google_search_result", call_id: "search", result: [] } };
      yield { event_type: "step.delta", index: 1, delta: { type: "google_search_result", result: [{ search_suggestions: "Official release documentation" }], signature: "result-signature" } };
      yield { event_type: "step.stop", index: 1 };
    })());
    const parts: ProviderPart[] = [];
    await new GeminiAdapter().stream({
      provider: "gemini", model: "gemini-3.7-flash", systemInstruction: "", collaborationMode: "default",
      cliproxyBaseUrl: "", appwriteEndpoint: "", appwriteProjectId: "", privoraGatewayFunctionId: "",
      privoraSessionCookie: "", privoraUserJwt: "", openRouterApiKey: "", deepseekApiKey: "", opencodeGoApiKey: "",
      geminiApiKey: "test-fixture", messages: [], signal: new AbortController().signal, reasoning: "high",
      onTextDelta: vi.fn(), onThoughtDelta: vi.fn(), onToolDraft: vi.fn(), onToolCall: vi.fn(),
      onProviderContextPart: (part) => { parts.push(part); },
    } satisfies ProviderStreamOptions);
    expect(toGeminiInteractionInput([{ role: "assistant", content: "", parts }])).toEqual([
      { type: "google_search_call", id: "search", arguments: { queries: ["release notes"] }, signature: "call-signature" },
      { type: "google_search_result", call_id: "search", result: [{ search_suggestions: "Official release documentation" }], signature: "result-signature" },
    ]);
    expect(mocked.create.mock.calls.at(-1)?.[1]).toMatchObject({ maxRetries: 0 });
  });
  it("keeps older server-tool evidence as text instead of silently dropping it", () => {
    const result = toGeminiInteractionInput([{ role: "assistant", content: "", parts: [{ type: "server_tool_response", toolType: "GOOGLE_SEARCH_WEB", response: { result: "Preserved evidence" } }] }]);
    expect(JSON.stringify(result)).toContain("Preserved evidence");
  });
});
