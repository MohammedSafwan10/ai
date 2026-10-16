# Repository boundaries and migration

This repository owns only `apps/desktop`, `apps/marketing` and their documentation. The browser workspace, Flutter app and cloud/account stack were extracted into public `MohammedSafwan10/privora-workspace`, `privora-mobile` and `privora-platform` repositories.

Extraction retained relevant commit history. The workspace extraction includes its earlier root-level source history as well as the later `apps/workspace` directory. The source repository keeps its existing history; no force push or history rewrite is needed here.

Desktop now uses user-supplied provider keys. Its Privora Cloud provider, account login, credit API, billing UI and auth callback are removed. A saved legacy MiniMax hosted ID resolves to the corresponding OpenRouter model; retired hosted DeepSeek IDs follow the existing supported Go-model migration. Users still need their own key/account for the selected provider.

On opening the updated desktop, obsolete Privora login credentials and cloud-only settings are removed from local storage. Provider keys, chat history, project records, evidence and remote job identities are preserved. This local migration does not revoke sessions at remote services or delete cloud data.

The static marketing site preserves the public design and emits pre-rendered pages. It has no auth, billing or admin routes. Existing production website deployments and DNS have not been modified: point the static site's deployment at `apps/marketing` and publish `dist/` when ready. Legacy deployments, if retained, must follow the separate platform repository.

Local extraction checkouts are siblings of this repository: `privora-workspace`, `privora-mobile` and `privora-platform`. Ignored local configuration remains ignored. A complete Git bundle was saved before extraction, and original app folders plus local-only files were preserved in `privora-split-local-backups` beside the source repository. Local backup paths are not part of published source.
