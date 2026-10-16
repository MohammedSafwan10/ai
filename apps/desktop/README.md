# Privora Desktop

Privora Desktop is BYOK-only: no Privora account, subscription or AI credits. Configure your own Gemini, OpenRouter, DeepSeek, OpenCode Go or local CLIProxy provider in Settings. Local data stays on your PC; configured remote providers receive the context required for inference.

Privora Desktop is an Electron agent app for local development and connected security work. Normal projects give the agent access to workspace files, search, git, terminals, diagnostics, approvals, and reviewable changes. Security projects use the same chat interface while executing tools in an assigned Kali environment over pinned SSH.

The current Security implementation has passed live Muse Spark/Kali fixture checks, confirmed Stop and follow-up messages, evidence previews, and native file saving. The portable Windows build is verified. Existing installed releases need a new installer before these features are available through their normal update flow; source pushes alone do not publish releases.

See the [Security workspace documentation](docs/security-workspace/README.md) for implementation and limits, [long-chat architecture](docs/LONG_CHAT_ARCHITECTURE.md) for paginated SQLite history and performance rules, and [reliable compaction](docs/reliable-compaction.md) for checkpoint preservation and recovery.

## What It Does

- Opens local workspaces and keeps project-scoped chats.
- Unread completed responses show a dot beside their chat and a Windows taskbar counter (1–9, then 9+). Each chat counts once; hidden subagent completions do not increase the counter. Read state persists across restarts. A completion is acknowledged after its end is visible in the focused chat for a second; focusing the app or reading another chat does not clear it. Stopped runs, failures and approvals are not completion badges. Windows taskbar settings can hide overlays.
- Browser snapshot refs are opaque and scoped to the tab and page lifetime; navigation, reload, and main-frame SPA route changes invalidate them. Browser results identify target tabs separately from the UI’s active tab. Evidence capture stays on its requested tab, and confirmed Shields blocks are reported separately from page failures.
- Filters the sidebar by All, Security, or Normal projects. Drag project headers to reorder them, or use Move project up/down in the project menu; ordering and the filter are remembered.
- Moves idle normal chats between normal projects by dragging onto a destination project or using Move to project in the chat menu. A confirmation explains that files stay put, previous approvals are revoked, and old messages cannot be rewound in the new folder. Completed subagents move with the chat. Active/resumable work blocks moves; Security chats remain bound to their original scope, jobs, and evidence.
- Lets the agent inspect files, search with ripgrep, edit files, run commands, and verify changes.
- Shows live agent activity as readable tool/check rows instead of raw logs.
- Supports approval gates for risky actions and reusable approval scopes.
- Keeps file diffs, hashes, warnings, and undo metadata for review.
- Provides Plan Mode for research/planning without mutating the workspace.
- Provides Reviewer Swarm mode for automatic read-only review by two read-only subagents before the final answer.
- Shows active and completed subagents, live child transcripts, and visible parent/child coordination messages.
- Compacts long conversations with preserved operator instructions, evidence references, operational state, validated checkpoints, and restart recovery.
- Stores settings, threads, workspaces, secrets, and recovery metadata locally.
- Creates explicit Security projects whose agent tools run in an assigned Kali
  environment, with live output, cancellation, job reconciliation, and evidence.

## Agent Tools

Current desktop tools include:

- `desktop_read_file` - read text or base64 file content with hashes and line-range metadata.
- `desktop_edit_file` - structured text edits such as replace range, replace text, insert, append, and delete range.
- `desktop_write_file` - create or replace text/base64 files, including missing parent directories.
- `desktop_apply_patch` - apply or dry-run Codex-style patch envelopes with better mismatch snippets.
- `desktop_list_dir` - list workspace folders, optionally with metadata.
- `desktop_search` - search workspace files with ripgrep.
- `desktop_delete_path` and `desktop_rename_path` - controlled workspace mutations.
- `exec_command`, `write_stdin`, `terminal_read`, `terminal_resize`, `terminal_stop`, and `terminal_list` - Codex-style terminal sessions.
- `desktop_run_diagnostics` - run the best detected project check.
- `desktop_git_status` and `desktop_git_diff` - concise git inspection, including clean non-repo messages.
- `generate_image`, `edit_image`, `list_generated_images`, and `save_generated_image` - native image generation with durable local files, inline previews, and workspace asset export.
- `request_user_input` - Plan Mode questions with user-selected answers.
- `browser_*` - built-in browser tools for tabs, screenshots, extraction, search, PDF evidence, form workflows, workflow replay, assertions, evidence vault records, and failure diagnosis.
- `computer_*` - optional native Computer Use tools for Windows app/window inspection, desktop snapshots, guarded actions, traces, screenshots, and failure diagnosis.
- `spawn_agent`, `send_message`, `assign_task`, `wait_agent`, `list_agents`, and `close_agent` - delegate work and coordinate child agents with visible transcripts and lifecycle events.

