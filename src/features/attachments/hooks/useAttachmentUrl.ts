import { useEffect, useState } from "react";
import type { Attachment } from "../../../lib/attachments";

export function useAttachmentUrl(attachment?: Attachment | null): string {
  const [url, setUrl] = useState<string>("");

  const blob = attachment?.blob;
  const base64 = attachment?.base64;
  const mimeType = attachment?.mimeType;
  const originalUrl = attachment?.url;

  useEffect(() => {
    if (!attachment) {
      setUrl("");
      return;
    }

    let activeUrl = "";
    if (blob) {
      activeUrl = URL.createObjectURL(blob);
      setUrl(activeUrl);
    } else if (base64) {
      activeUrl = `data:${mimeType || "application/octet-stream"};base64,${base64}`;
      setUrl(activeUrl);
    } else {
      setUrl(originalUrl || "");
    }

    return () => {
      if (activeUrl && activeUrl.startsWith("blob:")) {
        URL.revokeObjectURL(activeUrl);
      }
    };
  }, [blob, base64, mimeType, originalUrl]);

  return url;
}
