import type { ProviderMessage } from "../../providers/types";

const MAX_RECOVERY_NUDGES = 2;

export const historyHasRecentToolResults = (history: ProviderMessage[]) =>
  history.slice(-3).some((message) => message.parts?.some((part) => part.type === "function_response"));

export const resolveNoToolOutcome = (input: {
  iterationText: string;
  iterationThought: string;
  afterToolResults: boolean;
  recoveryAttempts: number;
}): { action: "recover"; message: string } | { action: "complete" } => {
  const text = input.iterationText.trim();
  const thought = input.iterationThought.trim();
  if (text) return { action: "complete" };
  if (input.recoveryAttempts >= MAX_RECOVERY_NUDGES) return { action: "complete" };
  if (input.afterToolResults) {
    return {
      action: "recover",
      message: "The last provider turn ended after tool results without visible assistant text or another tool call. Continue from the completed tool results and either call the next needed tool or provide the final user-facing answer.",
    };
  }
  if (thought) {
    return {
      action: "recover",
      message: "The last provider turn produced reasoning but no visible assistant text or tool call. Continue from the current turn state and either call a desktop tool or provide the final user-facing answer.",
    };
  }
  return {
    action: "recover",
    message: "The last provider turn ended without visible assistant text or tool calls. Continue from the current conversation state and either call a desktop tool or provide the final user-facing answer.",
  };
};
