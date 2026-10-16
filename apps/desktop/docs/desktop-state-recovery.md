# Desktop connection and state recovery

The Electron main process owns run state. Each process assigns a runtime ID and each emitted event receives an increasing sequence. A synchronous sync snapshot includes the current watermark, active runs, terminal sessions, and unresolved questions.

The renderer uses one DesktopSync subscription for the main chat and subagent transcripts. It subscribes before reading a snapshot, buffers updates while recovering, replaces the live state, and replays only contiguous events newer than the watermark. Duplicate events are ignored. Missing sequences, a new runtime ID, or a changed health watermark trigger another snapshot. Recovery never resends prompts or commands.

Recovery buffers are limited to 512 events and four million estimated bytes. Requests time out after five seconds; snapshot retries back off from one to fifteen seconds. A read-only health request runs every fifteen seconds, so quiet chats do not appear disconnected. Returning to the foreground after twenty seconds or a pageshow triggers recovery. The top bar shows Checking connection, Recovering state, or Reconnecting until reconciliation succeeds.

Subagent history reloads on shared recovery, preserves loaded older pages and reading position, and rejects obsolete requests and backend epochs. History failures clear after successful reload and retry up to three times with bounded request timeouts. Existing page requests are invalidated when recovery starts.

Desktop connection status does not describe model-provider or Kali connectivity. Recovery cannot preserve in-process native execution after the Electron main process exits. It reconciles the state available from the current main process; it does not restart interrupted work.

Reference: https://github.com/anomalyco/opencode/blob/dev/packages/client/src/solid/connection.ts

Validation covers initial subscription ordering, watermark replay, duplicate events, sequence gaps, runtime restarts, recovery-buffer overflow, lost final events, quiet healthy connections, timeout and unmount cleanup, and replacement of stale runs, questions, and terminal state. A browser fixture using the actual hooks and subagent panel verifies missed completion clears Stop and backend restart refreshes the transcript.
