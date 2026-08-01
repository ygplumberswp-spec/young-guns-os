# TITAN Owner Daily Operating Model Report

**Phase:** 3 — Finance, Xero parity and daily money control (partial)  
**Branch:** `cursor/titan-owner-operating-model-final`  
**Generated (UTC):** 2026-08-01T22:05:00.000Z  
**Production touched:** NO  

---

## Owner daily money control — what works today

### Morning money check (Owner / Accountant)

1. **Dashboard → Money Today** (Phase 2) — overdue, outstanding, deposits, partial payments from real records.
2. **Finance → Receivables** (Phase 3B) — outstanding, aging buckets, debtors table, collection priorities.
3. **Finance → Cashflow** (Phase 3D partial) — cash received vs committed outflows; invoiced revenue linked separately.
4. **Finance → Invoices / Payments** — source records for drill-down.

### What is explicitly separated

| Metric | Meaning | Where |
|--------|---------|-------|
| Invoiced revenue | ACCREC invoice totals | Invoices list |
| Cash received | Payment records | Payments list |
| Outstanding receivables | Unpaid invoice balances | Receivables |
| Payables | Supplier bills | HOLD — PO commitments only |
| Bank balance | Xero bank feed | HOLD — not authorised in UI yet |

Never mix invoiced revenue with cash received on the same card without labelling.

---

## Role access

| Role | Receivables | Payables | Cashflow |
|------|-------------|----------|----------|
| Company Owner | ✓ | ✓ | ✓ |
| Accountant | ✓ | ✓ | ✓ |
| Admin (finance read) | ✓ | ✓ | ✓ |
| Dispatcher | ✗ (nav hidden) | ✗ | ✗ |
| Technician | ✗ | ✗ | ✗ |

---

## Xero as source of truth

- Read-only verification only in Phase 3 — no Xero writes, no manual sync as normal workflow.
- INV-0423 and INV-0424 amounts preserved at header level.
- Customer Value UI refresh from prior consolidation (`44b2b4d` / cache invalidation hook) — bd6da8b not cherry-picked (already equivalent).

---

## Staging evidence

| Artifact | Verdict |
|----------|---------|
| `230-xero-owner-control-parity-verify.json` | **GO** |
| Screenshots `diagnostic-output/phase3-finance-staging/` | Receivables, Payables partial, Cashflow |
| Xero connected + anchor invoices | PASS |

---

## HOLD items (full Phase 3 completion)

| Item | Phase |
|------|-------|
| Xero ACCPAY bills import + payables table | 3C |
| Bank balance in cashflow | 3D |
| Payment mappings / allocation parity | Phase 5 |
| Promise-to-pay workflow | Phase 5 |
| Unallocated payments tracking | Phase 5 |
| Payroll / VAT estimates in cashflow | Phase 12 / tax parity |
| Full contact→customer classification at scale | Ongoing import |

---

## Daily routine (Owner)

1. Open **Dashboard** — action queue for overdue invoices, unassigned jobs, approvals.
2. Open **Receivables** — confirm who owes money and aging.
3. Open **Cashflow** — confirm cash vs invoiced separation and 7/30-day forecast signals.
4. Drill into **Invoices** or **Customers** for follow-up — no fake zeroes when data unavailable.

---

## Security

- RBAC preserved — finance routes require `finance:read` or higher.
- Tenant isolation preserved — all queries scoped to company_id.
- No secrets in verify output or screenshots.
