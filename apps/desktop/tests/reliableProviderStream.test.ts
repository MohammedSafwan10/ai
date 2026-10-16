import { afterEach, describe, expect, it, vi } from "vitest";
import { reliableProviderStream } from "../src/main/agent/providers/reliableStream";
import { ProviderRequestError, providerRetryDelay } from "../src/main/agent/providers/requestError";
import { ProviderStreamError, StreamOutcomeTracker } from "../src/main/agent/providers/streamOutcome";
import { OpenCodeGoAdapter } from "../src/main/agent/providers/opencodeGo";
import { DeepSeekAdapter } from "../src/main/agent/providers/deepseek";
import { OpenRouterAdapter } from "../src/main/agent/providers/openrouter";
import { CliproxyAdapter } from "../src/main/agent/providers/cliproxy";
import type { ProviderStreamOptions } from "../src/main/agent/providers/types";

const options = (overrides: Partial<ProviderStreamOptions> = {}): ProviderStreamOptions => ({
  provider: "opencode-go", model: "opencode-go/glm-5.3-flash", systemInstruction: "test", messages: [], reasoning: "high", collaborationMode: "default",
  signal: new AbortController().signal, cliproxyBaseUrl: "http://127.0.0.1:8317", appwriteEndpoint: "https://example.com", appwriteProjectId: "test",
  privoraGatewayFunctionId: "test", privoraSessionCookie: "", privoraUserJwt: "", openRouterApiKey: "fixture", geminiApiKey: "fixture", deepseekApiKey: "fixture", opencodeGoApiKey: "fixture",
  onTextDelta: vi.fn(), onThoughtDelta: vi.fn(), onToolDraft: vi.fn(), onToolCall: vi.fn(), onStreamOutcome: vi.fn(), onRetry: vi.fn(), ...overrides,
});
const sse = (events: unknown[]) => new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n");
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("structured provider finish", () => {
  it.each([
    ["stop", "completed"], ["tool_calls", "tool_calls"], ["length", "output_limit"], ["content_filter", "refused"], ["mystery", "incomplete"],
  ])("normalizes chat finish %s", (finish, expected) => {
    const tracker = new StreamOutcomeTracker();
    tracker.observe(undefined, { choices: [{ finish_reason: finish }] });
    expect(tracker.finish().status).toBe(expected);
  });
  it("handles Responses, Messages and Gemini terminal signals", () => {
    for (const event of [
      { type: "response.completed", response: { status: "completed" } },
      { type: "message_delta", delta: { stop_reason: "end_turn" } },
      { event_type: "interaction.complete", interaction: { status: "completed" } },
    ]) { const tracker = new StreamOutcomeTracker(); tracker.observe(undefined, event); expect(tracker.finish().status).toBe("completed"); }
    const tracker = new StreamOutcomeTracker();
    tracker.observe(undefined, { type: "response.incomplete", response: { incomplete_details: { reason: "max_output_tokens" } } });
    expect(tracker.finish().status).toBe("output_limit");
  });
  it.each([
    [new OpenCodeGoAdapter(), "opencode-go/glm-5.3-flash"], [new DeepSeekAdapter(), "deepseek-chat"], [new OpenRouterAdapter(), "opencode-go/glm-5.3-flash"],
  ] as const)("does not treat EOF/[DONE] as success on chat adapters %#", async (adapter, model) => {
    const fetcher = vi.fn(async () => sse([{ choices: [{ delta: { content: "Starting the next check:" } }] }]));
    vi.stubGlobal("fetch", fetcher);
    const input = options({ model });
    await expect(reliableProviderStream(adapter, input)).rejects.toMatchObject({ outcome: { status: "interrupted", reason: "missing_finish" } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(input.onTextDelta).toHaveBeenCalledWith("Starting the next check:");
  });
  it.each([new OpenCodeGoAdapter(), new CliproxyAdapter()])("detects a missing Responses finish on adapter %#", async (adapter) => {
    vi.stubGlobal("fetch", vi.fn(async () => sse([{ type: "response.output_text.delta", delta: "Partial" }])));
    await expect(reliableProviderStream(adapter, options({ model: "opencode-go/gpt-6-luna" }))).rejects.toBeInstanceOf(ProviderStreamError);
  });
  it("accepts a valid final answer and refuses to complete on output limit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sse([{ choices: [{ delta: { content: "Finished" }, finish_reason: "stop" }] }])));
    const input = options(); await reliableProviderStream(new OpenCodeGoAdapter(), input);
    expect(input.onStreamOutcome).toHaveBeenCalledWith({ status: "completed", reason: "stop" });
    vi.stubGlobal("fetch", vi.fn(async () => sse([{ choices: [{ delta: { content: "Partial" }, finish_reason: "length" }] }])));
    await expect(reliableProviderStream(new OpenCodeGoAdapter(), options())).rejects.toMatchObject({ outcome: { status: "output_limit" } });
  });
  it("rejects real streamed tool arguments that never become a complete call", async () => {
    const input = options();
    vi.stubGlobal("fetch", vi.fn(async () => sse([{ choices: [{ delta: { tool_calls: [{ index: 0, id: "broken", function: { name: "desktop_write_file", arguments: '{"path":"fixture","content":"unfinished' } }] }, finish_reason: "tool_calls" }] }])));
    await expect(reliableProviderStream(new OpenCodeGoAdapter(), input)).rejects.toMatchObject({ outcome: { status: "incomplete" } });
    expect(input.onToolCall).not.toHaveBeenCalled();
  });
  it("recognizes Messages output limits even without a usage update", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sse([
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Partial" } },
      { type: "message_delta", delta: { stop_reason: "max_tokens" } }, { type: "message_stop" },
    ])));
    await expect(reliableProviderStream(new OpenCodeGoAdapter(), options({ model: "opencode-go/claude-haiku-5-5" }))).rejects.toMatchObject({ outcome: { status: "output_limit" } });
  });
  it("does not hide malformed streamed JSON as successful EOF", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('data: {"choices":\n\n')));
    await expect(reliableProviderStream(new OpenCodeGoAdapter(), options())).rejects.toMatchObject({ outcome: { status: "incomplete", reason: "invalid_stream_event" } });
  });
  it("rejects an unfinished tool draft without executing it", async () => {
    const input = options();
    await expect(reliableProviderStream({ stream: async (o) => {
      o.onToolDraft({ id: "partial", name: "desktop_write_file", arguments: { path: "fixture" } });
      o.onStreamOutcome?.({ status: "tool_calls", reason: "tool_calls" });
    } }, input)).rejects.toMatchObject({ outcome: { reason: "incomplete_tool_call" } });
    expect(input.onToolCall).not.toHaveBeenCalled();
  });
  it("rejects a Responses tool item left open even when another item completed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sse([
      { type: "response.output_item.done", output_index: 0, item: { type: "function_call", id: "item-one", call_id: "call-one", name: "desktop_list_dir", arguments: "{}" } },
      { type: "response.output_item.added", output_index: 1, item: { type: "function_call", id: "item-two", call_id: "call-two", name: "desktop_write_file" } },
      { type: "response.completed", response: { status: "completed" } },
    ])));
    const input = options({ model: "opencode-go/gpt-6-luna" });
    await expect(reliableProviderStream(new OpenCodeGoAdapter(), input)).rejects.toMatchObject({ outcome: { reason: "incomplete_tool_call" } });
    expect(input.onToolCall).toHaveBeenCalledTimes(1);
  });
  it("does not retry after delivering a tool, even when the stream then fails", async () => {
    const input = options(); const stream = vi.fn(async (o: ProviderStreamOptions) => {
      o.onToolCall({ id: "executed", name: "desktop_write_file", arguments: { path: "fixture", content: "test" } });
      throw new ProviderRequestError("temporarily unavailable", 503);
    });
    await expect(reliableProviderStream({ stream }, input)).rejects.toBeInstanceOf(ProviderStreamError);
    expect(stream).toHaveBeenCalledTimes(1); expect(input.onToolCall).toHaveBeenCalledTimes(1); expect(input.onRetry).not.toHaveBeenCalled();
  });
});

