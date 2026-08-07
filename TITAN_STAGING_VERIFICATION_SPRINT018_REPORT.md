# TITAN Staging Verification — Sprint 018

**Branch:** `cursor/titan-frozen-scope-completion`  
**Scope:** Staging Supabase `cpkuwtaipjxeipvbssvn` only — production `rshuiaghmtrvvilhqpwm` untouched  
**Updated (UTC):** 2026-08-01

---

## Executive summary

| Area | Verdict |
|------|---------|
| Local staging DB credentials (`apps/api/.env.staging.local`) | **PASS** — connection + backup + migrations |
| Staging logical backup (`pg_dump -Fc`) | **PASS** |
| Drizzle journal on staging DB | **106 / 106** (was 104) |
| `migrate-staging-safe.mjs` | **PARTIAL** — drizzle-kit exit 0 but did not apply 0105–0106; controlled SQL apply succeeded |
| Railway redeploy | **BLOCKED** — no `RAILWAY_TOKEN`, CLI unauthorized |
| Public `/api/v1/health/ready` | **FAIL** — HTTP 503 `DB_UNAVAILABLE` / `28P01` (deployed API env stale) |
| Public E2E smokes (Phases 5, 6, 8–12) | **NO-GO** — all blocked at `staging_api_ready` |
| Local `pnpm typecheck` / `test` / `build` | **PASS** |

---

## 1. Backup

| Item | Value |
|------|--------|
| Command | `pg_dump -Fc -Z9` via guarded Node harness (URL never logged) |
| Artifact | `diagnostic-output/staging-pg-dump-2026-08-01T08-20-02.dump` (~3.4 MB) |
| Meta | `diagnostic-output/157-staging-backup-journal-before.json` |

**Note:** Dump file is evidence on disk only — **not committed** (contains tenant data).

---

## 2. Migration journal

| Metric | Before | After |
|--------|--------|-------|
| `drizzle.__drizzle_migrations` row count | 104 | **106** |
| Repo `_journal.json` entries | 106 | 106 |

Pending tags before apply: `0105_boq_workspace`, `0106_job_document_packs`.

| Step | Result |
|------|--------|
| `node packages/db/scripts/migrate-staging-safe.mjs` | drizzle-kit **0**; post-check **104 rows** → script exit **4** |
| Controlled apply (0104-style) | **PASS** — `diagnostic-output/159-staging-apply-0105-0106.json` |

---

## 3. Deploy

| Check | Result |
|-------|--------|
| `RAILWAY_TOKEN` | unset |
| `railway` CLI | not installed |
| `npx @railway/cli whoami` | Unauthorized |
| Keychain (`railway` / `railway.app`) | not found |
| Redeploy staging API + web | **BLOCKED** |

---

## 4. Health + smokes

| Check | Result |
|-------|--------|
| GET `/api/v1/health/ready` | **503** — `DB_UNAVAILABLE`, detail `28P01` — `diagnostic-output/160-staging-health-ready.json` |
| `staging-phase5-public-e2e.mjs` | **NO-GO** |
| `staging-phase6-public-e2e.mjs` | **NO-GO** |
| `staging-phase8-12-public-e2e.mjs` | **NO-GO** |

Console captures: `161-staging-phase5-console.txt`, `162-staging-phase6-console.txt`, `163-staging-phase8-12-console.txt`.

---

## 5. Local gates

| Command | Result |
|---------|--------|
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS — 105 tests |
| `pnpm build` | PASS |

---

## 6. Owner blockers

1. **Railway staging API/web** — set `DATABASE_URL` (and related Supabase vars) to match refreshed staging password; redeploy API + web (dashboard or `RAILWAY_TOKEN`).
2. **Re-run public smokes** after health ready shows DB connected.
3. Investigate **drizzle-kit migrate no-op** for 0105–0106 (journal hash drift vs migrator) — controlled apply used as staging-safe fallback.

---

## 7. Artifacts (committed)

| Path | Description |
|------|-------------|
| `diagnostic-output/157-staging-backup-journal-before.json` | Pre-migrate journal + backup meta |
| `diagnostic-output/158-staging-migrate-0105-0106-console.txt` | Redacted migrate-staging-safe log |
| `diagnostic-output/159-staging-apply-0105-0106.json` | Controlled 0105–0106 apply proof |
| `diagnostic-output/160-staging-health-ready.json` | Public health response |
| `diagnostic-output/161-163-*-console.txt` | E2E console (redacted) |
| `diagnostic-output/164-staging-verification-summary.json` | Structured summary |
| `diagnostic-output/140-142-staging-phase*-e2e.json` | Updated smoke verdicts |
