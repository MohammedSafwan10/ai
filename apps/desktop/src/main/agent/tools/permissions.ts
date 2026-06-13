import type { PermissionMode } from "../../../shared/models";
import type { ApprovalScopeRecord, DesktopToolCall, ToolRisk } from "../../../shared/types";
import { browserOriginDecision } from "../../browser/browserSecurity";
import { computerActionHardBlockReason } from "../../computer/safety";

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

interface PermissionContext {
  browserCurrentPageRequiresApproval?: boolean;
}

export const classifyToolCall = (call: DesktopToolCall, mode: PermissionMode, context: PermissionContext = {}): PermissionDecision => {
  if (call.name === "desktop_delete_path") {
    return {
      risk: "risky",
      requiresApproval: mode !== "yolo",
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

  if (call.name === "exec_command" || call.name === "desktop_run_diagnostics") {
    return {
      risk: "risky",
      requiresApproval: mode !== "yolo",
      reason: "Terminal commands can execute arbitrary code and access data outside the workspace.",
    };
  }

  if (call.name === "write_stdin") {
    const input = String(call.arguments.chars || call.arguments.input || "");
    const risky = input.length > 0;
    return {
      risk: risky ? "risky" : "safe",
      requiresApproval: risky && mode !== "yolo",
      reason: risky ? "Terminal input can control an interactive shell or interpreter." : undefined,
    };
  }

  if (call.name === "notes_save") {
    return {
      risk: "risky",
      requiresApproval: mode !== "yolo",
      reason: "Saving a note can write to a user-selected file path.",
    };
  }

  if (call.name === "notes_delete") {
    return {
      risk: "risky",
      requiresApproval: mode !== "yolo",
      reason: call.arguments.deleteFile === true || call.arguments.delete_file === true
        ? "Deleting this note can move its external file to the OS Recycle Bin."
        : "Deleting a note removes its local Privora draft or saved reference.",
    };
  }

  if (call.name.startsWith("computer_")) {
    if (call.name === "computer_capabilities" || call.name === "computer_list_windows" || call.name === "computer_find_apps" || call.name === "computer_snapshot" || call.name === "computer_inspect" || call.name === "computer_wait" || call.name === "computer_verify" || call.name === "computer_screenshot" || call.name === "computer_stop") {
      return { risk: "safe", requiresApproval: false };
    }

    if (call.name === "computer_act" || call.name === "computer_trace") {
      const hardBlock = computerActionHardBlockReason({
        action: String(call.arguments.action || ""),
        ref: typeof call.arguments.ref === "string" ? call.arguments.ref : undefined,
        targetRef: typeof call.arguments.targetRef === "string" ? call.arguments.targetRef : typeof call.arguments.target_ref === "string" ? call.arguments.target_ref : undefined,
        text: typeof call.arguments.text === "string" ? call.arguments.text : undefined,
        key: typeof call.arguments.key === "string" ? call.arguments.key : undefined,
        value: typeof call.arguments.value === "string" ? call.arguments.value : undefined,
      });
      if (hardBlock) {
        return {
          risk: "blocked",
          requiresApproval: false,
          reason: hardBlock.message,
        };
      }
    }

    if (call.name === "computer_clipboard") {
      const action = String(call.arguments.action || "").toLowerCase();
      if (action === "set_text") {
        const hardBlock = computerActionHardBlockReason({ action: "type", text: String(call.arguments.text || "") });
        if (hardBlock) return { risk: "blocked", requiresApproval: false, reason: hardBlock.message };
      }
    }

    return {
      risk: "risky",
      requiresApproval: mode !== "yolo",
      reason: "Computer Use can control native desktop apps outside the workspace.",
    };
  }

  if (call.name === "browser_open") {
    try {
      const decision = browserOriginDecision(String(call.arguments.url || ""), "agent");
      if (!decision.allowed) {
        return {
          risk: "risky",
          requiresApproval: mode !== "yolo",
          reason: decision.reason,
        };
      }
    } catch (error) {
      return {
        risk: "blocked",
        requiresApproval: false,
        reason: error instanceof Error ? error.message : "Invalid browser URL.",
      };
    }
  }

  if (call.name === "browser_open_link" && context.browserCurrentPageRequiresApproval) {
    return {
      risk: "risky",
      requiresApproval: mode !== "yolo",
      reason: "Agent link navigation on the current external browser page needs approval.",
    };
  }

  if (call.name === "browser_act" || call.name === "browser_trace") {
    if (browserActionLooksSensitive(call)) {
      return {
        risk: "risky",
        requiresApproval: mode !== "yolo",
        reason: "This browser action may submit sensitive or irreversible information.",
      };
    }
    if (context.browserCurrentPageRequiresApproval) {
      return {
        risk: "risky",
        requiresApproval: mode !== "yolo",
        reason: "Agent interaction with the current external browser page needs approval.",
      };
    }
  }

  if (call.name === "browser_downloads") {
    const action = String(call.arguments.action || "list").toLowerCase();
    if (action === "allow_next" || action === "reveal" || action === "cancel") {
      return {
        risk: "risky",
        requiresApproval: mode !== "yolo",
        reason: "Browser download actions need explicit approval.",
      };
    }
  }

  if (call.name === "browser_shields") {
    const action = String(call.arguments.action || "get").toLowerCase();
    if (action === "set_mode" || action === "toggle_site") {
      return {
        risk: "risky",
        requiresApproval: mode !== "yolo",
        reason: "Changing Privora Shields can alter how external pages load.",
      };
    }
  }

  if (call.name === "browser_form_fill" || call.name === "browser_form_submit") {
    const sensitive = call.name === "browser_form_submit" || browserFormLooksSensitive(call);
    if (sensitive) {
      return {
        risk: "risky",
        requiresApproval: mode !== "yolo",
        reason: "This browser form workflow may submit sensitive or irreversible information.",
      };
    }
    if (context.browserCurrentPageRequiresApproval) {
      return {
        risk: "risky",
        requiresApproval: mode !== "yolo",
        reason: "Agent form interaction with the current external browser page needs approval.",
      };
    }
  }

  if (call.name === "browser_workflow") {
    const action = String(call.arguments.action || "list").toLowerCase();
    if (action === "replay") {
      return {
        risk: "risky",
        requiresApproval: mode !== "yolo",
        reason: "Replaying a browser workflow may interact with external pages or submit forms.",
      };
    }
  }

  return { risk: "safe", requiresApproval: false };
};

export const findMatchingApprovalScope = (
  call: DesktopToolCall,
  scopes: ApprovalScopeRecord[],
  nowMs = Date.now(),
) =>
  scopes.find((scope) => {
    if (["exec_command", "write_stdin", "desktop_run_diagnostics"].includes(call.name)) return false;
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
  return normalizedTerminalCommand(call);
};

const normalizedTerminalCommand = (call: DesktopToolCall) => {
  if (call.name === "exec_command") {
    const argv = normalizedArgv(call.arguments.argv);
    if (argv.length > 0) return argv.join(" ");
    return normalizeCommand(String(call.arguments.cmd || call.arguments.command || ""));
  }
  if (call.name === "write_stdin") {
    return normalizeCommand(String(call.arguments.chars || call.arguments.input || ""));
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

const browserActionLooksSensitive = (call: DesktopToolCall) => {
  const action = String(call.arguments.action || "").toLowerCase();
  const key = String(call.arguments.key || "").toLowerCase();
  const text = String(call.arguments.text || "");
  const value = String(call.arguments.value || "");
  const label = [call.arguments.ref, call.arguments.targetRef, text, value].map((item) => String(item || "")).join(" ");
  if (action === "press" && key === "enter" && /pay|purchase|book|submit|apply|confirm|delete|transfer|checkout/i.test(label)) return true;
  if (/password|passwd|pwd|otp|mfa|2fa|credit.?card|card number|cvv|cvc|ssn|api.?key|secret|token/i.test(label)) return true;
  return false;
};

const browserFormLooksSensitive = (call: DesktopToolCall) => {
  const fields = Array.isArray(call.arguments.fields) ? call.arguments.fields : [];
  const joined = fields.map((field) => {
    const data = field && typeof field === "object" ? field as Record<string, unknown> : {};
    return [data.fieldId, data.field_id, data.name, data.label, data.value].map((item) => String(item || "")).join(" ");
  }).join(" ");
  return /password|passwd|pwd|otp|mfa|2fa|credit.?card|card number|cvv|cvc|ssn|api.?key|secret|token|pay|purchase|book|submit|apply|confirm|delete|transfer|checkout/i.test(joined);
};

const commandStartsWithPrefix = (command: string, prefix: string) =>
  command === prefix || (command.startsWith(prefix) && /\s/.test(command.charAt(prefix.length)));

export const approvalCwd = (call: DesktopToolCall) =>
  callCwd(call);

const callCwd = (call: DesktopToolCall) =>
  normalizeCwd(String(call.arguments.cwd || call.arguments.workdir || "."));

const normalizeCwd = (value: string) =>
  value.trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "") || ".";
