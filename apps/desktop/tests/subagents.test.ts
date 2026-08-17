import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { reviewerReadOnlyBlockReason, VerificationEngine, type VerificationEnginePorts } from "../src/main/agent/harness/verificationEngine";
import { SubagentManager, resolveSubagentModel, type SubagentManagerPorts } from "../src/main/agent/harness/subagentManager";
import { ToolCallCoordinator } from "../src/main/agent/harness/toolCallCoordinator";
import { TurnRegistry } from "../src/main/agent/harness/turnRegistry";
import { DesktopStore } from "../src/main/db/store";
import type { AgentRunTracker } from "../src/main/agent/runState";
import type { ChatMessageRecord } from "../src/shared/types";

let tempDir = "";
let currentStore: DesktopStore | null = null;

const createStore = () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-subagents-"));
  currentStore = new DesktopStore(tempDir);
  return currentStore;
};

afterEach(() => {
  currentStore?.close();
  currentStore = null;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = "";
});

describe("subagent topology", () => {
  it("persists reviewer swarm mode on normal threads but disables it for hidden child threads", () => {
    const store = createStore();
    store.saveSettings({ agentHarnessMode: "review_swarm" });
    const workspace = store.upsertWorkspace(tempDir);
    const rootThread = store.createThread(workspace.id);

    expect(rootThread.agentHarnessMode).toBe("review_swarm");

    store.updateThreadSettings(rootThread.id, { agentHarnessMode: "standard" });
    expect(store.getThread(rootThread.id)?.agentHarnessMode).toBe("standard");

    const agent = store.createSubagent({
      parentThreadId: rootThread.id,
      parentMessageId: "parent-message",
      workspaceId: workspace.id,
      taskName: "reviewer",
      agentPath: "/root/reviewer",
      prompt: "Review the workspace",
    });

    expect(store.getThread(agent.threadId)?.agentHarnessMode).toBe("standard");
  });

  it("persists the inherited model on both the subagent and its hidden thread", () => {
    const store = createStore();
    store.saveSettings({ model: "gemini-3.7-flash" });
    const workspace = store.upsertWorkspace(tempDir);
    const rootThread = store.createThread(workspace.id);

    const agent = store.createSubagent({
      parentThreadId: rootThread.id,
      parentMessageId: "parent-message",
      workspaceId: workspace.id,
      taskName: "reviewer",
      agentPath: "/root/reviewer",
      prompt: "Review the workspace",
      model: "gpt-5.6-sol",
    });

    expect(agent.model).toBe("gpt-5.6-sol");
    expect(store.getThread(agent.threadId)?.model).toBe("gpt-5.6-sol");
  });

  it("always inherits the active parent model when spawning", async () => {
    const store = createStore();
    store.saveSettings({ model: "gemini-3.7-flash" });
    const workspace = store.upsertWorkspace(tempDir);
    const rootThread = store.createThread(workspace.id);
    const manager = new SubagentManager(store, subagentPorts());
    const result = await manager.execute(
      {
        id: "spawn",
        name: "spawn_agent",
        arguments: {
          taskName: "reviewer",
          message: "Review the workspace",
          model: "gemini-3.7-flash",
        },
      },
      {
        workspaceRoot: workspace.path,
        parentThreadId: rootThread.id,
        parentMessageId: "parent-message",
        parentRun: runTracker(rootThread.id, "parent-message", { model: "gpt-5.6-sol", reasoningEffort: "high" }),
        signal: new AbortController().signal,
      },
    );

    const [agent] = store.listDirectSubagents(rootThread.id);
    expect(result.success).toBe(true);
    expect(agent.model).toBe("gpt-5.6-sol");
    expect(store.getThread(agent.threadId)?.model).toBe("gpt-5.6-sol");
  });

  it("uses the current parent model for child turns", () => {
    const store = createStore();
    store.saveSettings({ model: "gemini-3.7-flash" });
    const workspace = store.upsertWorkspace(tempDir);
    const rootThread = store.createThread(workspace.id);
    store.updateThreadSettings(rootThread.id, {
      model: "gpt-5.6-sol",
      reasoningEffort: rootThread.reasoningEffort,
      collaborationMode: rootThread.collaborationMode,
    });
    const agent = store.createSubagent({
      parentThreadId: rootThread.id,
      parentMessageId: "parent-message",
      workspaceId: workspace.id,
      taskName: "child",
      agentPath: "/root/child",
      prompt: "Child task",
      model: "gemini-3.7-flash",
    });
    expect(resolveSubagentModel(store, agent)).toBe("gpt-5.6-sol");
  });

  it("separates direct children from descendants and does not include the parent as its own child", () => {
    const store = createStore();
    const workspace = store.upsertWorkspace(tempDir);
    const rootThread = store.createThread(workspace.id);
    const rootChild = createSubagent(store, rootThread.id, "reviewer", "/root/reviewer");
    const grandchild = createSubagent(store, rootChild.threadId, "tester", "/root/reviewer/tester");

    expect(store.listDirectSubagents(rootThread.id).map((agent) => agent.threadId)).toEqual([rootChild.threadId]);
    expect(store.listDirectSubagents(rootChild.threadId).map((agent) => agent.threadId)).toEqual([grandchild.threadId]);
    expect(store.listSubagents(rootChild.threadId).map((agent) => agent.threadId)).toEqual([grandchild.threadId]);
    expect(store.listSubagents(rootChild.threadId).map((agent) => agent.threadId)).not.toContain(rootChild.threadId);
  });

  it("deletes nested subagent records when deleting their root thread", () => {
    const store = createStore();
    const workspace = store.upsertWorkspace(tempDir);
    const rootThread = store.createThread(workspace.id);
    const rootChild = createSubagent(store, rootThread.id, "reviewer", "/root/reviewer");
    const grandchild = createSubagent(store, rootChild.threadId, "tester", "/root/reviewer/tester");

    store.deleteThread(rootThread.id);

    expect(store.getThread(rootThread.id)).toBeNull();
    expect(store.getThread(rootChild.threadId)).toBeNull();
    expect(store.getThread(grandchild.threadId)).toBeNull();
    expect(store.listSubagents().map((agent) => agent.threadId)).toEqual([]);
  });
});

