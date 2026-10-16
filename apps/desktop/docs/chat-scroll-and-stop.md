# Chat scrolling and stop state

The chat grid now permits its children to shrink inside the centered 760px
column. Long code and commands no longer impose their intrinsic width on the
entire message. Answer text uses 14px with 1.6 line height.

Both virtualized timelines compensate for resized rows entirely above the
viewport, rather than shifting a visible message when its tool output folds.
The current DOM scroll offset includes adjustments already made during a batch.
Keyed prepend anchoring remains enabled; a temporary visible-row anchor corrects
measurement drift after loading earlier messages. Wheel, pointer and Latest
interactions release that anchor. Explicit upward scrolling disables resize
pinning, even a few pixels from the bottom, until returning to the actual bottom
or choosing Latest. Jump controls refresh after content resizes.

OpenCode reference: commit f09eee5002b8495bff5629bad7907a36767ab39a,
`packages/app/src/session/timeline/virtualizer.tsx` (visible-row resize policy,
explicit unpinning), and `packages/session-ui/src/components/markdown.css`
(bounded content and typography). Privora retains its React/TanStack integration.

Stopping a parent cancels live and recovered child approvals and publishes their
terminal message, tool and run states. Completed children keep their result.
Direct child Stop also updates its agent record. A watchdog exception arriving
after an explicit Stop cannot start automatic recovery. The panel reconciles
terminal snapshots/messages and hides Stop during draining; its control is 26px.

Activity rows use muted 13px icons: terminal, web search, built-in browser,
external integration, computer, files, subagents, questions and compaction.

Verification: TypeScript passed; full suite 868 passed, 7 skipped. A separate
review agent checked cancellation, scroll ownership, prepend handling and icons.
Isolated browser fixtures kept main and subagent tool headers at identical
positions through expand/collapse, preserved a 5px upward gesture across later
updates, hid Latest at bottom and preserved a reading anchor at 223px after
prepending 50 messages. Long code stayed inside the centered 760px column.
These checks use fixture data, not live provider requests or credentials.

Packaged build: `out/scroll-reviewed/Privora-win32-x64/Privora.exe`.
