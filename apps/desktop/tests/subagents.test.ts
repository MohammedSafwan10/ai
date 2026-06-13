import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentRuntime } from "../src/main/agent/runtime";
import { DesktopStore } from "../src/main/db/store";
import type { ChatMessageRecord, SubagentRecord } from "../src/shared/types";

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
  it("persists the inherited model on both the subagent and its hidden thread", () => {
    const store = createStore();
    store.saveSettings({ model: "gemini-3.5-flash" });
    const workspace = store.upsertWorkspace(tempDir);
    const rootThread = store.createThread(workspace.id);

    const agent = store.createSubagent({
      parentThreadId: rootThread.id,
      parentMessageId: "parent-message",
      workspaceId: workspace.id,
      taskName: "reviewer",
      agentPath: "/root/reviewer",
      prompt: "Review the workspace",
      model: "gpt-5.5",
    });

    expect(agent.model).toBe("gpt-5.5");
    expect(store.getThread(agent.threadId)?.model).toBe("gpt-5.5");
  });

  it("always inherits the active parent model when spawning", () => {
    const store = createStore();
    store.saveSettings({ model: "gemini-3.5-flash" });
    const workspace = store.upsertWorkspace(tempDir);
    const rootThread = store.createThread(workspace.id);
    const runtime = new AgentRuntime(store, () => null, () => ({
      activeThreadId: rootThread.id,
      activeWorkspaceId: workspace.id,
    }));
    (runtime as unknown as { startSubagentTurn: () => void }).startSubagentTurn = () => undefined;

    const result = (runtime as unknown as {
      spawnSubagent: (
        call: { arguments: Record<string, unknown> },
        workspaceRoot: string,
        parentThreadId: string,
        parentMessageId: string,
        parentRun: { model: string; reasoningEffort: string },
      ) => { success: boolean };
    }).spawnSubagent(
      {
        arguments: {
          taskName: "reviewer",
          message: "Review the workspace",
          model: "gemini-3.5-flash",
        },
      },
      workspace.path,
      rootThread.id,
      "parent-message",
      { model: "gpt-5.5", reasoningEffort: "high" },
    );

    const [agent] = store.listDirectSubagents(rootThread.id);
    expect(result.success).toBe(true);
    expect(agent.model).toBe("gpt-5.5");
    expect(store.getThread(agent.threadId)?.model).toBe("gpt-5.5");
  });

  it("uses the current parent model for legacy children saved with a different provider", () => {
    const store = createStore();
    store.saveSettings({ model: "gemini-3.5-flash" });
    const workspace = store.upsertWorkspace(tempDir);
    const rootThread = store.createThread(workspace.id);
    store.updateThreadSettings(rootThread.id, {
      model: "gpt-5.5",
      reasoningEffort: rootThread.reasoningEffort,
      collaborationMode: rootThread.collaborationMode,
    });
    const agent = store.createSubagent({
      parentThreadId: rootThread.id,
      parentMessageId: "parent-message",
      workspaceId: workspace.id,
      taskName: "legacy",
      agentPath: "/root/legacy",
      prompt: "Legacy task",
      model: "gemini-3.5-flash",
    });
    const runtime = new AgentRuntime(store, () => null, () => ({
      activeThreadId: rootThread.id,
      activeWorkspaceId: workspace.id,
    }));
    let selectedModel = "";
    (runtime as unknown as { continueLoop: (options: { model?: string }) => Promise<void> }).continueLoop = async (options) => {
      selectedModel = options.model || "";
    };

    (runtime as unknown as {
      runSubagentLoop: (
        agent: SubagentRecord,
        workspaceRoot: string,
        assistantMessage: ChatMessageRecord,
      ) => void;
    }).runSubagentLoop(agent, workspace.path, {
      id: "assistant",
      threadId: agent.threadId,
      role: "assistant",
      content: "",
      status: "running",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(selectedModel).toBe("gpt-5.5");
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

    const runtime = new AgentRuntime(store, () => null, () => ({
      activeThreadId: rootThread.id,
      activeWorkspaceId: workspace.id,
    }));
    const started: string[] = [];
    (runtime as unknown as { startExistingSubagentTurn: (agent: SubagentRecord, workspaceRoot: string) => void }).startExistingSubagentTurn = (queuedAgent, workspaceRoot) => {
      started.push(`${queuedAgent.threadId}:${workspaceRoot}`);
    };

    (runtime as unknown as { markSubagentFinished: (threadId: string, status: string, text: string) => void }).markSubagentFinished(agent.threadId, "completed", "Done");

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

    const runtime = new AgentRuntime(store, () => null, () => ({
      activeThreadId: rootThread.id,
      activeWorkspaceId: workspace.id,
    }));
    const started: string[] = [];
    (runtime as unknown as { startExistingSubagentTurn: (agent: SubagentRecord, workspaceRoot: string) => void }).startExistingSubagentTurn = (queuedAgent, workspaceRoot) => {
      started.push(`${queuedAgent.threadId}:${workspaceRoot}`);
    };

    (runtime as unknown as { markSubagentFinished: (threadId: string, status: string, text: string) => void }).markSubagentFinished(agent.threadId, "completed", "Done");

    expect(started).toEqual([]);
    expect(store.getSubagentByThread(agent.threadId)?.status).toBe("completed");
  });
});

