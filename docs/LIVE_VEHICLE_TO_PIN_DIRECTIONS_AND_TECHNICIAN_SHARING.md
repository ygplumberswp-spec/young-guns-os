# Live Vehicle-to-Pin Directions & Technician Sharing

**Status: ⬜ Planned / required for TITAN V1.0 — NOT started. Do not implement while the Xero repair /
staging phase is active.**

This document records approved Owner scope only. **No implementation exists for this capability and
none may be started yet.** It is written so the work can be picked up later without re-deciding the
requirements.

The **Xero Complete Historical Sync & Financial Memory** repair may be active on this branch. Do not
begin this work alongside it, and do not touch Xero, Finance or any other work-in-progress files while
recording this scope. See
[`XERO_COMPLETE_HISTORICAL_SYNC_AND_FINANCIAL_MEMORY.md`](./XERO_COMPLETE_HISTORICAL_SYNC_AND_FINANCIAL_MEMORY.md).

**Related but distinct — vehicle number-plate navigation quick action.** The Owner has separately
described a quick action that navigates **to** a vehicle from its number plate. That is the inverse of
this capability:

| Capability | Origin | Destination |
|------------|--------|-------------|
| Number-plate navigation quick action | The user's own device | **The vehicle** |
| **This capability** | **The vehicle (bakkie)** | A dropped destination pin |

The two share the same Cartrack position lookup, the same staleness and honesty rules and the same
Google Maps link builder, and must reuse one shared position-resolution layer rather than each building
their own. The companion document is `docs/VEHICLE_NUMBER_PLATE_NAVIGATION_QUICK_ACTION.md`. **That
file is not present in this repository at the time of recording** — when it is recorded, link it from
here and from `TITAN_PROGRESS.md`, and reconcile the shared position layer across both scopes. This
document does not assume its content.

---

## Scope areas

Delivered **across existing modules**, not as a new standalone product:

| # | Area | Role in this capability |
|---|------|-------------------------|
| 1 | **Fleet** | The vehicle record, its plate, its assignment and its operational status |
| 2 | **Cartrack** | The only source of a vehicle's real position; provides the origin |
| 3 | **Dispatch** | Where the dispatcher drops the pin, reviews the route and chooses how to share it |
| 4 | **Jobs** | The job, its site address and its assigned technician give the pin its business meaning |
| 5 | **Google Maps** | Directions rendering and the shareable external link |
| 6 | **WhatsApp** | Business-channel delivery of the directions package to the technician |
| 7 | **SMS** | Fallback delivery where WhatsApp is unavailable or unconfirmed |
| 8 | **Technician Mobile** | The TITAN technician app receives the destination and starts live navigation |
| 9 | **Emergency Response** | The same flow under urgency, with the nearest suitable vehicle and an audited priority path |

---

## Objective

**A dispatcher must be able to drop a destination pin and immediately get directions that start from
where the bakkie actually is — then hand those directions to the technician.**

The complete outcome:

1. The dispatcher drops (or selects) a **destination pin** — a job site, a customer property, an
   emergency location or an ad-hoc map point.
2. TITAN resolves the **starting position from the vehicle's latest verified Cartrack position**, not
   from the dispatcher's device, not from the depot, and not from the customer address.
3. TITAN produces **directions from that vehicle position to that pin**.
4. The dispatcher **shares** the result through any of: the **TITAN technician app**, **WhatsApp**,
   **SMS**, or a **Google Maps link**.

The business outcome is that the technician nearest the work is routed from where they are, the
dispatcher stops phoning to ask "where are you?", and nobody is sent from a guessed starting point.

**Explicitly out of scope:**

- **No new GPS store.** `gps_positions` and the existing Cartrack integration are the source. No second
  position table, no parallel poller.
- **No new messaging stack.** The existing WhatsApp business channel and the existing SMS/communications
  path are used. No parallel sender.
- **No new mapping provider.** The existing Google Maps integration and its existing configuration are
  used.
- **No fabricated position.** See *Honesty and failure handling*.
- **No turn-by-turn engine inside TITAN.** Live turn-by-turn navigation is performed by the device's map
  application; TITAN produces the route, the link and the context.
