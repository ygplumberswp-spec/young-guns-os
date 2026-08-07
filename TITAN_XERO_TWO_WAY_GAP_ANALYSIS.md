# TITAN Xero Two-Way Sync — Gap Analysis

**Audited:** 2026-08-01  
**Codebase:** `/Users/keanuventer/Downloads/Titan Aura V1`  
**Branch:** `cursor/titan-frozen-scope-completion`  
**Active import:** `8e6aec9b-2d99-493c-85b8-75f61d7f414b` (read-only observation)

---

## Summary

| Path | Estimated complete | Status |
|------|---------------------:|--------|
| **Read (Xero → TITAN)** | **~71%** | Active import pipeline; credit notes/bills stub |
| **Write (TITAN → Xero)** | **~25%** | Approval gate scaffold; live push blocked |

**Two-way GO:** **NO** — await import complete + verify queue steps 1–9.

---

## Component audit

### `xero-sync.service.ts`

| Capability | Status | Notes |
|------------|--------|-------|
| Background import (contacts/invoices/payments/bank tx) | **Implemented** | Batch processor, checkpoint resume |
| Idempotent mapping upsert by Xero ID | **Implemented** | Customer/invoice/payment paths |
| Official invoice number on import | **Implemented** | `resolveImportedInvoiceNumber` + `xero_invoice_number` column |
| Conflict detection on import update | **Implemented (scaffold)** | `XeroMappingConflictService` → `out_of_sync` |
| Write approval gate on push scopes | **Implemented (scaffold)** | `syncCustomers/Quotes/Invoices` require approval |
| Credit notes import | **Stub** | `importCreditNotesStub()` |
| Supplier bills import | **Stub** | `importSupplierBillsStub()` |
| Qualifying-contact filter on import | **Partial** | All contacts imported; CV classifier filters totals |
| TITAN→Xero invoice without invented number | **Gap** | `createInvoice` still accepts TITAN number — needs draft/Reference-only path |
| Deposit/progress/final invoice types | **Gap** | Single invoice create path |
| Credit/void write-back | **Missing** | No Xero API wrapper |
| Post-import settled hook | **Implemented** | Via `BackgroundWorkOrchestratorService` |

### Mapping tables

| Table | Status | Gaps |
|-------|--------|------|
| `xero_customer_mappings` | **Implemented** | `conflict_metadata` column added (migration 0109) |
| `xero_invoice_mappings` | **Implemented** | `xero_invoice_number`, `xero_reference` exist; reference not populated on job push |
| `xero_payment_mappings` | **Implemented** | Idempotent by `xero_payment_id` |
| `xero_quote_mappings` | **Partial** | Push only; no pull in import |
| `xero_write_approvals` | **New (scaffold)** | Migration 0109 — not applied during active import |

### `integration-sync-orchestrator.service.ts`

| Capability | Status |
|------------|--------|
| Auto initial sync on OAuth connect | **Implemented** |
| Scheduled incremental import | **Implemented** |
| Idempotency key on sync jobs | **Implemented** |
| CV metrics refresh flags | **Implemented** |
| Two-way read verify queue flags | **Implemented (this sprint)** |
| Write path orchestration | **Missing** — read-only dispatch for xero |

### Finance routes / `finance.service.ts`

| Capability | Status |
|------------|--------|
| Invoice CRUD in TITAN | **Implemented** |
| Invoice from job/quote | **Implemented** |
| Xero push integration | **Gap** — finance routes do not call gated write path |
| Approval workflow before Xero send | **Gap** — internal draft/issue only |

### UI (`XeroSyncPanel`, `XeroSettingsPage`)

| Capability | Status |
|------------|--------|
| Sync status + import progress | **Implemented** |
| Manual sync fallback | **Implemented** |
| Conflict visibility | **Partial** — integration platform conflicts API exists |
| Write approval UI | **Missing** |

---

## Binding requirement mapping

| Requirement | Implemented | Missing |
|-------------|-------------|---------|
| Auto read contacts/invoices/payments/balances | ✓ (import) | Credit notes, bills |
| Preserve Xero IDs + official numbers | ✓ | Job ref on Reference field |
| No blind customer totals | ✓ (CV classifier) | — |
| Approval-controlled writes | Scaffold | UI + finance chain wiring |
| Xero authoritative invoice numbers | Partial | Remove TITAN number on create |
| Idempotent repeated sync | ✓ | Staging re-run verify pending |
| Visible conflicts | Scaffold | UI surfacing |
| Background retry | ✓ | Token expiry staging verify |
| Truthful UI states | Partial | Post-import dashboard refresh verify |
| Audit history | ✓ | — |
| Tenant isolation | ✓ | — |

---

## Sprint deliverables vs gaps

| Deliverable | Done | Remaining |
|-------------|------|-----------|
| Binding spec (`TITAN_XERO_TWO_WAY_SYNC.md`) | ✓ | — |
| Gap analysis (this doc) | ✓ | Re-audit after import GO |
| Write approval gate service | ✓ | Wire to finance UI |
| Conflict metadata | ✓ | Apply migration 0109 post-import |
| Import-complete verify hook | ✓ | Execute verify queue |
| Credit note / bill stubs | ✓ | Implement stages |
| Unit tests (no live Xero) | ✓ | Staging integration tests post-GO |

---

## Recommended next sprint (after import GO)

1. Apply migration `0109` on staging disposable → staging.
2. Run verify queue steps 1–9 (`TITAN_XERO_TWO_WAY_VERIFY_QUEUE.md`).
3. Owner-gated approved invoice → Xero draft flow (mock or single staging invoice).
4. Populate `xero_reference` with job number on write-back.
5. Finance route: draft → approval → gated push.
6. Activate credit note read stage if Young Guns data requires it.
