import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentService } from "../src/main/agent/service";
import type { BrowserSessionManager } from "../src/main/browser/BrowserSessionManager";
import type { NotesStore } from "../src/main/notes/NotesStore";
import type { SecurityEnvironmentRecord, SecurityWorkspaceService } from "../src/shared/securityWorkspace";

const mocked = vi.hoisted(() => ({ directory: "", focused: false, handlers: new Map<string, (...args: unknown[]) => unknown>(), pick: vi.fn(), trash: vi.fn(), openPath: vi.fn() }));
vi.mock("electron", () => ({
  app: { isPackaged: false, getPath: () => mocked.directory },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => ({ isFocused: () => mocked.focused, isMinimized: () => false, isVisible: () => true }) },
  ipcMain: { handle: (name: string, handler: (...args: unknown[]) => unknown) => mocked.handlers.set(name, handler), on: vi.fn() },
  dialog: { showOpenDialog: mocked.pick }, Menu: {}, shell: { trashItem: mocked.trash, openPath: mocked.openPath },
}));
import { DesktopStore } from "../src/main/db/store";
import { registerIpc, type IpcState } from "../src/main/ipc/register";
import { channels } from "../src/main/ipc/channels";

let store: DesktopStore;
let service: SecurityWorkspaceService;
let state: IpcState;
const environment: SecurityEnvironmentRecord = { id: "kali", name: "Kali", host: "192.168.1.13", port: 2222, username: "privora", status: "unchecked" };
const invoke = (name: string, ...args: unknown[]) => mocked.handlers.get(name)?.({}, ...args);
beforeEach(() => {
  mocked.focused = false;
  mocked.directory = fs.mkdtempSync(path.join(os.tmpdir(), "privora-security-ipc-"));
  mocked.handlers.clear(); mocked.pick.mockReset(); mocked.trash.mockReset(); mocked.openPath.mockReset(); mocked.openPath.mockResolvedValue("");
  mocked.trash.mockImplementation(async (target: string) => { fs.renameSync(target, path.join(mocked.directory, "recycled-project")); });
  store = new DesktopStore(mocked.directory); store.saveSecurityEnvironment(environment);
  state = { activeThreadId: null, activeWorkspaceId: null };
  service = { importEnvironmentProfile: vi.fn(async () => environment), checkEnvironment: vi.fn(async () => ({ ...environment, status: "connected" as const })), cancelJob: vi.fn(), };
  registerIpc(store, { listActiveRuns: () => [], getActiveRun: () => null, getTerminalState: () => null, clearInactiveRun: vi.fn() } as unknown as AgentService, state, { clearWorkspaceProfileData: vi.fn() } as unknown as BrowserSessionManager, {} as NotesStore, undefined, { securityService: service });
});
afterEach(() => { store.close(); fs.rmSync(mocked.directory, { recursive: true, force: true }); });

