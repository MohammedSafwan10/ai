# Privora Web

Privora Web is the public SaaS surface for Privora: pricing, sign in/sign up, account pages, legal pages, desktop connection, and the future admin console.

It intentionally lives beside `apps/desktop` instead of inside it. The web app can expose public Appwrite configuration such as endpoint and project ID, but hosted model keys, Appwrite API keys, billing webhook secrets, and admin automation stay server-side only.

## Stack

- TanStack Start + TanStack Router
- React + TypeScript
- Tailwind CSS v4
- shadcn/ui-style owned components
- Appwrite Web SDK

## Commands

Run these from `apps/web`:

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

Create `apps/web/.env.local` for local development:

```env
VITE_APPWRITE_ENDPOINT=https://sgp.cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=69af9f0700103b7f3482
VITE_APPWRITE_SAAS_DATABASE_ID=privora_saas
```

For production Appwrite Sites, set the same values in the Appwrite site environment. When `privora.nexdark.com` is ready, keep the endpoint on the Appwrite project API endpoint, not the marketing domain.

Example shape:

```env
VITE_APPWRITE_ENDPOINT=https://sgp.cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=your_appwrite_project_id
VITE_APPWRITE_SAAS_DATABASE_ID=privora_saas
```

The app does not fall back to a real Appwrite project. If these values are missing, auth/account actions show a configuration message instead of silently calling production.

## Pages

- `/` marketing home
- `/pricing` INR-first pricing and AI credit policy
- `/security` security posture
- `/auth/sign-in` and `/auth/sign-up`
- `/account`, `/account/billing`, `/account/usage`
- `/desktop/connect` browser-based desktop handoff
- `/legal/privacy`, `/legal/terms`, `/legal/refund`, `/legal/acceptable-use`
- `/admin/*` placeholder admin routes, to be role-gated before real admin use

## Desktop Connection

The desktop app opens `/desktop/connect` in the system browser. In local development, the page returns a short-lived Appwrite JWT to the desktop loopback callback supplied in the URL. Production should replace that debug-friendly local handoff with a backend-issued one-time code exchange before broad release.

The browser shows the signed-in account and offers a return-to-desktop action. Desktop then stores the account connection result and display email/name locally.

## Product Rules

- Free users sign in and use BYOK.
- BYOK consumes 0 Privora AI credits.
- Plus is ₹799/mo with 5,000 AI credits.
- Pro is ₹1,999/mo with 20,000 AI credits.
- Hosted model keys stay only in backend environment secrets.
- Desktop sign-in uses browser auth; production callback security should use short-lived one-time codes.
- Admin belongs on the web and must be role-gated.

## Security Notes

- Do not add `.env.local` to git.
- Do not put OpenRouter keys, Appwrite API keys, Razorpay secrets, or webhook secrets in `VITE_*` variables.
- `VITE_*` variables are bundled into the browser and must be treated as public.
- Admin pages are UI placeholders until server-side role checks are wired in.
