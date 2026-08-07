# Geyser Installation Completion Requirements

**Status: ⬜ Planned / required for TITAN V1.0 — NOT started. No implementation exists and none may be
started yet. Must not be implemented during another active phase.**

This document records an approved **hard completion gate** only. It is a sub-requirement of
[`EQUIPMENT_LIFECYCLE_AND_PREVENTATIVE_MAINTENANCE.md`](./EQUIPMENT_LIFECYCLE_AND_PREVENTATIVE_MAINTENANCE.md)
and is written so the work can be picked up later without re-deciding the requirements.

A Xero live staging verification phase and other phases may be active on this branch. **Do not begin
this work alongside them**, and do not touch Xero, Finance, job-execution or any other
work-in-progress files while this scope is recorded. See
[`XERO_COMPLETE_HISTORICAL_SYNC_AND_FINANCIAL_MEMORY.md`](./XERO_COMPLETE_HISTORICAL_SYNC_AND_FINANCIAL_MEMORY.md).

**Cross-link — related existing surfaces.** This requirement **extends** the following and must not
rebuild, duplicate or replace any of them:

- **Equipment Lifecycle & Preventative Maintenance Intelligence** —
  [`EQUIPMENT_LIFECYCLE_AND_PREVENTATIVE_MAINTENANCE.md`](./EQUIPMENT_LIFECYCLE_AND_PREVENTATIVE_MAINTENANCE.md)
  — the parent capability. The asset record, taxonomy, honesty rules and acceptance criteria live
  there; this document records only the **completion gate** and what must happen immediately after it.
- **Recurring Maintenance Engine** (migration `0130`, `ops_recurring_maintenance_plans` /
  `ops_maintenance_runs` / `ops_maintenance_reminders`, commit `a11160e`) — the existing plan / run /
  reminder engine that must carry the maintenance and warranty reminders created here.
- **Property Intelligence** (Department 12, `property-intelligence`, migration `0161`) — the property
  timeline the completed installation must appear on.
- **Customer 360** (`customer-360-intelligence`) — the customer-side view of the new asset.
- **Document Intelligence** (Department 13, `document-intelligence`, migration `0163`) and
  **Compliance Intelligence** (Department 14, `compliance-intelligence`, migration `0164`) — the COC,
  certificate, warranty document and photo evidence path. Document IDs are real IDs only.
- **Existing job completion path** — `jobs`, the job-execution service and the `completion_reports`
  table (`packages/db/src/schema/completion-reports.ts`, which already links `jobId`, `customerId`,
  `propertyId`, `invoiceId`, `quoteId` and `documentId`), plus the existing gated-completion
  idempotency guards (`apps/api/src/services/job-execution-completion-idempotency.test.ts`,
  `apps/web` mobile offline completion flow). **No second completion pipeline is built.** An
  implementer must re-verify this inventory with `file:line` evidence before implementing, and report
  honestly if the finding differs.

---

## Why this gate exists

A geyser installation that ends as a completed job plus an invoice loses the asset. The serial number
is on the roof, the warranty document is in a van, and nobody knows the unit exists two years later
when the anode should be inspected or the warranty is about to lapse.

**The completion gate is the only reliable point of capture** — the technician is standing at the unit
with the data plate in front of them. After they leave, the data is gone for good.

---

## The completion gate

**A geyser installation job may not be marked fully complete until every field below is either
captured or explicitly marked unavailable by the technician.**

- "Explicitly marked unavailable" means a deliberate, recorded, attributed action with a reason — not
  a blank field, not a skipped step, and not a default.
- A field left simply empty **blocks completion**. Silence is not an answer.
- Marking a field unavailable is recorded against the job and the asset, is visible afterwards as a
  known gap, and puts the asset on the relevant *missing data* list in the parent capability.

### Required fields

