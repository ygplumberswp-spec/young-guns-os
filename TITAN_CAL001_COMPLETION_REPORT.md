# TITAN CAL-001 — Scheduling Calendar Completion Report

**Branch:** `cursor/cal-001-scheduling-calendar`  
**Baseline:** `60b482995b4d6298afccdc3047308ce83d1322e7` (frozen — not modified)  
**Worktree:** `../Titan-Aura-CAL-001`  
**Environment:** Staging only · no production · no fake data  
**Status:** **READY FOR OWNER REVIEW** (do not merge to frozen baseline without sign-off)

---

## 1. Scope delivered

| Area | Status |
|------|--------|
| Shared calendar components (day/week/month, toolbar, filters, job cards) | Done |
| Calendar state persistence (sessionStorage + `useTitanNavigationHistory`) | Done |
| Job scheduling (slot click, drag-drop reschedule, conflict modal) | Done |
| Conflict detection service (overlap, leave, hours, travel, unavailable tech) | Done |
| RBAC (Owner/Admin/Dispatcher all techs; Technician own calendar via `/mobile/schedule`) | Done |
| Cartrack travel-time stub (honest default until routing connected) | Done |
| DB migration `0117_scheduling_calendar.sql` (buffer setting + override audit) | Done |
| API routes (`GET/POST/PATCH` calendar + conflict check) | Done |
| Unit tests (conflict, RBAC, override audit, calendar state) | Done |

---

## 2. Constraints compliance

| Constraint | Status |
|------------|--------|
| Staging only, no production | Enforced — branch/worktree isolated |
| No migrations 0107, 0109, 0110 | Not included |
| No Xero writes | No Xero code touched |
| No fake jobs/technicians/customers | Calendar reads real tenant job data only |
| RBAC + tenant isolation + audit preserved | Override reasons written to `scheduling_override_audits` |
| Premium TITAN UX (navy/blue, ux components) | Calendar uses `PageHeader`, `Panel`, `StatusBadge`, `CompactFilterTabs` |
| Frozen baseline branch untouched | Work only on `cursor/cal-001-scheduling-calendar` |

---

## 3. Routes & API

### Web
- `/scheduling` — enhanced dispatch calendar (Owner/Admin/Dispatcher)
- `/mobile/schedule` — technician own-calendar view

### API (`/api/v1/scheduling`)
- `GET /calendar?from&to&technicianId&status&suburb&priority` — calendar events + settings
- `POST /calendar/conflicts` — conflict check + suggestions
- `PATCH /calendar/:jobId` — drag-drop / calendar reschedule
- Existing `POST/PATCH /jobs/:jobId/schedule` — extended with override fields

---

## 4. Database (0117)

- `company_scheduling_settings` — `scheduling_buffer_minutes` default 15, travel + business hours
- `scheduling_override_audits` — Owner/Admin override reason + conflict snapshot

Uses existing `jobs.scheduled_at`, `scheduled_end_at`, `assigned_user_id`, `execution_phase`.

---

## 5. Calendar job card fields

Job #, customer, suburb, type, technician, start, expected finish, display status, priority.

Display statuses: Unassigned, Scheduled, Dispatched, Travelling, On site, Completed, Delayed, Cancelled.

---

## 6. Conflict detection

`apps/api/src/services/scheduling-conflict.service.ts` calculates effective window:

`start + duration + travel + buffer`

Blocks: overlaps, approved leave, outside business hours, unavailable technician, tight travel gaps.

Suggests: next hour, alternate technician, next business-day open.

Owner/Admin override: confirmation + reason → `scheduling_override_audits`.

---

## 7. Cartrack prep

`apps/api/src/services/travel-time.service.ts` — interface with configurable default minutes; detects connected Cartrack but does **not** claim live routing/ETA.

---

## 8. Tests

| Test file | Coverage |
|-----------|----------|
| `scheduling-conflict.service.test.ts` | Overlap, effective end, business hours |
| `scheduling-access.test.ts` | RBAC read scope, technician own calendar, override permission |
| `scheduling-override-audit.test.ts` | Override audit payload contract |
| `packages/shared/src/scheduling.test.ts` | Display status mapping |
| `useCalendarState.test.ts` | Session persistence shape |

---

## 9. Validation commands

```bash
cd ../Titan-Aura-CAL-001
pnpm run typecheck
pnpm --filter @titan/web run build
pnpm --filter @titan/api run build
pnpm --filter @titan/api test
pnpm --filter @titan/shared test
pnpm --filter @titan/web test
```

---

## 10. Staging deploy (Owner review)

Deploy branch `cursor/cal-001-scheduling-calendar` directly to staging:

- `young-guns-os`
- `comfortable-determination`

**Do not merge** to `cursor/titan-frozen-scope-completion` until Owner approves.

Apply migration `0117_scheduling_calendar.sql` on staging DB before calendar QA.

---

## 11. Known deferrals

- Invoice/edit autosave on schedule form (unchanged legacy panel)
- Live Cartrack travel routing (stub only)
- Dispatch Intelligence page schedule tab merge (calendar remains on `/scheduling`; dispatch intelligence unchanged)

---

## 12. Sign-off

**STOP FOR OWNER REVIEW**

Owner: verify calendar views, drag-drop reschedule, conflict override audit, and technician mobile schedule before merge or production promotion.
