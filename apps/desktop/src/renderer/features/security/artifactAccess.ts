import type { DesktopAttachmentRecord } from "../../../shared/types";

export const trustedArtifactUrl = (artifact: Pick<DesktopAttachmentRecord, "artifactId" | "url">) => {
  const url = new URL(artifact.url);
  if (url.protocol !== "privora-attachment:" || url.hostname !== "artifact" || decodeURIComponent(url.pathname.slice(1)) !== artifact.artifactId) {
    throw new Error("Invalid evidence attachment URL");
  }
  return url.href;
};
