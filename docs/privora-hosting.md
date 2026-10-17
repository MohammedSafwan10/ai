# Privora hosting

The static website and Windows update feed run on the existing OCI ARM64 VPS through Coolify. Both hostnames moved from Appwrite to DNS-only A records pointing to `129.151.44.211` on 17 October 2026. Cloudflare remains the DNS provider; it does not host or proxy these services.

| Service | Public address | Coolify resource |
| --- | --- | --- |
| Static website | https://privora.nexdark.com | `mxs16g7cy009gy0jxhrtnlxv` |
| Windows updates/downloads | https://updates.nexdark.com/win32/x64/stable | `ypmxb6h9rlo5dt62otqgpnoa` |

The website builds React/TypeScript with Vite and serves prerendered HTML from Nginx. The update service uses Nginx with a read-only persistent directory and verified, atomic release promotion. Neither service needs a database, account service or model gateway. Each container is limited to 0.25 CPU and 128 MB RAM. Internal port 8080 is routed through Coolify's HTTPS proxy, without publishing another host port.

A signed GitHub push webhook deploys changes under `apps/marketing/**` or `apps/releases/**` to their respective service. It never publishes desktop binaries. Windows artifacts are built on Windows and published over SSH; see [release operations](desktop-auto-updates.md).

## DNS operations

`apps/marketing/scripts/cutover-dns.ps1` changes only these two existing DNS records. It reads the user's protected local Cloudflare credential without printing it and refuses unexpected targets. Run `-Action Rollback` to restore the historical Appwrite CNAMEs, or `-Action Cutover` to restore the VPS addresses. Rollback requires those old origins to remain available; the migration does not delete them.

Check both `/health` endpoints with normal certificate verification after a change. Coolify manages Let's Encrypt certificates. Verify downloads with `python apps/releases/verify-feed.py` and check the website's download page in a browser. Back up `/home/ubuntu/privora-releases` separately from container deployments. Keep credentials and signing material outside Git.

## Initial migration verification

Both HTTPS health endpoints and live browser checks passed after cutover. Version 0.1.49 was built on Windows with the Portal icon and promoted only after manifest, size and hash verification. Its installer SHA-256 is `799ba7a46e09c03431894f312738f0837236530c29219ceccc231c15dd894d2c`. The 0.1.48 package remains available for existing clients. Metadata, CORS, manifest, range requests and private-storage isolation passed the feed verifier.

Desktop validation: 913 tests passed, 7 skipped. Live website checks covered all mobile routes, keyboard explorer controls, FAQ, reduced motion and release-error/retry handling. The installer is unsigned; no signing certificate was configured. An installed Windows old-to-new automatic update has not been exercised. The running portable desktop was left open and unchanged.
