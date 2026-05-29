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
}
