# TITAN Phase 3 (Full) — Finance, Xero Parity and Daily Money Control

**Branch:** `cursor/titan-owner-operating-model-final`  
**Phase:** 3 — full (3A–3D)  
**Starting SHA:** `ccd5c1a` (partial Phase 3)  
**Final SHA:** *(set at commit)*  
**Production touched:** NO  

---

## Executive verdict

| Sub-phase | Verdict | Summary |
|-----------|---------|---------|
| **3A** — Xero parity matrix | **GO** | Read-only matrix updated; anchor invoices preserved |
| **3B** — Receivables | **GO** | Real API + UI from synced ACCREC |
| **3C** — Bills & Payables | **HOLD** | Honest UI + payables API; ACCPAY import blocked pending Owner approval |
| **3D** — Cashflow | **GO (partial)** | Invoiced vs cash separated; forecasts live; bank balance / ACCPAY on HOLD |

**Overall Phase 3:** **GO** with documented HOLD items requiring Owner approval for ACCPAY import.

---

## Scope delivered

### 3A — Full Xero parity discovery

- `XERO_TITAN_FULL_PARITY_MATRIX.md` updated for Phase 3 full
- Read-only staging probes via `230-xero-owner-control-parity-verify.mjs`
- No Xero writes; INV-0423 / INV-0424 preserved

### 3B — Receivables (unchanged from partial)

- Summary cards, aging, debtors table, collection priorities
- Data from `/finance/stats`, `/finance/invoices`, `/finance-intelligence/receivables`

### 3C — Bills & Payables (completed to feasible extent)

**Implemented:**
- New `PayablesIntelligence` type and `/finance-intelligence/payables` API
- `FinancePayablesPage.tsx` wired to payables API (not cashflow proxy)
- PO cash requirement, unapproved purchase count, unmatched bank tx count from read-only `xero_sync_logs`
- Honest HOLD for all ACCPAY bill fields (supplier bills outstanding, overdue, due 7/30)

**HOLD — requires Owner approval:**
- Xero ACCPAY bills import into dedicated payables table (`supplier_bill` entity is `stub` in `XERO_TWO_WAY_ENTITY_MATRIX`)
- Planned import stage `supplier_bills` in `XERO_PLANNED_IMPORT_STAGES` — migration + OAuth scope review needed

### 3D — Cashflow (completed to feasible extent)

**Implemented:**
- `CashFlowIntelligence` extended: `invoicedRevenueCents`, `bankTransactionSyncCount`, `activeBudgetTargetCents`, availability flags
- `FinanceCashflowPage.tsx` — separate cards for invoiced revenue (MTD) vs cash received (MTD)
- Receivables, payables, 7/30-day forecasts, net cash movement
- Monthly/overhead target from active finance budgets when configured
- Bank tx sync count surfaced (read-only mirror)

**HOLD — not feasible without new work:**
- Bank balance — Xero bank account balance not surfaced (sync logs store transactions only, not balances)
- Payroll commitments — HR Phase 12
- VAT/tax estimate — tax rate parity not wired
- Supplier bills in cashflow outflows — ACCPAY import blocked (same as 3C)

---

## Owner approval blockers

| Blocker | Why HOLD | Approval needed |
|---------|----------|-----------------|
| ACCPAY bills import | No payables table; `supplier_bill` is stub-only | Owner approval for migration + import route |
| Bank balance in UI | Bank tx mirrored in sync logs only; no balance entity | Owner approval for bank account read scope / aggregation |
| OAuth scope change | Any new Xero scope for bills/bank accounts | Owner approval per master directive |

---

## Verification

| Check | Result |
|-------|--------|
| INV-0423 / INV-0424 preserved | PASS |
| Xero connected | PASS |
| Receivables API | PASS |
| Cashflow API (invoicedRevenueCents) | PASS |
| Payables API | PASS |
| Finance stats API | PASS |
| Receivables UI (1440, 768) | PASS |
| Cashflow UI (invoiced vs cash) | PASS |
| Payables UI (honest HOLD) | PASS |
| DB/API outstanding match | PASS |

**Evidence:** `diagnostic-output/230-xero-owner-control-parity-verify.json`  
**Screenshots:** `diagnostic-output/phase3-finance-staging/`

---

## Tests / build

| Check | Result |
|-------|--------|
| `pnpm typecheck` | PASS |
| `pnpm --filter @titan/web test` | 137 pass |
| `pnpm --filter @titan/api test` | 373 pass |
| `pnpm --filter @titan/web build` | PASS |

---

## Files changed (Phase 3 completion)

| Area | Files |
|------|-------|
| Shared types | `packages/shared/src/finance-intelligence.ts` |
| API service | `apps/api/src/services/finance-intelligence.service.ts` |
| API routes | `apps/api/src/routes/finance-intelligence.ts` |
| API fix | `apps/api/src/services/finance.service.ts` (mapping type narrow select) |
| Web API client | `apps/web/src/lib/finance-intelligence-api.ts` |
| Web pages | `FinancePayablesPage.tsx`, `FinanceCashflowPage.tsx` |
| Verify | `diagnostic-output/230-xero-owner-control-parity-verify.mjs` |
| Docs | `XERO_TITAN_FULL_PARITY_MATRIX.md`, this report, owner operating model |

---

## Parked uncommitted files

Preserved per master directive — not committed:

- `TITAN_AUTHENTICATED_VISUAL_AUDIT.zip`
- `diagnostic-output/235-phase0-route-reconciliation-verify.json` drift
- Visual audit artifacts

---

## Next phase

**Phase 4 — CRM, Customer 360 and row actions** (await Owner approval to continue).

**STOP** — Phase 3 full report complete.
