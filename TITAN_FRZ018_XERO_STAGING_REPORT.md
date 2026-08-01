# FRZ-018 Xero Integration — Staging Read-Only Verification Report

**Requirement:** FRZ-018 — Integrations truthful provider states (Xero OAuth + read-only import)  
**Scope:** Staging only (`https://young-guns-os-staging.up.railway.app`)  
**Production ref blocked:** `rshuiaghmtrvvilhqpwm` — not accessed  
**Branch:** `cursor/titan-frozen-scope-completion`  
**Updated (UTC):** 2026-08-01  
**Verdict:** **PARTIAL** — Global auto-sync framework deployed; background import at contacts checkpoint; schedule seeded; `last_sync_at` pending full completion

---

## GLOBAL-AUTOSYNC-179 verification (2026-08-01)

| Check | Result |
|-------|--------|
| TenantDomainEventBus + BackgroundWorkOrchestrator | **PASS-CODE** — wired in API bootstrap |
| Domain events (lead.converted, job.completed) | **PASS-CODE** — enqueue follow-up jobs + cache invalidation |
| Staging DB — Young Guns Xero | **PASS** — connected, schedule=1 |
| Background import checkpoint | **PASS** — contacts stage, job running |
| No 90s timeout in recent jobs | **PASS** |
| `GET /background-work/status` | **PARTIAL** — deploy pending owner token probe |
| Evidence | `diagnostic-output/179-global-autosync-staging-verify.json` |

---

## FRZ-018g background sync architecture verification (2026-08-01)

**Commit:** `3120483` — checkpointed batch import jobs; HTTP enqueue returns immediately.

| Check | Result |
|-------|--------|
| Root cause (90s timeout) | **IDENTIFIED** — `XERO_IMPORT_OVERALL_TIMEOUT_MS = 90_000` in deployed `xero-sync.service.ts` (commit `7741976`); staging had not yet run new architecture |
| Background job enqueued | **PASS-DB** — pending import job inserted; scheduler picked up |
| Job survives 90s wall clock | **PASS-DB** — job `8e6aec9b…` still `running` after 90s+ (no new 90s failure) |
| Contacts import progressing | **PASS-DB** — customer mappings 49 → 85 during background run |
| Checkpoint metadata | **PARTIAL** — `result_summary` checkpoint populates on new-code batches |
| `last_sync_at` | **PARTIAL** — null until all stages complete (by design) |
| API health | **PASS** — `/api/v1/health/ready` database connected |
| Owner API enqueue test | **PARTIAL** — no `OWNER_ACCESS_TOKEN`; DB enqueue path used |

Evidence: `diagnostic-output/178-frz018g-xero-background-sync-verify.json`

---

## Executive summary

Staging web/API health **PASS**. UX fixes shipped on branch `cursor/titan-frozen-scope-completion`:

1. **Session on hard refresh** — coerce cross-origin baked `VITE_API_BASE_URL` to same-origin `/api/v1` so httpOnly refresh cookies survive reload through the nginx proxy.
2. **Deep link restore** — protected routes append `returnTo`; login/MFA return to `/integrations/xero` (etc.) instead of role home.
3. **Xero read-only sync UX** — prominent **Sync now (read-only)** on `/integrations/xero` calling full import (`/integration-platform/connectors/sync`); per-entity sync + bank-transaction guidance.

DB probe (FRZ-018e, no Owner token): **49 customer mappings** and sync logs present (progress vs FRZ-018d zero), but **`last_sync_at` still null** and **`last_error` reports 90s contacts timeout** on a failed import job. Invoices, payments, and bank transactions remain unimported. **Owner must retry Sync now (read-only)** after deploy and confirm UI success message.

**Likely prior session bug:** Web bundle baked `https://young-guns-os-staging.up.railway.app` as API base; login Set-Cookie landed on API host while refresh on hard reload hit web proxy without cookie → login redirect. Fixed via `coerceSameOriginApiBase` + inline `__TITAN_API_BASE__=""`.

---

## Prior FRZ-018d summary (unchanged baseline)

Owner signal **"xero synced"** (Sync clicked on staging `/integrations/xero`) was **not corroborated** by read-only staging DB probes: `integration_connections.last_sync_at` remains **null**, `updated_at` unchanged since OAuth (`2026-08-01T10:20:52Z`), **0** `xero_sync_logs`, **0** `integration_sync_jobs`, **0** customer/invoice/payment mappings. OAuth connection remains valid — Young Guns Plumbing connected, encrypted credentials present, `last_error` null, `xero_connected` audit event. Pre-OAuth gates pass: credential gate, tenant isolation, token refresh code coverage (301 unit tests). **No live financial writes**, no FRZ-015 re-run.

