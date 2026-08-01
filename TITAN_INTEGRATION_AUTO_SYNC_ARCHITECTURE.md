# TITAN Integration Auto-Sync Architecture

**Updated:** 2026-08-01  
**Scope:** Staging-only verification (`cpkuwtaipjxeipvbssvn`) — never production.

---

## Phase 1 — Inspection findings (before changes)

### Existing infrastructure (reused)

| Layer | What existed |
|-------|----------------|
| **Routes** | `integrations.ts` — per-provider CRUD, manual Xero/Cartrack sync, OAuth callback. `integration-platform.ts` — connector registry, schedules CRUD, manual `POST /connectors/sync`, retry-sync. |
| **Services** | `XeroSyncService` — read-only import pipeline (contacts → invoices → payments → bank transactions) with 90s wall-clock budget, in-memory + DB job locking. `XeroOAuthService` — OAuth, token refresh. `IntegrationsService` — Cartrack connect/sync. `ConnectorEngineService` — connector rows + status mirror. `IntegrationHubService` — sync job lifecycle (`startSyncJob` / `completeSyncJob`). `IntegrationPlatformService` — schedules in `integration_sync_schedules`. |
| **Workers** | `automation.worker.ts` — workflow/orchestration queue only. **No integration polling scheduler existed.** |
| **DB** | `integration_connections`, `integration_sync_jobs`, `integration_sync_logs` (Xero), `integration_sync_schedules`, `integration_connectors`, `xero_*_mappings`. |
| **UI** | Manual **Sync now** as primary path on dashboard + Xero panel. Capability states via `integration-capability.ts` (not full auto-sync state machine). |
| **Gates** | `PROVIDERS_ENABLED`, `XERO_SYNC_ENABLED`, `SCHEDULERS_ENABLED`, `WORKERS_ENABLED` — all default false on staging. |

### Gaps identified

1. No auto initial sync after OAuth/connect — manual Sync now only.
2. No scheduled incremental polling runner (schedule table existed but unused).
3. No unified tenant-safe orchestrator (duplicate ad-hoc sync paths).
4. UI lacked truthful auto-sync states (last/next sync, retry, corrective action).
5. Xero 90s timeout caused FRZ-018e partial contact import failures.

---

## Phase 2 — Reusable framework (built)

### `IntegrationSyncOrchestratorService`

Single tenant-safe orchestration layer:

- **Triggers:** `initial` (on connect), `incremental` (scheduler), `manual` / `retry` (recovery).
- **Locking:** In-flight `Map<companyId:provider>` + existing DB active-job guards in Xero sync.
- **Idempotency:** 5-minute bucket hash stored on sync job `resultSummary.idempotencyKey`.
- **Backoff:** Exponential retry metadata on `integration_connectors.config.autoSync`.
- **Audit:** `security_audit_logs` when userId present; sync jobs + Xero sync logs unchanged.
- **Token refresh:** `XeroOAuthService.ensureFreshAccessToken()` before scheduled/manual Xero runs.
- **Schedule bootstrap:** `ensureDefaultSchedule()` on connect — Xero 20 min, Cartrack 15 min (staging-friendly).

### Scheduler

`workers/integration-sync.scheduler.ts` — 60s tick, runs when `SCHEDULERS_ENABLED=true` (API, worker, or scheduler process).

### Shared contract

`packages/shared/src/integration-auto-sync.ts` — UI state machine, provider catalog, default intervals, corrective actions.

### API

| Endpoint | Purpose |
|----------|---------|
| `GET /integration-platform/auto-sync` | All provider auto-sync statuses |
| `GET /integration-platform/auto-sync/:providerKey` | Single provider status |
| `POST /integration-platform/auto-sync/:providerKey/run` | Recovery manual run |
| Existing `POST /connectors/sync` | Recovery — now routes through orchestrator |

---

## Phase 3 — Provider adapters

| Provider | Status | Notes |
|----------|--------|-------|
| **Xero** | **FULL** | Auto initial on OAuth callback hook; incremental via scheduler; timeout raised to 180s |
| **Cartrack** | **FULL** | Auto initial on credential save hook; incremental polling |
| **Email / Yoco** | PARTIAL | Orchestrator can run verification sync when connected |
| **WhatsApp / OpenAI / Gemini / n8n** | PARTIAL | Status + honest states; no full polling backend |
| **Google Maps / Calendar / Meta / Stripe** | STUB | Honest `not_configured` — no fake data |

---

## Phase 4 — UI

- `IntegrationAutoSyncStatusPanel` — last success, last attempt, next schedule, failures, corrective action.
- Xero settings — auto-sync panel primary; manual sync under **Recovery controls**.
- Integrations dashboard — auto-sync badges + next sync; Sync now labeled **(recovery)**.

---

## Security (unchanged)

Auto-sync remains **read-only** for Xero/Cartrack imports. Financial writes, sends, marketing publish, ad spend still require approval gates.

---

## Staging activation checklist

On Railway `titan-staging-api`:

```
PROVIDERS_ENABLED=true
XERO_SYNC_ENABLED=true
SCHEDULERS_ENABLED=true
```

Without these gates, orchestrator queues honestly but does not execute live sync (audit: `integration_auto_sync_queued_off`).

---

## Files (key)

- `apps/api/src/services/integration-sync-orchestrator.service.ts`
- `apps/api/src/workers/integration-sync.scheduler.ts`
- `packages/shared/src/integration-auto-sync.ts`
- `apps/web/src/features/integrations/IntegrationAutoSyncStatusPanel.tsx`
