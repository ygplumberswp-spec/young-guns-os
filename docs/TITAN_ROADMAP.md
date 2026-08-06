# TITAN Platform Roadmap

**Status:** Authoritative sequencing reference  
**Last updated (UTC):** 2026-08-06  
**Worktree:** `/workspace/.worktrees/titan-recovery`  
**Deploy branch:** `cursor/titan-v1-integration`

---

## Active work (do not interrupt)

**XERO-002** — Controlled live proof gate sequence (Gates 5B–7 remaining).  
**Do not implement PRICEBOOK-001, JOB-COST-001, DASH-002, OCC-001, FNB-CASH-001, AURA-GROWTH-001, or other major features during active Xero proof.**

See: [TITAN_XERO_002_LIVE_PROOF_PLAN.md](./TITAN_XERO_002_LIVE_PROOF_PLAN.md)

---

## Locked platform sequence

Execute in order after prior gates close. Production forbidden until explicit production approval.

| Order | ID | Name | Status |
|------:|-----|------|--------|
| **—** | **XERO-002** | **Complete Gates 5B–7 and close Xero integration proof** | **ACTIVE** |
| 1 | **PRICEBOOK-001** | **Master Pricebook foundation** | **RECORDED** — not implemented |
| 2 | **JOB-COST-001** | **Intelligent Job Costing & Profit Engine** | **RECORDED** — not implemented |
| 3 | **DASH-002** | **Customisable no-gap Dashboard grid** | Planned |
| 4 | **OCC-001** | **Owner Command Center & AURA Business Coach** | **RECORDED** — not implemented |
| 5 | **AI-FIN-DOC-001** | **AI Financial Capture Engine** | Recorded only |
| 5a | AP-DOC-001 | Supplier Invoice Import | Child — recorded |
| 5b | EXP-REC-001 | Receipt and Till-Slip Capture | Child — recorded |
| 5c | INV-PRICE-001 | Supplier Price List Import | Child — recorded |
| 6 | **FNB-CASH-001** | **FNB Bank Feed & Cash Intelligence** | **RECORDED** — Phase 1 audit only |
| 7 | **AURA-GROWTH-001** | **AURA Growth Planner (EXEC-010)** | **RECORDED** — not implemented |
| 8 | — | Full BrowserStack role and journey audit | Planned |
| 9 | — | Remaining integration and platform roadmap | Ongoing |
| 10 | **UI-THEME-001** | **App-wide visual finishing (Premium Dark Mode)** | Recorded only |
| 11 | — | Young Guns controlled pilot | Gate |
| 12 | — | Production hardening and launch | Gate |

---

## AURA-FIRST-001 — permanent AI Companion Standard

**Status:** DOCUMENTED ONLY — permanent product rule  
**Documentation:** [TITAN_AURA_AI_COMPANION_STANDARD.md](./TITAN_AURA_AI_COMPANION_STANDARD.md) · [TITAN_AURA_MODULE_COMPANION_MATRIX.md](./TITAN_AURA_MODULE_COMPANION_MATRIX.md)

Every major module requires an AURA specialist behind the single AURA interface. No disconnected per-agent chat UIs.

---

## AURA-GROWTH-001 phased delivery (after OCC-001 + data foundations)

| Phase | ID | Scope |
|-------|-----|-------|
| A | AURA-GROWTH-001A | Business baseline, targets and constraints |
| B | AURA-GROWTH-001B | Annual, quarterly and 90-day growth plans |
| C | AURA-GROWTH-001C | Revenue, profit and margin growth planning |
| D | AURA-GROWTH-001D | Marketing, lead-source and conversion growth |
| E | AURA-GROWTH-001E | Capacity, recruitment, training and fleet planning |
| F | AURA-GROWTH-001F | Service, suburb, region and branch expansion planning |
| G | AURA-GROWTH-001G | Growth initiative ownership and progress tracking |
| H | AURA-GROWTH-001H | Weekly Growth Review and Monthly Owner Growth Plan |
| I | AURA-GROWTH-001I | What-if scenarios and cash-aware growth modelling |
| J | AURA-GROWTH-001J | Outcome measurement and approved growth learning |

**Specialist agent:** EXEC-010 Business Strategist (existing — not duplicated)

**Documentation:** [TITAN_AURA_GROWTH_PLANNER_SPECIFICATION.md](./TITAN_AURA_GROWTH_PLANNER_SPECIFICATION.md)

**Prerequisites:** PRICEBOOK-001 · JOB-COST-001C · TITAN-BI-001 · DASH-002 · OCC-001 · verified financial/operational data

---

## FNB-CASH-001 phased delivery (Young Guns FNB — after XERO-002 close)

| Phase | ID | Scope |
|-------|-----|-------|
| 1 | FNB-CASH-001A | Audit Xero bank-feed architecture; FNB gap report — **no code** |
| 2 | FNB-CASH-001B | Read-only staging connection; import and deduplicate; Xero reconciliation verify |
| 3 | FNB-CASH-001C | Payment matching, expense suggestions, job-cost allocation |
| 4 | FNB-CASH-001D | Cash forecasting and AURA financial intelligence |

**Documentation:**

- [TITAN_FNB_BANK_FEED_CASH_INTELLIGENCE_SPECIFICATION.md](./TITAN_FNB_BANK_FEED_CASH_INTELLIGENCE_SPECIFICATION.md)
- [TITAN_FNB_BANK_FEED_ARCHITECTURE.md](./TITAN_FNB_BANK_FEED_ARCHITECTURE.md)

---

## OCC-001 phased delivery (after DASH-002 + JOB-COST-001 foundation)