**Likely cause (018d):** Sync did not complete successfully on the server (API error, timeout, or UI action did not reach import endpoints). Note: `/integrations/xero` exposed per-entity sync buttons and **Test connection**; dashboard **Sync now** calls `/integration-platform/connectors/sync` for full import.

---

## FRZ-018e post-UX verification (2026-08-01)

| Check | Result |
|-------|--------|
| Web `/healthz` | **PASS** |
| Web runtime same-origin API | **PASS** |
| API `/health/ready` | **PASS** |
| OAuth connected (Young Guns Plumbing) | **PASS-DB** |
| Contacts import | **PASS-DB** — 49 customer mappings, 49 sync logs |
| Invoices import | **PARTIAL** — 0 mappings |
| Payments import | **PARTIAL** — 0 mappings |
| Bank transactions | **PARTIAL** — 0 bank_transaction logs |
| `last_sync_at` | **FAIL** — null (failed job kept partial imports) |
| Session/UX unit tests | **PASS** — 92 web + 301 API xero tests |

Evidence: `diagnostic-output/176-frz018e-xero-staging-post-ux-verify.json`

---

## FRZ-018f auto-sync + schedulers verification (2026-08-01)

**Owner signal:** `SCHEDULERS_ENABLED=true` on Railway staging API.

| Check | Result |
|-------|--------|
| API `/health/ready` | **PASS** — database connected, `providersEnabled=true` |
| Health `schedulersEnabled` field | **PARTIAL** — not exposed on `/health/ready` (only `workersEnabled=false`) |
| OAuth connected (Young Guns Plumbing) | **PASS-DB** |
| Contacts import | **PASS-DB** — 49 customer mappings, 49 sync logs (prior FRZ-018e manual sync) |
| Invoices / payments / bank | **PARTIAL** — 0 mappings |
| `last_sync_at` | **FAIL** — null |
| `integration_sync_schedules` | **FAIL** — 0 rows (connect hook did not run post-orchestrator deploy) |
| Scheduler-driven jobs | **PARTIAL** — 0 `job_type=scheduled`; 1 failed manual job from FRZ-018e |
| Idempotency (duplicate mappings) | **PASS-DB** — no duplicate `xero_contact_id` rows |
| Auto-sync API unauth | **PASS** — 401 on `GET /integration-platform/auto-sync/xero` |
| Tenant isolation | **PASS** — foreign probe disconnected |

**Probe totals:** 13 PASS / 1 FAIL / 6 PARTIAL → **PARTIAL**

Evidence: `diagnostic-output/177-frz018f-auto-sync-schedulers-verify.json`

**Root cause (schedule gap):** Xero OAuth completed before auto-sync orchestrator (`4e285b8`) deployed. `onProviderConnected` hook creates `integration_sync_schedules` and fires initial sync — hook only runs on reconnect, not retroactively.

---

## 1. Credential discovery (no secret values)

| Variable | Staging (inferred) | FRZ-018b (172) | FRZ-018c (174) | FRZ-018d (175) |
|----------|-------------------|----------------|----------------|----------------|
| `PROVIDERS_ENABLED` | Present | Present | Present | Present |
| `XERO_SYNC_ENABLED` | Present | Present | Present | Present |
| `XERO_CLIENT_ID` | Present | Present | Present | Present |
| `XERO_CLIENT_SECRET` | Present | Present | Present | Present |
| `INTEGRATIONS_ENCRYPTION_KEY` | Present | Present | Present | Present |

Structured evidence: `diagnostic-output/175-frz018d-xero-staging-post-sync-verify.json`

---

## 2. OAuth connection (Owner completed — still valid)

**Web entry:** `https://comfortable-determination-staging.up.railway.app/integrations/xero`  
**Callback (Xero app):** `https://young-guns-os-staging.up.railway.app/api/v1/integrations/xero/oauth/callback`

| Field | Value |
|-------|-------|
| Organisation | Young Guns Plumbing |
| Connected at (UTC) | 2026-08-01T10:20:52.209Z |
| Credentials encrypted | Yes |
| Last sync | **None** — unchanged since OAuth |
| Last error | None |
| Audit | `xero_connected` event present |

---

## 3. Verification checklist (11 items) — FRZ-018d post-sync

| # | Item | Result | Detail |
|---|------|--------|--------|
| 1 | Connected organisation | **PASS-DB** | Young Guns Plumbing connected; live `POST /test` deferred |
| 2 | Contacts import (read/list) | **FAIL** | 0 customer mappings; 0 sync logs |
| 3 | Invoices import (read/list) | **FAIL** | 0 invoice mappings; 0 sync logs |
| 4 | Payments import (read/list) | **FAIL** | 0 payment mappings; 0 sync logs |
| 5 | Bank transactions import | **FAIL** | 0 bank_transaction sync logs |
| 6 | lastSyncAt | **FAIL** | Null; `updated_at` unchanged since OAuth |
| 7 | Token refresh / expiry | **PASS (code)** | 60s buffer + inflight dedupe; 301 unit tests pass |
| 8 | Tenant isolation | **PASS** | Probe tenants independent; owner company distinct |
| 9 | Duplicate protection / idempotency | **PASS (code+schema)** | Unique mapping indexes; unit tests; no live sync to verify |
| 10 | Audit evidence | **FAIL** | OAuth audit only; 0 sync logs |
| 11 | Truthful provider status | **PASS** | Probe tenants honestly disconnected |

