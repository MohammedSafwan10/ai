import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { DesktopToolCall, ToolDiffFileRecord, ToolResult } from "../../../shared/types";
import { resolveExistingWorkspacePath, resolveWorkspacePath } from "../../security/pathSandbox";
import { redactSecrets } from "../../security/redact";
import { resolveRipgrepExecutablePath } from "../../resources";
import { TerminalSessionManager, type TerminalManagerEventListener } from "../../terminal/sessionManager";
import { DiagnosticsEngine } from "../diagnostics";
import { FileOperationService, hashBuffer, recordFileObservation, recordFileObservationData } from "./fileOperationService";
import { FileMutationCoordinator } from "./mutationCoordinator";
import { BrowserToolExecutor } from "../../browser/browserTools";
import type { BrowserSessionManager } from "../../browser/BrowserSessionManager";
import type { NotesStore } from "../../notes/NotesStore";
import type { PermissionMode } from "../../../shared/models";
import { ComputerUseToolExecutor } from "../../computer/computerTools";
import type { ComputerUseManager } from "../../computer/ComputerUseManager";
import { ImageGenerationManager } from "../../imageGeneration/ImageGenerationManager";

export interface ToolExecutionContext {
  workspaceId?: string;
  workspaceRoot: string;
  signal: AbortSignal;
  browserExternalApproved?: boolean;
  permissionMode?: PermissionMode;
  computerUseEnabled?: boolean;
  cliproxyBaseUrl?: string;
  geminiApiKey?: string;
  onCommandOutput: (callId: string, delta: string) => void;
  onTerminalProcessStarted?: (sessionId: number) => void;
  onTerminalProcessEnded?: (sessionId: number) => void;
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
  private terminal: TerminalSessionManager;
  private mutations = new FileMutationCoordinator();
  private diagnostics: DiagnosticsEngine;
  private browser?: BrowserToolExecutor;
  private computer?: ComputerUseToolExecutor;
  private images = new ImageGenerationManager();

  constructor(browserManager?: BrowserSessionManager, private notesStore?: NotesStore, computerUseManager?: ComputerUseManager, onTerminalEvent?: TerminalManagerEventListener) {
    this.terminal = new TerminalSessionManager(undefined, onTerminalEvent);
    this.diagnostics = new DiagnosticsEngine(this.terminal);
    this.browser = browserManager ? new BrowserToolExecutor(browserManager) : undefined;
    this.computer = computerUseManager ? new ComputerUseToolExecutor(computerUseManager) : undefined;
  }

  async stopTerminalProcess(sessionId: number) {
    return await this.terminal.stopProcess({ processId: sessionId });
  }

  getTerminalState() {
    return { sessions: this.terminal.listSessions(true), updatedAt: Date.now() };
  }

  readTerminalSession(sessionId: number, maxOutputChars?: number) {
    return this.terminal.readSession(sessionId, maxOutputChars);
  }

