import path from "node:path";
import type { SecurityJobRecord } from "../../shared/securityWorkspace";

const MAX_EVIDENCE_BYTES = 1024 * 1024;

export const securityEvidenceForSave = (job: Pick<SecurityJobRecord, "workspaceId" | "artifacts"> | null, workspaceId: string | null, artifactId: string, load: (id: string) => Uint8Array) => {
  if (!job || !workspaceId || job.workspaceId !== workspaceId) throw new Error("Evidence job is not in the active Security workspace.");
  const artifact = job.artifacts?.find((item) => item.artifactId === artifactId);
  if (!artifact || !/^[a-f0-9]{64}\.bin$/.test(artifactId)) throw new Error("Evidence attachment not found.");
  if (artifact.size > MAX_EVIDENCE_BYTES) throw new Error("Evidence attachment exceeds the save limit.");
  const bytes = load(artifactId);
  if (bytes.byteLength > MAX_EVIDENCE_BYTES || bytes.byteLength !== artifact.size) throw new Error("Evidence attachment size does not match its record.");
  const name = path.basename(artifact.name.replace(/\\/g, "/")).replace(/[<>:"|?*\x00-\x1f]/g, "_") || "evidence.bin";
  return { name, bytes };
};
