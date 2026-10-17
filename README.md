# Privora Desktop

**An AI workspace for coding, browser research, and connected security investigations. Bring your own model keys.**

Privora combines project chats, files, terminal sessions, a built-in browser, and live subagents in one Electron desktop app. Work in a local codebase, review the agent's changes, or connect a Security project to Kali for remote tools and evidence collection.

This repository contains the **desktop app** and its **static marketing website**. No Privora account, subscription, or AI credits are required. Model access and usage costs belong to the provider you configure.

[Desktop guide](apps/desktop/README.md) · [Security setup](apps/desktop/docs/security-workspace/README.md) · [Marketing site](apps/marketing/README.md) · [Report an issue](https://github.com/MohammedSafwan10/privora-desktop/issues)

## What you can do

| Workflow | Included capabilities |
| --- | --- |
| **Work on local projects** | Read and search files, edit and patch code, inspect Git changes, run diagnostics, and review recorded changes. |
| **Run commands** | Follow streamed output and elapsed time, send input to persistent sessions, and stop processes. |
| **Research in the browser** | Use tabs, page inspection, search, screenshots, PDF extraction, downloads, and reusable browser workflows. |
| **Coordinate subagents** | Delegate tasks, follow child transcripts live, and inspect coordination messages and results. |
| **Plan and review** | Research in Plan Mode before implementing, or enable Reviewer Swarm for two read-only reviewers before the final response. |
| **Investigate in Kali** | Run remote jobs over pinned SSH, reconcile job state, track findings, and collect evidence with local copies and hashes. |
| **Keep working context** | Organize project chats, save prompts and notes, attach images, and resume supported interrupted work from checkpoints. |
| **Create visual assets** | Generate and edit images through configured providers, preview results, and export files into the workspace. |
| **Use Windows apps** | Enable optional Computer Use for semantic app inspection and guarded desktop actions. |

Windows is the primary development and verified packaging target. macOS packaging commands are available; feature parity is not established, and native Computer Use currently targets Windows.

## Get started from source

Install **Git**, **Node.js 22.12 or newer**, and **npm**. In PowerShell:

```powershell
git clone https://github.com/MohammedSafwan10/privora-desktop.git
cd privora-desktop
npm --prefix apps/desktop ci
npm run desktop:dev
```

In Privora:

1. Open **Settings > Providers** and configure your model provider.
2. Open a local project folder, or create a Security project with a configured Kali environment.
3. Choose a model and access mode, then describe the task in chat.
4. Follow tool activity, expand output when needed, and review the result.

Connect OpenAI, Claude, Gemini, DeepSeek, OpenRouter, OpenCode Go, or a local CLIProxy endpoint. Browse each provider's live catalog in Settings and add models to the composer and subagent picker. Capabilities and availability depend on the provider and your account; missing metadata is identified rather than guessed. See [provider setup](apps/desktop/README.md#providers) and [catalog refresh and recovery](apps/desktop/docs/provider-model-catalogs.md).

## Data and execution

Chats, settings, drafts, prompts, notes, artifacts, and recovery state are stored locally. Provider credentials use OS-backed secret storage. Remote model providers receive the context needed for their requests; local persistence does not make remote inference offline. Browser research also makes network requests from the desktop.

Build projects run workspace tools on your computer. Security projects route commands to their assigned Kali environment and keep remote jobs and evidence tied to that project. Collected evidence can have automatic PC copies. The **Saved to PC** controls check the recorded local file before copying its path or opening its folder.

**Ask risky** and **Full access** control ordinary approvals. Plan Mode restricts mutations. Full access does not change OS privileges, expand a Security project's target scope, or remove Computer Use's hard boundaries.

## Develop and build

Each app owns its dependencies and lockfile. Root commands are shortcuts to those apps.

| Command | Purpose |
| --- | --- |
| `npm run desktop:dev` | Start the Electron app with Vite. |
| `npm run desktop:lint` | Check desktop TypeScript. |
| `npm test` | Run the desktop test suite. |
| `npm run desktop:build` | Create a local desktop package. |
| `npm run marketing:dev` | Start the marketing site. |
| `npm run marketing:build` | Build pre-rendered static pages. |
| `npm run marketing:preview` | Preview the built website. |
| `npm run lint` | Check both apps after installing both sets of dependencies. |

For website development, first run `npm --prefix apps/marketing ci`. The build produces `apps/marketing/dist/`, ready for a static host with directory-index support. It includes product, download, BYOK, and legal pages without a server runtime or account SDK. The site and persistent release service deploy independently on Coolify; source pushes do not publish a desktop binary.

Desktop packaging uses Electron Forge. `desktop:build` produces a local package; it does not publish downloads or an update feed. See [Windows releases and updates](docs/desktop-auto-updates.md) for distribution commands and credentials.

## Repository layout

```text
apps/
  desktop/       Electron app, agent runtime, tools, UI, and tests
  marketing/     Static product, download, BYOK, and legal pages
  releases/      Read-only Nginx update feed and verified promotion tools
docs/            Repository and desktop operations guides
```

The original repository's commit history remains here. Other products have independent repositories:

- [privora-workspace](https://github.com/MohammedSafwan10/privora-workspace) — the browser AI workspace.
- [privora-mobile](https://github.com/MohammedSafwan10/privora-mobile) — the Flutter app.
- [privora-platform](https://github.com/MohammedSafwan10/privora-platform) — legacy account, billing, hosted-model, and update-feed services.

See [repository boundaries](docs/repository-layout.md) for extraction details.

## Documentation

- [Desktop setup, providers, and architecture](apps/desktop/README.md)
- [Terminal sessions](apps/desktop/docs/terminal.md)
- [Browser tools](apps/desktop/docs/browser-agent.md)
- [Subagent models and live ordering](apps/desktop/docs/subagent-models-and-live-order.md)
- [Security projects and Kali](apps/desktop/docs/security-workspace/README.md)
- [Connection and state recovery](apps/desktop/docs/desktop-state-recovery.md)
- [Long-session compaction](apps/desktop/docs/reliable-compaction.md)
- [Notes](apps/desktop/docs/notes.md), [image generation](apps/desktop/docs/image-generation.md), and [Computer Use](apps/desktop/docs/computer-use.md)
- [Static marketing site](apps/marketing/README.md)

## Contributing

Keep changes focused and run checks relevant to the affected app. For desktop changes, start with `npm run desktop:lint` and `npm test`. Bug reports should include reproduction steps, the provider/model involved, and expected behavior.

Keep API keys, SSH profiles and private keys, signing material, runtime databases, and collected evidence out of commits and issue attachments. Redact logs before sharing them.
