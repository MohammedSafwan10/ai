# Long-session memory and subagent transcripts

The requested reference is OpenCode, inspected at commit
`f09eee5002b8495bff5629bad7907a36767ab39a`:

- [Idle/capacity eviction with pinned-store protection](https://github.com/anomalyco/opencode/blob/f09eee5002b8495bff5629bad7907a36767ab39a/packages/app/src/runtime/server/global-sync/eviction.ts)
- [Virtual timeline and scroll anchoring](https://github.com/anomalyco/opencode/blob/f09eee5002b8495bff5629bad7907a36767ab39a/packages/app/src/session/timeline/virtualizer.tsx)

Privora already keeps the selected main-chat snapshot rather than a cache of every
visited transcript. The remaining growth paths addressed here are loaded history,
fully mounted subagent messages, opened tool details, and prepared SQL statements.

## Implementation

- Main and subagent histories retain a recent window while following the latest
  messages: approximately 300 messages, four million retained text characters,
  and 2,000 tool records. Complete immutable message, tool, and undo payloads are
  included in the text estimate, with weak-key caches for repeated estimates.
- These are soft budgets. Active turns, pending input, inline anchors and reading
  older history are protected. An oversized individual message is retained. This
  is not a hard limit on total application memory or the agent's context.
- Earlier messages are evicted only from the UI, with a shared UTF-8 pagination
  cursor. Saved SQLite records/artifacts remain intact and can be loaded again.
  Returning to Latest releases older loaded pages. Thread switches release the
  previous main-chat snapshot; hiding/switching the subagent panel releases its
  transcript subscription and mounted messages.
- Subagent transcripts use measured virtual rows, six-row overscan, stable message
  keys and end anchoring. The scroll owner preserves manual reading during live
  updates; a Latest control returns to the newest message. Tool rows are grouped
  once by message instead of filtering the full tool array for every mounted row.
- Older-page requests carry a selection generation; late results cannot overwrite
  another selection. Overlapping pages merge by record freshness.
- Closing a tool detail or activity group drops its hydrated output. In-flight
  detail responses are discarded after closure or unmount.
- The prepared-statement cache uses a 256-entry LRU bound, including variable-size
  SQL queries. Database contents are not removed by this cache policy.

## Independent review

A separate review agent examined all pending changes, including Go accounts,
provider limits, Markdown streaming and activity UI. Two real issues were found
and fixed before release:

1. The first memory estimate omitted arguments, results and structured diffs.
   It now includes complete records, with a regression containing large payloads.
2. Markdown block projection missed reference definitions inside quotes/lists.
   It now inspects syntax nodes and keeps document-wide reference resolution.

The reviewer rechecked both fixes and reran the targeted files: 30 tests passed,
with no additional substantiated blocking findings.

## Verification

- TypeScript passed; retention, SQLite cache, transcript, Markdown and account
  regression tests passed.
- The final full suite passed 856 tests, with 7 skipped, including the budget and
  nested-reference regressions identified during review.
- Isolated browser fixture: 2,000 saved messages mounted 13 virtual rows. Loading
  50 older messages preserved the existing reading anchor at exactly 32 px; 100
  live appends preserved that position. Latest reached the newest answer at zero
  bottom distance with 14 mounted rows. Hiding the panel left zero mounted rows.
- The earlier Markdown fixture preserved completed DOM blocks across 120 updates
  of an 11,335-character answer without observed UI-thread tasks over 50 ms during
  the updates. These are local samples, not a general crash/performance guarantee.
- No live credentials or bounty records were used for fixture verification.

The desktop package for the combined changes is `out/memory-and-chat`.
