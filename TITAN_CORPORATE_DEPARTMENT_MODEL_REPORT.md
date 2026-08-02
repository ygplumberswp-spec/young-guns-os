# TITAN Corporate Department Model Report

**Phase:** 13 — Corporate Department Operating Model  
**Branch:** `cursor/titan-owner-operating-model-final`  
**Company:** Young Guns Plumbing (YGP)  
**Environment:** Staging only — production not touched  
**Generated:** 2026-08-02  

---

## Purpose

Phase 13 defines how Young Guns Plumbing operates across **19 corporate departments** in TITAN. Each department has a mandate, accountable owner, Today queue (from real APIs), recurring routines, approval gates, risks, KPIs, handoffs, and audit notes.

**No fake tasks, scores, or demo activity** — empty Today queues are honest when live tenant data has nothing actionable.

---

## Department index (19)

| # | Department | Accountable owner | Primary manage route |
|---|------------|-------------------|----------------------|
| 1 | Executive & Strategy | Company Owner | `/mission-control` |
| 2 | Finance & Accounting | Accountant | `/finance/receivables` |
| 3 | Sales & Business Development | Company Owner | `/leads` |
| 4 | Marketing & Growth | Company Owner | `/marketing` |
| 5 | Customer Experience | Operations Manager | `/communications/inbox` |
| 6 | Operations | Operations Manager | `/jobs` |
| 7 | Scheduling & Dispatch | Dispatcher | `/scheduling` |
| 8 | Projects & Construction | Company Owner | `/finance/boq` |
| 9 | HR & Workforce | Company Owner | `/workforce/owner` |
| 10 | Procurement | Company Owner | `/procurement` |
| 11 | Inventory | Operations Manager | `/inventory/products` |
| 12 | Fleet & Assets | Operations Manager | `/fleet` |
| 13 | Quality | Operations Manager | `/documents/job-packs` |
| 14 | Health Safety & Compliance | Company Owner | `/documents/compliance` |
| 15 | Legal Risk & Internal Control | Company Owner | `/settings/advanced/data-protection` |
| 16 | IT & Cybersecurity | Company Owner | `/integrations` |
| 17 | Data & Analytics | Company Owner | `/analytics` |
| 18 | Administration | Company Owner | `/settings/team` |
| 19 | AURA Digital Workforce | Company Owner | `/aura/agents` |

Canonical definitions: `packages/shared/src/corporate-departments.ts`

---

## Today queue sources (real data only)

| Source API | What it feeds |
|------------|---------------|
| `GET /api/v1/dashboard/executive-summary` | Owner action queue mapped per department by action id/category |
| Executive `todayAtAGlance` | Supplementary counts (new leads, unread messages, missing check-ins, draft invoices, critical issues) |
| `GET /api/v1/mission-control/modules` | Attention/critical module snapshots per department module mapping |
| `GET /api/v1/corporate-departments/hub` | Aggregated hub for all 19 departments |
| `GET /api/v1/corporate-departments/:id` | Single department workspace detail |

---

## Department summaries

### 1. Executive & Strategy
- **Mandate:** Set direction, prioritise capital and capacity, resolve cross-department escalations.
- **Today queue:** Approvals waiting; critical issues from dashboard.
- **HOLD:** None for model — operational data sparse on staging is expected.

### 2. Finance & Accounting
- **Mandate:** Protect cash; Xero-backed receivables; separate invoiced revenue from cash received.
- **Today queue:** Overdue invoices; completed-not-invoiced; draft invoices when present.
- **HOLD:** ACCPAY bills import; bank balance in cashflow (Phase 3 carry-forward).

### 3. Sales & Business Development
- **Mandate:** Convert leads; manage quotes; hand off won work to scheduling.
- **Today queue:** Quotes awaiting action; new leads today when count > 0.

### 4. Marketing & Growth
- **Mandate:** Qualified demand with consent; no unapproved bulk send.
- **Today queue:** Typically empty — no synthetic campaign KPIs.
- **HOLD:** Marketing send/spend requires Owner approval (master directive gate).

