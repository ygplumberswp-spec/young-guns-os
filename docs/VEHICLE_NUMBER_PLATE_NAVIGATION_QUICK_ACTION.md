# Vehicle Number-Plate Navigation Quick Action

**Status: ⬜ Planned / required for TITAN V1.0 — NOT started. Do not implement during another active
phase.**

This document records approved scope only. **No implementation exists for this capability and none may
be started yet.** It is written so the work can be picked up later without re-deciding the
requirements.

A **Xero staging repair / live verification phase** and an **Owner dashboard audit** may be active on
this branch. Do not begin this work alongside either of them, and do not touch Xero, Finance, Dashboard
or any other work-in-progress files while recording this scope. Gate:
[`XERO_COMPLETE_HISTORICAL_SYNC_AND_FINANCIAL_MEMORY.md`](./XERO_COMPLETE_HISTORICAL_SYNC_AND_FINANCIAL_MEMORY.md).

**Cross-link — related existing surfaces.** This capability **extends** the following already-built
surfaces and must not rebuild, duplicate or replace any of them:

- **Fleet** (operational vehicle CRUD under `/fleet`) — `vehicles` already carries the number plate as
  `vehicles.licensePlate` (`packages/db/src/schema/vehicles.ts`), and the list and detail surfaces
  already exist (`apps/web/src/pages/fleet/VehicleListPage.tsx`,
  `apps/web/src/pages/fleet/VehicleDetailPage.tsx`, `apps/web/src/features/fleet/VehicleList.tsx`,
  `apps/web/src/features/fleet/FleetDispatchBoard.tsx`).
- **Cartrack / fleet tracking** — `gps_positions` (`packages/db/src/schema/gps-positions.ts`) already
  stores `latitude`, `longitude`, `speedKmh`, `heading`, `recordedAt` and `receivedAt` per vehicle and
  integration connection; `integration_vehicle_mappings.externalRegistration` already maps a provider
  vehicle to a TITAN vehicle; `packages/shared/src/fleet-tracking.ts` already defines the honest
  position health model (`live` / `stale` / `unavailable`, `FLEET_POSITION_STALE_MS`,
  `FLEET_SYNC_STALE_MS`); the connection panel and live hooks exist
  (`apps/web/src/features/integrations/CartrackSyncPanel.tsx`,
  `apps/web/src/features/dispatch/useCartrackLivePositions.ts`,
  `apps/web/src/features/dispatch/LiveDispatchPositionsPanel.tsx`).
- **Dispatch** — live dispatch positions and the dispatch intelligence surface
  (`apps/web/src/features/dispatch/`, `apps/web/src/pages/dispatch-intelligence/DispatchIntelligencePage.tsx`).
- **Google Maps** — `packages/shared/src/google-maps.ts` already exposes
  **`buildGoogleMapsNavigateUrl`** (a `google.com/maps/dir/?api=1&destination=…` deep link),
  `buildGoogleMapsPlaceUrl`, `isValidLatLng` and the honest service-probe model; the API route,
  service, client and map view exist (`apps/api/src/routes/google-maps.ts`,
  `apps/api/src/services/google-maps.service.ts`, `apps/api/src/lib/google-maps.client.ts`,
  `apps/web/src/features/maps/GoogleMapView.tsx`). `buildGoogleMapsNavigateUrl` is already consumed by
  `apps/web/src/features/jobs/PropertyMapPanel.tsx`,
  `apps/web/src/features/fleet/FleetDispatchBoard.tsx` and
  `apps/api/src/services/mobile-workforce.service.ts`.
- **Vehicle Intelligence** (Department 8.1, `vehicle-intelligence`, migration `0150`) — real vehicle
  profiles, costs and usage history; honest `unavailable` when Cartrack is disconnected.
- **Driver Intelligence** (Department 8.2, `driver-intelligence`, migration `0155`) — trips, GPS
  analytics and behaviour intelligence, Owner/Admin only.
- **Fleet AI Recommendations** (Department 8.3, `fleet-ai-recommendations`, migration `0154`) —
  recommendation drafts from real fleet signals.
- **Property Intelligence** (Department 12, `property-intelligence`, migration `0161`) — the existing
  precedent that a Maps pin reports **`unavailable` unless a real validated coordinate exists**, which
  this capability must follow exactly.
- **Mobile Experience** — the existing mobile surfaces (`apps/web/src/pages/mobile/`, including
  `MobileRoutePage.tsx`) and `apps/api/src/services/mobile-workforce.service.ts`.

