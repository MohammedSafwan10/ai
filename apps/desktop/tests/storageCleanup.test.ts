import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StorageCleanupService } from "../src/main/storage/cleanup";
import { BrowserWorkflowManager } from "../src/main/browser/browserWorkflow";
import { canCleanStorageCategory } from "../src/renderer/components/StorageSettings";

const roots: string[] = [];

const makeRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "privora-storage-cleanup-"));
  roots.push(root);
  return root;
};

afterEach(() => {
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});

describe("storage cleanup service", () => {
  it("scans and cleans app-owned browser storage without deleting downloads", async () => {
    const root = makeRoot();
    const userDataPath = path.join(root, "userData");
    const downloadsPath = path.join(root, "Downloads");
    const artifactPath = path.join(userDataPath, "browser-artifacts", "workspace", "shot.png");
    const cachePath = path.join(userDataPath, "Partitions", "privora-browser_workspace", "Cache", "entry.bin");
    const downloadPath = path.join(downloadsPath, "Privora", "user-file.zip");
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
    fs.writeFileSync(artifactPath, Buffer.alloc(12));
    fs.writeFileSync(cachePath, Buffer.alloc(18));
    fs.writeFileSync(downloadPath, Buffer.alloc(24));
    fs.writeFileSync(path.join(userDataPath, "browser-workflows-v1.json"), JSON.stringify({
      workflows: [{ id: "wf1", workspaceId: "workspace", name: "Smoke", steps: [], assertions: [] }],
      runs: [{ id: "run1" }],
      evidence: [{ id: "ev1" }],
    }));
    const clearBrowserProfileData = vi.fn(async () => undefined);
    const service = new StorageCleanupService({ userDataPath, downloadsPath, clearBrowserProfileData });

    const before = await service.usage();
    expect(before.totalBytes).toBeGreaterThanOrEqual(54);
    expect(before.categories.find((category) => category.id === "browser_downloads")?.bytes).toBe(24);

    const result = await service.cleanup({ categoryIds: ["browser_artifacts", "browser_workflow_history", "browser_cache"] });
    expect(clearBrowserProfileData).toHaveBeenCalledTimes(1);
    expect(result.categories.find((category) => category.id === "browser_artifacts")?.bytesFreed).toBe(12);
    expect(result.categories.find((category) => category.id === "browser_cache")?.bytesFreed).toBe(18);
    expect(fs.existsSync(artifactPath)).toBe(false);
    expect(fs.existsSync(cachePath)).toBe(false);
    expect(fs.existsSync(downloadPath)).toBe(true);
    const workflowFile = JSON.parse(fs.readFileSync(path.join(userDataPath, "browser-workflows-v1.json"), "utf8"));
    expect(workflowFile.workflows).toHaveLength(1);
    expect(workflowFile.runs).toEqual([]);
    expect(workflowFile.evidence).toEqual([]);
  });

  it("cleans Privora downloads only when explicitly selected", async () => {
    const root = makeRoot();
    const userDataPath = path.join(root, "userData");
    const downloadsPath = path.join(root, "Downloads");
    const downloadPath = path.join(downloadsPath, "Privora", "installer.exe");
    fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
    fs.writeFileSync(downloadPath, Buffer.alloc(32));
    const service = new StorageCleanupService({ userDataPath, downloadsPath });

    const result = await service.cleanup({ categoryIds: ["browser_downloads"] });
    expect(result.categories).toHaveLength(1);
    expect(result.categories[0]).toMatchObject({ id: "browser_downloads", filesRemoved: 1 });
    expect(fs.existsSync(downloadPath)).toBe(false);
  });

  it("never follows a redirected artifact root or cache folder outside app storage", async () => {
    const root = makeRoot();
    const userDataPath = path.join(root, "userData");
    const external = path.join(root, "external");
    fs.mkdirSync(external); fs.writeFileSync(path.join(external, "keep.txt"), "keep");
    fs.mkdirSync(userDataPath);
    fs.symlinkSync(external, path.join(userDataPath, "browser-artifacts"), "junction");
    const profile = path.join(userDataPath, "Partitions", "privora-browser_workspace");
    fs.mkdirSync(profile, { recursive: true });
    fs.symlinkSync(external, path.join(profile, "Cache"), "junction");
    const service = new StorageCleanupService({ userDataPath, downloadsPath: path.join(root, "Downloads") });
    const result = await service.cleanup({ categoryIds: ["browser_artifacts", "browser_cache"] });
    expect(result.categories.every((category) => category.errors.some((error) => error.includes("linked storage path")))).toBe(true);
    expect(fs.readFileSync(path.join(external, "keep.txt"), "utf8")).toBe("keep");
  });

  it("retains definitions and does not resurrect cleared history on the next workflow save", async () => {
    const root = makeRoot();
    const manager = new BrowserWorkflowManager(root);
    const workflow = manager.startRecording("w", "Smoke"); manager.stopRecording("w");
    manager.finishRun(manager.beginRun("w", workflow.id), "passed");
    const service = new StorageCleanupService({ userDataPath: root, downloadsPath: path.join(root, "Downloads"), clearWorkflowHistory: () => manager.clearHistory() });
    const result = await service.cleanup({ categoryIds: ["browser_workflow_history"] });
    expect(result.categories[0].filesRemoved).toBe(1);
    expect(manager.panelState("w").lastRun).toBeUndefined();
    manager.rename("w", workflow.id, "Renamed");
    const saved = JSON.parse(fs.readFileSync(path.join(root, "browser-workflows-v1.json"), "utf8"));
    expect(saved.runs).toEqual([]); expect(saved.workflows[0].name).toBe("Renamed");
  });

  it("refuses history cleanup during recording and reports partial failures honestly", async () => {
    const root = makeRoot(); const manager = new BrowserWorkflowManager(root);
    manager.startRecording("w", "Recording");
    const service = new StorageCleanupService({ userDataPath: root, downloadsPath: path.join(root, "Downloads"), clearWorkflowHistory: () => manager.clearHistory(), clearBrowserProfileData: async () => { throw new Error("Profile is locked"); } });
    const result = await service.cleanup({ categoryIds: ["browser_workflow_history", "browser_cache"] });
    expect(result.categories[0].errors.join(" ")).toContain("Finish browser workflow recording");
    expect(result.categories[1].errors).toContain("Profile is locked");
    expect(manager.list("w")).toHaveLength(1);
  });

  it("blocks overlapping cleanup operations and releases the lock afterward", async () => {
    const root = makeRoot(); let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const started = vi.fn(() => pending);
    const service = new StorageCleanupService({ userDataPath: root, downloadsPath: path.join(root, "Downloads"), clearBrowserProfileData: started });
    const first = service.cleanup({ categoryIds: ["browser_cache"] });
    await vi.waitFor(() => expect(started).toHaveBeenCalled());
    await expect(service.cleanup({ categoryIds: ["browser_artifacts"] })).rejects.toThrow("already running");
    release(); await first;
    await expect(service.cleanup({ categoryIds: ["browser_artifacts"] })).resolves.toBeDefined();
  });

  it("allows empty files to be removed but does not offer cleanup for definitions-only workflow files", async () => {
    const root = makeRoot(); const artifact = path.join(root, "browser-artifacts", "empty.txt");
    fs.mkdirSync(path.dirname(artifact)); fs.writeFileSync(artifact, "");
    fs.writeFileSync(path.join(root, "browser-workflows-v1.json"), JSON.stringify({ workflows: [{ id: "kept" }], runs: [], evidence: [] }));
    const service = new StorageCleanupService({ userDataPath: root, downloadsPath: path.join(root, "Downloads") });
    const usage = await service.usage();
    expect(canCleanStorageCategory(usage.categories.find((category) => category.id === "browser_artifacts")!)).toBe(true);
    expect(canCleanStorageCategory(usage.categories.find((category) => category.id === "browser_workflow_history")!)).toBe(false);
    const result = await service.cleanup({ categoryIds: ["browser_artifacts"] });
    expect(result.categories[0].filesRemoved).toBe(1);
    expect(fs.existsSync(artifact)).toBe(false);
  });

  it("allows stale interrupted workflow history to be cleared after restart", () => {
    const root = makeRoot(); const manager = new BrowserWorkflowManager(root);
    const workflow = manager.startRecording("w", "Smoke"); manager.stopRecording("w"); manager.beginRun("w", workflow.id);
    const restarted = new BrowserWorkflowManager(root);
    restarted.clearHistory();
    expect(restarted.panelState("w").lastRun).toBeUndefined();
    expect(restarted.list("w")).toHaveLength(1);
  });

  it("does not overwrite an invalid workflow file during cleanup", async () => {
    const root = makeRoot(); const file = path.join(root, "browser-workflows-v1.json");
    fs.writeFileSync(file, "null");
    const service = new StorageCleanupService({ userDataPath: root, downloadsPath: path.join(root, "Downloads") });
    const result = await service.cleanup({ categoryIds: ["browser_workflow_history"] });
    expect(result.categories[0].errors.join(" ")).toContain("Invalid workflow file");
    expect(fs.readFileSync(file, "utf8")).toBe("null");
  });
});
