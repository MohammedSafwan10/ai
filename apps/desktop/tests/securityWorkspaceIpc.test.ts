import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentService } from "../src/main/agent/service";
import type { BrowserSessionManager } from "../src/main/browser/BrowserSessionManager";
import type { NotesStore } from "../src/main/notes/NotesStore";
import type { SecurityEnvironmentRecord, SecurityWorkspaceService } from "../src/shared/securityWorkspace";

const mocked = vi.hoisted(() => ({ directory: "", handlers: new Map<string, (...args: unknown[]) => unknown>(), pick: vi.fn(), trash: vi.fn() }));
vi.mock("electron", () => ({
  app: { isPackaged: false, getPath: () => mocked.directory },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: (name: string, handler: (...args: unknown[]) => unknown) => mocked.handlers.set(name, handler), on: vi.fn() },
  dialog: { showOpenDialog: mocked.pick }, Menu: {}, shell: { trashItem: mocked.trash },
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
  mocked.directory = fs.mkdtempSync(path.join(os.tmpdir(), "privora-security-ipc-"));
  mocked.handlers.clear(); mocked.pick.mockReset(); mocked.trash.mockReset();
  mocked.trash.mockImplementation(async (target: string) => { fs.renameSync(target, path.join(mocked.directory, "recycled-project")); });
  store = new DesktopStore(mocked.directory); store.saveSecurityEnvironment(environment);
  state = { activeThreadId: null, activeWorkspaceId: null };
  service = { importEnvironmentProfile: vi.fn(async () => environment), checkEnvironment: vi.fn(async () => ({ ...environment, status: "connected" as const })), cancelJob: vi.fn(), };
  registerIpc(store, { listActiveRuns: () => [], getActiveRun: () => null, getTerminalState: () => null } as unknown as AgentService, state, { clearWorkspaceProfileData: vi.fn() } as unknown as BrowserSessionManager, {} as NotesStore, undefined, { securityService: service });
});
afterEach(() => { store.close(); fs.rmSync(mocked.directory, { recursive: true, force: true }); });

describe("security workspace IPC", () => {
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
