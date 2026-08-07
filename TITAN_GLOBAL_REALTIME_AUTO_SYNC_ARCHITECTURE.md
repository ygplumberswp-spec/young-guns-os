# TITAN Global Real-Time & Auto-Sync Architecture

**Updated:** 2026-08-01  
**Scope:** Staging-only verification (`cpkuwtaipjxeipvbssvn`) — never production (`rshuiaghmtrvvilhqpwm`).

---

## Goal

Users never need to refresh for current data, run routine manual syncs, reconnect after restarts, repeat data entry between modules, wait for long imports in the browser, or understand webhooks/schedulers/queues.

---

## One reusable system (not per-page sync)

| Component | Location | Role |
|-----------|----------|------|
| **TenantDomainEventBus** | `apps/api/src/services/tenant-domain-event-bus.service.ts` | Tenant-scoped publish/subscribe with audit + dedupe; bridges to automation workflows via `emitBusinessEvent` |
| **BackgroundWorkQueue** | `apps/api/src/services/background-work-queue.service.ts` | Unified view over `integration_sync_jobs` (Xero import, integration sync, domain follow-ups via `provider=custom`) |
| **BackgroundWorkOrchestrator** | `apps/api/src/services/background-work-orchestrator.service.ts` | Wraps `IntegrationSyncOrchestratorService`; scheduler tick; domain-event handlers |
| **Checkpoint/resume** | `packages/shared/src/background-work.ts`, `xero-import-job.processor.ts` | Shared checkpoint schema: stage, pages, completedStages, partial success |
| **UI live state contract** | `packages/shared/src/background-work.ts` | `up_to_date`, `updating`, `waiting`, `partially_completed`, `retry_scheduled`, `failed`, `reconnect_required`, `provider_unavailable` |
| **Live UI invalidation** | `api-read-cache.ts`, `cache-invalidation.ts` | Server + client cache prefixes; `GET /api/v1/background-work/status` polling |

Existing integration auto-sync (`TITAN_INTEGRATION_AUTO_SYNC_ARCHITECTURE.md`) remains the integration adapter layer — this document extends it app-wide.

---

## Background processing rules

- Enqueue and return immediately (no long-hanging POST waits)
- Run outside browser request (scheduler tick every 60s when `SCHEDULERS_ENABLED`)
- Safe batches + checkpoints + resume (Xero: 45s batch budget, 5 pages max per tick)
- Controlled backoff retry on connector `config.autoSync`
- In-flight locks: orchestrator `Map<companyId:provider>` + DB active-job guards
- Partial batches preserved; `lastSyncAt` / `lastSuccess` only on full workflow success

---

## Xero timeout fix (FRZ-018e/018g)

**Root cause:** Monolithic 90s wall-clock import in a single HTTP/worker path caused contacts stage timeout on large tenants (Young Guns Plumbing).

**Fix (commit `3120483` + this sprint):**

| Layer | Change |
|-------|--------|
| API | `enqueueImportSync` returns immediately; batches via `processImportJobBatch` |
| Orchestrator | Xero auto-sync always queues background job (`queued: true`) |
| Processor | 45s batch budget, checkpoint resume across stages (contacts → invoices → payments → bank tx) |
| Xero client | 20s per-request timeout (not 90s whole sync) |
| Frontend | `syncIntegrationConnectors` 15s timeout + poll `/xero/sync/status` |
| Scheduler | `BackgroundWorkOrchestrator.processTick()` → `runScheduledSyncs()` → `processPendingImportJobs()` |

---

## Internal domain events (incremental)

| Event | Publisher | Subscriber action | Status |
|-------|-----------|-------------------|--------|
| `lead.converted` | `lead-conversion.service.ts` | Cache invalidation + dispatch follow-up job enqueue | **Wired** |
| `job.completed` | `job-execution.service.ts` | Cache invalidation + completion follow-up job enqueue (snapshot/invoicing/job pack stubbed) | **Wired** |
| `job.scheduled` | lead conversion / scheduling | Cache invalidation | **Wired** |
| Technician travel/arrive/work | mobile services | — | **Stub — future sprint** |
| Materials/variations | job-costing | — | **Stub — future sprint** |
| Invoice/payment changes | finance.service | Xero read-only sync trigger | **Stub — future sprint** |
| Document uploaded | documents.service | Evidence/compliance refresh | **Stub — future sprint** |

Publish via `publishTenantDomainEvent()` → `TenantDomainEventBus` → automation workflows + background handlers.

---

## Integrations

Extend existing orchestrator — no competing sync systems:

| Provider | Auto-sync | Background path |
|----------|-----------|-----------------|
| **Xero** | FULL | Checkpointed import jobs |
| **Cartrack** | FULL | Inline sync (fast) |
| Email / Yoco | PARTIAL | Verification sync |
| WhatsApp / OpenAI / Gemini / n8n | PARTIAL | Status only |
| Google Maps / Calendar / Meta / Stripe | STUB | Honest `not_configured` |

Manual **Sync now** = recovery fallback only.

---

## Frontend

- `IntegrationAutoSyncStatusPanel` — integration provider states + Xero per-entity progress
- `BackgroundWorkStatusPanel` — app-wide work items from `/background-work/status`
- Xero page polls import job status (no 90s POST wait)

---

## API

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/background-work/status` | Tenant background work snapshot (poll) |
| `GET /api/v1/integration-platform/auto-sync` | Integration auto-sync statuses |
| `POST /api/v1/integration-platform/connectors/sync` | Queue Xero import (returns immediately) |
| `GET /api/v1/integrations/xero/sync/status` | Per-entity + import job progress |

---

## Staging activation

```
PROVIDERS_ENABLED=true
XERO_SYNC_ENABLED=true
SCHEDULERS_ENABLED=true
```

Evidence: `diagnostic-output/179-global-autosync-staging-verify.json`

---

## Key files

- `packages/shared/src/background-work.ts`
- `apps/api/src/services/tenant-domain-event-bus.service.ts`
- `apps/api/src/services/background-work-queue.service.ts`
- `apps/api/src/services/background-work-orchestrator.service.ts`
- `apps/api/src/lib/tenant-domain-event-publisher.ts`
- `apps/api/src/routes/background-work.ts`
- `apps/web/src/features/shared/BackgroundWorkStatusPanel.tsx`
- `apps/web/src/lib/background-work-api-client.ts`

### Customer value classification (cross-ref)

After Xero import completes, `GET /api/v1/customers/value-metrics` reads local `invoices` + `xero_customer_mappings` (read-only). While `integration_sync_jobs` import status is `pending`/`running`, metrics return `dataCompleteness: partial` — see `TITAN_CUSTOMER_VALUE_CLASSIFICATION.md`.
