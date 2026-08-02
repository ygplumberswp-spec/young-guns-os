# TITAN Finance / Payment Blocker Report

**Phase:** Finance/Payment Blocker (post-schema-fix verification)  
**Branch:** `cursor/titan-owner-operating-model-final`  
**Code SHA:** `7fa533b`  
**Evidence commit:** `fix(finance): unblock staging Xero invoice sync and verify 250 post-fix`  
**Generated:** 2026-08-02  
**Production touched:** NO  
**Xero writes:** NO  

---

## Executive verdict

| Area | Verdict |
|------|---------|
| **Code fixes (false-zero, outstanding, Xero import)** | **GO** |
| **Staging schema (`xero_write_approvals`)** | **GO** — table applied, journal entry inserted |
| **Receivables API/UI parity** | **GO** |
| **Payables API/UI parity** | **HOLD** (ACCPAY import blocked) |
| **Cashflow API/UI parity** | **HOLD** (bank balance blocked) |
| **`xero_invoice_mappings` synced** | **GO** — 5 synced, 0 failed |
| **Xero payment sync pipeline** | **GO** — 511 pulled, 0 failed; skip gate working |
| **Payment row import / allocation parity** | **HOLD** — 511 skipped (no Xero payments reference YGP's 5 TITAN invoices) |
| **Partial / multiple payments per invoice** | **HOLD** (unproven — no overlapping payment rows) |
| **Overall finance payment phase** | **GO_WITH_HOLD** |

Read-only Xero invoice sync **unblocked** after applying migration `0109_xero_two_way_sync_scaffolding` and deploying pull-only invoice sync (skip write-approval when `xero_invoice_id` already mapped). Invoice mappings: **5 synced, 0 failed**. Payment sync: **511 pulled, 511 skipped** — all skipped payments reference Xero invoices outside YGP's 5 TITAN invoice rows (honest empty; pipeline verified). **No Xero writes occurred.**

---

## Staging schema fix (TASK 1–2)

| Item | Status | Evidence |
|------|--------|----------|
| `xero_write_approvals` table | **APPLIED** | 13 columns; enum `xero_write_approval_status` created |
| `conflict_metadata` on mapping tables | **Already present** | Partial 0109 was applied previously |
| Migration journal | **DRIFT (non-destructive)** | Staging 115 entries vs 116 repo tags (0117 missing from repo journal; 0118 applied OOB) |
| 0109 journal entry | **INSERTED** | Hash `f0a30cab…` idempotently inserted |

**Apply script:** `diagnostic-output/apply-0109-staging.mjs`  
**Probe script:** `diagnostic-output/probe-xero-write-approvals-staging.mjs`

---

## Post-fix read-only Xero sync results

| Step | Endpoint | Status | Result |
|------|----------|--------|--------|
| Invoice sync | `POST /api/v1/integrations/xero/sync/invoices` | 200 | pulled=**5**, updated=5, failed=**0**, created=0 |
| Payment sync | `POST /api/v1/integrations/xero/sync/payments` | 200 | pulled=**511**, skipped=**511**, created=0, failed=0 |

**Root cause chain (resolved):**

1. ~~Staging DB missing `xero_write_approvals` table~~ → **FIXED** via idempotent 0109 apply.
2. ~~Invoice sync blocked on write-approval gate even for pull-only rows~~ → **FIXED** in `xero-sync.service.ts` (skip gate when `xeroInvoiceId` exists).
3. Payment sync skip gate now sees 5 synced invoice mappings → **pipeline GO**.
4. 511 payments skipped because none reference the 5 mapped Xero invoice IDs on YGP staging (Xero org has many invoices; TITAN holds 5).

**Evidence:** `diagnostic-output/250-finance-payment-reconciliation-verify.json`

---

## Code fixes delivered

| Fix | File(s) | Purpose |
|-----|---------|---------|
| Pull-only invoice sync bypasses write gate | `apps/api/src/services/xero-sync.service.ts` | Read-only fetch when `xero_invoice_id` already mapped — no Xero write, no approval record required |
| `resolveEffectiveAmountPaidCents` | `packages/shared/src/finance.ts` | False-zero reconciliation when payments exist |
| Batch payment allocation in `listInvoices` | `finance.service.ts` | Reconcile paid/outstanding on every invoice list |
| `getStats` outstanding + overdue | `finance.service.ts` | Computed from open invoices |
| Xero payment import sets `xero_payment_id` | `xero-sync.service.ts` | Links payment row to Xero ID on pull |

---

## Blocker matrix (post-fix)

| Blocker | Status | Post-fix evidence | Notes |
|---------|--------|-------------------|-------|
| `xero_write_approvals` staging table | **FIXED** | Table exists; probe pass | Migration 0109 applied |
| `xero_invoice_mappings` synced status | **FIXED** | 5 synced, 0 failed | INV-0241, INV-0267, INV-0289, INV-0423, INV-0424 |
| False-zero paid amount when payments exist | **FIXED** (code) | 0 false-zero rows | Unproven with live payment rows (0 imported) |
| `finance/stats` outstanding hardcoded zero | **FIXED** | `stats.outstandingCents=0` matches DB | GO |
| Receivables aggregation | **FIXED** | API 200 | INV-0423/0424 preserved |
| `xero_payment_mappings` populated | **PARTIAL** | 0 mappings; skip gate working | No overlapping Xero payments for YGP sample |
| Partial / multiple payments per invoice | **HOLD** | 511 skipped; 0 TITAN payment rows | Needs invoice with Xero payments + TITAN mapping |
| Payables ACCPAY bills | **HOLD** | Honest HOLD UI | Owner approval for import migration |
| Cashflow bank balance | **HOLD** | `bankBalanceCents=null` | No balance entity in sync |
| Multi-invoice payment allocation | **HOLD** | Not modelled (single `invoice_id` FK) | Documented gap |

---

## Reconciliation matrix (YGP staging @ verify 250 post-fix)

| Layer | Key metric | Value | Parity |
|-------|-----------|-------|--------|
| **Schema** | `xero_write_approvals` | EXISTS | **GO** |
| **Schema** | Journal entries | 115 (drift documented) | **DRIFT** |
| **Xero (remote)** | Payments available | 511 pulled | Read-only fetch OK |
| **Xero (sync tables)** | `xero_invoice_mappings` synced | **5** (0 failed) | **GO** |
| **Xero (sync tables)** | `xero_payment_mappings` | 0 | **HOLD** — no matching invoice overlap |
| **Database** | `payments` count | 0 | Honest empty (no overlap) |
| **Database** | Reconciled outstanding | R0 | Matches open invoice set |
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
| `pnpm test` | PASS (373 tests) |
| `pnpm --filter @titan/api build` | PASS |
| `pnpm --filter @titan/web build` | PASS |
| Read-only Xero invoice sync | **PASS** (5 pulled, 0 failed) |
| Read-only Xero payment sync | **PASS** (511 pulled, 0 failed) |
| Payment mapping population | **HOLD** (511 skipped — no invoice overlap on YGP sample) |
| `250-finance-payment-reconciliation-verify.mjs` | **GO_WITH_HOLD** |

**Evidence:** `diagnostic-output/250-finance-payment-reconciliation-verify.json`  
**Screenshots:** `diagnostic-output/phase250-finance-payment-staging/`

---

## Staging deployments

| Service | Deploy ID | Notes |
|---------|-----------|-------|
| API (`young-guns-os`) | `afdefec4-dfe4-45d2-972c-d4a7303109d9` | Pull-only invoice sync fix |

---

## Owner actions to reach full GO

1. **Seed or import invoices with Xero payment history** on staging (or use tenant slice where Xero payments reference mapped invoices) to prove partial/multiple allocation on real rows.
2. **ACCPAY import approval** (payables) — separate Owner gate.
3. **Bank balance scope approval** (cashflow) — requires Xero bank account read scope.

---

## STOP

Finance/payment blocker phase complete (post-schema-fix). RBAC and orphan routes **not touched**. Production **not touched**. Xero **not written**.
