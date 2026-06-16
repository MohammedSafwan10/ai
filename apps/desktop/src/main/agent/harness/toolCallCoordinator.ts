import type { BrowserSessionManager } from "../../browser/BrowserSessionManager";
import type { ComputerUseManager } from "../../computer/ComputerUseManager";
import type { NotesStore } from "../../notes/NotesStore";
import type { TerminalManagerEventListener } from "../../terminal/sessionManager";
import type { DesktopToolCall, ToolResult } from "../../../shared/types";
import { DesktopToolOrchestrator } from "../tools/orchestrator";
import type { ToolExecutionContext } from "../tools/executor";
import { ToolLifecycleBus } from "../tools/lifecycle";

type ToolOrchestratorPort = Pick<DesktopToolOrchestrator,
  | "setComputerUseEnabled"
  | "assess"
  | "execute"
  | "supportsParallelExecution"
  | "getTerminalState"
  | "readTerminalSession"
  | "stopTerminalProcess"
  | "resizeTerminalSession"
>;

export class ToolCallCoordinator {
  private tools: ToolOrchestratorPort;
  private processIdsByThread = new Map<string, Set<number>>();

  constructor(
    browserManager?: BrowserSessionManager,
    notesStore?: NotesStore,
    computerUseManager?: ComputerUseManager,
    onTerminalEvent?: TerminalManagerEventListener,
    orchestrator?: ToolOrchestratorPort,
    private lifecycle = new ToolLifecycleBus(),
  ) {
    this.tools = orchestrator || new DesktopToolOrchestrator(browserManager, notesStore, computerUseManager, onTerminalEvent);
  }

  setComputerUseEnabled(enabled: boolean) {
    this.tools.setComputerUseEnabled(enabled);
  }

  assess(...args: Parameters<ToolOrchestratorPort["assess"]>) {
    const [call, permissionMode, workspaceId] = args;
    const decision = this.tools.assess(...args);
    return this.lifecycle.assessTool({ call, decision, permissionMode, workspaceId });
  }

  async execute(call: DesktopToolCall, context: ToolExecutionContext) {
    const startedAt = Date.now();
    const pre = await this.lifecycle.beforeTool({ call, context });
    if (pre.action !== "allow") {
      const result: ToolResult = {
        success: false,
        error: pre.action === "block"
          ? `Tool blocked by lifecycle policy: ${pre.reason}`
          : `Tool requires approval before execution: ${pre.reason || "lifecycle policy requested approval"}`,
        data: {
          code: pre.action === "block" ? "TOOL_LIFECYCLE_BLOCKED" : "TOOL_LIFECYCLE_REQUIRES_APPROVAL",
          reason: pre.reason,
        },
      };
      await this.lifecycle.afterTool({ call, context, result, startedAt, endedAt: Date.now() });
      return result;
    }
    let result: ToolResult;
    try {
      result = await this.tools.execute(call, context);
    } catch (error) {
      result = {
        success: false,
        error: error instanceof Error ? error.message : "Tool execution failed.",
      };
    }
    await this.lifecycle.afterTool({ call, context, result, startedAt, endedAt: Date.now() });
    return result;
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
