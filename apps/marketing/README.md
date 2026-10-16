# Privora static marketing site

Public desktop marketing, download, BYOK, security and legal pages. No account SDK, sign-in route, checkout, hosted inference gateway or server runtime is included.

```powershell
npm ci
npm run dev
npm run lint
npm run build
npm run preview
```

Build produces pre-rendered HTML pages and browser assets in `dist/`. Upload the contents of that directory to a static host with directory-index support. No SSR adapter, environment secrets or Appwrite project configuration is needed. Existing download/update and demo-video URLs remain public external assets; building this site does not deploy it or change DNS.

`/pricing/` remains as a compatibility URL explaining BYOK. Old account and billing URLs are deliberately absent. Previous web and cloud code lives in the separate privora-platform repository.
