import { afterEach, describe, expect, it, vi } from "vitest";
import { CliproxyAdapter, ResponsesToolCallTracker } from "../src/main/agent/providers/cliproxy";
import { OpenCodeGoAdapter } from "../src/main/agent/providers/opencodeGo";
import type { ProviderStreamOptions } from "../src/main/agent/providers/types";

const events = [
  { type: "response.output_item.added", output_index: 0, item: { id: "fc_first", type: "function_call", call_id: "call_first", name: "desktop_write_file", arguments: "" } },
  { type: "response.function_call_arguments.delta", item_id: "fc_first", output_index: 0, delta: '{"path":"fixture.txt",' },
  // A second call intentionally has identical arguments but a distinct identity.
  { type: "response.output_item.added", output_index: 1, item: { id: "fc_second", type: "function_call", call_id: "call_second", name: "desktop_write_file", arguments: "" } },
  { type: "response.function_call_arguments.delta", output_index: 1, delta: '{"path":"fixture.txt","content":"hello"}' },
  { type: "response.function_call_arguments.delta", item_id: "fc_first", delta: '"content":"hello"}' },
  { type: "response.function_call_arguments.done", item_id: "fc_first", output_index: 0, name: "desktop_write_file", arguments: '{"path":"fixture.txt","content":"hello"}' },
  { type: "response.function_call_arguments.done", item_id: "fc_second", output_index: 1, name: "desktop_write_file", arguments: '{"path":"fixture.txt","content":"hello"}' },
  { type: "response.output_item.done", output_index: 0, item: { id: "fc_first", type: "function_call", call_id: "call_first", name: "desktop_write_file", arguments: '{"path":"fixture.txt","content":"hello"}' } },
  { type: "response.output_item.done", output_index: 1, item: { id: "fc_second", type: "function_call", call_id: "call_second", name: "desktop_write_file", arguments: '{"path":"fixture.txt","content":"hello"}' } },
];

const streamResponse = () => new Response(new ReadableStream({
  start(controller) {
    for (const event of events) controller.enqueue(new TextEncoder().encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
    controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
    controller.close();
  },
}));

const options = (provider: ProviderStreamOptions["provider"]): ProviderStreamOptions => ({
  provider, model: provider === "opencode-go" ? "opencode-go/muse-spark-1.3-contributor" : "gpt-5.6-sol",
  systemInstruction: "system", messages: [], reasoning: "none", collaborationMode: "default", signal: AbortSignal.timeout(5000),
  cliproxyBaseUrl: "http://127.0.0.1:8317", appwriteEndpoint: "", appwriteProjectId: "", privoraGatewayFunctionId: "", privoraSessionCookie: "", privoraUserJwt: "",
  openRouterApiKey: "", geminiApiKey: "", deepseekApiKey: "", opencodeGoApiKey: "test-key",
  onTextDelta: vi.fn(), onThoughtDelta: vi.fn(), onToolDraft: vi.fn(), onToolCall: vi.fn(),
});

afterEach(() => vi.unstubAllGlobals());

describe("Responses canonical tool identity", () => {
  for (const provider of ["opencode-go", "cliproxy"] as const) {
    it(`${provider}: executes arguments.done plus output_item.done once per call_id`, async () => {
      vi.stubGlobal("fetch", vi.fn(async () => streamResponse()));
      const callbacks = options(provider);
      const adapter = provider === "opencode-go" ? new OpenCodeGoAdapter() : new CliproxyAdapter();
      await adapter.stream(callbacks);
      const onToolCall = vi.mocked(callbacks.onToolCall);
      expect(onToolCall).toHaveBeenCalledTimes(2);
      expect(onToolCall.mock.calls.map(([call]) => call.id)).toEqual(["call_first", "call_second"]);
      expect(onToolCall.mock.calls[0][0].arguments).toEqual({ path: "fixture.txt", content: "hello" });
      expect(onToolCall.mock.calls[1][0].arguments).toEqual(onToolCall.mock.calls[0][0].arguments);
    });
  }

  it("waits for a canonical call_id instead of creating an early random ID", () => {
    const onToolCall = vi.fn();
    const tracker = new ResponsesToolCallTracker({ onToolCall, onToolDraft: vi.fn() });
    tracker.consume(undefined, { type: "response.function_call_arguments.done", item_id: "fc_late", output_index: 0, name: "desktop_list_dir", arguments: "{}" });
    expect(onToolCall).not.toHaveBeenCalled();
    tracker.consume(undefined, { type: "response.output_item.done", output_index: 0, item: { id: "fc_late", type: "function_call", call_id: "call_late", name: "desktop_list_dir", arguments: "{}" } });
    expect(onToolCall).toHaveBeenCalledOnce();
    expect(onToolCall.mock.calls[0][0].id).toBe("call_late");
  });

  it("keeps early execution when the added item already established call_id", () => {
    const onToolCall = vi.fn();
    const tracker = new ResponsesToolCallTracker({ onToolCall, onToolDraft: vi.fn() });
    tracker.consume(undefined, events[0]);
    tracker.consume(undefined, events[5]);
    expect(onToolCall).toHaveBeenCalledOnce();
    expect(onToolCall.mock.calls[0][0].id).toBe("call_first");
    tracker.consume(undefined, events[7]);
    expect(onToolCall).toHaveBeenCalledOnce();
  });

  it("recognizes all final-response calls and deduplicates earlier lifecycle events", () => {
    const onToolCall = vi.fn();
    const tracker = new ResponsesToolCallTracker({ onToolCall, onToolDraft: vi.fn() });
    tracker.consume(undefined, events[7]);
    tracker.consume(undefined, { type: "response.completed", response: { output: [events[7].item, events[8].item] } });
    expect(onToolCall.mock.calls.map(([call]) => call.id)).toEqual(["call_first", "call_second"]);
  });

  it("does not merge anonymous calls merely because name and arguments match", () => {
    const onToolCall = vi.fn();
    const tracker = new ResponsesToolCallTracker({ onToolCall, onToolDraft: vi.fn() });
    tracker.consume(undefined, { type: "response.function_call_arguments.done", name: "desktop_list_dir", arguments: "{}" });
    expect(onToolCall).not.toHaveBeenCalled();
    tracker.consume(undefined, { type: "response.output_item.done", item: { type: "function_call", call_id: "call_one", name: "desktop_list_dir", arguments: "{}" } });
    tracker.consume(undefined, { type: "response.output_item.done", item: { type: "function_call", call_id: "call_two", name: "desktop_list_dir", arguments: "{}" } });
    expect(onToolCall.mock.calls.map(([call]) => call.id)).toEqual(["call_one", "call_two"]);
  });
});
