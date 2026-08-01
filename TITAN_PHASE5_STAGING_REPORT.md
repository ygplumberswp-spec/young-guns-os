# TITAN Phase 5 Staging Report — Lead → Customer → Property → Job

**Generated (UTC):** 2026-08-01  
**Branch:** `cursor/titan-frozen-scope-completion`  
**Checkpoint (pre-commit):** `f29cef3`  
**Mode:** Staging-only verification — **never production**

---

## Executive verdict

| Item | Result |
|------|--------|
| **Phase 5 public E2E** | **GO — 10/10 PASS** |
| **Staging API health** | **PASS** — database connected |
| **Production ref touched** | **NO** — `rshuiaghmtrvvilhqpwm` refused in all scripts |
| **Local staging DB migrate** | **BLOCKED** — PostgreSQL `28P01` (password auth) |
| **Railway deploy from CLI** | **BLOCKED** — no `RAILWAY_TOKEN`, CLI not installed |
| **Local quality gates** | **PASS** — typecheck, 225 tests, build |

**Verdict:** Phase 5 acceptance chain is **staging-verified via public API E2E**. Local migration apply and Railway redeploy remain blocked by credentials; indirect evidence indicates staging DB is at least through lead-conversion schema (`0099+`).

---

## 1. Staging / production separation

### Supabase project refs

| Ref | Role | Touched this phase |
|-----|------|-------------------|
| `cpkuwtaipjxeipvbssvn` | **Staging** (allowed) | Target for local env file only (auth failed) |
| `rshuiaghmtrvvilhqpwm` | **Production (forbidden)** | **Not touched** |

### Environment files audited

| File | APP_ENV / TITAN_ENV | DB ref | Safe for staging writes? |
|------|---------------------|--------|--------------------------|
| `apps/api/.env.staging.local` | `staging` / `staging` | Staging (`cpkuw…`) | Yes — gitignored |
| `apps/api/.env` | production-shaped | **Production** | **NO — never use** |
| `packages/db/.env` | production-shaped | **Production** | **NO — never use** |
| `.env` (repo root) | production-shaped | **Production** | **NO — never use** |

### Script guards

All staging scripts under `packages/db/scripts/` checked for `FORBIDDEN = 'rshuiaghmtrvvilhqpwm'` including:

- `migrate-staging-safe.mjs`
- `staging-phase5-public-e2e.mjs`
- All `staging-ux-*-e2e.mjs` and `test-009*-0104-*.mjs` harnesses

Phase 5 E2E uses **public Railway staging API only** — no local postgres required.

---

## 2. Migration status (0094–0104)

### Attempts made

| Method | Result | Detail |
|--------|--------|--------|
| `migrate-staging-safe.mjs` | **FAIL** | `drizzle-kit migrate` exit 1 — same auth as direct connect |
| Direct `postgres()` to staging URL from `.env.staging.local` | **FAIL** | PostgreSQL error **`28P01`** (invalid password) |
| Public API `/api/v1/health/ready` | **PASS** | `database=connected` on Railway staging |
| Phase 5 E2E lead convert + job snapshots | **PASS** | Requires lead intake schema (`0099`) at minimum |

### Journal expectation (repo)

| Item | Value |
|------|-------|
| Expected journal entries | **104** (`0000` … `0104`) |
| Pilot-critical range | `0094_canonical_role_matrix` … `0104_n8n_hybrid_orchestration` |

### Staging migration inference

| Evidence | Implication |
|----------|-------------|
| Prior cutover report (`TITAN_STAGING_CUTOVER_0094_0095_REPORT.md`) | 95/95 through `0095` applied July 2026 |
| UX-B through UX-J staging reports | `0096`–`0104` exercised on staging |
| Phase 5 E2E (2026-08-01) | Lead create/convert, real address snapshots, E.164 mobile — **0099+ behaviour live** |
| Local row-count verification | **Not achieved** — password blocked |

**Status:** **Indirectly verified through live API**; **exact row count 104 not confirmed locally**.

---

## 3. Backup / rollback

### What was attempted

