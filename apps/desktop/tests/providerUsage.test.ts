import { describe, expect, it } from "vitest";
import { normalizeProviderUsage } from "../src/main/agent/providers/usage";

describe("provider usage normalization", () => {
  it("normalizes OpenAI/CLIProxy Responses-style usage", () => {
    expect(normalizeProviderUsage({
      input_tokens: 100,
      output_tokens: 30,
      total_tokens: 130,
      input_token_details: { cached_tokens: 12 },
      output_token_details: { reasoning_tokens: 7 },
    })).toEqual({
      inputTokens: 100,
      cachedInputTokens: 12,
      outputTokens: 30,
      reasoningOutputTokens: 7,
      totalTokens: 130,
    });
  });

  it("normalizes OpenRouter chat-completions usage", () => {
    expect(normalizeProviderUsage({
      prompt_tokens: 80,
      completion_tokens: 20,
      total_tokens: 100,
      prompt_tokens_details: { cached_tokens: 5 },
      completion_tokens_details: { reasoning_tokens: 3 },
    })).toMatchObject({
      inputTokens: 80,
      cachedInputTokens: 5,
      outputTokens: 20,
      reasoningOutputTokens: 3,
      totalTokens: 100,
    });
  });

  it("normalizes Gemini usage metadata", () => {
    expect(normalizeProviderUsage({
      promptTokenCount: 120,
      candidatesTokenCount: 24,
      thoughtsTokenCount: 11,
      cachedContentTokenCount: 6,
      totalTokenCount: 155,
    })).toEqual({
      inputTokens: 120,
      cachedInputTokens: 6,
      outputTokens: 24,
      reasoningOutputTokens: 11,
      totalTokens: 155,
    });
  });

  it("ignores empty or unknown usage payloads", () => {
    expect(normalizeProviderUsage(null)).toBeNull();
    expect(normalizeProviderUsage({ nope: true })).toBeNull();
  });
});
