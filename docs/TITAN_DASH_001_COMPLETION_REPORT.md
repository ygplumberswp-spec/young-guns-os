# TITAN DASH-001 — Owner Dashboard Business Heartbeat

**Status:** STOP FOR OWNER VISUAL APPROVAL  
**Task branch:** `cursor/titan-dash-001-business-heartbeat`  
**Canonical branch:** `cursor/titan-v1-integration`  
**Starting HEAD:** `d7474edb266e244d80d9d7e8fecc4bbe16010496`

---

## Summary

DASH-001 extends the existing Owner Dashboard into a premium **Business Heartbeat** executive command centre. All metrics derive from real tenant-scoped data via `GET /api/v1/dashboard/executive-summary` — nothing is invented.

### Architecture

| Layer | Location |
|-------|----------|
| Shared builders | `packages/shared/src/dashboard-business-heartbeat.ts` |
| API aggregation | `apps/api/src/services/dashboard-executive.service.ts` |
| Web layout | `apps/web/src/features/dashboard/ExecutiveDashboard.tsx` |
| Types | `packages/shared/src/dashboard-executive.ts` |

The API builds a base executive summary, then attaches `dash001` extensions via `buildDash001Extensions()`. Each major section reports independent availability through `sections.*` — one failed source cannot blank the dashboard.

### New dashboard sections (information hierarchy)

1. **Executive header** — greeting, date, company name, business summary, priority/urgent badges, Today's Plan, Quick Actions
2. **Priority alerts strip** — critical and attention items with direct actions
3. **Business Heartbeat** — jobs, revenue, cash, gross profit/margin, debtors, quotes, leads
4. **Financial Truth** — invoiced vs collected vs outstanding; estimates labelled; Yoco ≠ reconciled
5. **Today's Operations** — Today at a Glance (existing, repositioned)
6. **Attention Required** — overdue invoices, unassigned jobs, delayed jobs, uninvoiced completions
7. **Team Performance** — technicians working, assignments, unassigned capacity
8. **Fleet & Dispatch** — Live Operations + Fleet Overview (existing, preserved)
9. **Sales & Opportunities** — leads, quotes pipeline, follow-ups
10. **AURA Executive** — evidence-backed recommendations (Draft → Approve → Execute preserved)
11. **Supporting drill-downs** — Active jobs, Outstanding invoices, Schedule, Completed today, Connections, AURA chat

### Models

| Model | Behaviour |
|-------|-----------|
| Financial truth | Invoice issued ≠ cash collected; Yoco paid ≠ Xero reconciled; partial history wording calm |
| Job operations | Real scheduled/active/completed/delayed from TITAN jobs + calendar |
| Attention | Sorted by priority then financial impact; no auto customer contact |
| Team | Operational language; no humiliating rankings |
| Fleet | Cartrack data only; live/stale/unavailable distinguished |
| Sales | Real leads/quotes only; no fake opportunities |
| AURA | Recommendations only when attention items or dispatch gaps exist |
| Alerts | Critical / Attention / Opportunity / Informational — calm, not excessive red |
| Freshness | User-friendly labels; no API routes or HTTP codes on dashboard |

### Loading and performance (PERF-001 preserved)

- Single executive-summary request with deduplicated tenant cache
- Deferred mount for ops, fleet, schedule, connections, sales, AURA chat
- Lazy-loaded AURA chat panel
- DashboardPage bundle: **68.84 kB** gzip **18.23 kB** (build evidence)
- Stable card dimensions via CSS grid; compact empty states

### RBAC

Executive summary route requires one of: `jobs:read`, `finance:read`, `intelligence:read`, `executive:read`, `dispatch:read`. Tenant isolation via `companyId` from auth token on all queries.

### UI-THEME-001 (record only — not implemented)

After all major screens are complete, apply a consistent ChatGPT-style soft off-white primary text and refined grey secondary text across TITAN dark mode while preserving accessibility, blue accents and status colours.

Recorded in: `packages/shared/src/dashboard-business-heartbeat.ts` → `UI_THEME_001_RECORD`

---

## Tests

| Suite | Tests | Pass |
|-------|------:|-----:|
| @titan/shared (incl. dashboard-business-heartbeat.test.ts) | 1136 | 1136 |
| @titan/auth | — | PASS |
| @titan/web | — | PASS |
| @titan/api (full) | 1236 | 1236 |
| **Total** | **1236+** | **1236 pass / 0 fail** |

Typecheck + API build + Web build: **PASS**

---

## Staging

| Item | Status |
|------|--------|
| Staging API health (`/api/v1/health`) | 200 before deploy |
| Staging Web | 200 before deploy |
| API deploy | Pending — push + Owner/Railway redeploy |
| Web deploy | Pending — push + Owner/Railway redeploy |
| Authenticated dashboard smoke | Pending Owner session after deploy |

---

## Confirmations

- No fake dashboard values invented
- No real financial records created
- Xero, Yoco, Facebook credentials unchanged
- 307-agent register unchanged
- Production database untouched
- XERO-002 not started

---

## Remaining gaps

- Authenticated staging visual verification (desktop 1440px, tablet 768px, mobile 390px) — requires Owner session post-deploy
- Gross margin uses estimate based on collected cash vs invoiced revenue until full costing data available
- Year-to-date financial lines empty when insufficient Xero history
- Maintenance opportunity detection limited to real leads/quotes pipeline

---

## Exact next task

**XERO-002 — Controlled Live Proof**

**STOP FOR OWNER VISUAL APPROVAL.** Do not begin XERO-002 automatically.
