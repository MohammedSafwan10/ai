# Reliable foreground compaction

Privora continues using the selected model to produce portable text handoffs. It does not use native encrypted or background compaction.

## What survives

Version 1 checkpoints retain operator text with message IDs, configured Security scope, model-authored handoff claims, persisted finding/evidence IDs, job observations, subagent results, and tool references. Original messages and artifacts remain on disk. Known credential patterns are redacted from new preserved text; original source references remain available.

Operator instructions, stored operational records, and model claims are explicitly distinguished. A summary cannot create approval. Later operator corrections take precedence. A stored `verified` finding is a recorded classification, not a fresh independent validation.

Job observations refresh when history is restored. Resuming a checkpoint with unfinished Security jobs uses the existing reconciliation service; unknown deliveries are not automatically re-executed. Missing or failed evidence lookups retain their original IDs as unresolved, rather than receiving replacement IDs.

## Installation and recovery

Compaction snapshots an eligible source prefix, its message/content hashes, attachment content hashes, workspace scope, and the previous checkpoint identity. Activation verifies that prefix inside the same database transaction that saves the checkpoint and updates a matching resumable run. Appended messages survive; edits, rewinds, and deletions invalidate candidates. One stale-source rebuild is allowed and retains live tool exchanges. Covered pending steers are consumed without duplicate delivery.

Restoration uses source IDs rather than creation timestamps and retains the assistant text generated after the captured offset. Legacy checkpoints remain readable. A stopped or invalid compaction leaves the previous valid checkpoint active.

## Validation and limits

Handoffs require seven arrays: goals, constraints, completedWork, rejectedLeads, unresolvedQuestions, nextActions, and sourceMessageIds. References must belong to captured source messages. This validates structure and provenance, not the truth of every model claim. One repair attempt precedes deterministic fallback.

Estimates include history, system instructions, tool schemas, and the model's reserved output/safety budget. Recent history is retained at complete tool-exchange boundaries. Required state that cannot fit causes a visible pause; it is never silently discarded. Instructions, tool references, and subagent results can grow over long tasks, so a larger-context model may eventually be necessary. Token figures are estimates, not tokenizer-exact accounting.

The timeline shows preparing, summarizing, validating, and resuming stages, estimated before/after usage, and fallback/failure information. Stable instructions remain before dynamic runtime context where existing provider semantics permit; cache hits are not guaranteed.

## Verification and rollout

Regression coverage includes append/edit/rewind races, cancellation, atomic run-checkpoint recovery, assistant suffix restoration, repeated investigations, missing evidence, redaction, attachment changes, complete tool exchanges, model switching, budget limits, and actual request serialization for Go Chat Completions/Responses/Messages and Gemini interactions using mocked transports.

Build and run the Windows package after the active session finishes. Keep the previous package for rollback. Live provider behavior, paid-model performance, and interactive UI inspection are separate from these automated checks.
