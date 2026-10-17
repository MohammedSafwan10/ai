# Privora marketing and release hosting plan

Status: proposed; no application deployment, DNS change, release publication, or legacy service deletion performed.

## Goals

- Redesign and rewrite the static website around today's Privora Desktop.
- Present Privora as free to download and use, without a pricing page, paid tiers, credits, or Privora accounts.
- State concisely that users supply model access and provider usage charges may apply. Do not promise free third-party inference or infer a software license from the product being free of charge.
- Host the website, demo assets, installers, and desktop update feed on the existing OCI/Coolify infrastructure.
- Replace Appwrite release publishing and asset dependencies. Preserve compatibility with installed Windows clients.

## Verified starting point

- Repository: `MohammedSafwan10/privora-desktop`; static site: `apps/marketing`.
- Site stack: React, Vite, and build-time HTML prerendering; output: `apps/marketing/dist`.
- `/pricing` still exists and navigation links to it despite showing BYOK copy.
- Site downloads and the installed desktop updater share `https://updates.nexdark.com/win32/x64/stable`.
- The updater uses Electron autoUpdater and Squirrel.Windows. Its backend and release script currently use Appwrite, not GitHub Releases.
- The demo video also uses Appwrite Storage.
- Cloudflare's authoritative record inventory shows `privora.nexdark.com` as a DNS-only CNAME to `appwrite.network`, and `updates.nexdark.com` as a DNS-only CNAME to `sgp.cloud.appwrite.io`. Cloudflare currently provides DNS for both; proxying is disabled. The website origin is configured for Appwrite, not Cloudflare Pages. The requested destination is Coolify for both hosting services, retaining Cloudflare only as DNS unless a separate DNS-provider migration is requested.
- Local Coolify CLI authentication works; live server version reported 4.4.6.
- Current application inventory shows GameVerse; no Privora application is listed.
- SSH alias `oci-coolify` works. Server architecture is ARM64; observed root capacity is 96 GB with about 88 GB available, and RAM is about 12 GB. These are point-in-time observations.
- Unprivileged SSH cannot access the Docker socket. Use Coolify for application deployment rather than changing Docker permissions.
- Follow `D:/Dev/oracle/OCI_COOLIFY_RUNBOOK.md`: maintain OCI resource ceilings, HTTPS domain routing, existing firewall policy, and protected CLI credentials.

## Website direction and content

Audience: developers and operators who want a desktop agent with their own models and visible tools.

First present three home-page concepts: a dark product-focused layout, a light editorial layout, and a compact technical workspace layout. Recommend the dark product-focused direction because it can present the actual desktop interface prominently. Select the design before implementing the complete site.

Scope:

1. Home: clear product statement, free-download action, real interface/demo, coding/browser/subagent/Security workflows, and a short BYOK explanation.
2. Download: Windows x64 installer, authoritative version/date/size/hash, installation steps, and honest availability for other platforms.
3. Security and privacy: local persistence, remote provider data flow, optional Kali execution, permissions, and evidence handling.
4. Legal pages: align existing terms/privacy/acceptable-use copy with a free BYOK desktop and the actual hosting setup.
5. Header/footer, mobile navigation, metadata, favicon, sitemap, robots, and useful 404 behavior.

Remove the pricing component, route registration, navigation entries, generated page, and pricing-related marketing language. Redirect historical `/pricing` requests to the relevant home-page section at the web server rather than retaining a pricing page.

Use actual product captures. Keep motion restrained, support reduced motion, test keyboard navigation and narrow screens, and avoid showing fabricated product functionality. No new account system, payment integration, analytics, or hosted inference backend is needed.

## Recommended hosting

Create a dedicated Privora project in Coolify with two independent resources on the existing server:

| Resource | Public address | Deployment and persistence |
| --- | --- | --- |
| Marketing | `https://privora.nexdark.com` | Multi-stage Dockerfile: build only `apps/marketing`, serve prerendered output with Nginx. Auto-deploy site changes through a verified Git webhook/App connection. |
| Releases | `https://updates.nexdark.com` | Small Nginx service with explicit compatibility routes, persistent release storage mounted read-only, and a health endpoint. Publishing writes through a separate restricted SSH path. |

Both images must support ARM64. Build Windows installers on Windows; the ARM server only serves artifacts. Keep release storage outside website containers so site rebuilds cannot erase downloads. Serve the demo video from persistent media storage with HTTP range support; remove its Appwrite URL.

Use Coolify for TLS and routing. Do not expose extra public host ports or add paid OCI resources. GitHub remains the source repository; binary distribution and update delivery move to the VPS.

