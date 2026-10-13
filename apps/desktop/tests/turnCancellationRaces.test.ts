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
