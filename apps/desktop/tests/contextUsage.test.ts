import { describe, expect, it } from "vitest";
import { compactProviderHistoryWithInfo } from "../src/main/agent/context";
import {
  autoCompactTargetTokens,
  autoCompactThresholdTokens,
  calculateContextUsage,
  shouldAutoCompactHistory,
} from "../src/main/agent/harness/support/contextUsage";
import type { ProviderMessage } from "../src/main/agent/providers/types";
import type { TokenUsageRecord } from "../src/shared/types";
import { resolveModelRuntimeBudget } from "../src/shared/models";

const usage = (inputTokens: number, outputTokens: number, reasoningOutputTokens = 0): TokenUsageRecord => ({
  inputTokens,
  cachedInputTokens: 0,
  outputTokens,
  reasoningOutputTokens,
  totalTokens: inputTokens + outputTokens,
});

const historyWithChars = (chars: number): ProviderMessage[] => [
  { role: "user", content: "x".repeat(chars), parts: [{ type: "text", text: "x".repeat(chars) }] },
];

const repeatedHistory = (count: number, chars: number): ProviderMessage[] =>
  Array.from({ length: count }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `message ${index} ${"x".repeat(chars)}`,
    parts: [{ type: "text", text: `message ${index} ${"x".repeat(chars)}` }],
  }));

describe("desktop context usage", () => {
  it("calculates remaining context against the model's usable input budget", () => {
    const budget = resolveModelRuntimeBudget("gpt-5.6-sol", "normal");
    const result = calculateContextUsage({
      threadId: "thread",
      modelId: "gpt-5.6-sol",
      history: historyWithChars(100),
      budget,
      lastUsage: usage(112_000, 8_000),
    });

    expect(result.estimated).toBe(false);
    expect(result.usedTokens).toBe(120_000);
    expect(result.remainingPercent).toBe(88);
    expect(result.inputBudgetTokens).toBe(986_500);
    expect(result.remainingTokens).toBe(866_500);
    expect(result.outputReserveTokens).toBe(32_000);
  });

  it("falls back to estimated history tokens when provider usage is missing", () => {
    const budget = resolveModelRuntimeBudget("gemini-3.7-flash", "normal");
    const result = calculateContextUsage({
      threadId: "thread",
      modelId: "gemini-3.7-flash",
      history: historyWithChars(40_000),
      budget,
    });

    expect(result.estimated).toBe(true);
    expect(result.usedTokens).toBeGreaterThanOrEqual(10_000);
    expect(result.lastTokenUsage.totalTokens).toBe(result.usedTokens);
  });

  it("sets a 1M-model auto-compact threshold around its real usable input budget", () => {
    const budget = resolveModelRuntimeBudget("gpt-5.6-sol", "normal");

    expect(budget.inputBudgetTokens).toBe(986_500);
    expect(autoCompactThresholdTokens(budget)).toBe(887_850);
    expect(autoCompactTargetTokens(budget)).toBe(728_037);
  });

  it("detects oversized history and compacts it before the hard cap", () => {
    const budget = resolveModelRuntimeBudget("gpt-5.6-sol", "normal");
    const history = repeatedHistory(50, 80_000);

    expect(shouldAutoCompactHistory(history, budget)).toBe(true);

    const compacted = compactProviderHistoryWithInfo(history, autoCompactTargetTokens(budget));
    expect(compacted.beforeTokens).toBeGreaterThan(compacted.afterTokens);
    expect(compacted.compacted).toBe(true);
    expect(compacted.history[0]?.content).toContain("Conversation summary before recent context");
  });

  it("uses exact provider usage when schemas and system instructions exceed the text estimate", () => {
    const budget = resolveModelRuntimeBudget("gpt-5.6-sol", "normal");
    const shortHistory = historyWithChars(1_000);

    expect(shouldAutoCompactHistory(shortHistory, budget)).toBe(false);
    expect(shouldAutoCompactHistory(shortHistory, budget, usage(900_000, 1_000))).toBe(true);
  });
});
