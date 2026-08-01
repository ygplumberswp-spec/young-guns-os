# TITAN CAL-001 — Scheduling UX Correction Report

**Branch:** `cursor/cal-001-scheduling-calendar`  
**Worktree:** `Titan-Aura-CAL-001`  
**Environment:** Staging only  
**Date:** 2026-08-01

---

## What was wrong

The CAL-001 feature shipped the scheduling **API, conflict service, and calendar components**, but the `/scheduling` page still felt like a **secondary list widget**, not a dispatch calendar:

1. **Column list layout** — jobs stacked vertically per day inside a `Panel`, with no time axis, working-hours grid, or current-time indicator.
2. **Titan Aura V1 regression pattern** — older worktree used a **2-column layout** (`scheduling-layout`) with a permanent **“Schedule a job” form** (`ScheduleJobForm`) beside the calendar; CAL-001 removed the form but kept the list-in-columns presentation.
3. **No primary calendar chrome** — toolbar/filters existed but the main surface was boxed in a panel title “Calendar” rather than a full-height grid.
4. **Missing dispatch affordances** — no collapsible unscheduled tray, no job preview drawer, month→day drill-down, or status-coloured blocks.

---

## UX corrections delivered

| Requirement | Implementation |
|-------------|----------------|
| Calendar as main view | Full-height `cal-shell__main` time grid; removed list-column `Panel` wrapper |
| Week default (dispatch) | `defaultCalendarView('/scheduling') → 'week'` in `useCalendarState` |
| Day / week time grid | `CalendarTimeGrid.tsx` — hours left, days/technician lanes top, working hours, now-line |
| Month view | `CalendarMonthGrid.tsx` — counts, dots, click day → day view |
| Job cards | Status-coloured blocks + text badges (`CalendarJobCard` + CSS modifiers) |
| Click slot → schedule | Empty hour slots + modal drawer (no permanent form) |
| Click job → preview drawer | `JobPreviewDrawer.tsx` — Open, Unschedule, Cancel, Duplicate link |
| Drag-drop | Tray → grid + grid reschedule with conflict flow preserved |
| Unscheduled tray | Collapsible `UnscheduledJobsTray.tsx` (unassigned, needs scheduling, delayed, conflict review) |
| Filters + persistence | Toolbar filters incl. team (role), job type (client) + Clear; `useCalendarState` + nav history |
| Mobile `/mobile/schedule` | Day default + current/next job highlights above day calendar |
| Conflict prevention | Unchanged CAL-001 `scheduling-conflict.service.ts` + modals |

---

## Files changed

### New
- `apps/web/src/components/calendar/CalendarTimeGrid.tsx`
- `apps/web/src/components/calendar/CalendarMonthGrid.tsx`
- `apps/web/src/components/calendar/UnscheduledJobsTray.tsx`
- `apps/web/src/components/calendar/JobPreviewDrawer.tsx`
- `TITAN_CAL001_SCHEDULING_UX_REPORT.md`

### Updated
- `apps/web/src/components/calendar/SchedulingCalendar.tsx` — primary calendar orchestration
- `apps/web/src/components/calendar/CalendarJobCard.tsx` — status colours, click handler
- `apps/web/src/components/calendar/CalendarFilters.tsx` — job type, clear filters
- `apps/web/src/components/calendar/calendar-utils.ts` — time grid helpers, status classes
- `apps/web/src/components/calendar/useCalendarState.ts` — pathname defaults, jobType persist
- `apps/web/src/components/calendar/ScheduleSlotModal.tsx` — slot time + default technician
- `apps/web/src/components/calendar/index.ts`
- `apps/web/src/components/calendar/useCalendarState.test.ts`
- `apps/web/src/pages/scheduling/SchedulingPage.tsx` — calendar-first page shell
- `apps/web/src/pages/mobile/MobileSchedulePage.tsx` — timeline highlights
- `apps/web/src/index.css` — time grid, tray, drawer, status colours, mobile highlights

### Not touched (CAL-001 preserved)
- `apps/api/src/services/scheduling-conflict.service.ts`
- `packages/db/drizzle/0117_scheduling_calendar.sql`
- `apps/api/src/routes/scheduling/calendar.ts`

---

## Default view

| Route | Default view |
|-------|--------------|
| `/scheduling` | **Week** |
| `/mobile/schedule` | **Day** |

---

## Verification

| Check | Result |
|-------|--------|
| `pnpm run typecheck` | PASS |
| `pnpm run test` | PASS |
| `pnpm --filter @titan/web run build` | PASS |

---

## Staging

| Service | URL |
|---------|-----|
| Web | https://comfortable-determination-staging.up.railway.app/scheduling |
| Mobile schedule | https://comfortable-determination-staging.up.railway.app/mobile/schedule |
| API health | https://young-guns-os-staging.up.railway.app/api/v1/health/ready |

Deploy: commit `00f1da0` pushed to `cursor/cal-001-scheduling-calendar` → Railway autodeploy **SUCCESS** (staging web deployment `045e9f96-c3c7-4161-9dec-929ea95b789b`).

---

## Screenshot notes (for owner review)

1. **Week view** — 7-day time grid, hour labels, red now-line on today, coloured job blocks positioned by start time.
2. **Day view** — technician lanes (one column per assignee) with filtered events.
3. **Month view** — compact cells with job count; click navigates to day view for that date.
4. **Unscheduled tray** — collapsed by default at bottom; expand to drag jobs onto grid.
5. **Job drawer** — right-side preview on block click; actions without leaving calendar.
6. **Mobile** — “Current job” / “Next up” cards above day timeline.

---

## Remaining gaps

1. **Resize duration** — drag handle to extend/shrink `scheduledEndAt` not yet implemented (drop/move only).
2. **Team filter** — client-side filter by assignee `roleName` (no dedicated team entity on calendar API).
3. **Duplicate as draft** — links to `/jobs/new?duplicateFrom=`; create page may not pre-fill from query yet.
4. **Overlap layout** — concurrent jobs in same lane render stacked absolute positions (may visually overlap; no lane-packing algorithm).
5. **Tablet swipe nav** — horizontal scroll on grid; native swipe gestures not added.
6. **Screenshots** — capture manually on staging after deploy for acceptance pack.

---

## Branch isolation

- Work done only on `cursor/cal-001-scheduling-calendar` / `Titan-Aura-CAL-001`.
- No changes on `cursor/visual-alignment-polish` / dashboard spacing worker.
- Titan Aura V1 main tree unchanged (still has legacy list+form scheduling page).
