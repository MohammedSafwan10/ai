# Interface and streaming contract

Status: setup, compact environment header, existing chat/tool rows, and on-demand
jobs/findings/evidence dialogs are implemented and exercised in the Windows
package, including text preview and native evidence saving. Remote desktop/browser
views are future adapters.

## Preserve the familiar chat

Use Privora's Build chat layout, composer, typography, tool rows and side panels.
The earlier standalone Dex mockups were rejected; they are not approved production
references. Do not introduce a dense dashboard or a new global theme.

Security is a workspace type, not another composer toggle. Existing workspaces
remain Development. New Security workspaces add task context and environments;
their chats keep separate history from ordinary projects using the existing
workspace/thread relationship.

## Small additions

- Header: `Security · Kali Mac · Connected`, opening environment and evidence
  details. Environment selection happens during project creation.
- Existing attachment control: files, repositories or target context.
- Compact tool rows: environment, current action, duration and expandable output.
- On-demand dialog: findings/evidence, job output previews and Copy, Stop,
  attachment preview/download, and connection checks.
- Project context: objective, scope, and assigned environment captured on
  creation. Existing permission controls remain in the composer.

Model selection, reasoning, Plan Mode and Agents remain separate controls.
Reuse the existing `Ask risky` / `Full access` permission selector. Do not add
another autonomy toggle or permission profile. In Security workspaces, Full access
permits autonomous work within the explicitly assigned environment and project
scope; it does not select additional machines or grant host access. Inspect the
current permission implementation before mapping remote actions to these choices.
Security specialist delegation is optional; do not conflate it with the existing
Reviewer Swarm. Hide unsupported actions rather than show misleading placeholders.

## Creation flow

Open a Development folder with the existing folder button, or choose the sidebar
shield button for a separate Security project. Enter name, objective and scope,
select/import an environment, optionally check its connection, and create the
project. Continue in the Build chat and use its existing access selector.
Missing environment access is actionable setup, not a false ready state.

## Live behavior

Reuse the existing provider streaming and activity pipeline. Stream text
incrementally; coalesce UI updates without losing persisted events. Show summaries
or provider-supplied reasoning when available, not invented internal thoughts.

The submitted message appears immediately with sending/accepted/failed state.
Keep the draft editable during running work. Follow existing prompt queue rules
and make it clear whether a message is queued, steering or a new turn.

Tool rows display starting/running/completed/failed/cancelled/unknown consistently.
Stop first shows requested cancellation; only confirmed termination becomes stopped.
Final text and remaining tool work are distinct, so a rendered answer cannot
incorrectly imply all jobs ended. Surface any running detached jobs explicitly.

Reconnect uses job IDs and output cursors. Deduplicate output, recover missing
events, and keep the visible draft. Connection failure never reroutes work to the
Windows host. Bound output previews and fetch complete details on demand.

## Required states

- Empty project and new task setup.
- Preparing connection, missing tools and unsupported architecture.
- Running model/tools with visible environment attribution.
- Completed run with evidence and unresolved checks.
- Stop requested, confirmed cancellation and cancellation failure.
- Lost connection, unknown job state, reconnect and reconciliation.
- Finding detail: candidate, observed, verified, rejected, stale and retest.
- Approval needed, denied action and exhausted run budget.

Verify keyboard interaction, accessible labels, long filenames, narrow windows,
expanded logs, large text and scrolling during streaming. Preserve code-block copy
and Build chat behavior. Implementation was authorized by the operator after
the original planning stage; this document records current behavior and goals.

## Existing output defect confirmed during review

`HeadTailOutputBuffer.toString()` decodes head and tail byte buffers separately.
When their boundary splits a UTF-8 code point, displayed text is corrupted even
with zero omitted bytes. Reproduction: buffer budget 8 bytes, push `€€` (6 bytes);
the current result is `€���`. Preserve byte continuity before decoding when no
bytes are omitted; for truncated output, handle both retained boundaries safely.
Add cases for non-ASCII output and arbitrary byte-chunk boundaries before changing
the buffer. This was confirmed in existing Privora, not in an implemented Kali
connector. Fixed in the foundation audit: decode contiguous bytes together and
preserve UTF-8 boundaries in streamed/truncated previews. Regression tests cover
the internal split, byte-at-a-time streaming and truncation budgets.

Output presentation should keep compact activity summaries by default, readable
monospace details, copy controls, explicit truncation markers and links to complete
retained artifacts. Verify ANSI/control-character handling, long lines, manual
scroll position, burst output and final status delivery in the execution slice.
