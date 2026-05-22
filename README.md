# Privora

Privora is a local-first AI workspace built with React, TypeScript, Vite, and Tailwind CSS. It combines chat, Canvas artifacts, a browser Web Dev workspace, a chat Code Playground, image generation, Deep Research, character chats, and local IndexedDB persistence.

The app currently supports Gemini models through `@google/genai`, GPT-5.5 through CLIProxyAPI, and selected free OpenRouter text models through local Vite middleware.

## Highlights

- Multi-provider streaming chat with Gemini, GPT-5.5/CLIProxy, and OpenRouter free text models.
- Response styles: Normal, Human, Learning, Concise, Explanatory, Formal, and Creative.
- Thinking/reasoning UI with collapsible thought summaries where supported.
- Web search in Auto or forced mode, with provider-specific search support.
- Async Deep Research with preflight planning, editable research plans, progress tracking, source/activity panels, cancellation, and reconnect support while the Vite process is alive.
- Canvas artifacts for reusable generated work such as Markdown, code, HTML, SVG, Mermaid, JSON, YAML, SQL, tables, and prompts.
- Chat Code Playground for small runnable examples, with Code/Preview/Console tabs and support for JavaScript, TypeScript, JSX, TSX, HTML, CSS, and JSON snippets.
- Web Dev workspace for generating and iterating on small web apps with a file tree, Monaco editor, WebContainer preview, terminal output, project chat, and IndexedDB persistence.
- Character workspace with starter character categories, custom character creation, character sessions, memories, personas, and per-session chat history.
- Image generation and editing through CLIProxy GPT Image and Gemini Nano Banana 2.
- Debate mode with two model agents and a judge configuration.
- Multimodal attachments with model-aware validation and local persistence.
- Local-first chat/project storage in IndexedDB through Dexie.
- Beige/light and dark themes, responsive layout, compact sidebar, search modal, retry/edit/copy/share controls, and mobile-friendly actions.

## Tech stack

- React 19
- TypeScript
- Vite 6
- Tailwind CSS 4
- Motion
- Lucide React
- Dexie / IndexedDB
- `@google/genai`
- Monaco Editor
- WebContainer API
- Sucrase for playground snippet transpilation
- Mermaid
- React Markdown, remark-gfm, remark-math, rehype-katex
- KaTeX
- Shiki via `react-shiki`
- CLIProxyAPI for local GPT-5.5 and GPT Image routing
- OpenRouter Chat Completions API for selected free text models

## Setup

Install dependencies:

```bash
npm install
```

Create `.env` from `.env.example` and fill in the values you need:

```env
GEMINI_API_KEY="MY_GEMINI_API_KEY"
APP_URL="http://127.0.0.1:3000"
CLIPROXY_BASE_URL="http://127.0.0.1:8317"
VITE_CLIPROXY_API_KEY="dummy-key"
OPENROUTER_API_KEY="MY_OPENROUTER_API_KEY"
VITE_WEBCONTAINER_API_KEY=""
```

Run the dev server:

```bash
npm run dev
```

The dev server runs on:

```text
http://127.0.0.1:3000
```

## Scripts

```bash
npm run dev      # Start Vite on port 3000
npm run lint     # TypeScript validation with tsc --noEmit
npm run build    # Production Vite build
npm run preview  # Preview the production build
npm run clean    # Remove dist
```

## Model providers

### Gemini

Gemini models are called directly through `@google/genai`.

Current Gemini chat models:

- `gemini-3.1-flash-lite-preview` - default fast model.
- `gemini-3-flash-preview` - balanced Gemini model with native tools.
- `gemini-3.1-pro-preview` - stronger Gemini model for harder prompts.

Gemini supports native attachments, Google Search grounding, thinking mode, streamed content, and Gemini image generation through Nano Banana 2.

### GPT / CLIProxy

GPT-5.5 is routed through a local CLIProxyAPI server via Vite middleware:

```text
Browser -> /cliproxy/v1/responses -> CLIPROXY_BASE_URL/v1/responses
```

Start CLIProxy separately before using GPT-5.5:

```powershell
cliproxy --config C:\Users\Thumbeja\config.yaml
```

Reasoning modes:

- `Instant`: no reasoning object is sent.
- `Medium`: sends reasoning settings where supported by the provider route.

CLIProxy is also used for GPT Image generation/editing through:

```text
POST /cliproxy/v1/images/generations
POST /cliproxy/v1/images/edits
```

### OpenRouter

OpenRouter models are routed through local Vite middleware:

```text
Browser -> /api/openrouter/chat -> https://openrouter.ai/api/v1/chat/completions
```

