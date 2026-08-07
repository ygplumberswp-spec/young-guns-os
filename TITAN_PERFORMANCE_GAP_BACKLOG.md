# TITAN Performance Gap Backlog (Honest)

**Date:** 2026-08-01  
**Scope:** Staging · post UX Phase 1 addendum

---

## High impact — needs authenticated profiling

| Area | Observation | Recommended next step |
|------|-------------|----------------------|
| Staging cold TTFB | External probes ~620–780 ms before handler work | Railway region / keep-warm / health probe scheduling — infra, not UI |
| Authenticated list APIs | Not profiled this session | Staging click-path with Server-Timing + DB query logs for `/crm/customers`, `/jobs`, `/finance/invoices` |
| AURA message latency | Provider-bound; diagnostics available when API returns them | Measure `providerMs` / `contextBuildMs` with staging AI configured |
| Initial app load | Main chunk 408 KB + aura chunk 198 KB | Code-split markdown/react-markdown out of shared aura chunk if bundle analyzer confirms |

---

## Medium impact — deferred safe wins

| Area | Gap | Notes |
|------|-----|-------|
| SSE streaming | OpenAI provider uses blocking `/chat/completions` | Requires API route + client stream parser; addendum adds progressive status only |
| Table virtualization | Heavy lists use full fetch + render | Add virtualization on customers/jobs when row counts exceed ~100 in staging |
| Duplicate fetches | Some intelligence pages mount parallel dashboards | Audit per-page `useStaffCachedQuery` keys |
| Mobile 3G | Not lighthouse-run this session | Run Lighthouse mobile against staging post-deploy |

---

## Low impact / already addressed

| Area | Status |
|------|--------|
| Dashboard stat skeletons | Present via `LoadingState` per metric |
| Route lazy loading | `owner-pages.tsx` lazyNamed throughout |
| Session proactive refresh | Phase 1 complete |
| Image lazy load | `CompanyMediaImage` updated |
| Background work cache | 15 s stale policy added |
| AURA in-flight duplicate send | `isSending` + idempotency key header + composer guard |

---

## Blockers

- **No staging login in automation** — cannot publish authenticated timings without Owner-provided session or CI secret
- **SSE / group-meeting synthesis** — backend single-provider path today; multi-agent dedup is agent-runtime scope
- **Production** — explicitly out of scope
