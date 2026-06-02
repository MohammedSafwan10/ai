# Privora Workspace

Privora Workspace is the browser AI workspace app. It is separate from the SaaS website in `apps/web` and separate from the Electron desktop app in `apps/desktop`.

This app contains the browser-first AI product surface: chat, artifacts, Web Dev, Characters, Command Center, image generation, Deep Research, Debate, and Clash.

## Stack

- React 19
- TypeScript
- Vite 6
- Tailwind CSS 4
- Dexie / IndexedDB
- Motion
- Lucide React
- Monaco Editor
- WebContainer API
- FullCalendar
- React Markdown, Mermaid, KaTeX, and artifact rendering
- Gemini, OpenRouter, and CLIProxy-compatible provider routes

## Commands

Run these from `apps/workspace`:

```powershell
npm run dev
npm run lint
npm run build
npm run preview
npm run clean
```

From the repository root:

```powershell
npm run workspace:dev
npm run workspace:lint
npm run workspace:build
npm run workspace:preview
```

The dev server runs at:

```text
http://127.0.0.1:3000
```

## Environment

Create `apps/workspace/.env` from `apps/workspace/.env.example` and fill only the providers you need:

```env
GEMINI_API_KEY="MY_GEMINI_API_KEY"
APP_URL="http://127.0.0.1:3000"
CLIPROXY_BASE_URL="http://127.0.0.1:8317"
VITE_CLIPROXY_API_KEY="dummy-key"
OPENROUTER_API_KEY="MY_OPENROUTER_API_KEY"
VITE_WEBCONTAINER_API_KEY=""
```

Any `VITE_*` value is exposed to browser code. Do not put private provider keys or server secrets in `VITE_*` variables.

## Provider Notes

- Gemini routes through local Vite middleware using `GEMINI_API_KEY`.
- OpenRouter routes through local Vite middleware using `OPENROUTER_API_KEY`.
- CLIProxy routes through `/cliproxy/*` to `CLIPROXY_BASE_URL`.
- WebContainer can run without a commercial key for local prototype work, but production/commercial usage may require a license.

## Product Boundary

Use this app for the browser AI workspace experience.

Do not add SaaS pricing, account billing, legal pages, Appwrite admin controls, Razorpay, or desktop update feed code here. Those belong in:

- `apps/web` for SaaS website/account/legal/admin surfaces
- `apps/desktop` for Electron desktop behavior
- `appwrite` for backend functions and automation
