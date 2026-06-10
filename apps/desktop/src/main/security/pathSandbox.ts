import fs from "node:fs";
import path from "node:path";

export interface ResolvedWorkspacePath {
  workspaceRoot: string;
  absolutePath: string;
  relativePath: string;
}

interface ResolveOptions {
  allowMissingFinal: boolean;
}

const realpathOrResolve = (value: string) => {
  try {
    return fs.realpathSync.native(value);
  } catch {
    return path.resolve(value);
  }
};

const isInsideWorkspace = (root: string, target: string) => {
  const relativePath = path.relative(root, target);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
};

const resolvePath = (workspaceRoot: string, userPath: string, options: ResolveOptions): ResolvedWorkspacePath => {
  const root = realpathOrResolve(workspaceRoot);
  const absolutePath = path.isAbsolute(userPath)
    ? path.resolve(userPath)
    : path.resolve(root, userPath);
  const finalPath = fs.existsSync(absolutePath)
    ? fs.realpathSync.native(absolutePath)
    : options.allowMissingFinal
      ? path.resolve(realpathOrResolve(path.dirname(absolutePath)), path.basename(absolutePath))
      : absolutePath;
  const relativePath = path.relative(root, finalPath);
  if (!isInsideWorkspace(root, finalPath)) {
    throw Object.assign(new Error("Path is outside the selected workspace."), {
      code: "OUTSIDE_WORKSPACE",
      path: finalPath,
    });
  }
  if (!options.allowMissingFinal && !fs.existsSync(finalPath)) {
    throw Object.assign(new Error("Path does not exist."), {
      code: "PATH_NOT_FOUND",
      path: finalPath,
    });
  }
  return { workspaceRoot: root, absolutePath: finalPath, relativePath };
};

export const resolveWorkspacePath = (workspaceRoot: string, userPath: string): ResolvedWorkspacePath =>
  resolvePath(workspaceRoot, userPath, { allowMissingFinal: true });

export const resolveExistingWorkspacePath = (workspaceRoot: string, userPath: string): ResolvedWorkspacePath =>
  resolvePath(workspaceRoot, userPath, { allowMissingFinal: false });

export const revalidateResolvedWorkspacePath = (target: ResolvedWorkspacePath): ResolvedWorkspacePath => {
  const root = realpathOrResolve(target.workspaceRoot);
  const parent = realpathOrResolve(path.dirname(target.absolutePath));
  const finalPath = fs.existsSync(target.absolutePath)
    ? fs.realpathSync.native(target.absolutePath)
    : path.resolve(parent, path.basename(target.absolutePath));
  const relativePath = path.relative(root, finalPath);
  if (!isInsideWorkspace(root, finalPath)) {
    throw Object.assign(new Error("Path is outside the selected workspace."), {
      code: "OUTSIDE_WORKSPACE",
      path: finalPath,
    });
  }
  return { workspaceRoot: root, absolutePath: finalPath, relativePath };
};

export const describePath = (workspaceRoot: string, userPath: string) =>
  resolveWorkspacePath(workspaceRoot, userPath).relativePath || ".";
