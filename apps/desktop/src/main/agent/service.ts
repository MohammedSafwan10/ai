import type { ApprovalDecisionInput, RequestUserInputResponseInput, StartTurnInput } from "../../shared/types";
import type { AgentHarnessApi } from "./harness/contracts";

export interface AgentService {
  startTurn(input: StartTurnInput): Promise<void>;
  continueRun(threadId: string): Promise<void>;
  stopTurn(threadId: string): void;
  answerRequestUserInput(input: RequestUserInputResponseInput): Promise<void>;
  decideApproval(input: ApprovalDecisionInput): Promise<void>;
  getActiveRun(threadId: string): ReturnType<AgentHarnessApi["getActiveRun"]>;
  listActiveRuns(): ReturnType<AgentHarnessApi["listActiveRuns"]>;
  getTerminalState(): ReturnType<AgentHarnessApi["getTerminalState"]>;
  readTerminalSession(sessionId: number, maxOutputChars?: number): ReturnType<AgentHarnessApi["readTerminalSession"]>;
  stopTerminalSession(sessionId: number): ReturnType<AgentHarnessApi["stopTerminalSession"]>;
  resizeTerminalSession(sessionId: number, rows: number, cols: number): ReturnType<AgentHarnessApi["resizeTerminalSession"]>;
}

export class InProcessAgentService implements AgentService {
  constructor(private harness: AgentHarnessApi) {}

  startTurn(input: StartTurnInput) {
    return this.harness.startTurn(input);
  }

  continueRun(threadId: string) {
    return this.harness.continueRun(threadId);
  }

  stopTurn(threadId: string) {
    this.harness.stopTurn(threadId);
  }

  answerRequestUserInput(input: RequestUserInputResponseInput) {
    return this.harness.answerRequestUserInput(input);
  }

  decideApproval(input: ApprovalDecisionInput) {
    return this.harness.decideApproval(input);
  }

  getActiveRun(threadId: string) {
    return this.harness.getActiveRun(threadId);
  }

  listActiveRuns() {
    return this.harness.listActiveRuns();
  }

  getTerminalState() {
    return this.harness.getTerminalState();
  }

  readTerminalSession(sessionId: number, maxOutputChars?: number) {
    return this.harness.readTerminalSession(sessionId, maxOutputChars);
  }

  stopTerminalSession(sessionId: number) {
    return this.harness.stopTerminalSession(sessionId);
  }

  resizeTerminalSession(sessionId: number, rows: number, cols: number) {
    return this.harness.resizeTerminalSession(sessionId, rows, cols);
  }
}
