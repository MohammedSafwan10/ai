import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { autoSaveSecurityEvidence } from "../src/main/attachments/securityEvidenceAutoSave";
import { listLocalEvidence, trashLocalEvidence } from "../src/main/kali/localEvidence";
import { desktopToolDefinitionsForMode, parseDesktopToolCall } from "../src/main/agent/tools/definitions";
import { classifyToolCall } from "../src/main/agent/tools/permissions";
import { planModeBlockReason } from "../src/main/agent/harness/support/userInput";

const roots: string[] = [];
async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "privora-local-evidence-")); roots.push(root);
  const bytes = Buffer.from("evidence fixture"); const sha256 = createHash("sha256").update(bytes).digest("hex");
  const file = await autoSaveSecurityEvidence({ root, workspaceId: "w", workspaceName: "Lab", jobId: "job", remotePath: "report.md", name: "report.md", sha256, bytes });
  const collection = path.dirname(path.dirname(file)); const folder = path.dirname(collection); const id = path.basename(collection);
  const trash = vi.fn(async (target: string) => { fs.renameSync(target, path.join(root, `recycled-${path.basename(target)}`)); });
  return { root, folder, collection, file, id, sha256, trash };
}
afterEach(() => { roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })); });

describe("Security PC evidence management", () => {
  it("lists verified collection identity and recycles only the requested collection", async () => {
    const t = await fixture();
    const listed = await listLocalEvidence(t.folder, "w", {});
    expect(listed.items).toMatchObject([{ id: t.id, name: "report.md", sha256: t.sha256 }]);
    const result = await trashLocalEvidence(t.folder, "w", { collections: [{ id: t.id, sha256: t.sha256 }] }, t.trash);
    expect(result.success).toBe(true); expect(t.trash).toHaveBeenCalledWith(t.collection);
    expect(fs.existsSync(t.file)).toBe(false);
    expect((await listLocalEvidence(t.folder, "w", {})).items).toEqual([]);
  });
  it("rejects another project's manifest and path traversal", async () => {
    const t = await fixture();
    expect((await trashLocalEvidence(t.folder, "other", { collections: [{ id: t.id, sha256: t.sha256 }] }, t.trash)).success).toBe(false);
    await expect(trashLocalEvidence(t.folder, "w", { collections: [{ id: "../outside", sha256: t.sha256 }] }, t.trash)).rejects.toThrow();
    expect(t.trash).not.toHaveBeenCalled(); expect(fs.existsSync(t.file)).toBe(true);
  });
  it.each(["modified", "extra", "hash"])("preserves %s evidence rather than deleting unrelated bytes", async (kind) => {
    const t = await fixture();
    if (kind === "modified") fs.writeFileSync(t.file, "edited by user");
    if (kind === "extra") fs.writeFileSync(path.join(t.collection, "notes.txt"), "user data");
    const result = await trashLocalEvidence(t.folder, "w", { collections: [{ id: t.id, sha256: kind === "hash" ? "0".repeat(64) : t.sha256 }] }, t.trash);
    expect(result.success).toBe(false); expect(t.trash).not.toHaveBeenCalled(); expect(fs.existsSync(t.file)).toBe(true);
  });
  it("rejects linked collection directories", async () => {
    const t = await fixture(); const moved = path.join(t.root, "outside");
    fs.renameSync(t.collection, moved); fs.symlinkSync(moved, t.collection, "junction");
    const result = await trashLocalEvidence(t.folder, "w", { collections: [{ id: t.id, sha256: t.sha256 }] }, t.trash);
    expect(result.success).toBe(false); expect(t.trash).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(moved, "files", path.basename(t.file)))).toBe(true);
  });
  it("reports partial failures and never falls back to permanent deletion", async () => {
    const t = await fixture(); const fail = vi.fn(async () => { throw new Error("Recycle Bin unavailable"); });
    const result = await trashLocalEvidence(t.folder, "w", { collections: [{ id: t.id, sha256: t.sha256 }] }, fail);
    expect(result.success).toBe(false); expect(result.data.results[0].error).toContain("Recycle Bin unavailable"); expect(fs.existsSync(t.file)).toBe(true);
  });
  it("honors cancellation without trashing files", async () => {
    const t = await fixture(); const controller = new AbortController(); controller.abort();
    expect((await trashLocalEvidence(t.folder, "w", { collections: [{ id: t.id, sha256: t.sha256 }] }, t.trash, controller.signal)).success).toBe(false);
    expect(t.trash).not.toHaveBeenCalled();
  });
  it("routes and classifies cleanup as a mutation; Plan exposes listing only", () => {
    const call = parseDesktopToolCall("security_evidence_trash", '{"collections":[]}')!;
    expect(classifyToolCall(call, "ask_risky").requiresApproval).toBe(true);
    expect(classifyToolCall(call, "yolo").requiresApproval).toBe(false);
    expect(planModeBlockReason(call, "plan", { risk: "risky", requiresApproval: false })).toBeTruthy();
    const plan = desktopToolDefinitionsForMode("plan", "security").map((tool) => tool.name);
    expect(plan).toContain("security_evidence_list"); expect(plan).not.toContain("security_evidence_trash");
    expect(desktopToolDefinitionsForMode("default", "development").map((tool) => tool.name)).not.toContain("security_evidence_trash");
  });
  it("does not skip later collections after recycling a page", async () => {
    const t = await fixture();
    fs.cpSync(t.collection, path.join(t.folder, "evidence-zzzzzz"), { recursive: true });
    fs.cpSync(t.collection, path.join(t.folder, "evidence-000000"), { recursive: true });
    const first = await listLocalEvidence(t.folder, "w", { limit: 1 });
    expect(first.nextCursor).toBeDefined();
    await trashLocalEvidence(t.folder, "w", { collections: first.items.map((item) => ({ id: item.id, sha256: item.sha256 })) }, t.trash);
    const remaining = await listLocalEvidence(t.folder, "w", { cursor: first.nextCursor });
    expect(remaining.items).toHaveLength(2);
  });
});
