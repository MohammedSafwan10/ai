import type { BrowserWindow } from "electron";
import type { DesktopStore } from "../db/store";
import { isPlaceholderThreadTitle } from "../db/store";
import { getModelOption, getProviderForModel, resolveModelRuntimeBudget, type AgentHarnessMode, type CollaborationMode, type ReasoningEffort } from "../../shared/models";
import type {
  ApprovalDecisionInput,
  ApprovalDecisionScope,
  ApprovalScopeRecord,
  AssistantThoughtPartRecord,
  ChatMessageRecord,
  CompactionCheckpointRecord,
  ContextCompactionReason,
  ContextCompactionTrigger,
  PrivoraEventPayload,
  DesktopToolCall,
  GeneratedImageEventRecord,
  RequestUserInputResponseInput,
  StartTurnInput,
  SubagentRecord,
  TokenUsageRecord,
  ToolDiffFileRecord,
  ToolEventRecord,
  ToolResult,
} from "../../shared/types";
import { buildDesktopSystemPrompt } from "./systemPrompt";
import { appendAssistantToolCalls, appendToolResults, type ProviderMessage } from "./providers/types";
import type { BrowserSessionManager } from "../browser/BrowserSessionManager";
import type { ComputerUseManager } from "../computer/ComputerUseManager";
import type { NotesStore } from "../notes/NotesStore";
import { buildAgentsMdContext } from "./agentsMd";
import {
  COMPACTION_PROMPT,
  COMPACTION_SYSTEM_INSTRUCTION,
  buildCompactedProviderHistory,
  buildDeterministicCompactionSummary,
  buildProviderHistory,
  buildProviderHistoryWithCompaction,
  buildRuntimeContext,
  compactProviderHistoryWithInfo,
  compactToolResultForModel,
  estimateProviderHistoryTokens,
  sanitizeProviderHistoryForModel,
} from "./context";
import { buildMentionContext } from "./contextMentions";
import { loadSubagentRoles, pickSubagentNickname, type SubagentRoleConfig } from "./subagents";
import {
  markRunProgress,
  toActiveRunState,
  transitionRun,
  type AgentRunTracker,
} from "./runState";
import { approvalCommandPrefix, approvalCwd, findMatchingApprovalScope } from "./tools/permissions";
import { diffStatsFromFiles, parseUnifiedDiffFiles } from "./tools/diffFormatter";
import { normalizeApprovalDecisions, approvalScopeBounds, scopeLabel, type ApprovalDecision } from "./harness/support/approvals";
import { runtimeBudgetModeForHistory, runtimeBudgetModeForTurn } from "./harness/support/budget";
import { addTokenUsage, autoCompactTargetTokens, calculateContextUsage, shouldAutoCompactHistory } from "./harness/support/contextUsage";
import { StreamStalledError, delay, errorMessage, windowlessInterval } from "./harness/support/errors";
import { historyHasRecentToolResults, resolveNoToolOutcome } from "./harness/support/recovery";
import { ToolExecutionScheduler } from "./harness/support/scheduler";
import {
  MAX_SUBAGENT_DEPTH,
  buildForkedParentHistory,
  buildSubagentRuntimeContext,
  compactPreview,
  formatSubagentLabel,
  isLiveSubagent,
  isSubagentTool,
  normalizeForkTurns,
  normalizeRoleName,
  normalizeTaskName,
  parseReasoningEffort,
  subagentDepth,
  subagentInstructionMessage,
  subagentStatusSummary,
  subagentToolData,
  textProviderMessage,
} from "./harness/support/subagentRuntime";
import {
  activityItemsForTool,
  categoryForTool,
  compactLiveOutput,
  diffStats,
  liveStatusForTool,
  liveStatusFromOutput,
  patchTargetLabel,
  previewForTool,
  sortObject,
  summarizeArgs,
  terminalMeta,
  titleForTool,
} from "./harness/support/toolActivity";
import {
  buildVisibleFingerprints,
  createThreadTitleFilterState,
  fallbackThreadTitle,
  filterThreadTitleDelta,
  filterVisibleDelta,
  markAssistantTextRangePhase,
  recordAssistantTextPart,
} from "./harness/support/textParts";
import { planModeBlockReason } from "./harness/support/userInput";
import { ContextManager } from "./harness/contextManager";
import { HarnessProjectionService } from "./harness/projectionService";
import { RunRecoveryService } from "./harness/runRecoveryService";
import type { AgentHarnessApi } from "./harness/contracts";
import { VerificationEngine, reviewerReadOnlyBlockReason } from "./harness/verificationEngine";
import { ApprovalCoordinator, type ApprovalBundle } from "./harness/approvalCoordinator";
import { ToolCallCoordinator } from "./harness/toolCallCoordinator";
import { ModelLoop } from "./harness/modelLoop";
import { SubagentManager, resolveSubagentModel } from "./harness/subagentManager";
import { HarnessEventBus } from "./harness/eventBus";
import { TurnRegistry } from "./harness/turnRegistry";
import { UserInputCoordinator } from "./harness/userInputCoordinator";

export { reviewerReadOnlyBlockReason } from "./harness/verificationEngine";

export { resolveNoToolOutcome } from "./harness/support/recovery";
export { createThreadTitleFilterState, fallbackThreadTitle, filterThreadTitleDelta } from "./harness/support/textParts";

const MAX_CONTINUOUS_MODEL_ITERATIONS = 2048;
const MAX_TOOL_CALLS = 2_000;
const MAX_LIVE_SUBAGENTS_PER_PARENT = 3;
const MAX_LIVE_SUBAGENTS_PER_TREE = 6;
const STREAM_STALL_TIMEOUT_MS = 180_000;
const POST_TOOL_RESULT_STALL_TIMEOUT_MS = 300_000;
const MAX_STALL_RECOVERY_ATTEMPTS = 2;
const TOOL_OUTPUT_FLUSH_MS = 320;
const TOOL_OUTPUT_FORCE_FLUSH_CHARS = 80_000;

const now = () => Date.now();

const isAutoApprovedRiskyBrowserTool = (
  call: DesktopToolCall,
  decision: ReturnType<ToolCallCoordinator["assess"]>,
) =>
  call.name.startsWith("browser_") &&
  decision.risk === "risky" &&
  !decision.requiresApproval;

export const isImageGenerationToolName = (name: string) =>
  name === "generate_image" || name === "edit_image";

export const hasSuccessfulImageToolResult = (
  results: Array<{ call: DesktopToolCall; result: ToolResult }>,
) =>
  results.some((item) => isImageGenerationToolName(item.call.name) && item.result.success);

export const shouldCompleteAfterSuccessfulImageStall = (input: {
  hasSuccessfulImageAwaitingFollowup: boolean;
  providerProducedProgress: boolean;
  userRequestedPostImageWork?: boolean;
}) =>
  input.hasSuccessfulImageAwaitingFollowup && !input.providerProducedProgress && !input.userRequestedPostImageWork;

