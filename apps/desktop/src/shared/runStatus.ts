import type { TurnStatus } from "./types";

const ACTIVE_TURN_STATUSES = new Set<TurnStatus>([
  "sampling",
  "running",
  "executing_tool",
  "waiting_tool",
  "waiting_verification",
  "awaiting_approval",
  "draining",
  "completing",
]);

export const isActiveTurnStatus = (status: string | null | undefined) =>
  Boolean(status && ACTIVE_TURN_STATUSES.has(status as TurnStatus));

export const describeActiveTurnStatus = (
  status: string | null | undefined,
  hasCompletedActivity = false,
) => {
  if (status === "waiting_verification") return "Verifying changes";
  if (status === "awaiting_approval") return "Waiting for approval";
  if (status === "executing_tool" || status === "waiting_tool") return "Running tools";
  if (status === "draining" || status === "completing") return "Finishing";
  if ((status === "sampling" || status === "running") && hasCompletedActivity) return "Continuing after tools";
  return "Working";
};
