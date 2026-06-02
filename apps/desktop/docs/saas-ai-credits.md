# Privora SaaS AI Credits

This is the first SaaS foundation for hosted Privora models. BYOK remains available on every plan and consumes 0 Privora AI credits.

## Plans

| Plan | Price | Hosted credits |
| --- | ---: | ---: |
| Free | INR 0 | BYOK only |
| Plus | INR 799/mo | 5,000 AI credits/month |
| Pro | INR 1,999/mo | 20,000 AI credits/month |

AI credits are consumed based on model, input size, output size, and tool usage. Premium models consume credits faster. BYOK usage does not consume Privora AI credits.

## Credit Formula

```text
raw_cost_usd = OpenRouter reported/estimated token cost
credits_used = ceil(raw_cost_usd * 2000)
```

The gateway enforces hosted-model allowlist, per-run cap, daily cap, and monthly balance before calling OpenRouter.

## Hosted Gateway

Function path:

```text
appwrite/functions/model-gateway
```

Required function env vars:

| Env var | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | Server-only OpenRouter key. Never store this in desktop or database. |
| `SAAS_DATABASE_ID` | Defaults to `privora_saas`. |
| `AI_CREDIT_MULTIPLIER` | Defaults to `2000`. |

The desktop executes the function through Appwrite with a short-lived user JWT derived from the stored Appwrite session. The gateway validates the Appwrite account, checks plan/credits, calls OpenRouter, records `usage_events`, writes immutable `credit_ledger` debits, and returns updated credit summary.

## Browser Auth Flow

Desktop sign-in must happen through the SaaS website, not with password fields inside Electron.

1. Desktop generates a random state nonce and stores it with OS-backed encryption.
2. Desktop opens `https://privora.nexdark.com/desktop/connect?state=<nonce>&source=desktop`.
3. The website handles sign-in, pricing, email verification, and account pages.
4. The website will later issue a short-lived one-time code and open `privora://auth/callback?code=<code>&state=<nonce>`.
5. Desktop accepts the callback only when the state matches the pending nonce and has not expired.
6. The remaining backend step is exchanging the one-time code for a desktop Appwrite session.

Do not add raw JWT, Appwrite project, endpoint, gateway, or password fields to desktop Billing UI.

### Local development

When running desktop in development, `Sign in with Privora` first checks for a local web app at:

```text
http://localhost:3002
http://localhost:3001
http://localhost:3000
```

If none are reachable, it falls back to `https://privora.nexdark.com`.

To force a specific web URL:

```powershell
$env:PRIVORA_WEB_BASE_URL = "http://localhost:3002"
npm run dev
```

## Appwrite Schema

Create/seed the credit engine from `apps/desktop`:

```powershell
$env:APPWRITE_RELEASE_API_KEY = "<temporary Appwrite API key>"
npm run saas:setup:credits
```

Collections:

- `profiles`
- `subscriptions`
- `credit_balances`
- `credit_ledger`
- `usage_events`
- `model_catalog`

## Admin v1

Manual grants and plan changes are done with the admin script until Razorpay webhooks exist.

```powershell
$env:APPWRITE_RELEASE_API_KEY = "<temporary Appwrite API key>"
npm run saas:admin:credits -- set-plan --user-id "<userId>" --plan plus
npm run saas:admin:credits -- grant --user-id "<userId>" --credits 500 --reason "manual test"
npm run saas:admin:credits -- usage --user-id "<userId>"
npm run saas:admin:credits -- disable --user-id "<userId>"
npm run saas:admin:credits -- enable --user-id "<userId>"
```

## Desktop UI

- Topbar shows AI credit balance or `BYOK`.
- Settings > Billing shows plan, credits, renewal/reset, recent usage, and browser sign-in/sign-out controls.
- Composer does not show duplicate BYOK/credit chips.
- BYOK routes consume 0 Privora AI credits.

## Deferred

- Razorpay subscription and webhook grants.
- Desktop one-time code exchange function for the browser auth callback.
- Full admin dashboard.
- Top-ups.
