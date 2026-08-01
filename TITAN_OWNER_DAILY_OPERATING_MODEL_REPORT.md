# TITAN Owner Daily Operating Model Report

**Phase:** 3 — Finance, Xero parity and daily money control (full)  
**Branch:** `cursor/titan-owner-operating-model-final`  
**Generated (UTC):** 2026-08-01T22:30:00.000Z  
**Production touched:** NO  

---

## Owner daily money control — what works today

### Morning money check (Owner / Accountant)

1. **Dashboard → Money Today** (Phase 2) — overdue, outstanding, deposits, partial payments from real records.
2. **Finance → Receivables** (Phase 3B) — outstanding, aging buckets, debtors table, collection priorities.
3. **Finance → Cashflow** (Phase 3D) — invoiced revenue vs cash received on separate cards; 7/30-day forecasts; net cash movement.
4. **Finance → Bills & Payables** (Phase 3C) — honest HOLD for ACCPAY; PO commitments and bank tx sync count where available.
5. **Finance → Invoices / Payments** — source records for drill-down.

### What is explicitly separated

| Metric | Meaning | Where |
|--------|---------|-------|
| Invoiced revenue | ACCREC invoice totals (MTD) | Cashflow card + Invoices list |
| Cash received | Payment records (MTD) | Cashflow card + Payments list |
| Outstanding receivables | Unpaid invoice balances | Receivables + Cashflow |
| Payables | Supplier bills (ACCPAY) | **HOLD** — PO commitments only |
| Bank balance | Xero bank feed | **HOLD** — not authorised in UI |
| Bank transactions | Sync log mirror count | Payables + Cashflow notes |

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
- Bank transactions: 3078+ sync logs on staging (read-only mirror, not reconciled UI).
- ACCPAY bills: not imported — Owner approval required before import route.

---

## Staging evidence

| Artifact | Verdict |
|----------|---------|
| `230-xero-owner-control-parity-verify.json` | **GO** |
| Screenshots `diagnostic-output/phase3-finance-staging/` | Receivables, Payables, Cashflow |
| Xero connected + anchor invoices | PASS |
| Payables API `/finance-intelligence/payables` | PASS |

---

## HOLD items (Owner approval required)

| Item | Phase | Blocker |
|------|-------|---------|
| Xero ACCPAY bills import + payables table | 3C | Migration + import route (`supplier_bill` stub) |
| Bank balance in cashflow | 3D | Bank account balance not in sync log model |
| Payment mappings / allocation parity | Phase 5 | 0 payment_mappings on staging |
| Promise-to-pay workflow | Phase 5 | Not implemented |
| Unallocated payments tracking | Phase 5 | Not implemented |
| Payroll / VAT estimates in cashflow | Phase 12 / tax | Not wired |
| Full contact→customer classification at scale | Ongoing | 678 customers vs 4858 sync logs |

---

## Daily routine (Owner)

1. Open **Dashboard** — action queue for overdue invoices, unassigned jobs, approvals.
2. Open **Receivables** — confirm who owes money and aging.
3. Open **Cashflow** — compare invoiced revenue (MTD) vs cash received (MTD); review 7/30-day forecast.
4. Open **Payables** — review PO commitments; note ACCPAY HOLD until import approved.
5. Drill into **Invoices** or **Customers** for follow-up — no fake zeroes when data unavailable.

---

## Security

- RBAC preserved — finance routes require `finance:read` or higher.
- Tenant isolation preserved — all queries scoped to company_id.
- No secrets in verify output or screenshots.
