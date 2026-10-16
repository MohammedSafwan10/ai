import fs from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DesktopStore } from "../src/main/db/store";
import { TurnUndoCoordinator } from "../src/main/agent/turnUndoCoordinator";
import type { ChatMessageRecord, ToolEventRecord } from "../src/shared/types";

let root = "";
let store: DesktopStore;
const setup = (security = false) => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "privora-rewind-"));
  store = new DesktopStore(path.join(root, "profile"));
  if (security) store.saveSecurityEnvironment({ id: "kali", name: "Kali", host: "127.0.0.1", port: 2222, username: "privora", status: "connected" });
  const workspace = security ? store.createSecurityWorkspace({ name: "Lab", objective: "Test", scope: "Local", environmentId: "kali" }) : store.upsertWorkspace(root);
  const thread = store.createThread(workspace.id);
  const add = (id: string, role: "user" | "assistant", time: number) => {
    const message: ChatMessageRecord = { id, threadId: thread.id, role, content: id, status: "completed", createdAt: time, updatedAt: time };
    store.upsertMessage(message); return message;
  };
  add("older", "user", 0);
  add("prompt", "user", 1);
  add("answer", "assistant", 2);
  add("later", "user", 3);
  add("answer-2", "assistant", 4);
  const record = (id: string, messageId: string, previous: string, expectedCurrent: string, file = "file.txt", gitHeadBefore?: string) => {
    store.upsertToolEvent({ id, threadId: thread.id, messageId, callId: id, name: "desktop_write_file", title: "Write", status: "done", risk: "safe", args: {},
      result: { success: true, data: { gitHeadBefore, undo: { type: "restore_file", path: file, existed: true, previous, expectedCurrent } } }, createdAt: 2, updatedAt: 2 } as ToolEventRecord);
  };
  return { thread, add, record };
};
afterEach(() => { store?.close(); if (root) fs.rmSync(root, { recursive: true, force: true }); });