- **No continuous tracking of a technician's personal phone.** See *RBAC and privacy*.

---

## Existing foundation — to be verified before implementation

Recorded so the work is scoped as **integration**, not a rebuild. An implementer must re-verify each
line with `file:line` evidence and report honestly if the finding differs.

| Existing surface | Where | What it already provides |
|------------------|-------|--------------------------|
| `vehicles` | `packages/db/src/schema/vehicles.ts`, migration `0009` | `licensePlate` (not null), make, model, status, `assignedUserId`, `companyId` |
| `gps_positions` | `packages/db/src/schema/gps-positions.ts` | `vehicleId`, `integrationConnectionId`, `externalVehicleId`, `latitude`, `longitude`, `speedKmh`, `heading`, `recordedAt`, `receivedAt`, `rawPayload` |
| Cartrack connection | `integration_connections`, `integration_vehicle_mappings` | Provider credentials and the external-vehicle mapping |
| Fleet Intelligence | `fleet-intelligence`, migration `0047` | GPS analytics, driver behaviour events, operating costs |
| Vehicle Intelligence | `vehicle-intelligence`, migration `0150` | Vehicle profiles, honest `unavailable` when Cartrack is disconnected |
| Driver Intelligence | `driver-intelligence`, migration `0155` | Driver profiles, trips, route efficiency |
| Fleet AI Recommendations | `fleet-ai-recommendations`, migration `0154` | Route-improvement recommendation drafts (drafts only) |
| Dispatch | `dispatch-intelligence`, `dispatch-ops`, migration `0006` / `0046` | Assignment, dispatch decisions and the dispatch board |
| Jobs | `jobs`, including `snapshotLatitude` / snapshot longitude | The job, its site address and any captured coordinates |
| Google Maps | Existing Maps integration used by Property Intelligence (`0161`) | Pin rendering, and the existing rule that a pin is `unavailable` without real validated coordinates |
| WhatsApp business channel | `whatsapp-connections`, `whatsapp-messages`, `whatsapp-templates`, migration `0019` | Template send, provider delivery status |
| Communications | `communications`, `communications-platform`, `enterprise-unified-communications` | The shared outbound path, preferences and consent |
| Technician mobile | `mobile-workforce`, `enterprise-mobile-platform`, migration `0041` / `0062` | The technician app surface and its device-location capture |

**Known gaps this scope must close** (each to be re-verified):

1. There is **no vehicle-to-pin directions request** anywhere — no route request record, no shareable
   package, no share token.
2. There is **no position-staleness contract**. A latest `gps_positions` row exists, but nothing defines
   when it is too old to route from, or how that is displayed.
3. There is **no shared position-resolution layer** that both this capability and the number-plate
   navigate quick action can use.
4. There is **no directions share audit** — who shared what destination, with whom, on which channel,
   and whether the provider confirmed it.

---

## Drop-pin workflow

The dispatcher-facing flow, in ten steps. Every step is either completed on real data or reported as a
failure with its reason; no step invents its input.

| # | Step | Requirement |
|---|------|-------------|
| 1 | **Open the map surface** | From Dispatch, a job, a customer property or Fleet. The map shows real vehicles with real positions only; a vehicle without a usable position is listed as position `unavailable`, never placed at a default point |
| 2 | **Drop or select the destination pin** | Drop a point on the map, or pick a job site, a customer property address, a saved location or an emergency location. A typed address must be geocoded and **confirmed** by the dispatcher before it becomes the pin |
| 3 | **Confirm the destination** | Show the resolved coordinates, the resolved address (where geocoding returned one), the source of the pin (map drop / job / property / emergency / address search) and any site access note carried from the job or property |
| 4 | **Choose the vehicle** | Select by vehicle name or **number plate**, or by assigned technician, or accept the vehicle already assigned to the job. Emergency response may rank candidate vehicles by real straight-line distance from their real positions — labelled as straight-line, not drive time, unless a real route was calculated |
| 5 | **Resolve the vehicle starting position** | Read the latest verified Cartrack position for that vehicle. Show every field in *Vehicle starting position* including the position age. If no usable position exists, stop and offer the dispatcher options rather than substituting another origin |
| 6 | **Warn on moving or stale position** | Apply the moving and stale rules below. A warning is shown before the route is calculated, not after it is shared |
| 7 | **Calculate the route** | Directions from the vehicle position to the pin, using the existing Maps integration. Distance, estimated duration and the summary are **provider values**, never TITAN estimates. A provider failure is reported as a failure |
| 8 | **Review the directions package** | The dispatcher sees exactly what will be shared: origin, destination, distance, duration, the "as at" position timestamp, the job context and the link |
| 9 | **Choose the share channels** | TITAN technician app, WhatsApp, SMS, or copy the Google Maps link. Multiple channels may be selected. Each send follows its own channel rules and reports its own real outcome |
| 10 | **Record and link** | The request, the resolved origin, the destination, the route result, each share attempt and each provider outcome are stored against the job and the dispatch record, and written to `security_audit_logs` |

