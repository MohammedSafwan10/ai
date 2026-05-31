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
    expect(classifyToolCall(call("desktop_spawn_process", { command: "npm install && npm run build" }), "ask_risky")).toMatchObject({
      risk: "risky",
      requiresApproval: true,
    });
  });

  it("requires approval for risky terminal stdin", () => {
    expect(classifyToolCall(call("desktop_write_process", { processId: 7, input: "rm -rf dist\n" }), "ask_risky")).toMatchObject({
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
    expect(classifyToolCall(call("desktop_spawn_process", { argv: ["git", "push"] }), "ask_risky")).toMatchObject({
      risk: "risky",
      requiresApproval: true,
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

  it("matches terminal command prefixes on command boundaries", () => {
    const terminalCall = call("desktop_spawn_process", { command: "npm install lodash", cwd: "apps/desktop" });
    const scope = approvalScope({
      kind: "terminal_prefix",
      commandPrefix: approvalCommandPrefix(terminalCall),
      cwd: "apps/desktop",
    });
    expect(findMatchingApprovalScope(terminalCall, [scope])).toBe(scope);
    expect(findMatchingApprovalScope(call("desktop_spawn_process", { command: "npm installer", cwd: "apps/desktop" }), [scope])).toBeNull();
    expect(findMatchingApprovalScope(call("desktop_spawn_process", { command: "npm install lodash", cwd: "other" }), [scope])).toBeNull();
  });

  it("matches terminal argv prefixes on argv boundaries", () => {
    const terminalCall = call("desktop_spawn_process", { argv: ["npm", "install", "lodash"], cwd: "apps/desktop" });
    const scope = approvalScope({
      kind: "terminal_prefix",
      commandPrefix: approvalCommandPrefix(terminalCall),
      cwd: "apps/desktop",
    });
    expect(scope.commandPrefix).toBe("npm install");
    expect(findMatchingApprovalScope(terminalCall, [scope])).toBe(scope);
    expect(findMatchingApprovalScope(call("desktop_spawn_process", { argv: ["npm", "installer"], cwd: "apps/desktop" }), [scope])).toBeNull();
    expect(findMatchingApprovalScope(call("desktop_spawn_process", { argv: ["npm", "install", "lodash"], cwd: "other" }), [scope])).toBeNull();
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
