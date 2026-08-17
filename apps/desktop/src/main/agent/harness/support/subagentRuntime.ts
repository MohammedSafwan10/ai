import type { DesktopStore } from "../../../db/store";
import type { ReasoningEffort } from "../../../../shared/models";
import type { SubagentRecord } from "../../../../shared/types";
import { roleNamesForPrompt, type SubagentRoleConfig } from "../../subagents";
import type { ProviderMessage } from "../../providers/types";

export const MAX_SUBAGENT_DEPTH = 2;
const MAX_FORKED_PARENT_CONTEXT_CHARS = 18_000;

export const textProviderMessage = (content: string): ProviderMessage => ({
  role: "user",
  content,
  parts: [{ type: "text", text: content }],
});

export const subagentInstructionMessage = (agent: SubagentRecord, role: SubagentRoleConfig | undefined, forkTurns: string): ProviderMessage =>
  textProviderMessage([
    `You are child agent ${formatSubagentLabel(agent)}.`,
    `Canonical task name: ${agent.agentPath}.`,
    `Parent thread: ${agent.parentThreadId}.`,
    `Context fork mode requested by parent: ${forkTurns || "all"}.`,
    role ? `Role instructions:\n${role.developerInstructions}` : "",
    "Complete only the assigned child task. Report findings/results clearly in your final answer for the parent agent to use.",
  ].filter(Boolean).join("\n\n"));

export const buildSubagentRuntimeContext = (agent: SubagentRecord, roles: Map<string, SubagentRoleConfig>) => [
  "Subagent context:",
  `- You are ${formatSubagentLabel(agent)}.`,
  `- Canonical task name: ${agent.agentPath}.`,
  `- Parent thread: ${agent.parentThreadId}.`,
  `- Available subagent roles:\n${roleNamesForPrompt(roles)}`,
  "- Child agents inherit workspace tools and approval rules. Keep work bounded to your assigned task and report final results back to the parent.",
].join("\n");

export const isSubagentTool = (name: string) =>
  ["spawn_agent", "send_message", "assign_task", "wait_agent", "list_agents", "close_agent"].includes(name);

export const isLiveSubagent = (agent: SubagentRecord) =>
  ["pending", "running", "waiting"].includes(agent.status);

export const subagentDepth = (agentPath: string) =>
  agentPath.split("/").filter((part) => part && part !== "root").length;

export const normalizeTaskName = (value: string) => {
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9_]+$/.test(normalized) ? normalized : "";
};

export const normalizeForkTurns = (value: unknown): { valid: true; value: string } | { valid: false; value: string } => {
  const normalized = String(value || "all").trim().toLowerCase();
  if (normalized === "all" || normalized === "none") return { valid: true, value: normalized };
  if (/^[1-9]\d*$/.test(normalized)) return { valid: true, value: normalized };
  return { valid: false, value: normalized };
};

export const buildForkedParentHistory = (store: DesktopStore, agent: SubagentRecord, forkTurns: string): ProviderMessage[] => {
  if (forkTurns === "none") return [];
  const parentMessages = store
    .listMessages(agent.parentThreadId)
    .filter((message) => message.createdAt <= agent.createdAt);
  const selected = forkTurns === "all"
    ? parentMessages
    : parentMessages.slice(-Number(forkTurns));
  if (selected.length === 0) return [];
  const summary = selected
    .map((message) => `${message.role === "assistant" ? "Assistant" : "User"}: ${compactPreview(message.content, 1200)}`)
    .join("\n\n");
  return [textProviderMessage(`Forked parent conversation context for ${agent.agentPath}:\n\n${compactLongText(summary, MAX_FORKED_PARENT_CONTEXT_CHARS)}`)];
};

export const normalizeRoleName = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");

export const parseReasoningEffort = (value: unknown) => {
  const normalized = String(value || "").trim().toLowerCase();
  return ["none", "minimal", "low", "medium", "high", "xhigh", "max"].includes(normalized) ? normalized as ReasoningEffort : undefined;
};

export const formatSubagentLabel = (agent: Pick<SubagentRecord, "agentNickname" | "agentRole" | "taskName">) => {
  const name = agent.agentNickname || agent.taskName || "agent";
  return agent.agentRole ? `${name} [${agent.agentRole}]` : name;
};

export const subagentToolData = (agent: SubagentRecord) => ({
  id: agent.id,
  threadId: agent.threadId,
  taskName: agent.taskName,
  task_name: agent.agentPath,
  agentPath: agent.agentPath,
  agent_path: agent.agentPath,
  nickname: agent.agentNickname,
  role: agent.agentRole,
  status: agent.status,
  finalMessage: agent.finalMessage,
  lastPreview: agent.lastPreview,
});

export const subagentStatusSummary = (agents: SubagentRecord[]) =>
  agents.length
    ? agents.map((agent) => `${formatSubagentLabel(agent)}: ${agent.status}${agent.lastPreview ? ` - ${compactPreview(agent.lastPreview, 160)}` : ""}`).join("\n")
    : "No child agents.";

export const compactPreview = (value: string, maxLength: number) => {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length <= maxLength ? compact : `${compact.slice(0, Math.max(0, maxLength - 1))}...`;
};

const compactLongText = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return value;
  const headLength = Math.floor(maxLength * 0.62);
  const tailLength = Math.max(0, maxLength - headLength - 80);
  return [
    value.slice(0, headLength).trimEnd(),
    `\n\n[...forked parent context truncated: ${value.length - headLength - tailLength} chars omitted...]\n\n`,
    value.slice(value.length - tailLength).trimStart(),
  ].join("");
};
