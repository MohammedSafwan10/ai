import type { BrowserWindow } from "electron";
import {
  PRIVORA_EVENT_PROTOCOL_VERSION,
  type PrivoraEventEnvelope,
  type PrivoraEventPayload,
} from "../../../shared/types";

let sequence = 0;

export const envelopePrivoraEvent = (payload: PrivoraEventPayload): PrivoraEventEnvelope => {
  const emittedAt = Date.now();
  const nextSequence = ++sequence;
  return {
    protocolVersion: PRIVORA_EVENT_PROTOCOL_VERSION,
    eventId: crypto.randomUUID(),
    sequence: nextSequence,
    emittedAt,
    ...eventCorrelation(payload),
    payload,
  };
};

export class HarnessEventBus {
  constructor(private getWindows: () => BrowserWindow[]) {}

  emit(payload: PrivoraEventPayload) {
    const event = envelopePrivoraEvent(payload);
    this.getWindows().forEach((window) => {
      if (!window.isDestroyed()) window.webContents.send("desktop:event", event);
    });
    return event;
  }
}

const eventCorrelation = (
  payload: PrivoraEventPayload,
): Pick<PrivoraEventEnvelope, "threadId" | "turnId" | "itemId"> => {
  switch (payload.type) {
    case "snapshot.updated":
      return { threadId: payload.snapshot.activeThreadId || undefined };
    case "message.upserted":
      return { threadId: payload.message.threadId, turnId: payload.message.role === "assistant" ? payload.message.id : undefined, itemId: payload.message.id };
    case "tool.upserted":
      return { threadId: payload.tool.threadId, turnId: payload.tool.messageId, itemId: payload.tool.id };
    case "turn_undo.updated":
      return { threadId: payload.undo.threadId, turnId: payload.undo.messageId, itemId: payload.undo.id };
    case "context.usage_updated":
      return { threadId: payload.usage.threadId };
    case "user_input.requested":
      return { threadId: payload.request.threadId, turnId: payload.request.assistantMessageId, itemId: payload.request.callId };
    case "user_input.resolved":
      return { threadId: payload.threadId, itemId: payload.callId };
    case "turn.status_changed":
      return { threadId: payload.threadId, turnId: payload.run?.assistantMessageId };
    case "image.started":
    case "image.completed":
    case "image.failed":
      return { threadId: payload.image.threadId, turnId: payload.image.messageId, itemId: payload.image.id };
    case "turn.started":
    case "turn.completed":
    case "turn.failed":
    case "turn.stopped":
    case "approval.requested":
    case "approval.resolved":
    case "verification.started":
    case "verification.completed":
    case "context.compacted":
      return { threadId: payload.threadId, turnId: payload.turnId };
    default:
      return {};
  }
};
