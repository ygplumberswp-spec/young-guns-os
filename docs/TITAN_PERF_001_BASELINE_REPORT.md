# TITAN PERF-001 — Performance Baseline Report

**Task:** TITAN PERF-001 — Enterprise Performance Foundation  
**Captured (UTC):** 2026-08-06  
**Worktree:** `/workspace/.worktrees/titan-recovery`  
**Task branch:** `cursor/titan-perf-001-foundation`  
**Starting HEAD:** `08b08338ff2005d18a6e49a7cd852ee75d6169c3`  
**Staging Web:** https://comfortable-determination-staging.up.railway.app  
**Staging API:** https://young-guns-os-staging.up.railway.app  
**Staging DB ref:** `cpkuwtaipjxeipvbssvn`  
**Production DB ref (forbidden):** `rshuiaghmtrvvilhqpwm`  

---

## Method

| Source | Tool |
|--------|------|
| Unauthenticated network probes | `curl` timing via `scripts/perf-baseline-probe.mjs` |
| Production bundle sizes | `pnpm --filter @titan/web run build` → `apps/web/dist/assets` |
| Deployed staging bundle (pre-change) | `curl` content-length on live `index-CNrD9J3-.js` |
| Authenticated Owner route journeys | **Not measured** — no staging login session in agent environment |

Probe artifact: `diagnostic-output/titan-perf-001-baseline-probe.json`

---

## Pre-change staging (deployed SHA `08b0833`, bundle `index-CNrD9J3-.js`)

| Probe | HTTP | TTFB | Total |
|-------|------|------|-------|
| Web `/` | 200 | 109 ms | 109 ms |
| Web `/health` | 200 | 108 ms | 108 ms |
| API `/api/v1/health/ready` | 200 | 1734 ms | 1734 ms |
| API `/api/v1/crm/customers?limit=20` | 401 | 112 ms | 112 ms |
| API `/api/v1/jobs?limit=20` | 401 | 108 ms | 108 ms |
| API `/api/v1/finance/invoices?limit=20` | 401 | 401 ms | 108 ms |
| API `/api/v1/dashboard/executive-summary` | 401 | 106 ms | 106 ms |

**Deployed main JS bundle:** `index-CNrD9J3-.js` — **579,389 bytes (566 KB raw)**

---

## Pre-change local build (same HEAD, no manualChunks)

| Chunk | Raw bytes | Notes |
|-------|-----------|-------|
| `index-*.js` (main) | ~579,331 | Monolithic entry — react-markdown, AURA hooks, dashboard panels eager |
| `useAuraChat-*.js` | ~195,000 | Loaded on dashboard cold path |
| Total JS chunks | ~181 | No vendor splitting |

---

## Root causes identified (code audit)

### Application shell

- `ProtectedRoute` + `OwnerStaffRoute` both gated on `isLoading` — duplicate session wait text
- Dashboard cold load fired ~9 concurrent API calls immediately (summary, ops, Cartrack, schedule ×2, connections ×3, AURA)
- `PreloadCoordinator` idle prefetch started at 1.2 s on `/`, competing with dashboard queries
- Prefetch registry targeted legacy `crm/stats`, `jobs/stats`, `finance/stats` instead of `dashboard/executive-summary`

### Duplicate requests

- `SocialConnectionsSection` used raw `useEffect` fetch — duplicate of `ConnectionsPanel` social query
- Hub dashboard query key collision: same `integrations/hub-dashboard` key with different `simple` flag

### Bundle

- No Vite `manualChunks` — react, react-markdown, shared package in single ~566 KB index
- `AuraExecutiveChatPanel` / `useAuraChat` (~195 KB) loaded on dashboard mount
- `GoogleMapView` Maps script on dashboard mount (unchanged — provider isolation deferred to panel gating)

### Dashboard architecture

- All panels blocked on slowest provider query
- Connections panel waited for hub + auto-sync + social before showing any rows
- No deferred mount — fleet, schedule, connections, AURA competed with executive summary

### Caching

- Missing cache policies for `dashboard/executive-summary`, `ops-intelligence/snapshot`, social connections
- Provider status queries lacked consistent stale windows

### Not in baseline scope (requires authenticated session)

- Route-to-route navigation timing per Owner module
- Playwright performance traces
- Database query plans with tenant data
- Mobile/tablet long-task profiling

---

## Staging targets (realistic, post-implementation)

| Metric | Before | Target direction |
|--------|--------|----------------|
| Main index JS (raw) | 566 KB | ≤ 350 KB entry + parallel vendor chunks |
| AURA chunk on dashboard first paint | ~195 KB eager | Lazy after 520 ms defer |
| Dashboard API calls at T+0 | ~9 parallel | 1 primary (summary); secondary deferred |
| Social connections duplicate fetch | 2× on dashboard + integrations | 1× shared cache key |
| Hub query key collision | Yes | Separate `:simple` / `:full` keys |
| Idle prefetch on `/` | 1.2 s | 3.5 s (summary wins network) |
| Authenticated shell TTFV | Not measured | Shell visible before provider panels |

---

## Protected assets preserved

- XERO-002 implementation
- Facebook J-6.7F14
- 307-agent register
- Enterprise Integrations UI (INT-UI-001B)
- Protected untracked diagnostic files (not committed)

---

## Production exclusion

- No access to production database ref `rshuiaghmtrvvilhqpwm`
- All probes and builds against staging hosts and local artifacts only
