# TITAN PRICEBOOK-001 — Architecture

**Status:** RECORD ONLY — **not implemented**  
**Parent:** [TITAN_MASTER_PRICEBOOK_SPECIFICATION.md](./TITAN_MASTER_PRICEBOOK_SPECIFICATION.md)  
**Recorded (UTC):** 2026-08-06

---

## Design principles

1. **Single source of pricing truth** — one Master Pricebook per tenant; no module-local selling prices
2. **Immutable document snapshots** — operational documents store frozen price snapshots; rule changes never rewrite history
3. **Separation of cost vs sell vs margin** — distinct fields, distinct formulas, distinct RBAC
4. **Version everything** — approved changes create new versions; drafts cannot leak into production documents
5. **Tenant isolation** — all queries, caches, events and AI learning scoped by `company_id`
6. **Human-in-the-loop** — AI suggests; Owner approves; no silent financial writes

---

## Logical components

```
┌─────────────────────────────────────────────────────────────────┐
│                     Master Pricebook Service                     │
│  items · assemblies · points · rules · versions · snapshots      │
└────────────┬────────────────────────────────────────────────────┘
             │
    ┌────────┼────────┬──────────────┬──────────────┐
    ▼        ▼        ▼              ▼              ▼
 Price     Version   Snapshot      Search         Import/
 Engine    Control   Store         Index          Export
    │        │        │              │              │
    └────────┴────────┴──────────────┴──────────────┘
             │
    ┌────────┼────────┬──────────────┬──────────────┐
    ▼        ▼        ▼              ▼              ▼
 Quotes   Invoices  Job cards    POs/BOQs    Job costing (JOB-COST-001)
    │        │        │              │              │
    └────────┴────────┴──────────────┴──────────────┘
             │
    ┌────────┴────────┐
    ▼                 ▼
 AI-EST-001      AI-EST-LEARN-001 / JOB-COST-001G
 (takeoff/BOQ)   (variance learning)
             │
    ┌────────┴────────┐
    ▼                 ▼
 INV-PRICE-001    Supplier cost history
 (price import)
```

---

## Core entities (planned)

| Entity | Purpose |
|--------|---------|
| `pricebook_items` | Atomic catalogue row with full attribute model |
| `pricebook_assemblies` | Nested BOM with formula quantities |
| `pricebook_points` | Construction plumbing-point templates |
| `pricebook_versions` | Approved version metadata |
| `pricebook_item_versions` | Point-in-time item state per version |
| `pricebook_rules` | Markup, surcharge, minimum charge, regional rules |
| `pricebook_snapshots` | Immutable line snapshots on documents |
| `supplier_item_mappings` | Supplier SKU → TITAN item (separate from sell price) |
| `supplier_cost_history` | Effective-dated cost rows with audit |
| `pricebook_import_batches` | Validated import staging |
| `estimate_takeoffs` | AI-EST-001 detection and review workspace |
| `estimate_learning_signals` | AI-EST-LEARN-001 suggestions (pending approval) |

Existing partial: tenant pricebook table (**FIN-014 / YGP-001**) — to be extended, not duplicated.

---

## Price calculation engine

Central service responsibilities:

- Resolve active version for tenant/branch/date
- Apply markup rules, surcharges, minimums, VAT
- Compute gross profit, margin, estimated net contribution
- Produce **preview** vs **commit** modes
- Emit margin warnings without blocking unless configured

**Formula versioning:** rules stored with version ID; documents store `pricebook_version` + `markup_rule_id` in snapshot.

---

## Snapshot model

When a line is added to quote/invoice/job card/PO/BOQ:

```typescript
// Conceptual — not implemented
PriceSnapshot {
  itemCode, description, quantity, unit,
  costBasis, labourBasis, markupRuleId,
  sellingPrice, vatRate, lineTotal,
  pricebookVersion, overrideApprovalId?
}
```

Historical documents query snapshots only — never live pricebook rows.

---

## INV-PRICE-001 integration

