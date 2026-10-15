import type { DesktopStore } from "../../db/store";
import { randomUUID } from "node:crypto";
import type { ChatMessageRecord, DesktopToolCall, SubagentRecord, ToolResult } from "../../../shared/types";
import type { AgentRunTracker } from "../runState";
import { loadSubagentRoles, pickSubagentNickname } from "../subagents";
import type { SubagentRoleConfig } from "../subagents";
import {
  MAX_SUBAGENT_DEPTH,
  compactPreview,
  formatSubagentLabel,
  isLiveSubagent,
  normalizeForkTurns,
  normalizeRoleName,
  normalizeTaskName,
  parseReasoningEffort,
  subagentDepth,
  subagentStatusSummary,
  subagentToolData,
} from "../harness/support/subagentRuntime";
import { delay } from "../harness/support/errors";
import type { ReasoningEffort } from "../../../shared/models";
import { getModelOption } from "../../../shared/models";

const MAX_LIVE_SUBAGENTS_PER_PARENT = 3;
const MAX_LIVE_SUBAGENTS_PER_TREE = 6;

export interface SubagentManagerPorts {
  isRunActive: (threadId: string) => boolean;
  startSubagentTurn: (agent: SubagentRecord, workspaceRoot: string, prompt: string, role: SubagentRoleConfig | undefined, forkTurns: string) => void;
  startExistingSubagentTurn: (agent: SubagentRecord, workspaceRoot: string) => void;
  appendUserMessage: (threadId: string, message: string, metadata?: ChatMessageRecord["agentMessage"]) => void;
  stopThread: (threadId: string, reason: string) => void;
  emitSnapshot: () => void;
  emitMessage?: (message: ChatMessageRecord) => void;
  nextActivityOrder?: () => number;
  getAssistantTextOffset?: (threadId: string, messageId: string) => number | undefined;
}

export interface SubagentToolContext {
  workspaceRoot: string;
  parentThreadId: string;
  parentMessageId: string;
  parentRun?: AgentRunTracker;
  signal: AbortSignal;
}

export class SubagentManager {
  constructor(private store: DesktopStore, private ports: SubagentManagerPorts) {}

  async execute(call: DesktopToolCall, context: SubagentToolContext): Promise<ToolResult> {
    switch (call.name) {
      case "spawn_agent":
        return this.spawn(call, context);
      case "send_message":
        return this.message(call, context.parentThreadId, false, undefined, context.parentMessageId);
      case "assign_task":
        return this.message(call, context.parentThreadId, true, context.workspaceRoot, context.parentMessageId);
      case "wait_agent":
        return this.wait(call, context.parentThreadId, context.signal);
      case "list_agents":
        return this.list(call, context.parentThreadId);
      case "close_agent":
        return this.close(call, context.parentThreadId);
      default:
        return { success: false, error: `Unknown subagent tool ${call.name}` };
    }
  }

  markFinished(threadId: string, status: SubagentRecord["status"], text: string) {
    const agent = this.store.getSubagentByThread(threadId);
    if (!agent) return;
    if (agent.status === "closed") {
      this.ports.emitSnapshot();
      return;
    }
    const updated = this.store.updateSubagent(threadId, {
      status,
      finalMessage: text,
      lastPreview: compactPreview(text, 240),
    });
    if (status === "completed" && updated) {
      const latestUser = this.store.findLatestMessage(threadId, "user");
      const latestAssistant = this.store.listMessages(threadId).reverse().find((message) => message.role === "assistant" && !message.agentMessage?.outgoing);
      const workspace = updated.workspaceId ? this.store.getWorkspace(updated.workspaceId)?.path : undefined;
      if (latestUser && latestUser.agentMessage?.delivery !== "delivered" && latestAssistant && latestUser.createdAt > latestAssistant.createdAt && workspace && !this.ports.isRunActive(threadId)) {
        this.store.updateSubagent(threadId, { status: "pending" });
        this.ports.startExistingSubagentTurn(updated, workspace);
      }
    }
    this.ports.emitSnapshot();
  }

