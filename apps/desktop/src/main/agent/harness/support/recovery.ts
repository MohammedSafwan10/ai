import type { ProviderMessage } from "../../providers/types";

const MAX_RECOVERY_NUDGES = 2;

export const historyHasRecentToolResults = (history: ProviderMessage[]) =>
  history.slice(-3).some((message) => message.parts?.some((part) => part.type === "function_response"));

export const resolveNoToolOutcome = (input: {
  iterationText: string;
  iterationThought: string;
  afterToolResults: boolean;
  recoveryAttempts: number;
}): { action: "recover" | "incomplete"; message: string } | { action: "complete" } => {
  const text = input.iterationText.trim();
  const thought = input.iterationThought.trim();
  // A promised follow-up after tool results is not evidence of completed work.
  // Restrict this to an explicit trailing action; ordinary final answers and
  // offers such as "let me know" must still finish normally.
  const promisedAction = /(?:^|[.!?\n]\s*)(?:let me|i['’]ll|i will)\s+(?!know\b|not\b)[^.!?\n]{0,80}\b(?:re-?run|run|retry|check|verify|inspect|fetch|write|save|execute|collect|compare)\b[^.!?\n]{0,180}[.!]?\s*$/i.test(text);
  // Models also announce a tool with "Starting ...:" or "Generating ...:".
  // Require the unfinished colon ending, so completed progress summaries stay final.
  const announcedAction = /(?:^|[.!?\n—]\s*)(?:now\s+)?(?:i(?:['’]m| am)\s+)?(?:generating|starting|copying|downloading|installing|configuring|writing|fetching|saving|checking|verifying|extracting|comparing|inspecting|running)\s+(?![^.!?\n]*\b(?:not|cannot|failed|blocked|unavailable)\b)[^.!?\n]{1,180}:\s*$/i.test(text);
  const trailingExtraction = /(?:^|\s)(?<!not )(?:extracting|comparing|inspecting)\s+(?![^.!?\n]*\b(?:not|cannot|failed|blocked|unavailable)\b)[^.!?\n]{1,180}:\s*$/i.test(text);
  const pendingAction = input.afterToolResults && (promisedAction || announcedAction || trailingExtraction);
  if (pendingAction) {
    return input.recoveryAttempts >= MAX_RECOVERY_NUDGES
      ? { action: "incomplete", message: "The model stopped after promising another check without executing it. Existing results were kept; the task is incomplete." }
      : { action: "recover", message: "Your last response ended by promising another action, but no tool call was issued. Perform the next authorized action with a complete tool call, or provide a final report explaining what remains incomplete and why. Do not repeat completed actions, replay commands with uncertain delivery, or end with another promise to continue." };
  }
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
