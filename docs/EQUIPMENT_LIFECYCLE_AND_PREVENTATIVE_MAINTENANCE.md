# Equipment Lifecycle & Preventative Maintenance Intelligence

**Status: ⬜ Planned / required for TITAN V1.0 — NOT started. Do not implement during another active
phase.**

This document records approved scope only. **No implementation exists for this capability and none may
be started yet.** It is written so the work can be picked up later without re-deciding the
requirements.

The **Xero Complete Historical Sync & Financial Memory** phase may be active. Do not begin this work
alongside it, and do not touch Xero, Finance or any other work-in-progress files while recording this
scope. See
[`XERO_COMPLETE_HISTORICAL_SYNC_AND_FINANCIAL_MEMORY.md`](./XERO_COMPLETE_HISTORICAL_SYNC_AND_FINANCIAL_MEMORY.md).

**Cross-link — related existing surfaces.** This capability **extends** the following already-built
surfaces and must not rebuild, duplicate or replace any of them:

- **Property Intelligence** (Department 12, `property-intelligence`, migration `0161`) — already
  surfaces installed equipment and geyser signals per property.
- **Customer 360** (`customer-360-intelligence`) — the customer-side view of equipment, history and
  opportunities.
- **Recurring Maintenance Engine** (migration `0130`, `ops_recurring_maintenance_plans` /
  `ops_maintenance_runs` / `ops_maintenance_reminders` / `ops_maintenance_comm_requests` /
  `ops_maintenance_aura_suggestions`, commit `a11160e`) — the existing plan / run / reminder engine.
- **HomeShield Customer Experience** (Department 7.3, `homeshield-experience`, migration `0148`) — the
  membership, benefits and service-reminder layer.
- **Compliance Intelligence** (Department 14, `compliance-intelligence`, migration `0164`) and
  **Document Intelligence** (Department 13, `document-intelligence`, migration `0163`) — COC
  workflows, certificates, warranties, expiry tracking and typed document profiles.

**Sub-requirement — the hard completion gate.** The geyser installation completion gate is recorded in
full in [`GEYSER_INSTALLATION_COMPLETION_REQUIREMENTS.md`](./GEYSER_INSTALLATION_COMPLETION_REQUIREMENTS.md)
and summarised under *Geyser installation completion requirements* below. It is part of this capability
and part of job completion; it is **not started** and must not be implemented during another active
phase.

---

## Scope areas

This capability is delivered **across existing modules**, not as a new standalone product:

| # | Area | Role in this capability |
|---|------|-------------------------|
| 1 | **Customer 360** | Every customer's installed equipment, service history and open opportunities in one customer view |
| 2 | **Property Intelligence** | Equipment attached to the physical property, with the property timeline |
| 3 | **Equipment Intelligence** | The asset record itself — identity, lifecycle stage, condition, warranty |
| 4 | **Maintenance Intelligence** | Schedules, due dates, forecasting, job preparation |
| 5 | **AI Marketing** | Approval-gated campaigns built from real equipment and maintenance signals |
| 6 | **Customer Success** | Retention, renewal, satisfaction and follow-up around maintained equipment |
| 7 | **Notifications** | Internal and customer-facing reminders, all draft-first |
| 8 | **Documents** | Warranty documents, COCs, installation certificates, service reports, photos |
| 9 | **Finance** | Recurring maintenance revenue, per-asset revenue and margin, forecast value |
| 10 | **AURA** | The daily maintenance engine and the natural-language question surface |

---

## Objective

**Every piece of equipment TITAN installs must become a managed asset with a lifecycle.**

When a technician installs a geyser, heat pump, pump, filtration system or pressure-reducing valve,
that installation must not end as a completed job and an invoice. It must produce a **permanent asset
record** attached to the customer and the property, which then drives:

- **Automatic maintenance schedules** — the next service is known and due-dated the moment the asset
  is recorded, without anyone remembering to create it.
- **Warranty reminders** — the business and the customer are warned **before** a warranty lapses, not
  after.
- **A complete service history** — every visit, part, fault, reading and recommendation against that
  specific unit, permanently.
- **Follow-up opportunities** — service due, warranty expiring, ageing equipment, repeat faults and
  replacement conversations surfaced as real, evidenced opportunities.

The business outcome is to **protect the equipment and protect the recurring maintenance work**. An
installed base that is tracked produces predictable annual service revenue; an installed base that is
forgotten produces a one-off invoice and a lost customer.

**Explicitly out of scope:**

- **No new asset store.** This extends `asset_equipment`, `al_asset_registry_profiles` and the
  existing maintenance tables. No second asset registry, no parallel maintenance engine.
- **No new reminder, approval, notification or audit system.** Existing approval queues,
  `security_audit_logs` and the notification path are reused.
- **No automatic customer contact.** See *Customer communication*.
- **No invented manufacturer data.** See *Honesty rules*.
- **No IoT or telemetry requirement.** `al_iot_devices` / `al_telemetry_readings` exist but are not a
  dependency; equipment with no telemetry must be fully manageable.

---

## Existing foundation — what is already built

An implementer must start by verifying this inventory against the code. It is recorded here so the
work is scoped as **completion and integration**, not a rebuild.

