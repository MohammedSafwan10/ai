import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ listeners: new Map<string, (...args: unknown[]) => void>(), ipc: new Map<string, () => unknown>(), install: vi.fn(), stat: vi.fn(), feed: vi.fn(), check: vi.fn(), exe: "C:/Privora/app-1.0/Privora.exe" }));
vi.mock("node:fs", () => ({ default: { statSync: mocked.stat } }));
vi.mock("electron", () => ({
  app: { isPackaged: true, getVersion: () => "1.0", getPath: () => mocked.exe },
  autoUpdater: { on: (name: string, callback: (...args: unknown[]) => void) => mocked.listeners.set(name, callback), setFeedURL: mocked.feed, checkForUpdates: mocked.check, quitAndInstall: mocked.install },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: (name: string, callback: () => unknown) => mocked.ipc.set(name, callback) },
}));
import { channels } from "../src/main/ipc/channels";

beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); mocked.listeners.clear(); mocked.ipc.clear(); mocked.install.mockReset();
  mocked.stat.mockReset(); mocked.feed.mockReset(); mocked.check.mockReset();
  mocked.stat.mockReturnValue({ isFile: () => true });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ version: "1.1" }) })));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("update installation shutdown gate", () => {
  it("marks portable packages unsupported and never invokes Squirrel", async () => {
    mocked.stat.mockImplementation(() => { throw new Error("ENOENT"); });
    const service = await import("../src/main/updateService"); service.installUpdateService();
    expect(service.getUpdateServiceStatus()).toMatchObject({ supported: false, state: "unsupported" });
    if (process.platform === "win32") expect(service.getUpdateServiceStatus().message).toMatch(/installed Windows build/);
    service.checkForUpdates(); await service.installDownloadedUpdate(); await vi.advanceTimersByTimeAsync(15_000);
    expect(mocked.feed).not.toHaveBeenCalled(); expect(mocked.check).not.toHaveBeenCalled(); expect(mocked.install).not.toHaveBeenCalled();
  });
  it("supports installed builds with a real parent Squirrel updater", async () => {
    if (process.platform !== "win32") return;
    mocked.stat.mockImplementation((filename: string) => ({ isFile: () => filename.replace(/\\/g, "/") === "C:/Privora/Update.exe" }));
    const service = await import("../src/main/updateService"); service.installUpdateService();
    expect(service.getUpdateServiceStatus().supported).toBe(true); expect(mocked.feed).toHaveBeenCalledOnce();
  });
  it("rejects a directory named Update.exe", async () => {
    mocked.stat.mockReturnValue({ isFile: () => false });
    const service = await import("../src/main/updateService"); service.installUpdateService();
    expect(service.getUpdateServiceStatus().supported).toBe(false);
  });
  it("routes renderer installation through cancellation and leaves a cancelled update ready", async () => {
    const service = await import("../src/main/updateService");
    const before = vi.fn(); const gate = vi.fn(async () => false);
    service.installUpdateService({ onRequestInstall: gate, onBeforeInstall: before });
    mocked.listeners.get("update-downloaded")?.({}, "", "1.1", "today");
    const status = await mocked.ipc.get(channels.installUpdate)?.() as { state: string };
    expect(gate).toHaveBeenCalledOnce(); expect(before).not.toHaveBeenCalled(); expect(mocked.install).not.toHaveBeenCalled(); expect(status.state).toBe("ready");
  });
  it("deduplicates install requests and waits for shutdown before notifying the updater", async () => {
    const service = await import("../src/main/updateService");
    let release!: (value: boolean) => void;
    const gate = vi.fn(() => new Promise<boolean>((resolve) => { release = resolve; })); const before = vi.fn();
    service.installUpdateService({ onRequestInstall: gate, onBeforeInstall: before });
    mocked.listeners.get("update-downloaded")?.({}, "", "1.1", "today");
    const first = service.installDownloadedUpdate(); const second = service.installDownloadedUpdate();
    expect(first).toBe(second); expect(mocked.install).not.toHaveBeenCalled(); expect(before).not.toHaveBeenCalled();
    release(true); expect((await first).state).toBe("installing"); expect(before).toHaveBeenCalledOnce(); expect(mocked.install).toHaveBeenCalledOnce();
  });
  it("does not let an updater event bypass the shutdown decision", async () => {
    const service = await import("../src/main/updateService"); const before = vi.fn();
    service.installUpdateService({ onBeforeInstall: before });
    mocked.listeners.get("before-quit-for-update")?.(); expect(before).not.toHaveBeenCalled();
  });
});