Security projects expose `kali_capabilities`, `kali_exec`, `kali_job_status`,
`kali_job_output`, `kali_job_cancel`, `kali_artifact`, `security_finding_list`, and
`security_finding_save`, alongside coordination tools and the allowed built-in
browser research tools. Host filesystem, terminal, computer controls, and browser
form actions are blocked in Security projects, including Full access mode.
Normal projects retain their existing tool selection. Kali execution uses the
existing Ask risky / Full access permissions and provider loop; connection loss
does not redirect execution to the host.

## Using a Security Project

1. Start the Kali VM and ensure SSH is reachable. The VM needs Python 3 and a deployed copy of `resources/kali/runner.py`.
2. Click the sidebar shield button to create a Security project. Import a private connection profile once, then reuse the saved environment for future projects. The profile references your local SSH key, pinned host key, remote runner path, and job directory; it contains no private-key contents.
3. Enter a project name, objective, and authorized scope. Choose **Check connection** to verify the environment.
4. Select your model and reasoning level in the normal composer, then describe the task. Open the Security header to inspect remote jobs, copy output, view findings, preview evidence, or save evidence through the native Save dialog.

Security chats can also search and read public pages, capture screenshots and
browser evidence, and read PDFs in Privora Browser. This
research traffic originates on your desktop; commands, tool installations and
target testing run in Kali. The agent checks passwordless sudo and can install
task-relevant tools under your existing authorization. Remote graphical browser
control is not yet included.

The bug bounty assessment guide loads automatically when the project objective
or an operator message expresses bug bounty assessment intent. It persists across
follow-up turns through saved operator context. Web pages and tool output cannot
activate it or grant target authorization. The guide supports investigation and
evidence discipline; it does not guarantee a finding, eligibility, or payment.

A reusable project objective:

```text
Assist with user-authorized security investigations across applications, networks,
code, files, and local labs. Inspect available tools, execute useful checks in Kali,
stream progress, validate results, and save evidence. Explain findings and fixes.
```

A reusable scope:

```text
Work on systems I own or explicitly authorize for each task. I will provide targets
and task-specific constraints in chat. Execute tools in the assigned Kali VM.
Ask when required authorization or a decision is unclear; confirm destructive changes.
```

**Ask risky** requests approval before remote commands. **Full access** runs them without those prompts; Kali's operating-system permissions still apply. It does not grant root, bypass sudo authentication, or authorize additional targets.

Stop waits for confirmed remote cancellation. If SSH is lost, the job remains unconfirmed until reconciliation; it is not automatically replayed. Quit and updates drain active work and report jobs whose termination cannot be confirmed.

This first version supports remote command execution and evidence, not remote GUI/browser control or interactive PTY sessions. Tool availability depends on architecture, privileges, and hardware. A 4 GB VM is a starting point for CLI workloads; measure heavier work before increasing RAM. See [Kali operations](docs/security-workspace/KALI_OPERATIONS.md) and [verification status](docs/security-workspace/DELIVERY.md).

## Plan Mode

Plan Mode is for research and design before implementation.

In Plan Mode, the agent can:

- Read/list/search files.
- Inspect git status and diffs.
- Run safe diagnostics.
- Use dry-run edits or patch previews.
- Ask focused user questions with `request_user_input`.
- Produce `<proposed_plan>...</proposed_plan>` blocks that render as plan cards.

In Plan Mode, mutating tools and risky terminal actions are blocked. When a proposed plan is ready, the UI can switch back to default mode and start implementation.

## Reviewer Swarm

Reviewer Swarm is an optional composer mode for higher-confidence turns.

When enabled, the main agent works normally. After qualifying tool work completes, Privora launches exactly two read-only reviewer subagents. They use the chat's Subagent model choice (Same as parent by default), inherit a compatible reasoning effort, run with nested swarms disabled, and inspect the turn for request satisfaction, bugs/regressions, missing tests, security risks, and data-loss risks.

