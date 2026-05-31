import type { BrowserWindow } from "electron";
import type { DesktopStore } from "../db/store";
import { getModelOption, getProviderForModel } from "../../shared/models";
import type {
  ApprovalDecisionInput,
  ApprovalDecisionScope,
  ApprovalScopeRecord,
  AssistantTextPartRecord,
  AssistantTextPhase,
  AssistantThoughtPartRecord,
  ChatMessageRecord,
  DesktopEvent,
  DesktopToolCall,
  StartTurnInput,
  ToolDiffFileRecord,
  ToolEventRecord,
  ToolResult,
} from "../../shared/types";
import { buildDesktopSystemPrompt } from "./systemPrompt";
import { appendAssistantToolCalls, appendToolResults, type ProviderMessage } from "./providers/types";
import { streamProviderResponse } from "./providers";
import { DesktopToolOrchestrator } from "./tools/orchestrator";
import { buildProviderHistory, buildRuntimeContext, compactProviderHistory, compactToolResultForModel } from "./context";
import { buildMentionContext } from "./contextMentions";
import {
  markRunProgress,
  toActiveRunState,
  transitionRun,
  type AgentRunTracker,
} from "./runState";
import {
  activityItemsFromDiffFiles,
  diffStatsFromFiles,
  parseUnifiedDiffFiles,
} from "./tools/diffFormatter";
import { approvalCommandPrefix, approvalCwd, findMatchingApprovalScope } from "./tools/permissions";

const MAX_CONTINUOUS_MODEL_ITERATIONS = 512;
const MAX_TOOL_CALLS = 500;
const MAX_RECOVERY_NUDGES = 2;
const STREAM_STALL_TIMEOUT_MS = 45_000;
const REPEAT_FINGERPRINT_MIN_CHARS = 72;
const RECENT_VISIBLE_TEXT_CHARS = 5000;
const LIVE_OUTPUT_MAX_CHARS = 140_000;
const TOOL_OUTPUT_FLUSH_MS = 120;
const TOOL_OUTPUT_FORCE_FLUSH_CHARS = 24_000;

const now = () => Date.now();

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
}

interface ApprovalDecision {
  approved: boolean;
  scope: ApprovalDecisionScope;
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
}

interface ScheduledToolExecution {
  call: DesktopToolCall;
  promise: Promise<ScheduledToolResult>;
}

interface ScheduledToolResult {
  call: DesktopToolCall;
  result: ToolResult;
  response: ToolResult;
}

class ToolExecutionScheduler {
  private barrier: Promise<void> = Promise.resolve();
  private openParallel: Promise<unknown>[] = [];
  private entries: ScheduledToolExecution[] = [];

  schedule(call: DesktopToolCall, parallelSafe: boolean, runner: (call: DesktopToolCall) => Promise<ScheduledToolResult>) {
    const run = () => runner(call);
    let promise: Promise<ScheduledToolResult>;

    if (parallelSafe) {
      promise = this.barrier.then(run);
      this.openParallel.push(promise.catch(() => undefined));
    } else {
      const waitForReads = Promise.allSettled(this.openParallel);
      promise = this.barrier
        .then(() => waitForReads)
        .then(run);
      this.openParallel = [];
      this.barrier = promise.catch(() => undefined).then(() => undefined);
    }

    this.entries.push({ call, promise });
    return promise;
  }

  async drainOrdered() {
    const results: Array<{ id: string; name: string; response: ToolResult; call: DesktopToolCall; result: ToolResult }> = [];
    for (const entry of this.entries) {
      const scheduled = await entry.promise;
      results.push({
        id: scheduled.call.id,
        name: scheduled.call.name,
        response: scheduled.response,
        call: scheduled.call,
        result: scheduled.result,
      });
    }
    return results;
  }
}

