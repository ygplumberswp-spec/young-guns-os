# TITAN FNB-CASH-001 — FNB Bank Feed & Cash Intelligence Specification

**Status:** RECORD ONLY — **not implemented**  
**Recorded (UTC):** 2026-08-06  
**Initial tenant:** Young Guns Plumbing (FNB business account)  
**Active blocker:** XERO-002 Gate sequence remains active — **Phase 1 audit only until Xero proof closes**  
**Accounting truth:** **Xero remains the system of record.** TITAN uses approved bank-feed data and Xero data for reconciliation, cash-flow visibility and AURA financial intelligence.

---

## Purpose

Connect TITAN securely to Young Guns Plumbing's **FNB business account data** without controlling, scraping or automating the FNB mobile app.

TITAN provides: bank transaction visibility · payment matching suggestions · expense classification · job-cost allocation · cash dashboard · AURA cash intelligence · Xero reconciliation alignment.

---

## Cross-links

| ID | Document / area |
|----|-----------------|
| [TITAN_FNB_BANK_FEED_ARCHITECTURE.md](./TITAN_FNB_BANK_FEED_ARCHITECTURE.md) | Technical architecture |
| **BANK-IMPORT-001** | [TITAN_BANK_STATEMENT_IMPORT_ARCHITECTURE.md](./TITAN_BANK_STATEMENT_IMPORT_ARCHITECTURE.md) — manual CSV fallback |
| **INT-010** | Open banking / bank feed integration (checklist) |
| **XERO-002 / XERO-003** | Xero bank feeds, reconciliation model |
| **AI-FIN-DOC-001** | Supplier invoices, receipts, expenses |
| **JOB-COST-001** | Job-level cost and profit truth |
| **OCC-001** | Owner cash dashboard and AURA intelligence |
| **FNB-CASH-001** | This specification |
| [TITAN_ROADMAP.md](./TITAN_ROADMAP.md) | Locked platform sequence |

---

## 1. Secure integration

### Allowed methods only

- Official FNB business banking APIs where available
- Approved open-banking or bank-feed providers
- Existing **Xero bank feeds** (preferred first path — audit Phase 1)
- **Read-only access by default**

### Never permitted

- Store online-banking passwords
- Request OTPs inside TITAN
- Screen-scrape the FNB app
- Automate mobile-app clicks
- Initiate payments without a separate approved future security design

### Security requirements

- Owner-only access to bank balances and full transactions
- Strict tenant isolation
- Encryption in transit and at rest
- OAuth or provider-issued tokens only
- Token rotation and revocation
- Complete audit logging
- No sensitive banking credentials in logs
- Read-only initial release
- **Production connection forbidden** until staging verification and explicit Owner approval of provider and security plan

---

## 2. Bank transaction feed

Import and store (tenant-scoped):

| Field | Required |
|-------|----------|
| Transaction date | Yes |
| Description | Yes |
| Reference | Yes |
| Amount | Yes |
| Money in / money out | Yes |
| Bank account | Yes |
| Running balance | Where available |
| Provider transaction ID | Yes |
| Reconciliation status | Yes |

**Duplicate prevention:** provider transaction IDs + deterministic idempotency fingerprints (extends BANK-IMPORT-001 pattern).

**Source labelling:** every row shows origin — Xero feed · open-banking provider · manual import.

---

## 3. Payment matching

Automatically **suggest** matches between incoming payments and:

- Xero invoices · TITAN invoices · customer accounts · job numbers · claim references · quote deposits

### Match signals

Amount · payment reference · customer name · invoice number · date · outstanding balance

### Rules

- AURA may suggest a match
- Uncertain matches require **staff approval**
- No automatic reconciliation posting
- All suggestions and overrides logged in audit trail

---

## 4. Expense classification

Suggest categories for outgoing transactions:

Materials · Suppliers · Fuel · Vehicles · Wages · Subcontractors · Tools · Software · Marketing · Insurance · Bank charges · VAT · Owner drawings · Other overheads

**Do not post or alter accounting classifications automatically without approval.**

---

## 5. Job costing link

Bank transactions and supplier payments may be linked to:

