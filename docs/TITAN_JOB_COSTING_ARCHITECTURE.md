# TITAN JOB-COST-001 — Architecture

**Status:** RECORD ONLY — **not implemented**  
**Parent:** [TITAN_JOB_COSTING_PROFIT_ENGINE_SPECIFICATION.md](./TITAN_JOB_COSTING_PROFIT_ENGINE_SPECIFICATION.md)  
**Recorded (UTC):** 2026-08-06

---

## Design principles

1. **Single source of job-cost truth** — one Job Costing & Profit Engine per tenant; no module-local margin or variance formulas
2. **Immutable estimate baselines** — approved quotes freeze baseline; pricebook changes never rewrite history
3. **Separation of estimate vs actual vs final** — distinct fields, distinct formulas, distinct lifecycle states
4. **State machine integrity** — every cost line progresses through explicit states; no implicit promotion
5. **Tenant isolation** — all queries, caches, events and AURA learning scoped by `company_id`
6. **Human-in-the-loop** — AURA suggests; Owner approves; no silent financial writes
7. **Central calculation** — profit engine delegates pricing assumptions to PRICEBOOK-001; never duplicates markup or overhead rules

---

## Logical components

```
┌─────────────────────────────────────────────────────────────────┐
│              Master Pricebook Service (PRICEBOOK-001)              │
│         estimated pricing · cost assumptions · snapshots           │
└────────────┬────────────────────────────────────────────────────┘
             │ approved quote → baseline snapshot
             ▼
┌─────────────────────────────────────────────────────────────────┐
│           Job Costing & Profit Engine (JOB-COST-001)             │
│  baselines · actuals · states · variance · profit projections    │
└────────────┬────────────────────────────────────────────────────┘
             │
    ┌────────┼────────┬──────────────┬──────────────┐
    ▼        ▼        ▼              ▼              ▼
 Baseline  Actual    State         Variance      Profit
 Store     Capture   Machine       Engine        Calculator
    │        │        │              │              │
    └────────┴────────┴──────────────┴──────────────┘
             │
    ┌────────┼────────┬──────────────┬──────────────┐
    ▼        ▼        ▼              ▼              ▼
 Variation  AURA     Job financial  Reporting    Learning
 Engine     Alerts   Dashboard      API          (AI-EST-LEARN-001)
             │
    ┌────────┴────────┬──────────────┬──────────────┐
    ▼                 ▼              ▼              ▼
 Timesheets      Warehouse      AI-FIN-DOC-001   Xero / Yoco /
 Cartrack        POs            AP/EXP/INV       Bank import
```

---

## Data flow

### Estimate phase (PRICEBOOK-001 → JOB-COST-001)

1. Quote approved in finance module
2. Pricebook snapshot lines copied to immutable `job_cost_baselines`
3. Baseline stores rules, rates, pricebook version and full cost breakdown
4. Financial summary computed once and frozen

### Actual phase (operational sources → JOB-COST-001)

| Source | Captures |
|--------|----------|
| Timesheets / payroll | Labour hours, overtime, skill rates |
| Cartrack / fleet | Travel time, vehicle operating cost |
| Warehouse / inventory | Issue, return, waste |
| AI-FIN-DOC-001 / AP-DOC-001 | Supplier invoices |
| EXP-REC-001 | Receipts, till slips |
| Purchase orders | Committed cost |
| Variations | Scope and budget adjustments |
| Xero | Posted bills, payments, reconciliation state |
| Yoco | Collected cash (display only until reconciled) |
| BANK-IMPORT-001 | Bank evidence (not auto-reconciliation) |

Each capture enters at appropriate state (`Captured`, `Committed`, etc.) and progresses only through explicit approval workflows.

### Reporting phase (JOB-COST-001 → DASH-002)

- Job financial dashboard panels
- Owner dashboard financial truth sections (DASH-001 existing + DASH-002 grid)
- AURA executive recommendations with evidence

---

## Core entities (planned)

| Entity | Purpose |
|--------|---------|
| `job_cost_baselines` | Immutable estimate snapshot per approved quote/job |
| `job_cost_baseline_lines` | Labour, material, site, overhead line items |
| `job_cost_actuals` | Live cost entries with state and source reference |
| `job_cost_state_transitions` | Audit trail for cost state changes |
| `job_cost_variances` | Computed estimate vs actual deltas |
| `job_profit_projections` | Current projected profit/margin snapshots |
| `job_variation_orders` | Controlled variation workflow records |
| `job_financial_summaries` | Denormalised dashboard read model |
| `job_cost_alerts` | AURA-generated risk alerts pending Owner review |
| `job_cost_learning_signals` | AI-EST-LEARN-001 recommendations (pending approval) |