| Existing table | Migration | What it already holds |
|----------------|-----------|-----------------------|
| `asset_equipment` | `0044` | Base asset: type, name, serial number, barcode, supplier, purchase date, warranty expiry, status, condition, location text, photo and document ID arrays |
| `asset_lifecycle_events` | `0044` | Acquisition, assignment, transfer, maintenance, repair, calibration, warranty, retirement, disposal events |
| `asset_maintenance_schedules` | `0044` | `scheduleType` (recurring / usage_based / inspection_reminder / warranty_reminder / service_interval), `intervalDays`, `intervalUsageHours`, `nextDueAt`, `lastCompletedAt`, `isActive` |
| `asset_maintenance_records` | `0044` | Service records with type, status, scheduled/completed timestamps, technician, `jobId`, labour/parts/total cost, downtime, notes |
| `asset_inspections`, `asset_calibrations`, `asset_maintenance_costs`, `asset_maintenance_actions` | `0044` | Inspections, calibrations, cost lines, and approval-gated maintenance / replacement recommendation drafts |
| `al_asset_registry_profiles` | `0065` | **The customer-installed bridge** — `ownershipType`, `customerId`, `propertyId`, `manufacturer`, `model`, `installationDate`, `commissioningDate`, `warrantyDetails`, `criticality`, `lifecycleStage` |
| `al_asset_categories` | `0065` | **The extensibility mechanism** — company-defined categories plus `customCategoryName` |
| `al_preventive_maintenance_due` | `0065` | Preventive maintenance due records |
| `al_warranty_compliance_records` | `0065` | Warranty and compliance records |
| `al_work_order_drafts` | `0065` | Draft work orders (approval-gated) |
| `al_asset_alerts`, `al_predictive_assessments`, `al_analytics_snapshots`, `al_lifecycle_stage_history`, `al_audit_logs` | `0065` | Alerts, assessments, analytics snapshots, stage history, audit |
| `ops_recurring_maintenance_plans` + runs / reminders / comm requests / AURA suggestions | `0130` | The recurring maintenance engine, already linked to `assetId` |

**Known gaps that this scope must close** (each to be re-verified with `file:line` evidence before
implementation, and reported honestly if the finding differs):

1. `asset_equipment` has **no `customerId` and no `propertyId`**. Customer and property linkage exists
   only on `al_asset_registry_profiles`, so a customer-installed asset is only complete when **both**
   rows exist. The installation → asset path must create both, atomically, or report failure.
2. The `asset_type` enum is company-asset oriented (`vehicle`, `machinery`, `tool`, `equipment`,
   `office_asset`, `it_equipment`, `rented_asset`). It contains **no plumbing equipment types**.
   Equipment taxonomy must therefore live in `al_asset_categories` / `customCategoryName`, **not** in
   the enum. See *Supported equipment*.
3. There is **no automatic creation path** from a completed installation job to an asset record,
   registry profile and maintenance schedule. Today this is manual.
4. There is **no company-level default schedule template** per equipment category, so schedules must
   be created by hand per asset.
5. Property Intelligence infers a geyser from the words in the asset name or category
   (`name.includes('geyser')`). This is a fragile heuristic and must be replaced by a real category
   reference, without breaking existing Property Intelligence behaviour.

---

## Supported equipment

The following equipment types must be supported for lifecycle and preventative maintenance. This list
is the **starting set**, not the limit.

### Water heating

| Equipment | Notes |
|-----------|-------|
| Electric geyser | Including element, thermostat, anode, drip tray, vacuum breakers and safety valves as serviceable parts |
| Solar geyser | Direct and indirect systems, collectors, circulation pump, controller |
| Heat pump water heater | Refrigerant circuit, condenser, filters, controller |
| Gas water heater | Instantaneous and storage; flue and ventilation checks |

### Pumps

| Equipment | Notes |
|-----------|-------|
| Booster / pressure pump | Pressure vessel and cut-in/cut-out settings |
| Borehole pump | Submersible and surface, with control box |
| Pool pump | Including strainer basket and seals |
| Sump / sewer / effluent pump | Including float switches and alarms |
| Circulation pump | Hot-water ring main and solar circulation |
| Rainwater harvesting pump | With tank and filtration set |

### Water treatment & filtration

| Equipment | Notes |
|-----------|-------|
| Whole-house filtration | Cartridge replacement intervals |
| Under-sink / point-of-use filtration | Cartridge replacement intervals |
| Reverse osmosis system | Membrane and pre/post filters |
| Water softener | Resin and salt regeneration |
| UV steriliser | Lamp and sleeve replacement |
| Sediment / carbon filter housings | Housing and O-ring condition |

### Valves, protection & control

| Equipment | Notes |
|-----------|-------|
| Pressure reducing valve (PRV) | Set pressure recorded as a real reading, never assumed |
| Temperature & pressure safety valve | Safety-critical |
| Vacuum breaker | Safety-critical |
| Expansion vessel | Charge pressure recorded as a real reading |
| Thermostatic mixing valve | Scald protection |
| Backflow preventer | Cross-connection protection |
| Isolation and control valves | Where individually recorded |

### Detection, metering & storage

| Equipment | Notes |
|-----------|-------|
| Leak detection device | Where installed |
| Smart / sub water meter | Where installed |
| Water storage tank | Including inlet control valve |
| Drainage and grease equipment | Where the company services it |

### Other serviceable installations

| Equipment | Notes |
|-----------|-------|
| Gas installation (LPG) | Where the company holds the relevant authorisation |
| Irrigation controller and zone valves | Where the company services them |
| Heat exchanger | Where installed |

### Extensibility requirement

**Adding a new equipment type must not require an architecture change, a migration, a new table, a new
service or a code deploy.**

- New equipment types are added as **company-scoped rows in `al_asset_categories`** (or as
  `customCategoryName` on the profile), configured by an authorised user.
- A new type must be able to carry its **own default schedule template** (see below) without new code.
- Adding a type must **never** require extending the `asset_type` Postgres enum, because that is a
  migration and a deploy.
- Adding a type must not retroactively alter existing assets or their schedules.
- Category names are company data, so two companies may legitimately use different names for the same
  physical equipment, and neither may see the other's categories.

---

## Asset record

