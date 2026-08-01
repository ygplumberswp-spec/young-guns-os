# TITAN Auto Work Pipeline

**Branch:** `cursor/titan-frozen-scope-completion`  
**Coordinator updated (UTC):** 2026-08-01 (Xero GO poll — `202-xero-go-verdict.json`, `205-cv-001b-post-xero-go.json`)  
**Staging ref:** `cpkuwtaipjxeipvbssvn` only — production `rshuiaghmtrvvilhqpwm` never touched  

---

## Phase status

| Phase | ID | Status | Commit | Evidence |
|-------|-----|--------|--------|----------|
| 1 | Xero recovery fix | **PASS** (code + staging deploy) | `9bec8c3` | `diagnostic-output/187-xero-import-recovery-verify.json` |
| 1b | Xero payments SQL fix | **PASS** (code/tests) / **STAGING DEPLOY UNVERIFIED** | `162cbf4`, `4a24b89` | `diagnostic-output/194-payments-sql-fix.json` |
| 2 | Xero import GO | **NO-GO** — deploy `8c3e7b7` recovery **PASS** (job `8e6aec9b` completed, `last_sync_at` set); **CV-001b** connector marker still null | `8c3e7b7` | `198-xero-go-verdict.json`, `197-xero-go-recovery-monitor.json`, `201-cv-001b-post-xero-go.json`, `187` |
| 3 | SPI-001 Supplier Price Intelligence | **PASS** (code/tests) / **FAIL** (staging migration) | `0b6b911` | `189-spi001-staging-verify.json` |
| 4 | YGP-001 Young Guns Pricing | **QUEUED** | — | blocked until SPI-001 staging PASS |
| 5 | E2E margin flow verify | **QUEUED** | — | `188-supplier-to-margin-e2e-verify.json` |
| 6 | JOB-DEL-001 Job cancel, archive & safe test delete | **QUEUED** | — | `diagnostic-output/190-job-delete-blocker-audit.json` |
| 7 | PRN-001 Complete-app printing and PDF output | **QUEUED** | — | `diagnostic-output/191-prn-complete-app-print-verify.json` |
| 8 | PHSL-001 Pricing-list hygiene | **QUEUED** | — | After PRN-001; reference only — no new CL-001 spec |
| 9 | GSL-001 General supplier-list hygiene | **QUEUED** | — | After PHSL-001 |
| 10 | PERF-001 Performance / speed / reliability | **QUEUED** | — | `TITAN_MASTER_EXECUTION_PLAN.md` Phase 22 |
| 11 | WFM-001 Workforce / timesheet / overtime | **PARTIAL** | UX-B, FRZ-013 | Full HR/legal gates open |
| 12 | PRV-001 Remaining providers (Cartrack, WhatsApp live, Meta) | **PARTIAL / NOT AUDITED** | — | `TITAN_PROVIDER_STATE_REGISTER.md` |
| 13 | SEC-001 Security completion (MFA, session click-path, matrix) | **IMPLEMENTED — STAGING VERIFY** | `4410a02` | `184-secure-session-staging-verify.json` |
| 14 | FRZ-SCOPE Frozen-scope binding enforcement | **QUEUED** | — | `TITAN_CLEAN_DATA_UX_QUEUE.md` Phases B–F |
| 15 | FRZ-022 Internal pilot readiness | **BLOCKED** | — | `TITAN_PILOT_READINESS_REPORT.md` — Owner sign-off |
| 16 | FRZ-023 Final launch acceptance | **QUEUED** | — | `TITAN_FINAL_LAUNCH_REPORT.md` |

---

## Phase 1 — Xero recovery (subagent 4d17b8e4 + coordinator)

**Root cause:** `failStaleImportJobs` used `startedAt` + 30 min monolithic cutoff, overwriting `result_summary` and abandoning healthy multi-batch imports (~682 contacts).

**Fix:** Heartbeat per batch, stall detection (15 min no heartbeat), lease lock, checkpoint-preserving abandon, auto-resume via `resumeAbandonedImportJobs`, rate-limit `nextRetryAt`, UI status labels (Resuming/Retrying/Partial/Waiting).

**Staging pre-deploy (read-only):** Job `8e6aec9b…` failed; 673 customer mappings preserved; 0 duplicate mappings; `last_sync_at` null until deploy + scheduler resume.

---

## Phase 2 — Xero GO gate

**Status:** **NO-GO** (2026-08-01) — all import/mapping gates pass except **CV-001b** auto-recalc marker on connector. Next: fix CV settled/tick path, rerun `187` → **GO**, then **SPI-001** staging migration window.

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

---

## Phase 7 — PRN-001 Complete-app printing and PDF output

**Binding:** `TITAN_PRINTING_AND_DOCUMENT_OUTPUT.md` (stub; supersedes prior PRINT-001 queue entry)  
**Status:** **QUEUED** until pipeline/working-tree permit — runs immediately after JOB-DEL-001; independent of PHSL/GSL.

### Hard gates

