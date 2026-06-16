import type { PermissionMode } from "../../../shared/models";
import type { DesktopToolCall, ToolResult, ToolRisk } from "../../../shared/types";
import type { PermissionDecision } from "./permissions";
import type { ToolExecutionContext } from "./executor";

export type ToolLifecycleDecision =
  | { action: "allow"; reason?: string; risk?: ToolRisk }
  | { action: "block"; reason: string; risk?: ToolRisk }
  | { action: "require_approval"; reason?: string; risk?: ToolRisk };

export interface ToolLifecycleAssessmentInput {
  call: DesktopToolCall;
  decision: PermissionDecision;
  permissionMode: PermissionMode;
  workspaceId?: string | null;
}

export interface ToolLifecycleBeforeInput {
  call: DesktopToolCall;
  context: ToolExecutionContext;
}

export interface ToolLifecycleAfterInput extends ToolLifecycleBeforeInput {
  result: ToolResult;
  startedAt: number;
  endedAt: number;
}

export interface ToolLifecycleAuditEvent {
  callId: string;
  name: string;
  workspaceRoot: string;
  success: boolean;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  error?: string;
  diffFileCount?: number;
}

export interface ToolLifecycleHook {
  assessTool?: (input: ToolLifecycleAssessmentInput) => PermissionDecision | void;
  beforeTool?: (input: ToolLifecycleBeforeInput) => ToolLifecycleDecision | void | Promise<ToolLifecycleDecision | void>;
  afterTool?: (input: ToolLifecycleAfterInput) => void | Promise<void>;
}

const TOOL_HOOK_TIMEOUT_MS = 5_000;

export class ToolLifecycleBus {
  private hooks: ToolLifecycleHook[];
  private auditEvents: ToolLifecycleAuditEvent[] = [];

  constructor(hooks: ToolLifecycleHook[] = [], private hookTimeoutMs = TOOL_HOOK_TIMEOUT_MS) {
    this.hooks = hooks;
  }

  assessTool(input: ToolLifecycleAssessmentInput): PermissionDecision {
    let decision = input.decision;
    for (const hook of this.hooks) {
      if (!hook.assessTool) continue;
      try {
        decision = hook.assessTool({ ...input, decision }) || decision;
      } catch (error) {
        decision = {
          risk: "risky",
          requiresApproval: input.permissionMode !== "yolo",
          reason: `Tool lifecycle assessment failed: ${error instanceof Error ? error.message : "unknown error"}`,
        };
      }
    }
    return decision;
  }

  async beforeTool(input: ToolLifecycleBeforeInput): Promise<ToolLifecycleDecision> {
    for (const hook of this.hooks) {
      if (!hook.beforeTool) continue;
      try {
        const decision = await runLifecycleHook(() => hook.beforeTool?.(input), input.context.signal, this.hookTimeoutMs);
        if (decision && decision.action !== "allow") return decision;
      } catch (error) {
        return {
          action: "block",
          reason: `Tool lifecycle pre-hook failed: ${error instanceof Error ? error.message : "unknown error"}`,
          risk: "blocked",
        };
      }
    }
    return { action: "allow" };
  }

  async afterTool(input: ToolLifecycleAfterInput): Promise<void> {
    this.auditEvents.push({
      callId: input.call.id,
      name: input.call.name,
      workspaceRoot: input.context.workspaceRoot,
      success: input.result.success,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      durationMs: input.endedAt - input.startedAt,
      error: input.result.error,
      diffFileCount: Array.isArray((input.result as ToolResult & { diffFiles?: unknown[] }).diffFiles)
        ? (input.result as ToolResult & { diffFiles?: unknown[] }).diffFiles?.length
        : undefined,
    });
    await Promise.all(this.hooks.map(async (hook) => {
      if (!hook.afterTool) return;
      try {
        await runLifecycleHook(() => hook.afterTool?.(input), input.context.signal, this.hookTimeoutMs);
      } catch {
        // Post-tool audit extensions must not change the already-computed tool result.
      }
    }));
  }

  listAuditEvents() {
    return [...this.auditEvents];
  }
}

const runLifecycleHook = async <T>(operation: () => T | Promise<T>, signal: AbortSignal | undefined, timeoutMs: number): Promise<T> => {
  if (signal?.aborted) throw new Error("tool lifecycle hook cancelled");
  let timeout: NodeJS.Timeout | undefined;
  let abortListener: (() => void) | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("tool lifecycle hook timed out")), timeoutMs);
        abortListener = () => reject(new Error("tool lifecycle hook cancelled"));
        signal?.addEventListener("abort", abortListener, { once: true });
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
    if (abortListener) signal?.removeEventListener("abort", abortListener);
  }
};