Every managed asset carries the fields below. **Existing** fields must be reused; **new** fields are
additions to the existing tables or their metadata, decided at implementation time and recorded in the
completion report.

### Identity

| Field | Source | Notes |
|-------|--------|-------|
| Asset ID | `asset_equipment.id` | Existing |
| Company | `asset_equipment.companyId` | Existing — every query scoped by it |
| Equipment category | `al_asset_categories` / `customCategoryName` | Existing — replaces name-string inference |
| Name / label | `asset_equipment.name` | Existing |
| Manufacturer | `al_asset_registry_profiles.manufacturer` | Existing — **nullable, never guessed** |
| Model | `al_asset_registry_profiles.model` | Existing — **nullable, never guessed** |
| Serial number | `asset_equipment.serialNumber` | Existing — **nullable, never generated** |
| Capacity / size / rating | New (category-aware attribute) | e.g. geyser litres, pump kW — recorded only when known |
| Barcode / QR reference | `asset_equipment.barcodeReference` | Existing |

### Ownership & location

| Field | Source | Notes |
|-------|--------|-------|
| Ownership type | `al_asset_registry_profiles.ownershipType` | Existing — distinguishes company-owned from customer-owned |
| Customer | `al_asset_registry_profiles.customerId` | Existing |
| Property | `al_asset_registry_profiles.propertyId` | Existing — `cx_customer_properties` |
| Location on site | `asset_equipment.locationText` | Existing — e.g. roof, ceiling void, outside wall |
| Access notes | New | Ladder required, locked room, dog on site |

### Lifecycle

| Field | Source | Notes |
|-------|--------|-------|
| Lifecycle stage | `al_asset_registry_profiles.lifecycleStage` | Existing |
| Status | `asset_equipment.status` | Existing |
| Condition | `asset_equipment.condition` | Existing — from a real recorded assessment only |
| Installation date | `al_asset_registry_profiles.installationDate` | Existing |
| Commissioning date | `al_asset_registry_profiles.commissioningDate` | Existing |
| Installed by | New (technician / job reference) | Real job and user reference |
| Installing job | New link to `jobs` | The job that created the asset |
| Age | Derived | Derived from installation date; **`unavailable` when the date is unknown** |
| Expected service life | New (category default, Owner-configured) | Explicitly a **company assumption**, labelled as such |
| Replacement due assessment | Derived / `al_predictive_assessments` | Recommendation only |
| Retirement / removal | `asset_lifecycle_events` | Existing |

### Warranty

| Field | Source | Notes |
|-------|--------|-------|
| Warranty expiry | `asset_equipment.warrantyExpiresAt` | Existing — **only from a real document or supplier record** |
| Warranty detail | `al_asset_registry_profiles.warrantyDetails` | Existing — term, scope, exclusions as captured |
| Warranty type | New | Manufacturer / supplier / workmanship, recorded separately |
| Warranty document | `documents` via `documentIds` | The evidence for the expiry date |
| Warranty status | Derived | `active` / `expiring` / `expired` / **`unknown`** — never assumed active |

### Commercial & compliance

| Field | Source | Notes |
|-------|--------|-------|
| Supplier | `asset_equipment.supplierId` | Existing |
| Purchase / installation cost | `asset_equipment` + Finance | Real records only |
| Purchase date | `asset_equipment.purchaseDate` | Existing |
| COC / certificate | Compliance Intelligence + Document Intelligence | Real document IDs only |
| Photos | `asset_equipment.photoDocumentIds` | Existing |
| Documents | `asset_equipment.documentIds` | Existing |
| Membership cover | HomeShield / HomeCare subscription link | See *Membership integration* |
| Criticality | `al_asset_registry_profiles.criticality` | Existing |
| Metadata | `asset_equipment.metadata` | Existing |
| Created by / created at / updated at | Existing | Existing |

**A field that is not known is left empty and reported as unknown.** No placeholder serial numbers, no
assumed manufacturers, no default warranty dates, no invented capacities.

---

## Geyser installation completion requirements

**Status: ⬜ Planned / required — NOT started. Part of this capability and of job completion. Must not
be started during another active phase.** Full detail, including the 18-item acceptance checklist:
[`GEYSER_INSTALLATION_COMPLETION_REQUIREMENTS.md`](./GEYSER_INSTALLATION_COMPLETION_REQUIREMENTS.md).

A geyser installation that ends as a completed job plus an invoice loses the asset. The completion gate
is the only reliable point of capture, because the technician is standing at the unit with the data
plate in front of them.

### The gate

**A geyser installation job may not be marked fully complete until every field below is either
captured or explicitly marked unavailable** — a deliberate, attributed, recorded action with a reason.
A field left simply empty **blocks completion**; silence is not an answer, and an unavailable field
stays visible afterwards as a known gap.

| # | Field | # | Field |
|---|-------|---|-------|
| 1 | Manufacturer | 10 | Warranty expiry date |
| 2 | Brand (recorded separately) | 11 | Property |
| 3 | Model | 12 | Customer |
| 4 | Capacity | 13 | Installer / technician |
| 5 | Serial number | 14 | Job |
| 6 | Installation date | 15 | COC / certificate |
| 7 | Supplier | 16 | Installation photos |
| 8 | Supplier invoice | 17 | Data-plate photo |
| 9 | Warranty start date | 18 | Initial maintenance due date |

### Data-plate capture

The technician may **scan or photograph the data plate** instead of typing manufacturer, brand, model,
capacity and serial number.

- The **original image is preserved unchanged and permanently**. Enhancement or cropping writes new
  artefacts only.
- Extracted values are **proposals with confidence**, not facts. **Authorised users may correct
  extracted values**, and every correction records the original value, the corrected value, the actor,
  the timestamp and the reason.