| # | Field | Notes |
|---|-------|-------|
| 1 | **Manufacturer** | Read from the unit or its documentation — never guessed |
| 2 | **Brand** | Recorded separately from manufacturer, because they are often not the same |
| 3 | **Model** | As printed on the data plate |
| 4 | **Capacity** | e.g. litres — recorded only when known |
| 5 | **Serial number** | Read off the unit. **Never generated, never sequential, never a placeholder** |
| 6 | **Installation date** | The real date of installation |
| 7 | **Supplier** | Where the unit was bought — a real supplier record |
| 8 | **Supplier invoice** | The real purchase document, as a document reference |
| 9 | **Warranty start date** | From a real supplier record, invoice or warranty document only |
| 10 | **Warranty expiry date** | From a real document only — **never calculated from an assumed standard term** |
| 11 | **Property** | The real `cx_customer_properties` row |
| 12 | **Customer** | The real customer record |
| 13 | **Installer / technician** | The real user who performed the installation |
| 14 | **Job** | The real installing job |
| 15 | **COC / certificate** | A real compliance document reference via Compliance Intelligence |
| 16 | **Installation photos** | Real document references |
| 17 | **Data-plate photo** | The photograph or scan of the unit's data plate |
| 18 | **Initial maintenance due date** | The first scheduled service date, derived from the real installation date and the company template |

**Where the installation date is unavailable, the initial maintenance due date is not invented.** The
schedule is created flagged `needs_start_date`, consistent with the parent capability.

---

## Data-plate capture

The technician may **scan or photograph the data plate** to capture manufacturer, brand, model,
capacity and serial number rather than typing them.

| Requirement | Detail |
|-------------|--------|
| Original preserved | The original image is stored **unchanged and permanently** as a real document. Enhancement, cropping or rotation produces **new** artefacts and never overwrites the original |
| Extraction is a proposal | Extracted values are a proposal for review, with per-field confidence, not a fact |
| Correction | **Authorised users may correct extracted values.** Every correction records the original extracted value, the corrected value, the actor, the timestamp and the reason |
| Traceability | Every captured field is traceable back to the image region or the document it came from |
| Nothing invented | A field the image does not show is left unavailable. Low confidence forces human review; it never resolves itself into a stored value |
| Untrusted input | The image and any extracted text are treated as untrusted input |

This capture path reuses the existing document and OCR foundation described in
[`SMART_INVOICE_AND_RECEIPT_CAPTURE.md`](./SMART_INVOICE_AND_RECEIPT_CAPTURE.md) — original preserved,
extraction reviewed, confidence recorded. **No parallel capture pipeline is built.**

---

## Honesty rules for this gate

These are non-negotiable and carry the full weight of the parent capability's honesty rules.

1. **Never invent a serial number.** A serial that was not read off the unit or its data plate stays
   unavailable. No generated, sequential, derived or placeholder serials, ever.
2. **Never invent a warranty date.** A warranty start or expiry date exists only from a real supplier
   record, invoice or warranty document. It is never calculated from an assumed standard term and
   never defaulted to active.
3. **Where the warranty is not verified, TITAN states exactly:**

   > Warranty details require confirmation.

   This line is shown on the asset, on the completion record and anywhere a warranty status would
   otherwise appear. It is **never** softened into an implied active warranty, and no warranty
   reminder is fabricated for that asset — it lands on the *warranty date missing* list instead.
4. **Never invent manufacturer, brand, model or capacity.** An unreadable data plate produces
   unavailable fields, not plausible ones.
5. **Marking a field unavailable is never hidden.** It is recorded, attributed and visible as a gap.
6. **Failure is reported as failure.** If any post-completion step below cannot be performed, the
   reason is surfaced. Completion is never reported as fully successful when the asset, its links or
   its reminders were not created.

---

## What must happen after completion

Once the gate is satisfied and the job is marked complete, TITAN must perform the following. These are
**system actions on real records**, and each one either succeeds or is reported as a failure with its
reason. The sequence must be **idempotent** — reprocessing the same completed job creates no
duplicates.

| # | Action | Detail |
|---|--------|--------|
| 1 | **Create the equipment asset record** | Per the parent capability: the `asset_equipment` row **and** its `al_asset_registry_profiles` row, created atomically or reported as failed |
| 2 | **Link the property and the customer** | Real `cx_customer_properties` and customer references, validated against the caller's `companyId` before storage |
| 3 | **Link the COC, the supplier invoice and the photos** | Real document IDs only — the COC and certificate via Compliance Intelligence, the invoice and photos via Document Intelligence and the existing document store |
| 4 | **Create warranty reminders** | Only where a real warranty date exists, at the parent capability's 90 / 60 / 30-day and expiry triggers. Where the warranty is unverified, **no reminder is created** and the asset is listed as *warranty date missing* |
| 5 | **Create the first annual maintenance reminder** | From the real installation date and the company's geyser template. Where no installation date exists, the schedule is flagged `needs_start_date` with **no invented due date** |
| 6 | **Create the anode inspection reminder** | Sacrificial anode inspection and replacement assessment, per the Owner-configurable company default — presented as the **company's** interval, never as a manufacturer requirement |
| 7 | **Add the installation to the property timeline** | The installation event appears in Property Intelligence's property timeline, composed from the real rows — installation, technician, job, documents and scheduled future work |

