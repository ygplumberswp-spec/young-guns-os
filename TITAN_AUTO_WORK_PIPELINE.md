# TITAN Auto Work Pipeline

**Branch:** `cursor/titan-frozen-scope-completion`  
**Coordinator updated (UTC):** 2026-08-01  
**Staging ref:** `cpkuwtaipjxeipvbssvn` only — production `rshuiaghmtrvvilhqpwm` never touched  

---

## Phase status

| Phase | ID | Status | Commit | Evidence |
|-------|-----|--------|--------|----------|
| 1 | Xero recovery fix | **PASS** (code) / **IN_PROGRESS** (staging deploy) | `9bec8c3` | `diagnostic-output/187-xero-import-recovery-verify.json` |
| 2 | Xero import GO | **IN_PROGRESS** | — | `187`, `185-cv-post-xero-import-complete.json` |
| 3 | SPI-001 Supplier Price Intelligence | **PASS** (code/tests) / **FAIL** (staging migration) | `0b6b911` | `189-spi001-staging-verify.json` |
| 4 | YGP-001 Young Guns Pricing | **QUEUED** | — | blocked until SPI-001 staging PASS |
| 5 | E2E margin flow verify | **QUEUED** | — | `188-supplier-to-margin-e2e-verify.json` |
| 6 | JOB-DEL-001 Job cancel, archive & safe test delete | **QUEUED** | — | `diagnostic-output/190-job-delete-blocker-audit.json` |

---

## Phase 1 — Xero recovery (subagent 4d17b8e4 + coordinator)

**Root cause:** `failStaleImportJobs` used `startedAt` + 30 min monolithic cutoff, overwriting `result_summary` and abandoning healthy multi-batch imports (~682 contacts).

**Fix:** Heartbeat per batch, stall detection (15 min no heartbeat), lease lock, checkpoint-preserving abandon, auto-resume via `resumeAbandonedImportJobs`, rate-limit `nextRetryAt`, UI status labels (Resuming/Retrying/Partial/Waiting).

**Staging pre-deploy (read-only):** Job `8e6aec9b…` failed; 673 customer mappings preserved; 0 duplicate mappings; `last_sync_at` null until deploy + scheduler resume.

---

## Phase 2 — Xero GO gate

| Check | Target |
|-------|--------|
| Job status | `completed` |
| `last_sync_at` | populated on Young Guns Plumbing |
| Mappings | contacts/invoices/payments/bank present |
| Duplicates | none |
| CV auto-recalc | `cvMetricsRefreshJobId` set |

---

## Phase 3 — SPI-001 (queued after Xero GO signal; implementation started in parallel)

Binding: `TITAN_SUPPLIER_PRICE_INTELLIGENCE.md`  
No silent customer pricing changes; uncertain rows → review queue only.

---

## Phase 4 — YGP-001

**Hard gate:** remains **QUEUED** until SPI-001 tests + staging verify **PASS**.

---

## Phase 5 — E2E margin

Supplier cost → pricebook → quote/job/invoice on staging read-only tenant.

---

## Phase 6 — JOB-DEL-001 Job cancel, archive & safe test-job delete

**Binding:** `TITAN_JOB_LIFECYCLE.md` (to be authored with implementation)  
**Subagent coordination:** subagent `7443e5b5` — if lifecycle code is in flight, merge on this branch; do **not** duplicate `job-lifecycle.service.ts` / routes / migration work. If stalled, coordinator completes from this pipeline entry.

### Hard gates (non-negotiable)

| Gate | Rule |
|------|------|
| Production | **Never** touch `rshuiaghmtrvvilhqpwm` |
| Xero import | **Do not interrupt** active import (`8e6aec9b…` running at audit time) — read-only DB for dependency audit only |
| Staging migrations | **Do not apply** `0111_job_lifecycle` (or successor) while Xero import batches are active |
| Young Guns Plumbing | **Do not delete** real YG jobs (`095aef76-fef5-4139-af37-a42f2d7e2faf`) — Owner-confirmed test/demo jobs on E2E tenants (`STAGING-P*`, `FRZ018*`) only |
| Destructive delete | Owner confirmation required before any test-job soft-delete executes on staging |

### Scope

| Capability | Behaviour |
|------------|-----------|
| **Cancel job** | Reason required → `status=cancelled`, remove from dispatch, preserve history + audit |
| **Archive job** | Hidden from active lists; searchable under Archived; restorable by Owner (configurable Admin) |
| **Delete test job** | Owner-only; eligibility checks + blocker preview; soft-delete window then cascade test-only deps |
| **Restore** | Archived or soft-deleted jobs restorable within retention window |
| **View blockers** | GET blocker preview before delete; plain errors; offer Cancel/Archive when blocked |

### Safe-delete dependency blockers

Block permanent delete when any of: Xero-linked invoice/payment, COC, signed document, approved quote, customer payment, or other accounting deps. Never silent cascade on real data. Approved test delete may cascade test-only schedule, dispatch, timesheets, notes, photos, materials, notifications.

### Lists & dashboards

Cancelled / archived / soft-deleted excluded from active counts. Filters: **Active** / **Cancelled** / **Archived**. Drill-down counts on dashboard stats. Query invalidation on lifecycle domain events.

### Permissions & audit

| Role | Cancel | Archive | Restore | Delete test job |
|------|--------|---------|---------|-----------------|
| Company Owner | ✓ | ✓ | ✓ | ✓ (eligible only) |
| Admin | configurable | configurable | configurable | ✗ |
| Technician / Client | ✗ | ✗ | ✗ | ✗ |

All actions tenant-scoped + `security_audit_logs` entry.

### Implementation checklist (queued)

- [ ] Migration: `archived_at`, `cancelled_at`, `cancellation_reason`, `deleted_at`, `is_test_job` on `jobs`
- [ ] `job-lifecycle.service.ts` — dependency checker, soft delete, cascade rules
- [ ] API: `POST /jobs/:id/cancel`, `/archive`, `/restore`, `/delete-test`; `GET /jobs/:id/delete-blockers`
- [ ] Web + mobile job detail actions menu (desktop + mobile)
- [ ] Domain events for list invalidation (`job.cancelled`, `job.archived`, `job.restored`, `job.deleted`)
- [ ] Unit/integration tests for all blocker + happy paths
- [ ] Staging verify after Xero GO + migration window clear

### Staging verification — undeletable test job (pre-implementation)

Evidence: `diagnostic-output/190-job-delete-blocker-audit.json`  
Probe script: `diagnostic-output/190-job-delete-blocker-audit.mjs` (read-only)

| Finding (2026-08-01 audit) | Detail |
|----------------------------|--------|
| Active Xero import | Job `8e6aec9b-2d99-493c-85b8-75f61d7f414b` **running** — no migration during batches |
| Lifecycle schema | `jobs.archived_at` / `deleted_at` / `is_test_job` **not present** on staging — primary blocker today |
| UI/API | No cancel/archive/delete-test endpoints or job actions menu in current staging build |
| E2E test jobs | STAGING-P* / FRZ018* companies audited; Owner confirmation required before any delete |
| YG preserve | Real Young Guns jobs excluded from delete candidates |

**Owner confirmation required:** yes — identify test job id prefix from audit + explicit approval before staging delete executes.

### Sequencing relative to other queued work

Runs **after Phase 5 (E2E margin)** or **in parallel** once Xero GO + SPI-001 staging PASS — **before** any PHSL/GSL pricing-hygiene phases when those are added to this pipeline. Does not block Xero import recovery (Phases 1–2).
