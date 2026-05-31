import type { PermissionMode } from "../../../shared/models";
import type { ApprovalScopeRecord, DesktopToolCall, ToolRisk } from "../../../shared/types";

const destructiveCommandPattern =
  /\b(rm|del|erase|rd|rmdir|format|shutdown|restart-computer|stop-process|remove-item|move-item|rename-item|set-content|out-file|new-item|git\s+(reset|checkout|clean|push|commit|merge|rebase)|npm\s+i|npm\s+install|pnpm\s+i|pnpm\s+install|yarn\s+(add|install)|bun\s+install|pip\s+install|cargo\s+install)\b/i;

const networkCommandPattern =
  /\b(curl|wget|invoke-webrequest|iwr|invoke-restmethod|irm|ssh|scp|ftp|gh\s+auth|npm\s+publish|pnpm\s+publish)\b/i;

const shellControlPattern = /(\|\||&&|;|>|<|\|\s*(set-content|out-file|tee-object|%|foreach-object))/i;

const patchContainsRiskyFileOperation = (patch: string) =>
  /^\*\*\* Delete File: /im.test(patch) || /^\*\*\* Move to: /im.test(patch);

export interface PermissionDecision {
  risk: ToolRisk;
  requiresApproval: boolean;
  reason?: string;
}

export const classifyToolCall = (call: DesktopToolCall, mode: PermissionMode): PermissionDecision => {
  if (call.name === "desktop_delete_path") {
    return {
      risk: "risky",
      requiresApproval: mode !== "yolo",
      reason: "Deleting files can remove user work.",
    };
  }

  if (call.name === "desktop_rename_path") {
    return {
      risk: "risky",
      requiresApproval: mode !== "yolo",
      reason: "Moving or renaming files changes the workspace structure.",
    };
  }

  if (call.name === "desktop_apply_patch") {
    const patch = String(call.arguments.patch || "");
    const risky = patchContainsRiskyFileOperation(patch);
    return {
      risk: risky ? "risky" : "safe",
      requiresApproval: risky && mode !== "yolo",
      reason: risky ? "This patch deletes or moves files." : undefined,
    };
  }

  if (call.name === "desktop_spawn_process" || call.name === "desktop_run_diagnostics") {
    const command = normalizedTerminalCommand(call) || String(call.arguments.command || (call.name === "desktop_run_diagnostics" ? call.arguments.kind || "" : ""));
    const risky =
      riskyArgv(call.arguments.argv) ||
      destructiveCommandPattern.test(command) ||
      networkCommandPattern.test(command) ||
      shellControlPattern.test(command);
    return {
      risk: risky ? "risky" : "safe",
      requiresApproval: risky && mode !== "yolo",
      reason: undefined,
    };
  }

  if (call.name === "desktop_write_process") {
    const input = String(call.arguments.input || "");
    const risky =
      destructiveCommandPattern.test(input) ||
      networkCommandPattern.test(input) ||
      shellControlPattern.test(input);
    return {
      risk: risky ? "risky" : "safe",
      requiresApproval: risky && mode !== "yolo",
      reason: undefined,
    };
  }

  return { risk: "safe", requiresApproval: false };
};

export const findMatchingApprovalScope = (
  call: DesktopToolCall,
  scopes: ApprovalScopeRecord[],
  nowMs = Date.now(),
) =>
  scopes.find((scope) => {
    if (scope.expiresAt && scope.expiresAt <= nowMs) return false;
    if (scope.maxUses && scope.useCount >= scope.maxUses) return false;
    if (scope.kind === "tool_thread" || scope.kind === "tool_workspace") {
      return scope.toolName === call.name;
    }
    if (scope.kind === "terminal_prefix") {
      const command = normalizedTerminalCommand(call);
      const cwdMatches = !scope.cwd || normalizeCwd(scope.cwd) === callCwd(call);
      return Boolean(scope.commandPrefix && cwdMatches && commandStartsWithPrefix(command, scope.commandPrefix));
    }
    return false;
  }) || null;

export const approvalCommandPrefix = (call: DesktopToolCall) => {
  const argv = normalizedArgv(call.arguments.argv);
  if (argv.length > 0) return argv.slice(0, 2).join(" ");
  return normalizedTerminalCommand(call).split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
};

const normalizedTerminalCommand = (call: DesktopToolCall) => {
  if (call.name === "desktop_spawn_process") {
    const argv = normalizedArgv(call.arguments.argv);
    if (argv.length > 0) return argv.join(" ");
    return normalizeCommand(String(call.arguments.command || ""));
  }
  if (call.name === "desktop_write_process") {
    return normalizeCommand(String(call.arguments.input || ""));
  }
  return "";
};

const normalizeCommand = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

const normalizedArgv = (value: unknown) =>
  Array.isArray(value) ? value.map((item) => normalizeCommand(String(item))).filter(Boolean) : [];

const riskyArgv = (value: unknown) => {
  const argv = normalizedArgv(value);
  if (argv.length === 0) return false;
  const [program = "", subcommand = ""] = argv;
  if (["rm", "del", "erase", "rd", "rmdir", "format", "shutdown", "restart-computer", "stop-process", "remove-item", "move-item", "rename-item", "set-content", "out-file", "new-item"].includes(program)) return true;
  if (program === "git" && ["reset", "checkout", "clean", "push", "commit", "merge", "rebase"].includes(subcommand)) return true;
  if (["npm", "pnpm"].includes(program) && ["i", "install", "publish"].includes(subcommand)) return true;
  if (program === "yarn" && ["add", "install"].includes(subcommand)) return true;
  if (program === "bun" && subcommand === "install") return true;
  if (program === "pip" && subcommand === "install") return true;
  if (program === "cargo" && subcommand === "install") return true;
  if (["curl", "wget", "invoke-webrequest", "iwr", "invoke-restmethod", "irm", "ssh", "scp", "ftp"].includes(program)) return true;
  if (program === "gh" && subcommand === "auth") return true;
  return false;
};

const commandStartsWithPrefix = (command: string, prefix: string) =>
  command === prefix || (command.startsWith(prefix) && /\s/.test(command.charAt(prefix.length)));

export const approvalCwd = (call: DesktopToolCall) =>
  callCwd(call);

const callCwd = (call: DesktopToolCall) =>
  normalizeCwd(String(call.arguments.cwd || "."));

const normalizeCwd = (value: string) =>
  value.trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "") || ".";
