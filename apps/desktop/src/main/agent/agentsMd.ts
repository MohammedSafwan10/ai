import fs from "node:fs/promises";
import path from "node:path";

const AGENTS_MD_FILENAME = "AGENTS.md";
const MAX_AGENTS_MD_BYTES = 64_000;

export interface LoadedAgentsMdInstruction {
  relativePath: string;
  content: string;
}

export const loadHierarchicalAgentsMd = async (
  workspaceRoot: string,
  cwd = ".",
): Promise<LoadedAgentsMdInstruction[]> => {
  const root = path.resolve(workspaceRoot);
  const target = path.resolve(root, cwd || ".");
  const relativeTarget = path.relative(root, target);
  if (relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) return [];

  const dirs = directoriesFromRoot(root, target);
  const loaded: LoadedAgentsMdInstruction[] = [];
  let remaining = MAX_AGENTS_MD_BYTES;

  for (const dir of dirs) {
    if (remaining <= 0) break;
    const filePath = path.join(dir, AGENTS_MD_FILENAME);
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat?.isFile()) continue;

    const data = await fs.readFile(filePath).catch(() => null);
    if (!data) continue;
    const slice = data.subarray(0, remaining);
    const content = slice.toString("utf8").trim();
    remaining -= slice.byteLength;
    if (!content) continue;

    loaded.push({
      relativePath: normalizeRelativePath(path.relative(root, filePath)),
      content,
    });
  }

  return loaded;
};

export const buildAgentsMdContext = async (workspaceRoot: string, cwd = ".") => {
  const docs = await loadHierarchicalAgentsMd(workspaceRoot, cwd);
  if (docs.length === 0) return "";

  return [
    "Project instructions from AGENTS.md:",
    "The following instructions were loaded automatically. Treat later, deeper files as more specific than earlier files.",
    ...docs.map((doc) => [
      `--- ${doc.relativePath} ---`,
      doc.content,
    ].join("\n")),
  ].join("\n\n");
};

const directoriesFromRoot = (root: string, target: string) => {
  const dirs = [root];
  const relative = path.relative(root, target);
  if (!relative) return dirs;

  const parts = relative.split(path.sep).filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    dirs.push(current);
  }
  return dirs;
};

const normalizeRelativePath = (value: string) => value.replace(/\\/g, "/");
