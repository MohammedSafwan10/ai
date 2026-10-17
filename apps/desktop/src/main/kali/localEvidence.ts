import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";

const collectionId = z.string().regex(/^evidence-[A-Za-z0-9]+$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/i);
const manifestSchema = z.object({
  schemaVersion: z.literal(1), workspaceId: z.string(), jobId: z.string(),
  originalName: z.string().max(1000), remotePath: z.string().max(4000),
  file: z.string().regex(/^files\/file-[^/\\]+$/), sha256: hash,
  size: z.number().int().min(0).max(1024 * 1024), savedAt: z.string(),
});
export const evidenceDeleteSchema = z.object({
  collections: z.array(z.object({ id: collectionId, sha256: hash }).strict()).min(1).max(20),
}).strict();

async function regular(target: string, kind: "file" | "directory") {
  const stat = await fs.lstat(target);
  if (stat.isSymbolicLink() || (kind === "file" ? !stat.isFile() : !stat.isDirectory())) throw new Error("Linked or non-regular evidence paths are not allowed.");
  return stat;
}

async function readBounded(filename: string, max: number) {
  const file = await fs.open(filename, "r");
  try {
    const before = await file.stat();
    if (!before.isFile() || before.size > max) throw new Error("Evidence exceeds its size limit.");
    const buffer = Buffer.alloc(before.size + 1);
    let count = 0;
    while (count < buffer.length) { const { bytesRead } = await file.read(buffer, count, buffer.length - count, count); if (!bytesRead) break; count += bytesRead; }
    const after = await file.stat();
    if (count !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new Error("Evidence changed while reading; try listing again.");
    return buffer.subarray(0, count);
  } finally { await file.close(); }
}

async function inspect(folder: string, workspaceId: string, id: string) {
  collectionId.parse(id);
  await regular(folder, "directory");
  const root = await fs.realpath(folder);
  const collection = path.join(root, id);
  await regular(collection, "directory");
  if (path.dirname(await fs.realpath(collection)) !== root) throw new Error("Evidence collection is outside this project.");
  const manifestPath = path.join(collection, "manifest.json");
  if ((await regular(manifestPath, "file")).size > 32768) throw new Error("Evidence manifest is too large.");
  const manifest = manifestSchema.parse(JSON.parse((await readBounded(manifestPath, 32768)).toString("utf8")));
  if (manifest.workspaceId !== workspaceId) throw new Error("Evidence belongs to another Security project.");
  const files = path.join(collection, "files");
  await regular(files, "directory");
  const names = await fs.readdir(collection);
  const fileNames = await fs.readdir(files);
  if (names.length !== 2 || !names.includes("manifest.json") || !names.includes("files") || fileNames.length !== 1 || fileNames[0] !== manifest.file.slice(6)) {
    throw new Error("Collection contains unrecorded files; it was preserved.");
  }
  const filename = path.join(collection, manifest.file);
  const stat = await regular(filename, "file");
  if (stat.size !== manifest.size || createHash("sha256").update(await readBounded(filename, 1024 * 1024)).digest("hex") !== manifest.sha256.toLowerCase()) {
    throw new Error("PC evidence has changed since collection; it was preserved.");
  }
  return { collection, manifest, filename };
}

export async function listLocalEvidence(folder: string, workspaceId: string, input: Record<string, unknown>) {
  const { query, cursor, limit } = z.object({ query: z.string().max(200).default(""), cursor: collectionId.optional(), limit: z.number().int().min(1).max(100).default(40) }).strict().parse(input);
  await regular(folder, "directory");
  const ids = (await fs.readdir(folder)).filter((id) => collectionId.safeParse(id).success && (!cursor || id > cursor)).sort();
  const items = []; const skipped: { id: string; reason: string }[] = [];
  let index = 0;
  // A stable ID cursor avoids skipping later collections after a prior page
  // is recycled. Bound work even when the query matches nothing.
  for (; index < Math.min(ids.length, 200) && items.length < limit; index++) {
    const id = ids[index];
    try {
      const { manifest } = await inspect(folder, workspaceId, id);
      if (query && !`${id} ${manifest.originalName} ${manifest.remotePath}`.toLowerCase().includes(query.toLowerCase())) continue;
      items.push({ id, name: manifest.originalName, remotePath: manifest.remotePath, jobId: manifest.jobId, size: manifest.size, sha256: manifest.sha256, savedAt: manifest.savedAt });
    } catch (error) { skipped.push({ id, reason: error instanceof Error ? error.message : "Could not inspect evidence." }); }
  }
  return { items, skipped, ...(index < ids.length ? { nextCursor: ids[index - 1] } : {}), notice: "Verified PC copies for this Security project only. These are separate from VM originals and Privora attachments." };
}

export async function trashLocalEvidence(folder: string, workspaceId: string, input: Record<string, unknown>, trash: (filename: string) => Promise<void>, signal?: AbortSignal) {
  const { collections } = evidenceDeleteSchema.parse(input);
  const results: { id: string; state: "trashed" | "failed"; error?: string }[] = [];
  const seen = new Set<string>();
  for (const selected of collections) {
    if (seen.has(selected.id)) continue;
    seen.add(selected.id);
    try {
      signal?.throwIfAborted();
      const item = await inspect(folder, workspaceId, selected.id);
      if (item.manifest.sha256.toLowerCase() !== selected.sha256.toLowerCase()) throw new Error("Collection hash differs from the selected record; list evidence again.");
      // Resolve and validate the exact absolute target before handing it to the
      // OS. There is deliberately no recursive-delete fallback if trash fails.
      await regular(folder, "directory"); await regular(item.collection, "directory");
      if (path.dirname(await fs.realpath(item.collection)) !== await fs.realpath(folder)) throw new Error("Evidence path changed; collection preserved.");
      signal?.throwIfAborted();
      await trash(item.collection);
      results.push({ id: selected.id, state: "trashed" });
    } catch (error) { results.push({ id: selected.id, state: "failed", error: error instanceof Error ? error.message : "Could not move evidence to Recycle Bin." }); }
  }
  return { success: results.every((item) => item.state === "trashed"), output: `${results.filter((item) => item.state === "trashed").length} PC evidence collections moved to Recycle Bin. VM originals and Privora attachments were kept.`, data: { results } };
}