describe("runtime safety guards", () => {
  it("rejects backend duplicate starts before creating extra messages", async () => {
    const store = createStore();
    const workspace = store.upsertWorkspace(tempDir);
    const thread = store.createThread(workspace.id);
    const runtime = new AgentRuntime(store, () => null, () => ({
      activeThreadId: thread.id,
      activeWorkspaceId: workspace.id,
    }));

    (runtime as unknown as { startingThreads: Set<string> }).startingThreads.add(thread.id);

    await expect(runtime.startTurn({ threadId: thread.id, prompt: "Hello" })).rejects.toThrow("already running");
    expect(store.listMessages(thread.id)).toHaveLength(0);
  });

  it("stops tracked terminal processes when a thread is stopped", () => {
    const store = createStore();
    const workspace = store.upsertWorkspace(tempDir);
    const thread = store.createThread(workspace.id);
    const runtime = new AgentRuntime(store, () => null, () => ({
      activeThreadId: thread.id,
      activeWorkspaceId: workspace.id,
    }));
    const stopped: number[] = [];
    (runtime as unknown as { tools: { stopTerminalProcess: (processId: number) => Promise<void> } }).tools.stopTerminalProcess = async (processId) => {
      stopped.push(processId);
    };

    (runtime as unknown as { trackThreadProcess: (threadId: string, processId: number) => void }).trackThreadProcess(thread.id, 42);
    runtime.stopTurn(thread.id);

    expect(stopped).toEqual([42]);
  });
});

describe("subagent waiting", () => {
  it("describes timeout as still waiting when child agents remain live", async () => {
    const store = createStore();
    const workspace = store.upsertWorkspace(tempDir);
    const rootThread = store.createThread(workspace.id);
    createSubagent(store, rootThread.id, "reviewer", "/root/reviewer");

    const runtime = new AgentRuntime(store, () => null, () => ({
      activeThreadId: rootThread.id,
      activeWorkspaceId: workspace.id,
    }));
    const result = await (runtime as unknown as {
      waitForSubagents: (
        call: { arguments: Record<string, unknown> },
        parentThreadId: string,
        signal: AbortSignal,
      ) => Promise<{ output?: string; data?: Record<string, unknown> }>;
    }).waitForSubagents({ arguments: { timeoutMs: 1 } }, rootThread.id, new AbortController().signal);

    expect(result.output).toContain("Still waiting on 1 live agent.");
    expect(result.output).not.toContain("Wait timed out.");
    expect(result.data?.timedOut).toBe(true);
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