- A field the image does not show stays unavailable. This reuses the existing capture / OCR / review
  foundation ([`SMART_INVOICE_AND_RECEIPT_CAPTURE.md`](./SMART_INVOICE_AND_RECEIPT_CAPTURE.md)) — no
  parallel capture pipeline.

### Honesty

- **Never invent a serial number.** No generated, sequential, derived or placeholder serials.
- **Never invent a warranty date.** No assumed standard term, no default to active.
- Where the warranty is not verified, TITAN states exactly:

  > Warranty details require confirmation.

  No warranty reminder is fabricated for that asset; it lands on the *warranty date missing* list.

### After completion

Each action below runs on real records, is **idempotent** on reprocessing, and is reported as a failure
with its reason if it cannot be performed:

1. Create the **equipment asset** record — the `asset_equipment` row **and** its
   `al_asset_registry_profiles` row, atomically or reported as failed.
2. **Link the property and the customer.**
3. **Link the COC, the supplier invoice and the photos** as real document IDs.
4. **Create warranty reminders** — only from real dates, at 90 / 60 / 30 days and on expiry.
5. **Create the first annual maintenance reminder** — from the real installation date, or flagged
   `needs_start_date` with no invented due date.
6. **Create the anode inspection reminder** — labelled a company default, never a manufacturer
   requirement.
7. **Add the installation to the property timeline** in Property Intelligence.

All reminders use the existing Recurring Maintenance Engine (`0130`) and `asset_maintenance_schedules`.
The existing job completion path (`jobs`, job-execution, `completion_reports`, and the existing
gated-completion idempotency guards) is **extended, not replaced** — an implementer must re-verify that
inventory with `file:line` evidence first. No customer message is sent; customer-facing reminders stay
drafts requiring approval.

---

## Automatic maintenance schedule

### Creation

When an asset is recorded — whether created from a completed installation job, entered manually, or
imported — TITAN must **prepare its maintenance schedule automatically** from the default template for
that equipment category.

- Schedules are written to `asset_maintenance_schedules` using the existing `scheduleType` values, and
  where a recurring customer plan is appropriate, to `ops_recurring_maintenance_plans`.
- The first `nextDueAt` is calculated from the **installation or commissioning date** when one exists.
  Where neither exists, the schedule is created but flagged **`needs_start_date`** and **no due date
  is invented**.
- Schedule creation is **idempotent** — reprocessing the same installation must not produce duplicate
  schedules.
- Every generated schedule records **why it exists**: the template, the category and the source job or
  asset event.

### Template definition

Templates are **Owner-configured company defaults per equipment category**. Each interval entry
defines:

| Element | Requirement |
|---------|-------------|
| Interval | Months or usage hours (`intervalDays` / `intervalUsageHours`) |
| Task list | What the visit covers, in the company's own words |
| Schedule type | Recurring service / inspection / warranty reminder / usage-based |
| Lead time | How far ahead the due item is surfaced internally |
| Customer-visible | Whether it may generate a customer reminder draft at all |
| Billable / included | Whether it is chargeable or covered by a membership |

Templates are **editable and versioned**. Changing a template must **not** silently rewrite the
schedules of existing assets: the change applies going forward, and any bulk application to existing
assets is a separate, explicit, approved action.

### Example — electric geyser

**This is an illustrative Owner-configurable default, not a manufacturer specification.** It must be
presented in the product as a company default that the Owner can change, and it must never be
displayed or described as a manufacturer requirement. See *Honesty rules*.

| Interval | Default service content |
|----------|------------------------|
| **6 months** | Visual inspection — leaks, corrosion, drip tray and overflow, pipe insulation, safety-valve discharge check, recorded water pressure reading |
| **12 months** | Annual service — safety valve and vacuum breaker function check, PRV check with recorded pressure, thermostat setting check, element condition check, expansion vessel check where fitted, sediment flush where the installation allows, photo evidence |
| **24 months** | Sacrificial anode inspection and replacement assessment where the unit has one; element and thermostat condition assessment |
| **36 months** | Full installation review — safety components, compliance condition, insulation, supports and brackets, remaining-life assessment and a replacement conversation where the evidence supports it |

**Warranty notifications for the same asset:**

| Trigger | Notification |
|---------|--------------|
| 90 days before warranty expiry | Internal alert — arrange a pre-expiry inspection while cover still applies |
| 60 days before warranty expiry | Internal alert plus a **draft** customer reminder |
| 30 days before warranty expiry | Escalated internal alert plus a **draft** customer reminder |
| Warranty expiry date | Status moves to `expired`; a post-warranty maintenance-cover opportunity is drafted |
| Warranty expiry unknown | **No notification is fabricated.** The asset is listed as *warranty date missing* so someone can capture the real document |

Warranty notifications must be **suppressed or adjusted** where a real warranty condition is recorded
that changes them, and must never assert what a warranty covers beyond what the captured document
says.

---

## AURA maintenance engine

AURA runs a **daily maintenance check** across the installed base. It **prepares**; it does not act.

### Daily checks

| Check | Output |
|-------|--------|
| Services becoming due | Due and overdue list per asset, customer and property, with lead time applied |
| Overdue services | Escalating internal alerts with the real number of days overdue |
| Warranties expiring | 90 / 60 / 30 day and expiry-date triggers |
| Missing schedules | Assets with no active schedule, or a schedule blocked on a missing start date |
| Missing asset records | Completed installation jobs with **no** asset record — the leak in the process |
| Missing warranty or COC documents | Assets whose warranty date or certificate has no supporting document |
| Ageing equipment | Assets past the Owner-configured expected life, labelled as a company assumption |
| Repeat faults | Assets with multiple recorded faults or callbacks in a window |
| Membership coverage | Covered assets whose due service is not yet scheduled; uncovered assets that are candidates |
| Scheduling capacity | Due work in an area or period that has no capacity allocated |

