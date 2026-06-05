import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import type {
  StorageCleanupCategoryId,
  StorageCleanupInput,
  StorageCleanupResult,
  StorageUsageCategoryRecord,
  StorageUsageSnapshot,
} from "../../shared/types";

interface StorageCleanupServiceOptions {
  userDataPath: string;
  downloadsPath: string;
  clearBrowserProfileData?: () => Promise<void>;
}

interface DirectoryStats {
  bytes: number;
  files: number;
  directories: number;
  errors: string[];
}

const WORKFLOW_FILE = "browser-workflows-v1.json";
const BROWSER_ARTIFACTS_DIR = "browser-artifacts";
const PRIVORA_DOWNLOADS_DIR = "Privora";
const YIELD_EVERY = 160;

export class StorageCleanupService {
  constructor(private options: StorageCleanupServiceOptions) {}

  async usage(): Promise<StorageUsageSnapshot> {
    const categories = await Promise.all([
      this.browserArtifactsCategory(),
      this.browserWorkflowHistoryCategory(),
      this.browserCacheCategory(),
      this.browserDownloadsCategory(),
    ]);
    return {
      categories,
      totalBytes: categories.reduce((sum, category) => sum + category.bytes, 0),
      scannedAt: Date.now(),
    };
  }

  async cleanup(input: StorageCleanupInput): Promise<StorageCleanupResult> {
    const selected = new Set(input.categoryIds);
    const before = await this.usage();
    const results: StorageCleanupResult["categories"] = [];

    for (const category of CATEGORY_ORDER) {
      if (!selected.has(category)) continue;
      if (category === "browser_artifacts") results.push(await this.cleanupDirectoryCategory(category, this.browserArtifactsPath()));
      if (category === "browser_workflow_history") results.push(await this.cleanupWorkflowHistory());
      if (category === "browser_cache") results.push(await this.cleanupBrowserCache());
      if (category === "browser_downloads") results.push(await this.cleanupDirectoryCategory(category, this.privoraDownloadsPath()));
    }

    const after = await this.usage();
    return {
      before,
      after,
      categories: results,
      totalBytesFreed: results.reduce((sum, category) => sum + category.bytesFreed, 0),
      completedAt: Date.now(),
    };
  }

  private async browserArtifactsCategory(): Promise<StorageUsageCategoryRecord> {
    const stats = await scanDirectory(this.browserArtifactsPath());
    return {
      id: "browser_artifacts",
      label: "Browser evidence artifacts",
      description: "Screenshots, PDF text artifacts, and saved browser evidence files.",
      bytes: stats.bytes,
      files: stats.files,
      directories: stats.directories,
      safeToClean: true,
      userFiles: false,
      path: this.browserArtifactsPath(),
      errors: stats.errors,
    };
  }

  private async browserWorkflowHistoryCategory(): Promise<StorageUsageCategoryRecord> {
    const filePath = this.workflowPath();
    const stats = await workflowHistoryStats(filePath);
    return {
      id: "browser_workflow_history",
      label: "Workflow run history",
      description: "Saved workflow runs, assertion results, and evidence index records. Workflow definitions are kept.",
      bytes: stats.bytes,
      files: stats.records,
      directories: 0,
      safeToClean: true,
      userFiles: false,
      path: filePath,
      errors: stats.errors,
    };
  }

  private async browserCacheCategory(): Promise<StorageUsageCategoryRecord> {
    const roots = await browserCacheRoots(this.options.userDataPath);
    const stats = await scanManyDirectories(roots);
    return {
      id: "browser_cache",
      label: "Browser cache and profiles",
      description: "Per-workspace browser cache, cookies, storage, and Chromium profile data.",
      bytes: stats.bytes,
      files: stats.files,
      directories: stats.directories,
      safeToClean: true,
      userFiles: false,
      path: path.join(this.options.userDataPath, "Partitions"),
      errors: stats.errors,
    };
  }

  private async browserDownloadsCategory(): Promise<StorageUsageCategoryRecord> {
    const stats = await scanDirectory(this.privoraDownloadsPath());
    return {
      id: "browser_downloads",
      label: "Privora downloads",
      description: "Files downloaded through Privora Browser. These are user-visible files in Downloads.",
      bytes: stats.bytes,
      files: stats.files,
      directories: stats.directories,
      safeToClean: false,
      userFiles: true,
      path: this.privoraDownloadsPath(),
      errors: stats.errors,
    };
  }

  private async cleanupDirectoryCategory(categoryId: StorageCleanupCategoryId, root: string) {
    const before = await scanDirectory(root);
    const deleted = await deleteDirectoryContents(root);
    const after = await scanDirectory(root);
    return {
      id: categoryId,
      bytesFreed: Math.max(0, before.bytes - after.bytes),
      filesRemoved: Math.max(0, before.files - after.files),
      errors: [...before.errors, ...deleted.errors, ...after.errors],
    };
  }

