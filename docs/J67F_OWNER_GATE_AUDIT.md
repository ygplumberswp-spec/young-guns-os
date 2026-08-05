# J-6.7F Owner-Gate Audit & Social Activation Readiness

**Audit date:** 2026-08-05  
**Worktree:** `/workspace/.worktrees/titan-recovery`  
**Branch:** `cursor/titan-v1-integration-recovery`  
**Baseline HEAD (pre-audit):** `aa3b4c4fa4d3076b0025cbb3533cea47a92b2993`

This document is the authoritative owner-gate audit for social connection foundation. No migrations were applied and no external OAuth was triggered during this audit.

---

## 1. Canonical source of truth per provider

| Provider | Canonical table | OAuth state table | Canonical API | Owner UI | Notes |
|----------|-----------------|-------------------|---------------|----------|-------|
| **Facebook Page** | `fb_connections` | `fb_oauth_states` | `/api/v1/facebook-business` | `/integrations` card → `/facebook-business` | **Not** `social_media_connections`. J-6.7F audit delegates Facebook writes to Facebook Business. |
| **Instagram Business** | `social_media_connections` (`platform='instagram'`) | `social_oauth_states` | `/api/v1/social-connections` | `/integrations` Social Connections | Single OAuth path. Personal IG accounts invalid. |
| **Google Business Profile** | `social_media_connections` (`platform='google_business'`) | `social_oauth_states` | `/api/v1/social-connections` | `/integrations` | Account + location selection required. |
| **WhatsApp Business** | `whatsapp_connections` | `social_oauth_states` (foundation OAuth) | `/api/v1/social-connections` + `/api/v1/whatsapp` (operational) | `/integrations` + `/integrations/whatsapp` | Foundation bridges WABA selection; messaging uses existing WhatsApp hub unchanged. |
| **TikTok** | `social_media_connections` (`platform='tiktok'`) | `social_oauth_states` | `/api/v1/social-connections` | `/integrations` | `PROVIDER_REVIEW_REQUIRED` until `TIKTOK_LIVE_OAUTH_ENABLED=1`. |

Defined in code: `packages/shared/src/social-connection.ts` → `SOCIAL_CONNECTION_CANONICAL_SOURCES`.

---

## 2. Facebook / Instagram duplication audit

### Before audit corrections

| Dimension | Facebook | Instagram |
|-----------|----------|-----------|
| Connect buttons | **Duplicated:** SocialConnectionsSection + FacebookBusinessPage + hub marketing row | **Duplicated:** SocialConnectionsSection + SocialMediaIntegrationsPage manual token |
| OAuth flows | **Duplicated:** `social_oauth_states` vs `fb_oauth_states` | Single: `social-connections` |
| Token storage | **Duplicated:** `social_media_connections` vs `fb_connections` | Single: `social_media_connections` |
| Page/account record | **Duplicated:** metadata vs `fb_connections.pageId` | Single: metadata selection fields |
| Health state | **Duplicated:** social-connection vs facebook-business verify | Single: social-connection health |

### After audit corrections (smallest safe diff)

1. **Facebook card** on `/integrations` reads **`fb_connections`** only (`buildFacebookProviderCard` in `social-connection.service.ts`).
2. **Facebook connect/reconnect/disconnect/health** on Integrations UI delegates to **`/api/v1/facebook-business`** (`delegatedTo: 'facebook_business'` on card).
3. **Facebook write routes** on `/api/v1/social-connections` return `DELEGATED_TO_FACEBOOK_BUSINESS` — no parallel OAuth/token write.
4. **Hub marketing row** for `facebook` removed from `IntegrationsDashboardPage` — one Owner-visible card in Social Connections.
5. **SocialMediaIntegrationsPage** banner directs Facebook/Instagram to canonical Integrations paths; manual token paste remains monitoring-layer only.

### Instagram proof (not duplicated post-audit)

- **One OAuth flow:** `POST /api/v1/social-connections/oauth/start` → `GET /api/v1/social-connections/oauth/callback`
- **One token store:** `social_media_connections.credentials_encrypted` where `platform='instagram'`
- **One selection store:** `metadata.selectedInstagramBusinessAccountId`
- **One Owner connect button:** SocialConnectionsSection (Owner-only)

---

## 3. Owner approval enforcement (Young Guns policy)

### Final RBAC matrix