| Phase | ID | Scope |
|-------|-----|-------|
| A | OCC-001A | Owner Command Center daily dashboard (extends DASH-001) |
| B | OCC-001B | AURA Daily CEO Briefing |
| C | OCC-001C | Business Health Score engine |
| D | OCC-001D | Weekly CEO Review and Monthly Board Report |
| E | OCC-001E | Business Coach lessons (EXEC-009) |
| F | OCC-001F | What-If Simulator |
| G | OCC-001G | Business DNA learning store |
| H | OCC-001H | Money Leak Detector |
| I | OCC-001I | Opportunity Finder |
| J | OCC-001J | AI Business Advisor narrative layer |

**Documentation:**

- [TITAN_OWNER_COMMAND_CENTER_AURA_COACH_SPECIFICATION.md](./TITAN_OWNER_COMMAND_CENTER_AURA_COACH_SPECIFICATION.md)
- [TITAN_OWNER_COMMAND_CENTER_ARCHITECTURE.md](./TITAN_OWNER_COMMAND_CENTER_ARCHITECTURE.md)

---

## JOB-COST-001 phased delivery (after PRICEBOOK-001 foundation)

| Phase | ID | Scope |
|-------|-----|-------|
| A | JOB-COST-001A | Core job-cost model, immutable estimate baseline and financial states |
| B | JOB-COST-001B | Labour, material, purchase and site-cost capture |
| C | JOB-COST-001C | Live variance calculation and profitability projections |
| D | JOB-COST-001D | Variation-order engine and margin protection |
| E | JOB-COST-001E | AURA risk detection, alerts and recommendations |
| F | JOB-COST-001F | Job financial dashboard and reporting |
| G | JOB-COST-001G | Estimate-versus-actual learning integration (AI-EST-LEARN-001) |

**Documentation:**

- [TITAN_JOB_COSTING_PROFIT_ENGINE_SPECIFICATION.md](./TITAN_JOB_COSTING_PROFIT_ENGINE_SPECIFICATION.md)
- [TITAN_JOB_COSTING_ARCHITECTURE.md](./TITAN_JOB_COSTING_ARCHITECTURE.md)

---

## PRICEBOOK-001 phased delivery (after XERO-002 close)

| Phase | ID | Scope |
|-------|-----|-------|
| A | PRICEBOOK-001A | Core data model, versioning, RBAC, price calculation |
| B | PRICEBOOK-001B | Residential service catalogue and Young Guns YGP codes |
| C | PRICEBOOK-001C | Construction point assemblies and BOQ engine |
| D | PRICEBOOK-001D | Supplier cost integration (INV-PRICE-001) |
| E | PRICEBOOK-001E | Quote, invoice, job-card, purchasing, job-cost integration |

### AI estimating (sequenced after PRICEBOOK-001C foundation)

| Phase | ID | Scope |
|-------|-----|-------|
| A | AI-EST-001A | Plan upload, storage, review workspace |
| B | AI-EST-001B | Fixture and plumbing-point detection |
| C | AI-EST-001C | Takeoff, BOQ, pricebook matching |
| D | AI-EST-001D | Quote generation with Owner approval |
| — | AI-EST-LEARN-001 | Estimate vs actual learning |

**Documentation:**

- [TITAN_MASTER_PRICEBOOK_SPECIFICATION.md](./TITAN_MASTER_PRICEBOOK_SPECIFICATION.md)
- [TITAN_PRICEBOOK_ARCHITECTURE.md](./TITAN_PRICEBOOK_ARCHITECTURE.md)
- [TITAN_AI_ESTIMATING_ENGINE_SPECIFICATION.md](./TITAN_AI_ESTIMATING_ENGINE_SPECIFICATION.md)

---

## Completed / in-progress prerequisites

| ID | Status |
|----|--------|
| PERF-001 | Implemented — staging verified |
| XERO-003 | Implemented |
| BANK-IMPORT-001 / XERO-003A | Implemented |
| DASH-001 | Approved and closed |
| XERO-002 P0 implementation | Complete — live proof in progress |

---

## Cross-reference index

| Document | Purpose |
|----------|---------|
| [TITAN_GAP_CLOSURE_PLAN.md](./TITAN_GAP_CLOSURE_PLAN.md) | Gap tracking and enterprise priorities |
| [TITAN_MASTER_COMPLETION_CHECKLIST.md](./TITAN_MASTER_COMPLETION_CHECKLIST.md) | Requirement-level status |
| [TITAN_INTEGRATION_REGISTER.md](./TITAN_INTEGRATION_REGISTER.md) | Integration catalogue |
| [TITAN_AURA_AI_COMPANION_STANDARD.md](./TITAN_AURA_AI_COMPANION_STANDARD.md) | AURA-FIRST-001 permanent rule |
| [TITAN_AGENT_ACTIVATION_ROADMAP.md](./TITAN_AGENT_ACTIVATION_ROADMAP.md) | Agent workforce phases |

---

## Rules

1. **No duplicate pricing systems** — PRICEBOOK-001 is the sole pricing authority when implemented
2. **No duplicate costing formulas** — JOB-COST-001 is the sole job-cost and profit truth when implemented
3. **No implementation during XERO-002 proof** — record and sequence only
4. **PRICEBOOK-001 → JOB-COST-001 → DASH-002 → OCC-001** — financial truth before AI coaching
5. **Production** — `rshuiaghmtrvvilhqpwm` forbidden until explicit Owner production GO

---

*Roadmap updated 2026-08-06 to register AURA-FIRST-001 and AURA-GROWTH-001. No code changes.*
