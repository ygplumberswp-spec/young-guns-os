# TITAN Phase 5 — Job 360, Payment Ledger and Field Operations

**Branch:** `cursor/titan-owner-operating-model-final`  
**Base (Phase 4):** `3a70878`  
**Final SHA:** `5131953`  
**Code SHA:** `96f4951`  
**Environment:** Staging only — production not touched  
**Generated:** 2026-08-02

## Verdict

**GO** @ `38cb691` — authenticated staging verification 232 (0 blockers)

Structural and UI parity for job payment ledger is verified on staging. Xero allocation parity remains **HOLD** (0 payments and 0 payment mappings on YGP staging — honest empty, not false zeroes).

## Summary

Phase 5 delivers shared payment ledger derivation (integer cents), `ledger` on job finance-summary API, RBAC-gated job list payment columns, 16-tab Job 360 with Payment ledger grid, and read-only Xero payment allocation parity matrix.

## Deliverables

| Deliverable | Path |
|---|---|
| Job payment ledger report | `TITAN_JOB_PAYMENT_LEDGER_REPORT.md` |
| Xero allocation parity matrix | `XERO_PAYMENT_ALLOCATION_PARITY_MATRIX.md` |
| Staging verify script | `diagnostic-output/232-job-payment-ledger-verify.mjs` |
| Staging verify JSON | `diagnostic-output/232-job-payment-ledger-verify.json` |
| Phase 5 report | `TITAN_PHASE_5_JOB_PAYMENT_REPORT.md` |

## Files changed (summary)

### Shared
- `packages/shared/src/job-payment-ledger.ts` — payment states, ledger derivation, lifecycle labels
- `packages/shared/src/job-payment-ledger.test.ts`
- `packages/shared/src/finance.ts` — `JobFinanceSummary.ledger`, `QuoteSummary.depositPercent`
- `packages/shared/src/jobs.ts` — list enrichment fields on `JobSummary`

### API
- `apps/api/src/services/finance.service.ts` — ledger on finance-summary, batch job finance snapshots
- `apps/api/src/services/jobs.service.ts` — list enrichment (vehicle, duration, lifecycle)
- `apps/api/src/routes/jobs.ts` — finance enrichment on job list
- `apps/api/src/index.ts` — wire `financeService` into jobs router

### Web
- `apps/web/src/features/jobs/Job360Tabs.tsx` — 16-tab Job 360
- `apps/web/src/features/jobs/JobList.tsx` — payment columns, lifecycle status
- `apps/web/src/pages/jobs/JobDetailPage.tsx` — Job 360 integration
- `apps/web/src/pages/jobs/JobListPage.tsx` — finance RBAC for columns
- `apps/web/src/index.css` — job ledger grid + wide table scroll

## Local verification

| Check | Result |
|---|---|
| `@titan/shared` test | PASS (137) |
| API typecheck | PASS |
| Web typecheck | PASS |
| Web build | PASS |

## Staging verification

| Service | Deployment ID | Status |
|---|---|---|
| API (`young-guns-os`) | `13e26fe1-4a8c-41e3-a391-b150ffe15b29` | SUCCESS |
| Web (`comfortable-determination`) | `57f4717e-a4f6-4273-8037-0f06730b0818` | SUCCESS |

Verify script result: **GO** — `diagnostic-output/232-job-payment-ledger-verify.json`

- 1 job on staging; finance enrichment object present on list
- Finance-summary returns `ledger` with honest `no_invoice` / `hasFinanceData: false`
- Job list columns: Payment, Balance, Quote, Invoice, Suburb @ 1440/768
- Job 360 — 16 tabs verified including Payment tab
- Screenshots: `diagnostic-output/phase5-job-payment-staging/`

Run locally:

```bash
node diagnostic-output/232-job-payment-ledger-verify.mjs
```

## HOLD items (remaining)

1. **Xero payment_mappings** — staging probe: 0 payments, 0 mappings, 0 xero-linked; allocation parity unproven until sync populates data (read-only).
2. **Multi-invoice payment allocation** — single `payments.invoice_id` FK; Xero-style split allocations not implemented.
3. **Credits / refunds / write-offs** — ledger fields show `—`; no persisted model.
4. **Payment plan / promise to pay / disputed** — states defined but not data-backed.
5. **Job communications tab** — honest stub linking to customer CRM communications.
6. **COC dedicated queue** — uses existing compliance panel; queue index deferred.

## Phase 6

Not started — await Owner approval per master directive.
