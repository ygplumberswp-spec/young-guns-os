# Void Invoice & Credit Note — Implementation Status

**Branch:** `cursor/titan-owner-operating-model-final`  
**Phase 256 clearance:** see git log after push  
**Generated (UTC):** 2026-08-02T16:30:00.000Z  
**Scope:** Approval-controlled void/credit path + internal credit note entity — **no unauthorized Xero writes**

---

## Executive summary

| Capability | UI | Executable | Verdict |
|------------|:--:|:----------:|---------|
| Void Invoice | Enabled (approval modal) | Draft → Approve → Execute (provider-gated) | **GO (workflow)** |
| Create Credit Note | Enabled (approval modal) | Draft → Approve → Execute → internal entity | **GO (workflow)** |
| Credit Note entity (`credit_notes`) | API CRUD + approval link | Draft / approved_awaiting_provider_write / executed | **GO (entity)** |
| Approval workflow (`xero_write_approvals`) | Modal + API | Full pending/approve/reject/execute | **GO** |
| Xero execution | Labeled blocked | `TITAN_XERO_PROVIDER_WRITES_AUTHORIZED` required | **GO (safety boundary)** |

---

## Credit Note entity (Phase 256)

### Schema

- Table: `credit_notes` + `credit_note_line_items` (migration `0119_credit_notes_billing_recipient.sql`)
- Fields: linked invoice, customer, job, reason, line items, balance preview, status, provider reference (nullable), xero_write_approval_id, idempotency, error_state, audit metadata

### API

| Route | Purpose |
|-------|---------|
| `GET /finance/invoices/:id/credit-notes` | List credit notes for invoice |
| `POST /finance/invoices/:id/credit-notes` | Create draft |
| `PATCH /finance/credit-notes/:id` | Update draft |
| Write approval execute | Creates/links entity with `approved_awaiting_provider_write` when provider gate active |

### Execution boundary

- Without `TITAN_XERO_PROVIDER_WRITES_AUTHORIZED=true`: returns **`approved_awaiting_provider_write`** — no Xero call, internal draft preserved
- Duplicate execute: idempotent via approval + credit note idempotency keys
- Message: Owner approval + provider authorization required

---

## Void Invoice

Unchanged from Phase 255 — provider-gated execute, local simulation only when explicitly authorized.

---

## Remaining work

1. Owner authorization of live Xero void/credit_note API calls (explicit env + OAuth scope)
2. Credit note UI detail page (list via API available; staff modal path unchanged)
3. Payment allocation DATA-DEPENDENT HOLD unchanged

**Blocker classification:** Provider write authorization — safe for staging; production HOLD until Owner grants Xero writes.
