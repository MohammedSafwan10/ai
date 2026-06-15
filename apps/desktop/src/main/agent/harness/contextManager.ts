import type { DesktopStore } from "../../db/store";
import type { ProviderMessage } from "../providers/types";
import {
  buildProviderHistory,
  buildProviderHistoryWithCompaction,
  compactToolResultForModel,
  estimateProviderHistoryTokens,
  sanitizeProviderHistoryForModel,
} from "../context";
import type { ModelRuntimeBudget } from "../../../shared/models";
import type { ToolResult } from "../../../shared/types";

export class ContextManager {
  constructor(private store: DesktopStore) {}

  buildHistory(threadId: string, assistantMessageId: string, messageCharLimit?: number) {
    return buildProviderHistory(this.store, threadId, assistantMessageId, messageCharLimit);
  }

  buildHistoryWithCompaction(threadId: string, assistantMessageId: string, messageCharLimit?: number) {
    return buildProviderHistoryWithCompaction(this.store, threadId, assistantMessageId, messageCharLimit);
  }

  sanitize(history: ProviderMessage[], modelId: string) {
    return sanitizeProviderHistoryForModel(history, modelId);
  }

  estimateTokens(history: ProviderMessage[]) {
    return estimateProviderHistoryTokens(history);
  }

  compactToolResult<T extends ToolResult>(result: T, budget: ModelRuntimeBudget) {
    return compactToolResultForModel(result, budget);
  }
}

