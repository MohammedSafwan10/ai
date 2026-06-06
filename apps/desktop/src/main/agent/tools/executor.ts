import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { DesktopToolCall, ToolDiffFileRecord, ToolResult } from "../../../shared/types";
import { resolveExistingWorkspacePath, resolveWorkspacePath } from "../../security/pathSandbox";
import { redactSecrets } from "../../security/redact";
import { resolveRipgrepExecutablePath } from "../../resources";
import { TerminalSessionManager } from "../../terminal/sessionManager";
import { DiagnosticsEngine } from "../diagnostics";
import { FileOperationService, hashBuffer, recordFileObservation, recordFileObservationData } from "./fileOperationService";
import { FileMutationCoordinator } from "./mutationCoordinator";
import { BrowserToolExecutor } from "../../browser/browserTools";
import type { BrowserSessionManager } from "../../browser/BrowserSessionManager";
import type { NotesStore } from "../../notes/NotesStore";
import type { PermissionMode } from "../../../shared/models";
import { ComputerUseToolExecutor } from "../../computer/computerTools";
import type { ComputerUseManager } from "../../computer/ComputerUseManager";

export interface ToolExecutionContext {
  workspaceId?: string;
  workspaceRoot: string;
  signal: AbortSignal;
  browserExternalApproved?: boolean;
  permissionMode?: PermissionMode;
  computerUseEnabled?: boolean;
  onCommandOutput: (callId: string, delta: string) => void;
  onTerminalProcessStarted?: (processId: number) => void;
  onTerminalProcessEnded?: (processId: number) => void;
}

const runProcess = (command: string, args: string[], cwd: string, signal: AbortSignal) =>
  new Promise<{ exitCode: number | null; output: string }>((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true });
    let output = "";
    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.stderr.on("data", (chunk) => { output += String(chunk); });
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ exitCode, output: redactSecrets(output) }));
    signal.addEventListener("abort", () => child.kill(), { once: true });
  });

const isNotGitRepository = (output: string) =>
  /not a git repository|not a git repo/i.test(output);

const MAX_METADATA_HASH_BYTES = 10 * 1024 * 1024;

export class DesktopToolExecutor {
  private static mutationLocks = new Map<string, Promise<void>>();
  private files = new FileOperationService();
  private terminal = new TerminalSessionManager();
  private mutations = new FileMutationCoordinator();
  private diagnostics = new DiagnosticsEngine(this.terminal);
  private browser?: BrowserToolExecutor;
  private computer?: ComputerUseToolExecutor;

  constructor(browserManager?: BrowserSessionManager, private notesStore?: NotesStore, computerUseManager?: ComputerUseManager) {
    this.browser = browserManager ? new BrowserToolExecutor(browserManager) : undefined;
    this.computer = computerUseManager ? new ComputerUseToolExecutor(computerUseManager) : undefined;
  }

  async stopTerminalProcess(processId: number) {
    return await this.terminal.stopProcess({ processId });
  }

