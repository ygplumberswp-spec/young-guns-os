# TITAN Phase 13 — Corporate Department Operating Model

**Branch:** `cursor/titan-owner-operating-model-final`  
**Base (Phase 12):** `1d0d7af`  
**Code SHA:** `d1e67bf`  
**Final SHA:** `d1e67bf` (+ verify artifacts below)  
**Environment:** Staging only — production not touched  
**Generated:** 2026-08-02  

## Verdict

| Surface | Verdict | Evidence |
|---|---|---|
| **19-department model** | **GO** | `packages/shared/src/corporate-departments.ts` — 19 definitions |
| **Department hub API** | **GO** | `GET /api/v1/corporate-departments/hub` @ 245 — 19 departments, actionQueueTotal from real data |
| **Department workspace UI** | **GO** | `/departments`, `/departments/:id`, alias `/company-health/departments` @ 245 |
| **Today queues (real data)** | **GO** | Finance shows 1 item from executive action queue; others honestly empty where no signals |
| **Model documentation** | **GO** | RACI, handoffs, routines, corporate model report |

**Overall:** **GO** @ `d1e67bf` — authenticated staging verification 245 (0 blockers)

## Summary

Phase 13 delivers the Young Guns Plumbing corporate department operating model across **19 departments**, each with mandate, accountable owner, Today queue (from live APIs), weekly/monthly routine links, approvals, risks, KPIs, handoffs, and audit notes. A department hub aggregates real Today queues from `dashboard/executive-summary` and mission control module snapshots — no invented tasks or KPI scores.

## Deliverables

| Deliverable | Path |
|---|---|
| Corporate department model report | `TITAN_CORPORATE_DEPARTMENT_MODEL_REPORT.md` |
| RACI matrix | `TITAN_DEPARTMENT_RACI_MATRIX.md` |
| Handoff matrix | `TITAN_DEPARTMENT_HANDOFF_MATRIX.md` |
| Recurring routines | `TITAN_DEPARTMENT_RECURRING_ROUTINES.md` |
| Phase 13 report | `TITAN_PHASE_13_CORPORATE_DEPARTMENTS_REPORT.md` |
| Staging verify script | `diagnostic-output/245-corporate-department-model-verify.mjs` |
| Staging verify JSON | `diagnostic-output/245-corporate-department-model-verify.json` |
| Staging screenshots | `diagnostic-output/phase13-corporate-departments-staging/` |

## Scope delivered

### Shared model (`packages/shared/src/corporate-departments.ts`)
- 19 departments: Executive & Strategy through AURA Digital Workforce
- Action queue mapping from executive-summary categories/ids
- Mission control module mapping per department
- Weekly/monthly routine links (documented schedules, not fake cron)

### API (`GET /api/v1/corporate-departments/hub`, `GET /api/v1/corporate-departments/:id`)
- Aggregates owner action queue per department
- Supplements with honest `todayAtAGlance` counts when > 0
- Adds mission control attention/critical module items
- Empty queues when no real signals

### UI
- `/departments` — hub grid for all 19 departments
- `/departments/:departmentId` — workspace with Today queue, routines, approvals, KPIs, risks, handoffs
- `/company-health/departments` — redirect alias
- Sidebar nav + Company Health link to Departments
- RBAC: `executive:read`, `analytics:read`, `ops:read`, or `*`

## Files changed (Phase 13)

### New
- `packages/shared/src/corporate-departments.ts`
- `packages/shared/src/corporate-departments.test.ts`
- `apps/api/src/services/corporate-department-hub.service.ts`
- `apps/api/src/routes/corporate-departments.ts`
- `apps/web/src/lib/corporate-departments-api.ts`
- `apps/web/src/pages/departments/DepartmentsHubPage.tsx`
- `apps/web/src/pages/departments/DepartmentWorkspacePage.tsx`
- `TITAN_CORPORATE_DEPARTMENT_MODEL_REPORT.md`
- `TITAN_DEPARTMENT_RACI_MATRIX.md`
- `TITAN_DEPARTMENT_HANDOFF_MATRIX.md`
- `TITAN_DEPARTMENT_RECURRING_ROUTINES.md`
- `diagnostic-output/245-corporate-department-model-verify.mjs`

### Updated
- `packages/shared/src/index.ts`, `packages/shared/package.json`, `packages/shared/src/role-experience.ts`
- `apps/api/src/index.ts`
- `apps/web/src/App.tsx`, `owner-pages.tsx`, `back-navigation.ts`, `nav-groups.ts`, `index.css`
- `apps/web/src/pages/mission-control/MissionControlPage.tsx`

## Local verification

| Check | Result |
|---|---|
| Shared tests (incl. corporate-departments) | PASS (145 tests) |
| API typecheck | PASS |
| Web typecheck | PASS |
| Web build | PASS |

## Staging verification @ 245

| Check | Result |
|---|---|
| API health/ready | PASS |
| Owner session mint (237 pattern) | PASS |
| `GET /corporate-departments/hub` | 200 — 19 departments, disclaimer, actionQueueTotal=1 |
| Sample department details (5) | 200 — routines, approvals, KPIs present |
| `/departments` UI | PASS — 19 department cards |
| `/departments/finance_accounting` | PASS — Today queue with real overdue item |
| `/departments/hr_workforce` | PASS — honest empty queue |
| `/company-health/departments` | PASS — redirects to `/departments` |
| Console errors | None |

**Staging deploy IDs**

| Service | Deployment ID |
|---|---|
| API (`young-guns-os`) | `094e2899-b8e9-41d4-bb62-97e00fc3d04e` |
| Web (`comfortable-determination`) | `2ddd5ed8-0630-4ec6-80b2-d5f19f233656` |

## Remaining HOLD items

1. **Marketing send/spend approval** — master directive gate; marketing department Today queue typically empty until campaigns wired with consent checks.
2. **ACCPAY payables import** — Finance department documents HOLD; payables route shows PO commitments only (Phase 3 carry-forward).
3. **Sparse staging signals** — many departments show honest empty Today queues (expected on YGP staging with limited daily activity).
4. **Automated routine reminders** — Phase 13 documents routines as navigable links only; no fake scheduled tasks.
5. **Dispatcher/technician department hub access** — intentionally blocked via route prefixes; field roles use operational routes only.

## Phase 14 boundary

Phase 13 complete. Do **not** start Phase 14 from this report.
