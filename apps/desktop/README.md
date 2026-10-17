# Privora Desktop

Privora is an Electron AI workspace for local development, browser research, and connected security investigations. Project chats, live tool activity, terminal sessions, file review, and subagent transcripts share one interface. Configure your own model credentials; no Privora account or credit balance is required.

See the [repository overview](../../README.md) for the product introduction and the separate [marketing app](../marketing/README.md) for the public website.

Provider model lists are discovered using your saved API key or local connection. In **Settings > Providers**, open a provider, browse its catalog, and add models to the composer and subagent picker. See [provider discovery and offline behavior](docs/provider-model-catalogs.md). OpenRouter also retains its [pricing controls](docs/openrouter-models.md).

## Setup

Requirements: Git, npm, and Node.js 22.12 or newer. Windows is the primary development and verified packaging target. The default development command uses Windows shell syntax; native Computer Use also targets Windows.

Run from `apps/desktop`:

```powershell
npm ci
npm run dev
```

Electron Forge starts Vite builds for the main process, preload bridge, and React renderer. The default `dev` command skips rebuilding the PTY dependency. Use `npm run dev:pty` when native PTY dependencies need rebuilding.

Open **Settings > Providers**, configure a provider, then select a project folder and model. Model capabilities determine image input and reasoning options.

## Providers

| Connection | Setup |
| --- | --- |
| **OpenAI** | Add an OpenAI API key for GPT and Codex API models; API billing applies. |
| **Claude** | Add an Anthropic API key; API billing applies. |
| **DeepSeek** | Add your DeepSeek API key. |
| **Gemini** | Add your Gemini API key in provider settings. |
| **OpenRouter** | Add your own OpenRouter API key. |
| **OpenCode Go** | Add your Go credentials and select an available model. Named accounts can be selected explicitly. |
| **CLIProxy** | Configure a local compatible endpoint; the default base URL is `http://127.0.0.1:8317`. |

The model picker shows your enabled discovered models. New and retired models are reconciled against provider catalogs. Access, quotas, and charges are handled by the selected provider. See [CLIProxy setup](../../docs/cliproxy-openai.md) and [Go accounts](docs/go-accounts-and-streaming-chat.md).

Credentials use Electron's OS-backed secret storage. Chats and artifacts are stored locally. Configured remote providers receive the request context needed for inference.

## Workflows

**Local projects.** Inspect and search files, edit or patch code, inspect Git changes, and run diagnostics. Expand tool rows for output and review recorded changes. Undo and message rewind depend on captured changes and current file state; keep using version control.

**Terminal sessions.** Follow elapsed time and streamed output. Long-running commands return a session ID for later input and output reads. The terminal panel and agent tools share the session runtime. See [terminal behavior](docs/terminal.md).

**Browser research.** Use tabs, page snapshots, inspection, screenshots, search, downloads, PDF evidence, form workflows, and workflow replay. See [browser tools](docs/browser-agent.md).

**Subagents.** Open a child agent to follow its streamed conversation and tools. Coordination messages stay associated with their place in the conversation. Choose child model and reasoning settings in the composer; see [model selection and ordering](docs/subagent-models-and-live-order.md).

**Plan Mode and Reviewer Swarm.** Plan Mode permits inspection and research while blocking mutations. Reviewer Swarm adds two read-only reviewers after qualifying work, then returns their reports to the parent before its final response.

**Prompts, notes, and images.** Save reusable prompts locally, keep global or project notes, attach images to compatible models, and generate or export workspace assets. See [notes](docs/notes.md) and [image generation](docs/image-generation.md).

**Computer Use.** Enable the optional Windows app-control tools from the composer. Semantic inspection and background actions are preferred; foreground interaction depends on the app surface and permission. See [capabilities and boundaries](docs/computer-use.md).

## Security projects

Security projects route commands to an assigned Kali environment over pinned SSH.

1. Prepare reachable Kali SSH access, Python 3, and a deployed copy of `resources/kali/runner.py`.
2. Create a Security project using the sidebar shield button.
3. Import a private profile referencing the SSH key, pinned host key, runner, and remote job directory.
4. Set the objective and authorized scope, then check the connection.
5. Start work and open the Security header to inspect jobs, output, findings, and evidence.

Collected artifacts are retained internally and can have automatic PC copies with source metadata and hashes. Use **Saved to PC** to check the current local file and copy its path or open its folder. Remote files must first be collected; this is not a VM folder sync.

