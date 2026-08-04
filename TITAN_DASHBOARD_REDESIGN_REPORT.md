# TITAN Dashboard Redesign Report

**Branch:** `cursor/titan-frozen-scope-completion`  
**Date:** 2026-08-01  
**Environment:** Staging only (no production changes)  
**Scope:** Premium executive owner dashboard + Customer Value bug fix

---

## 1. Executive summary

Replaced the cluttered owner dashboard with a premium executive overview: greeting header with real counts, grouped Quick Actions, four “Today at a glance” summary cards, Live operations, Completed today, Today’s priorities summary (linked to `/aura/todays-plan`), Team today, and Customer value (verified buckets only). Added `GET /api/v1/dashboard/executive-summary` composing existing tenant-scoped services. Fixed Customer Value panel to never show generic “unexpected error” — truthful Xero-sync and empty-verified states instead.

---

## 2. Customer Value bug (Priority 1)

### Root cause

- Staging probe (`182-customer-value-classification-staging-probe.json`) showed the classification API **works** when DB is reachable (678 Xero contacts, 0 qualifying invoice evidence, `dataCompleteness: partial` while Xero import active).
- Post-Xero-go probe (`201-cv-001b-post-xero-go.json`) recorded failed import job with `last_sync_at` null — partial/stale sync state.
- UI surfaced `An unexpected error occurred` when `/customers/value-metrics` returned HTTP 500 (`INTERNAL_ERROR` from global error handler) or when the panel treated any fetch failure as “Customer value metrics unavailable”.
- Dashboard incorrectly implied all CRM records were “customers” (678 prospect contacts from Xero).

### Fix (smallest correct)

| Layer | Change |
|-------|--------|
| API `customers.ts` | Catch non-classification errors → HTTP 503 `CUSTOMER_VALUE_UNAVAILABLE` with message “Customer value is updating from Xero” (never re-throw to generic 500) |
| `CustomerValueMetricsPanel` | Truthful states: updating from Xero, no verified data yet; retry per section; show **verified buckets only** (`CUSTOMER_VALUE_VERIFIED_FILTER_KEYS`) |
| `@titan/shared` | Added `CUSTOMER_VALUE_NO_VERIFIED_DATA_MESSAGE`, `CUSTOMER_VALUE_UPDATING_FROM_XERO_MESSAGE`, `CUSTOMER_VALUE_VERIFIED_FILTER_KEYS` |

Metrics still drill down via `/crm?classification={filterKey}`. Prospect/supplier-only Xero contacts are excluded from dashboard value cards.

---

## 3. Dashboard redesign (Priority 2)

### Removed clutter

- Long inline quick-action link rows (`DashboardQuickActions` removed from page)
- Separate Attention panel (`DashboardEmptyPanels` removed from page)
- Duplicate stat grid + welcome line (`DashboardStats` removed from page)
- Agent activity card on main dashboard (kept available elsewhere)

### New layout

| Section | Component | Data source |
|---------|-----------|-------------|
| Header | `ExecutiveDashboardHeader` | Executive summary `header` + user first name |
| Quick Actions ▾ | `QuickActionsDropdown` | RBAC-grouped routes (Advanced PO if procurement permission) |
| Today at a glance | `TodayAtAGlanceGrid` | Executive summary `todayAtAGlance` |
| Live operations | `LiveOperationsPanel` | `liveOperations` |
| Completed today | `CompletedTodayPanel` | `completedToday` |
| Priorities | `PrioritiesSummaryPanel` | `priorities` + link to `/aura/todays-plan` |
| Team today | `TeamTodayPanel` | `teamToday` (no payroll/HR) |
| Customer value | `CustomerValueMetricsPanel` (compact) | Existing `/customers/value-metrics` |

### Visual design

- Dark navy/chrome via existing `ux.css` tokens and new `.exec-dashboard-*` rules in `index.css`
- `SummaryCardGrid`, `StatusBadge`, `EmptyState`, skeleton shimmer per section
- Responsive two-column → single-column under 960px

### Loading behaviour

- Page shell renders immediately
- Single parallel fetch: `dashboard/executive-summary`
- Section skeletons while loading; shared retry on failure
- Customer value loads independently (cached query)

---

