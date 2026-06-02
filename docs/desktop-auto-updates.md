# Desktop Auto Updates

Privora Desktop uses Electron Forge's Windows Squirrel maker and Electron's `autoUpdater` for Windows x64 updates.

## Current Production Feed

```text
https://updates.nexdark.com/win32/x64/stable
```

The installed app checks that URL. The Appwrite Function behind the custom domain reads the latest release document from Appwrite Database and redirects Squirrel requests to files in Appwrite Storage.

## Appwrite Resources

- Project: `Privora`
- Project ID: `69af9f0700103b7f3482`
- Region: `sgp`
- Function: `desktop-update-feed`
- Custom domain: `updates.nexdark.com`
- Storage bucket: `desktop-releases`
- Database: `privora_desktop`
- Collection: `desktop_releases`

Each release document stores:

- `platform`: `win32`
- `arch`: `x64`
- `channel`: `stable`
- `version`: semantic version, for example `0.1.2`
- `releasesFileId`: Appwrite Storage file ID for `RELEASES`
- `packageFileId`: Appwrite Storage file ID for `Privora-<version>-full.nupkg`
- `installerFileId`: Appwrite Storage file ID for `PrivoraSetup.exe`
- `latest`: only one Windows x64 stable release should be `true`

## One Command Release

From the repository root, set a temporary Appwrite API key for non-interactive publishing:

```powershell
$env:APPWRITE_RELEASE_API_KEY = "YOUR_TEMP_APPWRITE_API_KEY"
```

Then publish:

```powershell
npm run desktop:release:win:x64
```

The script configures the Appwrite CLI to use `https://sgp.cloud.appwrite.io/v1` and project `69af9f0700103b7f3482` before upload. Do not use interactive account login for this release flow; Appwrite Cloud account login is global, while this project's storage/database API calls use the Singapore regional endpoint.

The release command uses Appwrite CLI for Storage uploads and direct Appwrite REST calls for release metadata. This avoids Windows PowerShell quoting problems with Appwrite CLI JSON document payloads.

Commit source changes before running the release command. By default the command requires a clean working tree, then it creates the desktop package version bump as the only local git change.

That command:

1. Requires a clean git working tree unless `--allow-dirty` is passed.
2. Bumps `apps/desktop` patch version by default.
3. Runs desktop TypeScript lint.
4. Runs desktop tests.
5. Builds the Windows x64 Squirrel installer.
6. Uploads `RELEASES`, `.nupkg`, and `PrivoraSetup.exe` to Appwrite Storage.
7. Creates or updates the Appwrite release metadata document as `latest:false`.
8. Marks the previous latest Windows x64 stable document as `latest:false`.
9. Marks the new release as `latest:true`.
10. Verifies the public update JSON and `RELEASES` endpoints.

To publish a specific version or custom notes:

```powershell
npm run desktop:release:win:x64 -- --version 0.1.2 --notes "Fix updater and polish production menu."
```

Useful options:

```text
--version <x.y.z>    Publish an exact version instead of bumping patch.
--bump <kind>        patch, minor, major, or none. Default: patch.
--notes <text>       Release notes stored in Appwrite metadata.
--allow-dirty        Allow releasing with pre-existing uncommitted changes.
--force              Allow publishing a version <= the current latest metadata.
```

After the command succeeds, commit and push the version bump:

```powershell
git status
git add apps/desktop/package.json apps/desktop/package-lock.json
git commit -m "Release desktop 0.1.2"
git push origin main
```

Use `--allow-dirty` only for an emergency/tester build where you intentionally want to release uncommitted local source changes.

After publishing, clear the key from the current terminal and rotate/delete the temporary API key in Appwrite:

```powershell
Remove-Item Env:\APPWRITE_RELEASE_API_KEY
```

## Manual Verification

```powershell
curl.exe -s https://updates.nexdark.com/win32/x64/stable
curl.exe -s https://updates.nexdark.com/win32/x64/stable/RELEASES
```

The JSON endpoint should show the new `version`. The `RELEASES` endpoint should mention `Privora-<version>-full.nupkg`.

## Important Notes

- Users on builds before `0.1.1` do not have updater code. They must install a new `PrivoraSetup.exe` once.
- After `0.1.1`, future Windows x64 stable releases can be delivered through the in-app update control.
- Users can see their installed version, latest release, update channel, update status, and release notes in Settings > About. The raw feed URL is public and safe, but normal UI shows a friendly channel label instead.
- The production menu hides Reload and Toggle Developer Tools in packaged builds.
- Do not commit Appwrite API keys or provider secrets. If a key is used for setup automation, rotate/delete it after use.
- If a key was pasted into chat or logs, rotate/delete it immediately after the release.
- Electron apps still contain bundled JavaScript inside `app.asar`; never embed private backend secrets in the app bundle.
- macOS updates are not configured yet. macOS production release needs signing, notarization, and a macOS-specific update feed.
