# FRZ-018 Xero Integration — Staging Readiness Report

**Requirement:** FRZ-018 — Integrations truthful provider states (Xero OAuth)  
**Scope:** Staging only (`https://young-guns-os-staging.up.railway.app`)  
**Production ref blocked:** `rshuiaghmtrvvilhqpwm` — not accessed  
**Branch:** `cursor/titan-frozen-scope-completion`  
**Updated (UTC):** 2026-08-01  
**Verdict:** **BLOCKED** — Xero OAuth credentials and `XERO_SYNC_ENABLED` absent on staging Railway

---

## Executive summary

Phase A inspection complete. Code, unit tests, and honest provider states are ready for read-only verification. Staging Railway does **not** expose a configured Xero OAuth app: live probe returns `oauthConfigured=false` and `POST /integrations/xero/oauth/start` → `OAUTH_NOT_CONFIGURED`. Owner must configure Xero app credentials and enable sync gate before browser OAuth (Phase C). No live financial writes, no OAuth login, and no FRZ-015 re-run performed.

---

## 1. Credential discovery (no secret values)

| Variable | Staging (inferred) | Local `.env.staging.example` | Local `apps/api/.env.staging.local` |
|----------|-------------------|------------------------------|-------------------------------------|
| `PROVIDERS_ENABLED` | **Present** (`true`) | placeholder `false` | absent |
| `XERO_SYNC_ENABLED` | **Absent / false** | placeholder `false` | absent |
| `XERO_CLIENT_ID` | **Absent** | commented out | absent |
| `XERO_CLIENT_SECRET` | **Absent** | commented out | absent |
| `XERO_REDIRECT_URI` | **Absent** (optional) | commented out | absent |
| `INTEGRATIONS_ENCRYPTION_KEY` | **Present** (API boots) | placeholder | absent |

| Source | Result |
|--------|--------|
| Railway CLI | `RAILWAY_TOKEN` absent — variables not listed locally |
| Public `/health/ready` | `providersEnabled=true`, `database=connected` |
| Authenticated `GET /integrations/xero` | `oauthConfigured=false`, `status=disconnected` |
| `POST /integrations/xero/oauth/start` | `400 OAUTH_NOT_CONFIGURED` |

Structured evidence: `diagnostic-output/171-frz018-xero-staging-readiness.json`

---

## 2. Xero app redirect URI (Owner must register)

Register **exactly** this redirect URI in the Xero Developer portal (staging app):

```
https://young-guns-os-staging.up.railway.app/api/v1/integrations/xero/oauth/callback
```

If `XERO_REDIRECT_URI` is unset on Railway, the API uses this same default via `API_PUBLIC_URL` (`resolveXeroOAuthConfig` in `apps/api/src/config.ts`).

### OAuth scopes (code-defined, read-only verification intent)

`openid profile email offline_access accounting.settings accounting.contacts accounting.invoices accounting.payments accounting.banktransactions`

---

## 3. Code review — integration readiness

| Area | Status | Notes |
|------|--------|-------|
| OAuth routes | **Ready** | `GET /oauth/callback` (public), `POST /oauth/start`, `POST /test`, `DELETE /xero` |
| Config resolver | **Ready** | Inert until `XERO_SYNC_ENABLED=true` **and** `PROVIDERS_ENABLED=true` **and** client id/secret |
| Token encryption | **Ready** | `encryptXeroOAuthCredentials` v2; requires `INTEGRATIONS_ENCRYPTION_KEY` |
| Refresh handling | **Ready** | 60s expiry buffer; per-company inflight dedupe |
| Disconnect | **Ready** | Revoke best-effort + clear creds + audit `xero_disconnected` |
| Tenant isolation | **Ready** | `integrationConnections` keyed by `companyId` |
| Truthful states | **Verified live** | Unauthenticated → 401; disconnected when unconfigured; no fake “connected” |
| Read-only pre-OAuth | **Verified** | Sync resolver inert; no invoice/payment/contact writes attempted |

Key files: `apps/api/src/services/xero-oauth.service.ts`, `apps/api/src/routes/integrations.ts`, `apps/api/src/config.ts`, `apps/api/src/services/xero-oauth.test.ts`

---

## 4. Unit tests (local)

| Command | Result |
|---------|--------|
| `pnpm --filter @titan/api test -- xero-oauth` | **301 pass** (includes 5 xero-oauth tests) |

---

## 5. Live staging probe (2026-08-01, no OAuth)

| Test | Result |
|------|--------|
| `/api/v1/health/ready` | **PASS** — ready, providers enabled |
| Unauthenticated `GET /integrations/xero` | **PASS** — 401 |
| Public OAuth callback (no code) | **PASS** — 302 redirect, honest error |
| Owner signup + session | **PASS** |
| `GET /integrations/xero` (authenticated) | **PASS** — disconnected, `oauthConfigured=false` |
| `POST /integrations/xero/oauth/start` | **PASS (expected block)** — `OAUTH_NOT_CONFIGURED` |
| Secret leak scan | **PASS** |
| Live financial writes | **Not performed** |
| FRZ-015 re-run | **Not performed** |

---

## 6. FRZ-018 verdict

| Field | Value |
|-------|-------|
| **Status** | **BLOCKED** |
| **Classification** | Staging ready for OAuth after Owner credential gate |
| **Connected** | **No** |
| **Evidence** | This report + `171-frz018-xero-staging-readiness.json` |

---

## 7. Owner action (one step)

**Railway → titan-staging-api → Variables:** set staging-only `XERO_CLIENT_ID` and `XERO_CLIENT_SECRET` from your Xero Developer app, set `XERO_SYNC_ENABLED=true`, redeploy API.

**Xero Developer portal → staging app → OAuth 2.0 redirect URIs:** add exactly:

`https://young-guns-os-staging.up.railway.app/api/v1/integrations/xero/oauth/callback`

After redeploy, re-run FRZ-018 Phase C: Owner opens staging web → Integrations → Xero → **Sign in with Xero** (browser OAuth required; agent will not perform OAuth).

---

## 8. Phase D (deferred)

Post-OAuth read-only verify (contacts, invoices, payments, bank transactions — GET/list only) runs **only after** staging DB shows `status=connected` with OAuth credentials. Not applicable this run.

---

## 9. Security compliance

- No Xero secrets printed, logged, or committed
- Only present/absent and inferred gate state reported
- Production Supabase ref not accessed
- No live financial writes