---

## Vehicle starting position

### Fields

Every field is shown to the dispatcher before a route is calculated. A field that is not available is
shown as unavailable, never filled with a substitute.

| Field | Source | Notes |
|-------|--------|-------|
| Vehicle | `vehicles.id` / `name` | Company-scoped |
| Number plate | `vehicles.licensePlate` | The dispatcher's real-world identifier for the bakkie |
| Assigned technician | `vehicles.assignedUserId` and/or the job assignment | Shown so the dispatcher knows who they are routing |
| Latitude / longitude | `gps_positions.latitude` / `longitude` | Real provider values only |
| Position recorded at | `gps_positions.recordedAt` | The provider's timestamp — the basis of position age |
| Position received at | `gps_positions.receivedAt` | When TITAN received it; a large gap between recorded and received is itself reported |
| Position age | Derived | Displayed in plain words, e.g. "recorded 3 minutes ago" |
| Speed | `gps_positions.speedKmh` | Drives the moving warning; absent where the provider did not supply it |
| Heading | `gps_positions.heading` | Absent where the provider did not supply it |
| Ignition / trip state | Provider payload where genuinely supplied | **Never inferred from speed**; absent where not supplied |
| Reverse-geocoded location | Maps integration | A convenience label only; the coordinates remain authoritative |
| Provider / connection | `integration_connections`, `externalVehicleId` | Which Cartrack connection supplied the position |
| Position confidence | Derived | `verified` / `stale` / `unavailable`, with the reason |

### Moving and stale warnings

| Condition | Behaviour |
|-----------|-----------|
| **Vehicle is moving** — a real non-zero speed on the latest position | Warn: the origin is a snapshot and the vehicle will not be there when the technician reads the message. Offer a refresh. The route may still be shared, and the message states the position time |
| **Position is stale** — older than the Owner-configured freshness threshold | Warn prominently with the real age. Do **not** silently route from it, and do **not** hide the age in the shared message |
| **Position is very stale** — beyond the Owner-configured hard limit | Block the default one-click share. Sharing requires the dispatcher to explicitly acknowledge the age, and the acknowledgement is recorded |
| **No position at all** — no rows, no mapping, or the vehicle is not tracked | Report `unavailable` with the reason. **No route is produced from an invented origin** |
| **Cartrack disconnected, erroring or rate-limited** | Report the integration state honestly and name it. The last known position may still be offered, clearly labelled with its age |
| **Position is implausible** — e.g. a jump inconsistent with elapsed time | Flag it as questionable and show both the current and previous position rather than routing silently |

Freshness thresholds are **Owner-configured company settings**, not hard-coded constants, and the
configured values are visible wherever a warning is shown.

### Dispatcher options when the position is not good enough

Presented as an explicit choice; TITAN never picks one silently.

| Option | Behaviour |
|--------|-----------|
| **Refresh the position** | Request a fresh Cartrack position. Show whether the refresh actually returned a newer `recordedAt`; a refresh that returned nothing new is reported as such, not presented as fresh |
| **Continue with last known position** | Proceed, with the age carried into the directions package and into every shared message. Recorded as a deliberate choice with the actor and the age at the time |
| **Use the technician's phone position** | Use the technician's device position **only** where the technician's device location is genuinely available under the existing mobile permission and consent rules. The origin is then labelled as the **phone** position, never as the vehicle position |
| **Cancel** | Abandon the request. Nothing is shared, and the cancellation is recorded |

