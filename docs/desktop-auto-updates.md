# Windows releases and updates

Privora uses Electron autoUpdater and Squirrel.Windows. The stable feed stays at `https://updates.nexdark.com/win32/x64/stable` so existing installed clients retain their update address. The replacement is an Nginx service on the existing ARM64 Coolify server, serving persistent release files without an account service, database, GitHub Releases, or Appwrite dependency.

## Prepare and publish

Build Windows artifacts on Windows. The server only verifies and serves files. From a clean source checkout:

```powershell
npm run desktop:release:win:x64 -- --version 0.1.49 --notes "Describe the release"
```

This runs desktop lint and tests, builds Squirrel artifacts, verifies the RELEASES package SHA-1 and size, computes installer SHA-256, and prepares a local bundle. It does **not** publish until `--publish` is provided:

```powershell
npm run desktop:release:win:x64 -- --version 0.1.49 --notes "Describe the release" --publish
```

Use `--skip-build --artifacts <directory> --version <x.y.z>` to import existing installer artifacts. Use `--release-date <ISO timestamp>` when preserving a historical release. `--allow-dirty` explicitly bypasses the source-tree check; use only for a deliberately selected import/test build. The default version bump is patch; `--bump` also accepts minor, major or none. There is no force-overwrite option.

SSH authentication uses the existing `oci-coolify` config alias. Defaults are `/home/ubuntu/privora-releases` for storage and that alias for publishing; override with `PRIVORA_RELEASE_ROOT` / `PRIVORA_RELEASE_SSH_HOST` or `--root` / `--host`. Credentials remain in SSH config/agent, outside this repository. No cloud API key is needed.

Windows signing remains optional. Both `WINDOWS_CERTIFICATE_FILE` and `WINDOWS_CERTIFICATE_PASSWORD` must be configured together. When present, the executable and installer signatures are verified. When absent, the build reports that artifacts are unsigned.

## Storage and promotion

`apps/releases/docker-compose.yaml` mounts `/home/ubuntu/privora-releases` at `/srv/privora` **read-only**. Do not publish container ports on the host; use Coolify’s HTTPS router. The website is a separate static resource, so a website rebuild cannot erase releases.

```
privora-releases/
  staging/        incomplete uploads; never publicly served
  versions/       complete verified manifests, metadata and installer
  packages/       immutable full .nupkg packages
  installers/     immutable versioned .exe installers
  current         atomic symlink to one verified version
```

The publisher uploads an isolated staging directory. `promote.py` locks promotion, validates the complete bundle, accepts Windows UTF-8-BOM manifests without rewriting their bytes, checks hashes and sizes, rejects duplicate/older versions, installs immutable files, then atomically replaces `current`. Existing package filenames remain available across promotion. Failed uploads/verification leave the public pointer untouched. Old files are retained; periodically back up the directory and apply a reviewed retention policy instead of deleting packages during publication.

Rollback changes only the pointer after validating a previous version:

```powershell
ssh oci-coolify "python3 /home/ubuntu/privora-releases/promote.py --root /home/ubuntu/privora-releases --rollback 0.1.48"
```

This restores the **served** release. It does not downgrade already updated desktop clients.

## Routes and checks

| Route | Purpose |
| --- | --- |
| `/win32/x64/stable` | Version, notes, release date, installer SHA-256/size, file URLs |
| `/win32/x64/stable/RELEASES` | Original Squirrel manifest bytes |
| `/win32/x64/stable/PrivoraSetup.exe` | Stable installer alias |
| `/win32/x64/stable/PrivoraSetup-<version>.exe` | Immutable versioned installer |
| `/win32/x64/stable/Privora-<version>-full.nupkg` | Immutable full package |
| `/health` | Container readiness |

Check JSON, manifest bytes, installer SHA-256, range requests and prior-package retrieval after publication. A source push or website deployment never publishes a desktop binary. The installed Windows build and its `Update.exe` are required for automatic update testing; a portable build cannot validate Squirrel’s install flow. Do not claim an old-to-new installed update passed based only on HTTP tests.

The historical Appwrite implementation remains in the separate platform repository as rollback/reference history. No shared remote service or bucket is deleted automatically by these scripts.