## 4. API — `GET /api/v1/dashboard/executive-summary`

**File:** `apps/api/src/routes/dashboard.ts`  
**Service:** `apps/api/src/services/dashboard-executive.service.ts`  
**Types:** `packages/shared/src/dashboard-executive.ts`

Composes (parallel, tenant-scoped):

- `JobsService` — stats, today’s jobs
- `SchedulingService` — calendar, assignees, delayed jobs
- `FinanceService` + intelligence outstanding totals — money today
- `IntelligenceService` — approvals, follow-ups, critical issues
- `CompanyDayPlanService` — priorities / approvals / blocked counts
- Direct DB reads — completed today, leads, communications, team roster, mobile time entries

**RBAC:** `jobs:read|write`, `finance:read|write`, `intelligence:read`, `executive:read`, or `dispatch:read`

---

## 5. Settings scaffold

**Route:** `/settings/dashboard`  
**Page:** `apps/web/src/pages/settings/DashboardSettingsPage.tsx`

Documents default Young Guns section visibility and quick-action groups. Persistence deferred — defaults work without config.

---

## 6. Coordination notes

| Commit / feature | Integration |
|------------------|-------------|
| `1b31672f` dashboard cleanup | Extended via new executive components; removed duplicate panels rather than re-adding |
| `6c039fb2` Today's Plan | Header + priorities link to `/aura/todays-plan` |
| `f2c69b9` Business rules / day plan | Priorities counts from `CompanyDayPlanService.getTodayPlan` |
| UX components | `PageHeader`, `SummaryCardGrid`, `CompactTabs`, `StatusBadge`, `EmptyState`, `QuickActionsDropdown` alias |

---

## 7. Validation

| Check | Result |
|-------|--------|
| `pnpm run typecheck` | PASS |
| `pnpm --filter @titan/web run build` | PASS |
| `pnpm --filter @titan/shared run test` | 125 pass |
| `pnpm --filter @titan/api run test` | 352 pass |
| Customer value tests | PASS (existing + verified-bucket constants) |

---

## 8. Staging deploy

| Service | Action | Status |
|---------|--------|--------|
| API | Railway CLI deploy (API route added) | **Pending Owner review** — run `railway up` from repo with staging project linked |
| Web | Railway CLI deploy | **Pending Owner review** |

> Railway CLI was not authenticated in the agent environment. Owner should deploy both services from branch tip after review.

---

## 9. Files changed (summary)

### API
- `apps/api/src/services/dashboard-executive.service.ts` (new)
- `apps/api/src/routes/dashboard.ts` (new)
- `apps/api/src/routes/customers.ts` (error handling)
- `apps/api/src/index.ts` (wire router)

### Shared
- `packages/shared/src/dashboard-executive.ts` (new)
- `packages/shared/src/customer-value-classification.ts` (messages + verified keys)
- `packages/shared/src/index.ts` (export)

### Web
- `apps/web/src/features/dashboard/ExecutiveDashboard.tsx` (new)
- `apps/web/src/features/dashboard/ExecutiveDashboardHeader.tsx` (new)
- `apps/web/src/features/dashboard/QuickActionsDropdown.tsx` (new)
- `apps/web/src/features/dashboard/TodayAtAGlanceGrid.tsx` (new)
- `apps/web/src/features/dashboard/LiveOperationsPanel.tsx` (new)
- `apps/web/src/features/dashboard/CompletedTodayPanel.tsx` (new)
- `apps/web/src/features/dashboard/PrioritiesSummaryPanel.tsx` (new)
- `apps/web/src/features/dashboard/TeamTodayPanel.tsx` (new)
- `apps/web/src/features/dashboard/DashboardSectionSkeleton.tsx` (new)
- `apps/web/src/features/crm/CustomerValueMetricsPanel.tsx` (bug fix)
- `apps/web/src/lib/dashboard-api-client.ts` (new)
- `apps/web/src/pages/dashboard/DashboardPage.tsx` (redesign)
- `apps/web/src/pages/settings/DashboardSettingsPage.tsx` (new)
- `apps/web/src/App.tsx`, `owner-pages.tsx` (routes)
- `apps/web/src/index.css` (exec dashboard styles)

---

**STOP — awaiting Owner review before staging deploy.**
