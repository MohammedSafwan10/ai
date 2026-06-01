import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listWorkspaceDirectory, readWorkspaceFile } from "../src/main/workspace/files";

let tempDir = "";

describe("workspace file browser", () => {
  afterEach(() => {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = "";
  });

  it("lists root directories and files", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-workspace-files-"));
    fs.mkdirSync(path.join(tempDir, "src"));
    fs.writeFileSync(path.join(tempDir, "README.md"), "# test\n", "utf8");

    const result = await listWorkspaceDirectory(tempDir, ".");

    expect(result.path).toBe(".");
    expect(result.entries).toEqual([
      expect.objectContaining({ name: "src", path: "src", kind: "directory" }),
      expect.objectContaining({ name: "README.md", path: "README.md", kind: "file" }),
    ]);
  });

  it("lists nested folders lazily", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-workspace-files-"));
    fs.mkdirSync(path.join(tempDir, "src", "main"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "src", "main", "app.ts"), "export {}\n", "utf8");

    const result = await listWorkspaceDirectory(tempDir, "src/main");

    expect(result.path).toBe("src/main");
    expect(result.entries).toEqual([
      expect.objectContaining({ name: "app.ts", path: "src/main/app.ts", kind: "file" }),
    ]);
  });

  it("blocks paths outside the workspace", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-workspace-files-"));

    await expect(listWorkspaceDirectory(tempDir, "../")).rejects.toThrow("Path is outside");
    await expect(readWorkspaceFile(tempDir, "../outside.txt")).rejects.toThrow("Path is outside");
  });

  it("reads UTF-8 files with metadata", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-workspace-files-"));
    fs.writeFileSync(path.join(tempDir, "notes.txt"), "one\ntwo\n", "utf8");

    const result = await readWorkspaceFile(tempDir, "notes.txt");

    expect(result).toMatchObject({
      path: "notes.txt",
      content: "one\ntwo\n",
      encoding: "utf8",
      binary: false,
      totalLines: 3,
      truncated: false,
    });
  });

  it("returns a binary placeholder result without content", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-workspace-files-"));
    fs.writeFileSync(path.join(tempDir, "asset.bin"), Buffer.from([0, 1, 2, 3]));

    const result = await readWorkspaceFile(tempDir, "asset.bin");

    expect(result).toMatchObject({
      path: "asset.bin",
      content: "",
      encoding: "binary",
      binary: true,
      sizeBytes: 4,
      totalLines: 0,
    });
  });

  it("reports large text truncation metadata", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-workspace-files-"));
    fs.writeFileSync(path.join(tempDir, "large.txt"), "a".repeat(700_000), "utf8");

    const result = await readWorkspaceFile(tempDir, "large.txt");

    expect(result.content.length).toBeLessThan(700_000);
    expect(result.truncated).toBe(true);
    expect(result.truncatedBecauseSize).toBe(true);
  });
});
