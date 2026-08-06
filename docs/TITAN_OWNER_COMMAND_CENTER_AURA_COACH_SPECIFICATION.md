# TITAN OCC-001 — Owner Command Center & AURA Business Coach Specification

**Status:** RECORD ONLY — **not implemented**  
**Recorded (UTC):** 2026-08-06  
**Audience:** Platform Owner / Company Owner only  
**Active blocker:** XERO-002 Gate sequence remains active — **do not implement during Xero proof**  
**Placement:** After **DASH-002** and **JOB-COST-001** foundation — extends **DASH-001** (approved)

---

## Purpose

Transform TITAN from a plumbing management system into an **AI Business Operating System** that actively helps the Owner build a more profitable, efficient and scalable company.

The **Owner Command Center** is the first screen after login and shows complete business health. **AURA Business Coach** (EXEC-009) generates daily briefings, teaches from real data, detects money leaks, finds opportunities, and explains reports — without automatically changing financial or pricing data.

---

## Relationship to existing work

| ID | Relationship |
|----|--------------|
| **DASH-001** | Approved foundation — Business Heartbeat, Financial Truth, AURA Executive panel. OCC-001 **extends**, does not duplicate. |
| **DASH-002** | Customisable no-gap grid — OCC-001 command center may compose into DASH-002 panels. |
| **JOB-COST-001** | Profit, margin, variance and money-leak truth — required for accurate coaching. |
| **PRICEBOOK-001** | Pricing intelligence for what-if and underpriced-service detection. |
| **AI-FIN-DOC-001** | Approved financial capture feeds cash and cost truth. |
| **EXEC-009** | Business Coach Agent — executable implementation of AURA coaching layer. |

**No duplicate metrics or formulas.** All financial figures use centrally versioned services (JOB-COST-001, finance APIs, Xero freshness).

---

## Cross-links

| ID | Document / area |
|----|-----------------|
| [TITAN_OWNER_COMMAND_CENTER_ARCHITECTURE.md](./TITAN_OWNER_COMMAND_CENTER_ARCHITECTURE.md) | Technical architecture |
| [TITAN_DASH_001_COMPLETION_REPORT.md](./TITAN_DASH_001_COMPLETION_REPORT.md) | DASH-001 foundation |
| [TITAN_JOB_COSTING_PROFIT_ENGINE_SPECIFICATION.md](./TITAN_JOB_COSTING_PROFIT_ENGINE_SPECIFICATION.md) | Profit and margin truth |
| [TITAN_MASTER_PRICEBOOK_SPECIFICATION.md](./TITAN_MASTER_PRICEBOOK_SPECIFICATION.md) | Pricing truth |
| [TITAN_MASTER_AGENT_REGISTER.md](./TITAN_MASTER_AGENT_REGISTER.md) | EXEC-009 Business Coach Agent |
| [TITAN_AI_AGENT_ARCHITECTURE.md](./TITAN_AI_AGENT_ARCHITECTURE.md) | Agent governance |
| [TITAN_ROADMAP.md](./TITAN_ROADMAP.md) | Locked platform sequence |

---

## 1. Owner Command Center — daily dashboard

First screen after Owner login. Platform Owner / Company Owner only.

### Required metrics (real data only)

| Metric | Source |
|--------|--------|
| Revenue Today | Invoiced/collected per finance truth rules |
| Revenue This Month | Same |
| Gross Profit | JOB-COST-001 / finance aggregation |
| Net Profit | Estimated or final per costing state — labelled honestly |
| Gross Margin % | Central calculation |
| Net Margin % | Central calculation |
| Cash in Bank | Bank/Xero reconciled where available; otherwise labelled estimate |
| Cash Flow Status | Calm status level |
| Outstanding Invoices | Finance AR |
| Outstanding Quotes | Quotes pipeline |
| Quote Conversion % | Real won/lost ratio |
| Jobs Today | Dispatch/calendar |
| Jobs This Week | Dispatch/calendar |
| Jobs Completed | Jobs module |
| Jobs Running | Active jobs |
| Overdue Jobs | Attention engine |
| Warranty Jobs | Tagged warranty work |
| Callbacks | Callback/rework tracking |
| Business Health Score | OCC-001C composite score |

Never invent metrics. Missing data → **Financial data incomplete** — not zero.

---

## 2. AURA Daily CEO Briefing

Every morning AURA generates a personalised executive briefing for the Owner.

### Structure

1. Greeting and date
2. Today's Business Summary (revenue, month, profit, cash waiting, jobs)
3. High Priority items (emergencies, follow-ups, budget overruns)
4. Today's Biggest Opportunity
5. Today's Biggest Risk
6. Top 3 Actions (numbered, actionable)

### Rules

- Every claim backed by evidence and affected entities
- Confidence score where inference is involved
- **Draft → Review → Approve → Execute** — briefing is read-only advice
- AURA may **not** auto-collect invoices, approve variations, or change prices

---

## 3. Business Health Score

Live score out of **100** with category breakdown:

| Category | Weight (TBD at implementation) |
|----------|-------------------------------|
| Profitability | JOB-COST-001 margins |
| Cash Flow | AR, collections, bank |
| Sales | Quotes, conversion, pipeline |
| Marketing | Channel performance where tracked |
| Operations | Jobs, overdue, callbacks |
| Customer Satisfaction | Reviews, callbacks, complaints |
| Technician Productivity | Timesheets, utilisation |
| Inventory Control | Warehouse variance |
| Compliance | COC, certifications |
| System Health | Integration freshness, data completeness |

Show **strengths** and **weaknesses** with drill-down. Score degrades when data is stale or incomplete.

---

## 4. CEO Meetings