## Release contract and publishing

Keep the existing feed hostname and Windows path to support already-installed versions:

- `GET /win32/x64/stable`: JSON metadata compatible with current version, notes, and releaseDate fields; add installer size and SHA-256 for the website.
- `GET /win32/x64/stable/RELEASES`: Squirrel-generated manifest without rewriting package names or hashes.
- `GET /win32/x64/stable/PrivoraSetup.exe`: stable installer alias.
- Existing package filenames under the feed path: retained, immutable `.nupkg` files so checks that overlap a release promotion can finish.
- Immutable version-specific installers, metadata, and checksums; a bounded retention policy preserving packages required by supported clients.

Use short/no-cache rules for mutable metadata and stable aliases, long immutable caching for versioned files, correct binary headers, bounded metadata CORS for the marketing origin, and range requests for large files. Keep directory listing and public uploads disabled.

Replace the Appwrite implementation in `apps/desktop/scripts/release-win-x64.cjs` with a release flow that:

1. Validates version, selected channel, source state, and local publishing configuration without logging credentials.
2. Runs checks and builds Windows x64 installer artifacts; signs/verifies them when signing credentials are configured.
3. Generates metadata and hashes from the produced files.
4. Uploads to a staging directory through a restricted deployment identity.
5. Verifies hashes on the server before making immutable files available.
6. Promotes a complete metadata/manifest/installer-alias set atomically after required packages are present.
7. Checks the public metadata, manifest, installer headers, and package downloads.

Retain the prior release set for rollback. A source push may deploy the website, but must not automatically publish a desktop binary release. Document both operations as separate commands.

Review the desktop updater for metadata validation, bounded fetches, current states, error recovery, and install shutdown behavior. Preserve Electron/Squirrel compatibility instead of introducing a new updater framework solely to change hosting.

## Migration order

1. Inventory all current public release metadata, installers, packages, video assets, DNS records, redirects, and consumers. Record versions and hashes; check for update checks already relying on old package URLs.
2. Prepare the redesign concepts, release server configuration, ARM64 Dockerfiles, publishing automation, tests, and deployment runbook locally.
3. Create new Coolify resources with temporary preview domains. Confirm exact project/resource IDs and domain impact before production changes.
4. Seed the server with the current release and its dependencies, then verify the existing feed protocol and checksums against the copied files.
5. Test website downloads and an installed old-version-to-new-version Windows update. Portable packages cannot validate automatic updates.
6. Cut over `privora.nexdark.com` and `updates.nexdark.com` through the existing DNS automation; retain the existing origin for rollback during DNS propagation and real-client verification.
7. Verify production HTTPS, desktop update checks, actual installation, website navigation, video playback, and metadata.
8. Remove legacy Appwrite publishing code/configuration and obsolete pricing assets from this repository; update docs, README, and GitHub About links as needed.
9. Retire remote Appwrite resources only after the replacement is verified and their consumers and retention requirements are checked. Do not delete unrelated platform repositories, shared buckets, or historical source.

## Validation and acceptance

- Marketing typecheck and static production build; route/link checks; responsive and keyboard review; no pricing navigation/page or old account flow.
- Marketing build context excludes desktop dependencies, user data, and secrets.
- Public download returns the expected installer bytes and SHA-256; failure states do not claim an unavailable release is ready.
- Release dry run, interrupted upload, failed verification, duplicate/older version rejection, atomic promotion, old-package retrieval, and rollback checks.
- Installed Windows update tested from an older version using the unchanged hostname/path. Verify local history, credentials, and evidence survive installation.
- Website redeploy leaves binary storage intact. Both resources recover after container restart; persistent files are backed up independently.
- Repository-wide scan for obsolete Appwrite update/video URLs, publishing credentials, and pricing links. Review each remaining match rather than deleting unrelated historical documentation blindly.

## Deployment tooling

Use the existing Coolify CLI context and `D:/Dev/oracle/cloudflare_dns.ps1`. Read command-specific help before mutations, select resources by UUID, and inspect only needed non-sensitive fields. Do not print the CLI config or raw `app get` responses. Record reusable resource names, domains, deployment commands, and rollback steps without private values.

## References

- Coolify build methods: https://coolify.io/docs/applications/builds/overview
- Coolify static hosting: https://coolify.io/docs/applications/builds/static
- Electron update architecture: https://www.electronjs.org/docs/latest/tutorial/updates
- Electron autoUpdater: https://www.electronjs.org/docs/latest/api/auto-updater
