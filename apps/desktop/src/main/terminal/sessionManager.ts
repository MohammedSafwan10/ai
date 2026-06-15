import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type * as NodePty from "node-pty";
import stripAnsi from "strip-ansi";
import { redactSecrets } from "../security/redact";
import { HeadTailOutputBuffer } from "./outputBuffer";

export interface ExecCommandOptions {
  cwd: string;
  command?: string;
  argv?: string[];
  tty?: boolean;
  signal: AbortSignal;
  yieldTimeMs?: number;
  maxOutputChars?: number;
  onOutput: (delta: string) => void;
}

export interface WriteStdinOptions {
  processId: number;
  input?: string;
  closeStdin?: boolean;
  signal: AbortSignal;
  yieldTimeMs?: number;
  maxOutputChars?: number;
  onOutput: (delta: string) => void;
}

export interface ResizeProcessOptions {
  processId: number;
  rows: number;
  cols: number;
}

export interface StopProcessOptions {
  processId: number;
}

export interface TerminalSessionResult {
  success: boolean;
  sessionId: number | null;
  output: string;
  stdout: string;
  stderr: string;
  processId: number | null;
  exitCode: number | null;
  durationMs: number;
  processDurationMs: number;
  operationDurationMs: number;
  omittedBytes: number;
  timedOut: boolean;
  running: boolean;
  status: TerminalSessionStatus;
  backend: TerminalBackendKind;
  tty: boolean;
  streamsMerged: boolean;
  partialChunk: boolean;
}

export type TerminalBackendKind = "pty" | "process";
export type TerminalSessionStatus = "running" | "stop_requested" | "exited" | "stopped" | "timed_out" | "not_found" | "failed";

export interface TerminalSessionListRecord {
  sessionId: number;
  processId: number | null;
  command: string;
  cwd: string;
  status: TerminalSessionStatus;
  running: boolean;
  exitCode: number | null;
  backend: TerminalBackendKind;
  tty: boolean;
  streamsMerged: boolean;
  outputPreview: string;
  omittedBytes: number;
  startedAt: number;
  updatedAt: number;
  endedAt?: number;
}

export type TerminalManagerEvent =
  | { type: "terminal_session_started"; session: TerminalSessionListRecord }
  | { type: "terminal.output_delta"; sessionId: number; processId: number | null; stream: "stdout" | "stderr"; delta: string; chunkId: string; updatedAt: number }
  | { type: "terminal_session_updated"; session: TerminalSessionListRecord }
  | { type: "terminal_session_ended"; session: TerminalSessionListRecord };

export type TerminalManagerEventListener = (event: TerminalManagerEvent) => void;

const OUTPUT_DELTA_MAX_BYTES = 8192;
const TERMINAL_OUTPUT_MAX_BYTES = 1024 * 1024;
const MIN_YIELD_TIME_MS = 250;
const DEFAULT_YIELD_TIME_MS = 2000;
const SHORT_COMMAND_CLOSE_GRACE_MS = 4500;
const DEFAULT_EMPTY_POLL_YIELD_TIME_MS = 5000;
const MAX_YIELD_TIME_MS = 30_000;
const STOP_GRACE_TIME_MS = 250;
const WINDOWS_STDIN_CLOSE_DELAY_MS = 75;
const MAX_PROCESSES = 64;
const RECENT_SESSION_LIMIT = 24;
const RECENT_PREVIEW_CHARS = 24_000;

const pty = tryLoadNativePty();
const decoder = new TextDecoder("utf-8", { fatal: true });
const lossyDecoder = new TextDecoder("utf-8");

interface TerminalBackendSession {
  kind: TerminalBackendKind;
  tty: boolean;
  pid?: number;
  write(input: string): void;
  closeStdin(): void;
  resize(rows: number, cols: number): boolean;
  terminate(): void;
  onStdout(listener: (chunk: Buffer | string) => void): void;
  onStderr(listener: (chunk: Buffer | string) => void): void;
  onError(listener: (error: Error) => void): void;
  onClose(listener: (exitCode: number | null) => void): void;
  onceClose(listener: () => void): void;
  offClose(listener: () => void): void;
}

interface TerminalBackend {
  kind: TerminalBackendKind;
  spawn(options: ExecCommandOptions): TerminalBackendSession;
}

