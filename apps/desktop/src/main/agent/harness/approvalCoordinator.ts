import type { DesktopStore } from "../../db/store";
import type { AgentHarnessMode, CollaborationMode, ReasoningEffort } from "../../../shared/models";
import type {
  ApprovalDecisionScope,
  ApprovalScopeRecord,
  DesktopToolCall,
} from "../../../shared/types";
import type { ProviderMessage } from "../providers/types";
import type { AgentRunTracker } from "../runState";
import { approvalCommandPrefix, approvalCwd, findMatchingApprovalScope } from "../tools/permissions";
import { approvalScopeBounds, type ApprovalDecision } from "../harness/support/approvals";
import { summarizeArgs } from "../harness/support/toolActivity";
import { transitionRun } from "../runState";
import { appendToolResults } from "../providers/types";

export interface ApprovalBundle {
  id: string;
  threadId: string;
  assistantMessageId: string;
  workspaceRoot: string;
  calls: DesktopToolCall[];
  decisions: Map<string, ApprovalDecision>;
  history: ProviderMessage[];
  assistantText: string;
  assistantThought: string;
  toolCount: number;
  iteration: number;
  recoveryAttempts: number;
  run: AgentRunTracker;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  collaborationMode?: CollaborationMode;
  agentHarnessMode?: AgentHarnessMode;
}

export class ApprovalCoordinator {
  private byCallId = new Map<string, ApprovalBundle>();
  private resolvingGroups = new Set<string>();

  constructor(private store: DesktopStore) {}

  get(callId: string) {
    return this.byCallId.get(callId);
  }

  register(bundle: ApprovalBundle) {
    bundle.calls.forEach((call) => this.byCallId.set(call.id, bundle));
    return bundle;
  }

  removeCall(callId: string) {
    this.byCallId.delete(callId);
  }

  removeBundle(bundle: ApprovalBundle) {
    bundle.calls.forEach((call) => this.removeCall(call.id));
  }

  claim(bundle: ApprovalBundle) {
    if (this.resolvingGroups.has(bundle.id)) return false;
    this.resolvingGroups.add(bundle.id);
    return true;
  }

  release(bundle: ApprovalBundle) {
    this.resolvingGroups.delete(bundle.id);
  }

  hasThread(threadId: string) {
    return Array.from(this.byCallId.values()).some((bundle) => bundle.threadId === threadId);
  }

  bundlesForThread(threadId: string) {
    return Array.from(new Set(Array.from(this.byCallId.values()).filter((bundle) => bundle.threadId === threadId)));
  }

  allBundles() {
    return Array.from(new Set(this.byCallId.values()));
  }

  reusableScope(threadId: string, call: DesktopToolCall) {
    const thread = this.store.getThread(threadId);
    return findMatchingApprovalScope(call, this.store.listApprovalScopes(thread?.workspaceId ?? null, threadId));
  }

  createScope(bundle: ApprovalBundle, call: DesktopToolCall, decisionScope: ApprovalDecisionScope) {
    if (decisionScope === "once") return undefined;
    const thread = this.store.getThread(bundle.threadId);
    const timestamp = Date.now();
    const boundedScope = approvalScopeBounds(decisionScope, timestamp);
    const base = {
      id: crypto.randomUUID(),
      workspaceId: thread?.workspaceId ?? null,
      expiresAt: boundedScope.expiresAt,
      maxUses: boundedScope.maxUses,
      createdAt: timestamp,
      updatedAt: timestamp,
      useCount: 0,
    };
    if (decisionScope === "command_prefix") {
      const commandPrefix = approvalCommandPrefix(call);
      if (!commandPrefix) return undefined;
      return this.store.upsertApprovalScope({
        ...base,
        kind: "terminal_prefix" as const,
        commandPrefix,
        cwd: approvalCwd(call),
      });
    }
    return this.store.upsertApprovalScope({
      ...base,
      kind: decisionScope === "this_thread" ? "tool_thread" : "tool_workspace",
      threadId: decisionScope === "this_thread" ? bundle.threadId : undefined,
      toolName: call.name,
    });
  }

