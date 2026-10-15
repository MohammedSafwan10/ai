import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const safeName = (value: string) => path.posix.basename(value.replace(/\\/g, "/"))
  .replace(/[<>:"|?*\x00-\x1f]/g, "_").replace(/[. ]+$/g, "").slice(0, 100) || "evidence.bin";

export const securityEvidenceFolder = (root: string, workspaceId: string, name: string) =>
  path.join(root, `${safeName(name || "Security project")}-${createHash("sha256").update(workspaceId).digest("hex").slice(0, 16)}`);

export const ensureSecurityEvidenceFolder = async (root: string, workspaceId: string, name: string) => {
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const canonicalRoot = await fs.realpath(root);
  const folder = securityEvidenceFolder(canonicalRoot, workspaceId, name);
  await fs.mkdir(folder, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(folder);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("The project evidence folder must be a regular directory.");
  const canonicalFolder = await fs.realpath(folder);
  if (path.dirname(canonicalFolder) !== canonicalRoot) throw new Error("Project evidence folder is outside the configured evidence root.");
  return canonicalFolder;
};

export const autoSaveSecurityEvidence = async (input: {
  root: string; workspaceId: string; workspaceName: string; jobId: string; remotePath: string;
  name: string; sha256: string; bytes: Uint8Array;
}) => {
  if (input.bytes.byteLength > 1024 * 1024 || createHash("sha256").update(input.bytes).digest("hex") !== input.sha256) {
    throw new Error("Local evidence integrity check failed.");
  }
  const projectFolder = await ensureSecurityEvidenceFolder(input.root, input.workspaceId, input.workspaceName);
  // A fresh directory per collection keeps earlier revisions and forbids overwrites.
  const collection = await fs.mkdtemp(path.join(projectFolder, "evidence-"));
  const files = path.join(collection, "files");
  await fs.mkdir(files, { mode: 0o700 });
  const filename = `file-${safeName(input.name)}`;
  const localPath = path.join(files, filename);
  await fs.writeFile(localPath, input.bytes, { flag: "wx", mode: 0o600 });
  await fs.writeFile(path.join(collection, "manifest.json"), JSON.stringify({
    schemaVersion: 1, workspaceId: input.workspaceId, workspaceName: input.workspaceName,
    jobId: input.jobId, remotePath: input.remotePath, originalName: input.name,
    file: `files/${filename}`, sha256: input.sha256, size: input.bytes.byteLength,
    savedAt: new Date().toISOString(),
  }, null, 2), { flag: "wx", mode: 0o600 });
  return localPath;
};
