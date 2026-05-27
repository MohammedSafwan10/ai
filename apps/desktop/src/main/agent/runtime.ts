import type { BrowserWindow } from "electron";
import type { DesktopStore } from "../db/store";
import { getProviderForModel } from "../../shared/models";
import type {
  ActiveRunState,
  ApprovalDecisionInput,
  ChatMessageRecord,
  DesktopEvent,
  DesktopToolCall,
  StartTurnInput,
  ToolEventRecord,
  ToolResult,
} from "../../shared/types";
import { buildDesktopSystemPrompt } from "./systemPrompt";
import { appendAssistantToolCalls, appendToolResults, type ProviderMessage } from "./providers/types";
import { streamProviderResponse } from "./providers";
import { DesktopToolExecutor } from "./tools/executor";
import { classifyToolCall } from "./tools/permissions";
import { getModelOption } from "../../shared/models";
import { buildProviderHistory, buildRuntimeContext, compactToolResultForModel } from "./context";

const MAX_MODEL_ITERATIONS = 16;
const MAX_TOOL_CALLS = 64;

const now = () => Date.now();

interface PendingApproval {
  threadId: string;
  assistantMessageId: string;
  workspaceRoot: string;
  call: DesktopToolCall;
  history: ProviderMessage[];
  assistantText: string;
  assistantThought: string;
  toolCount: number;
  iteration: number;
  controller: AbortController;
}

interface ActiveRun {
  threadId: string;
  assistantMessageId: string;
  controller: AbortController;
}

export class AgentRuntime {
  private executor = new DesktopToolExecutor();
  private activeRuns = new Map<string, ActiveRun>();
  private pendingApprovals = new Map<string, PendingApproval>();

  constructor(
    private store: DesktopStore,
    private getMainWindow: () => BrowserWindow | null,
    private getActiveIds: () => { activeThreadId: string | null; activeWorkspaceId: string | null },
  ) {}

  getActiveRun(threadId: string): ActiveRunState | null {
    const run = this.activeRuns.get(threadId);
    if (!run) {
      const pending = Array.from(this.pendingApprovals.values()).find((item) => item.threadId === threadId);
      return pending
        ? { threadId, assistantMessageId: pending.assistantMessageId, status: "awaiting_approval" }
        : null;
    }
    return { threadId, assistantMessageId: run.assistantMessageId, status: "running" };
  }

