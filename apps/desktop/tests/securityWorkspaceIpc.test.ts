import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentService } from "../src/main/agent/service";
import type { BrowserSessionManager } from "../src/main/browser/BrowserSessionManager";
import type { NotesStore } from "../src/main/notes/NotesStore";
import type { SecurityEnvironmentRecord, SecurityWorkspaceService } from "../src/shared/securityWorkspace";

const mocked = vi.hoisted(() => ({ directory: "", handlers: new Map<string, (...args: unknown[]) => unknown>(), pick: vi.fn() }));
vi.mock("electron", () => ({
  app: { isPackaged: false, getPath: () => mocked.directory },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: (name: string, handler: (...args: unknown[]) => unknown) => mocked.handlers.set(name, handler), on: vi.fn() },
  dialog: { showOpenDialog: mocked.pick }, Menu: {}, shell: {},
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
  mocked.handlers.clear(); mocked.pick.mockReset();
  store = new DesktopStore(mocked.directory); store.saveSecurityEnvironment(environment);
  state = { activeThreadId: null, activeWorkspaceId: null };
  service = { importEnvironmentProfile: vi.fn(async () => environment), checkEnvironment: vi.fn(async () => ({ ...environment, status: "connected" as const })), cancelJob: vi.fn(), };
  registerIpc(store, { listActiveRuns: () => [], getActiveRun: () => null, getTerminalState: () => null } as unknown as AgentService, state, {} as BrowserSessionManager, {} as NotesStore, undefined, { securityService: service });
});
afterEach(() => { store.close(); fs.rmSync(mocked.directory, { recursive: true, force: true }); });

describe("security workspace IPC", () => {
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
    expect(() => invoke(channels.createSecurityWorkspace, { ...input, objective: "" })).toThrow();
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
