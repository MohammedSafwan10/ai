import type { PermissionMode } from "../../../shared/models";
import type { DesktopToolCall } from "../../../shared/types";
import { DesktopToolExecutor, type ToolExecutionContext } from "./executor";
import { classifyToolCall } from "./permissions";

export class DesktopToolOrchestrator {
  constructor(private executor = new DesktopToolExecutor()) {}

  assess(call: DesktopToolCall, permissionMode: PermissionMode) {
    return classifyToolCall(call, permissionMode);
  }

  execute(call: DesktopToolCall, context: ToolExecutionContext) {
    return this.executor.execute(call, context);
  }

  stopTerminalProcess(processId: number) {
    return this.executor.stopTerminalProcess(processId);
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