**No new tracking stack, no second maps integration, no new vehicle store and no new permission
model.** This is a quick action over data TITAN already stores.

---

## Scope areas

This capability is delivered **across existing modules**, not as a new standalone product or a new
navigation entry:

| # | Area | Role in this capability |
|---|------|-------------------------|
| 1 | **Fleet** | The vehicle record and its number plate — the thing the user recognises and taps |
| 2 | **Cartrack** | The only source of the vehicle's position; supplies the coordinate and the time it was recorded |
| 3 | **Dispatch** | Where a dispatcher needs to reach a vehicle now, alongside live positions |
| 4 | **Owner Dashboard** | Owner quick actions — reach any authorised vehicle without opening Fleet |
| 5 | **Google Maps** | Turn-by-turn navigation from the user's own location to the vehicle's position |
| 6 | **Mobile Experience** | The primary place this is used — one hand, in a vehicle, about to drive |

---

## Objective

**Every authorised vehicle must offer a one-tap quick action, identified by its registration / number
plate, that opens Google Maps navigation from the user's current location to that vehicle's latest
verified Cartrack position.**

The user should not have to find a vehicle ID, copy coordinates, read a map by eye, or work out which
Cartrack record belongs to which van. They recognise the vehicle by its plate, they tap once, and their
phone starts navigating to where that vehicle actually was, with the age of that position stated
honestly.

### Example

A vehicle listed as **`CA 123-456`** shows a quick action labelled:

> **Navigate to vehicle**

Tapping it opens Google Maps with a route from the user's current location to the coordinate Cartrack
last recorded for `CA 123-456`, and the TITAN surface states — before and after the tap — when that
position was recorded.

### Business outcome

- A dispatcher can reach a stranded, broken-down or unresponsive vehicle without phoning around.
- The Owner can physically reach any vehicle in the fleet without knowing where the driver said it was.
- A technician sent to assist another vehicle gets a route rather than a description.
- An emergency response starts with navigation, not with a search.

**Explicitly out of scope:**

- **No new position store.** `gps_positions` and the existing Cartrack sync are the only sources. No
  second position table, no separate polling loop, no cached "last seen" copy that can drift.
- **No live tracking product.** This is a navigation quick action to a recorded position, not a
  continuously updating chase view. Live position display stays where it already is, in Dispatch and
  Fleet Intelligence.
- **No in-app turn-by-turn engine.** Navigation is handed to Google Maps. TITAN does not draw, narrate
  or recalculate a route.
- **No driver or person tracking.** The subject is the **vehicle**. Driver behaviour intelligence stays
  in Driver Intelligence under its existing Owner/Admin gate.
- **No customer-facing vehicle location.** See *Privacy & security*.
- **No invented coordinates.** See *Honesty rules*.

---

## Per-vehicle display fields

Every vehicle that offers the quick action displays the fields below. A field that is not known is
**shown as unknown** — never filled with a guess, and never omitted in a way that reads as fact.

| Field | Source | Rule |
|-------|--------|------|
| **Registration / number plate** | `vehicles.licensePlate` | The primary identifier shown to the user, formatted exactly as stored (e.g. `CA 123-456`) |
| Vehicle name / description | `vehicles` | Make, model or fleet label where stored |
| Fleet number / internal reference | `vehicles` | Where the company records one |
| Assigned driver / technician | Real job or vehicle assignment | **Only where a real assignment exists**; never inferred from who drove it last week |
| Current job | Real `jobs` link | Where the vehicle is assigned to a job |
| Vehicle status | `vehicles.status` | Existing operational status |
| **Latest recorded position** | `gps_positions.latitude` / `longitude` | Shown as coordinates and, where geocoding resolves, a readable place — the readable place is **derived and labelled as derived** |
| **Position recorded at** | `gps_positions.recordedAt` | An absolute timestamp **and** a relative age ("4 minutes ago"). Always shown; never hidden behind a tap |
| **Position age / freshness state** | Derived via `packages/shared/src/fleet-tracking.ts` | `live` / `stale` / `unavailable`, using the existing thresholds — **not a new freshness model** |
| Speed at that moment | `gps_positions.speedKmh` | Where the provider supplied it; absent otherwise |
| Heading / direction at that moment | `gps_positions.heading` | Where the provider supplied it; absent otherwise |
| **Moving / stationary** | Derived from `speedKmh` | Derived, labelled as derived, and `unknown` where no speed was supplied — never assumed stationary |
| Cartrack connection state | `integration_connections` | Connected / disconnected / degraded, with the reason |
| Last successful Cartrack sync | Existing sync record | The sync time, distinct from the position time |
| **Navigate action availability** | Derived | `available` or `unavailable` **with a reason** — see *Failure states* |

