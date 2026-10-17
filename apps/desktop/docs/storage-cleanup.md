# Browser storage cleanup

Settings → Storage reports browser-related storage, not the entire Privora database or all files on the PC. Browser data, saved browser evidence/history, and user downloads are separate sections. Locations and scan errors are under **Location and details**.

Each clear action has an inline confirmation. Saved evidence and downloads are permanent file deletions; existing links to deleted evidence will no longer work. Browser data cleanup clears cache, cookies, and website storage, which may sign users out; Chromium profile metadata can remain. Workflow history cleanup keeps workflow definitions, so its file may remain nonempty afterward. Empty files can still be removed.

The main process accepts only fixed category IDs. Cleanup requests cannot overlap, redirected directory/junction paths are refused, and partial failures are returned and shown rather than reported as complete success. Active chats, workflow replay, and active downloads are checked before cleanup. Workflow history clears through the live workflow manager so the next save cannot restore the deleted history; recording must finish first. Updates to the history file use an atomic replacement.

Regression tests use temporary storage and cover redirected roots/cache directories, retained definitions, history after the next save, interrupted historical runs, invalid workflow JSON, concurrent cleanup, zero-byte files, and profile-clear failures. UI checks cover confirmation/cancel, duplicate clicks, partial-error messages, and narrow layouts. These checks do not clear the user's real browser data or downloads.
