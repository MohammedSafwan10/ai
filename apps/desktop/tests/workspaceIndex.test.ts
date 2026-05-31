import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { searchWorkspaceIndex } from "../src/main/agent/workspaceIndex";

let tempDir = "";

describe("workspace index", () => {
  afterEach(() => {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("persists searchable workspace entries and skips ignored folders", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-index-"));
    fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
    fs.mkdirSync(path.join(tempDir, "node_modules", "pkg"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "src", "app.ts"), "export const app = true;\n", "utf8");
    fs.writeFileSync(path.join(tempDir, "node_modules", "pkg", "ignored.ts"), "ignored\n", "utf8");

    const files = await searchWorkspaceIndex(tempDir, "app", "file", 10);
    const folders = await searchWorkspaceIndex(tempDir, "src", "folder", 10);

    expect(files.map((entry) => entry.path)).toEqual(["src/app.ts"]);
    expect(folders.map((entry) => entry.path)).toContain("src");
    expect(files.some((entry) => entry.path.includes("node_modules"))).toBe(false);
  });
});
