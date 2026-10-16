import type { ProviderStreamOutcome } from "../../../shared/providerOutcome";

export class ProviderStreamError extends Error {
  constructor(public readonly outcome: ProviderStreamOutcome) {
    super(outcome.reason === "account_usage_limit" ? "This Go account reached its usage cap. Choose a saved account in Settings > Providers, then Resume. Completed actions were kept."
      : outcome.status === "output_limit" ? "The model reached its output limit. Partial work was kept; resume to continue."
      : outcome.status === "incomplete" ? "The model response was incomplete. Partial work was kept; resume from saved results."
      : outcome.status === "failed" ? "The provider reported a failed response. Partial work was kept; review the failure before resuming."
      : "The model connection was interrupted. Partial work was kept; resume from saved results.");
  }
}

export const normalizeFinish = (reason: string): ProviderStreamOutcome => {
  if (["stop", "end_turn", "stop_sequence", "completed", "STOP"].includes(reason)) return { status: "completed", reason };
  if (["tool_calls", "function_call", "tool_use", "requires_action"].includes(reason)) return { status: "tool_calls", reason };
  if (["length", "max_tokens", "max_output_tokens", "MAX_TOKENS", "budget_exceeded"].includes(reason)) return { status: "output_limit", reason };
  if (["content_filter", "refusal", "SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT"].includes(reason)) return { status: "refused", reason };
  if (reason === "failed") return { status: "failed", reason: "provider_error" };
  if (reason === "cancelled") return { status: "interrupted", reason: "provider_cancelled" };
  return { status: "incomplete", reason: "unknown_finish" };
};

/** Tracks protocol-level termination. An EOF or [DONE] alone is not a finish reason. */
export class StreamOutcomeTracker {
  private outcome?: ProviderStreamOutcome;
  observe(event: string | undefined, data: any) {
    const type = data?.type || data?.event_type || event;
    const finish = data?.choices?.[0]?.finish_reason;
    if (typeof finish === "string") this.outcome = normalizeFinish(finish);
    if (type === "message_delta" && typeof data?.delta?.stop_reason === "string") this.outcome = normalizeFinish(data.delta.stop_reason);
    if (type === "response.completed") this.outcome = data?.response?.status === "incomplete"
      ? data?.response?.incomplete_details?.reason === "max_output_tokens" ? normalizeFinish("max_output_tokens") : { status: "incomplete", reason: "response_incomplete" }
      : normalizeFinish(data?.response?.status || "completed");
    if (type === "response.incomplete") this.outcome = data?.response?.incomplete_details?.reason === "max_output_tokens"
      ? normalizeFinish("max_output_tokens") : { status: "incomplete", reason: "response_incomplete" };
    if (type === "response.failed" || type === "error") this.outcome = { status: "failed", reason: "provider_error" };
    if (type === "interaction.complete" || type === "interaction.status_update") {
      const status = data?.status || data?.interaction?.status || data?.status_update?.status;
      if (type === "interaction.complete" || ["completed", "requires_action", "incomplete", "failed", "cancelled", "budget_exceeded"].includes(status)) {
        this.outcome = normalizeFinish(status || "completed");
      }
    }
  }
  finish(): ProviderStreamOutcome { return this.outcome || { status: "interrupted", reason: "missing_finish" }; }
}
