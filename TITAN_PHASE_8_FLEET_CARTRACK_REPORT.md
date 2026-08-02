# TITAN Phase 8 — Fleet and Cartrack

**Branch:** `cursor/titan-owner-operating-model-final`  
**Base (Phase 7):** `d7ff4fd`  
**Code SHA:** `5d5d9dc`  
**Final SHA:** `d5e15c6`  
**Environment:** Staging only — production not touched  
**Generated:** 2026-08-02

## Verdict

| Surface | Verdict | Evidence |
|---|---|---|
| **Fleet workspace tabs** | **GO** | Eight-tab nav on all fleet routes; honest HOLD on provider feeds not wired |
| **Live Map (Cartrack)** | **GO** | CF172047 + CF77263 on MapLibre canvas @ 240; 2 marker pins; vehicle detail drawer |

**Overall:** **GO** @ `5d5d9dc` — authenticated staging verification 240 (0 blockers)

## Summary

Phase 8 completes the owner Fleet workspace with a unified tab bar (Live Map, Vehicles, Trips, Alerts, Drivers, Places, Maintenance, Reports). Live Map reuses Phase 7 MapLibre components with real Cartrack GPS from TITAN cache. Tabs without Cartrack provider APIs show explicit HOLD panels — no demo vehicles, fake GPS, or synthetic trip/alert rows.

## Cherry-pick status

**56eb55e** — **NOT cherry-picked** (same as Phase 7). MapLibre + fallback list already on branch; cherry-pick unnecessary.

## Deliverables

| Deliverable | Path |
|---|---|
| Phase 8 report | `TITAN_PHASE_8_FLEET_CARTRACK_REPORT.md` |
| API deployment reconciliation | `diagnostic-output/229-fleet-api-deployment-reconciliation.json` |
| Staging verify script | `diagnostic-output/240-fleet-cartrack-verify.mjs` |
| Staging verify JSON | `diagnostic-output/240-fleet-cartrack-verify.json` |
| Staging screenshots | `diagnostic-output/phase8-fleet-cartrack-staging/` |

## Scope delivered

### Fleet workspace tabs

| Tab | Route | Status |
|---|---|---|
| Live Map | `/fleet/live-map` | **GO** — MapLibre tiles, fit-all, markers, detail drawer |
| Vehicles | `/fleet/vehicles` | **GO** — TITAN vehicle registry + dispatch board |
| Trips | `/fleet/trips` | **HOLD** — GET `/api/v1/fleet/trips` not mounted |
| Alerts | `/fleet/alerts` | **HOLD** — Cartrack alert feed not connected |
| Drivers | `/fleet/drivers` | **Partial** — names from live GPS snapshot when present; full roster API on HOLD |
| Places | `/fleet/geofences` | **HOLD** — geofence/POI sync not connected |
| Maintenance | `/fleet/maintenance` | **Partial** — TITAN `maintenance` status only; provider schedules on HOLD |
| Reports | `/fleet/reports` | **HOLD** — export pipelines not on this tab |

Legacy `/fleet` alias remains → Vehicles list.

### Live Map requirements

- Road/suburb vector tiles (MapLibre demo style / OpenFreeMap env)
- Zoom, pan, fit-all toolbar
- Real markers with movement states (parked CF172047/CF77263 verified)
- Real timestamps in list + vehicle detail drawer
- Fallback: `FleetMapFallbackList` with coordinates, speed, ignition, state + Retry (not needed — map rendered)

### Cartrack preservation

- Credentials, two vehicle mappings, existing GPS rows untouched
- No manual sync, reconnect, or credential rewrite
- `mappedCount: 2`, `positionCount: 2` live-map API @ staging

## Files changed (Phase 8)

### New

- `apps/web/src/features/fleet/FleetWorkspaceShell.tsx`
- `apps/web/src/features/fleet/FleetHoldPanel.tsx`
- `apps/web/src/pages/fleet/FleetTripsPage.tsx`
- `apps/web/src/pages/fleet/FleetAlertsPage.tsx`
- `apps/web/src/pages/fleet/FleetDriversPage.tsx`
- `apps/web/src/pages/fleet/FleetGeofencesPage.tsx`
- `apps/web/src/pages/fleet/FleetMaintenancePage.tsx`
- `apps/web/src/pages/fleet/FleetReportsPage.tsx`
- `diagnostic-output/240-fleet-cartrack-verify.mjs`

### Updated

- `apps/web/src/features/fleet/FleetSectionNav.tsx`
- `apps/web/src/pages/fleet/FleetLiveMapPage.tsx`
- `apps/web/src/pages/fleet/VehicleListPage.tsx`
- `apps/web/src/routes/owner-pages.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/index.css`
- `diagnostic-output/229-fleet-api-deployment-reconciliation.mjs`

## Local verification

| Check | Result |
|---|---|
| Web typecheck | PASS |
| Web build | PASS |

## Staging verification

| Service | Deployment ID | Status |
|---|---|---|
| API (`young-guns-os`) | `67811afa-f730-4d06-ab02-a365735f4a81` | SUCCESS (unchanged — no API diff) |
| Web (`comfortable-determination`) | `cadc206a-784e-49ca-a0c2-41374c896d1c` | SUCCESS |

### 229 — API / Cartrack reconciliation

**GO** — `diagnostic-output/229-fleet-api-deployment-reconciliation.json`

- API ready 200; Cartrack connected
- Authenticated `/api/v1/fleet/live-map` 200; registrations CF172047, CF77263
- Mapped vehicles: 2; tracking position count: 2
- Web bundle: `assets/index-D5t1VSWe.js`

### 240 — Fleet visual verification

**GO** — `diagnostic-output/240-fleet-cartrack-verify.json`

- All 8 fleet tabs render workspace nav
- MapLibre canvas mounted; 2 marker pins (CF172047, CF77263)
- Vehicle detail drawer opens for both registrations
- Screenshots @ 1440, 768, 375 in `diagnostic-output/phase8-fleet-cartrack-staging/`
- 0 console errors

Run locally:

```bash
railway service young-guns-os   # DATABASE_URL for session mint
node diagnostic-output/229-fleet-api-deployment-reconciliation.mjs
node diagnostic-output/240-fleet-cartrack-verify.mjs
```

## HOLD tabs (not blocking GO)

| Tab | Reason |
|---|---|
| Trips | `GET /api/v1/fleet/trips` not implemented on API — Fleet Intelligence has GPS-derived trips separately |
| Alerts | Cartrack event/alert webhook feed not synced to owner alerts tab |
| Drivers (full roster) | No `GET /api/v1/fleet/drivers`; live snapshot driver names shown when provider supplies them |
| Places / Geofences | Cartrack geofence catalog not imported |
| Maintenance (provider) | Cartrack service-due schedules not synced; TITAN vehicle status only |
| Reports | PDF/Excel fleet exports deferred; Fleet Intelligence route separate |

## Phase 9 boundary

Phase 8 complete. Do **not** start Phase 9 from this report.
