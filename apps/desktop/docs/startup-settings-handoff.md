# Startup settings — implementation handoff

Status: planned, not implemented. Researched October 17, 2026.

The user approved the design below and requested this handoff for an agent to implement later. Creating this document does not enable Windows startup or change application behavior.

## Goal and UI

Add a **Startup** section to **Settings → General**. Use the existing flat preference rows and accessible switches; no new sidebar page or nested cards.

| Control | Default | Behavior |
| --- | --- | --- |
| Launch with Windows | Off | Start Privora after the current user signs in. |
| Start in tray | On for automatic startup | Applies only to Windows login launches. Manual launches show the window. Disable this control while Launch with Windows is off, retaining its preference. |
| Restore last project and chat | On | Restore the previous valid project/chat when the interface opens. |
| Run in background | Preserve existing preference | Controls whether closing the window hides it to the tray or quits. Keep it separate from startup visibility. |

Do not enable login startup as part of upgrading existing users. Existing users retain project restoration and their current close-to-tray preference.

For development, portable builds, or an unavailable stable installed launcher, disable Launch with Windows with the explanation **Install Privora to enable**. Other project-restoration settings should remain usable. This first implementation targets Windows; do not present Windows controls as functional on other platforms.

## Current implementation to inspect

Paths below are relative to `apps/desktop/`:

- `src/main/main.ts`: single-instance lock, `second-instance`, `focusMainWindow`, `showMainWindow`, `createWindow`, tray creation, update restart handling, and startup initialization.
- `src/main/db/store.ts`: settings defaults/load/save, `saveActiveSelection`, and `restoreActiveSelection`. Project/chat restoration already exists; extend it rather than adding a competing selection store.
- `src/main/ipc/register.ts`: settings validation and the `onSettingsChanged` hook, currently used to rebuild the tray menu.
- `src/shared/types.ts`: settings, save-input, and desktop API types.
- `src/preload/preload.ts` and `src/main/ipc/channels.ts`: typed IPC if startup status needs a new operation.
- `src/renderer/components/SettingsPanel.tsx`: General preferences and save-error feedback.
- `src/renderer/styles/shell.css`: preference row and switch styling.
- `forge.config.ts` and the existing update service: Windows Squirrel installation and update lifecycle.

At handoff time, startup does not register a Windows login item, `createWindow` initially shows the window, and `second-instance` focuses it unconditionally. `restoreActiveSelection` restores saved database records but needs explicit handling for a missing project directory.

## Recommended architecture

1. **Main-process startup service.** Keep launcher discovery, login registration/readback, launch classification, and platform checks outside React. Inject Electron/filesystem dependencies so policy can be tested without touching real Windows startup settings.
2. **Separate intent from OS status.** Persist Start in tray and Restore last project/chat. For Launch with Windows, display effective OS registration/approval, not a SQLite boolean alone. Read status on settings open and after a change. A user disabling startup in Task Manager must be respected; do not re-enable it on every app launch or ordinary preference save.
3. **Stable installed launcher.** Use Electron's `app.setLoginItemSettings` with the verified Squirrel stub launcher one directory above the versioned executable. Do not register an `app-<version>` executable, development Electron, or an arbitrary executable discovered by walking upward. Confirm the expected installed layout and launcher existence. Use a stable app-owned registration name.
4. **Explicit launch reason.** Register a fixed argument such as `--privora-login` and classify login, manual, and update-restart launches centrally. Pass the same path and arguments to `getLoginItemSettings`. Do not depend on `openAsHidden` for Windows behavior.
5. **Typed status to the renderer.** Return availability, effective enabled state, Windows-disabled status, and a concise error/reason. Validate IPC inputs. Keep executable selection in the main process rather than accepting paths from the renderer.
6. **Honest saves.** Apply the OS operation, read back the result, and show success only if it matches. A failed registration must not leave the UI claiming startup is enabled. Avoid changing unrelated preferences or silently registering a replacement launch path when unavailable. Handle disable with the same app-owned registration identity used to enable.

Suggested preference names are `startInTrayAtLogin` and `restoreLastProjectAndChat`; adapt them to current repository conventions. Keep effective login registration as runtime status rather than conflating it with user intent.

