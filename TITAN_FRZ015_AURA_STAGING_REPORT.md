# FRZ-015 AURA Provider — Staging Verification Report

**Requirement:** FRZ-015 — AURA specialist departments + orchestration  
**Scope:** Staging only (`https://young-guns-os-staging.up.railway.app`)  
**Production ref blocked:** `rshuiaghmtrvvilhqpwm` — not accessed  
**Commit:** `8c9a03d` on `cursor/titan-frozen-scope-completion`  
**Updated (UTC):** 2026-08-01  
**Verdict:** **BLOCKED** — Owner credential + runtime gate action required

---

## Executive summary

Staging API is **live and ready** (`/api/v1/health/ready` → 200, database connected). AURA provider verification **cannot complete** because:

1. `apps/api/.env.staging.local` contains only `APP_ENV`, `TITAN_ENV`, `DATABASE_URL` — **no `AURA_OPENAI_API_KEY`**
2. Public staging readiness reports **`providersEnabled: false`** — AURA provider is intentionally gated off per hosting foundation
3. No `RAILWAY_TOKEN` / Keychain / shell staging test credentials available on this host
4. No live AURA message test was run (per protocol: do not fake tests when credentials invalid)

---

## 1. Credential discovery (no secret values)

| Source | Result |
|--------|--------|
| `apps/api/.env.staging.local` | Present (157 B); provider keys **absent** |
| `AURA_OPENAI_API_KEY` | **Absent** |
| `OPENAI_API_KEY` / Gemini / Google AI | **Absent** |
| `INTEGRATIONS_ENCRYPTION_KEY` | **Absent** (staging local) |
| `PROVIDERS_ENABLED` | **Absent** (staging local) |
| macOS Keychain (`aura`, `openai`, `titan`, `gemini`) | **Not found** |
| `RAILWAY_TOKEN` | **Absent** — `railway variables list` exit **1** (Unauthorized) |
| `AURA_STAGE2_EMAIL` / `AURA_STAGE2_PASSWORD` | **Absent** |

**Note:** `apps/api/.env` (dev-only, not staging) has `AURA_OPENAI_API_KEY` present (length 164, prefix `sk-p***`). Dev credentials were **not** used for staging verification.

Structured evidence: `diagnostic-output/169-frz015-aura-staging-verify.json`

---

## 2. Config without secrets

| Item | Value |
|------|-------|
| Provider | `openai` (only supported env provider) |
| Default model | `gpt-4o-mini` |
| Default endpoint | `https://api.openai.com/v1` |
| Request timeout | 60000 ms |
| Config loader | `packages/aura/src/config.ts` → `loadAuraConfigFromEnv()` |
| Configured check | `isAuraProviderConfigured()` → false for staging local env |
| Encrypted DB credentials | `INTEGRATIONS_ENCRYPTION_KEY` + `encryptSecret` in `ai-orchestration.service.ts`, `integrations.service.ts`, `xero-oauth.service.ts` |
| Runtime instantiation | `apps/api/src/index.ts`: `createAuraProvider` only when `PROVIDERS_ENABLED=true` **and** key configured |

### Staging runtime gates (public API)

```json
{
  "status": "ready",
  "database": "connected",
  "providersEnabled": false,
  "workersEnabled": false,
  "webhooksEnabled": false
}
```

Per `.env.staging.example` and `infra/staging/railway/titan-staging-api.env.staging.names`, all outbound provider gates **must remain false** until Owner explicitly enables after credential entry.

---

## 3. Live tests

| Test | Result |
|------|--------|
| Synthetic AURA prompt ("Reply with OK") | **NOT RUN** — blocked |
| Timeout / retry / invalid-credential behaviour | **NOT RUN** — blocked |
| Tenant context / permissions / audit trace | **NOT RUN** — blocked |
| `/api/v1/health/live` | **200** — live |
| `/api/v1/health/ready` | **200** — ready, providers gated off |

### Unit tests (local, no live provider)

| Command | Result |
|---------|--------|
| `pnpm --filter @titan/api test` | **301 pass**, 0 fail |

Includes `xero-oauth.test.ts` (encrypt/hash/OAuth fixtures) and `aura-context-routing.test.ts`.

---

## 4. FRZ-015 verdict

| Field | Value |
|-------|-------|
| **Status** | **BLOCKED** |
| **Classification** | Blocked by credential/provider |
| **Connected** | No |
| **Evidence** | This report + `169-frz015-aura-staging-verify.json` |

---

## 5. Owner action (exactly one)

**Railway → project `titan-staging` → service `titan-staging-api` → Variables:** add staging-only `AURA_OPENAI_API_KEY`, set `PROVIDERS_ENABLED=true`, redeploy API, then notify engineering to rerun FRZ-015 verify (`scripts/aura-stage2-verify.mjs` with staging base URL + test account).

Do **not** use production Supabase or production OpenAI billing without explicit approval.

---

## 6. FRZ-018 Xero readiness (static — no OAuth login)

| Check | Status |
|-------|--------|
| OAuth routes wired | **Yes** — `/integrations/xero/oauth/start`, `/oauth/callback`, `/test` |
| Config resolver | `resolveXeroOAuthConfig()` — requires `XERO_SYNC_ENABLED` (which requires `PROVIDERS_ENABLED`) |
| Staging local Xero env | **Absent** (`XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI`) |
| Staging runtime | `XERO_SYNC_ENABLED=false`, `providersEnabled=false` |
| Honest blocking | **Yes** — unauthenticated probe returns 401, not fake connected state |
| Owner OAuth login | **Not performed** (per instructions) |
| Live financial writes | **Not performed** |

**FRZ-018 pause gate:** Xero OAuth staging connect remains **Owner-blocked** until `XERO_CLIENT_ID`/`XERO_CLIENT_SECRET` are set on Railway, `PROVIDERS_ENABLED=true`, `XERO_SYNC_ENABLED=true`, and Owner completes OAuth in browser. Code path and unit tests pass; live connect not verified.

---

## 7. Security compliance

- No API keys printed, logged, or committed
- Only present/absent, length, and redacted prefix reported
- Synthetic test prompt not sent (blocked)
- Production ref not accessed