Reviewer reports are fed back to the parent model before the final response. The parent writes the user-facing final answer naturally from those reports instead of relying on local keyword or regex pass/fail parsing. Reviewer startup failures or timeouts are surfaced as verification risk rather than deadlocking the parent turn.

## Subagents and Long Conversations

The book button beside the composer opens the **Prompt library**, available in
normal and Security chats. Search or filter saved prompts by category and chat
type; create, edit, delete, or save your current draft. **Insert** appends without
discarding the draft, **Copy** copies the text, and **Run** uses the selected chat's
normal model and permissions. Direct Run requires an empty composer and an idle,
available chat. Prompts stay locally in Privora's database across restarts. The
investigation-preparation prompt is included once and can be edited or deleted.
Saving a prompt does not load it automatically or add file access permissions.
Use the header's expand button for full-screen browsing. Prompts have editable
names and categories, quick Rename, Duplicate, and Pin actions. Search includes
stored prompt text; filtering and sorting run in the database with 50 summaries
per page, and only the selected prompt's body is loaded. Up to 10,000 prompts can
be stored. Unsaved content edits require saving or explicit discard before leaving.
Drag pinned prompt rows above or below each other to save a manual order. Keyboard
users can focus a pinned row and press Alt+Up or Alt+Down within the current page.
Pinned order is preserved across rename, sorting and restart.

Open the composer's model menu and choose **Subagent model** to select a separate
model for new children, including Reviewer Swarm. **Same as parent** is the default.
The choice is saved for this chat and as the default for new chats. Existing children
keep their assigned model on follow-up. The selected provider needs its usual
credentials or account access. Reasoning uses the parent's effort when supported,
otherwise the child model's default. Nested children follow the root chat's choice.

The Subagents panel separates active, completed, and needs-attention agents.
Open a child to follow its streamed conversation and tool activity. Inline events
show agent starts, completion, and coordination messages; completed transcripts
remain available for review.
Detailed child tool output stays in the Subagents panel. Parent chat shows brief
coordination rows at their captured stream positions; clicking a routed message
opens the relevant child. Queued/delivered updates keep the same row position.

Foreground compaction uses the selected model to produce a structured handoff.
Operator instructions with source references, configured Security scope, findings,
evidence IDs, job observations, subagent results, and tool references are preserved
separately from model-authored summary claims. Original chat records and artifacts
remain stored.

Checkpoint installation checks the captured source history and updates matching
run recovery state in one transaction. Newer messages and later assistant output
survive; stale candidates are rebuilt once, and cancellation preserves the prior
valid checkpoint. Invalid summaries receive one repair attempt before a
deterministic fallback. Recent tool exchanges remain complete.

The timeline shows preparing, summarizing, validating, and resuming stages with
estimated before/after usage. Budget checks include system instructions and tool
schemas. If required state cannot fit, the agent pauses visibly rather than
discarding it. Counts remain estimates, and cache reuse is not guaranteed. Native
provider compaction and background compaction are not part of this release.

See [reliable compaction](docs/reliable-compaction.md) for behavior, recovery, and
verification details.

## Desktop UI

The renderer includes:

- Workspace sidebar with project-scoped chats.
- Composer with prompt history, large-paste handling, image attachments, model/provider controls, permission mode, Plan Mode, Computer Use, and Reviewer Swarm.
- Tool timeline with live shimmer, compact activity grouping, expandable terminal output, file-change summaries, and answered-question details.
- Review/undo surfaces for file changes.
- Built-in Browser panel with real tabs, native page rendering, compact browser tools menu, current-page evidence, workflow replay, download tracking, PDF evidence, and form analysis.
- Built-in Notes panel with global/workspace drafts, file-backed notes, Save As, and agent notes tools.
- Native image-generation timeline rows with inline generated previews and saved asset paths.
- Expandable terminal activity rows in chat with compact streamed output and session controls.
- Optional Computer Use mode for guarded native Windows app control with semantic snapshots, action traces, and hard safety blocks.
- Reviewer Swarm mode with an active pill and multi-agent icon.
- Subagent status indicators, inline lifecycle/coordination events, and a live transcript panel.
- Compaction progress and context usage that distinguishes estimates from provider-reported usage.
- Compact settings access for providers, project options, local storage and update status.
- Settings screen for providers, browser storage cleanup, theme, workspace options, shortcuts, and update status.
- Clear recovery/error notices if local SQLite storage cannot be opened safely.
- Security project creation with objective, scope, private connection-profile
  import, and connection checks. A compact chat header opens job/output details,
  Stop controls, findings, and evidence-file previews/downloads on demand.

