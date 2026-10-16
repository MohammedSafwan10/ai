import type { ToolEventRecord } from "./types";

/** Display persisted tool facts, never paths reconstructed from assistant prose. */
export function savedSecurityEvidence(tool: ToolEventRecord) {
  const data = tool.result?.data;
  if (tool.name !== "kali_artifact" || tool.status !== "done" || tool.result?.success !== true || data?.localSaved !== true || typeof data.localPath !== "string" || !data.localPath.trim()) return null;
  const attachment = data.attachment as { name?: unknown; size?: unknown } | undefined;
  return {
    localPath: data.localPath,
    name: typeof attachment?.name === "string" ? attachment.name : undefined,
    size: typeof attachment?.size === "number" && Number.isSafeInteger(attachment.size) && attachment.size >= 0 ? attachment.size : undefined,
    sha256: typeof data.sha256 === "string" && /^[a-f0-9]{64}$/i.test(data.sha256) ? data.sha256 : undefined,
  };
}
