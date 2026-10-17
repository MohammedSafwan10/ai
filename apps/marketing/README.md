# Privora static website

The free Privora Desktop product site, Windows downloads, access/security explanation and legal pages. React + TypeScript + Vite produce prerendered static HTML, served by Nginx on Coolify. No server-side app, account SDK, billing system, database, hosted model gateway or analytics are included.

```powershell
npm ci
npm run dev
npm run lint
npm run build
npm run preview
```

`dist/` contains the complete static site. The Dockerfile builds only this directory and serves port 8080, with `/health`, real 404 handling, security headers and a legacy `/pricing` redirect to the models explanation. Production pages are `/`, `/download/`, `/security/` and `/legal/{privacy,terms,acceptable-use}/`.

The approved design uses a light Schibsted Grotesk hero, mint action and Portal icon, followed by current desktop interface fragments. The file/browser/chat explorer supports mouse, touch and arrow-key navigation. Native text and links work in prerendered HTML; motion has a reduced-motion fallback. Images and fonts are served locally. Schibsted’s license is in `public/fonts/OFL.txt`. The main product conversation is an approved ImageGen illustration with GPT-6 Astra, labeled as sample content; the other fragments come from the current demo workspace or actual chat components. No old Appwrite-hosted video or poster is used.

The download button uses the unchanged stable release hostname. Version details are loaded separately with a timeout and an honest retry state. See [release operations](../../docs/desktop-auto-updates.md) for the independent read-only update service, verified SSH publishing and rollback. Website auto-deployment must be configured with an authenticated GitHub webhook; it must not publish a new desktop binary.

Design and validation notes: [approved implementation](../../docs/design/privora-marketing-v2/IMPLEMENTATION.md).
