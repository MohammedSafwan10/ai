import type { BrowserSessionManager } from "../../browser/BrowserSessionManager";
import type { ComputerUseManager } from "../../computer/ComputerUseManager";
import type { NotesStore } from "../../notes/NotesStore";
import type { TerminalManagerEventListener } from "../../terminal/sessionManager";
import type { DesktopToolCall } from "../../../shared/types";
import { DesktopToolOrchestrator, type DesktopToolOrchestrator as ToolOrchestratorType } from "../tools/orchestrator";
import type { ToolExecutionContext } from "../tools/executor";

export class ToolCallCoordinator {
  private tools: ToolOrchestratorType;
  private processIdsByThread = new Map<string, Set<number>>();

  constructor(
    browserManager?: BrowserSessionManager,
    notesStore?: NotesStore,
    computerUseManager?: ComputerUseManager,
    onTerminalEvent?: TerminalManagerEventListener,
    orchestrator?: ToolOrchestratorType,
  ) {
    this.tools = orchestrator || new DesktopToolOrchestrator(browserManager, notesStore, computerUseManager, onTerminalEvent);
  }

  setComputerUseEnabled(enabled: boolean) {
    this.tools.setComputerUseEnabled(enabled);
  }

  assess(...args: Parameters<ToolOrchestratorType["assess"]>) {
    return this.tools.assess(...args);
  }

  execute(call: DesktopToolCall, context: ToolExecutionContext) {
    return this.tools.execute(call, context);
  }

  supportsParallelExecution(call: DesktopToolCall) {
    return this.tools.supportsParallelExecution(call);
  }

  getTerminalState() {
    return this.tools.getTerminalState();
  }

  readTerminalSession(sessionId: number, maxOutputChars?: number) {
    return this.tools.readTerminalSession(sessionId, maxOutputChars);
  }

  stopTerminalSession(sessionId: number) {
    this.untrackTerminalSession(sessionId);
    return this.tools.stopTerminalProcess(sessionId);
  }

  resizeTerminalSession(sessionId: number, rows: number, cols: number) {
    return this.tools.resizeTerminalSession(sessionId, rows, cols);
  }

  trackProcess(threadId: string, processId: number) {
    const processes = this.processIdsByThread.get(threadId) || new Set<number>();
    processes.add(processId);
    this.processIdsByThread.set(threadId, processes);
  }

  untrackProcess(threadId: string, processId: number) {
    const processes = this.processIdsByThread.get(threadId);
    if (!processes) return;
    processes.delete(processId);
    if (processes.size === 0) this.processIdsByThread.delete(threadId);
  }

  untrackTerminalSession(sessionId: number) {
    for (const [threadId, sessions] of this.processIdsByThread.entries()) {
      sessions.delete(sessionId);
      if (sessions.size === 0) this.processIdsByThread.delete(threadId);
    }
  }

  stopThreadProcesses(threadId: string) {
    const processes = this.processIdsByThread.get(threadId);
    if (!processes) return;
    this.processIdsByThread.delete(threadId);
    for (const processId of processes) {
      void this.tools.stopTerminalProcess(processId).catch(() => undefined);
    }
  }
}
