import { describe, expect, it } from "vitest";
import { desktopToolDefinitions, parseDesktopToolCall } from "../src/main/agent/tools/definitions";

describe("desktop tool definitions", () => {
  it("exposes git tools to the model", () => {
    const names = desktopToolDefinitions.map((tool) => tool.name);
    expect(names).toContain("desktop_edit_file");
    expect(names).toContain("desktop_git_status");
    expect(names).toContain("desktop_git_diff");
    expect(names).toContain("browser_open");
    expect(names).toContain("browser_trace");
    expect(names).toContain("browser_verify");
    expect(names).toContain("browser_extract");
    expect(names).toContain("browser_wait");
    expect(names).toContain("browser_screenshot");
    expect(names).toContain("browser_evidence");
    expect(names).toContain("browser_search");
    expect(names).toContain("browser_tab");
    expect(names).toContain("browser_downloads");
    expect(names).toContain("browser_pdf");
    expect(names).toContain("browser_form_analyze");
    expect(names).toContain("browser_form_fill");
    expect(names).toContain("browser_form_validate");
    expect(names).toContain("browser_form_submit");
    expect(names).toContain("browser_capabilities");
    expect(names).toContain("browser_workflow");
    expect(names).toContain("browser_assert");
    expect(names).toContain("browser_evidence_vault");
    expect(names).toContain("browser_diagnose");
    expect(names).toContain("computer_capabilities");
    expect(names).toContain("computer_list_windows");
    expect(names).toContain("computer_find_apps");
    expect(names).toContain("computer_snapshot");
    expect(names).toContain("computer_act");
    expect(names).toContain("computer_trace");
    expect(names).toContain("computer_verify");
    expect(names).toContain("computer_stop");
  });

  it("parses subagent tool calls", () => {
    const call = parseDesktopToolCall(
      "spawn_agent",
      JSON.stringify({
        taskName: "smoke_test",
        message: "Inspect the selected workspace and report available tools/status.",
        agentType: "tester",
      }),
      "call-subagent-1",
    );

    expect(call).toMatchObject({
      id: "call-subagent-1",
      name: "spawn_agent",
      arguments: {
        taskName: "smoke_test",
        message: "Inspect the selected workspace and report available tools/status.",
        agentType: "tester",
      },
    });
  });

  it("parses browser workflow and capability tool calls", () => {
    expect(parseDesktopToolCall("browser_capabilities", "{}", "call-capabilities")).toMatchObject({
      id: "call-capabilities",
      name: "browser_capabilities",
      arguments: {},
    });
    expect(parseDesktopToolCall(
      "browser_workflow",
      JSON.stringify({ action: "start_recording", name: "Smoke" }),
      "call-workflow",
    )).toMatchObject({
      id: "call-workflow",
      name: "browser_workflow",
      arguments: { action: "start_recording", name: "Smoke" },
    });
  });

  it("parses Computer Use tool calls", () => {
    expect(parseDesktopToolCall(
      "computer_trace",
      JSON.stringify({ action: "click", ref: "c1", includeScreenshot: true }),
      "call-computer",
    )).toMatchObject({
      id: "call-computer",
      name: "computer_trace",
      arguments: { action: "click", ref: "c1", includeScreenshot: true },
    });
  });
});
