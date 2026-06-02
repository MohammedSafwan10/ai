# Privora

Privora is a local-first AI workspace with two active surfaces:

- **Web app**: a browser AI workspace for chat, artifacts, Web Dev, Characters, Command Center, image generation, Deep Research, Debate, and Clash.
- **Desktop app**: a Windows-first Electron local coding agent for working directly inside a selected project folder with file, search, diff, terminal, and approval tools.

The codebase is built with React 19, TypeScript, Vite, local storage, and provider adapters for Gemini, GPT/CLIProxy, and selected OpenRouter models.

## Current Highlights

- Multi-provider streaming with Gemini, GPT/CLIProxy, and OpenRouter.
- Thinking/reasoning UI where supported by the selected model.
- Response styles: Normal, Human, Learning, Concise, Explanatory, Formal, and Creative.
- Web search, image generation/editing, async Deep Research, Debate Mode, and Clash Mode.
- Canvas artifacts for durable generated Markdown, code, HTML, SVG, Mermaid, JSON, YAML, SQL, tables, and prompts.
- Web Dev workspace with project chat, file tree, Monaco editor, WebContainer preview, tool activity, diagnostics, and project persistence.
- Command Center workspace with Tasks, Schedule, Notes, Finance, Activity, native Agent Mode tool calls, confirmations, session undo/redo, duplicate safety, and grouped activity history.
- Character workspace with starter characters, custom characters, memories, personas, and separate sessions.
- Desktop local agent with secure Electron preload, main-process tools, workspace sandboxing, inline tool activity, inline diffs, terminal sessions, context mentions, and encrypted provider settings.

## Tech Stack

### Web

- React 19
- TypeScript
- Vite 6
- Tailwind CSS 4
- Dexie / IndexedDB
- Motion
- Lucide React
- Monaco Editor
- WebContainer API
- FullCalendar Standard 6.1.20
- React Markdown, remark-gfm, remark-math, rehype-katex
- Mermaid
- KaTeX
- Sucrase
- JSZip
- `@google/genai`

### Desktop

- Electron 42
- Electron Forge + Vite
- React 19
- TypeScript
- `@vscode/ripgrep`
- `@tanstack/react-virtual`
- React Markdown
- Zod
- Electron `safeStorage` for provider secrets

## Setup

Install dependencies from the repository root:

```bash
npm install
```

Create `.env` from `.env.example` and fill only the providers you need:

```env
GEMINI_API_KEY="MY_GEMINI_API_KEY"
APP_URL="http://127.0.0.1:3000"
CLIPROXY_BASE_URL="http://127.0.0.1:8317"
VITE_CLIPROXY_API_KEY="dummy-key"
OPENROUTER_API_KEY="MY_OPENROUTER_API_KEY"
VITE_WEBCONTAINER_API_KEY=""
```

## Running The Web App

```bash
npm run dev
```

The web app runs at:

```text
http://127.0.0.1:3000
```

Useful web scripts:

```bash
npm run lint
npm run build
npm run preview
npm run clean
```

## Running The Desktop App

From the repository root:

```bash
npm run desktop:dev
```

Debug variants:

```bash
npm run desktop:debug
npm run desktop:debug:break
npm run desktop:log
```

Desktop verification:

```bash
npm run desktop:lint
npm run desktop:test
npm run desktop:build
```

Inside the Electron Forge terminal, type `rs` to restart the Electron main process after main/preload changes.

## Building The Desktop Installer

For a Windows production installer, run from the repository root:

```powershell
npm --prefix apps/desktop run make -- --platform=win32 --arch=x64
```

The installer is created at:

```text
apps/desktop/out/make/squirrel.windows/x64/PrivoraSetup.exe
```

That `.exe` is the file to share with a tester on Windows. They do not need the source code or the generated ZIP for normal installation.

Useful packaging commands:

```powershell
npm --prefix apps/desktop run lint
npm --prefix apps/desktop run test
npm --prefix apps/desktop run build
npm --prefix apps/desktop run make -- --platform=win32 --arch=x64
```

