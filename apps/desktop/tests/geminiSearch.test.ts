import { describe, expect, it } from "vitest";
import {
  applyGeminiGroundingCitations,
  geminiToolConfigForModel,
  geminiToolsForModel,
  normalizeGeminiError,
  supportsGeminiGoogleSearch,
  toGeminiContents,
  toGeminiInteractionInput,
} from "../src/main/agent/providers/gemini";

describe("Gemini native Google Search", () => {
  it("adds Google Search for current Gemini models while keeping function tools", () => {
    const tools = geminiToolsForModel("gemini-3.6-flash", "default");

    expect(tools.some((tool) => "functionDeclarations" in tool)).toBe(true);
    expect(tools).toContainEqual({ googleSearch: {} });
  });

  it("enables server-side tool context and validated function calling when combining Search with desktop tools", () => {
    expect(geminiToolConfigForModel("gemini-3.6-flash")).toEqual({
      functionCallingConfig: { mode: "VALIDATED" },
      includeServerSideToolInvocations: true,
    });
    expect(geminiToolConfigForModel("gemini-1.5-flash")).toEqual({
      functionCallingConfig: { mode: "AUTO" },
    });
  });

  it("preserves function IDs and server-side Search context between tool turns", () => {
    expect(toGeminiContents([{
      role: "assistant",
      content: "",
      parts: [
        { type: "server_tool_call", id: "search-1", toolType: "GOOGLE_SEARCH_WEB", arguments: { query: "Gemini 3.6" } },
        { type: "server_tool_response", id: "search-1", toolType: "GOOGLE_SEARCH_WEB", response: { result: "Found" } },
        { type: "function_call", id: "call-1", name: "read_file", arguments: { path: "README.md" } },
      ],
    }, {
      role: "user",
      content: "",
      parts: [{ type: "function_response", id: "call-1", name: "read_file", response: { success: true, output: "ok" } }],
    }])).toEqual([{
      role: "model",
      parts: [
        { toolCall: { id: "search-1", toolType: "GOOGLE_SEARCH_WEB", args: { query: "Gemini 3.6" } } },
        { toolResponse: { id: "search-1", toolType: "GOOGLE_SEARCH_WEB", response: { result: "Found" } } },
        { functionCall: { id: "call-1", name: "read_file", args: { path: "README.md" } } },
      ],
    }, {
      role: "user",
      parts: [{ functionResponse: { id: "call-1", name: "read_file", response: { success: true, output: "ok" } } }],
    }]);
  });

  it("maps local history to stateless Interactions turns and tool steps", () => {
    expect(toGeminiInteractionInput([{
      role: "assistant",
      content: "",
      parts: [
        { type: "text", text: "Checking." },
        { type: "function_call", id: "call-1", name: "desktop_read_file", arguments: { path: "README.md" } },
      ],
    }, {
      role: "user",
      content: "",
      parts: [{ type: "function_response", id: "call-1", name: "desktop_read_file", response: { success: true, output: "ok" } }],
    }])).toEqual([
      { role: "model", content: [{ type: "text", text: "Checking." }] },
      { type: "function_call", id: "call-1", name: "desktop_read_file", arguments: { path: "README.md" } },
      {
        type: "function_result",
        call_id: "call-1",
        name: "desktop_read_file",
        is_error: false,
        result: [{ type: "text", text: JSON.stringify({ success: true, output: "ok" }) }],
      },
    ]);
  });

  it("turns nested Gemini key errors into an actionable message", () => {
    const error = new Error(JSON.stringify({
      error: {
        message: JSON.stringify({ error: { message: "API key not valid. Please pass a valid API key." } }),
      },
    }));
    expect(normalizeGeminiError(error)).toContain("Replace it in Settings > Providers");
  });

  it("does not add Google Search for older legacy Gemini models", () => {
    expect(supportsGeminiGoogleSearch("gemini-1.5-flash")).toBe(false);
    expect(geminiToolsForModel("gemini-1.5-flash", "default")).not.toContainEqual({ googleSearch: {} });
  });

  it("inserts grounding citations at supported text offsets", () => {
    const cited = applyGeminiGroundingCitations("Privora shipped today.", {
      groundingChunks: [
        { web: { uri: "https://example.com/release", title: "Release notes" } },
      ],
      groundingSupports: [
        {
          segment: { endIndex: "Privora shipped today.".length },
          groundingChunkIndices: [0],
        },
      ],
    });

    expect(cited).toBe("Privora shipped today.[1](https://example.com/release)");
  });

  it("keeps Gemini grounding query metadata available for web search UI", () => {
    const cited = applyGeminiGroundingCitations("The docs are live.", {
      webSearchQueries: ["Gemini Google Search grounding"],
      groundingChunks: [
        { web: { uri: "https://ai.google.dev/gemini-api/docs/google-search", title: "Google Search grounding" } },
      ],
      groundingSupports: [],
    });

    expect(cited).toContain("Sources:");
    expect(cited).toContain("https://ai.google.dev/gemini-api/docs/google-search");
  });
});
