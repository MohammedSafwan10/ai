import fs from "node:fs";
import path from "node:path";

export interface ResolvedWorkspacePath {
  workspaceRoot: string;
  absolutePath: string;
  relativePath: string;
}

const realpathOrResolve = (value: string) => {
  try {
    return fs.realpathSync.native(value);
  } catch {
    return path.resolve(value);
  }
};

export const resolveWorkspacePath = (workspaceRoot: string, userPath: string): ResolvedWorkspacePath => {
  const root = realpathOrResolve(workspaceRoot);
  const absolutePath = path.isAbsolute(userPath)
    ? path.resolve(userPath)
    : path.resolve(root, userPath);
  const normalized = realpathOrResolve(path.dirname(absolutePath));
  const finalPath = path.resolve(normalized, path.basename(absolutePath));
  const relativePath = path.relative(root, finalPath);
  const outside = relativePath.startsWith("..") || path.isAbsolute(relativePath);
  if (outside) {
    throw Object.assign(new Error("Path is outside the selected workspace."), {
      code: "OUTSIDE_WORKSPACE",
      path: finalPath,
    });
  }
  return { workspaceRoot: root, absolutePath: finalPath, relativePath };
};

export const describePath = (workspaceRoot: string, userPath: string) =>
  resolveWorkspacePath(workspaceRoot, userPath).relativePath || ".";
