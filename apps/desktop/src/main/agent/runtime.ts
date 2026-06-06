import type { BrowserWindow } from "electron";
import type { DesktopStore } from "../db/store";
import { isPlaceholderThreadTitle } from "../db/store";
import { getModelOption, getProviderForModel, resolveModelRuntimeBudget, type CollaborationMode, type ReasoningEffort } from "../../shared/models";
import type {
  ApprovalDecisionInput,
  ApprovalDecisionScope,
  ApprovalScopeRecord,
  AssistantThoughtPartRecord,
  ChatMessageRecord,
  CompactionCheckpointRecord,
  ContextCompactionReason,
  ContextCompactionTrigger,
  DesktopEvent,
  DesktopToolCall,
  RequestUserInputQuestionRecord,
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
import { streamProviderResponse } from "./providers";
import { DesktopToolOrchestrator } from "./tools/orchestrator";
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
import { normalizeApprovalDecisions, approvalScopeBounds, scopeLabel, type ApprovalDecision } from "./runtime/approvals";
import { runtimeBudgetModeForHistory, runtimeBudgetModeForTurn } from "./runtime/budget";
import { addTokenUsage, autoCompactTargetTokens, calculateContextUsage, shouldAutoCompactHistory } from "./runtime/contextUsage";
import { StreamStalledError, delay, errorMessage, windowlessInterval } from "./runtime/errors";
import { historyHasRecentToolResults, resolveNoToolOutcome } from "./runtime/recovery";
import { ToolExecutionScheduler } from "./runtime/scheduler";
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
} from "./runtime/subagentRuntime";
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
} from "./runtime/toolActivity";
import {
  buildVisibleFingerprints,
  createThreadTitleFilterState,
  fallbackThreadTitle,
  filterThreadTitleDelta,
  filterVisibleDelta,
  markAssistantTextRangePhase,
  recordAssistantTextPart,
} from "./runtime/textParts";
import {
  normalizeRequestUserInputQuestions,
  planModeBlockReason,
  summarizeUserInputAnswers,
} from "./runtime/userInput";

export { resolveNoToolOutcome } from "./runtime/recovery";
export { createThreadTitleFilterState, fallbackThreadTitle, filterThreadTitleDelta } from "./runtime/textParts";

const MAX_CONTINUOUS_MODEL_ITERATIONS = 512;
const MAX_TOOL_CALLS = 500;
const MAX_LIVE_SUBAGENTS_PER_PARENT = 3;
const MAX_LIVE_SUBAGENTS_PER_TREE = 6;
const STREAM_STALL_TIMEOUT_MS = 45_000;
const POST_TOOL_RESULT_STALL_TIMEOUT_MS = 75_000;
const MAX_STALL_RECOVERY_ATTEMPTS = 2;
const TOOL_OUTPUT_FLUSH_MS = 120;
const TOOL_OUTPUT_FORCE_FLUSH_CHARS = 24_000;

const now = () => Date.now();

const isAutoApprovedRiskyBrowserTool = (
  call: DesktopToolCall,
  decision: ReturnType<DesktopToolOrchestrator["assess"]>,
) =>
  call.name.startsWith("browser_") &&
  decision.risk === "risky" &&
  !decision.requiresApproval;

interface ApprovalBundle {
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
}

interface PendingUserInput {
  threadId: string;
  assistantMessageId: string;
  call: DesktopToolCall;
  questions: RequestUserInputQuestionRecord[];
  run: AgentRunTracker;
  cleanup?: () => void;
  resolve: (result: ToolResult) => void;
}

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
}