describe("subagent queued turns", () => {
  it("starts the next child turn when a user task was queued during the previous assistant turn", () => {
    const store = createStore();
    const workspace = store.upsertWorkspace(tempDir);
    const rootThread = store.createThread(workspace.id);
    const agent = createSubagent(store, rootThread.id, "reviewer", "/root/reviewer");
    store.updateSubagent(agent.threadId, { status: "running" });
    upsertMessage(store, agent.threadId, "user-1", "user", "Initial task", 100);
    upsertMessage(store, agent.threadId, "assistant-1", "assistant", "Working", 101);
    upsertMessage(store, agent.threadId, "user-2", "user", "Queued task", 102);

    const started: string[] = [];
    const manager = new SubagentManager(store, subagentPorts({
      startExistingSubagentTurn: (queuedAgent, workspaceRoot) => started.push(`${queuedAgent.threadId}:${workspaceRoot}`),
    }));
    manager.markFinished(agent.threadId, "completed", "Done");

    expect(started).toEqual([`${agent.threadId}:${workspace.path}`]);
    expect(store.getSubagentByThread(agent.threadId)?.status).toBe("pending");
  });

  it("does not restart a completed child turn when no newer user task exists", () => {
    const store = createStore();
    const workspace = store.upsertWorkspace(tempDir);
    const rootThread = store.createThread(workspace.id);
    const agent = createSubagent(store, rootThread.id, "reviewer", "/root/reviewer");
    upsertMessage(store, agent.threadId, "user-1", "user", "Initial task", 100);
    upsertMessage(store, agent.threadId, "assistant-1", "assistant", "Done", 101);

    const started: string[] = [];
    const manager = new SubagentManager(store, subagentPorts({
      startExistingSubagentTurn: (queuedAgent, workspaceRoot) => started.push(`${queuedAgent.threadId}:${workspaceRoot}`),
    }));
    manager.markFinished(agent.threadId, "completed", "Done");

    expect(started).toEqual([]);
    expect(store.getSubagentByThread(agent.threadId)?.status).toBe("completed");
  });
});