### What AURA prepares

| Artefact | Constraint |
|----------|------------|
| **Draft maintenance jobs** | Existing `al_work_order_drafts` / `asset_maintenance_actions` / maintenance runs; never auto-dispatched |
| **Internal reminders** | Real due dates only; delivered through the existing notification path |
| **Customer reminder drafts** | Draft only; see *Customer communication* |
| **Scheduling proposals** | Suggested date, technician and route grouping — never a committed booking |
| **Marketing campaign drafts** | Audience built from real assets; see *Marketing campaigns* |
| **Revenue forecasts** | Only from real scheduled and contracted work; see *Finance metrics* |
| **Replacement recommendations** | Evidence-based; the customer is never told to replace on an assumption |

**Hard invariants**, enforced in the service, in the route envelope and as database CHECK constraints,
consistent with the rest of TITAN:

- `autoExecuteActionsEnabled` — invariant **false**
- `autoSendEnabled` — invariant **false**
- `inventEquipmentDataEnabled` — invariant **false**
- `autoExecuted` / `autoSent` — invariant **false**

AURA may not create a job, book a technician, send a message, raise an invoice, change a price, alter
a warranty date or retire an asset. It may only draft, and a human with the right role approves.

---

## Customer communication

Every customer-facing message about equipment is a **draft prepared for approval**. Nothing is sent
automatically, and there is **no auto-send without an approved automation policy** — which is **off by
default** and does not exist in V1.0.

Drafts are prepared through the **existing** communication path (`ops_maintenance_comm_requests`,
Communications Platform, Email Centre, WhatsApp business channel). No parallel sending mechanism is
built.

### Draft example — 12-month geyser service due

> Good day {{customer_first_name}},
>
> Our records show the {{equipment_description}} we installed at {{property_short_address}} on
> {{installation_date}} is due for its {{interval_label}} service.
>
> The service covers {{service_task_summary}}. Keeping it up to date helps protect the unit and
> supports any warranty claim while cover still applies.
>
> {{warranty_line}}
>
> Would you like us to arrange a visit? We have availability {{availability_summary}}.
>
> Kind regards
> {{company_name}}
> {{company_contact}}

Rules for every draft:

- Every merge field must resolve from a **real stored record**. A field that cannot resolve leaves the
  draft **incomplete and unsendable**, and the reason is shown — it is never filled with a guess, a
  placeholder or a blank that reads as fact.
- `{{warranty_line}}` is included **only** when a real warranty date is stored, and it states what the
  document says. Where the date is unknown, the line is omitted entirely rather than softened.
- The draft never claims a manufacturer requires the service. It states the company's service
  interval.
- Drafts respect existing customer communication preferences, opt-outs and channel consent, and the
  Owner Personal Contact Allowlist where relevant.
- The approver sees the resolved message exactly as it will be sent, and the asset it refers to.
- A send is only reported as sent when the **provider confirms** it. A failed send is reported as
  failed.
- No bulk send, no broadcast and no marketing content inside a service reminder.

---

## Service history

Every visit to an asset produces a **service history entry**, and that history is **immutable**.

| Requirement | Detail |
|-------------|--------|
| Append-only | Entries are never edited in place and never deleted. A correction is a **new** entry that references the one it corrects, with the reason and the author recorded |
| One record per visit | Written on job completion against `asset_maintenance_records`, linked to the real `jobId` |
| What is captured | Date, technician, job reference, service type, tasks completed, faults found, parts and materials used, readings taken, photos, recommendations, outcome, next due date, and whether the work was billable or membership-covered |
| Readings | Pressure, temperature, current, flow and similar values are stored as **recorded readings with units and a timestamp** — never estimated or carried forward from a previous visit |
| Evidence | Photos and documents are stored as real document references |
| Costs | Labour, parts and total on the existing cost fields; a cost that is not known stays absent, not `R0` |
| Attribution | Every entry carries who recorded it, when, and from which job or device |
| Visibility | Full history to authorised staff; a customer sees only their own assets' history through the portal |
| No back-dating | An entry cannot be created with a completion date it did not have, and any administrative correction is visible as a correction |

An asset with no visits has an **empty** history. It is never populated with a plausible starting
service.

---

## Property timeline

The property timeline in **Property Intelligence** must show the equipment story for the property, in
one chronological view:

- Installation of each asset, with the job and the technician
- Every service visit and its outcome
- Faults, callbacks and repairs
- Warranty start, warranty reminders and warranty expiry
- COC and certificate issue and expiry
- Replacements, removals and retirements
- Membership cover start, renewal and lapse
- Scheduled future work, visually distinguished from history

Rules:

- The timeline is **composed from real rows** — assets, maintenance records, jobs, documents,
  compliance records and membership records. Nothing is stored or cached in a second place, so it can
  never drift from its source.
- An event with no date is listed as **undated** rather than placed at a guessed position.
- Where a property has equipment but no recorded history, the timeline says so; it does not imply a
  history that was never recorded.
- Property Intelligence's existing geyser and equipment signals must keep working after the category
  reference replaces the name-string inference.

---

## Finance metrics

Finance gains the **equipment and maintenance** view. Every figure comes from real Finance records —
invoices, payments, quotes, job costs — and carries `available` / `partial` / `unavailable` with a
rationale, consistent with the rest of TITAN.