Host filesystem, terminal, and Computer Use tools are blocked in Security projects. Public browser research uses the desktop's connection; target commands execute in Kali. Connection loss does not redirect commands to the host or automatically replay uncertain jobs. Remote GUI control and interactive Kali PTY sessions are not included.

See the [Security guide](docs/security-workspace/README.md), [Kali operations](docs/security-workspace/KALI_OPERATIONS.md), and [connection recovery](docs/security-workspace/CONNECTION_RECOVERY.md).

## State and recovery

SQLite stores chats, settings, workspaces, prompts, drafts, and recovery metadata. Larger content and attachments use a local artifact store. Edited prompts retain durable image references. Legacy inline attachments are checked against their recorded size and hash before recovery.

The renderer reconciles runtime state after reconnecting. Long conversations use compaction to preserve instructions, operational state, and evidence references. Supported interrupted work can resume from checkpoints without blindly replaying completed tools. Unconfirmed remote jobs require reconciliation.

See [state recovery](docs/desktop-state-recovery.md), [compaction](docs/reliable-compaction.md), and [long-chat architecture](docs/LONG_CHAT_ARCHITECTURE.md).

## Development commands

Run from `apps/desktop`:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start development mode, skipping the PTY rebuild. |
| `npm run dev:pty` | Start with native dependency rebuilding. |
| `npm run dev:log` | Enable Electron logging. |
| `npm run dev:trace` | Enable Privora debug output and Electron logging. |
| `npm run dev:debug` | Start with the Electron inspector. |
| `npm run lint` | Check TypeScript. |
| `npm test` | Run the Vitest suite. |
| `npm test -- --run tests/messageRewind.test.ts` | Run a focused test file. |
| `npm run build` | Package a local Electron application. |
| `npm run make` | Create distributables for the current target. |
| `npm run make:win:x64` | Create Windows x64 distributables. |
| `npm run make:mac` | Create macOS ARM64 distributables. |
| `npm run make:mac:x64` | Create macOS x64 distributables. |

Platform-specific build prerequisites still apply. Packaging commands alone do not establish cross-platform runtime support.

Tests cover streaming, execution, approvals, cancellation, SQLite and artifacts, attachment rewind, subagents, browser contracts, Security jobs, and recovery. Live Kali tests require a private profile:

```powershell
$env:PRIVORA_KALI_TEST_PROFILE = 'C:\private\privora-kali-test-profile.json'
npm test -- --maxWorkers=1
```

## Packaging and updates

On Windows x64, `npm run build` produces `out/Privora-win32-x64/`. Portable packages do not support Squirrel automatic updates. Installed Windows builds need the installer and its `Update.exe`.

Publishing is separate:

```powershell
npm run release:win:x64 -- --notes "Release notes" --publish
```

The release command prepares verified Windows artifacts; `--publish` uploads them over SSH to the self-hosted update service. Source pushes, local packaging, and website builds do not publish an installer. See the [release guide](../../docs/desktop-auto-updates.md).

## Architecture

```text
src/
  main/
    agent/           Model adapters, turn coordination, tools, and recovery
    attachments/     Attachment protocol and evidence saving
    browser/         Embedded browser sessions and tools
    computer/        Windows Computer Use backend
    db/              SQLite records and artifact storage
    imageGeneration/ Image providers and generated files
    ipc/             Validated main-process API handlers
    kali/            SSH connector, remote jobs, and evidence
    notes/           Notes persistence
    security/        Workspace boundaries and redaction
    terminal/        Process and PTY sessions
  preload/           Context-isolated renderer API bridge
  renderer/          React interface and state reconciliation
  shared/            Model catalog, schemas, and shared types
resources/kali/      Remote Python runner
tests/               Runtime, rendering, storage, and tool tests
```

The app uses Electron, React, TypeScript, Vite, Electron Forge, SQLite, node-pty, and ripgrep. Dependency versions live in `package.json` and `package-lock.json`.

## Permissions and contribution checks

File operations enforce workspace boundaries and IPC inputs are validated. **Ask risky** and **Full access** govern ordinary approvals; Full access does not grant OS privileges or remove Security project and Computer Use boundaries.

Inspect the diff and run focused tests, `npm run lint`, and broader tests when shared behavior changes. Keep real provider keys, SSH profiles, private keys, signing credentials, runtime databases, and evidence outside published source.
