# Go accounts and streaming chat

## Saved accounts

Settings → Providers supports up to ten named OpenCode Go accounts. The first
account becomes active; later additions require an explicit **Use** action.
Selection applies to all chats and only affects future provider requests.
Existing in-flight requests retain their captured credential.

Keys and account metadata are encrypted with Electron safeStorage in one vault.
Only IDs, names, active selection, and observed issues reach renderer settings.
The previous single key appears as **Default account** and is migrated when an
account is changed or a provider issue is recorded. Unreadable storage cannot be
overwritten by an account change. Removing the active account selects no replacement.

An explicit usage-cap response pauses the run with **Account limit reached**.
Choose an account, then Resume. There is no automatic account rotation, allowance
polling, automatic replay of completed tools, or claimed remaining quota. Temporary
rate limiting retains the existing bounded retry policy. Issues describe an actual
response and its model; one model's cap does not prove the entire account exhausted.

## Activity presentation

The supplied Codex screenshots are the approved reference: transparent activity
rows, understated thinking shimmer, compact file names with full paths on hover,
expandable output/diffs, and copy icons on hover or keyboard focus. Main chats and
subagent chats use the same components. Terminal previews show stable commands,
not changing output fragments. Commands already present in titles are not repeated.
Command output stays folded until requested; approvals and failures remain visible.
Reduced motion disables shimmer and detail transitions.

No new artwork was needed. Existing Lucide icons and theme tokens are reused.
Diff copying includes only the selected preview and marks truncation explicitly.

## Streaming Markdown

Reviewed OpenCode at commit `f09eee5002b8495bff5629bad7907a36767ab39a`:

- [Block projection](https://github.com/anomalyco/opencode/blob/f09eee5002b8495bff5629bad7907a36767ab39a/packages/session-ui/src/components/markdown-stream.ts)
- [Worker parsing](https://github.com/anomalyco/opencode/blob/f09eee5002b8495bff5629bad7907a36767ab39a/packages/session-ui/src/components/markdown.worker.ts)
- [Latest-request queue](https://github.com/anomalyco/opencode/blob/f09eee5002b8495bff5629bad7907a36767ab39a/packages/session-ui/src/components/markdown-worker-queue.ts)
- [Bounded render cache](https://github.com/anomalyco/opencode/blob/f09eee5002b8495bff5629bad7907a36767ab39a/packages/session-ui/src/components/markdown-cache.tsx)

Privora previously committed newline-delimited prefixes to a single Markdown
renderer and displayed the unfinished line as plain text. The new implementation:

- Parses the mutable final syntax block with the existing remark/GFM parser.
- Keeps completed blocks memoized and preserves their DOM nodes.
- Uses remend for display-only completion of incomplete syntax; partial links
  remain plain text until their destination is complete.
- Coalesces updates at 80 ms through one shared parsing worker, with one job in
  flight and one newest queued update per mounted message. Superseded responses
  cannot replace newer dispatched results.
- Renders code blocks as escaped text with a stable copy control. This change does
  not add syntax highlighting or Mermaid rendering.
- Preserves document-wide handling for reference links, footnotes, and plan
  markers, including definitions nested inside lists/quotes. These use a
  correctness-first full-document fallback.
- Releases worker projections after completion or unmount and supports a parser
  fallback if workers are unavailable. Saved Markdown and message copying retain
  the original source, without display-only repairs.

The worker moves projection parsing off the UI thread; React still renders changed
blocks on the UI thread. Initial static parsing and document-wide fallbacks can
still be expensive for unusually large messages. Existing long-answer previews
remain in place. This is not a promise that every Markdown input is glitch-free.

## Validation

- TypeScript check passed.
- Unit coverage includes encrypted account storage, legacy migration, removal,
  stale credential attribution, no automatic failover, temporary rate-limit
  retries, and usage-cap pauses across all three Go protocols.
- Markdown coverage includes character-by-character splits of lists, tables,
  blockquotes, both fence styles, setext headings, references, footnotes, source
  replacement, incomplete links, inert HTML, worker coalescing/disposal/failure,
  selected-diff copying, and duplicate command labels.
- Full suite: 844 passed, 7 skipped, one failure in the untouched Windows native
  app-discovery test under concurrent load. Its isolated rerun passed all 4 tests.
- An isolated browser fixture verified dark/light layouts, command/diff expansion,
  account activation/removal confirmation, keyboard-visible copy controls, and
  exact output/diff copying. No live account keys or provider calls were used.
- Warm streaming sample: 120 updates to an 11,335-character answer preserved
  completed heading/paragraph nodes and the final code line. No UI-thread tasks
  exceeding 50 ms were observed during those updates. This excludes initial load
  and is a local sample, not a broad performance guarantee.
- Desktop package built in `out/go-accounts-chat-polish`; the renderer includes a
  bundled Markdown worker. The running user app was not replaced or restarted.

Implemented and visually checked: activity rows, thinking, expanded command/diff
panels, streamed Markdown, saved-account rows, and removal confirmation. No theme
selection is pending. See `long-session-memory.md` for the subsequent memory,
virtualization, independent review, and release validation.