| Metric | Definition |
|--------|-----------|
| Recurring maintenance revenue | Invoiced and paid revenue attributable to maintenance work, by period |
| Contracted forward revenue | Value of maintenance work under a real plan or membership, not a projection of hoped-for work |
| Revenue per asset | Lifetime revenue attributable to one asset — installation, services, repairs, parts |
| Revenue per customer from maintenance | Rolled up from asset revenue |
| Maintenance margin | Only where **real** labour cost exists. Where no real hourly rate is stored, margin is **`unavailable`**, never estimated |
| Cost per service visit | Labour and parts from real recorded costs |
| Warranty recovery | Cost recovered under warranty, from real records (`warranty_recovery` cost type) |
| Repeat-repair cost | Cost concentrated on assets with repeat faults |
| Membership revenue vs cost of service delivered | Real subscription revenue against real delivered-service cost |
| Installed-base size and coverage | Number of managed assets, and how many have an active schedule |
| Due-work pipeline value | Value of scheduled and due maintenance, priced from real rate cards only |
| Replacement opportunity value | Only where a real quote or a real price exists; otherwise reported as an opportunity **without** a value |

Hard rules:

- A missing money value stays **null**. It is never coerced to `R0`.
- No figure is stored or cached in this layer.
- Nothing here writes to the ledger, to Xero, or to a price.
- Mixed currencies are reported as a currency spread, never converted at an invented rate.

---

## Marketing campaigns

**AI Marketing** may build campaigns from the installed base, because the audience is real and the
relevance is real — but every campaign is **approval-gated**.

### Campaign types

| Campaign | Audience source |
|----------|-----------------|
| Service due | Assets with a service due in a window |
| Overdue service recovery | Assets past due, with the real days overdue |
| Warranty expiring | Assets with a real warranty date approaching |
| Post-warranty maintenance cover | Assets whose warranty has genuinely expired |
| Ageing equipment / replacement | Assets past expected life, labelled as a company assumption |
| Seasonal preparation | Winter geyser and burst-pipe readiness, summer pool and irrigation, from real installed equipment |
| Membership upsell | Customers with managed assets and no membership |
| Membership renewal | Real subscriptions approaching renewal |
| Dormant customer reactivation | Customers with installed assets and no recent service |
| New-installation onboarding | Explaining the schedule for equipment just installed |

### Channels

Email, SMS, WhatsApp (business number), customer portal message, in-app notification, and printed or
PDF output for a service letter. Social and paid channels remain governed by the existing Social Media
Integration Layer and its approval queue.

### Rules

- **Every campaign requires approval before it exists as a send.** Nothing publishes or sends
  automatically.
- Audiences are built from **real asset and maintenance rows only** — no lookalike audiences, no
  inferred equipment, no purchased data.
- Every recipient must be traceable to the asset and the signal that put them in the audience, and an
  audience row that cannot be explained is excluded.
- Consent, opt-out, channel preference, quiet hours and the Owner Personal Contact Allowlist are
  enforced **before** the audience is built, not filtered afterwards.
- A customer must not receive a marketing campaign and a service reminder about the same asset in the
  same window; the service reminder takes precedence.
- No campaign claims a manufacturer requirement, a safety obligation or a legal obligation that has
  not been established.
- Campaign performance is reported from real stored activity only; where a channel cannot report
  delivery, that is shown as `unavailable`.

---

## AURA questions

AURA must answer these from **real records**, showing what it counted, as at when — and refusing
honestly where the data is not there.

- Which geysers are due for a service this month?
- Which equipment is out of warranty?
- Whose warranty expires in the next 90 days?
- How many geysers have we installed, and where are they?
- Which customers have equipment we installed but no maintenance plan?
- Which installations from last year have never been serviced?
- What maintenance revenue can we expect next month?
- Which assets cost us the most in repeat repairs?
- Which properties have the oldest equipment?
- Which completed installations never got an asset record?
- Which assets are missing a warranty document or a COC?
- Which customers should we contact about replacement, and why?
- Which membership customers have a service due that is not scheduled?
- What is due in {{suburb}} next week, so we can group the visits?

Answer rules:

- Every answer states the **record type and count** it is based on, and the "as at" timestamp.
- Every answer visibly distinguishes **stored fact** from **calculated** from **recommendation**.
- Where coverage is partial — for example many assets with unknown installation dates — the answer
  says so and gives the partial figure with its limitation, instead of presenting it as complete.
- Where there is no data, AURA says there is no data. It does not estimate, extrapolate or illustrate.
- Answers are scoped to the asker's `companyId` and role. A technician does not get finance figures
  because they asked AURA instead of opening Finance.

---

## HomeCare / HomeShield membership integration

This capability integrates with the existing **HomeShield Customer Experience** layer (Department 7.3,
migration `0148`) — referred to by the Owner as HomeCare / HomeShield. It does not build a second
membership system.

| Requirement | Detail |
|-------------|--------|
| Cover linkage | A membership may cover specific assets, an entire property, or a customer's whole installed base — the covered scope is explicit and stored, never inferred |
| Included services | The membership defines which scheduled services are included and which remain chargeable; the service history records which applied |
| Automatic entitlement | Membership benefits and service reminders already in HomeShield must consume the real equipment schedule rather than a separate reminder list |
| Renewal | Renewal drafts may cite the real services delivered and the equipment covered |
| Lapse | When a membership lapses, cover ends, the equipment schedule **continues** as chargeable, and the customer is not silently dropped from maintenance |
| Upsell | Uncovered assets are membership candidates; the value shown must be based on real service pricing |
| Billing | **No automatic billing.** Membership charges follow the existing approved billing path — no auto-charge, no auto-renew charge, no Yoco or Xero write from this layer |
| Portal | A member sees their covered equipment, its history and its next service in the portal, own data only |
| Honesty | Where a membership's covered scope is not recorded, cover is reported as **unknown** rather than assumed to include the asset |

