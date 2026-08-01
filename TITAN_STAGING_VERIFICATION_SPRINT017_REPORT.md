# TITAN Staging Verification — Sprint 017 (Phases 5–12)

**Generated (UTC):** 2026-08-01  
**Branch:** `cursor/titan-frozen-scope-completion`  
**HEAD:** `767b947`  
**Mode:** Staging-only — **never production**

---

## Executive verdict

| Item | Result |
|------|--------|
| **Production ref touched** | **NO** — `rshuiaghmtrvvilhqpwm` refused in all scripts |
| **Staging ref confirmed** | **YES** — `cpkuwtaipjxeipvbssvn` in `apps/api/.env.staging.local` |
| **Local staging DB migrate (0105–0106)** | **BLOCKED** — PostgreSQL `28P01` |
| **Local staging backup (pg_dump)** | **BLOCKED** — same `28P01`; PITR path documented |
| **Railway redeploy (CLI)** | **BLOCKED** — no `RAILWAY_TOKEN`; `npx @railway/cli whoami` unauthorized |
| **Staging API health** | **PASS** — `database=connected` |
| **Staging web** | **PASS** — HTTP 200 |
| **Phase 5 public E2E** | **GO — 10/10 PASS** (canonical evidence at `306ba6e` not re-run; regression check pass) |
| **Phase 6 public E2E** | **GO — 12/12 PASS** |
| **Phase 8–12 public smoke** | **PARTIAL** — 3 pass, 5 fail (undeployed routes), 6 blocked (0105/0106 + deploy) |
| **Local quality gates** | **PASS** — typecheck, **242** tests, build |

**Verdict:** Phase 5–6 acceptance chains remain **staging-verified on live Railway API**. Migrations **0105–0106** and redeploy of completion-branch API are **blocked by credentials**. Deployed staging API is **behind HEAD** — routes for Phase 8 day-timeline, Phase 9 BOQ, Phase 10 stock movements, Phase 11 job packs return **404**.

---

## 1. Staging / production separation

| Ref | Role | Touched |
|-----|------|---------|
| `cpkuwtaipjxeipvbssvn` | Staging (allowed) | Env file target only (auth failed) |
| `rshuiaghmtrvvilhqpwm` | Production (forbidden) | **Not touched** |

| File | APP_ENV / TITAN_ENV | Safe? |
|------|---------------------|-------|
| `apps/api/.env.staging.local` | `staging` / `staging` | Yes — gitignored |
| `apps/api/.env`, `packages/db/.env`, `.env` | production-shaped | **NO** |

All staging scripts enforce `FORBIDDEN = 'rshuiaghmtrvvilhqpwm'`.

Evidence: `diagnostic-output/156-staging-verification-summary.json`

---

## 2. Backup / rollback

### Backup attempt

| Method | Result |
|--------|--------|
| `pg_dump` via `DATABASE_URL` from `.env.staging.local` | **FAIL** — `28P01` |
| Direct `postgres()` probe | **FAIL** — `28P01` |

### Recoverable path (when credentials available)

1. **Supabase PITR:** Dashboard → project `cpkuwtaipjxeipvbssvn` → Database → Backups / PITR → restore to timestamp before incident.
2. **Logical dump:** `pg_dump "$DATABASE_URL" -Fc -f staging-pre-0105.dump` (after password fix).

### Rollback steps (post-migration)

1. PITR restore staging to pre-0105 timestamp.
2. Railway dashboard → revert API + web to last known-good deployment.
3. Verify `/api/v1/health/ready` → `database=connected`.
4. Re-run `staging-phase5-public-e2e.mjs` and `staging-phase6-public-e2e.mjs`.

---

## 3. Migration status

