# Social Connection Provider Setup (J-6.7F)

This document records **configuration categories** for the TITAN Social Connection foundation.
It does **not** contain secrets, tokens or live credentials.

## Scope

Connection, authentication, account discovery/selection, health and disconnect/reconnect only.
**Not in scope:** publishing, scheduling posts, analytics dashboards, automated marketing campaigns.

## Providers

| Provider | Env variables | Callback pattern |
|----------|---------------|------------------|
| Facebook Pages | `META_APP_ID`, `META_APP_SECRET`, `INTEGRATIONS_ENCRYPTION_KEY` | `{APP_URL}/api/v1/social-connections/oauth/callback?provider=facebook` |
| Instagram Business | Same Meta app as Facebook | `{APP_URL}/api/v1/social-connections/oauth/callback?provider=instagram` |
| Google Business Profile | `GOOGLE_BUSINESS_CLIENT_ID`, `GOOGLE_BUSINESS_CLIENT_SECRET`, `INTEGRATIONS_ENCRYPTION_KEY` | `{APP_URL}/api/v1/social-connections/oauth/callback?provider=google_business` |
| WhatsApp Business | `META_APP_ID`, `META_APP_SECRET`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `INTEGRATIONS_ENCRYPTION_KEY` | `{APP_URL}/api/v1/social-connections/oauth/callback?provider=whatsapp_business` |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `INTEGRATIONS_ENCRYPTION_KEY` | `{APP_URL}/api/v1/social-connections/oauth/callback?provider=tiktok` |

Alternate env aliases accepted where documented in code (`FACEBOOK_APP_ID`, `GBP_CLIENT_ID`, etc.).

## Account selection expectations

- **Facebook:** Owner selects a Page returned by Meta for the authenticated account.
- **Instagram:** Instagram **Business** accounts linked to an available Facebook Page only — personal accounts are invalid.
- **Google Business Profile:** Owner selects a validated location (e.g. Young Guns Plumbing Cape Town).
- **WhatsApp Business:** WABA and phone-number identifier validated against discovery results. Operational messaging continues to use `whatsapp_connections` — this layer does not replace it.
- **TikTok:** Readiness structure only until `TIKTOK_LIVE_OAUTH_ENABLED=1` and provider review complete. TITAN reports `PROVIDER_REVIEW_REQUIRED` — never a fake Connected state.

## Provider review / approval blockers

| Provider | Blocker |
|----------|---------|
| Meta (FB/IG/WABA) | App review for advanced permissions in production |
| Google | OAuth consent verification for sensitive scopes |
| TikTok | Developer application review; set `TIKTOK_LIVE_OAUTH_ENABLED=1` only after approval |

## Staging setup (Owner actions)

1. Configure env vars on the TITAN API host — **never commit values to Git**.
2. Register OAuth redirect URIs in each provider developer portal (Owner login required).
3. Ensure `INTEGRATIONS_ENCRYPTION_KEY` is set before any connect attempt.
4. Apply migration `0179_social_connection_foundation.sql` only through the Owner-approved staging migration gate.
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

- **Meta:** [developers.facebook.com](https://developers.facebook.com) — create app, Facebook Login, WhatsApp product
- **Google:** [console.cloud.google.com](https://console.cloud.google.com) — OAuth client, Business Profile API
- **TikTok:** [developers.tiktok.com](https://developers.tiktok.com) — register app, submit for review

## TITAN UI entry point

`/integrations` → **Social Connections** section (Owner full access; Technician/Client hidden).

## Local test mode

```bash
export SOCIAL_CONNECTION_MOCK_OAUTH=1
export META_APP_ID=test-meta-app
export INTEGRATIONS_ENCRYPTION_KEY=<32-byte-key>
```

Mock mode enables OAuth URL generation, deterministic account discovery and health checks without external provider calls.
