# Privora Browser Agent

Privora Browser is the built-in workspace browser for development, research, and repeatable browser workflows. The main process owns the browser views, page state, CDP instrumentation, downloads, workflow records, and evidence artifacts. The renderer only shows browser chrome, compact status, menus, and saved evidence summaries.

## Architecture

- Browser tabs are Electron `WebContentsView` instances with isolated per-workspace profiles.
- Renderer code never receives cookies, storage, request headers, or privileged page JavaScript access.
- Browser tools operate on the active tab unless a `tabId` is provided.
- Browser evidence is bounded, redacted, and stores large artifacts by local path instead of inline base64.
- Agent page snapshots are treated as evidence, not instructions.

## Phase 2A: Tabs, Downloads, PDF Evidence

Phase 2A turned the browser from a single verification surface into a multi-tab, artifact-aware browser.

- Real per-workspace tabs with active-tab routing and a six-tab cap.
- Tab APIs and agent tool support through `browser_tab`.
- Safe download tracking through `browser_downloads`.
- Downloads are blocked unless the user or approved agent flow allows the next download.
- Completed downloads are stored under the user's downloads folder in `Privora`.
- PDF evidence through `browser_pdf` for bounded text, summary, and screenshots.
- Current-page evidence records include URL, title, viewport, console/network counts, PDF status, and optional screenshot paths.

## Phase 2B: Form Workflows

Phase 2B added controlled form analysis, filling, validation, and submission.

- `browser_form_analyze` detects visible forms, controls, required fields, submit labels, and risk.
- `browser_form_fill` fills by stable `fieldId` first, with name/label fallback only when needed.
- `browser_form_validate` reports browser validation state and submit readiness.
- `browser_form_submit` returns causal evidence after submit attempts.
- Sensitive fields such as password, OTP, API key, card number, CVV, hidden tokens, and secrets are never returned with raw values.
- Risk labels include `safe`, `sensitive`, `sensitive_payment`, and `irreversible`.
- Full access skips normal approval prompts for browser workflow actions, while hard security blocks remain.

## Phase 2C: Workflow Runner, Evidence Vault, Assertions, Diagnosis

Phase 2C made browser work reusable and test-like.

- `browser_workflow` records, lists, gets, renames, deletes, and replays reusable named browser workflows.
- Recording captures meaningful browser actions such as open, wait, trace, fill, submit, screenshot, extract, evidence, and verify.
- Replay resolves targets semantically before falling back to coordinates.
- `browser_assert` supports text, URL, console, network, element, form, screenshot, and PDF assertions.
- `browser_evidence_vault` saves bounded evidence records scoped by workspace/workflow/run.
- `browser_diagnose` classifies failures such as validation failure, network error, auth error, console error, timeout, stale target, and policy block.
- Workflow replay can start in a new tab and auto-records the current page when recording begins after navigation.

## Phase 2D-lite: Storage Cleanup And Retention

Phase 2D-lite added a Settings storage surface so browser artifacts do not grow forever on user machines.

- Settings > Storage scans browser artifacts, workflow run history, browser cache/profile data, and Privora downloads.
- The app-owned cleanup action removes browser artifacts, workflow run/evidence history, and browser cache without touching user downloads.
- Workflow cleanup preserves reusable workflow definitions and assertions, pruning only old runs and evidence records.
- Downloads are shown separately because they are user files under the user's downloads folder in `Privora`.
- Scans and deletes run in small async chunks so large artifact folders do not freeze the app.
- Browser profile cleanup clears active Electron sessions and persisted cache/storage folders for Privora browser partitions.

## Safety Defaults

- Localhost and workspace dev origins are smooth by default.
- External-origin clicks, typing, downloads, form fill/submit, uploads, purchases, bookings, applications, password/MFA/payment flows, file reveal, and irreversible actions need approval unless Full access is active.
- Hard blocks remain even in Full access: blocked URL schemes, CAPTCHA bypass, hidden secret extraction, credential scraping, and auto-opening downloaded files.
- Persisted local dev tabs are not auto-restored on app startup, so stopped dev servers do not create noisy connection errors.

## Verification

Current coverage includes:

- Browser security and URL restore policy tests.
- Browser tool routing and schema tests.
- Causal journal console/network compaction tests.
- Workflow manager tests for recording, redaction, evidence retention, assertions, and diagnosis.
- Storage cleanup tests for app-owned cleanup, download separation, and workflow-history pruning.
- Desktop tool executor tests for browser workflow tool routing.

Run from `apps/desktop`:

```powershell
npm run lint
npm test
```