  private spawn(call: DesktopToolCall, context: SubagentToolContext): ToolResult {
    const settings = this.store.getSettings();
    const taskName = normalizeTaskName(String(call.arguments.taskName || call.arguments.task_name || ""));
    const message = String(call.arguments.message || "").trim();
    if (!taskName) return { success: false, error: "taskName must use lowercase letters, digits, and underscores." };
    if (!message) return { success: false, error: "message is required." };
    const parentAgent = this.store.getSubagentByThread(context.parentThreadId);
    const rootThreadId = this.store.rootAgentThread(context.parentThreadId);
    if (this.store.listDirectSubagents(context.parentThreadId).filter(isLiveSubagent).length >= MAX_LIVE_SUBAGENTS_PER_PARENT) {
      return { success: false, error: `Subagent limit reached: at most ${MAX_LIVE_SUBAGENTS_PER_PARENT} live child agents per parent.` };
    }
    if (this.store.listSubagents(rootThreadId).filter(isLiveSubagent).length >= MAX_LIVE_SUBAGENTS_PER_TREE) {
      return { success: false, error: `Subagent limit reached: at most ${MAX_LIVE_SUBAGENTS_PER_TREE} live child agents per chat tree.` };
    }
    if (parentAgent && subagentDepth(parentAgent.agentPath) >= MAX_SUBAGENT_DEPTH) {
      return { success: false, error: `Subagent depth limit reached: max depth is ${MAX_SUBAGENT_DEPTH}.` };
    }
    if (this.store.findSubagent(context.parentThreadId, taskName)) return { success: false, error: `A subagent named ${taskName} already exists.` };

    const roles = loadSubagentRoles(context.workspaceRoot);
    const requestedRole = normalizeRoleName(String(call.arguments.agentType || call.arguments.agent_type || ""));
    const role = requestedRole ? roles.get(requestedRole) : undefined;
    if (requestedRole && !role) {
      return { success: false, error: `Unknown agentType ${requestedRole}.`, data: { availableRoles: Array.from(roles.keys()) } };
    }
    const forkTurns = normalizeForkTurns(call.arguments.forkTurns || call.arguments.fork_turns);
    if (!forkTurns.valid) return { success: false, error: "forkTurns must be none, all, or a positive integer string." };
    const usedNicknames = new Set(this.store.listDirectSubagents(context.parentThreadId).map((agent) => (agent.agentNickname || "").toLowerCase()).filter(Boolean));
    const thread = this.store.getThread(context.parentThreadId);
    const selection = resolveNewSubagentSettings(this.store, context.parentThreadId,
      context.parentRun?.model || parentAgent?.model || thread?.model || settings.model,
      parseReasoningEffort(call.arguments.reasoningEffort || call.arguments.reasoning_effort)
        || role?.reasoningEffort || context.parentRun?.reasoningEffort || thread?.reasoningEffort || settings.reasoningEffort);
    const agent = this.store.createSubagent({
      parentThreadId: context.parentThreadId,
      parentMessageId: context.parentMessageId,
      workspaceId: thread?.workspaceId ?? null,
      taskName,
      agentPath: `${parentAgent?.agentPath || "/root"}/${taskName}`,
      agentRole: role?.name,
      agentNickname: pickSubagentNickname(role, usedNicknames, taskName),
      prompt: message,
      ...selection,
    });
    this.ports.startSubagentTurn(agent, context.workspaceRoot, message, role, forkTurns.value);
    this.ports.emitSnapshot();
    return { success: true, output: `Spawned ${formatSubagentLabel(agent)}.`, data: subagentToolData(agent) };
  }