---

## Security & RBAC

Existing platform security is preserved unchanged. No new permission model.

| Requirement | Detail |
|-------------|--------|
| Tenant isolation | Every read and write scoped by `companyId`. Every cross-entity reference — asset, customer, property, job, document, supplier, subscription, campaign — validated against the caller's company **before** it is stored |
| Role gating | Enforced at the router gate **and again in the service before any database access** |
| Owner / Admin | Full equipment, schedule, template, finance, marketing and membership control |
| Manager / Dispatcher | Read the installed base, due work and schedules; may propose and schedule work within their permissions; no template, finance or marketing control |
| Technician | Read the assets on their assigned jobs and record real service history, readings, photos and faults. **No** finance figures, no customer-wide installed base, no marketing, no template editing, no bulk export |
| Accountant | Equipment finance metrics; no customer communication, no marketing publish, no schedule mutation |
| Client / Customer portal | **Own assets only** — own equipment, own history, own next service, own documents. No other customer's data, no cost or margin data, no internal notes |
| Wildcard permissions | A wildcard permission grants nothing here; Owner-only surfaces are decided by **role** |
| Approvals | Draft → Approve → Execute preserved for jobs, communications, campaigns, membership changes and any finance-affecting action |
| Audit | Every asset create/update, schedule create/change, template change, service-history entry and correction, warranty date change, document link, draft approval or rejection, send attempt, campaign approval, membership change and settings change is written to `security_audit_logs` with the actor, company and target |
| Data protection | Customer property and equipment data is personal information under POPIA — minimal purpose-limited processing, no export beyond permission, no leakage into logs or analytics events |
| Untrusted input | Technician-entered notes, readings, photos and imported data are treated as untrusted input |
| Retention | Service history retention follows the existing document and compliance retention rules; immutability does not override a lawful deletion request handled through the existing process |

---

## Honesty rules

These are non-negotiable and are the difference between a maintenance system and a liability.

1. **No invented manufacturer requirements.** TITAN must never state or imply that a manufacturer
   requires a service, an interval, a part or a condition unless that requirement is captured from a
   **real document** stored against the asset. Company service intervals must be presented as the
   **company's** intervals.
2. **No invented serial numbers.** A serial number that was not read off the unit stays empty. No
   generated, sequential or placeholder serials.
3. **No invented warranty dates.** A warranty expiry exists only from a real supplier record,
   invoice or warranty document. Warranty status is **`unknown`** where the date is unknown — never
   defaulted to active, and never calculated from an assumed standard term.
4. **No invented service intervals.** Where no template and no captured requirement exist, the asset
   has **no schedule** and appears on the *missing schedule* list. A due date is never conjured.
5. **No invented installation dates.** Age, expected remaining life and interval start dates are
   `unavailable` when the installation date is unknown.
6. **No invented readings.** Pressure, temperature and similar values come from a recorded measurement
   with a timestamp, or they are absent.
7. **No invented equipment.** An asset record is created only from a real installation, a real
   inspection or a real authorised data entry. No asset is inferred from a job description, a quote
   line or a customer's guess.
8. **No invented history.** An asset with no recorded visits shows none.
9. **No invented money.** A missing cost, price, revenue or margin is null and reported as
   `unavailable` with a reason.
10. **No assumed compliance.** A COC, certificate or safety condition is only asserted from a real
    document via Compliance Intelligence and Document Intelligence.
11. **Failure is reported as failure.** A schedule that could not be created, a draft that could not be
    resolved, a send that did not confirm, a daily check that did not complete — each is surfaced with
    the reason. Nothing reports success it did not achieve.
12. **Partial is labelled partial.** Coverage gaps in the installed base are stated openly rather than
    averaged away.
13. **Nothing is claimed to work until it is verified** against real assets, real jobs and real
    documents in this repository — a page, a nav entry, a document or a mock-based test is never
    evidence.

---

## Acceptance criteria

Required before any completion claim. Each item must be demonstrated against **real** records in a
real (staging) environment, with file, route, migration and test evidence.

### Asset lifecycle

- [ ] 1. Completing an installation job creates the asset record **and** its registry profile,
      linked to the real customer, property, job and technician — or reports a clear failure.
- [ ] 2. Asset creation is idempotent; reprocessing the same job creates no duplicate.
- [ ] 3. An asset can be created manually by an authorised user with the same completeness rules.
- [ ] 4. Every asset field in *Asset record* is present, and unknown fields are genuinely empty.
- [ ] 5. Lifecycle stage and status changes are recorded as real lifecycle events with an actor.
- [ ] 6. Retirement, removal and replacement are recorded and do not delete the asset or its history.

### Equipment taxonomy

- [ ] 7. Every equipment type in *Supported equipment* can be recorded and scheduled.
- [ ] 8. A new equipment type can be added by configuration only — **no migration, no code change, no
      deploy** — and can carry its own default schedule template.
- [ ] 9. Adding a category does not alter existing assets or their schedules.
- [ ] 10. Categories are company-scoped; no cross-company visibility.
- [ ] 11. Property Intelligence geyser and equipment signals still work after the category reference
      replaces name-string inference.

### Schedules

- [ ] 12. A new asset receives its schedule automatically from the category template.
- [ ] 13. An asset with no installation or commissioning date gets a schedule flagged
      `needs_start_date` and **no invented due date**.
- [ ] 14. The electric geyser 6 / 12 / 24 / 36-month default is configurable, and is labelled a
      company default rather than a manufacturer requirement everywhere it appears.
- [ ] 15. Editing a template does not silently rewrite existing assets' schedules.
- [ ] 16. Usage-based intervals work where real usage data exists, and are absent where it does not.
- [ ] 17. Completing a service advances `lastCompletedAt` and the next due date correctly.
- [ ] 18. Assets with no schedule appear on the *missing schedule* list.

