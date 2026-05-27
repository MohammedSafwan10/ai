import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveWorkspacePath } from "../src/main/security/pathSandbox";

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
});
