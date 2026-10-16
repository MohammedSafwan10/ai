# Subagent model scope and live ordering

The composer now names its default selection "New subagent model". A per-chat
"Apply to existing agents' next turns" checkbox broadens that choice to follow-up
turns of existing children, including nested children. The setting persists with
the chat and does not become a global default. New children retain the spawn
resolver's model/reasoning precedence. Existing children read the operator's
current selection when a new turn starts and update their displayed model then.
Current provider requests and explicit checkpoint resumes retain their model.

The active-agent list previously sorted by last activity time. Every streamed
preview updated that timestamp, so concurrently streaming agents repeatedly
changed positions. Active agents now use creation/ID launch order, with a stable
Created time in the list. Detailed transcripts still show actual live activity;
finished agents sort by their finish/close time. No-op run snapshots do not force
transcript state changes.

A separate live-order bug affected legacy coordination records. A parent prompt
and a new child response could share a timestamp. The fallback incorrectly
embedded that prompt at the growing response length, ahead of all later tools.
Legacy grouping now requires an earlier assistant and a reliable captured tool
offset; uncertain positions remain standalone. Explicit captured positions are
preserved. Same-time standalone user messages sort before assistant responses,
and new follow-up responses are timestamped after their incoming user message.
The main chat and subagent panel share the corrected grouping and rendering.

Execution activity rows for exec_command and kali_exec show a one-second live
timer from execution start. Completion/failure/stop freezes elapsed time while
retaining expandable command/output. Status checks, cancellation and terminal
inspection retain their own action labels; unknown Kali state is unconfirmed.
The Codex reference was the local Rust TUI exec_cell model/render code, which
separates active start time from completed duration. This is not a claim that
the local repository contains the desktop UI implementation.

Fixture checks: 60 alternating updates left three agent row positions unchanged;
20 live text updates preserved text/tool interleaving. A command clock advanced
54s to 56s, then froze at 56s after completion with expanded output retained.
Provider-call regression verified an active MiMo request stayed MiMo while the
following new turn used DeepSeek and the selected reasoning effort. No live
provider requests or remote command replay were used for these checks.

## Terminal comparison and corrections

The local Codex comparison identified concrete continuation problems rather than
a need to replace the terminal. Privora now consumes unread stdout/stderr once,
including the last chunk after exit, preserves exit-code failure on late polls,
applies each poll's output budget without shrinking retained history, and
serializes interactions within a session while unrelated sessions stay parallel.
A queued cancelled write sends nothing; cancellation after input was written
stops the touched process even during the Windows close-stdin delay. Resize and
Stop management responses do not silently consume unread command output.

References inspected in `D:/Dev/codex`: `codex-rs/core/src/unified_exec/process_manager.rs`
(session interaction lock, pending output and truncation metadata), and
`codex-rs/tui/src/exec_cell/model.rs` (completed duration and cleared start time).
Remaining differences include legacy token-budget aliases using byte/character
semantics and the renderer clock using wall time rather than a monotonic clock.
The chat output view is not a complete interactive terminal emulator.

Yielded native processes keep a session-correlated live timer. Actual process
exit updates the original chat tool's terminal metadata without rewriting the
historical model-facing tool result. A failed or stopped process receives the
corresponding label and frozen runtime. Both main and subagent chats receive the
same saved tool update.

Release checks: TypeScript passed; full suite 902 passed, 7 skipped. Independent
review and focused terminal tests covered process-session races and UI metadata.
Build: `out/live-agent-terminal/Privora-win32-x64/Privora.exe`.
