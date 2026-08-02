# TITAN Finance / Payment Blocker Report

**Phase:** Finance/Payment Blocker (post `162fda7`)  
**Branch:** `cursor/titan-owner-operating-model-final`  
**Final SHA:** `e3a46c7`  
**Generated:** 2026-08-02  
**Production touched:** NO  

---

## Executive verdict

| Area | Verdict |
|------|---------|
| **Code fixes (false-zero, outstanding, Xero import)** | **GO** |
| **Receivables API/UI parity** | **GO** |
| **Payables API/UI parity** | **HOLD** (ACCPAY import blocked) |
| **Cashflow API/UI parity** | **HOLD** (bank balance blocked) |
| **Xero payment mapping / allocation parity** | **HOLD** (0 mappings on staging) |
| **Overall finance payment phase** | **HOLD** |

Staging has **5 synced invoice mappings** and **0 payments / 0 payment mappings** on YGP. This is an honest empty state — not a false-zero bug — but full Xero → TITAN payment allocation parity cannot be proven until read-only payment sync populates data.

---

## Code fixes delivered @ `e3a46c7`

| Fix | File(s) | Purpose |
|-----|---------|---------|
| `resolveEffectiveAmountPaidCents` | `packages/shared/src/finance.ts` | When `payments` rows exist but `invoices.amount_paid_cents=0`, API/UI use max(stored, allocated sum) |
| `resolveEffectiveInvoiceOutstandingCents` extended | `packages/shared/src/finance.ts` | Outstanding uses effective paid + `total_cents` |
| Batch payment allocation in `listInvoices` | `finance.service.ts` | Reconcile paid/outstanding on every invoice list |
| `getStats` outstanding + overdue | `finance.service.ts` | Was hardcoded `0`; now computed from open invoices |
| Receivables intelligence uses `outstandingCents` | `finance-intelligence.service.ts` | No longer uses raw `amountCents - amountPaidCents` |
| Analytics finance outstanding | `analytics.service.ts` | Uses effective total/outstanding + allocation join |
| Xero payment import sets `xero_payment_id` | `xero-sync.service.ts` | Links payment row to Xero ID on pull |
| Xero payment status uses `total_cents` | `xero-sync.service.ts` | Partial/multiple payment status from effective total |
| Unit tests | `packages/shared/src/finance.test.ts` | False-zero, partial payment, INV-scale cents |

---

## Blocker matrix

| Blocker | Status | Staging evidence | Notes |
|---------|--------|-------------------|-------|
| False-zero paid amount when payments exist | **FIXED** | 0 false-zero rows; code reconciles allocated sum | Proven when payments exist; staging has 0 payments |
| `finance/stats` outstanding hardcoded zero | **FIXED** | `stats.outstandingCents=0` matches DB reconciled `0` | Was bug; now computed |
| Receivables aggregation (`total_cents` vs `amount_cents`) | **FIXED** | API 200; ageing uses `InvoiceSummary.outstandingCents` | INV-0423/0424 preserved |
| Partial / multiple payments per invoice | **FIXED** (code) | Allocation sum in `listInvoices`; Xero import accumulates `amountPaidCents` | Unproven on staging (0 payments) |
| Deposit invoice stage handling | **PARTIAL** | Job ledger `stage=deposit` logic unchanged (GO from Phase 5) | No deposit invoices on staging sample |
| `xero_payment_mappings` populated | **BLOCKED** | 0 mappings, 0 payments, 0 xero-linked | Requires read-only Xero payment sync run |
| `payments.xero_payment_id` linkage | **FIXED** (code) | Import path sets field; staging 0 rows | Future sync will populate |
| `conflict_metadata` on mapping tables | **GO** | Column exists (0109); queries use narrow select | No breakage observed |
| Payables ACCPAY bills | **HOLD** | Honest HOLD UI; `accpayAvailable=false` | Owner approval for import migration |
| Cashflow bank balance | **HOLD** | `bankBalanceCents=null`; tx count only | No balance entity in sync |
| Multi-invoice payment allocation | **HOLD** | Not modelled (single `invoice_id` FK) | Documented gap |

---

## Reconciliation matrix (YGP staging @ verify 250)

| Layer | Key metric | Value | Parity |
|-------|-----------|-------|--------|
| **Xero (sync tables)** | `xero_payment_mappings` | 0 | N/A — no payments pulled |
| **Xero (sync tables)** | `xero_invoice_mappings` synced | 5 | GO |
| **Database** | `payments` count | 0 | Honest empty |
| **Database** | Reconciled outstanding (open invoices) | R0 | Matches open invoice set (all draft/paid) |
| **Database** | INV-0423 | R2 472,50 · draft · 0 paid | **Preserved** |
| **Database** | INV-0424 | R2 266,39 · draft · 0 paid | **Preserved** |
| **API** | `/finance/stats` outstandingCents | 0 | **Matches DB** |
| **API** | `/finance-intelligence/receivables` | 200 | GO |
| **API** | `/finance-intelligence/payables` | 200 | PARTIAL (ACCPAY HOLD) |
| **API** | `/finance-intelligence/cashflow` | 200 | PARTIAL (bank HOLD) |
| **UI** | Finance → Receivables | Screenshot PASS | `250--finance-receivables-1440.png` |
| **UI** | Finance → Payables | Screenshot PASS | Honest ACCPAY HOLD copy |
| **UI** | Finance → Cashflow | Screenshot PASS | Invoiced vs cash cards |

---

## Verification

| Gate | Result |
|------|--------|
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS |
| `pnpm --filter @titan/api build` | PASS |
| `pnpm --filter @titan/web build` | PASS |
| `250-finance-payment-reconciliation-verify.mjs` | **HOLD** (payment mapping empty) |

**Evidence:** `diagnostic-output/250-finance-payment-reconciliation-verify.json`  
**Screenshots:** `diagnostic-output/phase250-finance-payment-staging/`

---

## Staging deployments @ `e3a46c7`

| Service | Deploy ID |
|---------|-----------|
| API (`young-guns-os`) | `700784b7-6df4-47cb-b261-c6ce6ee9454` |
| Web (`comfortable-determination`) | `bcc283d1-e1ab-4616-87ec-d935026bc93c` |

---

## Owner actions to reach GO

1. **Run read-only Xero payment sync** on staging (`POST /api/v1/integrations/xero/sync/payments` or full import) — no Xero writes; populates `payments` + `xero_payment_mappings`.
2. **Re-run verify 250** to prove allocation parity on real payment rows.
3. **ACCPAY import approval** (payables) — separate Owner gate; not in this phase scope.
4. **Bank balance scope approval** (cashflow) — requires Xero bank account read scope.

---

## STOP

Finance/payment blocker phase complete. RBAC and orphan routes **not touched**. Production **not touched**.
