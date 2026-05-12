import JSZip from "jszip";
import type { WebDevFile } from "./types";

const sanitizeName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "privora-web-app";

export const downloadWebDevProject = async (title: string, files: WebDevFile[]) => {
  const zip = new JSZip();
  files
    .filter(file => file.status !== "deleted")
    .forEach(file => {
      zip.file(file.path, file.content);
    });
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizeName(title)}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};
