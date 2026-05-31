import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveExistingWorkspacePath, resolveWorkspacePath } from "../src/main/security/pathSandbox";

let tempDir = "";

describe("workspace path sandbox", () => {
  afterEach(() => {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("resolves workspace-relative paths", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-desktop-"));
    const result = resolveWorkspacePath(tempDir, "src/index.ts");
    expect(result.relativePath).toBe(path.join("src", "index.ts"));
    expect(result.absolutePath.startsWith(tempDir)).toBe(true);
  });

  it("rejects paths outside the workspace", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-desktop-"));
    expect(() => resolveWorkspacePath(tempDir, "../outside.txt")).toThrow(/outside/i);
  });

  it("rejects existing symlink files that resolve outside the workspace", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-desktop-"));
    const outside = path.join(os.tmpdir(), `privora-outside-${Date.now()}.txt`);
    fs.writeFileSync(outside, "outside", "utf8");
    try {
      if (!trySymlink(outside, path.join(tempDir, "link.txt"), "file")) return;
      expect(() => resolveExistingWorkspacePath(tempDir, "link.txt")).toThrow(/outside/i);
    } finally {
      fs.rmSync(outside, { force: true });
    }
  });

  it("rejects writes through symlinked parent directories", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-desktop-"));
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-outside-"));
    try {
      if (!trySymlink(outsideDir, path.join(tempDir, "linked-dir"), "dir")) return;
      expect(() => resolveWorkspacePath(tempDir, path.join("linked-dir", "new.txt"))).toThrow(/outside/i);
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it("resolves existing normal files inside the workspace", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-desktop-"));
    fs.mkdirSync(path.join(tempDir, "src"));
    fs.writeFileSync(path.join(tempDir, "src", "index.ts"), "export {};", "utf8");
    const result = resolveExistingWorkspacePath(tempDir, "src/index.ts");
    expect(result.relativePath).toBe(path.join("src", "index.ts"));
  });
});

const trySymlink = (target: string, linkPath: string, type: fs.symlink.Type) => {
  try {
    fs.symlinkSync(target, linkPath, type);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") return false;
    throw error;
  }
};
