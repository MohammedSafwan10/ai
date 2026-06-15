import type {
  ActiveRunState,
  ApprovalDecisionInput,
  RequestUserInputResponseInput,
  StartTurnInput,
  TerminalSessionRecord,
} from "../../../shared/types";
import type { DesktopToolOrchestrator } from "../tools/orchestrator";

export interface HarnessTerminalState {
  sessions: TerminalSessionRecord[];
  updatedAt: number;
}

export interface AgentHarnessApi {
  startTurn(input: StartTurnInput): Promise<void>;
  continueRun(threadId: string): Promise<void>;
  stopTurn(threadId: string): void;
  answerRequestUserInput(input: RequestUserInputResponseInput): Promise<void>;
  decideApproval(input: ApprovalDecisionInput): Promise<void>;
  getActiveRun(threadId: string): ActiveRunState | null;
  listActiveRuns(): ActiveRunState[];
  getTerminalState(): HarnessTerminalState;
  readTerminalSession(sessionId: number, maxOutputChars?: number): ReturnType<DesktopToolOrchestrator["readTerminalSession"]>;
  stopTerminalSession(sessionId: number): ReturnType<DesktopToolOrchestrator["stopTerminalProcess"]>;
  resizeTerminalSession(sessionId: number, rows: number, cols: number): ReturnType<DesktopToolOrchestrator["resizeTerminalSession"]>;
}
