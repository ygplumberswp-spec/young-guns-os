# TITAN Auto Work Pipeline

**Branch:** `cursor/titan-frozen-scope-completion`  
**Coordinator updated (UTC):** 2026-08-01  
**Staging ref:** `cpkuwtaipjxeipvbssvn` only — production `rshuiaghmtrvvilhqpwm` never touched  

---

## Phase status

| Phase | ID | Status | Commit | Evidence |
|-------|-----|--------|--------|----------|
| 1 | Xero recovery fix | **PASS** (code) / **IN_PROGRESS** (staging deploy) | pending | `diagnostic-output/187-xero-import-recovery-verify.json` |
| 2 | Xero import GO | **IN_PROGRESS** | — | `187-xero-import-recovery-verify.json`, `185-cv-post-xero-import-complete.json` |
| 3 | SPI-001 Supplier Price Intelligence | **PASS** (code/tests) / **FAIL** (staging migration pending) | pending | `189-spi001-staging-verify.json` |
| 4 | YGP-001 Young Guns Pricing | **QUEUED** | — | blocked until SPI-001 staging PASS |
| 5 | E2E margin flow verify | **QUEUED** | — | `188-supplier-to-margin-e2e-verify.json` |

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
