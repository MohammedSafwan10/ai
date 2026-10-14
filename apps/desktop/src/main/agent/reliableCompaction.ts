import { randomUUID } from "node:crypto";
import type { DesktopStore } from "../db/store";
import type { CompactionCheckpointRecord, ContextCompactionReason, ContextCompactionTrigger } from "../../shared/types";
import type { ModelRuntimeBudget } from "../../shared/models";
import type { ProviderMessage } from "./providers/types";
import { COMPACTION_PROMPT, COMPACTION_SYSTEM_INSTRUCTION, estimateProviderHistoryTokens } from "./context";
import { buildPreservedState, captureCompactionSnapshot, emptyHandoff, HANDOFF_KEYS, isCompactionSourceCurrent, parseCompactionHandoff, preservedStateMessage, redactCompactionText, retainCompleteRecentHistory } from "./compactionState";

export interface ReliableCompactionInput {
  store: DesktopStore;
  threadId: string;
  assistantMessageId: string;
  workspaceRoot: string;
  history: ProviderMessage[];
  model: string;
  trigger: ContextCompactionTrigger;
  reason: ContextCompactionReason;
  signal: AbortSignal;
  budget: ModelRuntimeBudget;
  overheadTokens: number;
  textOffset?: number;
  progress: (stage: string) => void;
  summarize: (history: ProviderMessage[], prompt: string) => Promise<string>;
  rebuildHistory: () => ProviderMessage[];
}