The desktop production build disables Vite source maps and runs `prepare:package` before `build` or `make`. That staging step keeps only the runtime `node-pty` files needed by the app and avoids shipping source maps, tests, extra native platforms, and package source folders. The generated `apps/desktop/build-resources/` folder is ignored by git and can be regenerated.

Electron apps still contain bundled JavaScript inside `app.asar`, so they should not be treated as a secret vault. Do not embed private API keys, signing certificates, private configs, or paid provider secrets in the app bundle. Runtime provider secrets belong in local user settings, where the desktop app stores them through Electron `safeStorage`.

## Model Providers

### Gemini

Gemini runs through `@google/genai`.

Configured Gemini models include:

- `gemini-3.1-flash-lite-preview`
- `gemini-3.5-flash`
- `gemini-3.1-pro-preview`

Gemini supports streaming, multimodal attachments, thinking mode where enabled, Google Search grounding in supported routes, and Gemini image generation/editing through Nano Banana 2.

### GPT / CLIProxy

GPT-5.5 routes through a local CLIProxyAPI server.

Web route:

```text
Browser -> /cliproxy/v1/responses -> CLIPROXY_BASE_URL/v1/responses
```

Start CLIProxy separately before using GPT models:

```powershell
cliproxy --config C:\Users\Thumbeja\config.yaml
```

Desktop stores the CLIProxy base URL in app settings and calls the local server from the Electron main process.

### OpenRouter

OpenRouter routes through local Vite middleware on web and through the desktop provider adapter on desktop.

Configured free text models include:

| Model | Notes |
| --- | --- |
| `deepseek/deepseek-v4-flash:free` | Long-context DeepSeek MoE model with reasoning/tool support where advertised. |
| `baidu/cobuddy:free` | Code-generation model with advertised tools/reasoning. |
| `nvidia/nemotron-3-super-120b-a12b:free` | Strong free model with reasoning/tools/structured-output support where advertised. |

OpenRouter attachment support depends on the selected model. The configured free set is treated as text-only in normal chat.

## Web App Features

### Chat

Normal Chat supports provider streaming, response styles, thinking UI, web search, attachments, image mode, Deep Research, Debate, Clash, Canvas artifacts, Code Playground, and Agent Mode for Command Center tools.

### Clash Mode

Clash Mode is separate from Debate Mode. Two selected agents alternate short streamed turns, challenge/refine/accept, and either converge or hit a bounded cap. It uses visible agent turns, no hidden judge, and preserves partial transcripts.

### Command Center

Command Center is a manual and AI-editable workspace with:

- **Tasks**: status, priority, due dates, tags, inline edits.
- **Schedule**: FullCalendar month/week/day views, task-linked blocks, drag/drop, resize, conflict checks, and free-slot planning.
- **Notes**: markdown notes, pinned/archived state, tags, search, append/update flows.
- **Finance**: income/expense ledger, categories, month totals, budget/category view, INR default with editable currency.
- **Activity**: grouped manual and AI sessions, approvals, undo/redo, chat links, target links, and history cleanup.

Agent Mode uses native provider tool calls when available. Tools are typed app functions, not raw database edits. Risky actions such as deletes, bulk changes, finance amount/date edits, and schedule moves/deletes require confirmation.

### Web Dev

Web Dev is a browser-based app builder for small web apps and prototypes.

It includes:

- Project chat.
- File tree and manual file/folder actions.
- Monaco editor.
- Code/Preview tabs.
- WebContainer preview and terminal output.
- Tool activity rows.
- Project ZIP download.
- IndexedDB persistence.

Generated projects run in WebContainer when the browser supports cross-origin isolation and `SharedArrayBuffer`.

### Characters

Characters provide separate persona-style chat sessions with starter categories, custom character creation, memories, user personas, and per-session history.

### Deep Research

Deep Research is an async mode with:

- Preflight classification.
- Editable research plans.
- Progress/activity streaming.
- Source collection.
- Cancellation.
- Final cited report.

