import type { CollaborationMode, ReasoningEffort } from "../../shared/models";
import type { ActiveRunState, TurnStatus } from "../../shared/types";

export type AgentRunPhase =
  | "sampling"
  | "executing_tool"
  | "waiting_tool"
  | "awaiting_approval"
  | "draining"
  | "completed"
  | "stopped"
  | "stalled"
  | "failed";

const allowedTransitions: Record<AgentRunPhase, AgentRunPhase[]> = {
  sampling: ["executing_tool", "waiting_tool", "awaiting_approval", "draining", "completed", "stopped", "stalled", "failed", "sampling"],
  executing_tool: ["sampling", "waiting_tool", "awaiting_approval", "draining", "completed", "stopped", "stalled", "failed"],
  waiting_tool: ["executing_tool", "draining", "stopped", "failed"],
  awaiting_approval: ["sampling", "executing_tool", "stopped", "failed"],
  draining: ["sampling", "completed", "stopped", "stalled", "failed"],
  completed: ["sampling"],
  stopped: ["sampling"],
  stalled: ["sampling", "stopped", "failed"],
  failed: ["sampling"],
};

export interface AgentRunTracker {
  threadId: string;
  assistantMessageId: string;
  controller: AbortController;
  phase: AgentRunPhase;
  startedAt: number;
  updatedAt: number;
  iteration: number;
  toolCount: number;
  lastProgressAt: number;
  recoveryAttempts: number;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  collaborationMode?: CollaborationMode;
  reason?: string;
  resumable?: boolean;
}

export const isValidRunTransition = (from: AgentRunPhase, to: AgentRunPhase) =>
  allowedTransitions[from]?.includes(to) ?? false;

export const transitionRun = (
  run: AgentRunTracker,
  phase: AgentRunPhase,
  patch: Partial<Pick<AgentRunTracker, "iteration" | "toolCount" | "reason" | "resumable">> = {},
) => {
  if (run.phase !== phase && !isValidRunTransition(run.phase, phase)) {
    throw new Error(`Invalid agent run transition: ${run.phase} -> ${phase}`);
  }
  run.phase = phase;
  run.updatedAt = Date.now();
  Object.assign(run, patch);
  return run;
};

export const markRunProgress = (run: AgentRunTracker) => {
  const timestamp = Date.now();
  run.lastProgressAt = timestamp;
  run.updatedAt = timestamp;
};

export const toActiveRunState = (run: AgentRunTracker): ActiveRunState => ({
  threadId: run.threadId,
  assistantMessageId: run.assistantMessageId,
  phase: run.phase as TurnStatus,
  status: run.phase as TurnStatus,
  startedAt: run.startedAt,
  updatedAt: run.updatedAt,
  iteration: run.iteration,
  toolCount: run.toolCount,
  reason: run.reason,
  resumable: run.resumable,
});
