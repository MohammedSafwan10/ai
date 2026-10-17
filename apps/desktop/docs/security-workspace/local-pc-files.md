# Security projects: local PC files and exported evidence

Security has three distinct storage locations:

| Location | Available actions |
| --- | --- |
| Assigned Kali project | Remote commands and testing through `kali_*`; completed job artifacts can be collected. |
| Security project's local PC folder | List, search, read, create, edit, patch, rename, and delete project files using the existing `desktop_*` file tools. |
| Exported PC evidence collections | List and verify current-project collections, then move explicitly selected copies to Recycle Bin. |

The local PC project folder is identified in the agent's runtime context. It is the app-managed folder for that Security project, not the remote Kali path or the exported evidence folder. Local file tools retain Build's path boundaries, stale-write checks, mutation locking, diff/undo behavior, and permission-mode rules. They do not enable host commands, arbitrary PC paths, or desktop computer control. File tools cannot delete the project root; use the project's Remove project flow instead.

## Saved PC evidence tools

- `security_evidence_list`: inspect the current project's collection manifests and verify file size and SHA-256. Optional filename/path query and bounded pagination via `nextCursor`. A cursor remains usable after earlier collections are recycled. Invalid or modified collections are reported under `skipped`.
- `security_evidence_trash`: only for an explicit operator request to remove PC copies. Pass up to 20 collection IDs and exact hashes from the listing. It verifies project identity, expected directory layout, regular files, containment, and the current hash before moving the complete collection to the OS Recycle Bin. Collections containing additional user files, changed bytes, or linked paths are preserved. Duplicate IDs are processed once. Partial results and Recycle Bin failures are returned per collection; there is no permanent-delete fallback.

These operations are local and do not require a live Kali connection or a still-current remote job ID. They preserve VM originals, Privora's internal attachments, and chat history. Deleting PC copies does not securely erase every retained copy. Collected evidence is kept immutable through this interface; prepare edited reports as separate local project files rather than modifying collected originals and invalidating their recorded hashes.

Full access uses the normal permission-mode behavior; Ask risky requires approval for evidence recycling. Plan mode can inspect evidence but cannot recycle it or mutate local files, apart from supported dry-run edit previews. Finishing research is not implicit permission to delete evidence. Saved-to-PC controls reverify when a recycling result arrives; failed Copy/Open verification clears previously cached verification state.

Example requests:

- “Create a local PC `report.md` in this Security project.”
- “Read that local report and update the remediation section.”
- “List the PC evidence copies for this project.”
- “Move the three PC evidence copies we just listed to Recycle Bin; keep the VM originals.”

Tests cover actual agent-turn local file creation/read/edit/rename, outside-project and project-root deletion rejection, offline PC evidence operations, changed files, extra files, collection links, project mismatch, cancellation, permission/Plan policy, pagination after removal, and Recycle Bin failure. Tests use temporary fixtures and an injected trash implementation; they do not delete the user's real evidence. A Windows Electron smoke test also exercised the real Recycle Bin using one disposable collection: the verified collection was removed and a sibling file was preserved. Existing user evidence was not touched.