  async startTurn(input: StartTurnInput) {
    const thread = this.store.getThread(input.threadId);
    if (!thread) throw new Error("Thread not found.");
    const workspace = this.store.getWorkspace(thread.workspaceId);
    if (!workspace) throw new Error("Select a workspace before starting the desktop agent.");

    this.stopTurn(input.threadId);
    const timestamp = now();
    const userMessage: ChatMessageRecord = {
      id: crypto.randomUUID(),
      threadId: input.threadId,
      role: "user",
      content: input.prompt,
      attachments: input.attachments,
      status: "completed",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const assistantMessage: ChatMessageRecord = {
      id: crypto.randomUUID(),
      threadId: input.threadId,
      role: "assistant",
      content: "",
      thought: "",
      status: "running",
      createdAt: Math.max(timestamp + 1, userMessage.createdAt + 1),
      updatedAt: timestamp + 1,
    };
    this.store.upsertMessage(userMessage);
    this.store.upsertMessage(assistantMessage);
    if (input.prompt.trim()) this.store.updateThreadTitle(input.threadId, input.prompt.trim().replace(/\s+/g, " "));
    this.emitSnapshot();

    const priorMessages = buildProviderHistory(this.store, input.threadId, assistantMessage.id);

    const controller = new AbortController();
    this.activeRuns.set(input.threadId, { threadId: input.threadId, assistantMessageId: assistantMessage.id, controller });
    this.emit({ type: "run_state", run: { threadId: input.threadId, assistantMessageId: assistantMessage.id, status: "running" } });

    await this.continueLoop({
      threadId: input.threadId,
      assistantMessage,
      workspaceRoot: workspace.path,
      history: priorMessages,
      assistantText: "",
      assistantThought: "",
      controller,
      iteration: 0,
      toolCount: 0,
    });
  }

  stopTurn(threadId: string) {
    const run = this.activeRuns.get(threadId);
    run?.controller.abort();
    const approvals = Array.from(this.pendingApprovals.values()).filter((item) => item.threadId === threadId);
    approvals.forEach((approval) => {
      approval.controller.abort();
      this.pendingApprovals.delete(approval.call.id);
    });
    this.activeRuns.delete(threadId);
    this.emit({ type: "run_state", run: null });
  }

  async decideApproval(input: ApprovalDecisionInput) {
    const pending = this.pendingApprovals.get(input.callId);
    if (!pending) return;
    this.pendingApprovals.delete(input.callId);
    const toolEvent = this.updateToolEvent(pending.threadId, pending.assistantMessageId, pending.call, {
      status: input.approved ? "running" : "cancelled",
      result: input.approved ? undefined : { success: false, error: "User cancelled this action." },
    });
    this.emit({ type: "tool_updated", tool: toolEvent });

    let result: ToolResult;
    if (input.approved) {
      result = await this.executeTool(pending.call, pending.workspaceRoot, pending.controller);
    } else {
      result = { success: false, error: "User cancelled this action." };
    }

    const finalToolEvent = this.updateToolEvent(pending.threadId, pending.assistantMessageId, pending.call, {
      status: result.success ? "done" : "failed",
      result,
      output: result.output,
      diff: (result as ToolResult & { diff?: string }).diff,
    });
    this.emit({ type: "tool_updated", tool: finalToolEvent });

    const assistantMessage = this.store
      .listMessages(pending.threadId)
      .find((message) => message.id === pending.assistantMessageId);
    if (!assistantMessage) return;
    assistantMessage.status = "running";
    assistantMessage.updatedAt = now();
    this.store.upsertMessage(assistantMessage);
    this.activeRuns.set(pending.threadId, {
      threadId: pending.threadId,
      assistantMessageId: pending.assistantMessageId,
      controller: pending.controller,
    });
    this.emit({ type: "run_state", run: { threadId: pending.threadId, assistantMessageId: pending.assistantMessageId, status: "running" } });

    await this.continueLoop({
      threadId: pending.threadId,
      assistantMessage,
      workspaceRoot: pending.workspaceRoot,
      history: appendToolResults(
        appendAssistantToolCalls(pending.history, pending.assistantText, [pending.call]),
        [{ id: pending.call.id, name: pending.call.name, response: compactToolResultForModel(result) }],
      ),
      assistantText: pending.assistantText,
      assistantThought: pending.assistantThought,
      controller: pending.controller,
      iteration: pending.iteration,
      toolCount: pending.toolCount + 1,
    });
  }

  private async continueLoop(options: {
    threadId: string;
    assistantMessage: ChatMessageRecord;
    workspaceRoot: string;
    history: ProviderMessage[];
    assistantText: string;
    assistantThought: string;
    controller: AbortController;
    iteration: number;
    toolCount: number;
  }) {
    const settings = this.store.getSettings();
    let history = options.history;
    let assistantText = options.assistantText;
    let assistantThought = options.assistantThought;
    let iteration = options.iteration;
    let toolCount = options.toolCount;

    try {
      while (!options.controller.signal.aborted && iteration < MAX_MODEL_ITERATIONS && toolCount < MAX_TOOL_CALLS) {
        iteration += 1;
        const calls: DesktopToolCall[] = [];
        await streamProviderResponse({
          provider: getProviderForModel(settings.model),
          model: getModelOption(settings.model).id,
          systemInstruction: buildDesktopSystemPrompt(
            options.workspaceRoot,
            buildRuntimeContext(this.store, options.threadId, options.workspaceRoot),
          ),
          messages: history,
          reasoning: settings.reasoningEffort,
          signal: options.controller.signal,
          cliproxyBaseUrl: settings.cliproxyBaseUrl,
          openRouterApiKey: this.store.getSecret("openrouter_api_key"),
          geminiApiKey: this.store.getSecret("gemini_api_key"),
          onTextDelta: (delta) => {
            assistantText += delta;
            this.updateAssistant(options.assistantMessage, assistantText, assistantThought, "running");
          },
          onThoughtDelta: (delta) => {
            assistantThought += delta;
            this.updateAssistant(options.assistantMessage, assistantText, assistantThought, "running");
          },
          onToolDraft: (draft) => {
            const call: DesktopToolCall = {
              id: draft.id || `draft_${options.assistantMessage.id}_${draft.name}_${this.stableArgsKey(draft.arguments)}`,
              name: draft.name as DesktopToolCall["name"],
              arguments: draft.arguments,
            };
            const event = this.updateToolEvent(options.threadId, options.assistantMessage.id, call, {
              status: "preparing",
              title: this.titleForTool(call),
            });
            this.emit({ type: "tool_updated", tool: event });
          },
          onToolCall: (call) => {
            calls.push(call);
            const decision = classifyToolCall(call, settings.permissionMode);
            const event = this.updateToolEvent(options.threadId, options.assistantMessage.id, call, {
              status: decision.requiresApproval ? "awaiting_approval" : "running",
              risk: decision.risk,
              approvalReason: decision.reason,
              title: this.titleForTool(call),
            });
            this.emit({ type: "tool_updated", tool: event });
          },
        });

        if (calls.length === 0) {
          this.updateAssistant(options.assistantMessage, assistantText, assistantThought, "completed");
          this.activeRuns.delete(options.threadId);
          this.emit({ type: "run_state", run: null });
          return;
        }

        history = appendAssistantToolCalls(history, assistantText, calls);
        const results: Array<{ id: string; name: string; response: ToolResult }> = [];
        for (const call of calls) {
          const decision = classifyToolCall(call, settings.permissionMode);
          if (decision.requiresApproval) {
            this.pendingApprovals.set(call.id, {
              threadId: options.threadId,
              assistantMessageId: options.assistantMessage.id,
              workspaceRoot: options.workspaceRoot,
              call,
              history,
              assistantText,
              assistantThought,
              toolCount,
              iteration,
              controller: options.controller,
            });
            this.updateAssistant(options.assistantMessage, assistantText, assistantThought, "awaiting_approval");
            this.activeRuns.delete(options.threadId);
            this.emit({ type: "run_state", run: { threadId: options.threadId, assistantMessageId: options.assistantMessage.id, status: "awaiting_approval" } });
            return;
          }
          const result = await this.executeTool(call, options.workspaceRoot, options.controller);
          toolCount += 1;
          const event = this.updateToolEvent(options.threadId, options.assistantMessage.id, call, {
            status: result.success ? "done" : "failed",
            result,
            output: result.output,
            diff: (result as ToolResult & { diff?: string }).diff,
          });
          this.emit({ type: "tool_updated", tool: event });
          results.push({ id: call.id, name: call.name, response: compactToolResultForModel(result) });
        }
        history = appendToolResults(history, results);
      }

      const cappedText = toolCount >= MAX_TOOL_CALLS
        ? "\n\nI stopped before making more tool calls because the desktop tool budget was reached."
        : "\n\nI stopped because the model iteration budget was reached.";
      assistantText += cappedText;
      this.updateAssistant(options.assistantMessage, assistantText, assistantThought, "completed");
    } catch (error) {
      const aborted = options.controller.signal.aborted;
      this.updateAssistant(
        options.assistantMessage,
        assistantText || (aborted ? "Stopped. Completed tool changes were kept." : `I could not complete that request: ${error instanceof Error ? error.message : "Unknown error"}`),
        assistantThought,
        aborted ? "stopped" : "failed",
      );
      if (!aborted) this.emit({ type: "toast", tone: "error", message: error instanceof Error ? error.message : "Agent request failed." });
    } finally {
      if (this.activeRuns.get(options.threadId)?.assistantMessageId === options.assistantMessage.id) {
        this.activeRuns.delete(options.threadId);
        this.emit({ type: "run_state", run: null });
      }
    }
  }

  private async executeTool(call: DesktopToolCall, workspaceRoot: string, controller: AbortController) {
    return this.executor.execute(call, {
      workspaceRoot,
      signal: controller.signal,
      onCommandOutput: (callId, delta) => {
        this.emit({ type: "command_output_delta", callId, delta });
      },
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
    const event: ToolEventRecord = {
      id: existing?.id || crypto.randomUUID(),
      threadId,
      messageId,
      callId: call.id,
      name: call.name,
      title: patch.title || existing?.title || this.titleForTool(call),
      status: patch.status || existing?.status || "preparing",
      risk: patch.risk || existing?.risk || "safe",
      args: call.arguments,
      result: patch.result ?? existing?.result,
      output: patch.output ?? existing?.output,
      diff: patch.diff ?? existing?.diff,
      approvalReason: patch.approvalReason ?? existing?.approvalReason,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    return this.store.upsertToolEvent(event);
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
        this.isDraftForCall(event.args, call.arguments)
      );
  }

  private isDraftForCall(draftArgs: Record<string, unknown>, finalArgs: Record<string, unknown>) {
    const entries = Object.entries(draftArgs).filter(([, value]) => value !== undefined && value !== "");
    if (entries.length === 0) return false;
    return entries.every(([key, value]) => String(finalArgs[key] ?? "") === String(value));
  }

  private stableArgsKey(value: unknown) {
    return JSON.stringify(this.sortObject(value)).slice(0, 180);
  }

  private sortObject(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.sortObject(item));
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, this.sortObject(item)]),
    );
  }

  private titleForTool(call: DesktopToolCall) {
    const args = call.arguments;
    switch (call.name) {
      case "desktop_read_file":
        return `Read ${args.path || "file"}`;
      case "desktop_write_file":
        return `Write ${args.path || "file"}`;
      case "desktop_apply_patch":
        return `Patch ${this.patchTargetLabel(String(args.patch || ""))}`;
      case "desktop_list_dir":
        return `List ${args.path || "."}`;
      case "desktop_search":
        return `Search ${args.query || "workspace"}`;
      case "desktop_delete_path":
        return `Delete ${args.path || "path"}`;
      case "desktop_rename_path":
        return `Rename ${args.fromPath || "path"}`;
      case "desktop_run_command":
        return `Run ${args.command || "command"}`;
      case "desktop_git_status":
        return "Git status";
      case "desktop_git_diff":
        return "Git diff";
      default:
        return call.name;
    }
  }

  private patchTargetLabel(patch: string) {
    const normalized = patch
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, "\"");
    const match = normalized.match(/^\*\*\* (?:Add|Update|Delete) File: ([^\n]+)/m);
    return match?.[1]?.trim() || "files";
  }

  private emit(event: DesktopEvent) {
    const window = this.getMainWindow();
    if (!window || window.isDestroyed()) return;
    window.webContents.send("desktop:event", event);
  }

  private emitSnapshot() {
    const { activeThreadId, activeWorkspaceId } = this.getActiveIds();
    const snapshot = this.store.snapshot(activeThreadId, activeWorkspaceId);
    snapshot.activeRun = activeThreadId ? this.getActiveRun(activeThreadId) : null;
    this.emit({ type: "snapshot", snapshot });
  }
}
