# Privora Mobile

Flutter mobile port of Privora, the local-first AI workspace in the repository root. The mobile app is designed to run independently from the root Vite/web dev server for normal AI features.

## Run

```bash
flutter pub get
flutter run
```

`npm run dev` is only needed for the root web/Vite app. Mobile chat, image generation, Deep Research, characters, and debate use Flutter-side provider clients.

## Providers

Create `apps/mobile/.env` or save keys in the in-app Connections/settings flow:

```env
GEMINI_API_KEY="MY_GEMINI_API_KEY"
OPENROUTER_API_KEY="MY_OPENROUTER_API_KEY"
CLIPROXY_BASE_URL="http://127.0.0.1:8317"
```

- Gemini: direct mobile API calls for chat, web search where available, attachments, and Gemini image generation.
- OpenRouter: direct mobile Chat Completions streaming.
- GPT / CLIProxy: direct calls to a running local `cliproxy` service.

For a real Android phone over USB debugging:

```bash
adb reverse tcp:8317 tcp:8317
```

Then keep the CLIProxy endpoint as:

```text
http://127.0.0.1:8317
```

For Wi-Fi/LAN testing, use the computer LAN IP instead, for example `http://192.168.1.10:8317`.

## Mobile Features

- Multi-provider streaming chat with Gemini, GPT/CLIProxy, and OpenRouter.
- Canvas artifacts for reusable Markdown, code, HTML, SVG, Mermaid, JSON, YAML, SQL, tables, prompts, and text.
- Deep Research using the same direct mobile provider path as chat.
- Image generation and editing through Gemini and CLIProxy image endpoints.
- Character chats with separate character sessions.
- Debate mode with model agents and judge settings.
- Attachments through file picker and gallery.
- Local-first persistence with Drift/SQLite.

The browser-only Web Dev workspace from the root app is intentionally not a mobile feature because it depends on browser WebContainer capabilities.

## Architecture

The mobile app uses:

- `flutter_riverpod` for state and dependency injection.
- `go_router` for workspace routes and deep links.
- `drift` + SQLite for relational local-first app data.
- `flutter_secure_storage` for API keys and private endpoints.
- `dio` for provider HTTP/SSE calls.
- `file_selector` and `image_picker` for attachment workflows.

See [Mobile Flutter Architecture](../../docs/mobile-flutter-architecture.md).

## Checks

```bash
dart format lib test
flutter analyze
flutter test
flutter pub outdated
```
