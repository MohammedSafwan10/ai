import type { DesktopStore } from "../../db/store";
import type { ActiveRunState, AgentRunCheckpointRecord, ChatMessageRecord } from "../../../shared/types";
import { toActiveRunState, type AgentRunTracker } from "../runState";
import { appendToolResults } from "../providers/types";

export class RunRecoveryService {
  constructor(private store: DesktopStore) {}

  activeRun(threadId: string, liveRun?: AgentRunTracker | null): ActiveRunState | null {
    if (liveRun) return toActiveRunState(liveRun);
    const checkpoint = this.store.getRunCheckpoint(threadId);
    if (!checkpoint) return null;
    const message = this.store.getMessage(checkpoint.assistantMessageId);
    if (!isRecoverableMessage(message)) return null;
    return {
      threadId,
      assistantMessageId: checkpoint.assistantMessageId,
      phase: message.status,
      status: message.status,
      updatedAt: checkpoint.updatedAt,
      iteration: checkpoint.iteration,
      toolCount: checkpoint.toolCount,
      reason: message.status === "awaiting_approval"
        ? "Waiting for approval."
        : message.status === "stalled"
        ? "The model connection stalled."
        : "Stopped. Completed tool changes were kept.",
      resumable: message.status !== "awaiting_approval",
    };
  }

  checkpoint(threadId: string) {
    return this.store.getRunCheckpoint(threadId);
  }

  save(checkpoint: AgentRunCheckpointRecord) {
    return this.store.saveRunCheckpoint(checkpoint);
  }

  clear(threadId: string) {
    this.store.clearRunCheckpoint(threadId);
  }

  discardResumable(threadId: string, liveRun?: AgentRunTracker | null) {
    if (liveRun?.resumable && isResumablePhase(liveRun.phase)) {
      this.clear(threadId);
      return true;
    }
    const checkpoint = this.checkpoint(threadId);
    if (!checkpoint) return false;
    const message = this.store.getMessage(checkpoint.assistantMessageId);
    if (!isResumableMessage(message)) return false;
    this.clear(threadId);
    return true;
  }

  recoverInterruptedUserInputs() {
    for (const checkpoint of this.store.listRunCheckpoints()) {
      const pending = checkpoint.pendingUserInput;
      if (!pending) continue;
      const message = this.store.getMessage(checkpoint.assistantMessageId);
      const result = pending.resolvedResult || {
        success: false,
        error: "The app restarted before user input was answered.",
        data: { answers: {}, interrupted: true },
      };
      const history = pending.resolvedResult
        ? checkpoint.history
        : appendToolResults(checkpoint.history as never[], [{
            id: pending.call.id,
            name: pending.call.name,
            response: result,
          }]);
      const tool = this.store.findToolEventByCall(checkpoint.threadId, pending.call.id);
      const nextTool = tool ? {
          ...tool,
          status: pending.resolvedResult ? "done" as const : "failed" as const,
          result,
          output: result.output || result.error,
          endedAt: Date.now(),
          updatedAt: Date.now(),
        } : null;
      if (message && message.status !== "completed") {
        const nextMessage = {
          ...message,
          status: "stopped",
          updatedAt: Date.now(),
        } as const;
        this.store.commitRecoveryState(
          nextTool ? [nextTool] : [],
          { ...checkpoint, history, pendingUserInput: undefined },
          nextMessage,
        );
      } else {
        this.save({ ...checkpoint, history, pendingUserInput: undefined });
        if (nextTool) this.store.upsertToolEvent(nextTool);
      }
    }
  }

  cancelPendingApproval(threadId: string, reason: string) {
    const checkpoint = this.checkpoint(threadId);
    const message = checkpoint ? this.store.getMessage(checkpoint.assistantMessageId) : null;
    if (!checkpoint || message?.status !== "awaiting_approval") return false;
    const pending = this.store.listToolEventsForMessage(threadId, checkpoint.assistantMessageId)
      .filter((event) => event.status === "awaiting_approval" || event.status === "running");
    let history = checkpoint.history as never[];
    const stoppedEvents = pending.map((event) => {
      history = appendToolResults(history, [{
        id: event.callId,
        name: event.name,
        response: { success: false, error: reason, data: { interrupted: true } },
      }]) as never[];
      return {
        ...event,
        status: "stopped",
        result: { success: false, error: reason, data: { interrupted: true } },
        output: reason,
        endedAt: Date.now(),
        updatedAt: Date.now(),
      } as const;
    });
    const stoppedMessage = {
      ...message,
      content: message.content || "Stopped. Completed tool changes were kept.",
      status: "stopped",
      updatedAt: Date.now(),
    } as const;
    this.store.commitRecoveryState(stoppedEvents, { ...checkpoint, history }, stoppedMessage);
    return true;
  }
}

const isResumablePhase = (phase: AgentRunTracker["phase"]) =>
  phase === "stopped" || phase === "stalled" || phase === "failed";

const isResumableMessage = (
  message: ChatMessageRecord | null,
): message is ChatMessageRecord & { status: "stalled" | "stopped" } =>
  Boolean(message && (message.status === "stalled" || message.status === "stopped"));

const isRecoverableMessage = (
  message: ChatMessageRecord | null,
): message is ChatMessageRecord & { status: "stalled" | "stopped" | "awaiting_approval" } =>
  Boolean(message && (message.status === "stalled" || message.status === "stopped" || message.status === "awaiting_approval"));