| Gate | Rule |
|------|------|
| Production | **Never** touch `rshuiaghmtrvvilhqpwm` |
| Xero import | **Do not interrupt** active import batches — read-only staging probes only |
| Staging migrations | **Do not apply** print-related migrations while Xero import or JOB-DEL-001 lifecycle migrations are in flight |
| Subagent `7443e5b5` | **Do not duplicate** or conflict with in-flight JOB-DEL-001 lifecycle code |
| Printer config | **No printer IP/host setup in TITAN** for normal use — native Wi-Fi / AirPrint / browser print only |
| Role security | RBAC + tenant isolation enforced **before** any printable output is rendered |

### Scope (when phase executes)

| Capability | Behaviour |
|------------|-----------|
| **Native printing** | Wi-Fi / AirPrint / Android print / browser `window.print()` — device confirms print; no TITAN printer IP config |
| **Professional A4 templates** | Young Guns Plumbing branded layouts; VAT, totals, signatures |
| **Preview / Print / Save PDF** | Per-document actions on job card, quote, invoice, COC, delivery note, PO |
| **Email / WhatsApp** | Via approved comms workflow only — no silent outbound |
| **PDF generation** | Server/client PDF scaffold with version integrity (immutable snapshot ref) |
| **Bulk printing** | Owner / authorized office staff only; permission-gated batch |
| **Tenant isolation + audit** | All print/PDF/export tenant-scoped; `security_audit_logs` for sensitive docs |
| **Failure UX** | Truthful states — TITAN opens print UI; device/OS confirms actual print |

### Dependencies

| Depends on | Reason |
|------------|--------|
| Phase 2 Xero GO (soft) | Invoice/quote PDFs need synced finance data for staging evidence |
| Phase 4 YGP-001 (soft) | Quote/invoice templates use YG pricing + VAT presentation |
| Phase 6 JOB-DEL-001 (sequencing) | Job card print respects cancelled/archived filters; runs **immediately after** |

Does **not** block Xero recovery, SPI-001, or JOB-DEL-001 implementation.

### Deliverables (implementation checklist)

- [ ] `TITAN_PRINTING_AND_DOCUMENT_OUTPUT.md` — full PRN-001 binding spec
- [ ] Shared print components + `@media print` styles
- [ ] PDF service scaffold (server + client fallback)
- [ ] Per-document templates: job card, quote, invoice, COC, delivery note, PO
- [ ] Bulk print API + Owner/authorized-office permission gate
- [ ] Role security checks before render; tenant isolation on all routes
- [ ] Audit log entries for sensitive document print/PDF/export
- [ ] Tests: permissions, page breaks, multi-page, bulk, duplicate-click guard
- [ ] Staging verification evidence **per core document type**: `diagnostic-output/191-prn-complete-app-print-verify.json`

### Sequencing

Runs **immediately after Phase 6 (JOB-DEL-001)**. May run **in parallel** with PHSL/GSL when added — complete-app printing is independent of supplier-list hygiene work.

---

## Phase 8 — PHSL-001 Pricing-list hygiene

**Status:** **QUEUED** — reference row only; runs after Phase 7 (PRN-001).  
**Binding:** Existing pricing/supplier docs — no new CL-001 spec, no scope expansion.

---

## Phase 9 — GSL-001 General supplier-list hygiene

**Status:** **QUEUED** — after PHSL-001.  
**Gate:** Xero GO + SPI-001 staging PASS preferred.

---

## Phase 10 — PERF-001 Performance / speed / reliability

**Status:** **QUEUED** — maps to `TITAN_MASTER_EXECUTION_PLAN.md` Phase 22 (observability, backup, recovery, performance).  
**Evidence (when executed):** perf/load smoke artifacts under `diagnostic-output/`.

---

## Phase 11 — WFM-001 Workforce / timesheet / overtime

**Status:** **PARTIAL** — mobile time + day timeline local (UX-B, FRZ-013); full labour-law / HR approval gates open.  
**Freeze ref:** FRZ-013 §14.

---

## Phase 12 — PRV-001 Remaining providers

**Status:** **PARTIAL / NOT AUDITED** — Cartrack live, WhatsApp live send, Meta/Google ads; honest stubs on staging.  
**Register:** `TITAN_PROVIDER_STATE_REGISTER.md`.

---

## Phase 13 — SEC-001 Security completion

**Status:** **IMPLEMENTED — STAGING VERIFICATION REQUIRED** — MFA login gate + secure session (`4410a02`); forbidden-action matrix local GO; Owner token click-path partial.  
**Evidence:** `184-secure-session-staging-verify.json`, Sprint 028 tests.

---

## Phase 14 — FRZ-SCOPE Frozen-scope binding enforcement

**Status:** **QUEUED** — `TITAN_CLEAN_DATA_UX_QUEUE.md` Phases B–F after Xero GO (cleanup manifest, decorative pages, domain events, uniform UX).

---

## Phase 15 — FRZ-022 Internal pilot readiness

**Status:** **BLOCKED** — Owner pilot sign-off; operational chain + Xero GO required.  
**Report:** `TITAN_PILOT_READINESS_REPORT.md`.

---

## Phase 16 — FRZ-023 Final launch acceptance

**Status:** **QUEUED** — after pilot PASS.  
**Report:** `TITAN_FINAL_LAUNCH_REPORT.md`.