  private async withMutationLock<T>(workspaceRoot: string, operation: () => Promise<T>) {
    const previous = DesktopToolExecutor.mutationLocks.get(workspaceRoot) || Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const next = previous.then(() => current);
    DesktopToolExecutor.mutationLocks.set(workspaceRoot, next);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (DesktopToolExecutor.mutationLocks.get(workspaceRoot) === next) {
        DesktopToolExecutor.mutationLocks.delete(workspaceRoot);
      }
    }
  }

  async execute(call: DesktopToolCall, context: ToolExecutionContext): Promise<ToolResult & { diff?: string; diffFiles?: ToolDiffFileRecord[] }> {
    try {
      switch (call.name) {
        case "desktop_read_file":
          return await this.readFile(call, context);
        case "desktop_edit_file":
          return await this.withMutationLock(context.workspaceRoot, () => this.mutations.editFile(call, context));
        case "desktop_write_file":
          return await this.withMutationLock(context.workspaceRoot, () => this.mutations.writeFile(call, context));
        case "desktop_apply_patch":
          return await this.withMutationLock(context.workspaceRoot, () => this.mutations.applyPatch(call, context));
        case "desktop_list_dir":
          return await this.listDir(call, context);
        case "desktop_search":
          return await this.search(call, context);
        case "desktop_delete_path":
          return await this.withMutationLock(context.workspaceRoot, () => this.mutations.deletePath(call, context));
        case "desktop_rename_path":
          return await this.withMutationLock(context.workspaceRoot, () => this.mutations.renamePath(call, context));
        case "desktop_spawn_process":
          return await this.execCommand(call, context);
        case "desktop_write_process":
          return await this.writeStdin(call, context);
        case "desktop_kill_process":
          return await this.stopProcess(call, context);
        case "desktop_resize_process":
          return await this.resizeProcess(call);
        case "desktop_run_diagnostics":
          return await this.diagnostics.run(call, context);
        case "desktop_git_status":
          return await this.gitStatus(call, context);
        case "desktop_git_diff":
          return await this.gitDiff(call, context);
        case "notes_list":
          return await this.notesList(call, context);
        case "notes_create":
          return await this.notesCreate(call, context);
        case "notes_read":
          return await this.notesRead(call, context);
        case "notes_update":
          return await this.notesUpdate(call, context);
        case "notes_save":
          return await this.notesSave(call, context);
        case "notes_delete":
          return await this.notesDelete(call, context);
        case "computer_capabilities":
        case "computer_list_windows":
        case "computer_find_apps":
        case "computer_focus_window":
        case "computer_snapshot":
        case "computer_inspect":
        case "computer_act":
        case "computer_wait":
        case "computer_trace":
        case "computer_verify":
        case "computer_screenshot":
        case "computer_stop":
        case "computer_open_app":
        case "computer_clipboard":
          if (!this.computer) return { success: false, error: "Privora Computer Use is not available." };
          return await this.computer.execute(call, context);
        case "browser_open":
        case "browser_open_link":
        case "browser_snapshot":
        case "browser_act":
        case "browser_inspect":
        case "browser_extract":
        case "browser_wait":
        case "browser_screenshot":
        case "browser_evidence":
        case "browser_search":
        case "browser_tab":
        case "browser_downloads":
        case "browser_shields":
        case "browser_pdf":
        case "browser_form_analyze":
        case "browser_form_fill":
        case "browser_form_validate":
        case "browser_form_submit":
        case "browser_capabilities":
        case "browser_workflow":
        case "browser_assert":
        case "browser_evidence_vault":
        case "browser_diagnose":
        case "browser_trace":
        case "browser_verify":
          if (!this.browser) return { success: false, error: "Privora Browser is not available." };
          return await this.browser.execute(call, context);
        default:
          return { success: false, error: `Unknown tool ${(call as DesktopToolCall).name}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Tool execution failed.",
      };
    }
  }

  private async readFile(call: DesktopToolCall, context: ToolExecutionContext) {
    const target = this.files.resolveExisting(context.workspaceRoot, String(call.arguments.path || ""));
    context.onCommandOutput(call.id, `Reading ${target.relativePath}\n`);
    const result = await this.files.readText(context.workspaceRoot, target.relativePath, {
      maxBytes: Number(call.arguments.maxBytes) || undefined,
      startLine: Number(call.arguments.startLine || call.arguments.start_line) || undefined,
      endLine: Number(call.arguments.endLine || call.arguments.end_line) || undefined,
      withLineNumbers: call.arguments.withLineNumbers === true || call.arguments.with_line_numbers === true,
      encoding: call.arguments.encoding === "base64" ? "base64" : "utf8",
    });
    recordFileObservation(context.workspaceRoot, result.snapshot);
    return { success: true, output: result.output, data: result.data };
  }

  private requireNotes() {
    if (!this.notesStore) throw new Error("Privora Notes is not available.");
    return this.notesStore;
  }

  private async notesList(call: DesktopToolCall, context: ToolExecutionContext) {
    const store = this.requireNotes();
    const state = store.list(context.workspaceId, String(call.arguments.query || ""));
    return {
      success: true,
      output: state.notes.map(formatNoteLine).join("\n") || "No notes found.",
      data: { notes: state.notes, openTabs: state.openTabs, activeNoteId: state.activeNoteId },
    };
  }

  private async notesCreate(call: DesktopToolCall, context: ToolExecutionContext) {
    const store = this.requireNotes();
    const scope = String(call.arguments.scope || "workspace") === "global" ? "global" : "workspace";
    const result = store.create({
      workspaceId: context.workspaceId,
      scope,
      title: String(call.arguments.title || "Untitled note"),
      content: typeof call.arguments.content === "string" ? call.arguments.content : "",
      pinned: call.arguments.pinned === true,
    });
    return {
      success: true,
      output: `Created ${formatNoteLine(result.note)}`,
      data: { note: result.note, content: boundedNoteContent(result.content) },
    };
  }

  private async notesRead(call: DesktopToolCall, context: ToolExecutionContext) {
    const store = this.requireNotes();
    const result = store.open({ noteId: String(call.arguments.noteId || call.arguments.note_id || ""), workspaceId: context.workspaceId });
    const maxBytes = Number(call.arguments.maxBytes || call.arguments.max_bytes) || 120_000;
    return {
      success: true,
      output: boundedNoteContent(result.content, maxBytes),
      data: { note: result.note, largeMode: result.largeMode, readonly: result.readonly, truncated: result.truncated },
    };
  }

  private async notesUpdate(call: DesktopToolCall, context: ToolExecutionContext) {
    const store = this.requireNotes();
    const result = store.update({
      noteId: String(call.arguments.noteId || call.arguments.note_id || ""),
      workspaceId: context.workspaceId,
      title: typeof call.arguments.title === "string" ? call.arguments.title : undefined,
      content: typeof call.arguments.content === "string" ? call.arguments.content : undefined,
      scope: call.arguments.scope === "global" ? "global" : call.arguments.scope === "workspace" ? "workspace" : undefined,
      pinned: typeof call.arguments.pinned === "boolean" ? call.arguments.pinned : undefined,
    });
    return {
      success: true,
      output: `Updated ${formatNoteLine(result.note)}`,
      data: { note: result.note },
    };
  }

  private async notesSave(call: DesktopToolCall, context: ToolExecutionContext) {
    const store = this.requireNotes();
    const result = store.save({
      noteId: String(call.arguments.noteId || call.arguments.note_id || ""),
      workspaceId: context.workspaceId,
      filePath: typeof call.arguments.filePath === "string" ? call.arguments.filePath : typeof call.arguments.file_path === "string" ? call.arguments.file_path : undefined,
    });
    return {
      success: true,
      output: `Saved ${formatNoteLine(result.note)}`,
      data: { note: result.note },
    };
  }

  private async notesDelete(call: DesktopToolCall, context: ToolExecutionContext) {
    const store = this.requireNotes();
    const noteId = String(call.arguments.noteId || call.arguments.note_id || "");
    if (call.arguments.deleteFile === true || call.arguments.delete_file === true) {
      throw new Error("Agent file deletion must use the guarded desktop filesystem tools. notes_delete only removes the note from Privora.");
    }
    const state = store.delete({ noteId, workspaceId: context.workspaceId });
    return {
      success: true,
      output: `Deleted note ${noteId}.`,
      data: { notes: state.notes },
    };
  }

  private async listDir(call: DesktopToolCall, context: ToolExecutionContext) {
    const target = resolveExistingWorkspacePath(context.workspaceRoot, String(call.arguments.path || "."));
    const depth = Math.max(1, Math.min(3, Number(call.arguments.depth) || 1));
    const includeMetadata = call.arguments.includeMetadata === true || call.arguments.include_metadata === true;
    const lines: string[] = [];
    const entriesData: Array<{ path: string; type: "file" | "dir"; sizeBytes?: number; modifiedAt?: string; sha256?: string; metadataHashSkipped?: boolean }> = [];
    const walk = async (dir: string, prefix: string, currentDepth: number) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 200)) {
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
        const rel = path.join(prefix, entry.name);
        const absolutePath = path.join(dir, entry.name);
        const type = entry.isDirectory() ? "dir" : "file";
        if (includeMetadata && entry.isFile()) {
          const stat = await fs.stat(absolutePath);
          const shouldHash = stat.size <= MAX_METADATA_HASH_BYTES;
          const content = shouldHash ? await fs.readFile(absolutePath).catch(() => null) : null;
          const sha256 = content !== null ? hashBuffer(content) : undefined;
          entriesData.push({
            path: rel,
            type,
            sizeBytes: stat.size,
            modifiedAt: stat.mtime.toISOString(),
            sha256,
            metadataHashSkipped: !shouldHash,
          });
          recordFileObservationData(context.workspaceRoot, rel, { sizeBytes: stat.size, modifiedAtMs: stat.mtimeMs, sha256 });
          lines.push(`${type} ${rel} ${stat.size}B${shouldHash ? "" : " (hash skipped: large file)"}`);
        } else {
          entriesData.push({ path: rel, type });
          lines.push(`${type} ${rel}`);
        }
        if (entry.isDirectory() && currentDepth < depth) await walk(absolutePath, rel, currentDepth + 1);
      }
    };
    await walk(target.absolutePath, target.relativePath === "." ? "" : target.relativePath, 1);
    return {
      success: true,
      output: lines.join("\n") || "(empty)",
      data: { path: target.relativePath || ".", entries: entriesData, includeMetadata },
    };
  }

  private async search(call: DesktopToolCall, context: ToolExecutionContext) {
    const query = String(call.arguments.query || "");
    const args = ["--line-number", "--hidden", "--glob", "!node_modules", "--glob", "!.git", "--glob", "!dist"];
    const caseSensitive = call.arguments.caseSensitive === true || call.arguments.case_sensitive === true;
    if (!caseSensitive) args.push("--ignore-case");
    if (call.arguments.glob) args.push("--glob", String(call.arguments.glob));
    args.push(query, ".");
    const result = await runProcess(resolveRipgrepExecutablePath(), args, context.workspaceRoot, context.signal);
    const maxResults = Number(call.arguments.maxResults) || 80;
    const allLines = result.output.split(/\r?\n/).filter(Boolean);
    const lines = allLines.slice(0, maxResults);
    await Promise.all(lines.map(async (line) => {
      const match = line.match(/^(.+?):\d+:/);
      if (!match?.[1]) return;
      const target = resolveExistingWorkspacePath(context.workspaceRoot, match[1]);
      const stat = await fs.stat(target.absolutePath).catch(() => null);
      if (!stat?.isFile()) return;
      recordFileObservationData(context.workspaceRoot, target.relativePath, { sizeBytes: stat.size, modifiedAtMs: stat.mtimeMs });
    }));
    return {
      success: result.exitCode === 0 || result.exitCode === 1,
      output: lines.join("\n") || "No matches found.",
      data: {
        query,
        glob: call.arguments.glob || null,
        caseSensitive,
        resultCount: lines.length,
        truncated: allLines.length > lines.length,
      },
    };
  }

  private async execCommand(call: DesktopToolCall, context: ToolExecutionContext) {
    const cwd = resolveWorkspacePath(context.workspaceRoot, String(call.arguments.cwd || ".")).absolutePath;
    const argv = readArgv(call.arguments.argv);
    const command = String(call.arguments.command || "");
    const label = argv.length ? argv.map(displayArg).join(" ") : command;
    context.onCommandOutput(call.id, `Running ${label}\n`);
    const result = await this.terminal.execCommand({
      cwd,
      command: argv.length ? undefined : command,
      argv: argv.length ? argv : undefined,
      tty: call.arguments.tty !== false,
      yieldTimeMs: readYieldTimeMs(call.arguments, ["yieldTimeMs", "yield_time_ms", "timeoutMs"]),
      maxOutputChars: Number(call.arguments.maxOutputChars) || undefined,
      signal: context.signal,
      onOutput: (delta) => context.onCommandOutput(call.id, delta),
    });
    if (result.processId && result.running) context.onTerminalProcessStarted?.(result.processId);
    if (result.processId && !result.running) context.onTerminalProcessEnded?.(result.processId);
    return terminalToolResult(result, result.processId
      ? `Command is still running as process ${result.processId}.`
      : `Command exited with code ${result.exitCode}`);
  }

  private async writeStdin(call: DesktopToolCall, context: ToolExecutionContext) {
    const result = await this.terminal.writeStdin({
      processId: Number(call.arguments.processId),
      input: String(call.arguments.input ?? ""),
      closeStdin: call.arguments.closeStdin === true || call.arguments.close_stdin === true,
      yieldTimeMs: readYieldTimeMs(call.arguments, ["yieldTimeMs", "yield_time_ms"]),
      maxOutputChars: Number(call.arguments.maxOutputChars) || undefined,
      signal: context.signal,
      onOutput: (delta) => context.onCommandOutput(call.id, delta),
    });
    if (result.processId && !result.running) context.onTerminalProcessEnded?.(result.processId);
    return terminalToolResult(result, result.processId
      ? `Process ${result.processId} is still running.`
      : `Process exited with code ${result.exitCode}`);
  }

  private async stopProcess(call: DesktopToolCall, context: ToolExecutionContext) {
    const processId = Number(call.arguments.processId);
    const result = await this.terminal.stopProcess({ processId });
    context.onTerminalProcessEnded?.(processId);
    return terminalToolResult(result, terminalFallbackOutput(result, processId));
  }

  private async resizeProcess(call: DesktopToolCall) {
    const result = await this.terminal.resizeProcess({
      processId: Number(call.arguments.processId),
      rows: Number(call.arguments.rows),
      cols: Number(call.arguments.cols),
    });
    return terminalToolResult(result, result.output || "Resize request processed.");
  }

  private async gitStatus(call: DesktopToolCall, context: ToolExecutionContext) {
    const cwd = resolveWorkspacePath(context.workspaceRoot, String(call.arguments.cwd || ".")).absolutePath;
    const result = await runProcess("git", ["status", "--short", "--branch"], cwd, context.signal);
    if (isNotGitRepository(result.output)) {
      return {
        success: true,
        output: "This workspace is not initialized as a Git repository.",
        data: { isGitRepository: false },
      };
    }
    return { success: result.exitCode === 0, output: result.output || "(clean)" };
  }

  private async gitDiff(call: DesktopToolCall, context: ToolExecutionContext) {
    const cwd = resolveWorkspacePath(context.workspaceRoot, String(call.arguments.cwd || ".")).absolutePath;
    const result = await runProcess("git", ["diff", ...(call.arguments.staged === true ? ["--staged"] : [])], cwd, context.signal);
    if (isNotGitRepository(result.output)) {
      return {
        success: true,
        output: "No Git diff is available because this workspace is not initialized as a Git repository.",
        data: { isGitRepository: false },
      };
    }
    return { success: result.exitCode === 0, output: result.output || "(no diff)" };
  }
}

const terminalToolResult = (
  result: {
    success: boolean;
    output: string;
    stdout?: string;
    stderr?: string;
    processId: number | null;
    running: boolean;
    exitCode: number | null;
    durationMs: number;
    processDurationMs?: number;
    operationDurationMs?: number;
    timedOut: boolean;
    omittedBytes: number;
    status: string;
    backend?: string;
    tty?: boolean;
    streamsMerged?: boolean;
  },
  fallbackOutput: string,
): ToolResult => ({
  success: result.success,
  output: result.output || fallbackOutput,
  error: result.timedOut ? "Command timed out." : undefined,
  data: {
    processId: result.processId,
    running: result.running,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    processDurationMs: typeof result.processDurationMs === "number" ? result.processDurationMs : result.durationMs,
    operationDurationMs: typeof result.operationDurationMs === "number" ? result.operationDurationMs : result.durationMs,
    timedOut: result.timedOut,
    omittedBytes: result.omittedBytes,
    status: result.status,
    stopped: result.status === "stopped",
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    backend: result.backend,
    tty: result.tty === true,
    streamsMerged: result.streamsMerged === true,
  },
});

const terminalFallbackOutput = (
  result: {
    processId: number | null;
    exitCode: number | null;
    status: string;
  },
  requestedProcessId?: number,
) => {
  if (result.status === "running") return `Process ${result.processId || requestedProcessId || ""} is still running.`.trim();
  if (result.status === "stopped") return `Stopped process ${requestedProcessId || ""}.`.trim();
  if (result.status === "not_found") return `Process ${requestedProcessId || ""} is not running.`.trim();
  if (result.status === "timed_out") return "Command timed out.";
  if (result.status === "failed") return "Terminal process failed to start.";
  return `Process exited with code ${result.exitCode}`;
};

const formatNoteLine = (note: { id: string; title: string; scope: string; filePath?: string; dirty?: boolean; sizeBytes?: number }) =>
  `${note.title} (${note.scope}${note.filePath ? `, ${note.filePath}` : ""}, ${note.sizeBytes || 0}B${note.dirty ? ", unsaved" : ""}) [${note.id}]`;

const boundedNoteContent = (content: string, maxBytes = 120_000) => {
  const buffer = Buffer.from(content, "utf8");
  if (buffer.length <= maxBytes) return content;
  return `${buffer.subarray(0, maxBytes).toString("utf8")}\n\n[truncated: ${buffer.length - maxBytes} bytes omitted]`;
};

const readYieldTimeMs = (args: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = args[key];
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const readArgv = (value: unknown) =>
  Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];

const displayArg = (value: string) =>
  /\s/.test(value) ? JSON.stringify(value) : value;