interface TerminalSession {
  id: number;
  command: string;
  cwd: string;
  backend: TerminalBackendSession;
  startedAt: number;
  updatedAt: number;
  stdoutPending: Buffer;
  stderrPending: Buffer;
  output: HeadTailOutputBuffer;
  stdout: HeadTailOutputBuffer;
  stderr: HeadTailOutputBuffer;
  unreadOutput: HeadTailOutputBuffer;
  unreadStdout: HeadTailOutputBuffer;
  unreadStderr: HeadTailOutputBuffer;
  outputMaxBytes: number;
  exitCode: number | null;
  timedOut: boolean;
  stopRequested: boolean;
  closed: boolean;
  endedAt?: number;
  chunkSequence: number;
  stdoutRedactionCarry: string;
  stderrRedactionCarry: string;
  timeout?: NodeJS.Timeout;
}

export class TerminalSessionManager {
  private sessions = new Map<number, TerminalSession>();
  private recentSessions = new Map<number, TerminalSessionListRecord>();
  private recentOutput = new Map<number, string>();
  private nextProcessId = Math.floor(Math.random() * 20_000) + 1;
  private backend: TerminalBackend;

  constructor(backend: TerminalBackend = new NativeTerminalBackend(), private onEvent?: TerminalManagerEventListener) {
    this.backend = backend;
  }

  async execCommand(options: ExecCommandOptions): Promise<TerminalSessionResult> {
    if (this.sessions.size >= MAX_PROCESSES) {
      throw new Error("Too many background terminal sessions are already running.");
    }

    const id = this.allocateProcessId();
    const startedAt = Date.now();
    const command = commandLabel(options);
    let backend: TerminalBackendSession;
    try {
      backend = this.backend.spawn(options);
    } catch (error) {
      return this.spawnFailedResult(command, options.cwd, error);
    }
    const outputMaxBytes = options.maxOutputChars || TERMINAL_OUTPUT_MAX_BYTES;
    const session: TerminalSession = {
      id,
      command,
      cwd: options.cwd,
      backend,
      startedAt,
      updatedAt: startedAt,
      stdoutPending: Buffer.alloc(0),
      stderrPending: Buffer.alloc(0),
      output: new HeadTailOutputBuffer(outputMaxBytes),
      stdout: new HeadTailOutputBuffer(outputMaxBytes),
      stderr: new HeadTailOutputBuffer(outputMaxBytes),
      unreadOutput: new HeadTailOutputBuffer(outputMaxBytes),
      unreadStdout: new HeadTailOutputBuffer(outputMaxBytes),
      unreadStderr: new HeadTailOutputBuffer(outputMaxBytes),
      outputMaxBytes,
      exitCode: null,
      timedOut: false,
      stopRequested: false,
      closed: false,
      chunkSequence: 0,
      stdoutRedactionCarry: "",
      stderrRedactionCarry: "",
    };

    this.sessions.set(id, session);
    this.emit({ type: "terminal_session_started", session: this.recordForSession(session) });
    backend.onStdout((chunk) => this.appendChunk(session, chunk, "stdout", options.onOutput));
    backend.onStderr((chunk) => this.appendChunk(session, chunk, "stderr", options.onOutput));
    backend.onError((error) => this.appendText(session, `${error.message}\n`, "stderr", options.onOutput));
    backend.onClose((exitCode) => this.finishSession(session, exitCode, options.onOutput));

    const abort = () => {
      session.stopRequested = true;
      backend.terminate();
    };
    options.signal.addEventListener("abort", abort, { once: true });

    await this.waitForBoundary(session, normalizeYield(options.yieldTimeMs, false), options.signal);
    if (shouldWaitForShortCommandClose(session, options.yieldTimeMs)) {
      await this.waitForBoundary(session, SHORT_COMMAND_CLOSE_GRACE_MS, options.signal);
    }
    options.signal.removeEventListener("abort", abort);
    return this.resultForSession(session, startedAt);
  }

  async writeStdin(options: WriteStdinOptions): Promise<TerminalSessionResult> {
    const operationStartedAt = Date.now();
    const session = this.sessions.get(options.processId);
    if (!session) {
      const recent = this.recentSessions.get(options.processId);
      if (!options.input && !options.closeStdin && recent) {
        return this.resultForRecentSession(recent, operationStartedAt);
      }
      return this.notRunningResult(options.processId);
    }

    if (options.input) {
      session.backend.write(options.input);
      session.updatedAt = Date.now();
    }
    if (options.closeStdin) {
      if (options.input) await delay(WINDOWS_STDIN_CLOSE_DELAY_MS);
      session.backend.closeStdin();
    }

    const abort = () => {
      session.stopRequested = true;
      session.backend.terminate();
    };
    options.signal.addEventListener("abort", abort, { once: true });
    await this.waitForBoundary(session, normalizeYield(options.yieldTimeMs, !options.input), options.signal);
    options.signal.removeEventListener("abort", abort);
    return this.resultForSession(session, operationStartedAt);
  }

