import type { ModelRuntimeBudget } from "../../../../shared/models";
import type { ContextUsageRecord, TokenUsageRecord } from "../../../../shared/types";
import type { ProviderMessage } from "../../providers/types";
import { emptyTokenUsage } from "../../providers/usage";
import { estimateProviderHistoryTokens } from "../../context";

export const autoCompactThresholdTokens = (budget: ModelRuntimeBudget) => {
  const inputThreshold = budget.inputBudgetTokens ? Math.floor(budget.inputBudgetTokens * 0.9) : undefined;
  const hardThreshold = budget.hardInputBudgetTokens ? Math.floor(budget.hardInputBudgetTokens * 0.92) : undefined;
  if (inputThreshold && hardThreshold) return Math.min(inputThreshold, hardThreshold);
  return inputThreshold ?? hardThreshold;
};

export const autoCompactTargetTokens = (budget: ModelRuntimeBudget) => {
  const threshold = autoCompactThresholdTokens(budget);
  if (!threshold) return budget.inputBudgetTokens;
  return Math.max(8_000, Math.floor(threshold * 0.82));
};

export const shouldAutoCompactHistory = (
  history: ProviderMessage[],
  budget: ModelRuntimeBudget,
  lastUsage?: TokenUsageRecord | null,
) => {
  const threshold = autoCompactThresholdTokens(budget);
  if (!threshold) return false;
  const measuredContext = lastUsage ? lastUsage.inputTokens + lastUsage.outputTokens : 0;
  return Math.max(estimateProviderHistoryTokens(history), measuredContext) > threshold;
};

export const calculateContextUsage = (input: {
  threadId: string;
  modelId: string;
  history: ProviderMessage[];
  budget: ModelRuntimeBudget;
  lastUsage?: TokenUsageRecord | null;
  totalUsage?: TokenUsageRecord | null;
}): ContextUsageRecord => {
  const estimatedTokens = estimateProviderHistoryTokens(input.history);
  const lastUsage = input.lastUsage || estimatedTokenUsage(estimatedTokens);
  const totalUsage = input.totalUsage || lastUsage;
  const usedTokens = input.lastUsage
    ? Math.max(estimatedTokens, lastUsage.inputTokens + lastUsage.outputTokens)
    : estimatedTokens;
  const remainingTokens = input.budget.inputBudgetTokens === undefined
    ? undefined
    : Math.max(0, input.budget.inputBudgetTokens - usedTokens);
  const remainingPercent = contextRemainingPercent(usedTokens, input.budget.inputBudgetTokens);

  return {
    threadId: input.threadId,
    modelId: input.modelId,
    contextWindowTokens: input.budget.contextWindowTokens,
    usedTokens,
    inputBudgetTokens: input.budget.inputBudgetTokens,
    remainingTokens,
    remainingPercent,
    outputReserveTokens: input.budget.outputTokens,
    safetyReserveTokens: input.budget.safetyReserveTokens,
    autoCompactAtTokens: autoCompactThresholdTokens(input.budget),
    budgetMode: input.budget.mode,
    estimated: !input.lastUsage,
    lastTokenUsage: lastUsage,
    totalTokenUsage: totalUsage,
    updatedAt: Date.now(),
  };
};

export const addTokenUsage = (left?: TokenUsageRecord | null, right?: TokenUsageRecord | null): TokenUsageRecord => {
  const a = left || emptyTokenUsage();
  const b = right || emptyTokenUsage();
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    reasoningOutputTokens: a.reasoningOutputTokens + b.reasoningOutputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
};

const estimatedTokenUsage = (tokens: number): TokenUsageRecord => ({
  inputTokens: tokens,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: tokens,
});

const contextRemainingPercent = (usedTokens: number, inputBudgetTokens?: number) => {
  if (!inputBudgetTokens || inputBudgetTokens <= 0) return undefined;
  return Math.max(0, Math.min(100, Math.round(((inputBudgetTokens - usedTokens) / inputBudgetTokens) * 100)));
};
