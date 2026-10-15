import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { DesktopStore } from "../src/main/db/store";
import { TurnUndoCoordinator } from "../src/main/agent/turnUndoCoordinator";
import { buildSidebarRows } from "../src/renderer/sidebarRows";

let root: string; let store: DesktopStore;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "privora-sidebar-")); store = new DesktopStore(path.join(root, "profile")); });
afterEach(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }); });
const normal = (name: string) => { const folder = path.join(root, name); fs.mkdirSync(folder); return store.upsertWorkspace(folder); };
const security = () => { store.saveSecurityEnvironment({ id: "kali", name: "Kali", host: "kali.example", port: 22, username: "test", status: "unchecked" }); return store.createSecurityWorkspace({ name: "Security", objective: "Inspect", scope: "Fixtures", environmentId: "kali" }); };

it("moves a normal chat and its completed child without changing history or files", async () => {
  const a = normal("a"); const b = normal("b"); const thread = store.createThread(a.id);
  fs.writeFileSync(path.join(a.path, "source.txt"), "retained");
  store.upsertMessage({ id: "old", threadId: thread.id, role: "user", content: "Original context", status: "completed", createdAt: 1, updatedAt: 1 });
  const child = store.createSubagent({ parentThreadId: thread.id, parentMessageId: "old", workspaceId: a.id, taskName: "review", agentPath: "/root/review", prompt: "Review" });
  store.updateSubagent(child.threadId, { status: "completed" });
  store.upsertApprovalScope({ id: "old-approval", workspaceId: a.id, threadId: thread.id, kind: "tool_thread", toolName: "desktop_write_file", createdAt: 1, updatedAt: 1, useCount: 0 });
  store.moveChat(thread.id, b.id);
  expect(store.getThread(thread.id)).toMatchObject({ workspaceId: b.id, lastWorkspaceMove: { fromPath: a.path, toPath: b.path } });
  expect(store.getThread(child.threadId)?.workspaceId).toBe(b.id);
  expect(store.getSubagentByThread(child.threadId)?.workspaceId).toBe(b.id);
  expect(store.listMessages(thread.id)[0].content).toBe("Original context");
  expect(fs.readFileSync(path.join(a.path, "source.txt"), "utf8")).toBe("retained");
  expect(fs.existsSync(path.join(b.path, "source.txt"))).toBe(false);
  expect(store.listApprovalScopes(a.id, thread.id)).toEqual([]);
  const undo = new TurnUndoCoordinator(store, () => false);
  expect(undo.prepare("old")).toBeNull();
  await expect(undo.rewind("old")).rejects.toThrow("previous project");
  await expect(undo.undo("old")).rejects.toThrow("previous project");
});

it("rejects both directions of Security moves and leaves ownership unchanged", () => {
  const a = normal("a"); const s = security();
  const normalChat = store.createThread(a.id); const secureChat = store.createThread(s.id);
  expect(() => store.moveChat(normalChat.id, s.id)).toThrow("Security chats stay");
  expect(() => store.moveChat(secureChat.id, a.id)).toThrow("Security chats stay");
  expect(store.getThread(normalChat.id)?.workspaceId).toBe(a.id);
  expect(store.getThread(secureChat.id)?.workspaceId).toBe(s.id);
});

it("blocks pending children before making any ownership changes", () => {
  const a = normal("a"); const b = normal("b"); const thread = store.createThread(a.id);
  store.createSubagent({ parentThreadId: thread.id, parentMessageId: "turn", workspaceId: a.id, taskName: "review", agentPath: "/root/review", prompt: "Review" });
  expect(() => store.moveChat(thread.id, b.id)).toThrow("pending subagents");
  expect(store.getThread(thread.id)?.workspaceId).toBe(a.id);
});

it("keeps a resumable run bound to its original workspace", () => {
  const a = normal("a"); const b = normal("b"); const thread = store.createThread(a.id);
  store.saveRunCheckpoint({ threadId: thread.id, assistantMessageId: "turn", workspaceRoot: a.path, history: [], assistantText: "", assistantThought: "", iteration: 1, toolCount: 0, recoveryAttempts: 0, lastProgressAt: 1, updatedAt: 1 });
  expect(() => store.moveChat(thread.id, b.id)).toThrow("resumable runs");
  expect(store.getRunCheckpoint(thread.id)?.workspaceRoot).toBe(a.path);
});

it("persists relative project order without changing opening timestamps", () => {
  const a = normal("a"); const b = normal("b"); const c = normal("c");
  store.reorderWorkspace({ id: a.id, targetId: c.id, position: "before" });
  const order = store.listWorkspaces().map((workspace) => workspace.id);
  expect(order.indexOf(a.id) + 1).toBe(order.indexOf(c.id));
  expect(store.getWorkspace(a.id)?.lastOpenedAt).toBe(a.lastOpenedAt);
  store.close(); store = new DesktopStore(path.join(root, "profile"));
  expect(store.listWorkspaces().map((workspace) => workspace.id)).toEqual(order);
  expect(() => store.reorderWorkspace({ id: b.id, targetId: "missing", position: "after" })).toThrow("no longer exists");
});

it("filters entire project groups while keeping search and collapse behavior", () => {
  const a = normal("a"); const s = security(); const t = store.createThread(s.id); store.updateThreadTitle(t.id, "Research");
  const input = { workspaces: store.listWorkspaces(), threads: store.listThreads(), query: "", collapsedGroups: new Set<string>() };
  expect(buildSidebarRows({ ...input, filter: "security" }).filter((row) => row.type === "project").map((row) => row.workspace.id)).toEqual([s.id]);
  expect(buildSidebarRows({ ...input, filter: "normal" }).filter((row) => row.type === "project").map((row) => row.workspace.id)).toEqual([a.id]);
  expect(buildSidebarRows({ ...input, filter: "security", collapsedGroups: new Set([s.id]) })).toHaveLength(1);
  expect(buildSidebarRows({ ...input, filter: "security", query: "Research" }).some((row) => row.type === "thread")).toBe(true);
});
