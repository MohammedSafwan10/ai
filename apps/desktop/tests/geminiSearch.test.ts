import { describe, expect, it } from "vitest";
import {
  applyGeminiGroundingCitations,
  geminiToolsForModel,
  supportsGeminiGoogleSearch,
} from "../src/main/agent/providers/gemini";

describe("Gemini native Google Search", () => {
  it("adds Google Search for current Gemini models while keeping function tools", () => {
    const tools = geminiToolsForModel("gemini-3.5-flash", "default");

    expect(tools.some((tool) => "functionDeclarations" in tool)).toBe(true);
    expect(tools).toContainEqual({ googleSearch: {} });
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