## Launch and window behavior

| Situation | Expected result |
| --- | --- |
| Manual first launch | Show a usable window once ready. |
| Windows login, Start in tray on | Create/verify the tray first and stay quiet. |
| Windows login, Start in tray off | Show the window once ready. |
| Login launch while an instance already runs | Exit the duplicate without showing/focusing the existing window. |
| Manual launch while an instance already runs | Show, restore if minimized, and focus the existing window. |
| Tray Open action | Create the window if necessary, then show/focus it. |
| Tray creation fails during hidden startup | Show the window so the app is reachable. |
| Explicit update restart | Follow the existing updater flow; do not misclassify it as a login launch. |

For visible startup, create the window with `show: false`, register readiness handling before loading, and show it when ready without an initial flash. Maintain a way for an explicit manual activation to request visibility while initialization is still in progress.

Prefer delaying renderer and browser-tab creation during tray-only login startup until the first explicit Open action. Keep the main process able to manage the tray, normal shutdown, and existing recovery policy. Audit initialization dependencies before making window creation lazy; do not break update events, attachment protocols, completion badges, or recovery. Hidden startup must not eagerly open browser tabs, IDE applications, or terminal windows.

Start in tray and Run in background are independent: if background mode is off, a login launch can initially sit in the tray, but closing a subsequently opened window should still quit. Tray Quit must remain available in every case.

## Restore behavior

- Reuse the current saved navigation IDs and chat history.
- With restoration on, validate the saved project record and directory. If the directory is missing, unavailable, or inaccessible, show the project chooser with a concise explanation; retain chat/history records for recovery.
- With restoration off, start at the project chooser without erasing remembered selection, projects, or chats. Ensure initial snapshot emission does not accidentally overwrite the remembered selection with null IDs.
- Reconcile deleted/hidden chat records and projectless chats deliberately. Do not silently open a different project merely because the saved project's path is unavailable.
- Restoration selects context only. It must not submit prompts, replay tool calls, restart completed commands, or automatically grant approvals. Preserve the existing distinction between recovering authoritative remote-job state and executing new work.

## Verification and acceptance

Use mocked OS registration for automated tests. Merely opening settings or running the test suite must not enable startup on the developer's PC.

- Defaults/migration: login startup off, restoration on, existing tray preference preserved.
- Installed launcher selection: valid Squirrel layout, missing stub, portable/development builds, spaces in paths, and version changes.
- Registration enable/disable/readback: OS failures, Windows startup approval disabled externally, matching arguments, and no automatic re-enabling on unrelated saves or app launch.
- Launch classification: normal launch, login argument, duplicate login, duplicate manual launch, and explicit update restart.
- Window/tray policy: no flash or focus stealing on hidden login, readiness races, manual activation during startup, tray failure fallback, and Run in background off.
- Restoration: valid selection, missing directory, removed/hidden chat, projectless chat, restoration disabled, and preservation of remembered navigation/history.
- UI: effective status/error text, accessible switch states, disabled unsupported controls, keyboard access, and narrow layouts.
- Regression: existing tray shutdown, updater restart, single-instance behavior, drafts, attachment protocol, and recovery remain functional. No prompts or commands run merely because a project was restored.
- Run type checking and focused tests, then package Windows. Verify real login and an installed old-to-new Squirrel update on a test Windows account/VM before claiming those OS flows are proven. Document any parts verified only with mocks. Test registration changes in that environment and restore its prior startup setting afterward.

## Official research sources

- [Electron login-item registration and Squirrel stub launcher](https://www.electronjs.org/docs/latest/api/app#appsetloginitemsettingssettings)
- [Reading registration, arguments, and Windows startup approval](https://www.electronjs.org/docs/latest/api/app#appgetloginitemsettingsoptions)
- [Single-instance lock and second-instance event](https://www.electronjs.org/docs/latest/api/app#apprequestsingleinstancelockadditionaldata)
- [Window readiness and avoiding startup flashes](https://www.electronjs.org/docs/latest/api/browser-window#showing-the-window-gracefully)

Recheck documentation against the Electron version actually installed when implementing; latest documentation can describe a newer major version. No implementation, release, or startup registration was performed for this handoff.