  resizeTerminalSession(sessionId: number, rows: number, cols: number) {
    return this.terminal.resizeProcess({ processId: sessionId, rows, cols });
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
        case "exec_command":
          return await this.execCommand(call, context);
        case "write_stdin":
          return await this.writeStdin(call, context);
        case "terminal_stop":
          return await this.stopProcess(call, context);
        case "terminal_resize":
          return await this.resizeProcess(call);
        case "terminal_list":
          return this.terminalList(call);
        case "terminal_read":
          return this.terminalRead(call);
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
        case "generate_image":
          return await this.generateImage(call, context);
        case "edit_image":
          return await this.generateImage(call, context);
        case "list_generated_images":
          return this.listGeneratedImages(call);
        case "save_generated_image":
          return await this.saveGeneratedImage(call, context);
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

  private async generateImage(call: DesktopToolCall, context: ToolExecutionContext) {
    const prompt = String(call.arguments.prompt || "");
    const referenceImagePaths = readStringArray(call.arguments.referenceImagePaths || call.arguments.reference_image_paths || call.arguments.images || call.arguments.imagePaths || call.arguments.image_paths);
    context.onCommandOutput(call.id, `${referenceImagePaths.length > 0 ? "Editing" : "Generating"} image with ${call.arguments.provider || "cliproxy"}\n`);
    const records = await this.images.generate({
      provider: typeof call.arguments.provider === "string" ? call.arguments.provider : undefined,
      model: typeof call.arguments.model === "string" ? call.arguments.model : undefined,
      prompt,
      count: Number(call.arguments.count || call.arguments.n) || undefined,
      size: typeof call.arguments.size === "string" ? call.arguments.size : undefined,
      quality: typeof call.arguments.quality === "string" ? call.arguments.quality : undefined,
      outputFormat: typeof call.arguments.outputFormat === "string" ? call.arguments.outputFormat : typeof call.arguments.output_format === "string" ? call.arguments.output_format : undefined,
      referenceImagePaths,
      saveToWorkspacePath: typeof call.arguments.saveToWorkspacePath === "string" ? call.arguments.saveToWorkspacePath : typeof call.arguments.save_to_workspace_path === "string" ? call.arguments.save_to_workspace_path : undefined,
      overwrite: call.arguments.overwrite === true,
      workspaceRoot: context.workspaceRoot,
      workspaceId: context.workspaceId,
      cliproxyBaseUrl: context.cliproxyBaseUrl,
      geminiApiKey: context.geminiApiKey,
      signal: context.signal,
    });
    return {
      success: true,
      output: formatGeneratedImages(records),
      data: { images: records },
    };
  }

  private listGeneratedImages(call: DesktopToolCall) {
    const images = this.images.list(Number(call.arguments.limit) || 20);
    return {
      success: true,
      output: images.length ? formatGeneratedImages(images) : "No generated images yet.",
      data: { images },
    };
  }

  private async saveGeneratedImage(call: DesktopToolCall, context: ToolExecutionContext) {
    const result = await this.images.saveGeneratedImage({
      id: typeof call.arguments.id === "string" ? call.arguments.id : typeof call.arguments.imageId === "string" ? call.arguments.imageId : typeof call.arguments.image_id === "string" ? call.arguments.image_id : undefined,
      sourcePath: typeof call.arguments.sourcePath === "string" ? call.arguments.sourcePath : typeof call.arguments.source_path === "string" ? call.arguments.source_path : undefined,
      destinationPath: String(call.arguments.destinationPath || call.arguments.destination_path || ""),
      overwrite: call.arguments.overwrite === true,
      workspaceRoot: context.workspaceRoot,
    });
    return {
      success: true,
      output: `Saved generated image to ${result.workspacePath}`,
      data: result,
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
    const cwd = resolveWorkspacePath(context.workspaceRoot, String(call.arguments.cwd || call.arguments.workdir || ".")).absolutePath;
    const argv = readArgv(call.arguments.argv);
    const command = String(call.arguments.cmd || call.arguments.command || "");
    const label = redactSecrets(argv.length ? argv.map(displayArg).join(" ") : command);
    context.onCommandOutput(call.id, `Running ${label}\n`);
    const result = await this.terminal.execCommand({
      cwd,
      command: argv.length ? undefined : command,
      argv: argv.length ? argv : undefined,
      tty: call.arguments.tty !== false,
      yieldTimeMs: readYieldTimeMs(call.arguments, ["yieldTimeMs", "yield_time_ms", "timeoutMs", "timeout_ms"]),
      maxOutputChars: Number(call.arguments.maxOutputChars || call.arguments.max_output_chars || call.arguments.max_output_tokens) || undefined,
      signal: context.signal,
      onOutput: (delta) => context.onCommandOutput(call.id, delta),
    });
    if (result.sessionId && result.running) context.onTerminalProcessStarted?.(result.sessionId);
    if (result.sessionId && !result.running) context.onTerminalProcessEnded?.(result.sessionId);
    return terminalToolResult(result, result.processId
      ? `Command is still running as session ${result.sessionId ?? result.processId}.`
      : `Command exited with code ${result.exitCode}`);
  }

  private async writeStdin(call: DesktopToolCall, context: ToolExecutionContext) {
    const sessionId = Number(call.arguments.sessionId || call.arguments.session_id || call.arguments.processId);
    const result = await this.terminal.writeStdin({
      processId: sessionId,
      input: String(call.arguments.chars ?? call.arguments.input ?? ""),
      closeStdin: call.arguments.closeStdin === true || call.arguments.close_stdin === true,
      yieldTimeMs: readYieldTimeMs(call.arguments, ["yieldTimeMs", "yield_time_ms"]),
      maxOutputChars: Number(call.arguments.maxOutputChars || call.arguments.max_output_chars || call.arguments.max_output_tokens) || undefined,
      signal: context.signal,
      onOutput: (delta) => context.onCommandOutput(call.id, delta),
    });
    if (result.sessionId && !result.running) context.onTerminalProcessEnded?.(result.sessionId);
    return terminalToolResult(result, result.processId
      ? `Session ${result.sessionId ?? result.processId} is still running.`
      : `Process exited with code ${result.exitCode}`);
  }

  private async stopProcess(call: DesktopToolCall, context: ToolExecutionContext) {
    const sessionId = Number(call.arguments.sessionId || call.arguments.session_id || call.arguments.processId);
    const result = await this.terminal.stopProcess({ processId: sessionId });
    context.onTerminalProcessEnded?.(sessionId);
    return terminalToolResult(result, terminalFallbackOutput(result, sessionId));
  }

  private async resizeProcess(call: DesktopToolCall) {
    const sessionId = Number(call.arguments.sessionId || call.arguments.session_id || call.arguments.processId);
    const result = await this.terminal.resizeProcess({
      processId: sessionId,
      rows: Number(call.arguments.rows),
      cols: Number(call.arguments.cols),
    });
    return terminalToolResult(result, result.output || "Resize request processed.");
  }

  private terminalList(call: DesktopToolCall): ToolResult {
    const includeExited = call.arguments.includeExited !== false && call.arguments.include_exited !== false;
    const sessions = this.terminal.listSessions(includeExited);
    return {
      success: true,
      output: sessions.length
        ? sessions.map((session) => `${session.sessionId} ${session.status} ${session.command}`).join("\n")
        : "No terminal sessions.",
      data: { sessions, updatedAt: Date.now() },
    };
  }

  private terminalRead(call: DesktopToolCall): ToolResult {
    const sessionId = Number(call.arguments.sessionId || call.arguments.session_id);
    const maxOutputChars = Number(call.arguments.maxOutputChars || call.arguments.max_output_chars || call.arguments.max_output_tokens) || undefined;
    return this.terminal.readSession(sessionId, maxOutputChars);
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
    sessionId?: number | null;
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
    partialChunk?: boolean;
  },
  fallbackOutput: string,
): ToolResult => ({
  success: result.success,
  output: result.output || fallbackOutput,
  error: result.timedOut ? "Command timed out." : undefined,
  data: {
    session_id: result.sessionId ?? result.processId,
    sessionId: result.sessionId ?? result.processId,
    process_id: result.processId,
    processId: result.processId,
    running: result.running,
    exit_code: result.exitCode,
    exitCode: result.exitCode,
    wall_time_ms: result.durationMs,
    durationMs: result.durationMs,
    duration_ms: result.durationMs,
    processDurationMs: typeof result.processDurationMs === "number" ? result.processDurationMs : result.durationMs,
    operationDurationMs: typeof result.operationDurationMs === "number" ? result.operationDurationMs : result.durationMs,
    timed_out: result.timedOut,
    timedOut: result.timedOut,
    omitted_bytes: result.omittedBytes,
    omittedBytes: result.omittedBytes,
    status: result.status,
    stopped: result.status === "stopped",
    partial_chunk: result.partialChunk === true,
    partialChunk: result.partialChunk === true,
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
  requestedSessionId?: number,
) => {
  const id = requestedSessionId || result.processId || "";
  if (result.status === "running") return `Session ${id} is still running.`.trim();
  if (result.status === "stopped") return `Stopped session ${id}.`.trim();
  if (result.status === "not_found") return `Session ${id} is not running.`.trim();
  if (result.status === "timed_out") return "Command timed out.";
  if (result.status === "failed") return "Terminal session failed to start.";
  return `Session exited with code ${result.exitCode}`;
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

const readStringArray = (value: unknown) =>
  Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];

const formatGeneratedImages = (images: Array<{ id: string; provider: string; model: string; path: string; previewUrl?: string; workspacePath?: string; sizeBytes?: number; mimeType?: string }>) =>
  images.map((image, index) => [
    `${index + 1}. ${image.id}`,
    `provider: ${image.provider}`,
    `model: ${image.model}`,
    `path: ${image.path}`,
    image.workspacePath ? `workspace: ${image.workspacePath}` : "",
    image.previewUrl ? `preview: ${image.previewUrl}` : "",
    image.mimeType ? `mime: ${image.mimeType}` : "",
    typeof image.sizeBytes === "number" ? `size: ${image.sizeBytes}B` : "",
  ].filter(Boolean).join("\n")).join("\n\n");
