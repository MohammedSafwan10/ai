import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StorageCleanupService } from "../src/main/storage/cleanup";

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
});
