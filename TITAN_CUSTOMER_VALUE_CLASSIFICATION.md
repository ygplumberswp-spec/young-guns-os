# TITAN Customer Value Classification (Binding)

**Status:** Implemented Phase 1 (foundation)  
**Branch:** `cursor/titan-frozen-scope-completion`  
**Updated (UTC):** 2026-08-01  

---

## Purpose

Distinguish **invoiced** vs **actually paid** customers across CRM, finance, marketing, collections, AURA, and reporting. Preserves unpaid history. **Never counts unpaid invoice totals as cash received.** Supplier-only contacts are never customers.

---

## Classifications

| Key | Label | Rule |
|-----|-------|------|
| `verified_invoiced_customer` | Verified invoiced customer | ≥1 qualifying ACCREC sales invoice (not draft/deleted/voided/cancelled; total > 0) |
| `paying_customer` | Paying customer | Payment allocated to qualifying sales invoice (`amountPaidCents > 0`) |
| `fully_paid_customer` | Fully paid customer | All qualifying invoice balances settled (outstanding R0) |
| `partially_paid_customer` | Partially paid customer | Some payment allocated; balance remains |
| `unpaid_debtor` | Unpaid debtor | Qualifying invoice; no payment allocated; not overdue-primary |
| `overdue_debtor` | Overdue debtor | Outstanding balance past `dueDate` |
| `prospect_contact` | Prospect / contact | No qualifying sales invoice |
| `supplier_only_contact` | Supplier-only contact | `isSupplierOnly=true`; excluded from customer metrics |

### Primary classification priority (exclusive filter)

1. `supplier_only_contact`  
2. `prospect_contact`  
3. `overdue_debtor`  
4. `unpaid_debtor`  
5. `partially_paid_customer`  
6. `fully_paid_customer`  
7. `verified_invoiced_customer` (fallback)

Metric buckets may overlap for cumulative views (e.g. paying ⊃ fully paid).

---

## Metric catalog (ZAR)

| Bucket | Count | Value (cents) |
|--------|------:|---------------|
| Verified invoiced | Customers with qualifying invoices | Sum of invoice totals |
| Paying | Customers with cash received | Sum of `amountPaidCents` (never unpaid totals) |
| Fully paid | All balances settled | Sum of invoice totals |
| Partially paid | Partial allocation | Sum of outstanding balances |
| Unpaid debtor | Invoiced, zero payment | Sum of outstanding balances |
| Overdue debtor | Past due outstanding | Sum of overdue outstanding |
| Prospect / contact | No qualifying invoice | 0 |
| Supplier-only | Supplier flag | 0 |

**Totals:** `customerRecords`, `qualifyingCustomers`, `totalInvoicedCents`, `cashReceivedCents`, `outstandingCents`, `overdueOutstandingCents`.

---

## SQL / data sources (read-only)

```sql
-- Qualifying invoices per tenant
SELECT i.*
FROM invoices i
WHERE i.company_id = :companyId
  AND i.status NOT IN ('draft', 'cancelled')
  AND COALESCE(i.total_cents, i.amount_cents, 0) > 0;

-- Cash received (never unpaid totals)
SELECT SUM(LEAST(i.amount_paid_cents, COALESCE(i.total_cents, i.amount_cents, 0))) AS cash_received_cents
FROM invoices i
WHERE i.company_id = :companyId
  AND i.status NOT IN ('draft', 'cancelled');

-- Xero contact mapping (retained; not buyer proof alone)
SELECT * FROM xero_customer_mappings WHERE company_id = :companyId;

-- Background import in progress (partial metrics)
SELECT 1 FROM integration_sync_jobs
WHERE company_id = :companyId
  AND provider = 'xero'
  AND sync_scope = 'import'
  AND status IN ('pending', 'running')
LIMIT 1;
```

Implementation: pure function `classifyCustomerValueFromEvidence` in `@titan/shared`; API service reads local `customers`, `invoices`, `xero_customer_mappings` only (read-only).

---

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/customers/value-metrics` | Aggregate counts + ZAR values |
| `GET` | `/api/v1/customers?classification=` | Filtered customer list with `valueClassification` |

Filter keys: `CUSTOMER_VALUE_CLASSIFICATION_FILTER_KEYS` in `@titan/shared`.

---

## Default priorities

| Domain | Priority |
|--------|----------|
| Repeat work / loyalty / maintenance | Paying + fully paid |
| Marketing | Paying + fully paid **and** consent |
| Collections / AURA | Overdue + unpaid (separate from sales) |
| Cash reporting | `cashReceivedCents` only |
| CRM customer roll-up | Requires qualifying invoice |

Marketing eligibility extended via `isMarketingEligibleCustomerValue()` (paying or fully paid + existing consent gates).

---

## Constraints

- Queue behind active Xero background import — read-only probes only  
- No customer deletion without Owner approval  
- Staging verification only (`cpkuwtaipjxeipvbssvn`); never production `rshuiaghmtrvvilhqpwm`  
- Evidence: `diagnostic-output/182-customer-value-classification-staging-probe.json`

---

## Post-Xero-import automation (CV-001b)

When a Xero background import job settles with `status=completed` and `integration_connections.last_sync_at` is populated:

1. **`BackgroundWorkOrchestratorService.handleXeroImportJobSettled`** — invalidates customer value caches, recomputes metrics, emits `xero.import.completed`, records idempotent `cvMetricsRefreshJobId` on the Xero connector config.
2. **Scheduler tick fallback** — `IntegrationSyncOrchestratorService.refreshPendingCustomerValueMetrics` runs each 60s tick for tenants where import completed but CV refresh flag is missing (e.g. API restart during import).
3. **Staging watcher** — `diagnostic-output/cv-post-xero-import-watch.mjs` polls read-only every 60s (max 4h) and reruns the classification probe when import completes; writes `diagnostic-output/185-cv-post-xero-import-complete.json`.

While import is `pending`/`running` (or Xero connected but `last_sync_at` is null), `GET /api/v1/customers/value-metrics` returns `dataCompleteness: partial` and UI shows:

> **Xero import in progress — customer classifications are partial**

Contacts mapped from Xero without qualifying invoices remain `prospect_contact` — never `paying_customer`.

---

## Code map

| Layer | Path |
|-------|------|
| Types + pure logic | `packages/shared/src/customer-value-classification.ts` |
| Unit tests | `packages/shared/src/customer-value-classification.test.ts` |
| API service | `apps/api/src/services/customer-value-classification.service.ts` |
| API routes | `apps/api/src/routes/customers.ts` |
| UI panel | `apps/web/src/features/crm/CustomerValueMetricsPanel.tsx` |

Cross-ref: `TITAN_GLOBAL_REALTIME_AUTO_SYNC_ARCHITECTURE.md` (Xero import checkpoints → partial metrics until complete).
