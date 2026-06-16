import { describe, expect, it } from "vitest";
import { coalescePrivoraEvents } from "../src/renderer/state/useDesktopState";
import { PRIVORA_EVENT_PROTOCOL_VERSION } from "../src/shared/types";
import type { PrivoraEventEnvelope, PrivoraEventPayload } from "../src/shared/types";
import { isNewPrivoraEventSequence, isPrivoraEventEnvelope } from "../src/shared/privoraProtocol";

describe("Privora event protocol", () => {
  it("preserves the latest canonical envelope when coalescing replaceable payloads", () => {
    const events = coalescePrivoraEvents([
      envelope(1, { type: "notification.created", tone: "info", message: "barrier" }),
      envelope(2, { type: "message.upserted", message: message("draft") }),
      envelope(3, { type: "message.upserted", message: message("final") }),
    ]);

    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      protocolVersion: PRIVORA_EVENT_PROTOCOL_VERSION,
      eventId: "event-3",
      sequence: 3,
      payload: {
        type: "message.upserted",
        message: { content: "final" },
      },
    });
  });

  it("combines command output while retaining the newest event metadata", () => {
    const events = coalescePrivoraEvents([
      envelope(10, { type: "tool.output_delta", callId: "call-1", delta: "hello " }),
      envelope(11, { type: "tool.output_delta", callId: "call-1", delta: "world" }),
    ]);

    expect(events).toEqual([
      expect.objectContaining({
        eventId: "event-11",
        sequence: 11,
        payload: { type: "tool.output_delta", callId: "call-1", delta: "hello world" },
      }),
    ]);
  });

  it("rejects malformed and wrong-version envelopes at the IPC boundary", () => {
    expect(isPrivoraEventEnvelope(envelope(1, { type: "notification.created", tone: "info", message: "ok" }))).toBe(true);
    expect(isPrivoraEventEnvelope({ ...envelope(1, { type: "notification.created", tone: "info", message: "ok" }), protocolVersion: 2 })).toBe(false);
    expect(isPrivoraEventEnvelope({ protocolVersion: 1, payload: { type: "snapshot.updated" } })).toBe(false);
    expect(isPrivoraEventEnvelope({ ...envelope(1, { type: "notification.created", tone: "info", message: "ok" }), payload: { type: "unknown.event" } })).toBe(false);
    expect(isPrivoraEventEnvelope({ ...envelope(1, { type: "notification.created", tone: "info", message: "ok" }), payload: { type: "notification.created", tone: "info" } })).toBe(false);
    expect(isPrivoraEventEnvelope(null)).toBe(false);
  });

  it("rejects duplicate and out-of-order event sequences", () => {
    const event = envelope(12, { type: "notification.created", tone: "info", message: "ok" });
    expect(isNewPrivoraEventSequence(11, event)).toBe(true);
    expect(isNewPrivoraEventSequence(12, event)).toBe(false);
    expect(isNewPrivoraEventSequence(13, event)).toBe(false);
  });

  it("keeps causal sequence order when coalescing different payload families", () => {
    const events = coalescePrivoraEvents([
      envelope(20, { type: "tool.upserted", tool: tool("running") }),
      envelope(21, { type: "message.upserted", message: message("done") }),
      envelope(22, { type: "turn.status_changed", threadId: "thread-1", run: null }),
    ]);

    expect(events.map((event) => event.sequence)).toEqual([20, 21, 22]);
  });

});

const envelope = <T extends PrivoraEventPayload>(sequence: number, payload: T): PrivoraEventEnvelope<T> => ({
  protocolVersion: PRIVORA_EVENT_PROTOCOL_VERSION,
  eventId: `event-${sequence}`,
  sequence,
  emittedAt: sequence * 10,
  payload,
});

const message = (content: string) => ({
  id: "assistant-1",
  threadId: "thread-1",
  role: "assistant" as const,
  content,
  status: "running" as const,
  createdAt: 1,
  updatedAt: 1,
});

const tool = (status: "running") => ({
  id: "tool-1",
  threadId: "thread-1",
  messageId: "assistant-1",
  callId: "call-1",
  name: "desktop_read_file",
  title: "Read file",
  args: {},
  status,
  risk: "safe" as const,
  createdAt: 1,
  updatedAt: 1,
});
