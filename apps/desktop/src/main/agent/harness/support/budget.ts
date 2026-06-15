import type { ModelRuntimeBudgetMode } from "../../../../shared/models";
import type { StartTurnInput } from "../../../../shared/types";
import type { ProviderMessage } from "../../providers/types";

export const runtimeBudgetModeForTurn = (
  input: Pick<StartTurnInput, "prompt" | "contextMentions">,
): ModelRuntimeBudgetMode => {
  if (input.contextMentions?.some((mention) => mention.type === "folder")) return "large_context";
  return /\b(whole|entire|full|all)\s+(repo|repository|workspace|project|codebase)\b/i.test(input.prompt)
    ? "large_context"
    : "normal";
};

export const runtimeBudgetModeForHistory = (history: ProviderMessage[]): ModelRuntimeBudgetMode =>
  history.some((message) => /<attached_folder\b|\b(whole|entire|full|all)\s+(repo|repository|workspace|project|codebase)\b/i.test(message.content || ""))
    ? "large_context"
    : "normal";
