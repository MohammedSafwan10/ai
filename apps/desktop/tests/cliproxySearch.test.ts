import { describe, expect, it } from "vitest";
import { cliproxyToolsForModel } from "../src/main/agent/providers/cliproxy";

describe("CLIProxy hosted web search", () => {
  it("sends hosted web search beside desktop function tools", () => {
    const tools = cliproxyToolsForModel("gpt-5.5", "default");

    expect(tools.some((tool) => tool.type === "function" && "name" in tool && tool.name === "desktop_read_file")).toBe(true);
    expect(tools).toContainEqual({
      type: "web_search",
      external_web_access: true,
      search_content_types: ["text", "image"],
    });
  });

  it("keeps Plan Mode filtering for desktop tools without disabling search", () => {
    const tools = cliproxyToolsForModel("gemini-3.5-flash-cliproxy", "plan");

    expect(tools.some((tool) => tool.type === "function" && "name" in tool && tool.name === "request_user_input")).toBe(true);
    expect(tools).toContainEqual(expect.objectContaining({ type: "web_search" }));
  });
});