The plate is the label everywhere: in the list row, in the quick action, in the confirmation, in the
audit record and in any AURA answer about it.

---

## Navigation flow

Five steps. Every one of them is honest about what it knows.

**1. The user selects the vehicle by its number plate.**
The vehicle is identified in the UI by `vehicles.licensePlate`. Selection is only offered for vehicles
the caller is authorised to locate, within their own `companyId` — an unauthorised vehicle is not
listed, not searchable and not reachable by guessing a plate.

**2. TITAN reads the latest verified Cartrack position for that vehicle.**
The most recent `gps_positions` row for the vehicle, scoped by company and by a Cartrack
`integration_connection` belonging to that company. The coordinate must pass real validation
(`isValidLatLng`) to be usable. There is **no fallback to a job address, a depot, a suburb centroid, a
last-known-address or a previous day's position** — if there is no valid recent coordinate, the action
is unavailable with a reason.

**3. TITAN states the age and freshness of that position, before navigation starts.**
The recorded timestamp, the relative age and the freshness state are displayed on the action itself.
A **stale position is never presented as a live location** — not in wording, not in colour, not in an
icon, not by omission. Where the position is stale or the vehicle is moving, the relevant warning below
is shown **before** the user commits.

**4. TITAN requests the user's current location and builds the navigation link.**
Browser / device geolocation is requested with a real permission prompt. The destination is the
vehicle's coordinate; the origin is the user's device, resolved by Google Maps itself. The link is built
with the **existing** `buildGoogleMapsNavigateUrl` helper — a `google.com/maps/dir/?api=1&destination=…`
deep link, which requires **no Directions or Routes API call and no server-side route computation**, so
it does not depend on `directions` or `routes` being provisioned in GCP. If the user declines or
geolocation fails, Google Maps still opens with the destination set and resolves the origin itself; TITAN
says plainly that the starting point came from the device rather than from TITAN.

**5. Google Maps opens with navigation to that position, and TITAN records the action.**
Navigation runs entirely in Google Maps. TITAN reports only that it **opened** navigation — never that
the user arrived, never an ETA it did not obtain, never a distance it did not calculate. The action is
written to `security_audit_logs` with the actor, the company, the vehicle, the position row and the
position timestamp used.

### Moving-vehicle warning

Shown whenever the vehicle's recorded speed indicates movement, or movement cannot be ruled out:

> **This vehicle was moving when its position was recorded.** The location below is where
> `{{license_plate}}` was at `{{recorded_at}}` — travelling at `{{speed}}` — not where it is now. It will
> have moved by the time you arrive. Check the position again before you get close.

Where no speed was supplied, the warning states that movement is **unknown** rather than claiming the
vehicle is stationary:

> **We cannot confirm whether this vehicle is moving.** Cartrack supplied no speed for the position
> recorded at `{{recorded_at}}`. Treat the location as a starting point, not a destination.

### Stale-location warning

Shown whenever the position is older than the existing freshness threshold
(`FLEET_POSITION_STALE_MS` in `packages/shared/src/fleet-tracking.ts`):

> **This is not a live location.** The last position TITAN received for `{{license_plate}}` was recorded
> `{{age}}` ago, at `{{recorded_at}}`. The vehicle may be somewhere else entirely. Navigate to it only if
> you accept that, and confirm the vehicle's location by another means before relying on it.

Wording rules, non-negotiable:

- The words **live**, **current**, **now**, **real-time** and **tracking** must not appear against a
  stale position anywhere in the UI, an export, a notification, an AURA answer or an audit description.
- The age is stated in the warning itself, not only in a tooltip or a details panel.
- A stale position is still **navigable** — the user is warned, not blocked — but the warning must be
  visible at the moment of the tap, and the acknowledgement is what is audited.
- An **unavailable** position is not navigable at all, and says why.

---

## Surfaces

The quick action appears on the following existing surfaces. **No new navigation entry is created.**

