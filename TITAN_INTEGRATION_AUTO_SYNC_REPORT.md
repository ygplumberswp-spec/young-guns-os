# TITAN Integration Auto-Sync Report

**Date:** 2026-08-01  
**Branch:** `cursor/titan-frozen-scope-completion`  
**Staging API:** `https://young-guns-os-staging.up.railway.app`  
**Staging Web:** `https://comfortable-determination-staging.up.railway.app`

---

## Summary

Implemented a unified **IntegrationSyncOrchestrator** plus app-wide **BackgroundWorkOrchestrator** / **TenantDomainEventBus** (see `TITAN_GLOBAL_REALTIME_AUTO_SYNC_ARCHITECTURE.md`). Scheduled polling, OAuth/connect hooks, truthful UI states, and **Xero background import jobs** (checkpointed paginated batches, 45s per-tick budget — no whole-sync 90s wall clock). Manual Sync now is recovery-only; sync POST returns immediately and UI polls status endpoints.

---

## Providers

| Provider | Implementation | Staging verifiable |
|----------|----------------|-------------------|
| Xero | FULL auto-sync | Yes — after gates enabled + OAuth |
| Cartrack | FULL auto-sync | Blocked — Owner credentials |
| Email / Yoco | PARTIAL | When configured |
| WhatsApp / AI / n8n | PARTIAL status | Honest states only |
| Google Maps / Calendar / Meta / Stripe | STUB | Documented gaps |

---

## Tests / build

Run locally:

```bash
pnpm typecheck && pnpm test && pnpm build
```

New tests:

- `packages/shared/src/integration-auto-sync.test.ts`
- `apps/api/src/services/integration-sync-orchestrator.test.ts`

---

## Staging verification (Xero) — FRZ-018f (2026-08-01)

**Owner signal:** `SCHEDULERS_ENABLED=true` enabled on Railway staging.

| Gate | Status |
|------|--------|
| `PROVIDERS_ENABLED` | **PASS** — health/ready `providersEnabled=true` |
| `XERO_SYNC_ENABLED` | **Inferred present** (prior FRZ-018 probes) |
| `SCHEDULERS_ENABLED` | **PASS (Owner signal)** — not exposed on `/health/ready` |
| OAuth connected | **PASS-DB** — Young Guns Plumbing |
| Schedule seeded | **FAIL** — 0 `integration_sync_schedules` rows (OAuth predates orchestrator deploy) |
| Scheduler-driven sync | **PARTIAL** — no scheduled jobs yet |
| Contacts import | **PASS-DB** — 49 mappings (prior manual sync) |
| Idempotency | **PASS-DB** — no duplicate customer mappings |

**Verdict:** **PARTIAL** — runtime gate enabled; schedule + initial sync hook blocked until Xero reconnect or manual `POST /auto-sync/xero/run`.

Evidence: `diagnostic-output/177-frz018f-auto-sync-schedulers-verify.json`

**Expected after Xero reconnect (or manual run):**

1. `integration_sync_schedules` row with `enabled=true`, `nextRunAt` set.
2. `integration_sync_jobs` row with `job_type=scheduled` or `initial`, status `completed` or `running`.
3. `xero_sync_logs` rows for imported entities.
4. `GET /api/v1/integration-platform/auto-sync/xero` → `uiState` transitions `initial_sync_running` → `synced`.
5. Second scheduler tick — idempotency guard prevents duplicate full imports within 5-minute bucket.

**Probe script:** `diagnostic-output/frz018f-auto-sync-schedulers-verify.mjs` — do **not** re-run FRZ-015.

---

## Owner / credential gates

| Gate | Owner action |
|------|--------------|
| Staging runtime flags | Enable PROVIDERS / XERO_SYNC / SCHEDULERS on Railway |
| Xero OAuth | Connect via staging web (already available) |
| Cartrack | Provide fleet credentials |
| Meta / WhatsApp / Stripe | Product + credential decisions |

---

## Next safe phase

1. Deploy commit to staging; enable gates; verify Xero auto initial + scheduled incremental.
2. Cartrack staging proof once credentials supplied.
3. Gmail/Google Calendar/Meta — product decision or stub remains honest.

---

## FRZ-018h — Import recovery (2026-08-01)

Replaced monolithic 30-minute `startedAt` abandon with **15-minute heartbeat stall detection**. Checkpoints preserved on abandon; scheduler auto-resumes failed import jobs from `result_summary` or mapping-count reconstruction. UI exposes Resuming / Retrying / Partial / Waiting states.

Evidence: `diagnostic-output/187-xero-import-recovery-verify.json`