describe("runtime safety guards", () => {
  it("rejects duplicate starts and releases the start guard exactly once", () => {
    const registry = new TurnRegistry();
    const release = registry.begin("thread-1", () => false);

    expect(() => registry.begin("thread-1", () => false)).toThrow("already running");
    release();
    release();
    expect(() => registry.begin("thread-1", () => false)).not.toThrow();
  });

  it("stops tracked terminal processes when a thread is stopped", () => {
    const store = createStore();
    const workspace = store.upsertWorkspace(tempDir);
    const thread = store.createThread(workspace.id);
    const stopped: number[] = [];
    const coordinator = new ToolCallCoordinator(undefined, undefined, undefined, undefined, {
      stopTerminalProcess: async (processId: number) => { stopped.push(processId); },
    } as never);
    coordinator.trackProcess(thread.id, 42);
    coordinator.stopThreadProcesses(thread.id);

    expect(stopped).toEqual([42]);
  });
});

describe("subagent waiting", () => {
  it("describes timeout as still waiting when child agents remain live", async () => {
    const store = createStore();
    const workspace = store.upsertWorkspace(tempDir);
    const rootThread = store.createThread(workspace.id);
    createSubagent(store, rootThread.id, "reviewer", "/root/reviewer");

    const manager = new SubagentManager(store, subagentPorts());
    const result = await manager.execute(
      { id: "wait", name: "wait_agent", arguments: { timeoutMs: 1 } },
      {
        workspaceRoot: workspace.path,
        parentThreadId: rootThread.id,
        parentMessageId: "parent-message",
        signal: new AbortController().signal,
      },
    );

    expect(result.output).toContain("Still waiting on 1 live agent.");
    expect(result.output).not.toContain("Wait timed out.");
    expect(result.data?.timedOut).toBe(true);
  });
});

describe("reviewer swarm harness", () => {
  it("starts exactly two read-only reviewers that inherit the parent model and reasoning effort", async () => {
    const store = createStore();
    store.saveSettings({ model: "gemini-3.7-flash", agentHarnessMode: "review_swarm" });
    const workspace = store.upsertWorkspace(tempDir);
    const rootThread = store.createThread(workspace.id);
    store.updateThreadSettings(rootThread.id, {
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      collaborationMode: "default",
      agentHarnessMode: "review_swarm",
    });
    const engine = new VerificationEngine(store, verificationPorts({
      startSubagentTurn: (agent) => {
        store.updateSubagent(agent.threadId, {
        status: "completed",
        finalMessage: "No blocking issues found.",
        lastPreview: "No blocking issues found.",
      });
      },
    }));

    const assistantMessage = chatMessage("parent-assistant", rootThread.id, "assistant", "Done");
    const feedback = await engine.verify({
      threadId: rootThread.id,
      assistantMessage,
      workspaceRoot: workspace.path,
      assistantText: "Done",
      iteration: 0,
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      collaborationMode: "default",
      run: runTracker(rootThread.id, assistantMessage.id),
      toolCount: 1,
      agentHarnessMode: "review_swarm",
    });

    const reviewers = store.listDirectSubagents(rootThread.id);
    expect(reviewers).toHaveLength(2);
    expect(feedback).toContain("Reviewer Swarm reports are ready.");
    expect(feedback).toContain("Write only the user-facing final response.");
    expect(feedback).toContain("No blocking issues found.");
    expect(reviewers.map((agent) => agent.model)).toEqual(["gpt-5.6-sol", "gpt-5.6-sol"]);
    expect(reviewers.map((agent) => agent.reasoningEffort)).toEqual(["high", "high"]);
    expect(reviewers.map((agent) => store.getThread(agent.threadId)?.agentHarnessMode)).toEqual(["standard", "standard"]);
    expect(reviewers.map((agent) => store.getThread(agent.threadId)?.collaborationMode)).toEqual(["plan", "plan"]);
  });

  it("does not recursively start reviewer swarms inside child agents", async () => {
    const store = createStore();
    const workspace = store.upsertWorkspace(tempDir);
    const rootThread = store.createThread(workspace.id);
    const engine = new VerificationEngine(store, verificationPorts());
    const assistantMessage = chatMessage("parent-assistant", rootThread.id, "assistant", "Done");

    const summary = await engine.verify({
      threadId: rootThread.id,
      parentThreadId: "parent-thread",
      assistantMessage,
      workspaceRoot: workspace.path,
      assistantText: "Done",
      iteration: 0,
      run: runTracker(rootThread.id, assistantMessage.id),
      toolCount: 1,
      agentHarnessMode: "review_swarm",
    });

    expect(summary).toBe("");
    expect(store.listDirectSubagents(rootThread.id)).toEqual([]);
  });

  it("reports reviewer startup failures without deadlocking the parent run", async () => {
    const store = createStore();
    const workspace = store.upsertWorkspace(tempDir);
    const rootThread = store.createThread(workspace.id);
    const engine = new VerificationEngine(store, verificationPorts({
      startSubagentTurn: () => { throw new Error("reviewer model unavailable"); },
    }));
    const assistantMessage = chatMessage("parent-assistant", rootThread.id, "assistant", "Done");

    const feedback = await engine.verify({
      threadId: rootThread.id,
      assistantMessage,
      workspaceRoot: workspace.path,
      assistantText: "Done",
      iteration: 0,
      run: runTracker(rootThread.id, assistantMessage.id),
      toolCount: 1,
      agentHarnessMode: "review_swarm",
    });

    expect(store.listDirectSubagents(rootThread.id)).toHaveLength(2);
    expect(feedback).toContain("Reviewer Swarm reports are ready.");
    expect(feedback).toContain("Reviewer 1 (failed)");
    expect(feedback).toContain("reviewer model unavailable");
  });

  it("blocks mutating tools for reviewer swarm agents while allowing read-only inspection", () => {
    expect(reviewerReadOnlyBlockReason({
      id: "read",
      name: "desktop_read_file",
      arguments: {},
    }, true)).toBe("");
    expect(reviewerReadOnlyBlockReason({
      id: "write",
      name: "desktop_write_file",
      arguments: {},
    }, true)).toContain("read-only");
    expect(reviewerReadOnlyBlockReason({
      id: "write",
      name: "desktop_write_file",
      arguments: {},
    }, false)).toBe("");
  });
});

