import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderStreamOptions } from "../src/main/agent/providers/types";
vi.mock("electron", () => ({ app: { isPackaged: false, getPath: () => os.tmpdir() }, safeStorage: { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => "keychain", encryptString: (text: string) => Buffer.from(text), decryptString: (bytes: Buffer) => bytes.toString() } }));
const hooks = vi.hoisted(() => ({ stream: vi.fn(), mentions: vi.fn() }));
vi.mock("../src/main/agent/providers", () => ({ streamProviderResponse: hooks.stream }));
vi.mock("../src/main/agent/contextMentions", () => ({ buildMentionContext: hooks.mentions }));
import { DesktopStore } from "../src/main/db/store";
import { TurnCoordinator } from "../src/main/agent/turnCoordinator";
import { ProviderStreamError } from "../src/main/agent/providers/streamOutcome";
import { StreamStalledError } from "../src/main/agent/harness/support/errors";
import { OPENCODE_GO_MUSE_SPK_13_MODEL_ID } from "../src/shared/models";
import type { ToolResult } from "../src/shared/types";

let folder: string;
let store: DesktopStore;
beforeEach(() => {
  folder = fs.mkdtempSync(path.join(os.tmpdir(), "privora-turn-cancel-"));
  store = new DesktopStore(folder);
  store.saveSettings({ model: OPENCODE_GO_MUSE_SPK_13_MODEL_ID, reasoningEffort: "high", permissionMode: "yolo" });
  hooks.stream.mockReset(); hooks.mentions.mockReset().mockResolvedValue("");
});
afterEach(() => { store.close(); fs.rmSync(folder, { recursive: true, force: true }); });
const fixture = () => {
  const workspace = store.upsertWorkspace(folder);
  const thread = store.createThread(workspace.id);
  const coordinator = new TurnCoordinator(store, () => null, () => ({ activeThreadId: thread.id, activeWorkspaceId: workspace.id }));
  return { thread, coordinator };
};

