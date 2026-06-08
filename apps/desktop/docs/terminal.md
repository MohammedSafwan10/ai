# Privora Terminal

Privora Terminal uses a Codex-style unified exec runtime. The old polling tools
(`desktop_spawn_process`, `desktop_write_process`, `desktop_resize_process`, and
`desktop_kill_process`) are intentionally not part of the active agent surface.

## Agent Tool Surface

- `exec_command` starts a terminal command.
  - Prefer `argv` for exact execution.
  - Use `cmd` only when shell syntax is required.
  - The result includes `session_id` when the process is still running.
- `write_stdin` sends input to a running `session_id`.
  - Empty `chars` reads newly retained output without changing process stdin.
  - `close_stdin` closes pipe input for EOF-style commands.
- `terminal_read` returns retained output for a live or recent session.
- `terminal_resize` resizes PTY-backed sessions.
- `terminal_stop` requests immediate stop and unlocks the composer while the
  process tree is cleaned up in the background.
- `terminal_list` returns live and recent terminal sessions.

`desktop_run_diagnostics` remains available, but it routes through the same
terminal manager so diagnostics get the same lifecycle, output handling, and
stop behavior.

## Runtime Lifecycle

Terminal sessions emit first-class events:

- `terminal_session_started`
- `terminal_output_delta`
- `terminal_session_updated`
- `terminal_session_ended`

Output is chunked on safe UTF-8 boundaries, stripped of terminal control noise,
redacted for common secret shapes, and retained as a bounded preview. Large
chat/tool payloads still follow the app-wide artifact and preview rules instead
of being pushed through unbounded IPC.

## Long-Running Commands

Dev servers, watchers, and interactive shells remain attached to a session until
they exit or the user/agent stops them. The agent can continue work in later
turns by using `terminal_list`, `terminal_read`, and `write_stdin` with the
existing `session_id`.

App restart does not claim ownership of old OS processes. Live session control is
per app run; completed session metadata is retained only inside the current run.

## Stop Behavior

Stop is user-first:

1. The active terminal wait is aborted.
2. The tool/run is marked stopped.
3. The composer unlocks for the next user message.
4. The process tree is terminated in the background.

A slow process kill should not keep chat stuck in `Working...` or block a new
message from being sent.

## UI

Terminal activity stays in the chat timeline as compact expandable rows. There
is intentionally no duplicate right-side Terminal panel. High-volume output is
batched and bounded so terminal streaming does not force renderer update storms.
