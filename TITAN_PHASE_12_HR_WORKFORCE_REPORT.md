# TITAN Phase 12 — HR, Workforce, Timesheets and Payroll Support

**Branch:** `cursor/titan-owner-operating-model-final`  
**Base (Phase 11):** `68975f3`  
**Code SHA:** `aa3218f`  
**Final SHA:** `aa3218f`  
**Environment:** Staging only — production not touched  
**Generated:** 2026-08-02

## Verdict

| Surface | Verdict | Evidence |
|---|---|---|
| **Owner workforce view** | **GO** | `/workforce/owner` + `GET /enterprise-workforce/owner-workforce` @ 244 |
| **Young Guns payroll rules** | **GO** | Calculation service + UI display (07:00–17:00, 30-min lunch, OT after 17:00, Saturday OT) |
| **Timesheet / payroll RBAC** | **GO** | Workforce-wide timesheets and payroll prep require write/manage; technicians lack workforce/finance permissions |
| **Technician RBAC automated proof** | **HOLD** | No active technician user on YGP staging for session mint (237/243 pattern) |

**Overall:** **GO** @ `aa3218f` — authenticated staging verification 244 (0 blockers)

## Summary

Phase 12 delivers an owner workforce dashboard aggregating real attendance, jobs, vehicles, hours, overtime, delays, missing timesheets, leave, and certifications. Young Guns payroll rules are implemented in a shared calculation module and surfaced on the owner view. Payroll preparation remains approval-gated; timesheet corrections remain audited via existing WI platform. No demo or fake payroll/timesheet data is injected.

## Deliverables

| Deliverable | Path |
|---|---|
| Phase 12 report | `TITAN_PHASE_12_HR_WORKFORCE_REPORT.md` |
| Staging verify script | `diagnostic-output/244-hr-workforce-verify.mjs` |
| Staging verify JSON | `diagnostic-output/244-hr-workforce-verify.json` |
| Staging screenshots | `diagnostic-output/phase12-hr-workforce-staging/` |

## Scope delivered

### Owner workforce view (`/workforce/owner`)
- Attendance / check-in status from mobile time entries
- Current job and next job from today's scheduled jobs
- Assigned vehicle from fleet records
- Hours and overtime via Young Guns calculation where clock pairs exist
- Jobs completed today, delay flags, missing timesheet flags
- On-leave status from leave applications
- Certifications (incl. expiring-soon) from workforce records
- Honest empty states when roster or clock data is sparse (staging: 1 member, sparse timesheets)

### Young Guns payroll rules
- Normal hours 07:00–17:00 (`packages/shared/src/young-guns-payroll.ts`)
- 30-minute lunch deduction when shift exceeds 4 hours
- Overtime after 17:00 on weekdays
- Saturday — all net hours count as overtime
- Payroll changes require approval; corrections audited (existing WI timesheet correction audit trail)

### RBAC
| Endpoint / surface | Technician | Owner |
|---|---|---|
| `GET /enterprise-workforce/owner-workforce` | Blocked (no `workforce:write`) | Allowed |
| `GET /enterprise-workforce/dashboard` | Blocked (no `workforce:read`) | Allowed |
| `GET /enterprise-workforce/payroll/preparations` | Blocked (requires `workforce:write`) | Allowed |
| `GET /enterprise-workforce/timesheets` (all) | Blocked (scoped to own or write) | Allowed |
| Finance receivables / margins | Blocked (no `finance:read`) | Allowed |

Technicians retain mobile-only time entry via `/mobile/technician/workforce/time` — no workforce-wide payroll or others' hours.

## Files changed (Phase 12)

### New
- `packages/shared/src/young-guns-payroll.ts`
- `packages/shared/src/young-guns-payroll.test.ts`
- `packages/shared/src/owner-workforce.ts`
- `apps/web/src/pages/workforce/OwnerWorkforcePage.tsx`
- `apps/web/src/lib/owner-workforce-api.ts`
- `diagnostic-output/244-hr-workforce-verify.mjs`

### Updated
- `apps/api/src/services/enterprise-workforce-intelligence.service.ts` — `getOwnerWorkforceView`
- `apps/api/src/routes/enterprise-workforce-intelligence.ts` — owner-workforce route, timesheet scoping, payroll RBAC
- `apps/web/src/App.tsx`, `owner-pages.tsx`, `back-navigation.ts`, `index.css`
- `apps/web/src/pages/workforce-intelligence/WorkforceIntelligencePage.tsx` — Owner Workforce link
- `apps/web/src/features/workforce-intelligence/utils.ts` — `canAccessOwnerWorkforce`
- `packages/shared/src/index.ts`, `packages/shared/package.json`

## Local verification

| Check | Result |
|---|---|
| Shared tests (incl. Young Guns payroll) | PASS (142 tests) |
| API typecheck | PASS |
| Web typecheck | PASS |
| Web build | PASS |

## Staging verification @ 244

| Check | Result |
|---|---|
| API health/ready | PASS |
| Owner session mint (237 pattern) | PASS |
| `GET /enterprise-workforce/owner-workforce` | 200 — payroll rules, summary, members, disclaimer |
| `/workforce/owner` UI — Young Guns rules visible | PASS |
| `/workforce-intelligence`, `/workforce/manager`, `/workforce/day-timeline` | PASS |
| Screenshots | `owner-workforce-1440.png`, `workforce-intelligence-1440.png` |
| Console errors | None |

**Staging deploy IDs**

| Service | Deployment ID |
|---|---|
| API (`young-guns-os`) | `2037ca9d-d0e8-4a8e-a785-4d654b8a814c` |
| Web (`comfortable-determination`) | `4dca33ed-1500-4268-98c3-c87c0eaf893e` |

## Remaining HOLD items

1. **Technician RBAC automated verify** — no active technician user on YGP staging for 244 mint; code-level permission matrix blocks technicians from owner workforce, payroll prep, and finance routes.
2. **Sparse workforce clock data on staging** — owner view shows honest empty/zero hour states until field teams log real clock-in/out pairs.
3. **Payroll provider export** — preparation batches exist; live Sage/Xero payroll sync remains a future integration gate.
4. **Payroll / VAT estimates in cashflow** — deferred from Phase 3; not wired in this phase.

## Phase 13 boundary

Phase 12 complete. Do **not** start Phase 13 from this report.
