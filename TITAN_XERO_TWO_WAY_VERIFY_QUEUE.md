# TITAN Xero Two-Way — Post-Import Verification Queue

**Status:** **QUEUED** — blocked until import GO  
**Coordinates with:** `TITAN_CLEAN_DATA_UX_QUEUE.md` Phase A, CV-001 watcher (`cvMetricsRefreshJobId`)  
**Does not conflict with:** CV post-import metrics refresh — separate idempotency flag `twoWayReadVerifyJobId`  
**Active import (do not interrupt):** `8e6aec9b-2d99-493c-85b8-75f61d7f414b`  

---

## Gate

Auto-run steps **only when ALL true:**

| Check | Target |
|-------|--------|
| Import job status | `completed` |
| `integration_connections.last_sync_at` | populated (Young Guns Plumbing) |
| No import job `pending`/`running` for tenant | ✓ |
| Migration `0109` applied | staging (after import) |

Until gate passes: **read-only** DB/API observation only.

---

## Automation hook

On import job settle (success):

1. `BackgroundWorkOrchestratorService.handleXeroImportJobSettled`
2. CV-001 metrics refresh (if not done) — `cvMetricsRefreshJobId`
3. Queue `xero_two_way_read_verify` background work — `twoWayReadVerifyJobId`
4. Publish `xero.import.completed` domain event

Steps 1–2 below run via queued work item. Steps 3–9 require Owner gate or staging scripts.

---

## Verification steps (binding)

### Step 1 — Verify all required Xero read entities

**Auto (read-only script):** `diagnostic-output/frz018g-xero-background-sync-verify.mjs` + mapping counts

| Entity | Expect |
|--------|--------|
| Customer mappings | > 0 (Young Guns contacts) |
| Invoice mappings | > 0 post invoices stage |
| Payment mappings | ≥ 0 (depends on Xero data) |
| Bank transaction logs | ≥ 0 |
| Credit note stub | acknowledged, not imported |
| Supplier bill stub | acknowledged, not imported |

**Evidence:** update `186-xero-two-way-readiness.json`

---

### Step 2 — Test repeated import without duplicates

**Auto (read-only):** enqueue second incremental import; compare mapping counts before/after

| Check | Pass |
|-------|------|
| `xero_customer_mappings` count | unchanged ± 0 new duplicates |
| `xero_invoice_mappings` count | unchanged ± 0 new duplicates |
| `xero_payment_mappings` count | unchanged ± 0 new duplicates |

**Unit tests:** `xero-two-way-sync.test.ts`, `xero-import-sync.test.ts`

---

### Step 3 — Approved TITAN invoice → Xero flow (staging)

**Owner approval required** — live financial write

| Sub-step | Gate |
|----------|------|
| Create TITAN draft invoice from job | Engineering |
| Owner approves write record in `xero_write_approvals` | **Owner** |
| Gated push via `XeroWriteApprovalGate` | Engineering |
| Verify Xero assigns official number | Auto read-back |

**Blocked this sprint** unless Owner explicitly approves staging write test.

---

### Step 4 — Verify Xero number / reference mapping

**Auto after step 3 OR read-only audit of imported invoices:**

| Field | Source |
|-------|--------|
| `xero_invoice_id` | Xero API |
| `xero_invoice_number` | Xero-assigned only |
| `xero_reference` | TITAN job number (write path) |

---

### Step 5 — Verify Xero payment/status → TITAN

**Auto (read-only):** compare unpaid invoice statuses + `amount_paid_cents` after payment import stage

---

### Step 6 — Verify conflict, retry, and token-expiry handling

| Area | Script / test |
|------|----------------|
| Conflict surfaced | `xero-mapping-conflict.test.ts` |
| Retry backoff | `integration-sync-orchestrator.test.ts` |
| Token expiry | Manual reconnect path + `XeroOAuthService.ensureFreshAccessToken` |

---

### Step 7 — Update dashboards automatically

**Auto:** CV metrics + integration auto-sync status refresh without manual page reload

| Surface | Expect |
|---------|--------|
| `CustomerValueMetricsPanel` | dataCompleteness ≠ partial after GO |
| `/api/v1/background-work/status` | integration auto-sync `up_to_date` |
| Xero settings panel | Synced state |

---

### Step 8 — Update acceptance and launch evidence

Update:

- `TITAN_ACCEPTANCE_REGISTER.md` (FRZ-010, FRZ-018)
- `TITAN_TEST_EVIDENCE_INDEX.md`
- `TITAN_PILOT_READINESS_REPORT.md`
- `TITAN_FINAL_LAUNCH_REPORT.md`
- `diagnostic-output/186-xero-two-way-readiness.json`

---

### Step 9 — Commit and push

Only after steps 1–8 PASS (step 3 may be **WAIVED** with Owner sign-off on read-only GO).

**Do not claim two-way GO in commit message until verify complete.**

---

## Owner approval summary

| Action | Owner required |
|--------|----------------|
| Steps 1–2, 4–8 (read-only) | No |
| Step 3 staging invoice write | **Yes** |
| Production financial writes | **Yes** (out of scope) |

---

## Evidence index

| File | Step |
|------|------|
| `diagnostic-output/186-xero-two-way-readiness.json` | 1, 8 |
| `diagnostic-output/178-frz018g-xero-background-sync-verify.json` | 1 |
| `apps/api/src/services/xero-write-approval-gate.test.ts` | 3 (mock) |
| `TITAN_XERO_TWO_WAY_GAP_ANALYSIS.md` | 8 |
