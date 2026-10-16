import type { SubagentRecord } from "../../../shared/types";

export const agentDisplayTime = (agent: SubagentRecord, activityAt = 0) => {
  if (["pending", "running", "waiting"].includes(agent.status)) return { timestamp: Math.max(agent.updatedAt, Number.isFinite(activityAt) ? activityAt : 0), label: "Last updated" };
  const finished = agent.status === "closed" ? agent.closedAt ?? agent.finishedAt : agent.finishedAt;
  return finished ? { timestamp: finished, label: agent.status === "closed" ? "Closed" : agent.status === "completed" ? "Completed" : agent.status === "failed" ? "Failed" : "Stopped" } : { timestamp: agent.createdAt, label: "Created (finish time unavailable)" };
};

/** List positions and labels must not follow each streamed token's activity time. */
export const agentListTime = (agent: SubagentRecord, active: boolean) => active
  ? { timestamp: agent.createdAt, label: "Created" }
  : agentDisplayTime(agent);

export const sortAgentRows = (agents: SubagentRecord[], active: boolean) => [...agents].sort((a, b) => active
  ? a.createdAt - b.createdAt || a.id.localeCompare(b.id)
  : agentListTime(b, false).timestamp - agentListTime(a, false).timestamp || b.createdAt - a.createdAt || a.id.localeCompare(b.id));

export const agentIdentity = (id: string) => {
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  hash >>>= 0;
  return { shape: hash % 32, tint: Math.floor(hash / 32) % 7 };
};

export const relativeAgentTime = (timestamp: number, now: number) => {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
  const minutes = Math.floor(Math.max(0, now - timestamp) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  if (minutes < 43200) return `${Math.floor(minutes / 1440)}d ago`;
  return `${Math.floor(minutes / 43200)}mo ago`;
};
