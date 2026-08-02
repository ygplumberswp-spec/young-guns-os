# TITAN Department Recurring Routines

**Phase:** 13 — Corporate Department Operating Model  
**Company:** Young Guns Plumbing  

Routines are **documented schedules with links to real TITAN routes** — not fake cron jobs or synthetic reminders. Owners and department leads execute these on the stated cadence.

Source of truth for links: `packages/shared/src/corporate-departments.ts` (`weeklyRoutine`, `monthlyRoutine`).

---

## Daily routines (all departments)

| Step | Who | Action | Route |
|------|-----|--------|-------|
| 1 | Company Owner | Review owner dashboard action queue | `/` |
| 2 | Company Owner / Accountant | Money Today — receivables snapshot | `/finance/receivables` |
| 3 | Dispatcher | Unassigned and delayed jobs | `/scheduling` |
| 4 | Operations Manager | Live dispatch board | `/mobile-platform/dispatcher` |
| 5 | Company Owner | Department hub — scan empty vs actionable queues | `/departments` |

Daily routines pull from the same APIs as Today queues; no separate notification layer in Phase 13.

---

## Weekly routines by department

| Department | Routine | Route |
|------------|---------|-------|
| Executive & Strategy | Review Company Health | `/mission-control` |
| Executive & Strategy | Review AURA Today's Plan | `/aura/todays-plan` |
| Finance & Accounting | Receivables aging | `/finance/receivables` |
| Finance & Accounting | Cashflow MTD | `/finance/cashflow` |
| Sales & Business Development | Pipeline / lead follow-up | `/leads` |
| Sales & Business Development | Quotes awaiting action | `/finance/quotes` |
| Marketing & Growth | Campaign / channel review | `/marketing` |
| Customer Experience | Inbox / unread messages | `/communications/inbox` |
| Customer Experience | CRM follow-ups | `/crm` |
| Operations | Today's jobs and delays | `/jobs?filter=today` |
| Operations | Live dispatch | `/mobile-platform/dispatcher` |
| Scheduling & Dispatch | Tomorrow capacity | `/scheduling` |
| Scheduling & Dispatch | Conflict review | `/scheduling` |
| Projects & Construction | Active project jobs | `/jobs` |
| Projects & Construction | BOQ vs actual | `/finance/boq` |
| HR & Workforce | Owner workforce attendance | `/workforce/owner` |
| HR & Workforce | Certification expiries | `/workforce/owner` |
| Procurement | Open parts requests | `/procurement/parts-requests` |
| Procurement | PO status | `/procurement/purchase-orders` |
| Inventory | Low stock review | `/inventory/stock` |
| Inventory | Recent movements | `/inventory/movements` |
| Fleet & Assets | Fleet alerts | `/fleet/alerts` |
| Fleet & Assets | Live map check | `/fleet/live-map` |
| Quality | Job pack review | `/documents/job-packs` |
| Health Safety & Compliance | Compliance workspace | `/documents/compliance` |
| Legal Risk & Internal Control | Data protection settings | `/settings/advanced/data-protection` |
| IT & Cybersecurity | Integration status | `/integrations` |
| IT & Cybersecurity | Security overview | `/security` |
| Data & Analytics | Analytics overview | `/analytics` |
| Administration | Team & access review | `/settings/team` |
| AURA Digital Workforce | AURA Today's Plan | `/aura/todays-plan` |
| AURA Digital Workforce | Automation command centre | `/automation` |

---

## Monthly routines by department

| Department | Routine | Route |
|------------|---------|-------|
| Executive & Strategy | Money vs jobs trend | `/analytics` |
| Finance & Accounting | Payables / PO commitments | `/finance/payables` |
| Finance & Accounting | Xero sync health | `/integrations` |
| Sales & Business Development | Customer value / repeat business | `/analytics` |
| Marketing & Growth | Attribution / lead quality | `/analytics` |
| Customer Experience | Complaint / escalation review | `/communications/messages` |
| Operations | Completion / rework patterns | `/analytics` |
| Scheduling & Dispatch | Utilisation vs leave | `/workforce-intelligence` |
| Projects & Construction | Job pack completeness | `/documents/job-packs` |
| HR & Workforce | Payroll preparation | `/workforce-intelligence` |
| HR & Workforce | Team access audit | `/settings/team` |
| Procurement | Supplier performance | `/procurement/suppliers` |
| Inventory | Stock take reconciliation | `/inventory/stock` |
| Fleet & Assets | Maintenance schedule | `/fleet/maintenance` |
| Quality | Callback job analysis | `/jobs` |
| Health Safety & Compliance | Safety document review | `/documents/compliance` |
| Legal Risk & Internal Control | Contract / policy review | `/documents/compliance` |
| IT & Cybersecurity | Platform health (advanced) | `/settings/advanced/platform-health` |
| Data & Analytics | Company health module review | `/mission-control` |
| Administration | Billing / subscription | `/settings/billing` |
| Administration | Documents & records policy | `/settings/documents-records` |
| AURA Digital Workforce | Agent capability review | `/aura/agents` |

---

## Cadence calendar (Owner — Young Guns)

| Day | Focus |
|-----|-------|
| **Mon–Fri AM** | Dashboard + Finance receivables + Dispatch |
| **Mon** | Department hub full scan (all 19) |
| **Wed** | Workforce owner view + fleet alerts |
| **Fri PM** | Cashflow MTD vs invoiced; week-close quotes |
| **Month-end** | Payables HOLD review; payroll prep; team access audit |

---

## Implementation note

Phase 13 extension implements **persisted recurring department task instances** generated from the routine definitions in `packages/shared/src/department-routine-tasks.ts` (derived from `corporate-departments.ts` weekly/monthly routines and the daily routines table above).

Each instance includes:
- **Accountable owner** from department definition
- **Due date** computed from cadence (daily / weekly end-of-week / month-end)
- **Status** lifecycle: `pending`, `in_progress`, `completed`, `overdue`, `blocked`, `awaiting_approval`, `skipped`
- **Approval gate** when routine href matches a department approval definition
- **Handoff target** from department handoff matrix (first target)
- **Audit history** on create and every mutation

Tasks surface in department workspace Today queues alongside live executive-summary and mission control signals. Generation is idempotent per `(company_id, routine_key, period_start)`.

API: `GET /api/v1/corporate-departments/:id/tasks`, `POST /api/v1/corporate-departments/tasks/generate`, mutation routes under `/tasks/:id/*`.

Migration: `0118_department_routine_tasks.sql` (staging only, additive).
