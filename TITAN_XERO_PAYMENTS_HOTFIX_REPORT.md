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
