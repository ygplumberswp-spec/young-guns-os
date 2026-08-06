# TITAN Day Planning / Today's Priorities

Owner-facing daily operational focus — distinct from permanent AURA memory rules and fake task lists.

## UI

| Location | Component | Access |
|----------|-----------|--------|
| Company Health (`/mission-control`) | `DayPlanningPanel` in dashboard **Today's priorities** card | Read: executive/intelligence · Write: Owner/Admin |
| AURA Executive Chat (`/aura`) | Compact `DayPlanningPanel` in intelligence panel | Same RBAC |

- One-line input + optional department tag + **Save** (inline status: Saving… / Saved / Retry)
- No keyboard hint copy (matches e96c450 clean save pattern)
- Status changes via explicit menu actions only — no auto-complete
- Each item: priority text, department tag, status badge, set-at timestamp

## Status model

| Status | Meaning |
|--------|---------|
| Planned | Default on create |
| In progress | Owner marked active work |
| Done | Explicitly completed |
| Deferred | Pushed off today's focus |

Incomplete `planned` / `in_progress` items carry forward from prior days until done or deferred.

## API

| Method | Route | Access |
|--------|-------|--------|
| GET | `/intelligence/day-plans?date=YYYY-MM-DD` | `intelligence:*` or `executive:*` read |
| POST | `/intelligence/day-plans` | Owner / legacy Admin (`requireCompanyMemoryWrite`) |
| PATCH | `/intelligence/day-plans/:id` | Owner / legacy Admin |
| DELETE | `/intelligence/day-plans/:id` | Owner / legacy Admin |

Tenant isolation via `companyId`. Audit: `createdByUserId`, `updatedByUserId`, timestamps, `security_audit_logs` on mutations.

## AURA context

`CompanyDayPlanService.buildAuraContext()` injects active priorities into executive prompts (`dayPlanning` context). Read-only — AURA must not invent or auto-complete priorities.

## Migration

`packages/db/drizzle/0113_company_day_plans.sql` — table `company_day_plans` with category/status enums and normalized dedupe index.

## Tests

- `packages/shared/src/day-planning.test.ts`
- `apps/api/src/routes/intelligence-day-plan.test.ts`
- `packages/auth/src/rbac-matrix.test.ts` — shared `canWriteCompanyMemory` gate

## Staging deploy

1. Apply migration `0113_company_day_plans` on staging
2. Redeploy API + web on `cursor/titan-frozen-scope-completion`
3. Owner manual verify on Company Health + AURA pages

**STOP FOR OWNER APPROVAL** before production.