---

## Shareable directions package

One package, produced once, shared through any channel. Every channel renders the same underlying
facts.

| Field | Notes |
|-------|-------|
| Package ID | Stable identifier for the request |
| Company | `companyId` — scopes everything |
| Destination coordinates | The pin, as real coordinates |
| Destination address | Where geocoding produced one; otherwise coordinates only, stated as such |
| Destination label | Job site, customer property, emergency location, or a dispatcher-entered label |
| Destination source | Map drop / job / property / emergency / address search |
| Origin coordinates | The vehicle position used |
| Origin type | **`vehicle`** or **`technician_phone`** — always explicit |
| Origin recorded at | The position timestamp used, carried into every message |
| Origin age at share time | Recorded so the message and the audit agree |
| Vehicle | Vehicle ID and **number plate** |
| Technician | The recipient, where known |
| Job | Job reference where the pin came from or was linked to a job |
| Dispatch record | The dispatch decision this share belongs to |
| Distance | Provider value, with units. Absent where the provider did not return one |
| Estimated duration | Provider value, with its "as at" time. **Never a TITAN estimate** |
| Route summary | Provider summary text where supplied |
| Google Maps link | Built as below |
| Live pin link | The tokenised TITAN link, where live sharing is used |
| Expiry | The link expiry timestamp |
| Created by / created at | The dispatcher and the time |
| Share attempts | Per channel: attempted at, provider response, delivered / failed, reason |

### Google Maps link

| Rule | Requirement |
|------|-------------|
| Destination | Always included as real coordinates (and the resolved address where one exists) |
| Origin | Included **where the platform supports an origin parameter**; where it does not, the link opens with the destination and the device's own current location as origin |
| Origin honesty | Where the link cannot carry the vehicle origin, the accompanying message says so plainly rather than implying the map is routing from the bakkie |
| **No credentials in the URL** | **No Cartrack credentials, API keys, session tokens, account identifiers or provider IDs may appear in any shared URL.** A shared link carries a destination, optionally an origin, and — for live sharing — an opaque TITAN token and nothing else |
| No personal data in the URL | No customer name, phone number, job description or technician identity in query parameters |
| Deep-link behaviour | The link must open the native Google Maps application where installed and the web map otherwise; both are acceptable and neither is claimed to work until verified on a real device |
| Verification | Link formats are claimed as working **only after being opened on a real device**. An unverified platform is reported as unverified |

---

## WhatsApp sharing

Delivery uses the **existing WhatsApp business channel** (`whatsapp-connections`,
`whatsapp-messages`, `whatsapp-templates`, migration `0019`). No parallel sender is built.

### Message template

> Hi {{technician_first_name}},
>
> Directions for {{job_reference}} — {{destination_label}}.
>
> Destination: {{destination_address_or_coordinates}}
> Starting from: {{origin_description}} ({{vehicle_plate}}), position recorded {{origin_recorded_ago}}
> Distance: {{route_distance}} — about {{route_duration}}
>
> Open directions: {{maps_link}}
>
> {{access_note_line}}
>
> {{dispatcher_name}} — {{company_name}}

### Rules

| Rule | Requirement |
|------|-------------|
| Real merge fields only | Every field resolves from a real stored record. An unresolved field leaves the message **incomplete and unsendable**, with the reason shown — never a placeholder, a blank that reads as fact, or a guess |
| Position honesty in the message | `{{origin_recorded_ago}}` is mandatory and cannot be suppressed. A stale origin says so in the message body |
| `{{access_note_line}}` | Included only when a real access note exists on the job or property; otherwise the line is omitted entirely |
| Approval | Sending follows the existing outbound approval rules for the WhatsApp channel. **There is no auto-send path**; an automation policy for dispatcher-initiated sends, if ever introduced, is off by default and does not exist in V1.0 |
| Templates | Where the provider requires an approved template, only a genuinely approved template may be used; an unapproved template is reported as unavailable rather than substituted |
| Consent and preferences | Existing channel consent, opt-out, quiet-hours and the Owner Personal Contact Allowlist rules are applied **before** the send is prepared |
| Delivery truth | A message is reported as **sent only on provider confirmation**. Queued is shown as queued, failed is shown as failed with the provider reason. Read receipts are reported only where the provider genuinely supplies them |
| Retry | Retries are explicit and bounded, never a silent loop, and never a duplicate send that the recipient sees twice without it being visible in TITAN |
| Audit | Every prepare, approve, send attempt and provider outcome is written to `security_audit_logs` |

