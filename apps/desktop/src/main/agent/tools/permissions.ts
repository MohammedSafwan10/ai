import type { PermissionMode } from "../../../shared/models";
import type { DesktopToolCall, ToolRisk } from "../../../shared/types";

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

  if (call.name === "desktop_run_command") {
    const command = String(call.arguments.command || "");
    const risky =
      destructiveCommandPattern.test(command) ||
      networkCommandPattern.test(command) ||
      shellControlPattern.test(command);
    return {
      risk: risky ? "risky" : "safe",
      requiresApproval: risky && mode !== "yolo",
      reason: risky ? "This command may mutate files, install packages, access the network, or chain shell operations." : undefined,
    };
  }

  return { risk: "safe", requiresApproval: false };
};
