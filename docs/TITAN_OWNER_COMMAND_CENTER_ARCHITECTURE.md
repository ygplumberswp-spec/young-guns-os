# TITAN OCC-001 — Owner Command Center Architecture

**Status:** RECORD ONLY — **not implemented**  
**Parent:** [TITAN_OWNER_COMMAND_CENTER_AURA_COACH_SPECIFICATION.md](./TITAN_OWNER_COMMAND_CENTER_AURA_COACH_SPECIFICATION.md)  
**Recorded (UTC):** 2026-08-06

---

## Design principles

1. **Owner-first landing** — Company Owner's default post-login route is the Command Center
2. **Real data only** — every metric traceable to tenant-scoped source APIs; no invented KPIs
3. **Extend DASH-001** — reuse `executive-summary`, `dash001` extensions; add `occ001` layer
4. **Central financial truth** — JOB-COST-001 + finance services; no duplicate margin formulas
5. **Coach, don't control** — AURA advises; Owner approves all financial actions
6. **Tenant isolation** — Business DNA and learning scoped by `company_id`
7. **Calm executive UX** — no provider errors, no humiliating rankings, honest stale labels

---

## Logical components

```
┌─────────────────────────────────────────────────────────────────┐
│                    Owner Command Center (UI)                     │
│         first screen · daily dashboard · health score            │
└────────────┬────────────────────────────────────────────────────┘
             │
    ┌────────┼────────┬──────────────┬──────────────┐
    ▼        ▼        ▼              ▼              ▼
 Metrics   Health    Briefing      CEO           What-If
 Aggregator Score    Generator     Reports       Simulator
    │        │        │              │              │
    └────────┴────────┴──────────────┴──────────────┘
             │
    ┌────────┼────────┬──────────────┬──────────────┐
    ▼        ▼        ▼              ▼              ▼
 Money     Opportunity Business     AI Business   EXEC-009
 Leak      Finder      DNA Store    Advisor       Business Coach
 Detector                                      Agent
             │
    ┌────────┴────────┬──────────────┬──────────────┐
    ▼                 ▼              ▼              ▼
 DASH-001          JOB-COST-001   PRICEBOOK-001   Finance/Xero
 executive-summary  profit truth   pricing truth   AR/cash
 Jobs/Dispatch     Timesheets     Marketing       Fleet/Cartrack
```

---

## Data sources

| Metric domain | Primary source | Freshness |
|---------------|----------------|-----------|
| Revenue, AR, quotes | Finance module + Xero intersync | DASH-001 freshness labels |
| Profit, margin | JOB-COST-001 projections | Estimated vs final labelled |
| Cash in bank | Xero/bank reconciliation | Reconciled vs estimate labelled |
| Jobs ops | Jobs, dispatch, calendar | Real-time tenant data |
| Technician productivity | Timesheets, assignments | Operational only |
| Health score | Composite OCC-001C engine | Degrades on stale inputs |
| Leaks/opportunities | JOB-COST-001 variance + DNA | Requires approved actuals |

---

## API layer (planned)

