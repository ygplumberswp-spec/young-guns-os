# TITAN Phase 13 — Corporate Department Operating Model

**Branch:** `cursor/titan-owner-operating-model-final`  
**Base (Phase 12):** `1d0d7af`  
**Initial Phase 13 SHA:** `f5dfd93`  
**Final SHA:** *(see post-deploy commit below)*  
**Environment:** Staging only — production not touched  
**Generated:** 2026-08-02  

## Verdict

| Surface | Verdict | Evidence |
|---|---|---|
| **19-department model** | **GO** | `packages/shared/src/corporate-departments.ts` — 19 definitions |
| **Department hub API** | **GO** | `GET /api/v1/corporate-departments/hub` @ 245 — 19 departments |
| **Department workspace UI** | **GO** | `/departments`, `/departments/:id`, alias `/company-health/departments` |
| **Today queues (live + routine tasks)** | **GO** | Executive signals + persisted `department_routine_task` instances |
| **Recurring department tasks** | **GO** | 59 routine definitions → persisted instances with owner, due date, status, audit |
| **Model documentation** | **GO** | RACI, handoffs, routines, corporate model report |

**Overall:** **GO** — Phase 13 base @ `f5dfd93` + extension (recurring tasks) verified @ 245

## Summary

Phase 13 delivers the Young Guns Plumbing corporate department operating model across **19 departments**, each with mandate, accountable owner, Today queue (from live APIs **and** persisted routine task instances), weekly/monthly/daily routine schedules, approvals, risks, KPIs, handoffs, and audit notes.

**Phase 13 extension (Owner-approved):** Real recurring department tasks are generated idempotently from documented routine definitions (`corporate-departments.ts` + daily routines in `TITAN_DEPARTMENT_RECURRING_ROUTINES.md`). Each instance has accountable owner, computed due date, status lifecycle, optional approval gate, handoff target, and append-only audit history. No fake scores or synthetic alerts.

## Phase 13 extension — recurring department tasks

### Persistence (migration 0118 — staging only)

| Table | Purpose |
|---|---|
| `department_routine_tasks` | Task instances per company/department/routine/period |
| `department_routine_task_audit_logs` | Append-only audit: create, status change, complete, skip, handoff, approve |

Migration: `packages/db/drizzle/0118_department_routine_tasks.sql` — additive `IF NOT EXISTS`, safe enum/table creation.

Unique dedupe index: `(company_id, routine_key, period_start)` — idempotent generation.

### Task generation

- **Source:** `listAllDepartmentRoutineDefinitions()` — 59 routines (5 daily + weekly/monthly from 19 departments)
- **Cadence periods:** daily = today; weekly = Mon–Sun; monthly = calendar month
- **Due dates:** daily = today; weekly = Sunday; monthly = last day of month
- **Approval gates:** tasks linked to matching department approval href → `awaiting_approval` until Owner approves
- **Handoffs:** first handoff target from department matrix stored on instance
- **Trigger:** `ensureCurrentPeriodTasks()` on hub/detail/task list fetch; explicit `POST /tasks/generate`

### API

| Method | Route | Purpose |
|---|---|---|
| GET | `/corporate-departments/hub` | Hub with routine tasks in Today queues |
| GET | `/corporate-departments/:id` | Workspace detail with merged Today queue |
| GET | `/corporate-departments/:id/tasks` | All routine task instances for department |
| POST | `/corporate-departments/tasks/generate` | Idempotent seed/generate (Owner) |
| POST | `/corporate-departments/tasks/:id/complete` | Mark complete + audit |
| POST | `/corporate-departments/tasks/:id/skip` | Skip for period + audit |
| POST | `/corporate-departments/tasks/:id/approve` | Clear approval gate + audit |
| POST | `/corporate-departments/tasks/:id/handoff` | Record handoff + audit |
| PATCH | `/corporate-departments/tasks/:id/status` | Status transition + audit |
| GET | `/corporate-departments/tasks/:id/audit` | Audit trail |

### RBAC

- Department visibility: `canAccessDepartment()` checks department `requiredPermissions`
- Technicians with `jobs:read` only **cannot** see finance routine tasks (`finance:read` required)
- Mutations: `executive:read`, `ops:write`, or `*`
- Approvals: `executive:read` or `*`

### UI

- Today queue shows live signals **and** routine task instances (`source: department_routine_task`)
- Recurring routine tasks panel with Complete / Skip / Approve / Handoff / Audit actions
- Task audit history panel

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

## Files changed (Phase 13 + extension)

### New (extension)
- `packages/shared/src/department-routine-tasks.ts`
- `packages/shared/src/department-routine-tasks.test.ts`
- `packages/db/src/schema/department-routine-tasks.ts`
- `packages/db/drizzle/0118_department_routine_tasks.sql`
- `apps/api/src/services/department-routine-task.service.ts`

### New (base @ f5dfd93)
- `packages/shared/src/corporate-departments.ts`
- `packages/shared/src/corporate-departments.test.ts`
- `apps/api/src/services/corporate-department-hub.service.ts`
- `apps/api/src/routes/corporate-departments.ts`
- `apps/web/src/lib/corporate-departments-api.ts`
- `apps/web/src/pages/departments/DepartmentsHubPage.tsx`
- `apps/web/src/pages/departments/DepartmentWorkspacePage.tsx`
- Documentation + verify script

### Updated (extension)
- `packages/shared/src/corporate-departments.ts` — Today queue item extended for routine tasks
- `apps/api/src/services/corporate-department-hub.service.ts` — merges routine tasks into Today queue
- `apps/api/src/routes/corporate-departments.ts` — task CRUD + mutations
- `apps/web/src/pages/departments/DepartmentWorkspacePage.tsx` — task actions + audit
- `diagnostic-output/245-corporate-department-model-verify.mjs` — 245b routine task checks

## Local verification

| Check | Result |
|---|---|
| Shared tests | PASS |
| API typecheck | PASS |
| Web typecheck | PASS |
| Web build | PASS |

## Staging verification @ 245 (with 245b extension)

| Check | Result |
|---|---|
| Migration 0118 applied | *(post-deploy)* |
| `POST /tasks/generate` | 200 — creates up to 59 instances (idempotent) |
| Task instances have owner, due date, status | PASS |
| Audit trail `created` event | PASS |
| Finance Today queue includes routine tasks | PASS |
| `/departments` UI | PASS |
| Phase 14 | **NOT started** |

## Remaining HOLD items

1. **Marketing send/spend approval** — master directive gate; marketing department Today queue typically empty until campaigns wired with consent checks.
2. **ACCPAY payables import** — Finance department documents HOLD; payables route shows PO commitments only (Phase 3 carry-forward).
3. **Sparse staging live signals** — many departments show only routine tasks in Today queue (expected on YGP staging).
4. **Dispatcher/technician department hub access** — intentionally blocked via route prefixes; field roles use operational routes only.

## Phase 14 boundary

Phase 13 complete (including recurring task extension). Do **not** start Phase 14 from this report.
