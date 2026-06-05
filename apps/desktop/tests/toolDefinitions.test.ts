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
});
