import { StringDecoder } from "node:string_decoder";
import { redactSecrets } from "../security/redact";

export const SECURITY_TOOL_NAMES = [
  "kali_capabilities", "kali_exec", "kali_job_status", "kali_job_output",
  "kali_job_cancel", "kali_artifact", "security_finding_list", "security_finding_save",
] as const;

export const isSecurityTool = (name: string) => SECURITY_TOOL_NAMES.some((tool) => tool === name);

/** Local command history mirrors the argv actually sent to the assigned VM. */
export const kaliCommandPreview = (argv: readonly unknown[]) => {
  const displayed = argv.map((arg) => {
    const value = String(arg);
    return /\s/.test(value) ? JSON.stringify(value) : value;
  });
  return displayed.join(" ").slice(0, 2000);
};

export const requiredText = (value: unknown, label: string, limit = 20_000) => {
  if (typeof value !== "string" || !value.trim() || value.length > limit || value.includes("\0")) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
};

export const kaliArtifactMime = (name: string, bytes: Buffer) => {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))) return "image/gif";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (/\.(txt|log|json|xml|csv|md|yaml|yml)$/i.test(name)) {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      // Preserve raw evidence without displaying recognized credentials inline.
      if (!text.includes("\0") && redactSecrets(text) === text) return "text/plain";
    } catch { /* Binary files remain downloads. */ }
  }
  return "application/octet-stream";
};

/** Emit partial lines immediately, preserving split UTF-8 per output stream. */
export class KaliOutputDecoder {
  private readonly decoders = { stdout: new StringDecoder("utf8"), stderr: new StringDecoder("utf8") };

  push(stream: "stdout" | "stderr", bytes: Buffer) {
    return this.decoders[stream].write(bytes);
  }

  finish() {
    return this.decoders.stdout.end() + this.decoders.stderr.end();
  }
}
