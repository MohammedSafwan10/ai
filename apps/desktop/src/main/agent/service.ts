import type { ApprovalDecisionInput, RequestUserInputResponseInput, StartTurnInput } from "../../shared/types";
import type { AgentRuntime } from "./runtime";

export interface AgentService {
  startTurn(input: StartTurnInput): Promise<void>;
  continueRun(threadId: string): Promise<void>;
  stopTurn(threadId: string): void;
  answerRequestUserInput(input: RequestUserInputResponseInput): Promise<void>;
  decideApproval(input: ApprovalDecisionInput): Promise<void>;
  getActiveRun(threadId: string): ReturnType<AgentRuntime["getActiveRun"]>;
  listActiveRuns(): ReturnType<AgentRuntime["listActiveRuns"]>;
}

export class InProcessAgentService implements AgentService {
  constructor(private runtime: AgentRuntime) {}

  startTurn(input: StartTurnInput) {
    return this.runtime.startTurn(input);
  }

  continueRun(threadId: string) {
    return this.runtime.continueRun(threadId);
  }

  stopTurn(threadId: string) {
    this.runtime.stopTurn(threadId);
  }

  answerRequestUserInput(input: RequestUserInputResponseInput) {
    return this.runtime.answerRequestUserInput(input);
  }

  decideApproval(input: ApprovalDecisionInput) {
    return this.runtime.decideApproval(input);
  }

  getActiveRun(threadId: string) {
    return this.runtime.getActiveRun(threadId);
  }

  listActiveRuns() {
    return this.runtime.listActiveRuns();
  }
}
