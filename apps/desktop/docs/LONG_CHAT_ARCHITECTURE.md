# Long-chat architecture

Privora stores chat state in `privora-desktop.sqlite` using Electron's bundled
`node:sqlite`. The database runs with WAL, foreign keys, defensive mode, and
bounded SQLite limits. Notes, browser evidence, browser workflows, and other
specialized artifacts keep their existing independent stores.

## History loading

- The bootstrap snapshot contains only the newest 60 messages for the active
  thread.
- Scrolling near the top requests 50 older messages using an opaque
  `(createdAt, id)` cursor.
- The renderer keeps only the active thread in memory. It does not retain
  unbounded per-thread message or tool caches.
- TanStack Virtual renders dynamic-height messages with stable IDs,
  end-anchoring, measured rows, and append-follow behavior.

## Large records

- Tool output and diffs over 64 KB are stored under `chat-artifacts/`.
- History pages contain compact previews. Expanding a tool row requests its
  complete detail through IPC.
- Completed assistant text over 32 KB renders an 8 KB preview until expanded.
- Composer attachments are imported once as binary chat artifacts. Renderer
  previews use the private `privora-attachment://` protocol, history IPC carries
  only artifact references, and provider bytes are hydrated only in main.
- History pages cap visible tool events at 2,000 so a pathological single turn
  cannot create an unbounded IPC payload.

## Reliability

- Thread deletion cascades through messages, tools, undo records, and
  checkpoints, then removes unreferenced artifacts.
- Equal message timestamps are ordered and paged by persistent message ID.
- Active streaming updates remain targeted renderer events and are coalesced
  once per animation frame.
- The long-chat stress suite verifies 10,000-message pagination and a bounded
  100,000-tool turn.
