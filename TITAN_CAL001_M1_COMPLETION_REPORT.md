# M1 CAL-001 — Completion Report

**Milestone:** M1 – CAL-001 (Scheduling calendar)  
**Branch:** `cursor/cal-001-scheduling-calendar`  
**Worktree:** `/Users/keanuventer/Downloads/Titan-Aura-CAL-001`  
**Date:** 2026-08-02  
**Status:** **COMPLETE — STOP FOR OWNER APPROVAL** (do not start M2)

---

## 1. Summary

CAL-001 delivers a dispatch-first scheduling calendar on existing scheduling APIs:

- Day / week / month views
- Drag-drop schedule + reschedule with conflict check + override audit
- Technician assignment from calendar (lanes, slot modal, preview drawer)
- Vehicle assignment from calendar drawer when `jobs:write` is present
- Job-list deep links (`/scheduling?jobId=&mode=reschedule`)
- Schedule cache invalidation after mutations
- Technician own calendar at `/mobile/schedule`
- Tenant isolation + RBAC preserved (`dispatch:read` / `dispatch:write` / technician own scope)
- No demo/fake data; staging-only worktree/branch

This session closed remaining gaps (deep-link, cache invalidation, drawer tech/vehicle assign) on the already-built CAL-001 branch rather than rebuilding modules.

---

## 2. Files changed (this session — incremental)

| File | Change |
|------|--------|
| `apps/web/src/lib/cache-invalidation.ts` | `invalidateAfterScheduleMutation` + hook |
| `apps/web/src/pages/scheduling/SchedulingPage.tsx` | Deep-link params, crew RBAC flag, schedule invalidation |
| `apps/web/src/pages/mobile/MobileSchedulePage.tsx` | Schedule invalidation on refresh |
| `apps/web/src/components/calendar/SchedulingCalendar.tsx` | Deep-link focus, vehicle load, assign handlers |
| `apps/web/src/components/calendar/JobPreviewDrawer.tsx` | Technician + vehicle assign UI |
| `apps/web/src/components/calendar/ScheduleSlotModal.tsx` | Preferred job preselect for deep-link |
| `apps/web/src/index.css` | Drawer assign form styles |
| `TITAN_CAL001_M1_COMPLETION_REPORT.md` | This report |

### Prior CAL-001 feature files (already on branch; not re-touched this session except as above)

Key earlier deliverables include calendar components under `apps/web/src/components/calendar/`, scheduling conflict service, access helpers, shared calendar types, API route extensions, and migration `0117`.

---

## 3. Database migrations

| Migration | Purpose | Staging | Production |
|-----------|---------|---------|------------|
| `packages/db/drizzle/0117_scheduling_calendar.sql` | `company_scheduling_settings` + `scheduling_override_audits` | **Applied** (see `diagnostic-output/211-cal001-staging-deploy.json`) | **Not applied / untouched** |

No new migration in this incremental session.

Excluded by design: `0107`, `0109`, `0110`.

---

## 4. Production untouched

**Confirmed: production was not touched.**

- Work isolated to branch `cursor/cal-001-scheduling-calendar` / worktree `Titan-Aura-CAL-001`
- Frozen baseline / production deploy path not used
- No production Railway services modified in this session
- Prior staging deploy evidence only (`sweet-victory` staging)

---

## 5. Typecheck

**PASS** — `pnpm run typecheck` (root `tsc --build` + all package typechecks)

---

## 6. API build

**PASS** — `pnpm --filter @titan/api run build`

---

## 7. Web build

**PASS** — `pnpm --filter @titan/web run build`

---

## 8. Regression tests performed

| Suite | Result |
|-------|--------|
| `apps/api` `scheduling-access.test.ts` | PASS |
| `apps/api` `scheduling-conflict.service.test.ts` | PASS |
| `apps/api` `scheduling-override-audit.test.ts` | PASS |
| `apps/web` `useCalendarState.test.ts` | PASS |
| `packages/shared` `scheduling.test.ts` (via package test script) | Run via `pnpm --filter @titan/shared run test` |

Manual/staging smoke already recorded earlier:

- API health ready 200
- Web `/scheduling` 200
- Unauthenticated calendar 401

Owner click-path still required before FRZ-006 calendar acceptance close.

---

## 9. Constraints checklist

| Constraint | Status |
|------------|--------|
| Preserve existing architecture | Yes — extends scheduling + calendar components |
| No module rebuilds | Yes |
| No demo/fake data | Yes |
| Staging only | Yes |
| Tenant isolation | Yes — company-scoped services |
| RBAC | Yes — dispatch read/write + technician own scope; crew vehicle needs `jobs:write` |
| Audit logging | Yes — `scheduling_override_audits` on conflict override |
| Incremental changes | Yes |

---

## 10. Known deferrals (not blockers for M1 gate)

- Duration resize via drag handle
- Live Cartrack travel routing (stub remains)
- Multi-member crew editor stays on job file (calendar assigns primary + vehicle)
- Overlap lane-packing visual polish
- Staging redeploy of this session’s incremental commits (pending Owner approve + push/deploy)

---

## 11. STOP

**M1 CAL-001 complete for Owner review.**

Waiting for approval before:

1. Commit/push of this session’s incremental files (if requested)
2. Staging redeploy of latest HEAD
3. Starting **M2 – JOB-360**
