# TITAN Staging Verification — Sprint 020

**Date:** 2026-08-01  
**Scope:** Staging only — production untouched  
**Repo HEAD:** `58a16b7` (APP_URL placeholder heuristic fix committed)  
**Verdict:** **NO-GO** public staging (Railway API DB auth `28P01`); redeploy **BLOCKED** (no Railway auth on runner)

## 1. Railway redeploy

| Check | Result |
|-------|--------|
| `RAILWAY_TOKEN` in environment | **Not set** |
| `railway` on PATH | **Not installed** |
| `npx @railway/cli whoami` | **Unauthorized** |
| Redeploy `titan-staging-api` / `titan-staging-web` | **Not executed** |

**Owner action (no APP_URL change):** Redeploy API and web from Git commit `58a16b7` or later via Railway dashboard (or CLI with a valid token). Sync Railway **`DATABASE_URL`** for `titan-staging-api` to the same staging Supabase credentials validated locally (journal **106**). Until redeploy, Railway runs prior image without the APP_URL fix.

## 2. Public health

| Target | Endpoint | HTTP | Notes |
|--------|----------|-----:|-------|
| `young-guns-os-staging.up.railway.app` | `GET /api/v1/health/ready` | **503** | `DB_UNAVAILABLE`, PostgreSQL reason **28P01** |
| `comfortable-determination-staging.up.railway.app` | `GET /` (web) | **200** | SPA live |
| `young-guns-os-staging.up.railway.app` | `GET /` | **200** | Service reachable |

Evidence: `diagnostic-output/167-staging-health-ready.json`

## 3. Public E2E smokes

| Runner | Verdict | Reason |
|--------|---------|--------|
| Phase 5 | **SKIPPED** | Health not 200 |
| Phase 6 | **SKIPPED** | Health not 200 |
| Phase 8–12 | **SKIPPED** | Health not 200 |

Prior Sprint 019 rerun artifacts remain authoritative for last executed smokes (`140`/`141`/`142` — **NO-GO**).

## 4. Summary

Structured summary: `diagnostic-output/167-staging-deploy-verification-summary.json`
