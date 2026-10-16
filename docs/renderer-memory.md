# Interface memory investigation

The failure log can establish that Chromium reported `oom`. It does not, by
itself, identify the allocating component or prove that an agent caused it.

## Confirmed code risks and changes

- The desktop event queue previously drained only on animation frames. Hidden
  windows can suspend frames while IPC events continue arriving. It now drains
  on a frame or a 100 ms fallback, and incoming traffic forces a drain at 64
  queued events even if both schedulers stall. Event order and protocol barriers
  remain intact; this does not cancel or replay jobs.
- The subagent transcript previously appended tool-output deltas without the
  main chat's preview limit. Both now use the same bounded live preview. This
  changes in-memory display text, not saved tool records or collected evidence.
- Hidden subagent panels release their transcript and subscription, then reload
  saved history when shown. History-load buffers are released on completion,
  failure and disposal, and stop accepting updates after 128 queued events.
  An overflow offers a history retry, not a task retry.
- Unrelated events no longer create a replacement subagent transcript state.
- The main process keeps at most ten numeric memory samples at 30-second
  intervals. Samples are written to the local, rotated failure log only when
  the interface exits unexpectedly. They contain timestamps, process categories
  and memory sizes, without prompts, URLs, evidence, or session identifiers.

## Comparison source

OpenCode was inspected at commit
`32b41bab136f02b17d285825d36b213798f67cb6`. Its client uses timed event batches
and lifecycle cleanup; its application evicts idle directory stores and
virtualizes the timeline. These are architectural references, not evidence
that OpenCode cannot experience memory failures.

- https://github.com/anomalyco/opencode/blob/32b41bab136f02b17d285825d36b213798f67cb6/packages/client/src/solid/connection.ts
- https://github.com/anomalyco/opencode/blob/32b41bab136f02b17d285825d36b213798f67cb6/packages/app/src/runtime/server/global-sync/eviction.ts
- https://github.com/anomalyco/opencode/blob/32b41bab136f02b17d285825d36b213798f67cb6/packages/app/src/session/timeline/virtualizer.tsx

## Validation and remaining evidence

Regression tests exercise a suspended frame scheduler, suspended frames and
timers with 10,000 ordered updates, teardown without replay, and 500 KB of
subagent output retained as roughly 40 KB of live preview. Existing protocol,
thread-isolation and failure-log checks also pass.

These tests establish bounds for the repaired paths. They do not prove the
cause of a past crash or bound the entire Chromium process. Verify the new
build during normal foreground/background operation with active agents. If
memory still grows, compare local pre-crash numeric samples and profile a
controlled reproduction before increasing memory limits or changing unrelated
subsystems. Treat heap snapshots as private: they can contain chat data and
credentials and must not be committed or uploaded without review.
