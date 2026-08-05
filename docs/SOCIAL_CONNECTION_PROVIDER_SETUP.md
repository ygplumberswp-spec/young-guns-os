# Social Connection Provider Setup (J-6.7F)

This document records **configuration categories** for the TITAN **Social Connections** module (Facebook, Instagram, TikTok only).
It does **not** contain secrets, tokens or live credentials.

## Scope

**Social Connections** covers Facebook, Instagram and TikTok — connection, authentication, account discovery/selection, health and disconnect/reconnect only.

**Not in Social Connections:**
- **Google Business Profile** — separate Business Profile integration (`/social-media-integrations`)
- **WhatsApp Business** — separate Communications integration (`/integrations/whatsapp`)

**Not in scope:** publishing, scheduling posts, analytics dashboards, automated marketing campaigns.

## Social publishing providers

| Provider | Env variables | Callback pattern |
|----------|---------------|------------------|
| Facebook Page | `META_APP_ID`, `META_APP_SECRET`, `INTEGRATIONS_ENCRYPTION_KEY` | `{API_PUBLIC_URL}/api/v1/facebook-business/oauth/callback` |
| Instagram Business | Same Meta app as Facebook | `{API_PUBLIC_URL}/api/v1/social-connections/oauth/callback?provider=instagram` |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `INTEGRATIONS_ENCRYPTION_KEY` | `{API_PUBLIC_URL}/api/v1/social-connections/oauth/callback?provider=tiktok` |

Alternate env aliases accepted where documented in code (`FACEBOOK_APP_ID`, `META_OAUTH_CLIENT_ID`, etc.).

## Account selection expectations

- **Facebook:** Owner selects a Page returned by Meta for the authenticated account (canonical path: Facebook Business API).
- **Instagram:** Instagram **Business** accounts linked to an available Facebook Page only — personal accounts are invalid.
- **TikTok:** Readiness structure only until `TIKTOK_LIVE_OAUTH_ENABLED=1` and provider review complete. TITAN reports `PROVIDER_REVIEW_REQUIRED` — never a fake Connected state.

## Provider review / approval blockers

| Provider | Blocker |
|----------|---------|
| Meta (FB/IG) | App review for advanced permissions in production |
| TikTok | Developer application review; set `TIKTOK_LIVE_OAUTH_ENABLED=1` only after approval |

## Staging callback URLs (Owner Meta/TikTok portal)

Use the staging API host exactly:

- Facebook: `https://young-guns-os-staging.up.railway.app/api/v1/facebook-business/oauth/callback`
- Instagram: `https://young-guns-os-staging.up.railway.app/api/v1/social-connections/oauth/callback?provider=instagram`
- TikTok: `https://young-guns-os-staging.up.railway.app/api/v1/social-connections/oauth/callback?provider=tiktok`

Do **not** register WhatsApp Business or Google Business Profile callbacks under Social Connections — those modules document their own requirements.

## Staging setup (Owner actions)

1. Configure env vars on the TITAN API host — **never commit values to Git**.
2. Register OAuth redirect URIs in Meta and TikTok developer portals (Owner login required).
3. Ensure `INTEGRATIONS_ENCRYPTION_KEY` is set before any connect attempt.
4. Migrations `0179` and `0180` are applied on staging — do not rewrite or rerun.
5. Use mock OAuth locally with `SOCIAL_CONNECTION_MOCK_OAUTH=1` for deterministic tests — not for production.

## Production setup (Owner actions)

Same as staging with production app registrations and production callback URLs verified on the live host.
Live provider authorization is **not** marked complete in the master checklist until Owner-verified end-to-end connection.

## What must never be committed to Git

- OAuth client secrets
- Access tokens and refresh tokens
- Webhook verify tokens (live values)
- Provider private keys
- Real phone numbers or account IDs from live tenants (use mocks in tests)

## Owner portal steps (external login required)

- **Meta:** [developers.facebook.com](https://developers.facebook.com) — create app, Facebook Login, Instagram permissions
- **TikTok:** [developers.tiktok.com](https://developers.tiktok.com) — register app, submit for review

## TITAN UI entry point

`/integrations` → **Social Connections** section — exactly three cards (Facebook, Instagram, TikTok).
Owner full access; Admin/Office view-only; Technician/Client hidden.

**Business Profile integrations** and **Communications integrations** are linked separately on the same page.

## Local test mode

```bash
export SOCIAL_CONNECTION_MOCK_OAUTH=1
export META_APP_ID=test-meta-app
export INTEGRATIONS_ENCRYPTION_KEY=<32-byte-key>
```

Mock mode enables OAuth URL generation, deterministic account discovery and health checks without external provider calls.
