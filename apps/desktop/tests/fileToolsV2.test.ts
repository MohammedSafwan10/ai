import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DesktopToolExecutor } from "../src/main/agent/tools/executor";
import type { DesktopToolCall } from "../src/shared/types";

let tempDir = "";

const execute = (call: DesktopToolCall) =>
  new DesktopToolExecutor().execute(call, {
    workspaceRoot: tempDir,
    signal: new AbortController().signal,
    onCommandOutput: () => undefined,
  });

describe("file tools v2", () => {
  afterEach(() => {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("reads line ranges with metadata and hashes", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));
    fs.writeFileSync(path.join(tempDir, "notes.txt"), "one\ntwo\nthree\nfour", "utf8");

    const result = await execute({
      id: "read-range",
      name: "desktop_read_file",
      arguments: { path: "notes.txt", startLine: 2, endLine: 3, withLineNumbers: true },
    });

    expect(result.success).toBe(true);
    expect(result.output).toBe("2: two\n3: three");
    expect(result.data).toMatchObject({
      path: "notes.txt",
      binary: false,
      encoding: "utf8",
      lineStart: 2,
      lineEnd: 3,
      totalLines: 4,
      nonEmptyLines: 4,
      endsWithNewline: false,
      truncated: false,
      truncatedBecauseRange: true,
      truncatedBecauseSize: false,
      rangeLimited: true,
    });
    expect(result.data?.sha256).toEqual(expect.any(String));
  });

  it("reads and writes base64 binary files", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));
    const bytes = Buffer.from([0, 1, 2, 255]);

    const write = await execute({
      id: "write-binary",
      name: "desktop_write_file",
      arguments: { path: "asset.bin", encoding: "base64", content: bytes.toString("base64") },
    });

    expect(write.success).toBe(true);
    expect(write.data).toMatchObject({
      path: "asset.bin",
      bytes: 4,
      encoding: "base64",
      sha256: expect.any(String),
    });
    expect(fs.readFileSync(path.join(tempDir, "asset.bin"))).toEqual(bytes);

    const read = await execute({
      id: "read-binary",
      name: "desktop_read_file",
      arguments: { path: "asset.bin", encoding: "base64" },
    });

    expect(read.success).toBe(true);
    expect(read.output).toBe(bytes.toString("base64"));
    expect(read.data).toMatchObject({ encoding: "base64", binary: true, sizeBytes: 4 });
  });

  it("rejects invalid base64 writes", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));

    const result = await execute({
      id: "write-invalid-base64",
      name: "desktop_write_file",
      arguments: { path: "asset.bin", encoding: "base64", content: "not base64!" },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("valid base64");
  });

  it("searches case-insensitively by default and reports metadata", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));
    fs.writeFileSync(path.join(tempDir, "game.js"), "function checkCollision() { return true; }\n", "utf8");

    const result = await execute({
      id: "search-case",
      name: "desktop_search",
      arguments: { query: "collision" },
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain("checkCollision");
    expect(result.data).toMatchObject({
      query: "collision",
      caseSensitive: false,
      resultCount: 1,
      truncated: false,
    });
  });

  it("lists directories with optional file metadata", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));
    fs.writeFileSync(path.join(tempDir, "notes.txt"), "metadata\n", "utf8");

    const result = await execute({
      id: "list-metadata",
      name: "desktop_list_dir",
      arguments: { path: ".", includeMetadata: true },
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain("file notes.txt");
    expect(result.data).toMatchObject({
      path: ".",
      includeMetadata: true,
      entries: [
        expect.objectContaining({
          path: "notes.txt",
          type: "file",
          sizeBytes: 9,
          modifiedAt: expect.any(String),
          sha256: expect.any(String),
        }),
      ],
    });
  });

  it("skips metadata hashes for large directory entries", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));
    fs.writeFileSync(path.join(tempDir, "large.bin"), Buffer.alloc((10 * 1024 * 1024) + 1));

    const result = await execute({
      id: "list-large-metadata",
      name: "desktop_list_dir",
      arguments: { path: ".", includeMetadata: true },
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain("hash skipped: large file");
    expect(result.data).toMatchObject({
      entries: [
        expect.objectContaining({
          path: "large.bin",
          type: "file",
          metadataHashSkipped: true,
        }),
      ],
    });
  });

  it("writes with change metadata and soft stale-hash warning", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));
    fs.writeFileSync(path.join(tempDir, "app.ts"), "export const value = 1;\n", "utf8");

    const result = await execute({
      id: "write-stale",
      name: "desktop_write_file",
      arguments: {
        path: "app.ts",
        content: "export const value = 2;\n",
        expectedPreviousHash: "not-the-current-hash",
      },
    });

    expect(result.success).toBe(true);
    expect(fs.readFileSync(path.join(tempDir, "app.ts"), "utf8")).toContain("value = 2");
    expect(result.data?.warnings).toEqual([expect.stringContaining("expectedPreviousHash")]);
    expect(result.data?.changed).toEqual([
      expect.objectContaining({
        path: "app.ts",
        status: "modified",
        additions: 1,
        deletions: 1,
      }),
    ]);
  });

  it("previews patches without mutating files", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));
    fs.writeFileSync(path.join(tempDir, "app.ts"), "const value = 1;\n", "utf8");

    const result = await execute({
      id: "patch-dry-run",
      name: "desktop_apply_patch",
      arguments: {
        dryRun: true,
        patch: [
          "*** Begin Patch",
          "*** Update File: app.ts",
          "@@",
          "-const value = 1;",
          "+const value = 2;",
          "*** End Patch",
        ].join("\n"),
      },
    });

    expect(result.success).toBe(true);
    expect(result.data?.dryRun).toBe(true);
    expect(result.data?.mutated).toBe(false);
    expect(result.diff).toContain("const value = 2");
    expect(fs.readFileSync(path.join(tempDir, "app.ts"), "utf8")).toBe("const value = 1;\n");
  });

  it("applies structured text edits and dry-run previews", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));
    fs.writeFileSync(path.join(tempDir, "app.ts"), "const value = 1;\nconsole.log(value);\n", "utf8");

    const preview = await execute({
      id: "edit-dry-run",
      name: "desktop_edit_file",
      arguments: {
        path: "app.ts",
        dryRun: true,
        operations: [{ type: "replace_text", match: "value = 1", replacement: "value = 2" }],
      },
    });

    expect(preview.success).toBe(true);
    expect(preview.data?.mutated).toBe(false);
    expect(fs.readFileSync(path.join(tempDir, "app.ts"), "utf8")).toContain("value = 1");

    const edit = await execute({
      id: "edit-apply",
      name: "desktop_edit_file",
      arguments: {
        path: "app.ts",
        operations: [
          { type: "replace_text", match: "value = 1", replacement: "value = 2" },
          { type: "append", content: "\nexport { value };" },
        ],
      },
    });

    expect(edit.success).toBe(true);
    expect(edit.data?.mutated).toBe(true);
    expect(edit.diff).toContain("value = 2");
    expect(fs.readFileSync(path.join(tempDir, "app.ts"), "utf8")).toContain("export { value };");
  });

  it("warns on structured edits when expectedPreviousHash is stale", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));
    fs.writeFileSync(path.join(tempDir, "app.ts"), "const value = 1;\n", "utf8");

    const result = await execute({
      id: "edit-stale-hash",
      name: "desktop_edit_file",
      arguments: {
        path: "app.ts",
        expectedPreviousHash: "not-the-current-hash",
        operations: [{ type: "replace_text", match: "value = 1", replacement: "value = 2" }],
      },
    });

    expect(result.success).toBe(true);
    expect(result.data?.warnings).toEqual([expect.stringContaining("expectedPreviousHash")]);
    expect(fs.readFileSync(path.join(tempDir, "app.ts"), "utf8")).toContain("value = 2");
  });

  it("reports when write_file creates a parent directory", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));

    const result = await execute({
      id: "write-parent-dir",
      name: "desktop_write_file",
      arguments: { path: "nested/app.ts", content: "export {}\n" },
    });

    expect(result.success).toBe(true);
    expect(result.data?.parentDirectoryCreated).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "nested", "app.ts"))).toBe(true);
  });

  it("warns when a file changed after Privora observed it", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));
    const filePath = path.join(tempDir, "app.ts");
    fs.writeFileSync(filePath, "const value = 1;\n", "utf8");

    await execute({
      id: "observe",
      name: "desktop_read_file",
      arguments: { path: "app.ts" },
    });
    fs.writeFileSync(filePath, "const value = 99;\n", "utf8");

    const result = await execute({
      id: "edit-stale",
      name: "desktop_edit_file",
      arguments: {
        path: "app.ts",
        operations: [{ type: "replace_text", match: "99", replacement: "100" }],
      },
    });

    expect(result.success).toBe(true);
    expect(result.data?.warnings).toEqual([expect.stringContaining("changed since Privora last observed")]);
  });

  it("applies patches with one extra common indentation level", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));
    fs.writeFileSync(path.join(tempDir, "app.ts"), "function run() {\n  return 1;\n}\n", "utf8");

    const result = await execute({
      id: "patch-indent",
      name: "desktop_apply_patch",
      arguments: {
        patch: [
          "*** Begin Patch",
          "*** Update File: app.ts",
          "@@",
          "-    return 1;",
          "+    return 2;",
          "*** End Patch",
        ].join("\n"),
      },
    });

    expect(result.success).toBe(true);
    expect(result.data?.mutated).toBe(true);
    expect(fs.readFileSync(path.join(tempDir, "app.ts"), "utf8")).toBe("function run() {\n  return 2;\n}\n");
  });

  it("returns nearby snippets when a patch hunk does not match", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));
    fs.writeFileSync(path.join(tempDir, "app.ts"), "const count = 1;\nconsole.log(count);\n", "utf8");

    const result = await execute({
      id: "patch-suggest",
      name: "desktop_apply_patch",
      arguments: {
        patch: [
          "*** Begin Patch",
          "*** Update File: app.ts",
          "@@",
          "-const count = 2;",
          "+const count = 3;",
          "*** End Patch",
        ].join("\n"),
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Nearest current file snippets");
    expect(result.error).toContain("const count = 1");
    expect(result.error).toContain("\n\nRead the file again");
  });

  it("does not repeat patch suggestion windows that only contain already shown lines", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));
    fs.writeFileSync(path.join(tempDir, "app.ts"), [
      "target alpha",
      "target beta",
      "target gamma",
      "target delta",
      "target epsilon",
    ].join("\n"), "utf8");

    const result = await execute({
      id: "patch-suggest-overlap",
      name: "desktop_apply_patch",
      arguments: {
        patch: [
          "*** Begin Patch",
          "*** Update File: app.ts",
          "@@",
          "-target missing",
          "+target replacement",
          "*** End Patch",
        ].join("\n"),
      },
    });

    expect(result.success).toBe(false);
    const snippets = String(result.error).match(/\[score /g) || [];
    expect(snippets.length).toBe(1);
  });

  it("reports trailing newline and non-empty line metadata", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));
    fs.writeFileSync(path.join(tempDir, "notes.txt"), "one\ntwo\n", "utf8");

    const result = await execute({
      id: "read-line-metadata",
      name: "desktop_read_file",
      arguments: { path: "notes.txt" },
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      totalLines: 3,
      nonEmptyLines: 2,
      endsWithNewline: true,
    });
  });
});
