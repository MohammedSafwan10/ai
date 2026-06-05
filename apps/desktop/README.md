# Privora Desktop

Privora Desktop is a local-first Electron coding-agent app for working inside real project folders. It gives an AI agent controlled access to workspace files, search, git, terminal processes, diagnostics, approvals, and reviewable file changes from a desktop UI.

The app is inspired by Codex-style local agent workflows, but is built as a desktop application with persistent workspaces, project chats, visual tool timelines, approvals, undo metadata, Plan Mode, and provider settings.

## What It Does

- Opens local workspaces and keeps project-scoped chats.
- Lets the agent inspect files, search with ripgrep, edit files, run commands, and verify changes.
- Shows live agent activity as readable tool/check rows instead of raw logs.
- Supports approval gates for risky actions and reusable approval scopes.
- Keeps file diffs, hashes, warnings, and undo metadata for review.
- Provides Plan Mode for research/planning without mutating the workspace.
- Stores settings, threads, workspaces, secrets, and recovery metadata locally.

## Agent Tools

Current desktop tools include:

- `desktop_read_file` - read text or base64 file content with hashes and line-range metadata.
- `desktop_edit_file` - structured text edits such as replace range, replace text, insert, append, and delete range.
- `desktop_write_file` - create or replace text/base64 files, including missing parent directories.
- `desktop_apply_patch` - apply or dry-run Codex-style patch envelopes with better mismatch snippets.
- `desktop_list_dir` - list workspace folders, optionally with metadata.
- `desktop_search` - search workspace files with ripgrep.
- `desktop_delete_path` and `desktop_rename_path` - controlled workspace mutations.
- `desktop_spawn_process`, `desktop_write_process`, `desktop_resize_process`, `desktop_kill_process` - terminal lifecycle tools.
- `desktop_run_diagnostics` - run the best detected project check.
- `desktop_git_status` and `desktop_git_diff` - concise git inspection, including clean non-repo messages.
- `request_user_input` - Plan Mode questions with user-selected answers.
- `browser_*` - built-in browser tools for tabs, screenshots, extraction, search, PDF evidence, form workflows, workflow replay, assertions, evidence vault records, and failure diagnosis.

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

## Desktop UI

The renderer includes:

- Workspace sidebar with project-scoped chats.
- Composer with prompt history, large-paste handling, image attachments, model/provider controls, permission mode, and Plan mode.
- Tool timeline with live shimmer, compact activity grouping, expandable terminal output, file-change summaries, and answered-question details.
- Review/undo surfaces for file changes.
- Built-in Browser panel with real tabs, native page rendering, compact browser tools menu, current-page evidence, workflow replay, download tracking, PDF evidence, and form analysis.
- Codex-style account menu with Profile, Settings, Usage remaining, and Log out actions.
- Settings screen for profile, billing, providers, theme, workspace options, shortcuts, and update status.
- Recovery notice if the local JSON store is corrupt and Privora has to back it up.

## Architecture

```text
src/
  main/
    agent/          Agent runtime, providers, tools, diagnostics, context, approvals
    billing/        Appwrite account handoff, local browser auth callback, AI credit summary
    db/             Local JSON store, recovery, workspaces, threads, settings, secrets
    ipc/            Main-process IPC channels and validation
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
- Gemini API
- OpenRouter API for BYOK
- Privora Cloud hosted models through the Appwrite model gateway

Secrets are stored through the local desktop store and are not exposed directly to the renderer.
BYOK requests consume 0 Privora AI credits. Hosted Privora Cloud requests are charged by the server-side credit engine.

CLIProxy model aliases are owned by Privora Desktop in the first implementation, so users do not need to edit CLIProxy's `oauth-model-alias` config for supported models. Desktop also sends a thread-scoped `prompt_cache_key` to CLIProxy Responses requests so Codex-backed sessions can reuse stable prompt context and keep session routing consistent.

## Browser Sign-In

Desktop account sign-in opens Privora Web in the system browser. The authenticated web app asks the `model-gateway` function for a short-lived, single-use Appwrite custom token. Desktop exchanges that token for its own durable Appwrite session cookie, then creates fresh short-lived JWTs from that session when calling hosted APIs.

Local development sends the token through a loopback callback. Production sends it through the state-verified `privora://auth/callback` protocol URL. Desktop stores the durable session cookie and optional profile display fields in OS-backed secret storage. It does not store the OpenRouter hosted key.

## Requirements

- Node.js 18+ recommended
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

The built-in browser agent is documented in [docs/browser-agent.md](docs/browser-agent.md). It covers Phase 2A tabs/downloads/PDF evidence, Phase 2B form workflows, and Phase 2C workflow replay, assertions, evidence vault, and failure diagnosis.

## Production Updates

Windows x64 builds use the Appwrite-hosted update feed at:

```text
https://updates.nexdark.com/win32/x64/stable
```

Use `npm run release:win:x64 -- --notes "Release notes"` from `apps/desktop` to build, upload the installer/NUPKG, and publish feed metadata. The release command requires a temporary Appwrite API key in `APPWRITE_RELEASE_API_KEY` or `APPWRITE_API_KEY`; never commit that key.

The public Windows download page at `https://privora.nexdark.com/download` reads the same stable release metadata, so publishing a new stable release updates the installer download without a website code change.

## Current Stack

From `package.json`:

- Electron `^42.3.0`
- Electron Forge `^7.11.2`
- React `^19.2.6`
- TypeScript `^6.0.3`
- Vite `^8.0.14`
- Vitest `^4.1.7`
- node-pty `^1.1.0`
- `@vscode/ripgrep` for workspace search
- `@google/genai`, OpenRouter-compatible API support, and CLIProxy-compatible responses

## Testing

Run:

```bash
npm test
```

The tests cover storage recovery, tool execution, file reads/writes/patches/edits, diagnostics, terminal sessions, thread isolation, browser tools, browser workflows, and runtime behavior.

For a quick compile check:

```bash
npm run lint
```

## Safety Notes

- File and directory operations are workspace-relative.
- The app validates IPC payloads with typed schemas.
- Risky edits and terminal commands can require approval depending on permission mode.
- Plan Mode blocks mutating actions by design.
- Store corruption is handled by backing up the damaged data file and starting with a clean store instead of silently losing state.
- Do not commit local secrets or generated runtime data.

## Repository Hygiene

Before committing:

```bash
git status
npm run lint
npm test
```

Do not include local runtime folders such as `.antigravitycli/` unless intentionally needed.
