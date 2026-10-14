import type { ToolEventRecord } from "./types";
export const toolFailureLabel = (tool: ToolEventRecord): string | null => {
  if (tool.status !== "failed" || tool.result?.success !== false) return null;
  const data = tool.result.data;
  if (tool.risk === "blocked" || data?.blockedByEnvironment === true || data?.blockedByPlanMode === true) return "App restriction";
  return "Tool failure";
};
