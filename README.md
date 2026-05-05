# Privora

Privora is a polished local-first AI chat app built with React, TypeScript, Vite, and Tailwind CSS. It supports Gemini models directly and GPT-5.5 through CLIProxyAPI, with streaming responses, reasoning summaries, web search signals, local chat history, markdown/math rendering, and multimodal attachments.

## Features

- Calm beige/light and high-contrast dark themes.
- Claude-style sidebar with a compact collapsed icon rail.
- Local chat history stored in IndexedDB through Dexie.
- Gemini 3.1/3 model options through `@google/genai`.
- GPT-5.5 through CLIProxyAPI using an OpenAI Responses-compatible endpoint.
- Instant and Medium reasoning modes.
- Live reasoning/thought UI with a collapsible thought process panel.
- Gemini grounding/web-search status display.
- CLIProxy web-search event display when the proxy/provider emits search events.
- Image, PDF, document, text, and code attachments with model-aware validation.
- Rich markdown with GitHub-flavored markdown, KaTeX math, Shiki syntax highlighting, copy buttons, and collapsed long code blocks.
- Retry, edit, copy, star, rename, and delete chat controls.

## Tech Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS 4
- Motion
- Lucide React
- Dexie / IndexedDB
- `@google/genai`
- React Markdown, remark-gfm, remark-math, rehype-katex
- KaTeX
- Shiki via `react-shiki`
- CLIProxyAPI for local GPT-5.5 routing

## Setup

Install dependencies:

```bash
npm install
```

Create `.env`:

```env
GEMINI_API_KEY=your_gemini_api_key
CLIPROXY_BASE_URL=http://127.0.0.1:8317
VITE_CLIPROXY_API_KEY=sk-dummy
```

Run the dev server:

```bash
npm run dev
```

The app runs on:

```text
http://127.0.0.1:3000
```

## CLIProxy / GPT-5.5

Privora calls CLIProxy through Vite:

```text
Browser -> /cliproxy/v1/responses -> http://127.0.0.1:8317/v1/responses
```

Start CLIProxy in another terminal before using GPT-5.5:

```powershell
cliproxy --config C:\Users\Thumbeja\config.yaml
```

GPT modes in the app:

- `Instant`: no `reasoning` object is sent.
- `Medium`: sends `reasoning: { effort: "medium", summary: "auto" }`.

This avoids the CLIProxy warning about zero thinking budgets for instant GPT requests.

## Gemini

Gemini requests use `@google/genai` with streaming:

- Instant mode sends normal streaming content.
- Medium mode enables `thinkingConfig` with `ThinkingLevel.MEDIUM` and `includeThoughts: true`.
- Web search enables Gemini's `googleSearch` tool and displays grounding/search state when metadata is returned.

## Attachments

Privora uses native provider payloads:

- Gemini: sends attachments as `inlineData`.
- GPT-5.5/CLIProxy: sends images as `input_image` and files as `input_file`.

Current in-app limits:

- Max attachments per message: `15`.
- Gemini inline payload limit in this app: `20 MB` total.
- GPT/CLIProxy attachment payload limit in this app: `50 MB` total.

Supported attachment types in the UI:

- Images: PNG, JPG/JPEG, WEBP, GIF; Gemini also accepts HEIC/HEIF when supported by the browser/file type.
- Documents: PDF, TXT, Markdown, CSV, JSON, HTML/XML.
- Code/text files: JS, JSX, TS, TSX, Python, Java, C#, C/C++, CSS, SQL, YAML, TOML, shell scripts, Dart, Go, Rust, logs, and similar text formats.
- GPT/CLIProxy also allows common Office-style documents through `input_file` when supported by the upstream provider.

For large or reusable files, the better production architecture is a small backend that uploads through each provider's Files API and stores file IDs instead of base64 data in the browser.

## Local Data

Chats are stored in the browser's IndexedDB database:

```text
privora-local-db
```

This is local to the current browser profile. Attachments are also persisted as base64 in local chat history, so avoid storing private documents in shared browser profiles.

## Security Notes

- `.env` files are ignored by git.
- `.env.example` is safe to commit.
- This app currently injects `GEMINI_API_KEY` into the frontend build for local/private use.
- For public deployment, move Gemini and CLIProxy calls behind a backend so real API keys never ship to browsers.
- Do not commit local CLIProxy auth files, personal configs, `.env`, or generated `dist` output.

## Scripts

```bash
npm run dev
npm run lint
npm run build
npm run preview
```

## Project Structure

```text
src/
  components/
    ChatMessage.tsx
    MarkdownRenderer.tsx
    TypingIndicator.tsx
  lib/
    cliproxy/
      responses.ts
    db.ts
    models.ts
  App.tsx
  index.css
```

## License

MIT
