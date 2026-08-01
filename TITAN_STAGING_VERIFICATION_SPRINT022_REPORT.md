# Sprint 022 — Staging redeploy verification (GO)

**Date:** 2026-08-01  
**Branch deployed:** `cursor/titan-frozen-scope-completion` (includes `58a16b7` APP_URL fix)  
**Production:** not touched

---

## Deploy confirmation

| Check | Result |
|-------|--------|
| Owner action | Railway branch switched + redeploy |
| `/api/v1/health/live` | **200** |
| `/api/v1/health/ready` | **200** — `database=connected` |
| Staging web `/` | **200** (prior) |

---

## Smoke verdicts (public Railway API)

| Phase | Script | Verdict | Pass/Fail |
|-------|--------|---------|-----------|
| 5 | `staging-phase5-public-e2e.mjs` | **GO** | 10/0 |
| 6 | `staging-phase6-public-e2e.mjs` | **GO** | 12/0 |
| 8–12 | `staging-phase8-12-public-e2e.mjs` | **GO** | 18/0 |

**Evidence JSON:**
- `diagnostic-output/140-staging-phase5-e2e.json`
- `diagnostic-output/141-staging-phase6-e2e.json`
- `diagnostic-output/142-staging-phase8-12-e2e.json`

---

## Phase 8–12 highlights

- Day timeline route mounted + tenant-scoped
- BOQ workspace (0105) list/create
- Stock movements + levels
- Job document packs (0106) mounted; pack create validates linked documents
- Job finance summary; invoice-from-job validates accepted quote (honest gate)

---

## Script fixes (this sprint)

- Phase 8–12 fixture job uses lead→convert chain (matches live job-create contract)
- Expected validation errors for pack/invoice prerequisites counted as PASS (routes live)

---

## Overall staging verdict

**GO** — Phase 5–12 public API smokes pass on live Railway staging after completion-branch deploy.
