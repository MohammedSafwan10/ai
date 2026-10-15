import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { assertWorkspaceDirectory } from "../src/main/workspace/availability";
import { DesktopToolExecutor } from "../src/main/agent/tools/executor";

it("identifies missing and non-directory workspaces without recreating them", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "privora-workspace-"));
  try {
    expect(() => assertWorkspaceDirectory(root)).not.toThrow();
    const missing = path.join(root, "moved");
    expect(() => assertWorkspaceDirectory(missing)).toThrow("Restore the folder or select");
    expect(fs.existsSync(missing)).toBe(false);
    const file = path.join(root, "file"); fs.writeFileSync(file, "test");
    expect(() => assertWorkspaceDirectory(file)).toThrow("not an accessible directory");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

it("blocks file, search, and process tools with the same actionable workspace error", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "privora-workspace-"));
  fs.rmdirSync(root);
  const executor = new DesktopToolExecutor();
  for (const name of ["desktop_list_dir", "desktop_search", "desktop_git_status", "exec_command"] as const) {
    const result = await executor.execute({ id: name, name, arguments: { command: "echo should-not-run" } }, { workspaceRoot: root, signal: new AbortController().signal, onCommandOutput: () => {} });
    expect(result).toMatchObject({ success: false, data: { code: "WORKSPACE_UNAVAILABLE" } });
    expect(result.error).toContain(root);
    expect(result.error).not.toContain("ENOENT");
  }
});
