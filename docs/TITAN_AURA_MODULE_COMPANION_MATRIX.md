# TITAN AURA Module Companion Matrix

**Status:** RECORD ONLY — living register under AURA-FIRST-001  
**Recorded (UTC):** 2026-08-06  
**Parent:** [TITAN_AURA_AI_COMPANION_STANDARD.md](./TITAN_AURA_AI_COMPANION_STANDARD.md)

---

## How to read this matrix

| Column | Meaning |
|--------|---------|
| **AURA specialist** | Agent ID from [TITAN_MASTER_AGENT_REGISTER.md](./TITAN_MASTER_AGENT_REGISTER.md) |
| **Implementation** | DOCUMENTED ONLY · PLANNED · PARTIAL · IMPLEMENTED |
| **Testing** | NOT STARTED · PLANNED · PARTIAL · VERIFIED |
| **Approval** | Minimum approver before execute |

Modules marked **AI companion not required** include documented reason.

---

## Master matrix

| Module | AURA specialist | Purpose | Data dependencies | Permitted recommendations | Prohibited autonomous actions | Approval | Implementation | Testing |
|--------|-------------------|---------|-------------------|---------------------------|------------------------------|----------|----------------|---------|
| **Executive & strategy** | EXEC-007 Executive Command | Executive summary, cross-module coordination | DASH-001, all exec APIs | Priority actions, briefings | Auto-execute any module action | Owner | PARTIAL | NOT STARTED |
| **Growth planning** | **EXEC-010** Business Strategist | Revenue/profit/capacity growth plans | JOB-COST-001, PRICEBOOK-001, CRM, OCC-001 | Growth targets, initiatives, what-if drafts | Price changes, hiring, spend, expansion execute | Owner | DOCUMENTED ONLY | NOT STARTED |
| **Finance** | FIN-004 Financial Controller | AR/AP, cash position, collections | Xero, finance module | Collection priorities, cash alerts | Post to Xero, mark paid, reconcile | Owner | PARTIAL | NOT STARTED |
| **Xero** | FIN-006 Xero Reconciliation | Sync health, mapping, reconciliation | Xero connection, mappings | Reconnect, mapping review drafts | OAuth changes, write without approval | Owner | PARTIAL | NOT STARTED |
| **Banking & cash** | FIN-007 Cash-Flow Agent | Bank feed, cash forecasts | FNB-CASH-001, Xero bank | Match suggestions, cash warnings | Auto-reconcile, auto-classify | Owner | DOCUMENTED ONLY | NOT STARTED |
| **Pricebook** | FIN-018 Pricebook Intelligence | Pricing, margin, catalogue | PRICEBOOK-001 | Markup/margin suggestions | Silent price overwrites | Owner | DOCUMENTED ONLY | NOT STARTED |
| **Estimating** | QS-001 Quantity Surveyor | Takeoff, BOQ, estimates | AI-EST-001, PRICEBOOK-001 | Assembly matches, quote drafts | Auto-send quotes | Owner | DOCUMENTED ONLY | NOT STARTED |
| **Job costing** | FIN-013 Job Costing and Margin | Variance, profit, leaks | JOB-COST-001 | Margin alerts, variation drafts | Budget/price changes | Owner | DOCUMENTED ONLY | NOT STARTED |
| **Profit intelligence** | EXEC-015 Profit Improvement | Profit optimisation | JOB-COST-001, BI-PROFIT-001 | Profit improvement plans | Auto price/cost changes | Owner | DOCUMENTED ONLY | NOT STARTED |
| **Sales** | CRM-001 Sales Director (planned) | Pipeline, conversion | CRM, quotes, leads | Follow-up priorities | Auto-contact customers | Owner/Admin | PLANNED | NOT STARTED |
| **CRM** | CRM-002 CRM Intelligence | Customer 360, relationships | CRM, customers, properties | Retention actions | Mass outreach without approval | Owner/Admin | PLANNED | NOT STARTED |
| **Leads** | CRM-003 Lead Qualification | Lead scoring, routing | Leads module | Qualification, assignment drafts | Auto-assign without rules | Admin | PLANNED | NOT STARTED |
| **Marketing** | MKT-001 Marketing Strategist | Channel ROI, campaigns | Marketing, lead sources | Campaign drafts | Publish/spend autonomously | Owner | PLANNED | NOT STARTED |
| **Customers** | CRM-004 Customer Success | Satisfaction, callbacks | CRM, jobs, reviews | Service recovery drafts | Contact without consent | Admin | PLANNED | NOT STARTED |
| **Jobs** | OPS-001 Operations Director | Job health, overdue, callbacks | Jobs, dispatch | Dispatch adjustments drafts | Stop technicians, reassign auto | Admin | PLANNED | NOT STARTED |
| **Dispatch** | OPS-002 Dispatch Optimiser | Scheduling, capacity | Dispatch, calendar, fleet | Schedule suggestions | Auto-reschedule without approval | Admin | PLANNED | NOT STARTED |
| **Technicians** | OPS-003 Field Performance | Utilisation, skills | Timesheets, jobs | Training/capacity notes | Wage or assignment auto-changes | Admin | PLANNED | NOT STARTED |
| **HR & payroll** | HR-001 HR Director | Headcount, payroll timing | Payroll (future) | Recruitment drafts | Hire/fire/wage changes | Owner | PLANNED | NOT STARTED |
| **Inventory** | INV-001 Inventory Controller | Stock levels, reorder | Warehouse, inventory | Reorder suggestions | Auto-PO creation | Admin | PLANNED | NOT STARTED |
| **Warehouse** | INV-002 Warehouse Operations | Issue, return, waste | Warehouse module | Issue correction drafts | Silent stock adjustments | Admin | PLANNED | NOT STARTED |
| **Suppliers** | INV-003 Supplier Intelligence | Supplier performance, pricing | Suppliers, INV-PRICE-001 | Supplier review drafts | Change agreements | Owner | PLANNED | NOT STARTED |
| **Purchasing** | INV-004 Procurement Agent | PO workflow | POs, suppliers | PO drafts | Auto-approve POs | Admin | PLANNED | NOT STARTED |
| **Fleet & Cartrack** | FLT-001 Fleet Manager | Vehicle utilisation, position | Cartrack, fleet | Route/nav drafts | Vehicle purchases | Owner | PARTIAL | NOT STARTED |
| **Compliance & COC** | LEG-001 Compliance Officer | COC, certifications | Compliance docs | Compliance gap alerts | Issue false COC | Owner | PLANNED | NOT STARTED |
| **Documents** | SW-001 Document Intelligence | Doc classification, extraction | Document engine | Extraction drafts | Alter official documents | Admin | PARTIAL | NOT STARTED |
| **Customer support** | COM-001 Reception Intelligence | Enquiries, messaging | Comms channels | Reply drafts | Send without review | Admin | PLANNED | NOT STARTED |
| **Maintenance** | OPS-004 Maintenance Planner | Recurring plans, agreements | Maintenance module | Plan drafts | Auto-enrol customers | Owner | PLANNED | NOT STARTED |
| **Security** | SW-002 Security Operations | Auth, audit, anomalies | Security logs | Alert Owner | Access changes | Owner | PLANNED | NOT STARTED |
| **Development** | SW-003 Engineering Advisor | System health, releases | CI, logs | Internal dev notes only | Production changes | Platform Owner | PLANNED | NOT STARTED |
| **QA** | AUD-001 Quality Assurance | Test coverage, defects | Test results | QA reports | — | Platform Owner | PLANNED | NOT STARTED |
| **System health** | SW-004 Platform Health | Uptime, integrations | Health endpoints | Integration alerts | Provider config changes | Platform Owner | PARTIAL | NOT STARTED |
| **Integrations** | SW-005 Integration Specialist | Connection status | Integration hub | Reconnect guidance | Credential changes | Owner | PARTIAL | NOT STARTED |
| **Owner Command Center** | EXEC-008 + EXEC-009 + EXEC-010 | CEO briefing, coach, growth | OCC-001, DASH-001 | Daily Top 3, growth section | Any financial execute | Owner | DOCUMENTED ONLY | NOT STARTED |

---

## AI companion not required (documented)

| Module | Reason |
|--------|--------|
| Static marketing website CMS | No operational decisions — content only with human publish |
| Pure CSS/theme tokens (UI-THEME-001) | Visual layer — no business intelligence surface |
| Git/CI infrastructure | Platform engineering — not Owner business module |

---

## Checklist backfill rule

For each row in [TITAN_MASTER_COMPLETION_CHECKLIST.md](./TITAN_MASTER_COMPLETION_CHECKLIST.md) representing a major module:

1. Locate module in this matrix
2. Populate **AI Companion** column with agent ID or `NOT REQUIRED`
3. Block **fully complete** status until companion defined and tested per AURA-FIRST-001

---

## Growth Planner placement

**AURA-GROWTH-001** is the product milestone for **EXEC-010 Business Strategist Agent**. No new agent ID. Official count remains **307**.

---

*Matrix record only. Updated as modules register companions. No runtime orchestration implemented.*