  async resizeProcess(options: ResizeProcessOptions): Promise<TerminalSessionResult> {
    const operationStartedAt = Date.now();
    const session = this.sessions.get(options.processId);
    if (!session) return this.notRunningResult(options.processId);
    const resized = session.backend.resize(options.rows, options.cols);
    if (!resized) {
      this.appendText(session, "PTY resize failed for this terminal session.\n", "stderr", () => undefined);
    }
    return this.resultForSession(session, operationStartedAt, {
      clearUnread: !resized,
      outputOverride: resized ? `Resized session ${options.processId} to ${options.rows}x${options.cols}.` : undefined,
    });
  }

  async stopProcess({ processId }: StopProcessOptions): Promise<TerminalSessionResult> {
    const operationStartedAt = Date.now();
    const session = this.sessions.get(processId);
    if (!session) return this.notRunningResult(processId);

    session.stopRequested = true;
    session.updatedAt = Date.now();
    this.emit({ type: "terminal_session_updated", session: this.recordForSession(session) });
    session.backend.terminate();
    await this.waitForBoundary(session, STOP_GRACE_TIME_MS);
    if (session.closed) {
      return this.resultForSession(session, operationStartedAt, {
        outputOverride: `Stopped session ${processId}.`,
      });
    }
    return {
      success: true,
      sessionId: session.id,
      output: `Stop requested for session ${processId}.`,
      stdout: "",
      stderr: "",
      processId: session.id,
      exitCode: null,
      durationMs: Date.now() - session.startedAt,
      processDurationMs: Date.now() - session.startedAt,
      operationDurationMs: Math.max(1, Date.now() - operationStartedAt),
      omittedBytes: 0,
      timedOut: false,
      running: true,
      status: "stop_requested",
      backend: session.backend.kind,
      tty: session.backend.tty,
      streamsMerged: session.backend.tty,
      partialChunk: false,
    };
  }

  listSessions(includeExited = true): TerminalSessionListRecord[] {
    const live = Array.from(this.sessions.values())
      .map((session) => this.recordForSession(session))
      .filter((session) => includeExited || session.running);
    const liveIds = new Set(live.map((session) => session.sessionId));
    const recent = includeExited
      ? Array.from(this.recentSessions.values()).filter((session) => !liveIds.has(session.sessionId))
      : [];
    return [...live, ...recent]
      .sort((a, b) => b.updatedAt - a.updatedAt || b.sessionId - a.sessionId)
      .slice(0, includeExited ? RECENT_SESSION_LIMIT : live.length);
  }

  readSession(processId: number, maxOutputChars = TERMINAL_OUTPUT_MAX_BYTES) {
    const session = this.sessions.get(processId);
    if (!session) {
      const recent = this.recentSessions.get(processId);
      if (!recent) throw new Error(`No terminal session ${processId}.`);
      return {
        success: true,
        output: compactText(this.recentOutput.get(processId) || recent.outputPreview, maxOutputChars),
        data: { session: recent },
      };
    }
    const record = this.recordForSession(session);
    return {
      success: true,
      output: compactText(session.output.toString(), maxOutputChars),
      data: { session: record },
    };
  }

  private allocateProcessId() {
    while (this.sessions.has(this.nextProcessId)) {
      this.nextProcessId += 1;
    }
    return this.nextProcessId++;
  }

