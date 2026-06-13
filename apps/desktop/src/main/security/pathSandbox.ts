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

export const ensureWorkspaceParentDirectory = (target: ResolvedWorkspacePath) => {
  const root = fs.realpathSync.native(target.workspaceRoot);
  const parentRelative = path.dirname(target.relativePath);
  if (parentRelative === ".") return root;
  let current = root;
  for (const segment of parentRelative.split(path.sep).filter(Boolean)) {
    const next = path.join(current, segment);
    if (fs.existsSync(next)) {
      const stat = fs.lstatSync(next);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw Object.assign(new Error("Workspace destination parent must be a real directory."), {
          code: "UNSAFE_WORKSPACE_PARENT",
          path: next,
        });
      }
    } else {
      fs.mkdirSync(next);
    }
    const resolved = fs.realpathSync.native(next);
    if (!isInsideWorkspace(root, resolved)) {
      throw Object.assign(new Error("Path is outside the selected workspace."), {
        code: "OUTSIDE_WORKSPACE",
        path: resolved,
      });
    }
    current = resolved;
  }
  return current;
};

export const describePath = (workspaceRoot: string, userPath: string) =>
  resolveWorkspacePath(workspaceRoot, userPath).relativePath || ".";