Extends existing dashboard API:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/dashboard/executive-summary` | Existing — DASH-001 base |
| `GET /api/v1/dashboard/occ001/command-center` | Daily dashboard bundle |
| `GET /api/v1/dashboard/occ001/health-score` | Score + category breakdown |
| `GET /api/v1/dashboard/occ001/ceo-briefing` | Daily briefing (generated or cached) |
| `GET /api/v1/dashboard/occ001/ceo-review/weekly` | Weekly CEO Review |
| `GET /api/v1/dashboard/occ001/ceo-review/monthly` | Monthly Board Report |
| `POST /api/v1/dashboard/occ001/what-if` | Scenario projection (read-only) |
| `GET /api/v1/dashboard/occ001/money-leaks` | Leak detector results |
| `GET /api/v1/dashboard/occ001/opportunities` | Opportunity finder results |
| `GET /api/v1/dashboard/occ001/business-dna` | Learned patterns summary |

All routes: Owner/executive RBAC · tenant-scoped · role-filtered payloads.

---

## AURA Business Coach (EXEC-009)

| Component | Responsibility |
|-----------|----------------|
| Briefing generator | Morning CEO summary from live metrics |
| Lesson engine | Data-backed coaching topics |
| Advisor narrative | Plain-language report explanations |
| Recommendation store | Draft recommendations pending Owner review |

Integration with existing AURA infrastructure:

- `packages/aura` prompts and governance
- Draft → Review → Approve → Execute workflow
- Audit log on every generated briefing and recommendation

EXEC-009 moves from **Defined** → **Partial** at OCC-001E implementation.

---

## Business Health Score engine

Weighted composite (weights tenant-configurable at implementation):

```
healthScore = Σ (categoryScore × weight) / Σ weights
```

Each category:

- Input metrics from authoritative services
- Normalised 0–100 sub-score
- Staleness penalty when source data incomplete
- Strength/weakness narrative from top/bottom categories

---

## What-If Simulator

Scenario model inputs → PRICEBOOK-001 rate tables + JOB-COST-001 overhead models + capacity assumptions.

Output: projection object with confidence, assumptions list, break-even estimate.

Stored as `what_if_scenarios` (planned) — Owner-saved, never auto-applied.

---

## Business DNA store

Planned entities:

| Entity | Purpose |
|--------|---------|
| `business_dna_signals` | Learned patterns (service/customer/supplier/season) |
| `business_dna_recommendations` | Pending Owner approval |
| `ceo_briefing_history` | Generated briefings with evidence snapshot |
| `money_leak_findings` | Detected leaks with R estimate |
| `opportunity_findings` | Ranked opportunities |

No cross-tenant learning. Platform Owner sees aggregate anonymised benchmarks only if explicitly built later.

---

## UI architecture

| Surface | Location (planned) |
|---------|-------------------|
| Command Center page | Default Owner route — extends/replaces dashboard landing |
| CEO Briefing panel | Top of command center or dedicated morning view |
| Health Score ring | Command center header |
| Coach lessons | Slide-over or dedicated Coach tab |
| What-If | Modal or dedicated simulator page |
| CEO Reports | Reports section + PDF export |

DASH-002 grid may embed OCC-001 widgets as configurable panels.

---

## RBAC

Route guard: `executive:read` or Company Owner role.

Technician, Office Staff (default), Client → redirect to role-appropriate home.

Platform Owner → cross-tenant admin view separate from tenant command center.

---

## Events (planned)

`occ001.briefing.generated` · `occ001.health_score.updated` · `occ001.money_leak.detected` · `occ001.opportunity.found` · `occ001.what_if.saved` · `occ001.coach.lesson.viewed` · `occ001.recommendation.drafted`

Payloads strip sensitive data for non-Owner subscribers.

---

## Phased delivery map

| Phase | Deliverable |
|-------|-------------|
| OCC-001A | Command center UI + metrics aggregation API |
| OCC-001B | CEO briefing generator + cache |
| OCC-001C | Health score engine |
| OCC-001D | Weekly/monthly report generators + PDF |
| OCC-001E | Business Coach lessons + EXEC-009 wiring |
| OCC-001F | What-if simulator service |
| OCC-001G | Business DNA store + learning loop |
| OCC-001H | Money leak detector |
| OCC-001I | Opportunity finder |
| OCC-001J | AI advisor narrative layer |

**Prerequisites:** DASH-001 ✓ · DASH-002 · JOB-COST-001C · PRICEBOOK-001A

---

## Explicit non-goals (this record)

- No implementation during XERO-002
- No modification to live dashboard metrics formulas outside central services
- No automatic financial or pricing writes
- No production access
- No technician/client exposure to Owner margin or leak data

---

*Architecture record only. No schema migrations or application code created.*
