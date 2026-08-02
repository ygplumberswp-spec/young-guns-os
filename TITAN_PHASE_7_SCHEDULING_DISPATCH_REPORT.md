# TITAN Phase 7 — Scheduling and Live Dispatch

**Branch:** `cursor/titan-owner-operating-model-final`  
**Base (Phase 6):** `8ed5f47`  
**Code SHA:** `f723146`  
**Final SHA: `fa63b1f`
**Environment:** Staging only — production not touched  
**Generated:** 2026-08-02

## Verdict

| Surface | Verdict | Evidence |
|---|---|---|
| **Scheduling** | **GO** | Day / week / month views, filters, tray, drag-drop, conflict + override flow verified on staging @ 239 |
| **Live dispatch** | **GO** | Cartrack GPS for CF172047 + CF77263, MapLibre canvas with real markers, work queues, RBAC staff-only @ 239 |

**Overall:** **GO** @ `f723146` — authenticated staging verification 239 (0 blockers)

## Summary

Phase 7 wires the existing CAL-001 scheduling calendar (week default, filters, unscheduled tray, conflict protection, owner override) to the live dispatch console. The dispatcher workspace now embeds the Cartrack fleet map with delay-risk indicators, unassigned/emergency/delay queues, and explicit customer ETA privacy messaging. Customers never receive fleet-wide tracking — portal job-scoped ETA only.

## Cherry-pick status

**56eb55e** (`cursor/cartrack-live-map-final`) — **NOT cherry-picked**. Commit is not an ancestor of this branch, but equivalent MapLibre tile provider + fallback list functionality is already present (commits `45b41ca`, `252e9f1`, `f14614d`) with additional async-init fixes. Cherry-pick would conflict without benefit.

## Deliverables

| Deliverable | Path |
|---|---|
| Phase 7 report | `TITAN_PHASE_7_SCHEDULING_DISPATCH_REPORT.md` |
| Staging verify script | `diagnostic-output/239-scheduling-dispatch-verify.mjs` |
| Staging verify JSON | `diagnostic-output/239-scheduling-dispatch-verify.json` |
| Staging screenshots | `diagnostic-output/phase7-scheduling-dispatch-staging/` |

## Scope delivered

### Scheduling (`/scheduling`)
- Day / Week / Month views — **week default** (`defaultCalendarView`)
- Filters: technician, team, status, job type, suburb/zone, priority
- Unscheduled tray with drag/drop scheduling
- Conflict protection + travel/buffer warnings via `scheduling-conflict.service`
- Owner override with reason (`OverrideReasonModal`)
- Live dispatch link corrected → `/mobile-platform/dispatcher`

### Live dispatch (`/mobile-platform/dispatcher`)
- Embedded live map (`LiveDispatchMapPanel`) — MapLibre tiles + vehicle list fallback
- Per-vehicle: technician, vehicle, current job, next job, GPS timestamp, delay risk
- Work queues: unassigned jobs, emergency assessments, delay risk, customer notification state
- Technician status from dispatcher workspace API
- Nav tabs: Console · Fleet map · Intelligence · Scheduling
- Private expiring customer ETA — documented; no fleet-wide customer view

### Fleet live map (`/fleet/live-map`)
- Retained as full-screen staff surface; linked from dispatch nav
- Real Cartrack GPS: **CF172047**, **CF77263** (2 positioned vehicles on staging)

### RBAC
- Fleet live map + dispatch console: staff/dispatcher/owner permissions only
- Customer portal: no fleet map route; customer session mint skipped on staging (no portal user row) — API fleet route remains staff-scoped

## Files changed (Phase 7)

### New
- `apps/web/src/features/dispatch/LiveDispatchMapPanel.tsx`
- `apps/web/src/features/dispatch/LiveDispatchWorkQueues.tsx`
- `diagnostic-output/239-scheduling-dispatch-verify.mjs`

### Updated
- `apps/web/src/pages/mobile-platform/MobileDispatcherPage.tsx`
- `apps/web/src/features/dispatch/LiveDispatchNav.tsx`
- `apps/web/src/pages/scheduling/SchedulingPage.tsx`
- `apps/web/src/index.css`

## Local verification

| Check | Result |
|---|---|
| Web typecheck | PASS |
| Web build | PASS |

## Staging verification

| Service | Deployment ID | Status |
|---|---|---|
| API (`young-guns-os`) | `67811afa-f730-4d06-ab02-a365735f4a81` | SUCCESS (unchanged — no API diff) |
| Web (`comfortable-determination`) | `e75c1c82-f92e-45d6-9c8c-b22ef9fb44c3` | SUCCESS |

Verify script result: **GO** — `diagnostic-output/239-scheduling-dispatch-verify.json`

- Scheduling calendar API 200; week/day/month UI captured @ 1440
- Fleet live-map API 200; 2 vehicles with GPS; registrations CF172047, CF77263
- Dispatch dashboard API 200
- Live dispatch console: map panel + queues @ 1440, 1024, 768
- MapLibre canvas rendered (`mapCanvas: true`); vehicle cards visible
- 0 console errors

Run locally:

```bash
railway service young-guns-os   # ensure DATABASE_URL for session mint
node diagnostic-output/239-scheduling-dispatch-verify.mjs
```

## HOLD items (not blocking GO)

| Item | Reason |
|---|---|
| Customer portal RBAC UI test | No customer user row on YGP staging — mint skipped; fleet API remains staff-scoped |
| Share customer ETA button action | Audited expiring portal link send deferred — UI shows privacy note; no fake links generated |
| Dispatch dashboard stat nulls | `delayedJobCount` / `emergencyAssessmentCount` null in API payload shape — queues load via dedicated endpoints |
| Overtime warnings in scheduling | Conflict service covers travel/buffer; explicit overtime label deferred to workforce intelligence |
| Business day timeline | `/workforce/day-timeline` remains separate office timeline — not live dispatch map |

## Phase 8 boundary

Phase 7 complete. Do **not** start Phase 8 from this report.
