# TITAN Phase 5 Staging Report — Lead → Customer → Property → Job

**Generated (UTC):** 2026-08-01  
**Branch:** `cursor/titan-frozen-scope-completion`  
**Checkpoint (pre-commit):** `2aaee26`  
**Mode:** Staging-only verification — **never production**

---

## Executive verdict

| Item | Result |
|------|--------|
| **Phase 5 public E2E** | **GO — 17/17 PASS** |
| **Phase 6 public E2E (FRZ-006 prep)** | **GO — 12/12 PASS** |
| **Staging API health** | **PASS** — database connected |
| **Production ref touched** | **NO** — `rshuiaghmtrvvilhqpwm` refused in all scripts |
| **Local staging DB migrate** | **BLOCKED** — PostgreSQL `28P01` (password auth) |
| **Local staging backup/snapshot** | **BLOCKED** — same `28P01`; PITR path documented |
| **Railway deploy from CLI** | **BLOCKED** — `RAILWAY_TOKEN` empty; CLI via npx unauthorized |
| **Local quality gates** | **PASS** — typecheck, 235 tests, build |

**Verdict:** Phase 5 acceptance chain is **staging-verified via public API E2E (17 checks including audit history, record links, finance empty state, cross-tenant customer denial)**. Phase 6 crew/schedule chain **staging-verified (12/12)** on live Railway API without redeploy. Local migration row-count verify and Railway redeploy remain blocked by credentials.

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
- `staging-phase6-public-e2e.mjs`
- All `staging-ux-*-e2e.mjs` and `test-009*-0104-*.mjs` harnesses

Phase 5/6 E2E uses **public Railway staging API only** — no local postgres required.

---

## 2. Migration status (0094–0104)

### Attempts made

| Method | Result | Detail |
|--------|--------|--------|
| `migrate-staging-safe.mjs` | **FAIL** | `drizzle-kit migrate` exit 1 — auth `28P01` |
| Direct `postgres()` to staging URL from `.env.staging.local` | **FAIL** | PostgreSQL error **`28P01`** (invalid password) |
| Public API `/api/v1/health/ready` | **PASS** | `database=connected` on Railway staging |
| Phase 5 E2E lead convert + job snapshots | **PASS** | Requires lead intake schema (`0099`) at minimum |
| Phase 6 E2E crew assign + calendar labels | **PASS** | Requires `0096` crew tables + scheduling |
| Prior `apply-0104-staging.mjs` evidence | **PASS** | `diagnostic-output/110-staging-apply-0104.json` — journal 104 |

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
| Phase 5 E2E (2026-08-01 re-run) | Lead create/convert, audit log, real address snapshots — **0099+ live** |
| Phase 6 E2E (2026-08-01) | Crew assign + calendar crew labels — **0096+ live** |
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
| Staging Web | `https://comfortable-determination-staging.up.railway.app` | **Live** — HTTP 200 |
| Deploy completion branch | Railway CLI (`npx @railway/cli`) | **BLOCKED** — no `RAILWAY_TOKEN` |
| Config ready | `infra/staging/railway/titan-staging-api/railway.json` | Dockerfile path + healthcheck configured |

**Note:** Live staging already serves code sufficient for Phase 5 (17/17) and Phase 6 (12/12) public E2E. Redeploy of `cursor/titan-frozen-scope-completion` HEAD deferred until `RAILWAY_TOKEN` or dashboard deploy.

---

## 5. Phase 5 E2E evidence

**Script:** `packages/db/scripts/staging-phase5-public-e2e.mjs`  
**Output:** `diagnostic-output/140-staging-phase5-e2e.json`  
**Run (UTC):** 2026-08-01T07:17:55Z – 07:18:33Z

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
| 9 | `site_contact_name_snapshot` | PASS |
| 10 | `access_instructions_snapshot` | PASS |
| 11 | `lead_status_converted` | PASS |
| 12 | `finance_summary_empty_state` | PASS (0 chips) |
| 13 | `audit_lead_converted` | PASS — security audit log |
| 14 | `record_links_resolvable` | PASS |
| 15 | `convert_idempotent` | PASS |
| 16 | `cross_tenant_job_denied` | PASS (404) |
| 17 | `cross_tenant_customer_denied` | PASS (404) |

**Totals:** 17 passed, 0 failed — **verdict GO**

Sample record links (staging test tenant only):

- Customer: `/crm/customers/46f81429-eba6-4b78-98cf-90c133e710ac`
- Job: `/jobs/0f3f9da7-45da-49ea-907d-13c80804ba04` (`JOB-000001`)

---

## 6. Phase 6 E2E evidence (FRZ-006)

**Script:** `packages/db/scripts/staging-phase6-public-e2e.mjs`  
**Output:** `diagnostic-output/141-staging-phase6-e2e.json`  
**Run (UTC):** 2026-08-01T07:19:52Z – 07:20:32Z (final GO run)

| # | Check | Status |
|---|-------|--------|
| 1 | `staging_api_ready` | PASS |
| 2 | `owner_signup` | PASS |
| 3 | `technician_role_lookup` | PASS |
| 4 | `technician_provision` | PASS (2 techs via invite) |
| 5 | `lead_create` | PASS |
| 6 | `job_create` (via lead convert) | PASS |
| 7 | `job_schedule` | PASS |
| 8 | `crew_assign` | PASS (2 members) |
| 9 | `crew_readback` | PASS |
| 10 | `calendar_crew_label` | PASS (`Tech Alpha`) |
| 11 | `calendar_site_contact_mobile` | PASS (`+27825559876`) |
| 12 | `cross_tenant_crew_denied` | PASS (job/crew blocked) |

**Totals:** 12 passed, 0 failed — **verdict GO**

---

## 7. Local quality gates

| Gate | Command | Result |
|------|---------|--------|
| Typecheck | `pnpm typecheck` | **PASS** |
| Tests | `pnpm test` | **PASS — 235** (61 shared + 23 auth + 46 web + 105 api) |
| Build | `pnpm build` | **PASS** |

Run timestamp: 2026-08-01 (Phase 5 re-verification session).

---

## 8. Blockers requiring Owner / ops approval

| Blocker | Unblocks |
|---------|----------|
| Staging Supabase DB password rotation / sync to `.env.staging.local` | Local migrate verify + diagnostic scripts |
| `RAILWAY_TOKEN` or dashboard deploy | Redeploy completion branch to staging |
| Production migration approval | Any apply to `rshuiaghmtrvvilhqpwm` |

---

## 9. Phase 6+ local progress (same session)

| Item | Status |
|------|--------|
| UX-017 finance strip | **Local complete** — `JobFinanceStrip` on job detail |
| UX-029 job-linked labour (office) | **Local complete** — execution summary shows entry count + minutes |
| Phase 6 staging E2E script | **GO 12/12** on live staging API |
| Scheduling calendar labels | **Verified staging** — crew name + site contact on calendar events |

**Next recommended actions:**

1. Owner: refresh staging DB password in `.env.staging.local` (local only).  
2. Owner: Railway deploy of completion branch (dashboard or token).  
3. Continue field-execution staging proof (UX-B closure re-run on current commit) when deploy available.