| Role | View status | Prepare setup info | Connect / select / reconnect / disconnect |
|------|-------------|--------------------|-------------------------------------------|
| Company Owner | Yes | Yes | Yes |
| Admin / Office (`marketing:read`, `integrations:read`, etc.) | Yes | Yes | **No** |
| Admin + `marketing_intelligence:manage` | Yes | Yes | **No** (corrected — was incorrectly allowed via `canApproveMarketingAgentPublish`) |
| Technician | Hidden | Denied | Denied |
| Client | Hidden | Denied | Denied |

Implementation: `canViewSocialConnections` / `canManageSocialConnections` in `packages/shared/src/social-connection.ts`; `canManageFacebookConnection` in `packages/shared/src/facebook-business.ts` — **Owner role only** (`isCompanyOwnerRole`).

### OAuth Owner verification

- **`social_oauth_states.initiator_role_name`** recorded on OAuth start (migration `0179`, not applied).
- **Callback** rejects non-Owner initiator: `isCompanyOwnerRole(stateRow.initiatorRoleName)` in `social-connection.service.ts`.
- **`fb_oauth_states.initiator_role_name`** recorded on Facebook OAuth start (migration `0180` file, not applied); callback verifies Owner role.

### Audit events

| Event | Location |
|-------|----------|
| Owner approval (OAuth start) | `social_connection.owner_approval.oauth_start` + `owner_approval` connection event |
| OAuth connection start | `social_connection.oauth.start` / `connection.oauth_started` (Facebook) |
| Account selection | `social_connection.account.selected` / `account_selected` event |
| Reconnect | `reconnect_requested` event |
| Disconnect | `social_connection.disconnect` / `connection.disconnected` |
| Callback failure | `oauth.callback_failed` |

---

## 4. Staging activation readiness (code evidence)

Replace `{API_PUBLIC_URL}` with staging API host (e.g. Railway staging API URL). Replace `{APP_URL}` with staging web URL.

### Facebook Page

| Item | Value | Evidence |
|------|-------|----------|
| Env vars | `META_APP_ID`, `META_APP_SECRET`, `INTEGRATIONS_ENCRYPTION_KEY`; optional `META_REDIRECT_URI`, `META_WEBHOOK_VERIFY_TOKEN` | `apps/api/src/config.ts` L29-34, L17; `resolveFacebookAppConfig` L334-354 |
| Callback route | `GET /api/v1/facebook-business/oauth/callback` | `apps/api/src/index.ts` mount; `resolveFacebookAppConfig` L340-342 |
| Staging callback URL | `{API_PUBLIC_URL}/api/v1/facebook-business/oauth/callback` | `config.ts` L340-342 default when `META_REDIRECT_URI` unset |
| OAuth scopes | From `FACEBOOK_REQUESTED_SCOPES` in shared facebook-business | `apps/api/src/lib/facebook-graph.client.ts` L138 |
| Prerequisites | Meta Developer app; Facebook Login product; Page admin access | `docs/SOCIAL_CONNECTION_PROVIDER_SETUP.md` |
| Account selection | Owner selects Page after OAuth; `POST /api/v1/facebook-business/pages/select` | `facebook-business.service.ts` `selectPage` |
| Provider review | Meta app review for advanced permissions in production | setup doc |
| Status before config | `NOT_CONFIGURED` / `configuration_required` | `mapFacebookStateToFoundationStatus` |
| Status after success | `CONNECTED` when `fb_connections.state='connected'` | `fb_connections` schema |

### Instagram Business

| Item | Value | Evidence |
|------|-------|----------|
| Env vars | `META_APP_ID` or `FACEBOOK_APP_ID` or `META_OAUTH_CLIENT_ID`, `META_APP_SECRET`, `INTEGRATIONS_ENCRYPTION_KEY` | `social-connection-provider.adapter.ts` L53-54, L63-67 |
| Callback route | `GET /api/v1/social-connections/oauth/callback?provider=instagram` | `social-connection.service.ts` L135 |
| Staging callback URL | `{API_PUBLIC_URL}/api/v1/social-connections/oauth/callback?provider=instagram` | same |
| OAuth scopes | `instagram_basic,pages_show_list,pages_read_engagement` | `social-connection-provider.adapter.ts` L64-66 |
| Account selection | IG Business account linked to Facebook Page | adapter mock + shared types |
| Status before | `NOT_CONFIGURED` | `resolveSocialConnectionFoundationStatus` |
| Status after | `CONNECTED` with credentials + `selectedInstagramBusinessAccountId` | `hasCompleteAccountSelection` |

