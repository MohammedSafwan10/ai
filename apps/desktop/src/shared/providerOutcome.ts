export interface ProviderStreamOutcome {
  status: "completed" | "tool_calls" | "output_limit" | "interrupted" | "incomplete" | "refused" | "failed";
  reason: string;
}