  private appendChunk(session: TerminalSession, chunk: Buffer | string, stream: "stdout" | "stderr", onOutput: (delta: string) => void) {
    const pendingKey = stream === "stdout" ? "stdoutPending" : "stderrPending";
    session[pendingKey] = Buffer.concat([session[pendingKey], Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
    while (session[pendingKey].length > 0) {
      const size = validUtf8Prefix(session[pendingKey]);
      if (size <= 0) break;
      const piece = session[pendingKey].subarray(0, size);
      session[pendingKey] = session[pendingKey].subarray(size);
      this.appendText(session, lossyDecoder.decode(piece), stream, onOutput);
    }
  }

  private appendText(session: TerminalSession, rawText: string, stream: "stdout" | "stderr", onOutput: (delta: string) => void) {
    const text = this.redactOutputPiece(session, rawText, stream);
    if (!text) return;
    session.output.push(text);
    session[stream].push(text);
    session.unreadOutput.push(text);
    if (stream === "stdout") session.unreadStdout.push(text);
    else session.unreadStderr.push(text);
    session.updatedAt = Date.now();
    session.chunkSequence += 1;
    this.emit({
      type: "terminal.output_delta",
      sessionId: session.id,
      processId: session.backend.pid ?? session.id,
      stream,
      delta: text,
      chunkId: `${session.id}:${session.chunkSequence}`,
      updatedAt: session.updatedAt,
    });
    onOutput(text);
  }

  private finishSession(session: TerminalSession, exitCode: number | null, onOutput: (delta: string) => void) {
    if (session.closed) return;
    if (session.stdoutPending.length > 0) {
      this.appendText(session, lossyDecoder.decode(session.stdoutPending), "stdout", onOutput);
      session.stdoutPending = Buffer.alloc(0);
    }
    if (session.stderrPending.length > 0) {
      this.appendText(session, lossyDecoder.decode(session.stderrPending), "stderr", onOutput);
      session.stderrPending = Buffer.alloc(0);
    }
    this.flushRedactionCarry(session, "stdout", onOutput);
    this.flushRedactionCarry(session, "stderr", onOutput);
    session.closed = true;
    session.exitCode = exitCode;
    session.updatedAt = Date.now();
    session.endedAt = session.updatedAt;
    if (session.timeout) clearTimeout(session.timeout);
    const record = this.recordForSession(session);
    this.rememberSession(record, session.output.toString());
    this.emit({ type: "terminal_session_ended", session: record });
    this.sessions.delete(session.id);
  }

  private waitForBoundary(session: TerminalSession, ms: number, signal?: AbortSignal) {
    if (session.closed) return Promise.resolve();
    return new Promise<void>((resolve) => {
      let done = false;
      const close = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearInterval(interval);
        signal?.removeEventListener("abort", close);
        session.backend.offClose(close);
        resolve();
      };
      const timer = setTimeout(close, ms);
      const interval = setInterval(() => {
        if (session.closed) close();
      }, 25);
      session.backend.onceClose(close);
      signal?.addEventListener("abort", close, { once: true });
      timer.unref?.();
      interval.unref?.();
    });
  }

  private resultForSession(
    session: TerminalSession,
    operationStartedAt: number,
    options: { clearUnread?: boolean; outputOverride?: string } = {},
  ): TerminalSessionResult {
    const clearUnread = options.clearUnread ?? true;
    const outputBuffer = session.unreadOutput.hasContent() ? session.unreadOutput : session.output;
    const stdoutBuffer = session.unreadStdout.hasContent() ? session.unreadStdout : session.stdout;
    const stderrBuffer = session.unreadStderr.hasContent() ? session.unreadStderr : session.stderr;
    const stats = outputBuffer.stats();
    const output = options.outputOverride ?? outputBuffer.toString();
    const stdout = options.outputOverride ? "" : stdoutBuffer.toString();
    const stderr = options.outputOverride ? "" : stderrBuffer.toString();
    if (clearUnread) {
      session.unreadOutput = new HeadTailOutputBuffer(session.outputMaxBytes);
      session.unreadStdout = new HeadTailOutputBuffer(session.outputMaxBytes);
      session.unreadStderr = new HeadTailOutputBuffer(session.outputMaxBytes);
    }
    const running = !session.closed;
    if (!running) this.sessions.delete(session.id);
    const status = terminalStatus(session, running);
    const processDurationMs = Date.now() - session.startedAt;
    const operationDurationMs = Math.max(1, Date.now() - operationStartedAt);
    return {
      success: terminalSuccess(status, session.exitCode),
      sessionId: running ? session.id : session.id,
      output,
      stdout,
      stderr,
      processId: running ? session.id : null,
      exitCode: running ? null : session.exitCode,
      durationMs: processDurationMs,
      processDurationMs,
      operationDurationMs,
      omittedBytes: stats.omittedBytes,
      timedOut: session.timedOut,
      running,
      status,
      backend: session.backend.kind,
      tty: session.backend.tty,
      streamsMerged: session.backend.tty,
      partialChunk: isPartialTerminalChunk(output),
    };
  }

  private notRunningResult(processId: number): TerminalSessionResult {
    return {
      success: false,
      sessionId: null,
      output: `Session ${processId} is not running.`,
      stdout: "",
      stderr: `Session ${processId} is not running.`,
      processId: null,
      exitCode: null,
      durationMs: 0,
      processDurationMs: 0,
      operationDurationMs: 0,
      omittedBytes: 0,
      timedOut: false,
      running: false,
      status: "not_found",
      backend: this.backend.kind,
      tty: true,
      streamsMerged: true,
      partialChunk: false,
    };
  }

  private resultForRecentSession(record: TerminalSessionListRecord, operationStartedAt: number): TerminalSessionResult {
    const output = this.recentOutput.get(record.sessionId) || record.outputPreview;
    return {
      success: record.status !== "failed" && record.status !== "timed_out",
      sessionId: record.sessionId,
      output,
      stdout: output,
      stderr: "",
      processId: null,
      exitCode: record.exitCode,
      durationMs: Math.max(0, (record.endedAt || record.updatedAt) - record.startedAt),
      processDurationMs: Math.max(0, (record.endedAt || record.updatedAt) - record.startedAt),
      operationDurationMs: Math.max(1, Date.now() - operationStartedAt),
      omittedBytes: record.omittedBytes,
      timedOut: record.status === "timed_out",
      running: false,
      status: record.status,
      backend: record.backend,
      tty: record.tty,
      streamsMerged: record.streamsMerged,
      partialChunk: isPartialTerminalChunk(output),
    };
  }

  private spawnFailedResult(command: string, cwd: string, error: unknown): TerminalSessionResult {
    const message = spawnErrorMessage(command, cwd, error);
    return {
      success: false,
      sessionId: null,
      output: message,
      stdout: "",
      stderr: message,
      processId: null,
      exitCode: null,
      durationMs: 0,
      processDurationMs: 0,
      operationDurationMs: 0,
      omittedBytes: 0,
      timedOut: false,
      running: false,
      status: "failed",
      backend: this.backend.kind,
      tty: true,
      streamsMerged: true,
      partialChunk: false,
    };
  }

  private recordForSession(session: TerminalSession): TerminalSessionListRecord {
    const running = !session.closed;
    const status = terminalStatus(session, !session.closed);
    const output = session.output.toString();
    const stats = session.output.stats();
    return {
      sessionId: session.id,
      processId: running ? session.id : null,
      command: session.command,
      cwd: session.cwd,
      status,
      running,
      exitCode: session.exitCode,
      backend: session.backend.kind,
      tty: session.backend.tty,
      streamsMerged: session.backend.tty,
      outputPreview: compactText(output, RECENT_PREVIEW_CHARS),
      omittedBytes: stats.omittedBytes,
      startedAt: session.startedAt,
      updatedAt: session.updatedAt,
      endedAt: session.endedAt,
    };
  }

  private rememberSession(record: TerminalSessionListRecord, retainedOutput: string) {
    this.recentSessions.set(record.sessionId, record);
    this.recentOutput.set(record.sessionId, retainedOutput);
    const ordered = Array.from(this.recentSessions.values()).sort((a, b) => b.updatedAt - a.updatedAt);
    for (const stale of ordered.slice(RECENT_SESSION_LIMIT)) {
      this.recentSessions.delete(stale.sessionId);
      this.recentOutput.delete(stale.sessionId);
    }
  }

  private emit(event: TerminalManagerEvent) {
    this.onEvent?.(event);
  }

  private redactOutputPiece(session: TerminalSession, rawText: string, stream: "stdout" | "stderr") {
    const carryKey = stream === "stdout" ? "stdoutRedactionCarry" : "stderrRedactionCarry";
    const combined = cleanTerminalText(`${session[carryKey]}${rawText}`);
    const { ready, carry } = splitRedactionWindow(combined);
    session[carryKey] = carry;
    return redactSecrets(ready);
  }

  private flushRedactionCarry(session: TerminalSession, stream: "stdout" | "stderr", onOutput: (delta: string) => void) {
    const carryKey = stream === "stdout" ? "stdoutRedactionCarry" : "stderrRedactionCarry";
    const carry = session[carryKey];
    if (!carry) return;
    session[carryKey] = "";
    const text = redactSecrets(cleanTerminalText(carry));
    if (!text) return;
    session.output.push(text);
    session[stream].push(text);
    session.unreadOutput.push(text);
    if (stream === "stdout") session.unreadStdout.push(text);
    else session.unreadStderr.push(text);
    session.updatedAt = Date.now();
    session.chunkSequence += 1;
    this.emit({
      type: "terminal.output_delta",
      sessionId: session.id,
      processId: session.backend.pid ?? session.id,
      stream,
      delta: text,
      chunkId: `${session.id}:${session.chunkSequence}`,
      updatedAt: session.updatedAt,
    });
    onOutput(text);
  }
}

class NativeTerminalBackend implements TerminalBackend {
  kind: TerminalBackendKind = pty ? "pty" : "process";

