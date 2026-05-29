import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { resolveWorkspacePath } from "../security/pathSandbox";
import type { TerminalSessionManager } from "../terminal/sessionManager";
import type { ToolExecutionContext } from "./tools/mutationCoordinator";
import type { DesktopToolCall, ToolResult } from "../../shared/types";

export type DiagnosticKind = "auto" | "typecheck" | "lint" | "test" | "build";

export interface ProjectProfile {
  packageManager?: "npm" | "pnpm" | "yarn" | "bun";
  packageScripts?: string[];
  hasPackageJson?: boolean;
  hasTsconfig?: boolean;
  hasVite?: boolean;
  hasFlutter?: boolean;
  hasCargo?: boolean;
  hasPythonProject?: boolean;
}

export class DiagnosticsEngine {
  constructor(private terminal: TerminalSessionManager) {}

  async run(call: DesktopToolCall, context: ToolExecutionContext): Promise<ToolResult> {
    const cwd = resolveWorkspacePath(context.workspaceRoot, String(call.arguments.cwd || ".")).absolutePath;
    const kind = normalizeKind(call.arguments.kind);
    const explicit = typeof call.arguments.command === "string" ? call.arguments.command.trim() : "";
    const profile = await detectProjectProfile(cwd);
    const command = explicit || pickDiagnosticCommand(profile, kind);
    if (!command) {
      return {
        success: false,
        error: "No suitable diagnostic command was detected for this workspace.",
        data: { kind, profile },
      };
    }

    context.onCommandOutput(call.id, `Checking ${kind} with ${command}\n`);
    const result = await this.terminal.execCommand({
      cwd,
      command,
      signal: context.signal,
      yieldTimeMs: Number(call.arguments.timeoutMs) || 30_000,
      onOutput: (delta) => context.onCommandOutput(call.id, delta),
    });
    let final = result;
    while (final.processId && !context.signal.aborted) {
      final = await this.terminal.writeStdin({
        processId: final.processId,
        input: "",
        signal: context.signal,
        yieldTimeMs: Number(call.arguments.timeoutMs) || 30_000,
        onOutput: (delta) => context.onCommandOutput(call.id, delta),
      });
    }
    const issues = parseDiagnosticIssues(final.output);
    return {
      success: final.exitCode === 0 && !final.timedOut,
      output: final.output || `Diagnostic exited with code ${final.exitCode}`,
      error: final.exitCode && final.exitCode !== 0 ? `Diagnostic failed with exit code ${final.exitCode}.` : undefined,
      data: {
        kind,
        command,
        cwd,
        profile,
        exitCode: final.exitCode,
        durationMs: final.durationMs,
        omittedBytes: final.omittedBytes,
        issues,
      },
    };
  }
}

export const detectProjectProfile = async (workspaceRoot: string): Promise<ProjectProfile> => {
  const entries = await Promise.all([
    readPackageJson(workspaceRoot),
    exists(path.join(workspaceRoot, "tsconfig.json")),
    exists(path.join(workspaceRoot, "vite.config.ts")),
    exists(path.join(workspaceRoot, "vite.config.js")),
    exists(path.join(workspaceRoot, "pubspec.yaml")),
    exists(path.join(workspaceRoot, "Cargo.toml")),
    exists(path.join(workspaceRoot, "pyproject.toml")),
  ]);
  const [pkg, hasTsconfig, hasViteTs, hasViteJs, hasFlutter, hasCargo, hasPythonProject] = entries;
  return {
    packageManager: detectPackageManager(workspaceRoot),
    packageScripts: pkg ? Object.keys(pkg.scripts || {}) : [],
    hasPackageJson: Boolean(pkg),
    hasTsconfig,
    hasVite: hasViteTs || hasViteJs,
    hasFlutter,
    hasCargo,
    hasPythonProject,
  };
};