## Architecture

```text
src/
  main/
    agent/          Agent runtime, providers, tools, diagnostics, context, approvals
    computer/       Native Computer Use backends, safety rules, tool adapter
    db/             SQLite store, artifacts, workspaces, threads, settings, secrets
    imageGeneration Native image generation providers, file storage, previews, workspace export
    ipc/            Main-process IPC channels and validation
    kali/           Pinned SSH transport, remote jobs, tools and evidence
    security/       Workspace path checks and redaction helpers
    terminal/       PTY/process session manager
    main.ts         Electron lifecycle and BrowserWindow setup
  preload/          Context-isolated desktop API bridge
  renderer/         React UI, state hooks, components, styles
  shared/           Shared models and TypeScript types
tests/              Vitest coverage for runtime/tool/storage behavior
```

## Providers

Supported provider paths are configured in the app settings and shared model catalog:

- CLIProxy API, defaulting to `http://127.0.0.1:8317`
- OpenCode Go with the user's configured Go credentials, including DeepSeek V4.1 Flash (Go)
- Gemini API
- OpenRouter API for BYOK

Secrets are stored through the local desktop store and are not exposed directly to the renderer.
Provider usage is billed by the provider you configure; Privora does not operate an account or credit gateway.

CLIProxy model aliases are owned by Privora Desktop in the first implementation, so users do not need to edit CLIProxy's `oauth-model-alias` config for supported models. Desktop also sends a thread-scoped `prompt_cache_key` to CLIProxy Responses requests so Codex-backed sessions can reuse stable prompt context and keep session routing consistent.

Composer model and reasoning selections are saved as global defaults for future new chats and as overrides on the active thread. Thread-scoped modes such as Plan Mode and Reviewer Swarm remain per-thread.

DeepSeek V4.1 Flash (Go) is the only DeepSeek model offered in the picker. Retired
DeepSeek selections resolve to this Go model; it requires a configured Go key and
subscription. Its context/output metadata uses Go family defaults, and discovery
does not restore retired DeepSeek entries.

## Requirements

- Node.js 22.12 or later; Node.js 24 LTS is a suitable choice for development and packaging
- npm
- Git
- Windows is the primary development target right now

## Install

```bash
npm install
```

Run this from `apps/desktop`.

## Development

```bash
npm run dev
```

This starts Electron Forge with Vite bundles for the main process, preload, and renderer.

Useful scripts:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the desktop app in development mode |
| `npm run dev:log` | Start with Electron logging |
| `npm run dev:trace` | Start with `PRIVORA_DEBUG=1` and logging |
| `npm run dev:debug` | Start with Electron inspect enabled |
| `npm run dev:debug:break` | Start and break on first main-process line |
| `npm run lint` | TypeScript check with `tsc --noEmit` |
| `npm test` | Run Vitest tests |
| `npm run build` | Package the Electron app |
| `npm run make` | Build distributables/installers |
| `npm run release:win:x64 -- --notes "..."` | Build, upload, and publish the Windows x64 update feed |

## Browser Agent

The built-in browser agent is documented in [docs/browser-agent.md](docs/browser-agent.md). It covers Phase 2A tabs/downloads/PDF evidence, Phase 2B form workflows, Phase 2C workflow replay, assertions, evidence vault, and failure diagnosis, Phase 2D-lite storage cleanup, and Phase 2E-lite Privora Shields ad/tracker blocking.

## Notes

The built-in notepad is documented in [docs/notes.md](docs/notes.md). It covers global/workspace notes, file-backed notes, autosaved local drafts, large-note behavior, and agent note tools.

## Image Generation

Native image generation is documented in [docs/image-generation.md](docs/image-generation.md). It covers CLIProxy `gpt-image-2`, Gemini Nano Banana 2, generated image storage, inline previews, and exporting generated images into workspace assets.

## Terminal

The unified terminal runtime is documented in [docs/terminal.md](docs/terminal.md). It covers the `exec_command` lifecycle, persistent sessions, `write_stdin`, `terminal_read`, immediate stop behavior, diagnostics routing, and the Terminal panel.

## Computer Use

