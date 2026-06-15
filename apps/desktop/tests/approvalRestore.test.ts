import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ApprovalCoordinator } from "../src/main/agent/harness/approvalCoordinator";
import { DesktopStore } from "../src/main/db/store";
import type { AgentRunCheckpointRecord, ChatMessageRecord, ToolEventRecord } from "../src/shared/types";
import { toActiveRunState, type AgentRunTracker } from "../src/main/agent/runState";

let tempDir = "";
let store: DesktopStore | null = null;

const createStore = () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-approval-restore-"));
  store = new DesktopStore(tempDir);
  return store;
};

afterEach(() => {
  store?.close();
  store = null;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = "";
});

describe("approval restore", () => {
  it("restores grouped pending approvals with provider call ids after runtime loss", () => {
    const db = createStore();
    const workspace = db.upsertWorkspace(tempDir);
    const thread = db.createThread(workspace.id);
    db.updateThreadSettings(thread.id, {
      model: "gpt-5.5",
      reasoningEffort: "high",
      collaborationMode: "default",
      agentHarnessMode: "review_swarm",
    });
    const assistant = chatMessage("assistant-message", thread.id, "Need approval.");
    db.upsertMessage(assistant);
    db.upsertToolEvent(toolEvent("tool-1", thread.id, assistant.id, "provider-call:1/exec", "approval-group-1"));
    db.upsertToolEvent(toolEvent("tool-2", thread.id, assistant.id, "provider-call:2/exec", "approval-group-1"));
    db.saveRunCheckpoint(checkpoint(thread.id, assistant.id, workspace.path));

    const approvals = new ApprovalCoordinator(db);
    const bundle = approvals.restorePendingBundle(thread.id, "provider-call:1/exec", createRun);

    expect(bundle?.calls.map((call) => call.id)).toEqual(["provider-call:1/exec", "provider-call:2/exec"]);
    expect(bundle?.calls.map((call) => call.arguments.command)).toEqual(["npm test", "npm test"]);
    expect(bundle).toMatchObject({
      model: "gpt-5.5",
      reasoningEffort: "high",
      collaborationMode: "default",
      agentHarnessMode: "review_swarm",
    });
    expect(bundle?.run && toActiveRunState(bundle.run)).toMatchObject({
      assistantMessageId: assistant.id,
      status: "awaiting_approval",
      reason: "Restored pending approval.",
    });
  });

  it("does not replay a group call that was running when the app restarted", () => {
    const db = createStore();
    const workspace = db.upsertWorkspace(tempDir);
    const thread = db.createThread(workspace.id);
    const assistant = chatMessage("assistant-message", thread.id, "Need approval.");
    db.upsertMessage(assistant);
    db.upsertToolEvent({ ...toolEvent("tool-1", thread.id, assistant.id, "provider-call:1/exec", "approval-group-1"), status: "running" });
    db.upsertToolEvent(toolEvent("tool-2", thread.id, assistant.id, "provider-call:2/exec", "approval-group-1"));
    db.saveRunCheckpoint(checkpoint(thread.id, assistant.id, workspace.path));

    const bundle = new ApprovalCoordinator(db).restorePendingBundle(thread.id, "provider-call:2/exec", createRun);

    expect(bundle?.calls.map((call) => call.id)).toEqual(["provider-call:2/exec"]);
    expect(JSON.stringify(bundle?.history)).toContain("was not repeated automatically");
    expect(db.findToolEventByCall(thread.id, "provider-call:1/exec")?.status).toBe("failed");
    expect(JSON.stringify(db.getRunCheckpoint(thread.id)?.history)).toContain("was not repeated automatically");
  });

  it("restores the effective run configuration from checkpoint v1", () => {
    const db = createStore();
    db.saveSettings({ model: "gemini-3.5-flash", reasoningEffort: "low" });
    const workspace = db.upsertWorkspace(tempDir);
    const thread = db.createThread(workspace.id);
    const assistant = chatMessage("assistant-message", thread.id, "Need approval.");
    db.upsertMessage(assistant);
    db.upsertToolEvent(toolEvent("tool-1", thread.id, assistant.id, "provider-call:1/exec", "approval-group-1"));
    db.saveRunCheckpoint({
      ...checkpoint(thread.id, assistant.id, workspace.path),
      version: 1,
      model: "gpt-5.5",
      reasoningEffort: "high",
      collaborationMode: "plan",
      agentHarnessMode: "review_swarm",
    });

    const bundle = new ApprovalCoordinator(db).restorePendingBundle(thread.id, "provider-call:1/exec", createRun);

    expect(bundle).toMatchObject({
      model: "gpt-5.5",
      reasoningEffort: "high",
      collaborationMode: "plan",
      agentHarnessMode: "review_swarm",
    });
  });

  it("claims an approval group once until resolution releases it", () => {
    const db = createStore();
    const approvals = new ApprovalCoordinator(db);
    const bundle = {
      id: "group-1",
      threadId: "thread-1",
      assistantMessageId: "assistant-1",
      workspaceRoot: tempDir,
      calls: [],
      decisions: new Map(),
      history: [],
      assistantText: "",
      assistantThought: "",
      toolCount: 0,
      iteration: 0,
      recoveryAttempts: 0,
      run: createRun("thread-1", "assistant-1", new AbortController()),
    };

    expect(approvals.claim(bundle)).toBe(true);
    expect(approvals.claim(bundle)).toBe(false);
    approvals.release(bundle);
    expect(approvals.claim(bundle)).toBe(true);
  });
});

const createRun = (threadId: string, assistantMessageId: string, controller: AbortController): AgentRunTracker => ({
  threadId,
  assistantMessageId,
  controller,
  phase: "sampling",
  startedAt: 1,
  updatedAt: 1,
  iteration: 0,
  toolCount: 0,
  lastProgressAt: 1,
  recoveryAttempts: 0,
});

const chatMessage = (id: string, threadId: string, content: string): ChatMessageRecord => ({
  id,
  threadId,
  role: "assistant",
  content,
  status: "awaiting_approval",
  createdAt: 10,
  updatedAt: 10,
});

const toolEvent = (
  id: string,
  threadId: string,
  messageId: string,
  callId: string,
  approvalGroupId: string,
): ToolEventRecord => ({
  id,
  threadId,
  messageId,
  callId,
  name: "exec_command",
  title: "Run command",
  status: "awaiting_approval",
  risk: "risky",
  args: { command: "npm test" },
  approvalGroupId,
  createdAt: id === "tool-1" ? 11 : 12,
  updatedAt: id === "tool-1" ? 11 : 12,
});

const checkpoint = (threadId: string, assistantMessageId: string, workspaceRoot: string): AgentRunCheckpointRecord => ({
  threadId,
  assistantMessageId,
  workspaceRoot,
  history: [{ role: "user", content: "Please run checks.", parts: [{ type: "text", text: "Please run checks." }] }],
  assistantText: "Need approval.",
  assistantThought: "",
  iteration: 1,
  toolCount: 0,
  recoveryAttempts: 0,
  lastProgressAt: 13,
  updatedAt: 13,
});