| Item | Value |
|------|-------|
| Local journal entries | **106** (`0000` … `0106`) |
| Pending on staging (target) | `0105_boq_workspace`, `0106_job_document_packs` |
| Prior staging evidence | Through **0104** — `diagnostic-output/110-staging-apply-0104.json` (journal 104) |
| `migrate-staging-safe.mjs` | **FAIL** exit 1 — `28P01` during drizzle-kit migrate |
| Journal row-count verify | **BLOCKED** — cannot query `drizzle.__drizzle_migrations` locally |

### Staging inference (public API)

| Evidence | Implication |
|----------|-------------|
| Phase 5 lead convert + job snapshots | ≥ `0099` lead intake on Railway-connected DB |
| Phase 6 crew assign + calendar | ≥ `0096` crew tables |
| `/api/v1/boq` → 404 unauthenticated | Deploy **behind HEAD** (route exists in repo, not on Railway) |
| `/api/v1/job-document-packs` → 404 | Same — needs redeploy + migrations 0105–0106 |

---

## 4. Deploy status

| Target | URL | Status |
|--------|-----|--------|
| API | `https://young-guns-os-staging.up.railway.app` | Live — health ready, DB connected |
| Web | `https://comfortable-determination-staging.up.railway.app` | Live — HTTP 200 |
| Railway CLI redeploy | `npx @railway/cli` | **BLOCKED** — no token |
| Config ready | `infra/staging/railway/titan-staging-api/railway.json` | Dockerfile + `/api/v1/health/ready` |

---

## 5. Smoke test results

| Script | Verdict | Detail |
|--------|---------|--------|
| `staging-phase5-public-e2e.mjs` | **GO 10/10** | `diagnostic-output/140-staging-phase5-e2e.json` |
| `staging-phase6-public-e2e.mjs` | **GO 12/12** | `diagnostic-output/141-staging-phase6-e2e.json` |
| `staging-phase8-12-public-e2e.mjs` | **PARTIAL** | `diagnostic-output/142-staging-phase8-12-e2e.json` |

### Phase 8–12 detail

| Check | Status | Notes |
|-------|--------|-------|
| API ready | PASS | |
| Owner signup | PASS | |
| P8 day-timeline | FAIL/BLOCKED | Route 404 on deployed API |
| P9 BOQ routes | BLOCKED | 404 — needs deploy + 0105 |
| P10 stock levels | PASS | `/inventory/stock` |
| P10 stock movements | FAIL | Route 404 on deployed API |
| P11 job packs | BLOCKED | 404 — needs deploy + 0106 |
| P12 finance chain | Not reached | Job fixture failed (deploy lacks direct job-create parity) |

---

## 6. Local test / build

| Command | Result |
|---------|--------|
| `pnpm typecheck` | PASS — `diagnostic-output/153-typecheck.txt` |
| `pnpm test` | PASS — **242** tests (91 shared + 23 auth + 46 web + 105 api) — `diagnostic-output/154-pnpm-test.txt` |
| `pnpm build` | PASS — `diagnostic-output/155-build.txt` |

---

## 7. Blockers (Owner action)

| Blocker | Unblocks |
|---------|----------|
| Staging Supabase DB password (`28P01`) | Migrations 0105–0106 apply, pg_dump backup, journal verify |
| `RAILWAY_TOKEN` or dashboard deploy | Redeploy `cursor/titan-frozen-scope-completion` HEAD to staging API + web |
| FRZ-015 AURA provider credentials | Live AURA connection |
| FRZ-018 Xero OAuth approval | Staging Xero connect |

---

## 8. Artifacts

| Path | Description |
|------|-------------|
| `diagnostic-output/150-staging-migrate-0105-0106-console.txt` | Migration attempt log |
| `diagnostic-output/156-staging-verification-summary.json` | Structured summary |
| `diagnostic-output/140-staging-phase5-e2e.json` | Phase 5 rerun |
| `diagnostic-output/141-staging-phase6-e2e.json` | Phase 6 rerun |
| `diagnostic-output/142-staging-phase8-12-e2e.json` | Phase 8–12 smoke |
| `packages/db/scripts/staging-phase8-12-public-e2e.mjs` | New smoke runner |