All reminders are written to the **existing** Recurring Maintenance Engine and
`asset_maintenance_schedules`. No new reminder, notification, approval or audit system is created, and
no customer message is sent — customer-facing reminders remain **drafts requiring approval**, as
recorded in the parent capability.

---

## Scope boundaries

- **No job-completion guard is implemented by this document, and no asset creation is implemented.**
  This is a requirement record only.
- No second completion pipeline, no second asset store, no second document store, no second reminder
  engine.
- Existing tenant isolation, RBAC, Draft → Approve → Execute and `security_audit_logs` are preserved
  unchanged. Every field capture, unavailable-marking, extraction correction, asset creation, document
  link and reminder creation is audited with the actor, company and target.
- The technician may record real installation data on their assigned job. They gain **no** finance
  figures, no customer-wide installed base and no bulk export.
- Nothing here writes to the ledger, to Xero, or to a price.
- No fake or demo equipment, properties, customers, jobs or documents in any real tenant. No deploy.
  Yoco (`0123`) untouched.

---

## Acceptance criteria

Required before any completion claim, demonstrated against **real** jobs, assets and documents in a
real (staging) environment with file, route, migration and test evidence.

- [ ] 1. A geyser installation job cannot be marked fully complete while any of the 18 required fields
      is neither captured nor explicitly marked unavailable.
- [ ] 2. Marking a field unavailable requires a deliberate attributed action with a reason, and is
      visible afterwards as a known gap.
- [ ] 3. An empty field blocks completion; no field defaults itself to satisfy the gate.
- [ ] 4. The technician can scan or photograph the data plate, and the original image is stored
      unchanged and remains retrievable.
- [ ] 5. Extracted values are proposals with confidence; an authorised user can correct them, and the
      original extracted value, actor, timestamp and reason are recorded.
- [ ] 6. Direct inspection shows no path that can generate, derive or default a serial number.
- [ ] 7. Direct inspection shows no path that can calculate a warranty date from an assumed term.
- [ ] 8. Where the warranty is unverified, the exact text *"Warranty details require confirmation."*
      is shown, no warranty reminder exists, and the asset appears on the *warranty date missing*
      list.
- [ ] 9. Completing the job creates the asset record **and** its registry profile, or reports a clear
      failure.
- [ ] 10. The asset is linked to the real property, customer, job and installer, with cross-company
      references refused before storage.
- [ ] 11. The COC, supplier invoice and installation and data-plate photos are linked as real document
      IDs.
- [ ] 12. Warranty reminders exist only from real dates, at 90 / 60 / 30 days and on expiry.
- [ ] 13. The first annual maintenance reminder is created from the real installation date, or the
      schedule is flagged `needs_start_date` with no invented due date.
- [ ] 14. The anode inspection reminder is created and is labelled a company default everywhere it
      appears, never a manufacturer requirement.
- [ ] 15. The installation appears on the property timeline in Property Intelligence, composed from
      real rows.
- [ ] 16. Reprocessing the same completed job creates no duplicate asset, schedule, reminder or
      timeline entry.
- [ ] 17. Every action listed under *What must happen after completion* that fails is reported as a
      failure with its reason; completion is never reported as fully successful when it was partial.
- [ ] 18. Every capture, unavailable-marking, correction, asset creation, document link and reminder
      creation appears in `security_audit_logs` with the actor, company and target.

---

## Build rules

- Do **not** start this work while another major phase is active — including Xero live staging
  verification. Requires explicit Owner approval to begin.
- Implement it as part of the Equipment Lifecycle & Preventative Maintenance capability, not as a
  standalone product.
- Preserve the existing architecture, tenant isolation, RBAC, approvals and audit logging.
- Do not touch completed departments, Yoco (`0123`), or unrelated migrations.
- Do not delete recovery folders. Do not apply, pop or drop stashes.
- Keep CPU and memory usage controlled.

STOP and wait for Owner approval.
