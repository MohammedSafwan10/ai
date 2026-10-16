import type { ProviderStreamOutcome } from "../../../shared/providerOutcome";
import type { ProviderAdapter, ProviderStreamOptions } from "./types";
import { ProviderStreamError } from "./streamOutcome";
import { ProviderRequestError, providerRetryDelay, waitForProviderRetry } from "./requestError";

/** Retry only attempts that have not exposed content or actions to the harness. */
export async function reliableProviderStream(adapter: ProviderAdapter, options: ProviderStreamOptions) {
  for (let retries = 0; ; retries++) {
    options.signal.throwIfAborted();
    let produced = false;
    let outcome: ProviderStreamOutcome | undefined;
    const drafts = new Set<string>();
    const emitted = new Set<string>();
    let calls = 0;
    const publish = (value: ProviderStreamOutcome) => { outcome = value; options.onStreamOutcome?.(value); };
    try {
      await adapter.stream({ ...options,
        onStreamOutcome: (value) => { outcome = value; },
        onTextDelta: (delta) => { if (delta) produced = true; options.onTextDelta(delta); },
        onThoughtDelta: (delta) => { if (delta) produced = true; options.onThoughtDelta(delta); },
        onTextReplace: (text) => { produced = true; options.onTextReplace?.(text); },
        onThoughtReplace: (text) => { produced = true; options.onThoughtReplace?.(text); },
        onProviderContextPart: (part) => { produced = true; options.onProviderContextPart?.(part); },
        onWebSearch: (event) => { produced = true; options.onWebSearch?.(event); },
        onUsage: (usage) => { produced = true; options.onUsage?.(usage); },
        onResponseDisposition: (disposition) => { produced = true; options.onResponseDisposition?.(disposition); },
        onToolDraft: (draft) => {
          produced = true;
          const key = draft.id || draft.name;
          if (!emitted.has(key)) drafts.add(key);
          options.onToolDraft(draft);
        },
        onToolCall: (call) => {
          produced = true; calls++;
          emitted.add(call.id); emitted.add(call.name);
          drafts.delete(call.id); drafts.delete(call.name);
          options.onToolCall(call);
        },
      });
      options.signal.throwIfAborted();
      const finish = outcome || { status: "interrupted", reason: "missing_finish" };
      if (drafts.size || (finish.status === "tool_calls" && !calls)) {
        throw new ProviderStreamError({ status: "incomplete", reason: "incomplete_tool_call" });
      }
      if (!["completed", "tool_calls", "refused"].includes(finish.status)) throw new ProviderStreamError(finish);
      publish(finish);
      return;
    } catch (error) {
      if (options.signal.aborted) { publish({ status: "interrupted", reason: "cancelled" }); throw error; }
      if (error instanceof ProviderRequestError && error.code === "usage_limit") {
        const paused: ProviderStreamOutcome = { status: "interrupted", reason: "account_usage_limit" };
        publish(paused); throw new ProviderStreamError(paused);
      }
      const delay = !produced ? providerRetryDelay(error, retries) : null;
      if (delay !== null) {
        options.onRetry?.({ attempt: retries + 1, delayMs: delay, reason: "Temporary provider connection or capacity failure" });
        try { await waitForProviderRetry(delay, options.signal); }
        catch (aborted) { publish({ status: "interrupted", reason: "cancelled" }); throw aborted; }
        continue;
      }
      if (error instanceof ProviderStreamError) { publish(error.outcome); throw error; }
      if (providerRetryDelay(error, 0) !== null) {
        const interrupted: ProviderStreamOutcome = { status: "interrupted", reason: "provider_unavailable" };
        publish(interrupted); throw new ProviderStreamError(interrupted);
      }
      if (outcome && ["output_limit", "incomplete", "interrupted"].includes(outcome.status)) {
        publish(outcome); throw new ProviderStreamError(outcome);
      }
      // A transport error after visible work is resumable, never silently replayed.
      if (produced && error instanceof TypeError && /fetch|network|terminated|socket/i.test(error.message)) {
        const interrupted: ProviderStreamOutcome = { status: "interrupted", reason: "transport_lost" };
        publish(interrupted); throw new ProviderStreamError(interrupted);
      }
      publish({ status: "failed", reason: "provider_request_failed" });
      throw error;
    }
  }
}