describe("Turn cancellation boundaries", () => {
  it.each([
    ["parent", "recovered"], ["direct", "recovered"], ["parent", "in-memory"], ["direct", "in-memory"],
  ] as const)("%s Stop cancels a child's %s approval and publishes its stopped state", (target, approvalState) => {
    const { thread, coordinator } = fixture();
    const child = store.createSubagent({ parentThreadId: thread.id, parentMessageId: "parent-turn", workspaceId: thread.workspaceId,
      taskName: "reviewer", agentPath: "/root/reviewer", prompt: "Review fixture" });
    const completed = store.createSubagent({ parentThreadId: thread.id, parentMessageId: "parent-turn", workspaceId: thread.workspaceId,
      taskName: "finished", agentPath: "/root/finished", prompt: "Already done" });
    store.updateSubagent(completed.threadId, { status: "completed", finalMessage: "Retained completed work", lastPreview: "Already done" });
    const completedBefore = store.getSubagentByThread(completed.threadId);
    store.updateSubagent(child.threadId, { status: "running" });
    store.upsertMessage({ id: "child-approval", threadId: child.threadId, role: "assistant", content: "Approval needed", status: "awaiting_approval", createdAt: 1, updatedAt: 1 });
    store.upsertToolEvent({ id: "pending-child-tool", threadId: child.threadId, messageId: "child-approval", callId: "pending-call",
      name: "exec_command", title: "Pending fixture command", args: { command: "fixture-only" }, status: "awaiting_approval", risk: "risky", createdAt: 2, updatedAt: 2 });
    store.saveRunCheckpoint({ threadId: child.threadId, assistantMessageId: "child-approval", workspaceRoot: folder,
      history: [{ role: "assistant", content: "Approval needed", parts: [{ type: "function_call", id: "pending-call", name: "exec_command", arguments: { command: "fixture-only" } }] }],
      assistantText: "Approval needed", assistantThought: "", iteration: 1, toolCount: 0, recoveryAttempts: 0, lastProgressAt: 2, updatedAt: 2 });
    if (approvalState === "in-memory") {
      const runtime = coordinator as any;
      expect(runtime.approvals.restorePendingBundle(child.threadId, "pending-call", (...args: unknown[]) => runtime.createRun(...args))).not.toBeNull();
    }
    expect(coordinator.getActiveRun(child.threadId)?.status).toBe("awaiting_approval");
    const emit = vi.spyOn(coordinator as any, "emit");

    coordinator.stopTurn(target === "parent" ? thread.id : child.threadId);

    expect(store.getMessage("child-approval")?.status).toBe("stopped");
    expect(store.getToolEvent("pending-child-tool")?.status).toBe("stopped");
    expect(store.getSubagentByThread(child.threadId)?.status).toBe("stopped");
    expect(coordinator.getActiveRun(child.threadId)).toMatchObject({ status: "stopped", resumable: true });
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: "turn.status_changed", threadId: child.threadId,
      run: expect.objectContaining({ status: "stopped" }) }));
    expect(JSON.stringify(store.getRunCheckpoint(child.threadId)?.history)).toContain("function_response");
    expect(store.getSubagentByThread(completed.threadId)).toEqual(completedBefore);
    expect(hooks.stream).not.toHaveBeenCalled();
  });

  it("does not restart watchdog recovery when Stop arrives before the provider settles", async () => {
    const { thread, coordinator } = fixture();
    let settle!: () => void;
    hooks.stream.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => { settle = resolve; });
      throw new StreamStalledError("Provider shutdown completed after the idle watchdog fired");
    }).mockImplementation(async (options: ProviderStreamOptions) => { options.onTextDelta("Unexpected restart"); });
    const task = coordinator.startTurn({ threadId: thread.id, prompt: "Begin fixture" });
    await vi.waitFor(() => expect(hooks.stream).toHaveBeenCalledOnce());
    coordinator.stopTurn(thread.id);
    settle();
    await task;
    await coordinator.waitForIdle();
    expect(hooks.stream).toHaveBeenCalledTimes(1);
    expect(store.listMessages(thread.id).find((message) => message.role === "assistant")?.status).toBe("stopped");
    expect(coordinator.getActiveRun(thread.id)).toMatchObject({ status: "stopped", resumable: true });
  });

  it.each(["provider", "watchdog"])("preserves delivered tool results and makes a %s interruption resumable without replay", async (source) => {
    const { thread, coordinator } = fixture();
    const execute = vi.spyOn(coordinator as unknown as { executeTool: () => Promise<ToolResult> }, "executeTool").mockResolvedValue({ success: true, output: "Mutation completed once" });
    hooks.stream.mockImplementation(async (options: ProviderStreamOptions) => {
      options.onTextDelta("Partial response");
      options.onToolCall({ id: "delivered-once", name: "desktop_list_dir", arguments: {} });
      options.onStreamOutcome?.({ status: "interrupted", reason: "missing_finish" });
      throw source === "provider" ? new ProviderStreamError({ status: "interrupted", reason: "missing_finish" }) : new StreamStalledError("Provider became idle");
    });
    await coordinator.startTurn({ threadId: thread.id, prompt: "Inspect fixture" });
    expect(execute).toHaveBeenCalledTimes(1); expect(hooks.stream).toHaveBeenCalledTimes(1);
    const message = store.listMessages(thread.id).find((item) => item.role === "assistant")!;
    expect(message.status).toBe("stalled"); expect(message.providerOutcome?.status).toBe("interrupted");
    expect(coordinator.getActiveRun(thread.id)?.resumable).toBe(true);
    const checkpoint = store.getRunCheckpoint(thread.id);
    expect(JSON.stringify(checkpoint?.history)).toContain("Mutation completed once");
    expect(checkpoint?.toolCount).toBe(1);
  });
  it("anchors incoming coordination after live text even before the throttled write", async () => {
    const { thread, coordinator } = fixture();
    let sampled = false;
    hooks.stream.mockImplementation(async (options: ProviderStreamOptions) => {
      if (sampled) { options.onTextDelta("Complete."); return; }
      sampled = true;
      options.onTextDelta("First");
      options.onTextDelta("Second");
      (coordinator as any).appendSubagentUserMessage(thread.id, "Coordination report", { id: "live-coordination", senderThreadId: "child", senderLabel: "Reviewer", recipientLabel: "Parent", delivery: "queued" });
    });
    await coordinator.startTurn({ threadId: thread.id, prompt: "Continue" });
    expect(store.listMessages(thread.id).find((message) => message.agentMessage?.id === "live-coordination")?.steerTextOffset).toBe(11);
  });
  it("consumes a steer captured by a stale compaction retry without delivering it twice", async () => {
    const { thread, coordinator } = fixture();
    const assistant = { id: "summary-turn", threadId: thread.id, role: "assistant" as const, content: "", status: "running" as const, createdAt: 2, updatedAt: 2 };
    store.upsertMessage(assistant);
    store.upsertMessage({ id: "before", threadId: thread.id, role: "user", content: "Original goal", status: "completed", createdAt: 1, updatedAt: 1 });
    let samples = 0;
    hooks.stream.mockImplementation(async (options: ProviderStreamOptions) => {
      if (samples++ === 0) {
        store.upsertMessage({ ...store.getMessage("before")!, content: "Corrected goal" });
        const steer = { id: "during", threadId: thread.id, role: "user" as const, content: "New instruction during retry", status: "completed" as const, createdAt: 3, updatedAt: 3 };
        store.upsertMessage(steer);
        (coordinator as any).pendingSteers.set(thread.id, [{ message: steer, providerMessages: [{ role: "user", content: steer.content }] }]);
      }
      options.onTextDelta(JSON.stringify({ goals: ["Corrected goal"], constraints: [], completedWork: [], rejectedLeads: [], unresolvedQuestions: [], nextActions: [], sourceMessageIds: ["before"] }));
    });
    const compacted = await (coordinator as any).compactHistoryForRuntime({ threadId: thread.id, assistantMessageId: assistant.id, workspaceRoot: folder, history: [{ role: "user", content: "Original goal" }], model: OPENCODE_GO_MUSE_SPK_13_MODEL_ID, reasoningEffort: "high", collaborationMode: "default", controller: new AbortController(), trigger: "mid_turn", reason: "context_limit", textOffset: 0 });
    const drained = (coordinator as any).drainPendingSteers(thread.id, compacted.history, assistant, compacted.checkpoint.sourceMessageIds);
    expect(drained.filter((message: { content: string }) => message.content === "New instruction during retry")).toHaveLength(1);
    expect((coordinator as any).pendingSteers.has(thread.id)).toBe(false);
  });
  it("counts cumulative usage updates once per provider request", async () => {
    const { thread, coordinator } = fixture();
    const reports: any[] = [];
    vi.spyOn(coordinator as any, "emitContextUsage").mockImplementation((...args: unknown[]) => { reports.push(args[5]); });
    hooks.stream.mockImplementation(async (options: ProviderStreamOptions) => {
      options.onUsage?.({ inputTokens: 100, cachedInputTokens: 50, outputTokens: 5, reasoningOutputTokens: 0, totalTokens: 105 });
      options.onUsage?.({ inputTokens: 100, cachedInputTokens: 50, outputTokens: 20, reasoningOutputTokens: 0, totalTokens: 120 });
      options.onUsage?.({ inputTokens: 100, cachedInputTokens: 50, outputTokens: 20, reasoningOutputTokens: 0, totalTokens: 120 });
      options.onTextDelta("Complete.");
    });
    await coordinator.startTurn({ threadId: thread.id, prompt: "Count usage" });
    expect(reports.at(-1)).toMatchObject({ inputTokens: 100, outputTokens: 20, totalTokens: 120 });
  });
  it("keeps messages arriving during compaction outside its saved boundary", async () => {
    const { thread, coordinator } = fixture();
    store.upsertMessage({ id: "before", threadId: thread.id, role: "user", content: "Original goal", status: "completed", createdAt: 1, updatedAt: 1 });
    hooks.stream.mockImplementation(async (options: ProviderStreamOptions) => {
      store.upsertMessage({ id: "during", threadId: thread.id, role: "user", content: "New instruction during summary", status: "completed", createdAt: 2, updatedAt: 2 });
      options.onTextDelta("Original goal summarized.");
    });
    await (coordinator as any).compactHistoryForRuntime({
      threadId: thread.id, assistantMessageId: "summary-turn", workspaceRoot: folder,
      history: [{ role: "user", content: "Original goal" }], model: OPENCODE_GO_MUSE_SPK_13_MODEL_ID,
      reasoningEffort: "high", collaborationMode: "default", controller: new AbortController(),
      trigger: "pre_turn", reason: "context_limit", textOffset: 0,
    });
    expect(store.getLatestCompactionCheckpoint(thread.id)?.compactedThroughMessageId).toBe("before");
    const history = (coordinator as any).contextManager.buildHistoryWithCompaction(thread.id, "next");
    expect(JSON.stringify(history)).toContain("New instruction during summary");
  });
  it("keeps a resumed turn busy until its stopped provider has settled", async () => {
    const { thread, coordinator } = fixture();
    hooks.stream.mockImplementationOnce(async (options: ProviderStreamOptions) => {
      options.onTextDelta("Initial work.");
      await new Promise<void>((resolve) => options.signal.addEventListener("abort", () => resolve(), { once: true }));
    });
    const first = coordinator.startTurn({ threadId: thread.id, prompt: "Begin" });
    await vi.waitFor(() => expect(hooks.stream).toHaveBeenCalledOnce());
    coordinator.stopTurn(thread.id);
    await first;
    let release!: () => void;
    hooks.stream.mockImplementationOnce(async () => { await new Promise<void>((resolve) => { release = resolve; }); });
    const resumed = coordinator.continueRun(thread.id);
    await vi.waitFor(() => expect(hooks.stream).toHaveBeenCalledTimes(2));
    coordinator.stopTurn(thread.id);
    expect(coordinator.getActiveRun(thread.id)?.status).toBe("draining");
    await expect(coordinator.startTurn({ threadId: thread.id, prompt: "Overlap" })).rejects.toThrow("already running");
    await coordinator.continueRun(thread.id);
    expect(hooks.stream).toHaveBeenCalledTimes(2);
    release();
    await resumed;
    expect(coordinator.listActiveRuns()).toHaveLength(0);
    expect(store.getRunCheckpoint(thread.id)?.assistantMessageId).toBe(store.listMessages(thread.id).at(-1)?.id);
  });
  it("continues after an incomplete draft without executing the unfinished action", async () => {
    const { thread, coordinator } = fixture();
    let round = 0;
    hooks.stream.mockImplementation(async (options: ProviderStreamOptions) => {
      if (round++ === 0) {
        options.onTextDelta("Checking the page.");
        options.onToolDraft({ id: "unfinished", name: "desktop_write_file", arguments: { path: "must-not-exist.txt", content: "partial" } });
      } else {
        expect(JSON.stringify(options.messages)).toContain("was NOT executed");
        options.onTextDelta("The unfinished action was discarded; here is the answer.");
      }
    });
    await coordinator.startTurn({ threadId: thread.id, prompt: "Continue my task" });
    await coordinator.waitForIdle();
    expect(hooks.stream).toHaveBeenCalledTimes(2);
    expect(fs.existsSync(path.join(folder, "must-not-exist.txt"))).toBe(false);
    expect(store.listMessages(thread.id).at(-1)?.status).toBe("completed");
    expect(store.listMessages(thread.id).at(-1)?.content).toContain("here is the answer");
  });

  it("bounds incomplete-call recovery and gives a visible failure instead of silently finishing", async () => {
    const { thread, coordinator } = fixture();
    let round = 0;
    hooks.stream.mockImplementation(async (options: ProviderStreamOptions) => {
      options.onToolDraft({ id: `unfinished-${round++}`, name: "browser_open", arguments: { url: "https://example.test/" } });
    });
    await coordinator.startTurn({ threadId: thread.id, prompt: "Read the page" });
    await coordinator.waitForIdle();
    expect(hooks.stream).toHaveBeenCalledTimes(3);
    expect(store.listMessages(thread.id).at(-1)?.status).toBe("failed");
    expect(store.listMessages(thread.id).at(-1)?.content).toContain("incomplete tool request");
    expect(coordinator.listActiveRuns()).toHaveLength(0);
  });

  it("validates incompatible model reasoning before creating a phantom running message", async () => {
    const { thread, coordinator } = fixture();
    await expect(coordinator.startTurn({ threadId: thread.id, prompt: "Begin", reasoningEffort: "max" })).rejects.toThrow("does not support");
    expect(coordinator.listActiveRuns()).toHaveLength(0);
    expect(store.listMessages(thread.id)).toHaveLength(0);
    expect(hooks.stream).not.toHaveBeenCalled();
  });
  it("honors Stop while initial attachment/context preparation is pending", async () => {
    const { thread, coordinator } = fixture();
    let release!: (text: string) => void;
    hooks.mentions.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    hooks.stream.mockImplementation(async (options: ProviderStreamOptions) => options.onTextDelta("Should not run"));
    const task = coordinator.startTurn({ threadId: thread.id, prompt: "Read the attached context" });
    await vi.waitFor(() => expect(hooks.mentions).toHaveBeenCalled());
    coordinator.stopTurn(thread.id);
    release("Prepared context");
    await task;
    expect(hooks.stream).not.toHaveBeenCalled();
    expect(store.listMessages(thread.id).at(-1)?.status).toBe("stopped");
    expect(coordinator.listActiveRuns()).toHaveLength(0);
  });

  it("releases initial running state when context preparation fails", async () => {
    const { thread, coordinator } = fixture();
    hooks.mentions.mockRejectedValueOnce(new Error("Context unavailable"));
    await expect(coordinator.startTurn({ threadId: thread.id, prompt: "Begin" })).rejects.toThrow("Context unavailable");
    expect(coordinator.listActiveRuns()).toHaveLength(0);
    expect(store.listMessages(thread.id).at(-1)?.status).toBe("failed");
    hooks.stream.mockImplementation(async (options: ProviderStreamOptions) => options.onTextDelta("Retry ready."));
    await coordinator.startTurn({ threadId: thread.id, prompt: "Try again" });
    expect(store.listMessages(thread.id).at(-1)?.status).toBe("completed");
  });

  it("remains stopped if a provider resolves normally after cancellation and sends late text", async () => {
    const { thread, coordinator } = fixture();
    hooks.stream.mockImplementation(async (options: ProviderStreamOptions) => {
      options.onTextDelta("Already visible.");
      await new Promise<void>((resolve) => options.signal.addEventListener("abort", () => {
        options.onTextDelta(" Late discarded text.");
        resolve();
      }, { once: true }));
    });
    const task = coordinator.startTurn({ threadId: thread.id, prompt: "Begin" });
    await vi.waitFor(() => expect(hooks.stream).toHaveBeenCalled());
    coordinator.stopTurn(thread.id);
    await task;
    const assistant = store.listMessages(thread.id).at(-1)!;
    expect(assistant.status).toBe("stopped");
    expect(assistant.content).not.toContain("Late discarded");
    expect(coordinator.listActiveRuns()).toHaveLength(0);
  });

  it("does not carry an unapplied steer into the next independent turn twice", async () => {
    const { thread, coordinator } = fixture();
    let release!: () => void;
    hooks.stream.mockImplementationOnce(async (options: ProviderStreamOptions) => {
      options.onToolCall({ id: "read-one", name: "desktop_list_dir", arguments: {} });
      await new Promise<void>((resolve) => { release = resolve; });
    });
    const task = coordinator.startTurn({ threadId: thread.id, prompt: "Begin" });
    await vi.waitFor(() => expect(hooks.stream).toHaveBeenCalled());
    const turnId = store.listMessages(thread.id).find((message) => message.role === "assistant")!.id;
    await coordinator.steerTurn({ threadId: thread.id, expectedTurnId: turnId, prompt: "Unique pending steer" });
    coordinator.stopTurn(thread.id);
    release();
    await task;
    hooks.stream.mockImplementationOnce(async (options: ProviderStreamOptions) => {
      expect(options.messages.filter((message) => message.content === "Unique pending steer")).toHaveLength(1);
      options.onTextDelta("Follow-up ready.");
    });
    await coordinator.startTurn({ threadId: thread.id, prompt: "Independent follow-up" });
    expect(store.listMessages(thread.id).at(-1)?.status).toBe("completed");
  });

  it("drains already-started tools and checkpoints their results when model streaming fails", async () => {
    const { thread, coordinator } = fixture();
    let release!: (result: ToolResult) => void;
    const execute = vi.spyOn(coordinator as unknown as { executeTool: () => Promise<ToolResult> }, "executeTool")
      .mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    hooks.stream.mockImplementation(async (options: ProviderStreamOptions) => {
      options.onToolCall({ id: "read-boundary", name: "desktop_list_dir", arguments: {} });
      await vi.waitFor(() => expect(execute).toHaveBeenCalled());
      throw new Error("Provider disconnected after tool delivery");
    });
    let finished = false;
    const task = coordinator.startTurn({ threadId: thread.id, prompt: "Begin" }).then(() => { finished = true; });
    await vi.waitFor(() => expect(execute).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 80));
    const endedBeforeTool = finished;
    release({ success: true, output: "Retained completed result" });
    await task;
    await coordinator.waitForIdle();
    expect(endedBeforeTool).toBe(false);
    const checkpoint = store.getRunCheckpoint(thread.id);
    expect(JSON.stringify(checkpoint?.history)).toContain("Retained completed result");
    expect(store.listMessages(thread.id).at(-1)?.status).toBe("failed");
  });

  it("rejects a steer whose context finishes after Stop instead of losing its queued prompt", async () => {
    const { thread, coordinator } = fixture();
    hooks.stream.mockImplementation(async (options: ProviderStreamOptions) => {
      options.onTextDelta("Working.");
      await new Promise<void>((resolve) => options.signal.addEventListener("abort", () => resolve(), { once: true }));
    });
    const task = coordinator.startTurn({ threadId: thread.id, prompt: "Begin" });
    await vi.waitFor(() => expect(hooks.stream).toHaveBeenCalled());
    const turnId = store.listMessages(thread.id).find((message) => message.role === "assistant")!.id;
    let release!: (text: string) => void;
    hooks.mentions.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const steering = coordinator.steerTurn({ threadId: thread.id, expectedTurnId: turnId, prompt: "Keep this queued" });
    coordinator.stopTurn(thread.id);
    release("");
    await expect(steering).rejects.toThrow(/queued/);
    await task;
    expect(store.listMessages(thread.id).some((message) => message.content === "Keep this queued")).toBe(false);
  });

  it("keeps the delivered tool response in the checkpoint when stopped at the tool boundary", async () => {
    const { thread, coordinator } = fixture();
    let release!: (result: ToolResult) => void;
    const execute = vi.spyOn(coordinator as unknown as { executeTool: () => Promise<ToolResult> }, "executeTool")
      .mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    hooks.stream.mockImplementation(async (options: ProviderStreamOptions) => {
      options.onToolCall({ id: "stop-boundary", name: "desktop_list_dir", arguments: {} });
    });
    const task = coordinator.startTurn({ threadId: thread.id, prompt: "Begin" });
    await vi.waitFor(() => expect(execute).toHaveBeenCalled());
    coordinator.stopTurn(thread.id);
    release({ success: true, output: "Already completed" });
    await task;
    const checkpoint = store.getRunCheckpoint(thread.id);
    expect(JSON.stringify(checkpoint?.history)).toContain("function_response");
    expect(JSON.stringify(checkpoint?.history)).toContain("stop-boundary");
    expect(checkpoint?.toolCount).toBe(1);
  });
});