---

## SMS sharing

The fallback channel, through the existing communications path. Used when WhatsApp is unavailable,
unconfirmed, or when the technician's preference or the emergency path calls for it.

### Workflow

1. The dispatcher selects SMS on the directions package (alone or alongside another channel).
2. TITAN resolves the technician's real mobile number from the user record — **never typed ad hoc into
   the share dialog**, and never a customer's number.
3. The message is composed from the same package, shortened for SMS.
4. The dispatcher sees the exact resolved text and the character/segment count before sending.
5. The send goes through the existing SMS provider path; the provider response is recorded.
6. Delivery state is reported honestly and linked to the job and the dispatch record.

### Rules

| Rule | Requirement |
|------|-------------|
| Length | The composed message and its **segment count** are shown before sending. Truncation is never silent; if the content does not fit, the dispatcher is told what will be dropped |
| Link shortening | Where a shortener is used it must be a TITAN-controlled or provider-supported one, must not leak the destination in a public listing, and must respect the same no-credentials rule |
| Privacy | No customer name, no customer phone number, no job description detail and no health/safety personal information in an SMS. Destination address plus job reference is the maximum customer-identifying content, and even that is Owner-configurable |
| Position honesty | The origin's recorded time is included in short form; if it does not fit, the SMS says the directions start from the vehicle's last known position and points at the full package |
| Cost visibility | Where the provider reports a real cost, it is recorded; no cost is estimated |
| Retry | Bounded, explicit retries with the provider reason recorded per attempt. A retried send must not silently duplicate |
| Delivery truth | Sent only on provider confirmation; unknown delivery is reported as unknown, never as delivered |
| Consent | Existing SMS consent, opt-out and quiet-hours rules apply, with an emergency path that is explicitly Owner-approved and audited rather than an implicit override |

---

## Technician app workflow

The preferred channel, because it keeps the job context.

1. The technician receives the directions package as a **real notification** in the TITAN technician app,
   through the existing mobile notification path.
2. The package opens showing: destination label and address, job reference and job details they are
   entitled to see, the site access note, distance and estimated duration, the vehicle and plate, and the
   **origin with its recorded time**.
3. A **Navigate** action opens directions in the device's map application.
4. **Navigate uses the phone's current position for live turn-by-turn navigation**, because the phone is
   with the technician and the vehicle position is a snapshot. This is the correct behaviour and must be
   stated in the interface, not hidden.
5. **The vehicle context is preserved in TITAN regardless.** The stored package keeps the vehicle origin,
   the plate, the position timestamp and the dispatcher's intent, so the record of what was dispatched
   never changes because the technician's phone moved.
6. The technician can acknowledge the directions, and the acknowledgement (with its real timestamp) is
   returned to Dispatch. An unacknowledged package is shown as unacknowledged, never assumed received.
7. If the destination changes, the technician sees the change explicitly. See *Route updates*.
8. Offline behaviour is honest: a package that could not be delivered to the device is shown as
   undelivered, and a queued acknowledgement is shown as queued.

---

## Live pin sharing

Where a **live** link is shared rather than a static one, it is a tokenised TITAN link.