  private message(call: DesktopToolCall, parentThreadId: string, triggerTurn: boolean, workspaceRoot?: string, senderMessageId?: string): ToolResult {
    const target = String(call.arguments.target || "").trim();
    const message = String(call.arguments.message || "").trim();
    if (!message) return { success: false, error: "message is required." };
    if (message.length > 32_000) return { success: false, error: "Agent messages must be at most 32000 characters." };
    const sender = this.store.getSubagentByThread(parentThreadId);
    const senderLabel = sender ? formatSubagentLabel(sender) : "Parent";
    if (sender && ["parent", sender.parentThreadId].includes(target)) {
      if (triggerTurn) return { success: false, error: "Use send_message to report to the parent; assigning its task is unavailable." };
      const metadata: ChatMessageRecord["agentMessage"] = { id: randomUUID(), senderThreadId: parentThreadId, senderLabel, recipientLabel: "Parent", recipientThreadId: sender.parentThreadId, toolCallId: call.id, delivery: "queued" };
      this.ports.appendUserMessage(sender.parentThreadId, message, metadata);
      this.recordSent(parentThreadId, message, metadata, senderMessageId);
      this.ports.emitSnapshot();
      return { success: true, output: "Queued message to parent; it will be delivered at its next model boundary.", data: { targetThreadId: sender.parentThreadId, delivery: "queued" } };
    }
    const agent = this.store.findSubagent(parentThreadId, target);
    if (!agent) return { success: false, error: `Subagent target not found: ${target}` };
    if (agent.status === "closed") return { success: false, error: `${formatSubagentLabel(agent)} is closed.` };
    const metadata: ChatMessageRecord["agentMessage"] = { id: randomUUID(), senderThreadId: parentThreadId, senderLabel, recipientLabel: formatSubagentLabel(agent), recipientThreadId: agent.threadId, toolCallId: call.id, delivery: "queued" };
    this.ports.appendUserMessage(agent.threadId, message, metadata);
    this.recordSent(parentThreadId, message, metadata, senderMessageId);
    const alreadyRunning = this.ports.isRunActive(agent.threadId);
    this.store.updateSubagent(agent.threadId, {
      status: triggerTurn && !alreadyRunning ? "pending" : agent.status,
      lastPreview: compactPreview(message, 180),
    });
    if (triggerTurn) {
      const workspace = workspaceRoot || this.store.getWorkspace(agent.workspaceId)?.path;
      if (!workspace) return { success: false, error: "Workspace not found for subagent." };
      if (!alreadyRunning) this.ports.startExistingSubagentTurn(agent, workspace);
    }
    this.ports.emitSnapshot();
    return {
      success: true,
      output: alreadyRunning && triggerTurn
        ? `Queued task for ${formatSubagentLabel(agent)}. It will run after the current child turn finishes.`
        : !triggerTurn && !alreadyRunning
        ? `Message queued for ${formatSubagentLabel(agent)}, which is idle (${agent.status}). It will not run automatically. Use assign_task to start a follow-up, or resume its saved turn. Do not wait for this message to be processed while the recipient is idle.`
        : `${triggerTurn ? "Assigned task to" : "Sent message to"} ${formatSubagentLabel(agent)}.`,
      data: { ...subagentToolData(agent), delivery: "queued", recipientActive: alreadyRunning, requiresFollowUp: !triggerTurn && !alreadyRunning },
    };
  }

  private recordSent(threadId: string, message: string, metadata: NonNullable<ChatMessageRecord["agentMessage"]>, senderMessageId?: string) {
    const anchor = senderMessageId ? this.store.getMessage(senderMessageId) : null;
    const inline = anchor?.threadId === threadId && anchor.role === "assistant" && !anchor.agentMessage;
    const record = this.store.upsertMessage({ id: `agent-sent-${metadata.id}`, threadId, role: "assistant", content: message,
      steeredTurnId: inline ? anchor.id : undefined, steerTextOffset: inline ? this.ports.getAssistantTextOffset?.(threadId, anchor.id) ?? anchor.content.length : undefined, steerStreamOrder: inline ? this.ports.nextActivityOrder?.() : undefined,
      agentMessage: { ...metadata, outgoing: true }, status: "completed", createdAt: Date.now(), updatedAt: Date.now() });
    this.ports.emitMessage?.(record);
  }