  private async cleanupWorkflowHistory() {
    const before = await workflowHistoryStats(this.workflowPath());
    const errors: string[] = [];
    try {
      await pruneWorkflowHistory(this.workflowPath());
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    const after = await workflowHistoryStats(this.workflowPath());
    return {
      id: "browser_workflow_history" as const,
      bytesFreed: Math.max(0, before.bytes - after.bytes),
      filesRemoved: Math.max(0, before.records - after.records),
      errors: [...before.errors, ...errors, ...after.errors],
    };
  }

  private async cleanupBrowserCache() {
    const roots = await browserCacheRoots(this.options.userDataPath);
    const before = await scanManyDirectories(roots);
    const errors: string[] = [];
    try {
      await this.options.clearBrowserProfileData?.();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    for (const root of roots) {
      const cacheDirs = await knownCacheSubdirectories(root);
      for (const cacheDir of cacheDirs) {
        const deleted = await deleteDirectoryContents(cacheDir);
        errors.push(...deleted.errors);
      }
    }
    const after = await scanManyDirectories(roots);
    return {
      id: "browser_cache" as const,
      bytesFreed: Math.max(0, before.bytes - after.bytes),
      filesRemoved: Math.max(0, before.files - after.files),
      errors: [...before.errors, ...errors, ...after.errors],
    };
  }

  private browserArtifactsPath() {
    return path.join(this.options.userDataPath, BROWSER_ARTIFACTS_DIR);
  }

  private workflowPath() {
    return path.join(this.options.userDataPath, WORKFLOW_FILE);
  }

  private privoraDownloadsPath() {
    return path.join(this.options.downloadsPath, PRIVORA_DOWNLOADS_DIR);
  }
}

const CATEGORY_ORDER: StorageCleanupCategoryId[] = [
  "browser_artifacts",
  "browser_workflow_history",
  "browser_cache",
  "browser_downloads",
];

const emptyStats = (): DirectoryStats => ({ bytes: 0, files: 0, directories: 0, errors: [] });

const scanManyDirectories = async (roots: string[]) => {
  const total = emptyStats();
  for (const root of roots) {
    const stats = await scanDirectory(root);
    total.bytes += stats.bytes;
    total.files += stats.files;
    total.directories += stats.directories;
    total.errors.push(...stats.errors);
  }
  return total;
};

export const scanDirectory = async (root: string): Promise<DirectoryStats> => {
  const resolvedRoot = path.resolve(root);
  const stats = emptyStats();
  if (!fsSync.existsSync(resolvedRoot)) return stats;

  const stack = [resolvedRoot];
  let operations = 0;
  while (stack.length) {
    const current = stack.pop()!;
    let entries: fsSync.Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch (error) {
      stats.errors.push(compactError(error));
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stats.directories += 1;
        stack.push(entryPath);
      } else if (entry.isFile()) {
        stats.files += 1;
        try {
          stats.bytes += (await fs.stat(entryPath)).size;
        } catch (error) {
          stats.errors.push(compactError(error));
        }
      }
      operations += 1;
      if (operations % YIELD_EVERY === 0) await yieldToLoop();
    }
  }
  return stats;
};

const deleteDirectoryContents = async (root: string) => {
  const resolvedRoot = path.resolve(root);
  const errors: string[] = [];
  if (!fsSync.existsSync(resolvedRoot)) return { errors };
  let entries: fsSync.Dirent[];
  try {
    entries = await fs.readdir(resolvedRoot, { withFileTypes: true });
  } catch (error) {
    return { errors: [compactError(error)] };
  }

  let operations = 0;
  for (const entry of entries) {
    const entryPath = path.join(resolvedRoot, entry.name);
    if (!isPathInside(resolvedRoot, entryPath)) {
      errors.push(`Skipped unsafe cleanup path: ${entryPath}`);
      continue;
    }
    try {
      await fs.rm(entryPath, { recursive: true, force: true, maxRetries: 2, retryDelay: 80 });
    } catch (error) {
      errors.push(compactError(error));
    }
    operations += 1;
    if (operations % 24 === 0) await yieldToLoop();
  }
  return { errors };
};

const workflowHistoryStats = async (filePath: string) => {
  const errors: string[] = [];
  if (!fsSync.existsSync(filePath)) return { bytes: 0, records: 0, errors };
  let bytes = 0;
  let records = 0;
  try {
    bytes = (await fs.stat(filePath)).size;
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as { runs?: unknown[]; evidence?: unknown[] };
    records = (Array.isArray(parsed.runs) ? parsed.runs.length : 0) + (Array.isArray(parsed.evidence) ? parsed.evidence.length : 0);
  } catch (error) {
    errors.push(compactError(error));
  }
  return { bytes, records, errors };
};

const pruneWorkflowHistory = async (filePath: string) => {
  if (!fsSync.existsSync(filePath)) return;
  const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as Record<string, unknown>;
  await fs.writeFile(filePath, `${JSON.stringify({ ...parsed, runs: [], evidence: [] }, null, 2)}\n`, "utf8");
};

const browserCacheRoots = async (userDataPath: string) => {
  const partitionsRoot = path.join(userDataPath, "Partitions");
  if (!fsSync.existsSync(partitionsRoot)) return [];
  const entries = await fs.readdir(partitionsRoot, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.includes("privora-browser"))
    .map((entry) => path.join(partitionsRoot, entry.name));
};

const knownCacheSubdirectories = async (profileRoot: string) => {
  const candidates = [
    "Cache",
    "Code Cache",
    "GPUCache",
    "DawnCache",
    "blob_storage",
    path.join("Service Worker", "CacheStorage"),
    path.join("Service Worker", "ScriptCache"),
  ].map((item) => path.join(profileRoot, item));
  return candidates.filter((item) => fsSync.existsSync(item));
};

const isPathInside = (root: string, target: string) => {
  const relative = path.relative(root, path.resolve(target));
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
};

const compactError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").slice(0, 300);
};

const yieldToLoop = () => new Promise<void>((resolve) => setImmediate(resolve));