| Requirement | Detail |
|-------------|--------|
| Secure token | A cryptographically random, opaque, single-purpose token. **Not** a job ID, vehicle ID, package ID, sequential value or anything guessable or enumerable |
| Least disclosure | A token grants **only** what the recipient needs: the destination, and — where the share is explicitly a vehicle-position share — the vehicle position and its timestamp. It grants **no** customer record, no job financials, no other vehicle, no other job, no history and no account access |
| Expiry | Every token has a real expiry, stored and enforced server-side. An expired token returns a plain expired response; it does not silently redirect or degrade to a static page implying it is current |
| Default expiry examples | Owner-configurable, with sensible defaults — for example **4 hours** for a normal dispatch share, **12 hours** for a full-day route, **1 hour** for an ad-hoc external share, and **24 hours** for an emergency response share. These are defaults to be configured, not fixed constants |
| Revoke | Any authorised dispatcher, manager or Owner can revoke a token immediately. Revocation takes effect on the next request with no cache window that keeps it alive |
| Automatic revocation | A token is revoked when the job is cancelled or completed, when the destination changes materially, or when the vehicle assignment changes |
| Rate limiting and abuse | Token endpoints are rate-limited, and repeated invalid token attempts are logged |
| No credentials | A token endpoint never exposes provider credentials, provider IDs, internal identifiers or raw provider payloads |
| Position freshness on a live link | A live link shows the position's real recorded time. When the position goes stale, the link says so rather than showing an old dot as if it were current |
| Audit | Token creation, each access, expiry and revocation are recorded with the actor where known |
| External recipients | Where a link is shared outside the company (for example to an emergency contact), it must carry the minimum content and the shortest sensible expiry, and the external share is explicitly recorded as external |

---

## Route updates

| Trigger | Behaviour |
|---------|-----------|
| Vehicle has moved materially since the package was created | Dispatch shows that the origin is out of date, with the real age. The dispatcher may recalculate and re-share; nothing recalculates and re-sends by itself |
| Destination changes | The change is explicit. A new destination produces a **new** directions package, the previous package's live token is revoked, and the technician is told the destination changed and what it changed from |
| **No silent redirect** | A technician must never find themselves being routed somewhere different from what they were told, without a visible, attributed change notice. A live link must never quietly swap its destination |
| Vehicle reassignment | The package is re-resolved against the new vehicle's real position, or reported as unavailable. The previous technician is told the job moved |
| Job cancelled or completed | The live token is revoked and the package is closed |
| Route recalculation | Only on a real request — dispatcher action, technician request, or an Owner-configured refresh on an open emergency. Never a background loop that burns provider quota |
| Change history | Every recalculation, destination change and re-share is stored as a new record referencing the one it supersedes. Nothing is edited in place |

---

## Job and dispatch linking

| Field | Purpose |
|-------|---------|
| `jobId` | The job the pin belongs to, where one exists |
| Dispatch record reference | The dispatch decision or assignment that produced the share |
| `customerId` / `propertyId` | Where the pin came from a customer property |
| `vehicleId` and plate | The vehicle routed from |
| Technician user ID | The recipient |
| Origin position reference | The `gps_positions` row (or the device-position record) actually used |
| Destination coordinates and source | As recorded in the package |
| Emergency flag and priority | Where the share came from the emergency path |
| Share channel(s) and outcomes | Per channel, with provider confirmation state |
| Acknowledgement | Technician acknowledgement with its real timestamp, or unacknowledged |
| Timestamps | Created, shared, acknowledged, expired, revoked |
| Actor | Who created, shared, changed or revoked |

Rules:

- A directions share is **visible on the job timeline and on the dispatch record**, so anyone reviewing
  the job can see where the technician was sent from, to where, by whom and through which channel.
- A pin dropped without a job may be linked to a job later; the link is recorded, and the original
  ad-hoc source is preserved.
- Nothing here changes job status, assignment, scheduling or any customer-facing record by itself.

---

## RBAC and privacy

Existing platform security is preserved unchanged. **No new permission model.**

