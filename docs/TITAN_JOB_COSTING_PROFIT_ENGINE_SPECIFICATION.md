# TITAN JOB-COST-001 — Intelligent Job Costing & Profit Engine Specification

**Status:** RECORD ONLY — **not implemented**  
**Recorded (UTC):** 2026-08-06  
**Active blocker:** XERO-002 Gate sequence remains active — **do not implement JOB-COST-001 during Xero proof**  
**Placement:** Next major core-platform implementation **after PRICEBOOK-001** and **before DASH-002**

---

## Purpose

Create one **Intelligent Job Costing & Profit Engine** as TITAN’s single source of truth for:

- job-level actual cost, variance and profitability truth
- immutable estimate baselines from approved quotes
- live cost capture, state progression and reconciliation
- variation-order margin protection
- AURA risk detection and Owner recommendations
- job financial dashboards and reporting

**No duplicate costing formulas are allowed** in quotes, jobs, invoices, dashboards, reports, AURA, construction estimating or maintenance agreements. All calculations must use centrally versioned pricing and costing services.

---

## Architectural relationship

| System | Role |
|--------|------|
| **PRICEBOOK-001** | Source of estimated pricing and cost assumptions |
| **JOB-COST-001** | Source of job-level actual cost, variance and profitability truth |
| **AI-FIN-DOC-001** | Supplies approved supplier invoices, receipts, till slips and expenses into actual job costing |
| **DASH-001 / DASH-002** | Display resulting financial health and alerts |

There must not be separate or duplicate costing formulas across platform modules. All calculations use centrally versioned pricing and costing services.

---

## Cross-links

| ID | Document / area |
|----|-----------------|
| [TITAN_JOB_COSTING_ARCHITECTURE.md](./TITAN_JOB_COSTING_ARCHITECTURE.md) | Technical architecture |
| [TITAN_MASTER_PRICEBOOK_SPECIFICATION.md](./TITAN_MASTER_PRICEBOOK_SPECIFICATION.md) | PRICEBOOK-001 — estimate baseline source |
| [TITAN_PRICEBOOK_ARCHITECTURE.md](./TITAN_PRICEBOOK_ARCHITECTURE.md) | PRICEBOOK-001E document integration |
| PRICEBOOK-001E | Quote, invoice, job-card, purchasing, job-cost integration |
| AI-EST-001 | AI Floor Plan Estimator |
| AI-EST-LEARN-001 | Estimate vs actual learning |
| AI-FIN-DOC-001 | AI Financial Capture Engine |
| AP-DOC-001 | Supplier Invoice Import |
| EXP-REC-001 | Receipt and Till-Slip Capture |
| INV-PRICE-001 | Supplier Price List Import |
| BANK-IMPORT-001 | Manual bank statement import |
| XERO integration | Posted bills, payments, reconciliation |
| Yoco integration | Collected cash (separate from reconciliation) |
| Warehouse and Inventory | Material issue, return, waste |
| Purchase Orders | Committed cost (not incurred until evidence) |
| Payroll and Timesheets | Labour actuals |
| Fleet and Cartrack | Travel time and vehicle costs |
| DASH-002 | Customisable no-gap Dashboard grid |
| UI-THEME-001 | App-wide visual finishing |
| [TITAN_GAP_CLOSURE_PLAN.md](./TITAN_GAP_CLOSURE_PLAN.md) | Sequencing |
| [TITAN_ROADMAP.md](./TITAN_ROADMAP.md) | Locked platform sequence |

---

## 1. Estimate baseline

Every approved quote must create an **immutable job-cost baseline** containing:

### Labour

- estimated labour hours
- number of technicians
- labour skill levels
- hourly internal labour cost
- overtime assumptions
- travel time
- travel labour cost
- supervision time
- subcontractor labour
- total estimated labour cost

### Materials

- internal material item
- supplier item mapping
- supplier cost
- quantity
- unit
- waste allowance
- delivery cost
- handling cost
- material markup
- selling price
- preferred supplier
- alternate supplier
- pricebook version

### Site costs

- fuel
- vehicle operating cost
- equipment hire
- tools and consumables
- PPE
- accommodation
- toll fees
- parking
- permits
- waste removal
- subcontractors
- specialist testing
- compliance and COC costs

### Overhead recovery