describe("edit message rewind", () => {
  it("restores multiple turns in reverse order and removes their model context", async () => {
    const { thread, record } = setup();
    fs.writeFileSync(path.join(root, "file.txt"), "second");
    record("tool-1", "answer", "before", "first");
    record("tool-2", "answer-2", "first", "second");
    store.saveCompactionCheckpoint({ id: "summary", threadId: thread.id, workspaceRoot: root, model: "test", trigger: "pre_turn", reason: "context_limit", status: "completed", summary: "obsolete", replacementHistory: [], beforeTokens: 20, afterTokens: 10, createdAt: 5 });
    const result = await new TurnUndoCoordinator(store, () => false).rewind("prompt");
    expect(result.message.content).toBe("prompt");
    expect(result.removedMessageIds).toEqual(["prompt", "answer", "later", "answer-2"]);
    expect(fs.readFileSync(path.join(root, "file.txt"), "utf8")).toBe("before");
    expect(store.listMessages(thread.id).map((message) => message.id)).toEqual(["older"]);
    expect(store.listCompactionCheckpoints(thread.id)).toEqual([]);
    expect(store.getToolEvent("tool-1")).toBeNull();
  });
  it("preflights all files before undoing anything when manual edits conflict", async () => {
    const { thread, record } = setup();
    fs.writeFileSync(path.join(root, "file.txt"), "user changed this");
    fs.writeFileSync(path.join(root, "other.txt"), "second");
    record("tool-1", "answer", "before", "first");
    record("tool-2", "answer-2", "first", "second", "other.txt");
    await expect(new TurnUndoCoordinator(store, () => false).rewind("prompt")).rejects.toThrow("changed after");
    expect(fs.readFileSync(path.join(root, "other.txt"), "utf8")).toBe("second");
    expect(store.listMessages(thread.id)).toHaveLength(5);
  });
  it("rejects active runs without removing messages or changing files", async () => {
    const { thread } = setup();
    await expect(new TurnUndoCoordinator(store, () => true).rewind("prompt")).rejects.toThrow("Stop the current run");
    expect(store.listMessages(thread.id)).toHaveLength(5);
  });
  it("can rewind a conversation with no file mutations", async () => {
    const { thread } = setup();
    await new TurnUndoCoordinator(store, () => false).rewind("prompt");
    expect(store.listMessages(thread.id)).toHaveLength(1);
  });
  it("creates a reversing commit for recorded committed edits without including unrelated staged work", async () => {
    const { thread, record } = setup();
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();
    git("init", "-q"); git("config", "user.name", "Rewind test"); git("config", "user.email", "rewind@example.invalid");
    fs.writeFileSync(path.join(root, "file.txt"), "before");
    fs.writeFileSync(path.join(root, "other.txt"), "original");
    git("add", "file.txt", "other.txt"); git("commit", "-qm", "Before");
    const baseline = git("rev-parse", "HEAD");
    fs.writeFileSync(path.join(root, "file.txt"), "agent");
    record("tool-1", "answer", "before", "agent", "file.txt", baseline);
    git("add", "file.txt"); git("commit", "-qm", "Agent change");
    const agentCommit = git("rev-parse", "HEAD");
    fs.writeFileSync(path.join(root, "other.txt"), "manual staged edit");
    git("add", "other.txt");
    const result = await new TurnUndoCoordinator(store, () => false).rewind("prompt");
    expect(result.gitCommit).toBeTruthy();
    expect(git("rev-parse", "HEAD^")).toBe(agentCommit);
    expect(git("show", "HEAD:file.txt")).toBe("before");
    expect(git("show", "HEAD:other.txt")).toBe("original");
    expect(git("diff", "--cached", "--name-only")).toBe("other.txt");
    expect(fs.readFileSync(path.join(root, "other.txt"), "utf8")).toBe("manual staged edit");
    expect(store.listMessages(thread.id)).toHaveLength(1);
  });
  it("commits a reversed rename including the restored original filename", async () => {
    const { thread } = setup();
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();
    git("init", "-q"); git("config", "user.name", "Rewind test"); git("config", "user.email", "rewind@example.invalid");
    fs.writeFileSync(path.join(root, "old.txt"), "before");
    git("add", "old.txt"); git("commit", "-qm", "Before");
    const baseline = git("rev-parse", "HEAD");
    git("mv", "old.txt", "new.txt"); git("commit", "-qm", "Rename");
    store.upsertToolEvent({ id: "rename", threadId: thread.id, messageId: "answer", callId: "rename", name: "desktop_rename_path", title: "Rename", status: "done", risk: "safe", args: {},
      result: { success: true, data: { gitHeadBefore: baseline, undo: { type: "rename_path", fromPath: "new.txt", toPath: "old.txt" } } }, createdAt: 2, updatedAt: 2 } as ToolEventRecord);
    const result = await new TurnUndoCoordinator(store, () => false).rewind("prompt");
    expect(result.gitCommit).toBeTruthy();
    expect(git("ls-tree", "--name-only", "HEAD")).toBe("old.txt");
    expect(git("status", "--short", "--", "old.txt", "new.txt")).toBe("");
  });
  it("rejects a missing anchor instead of deleting any conversation", async () => {
    const { thread } = setup();
    await expect(new TurnUndoCoordinator(store, () => false).rewind("missing")).rejects.toThrow("user message");
    expect(store.listMessages(thread.id)).toHaveLength(5);
  });
  it("restores child-agent edits before removing their context", async () => {
    const { thread, record } = setup();
    const child = store.createSubagent({ parentThreadId: thread.id, parentMessageId: "answer", workspaceId: thread.workspaceId, taskName: "child", agentPath: "/root/child", prompt: "Edit" });
    store.upsertMessage({ id: "child-answer", threadId: child.threadId, role: "assistant", content: "Done", status: "completed", createdAt: 6, updatedAt: 6 });
    fs.writeFileSync(path.join(root, "file.txt"), "child");
    record("tool-1", "answer", "before", "parent");
    store.upsertToolEvent({ id: "child-tool", threadId: child.threadId, messageId: "child-answer", callId: "child-tool", name: "desktop_write_file", title: "Write", status: "done", risk: "safe", args: {},
      result: { success: true, data: { undo: { type: "restore_file", path: "file.txt", existed: true, previous: "parent", expectedCurrent: "child" } } }, createdAt: 6, updatedAt: 7 } as ToolEventRecord);
    await new TurnUndoCoordinator(store, () => false).rewind("prompt");
    expect(fs.readFileSync(path.join(root, "file.txt"), "utf8")).toBe("before");
    expect(store.getThread(child.threadId)).toBeNull();
    expect(store.listSubagents(thread.id)).toEqual([]);
  });
  it("preserves prompt attachments so they can be submitted after artifact pruning", async () => {
    setup();
    const message = store.getMessage("prompt")!;
    store.upsertMessage({ ...message, attachments: [{ id: "attachment", name: "sample.txt", mimeType: "text/plain", size: 6, artifactId: "", url: "", base64: Buffer.from("sample").toString("base64"), createdAt: 1 }] });
    const result = await new TurnUndoCoordinator(store, () => false).rewind("prompt");
    expect(result.message.attachments?.[0].url).toBe("data:text/plain;base64,c2FtcGxl");
    store.upsertMessage({ ...result.message, id: "edited", content: "Edited prompt" });
    expect(store.getMessage("edited")?.attachments?.[0].base64).toBe("c2FtcGxl");
  });
  it("does not attempt to rewind an inline steer independently", async () => {
    setup();
    const message = store.getMessage("later")!;
    store.upsertMessage({ ...message, steeredTurnId: "answer" });
    await expect(new TurnUndoCoordinator(store, () => false).rewind("later")).rejects.toThrow("original prompt");
  });
  it("blocks rewinding a security chat when a Kali job is in stop_requested state", async () => {
    setup();
    store.saveSecurityEnvironment({ id: "kali", name: "Kali", host: "127.0.0.1", port: 2222, username: "privora", status: "connected" });
    const secWorkspace = store.createSecurityWorkspace({ name: "Lab", objective: "Test", scope: "Local", environmentId: "kali" });
    const secThread = store.createThread(secWorkspace.id);
    store.upsertMessage({ id: "sec-prompt", threadId: secThread.id, role: "user", content: "Run check", status: "completed", createdAt: 1, updatedAt: 1 });
    store.upsertSecurityJob({ id: "job-stopping", remoteJobId: "remote-1", workspaceId: secWorkspace.id, threadId: secThread.id, environmentId: "kali", idempotencyKey: "key-1", projectId: "proj-1", state: "stop_requested", sequence: 0, outputPreview: "", commandPreview: "sleep 10", exitCode: null, error: null, createdAt: 1, updatedAt: 1 });
    await expect(new TurnUndoCoordinator(store, () => false).rewind("sec-prompt")).rejects.toThrow("Finish or reconcile the remaining Kali jobs");
  });
  it.each(["linked", "legacy"])("allows later edits while preserving an older %s unknown job and its context", async (link) => {
    const { thread } = setup(true);
    store.upsertSecurityJob({ id: "old-job", remoteJobId: "remote", workspaceId: thread.workspaceId!, threadId: thread.id, messageId: link === "linked" ? "older" : undefined, environmentId: "kali", idempotencyKey: "old-key", projectId: "project", state: "unknown", sequence: 0, outputPreview: "", commandPreview: "inspect", exitCode: null, error: "Remote job not found", createdAt: 0, updatedAt: 100 });
    await new TurnUndoCoordinator(store, () => false).rewind("later");
    expect(store.getSecurityJob("old-job")?.state).toBe("unknown");
    expect(store.getMessage("older")).not.toBeNull();
    expect(store.getMessage("later")).toBeNull();
  });
  it.each(["submitting", "queued", "running", "stop_requested", "unknown"] as const)("blocks %s jobs in the removed context without changing history", async (state) => {
    const { thread } = setup(true);
    store.upsertSecurityJob({ id: "job", remoteJobId: "remote", workspaceId: thread.workspaceId!, threadId: thread.id, messageId: "answer-2", environmentId: "kali", idempotencyKey: "key", projectId: "project", state, sequence: 0, outputPreview: "", commandPreview: "inspect", exitCode: null, error: null, createdAt: 4, updatedAt: 4 });
    await expect(new TurnUndoCoordinator(store, () => false).rewind("later")).rejects.toThrow("Check the project's Kali connection");
    expect(store.listMessages(thread.id)).toHaveLength(5);
    expect(store.getSecurityJob("job")?.state).toBe(state);
  });
  it("still blocks an older job known to be running", async () => {
    const { thread } = setup(true);
    store.upsertSecurityJob({ id: "job", remoteJobId: "remote", workspaceId: thread.workspaceId!, threadId: thread.id, messageId: "older", environmentId: "kali", idempotencyKey: "key", projectId: "project", state: "running", sequence: 0, outputPreview: "", commandPreview: "inspect", exitCode: null, error: null, createdAt: 0, updatedAt: 100 });
    await expect(new TurnUndoCoordinator(store, () => false).rewind("later")).rejects.toThrow("remaining Kali jobs");
  });
  it.each(["missing-source", "legacy-at-anchor", "removed-child"])("keeps ambiguous or removed unknown jobs blocked: %s", async (scenario) => {
    const { thread } = setup(true);
    const child = scenario === "removed-child" ? store.createSubagent({ parentThreadId: thread.id, parentMessageId: "answer-2", workspaceId: thread.workspaceId, taskName: "review", agentPath: "/root/review", prompt: "Inspect" }) : null;
    store.upsertSecurityJob({ id: "job", remoteJobId: "remote", workspaceId: thread.workspaceId!, threadId: child?.threadId || thread.id, messageId: scenario === "missing-source" ? "missing" : undefined, environmentId: "kali", idempotencyKey: "key", projectId: "project", state: "unknown", sequence: 0, outputPreview: "", commandPreview: "inspect", exitCode: null, error: null, createdAt: scenario === "legacy-at-anchor" ? 3 : 0, updatedAt: 100 });
    await expect(new TurnUndoCoordinator(store, () => false).rewind("later")).rejects.toThrow("remaining Kali jobs");
    expect(store.listMessages(thread.id)).toHaveLength(5);
    if (child) expect(store.getThread(child.threadId)).not.toBeNull();
  });
});
