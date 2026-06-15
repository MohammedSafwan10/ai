import type { AgentHarnessApi } from "./contracts";

export class AgentHarness implements AgentHarnessApi {
  constructor(private coordinator: AgentHarnessApi) {}

  startTurn(input: Parameters<AgentHarnessApi["startTurn"]>[0]) {
    return this.coordinator.startTurn(input);
  }

  continueRun(threadId: string) {
    return this.coordinator.continueRun(threadId);
  }

  stopTurn(threadId: string) {
    return this.coordinator.stopTurn(threadId);
  }

  answerRequestUserInput(input: Parameters<AgentHarnessApi["answerRequestUserInput"]>[0]) {
    return this.coordinator.answerRequestUserInput(input);
  }

  decideApproval(input: Parameters<AgentHarnessApi["decideApproval"]>[0]) {
    return this.coordinator.decideApproval(input);
  }

  getActiveRun(threadId: string) {
    return this.coordinator.getActiveRun(threadId);
  }

  listActiveRuns() {
    return this.coordinator.listActiveRuns();
  }

  getTerminalState() {
    return this.coordinator.getTerminalState();
  }

  readTerminalSession(sessionId: number, maxOutputChars?: number) {
    return this.coordinator.readTerminalSession(sessionId, maxOutputChars);
  }

  stopTerminalSession(sessionId: number) {
    return this.coordinator.stopTerminalSession(sessionId);
  }

  resizeTerminalSession(sessionId: number, rows: number, cols: number) {
    return this.coordinator.resizeTerminalSession(sessionId, rows, cols);
  }
}
