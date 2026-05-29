import { describe, expect, it } from "vitest";
import { classifyToolCall } from "../src/main/agent/tools/permissions";
import type { DesktopToolCall } from "../src/shared/types";

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
    expect(classifyToolCall(call("desktop_exec_command", { command: "npm install && npm run build" }), "ask_risky")).toMatchObject({
      risk: "risky",
      requiresApproval: true,
    });
  });

  it("requires approval for risky terminal stdin", () => {
    expect(classifyToolCall(call("desktop_write_stdin", { processId: 7, input: "rm -rf dist\n" }), "ask_risky")).toMatchObject({
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
});
