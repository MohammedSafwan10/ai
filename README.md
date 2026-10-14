# Privora

Privora brings AI chat, local development tools, and connected security environments into a multi-app repository. Product apps live under `apps/`; the root provides commands for working on them.

## Apps

- `apps/workspace` - browser AI workspace app for chat, artifacts, Web Dev, Characters, Command Center, image generation, Deep Research, Debate, and Clash.
- `apps/web` - SaaS website for pricing, auth, account pages, legal pages, desktop connection, and future admin.
- `apps/desktop` - Electron desktop app for local coding workflows and Security projects, with built-in browser research, live subagents, recoverable context compaction, and tools executed in an assigned Kali VM.
- `appwrite` - Appwrite Functions and scripts for the update feed and SaaS AI credit engine.
- `docs` - shared runbooks and architecture notes.

## Root Commands

```powershell
npm run workspace:dev
npm run workspace:lint
npm run workspace:build

npm run web:dev
npm run web:lint
npm run web:build

npm run desktop:dev
npm run desktop:lint
npm run desktop:test
npm run desktop:build
npm run desktop:release:win:x64 -- --notes "Release notes"
```

Run all TypeScript checks:

```powershell
npm run lint
```

## App Boundaries

- Use `apps/workspace` for the browser AI workspace product.
- Use `apps/web` for public SaaS, auth, pricing, account, legal, and admin pages.
- Use `apps/desktop` for packaged desktop behavior and local-agent UX.
- Use `appwrite` for backend-only code, server secrets, credit ledgers, and update feeds.

Do not put private API keys, Appwrite API keys, OpenRouter hosted keys, Razorpay secrets, or signing credentials in any frontend `VITE_*` variable or desktop bundle.

## Setup

Desktop development and packaging require Node.js 22.12 or later; Node.js 24 LTS is a suitable choice. Each app documents its own additional requirements.

Each app owns its own package metadata and lockfile. Install dependencies inside the app you are working on:

```powershell
npm --prefix apps/workspace install
npm --prefix apps/web install
npm --prefix apps/desktop install
```

Local environment examples live beside each app:

- `apps/workspace/.env.example`
- `apps/web/.env.example`

Desktop release and SaaS credit automation are documented in:

- `docs/desktop-auto-updates.md`
- `apps/desktop/docs/browser-agent.md` for Browser Agent phases, workflow evidence, and storage cleanup behavior.
- `apps/desktop/docs/reliable-compaction.md` for preserved task state, checkpoint validation, recovery, and model-budget limits.
- `apps/desktop/docs/saas-ai-credits.md`

## Desktop Security workspace

Create a **Security project** from the desktop sidebar, choose a saved Kali connection, and describe the objective and authorized scope. Connection profiles are imported once per VM and reused across projects. Normal local projects retain their existing coding tools; Security projects execute through SSH in their assigned environment.

The selected model and reasoning level stay in Privora. Kali needs the small Python runner and SSH access, without Docker or a second model agent. Chat shows remote activity; project details provide jobs, connection checks, findings, evidence previews, and native file saving.

Security projects also support public research in the built-in desktop browser, including screenshots, evidence capture, and PDF reading. Browser research traffic originates on the desktop; target commands execute in Kali. Subagents have live transcripts and visible coordination messages. Long chats can compact while retaining operator instructions, operational state, and evidence references; original transcripts and artifacts remain stored.

**Full access** skips command approval prompts in Privora. It does not grant root privileges, expand target authorization, or add hardware capabilities. Remote GUI/browser control and interactive PTY sessions are future work.

See the [desktop README](apps/desktop/README.md) for everyday use and the [Security workspace documentation](apps/desktop/docs/security-workspace/README.md) for connection requirements, tested behavior, and remaining acceptance checks. The implementation and portable Windows build are verified; pushing source does not publish a new installer or update feed.