  recordHistory(input: {
    threadId: string;
    messageId: string;
    call: DesktopToolCall;
    approved: boolean;
    scope?: ApprovalScopeRecord;
    reason?: string;
  }) {
    const thread = this.store.getThread(input.threadId);
    this.store.recordApprovalHistory({
      id: crypto.randomUUID(),
      threadId: input.threadId,
      messageId: input.messageId,
      workspaceId: thread?.workspaceId ?? null,
      callId: input.call.id,
      toolName: input.call.name,
      approved: input.approved,
      scopeId: input.scope?.id,
      scopeKind: input.scope?.kind,
      reason: input.reason,
      argsSummary: summarizeArgs(input.call.arguments),
      createdAt: Date.now(),
    });
  }

  restorePendingBundle(
    threadId: string,
    callId: string,
    createRun: (threadId: string, assistantMessageId: string, controller: AbortController) => AgentRunTracker,
  ): ApprovalBundle | null {
    const checkpoint = this.store.getRunCheckpoint(threadId);
    if (!checkpoint) return null;
    const target = this.store.findToolEventByCall(threadId, callId);
    if (!target || target.status !== "awaiting_approval" || target.messageId !== checkpoint.assistantMessageId) return null;
    if (target.approvalGroupId && this.resolvingGroups.has(target.approvalGroupId)) return null;
    const groupedEvents = this.store.listToolEventsForMessage(threadId, checkpoint.assistantMessageId)
      .filter((event) => target.approvalGroupId ? event.approvalGroupId === target.approvalGroupId : event.callId === callId);
    const interrupted = groupedEvents.filter((event) => event.status === "running");
    let restoredHistory = checkpoint.history as ProviderMessage[];
    if (interrupted.length > 0) {
      restoredHistory = appendToolResults(restoredHistory, interrupted.map((event) => ({
        id: event.callId,
        name: event.name,
        response: {
          success: false,
          error: "The app restarted while this approved action was running. It was not repeated automatically.",
          data: { interrupted: true, outcomeUnknown: true },
        },
      })));
      this.store.saveRunCheckpoint({ ...checkpoint, history: restoredHistory });
      interrupted.forEach((event) => this.store.upsertToolEvent({
        ...event,
        status: "failed",
        result: {
          success: false,
          error: "The app restarted while this approved action was running. Its outcome is unknown.",
        },
        output: "Interrupted by app restart. The action was not repeated automatically.",
        endedAt: Date.now(),
        updatedAt: Date.now(),
      }));
    }
    const toolEvents = groupedEvents.filter((event) => event.status === "awaiting_approval");
    const calls: DesktopToolCall[] = toolEvents.map((event) => ({
      id: event.callId,
      name: event.name as DesktopToolCall["name"],
      arguments: event.args || {},
    }));
    if (calls.length === 0) return null;
    const thread = this.store.getThread(threadId);
    const settings = this.store.getSettings();
    const run = createRun(threadId, checkpoint.assistantMessageId, new AbortController());
    run.iteration = checkpoint.iteration;
    run.toolCount = checkpoint.toolCount;
    run.recoveryAttempts = checkpoint.recoveryAttempts;
    run.model = checkpoint.model || thread?.model || settings.model;
    run.reasoningEffort = checkpoint.reasoningEffort || thread?.reasoningEffort || settings.reasoningEffort;
    run.collaborationMode = checkpoint.collaborationMode || thread?.collaborationMode || settings.collaborationMode;
    run.agentHarnessMode = checkpoint.agentHarnessMode || thread?.agentHarnessMode || settings.agentHarnessMode;
    transitionRun(run, "awaiting_approval", {
      iteration: checkpoint.iteration,
      toolCount: checkpoint.toolCount,
      resumable: false,
      reason: "Restored pending approval.",
    });
    return this.register({
      id: target.approvalGroupId || crypto.randomUUID(),
      threadId,
      assistantMessageId: checkpoint.assistantMessageId,
      workspaceRoot: checkpoint.workspaceRoot,
      calls,
      decisions: new Map(),
      history: restoredHistory,
      assistantText: checkpoint.assistantText,
      assistantThought: checkpoint.assistantThought,
      toolCount: checkpoint.toolCount,
      iteration: checkpoint.iteration,
      recoveryAttempts: checkpoint.recoveryAttempts,
      run,
      model: run.model,
      reasoningEffort: run.reasoningEffort,
      collaborationMode: run.collaborationMode,
      agentHarnessMode: run.agentHarnessMode,
    });
  }
}