- office allocation
- insurance allocation
- software allocation
- vehicle depreciation
- marketing allocation
- administration
- management time
- warehouse cost
- general overhead recovery

Store the exact rules, rates and pricebook versions used when the quote was approved. Later pricebook changes must **never** alter the historical baseline.

---

## 2. Financial summary

Calculate and retain:

- estimated material cost
- estimated labour cost
- estimated site cost
- estimated subcontractor cost
- estimated overhead recovery
- estimated total cost
- quoted selling price excluding VAT
- VAT
- quoted total including VAT
- estimated gross profit
- estimated gross margin percentage
- estimated net contribution
- estimated net margin percentage
- break-even amount
- minimum acceptable selling price
- target selling price
- cash required before work begins

### Separate concepts (never conflate)

| Concept | Meaning |
|---------|---------|
| gross profit | Revenue minus direct costs |
| gross margin | Gross profit as percentage of revenue |
| estimated net contribution | After allocated overhead — **estimate phase** |
| final net profit | After job complete and reconciled — **completion phase only** |
| invoiced revenue | Recognised billing |
| collected cash | Cash received (Yoco, bank, etc.) |
| outstanding debt | Customer balance due |
| committed cost | PO / approved commitment not yet incurred |
| incurred cost | Work performed or goods consumed |
| approved cost | Human-approved financial evidence |
| paid cost | Payment made |
| reconciled cost | Matched to bank / Xero reconciliation |

**Do not label estimated net contribution as final net profit.**

---

## 3. Live job costing

As work progresses, capture approved actuals from:

- technician timesheets
- arrival and departure times
- Cartrack travel time
- overtime
- materials issued from warehouse
- materials returned
- materials wasted
- supplier invoices
- till slips and receipts
- purchase orders
- fuel costs
- vehicle costs
- equipment hire
- subcontractor bills
- approved expenses
- variations
- credits and returns

Continuously compare:

- estimated labour versus actual labour
- estimated materials versus actual materials
- estimated site costs versus actual site costs
- estimated duration versus actual duration
- estimated revenue versus approved revenue
- estimated profit versus current projected profit
- estimated margin versus current projected margin
- approved variations versus unapproved variations

---

## 4. Cost states

Every cost must have a clear state:

`Estimated` · `Requested` · `Committed` · `Incurred` · `Captured` · `Review required` · `Approved` · `Posted to Xero` · `Paid` · `Reconciled` · `Rejected` · `Reversed`

### Rules

- uploaded receipt does **not** mean approved
- approved bill does **not** mean paid
- paid does **not** mean reconciled
- purchase order does **not** mean expense incurred
- material issued does **not** always mean material consumed
- manual bank statement import does **not** mean reconciliation
- Yoco payment does **not** mean Xero reconciliation

Final profit may be labelled complete only when required financial evidence is approved and sufficiently reconciled.

---

## 5. Variations

Controlled variation-order workflow:

`Detected` → `Draft variation` → `Scope review` → `Cost review` → `Customer approval required` → `Approved` → `Added to job budget` → `Invoiced` → `Paid`

Variation orders must contain:

- reason
- additional scope
- excluded original scope
- labour impact
- material impact
- site-cost impact
- programme impact
- selling price
- VAT
- profit impact
- margin impact
- evidence and photos
- customer approval
- Owner approval

Unapproved variation work must be clearly flagged.

AURA may draft a variation but may **not** send, approve or apply it automatically.

---

## 6. AURA intelligence

AURA should alert the Owner when:

- labour exceeds estimate
- materials exceed budget
- site costs exceed budget
- overtime was not included
- waste exceeds allowance
- purchase cost exceeds quoted cost
- margin drops below target
- break-even risk is approaching
- a variation is required
- work is continuing without variation approval
- cash collected is below committed cost
- the project is becoming unprofitable
- cost information is incomplete or stale

Example alert:

> Estimated margin: 34%  
> Current projected margin: 22%  
> Reasons: Labour exceeded estimate by 8 hours; Materials exceeded budget by R4,850; One variation awaiting approval  
> Suggested action: Prepare a variation order before continuing additional work.

Each recommendation must include: evidence · financial impact · confidence · affected job · suggested action · Owner decision · audit history

### AURA must never automatically