| Surface | Where | Requirement |
|---------|-------|-------------|
| **Fleet vehicle list** | `apps/web/src/pages/fleet/VehicleListPage.tsx`, `apps/web/src/features/fleet/VehicleList.tsx` | A per-row quick action beside the plate, with freshness visible in the row — not only after opening the vehicle |
| **Vehicle details** | `apps/web/src/pages/fleet/VehicleDetailPage.tsx` | The full field set from *Per-vehicle display fields*, the position, its age, the warnings and the action |
| **Dispatch** | `apps/web/src/features/dispatch/LiveDispatchPositionsPanel.tsx`, `apps/web/src/features/fleet/FleetDispatchBoard.tsx`, `apps/web/src/pages/dispatch-intelligence/DispatchIntelligencePage.tsx` | Navigate to any authorised vehicle from the live positions view, using the position already loaded rather than a second fetch |
| **Owner Dashboard quick actions** | The existing dashboard quick-action surface (`apps/web/src/features/dashboard/`) | Owner reaches any authorised vehicle by plate without opening Fleet. **The dashboard audit may be active — this must not be built while it is** |
| **Mobile fleet** | `apps/web/src/pages/mobile/` (today there is **no dedicated mobile fleet page** — that gap must be verified and closed as part of this work, not assumed) | One-handed: large tap target, plate legible, freshness and warning legible without scrolling, hands-free-safe before driving |
| **Emergency response** | The emergency path in Dispatch Intelligence / Fleet Dispatch Board | Reaching a vehicle in an emergency is the highest-priority use; the action must be immediately visible, and an unavailable position must say why rather than silently doing nothing |

Consistency requirement: the action is **the same action** on every surface — one shared component and
one shared availability decision, so a vehicle can never appear navigable in one place and not in
another.

---

## RBAC

Existing platform security is preserved unchanged. **No new permission model.**

| Role | Access |
|------|--------|
| **Owner** | All company vehicles, without exception, within their own `companyId` |
| **Admin** | Permitted — all company vehicles, subject to existing fleet permissions |
| **Dispatcher** | Permitted — required for the operational purpose of the feature |
| **Fleet role / fleet manager** | Permitted — subject to existing fleet permissions |
| **Technician** | **Assigned or explicitly permitted vehicles only** — the vehicle assigned to them, or a vehicle they have been explicitly authorised to locate. No fleet-wide list, no other technicians' vehicles, no plate search across the fleet |
| **Client / customer portal** | **Denied entirely.** No vehicle location, no plate, no coordinate, no ETA derived from a vehicle position |
| **Marketing** | **Denied entirely.** No operational or business reason to hold vehicle locations |
| Other roles (Manager, Accountant, Staff) | Only where an existing fleet permission already grants it; otherwise denied |

Enforcement rules:

- Every vehicle is scoped by **`companyId`**, and so is every `gps_positions` row and every
  `integration_connection` behind it. A position may only be read through a connection belonging to the
  caller's company.
- Role denial happens **at the router gate and again in the service before any database access** — the
  existing TITAN pattern.
- A **wildcard permission grants nothing here.** Denied roles are decided by role.
- A **plate is not a key.** Looking a vehicle up by registration must apply exactly the same
  authorisation as listing it. An unauthorised plate returns the same "not found" as a plate that does
  not exist, so the endpoint cannot be used to confirm that a vehicle exists.
- Authorisation is evaluated **per request**, at the moment of the action — not baked into a cached
  vehicle list that keeps working after access is removed.

---

## Privacy & security

Vehicle location is sensitive. It reveals where staff are, where customers are, and what the business
is doing.