**FRZ-018d probe totals:** 12 PASS, 4 FAIL, 1 PARTIAL

---

## 4. Live staging probe (2026-08-01 FRZ-018d)

| Test | Result |
|------|--------|
| `/api/v1/health/ready` | **PASS** |
| Unauthenticated `GET /integrations/xero` | **PASS** — 401 |
| DB connected Xero tenant | **PASS** — Young Guns Plumbing |
| DB `last_sync_at` populated | **FAIL** — null |
| DB sync logs | **FAIL** — 0 global |
| DB sync jobs | **FAIL** — 0 for owner tenant |
| DB import mappings | **FAIL** — all zero |
| DB token/connection valid | **PASS** — credentials present, no last_error |
| Tenant isolation | **PASS** |
| Duplicate protection (schema+tests) | **PASS** |
| Secret leak scan | **PASS** |
| Live financial writes | **Not performed** |
| FRZ-015 re-run | **Not performed** |

---

## 5. Unit tests (local)

| Command | Result |
|---------|--------|
| `pnpm --filter @titan/api test -- xero-oauth xero-import-sync` | **301 pass** |

---

## 6. FRZ-018 verdict

| Field | Value |
|-------|-------|
| **Status** | **PARTIAL** |
| **Classification** | OAuth **connected**; schedulers **enabled (Owner signal)**; contacts **partial** (49); auto-sync schedule **not seeded**; full import **incomplete** |
| **Connected** | **Yes** — Young Guns Plumbing on staging |
| **Evidence** | This report + `177-frz018f-auto-sync-schedulers-verify.json` |

---

## 7. Owner action (required — for GO)

1. Confirm staging API **redeployed** after `SCHEDULERS_ENABLED=true` (in-process scheduler starts on API boot).
2. **Reconnect Xero** on staging (`/integrations/xero` → disconnect + OAuth) to fire `onProviderConnected` hook — creates schedule + initial auto-sync. Alternative: authenticated `POST /api/v1/integration-platform/auto-sync/xero/run`.
3. Wait up to 2 scheduler ticks (60s interval) or use Sync now (read-only).
4. Re-run probe:

```bash
node diagnostic-output/frz018f-auto-sync-schedulers-verify.mjs
```

Optional with live UI state:

```bash
OWNER_ACCESS_TOKEN='<staging Bearer>' node diagnostic-output/frz018f-auto-sync-schedulers-verify.mjs
```

5. **GO criteria:** `integration_sync_schedules` row with `lastRunAt` set OR completed sync job; `last_sync_at` populated; contacts + at least one other entity type OR honest partial with scheduler audit.

---

## 8. Security compliance

- No Xero secrets printed, logged, or committed
- Only present/absent and connection state reported
- Production Supabase ref not accessed
- No live financial writes

---

## FRZ-018h import heartbeat + auto-resume (2026-08-01)

**Root cause:** `failStaleImportJobs` compared `startedAt` to `XERO_IMPORT_STALE_JOB_MS` (30 min) — a **total-duration** cutoff. Job `8e6aec9b…` (~682 contacts, invoice stage) was killed after ~30 min despite healthy batch progress. Worse: stale handler **overwrote** `result_summary`, dropping checkpoint metadata.

| Fix | Detail |
|-----|--------|
| Heartbeat | `heartbeatAt` + lease renewed each batch persist |
| Stall detection | Abandon only when **no heartbeat for 15 min** while `running` (not total import duration) |
| Checkpoint durability | Abandon merges existing summary; never wipes checkpoint |
| Auto-resume | Scheduler `resumeAbandonedImportJobs()` re-enqueues failed jobs with checkpoint or reconstructs from mapping counts |
| Rate limits | 429 sets `nextRetryAt` — does not fail entire import |
| UI | Resuming / Retrying / Partial / Waiting labels + checkpoint + next retry |
| `last_sync_at` | Still only on full import success |

Evidence: `diagnostic-output/187-xero-import-recovery-verify.json`  
Probe: `node diagnostic-output/frz018-xero-import-recovery-verify.mjs`

**Post-deploy:** scheduler auto-resumes job `8e6aec9b…` from invoices checkpoint (~682 contacts preserved). No OAuth reconnect or Sync now required.
