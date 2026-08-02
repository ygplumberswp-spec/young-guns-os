# TITAN Finance / Payment Blocker Report

**Phase:** Finance/Payment Blocker (post-sync verification)  
**Branch:** `cursor/titan-owner-operating-model-final`  
**Code SHA:** `e92e495`  
**Evidence commit:** `docs(finance): post-sync payment verify 250 evidence (511 skipped)`  
**Generated:** 2026-08-02  
**Production touched:** NO  
**Xero writes:** NO  

---

## Executive verdict

| Area | Verdict |
|------|---------|
| **Code fixes (false-zero, outstanding, Xero import)** | **GO** |
| **Receivables API/UI parity** | **GO** |
| **Payables API/UI parity** | **HOLD** (ACCPAY import blocked) |
| **Cashflow API/UI parity** | **HOLD** (bank balance blocked) |
| **Xero payment mapping / allocation parity** | **HOLD** (511 pulled, 511 skipped — 0 synced invoice mappings) |
| **Partial / multiple payments per invoice** | **HOLD** (unproven — no payment rows imported) |
| **Overall finance payment phase** | **HOLD** |

Read-only Xero payment sync **ran successfully** (HTTP 200) and pulled **511 payments** from Xero, but **all 511 were skipped** because `xero_invoice_mappings.sync_status='synced'` count is **0** (5 mappings exist, all `failed`). Payment import requires synced invoice context; invoice sync failed on all 5 YGP invoices. **No Xero writes occurred** — invoice push attempts failed locally (missing `xero_write_approvals` table on staging DB).

---

## Post-sync read-only Xero sync results

| Step | Endpoint | Status | Result |
|------|----------|--------|--------|
| Invoice sync (mapping context) | `POST /api/v1/integrations/xero/sync/invoices` | 200 | pulled=0, failed=5, created=0, updated=0 |
| Payment sync | `POST /api/v1/integrations/xero/sync/payments` | 200 | pulled=**511**, skipped=**511**, created=0, failed=0 |

**Root cause chain:**

1. Invoice sync attempts **push** to Xero and fails — staging DB missing `xero_write_approvals` table (migration gap).
2. All 5 `xero_invoice_mappings` rows marked `sync_status='failed'` (was 5 `synced` pre-sync).
3. Payment sync loads only `sync_status='synced'` invoice mappings → lookup empty → every payment skipped.
4. Prior pull failures also logged `Invalid time value` on invoice date parsing.

**Evidence:** `diagnostic-output/250-finance-payment-reconciliation-verify.json` → `syncResponse`

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

| Blocker | Status | Post-sync evidence | Notes |
|---------|--------|-------------------|-------|
| False-zero paid amount when payments exist | **FIXED** | 0 false-zero rows; code reconciles allocated sum | Unproven with live payment rows (0 imported) |
| `finance/stats` outstanding hardcoded zero | **FIXED** | `stats.outstandingCents=0` matches DB reconciled `0` | GO |
| Receivables aggregation (`total_cents` vs `amount_cents`) | **FIXED** | API 200; ageing uses `InvoiceSummary.outstandingCents` | INV-0423/0424 preserved |
| Partial / multiple payments per invoice | **HOLD** | 511 Xero payments skipped; 0 TITAN payment rows | Code path ready; blocked by invoice mapping |
| Deposit invoice stage handling | **PARTIAL** | Job ledger `stage=deposit` logic unchanged (GO from Phase 5) | No deposit invoices on staging sample |
| `xero_payment_mappings` populated | **BLOCKED** | 0 mappings, 0 payments; synced invoices=0, failed=5 | Requires invoice sync fix first |
| `xero_invoice_mappings` synced status | **BLOCKED** | 0 synced, 5 failed (INV-0241, INV-0267, INV-0289, INV-0423, INV-0424) | Push fails: missing `xero_write_approvals` table |
| `payments.xero_payment_id` linkage | **FIXED** (code) | Import path sets field; staging 0 rows | Blocked upstream |
| `conflict_metadata` on mapping tables | **GO** | Column exists (0109); queries use narrow select | No breakage observed |
| Payables ACCPAY bills | **HOLD** | Honest HOLD UI; `accpayAvailable=false` | Owner approval for import migration |
| Cashflow bank balance | **HOLD** | `bankBalanceCents=null`; tx count only | No balance entity in sync |
| Multi-invoice payment allocation | **HOLD** | Not modelled (single `invoice_id` FK) | Documented gap |

---

## Reconciliation matrix (YGP staging @ verify 250 post-sync)

| Layer | Key metric | Value | Parity |
|-------|-----------|-------|--------|
| **Xero (remote)** | Payments available | 511 pulled | Read-only fetch OK |
| **Xero (sync tables)** | `xero_payment_mappings` | 0 | **BLOCKED** — all payments skipped |
| **Xero (sync tables)** | `xero_invoice_mappings` synced | 0 (5 failed) | **BLOCKED** — was 5 synced pre-sync |
| **Database** | `payments` count | 0 | Honest empty (skip gate) |
| **Database** | Reconciled outstanding (open invoices) | R0 | Matches open invoice set |
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
| Read-only Xero payment sync | **PASS** (200, 511 pulled) |
| Payment mapping population | **FAIL** (511 skipped, 0 created) |
| `250-finance-payment-reconciliation-verify.mjs` | **HOLD** |

**Evidence:** `diagnostic-output/250-finance-payment-reconciliation-verify.json`  
**Sync response:** embedded in verify JSON `syncResponse`  
**Screenshots:** `diagnostic-output/phase250-finance-payment-staging/`

---

## Staging deployments @ `e3a46c7`

| Service | Deploy ID |
|---------|-----------|
| API (`young-guns-os`) | `700784b7-6df4-47cb-b261-c6ce6ee9454` |
| Web (`comfortable-determination`) | `bcc283d1-e1ab-4616-87ec-d935026bc93c` |

---

## Owner actions to reach GO

1. **Apply missing staging migration** — `xero_write_approvals` table (or disable invoice push during read-only import sync).
2. **Re-run invoice sync** until `xero_invoice_mappings.sync_status='synced'` > 0 for YGP invoices.
3. **Re-run read-only payment sync** — expect `createdCount > 0` when synced invoice mappings exist.
4. **Re-run verify 250** to prove partial/multiple payment allocation parity on real rows.
5. **ACCPAY import approval** (payables) — separate Owner gate.
6. **Bank balance scope approval** (cashflow) — requires Xero bank account read scope.

---

## STOP

Finance/payment blocker phase complete (post-sync). RBAC and orphan routes **not touched**. Production **not touched**. Xero **not written**.
