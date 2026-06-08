import type { PermissionMode } from "../../../shared/models";
import type { DesktopToolCall } from "../../../shared/types";
import type { BrowserSessionManager } from "../../browser/BrowserSessionManager";
import type { ComputerUseManager } from "../../computer/ComputerUseManager";
import type { NotesStore } from "../../notes/NotesStore";
import type { TerminalManagerEventListener } from "../../terminal/sessionManager";
import { DesktopToolExecutor, type ToolExecutionContext } from "./executor";
import { classifyToolCall } from "./permissions";

export class DesktopToolOrchestrator {
  private executor: DesktopToolExecutor;

  constructor(private browserManager?: BrowserSessionManager, notesStore?: NotesStore, private computerUseManager?: ComputerUseManager, onTerminalEvent?: TerminalManagerEventListener) {
    this.executor = new DesktopToolExecutor(browserManager, notesStore, computerUseManager, onTerminalEvent);
  }

  setComputerUseEnabled(enabled: boolean) {
    this.computerUseManager?.setEnabled(enabled);
  }

  assess(call: DesktopToolCall, permissionMode: PermissionMode, workspaceId?: string | null) {
    return classifyToolCall(call, permissionMode, {
      browserCurrentPageRequiresApproval: this.browserManager?.currentAgentControlRequiresApproval(workspaceId) === true,
    });
  }

  execute(call: DesktopToolCall, context: ToolExecutionContext) {
    return this.executor.execute(call, context);
  }

  stopTerminalProcess(sessionId: number) {
    return this.executor.stopTerminalProcess(sessionId);
  }

  getTerminalState() {
    return this.executor.getTerminalState();
  }

  readTerminalSession(sessionId: number, maxOutputChars?: number) {
    return this.executor.readTerminalSession(sessionId, maxOutputChars);
  }

  resizeTerminalSession(sessionId: number, rows: number, cols: number) {
    return this.executor.resizeTerminalSession(sessionId, rows, cols);
  }

  supportsParallelExecution(call: DesktopToolCall) {
    return supportsParallelExecution(call);
  }
}

export const supportsParallelExecution = (call: DesktopToolCall) => {
  switch (call.name) {
    case "desktop_read_file":
    case "desktop_list_dir":
    case "desktop_search":
    case "desktop_git_status":
    case "desktop_git_diff":
      return true;
    default:
      return false;
  }
};