export class AgentRuntime {
  private tools: DesktopToolOrchestrator;
  private activeRuns = new Map<string, AgentRunTracker>();
  private pendingApprovalByCallId = new Map<string, ApprovalBundle>();
  private pendingUserInputByCallId = new Map<string, PendingUserInput>();
  private startingThreads = new Set<string>();
  private processIdsByThread = new Map<string, Set<number>>();
  private eventSequence = 0;
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
    this.tools = new DesktopToolOrchestrator(browserManager, notesStore, computerUseManager);
  }

  getActiveRun(threadId: string) {
    const run = this.activeRuns.get(threadId);
    if (run) return toActiveRunState(run);

    const pending = Array.from(this.pendingApprovalByCallId.values()).find((item) => item.threadId === threadId);
    if (pending) return toActiveRunState(pending.run);
    const pendingInput = Array.from(this.pendingUserInputByCallId.values()).find((item) => item.threadId === threadId);
    const pendingInputRun = pendingInput ? this.activeRuns.get(threadId) : null;
    if (pendingInputRun) return toActiveRunState(pendingInputRun);

    const checkpoint = this.store.getRunCheckpoint(threadId);
    if (!checkpoint) return null;
    const message = this.store.getMessage(checkpoint.assistantMessageId);
    if (!message || (message.status !== "stalled" && message.status !== "stopped")) return null;
    return {
      threadId,
      assistantMessageId: checkpoint.assistantMessageId,
      phase: message.status,
      status: message.status,
      updatedAt: checkpoint.updatedAt,
      iteration: checkpoint.iteration,
      toolCount: checkpoint.toolCount,
      reason: message.status === "stalled" ? "The model connection stalled." : "Stopped. Completed tool changes were kept.",
      resumable: true,
    };
  }

  listActiveRuns() {
    const runs = new Map<string, ReturnType<typeof toActiveRunState>>();
    this.activeRuns.forEach((run, threadId) => runs.set(threadId, toActiveRunState(run)));
    this.pendingApprovalByCallId.forEach((bundle) => {
      if (!runs.has(bundle.threadId)) runs.set(bundle.threadId, toActiveRunState(bundle.run));
    });
    return Array.from(runs.values());
  }

  async startTurn(input: StartTurnInput) {
    if (this.startingThreads.has(input.threadId) || this.isThreadBusy(input.threadId)) {
      throw new Error("This chat is already running. Stop it before starting another turn.");
    }
    this.startingThreads.add(input.threadId);
    const thread = this.store.getThread(input.threadId);
    try {
      if (!thread) throw new Error("Thread not found.");
      const workspace = this.store.getWorkspace(thread.workspaceId);
      if (!workspace) throw new Error("Select a workspace before starting the desktop agent.");
      const settings = this.store.getSettings();
      const effectiveModel = getModelOption(thread.model || settings.model).id;
      const selectedModel = getModelOption(effectiveModel);
      const imageAttachmentCount = (input.attachments || []).filter((attachment) => attachment.mimeType.startsWith("image/")).length;
      if (imageAttachmentCount > 0 && !selectedModel.supportsImageInput) {
        throw new Error(`${selectedModel.label} does not support image input. Remove the image ${imageAttachmentCount === 1 ? "or switch" : "attachments or switch"} to a vision-capable model.`);
      }
      const budgetMode = runtimeBudgetModeForTurn(input);
      const runtimeBudget = resolveModelRuntimeBudget(effectiveModel, budgetMode);

      this.store.clearRunCheckpoint(input.threadId);
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

      const priorMessages = buildProviderHistoryWithCompaction(this.store, input.threadId, assistantMessage.id, runtimeBudget.messageCharLimit);
      const mentionContext = await buildMentionContext(this.store, input.threadId, workspace.path, input.contextMentions || []);
      const history = mentionContext
        ? [...priorMessages, textProviderMessage(mentionContext)]
        : priorMessages;

      const controller = new AbortController();
      const run = this.createRun(input.threadId, assistantMessage.id, controller);
      this.activeRuns.set(input.threadId, run);
      this.emitRun(run);

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
      });
    } finally {
      this.startingThreads.delete(input.threadId);
    }
  }

  async continueRun(threadId: string) {
    if (this.isThreadBusy(threadId)) return;
    const checkpoint = this.store.getRunCheckpoint(threadId);
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
    });
  }

  private isThreadBusy(threadId: string) {
    if (this.activeRuns.has(threadId)) return true;
    if (this.startingThreads.has(threadId)) return true;
    if (Array.from(this.pendingApprovalByCallId.values()).some((item) => item.threadId === threadId)) return true;
    if (Array.from(this.pendingUserInputByCallId.values()).some((item) => item.threadId === threadId)) return true;
    return false;
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
    this.flushThreadToolOutputs(threadId);
    const approvals = Array.from(new Set(Array.from(this.pendingApprovalByCallId.values()).filter((item) => item.threadId === threadId)));
    approvals.forEach((bundle) => {
      bundle.run.controller.abort();
      bundle.calls.forEach((call) => {
        this.pendingApprovalByCallId.delete(call.id);
        const event = this.updateToolEvent(bundle.threadId, bundle.assistantMessageId, call, {
          status: "stopped",
          result: { success: false, error: "Stopped before approval." },
          endedAt: now(),
        });
        this.emit({ type: "tool_updated", tool: event });
      });
      const message = this.store.getMessage(bundle.assistantMessageId);
      if (message) {
        const assistantText = bundle.assistantText || "Stopped. Completed tool changes were kept.";
        if (!bundle.assistantText) recordAssistantTextPart(message, "final_answer", 0, assistantText.length);
        this.updateAssistant(message, assistantText, bundle.assistantThought, "stopped");
      }
    });
    this.cancelPendingApprovalsForThread(threadId, "Stopped before approval.");
    Array.from(this.pendingUserInputByCallId.values())
      .filter((item) => item.threadId === threadId)
      .forEach((item) => this.resolvePendingUserInput(item.call.id, {
        success: false,
        error: "Stopped before user input was answered.",
        data: { answers: {}, interrupted: true },
      }));
    this.emit({ type: "run_state", threadId, run: run ? toActiveRunState(run) : this.getActiveRun(threadId) });
  }

  async answerRequestUserInput(input: RequestUserInputResponseInput) {
    const pending = this.pendingUserInputByCallId.get(input.callId);
    if (!pending || pending.threadId !== input.threadId) return;
    markRunProgress(pending.run);
    this.resolvePendingUserInput(input.callId, {
      success: true,
      output: JSON.stringify({ answers: input.answers }, null, 2),
      data: {
        answers: input.answers,
        summary: summarizeUserInputAnswers(input.answers),
      },
    });
  }

  async decideApproval(input: ApprovalDecisionInput) {
    const decisions = normalizeApprovalDecisions(input);
    if (decisions.length === 0) return;
    const bundles = new Set<ApprovalBundle>();
    decisions.forEach((decision) => {
      const bundle = this.pendingApprovalByCallId.get(decision.callId);
      if (!bundle) return;
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
        this.emit({ type: "tool_updated", tool: event });
      }
    });

    for (const bundle of bundles) {
      if (!bundle.calls.every((call) => bundle.decisions.has(call.id))) {
        this.emitRun(bundle.run);
        continue;
      }
      await this.resolveApprovalBundle(bundle);
    }
  }

  private async continueLoop(options: ContinueOptions) {
    const settings = this.store.getSettings();
    this.tools.setComputerUseEnabled(settings.computerUseEnabled);
    const thread = this.store.getThread(options.threadId);
    const effectiveModel = getModelOption(options.model || thread?.model || settings.model).id;
    const effectiveReasoning = options.reasoningEffort || thread?.reasoningEffort || settings.reasoningEffort;
    const effectiveCollaborationMode = thread?.collaborationMode || settings.collaborationMode;
    const runtimeBudget = resolveModelRuntimeBudget(effectiveModel, runtimeBudgetModeForHistory(options.history));
    let history = sanitizeProviderHistoryForModel(options.history, effectiveModel);
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

    try {
      let continuousIterations = 0;
      let lastCompactionAttemptTokens = 0;
      while (!controller.signal.aborted && continuousIterations < MAX_CONTINUOUS_MODEL_ITERATIONS && toolCount < MAX_TOOL_CALLS) {
        continuousIterations += 1;
        iteration += 1;
        const estimatedHistoryTokens = estimateProviderHistoryTokens(history);
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
          history = sanitizeProviderHistoryForModel(compacted.history, effectiveModel);
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
              const event = this.updateToolEvent(options.threadId, options.assistantMessage.id, scheduledCall, {
                status: result.success ? "done" : "failed",
                result,
                output: result.output || result.error,
                diff: (result as ToolResult & { diff?: string }).diff,
                diffFiles: (result as ToolResult & { diffFiles?: ToolDiffFileRecord[] }).diffFiles,
                endedAt: now(),
              });
              this.emit({ type: "tool_updated", tool: event });
              return { call: scheduledCall, result, response: compactToolResultForModel(result, runtimeBudget) };
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
              this.emit({ type: "tool_updated", tool: event });
              return { call: scheduledCall, result, response: compactToolResultForModel(result, runtimeBudget) };
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
          await streamProviderResponse({
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
            onTextDelta: (delta) => {
              const titleFiltered = filterThreadTitleDelta(delta, titleFilter, (title) => {
                const updated = this.store.updatePlaceholderThreadTitle(options.threadId, title, "agent");
                if (updated) this.emitSnapshot();
              });
              const filtered = filterVisibleDelta(assistantText, titleFiltered, visibleFingerprints);
              if (!filtered) return;
              const startOffset = assistantText.length;
              assistantText += filtered;
              recordAssistantTextPart(options.assistantMessage, "commentary", startOffset, assistantText.length);
              markRunProgress(run);
              flushAssistant("running");
              this.emitRun(run);
            },
            onThoughtDelta: (delta) => {
              const thoughtPart = ensureThoughtPart();
              assistantThought += delta;
              thoughtPart.updatedAt = now();
              markRunProgress(run);
              flushAssistant("running");
              this.emitRun(run);
            },
            onToolDraft: (draft) => {
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
              this.emit({ type: "tool_updated", tool: event });
            },
            onToolCall: (call) => {
              endThoughtPart();
              markRunProgress(run);
              calls.push(call);
              const decision = this.tools.assess(call, settings.permissionMode, thread?.workspaceId);
              const planBlock = planModeBlockReason(call, effectiveCollaborationMode, decision);
              const scope = decision.requiresApproval
                ? this.findReusableApprovalScope(options.threadId, call)
                : null;
              if (scope) {
                this.store.markApprovalScopeUsed(scope.id);
                this.recordApprovalHistory({
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
              this.emit({ type: "tool_updated", tool: event });
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
                this.emit({ type: "ai_credit_summary_updated", summary: creditEvent.summary });
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
              this.emit({ type: "tool_updated", tool: event });
            },
            onTextReplace: (text) => {
              endThoughtPart();
              const previousIterationText = assistantText.slice(textStart);
              if (text === previousIterationText) return;
              const previousParts = options.assistantMessage.textParts || [];
              assistantText = `${assistantText.slice(0, textStart)}${text}`;
              options.assistantMessage.textParts = previousParts.filter((part) => part.endOffset <= textStart);
              recordAssistantTextPart(options.assistantMessage, "commentary", textStart, assistantText.length);
              markRunProgress(run);
              flushAssistant("running", true);
              this.emitRun(run);
            },
            onWebSearch: (search) => {
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
              this.emit({ type: "tool_updated", tool: event });
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
          this.store.clearRunCheckpoint(options.threadId);
          this.activeRuns.delete(options.threadId);
          this.markSubagentFinished(options.threadId, "completed", assistantText);
          this.emit({ type: "run_state", threadId: options.threadId, run: null });
          return;
        }

        history = appendAssistantToolCalls(history, assistantText.slice(textStart), calls);
        this.saveCheckpoint(options, history, assistantText, assistantThought, iteration, toolCount, recoveryAttempts, run);

        const scheduledResults = await scheduler.drainOrdered();
        for (const item of scheduledResults) {
          toolCount += 1;
          run.toolCount = toolCount;
          this.saveCheckpoint(options, history, assistantText, assistantThought, iteration, toolCount, recoveryAttempts, run);
        }
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
      this.emitRun(run);
      if (!aborted) this.emit({ type: "toast", tone: "error", message: errorMessage(error) });
    } finally {
      if (assistantFlushTimer) {
        clearTimeout(assistantFlushTimer);
        assistantFlushTimer = null;
      }
      if (!handoff && this.activeRuns.get(options.threadId)?.assistantMessageId === options.assistantMessage.id) {
        this.activeRuns.delete(options.threadId);
        this.emit({ type: "run_state", threadId: options.threadId, run: this.getActiveRun(options.threadId) });
      }
    }
  }

  private async resolveApprovalBundle(bundle: ApprovalBundle) {
    bundle.calls.forEach((call) => this.pendingApprovalByCallId.delete(call.id));
    const runtimeBudget = resolveModelRuntimeBudget(bundle.model || this.store.getSettings().model, runtimeBudgetModeForHistory(bundle.history));
    const assistantMessage = this.store.getMessage(bundle.assistantMessageId);
    if (!assistantMessage) return;
    this.activeRuns.set(bundle.threadId, bundle.run);
    transitionRun(bundle.run, "sampling", { iteration: bundle.iteration, toolCount: bundle.toolCount });
    this.updateAssistant(assistantMessage, bundle.assistantText, bundle.assistantThought, "running");
    this.emitRun(bundle.run);

    const results: Array<{ id: string; name: string; response: ToolResult }> = [];
    let toolCount = bundle.toolCount;
    for (const call of bundle.calls) {
      const decision = bundle.decisions.get(call.id) || { approved: false, scope: "once" as const };
      const approved = decision.approved;
      let result: ToolResult;
      let scope: ApprovalScopeRecord | undefined;
      if (approved) {
        scope = this.createApprovalScope(bundle, call, decision.scope);
        this.recordApprovalHistory({
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
        this.emit({ type: "tool_updated", tool: event });
        result = await this.executeTool(call, bundle.workspaceRoot, bundle.run.controller, bundle.run, bundle.threadId, bundle.assistantMessageId, true);
        toolCount += 1;
      } else {
        this.recordApprovalHistory({
          threadId: bundle.threadId,
          messageId: bundle.assistantMessageId,
          call,
          approved: false,
          reason: "User cancelled this action.",
        });
        result = { success: false, error: "User cancelled this action." };
      }
      const finalToolEvent = this.updateToolEvent(bundle.threadId, bundle.assistantMessageId, call, {
        status: result.success ? "done" : approved ? "failed" : "cancelled",
        result,
        output: result.output || result.error,
        diff: (result as ToolResult & { diff?: string }).diff,
        diffFiles: (result as ToolResult & { diffFiles?: ToolDiffFileRecord[] }).diffFiles,
        endedAt: now(),
      });
      this.emit({ type: "tool_updated", tool: finalToolEvent });
      results.push({ id: call.id, name: call.name, response: compactToolResultForModel(result, runtimeBudget) });
    }

    await this.continueLoop({
      threadId: bundle.threadId,
      assistantMessage,
      workspaceRoot: bundle.workspaceRoot,
      history: appendToolResults(bundle.history, results),
      assistantText: bundle.assistantText,
      assistantThought: bundle.assistantThought,
      controller: bundle.run.controller,
      iteration: bundle.iteration,
      toolCount,
      recoveryAttempts: bundle.recoveryAttempts,
      model: bundle.model,
      reasoningEffort: bundle.reasoningEffort,
    });
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
    };
    params.calls.forEach((call) => {
      this.pendingApprovalByCallId.set(call.id, bundle);
      const event = this.updateToolEvent(params.options.threadId, params.options.assistantMessage.id, call, {
        status: "awaiting_approval",
        approvalGroupId: id,
      });
      this.emit({ type: "tool_updated", tool: event });
    });
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
    this.emit({ type: "tool_updated", tool: started });

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
    this.emit({ type: "tool_updated", tool: completed });

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
    await streamProviderResponse({
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
    const agent = this.store.getSubagentByThread(threadId);
    if (!agent) return;
    if (agent.status === "closed") {
      this.emitSnapshot();
      return;
    }
    const updated = this.store.updateSubagent(threadId, {
      status,
      finalMessage: text,
      lastPreview: compactPreview(text, 240),
    });
    if (status === "completed" && updated) {
      const latestUser = this.store.findLatestMessage(threadId, "user");
      const latestAssistant = this.store.findLatestMessage(threadId, "assistant");
      const workspace = updated.workspaceId ? this.store.getWorkspace(updated.workspaceId)?.path : undefined;
      if (latestUser && latestAssistant && latestUser.createdAt > latestAssistant.createdAt && workspace && !this.activeRuns.has(threadId)) {
        this.store.updateSubagent(threadId, { status: "pending" });
        this.startExistingSubagentTurn(updated, workspace);
      }
    }
    this.emitSnapshot();
  }

  private findReusableApprovalScope(threadId: string, call: DesktopToolCall) {
    const thread = this.store.getThread(threadId);
    const scopes = this.store.listApprovalScopes(thread?.workspaceId ?? null, threadId);
    return findMatchingApprovalScope(call, scopes);
  }

  private createApprovalScope(
    bundle: ApprovalBundle,
    call: DesktopToolCall,
    decisionScope: ApprovalDecisionScope,
  ): ApprovalScopeRecord | undefined {
    if (decisionScope === "once") return undefined;
    const thread = this.store.getThread(bundle.threadId);
    const timestamp = now();
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
        kind: "terminal_prefix",
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

  private recordApprovalHistory(input: {
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
      createdAt: now(),
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
    const result = await this.tools.execute(call, {
      workspaceId: this.store.getThread(threadId)?.workspaceId || "",
      workspaceRoot,
      signal: controller.signal,
      browserExternalApproved,
      permissionMode,
      computerUseEnabled,
      onCommandOutput: (callId, delta) => {
        markRunProgress(run);
        this.queueToolOutput(threadId, messageId, call, callId, delta);
      },
      onTerminalProcessStarted: (processId) => this.trackThreadProcess(threadId, processId),
      onTerminalProcessEnded: (processId) => this.untrackThreadProcess(threadId, processId),
    });
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
    switch (call.name) {
      case "spawn_agent":
        return this.spawnSubagent(call, workspaceRoot, parentThreadId, parentMessageId);
      case "send_message":
        return this.messageSubagent(call, parentThreadId, false);
      case "assign_task":
        return this.messageSubagent(call, parentThreadId, true, workspaceRoot);
      case "wait_agent":
        return this.waitForSubagents(call, parentThreadId, controller.signal);
      case "list_agents":
        return this.listSubagents(call, parentThreadId);
      case "close_agent":
        return this.closeSubagent(call, parentThreadId);
      default:
        return { success: false, error: `Unknown subagent tool ${call.name}` };
    }
  }

  private spawnSubagent(call: DesktopToolCall, workspaceRoot: string, parentThreadId: string, parentMessageId: string): ToolResult {
    const settings = this.store.getSettings();
    const taskName = normalizeTaskName(String(call.arguments.taskName || call.arguments.task_name || ""));
    const message = String(call.arguments.message || "").trim();
    if (!taskName) return { success: false, error: "taskName must use lowercase letters, digits, and underscores." };
    if (!message) return { success: false, error: "message is required." };
    const parentAgent = this.store.getSubagentByThread(parentThreadId);
    const rootThreadId = parentAgent?.parentThreadId || parentThreadId;
    const liveChildren = this.store.listDirectSubagents(parentThreadId).filter(isLiveSubagent);
    if (liveChildren.length >= MAX_LIVE_SUBAGENTS_PER_PARENT) {
      return { success: false, error: `Subagent limit reached: at most ${MAX_LIVE_SUBAGENTS_PER_PARENT} live child agents per parent.` };
    }
    const liveTreeAgents = this.store.listSubagents(rootThreadId).filter(isLiveSubagent);
    if (liveTreeAgents.length >= MAX_LIVE_SUBAGENTS_PER_TREE) {
      return { success: false, error: `Subagent limit reached: at most ${MAX_LIVE_SUBAGENTS_PER_TREE} live child agents per chat tree.` };
    }
    if (parentAgent && subagentDepth(parentAgent.agentPath) >= MAX_SUBAGENT_DEPTH) {
      return { success: false, error: `Subagent depth limit reached: max depth is ${MAX_SUBAGENT_DEPTH}.` };
    }
    if (this.store.findSubagent(parentThreadId, taskName)) return { success: false, error: `A subagent named ${taskName} already exists.` };

    const roles = loadSubagentRoles(workspaceRoot);
    const requestedRole = normalizeRoleName(String(call.arguments.agentType || call.arguments.agent_type || ""));
    const role = requestedRole ? roles.get(requestedRole) : undefined;
    if (requestedRole && !role) {
      return {
        success: false,
        error: `Unknown agentType ${requestedRole}.`,
        data: { availableRoles: Array.from(roles.keys()) },
      };
    }
    const forkTurns = normalizeForkTurns(call.arguments.forkTurns || call.arguments.fork_turns);
    if (!forkTurns.valid) {
      return { success: false, error: "forkTurns must be none, all, or a positive integer string." };
    }
    const usedNicknames = new Set(this.store.listDirectSubagents(parentThreadId).map((agent) => (agent.agentNickname || "").toLowerCase()).filter(Boolean));
    const nickname = pickSubagentNickname(role, usedNicknames, taskName);
    const thread = this.store.getThread(parentThreadId);
    const agent = this.store.createSubagent({
      parentThreadId,
      parentMessageId,
      workspaceId: thread?.workspaceId ?? null,
      taskName,
      agentPath: `${parentAgent?.agentPath || "/root"}/${taskName}`,
      agentRole: role?.name,
      agentNickname: nickname,
      prompt: message,
      model: typeof call.arguments.model === "string" ? call.arguments.model : role?.model || thread?.model || settings.model,
      reasoningEffort: parseReasoningEffort(call.arguments.reasoningEffort || call.arguments.reasoning_effort) || role?.reasoningEffort || thread?.reasoningEffort || settings.reasoningEffort,
    });
    this.startSubagentTurn(agent, workspaceRoot, message, role, forkTurns.value);
    this.emitSnapshot();
    return {
      success: true,
      output: `Spawned ${formatSubagentLabel(agent)}.`,
      data: subagentToolData(agent),
    };
  }

  private messageSubagent(call: DesktopToolCall, parentThreadId: string, triggerTurn: boolean, workspaceRoot?: string): ToolResult {
    const target = String(call.arguments.target || "").trim();
    const message = String(call.arguments.message || "").trim();
    if (!message) return { success: false, error: "message is required." };
    const agent = this.store.findSubagent(parentThreadId, target);
    if (!agent) return { success: false, error: `Subagent target not found: ${target}` };
    if (agent.status === "closed") return { success: false, error: `${formatSubagentLabel(agent)} is closed.` };
    this.appendSubagentUserMessage(agent.threadId, message);
    const alreadyRunning = this.activeRuns.has(agent.threadId);
    this.store.updateSubagent(agent.threadId, {
      status: triggerTurn && !alreadyRunning ? "pending" : agent.status,
      lastPreview: compactPreview(message, 180),
    });
    if (triggerTurn) {
      const workspace = workspaceRoot || this.store.getWorkspace(agent.workspaceId)?.path;
      if (!workspace) return { success: false, error: "Workspace not found for subagent." };
      if (!alreadyRunning) this.startExistingSubagentTurn(agent, workspace);
    }
    this.emitSnapshot();
    return {
      success: true,
      output: alreadyRunning && triggerTurn
        ? `Queued task for ${formatSubagentLabel(agent)}. It will run after the current child turn finishes.`
        : `${triggerTurn ? "Assigned task to" : "Sent message to"} ${formatSubagentLabel(agent)}.`,
      data: subagentToolData(agent),
    };
  }

  private async waitForSubagents(call: DesktopToolCall, parentThreadId: string, signal: AbortSignal): Promise<ToolResult> {
    const startedAt = Date.now();
    const timeoutMs = Math.max(0, Math.min(120_000, Number(call.arguments.timeoutMs || call.arguments.timeout_ms) || 30_000));
    const initialAgents = this.store.listSubagents(parentThreadId);
    const initialLiveAgents = initialAgents.filter(isLiveSubagent);
    if (initialLiveAgents.length === 0 && initialAgents.some((agent) => ["completed", "failed", "stopped", "closed"].includes(agent.status))) {
      return {
        success: true,
        output: subagentStatusSummary(initialAgents),
        data: { timed_out: false, timedOut: false, agents: initialAgents.map(subagentToolData) },
      };
    }
    while (!signal.aborted && Date.now() - startedAt < timeoutMs) {
      const agents = this.store.listSubagents(parentThreadId);
      if (agents.some((agent) => agent.updatedAt > startedAt && !["pending", "running", "waiting"].includes(agent.status))) {
        return {
          success: true,
          output: subagentStatusSummary(agents),
          data: { timed_out: false, timedOut: false, agents: agents.map(subagentToolData) },
        };
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

  private listSubagents(call: DesktopToolCall, parentThreadId: string): ToolResult {
    const prefix = String(call.arguments.pathPrefix || call.arguments.path_prefix || "").trim();
    const agents = this.store.listSubagents(parentThreadId)
      .filter((agent) => !prefix || agent.agentPath.startsWith(prefix));
    return {
      success: true,
      output: subagentStatusSummary(agents),
      data: { agents: agents.map(subagentToolData) },
    };
  }

  private closeSubagent(call: DesktopToolCall, parentThreadId: string): ToolResult {
    const target = String(call.arguments.target || "").trim();
    const agent = this.store.findSubagent(parentThreadId, target);
    if (!agent) return { success: false, error: `Subagent target not found: ${target}` };
    const descendants = this.store.listSubagents()
      .filter((candidate) => candidate.agentPath === agent.agentPath || candidate.agentPath.startsWith(`${agent.agentPath}/`));
    descendants.forEach((candidate) => {
      const childRun = this.activeRuns.get(candidate.threadId);
      childRun?.controller.abort();
      this.stopThreadProcesses(candidate.threadId);
      this.cancelPendingApprovalsForThread(candidate.threadId, "Closed before approval.");
      this.store.updateSubagent(candidate.threadId, {
        status: "closed",
        closedAt: now(),
        lastPreview: candidate.finalMessage || candidate.lastPreview || "Closed.",
      });
    });
    const updated = this.store.updateSubagent(agent.threadId, {
      status: "closed",
      closedAt: now(),
      lastPreview: agent.finalMessage || agent.lastPreview || "Closed.",
    }) || agent;
    this.emitSnapshot();
    return {
      success: true,
      output: `Closed ${formatSubagentLabel(updated)}.`,
      data: { ...subagentToolData(updated), previous_status: agent.status },
    };
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
    if ((thread?.collaborationMode || settings.collaborationMode) !== "plan") {
      return { success: false, error: "request_user_input is only available in Plan Mode." };
    }
    const normalized = normalizeRequestUserInputQuestions(call.arguments.questions);
    if (!normalized.success) return { success: false, error: normalized.error };

    transitionRun(run, "waiting_tool", {
      iteration: run.iteration,
      toolCount: run.toolCount,
      reason: "Waiting for your answer.",
      resumable: false,
    });
    this.emitRun(run);

    const result = await new Promise<ToolResult>((resolve) => {
      const pending: PendingUserInput = {
        threadId,
        assistantMessageId: messageId,
        call,
        questions: normalized.questions,
        run,
        resolve,
      };
      this.pendingUserInputByCallId.set(call.id, pending);
      const abort = () => {
        this.resolvePendingUserInput(call.id, {
          success: false,
          error: "Stopped before user input was answered.",
          data: { answers: {}, interrupted: true },
        });
      };
      controller.signal.addEventListener("abort", abort, { once: true });
      pending.cleanup = () => controller.signal.removeEventListener("abort", abort);
      this.emit({
        type: "request_user_input",
        request: {
          threadId,
          assistantMessageId: messageId,
          callId: call.id,
          questions: normalized.questions,
          createdAt: now(),
        },
      });
    });
    this.emitRun(run);
    return result;
  }

  private resolvePendingUserInput(callId: string, result: ToolResult) {
    const pending = this.pendingUserInputByCallId.get(callId);
    if (!pending) return;
    this.pendingUserInputByCallId.delete(callId);
    pending.cleanup?.();
    this.emit({ type: "request_user_input_resolved", threadId: pending.threadId, callId });
    pending.resolve(result);
  }

  private trackThreadProcess(threadId: string, processId: number) {
    const processes = this.processIdsByThread.get(threadId) || new Set<number>();
    processes.add(processId);
    this.processIdsByThread.set(threadId, processes);
  }

  private untrackThreadProcess(threadId: string, processId: number) {
    const processes = this.processIdsByThread.get(threadId);
    if (!processes) return;
    processes.delete(processId);
    if (processes.size === 0) this.processIdsByThread.delete(threadId);
  }

  private stopThreadProcesses(threadId: string) {
    const processes = this.processIdsByThread.get(threadId);
    if (!processes) return;
    this.processIdsByThread.delete(threadId);
    for (const processId of processes) {
      void this.tools.stopTerminalProcess(processId).catch(() => undefined);
    }
  }

  private cancelPendingApprovalsForThread(threadId: string, reason: string) {
    const bundles = Array.from(new Set(
      Array.from(this.pendingApprovalByCallId.values()).filter((bundle) => bundle.threadId === threadId),
    ));
    for (const bundle of bundles) {
      bundle.run.controller.abort();
      bundle.calls.forEach((call) => {
        this.pendingApprovalByCallId.delete(call.id);
        const event = this.updateToolEvent(bundle.threadId, bundle.assistantMessageId, call, {
          status: "stopped",
          result: { success: false, error: reason },
          output: reason,
          endedAt: now(),
        });
        this.emit({ type: "tool_updated", tool: event });
      });
      const message = this.store.getMessage(bundle.assistantMessageId);
      if (message && message.status === "awaiting_approval") {
        this.updateAssistant(message, bundle.assistantText || reason, bundle.assistantThought, "stopped");
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
    const subagentBudget = resolveModelRuntimeBudget(agent.model || this.store.getSettings().model, "normal");
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
      model: agent.model,
      reasoningEffort: agent.reasoningEffort,
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
    this.store.saveRunCheckpoint({
      threadId: options.threadId,
      assistantMessageId: options.assistantMessage.id,
      workspaceRoot: options.workspaceRoot,
      history,
      assistantText,
      assistantThought,
      iteration,
      toolCount,
      recoveryAttempts,
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
    this.emit({ type: "message_updated", message });
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
    return this.store.upsertToolEvent(event);
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
        this.emit({ type: "tool_updated", tool: closed });
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
    if (event) this.emit({ type: "tool_updated", tool: event });
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
    this.emit({ type: "run_state", threadId: run.threadId, run: toActiveRunState(run) });
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
      type: "context_usage_updated",
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

  private emit(event: DesktopEvent) {
    const window = this.getMainWindow();
    if (!window || window.isDestroyed()) return;
    const sequencedEvent: DesktopEvent = {
      ...event,
      sequence: ++this.eventSequence,
      emittedAt: now(),
    };
    window.webContents.send("desktop:event", sequencedEvent);
  }

  private emitSnapshot() {
    const { activeThreadId, activeWorkspaceId } = this.getActiveIds();
    const snapshot = this.store.snapshot(activeThreadId, activeWorkspaceId);
    snapshot.activeRun = activeThreadId ? this.getActiveRun(activeThreadId) : null;
    snapshot.activeRuns = this.listActiveRuns();
    this.emit({ type: "snapshot", snapshot });
  }
}

