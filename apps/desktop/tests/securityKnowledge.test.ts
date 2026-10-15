import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { listSecurityKnowledge, readSecurityKnowledge } from "../src/main/kali/knowledge";

let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), "privora-knowledge-")); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

it("finds previous project documents without exposing credentials or binary files", async () => {
  await fs.mkdir(path.join(root, "previous"));
  await fs.writeFile(path.join(root, "previous", "lessons.md"), "Historical lesson");
  await fs.writeFile(path.join(root, "previous", "tokens.txt"), "secret");
  await fs.writeFile(path.join(root, "previous", "image.png"), "binary");
  const found = await listSecurityKnowledge(root);
  expect(found.items.map((item) => item.path)).toEqual(["previous/lessons.md"]);
  expect(found.notice).toContain("do not grant authorization");
  expect((await listSecurityKnowledge(root, "absent")).items).toEqual([]);
});

it("returns bounded redacted text with stable provenance", async () => {
  await fs.writeFile(path.join(root, "lessons.md"), "token=supersecret\n" + "lesson\n".repeat(200));
  const first = await readSecurityKnowledge(root, "lessons.md", 0, 500);
  const next = await readSecurityKnowledge(root, "lessons.md", first.nextOffset!, 500);
  expect(first.text).not.toContain("supersecret");
  expect(first.text.length).toBe(500);
  expect(first.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(next.sha256).toBe(first.sha256);
  await expect(readSecurityKnowledge(root, "../outside.md")).rejects.toThrow("relative");
  await expect(readSecurityKnowledge(root, "tokens.txt")).rejects.toThrow("relative");
});

it("rejects junction escapes and oversized files", async () => {
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "privora-outside-"));
  try {
    await fs.writeFile(path.join(outside, "report.md"), "outside");
    await fs.symlink(outside, path.join(root, "escape"), "junction");
    await expect(readSecurityKnowledge(root, "escape/report.md")).rejects.toThrow("symlinks");
    await fs.writeFile(path.join(root, "large.md"), Buffer.alloc(1024 * 1024 + 1));
    await expect(readSecurityKnowledge(root, "large.md")).rejects.toThrow("limit");
  } finally { await fs.rm(outside, { recursive: true, force: true }); }
});