Research jobs are currently stored in the local Vite process memory. Production deployment should move jobs to durable backend storage and a queue/worker.

### Image Generation

Image mode supports generation and editing through:

| Model | Provider |
| --- | --- |
| `gpt-image-2` | CLIProxy |
| `gemini-3.1-flash-image-preview` | Gemini / Nano Banana 2 |

## Desktop App Features

Desktop is intentionally focused: it is not the web app in an Electron shell. V1 is a local coding agent.

Current desktop capabilities:

- Select a local workspace before tool use.
- Chat with Gemini, GPT/CLIProxy, or supported OpenRouter models.
- Secure renderer: `contextIsolation: true`, `nodeIntegration: false`, typed preload IPC.
- Provider keys stored in Electron `safeStorage`.
- Main-process file and terminal tools.
- Workspace path sandboxing.
- Ask Risky / Full Access permission modes.
- File read/list/search using ripgrep.
- File write/patch/delete/rename with tracked diffs.
- Inline Codex-style activity stream with compact tool rows.
- Inline line-numbered diff viewer for changed files.
- Review drawer for full turn changes.
- Terminal command execution with output buffering and stop support.
- Context mentions for `@file`, `@folder`, and `@terminal`.
- Stop/continue-friendly run state and checkpoints.

Desktop is still evolving toward a more Codex-style architecture: protocol-driven turn loop, durable event stream, terminal/session model, mutation coordinator, and smoother high-volume rendering.

## Local Data

### Web

Web data is stored in IndexedDB:

```text
privora-local-db
```

It includes chat messages, attachments, artifacts, research records, Web Dev projects/files/messages, Characters data, Command Center data, and UI settings.

### Desktop

Desktop data is stored under Electron `app.getPath("userData")` in a local JSON data file for now. Provider secrets are encrypted separately with Electron `safeStorage`.

Desktop stores workspaces, threads, messages, tool events, terminal metadata, run checkpoints, settings, and encrypted provider secret envelopes.

## Security Notes

- `.env` files are ignored by git.
- Any `VITE_*` value is exposed to browser code.
- Browser/web provider keys are convenient for local development but should move behind a backend before public deployment.
- Desktop secrets are kept in the main process and encrypted with Electron `safeStorage`; the renderer never receives raw secret values.
- Desktop production source maps are disabled, and the Windows package stages only runtime native resources.
- Desktop file and terminal tools resolve paths against the selected workspace.
- Risky actions should go through explicit approval unless Full Access is selected.
- Do not commit local CLIProxy configs, provider keys, private attachments, generated `dist`, generated desktop `out`, generated desktop `build-resources`, or desktop user data.

## Project Structure

```text
src/
  features/
    artifacts/
    attachments/
    characters/
    chat/
    code-playground/
    command-center/
    ui/
    webdev/
  hooks/
  lib/
  App.tsx
  index.css

apps/
  desktop/
    src/
      main/
        agent/
        db/
        ipc/
        security/
        terminal/
      preload/
      renderer/
        components/
        state/
        styles/
      shared/
```

## Scripts

Root scripts:

```bash
npm run dev
npm run lint
npm run build
npm run preview
npm run clean
npm run desktop:dev
npm run desktop:debug
npm run desktop:debug:break
npm run desktop:log
npm run desktop:lint
npm run desktop:test
npm run desktop:build
```

Desktop package scripts:

```bash
npm --prefix apps/desktop run dev
npm --prefix apps/desktop run dev:debug
npm --prefix apps/desktop run dev:debug:break
npm --prefix apps/desktop run dev:log
npm --prefix apps/desktop run dev:trace
npm --prefix apps/desktop run lint
npm --prefix apps/desktop run test
npm --prefix apps/desktop run build
npm --prefix apps/desktop run make
npm --prefix apps/desktop run make -- --platform=win32 --arch=x64
```

## License

Private project. No license is granted for public reuse, redistribution, or commercial use without explicit permission from the owner.