export const userRequestedPostImageWork = (history: ProviderMessage[]) => {
  const text = history
    .filter((message) => message.role === "user")
    .map((message) => message.content || "")
    .filter((content) => !content.startsWith("The stream stalled."))
    .join("\n")
    .toLowerCase();
  if (!text) return false;
  const postImagePatterns = [
    /\b(after|then|next|continue|do not stop|don't stop)\b/,
    /\b(save|copy|rename|move|place|write|create|edit|update|modify|wire|use it|asset)\b/,
    /\b(workspace|public\/|assets?\/|src\/|file|path|id|report|verify|check|exists|size)\b/,
  ];
  return postImagePatterns.some((pattern) => pattern.test(text));
};

const stringArg = (value: unknown, fallback = "") =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

const numberArg = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const imageModelFallback = (provider: string) =>
  provider === "gemini" ? "gemini-3.1-flash-image" : "gpt-image-2";

const imageStartEvent = (
  call: DesktopToolCall,
  threadId: string,
  messageId: string,
): GeneratedImageEventRecord => {
  const provider = stringArg(call.arguments.provider, "cliproxy");
  const timestamp = now();
  return {
    id: `${call.id}:image`,
    callId: call.id,
    threadId,
    messageId,
    status: "started",
    provider,
    model: stringArg(call.arguments.model, imageModelFallback(provider)),
    prompt: stringArg(call.arguments.prompt),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

const imageCompletedEventsFromResult = (
  call: DesktopToolCall,
  result: ToolResult,
  threadId: string,
  messageId: string,
): GeneratedImageEventRecord[] => {
  const images = Array.isArray(result.data?.images) ? result.data.images : [];
  return images.map((image, index) => {
    const record = image && typeof image === "object" ? image as Record<string, unknown> : {};
    const provider = stringArg(record.provider, stringArg(call.arguments.provider, "cliproxy"));
    const createdAt = numberArg(record.createdAt) ?? now();
    return {
      id: stringArg(record.id, `${call.id}:image:${index + 1}`),
      callId: call.id,
      threadId,
      messageId,
      status: "completed",
      provider,
      model: stringArg(record.model, stringArg(call.arguments.model, imageModelFallback(provider))),
      prompt: stringArg(record.prompt, stringArg(call.arguments.prompt)),
      previewUrl: stringArg(record.previewUrl) || undefined,
      path: stringArg(record.path) || undefined,
      workspacePath: stringArg(record.workspacePath) || undefined,
      mimeType: stringArg(record.mimeType) || undefined,
      sizeBytes: numberArg(record.sizeBytes),
      createdAt,
      updatedAt: now(),
    };
  });
};

const imageFailedEvent = (
  call: DesktopToolCall,
  result: Pick<ToolResult, "error">,
  threadId: string,
  messageId: string,
): GeneratedImageEventRecord => {
  const provider = stringArg(call.arguments.provider, "cliproxy");
  const timestamp = now();
  return {
    id: `${call.id}:image`,
    callId: call.id,
    threadId,
    messageId,
    status: "failed",
    provider,
    model: stringArg(call.arguments.model, imageModelFallback(provider)),
    prompt: stringArg(call.arguments.prompt),
    error: result.error || "Image generation failed.",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

interface ContinueOptions {
  threadId: string;
  assistantMessage: ChatMessageRecord;
  workspaceRoot: string;
  history: ProviderMessage[];
  assistantText: string;
  assistantThought: string;
  controller: AbortController;
  iteration: number;
  toolCount: number;
  recoveryAttempts: number;
  parentThreadId?: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  collaborationMode?: CollaborationMode;
  agentHarnessMode?: AgentHarnessMode;
  reviewerSwarmCompleted?: boolean;
  readOnlyTools?: boolean;
}

export class TurnCoordinator implements AgentHarnessApi {
  private tools: ToolCallCoordinator;
  private contextManager: ContextManager;
  private recovery: RunRecoveryService;
  private projection: HarnessProjectionService;
  private verification: VerificationEngine;
  private modelLoop = new ModelLoop();
  private subagents: SubagentManager;
  private activeRuns = new Map<string, AgentRunTracker>();
  private approvals: ApprovalCoordinator;
  private userInput: UserInputCoordinator;
  private turnRegistry = new TurnRegistry();
  private events: HarnessEventBus;
  private pendingToolOutput = new Map<string, {
    threadId: string;
    messageId: string;
    call: DesktopToolCall;
    delta: string;
    timer: NodeJS.Timeout | null;
  }>();
  private activitySequence = 0;

  constructor(
    private store: DesktopStore,
    private getMainWindow: () => BrowserWindow | null,
    private getActiveIds: () => { activeThreadId: string | null; activeWorkspaceId: string | null },
    browserManager?: BrowserSessionManager,
    notesStore?: NotesStore,
    computerUseManager?: ComputerUseManager,
  ) {
    this.contextManager = new ContextManager(store);
    this.recovery = new RunRecoveryService(store);
    this.recovery.recoverInterruptedUserInputs();
    this.approvals = new ApprovalCoordinator(store);
    this.projection = new HarnessProjectionService(store, this, getActiveIds);
    this.verification = new VerificationEngine(store, {
      startSubagentTurn: (...args) => this.startSubagentTurn(...args),
      stopSubagent: (agent) => {
        this.activeRuns.get(agent.threadId)?.controller.abort();
        this.stopThreadProcesses(agent.threadId);
      },
      emitRun: (run) => this.emitRun(run),
      emitSnapshot: () => this.emitSnapshot(),
      emitEvent: (event) => this.emit(event),
    });
    this.subagents = new SubagentManager(store, {
      isRunActive: (threadId) => this.activeRuns.has(threadId),
      startSubagentTurn: (...args) => this.startSubagentTurn(...args),
      startExistingSubagentTurn: (agent, workspaceRoot) => this.startExistingSubagentTurn(agent, workspaceRoot),
      appendUserMessage: (threadId, message) => this.appendSubagentUserMessage(threadId, message),
      stopThread: (threadId, reason) => {
        this.activeRuns.get(threadId)?.controller.abort();
        this.stopThreadProcesses(threadId);
        this.cancelPendingApprovalsForThread(threadId, reason);
      },
      emitSnapshot: () => this.emitSnapshot(),
    });
    this.events = new HarnessEventBus(() => {
      const window = this.getMainWindow();
      return window ? [window] : [];
    });
    this.userInput = new UserInputCoordinator({
      emitRun: (run) => this.emitRun(run),
      emitEvent: (event) => this.emit(event),
      persistPending: (threadId, call, questions) => {
        const checkpoint = this.recovery.checkpoint(threadId);
        if (checkpoint) this.recovery.save({ ...checkpoint, pendingUserInput: { call, questions } });
      },
      persistResolved: (threadId, call, result) => {
        const checkpoint = this.recovery.checkpoint(threadId);
        if (checkpoint?.pendingUserInput?.call.id === call.id) {
          this.recovery.save({
            ...checkpoint,
            history: appendToolResults(checkpoint.history as ProviderMessage[], [{
              id: call.id,
              name: call.name,
              response: result,
            }]),
            pendingUserInput: {
              ...checkpoint.pendingUserInput,
              resolvedResult: result,
            },
          });
        }
      },
    });
    this.tools = new ToolCallCoordinator(browserManager, notesStore, computerUseManager, (event) => {
      if (event.type === "terminal.output_delta") {
        // Chat receives terminal output through command_output_delta batching.
        // Do not mirror every terminal byte into the right-panel state; that
        // doubles renderer work during high-volume commands.
        return;
      }
      if (event.type === "terminal_session_ended") {
        this.untrackTerminalSession(event.session.sessionId);
      }
      this.emit({ type: "terminal.session_updated", session: event.session });
    });
  }

  getTerminalState() {
    return this.tools.getTerminalState();
  }

  readTerminalSession(sessionId: number, maxOutputChars?: number) {
    return this.tools.readTerminalSession(sessionId, maxOutputChars);
  }

  stopTerminalSession(sessionId: number) {
    return this.tools.stopTerminalSession(sessionId);
  }

  resizeTerminalSession(sessionId: number, rows: number, cols: number) {
    return this.tools.resizeTerminalSession(sessionId, rows, cols);
  }

  getActiveRun(threadId: string) {
    const run = this.activeRuns.get(threadId);
    if (run) return toActiveRunState(run);

    const pending = this.approvals.bundlesForThread(threadId)[0];
    if (pending) return toActiveRunState(pending.run);
    const pendingInputRun = this.userInput.pendingRun(threadId);
    if (pendingInputRun) return toActiveRunState(pendingInputRun);

    return this.recovery.activeRun(threadId);
  }

  listActiveRuns() {
    const runs = new Map<string, ReturnType<typeof toActiveRunState>>();
    this.activeRuns.forEach((run, threadId) => runs.set(threadId, toActiveRunState(run)));
    this.approvals.allBundles().forEach((bundle) => {
      if (!runs.has(bundle.threadId)) runs.set(bundle.threadId, toActiveRunState(bundle.run));
    });
    return Array.from(runs.values());
  }

  async startTurn(input: StartTurnInput) {
    const releaseStart = this.turnRegistry.begin(input.threadId, () => this.isThreadBusy(input.threadId));
    this.discardResumableRun(input.threadId);
    const thread = this.store.getThread(input.threadId);
    try {
      if (!thread) throw new Error("Thread not found.");
      const workspace = this.store.getWorkspace(thread.workspaceId);
      if (!workspace) throw new Error("Select a workspace before starting the desktop agent.");
      const settings = this.store.getSettings();
      const effectiveModel = getModelOption(input.model || thread.model || settings.model).id;
      const effectiveReasoning = input.reasoningEffort || thread.reasoningEffort || settings.reasoningEffort;
      const effectiveCollaborationMode = input.collaborationMode || thread.collaborationMode || settings.collaborationMode;
      const effectiveAgentHarnessMode = input.agentHarnessMode || thread.agentHarnessMode || settings.agentHarnessMode;
      const selectedModel = getModelOption(effectiveModel);
      const imageAttachmentCount = (input.attachments || []).filter((attachment) => attachment.mimeType.startsWith("image/")).length;
      if (imageAttachmentCount > 0 && !selectedModel.supportsImageInput) {
        throw new Error(`${selectedModel.label} does not support image input. Remove the image ${imageAttachmentCount === 1 ? "or switch" : "attachments or switch"} to a vision-capable model.`);
      }
      const budgetMode = runtimeBudgetModeForTurn(input);
      const runtimeBudget = resolveModelRuntimeBudget(effectiveModel, budgetMode);

      this.recovery.clear(input.threadId);
      const timestamp = now();
      const userMessage: ChatMessageRecord = {
        id: crypto.randomUUID(),
        threadId: input.threadId,
        role: "user",
        content: input.prompt,
        attachments: input.attachments,
        contextMentions: input.contextMentions,
        status: "completed",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const assistantMessage: ChatMessageRecord = {
        id: crypto.randomUUID(),
        threadId: input.threadId,
        role: "assistant",
        content: "",
        textParts: [],
        thought: "",
        thoughtParts: [],
        status: "running",
        createdAt: Math.max(timestamp + 1, userMessage.createdAt + 1),
        updatedAt: timestamp + 1,
      };
      this.store.upsertMessage(userMessage);
      this.store.upsertMessage(assistantMessage);
      this.emitSnapshot();

      const priorMessages = this.contextManager.buildHistoryWithCompaction(input.threadId, assistantMessage.id, runtimeBudget.messageCharLimit);
      const mentionContext = await buildMentionContext(this.store, input.threadId, workspace.path, input.contextMentions || []);
      const history = mentionContext
        ? [...priorMessages, textProviderMessage(mentionContext)]
        : priorMessages;

      const controller = new AbortController();
      const run = this.createRun(input.threadId, assistantMessage.id, controller);
      this.activeRuns.set(input.threadId, run);
      this.emitRun(run);
      this.emit({ type: "turn.started", threadId: input.threadId, turnId: assistantMessage.id });

      await this.continueLoop({
        threadId: input.threadId,
        assistantMessage,
        workspaceRoot: workspace.path,
        history,
        assistantText: "",
        assistantThought: "",
        controller,
        iteration: 0,
        toolCount: 0,
        recoveryAttempts: 0,
        model: effectiveModel,
        reasoningEffort: effectiveReasoning,
        collaborationMode: effectiveCollaborationMode,
        agentHarnessMode: effectiveAgentHarnessMode,
      });
    } finally {
      releaseStart();
    }
  }

  async continueRun(threadId: string) {
    if (this.isThreadBusy(threadId)) return;
    const checkpoint = this.recovery.checkpoint(threadId);
    if (!checkpoint) return;
    const assistantMessage = this.store.getMessage(checkpoint.assistantMessageId);
    if (!assistantMessage) return;
    const controller = new AbortController();
    const run = this.createRun(threadId, checkpoint.assistantMessageId, controller);
    run.iteration = checkpoint.iteration;
    run.toolCount = checkpoint.toolCount;
    run.recoveryAttempts = checkpoint.recoveryAttempts;
    this.activeRuns.set(threadId, run);
    this.updateAssistant(assistantMessage, checkpoint.assistantText, checkpoint.assistantThought, "running");
    this.emitRun(run);
    await this.continueLoop({
      threadId,
      assistantMessage,
      workspaceRoot: checkpoint.workspaceRoot,
      history: checkpoint.history as ProviderMessage[],
      assistantText: checkpoint.assistantText,
      assistantThought: checkpoint.assistantThought,
      controller,
      iteration: checkpoint.iteration,
      toolCount: checkpoint.toolCount,
      recoveryAttempts: checkpoint.recoveryAttempts,
      model: checkpoint.model,
      reasoningEffort: checkpoint.reasoningEffort,
      collaborationMode: checkpoint.collaborationMode,
      agentHarnessMode: checkpoint.agentHarnessMode || this.store.getThread(threadId)?.agentHarnessMode || this.store.getSettings().agentHarnessMode,
    });
  }

  private isThreadBusy(threadId: string) {
    if (this.activeRuns.has(threadId)) return true;
    if (this.turnRegistry.isStarting(threadId)) return true;
    if (this.approvals.hasThread(threadId)) return true;
    if (this.userInput.hasThread(threadId)) return true;
    if (this.recovery.activeRun(threadId)?.status === "awaiting_approval") return true;
    return false;
  }

  private discardResumableRun(threadId: string) {
    const run = this.activeRuns.get(threadId);
    if (run && run.resumable && (run.phase === "stopped" || run.phase === "stalled" || run.phase === "failed")) {
      this.activeRuns.delete(threadId);
      this.recovery.clear(threadId);
      this.emit({ type: "turn.status_changed", threadId, run: null });
      return;
    }
    if (!this.recovery.discardResumable(threadId, run)) return;
    if (run) this.activeRuns.delete(threadId);
    this.emit({ type: "turn.status_changed", threadId, run: null });
  }

  stopTurn(threadId: string) {
    const run = this.activeRuns.get(threadId);
    run?.controller.abort();
    this.stopThreadProcesses(threadId);
    this.store.listSubagents(threadId).forEach((agent) => {
      const childRun = this.activeRuns.get(agent.threadId);
      childRun?.controller.abort();
      this.stopThreadProcesses(agent.threadId);
      this.cancelPendingApprovalsForThread(agent.threadId, "Stopped with parent run.");
      this.store.updateSubagent(agent.threadId, {
        status: childRun ? "stopped" : agent.status,
        lastPreview: childRun ? "Stopped with parent run." : agent.lastPreview,
      });
    });
    if (run) transitionRun(run, "stopped", {
      reason: "Stop requested. Cleaning up active work.",
      resumable: true,
    });
    if (run) {
      const message = this.store.getMessage(run.assistantMessageId);
      if (message) {
        const assistantText = message.content || "Stopped. Completed tool changes were kept.";
        if (!message.content) recordAssistantTextPart(message, "final_answer", 0, assistantText.length);
        this.updateAssistant(message, assistantText, message.thought || "", "stopped");
      }
      this.activeRuns.delete(threadId);
      this.emit({ type: "turn.stopped", threadId, turnId: run.assistantMessageId, message: this.store.getMessage(run.assistantMessageId) || undefined });
      this.emit({ type: "turn.status_changed", threadId, run: this.getActiveRun(threadId) });
    }
    this.flushThreadToolOutputs(threadId);
    this.cancelPendingApprovalsForThread(threadId, "Stopped before approval.");
    if (this.recovery.cancelPendingApproval(threadId, "Stopped before approval.")) this.emitSnapshot();
    this.userInput.cancelThread(threadId);
    if (!run) this.emit({ type: "turn.status_changed", threadId, run: this.getActiveRun(threadId) });
  }

  async answerRequestUserInput(input: RequestUserInputResponseInput) {
    this.userInput.answer(input);
  }

  async decideApproval(input: ApprovalDecisionInput) {
    const decisions = normalizeApprovalDecisions(input);
    if (decisions.length === 0) return;
    const bundles = new Set<ApprovalBundle>();
    const unresolvedCallIds: string[] = [];
    decisions.forEach((decision) => {
      const bundle = this.approvals.get(decision.callId)
        || this.approvals.restorePendingBundle(input.threadId, decision.callId, (threadId, assistantMessageId, controller) =>
          this.createRun(threadId, assistantMessageId, controller));
      if (bundle?.run.reason === "Restored pending approval.") this.emitRun(bundle.run);
      if (!bundle || bundle.threadId !== input.threadId) {
        unresolvedCallIds.push(decision.callId);
        return;
      }
      bundle.decisions.set(decision.callId, {
        approved: decision.approved,
        scope: decision.scope || input.scope || "once",
      });
      bundles.add(bundle);
      const call = bundle.calls.find((item) => item.id === decision.callId);
      if (call && !decision.approved) {
        const event = this.updateToolEvent(bundle.threadId, bundle.assistantMessageId, call, {
          status: "cancelled",
          result: { success: false, error: "User cancelled this action." },
          endedAt: now(),
        });
        this.emit({ type: "tool.upserted", tool: event });
      }
    });

    for (const bundle of bundles) {
      if (!bundle.calls.every((call) => bundle.decisions.has(call.id))) {
        this.emitRun(bundle.run);
        continue;
      }
      await this.resolveApprovalBundle(bundle);
    }

    if (bundles.size === 0 && unresolvedCallIds.length > 0) {
      this.emit({
        type: "notification.created",
        tone: "error",
        message: "That approval request is no longer active. Stop this run and retry the action.",
      });
    }
  }

  private async continueLoop(options: ContinueOptions) {
    if (options.controller.signal.aborted) {
      this.finalizeStoppedRun(options);
      return;
    }
    const settings = this.store.getSettings();
    this.tools.setComputerUseEnabled(settings.computerUseEnabled);
    const thread = this.store.getThread(options.threadId);
    const effectiveModel = getModelOption(options.model || thread?.model || settings.model).id;
    const effectiveReasoning = options.reasoningEffort || thread?.reasoningEffort || settings.reasoningEffort;
    const effectiveCollaborationMode = options.collaborationMode || thread?.collaborationMode || settings.collaborationMode;
    const effectiveAgentHarnessMode = options.agentHarnessMode || thread?.agentHarnessMode || settings.agentHarnessMode;
    const runtimeBudget = resolveModelRuntimeBudget(effectiveModel, runtimeBudgetModeForHistory(options.history));
    let history = this.contextManager.sanitize(options.history, effectiveModel);
    let assistantText = options.assistantText;
    let assistantThought = options.assistantThought;
    const titleFilter = createThreadTitleFilterState(Boolean(thread && isPlaceholderThreadTitle(thread)));
    let iteration = options.iteration;
    let toolCount = options.toolCount;
    let recoveryAttempts = options.recoveryAttempts;
    let lastProviderUsage: TokenUsageRecord | null = null;
    let totalProviderUsage: TokenUsageRecord | null = null;
    const agentsMdContext = await buildAgentsMdContext(options.workspaceRoot);
    const visibleFingerprints = buildVisibleFingerprints(assistantText);
    let handoff = false;
    let controller = options.controller;
    let run = this.activeRuns.get(options.threadId) || this.createRun(options.threadId, options.assistantMessage.id, controller);
    run.model = effectiveModel;
    run.reasoningEffort = effectiveReasoning;
    run.collaborationMode = effectiveCollaborationMode;
    this.activeRuns.set(options.threadId, run);
    let assistantFlushTimer: NodeJS.Timeout | null = null;
    let assistantFlushStatus: ChatMessageRecord["status"] = "running";
    let lastAssistantFlushAt = 0;
    const flushAssistant = (status: ChatMessageRecord["status"], force = false) => {
      assistantFlushStatus = status;
      const commit = () => {
        assistantFlushTimer = null;
        lastAssistantFlushAt = Date.now();
        this.updateAssistant(options.assistantMessage, assistantText, assistantThought, assistantFlushStatus);
      };
      if (force) {
        if (assistantFlushTimer) {
          clearTimeout(assistantFlushTimer);
          assistantFlushTimer = null;
        }
        commit();
        return;
      }
      const waitMs = Math.max(0, 50 - (Date.now() - lastAssistantFlushAt));
      if (waitMs === 0) {
        commit();
        return;
      }
      if (!assistantFlushTimer) {
        assistantFlushTimer = setTimeout(commit, waitMs);
        assistantFlushTimer.unref?.();
      }
    };

    let successfulImageAwaitingFollowup = false;
    let providerProducedProgress = false;
    let lastStreamProgressEmitAt = 0;

    try {
      let continuousIterations = 0;
      let lastCompactionAttemptTokens = 0;
      while (!controller.signal.aborted && continuousIterations < MAX_CONTINUOUS_MODEL_ITERATIONS && toolCount < MAX_TOOL_CALLS) {
        continuousIterations += 1;
        iteration += 1;
        providerProducedProgress = false;
        const estimatedHistoryTokens = this.contextManager.estimateTokens(history);
        if (
          shouldAutoCompactHistory(history, runtimeBudget) &&
          estimatedHistoryTokens > lastCompactionAttemptTokens + 2_000
        ) {
          const compacted = await this.compactHistoryForRuntime({
            threadId: options.threadId,
            assistantMessageId: options.assistantMessage.id,
            workspaceRoot: options.workspaceRoot,
            history,
            model: effectiveModel,
            reasoningEffort: effectiveReasoning,
            collaborationMode: effectiveCollaborationMode,
            controller,
            trigger: iteration === 1 && toolCount === 0 ? "pre_turn" : "mid_turn",
            reason: "context_limit",
            textOffset: assistantText.length,
          });
          history = this.contextManager.sanitize(compacted.history, effectiveModel);
          lastCompactionAttemptTokens = compacted.afterTokens;
        }
        this.emitContextUsage(options.threadId, effectiveModel, history, runtimeBudget, lastProviderUsage, totalProviderUsage);
        run.iteration = iteration;
        run.toolCount = toolCount;
        transitionRun(run, "sampling", { iteration, toolCount, resumable: false, reason: undefined });
        this.emitRun(run);

        const calls: DesktopToolCall[] = [];
        const approvalCalls: DesktopToolCall[] = [];
        const scheduler = new ToolExecutionScheduler();
        const scheduleTool = (call: DesktopToolCall, browserExternalApproved = false) => {
          scheduler.schedule(call, this.tools.supportsParallelExecution(call), async (scheduledCall) => {
            try {
              if (controller.signal.aborted) {
                return {
                  call: scheduledCall,
                  result: { success: false, error: "Stopped before this tool started." },
                  response: { success: false, error: "Stopped before this tool started." },
                };
              }
              transitionRun(run, "executing_tool", { iteration, toolCount });
              this.emitRun(run);
              const result = await this.executeTool(
                scheduledCall,
                options.workspaceRoot,
                controller,
                run,
                options.threadId,
                options.assistantMessage.id,
                browserExternalApproved,
                settings.permissionMode,
                settings.computerUseEnabled,
              );
              const finalResult = controller.signal.aborted
                ? { success: false, error: "Stopped before this tool completed." }
                : result;
              const event = this.updateToolEvent(options.threadId, options.assistantMessage.id, scheduledCall, {
                status: controller.signal.aborted ? "stopped" : finalResult.success ? "done" : "failed",
                result: finalResult,
                output: finalResult.output || finalResult.error,
                diff: controller.signal.aborted ? undefined : (result as ToolResult & { diff?: string }).diff,
                diffFiles: controller.signal.aborted ? undefined : (result as ToolResult & { diffFiles?: ToolDiffFileRecord[] }).diffFiles,
                endedAt: now(),
              });
              this.emit({ type: "tool.upserted", tool: event });
              return { call: scheduledCall, result: finalResult, response: this.contextManager.compactToolResult(finalResult, runtimeBudget) };
            } catch (error) {
              const result: ToolResult = {
                success: false,
                error: controller.signal.aborted ? "Stopped before this tool completed." : errorMessage(error),
              };
              const event = this.updateToolEvent(options.threadId, options.assistantMessage.id, scheduledCall, {
                status: controller.signal.aborted ? "stopped" : "failed",
                result,
                output: result.error,
                endedAt: now(),
              });
              this.emit({ type: "tool.upserted", tool: event });
              return { call: scheduledCall, result, response: this.contextManager.compactToolResult(result, runtimeBudget) };
            }
          });
        };
        const scheduleBlockedTool = (call: DesktopToolCall, error: string) => {
          scheduler.schedule(call, false, async (scheduledCall) => ({
            call: scheduledCall,
            result: { success: false, error, data: { blockedByPlanMode: true } },
            response: { success: false, error, data: { blockedByPlanMode: true } },
          }));
        };
        const textStart = assistantText.length;
        const thoughtStart = assistantThought.length;
        const streamTextPhase = options.reviewerSwarmCompleted ? "final_answer" : "commentary";
        let activeThoughtPart: AssistantThoughtPartRecord | null = null;
        const ensureThoughtPart = () => {
          if (activeThoughtPart) return activeThoughtPart;
          activeThoughtPart = {
            id: crypto.randomUUID(),
            textOffset: assistantText.length,
            thoughtOffset: assistantThought.length,
            streamOrder: this.nextActivityOrder(),
            createdAt: now(),
            updatedAt: now(),
          };
          options.assistantMessage.thoughtParts = [
            ...(options.assistantMessage.thoughtParts || []),
            activeThoughtPart,
          ];
          return activeThoughtPart;
        };
        const endThoughtPart = () => {
          activeThoughtPart = null;
        };
        let stalledAbortReason: string | null = null;
        const stallTimeoutMs = historyHasRecentToolResults(history)
          ? POST_TOOL_RESULT_STALL_TIMEOUT_MS
          : STREAM_STALL_TIMEOUT_MS;
        const stallWatchdog = windowlessInterval(() => {
          if (controller.signal.aborted) return;
          if (Date.now() - run.lastProgressAt < stallTimeoutMs) return;
          stalledAbortReason = `The model connection stalled before it returned more output.`;
          controller.abort();
        }, 1000);

        try {
          const subagent = this.store.getSubagentByThread(options.threadId);
          await this.modelLoop.stream({
            provider: getProviderForModel(effectiveModel),
            model: effectiveModel,
            systemInstruction: buildDesktopSystemPrompt(
              options.workspaceRoot,
              [
                buildRuntimeContext(this.store, options.threadId, options.workspaceRoot),
                agentsMdContext,
                subagent ? buildSubagentRuntimeContext(subagent, loadSubagentRoles(options.workspaceRoot)) : "",
              ].filter(Boolean).join("\n\n"),
              effectiveCollaborationMode,
            ),
            messages: history,
            reasoning: effectiveReasoning,
            collaborationMode: effectiveCollaborationMode,
            signal: controller.signal,
            threadId: options.threadId,
            cliproxyBaseUrl: settings.cliproxyBaseUrl,
            appwriteEndpoint: settings.appwriteEndpoint,
            appwriteProjectId: settings.appwriteProjectId,
            privoraGatewayFunctionId: settings.privoraGatewayFunctionId,
            privoraSessionCookie: this.store.getSecret("privora_session_cookie"),
            privoraUserJwt: this.store.getPrivoraUserJwt(),
            openRouterApiKey: this.store.getSecret("openrouter_api_key"),
            geminiApiKey: this.store.getSecret("gemini_api_key"),
            maxOutputTokens: runtimeBudget.outputTokens,
            onStreamProgress: () => {
              providerProducedProgress = true;
              markRunProgress(run);
              if (Date.now() - lastStreamProgressEmitAt >= 1000) {
                lastStreamProgressEmitAt = Date.now();
                this.emitRun(run);
              }
            },
            onTextDelta: (delta) => {
              providerProducedProgress = true;
              markRunProgress(run);
              const titleFiltered = filterThreadTitleDelta(delta, titleFilter, (title) => {
                const updated = this.store.updatePlaceholderThreadTitle(options.threadId, title, "agent");
                if (updated) this.emitSnapshot();
              });
              const filtered = filterVisibleDelta(assistantText, titleFiltered, visibleFingerprints);
              if (!filtered) return;
              successfulImageAwaitingFollowup = false;
              const startOffset = assistantText.length;
              assistantText += filtered;
              recordAssistantTextPart(options.assistantMessage, streamTextPhase, startOffset, assistantText.length);
              flushAssistant("running");
              this.emitRun(run);
            },
            onThoughtDelta: (delta) => {
              providerProducedProgress = true;
              successfulImageAwaitingFollowup = false;
              const thoughtPart = ensureThoughtPart();
              assistantThought += delta;
              thoughtPart.updatedAt = now();
              markRunProgress(run);
              flushAssistant("running");
              this.emitRun(run);
            },
            onToolDraft: (draft) => {
              providerProducedProgress = true;
              successfulImageAwaitingFollowup = false;
              endThoughtPart();
              markRunProgress(run);
              const call: DesktopToolCall = {
                id: draft.id || `draft_${options.assistantMessage.id}_${draft.name}_${this.stableArgsKey(draft.arguments)}`,
                name: draft.name as DesktopToolCall["name"],
                arguments: draft.arguments,
              };
              const event = this.updateToolEvent(options.threadId, options.assistantMessage.id, call, {
                status: "preparing",
                title: titleForTool(call),
                textOffset: assistantText.length,
                startedAt: now(),
              });
              this.emit({ type: "tool.upserted", tool: event });
            },
            onToolCall: (call) => {
              providerProducedProgress = true;
              successfulImageAwaitingFollowup = false;
              endThoughtPart();
              markRunProgress(run);
              calls.push(call);
              const decision = this.tools.assess(call, settings.permissionMode, thread?.workspaceId);
              const readOnlyBlock = reviewerReadOnlyBlockReason(call, options.readOnlyTools);
              const planBlock = readOnlyBlock || planModeBlockReason(call, effectiveCollaborationMode, decision);
              const scope = decision.requiresApproval
                ? this.approvals.reusableScope(options.threadId, call)
                : null;
              if (scope) {
                this.store.markApprovalScopeUsed(scope.id);
                this.approvals.recordHistory({
                  threadId: options.threadId,
                  messageId: options.assistantMessage.id,
                  call,
                  approved: true,
                  scope,
                  reason: "Matched saved approval scope.",
                });
              }
              const requiresApproval = !planBlock && decision.requiresApproval && !scope;
              const event = this.updateToolEvent(options.threadId, options.assistantMessage.id, call, {
                status: planBlock ? "running" : requiresApproval ? "awaiting_approval" : "running",
                risk: planBlock ? "blocked" : decision.risk,
                approvalReason: scope
                  ? `Auto-approved by saved ${scopeLabel(scope)} scope.`
                  : decision.reason,
                title: titleForTool(call),
                textOffset: assistantText.length,
                startedAt: now(),
              });
              this.emit({ type: "tool.upserted", tool: event });
              if (planBlock) {
                scheduleBlockedTool(call, planBlock);
              } else if (requiresApproval) {
                approvalCalls.push(call);
              } else {
                scheduleTool(call, Boolean(scope) || isAutoApprovedRiskyBrowserTool(call, decision));
              }
            },
            onUsage: (usage) => {
              lastProviderUsage = usage;
              totalProviderUsage = addTokenUsage(totalProviderUsage, usage);
              this.emitContextUsage(options.threadId, effectiveModel, history, runtimeBudget, lastProviderUsage, totalProviderUsage);
            },
            onAiCredits: (creditEvent) => {
              if (creditEvent.summary) {
                this.store.setAiCreditSummary(creditEvent.summary);
                this.emit({ type: "ai_credit.summary_updated", summary: creditEvent.summary });
              }
              const creditTool: DesktopToolCall = {
                id: `ai_credits_${options.assistantMessage.id}_${iteration}`,
                name: "web_search",
                arguments: {
                  creditsUsed: creditEvent.creditsUsed,
                  estimatedCredits: creditEvent.estimatedCredits,
                },
              };
              const event = this.updateToolEvent(options.threadId, options.assistantMessage.id, creditTool, {
                title: "AI credits used",
                category: "other",
                status: "done",
                risk: "safe",
                result: { success: true },
                output: `${creditEvent.creditsUsed.toLocaleString()} AI credits used. Estimated ${creditEvent.estimatedCredits.toLocaleString()}.`,
                textOffset: assistantText.length,
                startedAt: now(),
                endedAt: now(),
              });
              this.emit({ type: "tool.upserted", tool: event });
            },
            onTextReplace: (text) => {
              endThoughtPart();
              const previousIterationText = assistantText.slice(textStart);
              if (text === previousIterationText) return;
              providerProducedProgress = true;
              successfulImageAwaitingFollowup = false;
              const previousParts = options.assistantMessage.textParts || [];
              assistantText = `${assistantText.slice(0, textStart)}${text}`;
              options.assistantMessage.textParts = previousParts.filter((part) => part.endOffset <= textStart);
              recordAssistantTextPart(options.assistantMessage, streamTextPhase, textStart, assistantText.length);
              markRunProgress(run);
              flushAssistant("running", true);
              this.emitRun(run);
            },
            onWebSearch: (search) => {
              providerProducedProgress = true;
              successfulImageAwaitingFollowup = false;
              endThoughtPart();
              markRunProgress(run);
              const call: DesktopToolCall = {
                id: search.id,
                name: "web_search" as DesktopToolCall["name"],
                arguments: { query: search.query || "" },
              };
              const event = this.updateToolEvent(options.threadId, options.assistantMessage.id, call, {
                status: search.status === "done" ? "done" : search.status === "failed" ? "failed" : "running",
                title: search.title || (search.status === "done" ? "Searched web" : "Searching web"),
                category: "search",
                risk: "safe",
                textOffset: assistantText.length,
                output: search.output,
                result: search.status === "done"
                  ? { success: true, output: search.output || "Searched web" }
                  : search.status === "failed"
                    ? { success: false, error: search.output || "Web search failed" }
                    : undefined,
                liveStatus: search.status === "done" ? undefined : (search.query ? `Searching ${search.query}` : "Searching web"),
                startedAt: now(),
                endedAt: search.status === "running" ? undefined : now(),
              });
              this.emit({ type: "tool.upserted", tool: event });
              this.emitRun(run);
            },
          });
        } catch (error) {
          if (stalledAbortReason) throw new StreamStalledError(stalledAbortReason);
          throw error;
        } finally {
          clearInterval(stallWatchdog);
        }

        this.closeDanglingDraftTools(options.threadId, options.assistantMessage.id, new Set(calls.map((call) => call.id)));
        flushAssistant("running", true);
        const noToolOutcome = resolveNoToolOutcome({
          iterationText: assistantText.slice(textStart),
          iterationThought: assistantThought.slice(thoughtStart),
          afterToolResults: historyHasRecentToolResults(history),
          recoveryAttempts,
        });
        if (calls.length === 0) {
          if (noToolOutcome.action === "recover") {
            recoveryAttempts += 1;
            history = [...history, textProviderMessage(noToolOutcome.message)];
            this.saveCheckpoint(options, history, assistantText, assistantThought, iteration, toolCount, recoveryAttempts, run);
            continue;
          }
          const swarmFeedback = await this.maybeRunReviewerSwarm({
            options,
            run,
            assistantText,
            toolCount,
            agentHarnessMode: effectiveAgentHarnessMode,
          });
          if (swarmFeedback) {
            const draftText = assistantText.slice(textStart);
            assistantText = assistantText.slice(0, textStart);
            options.assistantMessage.textParts = (options.assistantMessage.textParts || []).filter((part) => part.endOffset <= textStart);
            flushAssistant("running", true);
            history = [
              ...history,
              ...(draftText.trim() ? [{
                role: "assistant" as const,
                content: draftText,
                parts: [{ type: "text" as const, text: draftText }],
              }] : []),
              textProviderMessage(swarmFeedback),
            ];
            options.reviewerSwarmCompleted = true;
            this.saveCheckpoint(options, history, assistantText, assistantThought, iteration, toolCount, recoveryAttempts, run);
            continue;
          }
          transitionRun(run, "draining", { iteration, toolCount });
          transitionRun(run, "completed", { iteration, toolCount });
          if (!assistantText) {
            const startOffset = assistantText.length;
            assistantText = "Done.";
            recordAssistantTextPart(options.assistantMessage, "final_answer", startOffset, assistantText.length);
          } else {
            markAssistantTextRangePhase(options.assistantMessage, textStart, assistantText.length, "final_answer");
          }
          this.ensureFallbackThreadTitle(options.threadId);
          flushAssistant("completed", true);
          this.recovery.clear(options.threadId);
          this.activeRuns.delete(options.threadId);
          this.markSubagentFinished(options.threadId, "completed", assistantText);
          this.emit({ type: "turn.completed", threadId: options.threadId, turnId: options.assistantMessage.id, message: options.assistantMessage });
          this.emit({ type: "turn.status_changed", threadId: options.threadId, run: null });
          return;
        }

        if (streamTextPhase === "final_answer") {
          markAssistantTextRangePhase(options.assistantMessage, textStart, assistantText.length, "commentary");
        }
        history = appendAssistantToolCalls(history, assistantText.slice(textStart), calls);
        this.saveCheckpoint(options, history, assistantText, assistantThought, iteration, toolCount, recoveryAttempts, run);

        const scheduledResults = await scheduler.drainOrdered();
        if (controller.signal.aborted) throw new Error("Stopped.");
        for (const item of scheduledResults) {
          toolCount += 1;
          run.toolCount = toolCount;
          this.saveCheckpoint(options, history, assistantText, assistantThought, iteration, toolCount, recoveryAttempts, run);
        }
        if (hasSuccessfulImageToolResult(scheduledResults)) successfulImageAwaitingFollowup = true;
        const results = scheduledResults.map((item) => ({
          id: item.id,
          name: item.name,
          response: item.response,
        }));

        if (approvalCalls.length > 0) {
          if (results.length > 0) {
            history = appendToolResults(history, results);
          }
          const bundle = this.createApprovalBundle({
            options,
            calls: approvalCalls,
            history,
            assistantText,
            assistantThought,
            toolCount,
            iteration,
            recoveryAttempts,
            run,
          });
          transitionRun(run, "awaiting_approval", { iteration, toolCount, resumable: false });
          this.updateAssistant(options.assistantMessage, assistantText, assistantThought, "awaiting_approval");
          this.activeRuns.delete(options.threadId);
          this.emitRun(run);
          handoff = true;
          return;
        }

        transitionRun(run, "draining", { iteration, toolCount });
        this.emitRun(run);
        history = appendToolResults(history, results);
        this.saveCheckpoint(options, history, assistantText, assistantThought, iteration, toolCount, recoveryAttempts, run);
        recoveryAttempts = 0;
      }

      const pauseText = "\n\nPaused after a long run. Completed changes were kept. Use Continue to resume from the last checkpoint.";
      if (!assistantText.includes("Paused after a long run.")) {
        const startOffset = assistantText.length;
        assistantText += pauseText;
        recordAssistantTextPart(options.assistantMessage, "final_answer", startOffset, assistantText.length);
      }
      this.saveCheckpoint(options, history, assistantText, assistantThought, iteration, toolCount, recoveryAttempts, run);
      transitionRun(run, "stalled", {
        iteration,
        toolCount,
        reason: toolCount >= MAX_TOOL_CALLS
          ? "Paused after a large number of tool calls."
          : "Paused after many model/tool iterations.",
        resumable: true,
      });
      flushAssistant("stalled", true);
      this.emitRun(run);
      handoff = true;
    } catch (error) {
      if (error instanceof StreamStalledError) {
        this.saveCheckpoint(options, history, assistantText, assistantThought, iteration, toolCount, recoveryAttempts, run);
        if (shouldCompleteAfterSuccessfulImageStall({
          hasSuccessfulImageAwaitingFollowup: successfulImageAwaitingFollowup,
          providerProducedProgress,
          userRequestedPostImageWork: userRequestedPostImageWork(history),
        })) {
          transitionRun(run, "draining", { iteration, toolCount });
          transitionRun(run, "completed", { iteration, toolCount });
          this.ensureFallbackThreadTitle(options.threadId);
          flushAssistant("completed", true);
          this.recovery.clear(options.threadId);
          this.activeRuns.delete(options.threadId);
          this.markSubagentFinished(options.threadId, "completed", assistantText || "Generated image.");
          this.emit({ type: "turn.completed", threadId: options.threadId, turnId: options.assistantMessage.id, message: options.assistantMessage });
          this.emit({ type: "turn.status_changed", threadId: options.threadId, run: null });
          return;
        }
        if (recoveryAttempts < MAX_STALL_RECOVERY_ATTEMPTS) {
          const nextController = new AbortController();
          run.controller = nextController;
          run.recoveryAttempts = recoveryAttempts + 1;
          transitionRun(run, "sampling", { iteration, toolCount, reason: "Recovered after a temporary stall." });
          this.activeRuns.set(options.threadId, run);
          this.emitRun(run);
          handoff = true;
          await this.continueLoop({
            ...options,
            controller: nextController,
            history: [...history, textProviderMessage("The stream stalled. Continue from the last completed tool boundary. Do not repeat completed tool calls. Provide the next needed tool call or final answer.")],
            assistantText,
            assistantThought,
            iteration,
            toolCount,
            recoveryAttempts: recoveryAttempts + 1,
          });
          return;
        }
        transitionRun(run, "stalled", { iteration, toolCount, reason: error.message, resumable: true });
        if (!assistantText) {
          const startOffset = assistantText.length;
          assistantText = "The model connection stalled before it returned more Agent output.";
          recordAssistantTextPart(options.assistantMessage, "final_answer", startOffset, assistantText.length);
        }
        flushAssistant("stalled", true);
        this.markSubagentFinished(options.threadId, "failed", assistantText || error.message);
        this.emitRun(run);
        handoff = true;
        return;
      }

      const aborted = controller.signal.aborted;
      const hasVisibleWork = Boolean(
        assistantText.trim() ||
        assistantThought.trim() ||
        this.store.hasToolEventsForMessage(options.threadId, options.assistantMessage.id),
      );
      this.saveCheckpoint(options, history, assistantText, assistantThought, iteration, toolCount, recoveryAttempts, run);
      transitionRun(run, aborted ? "stopped" : "failed", {
        iteration,
        toolCount,
        reason: aborted ? "Stopped. Completed tool changes were kept." : errorMessage(error),
        resumable: aborted,
      });
      if (!assistantText) {
        const startOffset = assistantText.length;
        assistantText = aborted
          ? "Stopped. Completed tool changes were kept."
          : hasVisibleWork
            ? ""
            : `The run stopped before producing visible output.\n\n${errorMessage(error)}`;
        recordAssistantTextPart(options.assistantMessage, "final_answer", startOffset, assistantText.length);
      }
      flushAssistant(aborted ? "stopped" : "failed", true);
      this.markSubagentFinished(options.threadId, aborted ? "stopped" : "failed", assistantText || errorMessage(error));
      this.emit({
        type: aborted ? "turn.stopped" : "turn.failed",
        threadId: options.threadId,
        turnId: options.assistantMessage.id,
        message: options.assistantMessage,
      });
      this.emitRun(run);
      if (!aborted) this.emit({ type: "notification.created", tone: "error", message: errorMessage(error) });
    } finally {
      if (assistantFlushTimer) {
        clearTimeout(assistantFlushTimer);
        assistantFlushTimer = null;
      }
      if (!handoff && this.activeRuns.get(options.threadId)?.assistantMessageId === options.assistantMessage.id) {
        this.activeRuns.delete(options.threadId);
        this.emit({ type: "turn.status_changed", threadId: options.threadId, run: this.getActiveRun(options.threadId) });
      }
    }
  }

  private async resolveApprovalBundle(bundle: ApprovalBundle) {
    if (!this.approvals.claim(bundle)) return;
    const assistantMessage = this.store.getMessage(bundle.assistantMessageId);
    if (!assistantMessage) {
      this.approvals.release(bundle);
      return;
    }
    this.emit({ type: "approval.resolved", threadId: bundle.threadId, turnId: bundle.assistantMessageId, callIds: bundle.calls.map((call) => call.id) });
    const runtimeBudget = resolveModelRuntimeBudget(bundle.model || this.store.getSettings().model, runtimeBudgetModeForHistory(bundle.history));
    this.activeRuns.set(bundle.threadId, bundle.run);
    transitionRun(bundle.run, "sampling", { iteration: bundle.iteration, toolCount: bundle.toolCount });
    this.updateAssistant(assistantMessage, bundle.assistantText, bundle.assistantThought, "running");
    this.emitRun(bundle.run);

    const results: Array<{ id: string; name: string; response: ToolResult }> = [];
    let history = bundle.history;
    let toolCount = bundle.toolCount;
    try {
      for (const call of bundle.calls) {
        if (bundle.run.controller.signal.aborted) break;
        const decision = bundle.decisions.get(call.id) || { approved: false, scope: "once" as const };
        const approved = decision.approved;
        let result: ToolResult;
        let scope: ApprovalScopeRecord | undefined;
        if (approved) {
          scope = this.approvals.createScope(bundle, call, decision.scope);
          this.approvals.recordHistory({
            threadId: bundle.threadId,
            messageId: bundle.assistantMessageId,
            call,
            approved: true,
            scope,
            reason: this.tools.assess(call, this.store.getSettings().permissionMode, this.store.getThread(bundle.threadId)?.workspaceId).reason,
          });
          const event = this.updateToolEvent(bundle.threadId, bundle.assistantMessageId, call, {
            status: "running",
            startedAt: now(),
          });
          this.emit({ type: "tool.upserted", tool: event });
          try {
            result = await this.executeTool(call, bundle.workspaceRoot, bundle.run.controller, bundle.run, bundle.threadId, bundle.assistantMessageId, true);
          } catch (error) {
            result = { success: false, error: errorMessage(error) };
          }
          toolCount += 1;
        } else {
          this.approvals.recordHistory({
            threadId: bundle.threadId,
            messageId: bundle.assistantMessageId,
            call,
            approved: false,
            reason: "User cancelled this action.",
          });
          result = { success: false, error: "User cancelled this action." };
        }
        if (bundle.run.controller.signal.aborted) break;
        const finalToolEvent = this.updateToolEvent(bundle.threadId, bundle.assistantMessageId, call, {
          status: result.success ? "done" : approved ? "failed" : "cancelled",
          result,
          output: result.output || result.error,
          diff: (result as ToolResult & { diff?: string }).diff,
          diffFiles: (result as ToolResult & { diffFiles?: ToolDiffFileRecord[] }).diffFiles,
          endedAt: now(),
        }, false);
        results.push({ id: call.id, name: call.name, response: this.contextManager.compactToolResult(result, runtimeBudget) });
        history = appendToolResults(history, [results.at(-1)!]);
        const checkpoint = {
          ...(this.recovery.checkpoint(bundle.threadId) || {
            version: 1,
            threadId: bundle.threadId,
            assistantMessageId: bundle.assistantMessageId,
            workspaceRoot: bundle.workspaceRoot,
            assistantText: bundle.assistantText,
            assistantThought: bundle.assistantThought,
            iteration: bundle.iteration,
            recoveryAttempts: bundle.recoveryAttempts,
            lastProgressAt: bundle.run.lastProgressAt,
            updatedAt: now(),
          }),
          history,
          toolCount,
          model: bundle.model,
          reasoningEffort: bundle.reasoningEffort,
          collaborationMode: bundle.collaborationMode,
          agentHarnessMode: bundle.agentHarnessMode,
        };
        this.store.commitToolEventAndCheckpoint(finalToolEvent, checkpoint);
        this.emit({ type: "tool.upserted", tool: finalToolEvent });
        this.approvals.removeCall(call.id);
      }

    if (bundle.run.controller.signal.aborted) {
      this.finalizeStoppedRun({
        threadId: bundle.threadId,
        assistantMessage,
        assistantText: bundle.assistantText,
        assistantThought: bundle.assistantThought,
      });
      return;
    }
    await this.continueLoop({
      threadId: bundle.threadId,
      assistantMessage,
      workspaceRoot: bundle.workspaceRoot,
      history,
      assistantText: bundle.assistantText,
      assistantThought: bundle.assistantThought,
      controller: bundle.run.controller,
      iteration: bundle.iteration,
      toolCount,
      recoveryAttempts: bundle.recoveryAttempts,
      model: bundle.model,
      reasoningEffort: bundle.reasoningEffort,
      collaborationMode: bundle.collaborationMode,
      agentHarnessMode: bundle.agentHarnessMode,
    });
    } finally {
      this.approvals.removeBundle(bundle);
      this.approvals.release(bundle);
    }
  }

  private createApprovalBundle(params: {
    options: ContinueOptions;
    calls: DesktopToolCall[];
    history: ProviderMessage[];
    assistantText: string;
    assistantThought: string;
    toolCount: number;
    iteration: number;
    recoveryAttempts: number;
    run: AgentRunTracker;
  }) {
    const id = crypto.randomUUID();
    const bundle: ApprovalBundle = {
      id,
      threadId: params.options.threadId,
      assistantMessageId: params.options.assistantMessage.id,
      workspaceRoot: params.options.workspaceRoot,
      calls: params.calls,
      decisions: new Map(),
      history: params.history,
      assistantText: params.assistantText,
      assistantThought: params.assistantThought,
      toolCount: params.toolCount,
      iteration: params.iteration,
      recoveryAttempts: params.recoveryAttempts,
      run: params.run,
      model: params.options.model,
      reasoningEffort: params.options.reasoningEffort,
      collaborationMode: params.options.collaborationMode,
      agentHarnessMode: params.options.agentHarnessMode,
    };
    params.calls.forEach((call) => {
      this.approvals.register(bundle);
      const event = this.updateToolEvent(params.options.threadId, params.options.assistantMessage.id, call, {
        status: "awaiting_approval",
        approvalGroupId: id,
      });
      this.emit({ type: "tool.upserted", tool: event });
    });
    this.emit({ type: "approval.requested", threadId: bundle.threadId, turnId: bundle.assistantMessageId, callIds: bundle.calls.map((call) => call.id) });
    this.saveCheckpoint(params.options, params.history, params.assistantText, params.assistantThought, params.iteration, params.toolCount, params.recoveryAttempts, params.run);
    return bundle;
  }

  private async compactHistoryForRuntime(input: {
    threadId: string;
    assistantMessageId: string;
    workspaceRoot: string;
    history: ProviderMessage[];
    model: string;
    reasoningEffort: ReasoningEffort;
    collaborationMode: CollaborationMode;
    controller: AbortController;
    trigger: ContextCompactionTrigger;
    reason: ContextCompactionReason;
    textOffset: number;
  }) {
    const beforeTokens = estimateProviderHistoryTokens(input.history);
    const call: DesktopToolCall = {
      id: `context_compaction_${input.assistantMessageId}_${Date.now()}`,
      name: "context_compaction" as DesktopToolCall["name"],
      arguments: {
        trigger: input.trigger,
        reason: input.reason,
        beforeTokens,
      },
    };
    const startedAt = now();
    const started = this.updateToolEvent(input.threadId, input.assistantMessageId, call, {
      title: "Compacting context",
      category: "other",
      status: "running",
      risk: "safe",
      liveStatus: "Building handoff summary",
      textOffset: input.textOffset,
      startedAt,
    });
    this.emit({ type: "tool.upserted", tool: started });

    let summary = "";
    let replacementHistory: ProviderMessage[] = [];
    let error: string | undefined;
    try {
      summary = await this.generateCompactionSummary(input);
      replacementHistory = buildCompactedProviderHistory(input.history, summary);
    } catch (candidateError) {
      error = errorMessage(candidateError);
      summary = buildDeterministicCompactionSummary(input.history);
      replacementHistory = buildCompactedProviderHistory(input.history, summary);
    }

    const afterTokens = estimateProviderHistoryTokens(replacementHistory);
    const compactedThrough = this.store
      .listRecentMessages(input.threadId, 50)
      .filter((message) => message.id !== input.assistantMessageId)
      .at(-1);
    const checkpoint: CompactionCheckpointRecord = {
      id: crypto.randomUUID(),
      threadId: input.threadId,
      assistantMessageId: input.assistantMessageId,
      compactedThroughMessageId: compactedThrough?.id,
      compactedThroughMessageCreatedAt: compactedThrough?.createdAt,
      workspaceRoot: input.workspaceRoot,
      model: input.model,
      trigger: error ? "fallback" : input.trigger,
      reason: error ? "model_compaction_failed" : input.reason,
      status: "completed",
      summary,
      replacementHistory,
      beforeTokens,
      afterTokens,
      error,
      createdAt: now(),
    };
    this.store.saveCompactionCheckpoint(checkpoint);
    this.emit({ type: "context.compacted", threadId: input.threadId, turnId: input.assistantMessageId, checkpoint });

    const output = error
      ? `Model compaction failed; used deterministic fallback.\n${error}\n\n${summary}`
      : summary;
    const completed = this.updateToolEvent(input.threadId, input.assistantMessageId, call, {
      title: error ? "Context compacted with fallback" : "Context compacted",
      category: "other",
      status: "done",
      risk: "safe",
      liveStatus: undefined,
      result: {
        success: true,
        output,
        data: {
          trigger: checkpoint.trigger,
          reason: checkpoint.reason,
          beforeTokens,
          afterTokens,
          checkpointId: checkpoint.id,
        },
      },
      output,
      preview: `${beforeTokens.toLocaleString()} -> ${afterTokens.toLocaleString()} tokens`,
      endedAt: now(),
    });
    this.emit({ type: "tool.upserted", tool: completed });

    return { history: replacementHistory, beforeTokens, afterTokens, checkpoint };
  }

  private async generateCompactionSummary(input: {
    threadId: string;
    history: ProviderMessage[];
    model: string;
    reasoningEffort: ReasoningEffort;
    collaborationMode: CollaborationMode;
    controller: AbortController;
  }) {
    const settings = this.store.getSettings();
    let summary = "";
    let thought = "";
    await this.modelLoop.stream({
      provider: getProviderForModel(input.model),
      model: input.model,
      systemInstruction: COMPACTION_SYSTEM_INSTRUCTION,
      messages: [
        ...input.history,
        textProviderMessage(COMPACTION_PROMPT),
      ],
      reasoning: input.reasoningEffort,
      collaborationMode: input.collaborationMode,
      signal: input.controller.signal,
      threadId: input.threadId,
      disableTools: true,
      cliproxyBaseUrl: settings.cliproxyBaseUrl,
      appwriteEndpoint: settings.appwriteEndpoint,
      appwriteProjectId: settings.appwriteProjectId,
      privoraGatewayFunctionId: settings.privoraGatewayFunctionId,
      privoraSessionCookie: this.store.getSecret("privora_session_cookie"),
      privoraUserJwt: this.store.getPrivoraUserJwt(),
      openRouterApiKey: this.store.getSecret("openrouter_api_key"),
      geminiApiKey: this.store.getSecret("gemini_api_key"),
      maxOutputTokens: 4096,
      onTextDelta: (delta) => { summary += delta; },
      onThoughtDelta: (delta) => { thought += delta; },
      onToolDraft: () => undefined,
      onToolCall: () => undefined,
    });
    const trimmed = summary.trim();
    if (trimmed) return trimmed;
    if (thought.trim()) return thought.trim();
    throw new Error("Compaction model returned no summary text.");
  }

  private markSubagentFinished(threadId: string, status: SubagentRecord["status"], text: string) {
    this.subagents.markFinished(threadId, status, text);
  }

  private async maybeRunReviewerSwarm(input: {
    options: ContinueOptions;
    run: AgentRunTracker;
    assistantText: string;
    toolCount: number;
    agentHarnessMode: AgentHarnessMode;
  }) {
    return this.verification.verify({
      threadId: input.options.threadId,
      parentThreadId: input.options.parentThreadId,
      assistantMessage: input.options.assistantMessage,
      workspaceRoot: input.options.workspaceRoot,
      assistantText: input.assistantText,
      toolCount: input.toolCount,
      iteration: input.options.iteration,
      model: input.options.model,
      reasoningEffort: input.options.reasoningEffort,
      collaborationMode: input.options.collaborationMode,
      agentHarnessMode: input.agentHarnessMode,
      alreadyCompleted: input.options.reviewerSwarmCompleted,
      run: input.run,
    });
  }

  private async executeTool(
    call: DesktopToolCall,
    workspaceRoot: string,
    controller: AbortController,
    run: AgentRunTracker,
    threadId: string,
    messageId: string,
    browserExternalApproved = false,
    permissionMode = this.store.getSettings().permissionMode,
    computerUseEnabled = this.store.getSettings().computerUseEnabled,
  ) {
    if (isSubagentTool(call.name)) {
      return await this.executeSubagentTool(call, workspaceRoot, controller, run, threadId, messageId);
    }
    if (call.name === "request_user_input") {
      return await this.requestUserInput(call, controller, run, threadId, messageId);
    }
    const isImageTool = isImageGenerationToolName(call.name);
    if (isImageTool) {
      this.emit({ type: "image.started", image: imageStartEvent(call, threadId, messageId) });
    }
    const result = await this.tools.execute(call, {
      workspaceId: this.store.getThread(threadId)?.workspaceId || "",
      workspaceRoot,
      signal: controller.signal,
      browserExternalApproved,
      permissionMode,
      computerUseEnabled,
      cliproxyBaseUrl: this.store.getSettings().cliproxyBaseUrl,
      geminiApiKey: this.store.getSecret("gemini_api_key"),
      onCommandOutput: (callId, delta) => {
        markRunProgress(run);
        this.queueToolOutput(threadId, messageId, call, callId, delta);
      },
      onTerminalProcessStarted: (processId) => this.trackThreadProcess(threadId, processId),
      onTerminalProcessEnded: (processId) => this.untrackThreadProcess(threadId, processId),
    });
    if (isImageTool) {
      const completedImages = result.success
        ? imageCompletedEventsFromResult(call, result, threadId, messageId)
        : [];
      if (completedImages.length > 0) {
        completedImages.forEach((image) => this.emit({ type: "image.completed", image }));
      } else {
        this.emit({ type: "image.failed", image: imageFailedEvent(call, {
          error: result.error || (result.success ? "Image generation did not return a saved image." : undefined),
        }, threadId, messageId) });
      }
    }
    this.flushToolOutput(call.id);
    this.emitRun(run);
    return result;
  }

  private async executeSubagentTool(
    call: DesktopToolCall,
    workspaceRoot: string,
    controller: AbortController,
    run: AgentRunTracker,
    parentThreadId: string,
    parentMessageId: string,
  ): Promise<ToolResult> {
    return this.subagents.execute(call, {
      workspaceRoot,
      parentThreadId,
      parentMessageId,
      parentRun: run,
      signal: controller.signal,
    });
  }

  private async requestUserInput(
    call: DesktopToolCall,
    controller: AbortController,
    run: AgentRunTracker,
    threadId: string,
    messageId: string,
  ): Promise<ToolResult> {
    const settings = this.store.getSettings();
    const thread = this.store.getThread(threadId);
    return this.userInput.request({
      call,
      controller,
      run,
      threadId,
      messageId,
      isPlanMode: (run.collaborationMode || thread?.collaborationMode || settings.collaborationMode) === "plan",
    });
  }

  private trackThreadProcess(threadId: string, processId: number) {
    this.tools.trackProcess(threadId, processId);
  }

  private untrackThreadProcess(threadId: string, processId: number) {
    this.tools.untrackProcess(threadId, processId);
  }

  private untrackTerminalSession(sessionId: number) {
    this.tools.untrackTerminalSession(sessionId);
  }

  private stopThreadProcesses(threadId: string) {
    this.tools.stopThreadProcesses(threadId);
  }

  private cancelPendingApprovalsForThread(threadId: string, reason: string) {
    const bundles = Array.from(new Set(
      this.approvals.bundlesForThread(threadId),
    ));
    for (const bundle of bundles) {
      bundle.run.controller.abort();
      const checkpoint = this.recovery.checkpoint(threadId);
      let history = checkpoint?.history as ProviderMessage[] || bundle.history;
      const stoppedEvents: ToolEventRecord[] = [];
      bundle.calls.filter((call) => this.approvals.get(call.id) === bundle).forEach((call) => {
        this.approvals.removeCall(call.id);
        const event = this.updateToolEvent(bundle.threadId, bundle.assistantMessageId, call, {
          status: "stopped",
          result: { success: false, error: reason },
          output: reason,
          endedAt: now(),
        }, false);
        stoppedEvents.push(event);
        history = appendToolResults(history, [{
          id: call.id,
          name: call.name,
          response: { success: false, error: reason, data: { interrupted: true } },
        }]);
      });
      const message = this.store.getMessage(bundle.assistantMessageId);
      if (message && message.status !== "completed" && message.status !== "failed" && message.status !== "stopped") {
        const stoppedMessage = {
          ...message,
          content: bundle.assistantText || reason,
          thought: bundle.assistantThought,
          status: "stopped" as const,
          updatedAt: now(),
        };
        if (checkpoint) {
          this.store.commitRecoveryState(stoppedEvents, { ...checkpoint, history }, stoppedMessage);
        } else {
          stoppedEvents.forEach((event) => this.store.upsertToolEvent(event));
          this.store.upsertMessage(stoppedMessage);
        }
        stoppedEvents.forEach((event) => this.emit({ type: "tool.upserted", tool: event }));
        this.emit({ type: "message.upserted", message: stoppedMessage });
      }
    }
  }

  private createRun(threadId: string, assistantMessageId: string, controller: AbortController): AgentRunTracker {
    const timestamp = now();
    return {
      threadId,
      assistantMessageId,
      controller,
      phase: "sampling",
      startedAt: timestamp,
      updatedAt: timestamp,
      iteration: 0,
      toolCount: 0,
      lastProgressAt: timestamp,
      recoveryAttempts: 0,
    };
  }

  private startSubagentTurn(agent: SubagentRecord, workspaceRoot: string, prompt: string, role?: SubagentRoleConfig, forkTurns = "all") {
    const timestamp = now();
    const userMessage: ChatMessageRecord = {
      id: crypto.randomUUID(),
      threadId: agent.threadId,
      role: "user",
      content: prompt,
      status: "completed",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const assistantMessage: ChatMessageRecord = {
      id: crypto.randomUUID(),
      threadId: agent.threadId,
      role: "assistant",
      content: "",
      textParts: [],
      thought: "",
      thoughtParts: [],
      status: "running",
      createdAt: timestamp + 1,
      updatedAt: timestamp + 1,
    };
    this.store.upsertMessage(userMessage);
    this.store.upsertMessage(assistantMessage);
    this.store.updateSubagent(agent.threadId, { status: "running", lastPreview: compactPreview(prompt, 180) });
    this.runSubagentLoop(agent, workspaceRoot, assistantMessage, role, forkTurns);
  }

  private startExistingSubagentTurn(agent: SubagentRecord, workspaceRoot: string) {
    if (this.activeRuns.has(agent.threadId)) return;
    const timestamp = now();
    const latestUserMessage = this.store.findLatestMessage(agent.threadId, "user");
    const assistantMessage: ChatMessageRecord = {
      id: crypto.randomUUID(),
      threadId: agent.threadId,
      role: "assistant",
      content: "",
      textParts: [],
      thought: "",
      thoughtParts: [],
      status: "running",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.store.upsertMessage(assistantMessage);
    this.store.updateSubagent(agent.threadId, {
      status: "running",
      lastPreview: latestUserMessage ? compactPreview(latestUserMessage.content, 180) : agent.lastPreview,
    });
    const roles = loadSubagentRoles(workspaceRoot);
    const role = agent.agentRole ? roles.get(agent.agentRole) : undefined;
    this.runSubagentLoop(agent, workspaceRoot, assistantMessage, role, "all");
  }

  private runSubagentLoop(
    agent: SubagentRecord,
    workspaceRoot: string,
    assistantMessage: ChatMessageRecord,
    role?: SubagentRoleConfig,
    forkTurns = "all",
  ) {
    const controller = new AbortController();
    const run = this.createRun(agent.threadId, assistantMessage.id, controller);
    this.activeRuns.set(agent.threadId, run);
    this.emitRun(run);
    const inheritedModel = resolveSubagentModel(this.store, agent);
    const subagentBudget = resolveModelRuntimeBudget(inheritedModel, "normal");
    const history = [
      subagentInstructionMessage(agent, role, forkTurns),
      ...buildForkedParentHistory(this.store, agent, forkTurns),
      ...buildProviderHistory(this.store, agent.threadId, assistantMessage.id, subagentBudget.messageCharLimit),
    ];
    void this.continueLoop({
      threadId: agent.threadId,
      assistantMessage,
      workspaceRoot,
      history,
      assistantText: "",
      assistantThought: "",
      controller,
      iteration: 0,
      toolCount: 0,
      recoveryAttempts: 0,
      parentThreadId: agent.parentThreadId,
      model: inheritedModel,
      reasoningEffort: agent.reasoningEffort,
      readOnlyTools: agent.taskName.startsWith("review_swarm_"),
    }).catch((error) => {
      this.store.updateSubagent(agent.threadId, {
        status: "failed",
        finalMessage: errorMessage(error),
        lastPreview: errorMessage(error),
      });
      this.emitSnapshot();
    });
  }

  private appendSubagentUserMessage(threadId: string, message: string) {
    const timestamp = now();
    this.store.upsertMessage({
      id: crypto.randomUUID(),
      threadId,
      role: "user",
      content: message,
      status: "completed",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  private saveCheckpoint(
    options: ContinueOptions,
    history: ProviderMessage[],
    assistantText: string,
    assistantThought: string,
    iteration: number,
    toolCount: number,
    recoveryAttempts: number,
    run: AgentRunTracker,
  ) {
    this.recovery.save({
      version: 1,
      threadId: options.threadId,
      assistantMessageId: options.assistantMessage.id,
      workspaceRoot: options.workspaceRoot,
      history,
      assistantText,
      assistantThought,
      iteration,
      toolCount,
      recoveryAttempts,
      model: options.model,
      reasoningEffort: options.reasoningEffort,
      collaborationMode: options.collaborationMode,
      agentHarnessMode: options.agentHarnessMode,
      lastProgressAt: run.lastProgressAt,
      updatedAt: now(),
    });
  }

  private updateAssistant(message: ChatMessageRecord, content: string, thought: string, status: ChatMessageRecord["status"]) {
    message.content = content;
    message.thought = thought;
    message.status = status;
    message.updatedAt = now();
    this.store.upsertMessage(message);
    this.emit({ type: "message.upserted", message });
  }

  private ensureFallbackThreadTitle(threadId: string) {
    const thread = this.store.getThread(threadId);
    if (!thread || !isPlaceholderThreadTitle(thread)) return;
    const firstUserMessage = this.store.findFirstMessage(threadId, "user");
    const fallbackTitle = firstUserMessage ? fallbackThreadTitle(firstUserMessage.content) : "";
    if (!fallbackTitle) return;
    const updated = this.store.updatePlaceholderThreadTitle(threadId, fallbackTitle, "fallback");
    if (updated) this.emitSnapshot();
  }

  private updateToolEvent(
    threadId: string,
    messageId: string,
    call: DesktopToolCall,
    patch: Partial<ToolEventRecord>,
    persist = true,
  ) {
    const existing = this.findExistingToolEvent(threadId, call, patch.status);
    const timestamp = now();
    const output = patch.output ?? existing?.output;
    const diff = patch.diff ?? existing?.diff;
    const resultDiffFiles = (patch.result as ToolResult & { diffFiles?: ToolDiffFileRecord[] } | undefined)?.diffFiles;
    const hasNewDiffFiles = Boolean(patch.diffFiles || resultDiffFiles);
    const diffFiles = patch.diffFiles ?? resultDiffFiles ?? existing?.diffFiles ?? parseUnifiedDiffFiles(diff);
    const computedDiffStats = diffStatsFromFiles(diffFiles) || diffStats(diff);
    const computedActivities = activityItemsForTool(call, diff, diffFiles);
    const terminal = terminalMeta(call, patch.result ?? existing?.result);
    const event: ToolEventRecord = {
      id: existing?.id || crypto.randomUUID(),
      threadId,
      messageId,
      callId: call.id,
      name: call.name,
      title: patch.title || existing?.title || titleForTool(call),
      category: patch.category || existing?.category || categoryForTool(call),
      liveStatus: patch.liveStatus ?? liveStatusForTool(call, patch.status || existing?.status || "preparing"),
      textOffset: patch.textOffset ?? existing?.textOffset,
      streamOrder: existing?.streamOrder ?? this.nextActivityOrder(),
      status: patch.status || existing?.status || "preparing",
      risk: patch.risk || existing?.risk || "safe",
      args: call.arguments,
      result: patch.result ?? existing?.result,
      output,
      diff,
      diffFiles,
      diffStats: patch.diffStats || (hasNewDiffFiles ? computedDiffStats : existing?.diffStats || computedDiffStats),
      activities: patch.activities || (hasNewDiffFiles ? computedActivities : existing?.activities || computedActivities),
      terminal: patch.terminal ?? (patch.result ? terminal : existing?.terminal ?? terminal),
      preview: patch.preview ?? existing?.preview ?? previewForTool(call, output, diff),
      approvalGroupId: patch.approvalGroupId ?? existing?.approvalGroupId,
      approvalReason: patch.approvalReason ?? existing?.approvalReason,
      startedAt: patch.startedAt ?? existing?.startedAt,
      endedAt: patch.endedAt ?? existing?.endedAt,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    return persist ? this.store.upsertToolEvent(event) : event;
  }

  private closeDanglingDraftTools(threadId: string, messageId: string, activeCallIds: Set<string>) {
    this.store.listActiveDraftToolEvents(threadId, messageId)
      .filter((event) => !activeCallIds.has(event.callId))
      .forEach((event) => {
        const call: DesktopToolCall = {
          id: event.callId,
          name: event.name as DesktopToolCall["name"],
          arguments: event.args,
        };
        const closed = this.updateToolEvent(threadId, messageId, call, {
          status: "done",
          liveStatus: undefined,
          result: event.result || { success: true },
          endedAt: now(),
        });
        this.emit({ type: "tool.upserted", tool: closed });
      });
  }

  private nextActivityOrder() {
    this.activitySequence += 1;
    return this.activitySequence;
  }

  private appendToolOutput(threadId: string, messageId: string, call: DesktopToolCall, callId: string, delta: string) {
    const existing = this.store.findToolEventByCall(threadId, callId);
    if (!existing) return null;
    const output = compactLiveOutput(`${existing.output || ""}${delta}`);
    return this.updateToolEvent(threadId, messageId, call, {
      status: existing.status === "preparing" ? "running" : existing.status,
      output,
      liveStatus: liveStatusFromOutput(output) || existing.liveStatus,
      startedAt: existing.startedAt || now(),
    });
  }

  private queueToolOutput(threadId: string, messageId: string, call: DesktopToolCall, callId: string, delta: string) {
    const pending = this.pendingToolOutput.get(callId) || {
      threadId,
      messageId,
      call,
      delta: "",
      timer: null,
    };
    pending.delta = compactLiveOutput(`${pending.delta}${delta}`);
    this.pendingToolOutput.set(callId, pending);

    if (pending.delta.length >= TOOL_OUTPUT_FORCE_FLUSH_CHARS) {
      this.flushToolOutput(callId);
      return;
    }
    if (pending.timer) return;
    pending.timer = setTimeout(() => this.flushToolOutput(callId), TOOL_OUTPUT_FLUSH_MS);
    pending.timer.unref?.();
  }

  private flushToolOutput(callId: string) {
    const pending = this.pendingToolOutput.get(callId);
    if (!pending) return;
    if (pending.timer) {
      clearTimeout(pending.timer);
      pending.timer = null;
    }
    const delta = pending.delta;
    this.pendingToolOutput.delete(callId);
    if (!delta) return;
    const event = this.appendToolOutput(pending.threadId, pending.messageId, pending.call, callId, delta);
    if (event) this.emit({ type: "tool.upserted", tool: event });
  }

  private flushThreadToolOutputs(threadId: string) {
    Array.from(this.pendingToolOutput.entries())
      .filter(([, pending]) => pending.threadId === threadId)
      .forEach(([callId]) => this.flushToolOutput(callId));
  }

  private findExistingToolEvent(threadId: string, call: DesktopToolCall, nextStatus?: ToolEventRecord["status"]) {
    const direct = this.store.findToolEventByCall(threadId, call.id, call.name);
    if (direct) return direct;
    if (nextStatus === "preparing") return undefined;
    return this.store.listPreparingToolEvents(threadId, call.name)
      .find((event) =>
        event.callId.startsWith("draft_") &&
        this.isDraftForCall(event.args, call.arguments, call.name)
      );
  }

  private isDraftForCall(draftArgs: Record<string, unknown>, finalArgs: Record<string, unknown>, toolName: string) {
    if (toolName === "desktop_write_file") {
      const draftPath = String(draftArgs.path || "").trim();
      return Boolean(draftPath && draftPath === String(finalArgs.path || "").trim());
    }
    if (toolName === "desktop_edit_file") {
      const draftPath = String(draftArgs.path || "").trim();
      return Boolean(draftPath && draftPath === String(finalArgs.path || "").trim());
    }
    if (toolName === "desktop_apply_patch") {
      const draftTarget = patchTargetLabel(String(draftArgs.patch || ""));
      const finalTarget = patchTargetLabel(String(finalArgs.patch || ""));
      return Boolean(draftTarget && draftTarget !== "files" && draftTarget === finalTarget);
    }
    if (toolName === "desktop_delete_path") {
      const draftPath = String(draftArgs.path || "").trim();
      return Boolean(draftPath && draftPath === String(finalArgs.path || "").trim());
    }
    if (toolName === "desktop_rename_path") {
      const draftFrom = String(draftArgs.fromPath || "").trim();
      const draftTo = String(draftArgs.toPath || "").trim();
      return Boolean(
        draftFrom &&
        draftFrom === String(finalArgs.fromPath || "").trim() &&
        (!draftTo || draftTo === String(finalArgs.toPath || "").trim()),
      );
    }
    const entries = Object.entries(draftArgs).filter(([, value]) => value !== undefined && value !== "");
    if (entries.length === 0) return false;
    return entries.every(([key, value]) => String(finalArgs[key] ?? "") === String(value));
  }

  private stableArgsKey(value: unknown) {
    return JSON.stringify(sortObject(value)).slice(0, 180);
  }

  private emitRun(run: AgentRunTracker) {
    this.emit({ type: "turn.status_changed", threadId: run.threadId, run: toActiveRunState(run) });
  }

  private emitContextUsage(
    threadId: string,
    modelId: string,
    history: ProviderMessage[],
    runtimeBudget: ReturnType<typeof resolveModelRuntimeBudget>,
    lastUsage: TokenUsageRecord | null,
    totalUsage: TokenUsageRecord | null,
  ) {
    this.emit({
      type: "context.usage_updated",
      usage: calculateContextUsage({
        threadId,
        modelId,
        history,
        budget: runtimeBudget,
        lastUsage,
        totalUsage,
      }),
    });
  }

  private emit(event: PrivoraEventPayload) {
    this.events.emit(event);
  }

  private finalizeStoppedRun(options: Pick<ContinueOptions, "threadId" | "assistantMessage" | "assistantText" | "assistantThought">) {
    const text = options.assistantText || options.assistantMessage.content || "Stopped. Completed tool changes were kept.";
    this.updateAssistant(options.assistantMessage, text, options.assistantThought, "stopped");
    this.activeRuns.delete(options.threadId);
    this.emit({ type: "turn.stopped", threadId: options.threadId, turnId: options.assistantMessage.id, message: options.assistantMessage });
    this.emit({ type: "turn.status_changed", threadId: options.threadId, run: this.getActiveRun(options.threadId) });
  }

  private emitSnapshot() {
    const snapshot = this.projection.snapshot();
    this.emit({ type: "snapshot.updated", snapshot });
  }
}

