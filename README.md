# Privora

Privora Desktop is a local-first coding and security workspace. Bring your own model keys, work with files and terminal sessions, review changes, use the built-in browser, and follow live subagents. Security projects run their tools in your configured Kali environment over pinned SSH.

This repository contains **Privora Desktop and its static marketing website only**. No Privora account, subscription, billing system or hosted AI-credit gateway is required.

## Projects

| Path | Purpose |
| --- | --- |
| [apps/desktop](apps/desktop/README.md) | Electron desktop app, local persistence, providers, browser and Security tools |
| [apps/marketing](apps/marketing/README.md) | Pre-rendered public marketing, download, BYOK and legal pages |
| [docs](docs/) | Desktop operations and repository architecture |

The other products now have independent repositories, with their relevant Git history preserved:

- [privora-workspace](https://github.com/MohammedSafwan10/privora-workspace): browser AI workspace.
- [privora-mobile](https://github.com/MohammedSafwan10/privora-mobile): Flutter app.
- [privora-platform](https://github.com/MohammedSafwan10/privora-platform): previous account, billing, hosted-model and update-feed services. This is retained independently; the BYOK desktop does not use its account or credit APIs.

## Development

Use Node.js 22.12 or later. Each app owns its package metadata and lockfile; the repository root only provides convenience commands.

```powershell
npm --prefix apps/desktop ci
npm --prefix apps/marketing ci
npm run desktop:dev
# In another terminal:
npm run marketing:dev
```

Configure your own providers in **Settings > Providers**. Gemini, OpenRouter, DeepSeek, OpenCode Go and a local CLIProxy endpoint are supported. Provider keys use OS-backed secret storage. Provider charges and quotas belong to your chosen provider; local storage does not make remote model inference offline.

```powershell
npm run lint
npm test
npm run marketing:build
npm run marketing:preview
npm run desktop:build
```

The marketing build produces HTML and assets in `apps/marketing/dist/` for ordinary static hosting. It needs no server runtime, account SDK or environment secrets. `/pricing/` explains BYOK; sign-in, account and billing routes are absent.

## Desktop workflows

- [Desktop guide](apps/desktop/README.md)
- [Security projects and Kali setup](apps/desktop/docs/security-workspace/README.md)
- [Browser tools](apps/desktop/docs/browser-agent.md)
- [Long-session recovery](apps/desktop/docs/reliable-compaction.md)
- [Connection and state recovery](apps/desktop/docs/desktop-state-recovery.md)
- [Windows release and updates](docs/desktop-auto-updates.md)
- [Repository split and migration](docs/repository-layout.md)

Security project scope remains operator-defined. Full access skips command approval prompts; it does not grant root privileges or change the authorized target scope. Collected evidence is retained locally; confirmed PC saves expose their exact recorded path and an Open folder action.

## Releases and hosting

Source pushes do not publish an installer or deploy the website. Existing download/update and demo-video URLs remain external public services. Removing cloud account code from this repository does not delete existing production resources.

```powershell
npm run desktop:release:win:x64 -- --notes "Release notes"
```

Keep provider keys, SSH profiles, service credentials and signing material out of Git. Do not expose secrets through frontend environment variables or packaged assets.
