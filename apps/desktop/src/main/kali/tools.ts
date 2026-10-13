import { StringDecoder } from "node:string_decoder";
import { redactSecrets } from "../security/redact";

export const SECURITY_TOOL_NAMES = [
  "kali_capabilities", "kali_exec", "kali_job_status", "kali_job_output",
  "kali_job_cancel", "kali_artifact", "security_finding_list", "security_finding_save",
] as const;

export const isSecurityTool = (name: string) => SECURITY_TOOL_NAMES.some((tool) => tool === name);

/** Display only: leave execution argv intact and keep opaque scripts out of logs. */
export const kaliCommandPreview = (argv: readonly unknown[]) => {
  const executable = String(argv[0] || "").split(/[\\/]/).pop()?.toLowerCase() || "";
  const shell = /^(?:ba|da|z|k)?sh$/.test(executable);
  const interpreter = shell || /^(?:python[\d.]*|node|perl|ruby|pwsh|powershell)(?:\.exe)?$/.test(executable);
  let hideNext = false;
  const displayed = argv.map((arg, index) => {
    const value = String(arg);
    if (hideNext) { hideNext = false; return "[redacted]"; }
    if (index > 0 && interpreter && (/^(?:-c|-e|--command|-command|-encodedcommand)$/i.test(value) || (shell && /^-[a-z]*c[a-z]*$/i.test(value)))) {
      hideNext = true;
      return value;
    }
    if (/^--?(?:password|passwd|passphrase|token|secret|api[-_]?key|access[-_]?key|authorization|cookie|credential|proxy-user|user)(?:=|$)/i.test(value) || (index > 0 && /^(curl|wget)$/.test(executable) && value === "-u")) {
      const equals = value.indexOf("=");
      if (equals >= 0) return `${value.slice(0, equals + 1)}[redacted]`;
      hideNext = true;
      return value;
    }
    const safe = redactSecrets(value).replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[redacted]@");
    return /\s/.test(safe) ? JSON.stringify(safe) : safe;
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

/** Secrets can span transport chunks. Only release complete lines after redaction. */
export class KaliOutputDecoder {
  private readonly decoders = { stdout: new StringDecoder("utf8"), stderr: new StringDecoder("utf8") };
  private readonly lines = { stdout: "", stderr: "" };
  private readonly discarded = { stdout: false, stderr: false };

  push(stream: "stdout" | "stderr", bytes: Buffer) {
    return this.accept(stream, this.decoders[stream].write(bytes));
  }

  finish() {
    let result = "";
    for (const stream of ["stdout", "stderr"] as const) {
      result += this.accept(stream, this.decoders[stream].end());
      if (!this.discarded[stream]) result += redactSecrets(this.lines[stream]);
      this.lines[stream] = "";
    }
    return result;
  }

  private accept(stream: "stdout" | "stderr", text: string) {
    let result = "";
    for (const part of text.split(/(?<=\n)/)) {
      if (!this.discarded[stream]) this.lines[stream] += part;
      if (this.lines[stream].length > 16_384) {
        // Do not expose token fragments from arbitrarily long unbroken lines.
        this.discarded[stream] = true;
        this.lines[stream] = "";
        result += "[oversized output line withheld from live preview]\n";
      }
      if (part.endsWith("\n")) {
        if (!this.discarded[stream]) result += redactSecrets(this.lines[stream]);
        this.lines[stream] = "";
        this.discarded[stream] = false;
      }
    }
    return result;
  }
}
