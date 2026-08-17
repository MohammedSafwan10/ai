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