  spawn(options: ExecCommandOptions): TerminalBackendSession {
    if (options.tty === false || !pty) return spawnProcessSession(options);
    const command = processCommand(options);
    const terminal = pty.spawn(command.file, command.args, {
      cwd: options.cwd,
      env: terminalEnv(),
      name: "xterm-256color",
      cols: 120,
      rows: 30,
      useConpty: process.platform === "win32",
    });
    return new PtyTerminalSession(terminal, command.cleanupPath);
  }
}

const spawnProcessSession = (options: ExecCommandOptions): TerminalBackendSession => {
  const command = processCommand(options);
  const child = spawn(command.file, command.args, {
    cwd: options.cwd,
    env: terminalEnv(),
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  return new ProcessTerminalSession(child, command.cleanupPath);
};

class ProcessTerminalSession implements TerminalBackendSession {
  kind: TerminalBackendKind = "process";
  tty = false;
  private closeListeners = new Set<() => void>();
  private onceCloseListeners = new Map<() => void, () => void>();

  constructor(private child: ReturnType<typeof spawn>, private cleanupPath?: string) {}

  get pid() {
    return this.child.pid;
  }

  write(input: string) {
    if (this.child.stdin && !this.child.stdin.destroyed) this.child.stdin.write(input);
  }

  closeStdin() {
    if (this.child.stdin && !this.child.stdin.destroyed) this.child.stdin.end();
  }

  resize() {
    return false;
  }

  terminate() {
    killProcessTree(this.child.pid);
  }

  onStdout(listener: (chunk: Buffer | string) => void) {
    this.child.stdout?.on("data", listener);
  }

  onStderr(listener: (chunk: Buffer | string) => void) {
    this.child.stderr?.on("data", listener);
  }

  onError(listener: (error: Error) => void) {
    this.child.on("error", listener);
  }

  onClose(listener: (exitCode: number | null) => void) {
    this.child.on("close", (exitCode) => {
      cleanupTempScript(this.cleanupPath);
      listener(exitCode);
      for (const close of this.closeListeners) close();
      this.closeListeners.clear();
    });
  }

  onceClose(listener: () => void) {
    const once = () => {
      this.closeListeners.delete(once);
      this.onceCloseListeners.delete(listener);
      listener();
    };
    this.onceCloseListeners.set(listener, once);
    this.closeListeners.add(once);
  }

  offClose(listener: () => void) {
    const once = this.onceCloseListeners.get(listener);
    if (once) {
      this.closeListeners.delete(once);
      this.onceCloseListeners.delete(listener);
    }
  }
}

class PtyTerminalSession implements TerminalBackendSession {
  kind: TerminalBackendKind = "pty";
  tty = true;
  private closeListeners = new Set<() => void>();
  private onceCloseListeners = new Map<() => void, () => void>();

  constructor(private terminal: NodePty.IPty, private cleanupPath?: string) {}

  get pid() {
    return this.terminal.pid;
  }

  write(input: string) {
    this.terminal.write(normalizePtyInput(input));
  }

  closeStdin() {
    this.terminal.write(process.platform === "win32" ? "\r\x1a\r" : "\x04");
  }

  resize(rows: number, cols: number) {
    try {
      this.terminal.resize(cols, rows);
      return true;
    } catch {
      return false;
    }
  }

  terminate() {
    if (process.platform === "win32") {
      killProcessTree(this.terminal.pid);
      return;
    }
    this.terminal.kill();
  }

  onStdout(listener: (chunk: Buffer | string) => void) {
    this.terminal.onData(listener);
  }

  onStderr(_listener: (chunk: Buffer | string) => void) {
    // PTYs expose a single terminal stream. stderr is intentionally merged into stdout.
  }

  onError(_listener: (error: Error) => void) {
    // node-pty reports spawn/exit failures through onExit.
  }

  onClose(listener: (exitCode: number | null) => void) {
    this.terminal.onExit((event) => {
      cleanupTempScript(this.cleanupPath);
      listener(event.exitCode);
      for (const close of this.closeListeners) close();
      this.closeListeners.clear();
    });
  }

  onceClose(listener: () => void) {
    const once = () => {
      this.closeListeners.delete(once);
      this.onceCloseListeners.delete(listener);
      listener();
    };
    this.onceCloseListeners.set(listener, once);
    this.closeListeners.add(once);
  }

  offClose(listener: () => void) {
    const once = this.onceCloseListeners.get(listener);
    if (once) {
      this.closeListeners.delete(once);
      this.onceCloseListeners.delete(listener);
    }
  }
}

const getShell = () => {
  if (process.platform === "win32") return resolveExecutable("cmd.exe");
  return process.env.SHELL || "/bin/sh";
};

const processCommand = (options: ExecCommandOptions) => {
  const argv = normalizeArgv(options.argv);
  if (argv.length > 0) {
    const cmdCommand = windowsCmdArgvCommand(argv);
    if (cmdCommand) {
      const cleanupPath = writeWindowsCommandScript(cmdCommand);
      return { file: getShell(), args: getShellArgs(cleanupPath), cleanupPath };
    }
    return { file: resolveExecutable(argv[0]), args: argv.slice(1) };
  }
  const command = options.command?.trim();
  if (!command) throw new Error("exec_command requires argv or cmd.");
  if (process.platform === "win32") {
    const cleanupPath = writeWindowsCommandScript(command);
    return { file: getShell(), args: getShellArgs(cleanupPath), cleanupPath };
  }
  return { file: getShell(), args: getShellArgs(command) };
};

const commandLabel = (options: ExecCommandOptions) => {
  const argv = normalizeArgv(options.argv);
  const label = argv.length > 0 ? argv.map(shellQuoteForDisplay).join(" ") : options.command?.trim() || "";
  return redactCommandLabel(label);
};

const redactCommandLabel = (label: string) => {
  const redacted = redactSecrets(label);
  if (redacted !== label) return redacted;
  return hasConstructedSecretFragments(label) ? "[redacted command]" : redacted;
};

const hasConstructedSecretFragments = (value: string) =>
  /(?:sk-|bearer|api[_-]?\s*key|api[_-]?key|token|secret|password)/i.test(value) &&
  /(?:['"`]\s*[+.]|[+.]\s*['"`]|\\x|\\u|String\.fromCharCode|Buffer\.from|atob|concat\s*\()/i.test(value);

const normalizeArgv = (argv: unknown) =>
  Array.isArray(argv) ? argv.map((item) => String(item)).filter(Boolean) : [];

const windowsCmdArgvCommand = (argv: string[]) => {
  if (process.platform !== "win32") return null;
  const executable = path.basename(argv[0] || "").toLowerCase();
  if (executable !== "cmd" && executable !== "cmd.exe") return null;
  const switchIndex = argv.findIndex((arg, index) => index > 0 && /^\/[ck]$/i.test(arg));
  if (switchIndex < 0) return null;
  const commandArgs = argv.slice(switchIndex + 1);
  if (commandArgs.length === 0) return "";
  return commandArgs.join(" ");
};

const shellQuoteForDisplay = (value: string) =>
  /\s/.test(value) ? JSON.stringify(value) : value;

const resolveExecutable = (file: string) => {
  const trimmed = file.trim();
  if (!trimmed) return trimmed;
  if (path.isAbsolute(trimmed) || trimmed.includes("\\") || trimmed.includes("/")) return trimmed;

  const pathEntries = (process.env.PATH || process.env.Path || process.env.path || "")
    .split(path.delimiter)
    .filter(Boolean);
  const extensions = process.platform === "win32"
    ? executableExtensions(trimmed)
    : [""];
  for (const entry of pathEntries) {
    for (const extension of extensions) {
      const candidate = path.join(entry, trimmed.endsWith(extension) ? trimmed : `${trimmed}${extension}`);
      if (isExecutableCandidate(candidate)) return candidate;
    }
  }
  return trimmed;
};

const executableExtensions = (file: string) => {
  const ext = path.extname(file);
  if (ext) return [""];
  return (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
};

const isExecutableCandidate = (file: string) => {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
};

const spawnErrorMessage = (command: string, cwd: string, error: unknown) => {
  const base = error instanceof Error ? error.message : String(error);
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";
  const attempted = command || "(empty command)";
  return [
    `Failed to start terminal session: ${base || "unknown error"}`,
    code ? `code: ${code}` : "",
    `attempted: ${attempted}`,
    `cwd: ${cwd}`,
    "backend: pty",
  ].filter(Boolean).join("\n");
};

function tryLoadNativePty(): typeof NodePty | null {
  const loaderPaths = [
    path.join(process.cwd(), "package.json"),
    process.resourcesPath ? path.join(process.resourcesPath, "privora-native-loader.js") : "",
  ].filter(Boolean);
  const candidates = [
    "node-pty",
    process.resourcesPath ? path.join(process.resourcesPath, "node-pty") : "",
    path.join(process.cwd(), "node_modules", "node-pty"),
  ].filter(Boolean);
  const errors: string[] = [];
  for (const loaderPath of loaderPaths) {
    const require = createRequire(loaderPath);
    for (const candidate of candidates) {
      try {
        return require(candidate);
      } catch (error) {
        errors.push(`${loaderPath} -> ${candidate}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  console.warn(`Native PTY backend unavailable; falling back to process terminal. ${errors.join(" | ")}`);
  return null;
}

const getShellArgs = (command: string) => {
  if (process.platform === "win32") {
    return ["/d", "/c", "call", command];
  }
  return ["-lc", command];
};

const writeWindowsCommandScript = (command: string) => {
  const dir = path.join(os.tmpdir(), "privora-terminal");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `cmd-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.cmd`);
  fs.writeFileSync(file, `@echo off\r\n${command}\r\n`, "utf8");
  return file;
};

const cleanupTempScript = (file?: string) => {
  if (!file) return;
  try {
    fs.unlinkSync(file);
  } catch {
    // Best-effort cleanup only.
  }
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

const normalizePtyInput = (input: string) => {
  if (process.platform !== "win32") return input;
  return input.replace(/\r\n/g, "\r").replace(/\n/g, "\r");
};

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

const cleanTerminalText = (value: string) =>
  stripAnsi(stripTerminalControlSequences(value))
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
    .replace(/\^Z|\^D|\u2426/g, "");

const REDACTION_LOOKBEHIND_CHARS = 256;
const REDACTION_MIN_CARRY_CHARS = 16;

const splitRedactionWindow = (value: string) => {
  if (value.length <= REDACTION_MIN_CARRY_CHARS) return { ready: "", carry: value };
  const tailStart = Math.max(0, value.length - REDACTION_LOOKBEHIND_CHARS);
  const tail = value.slice(tailStart);
  const riskyRelativeIndex = firstRiskySecretPrefixIndex(tail);
  const holdFrom = riskyRelativeIndex >= 0
    ? tailStart + riskyRelativeIndex
    : Math.max(0, value.length - REDACTION_MIN_CARRY_CHARS);
  return {
    ready: value.slice(0, holdFrom),
    carry: value.slice(holdFrom),
  };
};

const firstRiskySecretPrefixIndex = (value: string) => {
  const lower = value.toLowerCase();
  const indexes = [
    lower.lastIndexOf("sk-"),
    lower.lastIndexOf("aiza"),
    lower.lastIndexOf("bearer "),
    lower.search(/(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^"'\s]*$/i),
  ].filter((index) => index >= 0);
  return indexes.length ? Math.min(...indexes) : -1;
};

const stripTerminalControlSequences = (value: string) => {
  let output = "";
  for (let index = 0; index < value.length;) {
    const code = value.charCodeAt(index);
    if (code === 0x1b) {
      const next = value[index + 1];
      if (next === "]") {
        index = skipUntilTerminator(value, index + 2);
        continue;
      }
      if (["P", "X", "^", "_"].includes(next || "")) {
        index = skipUntilStringTerminator(value, index + 2);
        continue;
      }
    }
    output += value[index];
    index += 1;
  }
  return output;
};

const skipUntilTerminator = (value: string, index: number) => {
  while (index < value.length) {
    if (value.charCodeAt(index) === 0x07) return index + 1;
    if (value.charCodeAt(index) === 0x1b && value[index + 1] === "\\") return index + 2;
    index += 1;
  }
  return value.length;
};

const skipUntilStringTerminator = (value: string, index: number) => {
  while (index < value.length) {
    if (value.charCodeAt(index) === 0x1b && value[index + 1] === "\\") return index + 2;
    index += 1;
  }
  return value.length;
};

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

const normalizeYield = (value: unknown, emptyPoll: boolean) => {
  const fallback = emptyPoll ? DEFAULT_EMPTY_POLL_YIELD_TIME_MS : DEFAULT_YIELD_TIME_MS;
  const requested = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(MIN_YIELD_TIME_MS, Math.min(MAX_YIELD_TIME_MS, requested));
};

const shouldWaitForShortCommandClose = (session: TerminalSession, yieldTimeMs: number | undefined) =>
  !session.closed && yieldTimeMs === undefined && session.unreadOutput.hasContent();

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const terminalStatus = (session: TerminalSession, running: boolean): TerminalSessionStatus => {
  if (session.stopRequested) return running ? "stop_requested" : "stopped";
  if (running) return "running";
  if (session.timedOut) return "timed_out";
  return "exited";
};

const terminalSuccess = (status: TerminalSessionStatus, exitCode: number | null) => {
  if (status === "running" || status === "stop_requested" || status === "stopped") return true;
  if (status === "not_found") return false;
  if (status === "timed_out" || status === "failed") return false;
  return exitCode === 0;
};

const isPartialTerminalChunk = (value: string) =>
  Boolean(value) && !value.endsWith("\n") && !value.endsWith("\r");

const compactText = (value: string, maxChars: number) => {
  if (value.length <= maxChars) return value;
  const head = value.slice(0, Math.floor(maxChars * 0.35));
  const tail = value.slice(-(maxChars - head.length));
  return `${head}\n\n[... terminal output compacted ...]\n\n${tail}`;
};
