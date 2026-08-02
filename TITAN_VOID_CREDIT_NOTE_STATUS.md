# Void Invoice & Credit Note — Implementation Status

**Branch:** `cursor/titan-owner-operating-model-final`  
**Phase 255 clearance SHA:** (see git log after push)  
**Generated (UTC):** 2026-08-02T15:45:00.000Z  
**Scope:** Approval-controlled void/credit path wired — **no unauthorized Xero writes**

---

## Executive summary

| Capability | UI | Executable | Verdict |
|------------|:--:|:----------:|---------|
| Void Invoice | Enabled (approval modal) | Draft → Approve → Execute (provider-gated) | **GO (workflow)** |
| Create Credit Note | Enabled (approval modal) | Draft → Approve → Execute (stub + gate) | **GO (workflow)** |
| Approval workflow (`xero_write_approvals`) | Modal + API | Full pending/approve/reject/execute | **GO** |
| Xero execution | Labeled blocked | `TITAN_XERO_PROVIDER_WRITES_AUTHORIZED` required | **GO (safety boundary)** |

---

## Void Invoice

### UI (`InvoiceListRowActions.tsx` + `InvoiceWriteApprovalModal.tsx`)

- **Present:** Yes — Void in More menu for issued invoices (`sent`, `partial`, `overdue`, `paid`).
- **Enabled:** **Yes** — opens modal with guidance, reason field, submit/approve/execute steps.
- **When appropriate:** Issued invoice raised in error, duplicate, or must be cancelled before further collection. Drafts use edit/delete — not void.

### API

| Route | Purpose |
|-------|---------|
| `POST /finance/invoices/:id/write-approvals` | Create pending request (`invoice_void`) |
| `POST /finance/write-approvals/:id/approve` | Owner approve |
| `POST /finance/write-approvals/:id/reject` | Owner reject |
| `POST /finance/write-approvals/:id/execute` | Owner execute (step-up + idempotency) |
| `GET /finance/write-approvals` | List pending |

### Execution boundary

- Without `TITAN_XERO_PROVIDER_WRITES_AUTHORIZED=true`: returns **`approved_awaiting_provider_write`** — invoice **not** silently edited.
- Audit: `security_audit_logs` (`financial` category) on request, approve, blocked execute, executed.
- RBAC: `finance:write` to request; Company Owner to approve/execute.
- Retry: idempotent — duplicate execute returns same blocked/executed result.

---

## Create Credit Note

### UI + API

- Same modal/approval path with `credit_note_create` operation.
- Credit amount validated — cannot exceed invoice total or outstanding (over-credit blocked).

### Execution

- Provider gate same as void; credit note entity import remains **stub** post-verify.

---

## Staging observation (Phase 255)

- Finance → Invoices: Void / Create Credit Note enabled in More menu for eligible rows.
- Owner can complete approve + execute; execute honestly reports Xero write blocked unless env authorized.
- No fake YGP invoices or payments created.

---

## Remaining work

1. Owner authorization of live Xero void/credit_note API calls (explicit env + OAuth scope).
2. Credit note import/create entity beyond approval scaffold.
3. Payment allocation DATA-DEPENDENT HOLD unchanged.

**Blocker classification:** Provider write authorization — safe for staging; production HOLD until Owner grants Xero writes.
