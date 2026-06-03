import { describe, expect, it } from "vitest";
import { normalizeOpenRouterError, parseOpenRouterAffordableOutputTokens } from "../src/main/agent/providers/openrouter";

describe("OpenRouter error normalization", () => {
  it("explains credit limit max_tokens failures without dumping provider JSON", () => {
    const message = normalizeOpenRouterError(JSON.stringify({
      error: {
        message: "This request requires more credits, or fewer max_tokens. You requested up to 65536 tokens, but can only afford 9234.",
        code: 402,
      },
    }));

    expect(message).toContain("can only afford 9,234 output tokens");
    expect(message).toContain("65,536");
    expect(message).not.toContain("{\"error\"");
  });

  it("extracts the affordable output limit from OpenRouter errors", () => {
    expect(parseOpenRouterAffordableOutputTokens(JSON.stringify({
      error: {
        message: "This request requires more credits, or fewer max_tokens. You requested up to 4,096 tokens, but can only afford 1,050.",
        code: 402,
      },
    }))).toEqual({
      requested: 4_096,
      affordable: 1_050,
    });
  });
});
