# Privora Web

Privora Web is the public SaaS surface for pricing, auth, account, legal pages, desktop connection, and future admin.

It intentionally lives beside `apps/desktop` instead of inside it. Desktop should not expose Appwrite project IDs, raw JWT fields, hosted provider keys, or admin controls.

## Stack

- TanStack Start + TanStack Router
- React + TypeScript
- Tailwind CSS v4
- shadcn/ui-style owned components
- Appwrite Web SDK

## Commands

```powershell
npm run dev
npm run lint
npm run build
npm run preview
```

From the repository root:

```powershell
npm run web:dev
npm run web:lint
npm run web:build
```

## Environment

Set these for production Appwrite Sites deployments:

```env
VITE_APPWRITE_ENDPOINT=https://appwrite.nexdark.com/v1
VITE_APPWRITE_PROJECT_ID=your_appwrite_project_id
VITE_APPWRITE_SAAS_DATABASE_ID=privora_saas
```

The app does not fall back to a real Appwrite project. If these values are missing, auth/account actions show a configuration message instead of silently calling production.

## Product Rules

- Free users sign in and use BYOK.
- BYOK consumes 0 Privora AI credits.
- Plus is ₹799/mo with 5,000 AI credits.
- Pro is ₹1,999/mo with 20,000 AI credits.
- Hosted model keys stay only in backend environment secrets.
- Desktop sign-in should use browser auth and `privora://auth/callback`.
- Admin belongs on the web and must be role-gated.
