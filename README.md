# Privora

Privora is organized as a multi-app repository. The root is only a command hub; product apps live under `apps/`.

## Apps

- `apps/workspace` - browser AI workspace app for chat, artifacts, Web Dev, Characters, Command Center, image generation, Deep Research, Debate, and Clash.
- `apps/web` - SaaS website for pricing, auth, account pages, legal pages, desktop connection, and future admin.
- `apps/desktop` - Electron desktop app for local coding-agent workflows inside real project folders.
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
- `apps/desktop/docs/saas-ai-credits.md`