### Weekly CEO Review (auto-generated)

Revenue · Profit · Cash Flow · Best Jobs · Worst Jobs · Best Customers · Worst Customers · Technician Performance · Marketing Results · Supplier Performance · Outstanding Risks

### Monthly Board Report

Revenue Growth · Profit Growth · Margin Trends · Cash Flow · Customer Growth · Technician Productivity · Business Health · Top Opportunities · Biggest Risks

Export: PDF/HTML with Young Guns report shell. Owner approval before external distribution.

---

## 5. Business Coach

AURA actively teaches the Owner using **the company's own data**.

### Topics

Profit · Cash Flow · Pricing · Marketing · Sales · Hiring · Leadership · Customer Service · Business Systems · Negotiation · Scaling · Productivity

### Example lesson

> Last month your average margin was 23%. If it increased to 28% your business would have earned approximately R37,000 more.

Lessons require: sufficient sample · complete approved data · confidence · financial effect · Owner acknowledgement · audit history

AURA must **never** automatically apply lessons as price or policy changes.

---

## 6. What-If Simulator

Owner simulates business decisions:

- Increase labour rate · call-out fee · advertising spend · supplier prices
- Hire plumber · add technician · buy vehicle · open branch

### Predictions (labelled as projections)

Revenue · Profit · Cash Flow · Break-even · Capacity · Return on Investment

Uses PRICEBOOK-001 and JOB-COST-001 models. Projections ≠ commitments. Owner saves scenarios; no silent application.

---

## 7. Business DNA

Over time AURA learns patterns (tenant-scoped, never cross-tenant):

Best/Worst Services · Customers · Suppliers · Technicians · Seasonal Trends · Price Sensitivity · Marketing Performance · Quote Conversion · Labour Performance · Material Usage

**Never automatically change business data.** Recommendations only.

---

## 8. Money Leak Detector

Automatically identify and quantify:

Excess Labour · Material Waste · Unbilled Work · Discount Losses · Warranty Costs · Callbacks · Overtime · Fuel Waste · Vehicle Costs · Supplier Price Increases

Each leak: evidence · estimated R amount · affected jobs/customers · suggested action · Owner decision

Requires JOB-COST-001 approved actuals where possible.

---

## 9. Opportunity Finder

Identify:

Highest Profit Services · Most Profitable Customers · Best Marketing Channels · Underpriced Services · Technician Training Opportunities · Cross-selling · Maintenance Agreements · Repeat Customer Opportunities

Ranked by estimated financial impact. Owner approves pursuit.

---

## 10. AI Business Advisor

AURA explains reports in plain language — not just charts.

Examples:

- "Revenue increased 12%, but profit only 2% because labour costs grew faster."
- "Most profitable work this month: geyser replacements."
- "Lost ~R18,000 through unapproved extra work."
- "Bathroom renovations: revenue up, margins below target."
- "5% price increase on basin installations could materially improve annual profit while maintaining healthy conversion."

Every explanation: evidence · confidence · suggested action · no auto-execute.

---

## 11. Owner questions TITAN must answer automatically

| Question | Source |
|----------|--------|
| Are we making money? | Financial truth + health score |
| Why are profits down? | Variance + advisor narrative |
| Where are we losing money? | Money leak detector |
| What should I do today? | CEO briefing Top 3 Actions |
| Which services to sell more? | Opportunity finder |
| Which technician performs best? | Business DNA (operational, not humiliating) |
| Which customer is most profitable? | JOB-COST-001 customer contribution |
| Can I afford another employee? | What-if simulator |
| Should I raise prices? | Coach + what-if + pricebook margin analysis |

All answers use real business data. All financial and pricing decisions remain under **Owner approval**.

---

## 12. Access control

| Role | Access |
|------|--------|
| Platform Owner | Full visibility across permitted tenants |
| Company Owner | Full command center, coach, simulator, DNA |
| Admin | None unless explicitly granted executive permission |
| Office Staff | None |
| Technician | None |
| Client | None |

Command center is **not** a technician or client surface.

---

## 13. AURA constraints (non-negotiable)

AURA may **never** automatically:

- Change prices or budgets
- Approve expenses or variations
- Invoice customers or record payments
- Reconcile transactions
- Contact customers
- Stop technicians
- Apply what-if scenarios to live data

Preserve **Draft → Review → Approve → Execute** for every recommendation.

---

## 14. Phased implementation

| Phase | ID | Scope |
|-------|-----|-------|
| A | OCC-001A | Owner Command Center daily dashboard (extends DASH-001) |
| B | OCC-001B | AURA Daily CEO Briefing |
| C | OCC-001C | Business Health Score engine |
| D | OCC-001D | Weekly CEO Review and Monthly Board Report |
| E | OCC-001E | Business Coach lessons (EXEC-009 foundation) |
| F | OCC-001F | What-If Simulator |
| G | OCC-001G | Business DNA learning store |
| H | OCC-001H | Money Leak Detector |
| I | OCC-001I | Opportunity Finder |
| J | OCC-001J | AI Business Advisor narrative layer |

**Prerequisites:** DASH-001 (done) · DASH-002 grid · JOB-COST-001C minimum (variance/projections) · PRICEBOOK-001A minimum for pricing what-if

**Do not implement any phase during active Xero proof.**

---

## 15. Implementation gate

| Gate | Rule |
|------|------|
| During XERO-002 | **Forbidden** — record and sequence only |
| After DASH-002 + JOB-COST-001C | Owner sequences OCC-001A |
| Production | `rshuiaghmtrvvilhqpwm` forbidden until explicit Owner GO |

---

*Record-only specification. No code, schema, or business data was modified when this document was created.*
