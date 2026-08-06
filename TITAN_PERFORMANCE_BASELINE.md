# TITAN Performance Baseline (Staging)

**Captured:** 2026-08-01  
**Environment:** Staging only  
**API:** https://young-guns-os-staging.up.railway.app  
**Web:** https://comfortable-determination-staging.up.railway.app  
**Branch:** `cursor/titan-frozen-scope-completion`  
**Probe artifact:** `diagnostic-output/207-performance-audit-addendum.json`

---

## Method

- `/usr/bin/curl` timing (`time_namelookup`, `time_connect`, `time_starttransfer`, `time_total`)
- Vite production build output (`apps/web/dist/assets`)
- Unauthenticated API probes return **401** — timings reflect edge + auth middleware only, not DB list latency
- Authenticated route/AURA message timings **not measured** (no staging credentials in this session — no invented data)

---

## BEFORE addendum (pre-change sample, same staging hosts)

| Probe | HTTP | TTFB | Total |
|-------|------|------|-------|
| API `/api/v1/health/ready` | 200 | 749 ms | 749 ms |
| Web `/` (index.html) | 200 | 645 ms | 645 ms |
| API `/api/v1/crm/customers?limit=20` | 401 | 640 ms | 640 ms |
| API `/api/v1/jobs?limit=20` | 401 | 632 ms | 632 ms |
| API `/api/v1/finance/invoices?limit=20` | 401 | 631 ms | 631 ms |

---

## AFTER addendum (post-build probe, commit `9c076a4` + local changes)

| Probe | HTTP | TTFB | Total |
|-------|------|------|-------|
| API `/api/v1/health/ready` | 200 | 778 ms | 778 ms |
| Web `/` (index.html) | 200 | 635 ms | 635 ms |
| API `/api/v1/crm/customers?limit=20` | 401 | 651 ms | 651 ms |
| API `/api/v1/jobs?limit=20` | 401 | 630 ms | 630 ms |
| API `/api/v1/finance/invoices?limit=20` | 401 | 619 ms | 619 ms |
| API `/api/v1/background-work/status` | 401 | 627 ms | 627 ms |
| API `/api/v1/analytics/dashboard` | 401 | 622 ms | 622 ms |

**Interpretation:** Staging edge latency is ~620–780 ms TTFB on cold external probes. Client-side optimizations (cache policy, lazy images, abort guards) improve perceived UX; they do not shift unauthenticated API TTFB materially.

---

## Bundle baseline (post-addendum build)

| Chunk | Size (raw) | gzip (build log) |
|-------|------------|------------------|
| `index-*.js` | 408 KB | 118.6 KB |
| `useAuraChat-*.js` | 198 KB | 60.7 KB |
| `agents-*.js` | 51 KB | 11.2 KB |
| Total JS files | 181 chunks | — |

---

## Client optimizations applied (safe)

1. `CompanyMediaImage` — `loading="lazy"` + `decoding="async"`
2. `QUERY_CACHE_POLICIES` — `background-work/status` → 15 s stale window
3. `useAuraChat` — AbortController on send + conversation select; conversations module cache retained
4. Route-level lazy loading — already present via `owner-pages.tsx` (unchanged)

---

## Not measured (requires authenticated staging session)

- Initial authenticated app load (JS parse + session restore + dashboard stats)
- Route-change samples (`/`, `/crm`, `/finance/invoices`, `/aura`)
- AURA time-to-first-visible-response / total response time
- Slowest authenticated API endpoints (list queries with tenant data)

See `TITAN_PERFORMANCE_GAP_BACKLOG.md` for remaining work.
