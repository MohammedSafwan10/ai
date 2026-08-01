import { describe, expect, it } from "vitest";
import { cliproxyToolsForModel, webSearchEventFromResponse } from "../src/main/agent/providers/cliproxy";

describe("CLIProxy hosted web search", () => {
  it("sends hosted web search beside desktop function tools", () => {
    const tools = cliproxyToolsForModel("gpt-5.6-sol", "default");

    expect(tools.some((tool) => tool.type === "function" && "name" in tool && tool.name === "desktop_read_file")).toBe(true);
    expect(tools).toContainEqual({
      type: "web_search",
      external_web_access: true,
      search_content_types: ["text", "image"],
    });
  });

  it("keeps Plan Mode filtering for desktop tools without disabling search", () => {
    const tools = cliproxyToolsForModel("gpt-5.6-terra", "plan");

    expect(tools.some((tool) => tool.type === "function" && "name" in tool && tool.name === "request_user_input")).toBe(true);
    expect(tools).toContainEqual(expect.objectContaining({ type: "web_search" }));
  });

  it("maps Responses web search calls into live UI events", () => {
    const event = webSearchEventFromResponse("response.output_item.done", {
      item: {
        id: "ws_123",
        type: "web_search_call",
        status: "completed",
        action: { type: "search", query: "OpenAI official website" },
      },
    });

    expect(event).toEqual({
      id: "ws_123",
      status: "done",
      query: "OpenAI official website",
      title: "Searched web",
      output: "Searched web for OpenAI official website",
    });
  });
});
