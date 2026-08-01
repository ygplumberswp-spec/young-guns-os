# TITAN Xero Payments Hotfix Report

**Date:** 2026-08-01  
**Branch:** `cursor/xero-payments-hotfix`  
**Hotfix HEAD:** `7452a8c54747d5694dd4947690175a7deb3108d3`  
**Fix commits:** `162cbf4` (explicit innerJoin) · `551dd77` (narrow select)  
**Deploy:** young-guns-os staging `e4422c91-2cd8-47d1-aea6-2939d00abb02` SUCCESS  
**Evidence:** `diagnostic-output/212-xero-payments-hotfix.json`

---

## Root cause

**Category:** Staging schema drift — missing column referenced by Drizzle ORM.

During the Xero import **payments** stage, `loadSyncedInvoiceMappingsForPayments` previously used:

```ts
this.db.query.xeroInvoiceMappings.findMany({ with: { invoice: true }, ... })
```

Drizzle generated a `LEFT JOIN LATERAL` selecting **every** `xero_invoice_mappings` column, including `conflict_metadata`. That column exists in the TypeScript schema but **not** on staging PostgreSQL (114 migrations applied; `conflict_metadata` migration not applied).

| Field | Value |
|-------|-------|
| **PG error code** | `42703` |
| **PG message** | `column "conflict_metadata" does not exist` |
| **Failed job** | `8e6aec9b-2d99-493c-85b8-75f61d7f414b` |
| **Failed stage** | `payments` |
| **Company** | `095aef76-fef5-4139-af37-a42f2d7e2faf` (Young Guns) |

Prior partial fixes:

- **`162cbf4`** — replaced relational lateral join with explicit `innerJoin`
- **`551dd77`** — narrowed select to `invoiceId` + `xeroInvoiceId` plus payment-relevant invoice fields only (still failed if full mapping row was selected)

No additional code change was required on the hotfix branch; both commits were already ancestors of staging tip `7452a8c`.

---

## Fix

`apps/api/src/services/xero-sync.service.ts` — `loadSyncedInvoiceMappingsForPayments`:

- Explicit `innerJoin` on `xero_invoice_mappings` + `invoices`
- Narrow select: no `conflict_metadata`, no full mapping row
- Shared by `syncPayments` and `importPaymentBatch`

Unit test: `loadSyncedInvoiceMappingsForPayments select avoids undeployed mapping columns` in `xero-import-sync.test.ts` — **PASS**.

---

## Deploy

| Item | Value |
|------|-------|
| Service | young-guns-os (API only) |
| Environment | staging |
| Deploy ID | `e4422c91-2cd8-47d1-aea6-2939d00abb02` |
| Status | SUCCESS @ 2026-08-01 18:40:55 +02:00 |
| Web | Not redeployed (API-only fix) |

Branch pushed: `origin/cursor/xero-payments-hotfix`

---

## Before / after

| Metric | Before (failure) | After (verified) |
|--------|------------------|------------------|
| Job | `8e6aec9b` failed @ payments | `81c5b8d8` running @ bank_transactions |
| Completed stages | contacts | contacts, **invoices**, **payments** |
| Customer mappings | 673 | 673 |
| Invoice mappings | 5 | 5 |
| Payment mappings | 0 | 0 |
| Bank tx logs | 0 | 3078 |
| INV-0423 total | R2472.50 (247250 cents) | preserved |
| INV-0424 total | R2266.39 (226639 cents) | preserved |
| Duplicate customer mappings | 0 | 0 |
| `last_sync_at` | populated | populated (updates on job completion) |

---

## Monitoring (187 probe, read-only)

- **Verdict:** IN_PROGRESS — bank_transactions advancing (page 21+)
- **Payments stage:** PASSED — no PG 42703 recurrence
- **Incremental 0/0 counts:** treated as valid (not failure)
- **CV classification:** pending import job completion (`cvMetricsRefreshJobId` null until done)

Constraints honoured: staging only, no Xero writes, no reset/restart, no manual sync, mappings preserved.

---

## Verification summary

| Check | Result |
|-------|--------|
| Root cause identified | PG 42703 — `conflict_metadata` in lateral join select |
| Fix present in hotfix branch | Yes (`551dd77` ancestor of HEAD) |
| Unit test | PASS |
| Staging deploy | SUCCESS `e4422c91` |
| Payments stage resume | PASS |
| Mapping preservation | PASS |
| Duplicate regression | PASS |

**Overall verdict:** `HOTFIX_VERIFIED_PAYMENTS_PASSED` — import job cleared payments and is progressing through bank_transactions.

---

## Addendum — 228 Xero UI refresh (2026-08-01)

**Verdict:** `GO` (staging deploy complete; owner browser re-check recommended)

### Root cause

1. **API partial flag:** After import `93144ea8` completed and CV metrics refreshed, scheduler started incremental job `ca479272` (bank_transactions). Legacy `resolveXeroImportState` treated *any* running import as `xeroImportInProgress=true`, keeping Customer Value in perpetual "Updating from Xero" despite fresh DB data.
2. **Frontend cache:** No invalidation of `customers/value-metrics`, finance, CRM, or dashboard query keys when Xero sync settled — pages kept stale React Query cache until manual browser refresh.

### Stale pages (before fix)

- Dashboard → Customer value panel
- CRM customer value filters

### DB vs API vs UI (Young Guns `095aef76…`)

| Signal | DB | Legacy API/UI | After fix |
|--------|-----|---------------|-----------|
| Job 93144ea8 | completed, CV refresh marker set | — | — |
| Active job ca479272 | running, incremental, invoice stages done | partial/updating | complete (bank-tx-only bypass) |
| last_sync_at | 2026-08-01T19:29:24Z | visible after cache expiry | invalidated on sync settle |
| INV-0423/0424 | draft, totals preserved | 0 qualifying customers (by design) | unchanged |

### Deploy

| Service | Deployment ID |
|---------|----------------|
| young-guns-os (API) | `dc1cf1fc-5803-4fa8-b4ea-840c5caaf989` |
| comfortable-determination (web) | `2949e7a8-d2ac-4bff-b3b1-97c71c90d210` |

**Evidence:** `diagnostic-output/228-xero-ui-refresh-verify.json`