const createSubagent = (store: DesktopStore, parentThreadId: string, taskName: string, agentPath: string) => {
  const agent = store.createSubagent({
    parentThreadId,
    parentMessageId: `${parentThreadId}-assistant`,
    workspaceId: store.getThread(parentThreadId)?.workspaceId ?? null,
    taskName,
    agentPath,
    prompt: `Task for ${taskName}`,
  });
  return store.updateSubagent(agent.threadId, { status: "running" }) || agent;
};

const upsertMessage = (
  store: DesktopStore,
  threadId: string,
  id: string,
  role: ChatMessageRecord["role"],
  content: string,
  timestamp: number,
) => store.upsertMessage({
  id,
  threadId,
  role,
  content,
  status: "completed",
  createdAt: timestamp,
  updatedAt: timestamp,
});

const chatMessage = (
  id: string,
  threadId: string,
  role: ChatMessageRecord["role"],
  content: string,
): ChatMessageRecord => ({
  id,
  threadId,
  role,
  content,
  status: "completed",
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const runTracker = (
  threadId: string,
  assistantMessageId: string,
  patch: Partial<AgentRunTracker> = {},
): AgentRunTracker => {
  const timestamp = Date.now();
  return {
    threadId,
    assistantMessageId,
    controller: new AbortController(),
    phase: "sampling",
    startedAt: timestamp,
    updatedAt: timestamp,
    iteration: 0,
    toolCount: 0,
    lastProgressAt: timestamp,
    recoveryAttempts: 0,
    ...patch,
  };
};

const subagentPorts = (patch: Partial<SubagentManagerPorts> = {}): SubagentManagerPorts => ({
  isRunActive: () => false,
  startSubagentTurn: () => undefined,
  startExistingSubagentTurn: () => undefined,
  appendUserMessage: () => undefined,
  stopThread: () => undefined,
  emitSnapshot: () => undefined,
  ...patch,
});

const verificationPorts = (patch: Partial<VerificationEnginePorts> = {}): VerificationEnginePorts => ({
  startSubagentTurn: () => undefined,
  stopSubagent: () => undefined,
  emitRun: () => undefined,
  emitSnapshot: () => undefined,
  emitEvent: () => undefined,
  ...patch,
});
