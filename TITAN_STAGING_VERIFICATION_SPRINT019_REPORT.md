# TITAN Staging Verification — Sprint 019

**Date:** 2026-08-01  
**Scope:** Staging Supabase `cpkuwtaipjxeipvbssvn` only — production untouched  
**Verdict:** **NO-GO** public staging (Railway API DB auth `28P01`); **GO** local DB migrate + local quality gates

## 1. Backup

| Check | Result |
|-------|--------|
| pg_dump custom compressed | **PASS** |
| Artifact | `staging-backup-2026-08-01T08-25-06-002Z.dump` (~3.0 MB, local only, not in Git) |
| Evidence | `diagnostic-output/159-staging-backup-journal-before.json` |

## 2. Migration journal

| When | Applied rows | Expected | Pending |
|------|-------------:|---------:|--------:|
| Before migrate | **106** | 106 | 0 |
| After migrate | **106** | 106 | 0 |

`0105_boq_workspace` and `0106_job_document_packs` were already applied; no new SQL pending.

## 3. migrate-staging-safe.mjs

| Check | Result |
|-------|--------|
| drizzle-kit migrate | **PASS** (idempotent) |
| Exit code | **0** |
| Post-check UX-B tables | **PASS** |
| Console (redacted) | `diagnostic-output/161-staging-migrate-console.txt` |
| Post journal evidence | `diagnostic-output/160-staging-journal-after-migrate.json` |

## 4. Railway redeploy

| Check | Result |
|-------|--------|
| `RAILWAY_TOKEN` in environment | Present |
| `@railway/cli whoami` | **Unauthorized** — redeploy not executed |
| Status | **BLOCKED** — valid token or Owner dashboard redeploy required |

## 5. Public health

| Endpoint | HTTP | Notes |
|----------|-----:|-------|
| `GET /api/v1/health/ready` | **503** | `DB_UNAVAILABLE`, PostgreSQL reason **28P01** (Railway service DB credentials) |
| Evidence | `diagnostic-output/162-staging-health-ready.json` |

## 6. Public E2E smokes

| Runner | Verdict | Blocker |
|--------|---------|---------|
| Phase 5 | **NO-GO** | `staging_api_ready` fail (503/28P01) |
| Phase 6 | **NO-GO** | same |
| Phase 8–12 | **NO-GO** | same |
| Evidence | `diagnostic-output/140-staging-phase5-e2e.json`, `141-staging-phase6-e2e.json`, `142-staging-phase8-12-e2e.json` |

## 7. Local quality gates

| Gate | Result |
|------|--------|
| `pnpm typecheck` | **PASS** — `diagnostic-output/163-typecheck-staging-ops.txt` |
| `pnpm test` | **PASS** — `diagnostic-output/164-pnpm-test-staging-ops.txt` |
| `pnpm build` | **PASS** — `diagnostic-output/165-build-staging-ops.txt` |

## 8. Blockers (Owner)

1. Update Railway **titan-staging-api** (and web if split) `DATABASE_URL` to match validated staging credentials used locally.  
2. Redeploy API + web (valid `RAILWAY_TOKEN` or Railway dashboard).  
3. Rerun Phase 5/6/8–12 public smokes until `/health/ready` returns **200** with `database=connected`.

## 9. Structured summary

`diagnostic-output/166-staging-verification-summary.json`
