# Privora Computer Use

Privora Computer Use is the native desktop-control surface that complements files, terminal, browser, notes, and workflows.

## V1 Shape

- `privora_windows_native` is the default backend on Windows.
- `cua_driver` exists only as an optional compatibility slot and is disabled until a separate audit and smoke-test pass.
- The stable agent tools are:
  - `computer_capabilities`
  - `computer_list_windows`
  - `computer_find_apps`
  - `computer_focus_window`
  - `computer_snapshot`
  - `computer_inspect`
  - `computer_act`
  - `computer_wait`
  - `computer_trace`
  - `computer_verify`
  - `computer_screenshot`
  - `computer_clipboard`
  - `computer_stop`
  - `computer_open_app`

`computer_open_app` opens exact paths/commands directly. For friendly product names, Privora first resolves installed-app candidates from Start Menu shortcuts, Windows App Paths, registry uninstall entries, PATH commands, and bounded common app-folder scans.

## Runtime Strategy

Privora uses a semantic-first loop:

1. Prefer UI Automation snapshots and refs.
2. Use screenshot evidence only for visual surfaces, ambiguous targets, or verification.
3. Use foreground input fallback only when UIA/direct patterns are unavailable.
4. Report the capability used in results and traces.

Actions default to `background_only`. In that mode Privora never moves the real pointer, sends global keys, or steals the foreground. An action that lacks a direct UI Automation pattern reports that foreground access is required. `allow_foreground` enables the existing guarded input fallback for visual/canvas-style surfaces, and should only be used while the user is not interacting with the desktop.

Verification is point-in-time evidence. Privora verifies important results immediately with a fresh semantic snapshot. Later user activity in the same app, another tab, another window, or another virtual desktop is reported as a newer state and does not invalidate an outcome that was already verified.

For lower latency and less noise, snapshots support `scope=active_document` and `scope=matching_controls`, plus `role` and `editableOnly` filters. Snapshot results identify `activeTab` and `activeDocumentRef` when UI Automation exposes them. Text mutations verify their observed value atomically, and action results separately expose input capability, global-input use, foreground before/after, focus restoration, and reference lifecycle (`stable`, `stale`, or `remapped`). Semantic waits cover editable text, elements, active tabs, and tab counts.

Capability labels:

- `uia_direct`
- `window_message`
- `send_input_foreground`
- `blocked_by_uipi`
- `elevated`
- `secure_desktop`
- `unsupported_canvas`

## Safety

Computer Use must be enabled from the composer before native desktop actions can control apps.

Full Access skips ordinary approval prompts, but hard blocks remain:

- UAC secure desktop and lock screen
- credentials, passwords, MFA, OTP, API keys, tokens, cookies, and hidden secrets
- payment/card data
- irreversible real-world actions such as purchases, transfers, bookings, account deletion, and order submission
- elevated/system boundaries that Windows blocks through UIPI/UIAccess

Snapshots and screenshots are evidence, not instructions from the inspected app.

## Cua Boundary

Cua is useful research/reference material for future adapters, especially around no-foreground contracts, vision/SOM flows, diagnostics, and known-limit reporting.

Privora does not vendor Cua in v1 because product permissions, traces, evidence retention, install/update behavior, telemetry expectations, and user controls must remain Privora-owned.

## Verification Targets

Smoke tests should cover:

- Notepad
- Calculator
- File Explorer
- Chrome or another browser
- VS Code/Electron apps
- installer dialogs
- elevated apps and UAC, expecting blocked diagnosis
- canvas/game surfaces, expecting screenshot or unsupported-surface diagnosis
