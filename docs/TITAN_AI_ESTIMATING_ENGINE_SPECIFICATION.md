# TITAN AI Estimating Engine Specification

**Status:** RECORD ONLY — **not implemented**  
**Parent:** [TITAN_MASTER_PRICEBOOK_SPECIFICATION.md](./TITAN_MASTER_PRICEBOOK_SPECIFICATION.md)  
**Recorded (UTC):** 2026-08-06

---

## Scope

This document registers:

| ID | Name |
|----|------|
| **AI-EST-001** | AI Floor Plan Estimator |
| **AI-EST-LEARN-001** | Estimate Accuracy Learning |

Both depend on **PRICEBOOK-001** as the pricing and assembly authority. No estimating feature may invent prices outside the Master Pricebook.

---

## AI-EST-001 — AI Floor Plan Estimator

### Supported uploads

- PDF floor plans
- Plumbing drawings
- Architectural drawings
- Scanned plans (where quality permits)
- Plan revisions (with diff support)

### AURA-assisted capabilities

| Capability | Output |
|------------|--------|
| Page classification | Drawing type per page |
| Scale detection | Metres/pixels ratio with confidence |
| Fixture detection | Count + type + location |
| Plumbing-symbol detection | Symbol class + confidence |
| Point counting | Hot/cold/waste/vent points |
| Pipe-length estimation | Routed length with assumptions |
| Floor-level separation | Multi-storey takeoff |
| Plan-revision comparison | Added/removed/changed fixtures |
| Takeoff creation | Structured takeoff rows |
| BOQ creation | Bill of quantities from takeoff |
| Assembly matching | Pricebook assembly linkage |
| Labour/material estimation | From assembly defaults |
| Profit calculation | Via central price engine |
| Quote generation | Draft only — approval required |

### AI result presentation (mandatory fields)

- detected item
- quantity
- page reference
- approximate location
- confidence score
- evidence region (bounding area on plan)
- matched pricebook assembly
- assumptions
- exclusions
- unresolved items (explicit queue)

### User controls (always available)

Add/remove points · change quantities · correct fixture type · change assembly · change labour · change material allowances · override pricing · add exclusions · add notes · approve final BOQ · approve final quote

**AI may never finalise or send a quote without Owner approval.**

### Human review workflow states

```
Uploaded
  → Analysing
  → Detection complete
  → Review required
  → Quantity review
  → Assembly review
  → Pricing review
  → Owner approved
  → Quote draft created
  → Quote approved
  → Quote sent
```

Governance: AI recommendations never bypass **Draft → Review → Approve → Execute**

### Override audit (every manual correction)

| Field | Stored |
|-------|--------|
| previous value | ✓ |
| new value | ✓ |
| user | ✓ |
| timestamp | ✓ |
| reason | ✓ |
| affected profit | ✓ |
| affected material quantity | ✓ |
| affected labour hours | ✓ |

### Phased delivery

| Phase | Deliverable |
|-------|-------------|
| AI-EST-001A | Plan upload, secure storage, review workspace |
| AI-EST-001B | Fixture and plumbing-point detection |
| AI-EST-001C | Takeoff, BOQ, pricebook matching |
| AI-EST-001D | Professional quote generation with Owner approval gate |

---

## AI-EST-LEARN-001 — Estimate Accuracy Learning

### Purpose

After project completion, compare estimated vs actual performance to generate **suggestions** — never automatic pricebook mutations.

### Comparison dimensions

| Dimension | Estimated source | Actual source |
|-----------|------------------|---------------|
| Labour | BOQ/assembly hours | Timesheets |
| Material quantity | Takeoff/assembly | Materials issued |
| Supplier cost | Pricebook cost | Supplier invoices |
| Waste | Assembly waste factor | Actual usage variance |
| Travel | Rule allocation | Vehicle/job logs |
| Gross profit | Quote snapshot | Job costing |
| Duration | Schedule estimate | Job completion dates |
| Subcontractor | Estimate line | Subcontractor bills |

### AURA may suggest (not apply)

- labour-time adjustment
- quantity adjustment
- waste-factor adjustment
- supplier change
- material substitution
- markup adjustment
- assembly change
- regional price adjustment
- point-price correction

Each suggestion must include:

- evidence (job IDs, variance stats)
- sample size
- confidence
- financial impact projection
- affected assemblies list
- affected branches
- **Owner approval requirement**
- target new pricebook version on apply

### Excluded learning sources

Do **not** learn from:

- incomplete jobs
- disputed jobs
- cancelled jobs
- missing timesheets
- unapproved expenses
- unreconciled material usage
- obvious data errors

### Suggestion workflow

```
Variance detected
  → Learning signal queued
  → Evidence review
  → Owner review
  → Approved → new pricebook version draft
  → Rejected → archived with reason
```

---

## Integration with Master Pricebook

| Integration point | Behaviour |
|-------------------|-----------|
| Assembly lookup | AI matches detections to `pricebook_assemblies` / `pricebook_points` |
| Price calculation | All totals via central Price Engine + active version |
| Snapshots | Approved quotes store immutable snapshots per PRICEBOOK-001 §2 |
| Supplier costs | INV-PRICE-001 feeds cost history; AI uses cost for margin preview only |
| Job costing | AI-EST-LEARN-001 reads job costing actuals — never writes without approval |

---

## Security and tenancy

- All plans, takeoffs, detections and learning signals scoped by `company_id`
- AI model inputs/outputs never shared cross-tenant
- Client-visible outputs: customer descriptions and selling prices only
- Cost/margin/evidence regions restricted by RBAC

---

## Cross-links

| ID | Link |
|----|------|
| PRICEBOOK-001 | [TITAN_MASTER_PRICEBOOK_SPECIFICATION.md](./TITAN_MASTER_PRICEBOOK_SPECIFICATION.md) |
| Architecture | [TITAN_PRICEBOOK_ARCHITECTURE.md](./TITAN_PRICEBOOK_ARCHITECTURE.md) |
| INV-PRICE-001 | Supplier price import — [TITAN_GAP_CLOSURE_PLAN.md](./TITAN_GAP_CLOSURE_PLAN.md) |
| AI-FIN-DOC-001 | Financial document capture parent |
| DASH-002 | Future dashboard integration for estimate pipeline status |

---

## Implementation gate

| Rule | Detail |
|------|--------|
| Active XERO-002 | **No AI-EST implementation** |
| Prerequisite | PRICEBOOK-001A minimum (data model + versioning + price engine) |
| Quote send | Always requires Owner approval — no autonomous customer send |

---

*Record-only specification. No AI pipelines, models, or storage were created.*
