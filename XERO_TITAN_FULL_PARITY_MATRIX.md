# XERO ↔ TITAN Full Parity Matrix (Young Guns Plumbing)

**Phase:** 3A–3D (full)  
**Generated:** 2026-08-02  
**Evidence:** `diagnostic-output/230-xero-owner-control-parity-verify.json`  
**Staging tenant:** Young Guns Plumbing `095aef76-fef5-4139-af37-a42f2d7e2faf`  
**Xero writes during Phase 3:** NONE  

---

## Anchor invoice integrity (preserved)

| Invoice | Xero/TITAN amount | Status | Verdict |
|---------|-------------------|--------|---------|
| INV-0423 | R2 472,50 (247250 cents) | draft, number_authority=xero | **PRESERVED** |
| INV-0424 | R2 266,39 (226639 cents) | draft, number_authority=xero | **PRESERVED** |

Draft Xero ACCREC invoices are not counted as open receivables until authorised/sent — outstanding totals correctly show R0 on staging.

---

## Object parity summary

| Xero object | Xero (via sync logs / mappings) | TITAN DB | TITAN API | TITAN UI | Verdict |
|-------------|----------------------------------|----------|-----------|----------|---------|
| Organisation | Connected | integration_connections connected | integrations hub | Settings → Integrations | **GO** |
| Contacts (customers) | 4858 customer sync logs | 678 customers, 673 xero_customer_mappings | customers API | Customers list | **PARTIAL** — not all contacts are customers |
| Contacts (suppliers) | In Xero contact set | No dedicated supplier table | — | — | **HOLD** |
| ACCREC invoices | 4630 invoice sync logs | 5 invoices, 5 invoice_mappings | `/finance/invoices` | Invoices, Receivables | **PARTIAL** — import subset live |
| ACCPAY bills | In Xero | Not imported (stub) | `/finance-intelligence/payables` | Payables HOLD UI | **HOLD** — Owner approval for import |
| Payments | Xero payments | 0 payments, 0 payment_mappings | `/finance/payments` | Payments | **HOLD** — mappings empty on staging |
| Payment allocations | Xero | Not modelled separately | — | Job finance Phase 5 | **HOLD** |
| Bank accounts | Xero | Not surfaced | — | Cashflow — | **HOLD** |
| Bank transactions | 3078 sync logs | xero_sync_logs only | `/finance-intelligence/payables` (count) | Payables, Cashflow notes | **PARTIAL** — read-only count |
| Quotes | Xero | 0 quotes, 0 quote_mappings | `/finance/quotes` | Quotes | **HOLD** |
| Credit notes | Xero | Stub only | — | — | **NO-GO** |
| Purchase orders | — | 0 POs | procurement API | Procurement | **HOLD** |
| Items / products | Xero items | inventory module | inventory API | Inventory | **PARTIAL** |
| Tax rates | Xero | company finance settings | settings | Finance settings | **PARTIAL** |
| Tracking categories | Xero | Not imported | — | — | **NO-GO** |

---

## Customer classification (must not treat all contacts as customers)

| Classification | Supported | Source |
|----------------|-----------|--------|
| Verified invoiced customer | Yes | customer_value_classifications + invoice linkage |
| Paying customer | Yes | payments + invoices |
| Partial payer | Yes | invoice amount_paid_cents |
| Unpaid debtor | Yes | receivables intelligence |
| Overdue debtor | Yes | due_date + status |
| Prospect / contact | Yes | leads + unmapped contacts |
| Supplier | Partial | contact type in Xero, no ACCPAY UI |
| Mixed customer/supplier | Partial | mapping layer |
| Archived contact | Partial | customer status |

---

## Sync infrastructure

| Check | Status |
|-------|--------|
| Xero connected | connected, last sync 2026-08-01T20:58:41Z |
| Auto-sync | Active via integration connector |
| Pagination / checkpoints | import job checkpoints in integration_sync_jobs |
| Idempotency | xero_invoice_mappings by xero_invoice_id |
| Deleted/voided handling | cancelled invoice status in TITAN |
| Rate limits | orchestrator batch budgets |
| Scheduler locks | integration_sync_jobs status gates |
| UI refresh after sync | use-xero-sync-cache-refresh (equivalent to bd6da8b; cherry-pick not required) |
| Staging schema drift | `conflict_metadata` on mapping tables aligned (0109 IF NOT EXISTS, staging only) |

---

## Phase 3 route verdicts

| Route | Phase | Verdict |
|-------|-------|---------|
| `/finance/receivables` | 3B | **GO** — real API + UI, honest zeroes |
| `/finance/payables` | 3C | **HOLD** — payables API + honest UI; ACCPAY import needs Owner approval |
| `/finance/cashflow` | 3D | **GO (partial)** — invoiced vs cash separated; bank balance HOLD |

---

## Known gaps (Owner approval blockers)

1. Only 5 ACCREC invoices imported to TITAN vs thousands in Xero sync history — incremental import scope.
2. INV-0423/0424 remain Xero **draft** — excluded from outstanding until authorised in Xero.
3. Payment mappings count 0 on staging — payment ledger parity deferred to Phase 5.
4. **ACCPAY bills** — `supplier_bill` entity is stub; dedicated import + payables table requires Owner approval (migration + OAuth scope review).
5. **Bank balance** — sync logs store transactions only; bank account balance aggregation not implemented.
6. Migration 0109 full journal entry not committed as applied — staging columns added directly for drift fix.