`OPENROUTER_API_KEY` is required. `APP_URL` is sent as `HTTP-Referer` when available.

Current configured OpenRouter free models:

| Model | Context | Max output | Input | Tools | Reasoning | Structured output | Notes |
| --- | ---: | ---: | --- | --- | --- | --- | --- |
| `deepseek/deepseek-v4-flash:free` | 1,048,576 | 384,000 | Text | Yes | High | No | Fast long-context DeepSeek MoE model. |
| `baidu/cobuddy:free` | 131,072 | 65,536 | Text | Yes | Yes | No | Code-generation model with advertised tools/reasoning. |
| `nvidia/nemotron-3-super-120b-a12b:free` | 262,144 | 262,144 | Text | Yes | Yes | Yes | Strongest advertised capability mix in the configured free set. |

Current OpenRouter behavior:

- Streams over Chat Completions SSE.
- Sends reasoning only when the selected model advertises reasoning support.
- Uses model-specific reasoning effort where needed, including `high` for DeepSeek V4 Flash.
- Supports OpenRouter server search for tool-capable models.
- Blocks attachments because the configured free models are text-only.
- Uses conservative artifact routing so normal Markdown answers stay in chat.

## Response styles

Privora includes seven selectable response styles:

- `Normal`: balanced, adaptive, and conversational.
- `Human`: natural, grounded, and less template-like.
- `Learning`: simple teaching with examples and useful practice.
- `Concise`: brief, direct, and complete.
- `Explanatory`: clear reasoning that explains why and how things work.
- `Formal`: professional plain English for business-safe communication.
- `Creative`: useful originality with taste, range, and practical shape.

The selected style is added to the system prompt alongside live date/time context and optional web-search/deep-research instructions.

## Canvas artifacts

Canvas is used when the user asks for substantial reusable output, not for ordinary chat answers. Supported artifact types include:

- Markdown documents, reports, prompts, and tables.
- Code, JSON, YAML, SQL, and structured text.
- Static HTML previews in a sandboxed iframe.
- SVG previews.
- Mermaid diagrams.

Canvas behavior:

- GPT/CLIProxy can use the `create_or_update_artifact` tool.
- Gemini and OpenRouter use a private streamed artifact marker for progressive Canvas updates.
- Teaching snippets and normal Markdown answers remain in chat unless the user asks for a durable artifact, file, document, or Canvas item.
- Monaco powers the editor with app-themed transparent styling and custom line numbers.
- HTML/SVG previews are sandboxed and can report runtime errors to the parent panel.
- Copy, download, and open-tab actions are available.

## Chat Code Playground

The Code Playground is a right-side panel for small snippets during normal chat. It is separate from Canvas and Web Dev.

Current behavior:

- Open it from the composer menu or from supported code blocks in chat.
- Code/Preview/Console tabs use a Web Dev-like toggle layout.
- JavaScript and TypeScript snippets can run in Console mode.
- JSX, TSX, HTML, and CSS snippets can render in Preview mode.
- JSON snippets can be validated.
- Browser snippets run in a sandboxed iframe.
- Node-style JavaScript/TypeScript snippets can use WebContainer when available.
- The editor owns its high-frequency draft state locally so typing does not re-render the chat layout.
- Supported code-block languages for `Open in Playground`: JS, TS, JSX, TSX, HTML, CSS, and JSON.

## Web Dev workspace

The Web Dev workspace is for multi-file web app generation and iteration.

Current behavior:

- Projects, files, project chat messages, tool activity, attachments, and UI state persist in IndexedDB.
- The workspace includes chat, file tree, Monaco editor, Code/Preview tabs, WebContainer preview, terminal output, and manual file/folder actions.
- Generated projects run in WebContainer when the browser supports cross-origin isolation and `SharedArrayBuffer`.
- Vite dev/preview responses include COOP/COEP headers for local WebContainer support.
- Privora can inject a runtime-only Vite config when generated React projects need one for preview bootstrapping.
- Project ZIP download is available from the Web Dev panel.

`VITE_WEBCONTAINER_API_KEY` is optional. It is a frontend-exposed `VITE_*` value, so only use a token that is safe to expose to browser code.

## Character workspace

The Characters workspace supports persona-style chats separate from normal chat.

Current behavior:

- Starter library grouped by categories such as Companions, Historical Minds, Cinema & Manga, Games, Story Worlds, Creative, Mentors, Travel, Productivity, Wellness-lite, Debate, and Originals.
- Create, edit, star, delete, and browse characters.
- Character definitions include name, avatar, color, tagline, category, greeting, personality, speaking style, boundaries, example dialogue, and visibility.
- Sessions, messages, memories, and user personas are persisted in IndexedDB.
- Character chats use the selected model, response style, thinking, web-search, deep-research, image settings, and attachments where supported.