describe("bounded provider retry", () => {
  it("honors Retry-After and bounded jitter without retrying auth, quota or invalid requests", () => {
    expect(providerRetryDelay(new ProviderRequestError("limit", 429, "3"), 0, () => 0.5)).toBe(3000);
    expect(providerRetryDelay(new ProviderRequestError("capacity", 503), 1, () => 0.5)).toBe(2000);
    expect(providerRetryDelay(new ProviderRequestError("capacity", 503), 2)).toBeNull();
    expect(providerRetryDelay(new ProviderRequestError("wait", 429, "120"), 0)).toBeNull();
    for (const status of [400, 401, 402, 403, 404, 422]) expect(providerRetryDelay(new ProviderRequestError("no", status), 0)).toBeNull();
  });
  it("retries before output and recovers on the next attempt", async () => {
    vi.useFakeTimers(); const input = options();
    const stream = vi.fn().mockRejectedValueOnce(new ProviderRequestError("busy", 503)).mockImplementationOnce(async (o: ProviderStreamOptions) => {
      o.onTextDelta("Recovered"); o.onStreamOutcome?.({ status: "completed", reason: "stop" });
    });
    const run = reliableProviderStream({ stream }, input);
    await vi.runAllTimersAsync(); await run;
    expect(stream).toHaveBeenCalledTimes(2); expect(input.onRetry).toHaveBeenCalledTimes(1);
    expect(input.onTextDelta).toHaveBeenCalledTimes(1);
  });
  it("stops after two automatic retries", async () => {
    vi.useFakeTimers(); const stream = vi.fn().mockRejectedValue(new ProviderRequestError("busy", 503));
    const result = reliableProviderStream({ stream }, options()).catch((error) => error);
    await vi.runAllTimersAsync(); expect(await result).toBeInstanceOf(ProviderStreamError); expect(stream).toHaveBeenCalledTimes(3);
  });
  it("cancels retry waits immediately without making another request", async () => {
    vi.useFakeTimers(); const controller = new AbortController();
    const stream = vi.fn().mockRejectedValue(new ProviderRequestError("busy", 503));
    const input = options({ signal: controller.signal });
    const result = reliableProviderStream({ stream }, input).catch((error) => error);
    await vi.advanceTimersByTimeAsync(0); expect(input.onRetry).toHaveBeenCalledTimes(1);
    controller.abort(); await result; await vi.runAllTimersAsync(); expect(stream).toHaveBeenCalledTimes(1);
    expect(input.onStreamOutcome).toHaveBeenCalledWith({ status: "interrupted", reason: "cancelled" });
  });
  it("never automatically retries a potentially charged hosted request", async () => {
    const stream = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    await expect(reliableProviderStream({ stream }, options({ provider: "privora-cloud" }))).rejects.toBeInstanceOf(ProviderStreamError);
    expect(stream).toHaveBeenCalledTimes(1);
  });
  it("does not retry after reported usage or a provider refusal", async () => {
    for (const callback of ["usage", "refusal"] as const) {
      const stream = vi.fn(async (o: ProviderStreamOptions) => {
        if (callback === "usage") o.onUsage?.({ inputTokens: 1, outputTokens: 1, totalTokens: 2, cachedInputTokens: 0, reasoningOutputTokens: 0 });
        else o.onResponseDisposition?.("model_refusal");
        throw new ProviderRequestError("busy", 503);
      });
      await expect(reliableProviderStream({ stream }, options())).rejects.toBeInstanceOf(ProviderStreamError);
      expect(stream).toHaveBeenCalledTimes(1);
    }
  });
  it("retries an explicit stream capacity error before output", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce(sse([{ type: "error", error: { type: "overloaded_error" } }]))
      .mockResolvedValueOnce(sse([{ choices: [{ delta: { content: "Recovered" }, finish_reason: "stop" }] }]));
    vi.stubGlobal("fetch", fetcher);
    const run = reliableProviderStream(new OpenCodeGoAdapter(), options());
    await vi.runAllTimersAsync(); await run;
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
