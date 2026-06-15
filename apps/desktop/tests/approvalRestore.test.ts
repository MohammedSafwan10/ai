import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentRuntime } from "../src/main/agent/runtime";
import { DesktopStore } from "../src/main/db/store";
import type { AgentRunCheckpointRecord, ChatMessageRecord, ToolEventRecord } from "../src/shared/types";

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

    const runtime = new AgentRuntime(db, () => null, () => ({
      activeThreadId: thread.id,
      activeWorkspaceId: workspace.id,
    }));
    const bundle = (runtime as unknown as {
      restorePendingApprovalBundle: (threadId: string, callId: string) => {
        calls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
        model?: string;
        reasoningEffort?: string;
        collaborationMode?: string;
        agentHarnessMode?: string;
      } | null;
    }).restorePendingApprovalBundle(thread.id, "provider-call:1/exec");

    expect(bundle?.calls.map((call) => call.id)).toEqual(["provider-call:1/exec", "provider-call:2/exec"]);
    expect(bundle?.calls.map((call) => call.arguments.command)).toEqual(["npm test", "npm test"]);
    expect(bundle).toMatchObject({
      model: "gpt-5.5",
      reasoningEffort: "high",
      collaborationMode: "default",
      agentHarnessMode: "review_swarm",
    });
    expect(runtime.getActiveRun(thread.id)).toMatchObject({
      assistantMessageId: assistant.id,
      status: "awaiting_approval",
      reason: "Restored pending approval.",
    });
  });
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