| Requirement | Detail |
|-------------|--------|
| Tenant isolation | Every read and write scoped by `companyId`. Vehicle, job, customer, property, user and position references are validated against the caller's company **before** anything is stored or shared |
| Role gating | Enforced at the router gate **and again in the service before any database access** |
| Owner / Admin | Full access — configure freshness thresholds, expiry defaults, SMS content policy and emergency overrides; view all shares and all audit records |
| Manager / Dispatcher | Drop pins, resolve vehicle positions, calculate routes, share on permitted channels, revoke tokens |
| Technician | Receives packages addressed to them, and sees their **own** assigned vehicle context. **No fleet-wide live position view**, no other technician's position, no other job's destinations, no bulk export |
| Accountant / other internal roles | No access to live vehicle positions through this capability |
| Client / Customer portal | **No access.** A customer is not shown a technician's live position through this capability; any customer-facing arrival experience is separate, Owner-approved scope and is not created here |
| Wildcard permissions | A wildcard permission grants nothing here; access is decided by **role** |
| Vehicle position is personal information | A tracked vehicle position is effectively the location of an identifiable employee. Under POPIA it is processed for the **stated operational purpose only** — dispatching and routing work — and not for surveillance, performance inference or anything outside that purpose |
| Phone position | The technician's device position is used **only** with the existing mobile consent, only while it is genuinely needed, and it is never stored as if it were a vehicle position. There is **no continuous background tracking of a personal phone** introduced by this capability |
| Minimisation in messages and links | Every outbound message and every token response carries the minimum content required to do the job |
| Logging | Coordinates, tokens and phone numbers must not leak into application logs, analytics events or error reports |
| Retention | Directions packages, share records and tokens follow the existing retention rules; expired tokens are unusable regardless of retention |
| Audit | Pin creation, position resolution, staleness acknowledgement, route calculation, every share attempt and outcome, token creation, access, expiry and revocation, destination change and every settings change are written to `security_audit_logs` with actor, company and target |
| Untrusted input | Dispatcher-entered labels, addresses, notes and any inbound provider payload are treated as untrusted input |

---

## Honesty and failure handling

Non-negotiable. These rules are the difference between a dispatch tool and a liability.

1. **Never invent a vehicle position.** No depot default, no last job site, no customer address, no
   dispatcher device position silently substituted for the bakkie. No position means `unavailable` with
   the reason.
2. **Never hide position age.** The recorded time travels with the package into every channel and every
   link.
3. **Never invent a distance or a duration.** These are provider values or they are absent. No
   straight-line figure is presented as a drive time, and any straight-line ranking is labelled as
   straight-line.
4. **Never claim a send succeeded without provider confirmation.** Queued is queued, failed is failed
   with the provider reason, unknown is unknown.
5. **Never claim delivery, read or acknowledgement that did not happen.**
6. **Never redirect silently.** A destination change is always visible and attributed.
7. **Report integration state plainly.** Cartrack disconnected, expired credentials, rate-limited, no
   vehicle mapping, provider error — each is named, not collapsed into a generic empty state.
8. **Report a Maps failure as a failure.** No cached or stale route is presented as current, and no route
   is fabricated when directions could not be calculated.
9. **A refresh that returned nothing new says so.** It is never presented as a fresh position.
10. **Partial is labelled partial.** Two of three channels delivering is reported as two of three, per
    channel, not as "shared".
11. **No credentials, keys, tokens or provider identifiers in any shared URL or message, ever.**
12. **Nothing is claimed to work until it is verified** against a real Cartrack connection, a real
    vehicle, a real device and real provider traffic. A page, a nav entry, a document or a mock-based
    test is never evidence.

---

## Acceptance criteria

Required before any completion claim. Each item must be demonstrated against **real** vehicles, real
Cartrack positions, real jobs and real provider traffic in a real (staging) environment, with file,
route, migration and test evidence.

- [ ] 1. A dispatcher can drop a destination pin from Dispatch, a job, a customer property and an
      emergency location, and the resolved coordinates and source are shown before anything is shared.
- [ ] 2. A vehicle can be selected by **number plate** as well as by name or assigned technician.
- [ ] 3. The starting position comes from the vehicle's **latest verified Cartrack position** — proven
      against the real `gps_positions` row — and every field in *Vehicle starting position* is displayed.
- [ ] 4. Position age is displayed before the route is calculated and is carried into every shared
      message and link.
- [ ] 5. A moving vehicle triggers the moving warning; a stale position triggers the stale warning with
      its real age; a very stale position blocks the default share until the dispatcher acknowledges it,
      and the acknowledgement is recorded.
