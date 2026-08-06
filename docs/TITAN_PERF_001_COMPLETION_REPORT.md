# TITAN PERF-001 — Completion Report

**Task:** TITAN PERF-001 — Enterprise Performance Foundation  
**Completed (UTC):** 2026-08-06  
**Task branch:** `cursor/titan-perf-001-foundation`  
**Canonical branch:** `cursor/titan-v1-integration`  
**Starting HEAD:** `08b08338ff2005d18a6e49a7cd852ee75d6169c3`  

---

## 1. Summary

PERF-001 delivers measured bundle reduction, dashboard loading architecture improvements, request deduplication, cache policy alignment, and provider-isolated panel deferral — without changing provider business logic, OAuth behaviour, or Dashboard content design.

---

## 2. App-shell improvements

| Change | File(s) |
|--------|---------|
| Removed duplicate session loading gate in `OwnerStaffRoute` | `StaffExperienceRoute.tsx` |
| Idle route prefetch deferred 3.5 s on owner dashboard home | `preload-coordinator.ts` |
| Prefetch registry targets `dashboard/executive-summary` | `route-prefetch-registry.ts` |
| Background dashboard prep uses correct integration keys | `route-prefetch-registry.ts` |

---

## 3. Route / bundle improvements

| Metric | Before (staging deployed) | After (local build) |
|--------|---------------------------|---------------------|
| Main `index-*.js` | 579,389 B (`index-CNrD9J3-.js`) | 340,466 B (`index-Cn_0x3Z1.js`) |
| Reduction | — | **−41% main entry** |
| `vendor-react-*.js` | (in index) | 194,755 B — parallel load |
| `vendor-markdown-*.js` | (in index) | 189,519 B — AURA-only routes |
| `titan-shared-*.js` | (in index) | 173,881 B — cached long-term |
| `useAuraChat-*.js` on dashboard | ~195 KB eager | 9,920 B stub until lazy panel |
| Total JS chunks | ~181 | 263 (smaller entry + vendor splits) |

**Vite `manualChunks`:** `vendor-markdown`, `vendor-react`, `vendor-router`, `titan-shared`, `titan-ui`

---

## 4. API waterfall improvements

| Change | Effect |
|--------|--------|
| Executive summary loads first; ops deferred 120 ms | Primary content wins network |
| Fleet/Cartrack deferred 180 ms | Provider poll does not block header |
| Schedule deferred 280 ms | Independent panel |
| Connections deferred 360 ms | Hub/social/auto-sync after summary |
| AURA lazy + deferred 520 ms | ~195 KB markdown stack not on critical path |
| `AbortSignal` on summary + ops fetchers | Route change cancels in-flight |
| Social connections shared cache key | Eliminates duplicate fetch |

---

## 5. Cache and freshness rules

Added to `cache-policies.ts`:

| Query key | Policy | Stale window |
|-----------|--------|--------------|
| `dashboard/executive-summary` | summary | 90 s |
| `ops-intelligence/snapshot` | fast | 15 s |
| `integrations/hub-dashboard:simple` | config | 300 s |
| `integrations/social-connections-dashboard` | config | 30 s (explicit in component) |
| `integrations/auto-sync-statuses` | fast | 15 s |

Tenant-scoped keys via `useStaffCachedQuery` / `buildQueryKey` — no cross-tenant reuse.

---

## 6. Database / query improvements

**No migration created.** Unauthenticated probes cannot produce tenant query plans. List pagination for CRM/jobs/invoices remains a documented gap for a follow-up within PERF or DASH scope.

---

## 7. Dashboard loading architecture

- Shell + header render from executive summary immediately
- `DashboardSectionSkeleton` placeholders for deferred panels (ops, fleet, schedule, connections, AURA)
- `ConnectionsPanel` shows partial rows when hub data arrives before social/auto-sync
- Panel failures isolated via existing `SectionErrorBoundary`
- **No Dashboard content redesign** (DASH-001 remains separate)

---

## 8. Provider isolation

- Cartrack poll gated on `deferFleet` — does not run until 180 ms after auth ready
- Connections panel no longer blocks on slowest of three queries when any data exists
- Provider sync frequency and OAuth flows **unchanged**

---

## 9. Loading / error states

- Removed unused full-page `LoadingState` from dashboard
- Local skeletons shaped to panel row counts
- Partial data retained during background refresh (`keepPreviousData` default)

---

## 10. Observability

- `nav-performance.ts` — added `recordWebVital` / `getWebVitalEntries` (dev-only `window.__titanWebVitals`)
- Existing nav timing preserved (`__titanNavPerf`)

---

## 11. Tests

| Suite | Result |
|-------|--------|
| `@titan/shared` | PASS |
| `@titan/auth` | PASS |
| `@titan/web` | **384 / 384** |
| `@titan/api` | PASS |
| **Total monorepo** | **1198 / 1198** |

New tests: `perf-foundation.test.ts`, `use-deferred-mount.test.ts`

Typecheck: PASS  
Production build: PASS  

Playwright authenticated performance journeys: **Not run** — no staging credentials.

---

## 12. Deployment

| Item | Status |
|------|--------|
| Staging deploy | **PENDING** — no Railway CLI/credentials in agent environment (`diagnostic-output/130-staging-controlled-deploy.json`: `BLOCKED_OWNER_ACTIONS`) |
| Pre-deploy staging bundle | `index-CNrD9J3-.js` (579,389 B) |
| Post-build local bundle | `index-Cn_0x3Z1.js` (340,466 B) |
| Production | **Untouched** |
| DB migration | None |

**Owner action required:** Deploy Web from `cursor/titan-v1-integration` to Railway staging, then re-run `node scripts/perf-baseline-probe.mjs` for post-deploy verification.

---

## 13. Remaining performance gaps

1. Authenticated Owner route timings (all 14 modules) — requires staging login
2. Server-side pagination for large lists (customers, jobs, quotes, invoices)
3. Database index audit with tenant query evidence
4. Playwright performance traces (desktop 1440 / tablet 768 / mobile 390)
5. TechnicianRoute still shows legacy "Loading..." gate
6. Post-deploy staging bundle verification

---

## 14. Confirmations

| Requirement | Status |
|-------------|--------|
| Integrations enterprise UI preserved | YES |
| Xero business logic unchanged | YES |
| Facebook unchanged | YES |
| 307-agent register preserved | YES |
| No production access | YES |
| No agents activated | YES |
| Dashboard content not redesigned | YES |

---

## 15. Next task

**XERO-003** — Near-real-time Xero quote, invoice and payment intersync (after Owner review of PERF-001 and formal sequencing).

---

**STOP FOR OWNER REVIEW**
