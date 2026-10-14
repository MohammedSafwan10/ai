import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolEventRecord, TurnUndoOperationRecord } from "../../shared/types";
const execute = promisify(execFile);
const git = async (root: string, args: string[]) => (await execute("git", ["--literal-pathspecs", ...args], { cwd: root, windowsHide: true, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 })).stdout.trim();

export const readGitHead = async (root: string): Promise<string | undefined> => {
  try { return await git(root, ["rev-parse", "--verify", "HEAD"]); }
  catch { return undefined; }
};

// Commit only the recorded paths whose committed content changed since an
// agent edit. Never reset history or include unrelated staged/user changes.
export const prepareGitReversal = async (root: string, tools: ToolEventRecord[], operations: TurnUndoOperationRecord[]) => {
  const baseline = tools.find((tool) => typeof tool.result?.data?.gitHeadBefore === "string")?.result?.data?.gitHeadBefore;
  if (typeof baseline !== "string" || !/^[a-f0-9]{40,64}$/.test(baseline)) return null;
  const head = await readGitHead(root);
  if (!head || head === baseline) return null;
  await git(root, ["merge-base", "--is-ancestor", baseline, head]);
  const repoRoot = await git(root, ["rev-parse", "--show-toplevel"]);
  const path = await import("node:path");
  const prefix = path.relative(repoRoot, root).replace(/\\/g, "/");
  if (prefix === ".." || prefix.startsWith("../") || path.isAbsolute(prefix)) throw new Error("Workspace is outside its Git repository.");
  const committed = new Set((await git(repoRoot, ["diff", "--no-renames", "--name-only", "-z", baseline, head])).split("\0").filter(Boolean));
  const paths = Array.from(new Set(operations.flatMap((operation) => operation.type === "rename_path"
    ? [operation.fromPath, operation.toPath] : [operation.path, operation.restorePath].filter((item): item is string => Boolean(item)))))
    .map((item) => path.posix.join(prefix, item.replace(/\\/g, "/"))).filter((item) => committed.has(item));
  if (!paths.length) return null;
  const staged = new Set((await git(repoRoot, ["diff", "--cached", "--name-only", "-z"])).split("\0").filter(Boolean));
  if (paths.some((item) => staged.has(item))) throw new Error("Unstage the affected files before rewinding. Your staged changes were preserved.");
  // Fail before any file restoration if a reversal commit cannot be authored.
  await git(repoRoot, ["var", "GIT_AUTHOR_IDENT"]);
  await git(repoRoot, ["var", "GIT_COMMITTER_IDENT"]);
  return {
    commit: async () => {
      if (await readGitHead(root) !== head) throw new Error("Git history changed during rewind. File restoration was kept; review before committing.");
      const changed = new Set((await git(repoRoot, ["diff", "--name-only", "-z", "HEAD", "--", ...paths])).split("\0").filter(Boolean));
      const restored = new Set((await git(repoRoot, ["ls-files", "--others", "-z", "--", ...paths])).split("\0").filter(Boolean));
      const selected = paths.filter((item) => changed.has(item) || restored.has(item));
      if (!selected.length) return undefined;
      await git(repoRoot, ["add", "--force", "-A", "--", ...selected]);
      try {
        await git(repoRoot, ["-c", `core.hooksPath=${process.platform === "win32" ? "NUL" : "/dev/null"}`, "commit", "--only", "-m", "Revert Privora changes for edited conversation", "--", ...selected]);
      } catch (error) {
        await git(repoRoot, ["restore", "--staged", `--source=${head}`, "--", ...selected]);
        throw error;
      }
      return await readGitHead(root);
    },
  };
};
