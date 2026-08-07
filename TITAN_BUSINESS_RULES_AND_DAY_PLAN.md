# TITAN Business Rules & Today's Plan

Owner-facing AURA add-ons — structured business rules and daily operational focus. **Staging only** until Owner approval.

## Reconciliation with worker 19fb2991

Worker 19fb2991 added uncommitted day-plan foundation on `cursor/titan-frozen-scope-completion`:

| Existing (extended) | This session |
|---------------------|--------------|
| Migration `0113_company_day_plans` | Kept — extended via `0115` |
| `company_day_plans` table | Extended columns (department, source, business_rule_id, …) |
| `/intelligence/day-plans` API | Kept + alias `/intelligence/todays-plan` |
| `DayPlanningPanel` on AURA / Company Health | Kept as compact panel |
| `TITAN_DAY_PLANNING.md` | Superseded by this doc |

## Navigation

Compact tabs on AURA section (`AuraSectionNav`):

| Tab | Route |
|-----|-------|
| AURA Executive Chat | `/aura` |
| Today's Plan | `/aura/todays-plan` |
| Business Rules | `/aura/business-rules` |
| AURA Team | `/aura/agents` |

## Part A — Quick memory Save button

- Smaller compact Save on `AuraQuickMemoryInput` (navy primary, no keyboard hints)
- Inline Saving / Saved / Failed status unchanged

## Part B — Business Rules

### Data model — migration `0114_company_business_rules`

- `company_business_rules` — name, department, instruction, rule_type, category, frequency_cron, assigned_agent_role, approval fields, status, schedule timestamps, audit
- `business_rule_tasks` — scheduled rule review tasks (pending/completed/skipped/cancelled)
- `agent_executions.business_rule_id` — execution linkage

### API — `/api/v1/intelligence/business-rules`

| Method | Route | Access |
|--------|-------|--------|
| GET | `/business-rules` | intelligence/executive read |
| POST | `/business-rules` | Owner/Admin write |
| PATCH | `/business-rules/:id` | Owner/Admin write (pause/archive/edit) |

Dedupe on normalized instruction. Audit log entries on create/update/pause/archive.

### Rule enforcement

- Active rules injected into AURA context (`businessRules` block)
- Scheduled rules create `business_rule_tasks` + day plan items — **no auto-pay, no auto-send**
- Agents cannot silently modify rules (read-only in prompts)

## Part C — Today's Plan

### Data model — migration `0115_company_day_plan_extend`

Extends `company_day_plans` (alias `company_day_plan_items` in spec):

- department, assigned_user_id, assigned_agent_role, due_time, progress_pct, approval_required, source, business_rule_id

### API — `/api/v1/intelligence/todays-plan`

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/todays-plan` | Sectioned today view + progress summary + EOD review |
| GET | `/todays-plan/suggest` | Morning suggestions from real tenant data |
| POST | `/todays-plan` | Add priority |
| PATCH | `/todays-plan/:id` | Complete / archive / update |

Legacy `/day-plans` routes retained for Mission Control compact panel.

### Morning suggest (real data)

Counts from DB only:

- Jobs scheduled today (`jobs.scheduled_at`)
- Inbound comms awaiting response (`communications` inbound + logged_only)
- Overdue sent quotes (`quotes.valid_until` past date)
- Overdue invoices
- Pending Xero write approvals

### Business Rules connection

Scheduled rules due today auto-appear in Today's Plan (Finance section for finance category rules; wages `monthly:25` on the 25th).

## Part D — Agent context

`buildSelectedAuraContext` injects:

- `dayPlan` — today's active priorities
- `businessRules` — active structured rules

Prompts reference both; agents must not invent or mutate them.

## Part E — Tests

- `apps/api/src/routes/intelligence-business-rules.test.ts` — dedupe, schedule, RBAC error codes
- `apps/api/src/routes/intelligence-day-plan.test.ts` — day plan RBAC/dedupe
- `apps/api/src/services/company-business-rules.test.ts` — payroll schedule, paused exclusion contract
- `packages/shared/src/day-planning.test.ts` — normalization

## Deferred (Owner approval required before production)

| Item | Status |
|------|--------|
| Full cron expression parser | Simple `daily` / `monthly:N` / `weekly:day` only |
| NL parse endpoint `POST /todays-plan/parse` | Not implemented — use morning suggest + manual add |
| Full item_status enum (working/blocked/carried_forward) | Uses stored `active`/`completed`/`archived`; UI maps active→Planned |
| Production migration/deploy | **STOP — staging only** |

## Staging deploy steps (Owner verify)

1. Apply migrations `0113`, `0114`, `0115` on staging DB
2. Redeploy API + web on branch `cursor/titan-frozen-scope-completion`
3. Owner login → `/aura/business-rules` — add rule, pause, edit drawer
4. `/aura/todays-plan` — add priority, accept morning suggestion (if real data exists)
5. `/aura` — compact Save on quick memory; verify AURA chat references rules/plan in context
6. Confirm no payment/send triggered by scheduled payroll rule

**STOP FOR OWNER APPROVAL** before production.
