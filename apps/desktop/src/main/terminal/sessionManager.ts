import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { redactSecrets } from "../security/redact";
import { HeadTailOutputBuffer } from "./outputBuffer";

export interface ExecCommandOptions {
  cwd: string;
  command: string;
  signal: AbortSignal;
  yieldTimeMs?: number;
  maxOutputChars?: number;
  onOutput: (delta: string) => void;
}

export interface WriteStdinOptions {
  processId: number;
  input?: string;
  signal: AbortSignal;
  yieldTimeMs?: number;
  maxOutputChars?: number;
  onOutput: (delta: string) => void;
}

export interface StopProcessOptions {
  processId: number;
}

export interface TerminalSessionResult {
  success: boolean;
  output: string;
  processId: number | null;
  exitCode: number | null;
  durationMs: number;
  omittedBytes: number;
  timedOut: boolean;
  running: boolean;
  status: TerminalSessionStatus;
}

export type TerminalSessionStatus = "running" | "exited" | "stopped" | "timed_out" | "not_found";

const OUTPUT_DELTA_MAX_BYTES = 8192;
const TERMINAL_OUTPUT_MAX_BYTES = 1024 * 1024;
const MIN_YIELD_TIME_MS = 250;
const DEFAULT_YIELD_TIME_MS = 2000;
const SHORT_COMMAND_CLOSE_GRACE_MS = 900;
const DEFAULT_EMPTY_POLL_YIELD_TIME_MS = 5000;
const MAX_YIELD_TIME_MS = 30_000;
const STOP_GRACE_TIME_MS = 2000;
const MAX_BACKGROUND_TERMINAL_TIMEOUT_MS = 5 * 60_000;
const MAX_PROCESSES = 64;

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
    return ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", utf8Command];
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
      // Process may already be gone.
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

interface TerminalSession {
  id: number;
  command: string;
  cwd: string;
  child: ChildProcessWithoutNullStreams;
  startedAt: number;
  updatedAt: number;
  pending: Buffer;
  output: HeadTailOutputBuffer;
  unreadOutput: string;
  exitCode: number | null;
  timedOut: boolean;
  stopRequested: boolean;
  closed: boolean;
  timeout: NodeJS.Timeout;
}

export class TerminalSessionManager {
  private sessions = new Map<number, TerminalSession>();
  private nextProcessId = Math.floor(Math.random() * 20_000) + 1;

