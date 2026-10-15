import type { DesktopStore } from "../../db/store";
import type { ActiveRunState, AgentRunCheckpointRecord, ChatMessageRecord } from "../../../shared/types";
import { toActiveRunState, type AgentRunTracker } from "../runState";
import { appendToolResults, type ProviderMessage } from "../providers/types";

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
      reason: checkpoint.interruptedAt
        ? "Interrupted when Privora closed. Progress saved. Resume to reconcile unfinished work before continuing."
        : message.status === "awaiting_approval"
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

  /** Startup only: never auto-execute, cancel, or replay potentially delivered work. */
  recoverInterruptedRuns() {
    for (const checkpoint of this.store.listRunCheckpoints()) {
      const message = this.store.getMessage(checkpoint.assistantMessageId);
      if (!message || ["completed", "failed", "stopped", "stalled", "awaiting_approval"].includes(message.status)) continue;
      const at = Date.now();
      let history = checkpoint.history as ProviderMessage[];
      const parts = history.flatMap((item) => item.parts ?? []);
      const answered = new Set(parts.filter((part) => part.type === "function_response").map((part) => part.id));
      const events = this.store.listToolEventsForMessage(checkpoint.threadId, checkpoint.assistantMessageId);
      const reason = "Privora restarted while this tool was pending. Execution outcome is unconfirmed. Reconcile persisted jobs and actual state before retrying; do not blindly replay changes.";
      const interrupted = events.filter((event) => event.status === "running" || event.status === "preparing").map((event) => ({ ...event, status: "stopped" as const, output: reason, result: { success: false, error: reason, data: { interrupted: true, requiresReconciliation: true } }, endedAt: at, updatedAt: at }));
      const seen = new Set<string>();
      for (const part of parts) {
        if (part.type !== "function_call" || answered.has(part.id) || seen.has(part.id)) continue;
        seen.add(part.id);
        const event = events.find((item) => item.callId === part.id);
        const response = event?.status === "done" && event.result ? event.result : { success: false, error: reason, data: { interrupted: true, requiresReconciliation: true } };
        history = appendToolResults(history, [{ id: part.id, name: part.name, response }]);
      }
      history = [...history, { role: "user", content: "Runtime recovery notice: Privora restarted. Continue the previously authorized task from retained evidence. Inspect unfinished job states before retrying any tool or state-changing operation. Queued agent messages remain pending until their recipient resumes; send_message does not start an idle child, while assign_task starts a follow-up." }];
      this.store.commitRecoveryState(interrupted, { ...checkpoint, history, interruptedAt: at, updatedAt: at }, { ...message, status: "stopped", updatedAt: at });
    }
    for (const agent of this.store.listSubagents()) {
      if (!["pending", "running", "waiting"].includes(agent.status)) continue;
      if (this.activeRun(agent.threadId)?.status === "awaiting_approval") continue;
      this.store.updateSubagent(agent.threadId, { status: "stopped", lastPreview: "Interrupted when Privora closed. Resume saved progress or assign a follow-up task." });
    }
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
