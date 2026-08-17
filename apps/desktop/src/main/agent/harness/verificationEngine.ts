import type { DesktopStore } from "../../db/store";
import type { AgentHarnessMode, CollaborationMode, ReasoningEffort } from "../../../shared/models";
import type { ChatMessageRecord, DesktopToolCall, PrivoraEventPayload, SubagentRecord } from "../../../shared/types";
import { transitionRun, type AgentRunTracker } from "../runState";
import { loadSubagentRoles, type SubagentRoleConfig } from "../subagents";
import { compactPreview, isLiveSubagent } from "../harness/support/subagentRuntime";
import { delay, errorMessage } from "../harness/support/errors";

const REVIEWER_COUNT = 2;
const REVIEWER_TIMEOUT_MS = 180_000;

const REVIEWER_READ_ONLY_TOOLS = new Set([
  "desktop_read_file", "desktop_list_dir", "desktop_search", "desktop_git_status", "desktop_git_diff",
  "terminal_list", "terminal_read", "list_agents", "wait_agent", "notes_list", "notes_read",
  "list_generated_images", "computer_capabilities", "computer_list_windows", "computer_find_apps",
  "computer_snapshot", "computer_inspect", "computer_verify", "computer_screenshot", "browser_snapshot",
  "browser_inspect", "browser_extract", "browser_screenshot", "browser_evidence", "browser_search",
  "browser_pdf", "browser_form_analyze", "browser_form_validate", "browser_capabilities", "browser_assert",
  "browser_evidence_vault", "browser_diagnose", "browser_verify", "web_search",
]);

export const reviewerReadOnlyBlockReason = (call: DesktopToolCall, enabled?: boolean) =>
  enabled && !REVIEWER_READ_ONLY_TOOLS.has(call.name)
    ? "read-only reviewer and supervisor agents cannot run mutating or side-effecting tools."
    : "";

export interface VerificationRequest {
  threadId: string;
  parentThreadId?: string;
  assistantMessage: ChatMessageRecord;
  workspaceRoot: string;
  assistantText: string;
  toolCount: number;
  iteration: number;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  collaborationMode?: CollaborationMode;
  agentHarnessMode: AgentHarnessMode;
  alreadyCompleted?: boolean;
  run: AgentRunTracker;
}

export interface VerificationEnginePorts {
  startSubagentTurn: (
    agent: SubagentRecord,
    workspaceRoot: string,
    prompt: string,
    role?: SubagentRoleConfig,
    forkTurns?: string,
  ) => void;
  stopSubagent: (agent: SubagentRecord) => void;
  emitRun: (run: AgentRunTracker) => void;
  emitSnapshot: () => void;
  emitEvent: (event: PrivoraEventPayload) => void;
}

export class VerificationEngine {
  constructor(private store: DesktopStore, private ports: VerificationEnginePorts) {}

  async verify(input: VerificationRequest) {
    if (input.parentThreadId || input.alreadyCompleted || input.agentHarnessMode !== "review_swarm" || input.toolCount <= 0) {
      return "";
    }
    transitionRun(input.run, "waiting_verification", {
      iteration: input.iteration,
      toolCount: input.toolCount,
      reason: "Reviewer Swarm is checking the completed turn.",
      resumable: false,
    });
    this.ports.emitRun(input.run);
    this.ports.emitEvent({ type: "verification.started", threadId: input.threadId, turnId: input.assistantMessage.id });

    const reviewers = this.startReviewers(input);
    const reports = await this.waitForReviewers(reviewers);
    transitionRun(input.run, "draining", { iteration: input.iteration, toolCount: input.toolCount, reason: undefined });
    this.ports.emitRun(input.run);
    this.ports.emitEvent({ type: "verification.completed", threadId: input.threadId, turnId: input.assistantMessage.id });
    return formatReviewerFeedback(reports);
  }

