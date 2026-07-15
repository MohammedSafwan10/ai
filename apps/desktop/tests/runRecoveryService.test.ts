import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RunRecoveryService } from "../src/main/agent/harness/runRecoveryService";
import { DesktopStore } from "../src/main/db/store";

let tempDir = "";
let store: DesktopStore | null = null;

afterEach(() => {
  store?.close();
  store = null;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("RunRecoveryService", () => {
  it("keeps persisted approvals active after restart", () => {
    const db = createStore();
    const workspace = db.upsertWorkspace(tempDir);
    const thread = db.createThread(workspace.id);
    db.upsertMessage(message(thread.id, "awaiting_approval"));
    db.saveRunCheckpoint(checkpoint(thread.id, workspace.path));

    expect(new RunRecoveryService(db).activeRun(thread.id)).toMatchObject({
      status: "awaiting_approval",
      resumable: false,
    });
  });

  it("turns an interrupted plan question into a resumable stopped checkpoint", () => {
    const db = createStore();
    const workspace = db.upsertWorkspace(tempDir);
    const thread = db.createThread(workspace.id);
    db.upsertMessage(message(thread.id, "running"));
    db.upsertToolEvent({
      id: "tool-1",
      threadId: thread.id,
      messageId: "assistant-1",
      callId: "question-1",
      name: "request_user_input",
      title: "Ask question",
      args: {},
      status: "running",
      risk: "safe",
      createdAt: 1,
      updatedAt: 1,
    });
    db.saveRunCheckpoint({
      ...checkpoint(thread.id, workspace.path),
      pendingUserInput: {
        call: { id: "question-1", name: "request_user_input", arguments: {} },
        questions: [],
      },
    });

    const recovery = new RunRecoveryService(db);
    recovery.recoverInterruptedUserInputs();

    expect(db.getMessage("assistant-1")?.status).toBe("stopped");
    expect(db.findToolEventByCall(thread.id, "question-1")?.status).toBe("failed");
    expect(db.getRunCheckpoint(thread.id)?.pendingUserInput).toBeUndefined();
    expect(JSON.stringify(db.getRunCheckpoint(thread.id)?.history)).toContain("app restarted");
  });

  it("recovers an answered plan question without losing or duplicating its result", () => {
    const db = createStore();
    const workspace = db.upsertWorkspace(tempDir);
    const thread = db.createThread(workspace.id);
    db.upsertMessage(message(thread.id, "running"));
    db.upsertToolEvent({
      id: "tool-1",
      threadId: thread.id,
      messageId: "assistant-1",
      callId: "question-1",
      name: "request_user_input",
      title: "Ask question",
      args: {},
      status: "running",
      risk: "safe",
      createdAt: 1,
      updatedAt: 1,
    });
    const resolvedResult = {
      success: true,
      output: "A",
      data: { answers: { choice: { answers: ["A"] } } },
    };
    db.saveRunCheckpoint({
      ...checkpoint(thread.id, workspace.path),
      history: [{ role: "tool", toolCallId: "question-1", name: "request_user_input", content: JSON.stringify(resolvedResult) }],
      pendingUserInput: {
        call: { id: "question-1", name: "request_user_input", arguments: {} },
        questions: [],
        resolvedResult,
      },
    });

    new RunRecoveryService(db).recoverInterruptedUserInputs();

    expect(db.findToolEventByCall(thread.id, "question-1")?.status).toBe("done");
    expect(db.findToolEventByCall(thread.id, "question-1")?.result).toMatchObject({ success: true });
    expect(db.getRunCheckpoint(thread.id)?.history).toHaveLength(1);
    expect(db.getRunCheckpoint(thread.id)?.pendingUserInput).toBeUndefined();
  });

  it("cancels a persisted approval after restart", () => {
    const db = createStore();
    const workspace = db.upsertWorkspace(tempDir);
    const thread = db.createThread(workspace.id);
    db.upsertMessage(message(thread.id, "awaiting_approval"));
    db.upsertToolEvent({
      id: "tool-1",
      threadId: thread.id,
      messageId: "assistant-1",
      callId: "call-1",
      name: "exec_command",
      title: "Run command",
      args: { command: "npm test" },
      status: "awaiting_approval",
      risk: "risky",
      createdAt: 1,
      updatedAt: 1,
    });
    db.saveRunCheckpoint(checkpoint(thread.id, workspace.path));

    const cancelled = new RunRecoveryService(db).cancelPendingApproval(thread.id, "Stopped before approval.");

    expect(cancelled).toBe(true);
    expect(db.getMessage("assistant-1")?.status).toBe("stopped");
    expect(db.findToolEventByCall(thread.id, "call-1")?.status).toBe("stopped");
    expect(JSON.stringify(db.getRunCheckpoint(thread.id)?.history)).toContain("Stopped before approval");
  });
});

const createStore = () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-recovery-"));
  store = new DesktopStore(tempDir);
  return store;
};

const message = (threadId: string, status: "running" | "awaiting_approval") => ({
  id: "assistant-1",
  threadId,
  role: "assistant" as const,
  content: "",
  status,
  createdAt: 1,
  updatedAt: 1,
});

const checkpoint = (threadId: string, workspaceRoot: string) => ({
  version: 1 as const,
  threadId,
  assistantMessageId: "assistant-1",
  workspaceRoot,
  history: [{ role: "assistant", content: "", toolCalls: [{ id: "question-1", name: "request_user_input", arguments: {} }] }],
  assistantText: "",
  assistantThought: "",
  iteration: 1,
  toolCount: 0,
  recoveryAttempts: 0,
  model: "gpt-5.6-sol",
  reasoningEffort: "high" as const,
  collaborationMode: "plan" as const,
  agentHarnessMode: "standard" as const,
  lastProgressAt: 1,
  updatedAt: 1,
});