  private async wait(call: DesktopToolCall, parentThreadId: string, signal: AbortSignal): Promise<ToolResult> {
    const startedAt = Date.now();
    const requestedTimeout = Number(call.arguments.timeoutMs ?? call.arguments.timeout_ms ?? 30_000);
    const timeoutMs = Number.isFinite(requestedTimeout) ? Math.max(0, Math.min(120_000, requestedTimeout)) : 30_000;
    const initialAgents = this.store.listSubagents(parentThreadId);
    if (initialAgents.filter(isLiveSubagent).length === 0 && initialAgents.some((agent) => ["completed", "failed", "stopped", "closed"].includes(agent.status))) {
      return { success: true, output: subagentStatusSummary(initialAgents), data: { timed_out: false, timedOut: false, agents: initialAgents.map(subagentToolData) } };
    }
    while (!signal.aborted && Date.now() - startedAt < timeoutMs) {
      const agents = this.store.listSubagents(parentThreadId);
      if (agents.some((agent) => agent.updatedAt > startedAt && !["pending", "running", "waiting"].includes(agent.status))) {
        return { success: true, output: subagentStatusSummary(agents), data: { timed_out: false, timedOut: false, agents: agents.map(subagentToolData) } };
      }
      await delay(500);
    }
    const agents = this.store.listSubagents(parentThreadId);
    const liveAgents = agents.filter(isLiveSubagent);
    return {
      success: true,
      output: timeoutMs === 0
        ? subagentStatusSummary(agents)
        : liveAgents.length > 0
          ? `Still waiting on ${liveAgents.length} live ${liveAgents.length === 1 ? "agent" : "agents"}.\n${subagentStatusSummary(agents)}`
          : `No child status change before timeout.\n${subagentStatusSummary(agents)}`,
      data: { timed_out: timeoutMs > 0, timedOut: timeoutMs > 0, agents: agents.map(subagentToolData) },
    };
  }

  private list(call: DesktopToolCall, parentThreadId: string): ToolResult {
    const prefix = String(call.arguments.pathPrefix || call.arguments.path_prefix || "").trim();
    const agents = this.store.listSubagents(parentThreadId).filter((agent) => !prefix || agent.agentPath.startsWith(prefix));
    return { success: true, output: subagentStatusSummary(agents), data: { agents: agents.map(subagentToolData) } };
  }

  private close(call: DesktopToolCall, parentThreadId: string): ToolResult {
    const target = String(call.arguments.target || "").trim();
    const agent = this.store.findSubagent(parentThreadId, target);
    if (!agent) return { success: false, error: `Subagent target not found: ${target}` };
    const descendants = [agent, ...this.store.listSubagents(agent.threadId)];
    descendants.forEach((candidate) => {
      this.ports.stopThread(candidate.threadId, "Closed before approval.");
      this.store.updateSubagent(candidate.threadId, {
        status: "closed",
        closedAt: Date.now(),
        lastPreview: candidate.finalMessage || candidate.lastPreview || "Closed.",
      });
    });
    const updated = this.store.updateSubagent(agent.threadId, {
      status: "closed",
      closedAt: Date.now(),
      lastPreview: agent.finalMessage || agent.lastPreview || "Closed.",
    }) || agent;
    this.ports.emitSnapshot();
    return { success: true, output: `Closed ${formatSubagentLabel(updated)}.`, data: { ...subagentToolData(updated), previous_status: agent.status } };
  }
}

export const resolveSubagentModel = (
  store: DesktopStore,
  agent: SubagentRecord,
) => {
  const parentAgent = store.getSubagentByThread(agent.parentThreadId);
  const parentThread = store.getThread(agent.parentThreadId);
  return getModelOption(agent.model || parentAgent?.model || parentThread?.model || store.getSettings().model).id;
};

/** Operator-selected child model applies to new children throughout this chat tree. */
export const resolveNewSubagentSettings = (
  store: DesktopStore,
  parentThreadId: string,
  parentModel: string,
  parentReasoning: ReasoningEffort,
) => {
  const root = store.getThread(store.rootAgentThread(parentThreadId));
  const preference = root?.subagentModel !== undefined ? root.subagentModel : store.getSettings().subagentModel;
  const model = getModelOption(preference || parentModel);
  const effort = (root?.subagentReasoningEffort !== undefined ? root.subagentReasoningEffort : store.getSettings().subagentReasoningEffort) ?? parentReasoning;
  return {
    model: model.id,
    reasoningEffort: model.reasoningEfforts.includes(effort) ? effort : model.defaultReasoningEffort,
  };
};