  private startReviewers(input: VerificationRequest) {
    const thread = this.store.getThread(input.threadId);
    const timestamp = Date.now();
    const prompt = [
      "Reviewer Swarm check. You are a read-only reviewer for the parent agent's just-completed turn.",
      "",
      "Do not edit files, run mutating commands, approve risky actions, or spawn child agents.",
      "Use read-only inspection plus git diff/status when useful.",
      "",
      "Review for: request satisfaction, bugs/regressions, missing tests, security risks, and data-loss risks.",
      "Return concise findings. If there are no blocking issues, say so explicitly.",
      "",
      "Parent final draft:",
      input.assistantText.trim() || "(no draft text)",
    ].join("\n");
    return Array.from({ length: REVIEWER_COUNT }, (_, index) => {
      const agent = this.store.createSubagent({
        parentThreadId: input.threadId,
        parentMessageId: input.assistantMessage.id,
        workspaceId: thread?.workspaceId ?? null,
        taskName: `review_swarm_${timestamp}_${index + 1}`,
        agentPath: `/root/review_swarm_${timestamp}_${index + 1}`,
        agentRole: "reviewer",
        agentNickname: `Reviewer ${index + 1}`,
        prompt,
        model: input.model || thread?.model || this.store.getSettings().model,
        reasoningEffort: input.reasoningEffort || thread?.reasoningEffort || this.store.getSettings().reasoningEffort,
      });
      this.store.updateThreadSettings(agent.threadId, {
        model: agent.model,
        reasoningEffort: agent.reasoningEffort,
        collaborationMode: "plan",
        agentHarnessMode: "standard",
      });
      try {
        this.ports.startSubagentTurn(agent, input.workspaceRoot, prompt, loadSubagentRoles(input.workspaceRoot).get("reviewer"), "all");
      } catch (error) {
        this.store.updateSubagent(agent.threadId, {
          status: "failed",
          finalMessage: `Reviewer failed to start: ${errorMessage(error)}`,
          lastPreview: "Reviewer failed to start.",
        });
      }
      return agent;
    });
  }

  private async waitForReviewers(reviewers: SubagentRecord[]) {
    const deadline = Date.now() + REVIEWER_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const current = reviewers.map((agent) => this.store.getSubagentByThread(agent.threadId) || agent);
      if (current.every((agent) => !isLiveSubagent(agent))) return current;
      await delay(750);
    }
    reviewers.forEach((agent) => {
      const current = this.store.getSubagentByThread(agent.threadId) || agent;
      if (!isLiveSubagent(current)) return;
      this.ports.stopSubagent(current);
      this.store.updateSubagent(agent.threadId, {
        status: "stopped",
        finalMessage: `Reviewer Swarm timed out after ${Math.round(REVIEWER_TIMEOUT_MS / 1000)} seconds.`,
        lastPreview: "Reviewer Swarm timed out.",
      });
    });
    this.ports.emitSnapshot();
    return reviewers.map((agent) => this.store.getSubagentByThread(agent.threadId) || agent);
  }
}

const formatReviewerFeedback = (reviewers: SubagentRecord[]) => {
  if (reviewers.length === 0) return "";
  const reports = reviewers.map((agent, index) => {
    const label = agent.agentNickname || `Reviewer ${index + 1}`;
    const body = agent.finalMessage || agent.lastPreview || `${label} did not return a report.`;
    const status = agent.status === "completed" ? "" : ` (${agent.status})`;
    return `- ${label}${status}: ${compactPreview(body, 900)}`;
  });
  return [
    "Reviewer Swarm reports are ready.",
    "Read the reports naturally and write the final answer accordingly.",
    "Write only the user-facing final response. Do not include scratch notes, private checklists, planning fragments, or narration of what you are about to do.",
    "If reviewers found issues, mention them clearly and do not claim the work is complete unless those issues are fixed.",
    "If the reports are clean, you may say the work passed Reviewer Swarm.",
    "",
    ...reports,
  ].join("\n");
};
