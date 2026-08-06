# TITAN Xero Two-Way Auto-Sync — Binding Specification

**Status:** **SCAFFOLD** — read path active; write path approval-gated; two-way GO blocked until post-import verify  
**Branch:** `cursor/titan-frozen-scope-completion`  
**Staging ref:** `cpkuwtaipjxeipvbssvn` only — **production never touched**  
**Updated (UTC):** 2026-08-01  

---

## Purpose

Automatic, idempotent two-way synchronization between Xero and TITAN with:

- **Xero authoritative** for official invoice numbers and accounting status
- **Routine reads** automatic in background
- **Financial writes** approval-controlled
- **Conflicts visible** — never silent overwrite of approved financial data
- **Tenant isolation** and complete audit history

---

## Direction matrix

| Entity | Xero → TITAN | TITAN → Xero | Preserve Xero ID | Official # from Xero |
|--------|--------------|--------------|------------------|----------------------|
| Contact | Auto import + update | Approval-gated update | ✓ | N/A |
| Sales invoice | Auto import + status sync | Approval-gated create | ✓ | ✓ |
| Payment | Auto import | None (default) | ✓ | N/A |
| Bank transaction | Auto import (sync log) | None | ✓ | N/A |
| Quote | Partial (push only today) | Approval-gated create | ✓ | N/A |
| Credit note | **Stub** | Approval-gated (stub) | ✓ | ✓ |
| Supplier bill | **Stub** | None | ✓ | ✓ |

Canonical matrix: `packages/shared/src/xero-two-way-sync.ts` → `XERO_TWO_WAY_ENTITY_MATRIX`.

---

## Xero → TITAN (auto read sync)

### Scope

Automatically import and continuously update:

- Contacts (all imported; **customer value classifier** filters qualifying sales activity for totals — no blind import into customer totals)
- Sales invoices (ACCREC)
- Invoice status, due dates, balances
- Payments linked to mapped invoices
- Bank transactions (audit via `xero_sync_logs`)
- Credit notes / supplier bills — **stub only** until post-verify activation

### Preserve on every mapping

| Field | Storage |
|-------|---------|
| Xero Contact ID | `xero_customer_mappings.xero_contact_id` |
| Xero Invoice ID | `xero_invoice_mappings.xero_invoice_id` |
| Official Xero invoice number | `xero_invoice_mappings.xero_invoice_number` |
| Payment ID | `xero_payment_mappings.xero_payment_id` |
| Bank transaction ID | `xero_sync_logs.xero_entity_id` |
| Sync timestamps | `last_synced_at`, `last_successful_sync_at` |
| Conflict metadata | `*_mappings.conflict_metadata` + `integration_sync_conflicts` |

### Import pipeline (active)

Stages: `contacts` → `invoices` → `payments` → `bank_transactions`  
Service: `XeroSyncService.enqueueImportSync` / `processImportJobBatch`  
Orchestrator: `IntegrationSyncOrchestratorService` (initial + incremental)

### Idempotency (read)

- Upsert by Xero entity ID (contact, invoice, payment)
- Repeated import must not duplicate mappings or business rows
- Active import job `8e6aec9b…` must not be interrupted

---

## TITAN → Xero (approval-controlled writes)

### Scope

Support approval-controlled:

- Approved contact updates
- Approved quotes (where design supports)
- Deposit / progress / final invoices
- Approved credit/void when explicitly authorized
- Approved payment records only when business process requires

### Workflow (invoice)

```
TITAN job/quote
  → invoice draft (TITAN)
  → human approval (xero_write_approvals)
  → XeroWriteApprovalGate.assertWriteApproved()
  → send draft to Xero (no TITAN-invented invoice number)
  → Xero assigns official invoice number
  → TITAN stores xeroInvoiceId + official number
  → TITAN job number stored as Xero Reference
  → payment/status changes sync back automatically (read path)
```

### Approval gates

| Gate | Enforced by |
|------|-------------|
| No write without approval record | `XeroWriteApprovalGate` |
| No live financial write on staging without Owner | Runtime + queue docs |
| Idempotent write execution | `xero_write_approvals.idempotency_key` unique per tenant |
| Conflict blocks silent overwrite | `XeroMappingConflictService` → `out_of_sync` + `integration_sync_conflicts` |

### Write idempotency key

`buildXeroWriteIdempotencyKey({ companyId, operation, entityId, payloadVersion })`  
Stored on `xero_write_approvals` — replay with same key returns `ALREADY_EXECUTED`.

---

## Rules (binding)

1. Xero remains authoritative for official invoice numbers and accounting status.
2. TITAN must **never invent** a Xero invoice number on write-back.
3. No duplicate contacts, invoices, payments, or mappings.
4. Repeated syncs must be idempotent.
5. Conflicts must be visible (`out_of_sync`, integration conflicts UI).
6. Financial writes require correct approval.
7. Routine reads and status updates sync automatically (scheduler + background batches).
8. Failed syncs retry safely (exponential backoff on connector config).
9. Users must not need manual refresh for normal sync (background work + cache invalidation).
10. UI states truthful: Connected, Syncing, Synced, Partial, Failed, Reconnect Required.
11. Complete audit via `xero_sync_logs` + `security_audit_logs`.
12. Tenant isolation on all queries.
13. **Do not touch production.**

---

## Post-import coordination

| Watcher | Trigger | Idempotency flag | Purpose |
|---------|---------|------------------|---------|
| CV-001 metrics refresh | `handleXeroImportJobSettled` | `cvMetricsRefreshJobId` | Customer value classification |
| Two-way read verify | Same hook, separate flag | `twoWayReadVerifyJobId` | Queue steps 1–2 verify work |

CV watcher and two-way verify **do not block each other**. See `TITAN_XERO_TWO_WAY_VERIFY_QUEUE.md`.

**Do not run verify steps 1–9 until:** import job `completed` **and** `integration_connections.last_sync_at` populated.

---

## Migration

`0109_xero_two_way_sync_scaffolding.sql`:

- `xero_write_approvals` table
- `conflict_metadata` jsonb on xero mapping tables

Apply on disposable/staging **after** active import completes — not during running job `8e6aec9b…`.

---

## Evidence

| Artifact | Purpose |
|----------|---------|
| `TITAN_XERO_TWO_WAY_GAP_ANALYSIS.md` | Implemented vs missing |
| `TITAN_XERO_TWO_WAY_VERIFY_QUEUE.md` | Post-import steps 1–9 |
| `diagnostic-output/186-xero-two-way-readiness.json` | Read-only readiness snapshot |
| `packages/shared/src/xero-two-way-sync.test.ts` | Unit tests |
| `apps/api/src/services/xero-write-approval-gate.test.ts` | Approval gate tests |

---

## GO criteria (two-way)

**NOT GO** until:

1. Import job `8e6aec9b…` → `completed`
2. `last_sync_at` set on Young Guns Plumbing
3. Verify queue steps 1–9 PASS
4. Owner approves staging write-path test (step 3)