### Google Business Profile

| Item | Value | Evidence |
|------|-------|----------|
| Env vars | `GOOGLE_BUSINESS_CLIENT_ID` or `GBP_CLIENT_ID` or `GOOGLE_OAUTH_CLIENT_ID`, secret via adapter env, `INTEGRATIONS_ENCRYPTION_KEY` | `social-connection-provider.adapter.ts` L157-172 |
| Callback | `GET /api/v1/social-connections/oauth/callback?provider=google_business` | service oauthCallbackUrl |
| Scopes | `https://www.googleapis.com/auth/business.manage` | adapter L178 |
| Selection | Business account + location IDs | `hasCompleteAccountSelection` google branch |

### WhatsApp Business

| Item | Value | Evidence |
|------|-------|----------|
| Env vars | `META_APP_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `META_OAUTH_CLIENT_ID`, `INTEGRATIONS_ENCRYPTION_KEY` | adapter L252-254 |
| Callback | `GET /api/v1/social-connections/oauth/callback?provider=whatsapp_business` | service |
| Scopes | `whatsapp_business_management,business_management` | adapter L272 |
| Selection | WABA + phone number → `whatsapp_connections` | `applyWhatsappSelection` in service |
| Operational | Existing `whatsapp_connections` + `/integrations/whatsapp` unchanged | canonical sources constant |

### TikTok

| Item | Value | Evidence |
|------|-------|----------|
| Env vars | `TIKTOK_CLIENT_KEY` or `TIKTOK_APP_ID`, `INTEGRATIONS_ENCRYPTION_KEY` | adapter L337, L352 |
| Gate | `TIKTOK_LIVE_OAUTH_ENABLED=1` required for authorize URL | adapter L346-347 |
| Scopes | `user.info.basic,video.list` | adapter L358 |
| Status before review | `PROVIDER_REVIEW_REQUIRED` | `requiresProviderReview()` + resolver |

---

## 5. Migration 0179 validation (local, not applied)

| Check | Result |
|-------|--------|
| SQL syntax | Valid PostgreSQL: enum + table + indexes (`0179_social_connection_foundation.sql`) |
| Schema alignment | Drizzle `socialOauthStates` matches SQL columns including `initiator_role_name` |
| Enum alignment | `social_connection_provider` matches `SocialConnectionProvider` shared enum |
| Indexes | `expiry_idx`, `company_provider_idx` present |
| Roll-forward safety | `CREATE TYPE IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` — idempotent |
| `social_media_connections` compatibility | No alteration; metadata-only account fields — no conflict |
| `whatsapp_connections` compatibility | No alteration; bridge reads/writes existing columns only |

Migration **0180** (optional, not applied): adds `initiator_role_name` to `fb_oauth_states` for Facebook callback Owner verification on existing deployments.

---

## 6. Manual Owner setup — Meta first (Facebook + Instagram + WhatsApp)

1. Log in to [Meta for Developers](https://developers.facebook.com) as Owner.
2. Create or select the Young Guns Plumbing app.
3. Add **Facebook Login** product; set valid OAuth redirect URIs:
   - `{API_PUBLIC_URL}/api/v1/facebook-business/oauth/callback`
   - `{API_PUBLIC_URL}/api/v1/social-connections/oauth/callback?provider=instagram`
   - `{API_PUBLIC_URL}/api/v1/social-connections/oauth/callback?provider=whatsapp_business`
4. On TITAN staging API host, set (never commit values):
   - `META_APP_ID`
   - `META_APP_SECRET`
   - `INTEGRATIONS_ENCRYPTION_KEY` (32+ bytes)
   - Optional: `META_REDIRECT_URI` if not using default from `API_PUBLIC_URL`
5. Apply migration **0179** only through Owner-approved staging gate.
6. As **Company Owner**, open `/integrations` → Social Connections → Connect Facebook (delegates to Facebook Business OAuth).
7. After OAuth, select the Young Guns Plumbing Facebook Page in Facebook Business workspace.
8. For Instagram: Owner connects via Social Connections card (same Meta app).
9. Do **not** use manual token paste on `/social-media-integrations` for production connection.

---

## 7. Explicitly not done in this audit

- No push, deploy, staging/production migration apply, or external OAuth trigger
- No J-6.7G publishing work