- Specific job · supplier · purchase order · vehicle · technician · branch · expense category

Approved links feed **JOB-COST-001** final profit calculation. Unlinked transactions flagged for review.

---

## 6. Cash dashboard (Owner only)

| Metric | Notes |
|--------|-------|
| Current bank balance | Reconciled vs feed-only labelled |
| Unreconciled transactions | Count + total |
| Cash received today | Inflows |
| Cash paid today | Outflows |
| Outstanding customer invoices | AR |
| Supplier bills due | AP |
| Payroll due | Committed |
| VAT estimate | Labelled estimate |
| Available cash after commitments | Derived |
| 7-day cash forecast | Projection |
| 30-day cash forecast | Projection |

### Separate clearly

- Bank balance
- Available operational cash
- Expected incoming cash
- Committed outgoing cash

Integrates with **OCC-001** Owner Command Center — no duplicate cash formulas.

---

## 7. AURA cash intelligence

AURA identifies (with evidence):

- Unpaid invoices · unknown deposits · duplicate payments · unexpected expenses
- Supplier price increases · high fuel spending · cash shortages · upcoming payment pressure
- Jobs completed but not invoiced · invoices paid but not reconciled

### Example

> FNB shows R184,000, but only R71,500 is safely available after payroll, VAT, supplier bills and scheduled commitments.

Every alert: evidence · financial impact · confidence · suggested action · Owner decision · audit history.

AURA may **not** automatically reconcile, reclassify, or initiate payments.

---

## 8. Xero reconciliation

TITAN must:

- Respect Xero as the accounting ledger
- Sync reconciliation status from Xero where available
- Avoid duplicating bank transactions already in Xero
- Show source and sync status on every row
- Record all matching and override actions in audit log
- Surface discrepancies between TITAN, Xero and bank feed honestly

**Yoco paid ≠ Xero reconciled ≠ bank matched** — preserve existing reconciliation truth model from XERO-002.

---

## 9. Access control

| Role | Access |
|------|--------|
| Platform Owner | Full platform visibility (audit) |
| Company Owner | Full bank balances, transactions, matching, forecasts |
| Authorised finance admin | Permission-controlled subset |
| Office Staff | Capture/review only where granted — no full balance by default |
| Technician | None |
| Client | None |

---

## 10. Phased implementation

| Phase | ID | Scope | Code |
|-------|-----|-------|------|
| 1 | **FNB-CASH-001A** | Audit current Xero bank-feed and finance architecture; identify whether FNB data already arrives through Xero; produce gap report | **No code changes** |
| 2 | **FNB-CASH-001B** | Select safest supported integration route; read-only staging connection; import and deduplicate transactions; verify reconciliation against Xero | Staging only |
| 3 | **FNB-CASH-001C** | Payment matching, expense suggestions, job-cost allocation | After 001B verified |
| 4 | **FNB-CASH-001D** | Cash forecasting and AURA financial intelligence | After 001C + JOB-COST-001/OCC-001 foundations |

### Stop gate after each phase

Owner receives: files changed · database migrations · security controls · test results · reconciliation evidence · remaining risks.

**Do not connect production or request live banking credentials** until Owner explicitly approves the selected provider and security plan.

---

## 11. Phase 1 audit deliverables (FNB-CASH-001A)

1. Map current Xero bank account sync (`bank_transactions` import scope)
2. Confirm whether Young Guns FNB account is visible via Xero feed today
3. Assess BANK-IMPORT-001 manual fallback coverage
4. Evaluate open-banking provider options (FNB API, aggregator) — read-only feasibility
5. Gap report: what exists vs what FNB-CASH-001 requires
6. Recommended integration route with security assessment
7. **No code, no credentials, no production access**

---

## 12. Implementation gate

| Gate | Rule |
|------|------|
| During XERO-002 | Phase 1 audit only — no bank connection code |
| Staging first | All connection work on `cpkuwtaipjxeipvbssvn` only |
| Production | `rshuiaghmtrvvilhqpwm` forbidden until Owner GO |
| Live credentials | Forbidden until Owner approves provider + security plan |

---

*Record-only specification. No code, schema, credentials, or production data was modified when this document was created.*
