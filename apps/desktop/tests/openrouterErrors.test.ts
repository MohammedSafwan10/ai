import { describe, expect, it } from "vitest";
import { normalizeOpenRouterError } from "../src/main/agent/providers/openrouter";

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
});