### 5. Customer Experience
- **Mandate:** Timely comms across WhatsApp, email, phone.
- **Today queue:** Customer follow-ups; unread messages when count > 0.

### 6. Operations
- **Mandate:** On-time plumbing delivery across Gauteng field teams.
- **Today queue:** Delayed jobs when count > 0.

### 7. Scheduling & Dispatch
- **Mandate:** Right technician, right job, realistic travel.
- **Today queue:** Unassigned jobs; scheduling conflicts.

### 8. Projects & Construction
- **Mandate:** Multi-day projects, BOQs, job packs.
- **Today queue:** Empty unless mission control flags project modules — no fake progress %.

### 9. HR & Workforce
- **Mandate:** Roster, timesheets, Young Guns payroll rules, certifications.
- **Today queue:** Missing check-ins when count > 0.
- **Reference:** Phase 12 `/workforce/owner` + Young Guns payroll module.

### 10. Procurement
- **Mandate:** Parts requests → POs; supplier coordination.
- **Today queue:** Empty unless low-stock/procurement signals elsewhere.

### 11. Inventory
- **Mandate:** Van and warehouse stock; avoid job-blocking shortages.
- **Today queue:** Low stock items when intelligence count > 0.

### 12. Fleet & Assets
- **Mandate:** Roadworthy vehicles; Cartrack tracking.
- **Today queue:** Fleet alerts when count > 0.

### 13. Quality
- **Mandate:** Workmanship, callbacks, job pack completeness.
- **Today queue:** Empty unless document/job-pack records require review.

### 14. Health Safety & Compliance
- **Mandate:** Site safety; COHS-aligned documentation.
- **Today queue:** Mission control security/legal signals when attention_required.

### 15. Legal Risk & Internal Control
- **Mandate:** POPIA, contracts, internal control.
- **Today queue:** Shares approvals-waiting with executive/AURA when present.

### 16. IT & Cybersecurity
- **Mandate:** Secure access; truthful integration health.
- **Today queue:** Integration module attention from mission control.

### 17. Data & Analytics
- **Mandate:** Decision-ready views from real tenant data.
- **Today queue:** Empty when no analytics alerts — honest empty states.

### 18. Administration
- **Mandate:** Company profile, billing, team access, records.
- **Today queue:** Empty unless role/approval workflows surface.

### 19. AURA Digital Workforce
- **Mandate:** Govern agents, automation, tenant capabilities with approval gates.
- **Today queue:** Approvals waiting (shared with executive queue item).

---

## UI surfaces

| Route | Purpose |
|-------|---------|
| `/departments` | Hub — all 19 departments with Today queue summary |
| `/departments/:departmentId` | Department workspace — queue, routines, approvals, KPIs |
| `/company-health/departments` | Redirect alias → `/departments` |
| `/mission-control` | Company Health — link to Departments |

---

## Role access

| Role | Departments hub | Department detail | Manage routes |
|------|-----------------|-------------------|---------------|
| Company Owner | ✓ | ✓ | Per RBAC |
| Manager | ✓ | ✓ | Per RBAC |
| Accountant | ✓ (if executive/analytics read) | ✓ | Finance-focused |
| Dispatcher | ✗ (blocked prefix) | ✗ | Dispatch routes only |
| Technician | ✗ | ✗ | Mobile only |

API permission gate: `executive:read`, `analytics:read`, `ops:read`, or `*`.

---

## Related deliverables

- `TITAN_DEPARTMENT_RACI_MATRIX.md`
- `TITAN_DEPARTMENT_HANDOFF_MATRIX.md`
- `TITAN_DEPARTMENT_RECURRING_ROUTINES.md`
- `diagnostic-output/245-corporate-department-model-verify.mjs`
- `TITAN_PHASE_13_CORPORATE_DEPARTMENTS_REPORT.md`

---

## Audit principle

Every Today queue item must trace to:
1. `priorities.actionQueue[]` on executive-summary, or
2. A labelled `todayAtAGlance` count with count > 0, or
3. A mission control module with status `attention_required` or `critical`.

If none apply, the department shows an **honest empty queue**.
