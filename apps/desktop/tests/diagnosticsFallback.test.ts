import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DesktopToolExecutor } from "../src/main/agent/tools/executor";

let tempDir = "";

describe("diagnostics fallback", () => {
  afterEach(() => {
    if (tempDir) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (err) {
        // Ignore EPERM or busy files in temp dir cleanup
      }
      tempDir = "";
    }
  });

  it("runs node syntax checks for plain static JavaScript workspaces", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-diagnostics-"));
    fs.writeFileSync(path.join(tempDir, "game.js"), "const score = 1;\nconsole.log(score);\n", "utf8");

    const result = await new DesktopToolExecutor().execute({
      id: "diagnostics-static-js",
      name: "desktop_run_diagnostics",
      arguments: { kind: "auto" },
    }, {
      workspaceRoot: tempDir,
      signal: new AbortController().signal,
      onCommandOutput: () => undefined,
    });

    expect(result.success).toBe(true);
    expect(result.data?.command).toContain("node --check");
    expect(result.data?.selectedCommand).toContain("node --check");
    expect(result.data?.diagnosticsAvailable).toBe(true);
    expect(result.data?.profile).toMatchObject({
      hasPackageJson: false,
    });
  });

  it("runs npx --yes with the TypeScript package for TypeScript workspaces without custom scripts", async () => {
    const localTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-diagnostics-"));
    tempDir = localTempDir;
    fs.writeFileSync(path.join(localTempDir, "package.json"), JSON.stringify({ name: "test-app" }), "utf8");
    fs.writeFileSync(path.join(localTempDir, "tsconfig.json"), JSON.stringify({}), "utf8");

    const result = await new DesktopToolExecutor().execute({
      id: "diagnostics-ts-fallback",
      name: "desktop_run_diagnostics",
      arguments: { kind: "typecheck" },
    }, {
      workspaceRoot: localTempDir,
      signal: new AbortController().signal,
      onCommandOutput: () => undefined,
    });

    expect(result.data?.command).toBe("npx --yes --package typescript tsc --noEmit");
    expect(result.data?.selectedCommand).toBe("npx --yes --package typescript tsc --noEmit");
    expect(result.data?.diagnosticsAvailable).toBe(true);
    expect(result.data?.profile).toMatchObject({
      hasPackageJson: true,
      hasTsconfig: true,
    });
  });
  it("returns machine-readable unavailable diagnostics metadata", async () => {
    const localTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-diagnostics-"));
    tempDir = localTempDir;
    fs.writeFileSync(path.join(localTempDir, "notes.txt"), "plain text\n", "utf8");

    const result = await new DesktopToolExecutor().execute({
      id: "diagnostics-unavailable",
      name: "desktop_run_diagnostics",
      arguments: { kind: "auto" },
    }, {
      workspaceRoot: localTempDir,
      signal: new AbortController().signal,
      onCommandOutput: () => undefined,
    });

    expect(result.success).toBe(false);
    expect(result.data).toMatchObject({
      diagnosticsAvailable: false,
      selectedCommand: null,
      command: null,
      reason: expect.stringContaining("No package"),
    });
  });
});
