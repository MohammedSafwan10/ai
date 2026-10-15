import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { autoSaveSecurityEvidence, ensureSecurityEvidenceFolder, securityEvidenceFolder } from "../src/main/attachments/securityEvidenceAutoSave";

let directory = "";
const fixture = () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "privora-evidence-copy-"));
  const bytes = Buffer.from("# Submitted report\nSynthetic evidence");
  return { root: directory, workspaceId: "workspace-one", workspaceName: "Mattermost", jobId: "job-one", remotePath: "evidence/h8/report.md", name: "report.md", bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
};
afterEach(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); directory = ""; });

describe("automatic Security evidence copies", () => {
  it("preserves exact bytes, provenance and older copies in separate project folders", async () => {
    const input = fixture();
    const first = await autoSaveSecurityEvidence(input);
    const second = await autoSaveSecurityEvidence(input);
    expect(first).not.toBe(second);
    expect(fs.readFileSync(first)).toEqual(input.bytes);
    expect(fs.readFileSync(second)).toEqual(input.bytes);
    const manifest = JSON.parse(fs.readFileSync(path.join(path.dirname(path.dirname(first)), "manifest.json"), "utf8"));
    expect(manifest).toMatchObject({ jobId: input.jobId, workspaceId: input.workspaceId, remotePath: input.remotePath, sha256: input.sha256, size: input.bytes.length });
    const other = await autoSaveSecurityEvidence({ ...input, workspaceId: "workspace-two" });
    expect(path.relative(securityEvidenceFolder(input.root, input.workspaceId, input.workspaceName), other)).toMatch(/^\.\./);
  });
  it("contains path-like names and avoids Windows device filenames", async () => {
    const input = fixture();
    const saved = await autoSaveSecurityEvidence({ ...input, workspaceName: "../../CON", name: "..\\..\\CON" });
    expect(path.basename(saved)).toBe("file-CON");
    expect(path.relative(directory, saved)).not.toMatch(/^\.\./);
  });
  it("rejects corrupt or oversized bytes before writing", async () => {
    const input = fixture();
    await expect(autoSaveSecurityEvidence({ ...input, sha256: "bad" })).rejects.toThrow("integrity");
    await expect(autoSaveSecurityEvidence({ ...input, bytes: Buffer.alloc(1024 * 1024 + 1) })).rejects.toThrow("integrity");
    expect(fs.readdirSync(directory)).toEqual([]);
  });
  it("refuses a project-folder junction instead of writing outside the root", async () => {
    const input = fixture();
    const outside = path.join(directory, "elsewhere"); fs.mkdirSync(outside);
    fs.symlinkSync(outside, securityEvidenceFolder(input.root, input.workspaceId, input.workspaceName), process.platform === "win32" ? "junction" : "dir");
    await expect(ensureSecurityEvidenceFolder(input.root, input.workspaceId, input.workspaceName)).rejects.toThrow("regular directory");
    expect(fs.readdirSync(outside)).toEqual([]);
  });
});