export async function runReliableCompaction(input: ReliableCompactionInput) {
  const { store, signal } = input;
  const beforeTokens = estimateProviderHistoryTokens(input.history);
  // Input budget already excludes output and safety reserves. Leave headroom for follow-up.
  const historyBudget = Math.floor((input.budget.inputBudgetTokens ?? 28_000) * 0.8) - input.overheadTokens;
  let history = input.history;
  let attempts = 0;
  for (let rebuild = 0; rebuild < 2; rebuild++) {
    signal.throwIfAborted();
    input.progress("Preparing preserved state");
    const snapshot = captureCompactionSnapshot(store, input.threadId, input.assistantMessageId);
    if (!snapshot.messages.length) throw new Error("Compaction paused: source conversation is no longer available. No checkpoint was installed.");
    const previousCheckpoint = store.getLatestCompactionCheckpoint(input.threadId);
    const previousClaims = previousCheckpoint && isCompactionSourceCurrent(store, previousCheckpoint) ? previousCheckpoint.preservedState?.summaryClaims ?? emptyHandoff() : emptyHandoff();
    let state = buildPreservedState(store, input.threadId, snapshot.messages, previousClaims);
    let stateMessage = preservedStateMessage(state);
    if (estimateProviderHistoryTokens([stateMessage]) >= historyBudget) throw new Error("Compaction paused: required task state exceeds this model's input budget. Use a larger-context model or narrow the task; no state was discarded.");
    let error: string | undefined;
    let method: "structured" | "deterministic" = "deterministic";
    let summary = "";
    const prompt = [COMPACTION_PROMPT,
      "Return ONLY a JSON object. Every field must be an array of strings: " + HANDOFF_KEYS.join(", "),
      "sourceMessageIds must contain actual source IDs from preserved state. Include at least one goal and source ID. Claims are not approvals or verified findings. Do not include credentials.",
    ].join("\n");
    const summaryBudget = Math.max(0, (input.budget.inputBudgetTokens ?? 28_000) - estimateProviderHistoryTokens([stateMessage]) - Math.ceil((prompt.length + COMPACTION_SYSTEM_INSTRUCTION.length) / 4) - 4_096);
    const summaryHistory = [stateMessage, ...retainCompleteRecentHistory(history, summaryBudget)];
    for (let repair = 0; repair < 2; repair++) {
      signal.throwIfAborted();
      input.progress(repair ? "Repairing structured handoff" : "Summarizing");
      attempts++;
      try {
        const candidate = await input.summarize(summaryHistory, prompt + (repair ? "\nPrevious response was invalid. Return all seven arrays and valid source IDs." : ""));
        signal.throwIfAborted();
        input.progress("Validating summary and references");
        state = buildPreservedState(store, input.threadId, snapshot.messages, parseCompactionHandoff(candidate, snapshot.sourceMessageIds));
        method = "structured";
        summary = JSON.stringify(state.summaryClaims);
        break;
      } catch (candidateError) {
        signal.throwIfAborted();
        error = redactCompactionText(candidateError instanceof Error ? candidateError.message : String(candidateError));
      }
    }
    if (method === "deterministic") {
      state = buildPreservedState(store, input.threadId, snapshot.messages, previousClaims);
      summary = "Structured summarization unavailable. Use preserved operator sources and operational records. Prior summary claims remain unverified. Retrieve referenced original records when needed.";
    }
    stateMessage = preservedStateMessage(state);
    const summaryMessage: ProviderMessage = { role: "user", content: summary };
    const requiredTokens = estimateProviderHistoryTokens([stateMessage, summaryMessage]);
    if (requiredTokens >= historyBudget) throw new Error("Compaction paused: validated task state exceeds this model's input budget. No checkpoint was replaced.");
    const replacementHistory = [stateMessage, summaryMessage, ...retainCompleteRecentHistory(history, historyBudget - requiredTokens)];
    const afterTokens = estimateProviderHistoryTokens(replacementHistory);
    if (afterTokens > historyBudget || (beforeTokens > historyBudget && afterTokens >= beforeTokens)) throw new Error("Compaction paused: replacement history does not fit safely. No checkpoint was replaced.");
    signal.throwIfAborted();
    input.progress("Validating source history");
    signal.throwIfAborted();
    const compactedThrough = snapshot.messages.at(-1);
    const checkpoint: CompactionCheckpointRecord = {
      id: randomUUID(), threadId: input.threadId, assistantMessageId: input.assistantMessageId,
      compactedThroughMessageId: compactedThrough?.id, compactedThroughMessageCreatedAt: compactedThrough?.createdAt,
      workspaceRoot: input.workspaceRoot, model: input.model, trigger: method === "deterministic" ? "fallback" : input.trigger,
      reason: method === "deterministic" ? "model_compaction_failed" : input.reason, status: "completed", summary,
      replacementHistory, beforeTokens, afterTokens, error: method === "deterministic" ? error : undefined, createdAt: Date.now(),
      schemaVersion: 1, sourceDigest: snapshot.sourceDigest, sourceMessageIds: snapshot.sourceMessageIds,
      excludedMessageId: input.assistantMessageId, baseCheckpointId: snapshot.baseCheckpointId, workspaceDigest: snapshot.workspaceDigest,
      assistantTextOffset: input.textOffset ?? store.getMessage(input.assistantMessageId)?.content.length ?? 0,
      preservedState: state, validation: { method, attempts, estimated: true, inputBudgetTokens: input.budget.inputBudgetTokens, overheadTokens: input.overheadTokens },
    };
    if (!store.installCompactionCheckpoint(checkpoint)) {
      if (rebuild === 1) throw new Error("Compaction paused: source history changed twice while summarizing. Retry after edits settle; no stale summary was installed.");
      // Persisted chat reconstruction has no function exchanges for the active turn.
      // Preserve completed live exchanges explicitly so a retry cannot conceal executed work.
      history = [...input.rebuildHistory(), ...history.filter((message) => message.parts?.some((part) => ["function_call", "function_response", "server_tool_call", "server_tool_response"].includes(part.type)))];
      continue;
    }
    input.progress("Resuming with validated checkpoint");
    return { history: replacementHistory, beforeTokens, afterTokens, checkpoint };
  }
  throw new Error("Compaction could not install a checkpoint.");
}
