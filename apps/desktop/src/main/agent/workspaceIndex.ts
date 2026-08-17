import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { hashBuffer } from "./tools/fileOperationService";

const IGNORED_DIRS = new Set([".git", "node_modules", "dist", "build", "out", ".vite", ".next", ".turbo"]);
const MAX_INDEX_ENTRIES = 20_000;
const MAX_HASH_BYTES = 1_000_000;

export interface WorkspaceIndexEntry {
  path: string;
  type: "file" | "folder";
  sizeBytes: number;
  modifiedAtMs: number;
  sha256?: string;
}

interface WorkspaceIndexFile {
  version: 1;
  workspaceRoot: string;
  generatedAt: number;
  entries: WorkspaceIndexEntry[];
}

export const searchWorkspaceIndex = async (
  workspaceRoot: string,
  query: string,
  kind: "file" | "folder",
  limit: number,
) => {
  const index = await loadOrBuildWorkspaceIndex(workspaceRoot);
  const normalized = query.replace(/\\/g, "/").toLowerCase();
  return index.entries
    .filter((entry) => entry.type === kind && (!normalized || entry.path.toLowerCase().includes(normalized)))
    .sort((a, b) => scorePath(b.path, normalized) - scorePath(a.path, normalized) || a.path.localeCompare(b.path))
    .slice(0, limit);
};

const loadOrBuildWorkspaceIndex = async (workspaceRoot: string) => {
  const indexPath = workspaceIndexPath(workspaceRoot);
  const existing = await readIndex(indexPath);
  if (existing?.workspaceRoot === workspaceRoot && await indexStillFresh(workspaceRoot, existing)) return existing;
  const built = await buildWorkspaceIndex(workspaceRoot);
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.writeFile(indexPath, JSON.stringify(built), "utf8").catch(() => undefined);
  return built;
};

const buildWorkspaceIndex = async (workspaceRoot: string): Promise<WorkspaceIndexFile> => {
  const entries: WorkspaceIndexEntry[] = [];
  const walk = async (absoluteDir: string, relativeDir: string) => {
    if (entries.length >= MAX_INDEX_ENTRIES) return;
    const dirEntries = await fs.readdir(absoluteDir, { withFileTypes: true }).catch(() => []);
    for (const entry of dirEntries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entries.length >= MAX_INDEX_ENTRIES) return;
      if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;
      const relativePath = normalizePath(relativeDir ? path.join(relativeDir, entry.name) : entry.name);
      const absolutePath = path.join(absoluteDir, entry.name);
      const stat = await fs.stat(absolutePath).catch(() => null);
      if (!stat) continue;
      if (entry.isDirectory()) {
        entries.push({ path: relativePath, type: "folder", sizeBytes: 0, modifiedAtMs: stat.mtimeMs });
        await walk(absolutePath, relativePath);
      } else if (entry.isFile()) {
        const sha256 = stat.size <= MAX_HASH_BYTES
          ? await fs.readFile(absolutePath).then(hashBuffer).catch(() => undefined)
          : undefined;
        entries.push({ path: relativePath, type: "file", sizeBytes: stat.size, modifiedAtMs: stat.mtimeMs, sha256 });
      }
    }
  };
  await walk(workspaceRoot, "");
  return { version: 1, workspaceRoot, generatedAt: Date.now(), entries };
};

const indexStillFresh = async (workspaceRoot: string, index: WorkspaceIndexFile) => {
  const sample = index.entries.slice(0, 60);
  for (const entry of sample) {
    const stat = await fs.stat(path.join(workspaceRoot, entry.path)).catch(() => null);
    if (!stat) return false;
    if (entry.type === "file" && (!stat.isFile() || stat.size !== entry.sizeBytes || stat.mtimeMs !== entry.modifiedAtMs)) return false;
    if (entry.type === "folder" && !stat.isDirectory()) return false;
  }
  return true;
};

const readIndex = async (indexPath: string): Promise<WorkspaceIndexFile | null> => {
  try {
    const parsed = JSON.parse(await fs.readFile(indexPath, "utf8")) as WorkspaceIndexFile;
    return parsed?.version === 1 && Array.isArray(parsed.entries) ? parsed : null;
  } catch {
    return null;
  }
};

const workspaceIndexPath = (workspaceRoot: string) => {
  const digest = crypto.createHash("sha256").update(workspaceRoot).digest("hex");
  return path.join(process.env.PRIVORA_INDEX_DIR || path.join(os.tmpdir(), "privora-desktop-index"), `${digest}.json`);
};

const scorePath = (value: string, query: string) => {
  if (!query) return 0;
  const lower = value.toLowerCase();
  if (lower === query) return 1000;
  if (path.basename(lower) === query) return 900;
  if (lower.includes(query)) return 500 - lower.indexOf(query);
  return 0;
};

const normalizePath = (value: string) => value.replace(/\\/g, "/");
