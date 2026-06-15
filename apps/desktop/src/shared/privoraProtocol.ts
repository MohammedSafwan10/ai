import {
  PRIVORA_EVENT_PROTOCOL_VERSION,
  type PrivoraEventEnvelope,
} from "./types";

export const isPrivoraEventEnvelope = (value: unknown): value is PrivoraEventEnvelope => {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<PrivoraEventEnvelope>;
  return event.protocolVersion === PRIVORA_EVENT_PROTOCOL_VERSION
    && typeof event.eventId === "string"
    && event.eventId.length > 0
    && typeof event.sequence === "number"
    && Number.isSafeInteger(event.sequence)
    && event.sequence > 0
    && typeof event.emittedAt === "number"
    && Number.isFinite(event.emittedAt)
    && isPrivoraEventPayload(event.payload);
};

export const isNewPrivoraEventSequence = (lastSequence: number, event: PrivoraEventEnvelope) =>
  event.sequence > lastSequence;

const isPrivoraEventPayload = (value: unknown) => {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "snapshot.updated":
      return isRecord(value.snapshot)
        && isRecord(value.snapshot.settings)
        && Array.isArray(value.snapshot.workspaces)
        && Array.isArray(value.snapshot.threads)
        && Array.isArray(value.snapshot.messages)
        && Array.isArray(value.snapshot.toolEvents)
        && Array.isArray(value.snapshot.subagents)
        && Array.isArray(value.snapshot.activeRuns);
    case "message.upserted":
      return isRecord(value.message) && hasString(value.message, "id") && hasString(value.message, "threadId");
    case "tool.upserted":
      return isRecord(value.tool) && hasString(value.tool, "id") && hasString(value.tool, "threadId");
    case "turn_undo.updated":
      return isRecord(value.undo) && hasString(value.undo, "id") && hasString(value.undo, "threadId");
    case "context.usage_updated":
      return isRecord(value.usage) && hasString(value.usage, "threadId");
    case "ai_credit.summary_updated":
      return isRecord(value.summary)
        && typeof value.summary.authenticated === "boolean"
        && hasString(value.summary, "plan")
        && hasString(value.summary, "status")
        && typeof value.summary.updatedAt === "number";
    case "browser.state_updated":
      return isRecord(value.state)
        && hasString(value.state, "workspaceId")
        && typeof value.state.url === "string"
        && typeof value.state.loading === "boolean"
        && Array.isArray(value.state.tabs)
        && typeof value.state.updatedAt === "number";
    case "computer.state_updated":
      return isRecord(value.state)
        && typeof value.state.enabled === "boolean"
        && hasString(value.state, "backend")
        && typeof value.state.active === "boolean"
        && Array.isArray(value.state.recentTraces)
        && typeof value.state.updatedAt === "number";
    case "browser.tools_menu_action":
      return hasString(value, "workspaceId") && hasString(value, "action");
    case "image.started":
    case "image.completed":
    case "image.failed":
      return isRecord(value.image) && hasString(value.image, "id") && hasString(value.image, "threadId");
    case "user_input.requested":
      return isRecord(value.request)
        && hasString(value.request, "threadId")
        && hasString(value.request, "assistantMessageId")
        && hasString(value.request, "callId")
        && Array.isArray(value.request.questions);
    case "user_input.resolved":
      return hasString(value, "threadId") && hasString(value, "callId");
    case "tool.output_delta":
      return hasString(value, "callId") && typeof value.delta === "string";
    case "terminal.output_delta":
      return typeof value.sessionId === "number"
        && (value.stream === "stdout" || value.stream === "stderr")
        && typeof value.delta === "string"
        && hasString(value, "chunkId")
        && typeof value.updatedAt === "number";
    case "terminal.session_updated":
      return isRecord(value.session) && typeof value.session.sessionId === "number";
    case "turn.started":
    case "turn.completed":
    case "turn.failed":
    case "turn.stopped":
    case "verification.started":
    case "verification.completed":
      return hasString(value, "threadId") && hasString(value, "turnId");
    case "approval.requested":
    case "approval.resolved":
      return hasString(value, "threadId") && hasString(value, "turnId") && isStringArray(value.callIds);
    case "context.compacted":
      return hasString(value, "threadId")
        && hasString(value, "turnId")
        && isRecord(value.checkpoint)
        && hasString(value.checkpoint, "id")
        && hasString(value.checkpoint, "threadId")
        && hasString(value.checkpoint, "workspaceRoot")
        && hasString(value.checkpoint, "model")
        && typeof value.checkpoint.summary === "string"
        && Array.isArray(value.checkpoint.replacementHistory)
        && typeof value.checkpoint.createdAt === "number";
    case "turn.status_changed":
      return hasString(value, "threadId") && (value.run === null || isRecord(value.run));
    case "notification.created":
      return (value.tone === "info" || value.tone === "error" || value.tone === "success") && hasString(value, "message");
    default:
      return false;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const hasString = (value: Record<string, unknown>, key: string) =>
  typeof value[key] === "string" && value[key].length > 0;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
