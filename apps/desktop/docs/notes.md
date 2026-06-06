# Privora Notes

Privora Notes is the built-in local notepad in the workspace side panel. It supports quick autosaved drafts, global notes, workspace notes, and file-backed notes opened from or saved to the user's PC.

## Behavior

- Notes live in the `Notes` panel beside `Files`, `Review`, and `Browser`.
- Draft notes autosave locally under the app `userData/notes` directory.
- File-backed notes keep their external file path and write to disk only when the user or agent saves.
- Global notes appear in every workspace. Workspace notes appear only in the matching workspace. File-backed notes appear as recent notes.
- Notes are plain UTF-8 text only. Binary files are rejected.
- Large notes stay usable by reducing editor features above 10 MB and opening read-only above 25 MB.

## Agent Tools

Agents can use:

- `notes_list`
- `notes_create`
- `notes_read`
- `notes_update`
- `notes_save`
- `notes_delete`

Creating and updating draft notes is safe. Saving to disk or deleting notes is guarded unless Full Access is enabled. File-backed note deletion removes only Privora's note record and local draft copy; it never deletes the external file.
