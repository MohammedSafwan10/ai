import fs from "node:fs";
import path from "node:path";
import { redactSecrets } from "./security/redact";

/** Failure-only diagnostics: no chat snapshots, prompts or tool payload collection. */
export function writeRendererFailure(directory: string, kind: string, detail: string) {
  try {
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, "renderer-errors.log");
    if (fs.existsSync(file) && fs.statSync(file).size > 512 * 1024) fs.renameSync(file, `${file}.previous`);
    const line = JSON.stringify({ at: new Date().toISOString(), kind, detail: redactSecrets(detail).slice(0, 8000) });
    fs.appendFileSync(file, `${line}\n`, { mode: 0o600 });
  } catch { /* Diagnostics must not take down the app or block recovery. */ }
}
