import { describe, expect, it } from "vitest";
import { approvalCommandPrefix, classifyToolCall, findMatchingApprovalScope } from "../src/main/agent/tools/permissions";
import type { ApprovalScopeRecord, DesktopToolCall } from "../src/shared/types";

const call = (name: DesktopToolCall["name"], args: Record<string, unknown> = {}): DesktopToolCall => ({
  id: "test",
  name,
  arguments: args,
});

describe("desktop permission classifier", () => {
  it("allows reads without approval", () => {
    expect(classifyToolCall(call("desktop_read_file", { path: "src/App.tsx" }), "ask_risky")).toMatchObject({
      risk: "safe",
      requiresApproval: false,
    });
  });

  it("requires approval for deletes in ask risky mode", () => {
    expect(classifyToolCall(call("desktop_delete_path", { path: "old.txt" }), "ask_risky")).toMatchObject({
      risk: "risky",
      requiresApproval: true,
    });
  });

  it("auto-approves workspace deletes in yolo mode", () => {
    expect(classifyToolCall(call("desktop_delete_path", { path: "old.txt" }), "yolo")).toMatchObject({
      risk: "risky",
      requiresApproval: false,
    });
  });

  it("requires approval for chained terminal commands", () => {
    expect(classifyToolCall(call("exec_command", { cmd: "npm install && npm run build" }), "ask_risky")).toMatchObject({
      risk: "risky",
      requiresApproval: true,
    });
  });

  it("requires approval for interpreter and ordinary terminal commands", () => {
    for (const args of [
      { argv: ["node", "-e", "require('fs').writeFileSync('x','y')"] },
      { argv: ["python", "-c", "print('ok')"] },
      { cmd: "git status --short" },
    ]) {
      expect(classifyToolCall(call("exec_command", args), "ask_risky")).toMatchObject({
        risk: "risky",
        requiresApproval: true,
      });
    }
  });

  it("requires approval for all non-empty terminal stdin", () => {
    expect(classifyToolCall(call("write_stdin", { session_id: 7, chars: "print('hello')\n" }), "ask_risky")).toMatchObject({
      risk: "risky",
      requiresApproval: true,
    });
    expect(classifyToolCall(call("write_stdin", { session_id: 7, chars: "" }), "ask_risky")).toMatchObject({
      risk: "safe",
      requiresApproval: false,
    });
  });

  it("requires approval for risky terminal stdin", () => {
    expect(classifyToolCall(call("write_stdin", { session_id: 7, chars: "rm -rf dist\n" }), "ask_risky")).toMatchObject({
      risk: "risky",
      requiresApproval: true,
    });
  });

  it("requires approval when a patch deletes a file", () => {
    expect(classifyToolCall(call("desktop_apply_patch", {
      patch: "*** Begin Patch\n*** Delete File: old.txt\n*** End Patch",
    }), "ask_risky")).toMatchObject({
      risk: "risky",
      requiresApproval: true,
    });
  });

  it("requires approval for risky argv terminal commands", () => {
    expect(classifyToolCall(call("exec_command", { argv: ["git", "push"] }), "ask_risky")).toMatchObject({
      risk: "risky",
      requiresApproval: true,
    });
  });

  it("allows localhost browser opens without approval", () => {
    expect(classifyToolCall(call("browser_open", { url: "localhost:5173" }), "ask_risky")).toMatchObject({
      risk: "safe",
      requiresApproval: false,
    });
  });

  it("requires approval for external browser opens", () => {
    expect(classifyToolCall(call("browser_open", { url: "https://example.com" }), "ask_risky")).toMatchObject({
      risk: "risky",
      requiresApproval: true,
    });
  });

  it("auto-approves external browser opens in yolo mode", () => {
    expect(classifyToolCall(call("browser_open", { url: "https://example.com" }), "yolo")).toMatchObject({
      risk: "risky",
      requiresApproval: false,
    });
  });

  it("requires approval for interactions on an external browser page", () => {
    expect(classifyToolCall(call("browser_trace", { action: "click", ref: "b1" }), "ask_risky", {
      browserCurrentPageRequiresApproval: true,
    })).toMatchObject({
      risk: "risky",
      requiresApproval: true,
    });
    expect(classifyToolCall(call("browser_open_link", { ref: "b2" }), "ask_risky", {
      browserCurrentPageRequiresApproval: true,
    })).toMatchObject({
      risk: "risky",
      requiresApproval: true,
    });
    expect(classifyToolCall(call("browser_open_link", { ref: "b2" }), "yolo", {
      browserCurrentPageRequiresApproval: true,
    })).toMatchObject({
      risk: "risky",
      requiresApproval: false,
    });
  });

  it("keeps read-only browser extraction safe", () => {
    expect(classifyToolCall(call("browser_extract", { mode: "main_text" }), "ask_risky", {
      browserCurrentPageRequiresApproval: true,
    })).toMatchObject({
      risk: "safe",
      requiresApproval: false,
    });
  });

  it("keeps PDF evidence safe and lets full access approve download actions", () => {
    expect(classifyToolCall(call("browser_pdf", { mode: "summary" }), "ask_risky")).toMatchObject({
      risk: "safe",
      requiresApproval: false,
    });
    expect(classifyToolCall(call("browser_downloads", { action: "allow_next" }), "ask_risky")).toMatchObject({
      risk: "risky",
      requiresApproval: true,
    });
    expect(classifyToolCall(call("browser_downloads", { action: "allow_next" }), "yolo")).toMatchObject({
      risk: "risky",
      requiresApproval: false,
    });
  });

  it("keeps Shields inspection safe and gates Shields changes outside full access", () => {
    expect(classifyToolCall(call("browser_shields", { action: "get" }), "ask_risky")).toMatchObject({
      risk: "safe",
      requiresApproval: false,
    });
    expect(classifyToolCall(call("browser_shields", { action: "toggle_site", enabled: false }), "ask_risky")).toMatchObject({
      risk: "risky",
      requiresApproval: true,
    });
    expect(classifyToolCall(call("browser_shields", { action: "toggle_site", enabled: false }), "yolo")).toMatchObject({
      risk: "risky",
      requiresApproval: false,
    });
  });

  it("guards external form workflows unless full access is active", () => {
    expect(classifyToolCall(call("browser_form_fill", { fields: [{ name: "email", value: "a@example.com" }] }), "ask_risky", {
      browserCurrentPageRequiresApproval: true,
    })).toMatchObject({
      risk: "risky",
      requiresApproval: true,
    });
    expect(classifyToolCall(call("browser_form_submit", { formId: "f1" }), "ask_risky")).toMatchObject({
      risk: "risky",
      requiresApproval: true,
    });
    expect(classifyToolCall(call("browser_form_submit", { formId: "f1" }), "yolo")).toMatchObject({
      risk: "risky",
      requiresApproval: false,
    });
    expect(classifyToolCall(call("browser_act", { action: "press", key: "Enter", text: "checkout" }), "yolo")).toMatchObject({
      risk: "risky",
      requiresApproval: false,
    });
  });

  it("guards workflow replay unless full access is active", () => {
    expect(classifyToolCall(call("browser_workflow", { action: "replay", workflowId: "wf1" }), "ask_risky")).toMatchObject({
      risk: "risky",
      requiresApproval: true,
    });
    expect(classifyToolCall(call("browser_workflow", { action: "replay", workflowId: "wf1" }), "yolo")).toMatchObject({
      risk: "risky",
      requiresApproval: false,
    });
    expect(classifyToolCall(call("browser_evidence_vault", { action: "save_current" }), "ask_risky")).toMatchObject({
      risk: "safe",
      requiresApproval: false,
    });
  });

  it("guards note saves and deletes unless full access is active", () => {
    expect(classifyToolCall(call("notes_create", { title: "Plan" }), "ask_risky")).toMatchObject({
      risk: "safe",
      requiresApproval: false,
    });
    expect(classifyToolCall(call("notes_update", { noteId: "n1", content: "draft" }), "ask_risky")).toMatchObject({
      risk: "safe",
      requiresApproval: false,
    });
    expect(classifyToolCall(call("notes_save", { noteId: "n1", filePath: "D:\\Notes\\plan.md" }), "ask_risky")).toMatchObject({
      risk: "risky",
      requiresApproval: true,
    });
    expect(classifyToolCall(call("notes_delete", { noteId: "n1" }), "ask_risky")).toMatchObject({
      risk: "risky",
      requiresApproval: true,
    });
    expect(classifyToolCall(call("notes_save", { noteId: "n1" }), "yolo")).toMatchObject({
      risk: "risky",
      requiresApproval: false,
    });
  });

  it("keeps read-only Computer Use inspection safe", () => {
    expect(classifyToolCall(call("computer_capabilities"), "ask_risky")).toMatchObject({
      risk: "safe",
      requiresApproval: false,
    });
    expect(classifyToolCall(call("computer_list_windows"), "ask_risky")).toMatchObject({
      risk: "safe",
      requiresApproval: false,
    });
    expect(classifyToolCall(call("computer_find_apps", { query: "notepad" }), "ask_risky")).toMatchObject({
      risk: "safe",
      requiresApproval: false,
    });
    expect(classifyToolCall(call("computer_snapshot", { windowId: "123" }), "ask_risky")).toMatchObject({
      risk: "safe",
      requiresApproval: false,
    });
  });

  it("requires approval for native desktop control unless full access is active", () => {
    expect(classifyToolCall(call("computer_act", { action: "click", ref: "c2" }), "ask_risky")).toMatchObject({
      risk: "risky",
      requiresApproval: true,
    });
    expect(classifyToolCall(call("computer_open_app", { app: "notepad.exe" }), "ask_risky")).toMatchObject({
      risk: "risky",
      requiresApproval: true,
    });
    expect(classifyToolCall(call("computer_trace", { action: "click", ref: "c2" }), "yolo")).toMatchObject({
      risk: "risky",
      requiresApproval: false,
    });
  });

  it("hard-blocks sensitive Computer Use actions even in full access", () => {
    expect(classifyToolCall(call("computer_act", { action: "type", text: "password: hunter2" }), "yolo")).toMatchObject({
      risk: "blocked",
      requiresApproval: false,
    });
    expect(classifyToolCall(call("computer_trace", { action: "click", text: "confirm transfer" }), "yolo")).toMatchObject({
      risk: "blocked",
      requiresApproval: false,
    });
    expect(classifyToolCall(call("computer_clipboard", { action: "set_text", text: "api_key=sk-test" }), "yolo")).toMatchObject({
      risk: "blocked",
      requiresApproval: false,
    });
  });

  it("matches reusable workspace tool approval scopes", () => {
    const scope = approvalScope({ kind: "tool_workspace", toolName: "desktop_delete_path" });
    expect(findMatchingApprovalScope(call("desktop_delete_path", { path: "old.txt" }), [scope])).toBe(scope);
    expect(findMatchingApprovalScope(call("desktop_rename_path", { fromPath: "a", toPath: "b" }), [scope])).toBeNull();
  });

  it("ignores expired approval scopes", () => {
    const scope = approvalScope({
      kind: "tool_workspace",
      toolName: "desktop_delete_path",
      expiresAt: Date.now() - 1,
    });
    expect(findMatchingApprovalScope(call("desktop_delete_path", { path: "old.txt" }), [scope])).toBeNull();
  });

  it("ignores exhausted approval scopes", () => {
    const scope = approvalScope({
      kind: "tool_workspace",
      toolName: "desktop_delete_path",
      useCount: 3,
      maxUses: 3,
    });
    expect(findMatchingApprovalScope(call("desktop_delete_path", { path: "old.txt" }), [scope])).toBeNull();
  });

  it("never reuses approval scopes for terminal commands", () => {
    const terminalCall = call("exec_command", { cmd: "npm install lodash", workdir: "apps/desktop" });
    const scope = approvalScope({
      kind: "terminal_prefix",
      commandPrefix: approvalCommandPrefix(terminalCall),
      cwd: "apps/desktop",
    });
    expect(findMatchingApprovalScope(terminalCall, [scope])).toBeNull();
    expect(findMatchingApprovalScope(call("exec_command", { cmd: "npm installer", workdir: "apps/desktop" }), [scope])).toBeNull();
    expect(findMatchingApprovalScope(call("exec_command", { cmd: "npm install lodash", workdir: "other" }), [scope])).toBeNull();
  });

  it("stores exact terminal command text but never reuses it", () => {
    const terminalCall = call("exec_command", { argv: ["npm", "install", "lodash"], workdir: "apps/desktop" });
    const scope = approvalScope({
      kind: "terminal_prefix",
      commandPrefix: approvalCommandPrefix(terminalCall),
      cwd: "apps/desktop",
    });
    expect(scope.commandPrefix).toBe("npm install lodash");
    expect(findMatchingApprovalScope(terminalCall, [scope])).toBeNull();
    expect(findMatchingApprovalScope(call("exec_command", { argv: ["npm", "installer"], workdir: "apps/desktop" }), [scope])).toBeNull();
    expect(findMatchingApprovalScope(call("exec_command", { argv: ["npm", "install", "lodash"], workdir: "other" }), [scope])).toBeNull();
  });
});

const approvalScope = (patch: Partial<ApprovalScopeRecord>): ApprovalScopeRecord => ({
  id: "scope",
  workspaceId: "workspace",
  kind: "tool_workspace",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  useCount: 0,
  ...patch,
});
