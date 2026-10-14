# Privora Desktop

Privora Desktop is an Electron agent app for local development and connected security work. Normal projects give the agent access to workspace files, search, git, terminals, diagnostics, approvals, and reviewable changes. Security projects use the same chat interface while executing tools in an assigned Kali environment over pinned SSH.

The current Security implementation has passed live Muse Spark/Kali fixture checks, confirmed Stop and follow-up messages, evidence previews, and native file saving. The portable Windows build is verified. Existing installed releases need a new installer before these features are available through their normal update flow; source pushes alone do not publish releases.

See the [Security workspace documentation](docs/security-workspace/README.md) for implementation and limits, and [long-chat architecture](docs/LONG_CHAT_ARCHITECTURE.md) for paginated SQLite history and performance rules.

## What It Does

- Opens local workspaces and keeps project-scoped chats.
- Lets the agent inspect files, search with ripgrep, edit files, run commands, and verify changes.
- Shows live agent activity as readable tool/check rows instead of raw logs.
- Supports approval gates for risky actions and reusable approval scopes.
- Keeps file diffs, hashes, warnings, and undo metadata for review.
- Provides Plan Mode for research/planning without mutating the workspace.
- Provides Reviewer Swarm mode for automatic read-only review by two model-inheriting subagents before the final answer.
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

Security projects expose `kali_capabilities`, `kali_exec`, `kali_job_status`,
`kali_job_output`, `kali_job_cancel`, `kali_artifact`, `security_finding_list`, and
`security_finding_save` instead of host file, terminal, browser, or computer tools.
Normal projects retain their existing tool selection. Kali execution uses the
existing Ask risky / Full access permissions and provider loop; connection loss
does not redirect execution to the host.

## Using a Security Project

1. Start the Kali VM and ensure SSH is reachable. The VM needs Python 3 and a deployed copy of `resources/kali/runner.py`.
2. Click the sidebar shield button to create a Security project. Import a private connection profile once, then reuse the saved environment for future projects. The profile references your local SSH key, pinned host key, remote runner path, and job directory; it contains no private-key contents.
3. Enter a project name, objective, and authorized scope. Choose **Check connection** to verify the environment.
4. Select your model and reasoning level in the normal composer, then describe the task. Open the Security header to inspect remote jobs, copy output, view findings, preview evidence, or save evidence through the native Save dialog.

Security chats can also search and read public pages in Privora Browser. This
research traffic originates on your desktop; commands, tool installations and
target testing run in Kali. The agent checks passwordless sudo and can install
task-relevant tools under your existing authorization. Remote graphical browser
control is not yet included.

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

When enabled, the main agent works normally. After qualifying tool work completes, Privora launches exactly two read-only reviewer subagents. They inherit the parent thread's model/provider and reasoning effort, run with nested swarms disabled, and inspect the turn for request satisfaction, bugs/regressions, missing tests, security risks, and data-loss risks.

Reviewer reports are fed back to the parent model before the final response. The parent writes the user-facing final answer naturally from those reports instead of relying on local keyword or regex pass/fail parsing. Reviewer startup failures or timeouts are surfaced as verification risk rather than deadlocking the parent turn.

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
- Codex-style account menu with Profile, Settings, Usage remaining, and Log out actions.
- Settings screen for profile, billing, providers, browser storage cleanup, theme, workspace options, shortcuts, and update status.
- Clear recovery/error notices if local SQLite storage cannot be opened safely.
- Security project creation with objective, scope, private connection-profile
  import, and connection checks. A compact chat header opens job/output details,
  Stop controls, findings, and evidence-file previews/downloads on demand.

## Architecture

```text
src/
  main/
    agent/          Agent runtime, providers, tools, diagnostics, context, approvals
    billing/        Appwrite account handoff, local browser auth callback, AI credit summary
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
- OpenCode Go through its existing hosted-model adapter
- DeepSeek API for BYOK
- Gemini API
- OpenRouter API for BYOK
- Privora Cloud hosted models through the Appwrite model gateway

Secrets are stored through the local desktop store and are not exposed directly to the renderer.
BYOK requests consume 0 Privora AI credits. Hosted Privora Cloud requests are charged by the server-side credit engine.

CLIProxy model aliases are owned by Privora Desktop in the first implementation, so users do not need to edit CLIProxy's `oauth-model-alias` config for supported models. Desktop also sends a thread-scoped `prompt_cache_key` to CLIProxy Responses requests so Codex-backed sessions can reuse stable prompt context and keep session routing consistent.

Composer model and reasoning selections are saved as global defaults for future new chats and as overrides on the active thread. Thread-scoped modes such as Plan Mode and Reviewer Swarm remain per-thread.

## Browser Sign-In

Desktop account sign-in opens Privora Web in the system browser. The authenticated web app asks the `model-gateway` function for a short-lived, single-use Appwrite custom token. Desktop exchanges that token for its own durable Appwrite session cookie, then creates fresh short-lived JWTs from that session when calling hosted APIs.

Local development sends the token through a loopback callback. Production sends it through the state-verified `privora://auth/callback` protocol URL. Desktop stores the durable session cookie and optional profile display fields in OS-backed secret storage. It does not store the OpenRouter hosted key.

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
| `npm run saas:setup:credits` | Create/seed Appwrite AI credit collections |
| `npm run saas:admin:credits -- <command>` | Manual grants, plan changes, usage checks, and hosted-access disable |

## SaaS AI Credits

The SaaS credit engine lives in the shared Appwrite project and is documented in [docs/saas-ai-credits.md](docs/saas-ai-credits.md).

Launch pricing is INR-first:

- Free: BYOK only
- Plus: INR 799/mo with 5,000 AI credits/month
- Pro: INR 1,999/mo with 20,000 AI credits/month

AI credits are consumed based on model, input size, output size, and tool usage. Premium models consume credits faster. BYOK usage does not consume Privora AI credits.

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
