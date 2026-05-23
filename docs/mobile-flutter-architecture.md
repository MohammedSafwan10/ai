# Privora Mobile Flutter Architecture

This document records the package choices for the Flutter mobile port. The goal is to keep the mobile app aligned with the Vite app's local-first, multi-workspace shape while using Flutter-native packages that can scale to chat, artifacts, web-dev projects, character sessions, attachments, and future sync.

## Decisions

### State Management: Riverpod

Use `flutter_riverpod`.

Why:
- It works well with explicit dependency injection for database, secure storage, and API clients.
- `AsyncNotifier` represents SQLite hydration, loading, and error states directly.
- Tests can override providers cleanly, as the widget test does with an in-memory Drift database.
- It is not tied to widget lifecycle, so app services can stay outside UI widgets.

Current implementation:
- `appControllerProvider` is an `AsyncNotifierProvider<AppController, PrivoraState>`.
- SQLite-backed app state loads before the shell renders data.
- Database and secure credential repositories are exposed through providers.

### Routing: go_router

Use `go_router`.

Why:
- The Vite app already has URL-shaped workspaces: `/chat/:chatId`, `/web-dev/:projectId`, and `/characters/:sessionId`.
- `go_router` supports nested route growth, deep links, redirects, and mobile/web parity.
- It keeps navigation declarative and testable without locking the app into a generated router.

Current implementation:
- `/chat`
- `/chat/:chatId`
- `/web-dev`
- `/web-dev/:projectId`
- `/characters`
- `/characters/:sessionId`

### Relational Local Data: Drift + SQLite

Use `drift` with `drift_flutter`.

Why not `shared_preferences`:
- Privora data is relational, not just key-value: chats have messages, projects have threads/files, characters have sessions/memories/personas.
- The app needs migrations, indexes, foreign keys, transactions, and testable queries.
- Local-first data should survive app restarts without packing everything into one large JSON blob.

Why Drift:
- Type-safe table/query code generation.
- SQLite transactions and foreign keys.
- In-memory database support for tests.
- A clear migration path as the schema grows.

Current tables:
- UI settings
- Chats
- Chat messages
- Web-dev projects
- Web-dev threads
- Characters
- Character sessions

Secrets do not belong in SQLite.

### Secret Storage: flutter_secure_storage

Use `flutter_secure_storage` for sensitive values.

Why:
- API keys and private endpoints should not be stored in normal SQLite rows.
- The package uses platform-backed secure storage such as Keychain/Keystore-style mechanisms.
- A small wrapper interface keeps plugin calls out of business logic and lets tests use an in-memory fake.

Current secure credentials:
- Gemini API key
- OpenRouter API key
- CLIProxy endpoint

### File and Media Selection

Use `file_selector` and `image_picker`.

Why:
- `file_selector` avoided dependency conflicts seen with the latest `file_picker` and current `share_plus`.
- `image_picker` is the standard fit for camera/gallery flows.
- Both match the Vite app's attachment and image workflows without forcing storage decisions into UI widgets.

### Rendering and UI Packages

Current choices:
- `flutter_markdown_plus` for Markdown message rendering.
- `google_fonts` for Inter and Outfit parity with the Vite app.
- `lucide_icons_flutter` for icon parity with `lucide-react`.
- `share_plus` and `url_launcher` for mobile-native share and external links.

## Package Boundary

The app should keep these boundaries:

- `src/models`: shared domain records mirrored from the Vite app.
- `src/data/local`: Drift schema and SQLite repository.
- `src/data/secure`: secure credential repository.
- `src/state`: Riverpod app controllers.
- `src/features`: UI and feature workflows.
- `src/core`: theme and cross-cutting UI helpers.
- `src/app`: app shell, router, and top-level configuration.

Do not store API keys in Drift tables. Do not call Drift directly from widgets. Widgets should talk to Riverpod controllers or feature-level providers.

## Verification Gates

Before merging architecture or dependency changes:

```bash
cd apps/mobile
dart format lib test
flutter analyze
flutter test
flutter pub outdated
```

Expected current state:
- Analyzer has no issues.
- Tests pass.
- Direct dependencies are up to date.