Existing partial implementations (job cards, timesheets, warehouse, finance documents) integrate via adapters — **no duplicate formulas** in those modules.

---

## Cost state machine

```
Estimated → Requested → Committed → Incurred → Captured
    → Review required → Approved → Posted to Xero → Paid → Reconciled

Rejected / Reversed (from most non-terminal states with audit)
```

Rules enforced at service layer:

- State promotion requires authorised actor and evidence
- `Paid` requires payment record; `Reconciled` requires bank/Xero match
- PO creates `Committed` only; invoice/receipt creates `Captured`
- Material issue ≠ material consumed until job allocation approved

---

## Profit calculation service

Central service responsibilities:

- Resolve baseline from approved quote snapshot
- Aggregate actuals by category and state
- Compute gross job contribution and net contribution
- Separate VAT, invoiced revenue, collected cash
- Project current margin vs estimated margin
- Label `final net profit` only when reconciliation gate satisfied

Delegates to PRICEBOOK-001 for: markup rules · overhead allocation models · pricebook version resolution

Never recalculates historical baselines when tenant rules change.

---

## Variation engine

Workflow states persisted with audit:

`Detected` → `Draft` → `Scope review` → `Cost review` → `Customer approval required` → `Approved` → `Added to job budget` → `Invoiced` → `Paid`

On approval: baseline budget extended; margin impact recalculated; unapproved work flagged on job dashboard.

AURA may create draft variations; Owner must approve before budget application.

---

## AURA integration

Read-only analysis over job cost state:

- Threshold comparisons (labour, materials, site, margin, cash)
- Evidence-backed recommendations
- No auto-execute on financial mutations

Alert payload: evidence · financial impact · confidence · job reference · suggested action · Owner decision slot · audit history

---

## RBAC architecture

Role-filtered API and event payloads:

- Cost/margin/overhead fields stripped for Technician and Client roles
- Office Staff see capture/review scopes only
- Company Owner sees full job financial truth
- Platform Owner cross-tenant visibility with audit

---

## Events and API

REST/GraphQL (TBD at implementation): tenant-scoped, job-scoped cost queries, paginated actuals, dashboard summaries.

Events carry role-filtered payloads — internal costs/margins stripped for unauthorised subscribers.

Planned events: `job.cost.baseline.created` · `job.cost.actual.captured` · `job.cost.variance.detected` · `job.cost.margin.warning` · `job.variation.draft.created` · `job.variation.approved` · `job.profit.projection.updated` · `job.cost.learning.suggested`

---

## Cross-module integration map

| Module | Integration |
|--------|-------------|
| PRICEBOOK-001 / 001E | Estimate baseline from pricebook snapshots |
| AI-FIN-DOC-001 | Approved financial documents → actual cost capture |
| AP-DOC-001 | Supplier bills |
| EXP-REC-001 | Receipts and expenses |
| INV-PRICE-001 | Supplier cost history (feeds material actuals) |
| BANK-IMPORT-001 | Bank evidence for reconciliation |
| Xero | Posted/paid/reconciled states |
| Yoco | Collected cash display |
| Warehouse | Material issue/return/waste |
| Purchase Orders | Committed cost |
| Timesheets / Payroll | Labour actuals |
| Cartrack / Fleet | Travel and vehicle |
| DASH-002 | Job and Owner dashboard panels |
| AI-EST-LEARN-001 | Post-completion variance learning |

---

## Phased delivery map

| Phase | Architecture deliverable |
|-------|-------------------------|
| JOB-COST-001A | Schema, baseline model, state machine, RBAC, API skeleton |
| JOB-COST-001B | Capture adapters (labour, material, PO, site) |
| JOB-COST-001C | Variance engine and profit projection service |
| JOB-COST-001D | Variation-order workflow and margin protection |
| JOB-COST-001E | AURA alert pipeline and recommendation store |
| JOB-COST-001F | Job financial dashboard read model and reporting |
| JOB-COST-001G | AI-EST-LEARN-001 learning loop integration |

**Prerequisite:** PRICEBOOK-001A minimum (data model + versioning + price engine + snapshots)

---

## Explicit non-goals (this record)

- No implementation during XERO-002
- No modification to existing quotes, invoices, jobs, pricing, supplier or financial records
- No production access
- No duplicate costing formulas outside Job Costing & Profit Engine path
- No automatic AURA approval or financial execution

---

*Architecture record only. No schema migrations or application code created.*
