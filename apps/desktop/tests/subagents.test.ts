import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentRuntime } from "../src/main/agent/runtime";
import { DesktopStore } from "../src/main/db/store";
import type { ChatMessageRecord, SubagentRecord } from "../src/shared/types";

let tempDir = "";

const createStore = () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-subagents-"));
  return new DesktopStore(tempDir);
};

afterEach(() => {
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = "";
});

describe("subagent topology", () => {
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
