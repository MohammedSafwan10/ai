import { describe, expect, it, vi } from "vitest";
import { securityEvidenceForSave } from "../src/main/attachments/securityEvidence";

const artifactId = `${"b".repeat(64)}.bin`;
const artifact = { id: "attachment", name: "evidence.txt", mimeType: "text/plain", size: 8, artifactId, url: `privora-attachment://artifact/${artifactId}`, createdAt: 1 };
const job = { workspaceId: "security-project", artifacts: [artifact] };

describe("Security evidence native save", () => {
  it("saves only the persisted job-owned attachment bytes", () => {
    const load = vi.fn(() => Buffer.from("evidence"));
    const result = securityEvidenceForSave(job, "security-project", artifactId, load);
    expect(result.name).toBe("evidence.txt");
    expect(Buffer.from(result.bytes).toString()).toBe("evidence");
    expect(load).toHaveBeenCalledWith(artifactId);
  });

  it("rejects other-workspace or unrelated attachments before loading", () => {
    const load = vi.fn(() => Buffer.from("evidence"));
    expect(() => securityEvidenceForSave(job, "different-project", artifactId, load)).toThrow("active Security workspace");
    expect(() => securityEvidenceForSave(job, "security-project", `${"c".repeat(64)}.bin`, load)).toThrow("not found");
    expect(load).not.toHaveBeenCalled();
  });

  it("bounds evidence and rejects size mismatches", () => {
    expect(() => securityEvidenceForSave({ ...job, artifacts: [{ ...artifact, size: 2 * 1024 * 1024 }] }, "security-project", artifactId, () => Buffer.alloc(0))).toThrow("save limit");
    expect(() => securityEvidenceForSave(job, "security-project", artifactId, () => Buffer.from("partial"))).toThrow("does not match");
  });

  it("uses a plain default filename even for path-like remote names", () => {
    const record = { ...job, artifacts: [{ ...artifact, name: "..\\folder\\evidence.txt" }] };
    expect(securityEvidenceForSave(record, "security-project", artifactId, () => Buffer.from("evidence")).name).toBe("evidence.txt");
  });
});