describe("security workspace IPC", () => {
  it("validates saved composer drafts and clears only the accepted revision", () => {
    const thread = store.createThread(null);
    const draft = { revision: "current", text: "not sent", attachments: [], contextMentions: [], pastedBlocks: [] };
    invoke(channels.saveComposerDraft, thread.id, draft);
    expect(invoke(channels.getComposerDraft, thread.id)).toEqual(draft);
    invoke(channels.clearComposerDraft, thread.id, "older"); expect(invoke(channels.getComposerDraft, thread.id)).toEqual(draft);
    expect(() => invoke(channels.saveComposerDraft, thread.id, { ...draft, text: "x".repeat(1_000_001) })).toThrow();
    invoke(channels.clearComposerDraft, thread.id, draft.revision); expect(invoke(channels.getComposerDraft, thread.id)).toBeNull();
  });
  it("persists explicit chat navigation and clears the old project for a projectless chat", () => {
    const workspace = store.createSecurityWorkspace({ name: "Lab", objective: "Inspect", scope: "Fixtures", environmentId: "kali" });
    const lab = store.createThread(workspace.id); const plain = store.createThread(null);
    state.activeWorkspaceId = workspace.id; state.activeThreadId = lab.id;
    invoke(channels.setActiveThread, plain.id);
    expect(state.activeWorkspaceId).toBeNull();
    expect(store.restoreActiveSelection()).toEqual({ activeThreadId: plain.id, activeWorkspaceId: null });
  });
  it("keeps outcome recording operator-only and scoped to the selected Security project", () => {
    const workspace = store.createSecurityWorkspace({ name: "Lab", objective: "Inspect", scope: "Fixtures", environmentId: "kali" });
    store.upsertSecurityFinding({ id: "finding", workspaceId: workspace.id, title: "Candidate", description: "No proof", state: "candidate", severity: "info", reproduction: "", remediation: "", evidenceJobIds: [], createdAt: 1, updatedAt: 2 });
    expect(() => invoke(channels.recordSecurityReportEvent, "finding", 2, "submitted", "url")).toThrow("Choose this finding");
    state.activeWorkspaceId = workspace.id;
    expect(() => invoke(channels.recordSecurityReportEvent, "finding", 2, "submitted", "url")).toThrow("Complete report review");
    expect(() => invoke(channels.recordSecurityReportEvent, "finding", 2, "accepted", "")).toThrow();
    expect(store.getSecurityFinding("finding")?.reportEvents).toBeUndefined();
  });
  it("acknowledges a completion only in the focused active chat", () => {
    const thread = store.createThread(null); state.activeThreadId = thread.id;
    store.upsertMessage({ id: "completion", threadId: thread.id, role: "assistant", content: "Done", status: "completed", createdAt: 1, updatedAt: 1 });
    store.recordChatCompletion(thread.id, "completion");
    expect(invoke(channels.markChatCompletionRead, { threadId: thread.id, completionId: "completion" })).toBe(false);
    expect(store.unreadCompletionCount()).toBe(1);
    mocked.focused = true; state.activeThreadId = "another-chat";
    expect(invoke(channels.markChatCompletionRead, { threadId: thread.id, completionId: "completion" })).toBe(false);
    state.activeThreadId = thread.id;
    expect(invoke(channels.markChatCompletionRead, { threadId: thread.id, completionId: "completion" })).toBe(true);
    expect(store.unreadCompletionCount()).toBe(0);
  });
  it("validates and persists prompt-library actions without running an agent", () => {
    const saved = invoke(channels.savePrompt, { title: "Prepare", category: "Investigation", workspaceType: "all", content: "Read lessons only." }) as { id: string };
    expect(invoke(channels.listSavedPrompts)).toEqual(expect.arrayContaining([expect.objectContaining({ id: saved.id, content: "Read lessons only." })]));
    invoke(channels.updatePromptMetadata, { id: saved.id, title: "New name", pinned: true });
    expect(invoke(channels.getSavedPrompt, saved.id)).toMatchObject({ title: "New name", pinned: true, content: "Read lessons only." });
    expect(invoke(channels.querySavedPrompts, { pinnedOnly: true, limit: 10 })).toMatchObject({ total: 1, items: [expect.objectContaining({ id: saved.id })] });
    expect(() => invoke(channels.querySavedPrompts, { limit: 1000 })).toThrow();
    expect(() => invoke(channels.savePrompt, { title: "", category: "General", workspaceType: "all", content: "Text" })).toThrow();
    invoke(channels.deleteSavedPrompt, saved.id);
    expect(store.listSavedPrompts().some((item) => item.id === saved.id)).toBe(false);
  });
  it("opens only the active project's main-process evidence folder", async () => {
    const workspace = store.createSecurityWorkspace({ name: "Lab", objective: "Inspect", scope: "Fixtures", environmentId: "kali" });
    const folder = path.join(mocked.directory, "reports");
    service.ensureEvidenceFolder = vi.fn(async () => folder);
    state.activeWorkspaceId = workspace.id;
    await invoke(channels.openSecurityEvidenceFolder, workspace.id);
    expect(mocked.openPath).toHaveBeenCalledWith(folder);
    await expect(invoke(channels.openSecurityEvidenceFolder, "other-project")).rejects.toThrow("Choose this Security workspace");
  });
  it("accepts child model choices and null resets through settings IPC", () => {
    const root = store.createThread(null);
    invoke(channels.saveSettings, { subagentModel: "gemini-3.7-flash" });
    expect(store.getSettings().subagentModel).toBe("gemini-3.7-flash");
    invoke(channels.saveThreadSettings, { threadId: root.id, subagentModel: "gpt-5.6-sol" });
    expect(store.getThread(root.id)?.subagentModel).toBe("gpt-5.6-sol");
    invoke(channels.saveThreadSettings, { threadId: root.id, subagentModel: null });
    expect(store.getThread(root.id)?.subagentModel).toBeNull();
    expect(() => invoke(channels.saveThreadSettings, { threadId: root.id, subagentModel: "" })).toThrow();
    invoke(channels.saveThreadSettings, { threadId: root.id, subagentReasoningEffort: "high" });
    expect(store.getThread(root.id)?.subagentReasoningEffort).toBe("high");
    invoke(channels.saveThreadSettings, { threadId: root.id, subagentReasoningEffort: null });
    expect(store.getThread(root.id)?.subagentReasoningEffort).toBeNull();
  });
  it("renames projects without moving evidence and rejects stale boundary edits", () => {
    const workspace = store.createSecurityWorkspace({ name: "Original", objective: "Inspect", scope: "Local fixtures", environmentId: "kali" });
    invoke(channels.updateSecurityWorkspace, { workspaceId: workspace.id, expectedRevision: 0, name: "Renamed" });
    expect(store.getWorkspace(workspace.id)).toMatchObject({ name: "Renamed", path: workspace.path, security: { revision: 1, evidenceFolderName: "Original", scope: "Local fixtures" } });
    expect(() => invoke(channels.updateSecurityWorkspace, { workspaceId: workspace.id, expectedRevision: 0, scope: "Changed" })).toThrow("changed while");
    invoke(channels.updateSecurityWorkspace, { workspaceId: workspace.id, expectedRevision: 1, scope: "Revised fixtures" });
    expect(store.getWorkspace(workspace.id)?.security).toMatchObject({ revision: 2, scope: "Revised fixtures", evidenceFolderName: "Original" });
  });
  it("moves an idle normal chat and updates the active project, but blocks active runs", async () => {
    const sourcePath = path.join(mocked.directory, "source"); const destinationPath = path.join(mocked.directory, "destination");
    fs.mkdirSync(sourcePath); fs.mkdirSync(destinationPath);
    const a = store.upsertWorkspace(sourcePath); const b = store.upsertWorkspace(destinationPath); const thread = store.createThread(a.id);
    state.activeThreadId = thread.id; state.activeWorkspaceId = a.id;
    invoke(channels.moveChat, { threadId: thread.id, workspaceId: b.id });
    expect(state.activeWorkspaceId).toBe(b.id);
    registerIpc(store, { listActiveRuns: () => [{ threadId: thread.id, status: "running" }], getActiveRun: () => null, getTerminalState: () => null } as unknown as AgentService, state, {} as BrowserSessionManager, {} as NotesStore);
    expect(() => invoke(channels.moveChat, { threadId: thread.id, workspaceId: a.id })).toThrow("active chat");
    expect(store.getThread(thread.id)?.workspaceId).toBe(b.id);
  });
  it("reads a child transcript without switching chats and rejects another chat tree", async () => {
    const workspace = store.createSecurityWorkspace({ name: "Lab", objective: "Inspect", scope: "Fixtures", environmentId: "kali" });
    const root = store.createThread(workspace.id); const other = store.createThread(workspace.id);
    const child = store.createSubagent({ parentThreadId: root.id, parentMessageId: "message", workspaceId: workspace.id, taskName: "review", agentPath: "/root/review", prompt: "Review" });
    state.activeThreadId = root.id;
    expect(invoke(channels.getSubagentHistory, { parentThreadId: root.id, threadId: child.threadId })).toMatchObject({ page: { threadId: child.threadId } });
    expect(state.activeThreadId).toBe(root.id);
    const pending = { call: { id: "question", name: "request_user_input" as const, arguments: {} }, questions: [{ id: "route", header: "Route", question: "Which route?", options: [] }] };
    const checkpoint = { threadId: child.threadId, assistantMessageId: "child-answer", workspaceRoot: workspace.path, history: [], assistantText: "", assistantThought: "", iteration: 1, toolCount: 1, recoveryAttempts: 0, lastProgressAt: 1, pendingUserInput: pending, updatedAt: 1 };
    vi.spyOn(store, "getRunCheckpoint").mockReturnValue(checkpoint);
    registerIpc(store, { listActiveRuns: () => [], getActiveRun: () => ({ threadId: child.threadId, assistantMessageId: "child-answer", status: "waiting_tool" }), getTerminalState: () => null } as unknown as AgentService, state, {} as BrowserSessionManager, {} as NotesStore);
    expect(invoke(channels.getSubagentHistory, { parentThreadId: root.id, threadId: child.threadId })).toMatchObject({ pendingInput: { callId: "question", threadId: child.threadId, questions: pending.questions } });
    vi.spyOn(store, "getRunCheckpoint").mockReturnValue({ ...checkpoint, pendingUserInput: { ...pending, resolvedResult: { success: true } } });
    expect(invoke(channels.getSubagentHistory, { parentThreadId: root.id, threadId: child.threadId })).toMatchObject({ pendingInput: null });
    expect(() => invoke(channels.getSubagentHistory, { parentThreadId: other.id, threadId: child.threadId })).toThrow("selected chat");
  });
  it("recycles only the app-owned project directory and preserves its evidence", async () => {
    const workspace = store.createSecurityWorkspace({ name: "Lab", objective: "Inspect", scope: "Fixtures", environmentId: "kali" });
    fs.writeFileSync(path.join(workspace.path, "evidence", "report.txt"), "saved evidence");
    await invoke(channels.removeWorkspace, workspace.id);
    expect(mocked.trash).toHaveBeenCalledWith(workspace.path);
    expect(store.getWorkspace(workspace.id)).toBeNull();
    expect(fs.readFileSync(path.join(mocked.directory, "recycled-project", "evidence", "report.txt"), "utf8")).toBe("saved evidence");
  });
  it("retains the project when recycling fails", async () => {
    const workspace = store.createSecurityWorkspace({ name: "Lab", objective: "Inspect", scope: "Fixtures", environmentId: "kali" });
    mocked.trash.mockRejectedValue(new Error("Recycle failed"));
    await expect(invoke(channels.removeWorkspace, workspace.id)).rejects.toThrow("Recycle failed");
    expect(store.getWorkspace(workspace.id)).not.toBeNull();
    expect(fs.existsSync(workspace.path)).toBe(true);
  });
  it("rejects a stored path pointing at another project", async () => {
    const workspace = store.createSecurityWorkspace({ name: "Lab", objective: "Inspect", scope: "Fixtures", environmentId: "kali" });
    const other = store.createSecurityWorkspace({ name: "Other", objective: "Inspect", scope: "Fixtures", environmentId: "kali" });
    vi.spyOn(store, "getWorkspace").mockImplementation((id) => id === workspace.id ? { ...workspace, path: other.path } : other);
    await expect(invoke(channels.removeWorkspace, workspace.id)).rejects.toThrow("Unexpected Security project directory");
    expect(mocked.trash).not.toHaveBeenCalled();
    expect(fs.existsSync(other.path)).toBe(true);
  });
  it("refuses a project directory replaced with a junction", async () => {
    const workspace = store.createSecurityWorkspace({ name: "Lab", objective: "Inspect", scope: "Fixtures", environmentId: "kali" });
    const held = path.join(mocked.directory, "held-project");
    fs.renameSync(workspace.path, held);
    fs.symlinkSync(held, workspace.path, "junction");
    await expect(invoke(channels.removeWorkspace, workspace.id)).rejects.toThrow("Unsafe Security project directory");
    expect(mocked.trash).not.toHaveBeenCalled();
    expect(store.getWorkspace(workspace.id)).not.toBeNull();
  });
  it("deletes a chat with unknown jobs while retaining project-level recovery records", async () => {
    const workspace = store.createSecurityWorkspace({ name: "Lab", objective: "Inspect", scope: "Fixtures", environmentId: "kali" });
    const thread = store.createThread(workspace.id);
    state.activeThreadId = thread.id;
    state.activeWorkspaceId = workspace.id;
    const job = { id: "uncertain-job", remoteJobId: null, workspaceId: workspace.id, threadId: thread.id, environmentId: "kali", idempotencyKey: "stable", projectId: "project", state: "unknown" as const, sequence: 0, outputPreview: "", commandPreview: "id", exitCode: null, error: "SSH timeout", createdAt: 1, updatedAt: 1 };
    store.upsertSecurityJob(job);
    await invoke(channels.deleteThread, thread.id);
    expect(store.getThread(thread.id)).toBeNull();
    expect(store.getSecurityJob(job.id)).toMatchObject({ state: "unknown", idempotencyKey: "stable", threadId: thread.id });
    expect(state.activeThreadId).not.toBe(thread.id);
    expect(store.getThread(state.activeThreadId!)?.workspaceId).toBe(workspace.id);
    expect(service.cancelJob).not.toHaveBeenCalled();
  });

  it("deletes a finished chat while preserving an independently tracked remote job", async () => {
    const workspace = store.createSecurityWorkspace({ name: "Lab", objective: "Inspect", scope: "Fixtures", environmentId: "kali" });
    const thread = store.createThread(workspace.id);
    store.upsertSecurityJob({ id: "running-job", remoteJobId: "remote", workspaceId: workspace.id, threadId: thread.id, environmentId: "kali", idempotencyKey: "stable", projectId: "project", state: "running", sequence: 0, outputPreview: "", commandPreview: "sleep", exitCode: null, error: null, createdAt: 1, updatedAt: 1 });
    await invoke(channels.deleteThread, thread.id);
    expect(store.getThread(thread.id)).toBeNull();
    expect(store.getSecurityJob("running-job")?.state).toBe("running");
    expect(service.cancelJob).not.toHaveBeenCalled();
  });
  it("imports profiles through a file picker and returns only the public service result", async () => {
    const filename = path.join(mocked.directory, "profile.json");
    const profile = { identityFile: "main-only/path", id: "kali" };
    fs.writeFileSync(filename, JSON.stringify(profile));
    mocked.pick.mockResolvedValue({ canceled: false, filePaths: [filename] });
    expect(await invoke(channels.importKaliEnvironmentProfile)).toEqual(environment);
    expect(service.importEnvironmentProfile).toHaveBeenCalledWith(profile);
    mocked.pick.mockResolvedValue({ canceled: true, filePaths: [] });
    expect(await invoke(channels.importKaliEnvironmentProfile)).toBeNull();
  });
  it("creates a separate security thread, validates input, and returns bounded workspace state", async () => {
    const input = { name: "Lab", objective: "Inspect", scope: "Fixtures", environmentId: "kali" };
    const workspace = await invoke(channels.createSecurityWorkspace, input) as { id: string; type: string };
    expect(workspace.type).toBe("security");
    expect(state.activeWorkspaceId).toBe(workspace.id);
    expect(store.getThread(state.activeThreadId!)?.workspaceId).toBe(workspace.id);
    expect(await invoke(channels.getSecurityWorkspaceState, workspace.id)).toEqual({ environment, jobs: [], findings: [] });
    expect(() => invoke(channels.createSecurityWorkspace, { ...input, objective: "", scope: "" })).toThrow();
    expect(() => invoke(channels.createSecurityWorkspace, { ...input, objective: "x".repeat(12_000), scope: "y".repeat(12_000) })).not.toThrow();
    expect(() => invoke(channels.createSecurityWorkspace, { ...input, identityFile: "secret" })).toThrow();
    await expect(invoke(channels.getSecurityWorkspaceState, "missing")).rejects.toThrow(/not found/);
  });
  it("refuses oversized profiles before handing them to the connection service", async () => {
    const filename = path.join(mocked.directory, "large.json"); fs.writeFileSync(filename, " ".repeat(70_000));
    mocked.pick.mockResolvedValue({ canceled: false, filePaths: [filename] });
    await expect(invoke(channels.importKaliEnvironmentProfile)).rejects.toThrow(/64 KB/);
    expect(service.importEnvironmentProfile).not.toHaveBeenCalled();
  });
  it("requires a persisted job before cancellation and checks environments through the service", async () => {
    expect(() => invoke(channels.cancelSecurityJob, "missing")).toThrow(/not found/);
    expect(service.cancelJob).not.toHaveBeenCalled();
    expect(await invoke(channels.checkSecurityEnvironment, "kali")).toMatchObject({ status: "connected" });
    expect(service.checkEnvironment).toHaveBeenCalledWith("kali");
  });
});
