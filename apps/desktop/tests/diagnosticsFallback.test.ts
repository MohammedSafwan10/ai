import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DesktopToolExecutor } from "../src/main/agent/tools/executor";

let tempDir = "";

describe("diagnostics fallback", () => {
  afterEach(() => {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
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
      staticJsFiles: [expect.stringContaining("game.js")],
    });
    expect(result.data?.reason).toBe("No package.json found; using static JavaScript syntax-check fallback.");
    expect((result.data?.profile as { packageManager?: string })?.packageManager).toBeUndefined();
    expect(result.data?.backend).toEqual(expect.any(String));
  });

  it("returns machine-readable unavailable diagnostics metadata", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-diagnostics-"));
    fs.writeFileSync(path.join(tempDir, "notes.txt"), "plain text\n", "utf8");

    const result = await new DesktopToolExecutor().execute({
      id: "diagnostics-unavailable",
      name: "desktop_run_diagnostics",
      arguments: { kind: "auto" },
    }, {
      workspaceRoot: tempDir,
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
