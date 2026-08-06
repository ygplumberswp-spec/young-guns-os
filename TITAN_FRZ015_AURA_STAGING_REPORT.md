# FRZ-015 AURA Provider — Staging Verification Report

**Requirement:** FRZ-015 — AURA specialist departments + orchestration  
**Scope:** Staging only (`https://young-guns-os-staging.up.railway.app`)  
**Production ref blocked:** `rshuiaghmtrvvilhqpwm` — not accessed  
**Branch:** `cursor/titan-frozen-scope-completion`  
**Updated (UTC):** 2026-08-01  
**Verdict:** **GO** — Owner configured credentials; live synthetic verify **12/12 PASS**

---

## Executive summary

Owner configured Railway staging (`AURA_OPENAI_API_KEY`, `PROVIDERS_ENABLED=true`). Public staging readiness reports **`providersEnabled: true`**, database connected. Live synthetic AURA verification completed **12/12 PASS** with no secrets leaked.

Prior BLOCKED run (credential absent) preserved in `diagnostic-output/169-frz015-aura-staging-verify.json`.

---

## 1. Credential discovery (no secret values)

| Source | Result |
|--------|--------|
| Railway `titan-staging-api` | Owner configured — **not read locally** |
| Public `/health/ready` | `providersEnabled: true`, `database: connected` |
| `apps/api/.env.staging.local` | DB only — provider keys remain on Railway |
| Dev `apps/api/.env` | **Not used** for staging |

Structured evidence:
- Blocked probe: `diagnostic-output/169-frz015-aura-staging-verify.json`
- **GO verify:** `diagnostic-output/170-frz015-aura-staging-verify-go.json`

---

## 2. Config without secrets

| Item | Value |
|------|-------|
| Provider | `openai` (only supported env provider) |
| Default model | `gpt-4o-mini` |
| Default endpoint | `https://api.openai.com/v1` (`POST /v1/chat/completions`) |
| Request timeout | 60000 ms |
| Config loader | `packages/aura/src/config.ts` → `loadAuraConfigFromEnv()` |
| Runtime gate | `PROVIDERS_ENABLED=true` + key configured on Railway |

### Staging runtime gates (public API — post Owner config)

```json
{
  "status": "ready",
  "database": "connected",
  "providersEnabled": true
}
```

---

## 3. Live tests (2026-08-01)

| Test | Result |
|------|--------|
| `/api/v1/health/ready` | **PASS** — ready, providers enabled |
| Owner signup + session | **PASS** |
| `GET /ai-orchestration/providers` | **PASS** — 9 providers; OpenAI `health=healthy`, credentials truthful |
| `POST /aura/conversations` | **PASS** |
| Synthetic prompt ("Reply with OK only") | **PASS** — assistant replied `OK`, latency ~8.4s |
| Provider trace metadata | **PASS** — assistant message returned |
| No customer PII in request | **PASS** — synthetic prompt only |
| Tenant isolation (foreign tenant) | **PASS** — **404** on foreign read |
| Unauthenticated access | **PASS** — **401** |
| Secret leak scan on all responses | **PASS** — none detected |

### Not exercised on live staging (covered by unit tests)

| Test | Notes |
|------|-------|
| Invalid credential / timeout / retry | `packages/aura` unit tests + `AuraProviderError` codes; would require breaking Railway env |
| Role matrix (technician vs owner on AURA) | Partial — unauthenticated denied; full role matrix in local API tests |

### Unit tests (local, no live provider)

| Command | Result |
|---------|--------|
| `pnpm --filter @titan/api test` | **301+ pass** (includes aura-context-routing, xero-oauth) |

---

## 4. FRZ-015 verdict

| Field | Value |
|-------|-------|
| **Status** | **GO** |
| **Classification** | Staging verified — synthetic live connection |
| **Connected** | **Yes** (staging, OpenAI via chat/completions) |
| **Evidence** | This report + `170-frz015-aura-staging-verify-go.json` |

---

## 5. Owner action

**Complete.** No further Owner action required for FRZ-015 baseline verify.

Optional follow-up: restrict OpenAI key to Chat Completions for `gpt-4o-mini` only (minimum permission scope).

---

## 6. FRZ-018 Xero readiness (static — no OAuth login)

| Check | Status |
|-------|--------|
| OAuth routes wired | **Yes** — `/integrations/xero/oauth/start`, `/oauth/callback`, `/test` |
| Config resolver | `resolveXeroOAuthConfig()` — requires `XERO_SYNC_ENABLED` (which requires `PROVIDERS_ENABLED`) |
| Staging local Xero env | **Absent** (`XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI`) |
| Staging runtime | `XERO_SYNC_ENABLED` likely still false; `providersEnabled=true` after Owner AURA config |
| Honest blocking | **Yes** — unauthenticated probe returns 401, not fake connected state |
| Owner OAuth login | **Not performed** (per instructions) |
| Live financial writes | **Not performed** |

**FRZ-018 pause gate:** Xero OAuth staging connect remains **Owner-blocked** until `XERO_CLIENT_ID`/`XERO_CLIENT_SECRET` are set on Railway, `XERO_SYNC_ENABLED=true`, and Owner completes OAuth in browser.

---

## 7. Security compliance

- No API keys printed, logged, or committed
- Only present/absent, length, and redacted prefix reported in blocked probe
- Synthetic test prompt only — no customer PII
- Production ref not accessed
- All live responses scanned for secret patterns — clean