- change prices
- change budgets
- approve expenses
- approve variations
- invoice customers
- stop technicians
- record payments
- reconcile transactions

Preserve **Draft → Review → Approve → Execute**.

---

## 7. Job financial dashboard

Every job must display:

- quoted revenue
- approved variation revenue
- invoiced revenue
- collected cash
- outstanding customer balance
- estimated cost
- committed cost
- incurred cost
- approved cost
- paid cost
- estimated gross profit
- current projected profit
- final profit when complete
- estimated margin
- current projected margin
- cash-flow position
- outstanding purchases
- outstanding supplier bills
- outstanding variations
- completion percentage
- labour hours used versus budget
- materials used versus budget
- site costs used versus budget
- days elapsed versus programme
- unresolved financial evidence

### Calm status levels

- On budget
- Monitor
- Attention required
- Margin at risk
- Loss projected
- Financial data incomplete

Do not show technical provider errors on normal job dashboards.

---

## 8. Profit calculation

Central calculation model:

```
Revenue excluding VAT
  minus direct material cost
  minus direct labour cost
  minus site cost
  minus subcontractor cost
= gross job contribution

Gross job contribution
  minus allocated overhead
= estimated or final net contribution
```

- VAT must **not** be counted as business revenue or profit
- Collected cash must be shown separately from recognised revenue

Support: fixed-price work · time-and-material work · construction point pricing · milestone billing · progress billing · deposits · retention · variations · credits · refunds · partial payments · write-offs

---

## 9. Multi-tenant and SaaS

Support tenant-specific: labour cost rates · technician skill rates · overtime rules · overhead allocation models · vehicle rates · regional costs · branch costs · supplier costs · target margin · minimum margin · warning thresholds · currency · tax · compliance requirements

One tenant must never see another tenant’s: costs · margins · overhead rules · staff rates · supplier agreements · profit data · job financials · AURA learning data

---

## 10. Access control

| Role | Access |
|------|--------|
| Platform Owner | Full platform visibility |
| Company Owner | Full company job-cost and profit visibility; threshold and approval control |
| Admin | Permission-controlled job-cost access |
| Office Staff | Capture and review permitted costs; no unrestricted margin or overhead-rule changes |
| Technician | Capture time, materials and permitted expenses; see assigned budget quantities where authorised; no company-wide costs, margins or profit |
| Client | Approved customer-facing price, variations and payment status only; never internal costs, markup or margin |

---

## 11. AI learning (AI-EST-LEARN-001)

After job completion compare:

- estimate versus actual labour
- estimate versus actual materials
- estimate versus actual site costs
- estimate versus actual overhead recovery
- estimate versus actual duration
- estimate versus actual profit
- estimate versus actual margin

AURA may recommend pricebook or assembly improvements. AURA must **never** apply changes automatically.

Recommendations require: sufficient completed-job sample · complete approved data · confidence · financial effect · affected item or assembly · Owner approval · new version

---

## 12. Phased implementation

| Phase | ID | Scope |
|-------|-----|-------|
| A | JOB-COST-001A | Core job-cost model, immutable estimate baseline and financial states |
| B | JOB-COST-001B | Labour, material, purchase and site-cost capture |
| C | JOB-COST-001C | Live variance calculation and profitability projections |
| D | JOB-COST-001D | Variation-order engine and margin protection |
| E | JOB-COST-001E | AURA risk detection, alerts and recommendations |
| F | JOB-COST-001F | Job financial dashboard and reporting |
| G | JOB-COST-001G | Estimate-versus-actual learning integration (AI-EST-LEARN-001) |

**Do not implement any phase during active Xero proof.**

---

## 13. Implementation gate

| Gate | Rule |
|------|------|
| During XERO-002 | **Forbidden** — no job-costing code, no quote/invoice/job/pricing/supplier/financial record changes |
| After PRICEBOOK-001 foundation | Owner sequences JOB-COST-001A after PRICEBOOK-001A minimum (estimate baseline requires pricebook snapshots) |
| Before DASH-002 | Job costing foundation sequenced ahead of dashboard grid financial drill-downs |
| Production | `rshuiaghmtrvvilhqpwm` forbidden until explicit Owner production GO |

---

*Record-only specification. No code, schema, pricing, or financial data was modified when this document was created.*