| Requirement | Detail |
|-------------|--------|
| **No public or fleet-wide location exposure** | There is no unauthenticated surface, no share link, no public map and no export that exposes fleet-wide positions. A navigation link is generated for the user who is authorised at that moment — it is not a durable shareable artefact of the fleet's whereabouts |
| **No raw tracking data in customer views** | The customer portal and every customer-facing surface (portal, email, WhatsApp, SMS, completion report, quote, invoice) must contain **no coordinate, no plate-to-position mapping, no position history and no raw Cartrack payload**. Any customer-facing arrival information stays inside the existing approved ETA / notification path and is not extended by this capability |
| **Cartrack / tenant isolation** | Positions are read only through the caller's company's own Cartrack connection. Cross-tenant reads and cross-tenant `externalVehicleId` / `externalRegistration` matches are **refused before anything is returned**. One company's plate must never resolve against another company's mapping |
| **Audit** | Every navigate action, every plate lookup, every stale-warning acknowledgement, every permission denial and every geolocation permission failure is written to `security_audit_logs` with the actor, company, vehicle, `gps_positions` row and the position `recordedAt` that was used |
| **No navigation on unverified or missing coordinates** | The action is **not offered** when there is no `gps_positions` row, when the coordinate fails `isValidLatLng`, or when the position cannot be attributed to a real Cartrack connection for that company. There is no "approximate", "best guess" or "last known area" mode |
| **Position data is not copied** | No new table stores a duplicated position for this feature, so it cannot leak from a second place or drift from `gps_positions` |
| **No coordinates in logs or analytics** | Coordinates must not appear in application logs, error reports, analytics events, AURA prompts or third-party telemetry. The audit record references the position **row**, and holds the coordinate only where the existing audit standard requires it |
| **POPIA** | Vehicle position combined with an assigned driver is personal information — minimal, purpose-limited processing, no export beyond permission, retention following the existing tracking-data retention rules |
| **Device geolocation** | The user's own location is requested through the standard permission prompt, used only to hand an origin to Google Maps, and **never stored by TITAN** |
| **Untrusted input** | Provider payloads, `externalRegistration` values and user-entered plate searches are treated as untrusted input; a plate search is never interpolated into a query or a URL unescaped |
| **No third-party leakage beyond the destination** | The Google Maps deep link carries the destination coordinate only — no plate, no customer, no job, no driver identity, no company identifier |

---

## Failure states

Each state below must be **shown honestly with its reason**, and none of them may be presented as a
working navigation or silently swallowed.

| # | State | Behaviour |
|---|-------|-----------|
| 1 | **Cartrack not connected** | Action `unavailable`; states that vehicle tracking is not connected, and links to the existing integration surface for authorised roles |
| 2 | **Cartrack connected but sync degraded or failing** | Action may still offer the last valid position, labelled with its real age, plus the honest sync failure; the sync state is shown **separately** from the position age |
| 3 | **Vehicle not mapped to a provider vehicle** | No `integration_vehicle_mappings` row — action `unavailable`, stating that this vehicle is not linked to a tracking device |
| 4 | **No position ever recorded** | Action `unavailable`; states that no position has been received for this vehicle |
| 5 | **Position exists but coordinates are invalid** | Action `unavailable`; the invalid coordinate is **never** used, rounded, corrected or substituted |
| 6 | **Position is stale** | Action available **with the stale-location warning**; never described as live |
| 7 | **Position is very old (beyond the Owner-configured limit)** | Action `unavailable` rather than misleading; the last recorded time is still shown |
| 8 | **Vehicle moving** | Action available **with the moving-vehicle warning** |
| 9 | **Movement unknown (no speed supplied)** | Action available with the movement-unknown wording; never described as stationary |
| 10 | **User's device location unavailable or permission denied** | Google Maps still opens with the destination; TITAN states that the starting point will come from the device, and does not claim to have computed a route |
| 11 | **Geolocation unavailable because the page is not on a secure origin** | Stated as the real technical reason, not as a generic error |
| 12 | **Google Maps cannot be opened (blocked pop-up, no handler, offline)** | Reported as a failure with the reason; the coordinate and the recorded time remain visible and copyable so the user is not stranded |
| 13 | **Offline / no connectivity on mobile** | The last position **already loaded** may be shown with its real age and an explicit offline label; TITAN must not imply it refreshed. No position is fabricated from cache and presented as new |
| 14 | **Caller not authorised for this vehicle** | Denied identically to a non-existent vehicle, audited, with no confirmation that the vehicle exists |
| 15 | **Cross-tenant vehicle, mapping or position reference** | Refused before any data is returned, and audited |
| 16 | **Vehicle inactive, sold, retired or decommissioned** | Action `unavailable` with that reason, rather than navigating to a position from before it left the fleet |
| 17 | **Multiple vehicles matching a plate search** | All authorised matches are shown for the user to choose; **never auto-selected** |
| 18 | **Position present but the provider flagged it unreliable** | Treated as unverified — action `unavailable` with the provider's reason where one is supplied |

Failure is reported as failure. A navigate action that could not be prepared says so and says why;
nothing reports a success it did not achieve.

---

## Platform fallbacks

**Apple Maps and browser-based map fallbacks are in scope only if the architecture already supports
them.**