- [ ] 6. A vehicle with no usable position produces **no route** and reports `unavailable` with the real
      reason — no invented, default or substituted origin exists anywhere in the codebase.
- [ ] 7. All four dispatcher options — refresh, continue with last known, use technician phone position,
      cancel — work, and each is recorded as a deliberate choice with its actor.
- [ ] 8. When the technician's phone position is used, the origin type is `technician_phone` everywhere
      it appears, and is never labelled as the vehicle position.
- [ ] 9. Distance and duration are real provider values with an "as at" time, and are absent — not
      estimated — when the provider does not return them.
- [ ] 10. The Google Maps link opens on a real device with the correct destination; where the platform
      supports an origin it is included, and where it does not, the message says so.
- [ ] 11. Direct inspection proves **no Cartrack credentials, API keys, provider tokens, provider
      identifiers or personal data** appear in any shared URL or message.
- [ ] 12. The WhatsApp message sends through the existing business channel with every merge field
      resolved from a real record; an unresolved field blocks the send with a visible reason.
- [ ] 13. The SMS shows its resolved text and segment count before sending, never truncates silently, and
      honours the privacy rules on customer-identifying content.
- [ ] 14. A send is reported as sent only on provider confirmation; queued, failed and unknown states are
      each reported honestly with the provider reason, per channel.
- [ ] 15. The technician receives the package in the TITAN app with full job context, and **Navigate**
      starts live navigation from the phone position while TITAN's stored record still shows the vehicle
      origin, plate and position timestamp.
- [ ] 16. Technician acknowledgement returns to Dispatch with a real timestamp; an unacknowledged package
      is shown as unacknowledged.
- [ ] 17. Live pin tokens are opaque and non-enumerable, expire at their stored expiry, can be revoked
      immediately with effect on the next request, and disclose only the destination and — where
      explicitly shared — the vehicle position and its timestamp.
- [ ] 18. A destination change creates a new package, revokes the previous token and visibly tells the
      technician what changed; **no silent redirect is possible**, proven behaviourally.
- [ ] 19. Every share is linked to the job and the dispatch record, appears on the job timeline, and every
      action in *RBAC and privacy → Audit* appears in `security_audit_logs`.
- [ ] 20. RBAC and tenant isolation are proven behaviourally across roles and endpoints: cross-company
      vehicle, job and position references are refused before use; a technician cannot see fleet-wide
      positions or another technician's position; the client portal has no access; and role denial happens
      at the router gate **and** in the service before any database access.

---

## Build rules

- Do **not** start this work while another major phase is active, including the Xero repair / staging
  phase. Requires explicit Owner approval to begin.
- One capability at a time. Preserve the existing architecture.
- Extend Fleet, Vehicle Intelligence, Driver Intelligence, Dispatch, Jobs, the Maps integration and the
  existing WhatsApp / SMS communications path. **No second GPS store, no second messaging stack, no
  second mapping provider, no second audit or approval system.**
- Share one position-resolution layer with the number-plate navigate quick action rather than duplicating
  it.
- Preserve tenant isolation, RBAC, approvals and audit logging.
- Do not touch completed departments, Yoco (`0123`), or unrelated migrations.
- Do not delete recovery folders. Do not apply, pop or drop stashes.
- No fake vehicles, positions, jobs, technicians or messages in any real tenant. No production
  deployment.
- Keep CPU and memory usage controlled.

## Commit & report

- Commit this capability only, as a separate commit.
- Push normally to `origin/cursor/titan-v1-integration`. **No force push.**
- Report files added and modified, routes, services, database schema and migration decision, the shared
  position-resolution layer, staleness thresholds and their configuration, Google Maps link format and
  the platforms it was verified on, WhatsApp and SMS provider evidence, technician app behaviour, token
  security and expiry/revocation evidence, route-update and no-silent-redirect proof, job and dispatch
  linking, RBAC and tenant isolation, audit coverage, tests and builds, commit hash, push status, branch
  synchronisation and working-tree status.

STOP and wait for Owner approval.
