import fs from "node:fs/promises";
import path from "node:path";
import { resolveExistingWorkspacePath } from "../security/pathSandbox";
import { FileOperationService } from "../agent/tools/fileOperationService";
import type { WorkspaceDirectoryListing, WorkspaceFileReadResult } from "../../shared/types";

const EDITOR_MAX_BYTES = 600_000;

const files = new FileOperationService();

export const listWorkspaceDirectory = async (workspaceRoot: string, userPath = "."): Promise<WorkspaceDirectoryListing> => {
  const target = resolveExistingWorkspacePath(workspaceRoot, userPath || ".");
  const stat = await fs.stat(target.absolutePath);
  if (!stat.isDirectory()) throw new Error(`${target.relativePath || "."} is not a directory.`);

  const dirents = await fs.readdir(target.absolutePath, { withFileTypes: true });
  const entries = await Promise.all(dirents.map(async (entry) => {
    const relativePath = normalizePath([target.relativePath, entry.name].filter(Boolean).join("/"));
    const absolutePath = path.join(target.absolutePath, entry.name);
    const entryStat = await fs.lstat(absolutePath);
    return {
      name: entry.name,
      path: relativePath,
      kind: entry.isDirectory() ? "directory" as const : entry.isSymbolicLink() ? "symlink" as const : "file" as const,
      sizeBytes: entryStat.size,
      modifiedAtMs: entryStat.mtimeMs,
    };
  }));

  entries.sort((a, b) => {
    if (a.kind === "directory" && b.kind !== "directory") return -1;
    if (a.kind !== "directory" && b.kind === "directory") return 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  return {
    path: target.relativePath ? normalizePath(target.relativePath) : ".",
    entries,
  };
};

export const readWorkspaceFile = async (workspaceRoot: string, userPath: string): Promise<WorkspaceFileReadResult> => {
  const result = await files.readText(workspaceRoot, userPath, { maxBytes: EDITOR_MAX_BYTES });
  const data = result.data as Record<string, unknown>;
  return {
    path: String(data.path || userPath),
    content: result.snapshot.binary ? "" : result.output.replace(/\n\n\[File truncated at \d+ bytes\.\]$/, ""),
    encoding: result.snapshot.binary ? "binary" : "utf8",
    binary: result.snapshot.binary,
    sizeBytes: Number(data.sizeBytes || result.snapshot.sizeBytes || 0),
    modifiedAtMs: Number(data.modifiedAtMs || result.snapshot.modifiedAtMs || 0),
    totalLines: Number(data.totalLines || result.snapshot.totalLines || 0),
    truncated: Boolean(data.truncated),
    truncatedBecauseSize: Boolean(data.truncatedBecauseSize),
  };
};

const normalizePath = (value: string) => value.replace(/\\/g, "/");
