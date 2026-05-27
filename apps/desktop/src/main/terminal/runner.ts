import { spawn } from "node:child_process";
import { redactSecrets } from "../security/redact";
import { HeadTailOutputBuffer } from "./outputBuffer";

export interface RunCommandOptions {
  cwd: string;
  command: string;
  timeoutMs?: number;
  signal: AbortSignal;
  onOutput: (delta: string) => void;
}

export interface RunCommandResult {
  exitCode: number | null;
  output: string;
  durationMs: number;
  timedOut: boolean;
  omittedBytes: number;
}

const OUTPUT_DELTA_MAX_BYTES = 8192;
const TERMINAL_OUTPUT_MAX_BYTES = 220_000;

const getShell = () => {
  if (process.platform === "win32") return "powershell.exe";
  return process.env.SHELL || "/bin/sh";
};

const getShellArgs = (command: string) => {
  if (process.platform === "win32") {
    const utf8Command = [
      "$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new();",
      command,
    ].join(" ");
    return ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", utf8Command];
  }
  return ["-lc", command];
};

const terminalEnv = () => ({
  ...process.env,
  NO_COLOR: "1",
  TERM: "dumb",
  PAGER: "cat",
  GIT_PAGER: "cat",
  GH_PAGER: "cat",
  PRIVORA_DESKTOP: "1",
});

const killProcessTree = (pid: number | undefined) => {
  if (!pid) return;
  if (process.platform === "win32") {
    spawn("taskkill.exe", ["/pid", String(pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" }).unref();
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Best effort: process may already be gone.
    }
  }
};

const decoder = new TextDecoder("utf-8", { fatal: true });
const lossyDecoder = new TextDecoder("utf-8");

const validUtf8Prefix = (buffer: Buffer) => {
  if (buffer.length === 0) return 0;
  const max = Math.min(buffer.length, OUTPUT_DELTA_MAX_BYTES);
  for (let size = max; size > Math.max(0, max - 4); size -= 1) {
    try {
      decoder.decode(buffer.subarray(0, size));
      return size;
    } catch {
      // Keep backing up to avoid splitting a multi-byte sequence.
    }
  }
  return Math.min(1, buffer.length);
};

export class TerminalRunner {
  async run({ cwd, command, timeoutMs = 120_000, signal, onOutput }: RunCommandOptions): Promise<RunCommandResult> {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const child = spawn(getShell(), getShellArgs(command), {
        cwd,
        env: terminalEnv(),
        detached: process.platform !== "win32",
        windowsHide: true,
      });
      const output = new HeadTailOutputBuffer(TERMINAL_OUTPUT_MAX_BYTES);
      let pending = Buffer.alloc(0);
      let done = false;
      let timedOut = false;
      let forceFinishTimer: NodeJS.Timeout | null = null;
      const timer = setTimeout(() => {
        timedOut = true;
        killProcessTree(child.pid);
        forceFinishTimer = setTimeout(() => finish(null), 2_000);
      }, Math.max(1_000, Math.min(timeoutMs, 20 * 60_000)));

      const finish = (exitCode: number | null) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (forceFinishTimer) clearTimeout(forceFinishTimer);
        if (pending.length > 0) appendText(lossyDecoder.decode(pending));
        const stats = output.stats();
        resolve({
          exitCode,
          output: output.toString(),
          durationMs: Date.now() - startedAt,
          timedOut,
          omittedBytes: stats.omittedBytes,
        });
      };

      const appendText = (rawText: string) => {
        const text = redactSecrets(rawText);
        output.push(text);
        onOutput(text);
      };

      const append = (chunk: Buffer | string) => {
        pending = Buffer.concat([pending, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
        while (pending.length > 0) {
          const size = validUtf8Prefix(pending);
          if (size <= 0) break;
          const piece = pending.subarray(0, size);
          pending = pending.subarray(size);
          appendText(lossyDecoder.decode(piece));
        }
      };

      child.stdout.on("data", append);
      child.stderr.on("data", append);
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", finish);

      const abort = () => {
        timedOut = false;
        killProcessTree(child.pid);
        forceFinishTimer = setTimeout(() => finish(null), 2_000);
      };
      signal.addEventListener("abort", abort, { once: true });
    });
  }
}