export class AgentRuntime {
  private tools = new DesktopToolOrchestrator();
  private activeRuns = new Map<string, AgentRunTracker>();
  private pendingApprovalByCallId = new Map<string, ApprovalBundle>();
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
  ) {}

  getActiveRun(threadId: string) {
    const run = this.activeRuns.get(threadId);
    if (run) return toActiveRunState(run);

    const pending = Array.from(this.pendingApprovalByCallId.values()).find((item) => item.threadId === threadId);
    if (pending) return toActiveRunState(pending.run);

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
    const thread = this.store.getThread(input.threadId);
    if (!thread) throw new Error("Thread not found.");
    const workspace = this.store.getWorkspace(thread.workspaceId);
    if (!workspace) throw new Error("Select a workspace before starting the desktop agent.");

    this.stopTurn(input.threadId);
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
    if (input.prompt.trim()) this.store.updateThreadTitle(input.threadId, input.prompt.trim().replace(/\s+/g, " "));
    this.emitSnapshot();

    const priorMessages = buildProviderHistory(this.store, input.threadId, assistantMessage.id);
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
  }

  async continueRun(threadId: string) {
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

  stopTurn(threadId: string) {
    const run = this.activeRuns.get(threadId);
    run?.controller.abort();
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
    this.emit({ type: "run_state", threadId, run: run ? toActiveRunState(run) : this.getActiveRun(threadId) });
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
    let history = options.history;
    let assistantText = options.assistantText;
    let assistantThought = options.assistantThought;
    let iteration = options.iteration;
    let toolCount = options.toolCount;
    let recoveryAttempts = options.recoveryAttempts;
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
      while (!controller.signal.aborted && continuousIterations < MAX_CONTINUOUS_MODEL_ITERATIONS && toolCount < MAX_TOOL_CALLS) {
        continuousIterations += 1;
        iteration += 1;
        history = compactProviderHistory(history);
        run.iteration = iteration;
        run.toolCount = toolCount;
        transitionRun(run, "sampling", { iteration, toolCount, resumable: false, reason: undefined });
        this.emitRun(run);

        const calls: DesktopToolCall[] = [];
        const approvalCalls: DesktopToolCall[] = [];
        const scheduler = new ToolExecutionScheduler();
        const scheduleTool = (call: DesktopToolCall) => {
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
              return { call: scheduledCall, result, response: compactToolResultForModel(result) };
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
              return { call: scheduledCall, result, response: compactToolResultForModel(result) };
            }
          });
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
        const stallWatchdog = windowlessInterval(() => {
          if (controller.signal.aborted) return;
          if (Date.now() - run.lastProgressAt < STREAM_STALL_TIMEOUT_MS) return;
          stalledAbortReason = `The model connection stalled before it returned more output.`;
          controller.abort();
        }, 1000);

        try {
          await streamProviderResponse({
            provider: getProviderForModel(settings.model),
            model: getModelOption(settings.model).id,
            systemInstruction: buildDesktopSystemPrompt(
              options.workspaceRoot,
              buildRuntimeContext(this.store, options.threadId, options.workspaceRoot),
            ),
            messages: history,
            reasoning: settings.reasoningEffort,
            signal: controller.signal,
            cliproxyBaseUrl: settings.cliproxyBaseUrl,
            openRouterApiKey: this.store.getSecret("openrouter_api_key"),
            geminiApiKey: this.store.getSecret("gemini_api_key"),
            onTextDelta: (delta) => {
              endThoughtPart();
              const filtered = filterVisibleDelta(assistantText, delta, visibleFingerprints);
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
                title: this.titleForTool(call),
                textOffset: assistantText.length,
                startedAt: now(),
              });
              this.emit({ type: "tool_updated", tool: event });
            },
            onToolCall: (call) => {
              endThoughtPart();
              markRunProgress(run);
              calls.push(call);
              const decision = this.tools.assess(call, settings.permissionMode);
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
              const requiresApproval = decision.requiresApproval && !scope;
              const event = this.updateToolEvent(options.threadId, options.assistantMessage.id, call, {
                status: requiresApproval ? "awaiting_approval" : "running",
                risk: decision.risk,
                approvalReason: scope ? `Auto-approved by saved ${scopeLabel(scope)} scope.` : decision.reason,
                title: this.titleForTool(call),
                textOffset: assistantText.length,
                startedAt: now(),
              });
              this.emit({ type: "tool_updated", tool: event });
              if (requiresApproval) {
                approvalCalls.push(call);
              } else {
                scheduleTool(call);
              }
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
          flushAssistant("completed", true);
          this.store.clearRunCheckpoint(options.threadId);
          this.activeRuns.delete(options.threadId);
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
        if (recoveryAttempts < 1) {
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
        this.emitRun(run);
        handoff = true;
        return;
      }

      const aborted = controller.signal.aborted;
      const hasVisibleWork = Boolean(
        assistantText.trim() ||
        assistantThought.trim() ||
        this.store.listToolEvents(options.threadId).some((event) => event.messageId === options.assistantMessage.id),
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
          reason: this.tools.assess(call, this.store.getSettings().permissionMode).reason,
        });
        const event = this.updateToolEvent(bundle.threadId, bundle.assistantMessageId, call, {
          status: "running",
          startedAt: now(),
        });
        this.emit({ type: "tool_updated", tool: event });
        result = await this.executeTool(call, bundle.workspaceRoot, bundle.run.controller, bundle.run, bundle.threadId, bundle.assistantMessageId);
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
      results.push({ id: call.id, name: call.name, response: compactToolResultForModel(result) });
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
  ) {
    const result = await this.tools.execute(call, {
      workspaceRoot,
      signal: controller.signal,
      onCommandOutput: (callId, delta) => {
        markRunProgress(run);
        this.queueToolOutput(threadId, messageId, call, callId, delta);
      },
    });
    this.flushToolOutput(call.id);
    this.emitRun(run);
    return result;
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
    const terminal = this.terminalMeta(call, patch.result ?? existing?.result);
    const event: ToolEventRecord = {
      id: existing?.id || crypto.randomUUID(),
      threadId,
      messageId,
      callId: call.id,
      name: call.name,
      title: patch.title || existing?.title || this.titleForTool(call),
      category: patch.category || existing?.category || this.categoryForTool(call),
      liveStatus: patch.liveStatus ?? this.liveStatusForTool(call, patch.status || existing?.status || "preparing"),
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
    this.store.listToolEvents(threadId)
      .filter((event) =>
        event.messageId === messageId &&
        event.callId.startsWith("draft_") &&
        !activeCallIds.has(event.callId) &&
        (event.status === "preparing" || event.status === "running")
      )
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
    const existing = this.store.listToolEvents(threadId).find((event) => event.callId === callId);
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
    const events = this.store.listToolEvents(threadId);
    const direct = events.find((event) => event.callId === call.id && event.name === call.name);
    if (direct) return direct;
    if (nextStatus === "preparing") return undefined;
    return events
      .slice()
      .reverse()
      .find((event) =>
        event.name === call.name &&
        event.status === "preparing" &&
        event.callId.startsWith("draft_") &&
        this.isDraftForCall(event.args, call.arguments, call.name)
      );
  }

  private isDraftForCall(draftArgs: Record<string, unknown>, finalArgs: Record<string, unknown>, toolName: string) {
    if (toolName === "desktop_write_file") {
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

  private titleForTool(call: DesktopToolCall) {
    const args = call.arguments;
    switch (call.name) {
      case "desktop_read_file":
        return `Read ${args.path || "file"}`;
      case "desktop_write_file":
        return `Write ${args.path || "file"}`;
      case "desktop_apply_patch":
        return `Patch ${patchTargetLabel(String(args.patch || ""))}`;
      case "desktop_list_dir":
        return `List ${args.path || "."}`;
      case "desktop_search":
        return `Search ${args.query || "workspace"}`;
      case "desktop_delete_path":
        return `Delete ${args.path || "path"}`;
      case "desktop_rename_path":
        return `Rename ${args.fromPath || "path"}`;
      case "desktop_spawn_process":
        return `Run ${terminalCommandLabel(call) || "command"}`;
      case "desktop_write_process":
        return `Terminal input ${args.processId || ""}`.trim();
      case "desktop_resize_process":
        return `Resize process ${args.processId || ""}`.trim();
      case "desktop_kill_process":
        return `Stop process ${args.processId || ""}`.trim();
      case "desktop_run_diagnostics":
        return `Check ${args.kind || args.command || "workspace"}`;
      default:
        return call.name;
    }
  }

  private categoryForTool(call: DesktopToolCall): ToolEventRecord["category"] {
    if (["desktop_write_file", "desktop_apply_patch", "desktop_delete_path", "desktop_rename_path"].includes(call.name)) return "edit";
    if (["desktop_spawn_process", "desktop_write_process", "desktop_resize_process", "desktop_kill_process"].includes(call.name)) return "terminal";
    if (call.name === "desktop_run_diagnostics") return "diagnostic";
    if (call.name === "desktop_search") return "search";
    if (call.name === "desktop_git_status" || call.name === "desktop_git_diff") return "git";
    if (call.name === "desktop_read_file" || call.name === "desktop_list_dir") return "read";
    return "other";
  }

  private liveStatusForTool(call: DesktopToolCall, status: ToolEventRecord["status"]) {
    if (status === "done") return undefined;
    if (status === "awaiting_approval") return "Waiting for approval";
    if (call.name === "desktop_spawn_process") return "Running command";
    if (call.name === "desktop_write_process") return "Polling process";
    if (call.name === "desktop_resize_process") return "Resizing process";
    if (call.name === "desktop_kill_process") return "Stopping process";
    if (call.name === "desktop_run_diagnostics") return "Checking workspace";
    if (call.name === "desktop_apply_patch") return "Applying patch";
    if (call.name === "desktop_write_file") return "Writing file";
    if (call.name === "desktop_search") return "Searching workspace";
    if (call.name === "desktop_read_file") return "Reading file";
    if (call.name === "desktop_list_dir") return "Inspecting workspace";
    return status.replace(/_/g, " ");
  }

  private terminalMeta(call: DesktopToolCall, result?: ToolResult): ToolEventRecord["terminal"] | undefined {
    if (!["desktop_spawn_process", "desktop_write_process", "desktop_resize_process", "desktop_kill_process", "desktop_run_diagnostics"].includes(call.name)) return undefined;
    return {
      command: terminalCommandLabel(call),
      cwd: typeof call.arguments.cwd === "string" ? call.arguments.cwd : undefined,
      processId: typeof result?.data?.processId === "number" ? result.data.processId : typeof call.arguments.processId === "number" ? call.arguments.processId : undefined,
      running: result?.data?.running === true,
      exitCode: typeof result?.data?.exitCode === "number" || result?.data?.exitCode === null ? result.data.exitCode as number | null : undefined,
      durationMs: typeof result?.data?.durationMs === "number" ? result.data.durationMs : undefined,
      processDurationMs: typeof result?.data?.processDurationMs === "number" ? result.data.processDurationMs : undefined,
      operationDurationMs: typeof result?.data?.operationDurationMs === "number" ? result.data.operationDurationMs : undefined,
      timedOut: result?.data?.timedOut === true,
      omittedBytes: typeof result?.data?.omittedBytes === "number" ? result.data.omittedBytes : undefined,
      status: typeof result?.data?.status === "string" ? result.data.status : undefined,
      backend: typeof result?.data?.backend === "string" ? result.data.backend : undefined,
      tty: result?.data?.tty === true,
      streamsMerged: result?.data?.streamsMerged === true,
    };
  }

  private emitRun(run: AgentRunTracker) {
    this.emit({ type: "run_state", threadId: run.threadId, run: toActiveRunState(run) });
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

class StreamStalledError extends Error {}

const normalizeApprovalDecisions = (input: ApprovalDecisionInput) => {
  if (input.decisions?.length) return input.decisions;
  if (input.callId && typeof input.approved === "boolean") {
    return [{ callId: input.callId, approved: input.approved, scope: input.scope }];
  }
  return [];
};

const textProviderMessage = (content: string): ProviderMessage => ({
  role: "user",
  content,
  parts: [{ type: "text", text: content }],
});

const historyHasRecentToolResults = (history: ProviderMessage[]) =>
  history.slice(-3).some((message) => message.parts?.some((part) => part.type === "function_response"));

export const resolveNoToolOutcome = (input: {
  iterationText: string;
  iterationThought: string;
  afterToolResults: boolean;
  recoveryAttempts: number;
}): { action: "recover"; message: string } | { action: "complete" } => {
  const text = input.iterationText.trim();
  const thought = input.iterationThought.trim();
  if (text) return { action: "complete" };
  if (input.recoveryAttempts >= MAX_RECOVERY_NUDGES) return { action: "complete" };
  if (input.afterToolResults) {
    return {
      action: "recover",
      message: "The last provider turn ended after tool results without visible assistant text or another tool call. Continue from the completed tool results and either call the next needed tool or provide the final user-facing answer.",
    };
  }
  if (thought) {
    return {
      action: "recover",
      message: "The last provider turn produced reasoning but no visible assistant text or tool call. Continue from the current turn state and either call a desktop tool or provide the final user-facing answer.",
    };
  }
  return {
    action: "recover",
    message: "The last provider turn ended without visible assistant text or tool calls. Continue from the current conversation state and either call a desktop tool or provide the final user-facing answer.",
  };
};

const patchTargetLabel = (patch: string) => {
  const normalized = patch
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, "\"");
  const match = normalized.match(/^\*\*\* (?:Add|Update|Delete) File: ([^\n]+)/m);
  return match?.[1]?.trim() || "files";
};

const activityItemsForTool = (call: DesktopToolCall, diff?: string, diffFiles?: ToolDiffFileRecord[]): ToolEventRecord["activities"] => {
  const fileItems = activityItemsFromDiffFiles(diffFiles);
  if (fileItems.length > 0) return fileItems;
  const diffItems = diffActivityItems(diff) || [];
  if (diffItems.length > 0) return diffItems;
  if (call.name === "desktop_apply_patch") return patchActivityItems(String(call.arguments.patch || ""));
  if (call.name === "desktop_write_file") return [{ verb: "Writing", path: String(call.arguments.path || "") }];
  if (call.name === "desktop_delete_path") return [{ verb: "Deleting", path: String(call.arguments.path || "") }];
  if (call.name === "desktop_rename_path") return [{ verb: "Renaming", path: `${call.arguments.fromPath || ""} -> ${call.arguments.toPath || ""}` }];
  return [];
};

const patchActivityItems = (patch: string): ToolEventRecord["activities"] => {
  const normalized = patch
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, "\"");
  return normalized
    .split(/\r?\n/)
    .map((line) => {
      const add = line.match(/^\*\*\* Add File:\s*(.+)$/);
      const update = line.match(/^\*\*\* Update File:\s*(.+)$/);
      const del = line.match(/^\*\*\* Delete File:\s*(.+)$/);
      if (add) return { verb: "Creating", path: add[1].trim() };
      if (update) return { verb: "Editing", path: update[1].trim() };
      if (del) return { verb: "Deleting", path: del[1].trim() };
      return null;
    })
    .filter(Boolean) as ToolEventRecord["activities"];
};

const diffActivityItems = (diff?: string): ToolEventRecord["activities"] => {
  if (!diff) return [];
  return diff
    .split(/\n(?=--- )/g)
    .map((section) => {
      const before = section.match(/^---\s+(.+)$/m)?.[1]?.trim() || "";
      const after = section.match(/^\+\+\+\s+(.+)$/m)?.[1]?.trim() || before;
      const additions = section.split(/\r?\n/).filter((line) => line.startsWith("+ ") && !line.startsWith("+++")).length;
      const deletions = section.split(/\r?\n/).filter((line) => line.startsWith("- ") && !line.startsWith("---")).length;
      if (!after && !before) return null;
      return {
        verb: !before || before === "/dev/null" ? "Created" : additions === 0 && deletions > 0 ? "Deleted" : "Edited",
        path: after || before,
        additions,
        deletions,
      };
    })
    .filter(Boolean) as ToolEventRecord["activities"];
};

const diffStats = (diff?: string) => {
  if (!diff) return undefined;
  return {
    additions: diff.split(/\r?\n/).filter((line) => line.startsWith("+ ") && !line.startsWith("+++")).length,
    deletions: diff.split(/\r?\n/).filter((line) => line.startsWith("- ") && !line.startsWith("---")).length,
  };
};

const previewForTool = (call: DesktopToolCall, output?: string, diff?: string) => {
  if (diff) return diff.slice(0, 12_000);
  if (["desktop_spawn_process", "desktop_write_process", "desktop_resize_process", "desktop_kill_process", "desktop_run_diagnostics"].includes(call.name)) {
    return output?.slice(-12_000);
  }
  return undefined;
};

const terminalCommandLabel = (call: DesktopToolCall) => {
  const argv = call.arguments.argv;
  if (Array.isArray(argv) && argv.length > 0) return argv.map((item) => displayArg(String(item))).join(" ");
  return String(call.arguments.command || call.arguments.kind || "").trim();
};

const displayArg = (value: string) =>
  /\s/.test(value) ? JSON.stringify(value) : value;

const liveStatusFromOutput = (output: string) => {
  const last = output.trim().split(/\r?\n/).filter(Boolean).pop();
  if (!last) return undefined;
  if (/^(Reading|Writing|Editing|Creating|Deleting|Running|Live diff|Live patch)/i.test(last)) return last.slice(0, 120);
  return undefined;
};

const compactLiveOutput = (value: string, maxChars = LIVE_OUTPUT_MAX_CHARS) => {
  if (value.length <= maxChars) return value;
  const head = value.slice(0, 35_000);
  const tail = value.slice(-(maxChars - 35_000));
  return `${head}\n\n[... live output compacted ...]\n\n${tail}`;
};

const sortObject = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map((item) => sortObject(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, sortObject(item)]),
  );
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unknown error";

const summarizeArgs = (args: Record<string, unknown>) =>
  JSON.stringify(sortObject(args)).slice(0, 600);

const scopeLabel = (scope: ApprovalScopeRecord) => {
  if (scope.kind === "terminal_prefix") return "command prefix";
  if (scope.kind === "tool_thread") return "thread";
  return "workspace";
};

const approvalScopeBounds = (decisionScope: ApprovalDecisionScope, timestamp: number) => {
  if (decisionScope === "command_prefix") {
    return {
      expiresAt: timestamp + 24 * 60 * 60 * 1000,
      maxUses: 20,
    };
  }
  return {
    expiresAt: timestamp + 7 * 24 * 60 * 60 * 1000,
    maxUses: decisionScope === "this_thread" ? 20 : 50,
  };
};

const windowlessInterval = (callback: () => void, ms: number) =>
  setInterval(callback, ms);

const buildVisibleFingerprints = (text: string) => {
  const fingerprints = new Set<string>();
  splitVisibleUnits(text).forEach((unit) => {
    const fingerprint = fingerprintVisibleText(unit);
    if (fingerprint.length >= REPEAT_FINGERPRINT_MIN_CHARS) fingerprints.add(fingerprint);
  });
  return fingerprints;
};

const recordAssistantTextPart = (
  message: ChatMessageRecord,
  phase: AssistantTextPhase,
  startOffset: number,
  endOffset: number,
) => {
  if (endOffset <= startOffset) return;
  const timestamp = now();
  const parts = normalizeAssistantTextParts(message.textParts || [], endOffset);
  const last = parts[parts.length - 1];
  if (last && last.phase === phase && last.endOffset === startOffset) {
    last.endOffset = endOffset;
    last.updatedAt = timestamp;
    message.textParts = parts;
    return;
  }
  message.textParts = [
    ...parts,
    {
      id: crypto.randomUUID(),
      phase,
      startOffset,
      endOffset,
      streamOrder: nextTextPartOrder(parts),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];
};

const markAssistantTextRangePhase = (
  message: ChatMessageRecord,
  startOffset: number,
  endOffset: number,
  phase: AssistantTextPhase,
) => {
  if (endOffset <= startOffset) return;
  const timestamp = now();
  const parts = normalizeAssistantTextParts(message.textParts || [], endOffset);
  const next: AssistantTextPartRecord[] = [];
  let coveredUntil = startOffset;
  parts.forEach((part) => {
    if (part.endOffset <= startOffset || part.startOffset >= endOffset) {
      next.push(part);
      return;
    }
    if (part.startOffset < startOffset) {
      next.push({ ...part, endOffset: startOffset, updatedAt: timestamp });
    }
    const phaseStart = Math.max(part.startOffset, startOffset);
    const phaseEnd = Math.min(part.endOffset, endOffset);
    if (phaseStart > coveredUntil) {
      next.push({
        id: crypto.randomUUID(),
        phase,
        startOffset: coveredUntil,
        endOffset: phaseStart,
        streamOrder: nextTextPartOrder(next),
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
    next.push({
      ...part,
      id: part.startOffset < startOffset || part.endOffset > endOffset ? crypto.randomUUID() : part.id,
      phase,
      startOffset: phaseStart,
      endOffset: phaseEnd,
      updatedAt: timestamp,
    });
    coveredUntil = Math.max(coveredUntil, phaseEnd);
    if (part.endOffset > endOffset) {
      next.push({ ...part, id: crypto.randomUUID(), startOffset: endOffset, updatedAt: timestamp });
    }
  });
  if (coveredUntil < endOffset) {
    next.push({
      id: crypto.randomUUID(),
      phase,
      startOffset: coveredUntil,
      endOffset,
      streamOrder: nextTextPartOrder(next),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
  message.textParts = mergeAdjacentTextParts(next);
};

const normalizeAssistantTextParts = (parts: AssistantTextPartRecord[], contentLength: number) =>
  mergeAdjacentTextParts(
    parts
      .filter((part) =>
        (part.phase === "commentary" || part.phase === "final_answer") &&
        Number.isFinite(part.startOffset) &&
        Number.isFinite(part.endOffset)
      )
      .map((part) => ({
        ...part,
        startOffset: Math.max(0, Math.min(contentLength, part.startOffset)),
        endOffset: Math.max(0, Math.min(contentLength, part.endOffset)),
      }))
      .filter((part) => part.endOffset > part.startOffset)
      .sort((a, b) => a.startOffset - b.startOffset || a.createdAt - b.createdAt),
  );

const mergeAdjacentTextParts = (parts: AssistantTextPartRecord[]) => {
  const merged: AssistantTextPartRecord[] = [];
  parts.forEach((part) => {
    const last = merged[merged.length - 1];
    if (last && last.phase === part.phase && last.endOffset >= part.startOffset) {
      last.endOffset = Math.max(last.endOffset, part.endOffset);
      last.updatedAt = Math.max(last.updatedAt, part.updatedAt);
      return;
    }
    merged.push({ ...part });
  });
  return merged;
};

const nextTextPartOrder = (parts: AssistantTextPartRecord[]) =>
  Math.max(0, ...parts.map((part) => part.streamOrder ?? 0)) + 1;

const filterVisibleDelta = (current: string, delta: string, fingerprints: Set<string>) => {
  if (!delta || isInsideMarkdownCodeFence(current)) return delta;
  const recent = fingerprintVisibleText(current.slice(-RECENT_VISIBLE_TEXT_CHARS));
  const accepted: string[] = [];
  splitVisibleUnits(delta).forEach((unit) => {
    const fingerprint = fingerprintVisibleText(unit);
    if (
      fingerprint.length >= REPEAT_FINGERPRINT_MIN_CHARS &&
      (fingerprints.has(fingerprint) || recent.includes(fingerprint))
    ) {
      return;
    }
    if (fingerprint.length >= REPEAT_FINGERPRINT_MIN_CHARS) fingerprints.add(fingerprint);
    accepted.push(unit);
  });
  return accepted.join("");
};

const splitVisibleUnits = (text: string) =>
  text.match(/[^.!?\n]+[.!?\n]+|\n+|[^.!?\n]+$/g) || [text];

const fingerprintVisibleText = (text: string) =>
  text
    .toLowerCase()
    .replace(/[`*_#[\](){}<>.,!?;:'"\\/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isInsideMarkdownCodeFence = (text: string) =>
  ((text.match(/```/g) || []).length % 2) === 1;