The native desktop-control surface is documented in [docs/computer-use.md](docs/computer-use.md). Privora uses its audited Windows-native backend and hard-blocks secure desktop, credentials/MFA/payment data, hidden secrets, elevated/system boundaries, and irreversible real-world actions.

## Production Updates

Automatic updates require a Squirrel-installed Windows build and its `Update.exe`.
Portable packages report updates as unsupported. `npm run build` creates a local
portable package; `npm run make` creates distributables. Neither command publishes
the update feed. Publishing is a separate action through the release command below.

Windows x64 builds use the Appwrite-hosted update feed at:

```text
https://updates.nexdark.com/win32/x64/stable
```

Use `npm run release:win:x64 -- --notes "Release notes"` from `apps/desktop` to build, upload the installer/NUPKG, and publish feed metadata. The release command requires a temporary Appwrite API key in `APPWRITE_RELEASE_API_KEY` or `APPWRITE_API_KEY`; never commit that key.

The public Windows download page at `https://privora.nexdark.com/download` reads the same stable release metadata, so publishing a new stable release updates the installer download without a website code change.

## Current Stack

From `package.json`:

- Electron `^42.9.2`
- Electron Forge `^7.11.2`
- React `^19.2.6`
- TypeScript `^6.0.3`
- Vite `^8.0.16`
- Vitest `^4.1.7`
- node-pty `^1.1.0`
- `@vscode/ripgrep` for workspace search
- `@google/genai`, OpenRouter-compatible API support, and CLIProxy-compatible responses

## Testing

Run:

```bash
npm test
```

The tests cover SQLite storage, storage cleanup, tool execution, file reads/writes/patches/edits, diagnostics, terminal sessions, thread isolation, browser tools, browser workflows, Computer Use safety/tool contracts, composer settings persistence, Reviewer Swarm behavior, and runtime behavior.

Security coverage includes environment routing, durable jobs, uncertain delivery,
cancellation, findings, evidence access/saving, shutdown, and Responses call-ID
deduplication. Live Kali tests are opt-in and need a private profile referencing a
verified SSH host and deployed runner:

```powershell
$env:PRIVORA_KALI_TEST_PROFILE = 'C:\private\privora-kali-test-profile.json'
npm test -- --maxWorkers=1
```

The 13 October 2026 verification passed 482 tests including real SSH checks,
TypeScript, the Windows package, and the production dependency audit. This is a
fixture verification baseline, not a guarantee that every assessment or tool works.

The 14 October 2026 compaction verification passed 650 tests, with 7 skipped,
plus TypeScript and the Windows package build. Independent review found and
verified fixes for history restoration, stale retries, budget checks, redaction,
and steer delivery. Provider request serialization was tested through mocked Go
Chat Completions, Responses, Messages, and Gemini interactions. These checks do
not establish live behavior across every paid model or replace assessment acceptance.

For a quick compile check:

```bash
npm run lint
```

## Safety Notes

- File and directory operations are workspace-relative.
- The app validates IPC payloads with typed schemas.
- Risky edits and terminal commands can require approval depending on permission mode.
- Plan Mode blocks mutating actions by design.
- SQLite failures surface clear recovery errors instead of silently resetting data.
- Do not commit local secrets or generated runtime data.

## Repository Hygiene

Before committing:

```bash
git status
npm run lint
npm test
```

Do not include local runtime folders such as `.antigravitycli/` unless intentionally needed.

The root `.gitignore` excludes dependencies, build output, logs, Python caches,
local `privora-kali*.json` profiles, dedicated Kali SSH keys/host pins, and SQLite
runtime databases. Keep real machine profiles and credentials outside the repo.

### Automatic local Security evidence copies

Every file collected with `kali_artifact` is also saved automatically under
`Documents/Privora Evidence`, in a separate project folder. Each collection keeps
its original bytes and a manifest containing the source job ID, remote path and
SHA-256 hash. Earlier copies are preserved. The Security project details show the
folder and an **Open folder** action. Remote-only files must first be collected;
this is not a VM folder sync. A PC write failure is reported while Privora retains
its internal evidence copy. This does not enable general host tools in Security chats.

While a Security workspace is visible, connection observations expire after 30
seconds and UI polling schedules a throttled read-only reachability check. Stale
observations show **Needs check**, SSH failures show **Disconnected**, and a
successful check restores **Connected**. Unknown jobs still require reconciliation;
connection recovery never resubmits a command automatically.
