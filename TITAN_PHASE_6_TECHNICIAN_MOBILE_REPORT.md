# TITAN Phase 6 — Technician Mobile, Checklists, Signatures and Payment Collection

**Branch:** `cursor/titan-owner-operating-model-final`  
**Base (Phase 5):** `0dde2c7`  
**Final SHA:** `db66568`  
**Code SHA:** `dc28cd0`  
**Environment:** Staging only — production not touched  
**Generated:** 2026-08-02

## Verdict

**GO** @ `0ada807` — authenticated staging verification 238 (0 blockers)

Technician mobile home, list/calendar/map views, field job execution (checklists, signatures, evidence, close-out gate), field support requests, and Yoco-aware payment collection context are verified on staging with RBAC intact. Yoco card capture and pricebook quote drafting remain **HOLD** (honest empty / deferred — see below).

## Summary

Phase 6 extends the existing technician mobile shell with a Today-first home (current job, next job, jobs requiring completion, missing close-out items), List/Calendar/Map view switcher, field support actions (help, parts, return visit), and payment collection panel that surfaces balance due and Yoco provider status without storing raw card data.

## Deliverables

| Deliverable | Path |
|---|---|
| Phase 6 report | `TITAN_PHASE_6_TECHNICIAN_MOBILE_REPORT.md` |
| Staging verify script | `diagnostic-output/238-technician-mobile-verify.mjs` |
| Staging verify JSON | `diagnostic-output/238-technician-mobile-verify.json` |
| Staging screenshots | `diagnostic-output/phase6-technician-mobile-staging/` |

## Scope delivered

### Technician mobile home (`/mobile`)
- Today greeting with assigned job count
- Current job / Next job highlights (honest empty when none scheduled)
- My schedule summary
- Jobs requiring completion
- Missing close-out items (completion gate blockers)
- List / Calendar / Map view switcher

### Views
| View | Route |
|---|---|
| List | `/mobile/jobs` |
| Calendar | `/mobile/schedule` |
| Map / Route | `/mobile/route` |

### Job execution (`/mobile/jobs/:id`)
Existing UX-B workspace retained and extended:
- Workflow: accept, travel, arrive, start, pause (reason), await parts/customer/approval, complete
- Evidence: before/during/after photos, documents, offline queue + retry
- Checklists: job-type required checklist on completion gate
- Signature: SignaturePad + unavailable reason + COC classification
- Materials, labour/time, variations (pending approval)
- **New:** Field support — request help, request parts, return visit (workforce requests → pending approval)
- **New:** Payment collection panel — balance due, Yoco status, no card fields

### RBAC
- Technician programmatic session blocked from `GET /api/v1/finance/receivables` (403)
- UI redirect away from `/finance/receivables`
- Technician sees only assigned jobs (1 job assigned for verify on YGP staging)
- No owner finance/margins/payroll surfaces on mobile routes

### Payment collection
- `GET /mobile/technician/workforce/jobs/:jobId/payment-collection` returns technician-scoped context
- Never stores or collects raw card data in TITAN
- Yoco on YGP staging: **not configured** — honest message shown

## Files changed

### Shared
- `packages/shared/src/mobile-workforce.ts` — dashboard highlights, payment collection type
- `packages/shared/src/role-experience.ts` — Schedule + Route/Map nav items

### API
- `apps/api/src/services/mobile-workforce.service.ts` — dashboard highlights, close-out scan, payment context
- `apps/api/src/routes/mobile.ts` — payment-collection route

### Web
- `apps/web/src/pages/mobile/MobileDashboardPage.tsx` — Phase 6 home
- `apps/web/src/pages/mobile/MobileJobDetailPage.tsx` — field support + payment panel
- `apps/web/src/lib/mobile-api-client.ts` — payment collection fetch
- `apps/web/src/index.css` — view switcher styles

## Local verification

| Check | Result |
|---|---|
| `@titan/shared` test | PASS (137) |
| API typecheck | PASS |
| Web typecheck | PASS |
| Web build | PASS |

## Staging verification

| Service | Deployment ID | Status |
|---|---|---|
| API (`young-guns-os`) | `67811afa-f730-4d06-ab02-a365735f4a81` | SUCCESS |
| Web (`comfortable-determination`) | `0f3496cc-f5fc-4605-bb52-1e1bd6dbf6f0` | SUCCESS |

Verify script result: **GO** — `diagnostic-output/238-technician-mobile-verify.json`

- Dashboard API returns `currentJob`, `nextJob`, `jobsRequiringCompletion`, `missingCloseOutItems`
- 1 assigned job; payment collection context returned (`yocoConfigured: false`)
- Mobile routes captured @ 375×812 (+ desktop sanity on Today @ 1440)
- Job detail: Workflow, Completion gate, Payment collection, Field support verified
- Finance RBAC: API 403 + UI redirect

Run locally:

```bash
node diagnostic-output/238-technician-mobile-verify.mjs
```

## HOLD items (not blocking GO)

| Item | Reason |
|---|---|
| Yoco live card capture | Yoco integration on staging is connection-test only; technicians see terminal/off-site guidance, not in-app card entry (by design — no raw card storage) |
| Pricebook quote draft from mobile | Variations cover scope changes; full pricebook quote draft requires `finance:write` (owner module) — technician blocked by RBAC; office path unchanged |
| Scheduled calendar events | YGP has 0 calendar events today — current/next job show honest empty states |
| Yoco configured on YGP | No Yoco credentials on staging tenant — payment panel shows honest not-configured state |

## Owner / Dispatcher paths

No changes to owner staff nav, dispatcher console, or Job 360 desktop flows in this phase.
