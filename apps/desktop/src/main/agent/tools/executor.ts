import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { rgPath } from "@vscode/ripgrep";
import type { DesktopToolCall, ToolDiffFileRecord, ToolResult } from "../../../shared/types";
import { resolveWorkspacePath } from "../../security/pathSandbox";
import { redactSecrets } from "../../security/redact";
import { TerminalSessionManager } from "../../terminal/sessionManager";
import { DiagnosticsEngine } from "../diagnostics";
import { FileMutationCoordinator } from "./mutationCoordinator";

export interface ToolExecutionContext {
  workspaceRoot: string;
  signal: AbortSignal;
  onCommandOutput: (callId: string, delta: string) => void;
}

const readText = async (filePath: string, maxBytes = 120_000) => {
  const stat = await fs.stat(filePath);
  if (stat.size > maxBytes) {
    const handle = await fs.open(filePath, "r");
    try {
      const buffer = Buffer.alloc(maxBytes);
      await handle.read(buffer, 0, maxBytes, 0);
      return `${buffer.toString("utf8")}\n\n[File truncated at ${maxBytes} bytes.]`;
    } finally {
      await handle.close();
    }
  }
  return fs.readFile(filePath, "utf8");
};

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

export class DesktopToolExecutor {
  private terminal = new TerminalSessionManager();
  private mutations = new FileMutationCoordinator();
  private diagnostics = new DiagnosticsEngine(this.terminal);

  async execute(call: DesktopToolCall, context: ToolExecutionContext): Promise<ToolResult & { diff?: string; diffFiles?: ToolDiffFileRecord[] }> {
    try {
      switch (call.name) {
        case "desktop_read_file":
          return this.readFile(call, context);
        case "desktop_write_file":
          return this.mutations.writeFile(call, context);
        case "desktop_apply_patch":
          return this.mutations.applyPatch(call, context);
        case "desktop_list_dir":
          return this.listDir(call, context);
        case "desktop_search":
          return this.search(call, context);
        case "desktop_delete_path":
          return this.mutations.deletePath(call, context);
        case "desktop_rename_path":
          return this.mutations.renamePath(call, context);
        case "desktop_exec_command":
        case "desktop_run_command":
          return this.execCommand(call, context);
        case "desktop_write_stdin":
          return this.writeStdin(call, context);
        case "desktop_stop_process":
          return this.stopProcess(call);
        case "desktop_run_diagnostics":
          return this.diagnostics.run(call, context);
        case "desktop_git_status":
          return this.gitStatus(call, context);
        case "desktop_git_diff":
          return this.gitDiff(call, context);
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
    const target = resolveWorkspacePath(context.workspaceRoot, String(call.arguments.path || ""));
    context.onCommandOutput(call.id, `Reading ${target.relativePath}\n`);
    const output = await readText(target.absolutePath, Number(call.arguments.maxBytes) || 120_000);
    return { success: true, output, data: { path: target.relativePath } };
  }

  private async listDir(call: DesktopToolCall, context: ToolExecutionContext) {
    const target = resolveWorkspacePath(context.workspaceRoot, String(call.arguments.path || "."));
    const depth = Math.max(1, Math.min(3, Number(call.arguments.depth) || 1));
    const lines: string[] = [];
    const walk = async (dir: string, prefix: string, currentDepth: number) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 200)) {
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
        const rel = path.join(prefix, entry.name);
        lines.push(`${entry.isDirectory() ? "dir " : "file"} ${rel}`);
        if (entry.isDirectory() && currentDepth < depth) await walk(path.join(dir, entry.name), rel, currentDepth + 1);
      }
    };
    await walk(target.absolutePath, target.relativePath === "." ? "" : target.relativePath, 1);
    return { success: true, output: lines.join("\n") || "(empty)", data: { path: target.relativePath } };
  }

  private async search(call: DesktopToolCall, context: ToolExecutionContext) {
    const query = String(call.arguments.query || "");
    const args = ["--line-number", "--hidden", "--glob", "!node_modules", "--glob", "!.git", "--glob", "!dist"];
    if (call.arguments.glob) args.push("--glob", String(call.arguments.glob));
    args.push(query, ".");
    const result = await runProcess(rgPath, args, context.workspaceRoot, context.signal);
    const lines = result.output.split(/\r?\n/).filter(Boolean).slice(0, Number(call.arguments.maxResults) || 80);
    return { success: result.exitCode === 0 || result.exitCode === 1, output: lines.join("\n") || "No matches found." };
  }

  private async execCommand(call: DesktopToolCall, context: ToolExecutionContext) {
    const cwd = resolveWorkspacePath(context.workspaceRoot, String(call.arguments.cwd || ".")).absolutePath;
    const command = String(call.arguments.command || "");
    context.onCommandOutput(call.id, `Running ${command}\n`);
    const result = await this.terminal.execCommand({
      cwd,
      command,
      yieldTimeMs: Number(call.arguments.yieldTimeMs || call.arguments.timeoutMs) || undefined,
      maxOutputChars: Number(call.arguments.maxOutputChars) || undefined,
      signal: context.signal,
      onOutput: (delta) => context.onCommandOutput(call.id, delta),
    });
    return terminalToolResult(result, result.processId
      ? `Command is still running as process ${result.processId}.`
      : `Command exited with code ${result.exitCode}`);
  }

  private async writeStdin(call: DesktopToolCall, context: ToolExecutionContext) {
    const result = await this.terminal.writeStdin({
      processId: Number(call.arguments.processId),
      input: String(call.arguments.input ?? ""),
      yieldTimeMs: Number(call.arguments.yieldTimeMs) || undefined,
      maxOutputChars: Number(call.arguments.maxOutputChars) || undefined,
      signal: context.signal,
      onOutput: (delta) => context.onCommandOutput(call.id, delta),
    });
    return terminalToolResult(result, result.processId
      ? `Process ${result.processId} is still running.`
      : `Process exited with code ${result.exitCode}`);
  }

  private async stopProcess(call: DesktopToolCall) {
    const result = await this.terminal.stopProcess({ processId: Number(call.arguments.processId) });
    return terminalToolResult(result, terminalFallbackOutput(result, Number(call.arguments.processId)));
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
    processId: number | null;
    running: boolean;
    exitCode: number | null;
    durationMs: number;
    timedOut: boolean;
    omittedBytes: number;
    status: string;
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
    timedOut: result.timedOut,
    omittedBytes: result.omittedBytes,
    status: result.status,
    stopped: result.status === "stopped",
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
  return `Process exited with code ${result.exitCode}`;
};
