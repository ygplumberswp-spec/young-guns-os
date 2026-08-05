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
| Facebook Page | `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`, `INTEGRATIONS_ENCRYPTION_KEY`, optional `META_LOGIN_CONFIG_ID` | `{API_PUBLIC_URL}/api/v1/facebook-business/oauth/callback` |
| Instagram Business | Same Meta app as Facebook | `{API_PUBLIC_URL}/api/v1/social-connections/oauth/callback?provider=instagram` |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `INTEGRATIONS_ENCRYPTION_KEY` | `{API_PUBLIC_URL}/api/v1/social-connections/oauth/callback?provider=tiktok` |

Alternate env aliases accepted where documented in code (`FACEBOOK_APP_ID`, `META_OAUTH_CLIENT_ID`, etc.).

## Account selection expectations

- **Facebook:** Owner selects a Page returned by Meta for the authenticated account (canonical path: Facebook Business API).
- **Instagram:** Instagram **Business** accounts linked to an available Facebook Page only — personal accounts are invalid.
- **TikTok:** Readiness structure only until `TIKTOK_LIVE_OAUTH_ENABLED=1` and provider review complete. TITAN reports `PROVIDER_REVIEW_REQUIRED` — never a fake Connected state.

## Facebook OAuth — least-privilege (invalid-scope correction)

**Live staging failure (2026-08-05):** Meta rejected the initial connect with **Invalid Scopes** because TITAN requested advanced permissions not enabled for the unpublished app's "Manage everything on your Page" use case.

**Corrected initial OAuth (Facebook Business `/api/v1/facebook-business`):**

| Tier | Scopes | When requested |
|------|--------|----------------|
| **Basic connection** | `pages_show_list` only | Initial Connect — Page discovery and selection |
| **Publishing** | `pages_manage_posts` | Re-authorisation only, when Meta use case supports it |
| **Optional** | engagement, messaging, leads, insights, metadata, visitor content | Never at initial connect — honest `REQUIRES_META_ACCESS` in UI |

**Forbidden on initial OAuth URL:** `pages_read_engagement`, `pages_manage_posts`, `pages_manage_engagement`, `pages_manage_metadata`, `pages_messaging`, `leads_retrieval`, `pages_read_user_content`, `read_insights`, and all Instagram scopes.

### Facebook Login for Business (optional)

If your Meta app requires Login for Business (Configuration ID):

1. Meta App Dashboard → **Facebook Login for Business** → create a **Login configuration** for Page management.
2. Set on TITAN API host: `META_LOGIN_CONFIG_ID=<configuration-id>` (never commit).
3. TITAN uses `config_id` **only** — never combined with a raw `scope` parameter.
4. If `META_LOGIN_CONFIG_ID` is unset, TITAN falls back to scope-based OAuth with `pages_show_list` only.

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

**Facebook Page selection:** After OAuth, the Owner completes Page selection in the **Facebook Business workspace** (`/facebook-business?facebook=select-page`). The Integrations card shows **Choose Page** when `partial`. Setup requirements display the Facebook callback from `META_REDIRECT_URI` or `{API_PUBLIC_URL}/api/v1/facebook-business/oauth/callback` — never from web `APP_URL`.

**Business Profile integrations** and **Communications integrations** are linked separately on the same page.

## Facebook Page-selection UX and callback display (2026-08-05)

**Staging evidence:** OAuth and token exchange succeeded (`state=partial`, credentials present, `pendingPageSelection=true`) but Integrations showed stale "Disconnected in TITAN." and no **Choose Page** action; setup panel showed web-origin callback.

| Defect | Correction (local) |
|--------|-------------------|
| Stale disconnect text after successful OAuth reconnect | OAuth callback clears verification fields; sets honest pending Page-selection message |
| OAuth from `/integrations` returned without Page picker | Browser return redirects to `/facebook-business?facebook=select-page`; Integrations card adds **Choose Page** |
| Setup requirements showed `APP_URL` callback | Facebook setup uses `META_REDIRECT_URI ?? API_PUBLIC_URL` |

**Outstanding (not changed in this fix):** Instagram and TikTok OAuth runtime callbacks in `social-connection.service.ts` still derive from `APP_URL` — separate fix when those providers go live on split-host staging.

## Facebook Page discovery diagnosis (2026-08-05)

**Live staging evidence:** OAuth succeeded with `pages_show_list`; Meta Business Integrations shows Young Guns Plumbing – Cape Town selected; TITAN reported “does not administer any Pages”.

**Root cause (code audit):** `listPages` silently dropped any `/me/accounts` row missing `access_token` via `.filter((page) => page.id && page.name && page.access_token)`, mapping a non-empty Meta response with incomplete rows to an empty UI list.

**Local correction:**

| Area | Fix |
|------|-----|
| Graph client | `discoverPages` with pagination; no silent row discard; optional `tryResolvePageAccessToken` |
| API `/pages` | Returns sanitized diagnosis + per-row status (`META_PAGE_LIST_EMPTY`, `META_PAGE_TOKEN_UNAVAILABLE`, etc.) |
| UI | Honest messages; lists non-selectable Pages; expandable sanitized diagnosis for Owner |
| Scopes | `pages_show_list` only at initial OAuth — unchanged; `business_management` documented as likely Meta requirement for business-linked Pages but not auto-requested |

## Local test mode

```bash
export SOCIAL_CONNECTION_MOCK_OAUTH=1
export META_APP_ID=test-meta-app
export INTEGRATIONS_ENCRYPTION_KEY=<32-byte-key>
```

Mock mode enables OAuth URL generation, deterministic account discovery and health checks without external provider calls.
