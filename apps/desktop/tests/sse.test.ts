import { describe, expect, it } from "vitest";
import { readSse, splitSseEvents } from "../src/main/agent/providers/sse";

const sseResponse = (body: string) => new Response(new ReadableStream({
  start(controller) {
    controller.enqueue(new TextEncoder().encode(body));
    controller.close();
  },
}), { status: 200 });

describe("SSE parsing", () => {
  it("splits complete events and preserves the trailing partial event", () => {
    expect(splitSseEvents("data: one\n\ndata: two")).toEqual({
      events: ["data: one"],
      remaining: "data: two",
    });
  });

  it("reports progress for heartbeat/comment chunks even when they have no data", async () => {
    let progressCount = 0;
    const events: Array<{ event?: string; data: string }> = [];

    await readSse(sseResponse(": heartbeat\n\nevent: chunk\ndata: {\"ok\":true}\n\n"), (event, data) => {
      events.push({ event, data });
    }, () => {
      progressCount += 1;
    });

    expect(events).toEqual([{ event: "chunk", data: "{\"ok\":true}" }]);
    expect(progressCount).toBeGreaterThanOrEqual(2);
  });

  it("ignores comments and joins multi-line data according to SSE rules", async () => {
    const events: Array<{ event?: string; data: string }> = [];
    await readSse(sseResponse(": OPENROUTER PROCESSING\n\nevent: chunk\ndata: {\"a\":1,\ndata: \"b\":2}\n\ndata: [DONE]\n\n"), (event, data) => {
      events.push({ event, data });
    });

    expect(events).toEqual([{
      event: "chunk",
      data: "{\"a\":1,\n\"b\":2}",
    }]);
  });
});
