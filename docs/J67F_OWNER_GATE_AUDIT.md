# J-6.7F Owner-Gate Audit & Social Activation Readiness

**Audit date:** 2026-08-05 (updated: three-platform scope correction)  
**Worktree:** `/workspace/.worktrees/titan-recovery`  
**Branch:** `cursor/titan-v1-integration-recovery`  

This document is the authoritative owner-gate audit for the **Social Connections** module (Facebook, Instagram, TikTok only).

**Separate integrations (not Social Connections):**
- **Google Business Profile** — Business Profile integration (`/social-media-integrations`)
- **WhatsApp Business** — Communications integration (`/integrations/whatsapp`)

---

## 1. Canonical source of truth — Social Connections (three providers)

| Provider | Canonical table | OAuth state table | Canonical API | Owner UI | Notes |
|----------|-----------------|-------------------|---------------|----------|-------|
| **Facebook Page** | `fb_connections` | `fb_oauth_states` | `/api/v1/facebook-business` | `/integrations` card → `/facebook-business` | **Not** `social_media_connections`. Writes delegate to Facebook Business. |
| **Instagram Business** | `social_media_connections` (`platform='instagram'`) | `social_oauth_states` | `/api/v1/social-connections` | `/integrations` Social Connections | Single OAuth path. Personal IG accounts invalid. |
| **TikTok** | `social_media_connections` (`platform='tiktok'`) | `social_oauth_states` | `/api/v1/social-connections` | `/integrations` Social Connections | `PROVIDER_REVIEW_REQUIRED` until `TIKTOK_LIVE_OAUTH_ENABLED=1`. |

Defined in code: `packages/shared/src/social-connection.ts` → `SOCIAL_CONNECTION_CANONICAL_SOURCES` and `SOCIAL_PUBLISHING_PROVIDERS`.

### Separate modules (intact, not in Social Connections)

| Integration | Canonical table | Canonical API | UI |
|-------------|-----------------|---------------|-----|
| **Google Business Profile** | `social_media_connections` (`platform='google_business'`) | `/api/v1/social-media-integrations` | `/social-media-integrations` |
| **WhatsApp Business** | `whatsapp_connections` | `/api/v1/whatsapp` (operational) | `/integrations/whatsapp` |

---

## 2. Facebook / Instagram duplication audit

### After audit corrections (smallest safe diff)

1. **Facebook card** on `/integrations` reads **`fb_connections`** only (`buildFacebookProviderCard`).
2. **Facebook connect/reconnect/disconnect/health** delegates to **`/api/v1/facebook-business`**.
3. **Facebook write routes** on `/api/v1/social-connections` return `DELEGATED_TO_FACEBOOK_BUSINESS`.
4. **Hub marketing row** for `facebook` removed — one Owner-visible card in Social Connections.
5. **Exactly three cards** in Social Connections: Facebook, Instagram, TikTok.

### Instagram proof (not duplicated)

- **One OAuth flow:** `POST /api/v1/social-connections/oauth/start` → `GET /api/v1/social-connections/oauth/callback?provider=instagram`
- **One token store:** `social_media_connections.credentials_encrypted` where `platform='instagram'`
- **One Owner connect button:** SocialConnectionsSection (Owner-only)

---

## 3. Owner approval enforcement (Young Guns policy)

### Final RBAC matrix (Facebook, Instagram, TikTok)

| Role | View status | Prepare setup info | Connect / select / reconnect / disconnect |
|------|-------------|--------------------|-------------------------------------------|
| Company Owner | Yes | Yes | Yes |
| Admin / Office | Yes | Yes | **No** |
| Technician | Hidden | Denied | Denied |
| Client | Hidden | Denied | Denied |

OAuth callbacks enforce stored Owner `initiator_role_name` on `social_oauth_states` and `fb_oauth_states`.

Non-social providers (`google_business`, `whatsapp_business`) rejected by `assertSocialPublishingProvider` on social-connections routes.

---

## 4. Staging activation readiness

Staging API host: `https://young-guns-os-staging.up.railway.app`

### Social callback URLs (Meta + TikTok only)

| Provider | Staging callback URL |
|----------|------------------------|
| Facebook | `https://young-guns-os-staging.up.railway.app/api/v1/facebook-business/oauth/callback` |
| Instagram | `https://young-guns-os-staging.up.railway.app/api/v1/social-connections/oauth/callback?provider=instagram` |
| TikTok | `https://young-guns-os-staging.up.railway.app/api/v1/social-connections/oauth/callback?provider=tiktok` |

Do **not** list WhatsApp Business or Google Business Profile as Social Connections callbacks.

### Migrations (staging)

- **0179** and **0180** applied on staging — do not edit, replace, rerun or roll back.

---

## 5. Manual Owner setup — Meta + TikTok (Social Connections)

1. Log in to [Meta for Developers](https://developers.facebook.com) as Owner.
2. Create or select the Young Guns Plumbing app.
3. Add **Facebook Login** product; set valid OAuth redirect URIs:
   - `https://young-guns-os-staging.up.railway.app/api/v1/facebook-business/oauth/callback`
   - `https://young-guns-os-staging.up.railway.app/api/v1/social-connections/oauth/callback?provider=instagram`
4. Register TikTok redirect URI when approved:
   - `https://young-guns-os-staging.up.railway.app/api/v1/social-connections/oauth/callback?provider=tiktok`
5. On TITAN staging API host, set (never commit values): `META_APP_ID`, `META_APP_SECRET`, `INTEGRATIONS_ENCRYPTION_KEY`, TikTok keys when approved.
6. As **Company Owner**, open `/integrations` → Social Connections (three cards) → Connect.
7. **Google Business Profile:** use `/social-media-integrations` — not Social Connections.
8. **WhatsApp Business:** use `/integrations/whatsapp` — not Social Connections.

---

## 6. Explicitly not done

- No push/redeploy until Owner approves three-platform correction locally
- No J-6.7G publishing work
- LinkedIn / YouTube remain deferred checklist items only