Verified at the time of writing: this repository contains **no Apple Maps support whatsoever** — no
`maps.apple.com` deep link, no Apple Maps helper and no platform-detection branch anywhere in
`apps/` or `packages/`. Google Maps is the only mapping platform integrated
(`packages/shared/src/google-maps.ts`, `apps/api/src/routes/google-maps.ts`,
`apps/api/src/lib/google-maps.client.ts`, `apps/web/src/features/maps/GoogleMapView.tsx`).

Therefore:

- **Google Maps is the navigation target for V1.0.** The existing `buildGoogleMapsNavigateUrl` deep link
  already opens the native Google Maps app on iOS and Android where it is installed, and the Google Maps
  web experience otherwise. That is the fallback chain, and it needs no new integration.
- **Apple Maps is not introduced by this capability.** Adding it would be a new mapping integration
  requiring its own Owner-approved scope, its own platform detection and its own verification. It must
  not be added quietly inside this work.
- A **browser fallback is only claimed where it is real** — the same deep link opening in a browser tab.
  No other fallback may be described as supported until it is verified on a real device.
- Where a user's platform cannot open the link at all, that is failure state 12: reported honestly, with
  the coordinate and recorded time left visible.

---

## Honesty rules

1. **A stale position is never described as live.** Not in words, colour, icon, ordering or by omitting
   the age.
2. **No invented coordinates.** No estimate, no interpolation from heading and speed, no snap to a road,
   no depot, job address, suburb or "last known area" standing in for a real position.
3. **No invented freshness.** The age comes from `gps_positions.recordedAt`, and the freshness state
   from the existing shared thresholds — never from the time TITAN happened to read the row.
4. **No invented movement.** Moving or stationary is derived from a real recorded speed, or it is
   `unknown`.
5. **No invented ETA or distance.** TITAN does not display an ETA or a distance it did not obtain from a
   real Maps response. Opening navigation is not an ETA.
6. **No claim of arrival.** TITAN reports that it opened navigation, not that anyone travelled or
   arrived.
7. **Unavailable is stated with a reason.** Never a disabled button with no explanation, and never a
   silent no-op.
8. **Partial is labelled partial.** A position with no speed, no heading or no resolvable place name is
   shown as partial rather than completed with plausible values.
9. **Nothing is claimed to work until it is verified** against a real Cartrack connection, real vehicles
   and a real device in this repository — a page, a nav entry, a document or a mock-based test is never
   evidence.

---

## Acceptance criteria

Required before any completion claim. Each item must be demonstrated against **real** vehicles, a
**real** Cartrack connection and a **real** device in a real (staging) environment, with file, route and
test evidence.

### Identification & action

- [ ] 1. Every authorised vehicle shows a quick action labelled from its registration / number plate,
      formatted exactly as stored (e.g. `CA 123-456` → **Navigate to vehicle**).
- [ ] 2. The action is one shared component with one shared availability decision, identical on every
      surface in *Surfaces*.
- [ ] 3. Every field in *Per-vehicle display fields* is present, with unknown fields genuinely shown as
      unknown.
- [ ] 4. A plate search returns only authorised vehicles, and multiple matches are offered for choice
      rather than auto-selected.

### Position & navigation

- [ ] 5. The destination is the latest valid `gps_positions` row for that vehicle, read through the
      caller's own company Cartrack connection.
- [ ] 6. There is **no** fallback to a job address, depot, suburb or previous-day position anywhere in
      the code path.
- [ ] 7. The recorded timestamp, the relative age and the freshness state are visible **before** the
      user taps, not only afterwards.
- [ ] 8. Tapping opens Google Maps navigation from the user's device location to the vehicle coordinate,
      via the existing `buildGoogleMapsNavigateUrl` helper.
- [ ] 9. The flow works without the legacy `directions` or `distanceMatrix` services being provisioned,
      because no route is computed server-side.
- [ ] 10. TITAN never displays an ETA, distance or arrival it did not obtain from a real response.

### Warnings

- [ ] 11. The moving-vehicle warning appears whenever a real recorded speed indicates movement, with the
      recorded time and speed.
- [ ] 12. The movement-unknown wording appears where no speed was supplied, and the vehicle is never
      described as stationary.
- [ ] 13. The stale-location warning appears whenever the position exceeds `FLEET_POSITION_STALE_MS`,
      stating the age and the recorded time in the warning itself.
- [ ] 14. Direct inspection shows the words *live*, *current*, *now*, *real-time* and *tracking* are
      never rendered against a stale position in the UI, exports, notifications, AURA answers or audit
      descriptions.
