# TITAN Bank Statement Manual Import Architecture

**Capability ID:** BANK-IMPORT-001  
**Status:** Implemented (staging only — migration 0182 not applied)  
**Accounting truth:** Xero remains authoritative for reconciliation.

---

## Purpose

Controlled manual bank-statement import fallback at **Finance → Bank Transactions → Import statement**. Owners and authorised finance administrators upload CSV statements, review a dry-run preview, approve an auditable import batch, and send rows to the review/reconciliation queue — without auto-paid, auto-reconciled, or silent Xero posting.

---

## Authorised roles

| Role | Access |
|------|--------|
| Platform Owner | Manage + approve |
| Company Owner | Manage + approve |
| Authorised finance administrator (`finance:write`) | Manage + approve |
| Technician | Denied |
| Client | Denied |
| Unauthorised Office Staff (`finance:read` only) | Denied for manage |

---

## Workflow

1. Select bank account (from Xero-synced `xero_accounts` where `type = BANK`)
2. Upload validated CSV statement (no immediate import on file select)
3. Detect/map columns (date, amount, optional description/reference)
4. Dry-run preview with row classification
5. Duplicate and conflict detection vs Xero and prior manual imports
6. Owner approves batch
7. Auditable import batch created; rows enter review queue as **`imported_awaiting_review`**

Reversible: unconfirmed `preview_ready` batches can be reverted.

---

## Supported formats

| Format | MIME | Tested |
|--------|------|--------|
| CSV (comma-separated) | `text/csv`, `application/csv` | Yes |

No other formats are advertised or accepted.

---

## Row classifications

- Ready to import
- Existing Xero transaction
- Existing manual transaction
- Possible duplicate
- Conflict
- Invalid
- Review required

---

## Controls

- Private secure storage under job-evidence root (`mode 0o600`)
- MIME and extension validation
- 5 MB file-size limit
- Filename sanitisation
- No public URL
- No bank credentials requested
- No sensitive banking information in audit logs
- Tenant isolation on all queries
- RBAC via `finance:read` / `finance:write`
- Import batch ID + file checksum SHA-256
- Deterministic row fingerprint (SHA-256 of account + date + amount + ref + desc)
- Preview before approval
- Complete audit history in `bank_statement_import_audit_logs`

---

## Schema (migration 0182 — not applied)

- `bank_statement_import_batches`
- `bank_statement_import_rows`
- `bank_statement_import_audit_logs`

Indexes: company+status, batch+row_index, company+classification, company+fingerprint (unique).

---

## API routes

Base: `/api/v1/finance/bank-statements`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/bank-accounts` | List bank accounts |
| POST | `/detect-headers` | Parse CSV headers + suggest mapping |
| POST | `/preview` | Create dry-run preview batch |
| GET | `/batches/:id` | Fetch batch preview |
| POST | `/batches/:id/approve` | Owner approve import |
| POST | `/batches/:id/revert` | Revert unconfirmed batch |

---

## Accounting truth protections

Manual statement rows **never** automatically:

- Mark invoices paid
- Record Xero payments
- Reconcile in Xero
- Finalise revenue, expenses, or job profit

Suggested matches (invoice payments, Yoco settlements, supplier payments, expenses, refunds, transfers, bank fees) are labels only — ambiguous matches require human approval.

---

## Related future capabilities (record only)

See [TITAN_GAP_CLOSURE_PLAN.md](./TITAN_GAP_CLOSURE_PLAN.md) — AI-FIN-DOC-001 and children AP-DOC-001, EXP-REC-001, INV-PRICE-001.

**Locked sequence:** XERO-003 → DASH-001 → XERO-002 controlled live proof → remaining roadmap.
