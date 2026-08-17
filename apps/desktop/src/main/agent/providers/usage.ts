import type { TokenUsageRecord } from "../../../shared/types";

export const emptyTokenUsage = (): TokenUsageRecord => ({
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 0,
});

export const normalizeProviderUsage = (value: unknown): TokenUsageRecord | null => {
  if (!value || typeof value !== "object") return null;
  const usage = value as Record<string, unknown>;
  const inputTokens = numberFrom(
    usage.input_tokens,
    usage.prompt_tokens,
    usage.promptTokenCount,
    usage.totalInputTokens,
    usage.total_input_tokens,
  );
  const cachedInputTokens = numberFrom(
    usage.cached_input_tokens,
    (usage.input_token_details as Record<string, unknown> | undefined)?.cached_tokens,
    (usage.prompt_tokens_details as Record<string, unknown> | undefined)?.cached_tokens,
    usage.cachedContentTokenCount,
    usage.total_cached_tokens,
  );
  const outputTokens = numberFrom(
    usage.output_tokens,
    usage.completion_tokens,
    usage.candidatesTokenCount,
    usage.totalOutputTokens,
    usage.total_output_tokens,
  );
  const reasoningOutputTokens = numberFrom(
    usage.reasoning_output_tokens,
    (usage.output_token_details as Record<string, unknown> | undefined)?.reasoning_tokens,
    (usage.completion_tokens_details as Record<string, unknown> | undefined)?.reasoning_tokens,
    usage.thoughtsTokenCount,
    usage.total_thought_tokens,
  );
  const totalTokens = numberFrom(
    usage.total_tokens,
    usage.totalTokenCount,
    usage.totalTokens,
  ) || inputTokens + outputTokens;

  if (inputTokens === 0 && outputTokens === 0 && totalTokens === 0) return null;
  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens,
    totalTokens,
  };
};

const numberFrom = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.floor(value));
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Math.max(0, Math.floor(Number(value)));
    }
  }
  return 0;
};