- Local staging password auth — failed (`28P01`); no schema probe or snapshot taken from this machine.
- Production backup paths documented only — **no production access**.

### Staging rollback options (documented)

| Path | When | How |
|------|------|-----|
| Supabase staging PITR / dashboard backup | Preferred | Restore staging project `cpkuwtaipjxeipvbssvn` to timestamp before incident |
| Empty-project dispose/recreate | Pre-data cutover only | See `TITAN_STAGING_CUTOVER_0094_0095_REPORT.md` |
| Railway API/web redeploy previous digest | App rollback | Redeploy prior container SHA via Railway dashboard |
| Forward-only migrations | Normal ops | Do not rewrite `drizzle.__drizzle_migrations` |

### Production rollback (reference only — not executed)

See `TITAN_PRODUCTION_ROLLBACK_PLAN.md` and protected logical backup at  
`~/TitanAura-ProtectedBackups/titan-prod-logical-2026-07-31T12-59-33-501Z.dump`.

---

## 4. Deploy status

| Target | URL | Status |
|--------|-----|--------|
| Staging API | `https://young-guns-os-staging.up.railway.app` | **Live** — health OK |
| Staging Web | `https://comfortable-determination-staging.up.railway.app` | **Live** (not re-tested this run) |
| Deploy completion branch | Railway CLI | **BLOCKED** — no token, CLI absent |
| Config ready | `infra/staging/railway/titan-staging-api/railway.json` | Dockerfile path + healthcheck configured |

**Note:** Staging already serves code sufficient for Phase 5 E2E (lead conversion fix behaviour). Redeploy of `cursor/titan-frozen-scope-completion` HEAD deferred until `RAILWAY_TOKEN` or dashboard deploy.

---

## 5. Phase 5 E2E evidence

**Script:** `packages/db/scripts/staging-phase5-public-e2e.mjs`  
**Output:** `diagnostic-output/140-staging-phase5-e2e.json`  
**Run (UTC):** 2026-08-01T07:09:11Z – 07:09:37Z

| # | Check | Status |
|---|-------|--------|
| 1 | `staging_api_ready` | PASS |
| 2 | `owner_signup` | PASS |
| 3 | `lead_create` | PASS |
| 4 | `lead_convert_chain` | PASS (`JOB-000001`) |
| 5 | `customer_readable` | PASS |
| 6 | `property_address_no_placeholder` | PASS — real SA address |
| 7 | `job_snapshot_no_placeholder` | PASS |
| 8 | `site_contact_mobile_e164` | PASS (`+27825551234`) |
| 9 | `convert_idempotent` | PASS |
| 10 | `cross_tenant_job_denied` | PASS (404) |

**Totals:** 10 passed, 0 failed — **verdict GO**

Sample conversion IDs recorded in JSON (staging test tenant only).

---

## 6. Local quality gates

| Gate | Command | Result |
|------|---------|--------|
| Typecheck | `pnpm typecheck` | **PASS** |
| Tests | `pnpm test` | **PASS — 225** (61 shared + 23 auth + 38 web + 103 api) |
| Build | `pnpm build` | **PASS** |

Run timestamp: 2026-08-01 (Phase 5 completion session).

---

## 7. Blockers requiring Owner / ops approval

| Blocker | Unblocks |
|---------|----------|
| Staging Supabase DB password rotation / sync to `.env.staging.local` | Local migrate verify + diagnostic scripts |
| `RAILWAY_TOKEN` or dashboard deploy | Redeploy completion branch to staging |
| Production migration approval | Any apply to `rshuiaghmtrvvilhqpwm` |

---

## 8. Phase 6 handoff

Phase 5 staging sign-off satisfied via public E2E. Phase 6 (scheduling/dispatcher) local work started in same session — see Sprint 007 in `TITAN_AUTONOMOUS_SPRINT_LOG.md`.

**Next recommended actions:**

1. Owner: refresh staging DB password in `.env.staging.local` (local only).  
2. Owner: Railway deploy of completion branch (dashboard or token).  
3. Continue Phase 6 crew/vehicle assignment staging proof when deploy available.