Supplier import pipeline:

1. Upload → validate schema
2. Map columns → match supplier SKUs
3. Stage cost changes (never touch selling price)
4. Preview assembly/margin impact
5. Owner approval → append `supplier_cost_history`
6. Optional separate workflow for selling-price adjustment (explicit)

Cross-link: [TITAN_GAP_CLOSURE_PLAN.md](./TITAN_GAP_CLOSURE_PLAN.md) — AI-FIN-DOC-001 / INV-PRICE-001

---

## AI estimating integration

| Component | Role |
|-----------|------|
| AI-EST-001A | Plan storage, page classification, review UI |
| AI-EST-001B | Fixture/point detection with confidence + evidence regions |
| AI-EST-001C | Takeoff → BOQ → assembly matching |
| AI-EST-001D | Quote draft from approved BOQ |
| AI-EST-LEARN-001 | Post-job variance → suggestion queue (Owner approval) |

All AI outputs are **recommendations** until human/Owner approval transitions state.

See [TITAN_AI_ESTIMATING_ENGINE_SPECIFICATION.md](./TITAN_AI_ESTIMATING_ENGINE_SPECIFICATION.md).

---

## RBAC and data visibility

| Data class | Owner | Admin | Office | Technician | Client |
|------------|-------|-------|--------|------------|--------|
| Supplier cost | ✓ | configurable | ✗ | ✗ | ✗ |
| Selling price | ✓ | ✓ | ✓ (use) | scope only | ✓ (line) |
| Margin/profit | ✓ | configurable | ✗ | ✗ | ✗ |
| Internal description | ✓ | ✓ | ✓ | ✓ | ✗ |
| Snapshot on document | ✓ | ✓ | ✓ | read scope | customer fields |

---

## Events and API

REST/GraphQL (TBD at implementation): tenant-scoped, paginated search, lazy assembly expansion.

Events carry role-filtered payloads — cost/margin fields stripped for unauthorised subscribers.

Event names per master spec §18.

---

## Performance architecture

- PostgreSQL indexes: `(company_id, item_code)`, `(company_id, ygp_code)`, `(company_id, category)`, `(company_id, supplier_sku)`, `(company_id, version, active)`
- Redis/cache: tenant-scoped keys `pricebook:{companyId}:v{version}:search:{hash}`
- Lazy assembly expansion on quote build
- Background workers for bulk import and safe recalculation previews
- **No** background rewrite of historical snapshots

---

## Phased delivery map

| Phase | Architecture deliverable |
|-------|-------------------------|
| PRICEBOOK-001A | Schema, version control, price engine, RBAC, API skeleton |
| PRICEBOOK-001B | Residential assemblies + YGP codes |
| PRICEBOOK-001C | Point catalogue + BOQ engine |
| PRICEBOOK-001D | INV-PRICE-001 import pipeline |
| PRICEBOOK-001E | Document snapshot integration; feeds JOB-COST-001 estimate baselines |
| JOB-COST-001* | Job costing & profit engine (after PRICEBOOK-001A) |
| AI-EST-001* | Estimating subsystem (parallel after 001C foundation) |
| AI-EST-LEARN-001 / JOB-COST-001G | Learning loop after job costing evidence available |

---

## Cross-reference

| Document | Purpose |
|----------|---------|
| [TITAN_JOB_COSTING_PROFIT_ENGINE_SPECIFICATION.md](./TITAN_JOB_COSTING_PROFIT_ENGINE_SPECIFICATION.md) | JOB-COST-001 — actual cost, variance and profit truth |
| [TITAN_JOB_COSTING_ARCHITECTURE.md](./TITAN_JOB_COSTING_ARCHITECTURE.md) | JOB-COST-001 technical architecture |

---

## Explicit non-goals (this record)

- No implementation during XERO-002
- No modification to existing quotes, invoices, jobs, supplier records
- No production access
- No duplicate pricing constants outside Master Pricebook path

---

*Architecture record only. No schema migrations or application code created.*
