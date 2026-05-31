import { describe, expect, it } from "vitest";
import { desktopToolDefinitions } from "../src/main/agent/tools/definitions";

describe("desktop tool definitions", () => {
  it("exposes git tools to the model", () => {
    const names = desktopToolDefinitions.map((tool) => tool.name);
    expect(names).toContain("desktop_edit_file");
    expect(names).toContain("desktop_git_status");
    expect(names).toContain("desktop_git_diff");
  });
});
