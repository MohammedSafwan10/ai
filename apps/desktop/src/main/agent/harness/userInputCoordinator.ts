import type {
  DesktopToolCall,
  PrivoraEventPayload,
  RequestUserInputResponseInput,
  ToolResult,
} from "../../../shared/types";
import { markRunProgress, transitionRun, type AgentRunTracker } from "../runState";
import { normalizeRequestUserInputQuestions, summarizeUserInputAnswers } from "../harness/support/userInput";

interface PendingUserInput {
  threadId: string;
  assistantMessageId: string;
  call: DesktopToolCall;
  run: AgentRunTracker;
  cleanup?: () => void;
  resolve: (result: ToolResult) => void;
}

export interface UserInputCoordinatorPorts {
  emitRun: (run: AgentRunTracker) => void;
  emitEvent: (event: PrivoraEventPayload) => void;
  persistPending: (threadId: string, call: DesktopToolCall, questions: import("../../../shared/types").RequestUserInputQuestionRecord[]) => void;
  persistResolved: (threadId: string, call: DesktopToolCall, result: ToolResult) => void;
}

export class UserInputCoordinator {
  private pendingByCallId = new Map<string, PendingUserInput>();

  constructor(private ports: UserInputCoordinatorPorts) {}

  hasThread(threadId: string) {
    return Array.from(this.pendingByCallId.values()).some((item) => item.threadId === threadId);
  }

  pendingRun(threadId: string) {
    return Array.from(this.pendingByCallId.values()).find((item) => item.threadId === threadId)?.run || null;
  }

  async request(input: {
    call: DesktopToolCall;
    controller: AbortController;
    run: AgentRunTracker;
    threadId: string;
    messageId: string;
    isPlanMode: boolean;
  }): Promise<ToolResult> {
    if (!input.isPlanMode) {
      return { success: false, error: "request_user_input is only available in Plan Mode." };
    }
    const normalized = normalizeRequestUserInputQuestions(input.call.arguments.questions);
    if (!normalized.success) return { success: false, error: normalized.error };

    transitionRun(input.run, "waiting_tool", {
      iteration: input.run.iteration,
      toolCount: input.run.toolCount,
      reason: "Waiting for your answer.",
      resumable: false,
    });
    this.ports.emitRun(input.run);

    const result = await new Promise<ToolResult>((resolve) => {
      const pending: PendingUserInput = {
        threadId: input.threadId,
        assistantMessageId: input.messageId,
        call: input.call,
        run: input.run,
        resolve,
      };
      this.pendingByCallId.set(input.call.id, pending);
      this.ports.persistPending(input.threadId, input.call, normalized.questions);
      const abort = () => this.resolve(input.call.id, stoppedResult());
      input.controller.signal.addEventListener("abort", abort, { once: true });
      pending.cleanup = () => input.controller.signal.removeEventListener("abort", abort);
      this.ports.emitEvent({
        type: "user_input.requested",
        request: {
          threadId: input.threadId,
          assistantMessageId: input.messageId,
          callId: input.call.id,
          questions: normalized.questions,
          createdAt: Date.now(),
        },
      });
    });
    this.ports.emitRun(input.run);
    return result;
  }

  answer(input: RequestUserInputResponseInput) {
    const pending = this.pendingByCallId.get(input.callId);
    if (!pending || pending.threadId !== input.threadId) return;
    markRunProgress(pending.run);
    this.resolve(input.callId, {
      success: true,
      output: JSON.stringify({ answers: input.answers }, null, 2),
      data: {
        answers: input.answers,
        summary: summarizeUserInputAnswers(input.answers),
      },
    });
  }

  cancelThread(threadId: string) {
    Array.from(this.pendingByCallId.values())
      .filter((item) => item.threadId === threadId)
      .forEach((item) => this.resolve(item.call.id, stoppedResult()));
  }

  private resolve(callId: string, result: ToolResult) {
    const pending = this.pendingByCallId.get(callId);
    if (!pending) return;
    this.pendingByCallId.delete(callId);
    this.ports.persistResolved(pending.threadId, pending.call, result);
    pending.cleanup?.();
    this.ports.emitEvent({ type: "user_input.resolved", threadId: pending.threadId, callId });
    pending.resolve(result);
  }
}

const stoppedResult = (): ToolResult => ({
  success: false,
  error: "Stopped before user input was answered.",
  data: { answers: {}, interrupted: true },
});
