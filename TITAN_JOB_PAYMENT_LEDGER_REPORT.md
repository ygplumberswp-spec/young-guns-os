# TITAN Job Payment Ledger Report

**Phase:** 5 — Job 360, Payment Ledger and Field Operations  
**Branch:** `cursor/titan-owner-operating-model-final`  
**Environment:** Staging only  
**Generated:** 2026-08-02

## Scope delivered

| Area | Status | Notes |
|------|--------|-------|
| `deriveJobPaymentLedger` shared module | Done | Integer cents, truthful payment states |
| `JobFinanceSummary.ledger` API field | Done | `/finance/jobs/:id/finance-summary` |
| Job list finance enrichment | Done | Batch snapshots on `GET /jobs` (finance RBAC) |
| Job list payment columns | Done | Payment state, balance, quote/invoice status |
| Job 360 tabs (16) | Done | Overview … Activity |
| Payment tab ledger grid | Done | Deposits, balance, payment rows |
| Multiple payments preserved | Done | Each payment row listed separately |
| Honest empty states | Done | `hasFinanceData` gates false zeroes |
| Credits/refunds/write-offs | Honest `—` | No persisted model yet |

## Payment states implemented

`no_invoice`, `draft_invoice`, `deposit_required`, `deposit_unpaid`, `deposit_partially_paid`, `deposit_paid`, `awaiting_payment`, `partially_paid`, `paid_in_full`, `overdue`, `voided`

**Not yet data-backed (deferred):** `payment_plan`, `promise_to_pay`, `disputed`, `overpaid`, `refunded`, `written_off` — require dedicated records/workflows.

## Job lifecycle display labels

Derived from job status + execution phase + finance context: New → Awaiting quote → Quote sent → Quote accepted → Scheduled → Assigned → Travelling → On site → Waiting for parts/customer → Work completed → Ready to invoice → Invoiced → Partially paid → Paid.

DB job status enum remains 5 values; display lifecycle is computed (no migration).

## API surfaces

- `GET /api/v1/jobs` — enriched `JobSummary.finance`, suburb, lifecycle, vehicle, duration
- `GET /api/v1/finance/jobs/:jobId/finance-summary` — includes `ledger`

## RBAC

- Finance columns and ledger require `finance:read` or `finance:write`
- Technicians with jobs-only access see job operational columns without payment amounts

## Verification

Run: `node diagnostic-output/232-job-payment-ledger-verify.mjs`  
Artifact: `diagnostic-output/232-job-payment-ledger-verify.json`

## HOLD items

1. **Xero payment_mappings** — staging count may be 0; see `XERO_PAYMENT_ALLOCATION_PARITY_MATRIX.md`
2. **Credits/refunds/write-offs** — no ledger tables; UI shows `—`
3. **COC queue** — compliance tab uses existing panel; dedicated queue deferred
4. **Job communications tab** — routes to customer CRM communications (honest stub)
