import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopToolExecutor } from "../src/main/agent/tools/executor";
import { FileMutationCoordinator } from "../src/main/agent/tools/mutationCoordinator";
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
    vi.restoreAllMocks();
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

  it("searches case-insensitively by default and reports structured metadata", async () => {
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
    expect(result.data?.matches).toEqual([
      expect.objectContaining({
        path: "game.js",
        lineNumber: 1,
        line: "function checkCollision() { return true; }",
      }),
    ]);
    expect(result.data?.files).toEqual([
      expect.objectContaining({ path: "game.js", matchCount: 1 }),
    ]);
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

  it("rejects writes with stale expected hashes", async () => {
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

    expect(result.success).toBe(false);
    expect(result.error).toContain("STALE_FILE");
    expect(result.data).toMatchObject({ code: "STALE_FILE", path: "app.ts", requiresReread: true });
    expect(fs.readFileSync(path.join(tempDir, "app.ts"), "utf8")).toContain("value = 1");
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

  it("does not report unchanged writes, edits, or patch files as mutations", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));
    fs.writeFileSync(path.join(tempDir, "a.ts"), "const a = 1;\n", "utf8");
    fs.writeFileSync(path.join(tempDir, "b.ts"), "const b = 1;\n", "utf8");

    const write = await execute({
      id: "write-noop",
      name: "desktop_write_file",
      arguments: { path: "a.ts", content: "const a = 1;\n" },
    });
    expect(write.success).toBe(true);
    expect(write.diffFiles).toBeUndefined();
    expect(write.data).toMatchObject({ changed: [], mutated: false });

    const edit = await execute({
      id: "edit-noop",
      name: "desktop_edit_file",
      arguments: {
        path: "a.ts",
        operations: [{ type: "replace_text", match: "const a = 1;", replacement: "const a = 1;" }],
      },
    });
    expect(edit.success).toBe(true);
    expect(edit.diffFiles).toBeUndefined();
    expect(edit.data).toMatchObject({ changed: [], mutated: false });

    const patch = await execute({
      id: "patch-with-noop-file",
      name: "desktop_apply_patch",
      arguments: {
        patch: [
          "*** Begin Patch",
          "*** Update File: a.ts",
          "@@",
          "-const a = 1;",
          "+const a = 1;",
          "*** Update File: b.ts",
          "@@",
          "-const b = 1;",
          "+const b = 2;",
          "*** End Patch",
        ].join("\n"),
      },
    });
    expect(patch.success).toBe(true);
    expect(patch.data).toMatchObject({ mutated: true, changed: ["Patched b.ts"] });
    expect(patch.diffFiles).toHaveLength(1);
    expect(patch.diffFiles?.[0]).toMatchObject({ path: "b.ts", additions: 1, deletions: 1 });
    expect(patch.data?.warnings).toContain("Skipped a.ts: patch produced no content change.");
  });

  it("rejects structured edits when expectedPreviousHash is stale", async () => {
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

    expect(result.success).toBe(false);
    expect(result.data).toMatchObject({ code: "STALE_FILE", path: "app.ts", requiresReread: true });
    expect(fs.readFileSync(path.join(tempDir, "app.ts"), "utf8")).toContain("value = 1");
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

  it("rejects edits when a file changed after Privora observed it", async () => {
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

    expect(result.success).toBe(false);
    expect(result.data).toMatchObject({ code: "STALE_FILE", path: "app.ts", requiresReread: true });
    expect(fs.readFileSync(filePath, "utf8")).toContain("value = 99");
  });

  it("allows stale edit recovery after rereading the current file", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));
    const filePath = path.join(tempDir, "app.ts");
    fs.writeFileSync(filePath, "const value = 1;\n", "utf8");

    await execute({ id: "observe-old", name: "desktop_read_file", arguments: { path: "app.ts" } });
    fs.writeFileSync(filePath, "const value = 99;\n", "utf8");
    const reread = await execute({ id: "observe-new", name: "desktop_read_file", arguments: { path: "app.ts" } });

    const result = await execute({
      id: "edit-after-reread",
      name: "desktop_edit_file",
      arguments: {
        path: "app.ts",
        expectedPreviousHash: reread.data?.sha256,
        operations: [{ type: "replace_text", match: "99", replacement: "100" }],
      },
    });

    expect(result.success).toBe(true);
    expect(fs.readFileSync(filePath, "utf8")).toContain("value = 100");
  });

  it("rejects recreating a file that was deleted after Privora observed it", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));
    const filePath = path.join(tempDir, "app.ts");
    fs.writeFileSync(filePath, "const value = 1;\n", "utf8");

    await execute({ id: "observe-before-delete", name: "desktop_read_file", arguments: { path: "app.ts" } });
    fs.rmSync(filePath);

    const result = await execute({
      id: "write-after-delete",
      name: "desktop_write_file",
      arguments: { path: "app.ts", content: "const value = 2;\n" },
    });

    expect(result.success).toBe(false);
    expect(result.data).toMatchObject({ code: "STALE_FILE", path: "app.ts", actualHash: null });
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it("rejects patch updates with stale expected hashes", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));
    fs.writeFileSync(path.join(tempDir, "app.ts"), "const value = 1;\n", "utf8");

    const result = await execute({
      id: "patch-stale-hash",
      name: "desktop_apply_patch",
      arguments: {
        expectedHashes: { "app.ts": "not-current" },
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

    expect(result.success).toBe(false);
    expect(result.data).toMatchObject({ code: "STALE_FILE", path: "app.ts", requiresReread: true });
    expect(fs.readFileSync(path.join(tempDir, "app.ts"), "utf8")).toBe("const value = 1;\n");
  });

  it("normalizes nested patch expectedHashes keys on Windows paths", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));
    fs.mkdirSync(path.join(tempDir, "src"));
    fs.writeFileSync(path.join(tempDir, "src", "app.ts"), "const value = 1;\n", "utf8");

    const result = await execute({
      id: "patch-stale-nested-hash",
      name: "desktop_apply_patch",
      arguments: {
        expectedHashes: { "src/app.ts": "not-current" },
        patch: [
          "*** Begin Patch",
          "*** Update File: src/app.ts",
          "@@",
          "-const value = 1;",
          "+const value = 2;",
          "*** End Patch",
        ].join("\n"),
      },
    });

    expect(result.success).toBe(false);
    expect(result.data).toMatchObject({ code: "STALE_FILE", path: "src/app.ts" });
    expect(fs.readFileSync(path.join(tempDir, "src", "app.ts"), "utf8")).toBe("const value = 1;\n");
  });

  it("rejects writes when the file changes immediately before commit", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));
    const filePath = path.join(tempDir, "app.ts");
    fs.writeFileSync(filePath, "const value = 1;\n", "utf8");
    const coordinator = new FileMutationCoordinator({
      beforeWriteCommit: () => {
        fs.writeFileSync(filePath, "const value = 99;\n", "utf8");
      },
    });

    await expect(coordinator.writeFile({
      id: "write-race",
      name: "desktop_write_file",
      arguments: { path: "app.ts", content: "const value = 2;\n" },
    }, {
      workspaceRoot: tempDir,
      signal: new AbortController().signal,
      onCommandOutput: () => undefined,
    })).rejects.toThrow(/planned write snapshot|stale/i);
    expect(fs.readFileSync(filePath, "utf8")).toBe("const value = 99;\n");
  });

  it("rejects delete and rename when observed files changed externally", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));
    const deletePath = path.join(tempDir, "delete-me.ts");
    const renamePath = path.join(tempDir, "rename-me.ts");
    fs.writeFileSync(deletePath, "delete old\n", "utf8");
    fs.writeFileSync(renamePath, "rename old\n", "utf8");

    await execute({ id: "observe-delete", name: "desktop_read_file", arguments: { path: "delete-me.ts" } });
    await execute({ id: "observe-rename", name: "desktop_read_file", arguments: { path: "rename-me.ts" } });
    fs.writeFileSync(deletePath, "delete new\n", "utf8");
    fs.writeFileSync(renamePath, "rename new\n", "utf8");

    const del = await execute({ id: "delete-stale", name: "desktop_delete_path", arguments: { path: "delete-me.ts" } });
    const rename = await execute({ id: "rename-stale", name: "desktop_rename_path", arguments: { fromPath: "rename-me.ts", toPath: "renamed.ts" } });

    expect(del.success).toBe(false);
    expect(del.data).toMatchObject({ code: "STALE_FILE", path: "delete-me.ts" });
    expect(rename.success).toBe(false);
    expect(rename.data).toMatchObject({ code: "STALE_FILE", path: "rename-me.ts" });
    expect(fs.existsSync(deletePath)).toBe(true);
    expect(fs.existsSync(renamePath)).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "renamed.ts"))).toBe(false);
  });

  it("rejects delete and rename races immediately before commit", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));
    const deletePath = path.join(tempDir, "delete-race.ts");
    const renamePath = path.join(tempDir, "rename-race.ts");
    fs.writeFileSync(deletePath, "delete old\n", "utf8");
    fs.writeFileSync(renamePath, "rename old\n", "utf8");

    const deleteCoordinator = new FileMutationCoordinator({
      beforeDeleteCommit: () => fs.writeFileSync(deletePath, "delete new\n", "utf8"),
    });
    const renameCoordinator = new FileMutationCoordinator({
      beforeRenameCommit: () => fs.writeFileSync(renamePath, "rename new\n", "utf8"),
    });

    await expect(deleteCoordinator.deletePath({
      id: "delete-race",
      name: "desktop_delete_path",
      arguments: { path: "delete-race.ts" },
    }, {
      workspaceRoot: tempDir,
      signal: new AbortController().signal,
      onCommandOutput: () => undefined,
    })).rejects.toThrow(/planned delete snapshot|stale/i);
    await expect(renameCoordinator.renamePath({
      id: "rename-race",
      name: "desktop_rename_path",
      arguments: { fromPath: "rename-race.ts", toPath: "renamed-race.ts" },
    }, {
      workspaceRoot: tempDir,
      signal: new AbortController().signal,
      onCommandOutput: () => undefined,
    })).rejects.toThrow(/planned rename snapshot|stale/i);

    expect(fs.existsSync(deletePath)).toBe(true);
    expect(fs.existsSync(renamePath)).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "renamed-race.ts"))).toBe(false);
  });

  it("rolls back already-committed patch changes when a later patch operation fails", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));
    fs.writeFileSync(path.join(tempDir, "a.ts"), "export const a = 1;\n", "utf8");
    const coordinator = new FileMutationCoordinator({
      beforePatchCommit: (_change, index) => {
        if (index === 1) throw new Error("injected commit failure");
      },
    });

    const result = await coordinator.applyPatch({
      id: "patch-rollback",
      name: "desktop_apply_patch",
      arguments: {
        patch: [
          "*** Begin Patch",
          "*** Update File: a.ts",
          "@@",
          "-export const a = 1;",
          "+export const a = 2;",
          "*** Add File: b.ts",
          "+export const b = 1;",
          "*** End Patch",
        ].join("\n"),
      },
    }, {
      workspaceRoot: tempDir,
      signal: new AbortController().signal,
      onCommandOutput: () => undefined,
    });

    expect(result.success).toBe(false);
    expect(result.data).toMatchObject({ code: "PATCH_TRANSACTION_FAILED", mutated: false });
    expect(result.data?.rollback).toEqual([expect.objectContaining({ path: "a.ts", success: true })]);
    expect(fs.readFileSync(path.join(tempDir, "a.ts"), "utf8")).toBe("export const a = 1;\n");
    expect(fs.existsSync(path.join(tempDir, "b.ts"))).toBe(false);
  });

  it("preserves STALE_FILE when patch commit revalidation detects a stale file", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));
    fs.writeFileSync(path.join(tempDir, "a.ts"), "export const a = 1;\n", "utf8");
    fs.writeFileSync(path.join(tempDir, "b.ts"), "export const b = 1;\n", "utf8");
    const coordinator = new FileMutationCoordinator({
      beforePatchCommit: (_change, index) => {
        if (index === 1) fs.writeFileSync(path.join(tempDir, "b.ts"), "export const b = 99;\n", "utf8");
      },
    });

    const result = await coordinator.applyPatch({
      id: "patch-stale-during-commit",
      name: "desktop_apply_patch",
      arguments: {
        patch: [
          "*** Begin Patch",
          "*** Update File: a.ts",
          "@@",
          "-export const a = 1;",
          "+export const a = 2;",
          "*** Update File: b.ts",
          "@@",
          "-export const b = 1;",
          "+export const b = 2;",
          "*** End Patch",
        ].join("\n"),
      },
    }, {
      workspaceRoot: tempDir,
      signal: new AbortController().signal,
      onCommandOutput: () => undefined,
    });

    expect(result.success).toBe(false);
    expect(result.data).toMatchObject({ code: "STALE_FILE", path: "b.ts", requiresReread: true, mutated: false });
    expect(fs.readFileSync(path.join(tempDir, "a.ts"), "utf8")).toBe("export const a = 1;\n");
    expect(fs.readFileSync(path.join(tempDir, "b.ts"), "utf8")).toBe("export const b = 99;\n");
  });

  it("rolls back a partial patch move when removing the source fails", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));
    const oldPath = path.join(tempDir, "old.ts");
    const newPath = path.join(tempDir, "new.ts");
    fs.writeFileSync(oldPath, "export const value = 1;\n", "utf8");
    const originalRm = fsp.rm.bind(fsp);
    let failedSourceRemoval = false;
    vi.spyOn(fsp, "rm").mockImplementation(async (target, options) => {
      if (!failedSourceRemoval && String(target).endsWith("old.ts")) {
        failedSourceRemoval = true;
        throw new Error("injected source removal failure");
      }
      return await originalRm(target, options);
    });

    const result = await new FileMutationCoordinator().applyPatch({
      id: "patch-move-partial-rollback",
      name: "desktop_apply_patch",
      arguments: {
        patch: [
          "*** Begin Patch",
          "*** Update File: old.ts",
          "*** Move to: new.ts",
          "@@",
          " export const value = 1;",
          "*** End Patch",
        ].join("\n"),
      },
    }, {
      workspaceRoot: tempDir,
      signal: new AbortController().signal,
      onCommandOutput: () => undefined,
    });

    expect(result.success).toBe(false);
    expect(result.data).toMatchObject({ code: "PATCH_TRANSACTION_FAILED", mutated: false });
    expect(result.data?.rollback).toEqual([expect.objectContaining({ path: "new.ts", success: true })]);
    expect(fs.readFileSync(oldPath, "utf8")).toBe("export const value = 1;\n");
    expect(fs.existsSync(newPath)).toBe(false);
  });

  it("does not overwrite patch add destinations that appear after planning", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));
    const createdPath = path.join(tempDir, "created.ts");
    const coordinator = new FileMutationCoordinator({
      beforePatchCommit: () => fs.writeFileSync(createdPath, "external\n", "utf8"),
    });

    const result = await coordinator.applyPatch({
      id: "patch-add-race",
      name: "desktop_apply_patch",
      arguments: {
        patch: [
          "*** Begin Patch",
          "*** Add File: created.ts",
          "+patch",
          "*** End Patch",
        ].join("\n"),
      },
    }, {
      workspaceRoot: tempDir,
      signal: new AbortController().signal,
      onCommandOutput: () => undefined,
    });

    expect(result.success).toBe(false);
    expect(result.data).toMatchObject({ code: "PATCH_TRANSACTION_FAILED", mutated: false });
    expect(fs.readFileSync(createdPath, "utf8")).toBe("external\n");
  });

  it("reports rollback failure risk when rollback cannot restore a committed patch", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));
    fs.writeFileSync(path.join(tempDir, "a.ts"), "export const a = 1;\n", "utf8");
    const coordinator = new FileMutationCoordinator({
      beforePatchCommit: (_change, index) => {
        if (index === 1) throw new Error("injected commit failure");
      },
      beforePatchRollback: () => {
        throw new Error("injected rollback failure");
      },
    });

    const result = await coordinator.applyPatch({
      id: "patch-rollback-failure",
      name: "desktop_apply_patch",
      arguments: {
        patch: [
          "*** Begin Patch",
          "*** Update File: a.ts",
          "@@",
          "-export const a = 1;",
          "+export const a = 2;",
          "*** Add File: b.ts",
          "+export const b = 1;",
          "*** End Patch",
        ].join("\n"),
      },
    }, {
      workspaceRoot: tempDir,
      signal: new AbortController().signal,
      onCommandOutput: () => undefined,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("could not be restored");
    expect(result.data).toMatchObject({ code: "PATCH_TRANSACTION_FAILED", mutated: true });
    expect(result.data?.rollback).toEqual([expect.objectContaining({ path: "a.ts", success: false })]);
  });

  it("treats invalid UTF-8 and UTF-16-ish files as binary for text tools", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));
    fs.writeFileSync(path.join(tempDir, "invalid.txt"), Buffer.from([0xc3, 0x28, 0x41, 0x42]));
    fs.writeFileSync(path.join(tempDir, "utf16.txt"), Buffer.from([0xff, 0xfe, 0x61, 0x00]));

    const invalidRead = await execute({ id: "read-invalid", name: "desktop_read_file", arguments: { path: "invalid.txt" } });
    const utf16Read = await execute({ id: "read-utf16", name: "desktop_read_file", arguments: { path: "utf16.txt" } });
    const edit = await execute({
      id: "edit-invalid",
      name: "desktop_edit_file",
      arguments: { path: "invalid.txt", operations: [{ type: "append", content: "x" }] },
    });

    expect(invalidRead.data).toMatchObject({ binary: true, encoding: "binary" });
    expect(utf16Read.data).toMatchObject({ binary: true, encoding: "binary" });
    expect(edit.success).toBe(false);
    expect(edit.error).toContain("UTF-8 text only");
  });

  it("supports literal search, context lines, byte budgets, excludes, and cursors", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));
    fs.mkdirSync(path.join(tempDir, "dist"));
    fs.writeFileSync(path.join(tempDir, "one.ts"), "before\nfoo.bar\nmiddle\nfoo.bar\nafter\n", "utf8");
    fs.writeFileSync(path.join(tempDir, "two.ts"), "foo.bar\n", "utf8");
    fs.writeFileSync(path.join(tempDir, "dist", "ignored.ts"), "foo.bar\n", "utf8");

    const first = await execute({
      id: "search-v2-first",
      name: "desktop_search",
      arguments: {
        query: "foo.bar",
        mode: "literal",
        beforeContext: 1,
        afterContext: 1,
        maxResults: 2,
        groupByFile: true,
      },
    });

    expect(first.success).toBe(true);
    expect(first.data).toMatchObject({
      mode: "literal",
      beforeContext: 1,
      afterContext: 1,
      resultCount: 2,
      totalResultCount: 3,
      truncated: true,
      nextCursor: expect.any(String),
    });
    expect(first.output).not.toContain("ignored.ts");
    expect(first.data?.matches).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: "one.ts",
        contextBefore: [expect.objectContaining({ line: "before" })],
        contextAfter: [expect.objectContaining({ line: "middle" })],
      }),
    ]));

    const second = await execute({
      id: "search-v2-second",
      name: "desktop_search",
      arguments: {
        query: "foo.bar",
        mode: "literal",
        beforeContext: 1,
        afterContext: 1,
        cursor: first.data?.nextCursor,
        maxResults: 5,
      },
    });

    expect(second.success).toBe(true);
    expect(second.data).toMatchObject({ resultCount: 1, nextCursor: null });
    expect(second.output).toMatch(/(?:one\.ts:4|two\.ts:1):foo\.bar/);

    const reset = await execute({
      id: "search-v2-reset",
      name: "desktop_search",
      arguments: {
        query: "middle",
        mode: "literal",
        cursor: first.data?.nextCursor,
      },
    });
    expect(reset.success).toBe(true);
    expect(reset.data).toMatchObject({ cursorReset: true, resultCount: 1 });
    expect(reset.output).toContain("one.ts:3:middle");
  });

  it("keeps between-match context as before-context for the next match", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));
    fs.writeFileSync(path.join(tempDir, "one.ts"), "before\nfoo\nbetween\nfoo\nafter\n", "utf8");

    const result = await execute({
      id: "search-context-window",
      name: "desktop_search",
      arguments: { query: "foo", mode: "literal", beforeContext: 1, afterContext: 1, maxResults: 2 },
    });

    expect(result.success).toBe(true);
    const matches = result.data?.matches as Array<{ lineNumber: number; contextBefore: Array<{ line: string }> }>;
    expect(matches.find((match) => match.lineNumber === 4)?.contextBefore).toEqual([
      expect.objectContaining({ line: "between" }),
    ]);
  });

  it("truncates the first oversized search match to the maxBytes budget", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-file-tools-"));
    fs.writeFileSync(path.join(tempDir, "huge.txt"), `needle ${"x".repeat(5_000)}\n`, "utf8");

    const result = await execute({
      id: "search-huge-line",
      name: "desktop_search",
      arguments: { query: "needle", mode: "literal", maxBytes: 1000 },
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      truncated: true,
      matches: [expect.objectContaining({ path: "huge.txt", lineTruncated: true })],
      stats: expect.objectContaining({ returnedBytes: expect.any(Number), maxBytes: 1000 }),
    });
    expect((result.data?.stats as { returnedBytes: number }).returnedBytes).toBeLessThanOrEqual(1000);
    expect(Buffer.byteLength(result.output || "", "utf8")).toBeLessThanOrEqual(1000);
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
