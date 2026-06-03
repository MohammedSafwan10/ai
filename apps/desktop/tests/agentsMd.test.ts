import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAgentsMdContext, loadHierarchicalAgentsMd } from "../src/main/agent/agentsMd";

let tempDir = "";

const write = (relativePath: string, content: string) => {
  const target = path.join(tempDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
};

describe("AGENTS.md project instructions", () => {
  afterEach(() => {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = "";
  });

  it("loads root AGENTS.md instructions automatically", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-agents-"));
    write("AGENTS.md", "Use npm test before finishing.\n");

    const docs = await loadHierarchicalAgentsMd(tempDir);

    expect(docs).toEqual([{
      relativePath: "AGENTS.md",
      content: "Use npm test before finishing.",
    }]);
  });

  it("loads instructions from root to the active child directory", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-agents-"));
    write("AGENTS.md", "Root rule.");
    write("apps/web/AGENTS.md", "Web rule.");
    write("apps/web/src/file.ts", "export {};\n");

    const docs = await loadHierarchicalAgentsMd(tempDir, "apps/web/src");

    expect(docs.map((doc) => doc.relativePath)).toEqual(["AGENTS.md", "apps/web/AGENTS.md"]);
    expect(docs.map((doc) => doc.content)).toEqual(["Root rule.", "Web rule."]);
  });

  it("does not read outside the selected workspace", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-agents-"));
    write("AGENTS.md", "Root rule.");

    await expect(loadHierarchicalAgentsMd(tempDir, "..")).resolves.toEqual([]);
  });

  it("formats loaded instructions for runtime context", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-agents-"));
    write("AGENTS.md", "Keep edits scoped.");

    const context = await buildAgentsMdContext(tempDir);

    expect(context).toContain("Project instructions from AGENTS.md");
    expect(context).toContain("--- AGENTS.md ---");
    expect(context).toContain("Keep edits scoped.");
  });
});