### Warranty

- [ ] 19. Warranty reminders fire at 90 / 60 / 30 days and on expiry, from real dates only.
- [ ] 20. An asset with no warranty date generates **no** warranty reminder and appears on the
      *warranty date missing* list.
- [ ] 21. Warranty status never defaults to active, and no standard term is assumed.
- [ ] 22. A warranty date is traceable to the document it came from.

### AURA maintenance engine

- [ ] 23. The daily check runs, logs its run, and reports a failed or partial run honestly.
- [ ] 24. Every check in *Daily checks* produces real output, including completed installations with
      no asset record.
- [ ] 25. Drafts are created for jobs, reminders, scheduling and campaigns; **none executes**.
- [ ] 26. `autoExecuteActionsEnabled`, `autoSendEnabled`, `inventEquipmentDataEnabled`, `autoExecuted`
      and `autoSent` are invariant false in the service, the route envelopes **and** database CHECK
      constraints.
- [ ] 27. Approving a draft never sends a message, books a technician, writes to Finance or Xero, or
      changes a price by itself.

### Customer communication

- [ ] 28. Every merge field resolves from a real record; an unresolved field blocks the send with a
      visible reason.
- [ ] 29. No message can be sent without approval; there is no auto-send path in the codebase.
- [ ] 30. Opt-outs, channel preferences and the Owner Personal Contact Allowlist are honoured before
      audience or draft creation.
- [ ] 31. A send is reported as sent only on provider confirmation; failures are reported as failures.

### Service history

- [ ] 32. Every completed maintenance visit writes exactly one history entry linked to the real job.
- [ ] 33. History is append-only — no UPDATE-in-place and no DELETE endpoint; a correction is a new
      linked entry with a reason and an author.
- [ ] 34. Readings, parts, photos, faults and recommendations are captured, with units and timestamps.
- [ ] 35. An asset with no visits shows an empty history.
- [ ] 36. A customer sees only their own assets' history in the portal.

### Property timeline & Customer 360

- [ ] 37. The property timeline shows installations, services, faults, warranty events, certificates,
      replacements, membership events and scheduled future work, composed from real rows.
- [ ] 38. Undated events are shown as undated, not positioned at a guessed date.
- [ ] 39. Customer 360 shows the customer's full installed base, history and open opportunities.

### Finance

- [ ] 40. Every metric in *Finance metrics* is computed from real Finance records with
      `available` / `partial` / `unavailable` and a rationale.
- [ ] 41. Margin is `unavailable` where no real labour rate exists; no estimate is shown.
- [ ] 42. Missing money values are null, never `R0`.
- [ ] 43. Nothing in this layer writes to the ledger, to Xero, or to a price.

### Marketing

- [ ] 44. Every campaign type builds its audience from real asset and maintenance rows.
- [ ] 45. Every recipient is traceable to the asset and signal that selected them.
- [ ] 46. No campaign publishes or sends without approval.
- [ ] 47. A customer does not receive a campaign and a service reminder about the same asset in the
      same window.

### AURA questions

- [ ] 48. Every question in *AURA questions* is answered from real records with counts and an "as at"
      timestamp.
- [ ] 49. Stored fact, calculated value and recommendation are visibly distinguished.
- [ ] 50. Partial coverage is stated; no-data is answered as no-data.
- [ ] 51. Answers respect the asker's role and `companyId`.

### Membership

- [ ] 52. Covered scope is explicit and stored; unknown cover reports as unknown.
- [ ] 53. HomeShield service reminders consume the real equipment schedule, not a separate list.
- [ ] 54. A lapsed membership ends cover, keeps the schedule as chargeable, and drops nobody silently.
- [ ] 55. No automatic membership billing, renewal charge or payment-provider write from this layer.

### Security

- [ ] 56. Every read and write is `companyId` scoped, proven behaviourally across roles and endpoints.
- [ ] 57. Cross-company references are refused before they are stored.
- [ ] 58. Role denial happens at the router gate **and** in the service before any database access.
- [ ] 59. Technician access is limited to their assigned assets, with no finance figures.
- [ ] 60. Client portal access is own-data only, with no cost or margin exposure.
- [ ] 61. Every mutation listed under *Audit* appears in `security_audit_logs`.

### Honesty

- [ ] 62. Direct inspection shows no invented manufacturer requirement, serial number, warranty date,
      service interval, installation date, reading, cost or history anywhere in the codebase or the UI.
- [ ] 63. No fake equipment, customers, properties, jobs, services or campaigns exist in any real
      tenant.
- [ ] 64. Failed and partial operations are reported honestly, with reasons.

---

## Build rules

- Do **not** start this work while another major phase is active. Requires explicit Owner approval to
  begin.
- One capability at a time. Preserve the existing architecture.
- Preserve tenant isolation, RBAC, approvals and audit logging.
- Do not touch completed departments, Yoco (`0123`), or unrelated migrations.
- Do not delete recovery folders. Do not apply, pop or drop stashes.
- No fake or demo data inside real tenants. No production deployment.
- Keep CPU and memory usage controlled.

## Commit & report

- Commit this capability only, as a separate commit.
- Push normally to `origin/cursor/titan-v1-integration`. **No force push.**
- Report files added and modified, routes, services, database schema, migration and journal decision,
  taxonomy extensibility proof, schedule generation, warranty handling, AURA engine invariants,
  communication approval gates, service-history immutability, finance honesty states, marketing
  approval gates, membership integration, RBAC and tenant isolation, tests and builds, commit hash,
  push status, branch synchronisation and working-tree status.

STOP and wait for Owner approval.