export const detectProjectProfileSync = (workspaceRoot: string): ProjectProfile => {
  const packagePath = path.join(workspaceRoot, "package.json");
  const pkg = fsSync.existsSync(packagePath)
    ? safeParseJson(fsSync.readFileSync(packagePath, "utf8"))
    : null;
  return {
    packageManager: detectPackageManager(workspaceRoot),
    packageScripts: pkg ? Object.keys(pkg.scripts || {}) : [],
    hasPackageJson: Boolean(pkg),
    hasTsconfig: fsSync.existsSync(path.join(workspaceRoot, "tsconfig.json")),
    hasVite: fsSync.existsSync(path.join(workspaceRoot, "vite.config.ts")) || fsSync.existsSync(path.join(workspaceRoot, "vite.config.js")),
    hasFlutter: fsSync.existsSync(path.join(workspaceRoot, "pubspec.yaml")),
    hasCargo: fsSync.existsSync(path.join(workspaceRoot, "Cargo.toml")),
    hasPythonProject: fsSync.existsSync(path.join(workspaceRoot, "pyproject.toml")),
  };
};

const normalizeKind = (value: unknown): DiagnosticKind => {
  if (value === "typecheck" || value === "lint" || value === "test" || value === "build") return value;
  return "auto";
};

const pickDiagnosticCommand = (profile: ProjectProfile, kind: DiagnosticKind) => {
  const pm = profile.packageManager || "npm";
  const run = (script: string) => `${pm} run ${script}`;
  const scripts = new Set(profile.packageScripts || []);
  if (profile.hasPackageJson) {
    if (kind === "lint" && scripts.has("lint")) return run("lint");
    if (kind === "test" && scripts.has("test")) return pm === "npm" ? "npm test" : `${pm} test`;
    if (kind === "build" && scripts.has("build")) return run("build");
    if (kind === "typecheck") {
      if (scripts.has("typecheck")) return run("typecheck");
      if (profile.hasTsconfig) return "npx tsc --noEmit";
    }
    if (kind === "auto") {
      if (scripts.has("lint")) return run("lint");
      if (scripts.has("typecheck")) return run("typecheck");
      if (scripts.has("build")) return run("build");
      if (profile.hasTsconfig) return "npx tsc --noEmit";
      if (scripts.has("test")) return pm === "npm" ? "npm test" : `${pm} test`;
    }
  }
  if (profile.hasFlutter) {
    if (kind === "test") return "flutter test";
    return "flutter analyze";
  }
  if (profile.hasCargo) {
    if (kind === "test") return "cargo test";
    return "cargo check";
  }
  if (profile.hasPythonProject) {
    if (kind === "test") return "pytest";
    return "python -m compileall .";
  }
  return "";
};

const readPackageJson = async (workspaceRoot: string) => {
  try {
    return JSON.parse(await fs.readFile(path.join(workspaceRoot, "package.json"), "utf8")) as { scripts?: Record<string, string> };
  } catch {
    return null;
  }
};

const exists = async (filePath: string) =>
  fs.stat(filePath).then(() => true).catch(() => false);

const safeParseJson = (value: string) => {
  try {
    return JSON.parse(value) as { scripts?: Record<string, string> };
  } catch {
    return null;
  }
};

const detectPackageManager = (workspaceRoot: string): ProjectProfile["packageManager"] => {
  if (fsSync.existsSync(path.join(workspaceRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (fsSync.existsSync(path.join(workspaceRoot, "yarn.lock"))) return "yarn";
  if (fsSync.existsSync(path.join(workspaceRoot, "bun.lockb")) || fsSync.existsSync(path.join(workspaceRoot, "bun.lock"))) return "bun";
  if (fsSync.existsSync(path.join(workspaceRoot, "package-lock.json"))) return "npm";
  return "npm";
};

const parseDiagnosticIssues = (output: string) => {
  const issues: Array<{ file: string; line?: number; column?: number; text: string }> = [];
  output.split(/\r?\n/).forEach((line) => {
    const ts = line.match(/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(.+)$/i);
    if (ts) {
      issues.push({ file: ts[1], line: Number(ts[2]), column: Number(ts[3]), text: `${ts[4]} ${ts[5]}` });
      return;
    }
    const unix = line.match(/^(.+?):(\d+):(\d+):\s+(.+)$/);
    if (unix) {
      issues.push({ file: unix[1], line: Number(unix[2]), column: Number(unix[3]), text: unix[4] });
    }
  });
  return issues.slice(0, 80);
};