  async execCommand(options: ExecCommandOptions): Promise<TerminalSessionResult> {
    if (this.sessions.size >= MAX_PROCESSES) {
      throw new Error("Too many background terminal processes are already running.");
    }

    const id = this.allocateProcessId();
    const startedAt = Date.now();
    const child = spawn(getShell(), getShellArgs(options.command), {
      cwd: options.cwd,
      env: terminalEnv(),
      detached: process.platform !== "win32",
      windowsHide: true,
    });
    const session: TerminalSession = {
      id,
      command: options.command,
      cwd: options.cwd,
      child,
      startedAt,
      updatedAt: startedAt,
      pending: Buffer.alloc(0),
      output: new HeadTailOutputBuffer(options.maxOutputChars || TERMINAL_OUTPUT_MAX_BYTES),
      unreadOutput: "",
      exitCode: null,
      timedOut: false,
      stopRequested: false,
      closed: false,
      timeout: setTimeout(() => {
        session.timedOut = true;
        killProcessTree(child.pid);
      }, MAX_BACKGROUND_TERMINAL_TIMEOUT_MS),
    };

    this.sessions.set(id, session);
    const append = (chunk: Buffer | string) => {
      this.appendChunk(session, chunk, options.onOutput);
    };

    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", (error) => {
      this.appendText(session, `${error.message}\n`, options.onOutput);
    });
    child.on("close", (exitCode) => {
      this.finishSession(session, exitCode, options.onOutput);
    });

    const abort = () => {
      session.stopRequested = true;
      killProcessTree(child.pid);
    };
    options.signal.addEventListener("abort", abort, { once: true });

    await this.waitForBoundary(session, normalizeYield(options.yieldTimeMs, false));
    if (!session.closed && session.unreadOutput) {
      await this.waitForBoundary(session, SHORT_COMMAND_CLOSE_GRACE_MS);
    }
    options.signal.removeEventListener("abort", abort);
    return this.resultForSession(session);
  }

  async writeStdin(options: WriteStdinOptions): Promise<TerminalSessionResult> {
    const session = this.sessions.get(options.processId);
    if (!session) throw new Error(`No running terminal process ${options.processId}.`);

    if (options.input) {
      session.child.stdin.write(options.input);
      session.updatedAt = Date.now();
    }

    const abort = () => {
      session.stopRequested = true;
      killProcessTree(session.child.pid);
    };
    options.signal.addEventListener("abort", abort, { once: true });
    await this.waitForBoundary(session, normalizeYield(options.yieldTimeMs, !options.input));
    options.signal.removeEventListener("abort", abort);
    return this.resultForSession(session);
  }

  async stopProcess({ processId }: StopProcessOptions): Promise<TerminalSessionResult> {
    const session = this.sessions.get(processId);
    if (!session) {
      return {
        success: true,
        output: `Process ${processId} is not running.`,
        processId: null,
        exitCode: null,
        durationMs: 0,
        omittedBytes: 0,
        timedOut: false,
        running: false,
        status: "not_found",
      };
    }
    session.stopRequested = true;
    killProcessTree(session.child.pid);
    await this.waitForBoundary(session, STOP_GRACE_TIME_MS);
    const result = this.resultForSession(session);
    return result.running
      ? {
          ...result,
          success: false,
          output: result.output || `Failed to stop process ${processId} within ${STOP_GRACE_TIME_MS}ms.`,
        }
      : result;
  }

  listSessions() {
    return Array.from(this.sessions.values()).map((session) => ({
      id: session.id,
      command: session.command,
      cwd: session.cwd,
      startedAt: session.startedAt,
      updatedAt: session.updatedAt,
      running: !session.closed,
      exitCode: session.exitCode,
    }));
  }

  private allocateProcessId() {
    while (this.sessions.has(this.nextProcessId)) {
      this.nextProcessId += 1;
    }
    return this.nextProcessId++;
  }

  private appendChunk(session: TerminalSession, chunk: Buffer | string, onOutput: (delta: string) => void) {
    session.pending = Buffer.concat([session.pending, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
    while (session.pending.length > 0) {
      const size = validUtf8Prefix(session.pending);
      if (size <= 0) break;
      const piece = session.pending.subarray(0, size);
      session.pending = session.pending.subarray(size);
      this.appendText(session, lossyDecoder.decode(piece), onOutput);
    }
  }

  private appendText(session: TerminalSession, rawText: string, onOutput: (delta: string) => void) {
    const text = redactSecrets(rawText);
    session.output.push(text);
    session.unreadOutput += text;
    session.updatedAt = Date.now();
    onOutput(text);
  }

  private finishSession(session: TerminalSession, exitCode: number | null, onOutput: (delta: string) => void) {
    if (session.closed) return;
    if (session.pending.length > 0) {
      this.appendText(session, lossyDecoder.decode(session.pending), onOutput);
      session.pending = Buffer.alloc(0);
    }
    session.closed = true;
    session.exitCode = exitCode;
    session.updatedAt = Date.now();
    clearTimeout(session.timeout);
  }

  private waitForBoundary(session: TerminalSession, ms: number) {
    if (session.closed) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      const close = () => {
        clearTimeout(timer);
        resolve();
      };
      session.child.once("close", close);
      timer.unref?.();
    });
  }

  private resultForSession(session: TerminalSession): TerminalSessionResult {
    const stats = session.output.stats();
    const output = session.unreadOutput || session.output.toString();
    session.unreadOutput = "";
    const running = !session.closed;
    if (!running) this.sessions.delete(session.id);
    const status = terminalStatus(session, running);
    return {
      success: terminalSuccess(status, session.exitCode),
      output,
      processId: running ? session.id : null,
      exitCode: running ? null : session.exitCode,
      durationMs: Date.now() - session.startedAt,
      omittedBytes: stats.omittedBytes,
      timedOut: session.timedOut,
      running,
      status,
    };
  }
}

const normalizeYield = (value: unknown, emptyPoll: boolean) => {
  const fallback = emptyPoll ? DEFAULT_EMPTY_POLL_YIELD_TIME_MS : DEFAULT_YIELD_TIME_MS;
  const requested = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(MIN_YIELD_TIME_MS, Math.min(MAX_YIELD_TIME_MS, requested));
};

const terminalStatus = (session: TerminalSession, running: boolean): TerminalSessionStatus => {
  if (running) return "running";
  if (session.timedOut) return "timed_out";
  if (session.stopRequested) return "stopped";
  return "exited";
};

const terminalSuccess = (status: TerminalSessionStatus, exitCode: number | null) => {
  if (status === "running" || status === "stopped" || status === "not_found") return true;
  if (status === "timed_out") return false;
  return exitCode === 0;
};