- [ ] 15. A stale position remains navigable, and the acknowledgement is audited.

### RBAC

- [ ] 16. Owner reaches every company vehicle; Admin, Dispatcher and Fleet roles are permitted per
      existing fleet permissions.
- [ ] 17. Technician access is limited to assigned or explicitly permitted vehicles, proven
      behaviourally — no fleet-wide list and no plate search across the fleet.
- [ ] 18. Client / customer portal and Marketing are denied entirely, proven behaviourally across every
      endpoint.
- [ ] 19. Denial happens at the router gate **and** in the service before any database access.
- [ ] 20. A wildcard permission grants no access here.
- [ ] 21. An unauthorised plate is indistinguishable from a non-existent plate in the response.
- [ ] 22. Authorisation is evaluated per request; revoking access immediately disables the action.

### Privacy & security

- [ ] 23. Every read is `companyId` scoped, including the vehicle, the mapping, the position and the
      integration connection.
- [ ] 24. Cross-tenant vehicle, mapping, `externalVehicleId` and `externalRegistration` references are
      refused before any data is returned, and audited.
- [ ] 25. No unauthenticated surface, share link, public map or export exposes fleet-wide positions.
- [ ] 26. Direct inspection shows no coordinate, plate-to-position mapping, position history or raw
      Cartrack payload in any customer-facing surface.
- [ ] 27. No navigate action is offered for a missing, invalid or unverified coordinate.
- [ ] 28. Coordinates do not appear in application logs, error reports, analytics events, AURA prompts or
      third-party telemetry.
- [ ] 29. The user's device location is never stored by TITAN.
- [ ] 30. Every navigate action, plate lookup, stale acknowledgement, denial and geolocation failure
      appears in `security_audit_logs` with the actor, company, vehicle and position row used.
- [ ] 31. No new table duplicates position data for this feature.

### Failure states

- [ ] 32. Every state in *Failure states* is reproduced and shows its real reason.
- [ ] 33. No failure is presented as a working navigation, and none is a silent no-op.
- [ ] 34. Offline mobile shows the already-loaded position with its real age and an explicit offline
      label, and never implies a refresh.
- [ ] 35. A blocked or unopenable Maps link still leaves the coordinate and recorded time visible.

### Surfaces & mobile

- [ ] 36. The action is present and behaves identically in the fleet list, vehicle details, Dispatch, the
      Owner dashboard quick actions, mobile fleet and the emergency response path.
- [ ] 37. The mobile fleet surface gap is verified against the code and closed — not assumed to exist.
- [ ] 38. On a real phone the action is usable one-handed, with the plate, freshness state and warning
      legible without scrolling.
- [ ] 39. Verified on a real iOS device and a real Android device that the link opens native Google Maps
      where installed, and the browser experience otherwise.
- [ ] 40. No new navigation entry is added anywhere in the application.

### Honesty

- [ ] 41. Direct inspection shows no invented coordinate, freshness value, movement state, ETA, distance
      or arrival anywhere in the codebase or the UI.
- [ ] 42. No fake vehicles, plates, positions or tracking connections exist in any real tenant.
- [ ] 43. Failed and partial operations are reported honestly, with reasons.

---

## Build rules

- Do **not** start this work while another major phase is active — including the **Xero staging repair /
  live verification** phase and the **Owner dashboard audit**. Requires explicit Owner approval to begin.
- Do not touch dashboard, Finance, Xero or any other work-in-progress files.
- One capability at a time. Preserve the existing architecture — no new tracking stack, no second maps
  integration, no new vehicle store, no new permission model.
- Preserve tenant isolation, RBAC, approvals and audit logging.
- Do not touch completed departments, Yoco (`0123`), or unrelated migrations.
- Do not delete recovery folders. Do not apply, pop or drop stashes.
- No fake or demo data inside real tenants. No production deployment.
- Keep CPU and memory usage controlled.

## Commit & report

- Commit this capability only, as a separate commit.
- Push normally to `origin/cursor/titan-v1-integration`. **No force push.**
- Report files added and modified, routes, services, any schema decision, the shared action component,
  the freshness and warning implementation, RBAC and tenant isolation evidence, failure-state coverage,
  audit coverage, real-device verification, tests and builds, commit hash, push status, branch
  synchronisation and working-tree status.

STOP and wait for Owner approval.