## Image generation and editing

Image mode is available from the composer.

Current image models:

| Model | Provider | Notes |
| --- | --- | --- |
| `gpt-image-2` | CLIProxy | Supports partial image streaming through local image endpoints. |
| `gemini-3.1-flash-image-preview` | Gemini | Shown as Nano Banana 2 in the UI. |

Current image behavior:

- Generate new images from prompts.
- Edit images from attachments or generated results.
- Choose size preset, quality, count, and model.
- Generate 1-4 images depending on selected options.
- Stream partial image updates when supported by the selected backend.
- Download generated images from the result card.
- Retry stopped or failed generations.

If CLIProxy image endpoints return `404`, Privora shows a friendly unavailable/disabled message.

## Deep Research

Deep Research is a manually enabled async mode.

Current flow:

1. Turn on Deep Research from the composer menu.
2. Privora enables web search for the turn.
3. A preflight step decides whether the message is normal chat, needs clarification, or is ready for research.
4. Ready prompts create an editable research plan card.
5. Start the job to stream progress, elapsed time, source count, and activity.
6. Final answers include citations and a source list.

Local Vite endpoints:

```text
POST /api/research/preflight
POST /api/research/jobs
GET  /api/research/jobs/:id
GET  /api/research/jobs/:id/stream
POST /api/research/jobs/:id/cancel
```

Research jobs are stored in memory in the Vite process. A production deployment should move this to durable backend storage and a worker/queue.

## Debate mode

Debate mode lets a prompt be answered by two model agents and a judge. Agent A, Agent B, and the judge can be configured through persisted UI settings. Debate mode is disabled while Deep Research or image mode is active.

## Attachments

Privora uses native provider payloads where available:

- Gemini sends attachments as `inlineData`.
- GPT-5.5/CLIProxy sends images as `input_image` and files as `input_file`.
- Configured OpenRouter free models are text-only, so attachments are blocked for them.

Current in-app limits:

- Max attachments per message: `15`.
- Gemini inline payload limit: `20 MB` total.
- GPT/CLIProxy attachment payload limit: `50 MB` total.

Supported attachment types include common images, PDFs, text/doc files, structured data, and common code formats. Attachments are persisted locally as base64 in IndexedDB chat history, so avoid storing private documents in shared browser profiles.

## Local data

Privora stores local data in IndexedDB:

```text
privora-local-db
```

Persisted data includes:

- Chat records, messages, attachments, reasoning, web-search status, debate metadata, image-generation metadata, artifact references, research plans/activity/sources/timing.
- Web Dev projects, generated files, project chat messages, and workspace state.
- Characters, character sessions, character messages, character memories, and user personas.
- UI settings in localStorage under `privora-ui-settings`.

## Prompt context

Every request includes:

- Base system instruction.
- Current local date/time, local time zone, and UTC timestamp.
- Selected response style.
- Voice calibration context when available.
- Optional Deep Research instruction.
- Optional web-search instruction.

## Security notes

- `.env` files are ignored by git.
- `.env.example` is safe to commit.
- `GEMINI_API_KEY` is currently used by frontend/local dev code and should be treated as local/private only.
- Any `VITE_*` value, including `VITE_CLIPROXY_API_KEY` and `VITE_WEBCONTAINER_API_KEY`, is exposed to browser code.
- Vite middleware keeps local proxy/research routes convenient for development, but production deployment needs equivalent backend routes.
- For public deployment, move Gemini, CLIProxy, OpenRouter, image, and research calls behind a real backend so provider keys never ship to browsers and research jobs survive server restarts.
- Do not commit local CLIProxy auth files, personal configs, `.env`, generated `dist`, or private attachments.

## Project structure

```text
src/
  features/
    artifacts/
      components/
    attachments/
      components/
      hooks/
    characters/
      components/
      hooks/
      lib/
      prompts/
    chat/
      components/
      hooks/
    code-playground/
      components/
      lib/
    ui/
    webdev/
      components/
      hooks/
      lib/
      prompts/
      runtime/
  hooks/
  lib/
    attachments.ts
    artifacts.ts
    cliproxy/
    gemini/
    openrouter/
    prompt/
      styles/
    research/
    db.ts
    imageModels.ts
    models.ts
    settings.ts
  App.tsx
  index.css
vite.config.ts
```

## License

Private project. No license is granted for public reuse, redistribution, or commercial use without explicit permission from the owner.
