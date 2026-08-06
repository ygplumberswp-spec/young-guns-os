# Universal Supplier Price-List Import

**Status: ⬜ Planned / required for TITAN V1.0 — Inventory, Procurement, Supplier Intelligence, Email
Operations. NOT started. Do not begin while the Xero phase is active.**

This document records approved scope only. **No implementation exists for this phase and none may be
started yet.** It is written so the work can be picked up later without re-deciding the requirements.

The **Xero Complete Historical Sync & Financial Memory** phase is active. Do not begin this work
alongside it, and do not touch Xero or Finance work-in-progress files while recording or
implementing this scope. See
[`XERO_COMPLETE_HISTORICAL_SYNC_AND_FINANCIAL_MEMORY.md`](./XERO_COMPLETE_HISTORICAL_SYNC_AND_FINANCIAL_MEMORY.md).

---

## Objective

An authorised user provides a supplier price list in **almost any reasonable format**, and TITAN
turns it into a **structured, reviewable supplier catalogue** — with **no manual retyping** of
product codes, descriptions or prices.

The user's job is to **supply the file and review the result**, not to reformat a spreadsheet into a
template first. TITAN adapts to the supplier's layout; the supplier is never asked to change theirs.

**What this is not:**

- **Not a promise of perfect extraction.** Supplier price lists are inconsistent, badly formatted,
  scanned, merged, paginated and sometimes handwritten. Best-effort extraction with **honest
  confidence** and **human review where confidence is low** is the requirement. Silent guessing is
  a defect.
- **Not a rebuild of Supplier Price Intelligence.** The existing `supplier-price-intelligence`
  module (migration `0110`) is **extended**, not replaced.
- **Not an automatic pricing change.** Import never changes what a customer is charged. Selling
  prices move only through the Young Guns pricebook path with explicit approval.
- **Not a second inventory or supplier system.** Supplier CRUD stays in procurement; stock CRUD
  stays in inventory.

---

## Global rules

These apply to every part of this phase.

1. **Extend, don't duplicate.** Build on `supplier-price-intelligence` (`0110`), Supplier &
   Procurement Intelligence (`0143`), Inventory Intelligence (`0142`) and the existing Email Centre
   / Communications Platform. Do not create a parallel import pipeline, a second supplier catalogue,
   or a competing set of price tables.
2. **No active prices without approval.** An import can never place a price into active use. Only an
   explicit approval publishes a new supplier price-list version. A future Owner-configured
   trusted-supplier policy may relax this **only if the Owner explicitly enables it** — it is
   **off by default and does not exist in V1.0**.
3. **Never silently change an uncertain value.** Every cleaned value keeps its raw original, the
   transformation applied and a confidence. Anything uncertain goes to review; it is never quietly
   corrected, rounded, defaulted or dropped.
4. **Zero silent skips.** Every row, page, sheet and attachment that is not imported has a stored
   reason. A row count that does not reconcile is a failure, not a partial success.
5. **Immutable history.** Price history is append-only. Approved versions are never edited in place
   and never deleted.
6. **RBAC** — Owner / Admin / procurement-permitted roles only. Technician and Client are
   **denied**. A wildcard permission does not grant entry where the rule is role-based.
7. **Tenant isolation** — every job, line, catalogue row, mapping profile, file, log and audit row is
   scoped by `companyId`. Cross-tenant supplier IDs, catalogue IDs and files are refused, not merged.
8. **Audit** — every upload, extraction run, mapping change, review decision, approval, rejection and
   settings change is recorded via `security_audit_logs` with acting user, company, action and result.
9. **Honest state everywhere** — report `available` / `partial` / `unavailable` with a rationale.
   Never coerce a missing price to `R0`, never invent a date, a code or a unit, and never present a
   partial extraction as complete.
10. **No fake data.** No seeded, sampled, demo or placeholder suppliers, products or prices — ever.
11. **Separate commit.** This phase lands as its own commit or series, separate from Xero and from
    any department work. Do not mix other work-in-progress into it.

---

## Existing surface (starting point)

Recorded so implementation begins from fact, not a blank page. Confirm or correct this with
`file:line` evidence before building.

**Already present — `supplier-price-intelligence`, migration `0110`** (SPI-001 Phase 1 scaffold, see
[`TITAN_SUPPLIER_PRICE_INTELLIGENCE.md`](../TITAN_SUPPLIER_PRICE_INTELLIGENCE.md)):

| Table | Role |
|-------|------|
| `supplier_price_import_jobs` | Import job with `sourceType`, `sourceFilename`, status, line/review counts |
| `supplier_price_import_lines` | Raw + parsed line with `supplierCode`, `description`, `unit`, `packSize`, `unitCostCents`, `vatIncluded`, `effectiveDate`, `rawPayload` |
| `supplier_price_catalogue_items` | Versioned canonical catalogue with `version`, `previousVersionId`, `approvedByUserId`, `approvedAt`, `isActive` |
| `supplier_price_review_queue` | Uncertain lines with `reason`, `candidateCatalogueItemId`, `marginImpactCents` |

Status enums already exist: import status (`pending`, `processing`, `completed`, `failed`,
`review_required`), line status (`raw`, `matched`, `review`, `approved`, `rejected`, `uncertain`),
dedup verdict (`new`, `duplicate`, `variant`, `uncertain`). Existing API surface accepts a
**pre-parsed line batch** and exposes dashboard, imports and review-queue reads.

**The gap this phase closes:**

- **No file ingestion at all.** Nothing parses XLSX, XLS, CSV, PDF, DOCX or images. The current
  endpoint requires the caller to have already structured the lines — which is exactly the manual
  retyping this phase removes.
- **No column mapping layer**, and no per-supplier memory of a layout.
- **No email ingestion.** Gmail / Email Centre is connected for communications but is not a
  price-list source.
- **Field coverage is thin** — no brand, category, barcode, price breaks, discount, currency, lead
  time, minimum order quantity, discontinued/replacement handling, or extraction provenance.
- **No import preview UI** with edit / approve / reject controls.
- **No price-movement reporting** over the version chain.

**Related, already built (extend, do not rebuild):** Supplier & Procurement Intelligence (`0143`),
Inventory Intelligence Foundation (`0142`), Stock Forecasting & Automation (`0144`), Email Centre and
Communications Platform, `integration-connections` (Gmail). See
[`MILESTONES.md`](./MILESTONES.md) — Milestone 10 (Inventory Foundation) and Milestone 34
(Procurement & Inventory Intelligence) — and [`TITAN_PROGRESS.md`](./TITAN_PROGRESS.md).

**Adjacent planned scope:**
[`SMART_INVOICE_AND_RECEIPT_CAPTURE.md`](./SMART_INVOICE_AND_RECEIPT_CAPTURE.md) covers capturing
supplier **invoices, receipts, delivery notes and statements** as documents with extracted data for
finance. This document covers **price lists** becoming a supplier **catalogue**. They share the
document-capture, OCR, confidence, review and duplicate-prevention concerns and must reuse one
extraction and review foundation rather than building two — but they have different destinations, and
neither replaces the other. Where an invoice is used as a price source here, the price basis is
recorded as `invoiced`.

**Not built — a real dependency, recorded honestly:** the **Young Guns pricebook (YGP-001)** does not
exist in this repository. It appears only in planning documents. The pricebook connection described
below is therefore **conditional**: it is built when YGP-001 exists, and until then the import path
must stop at the supplier catalogue and report the pricebook link as `unavailable` rather than
inventing a selling price.

---

## Input channels

TITAN must accept a price list from **any** of these. Support is claimed per channel **only after it
has been proven on a real supplier file**, and each channel reports its own honest status.

| Channel | Notes |
|---------|-------|
| **XLSX** | Multi-sheet; must handle merged cells, repeated headers, hidden rows/columns, frozen panes, formulas (read the computed value), and sheets that are not the first sheet |
| **XLS** | Legacy Excel; older supplier lists are still circulated in this format |
| **CSV** | Delimiter detection (comma, semicolon, tab, pipe), quoting, encoding detection (UTF-8, Latin-1, Windows-1252), BOM |
| **PDF** | Both text-layer and table-structured PDFs; multi-page with repeated headers and page footers |
| **DOCX** | Tables and price lists embedded in Word documents |
| **Email body** | A price list pasted or typed into the body of a supplier email |
| **Email attachments** | Any of the above formats arriving attached to a supplier email |
| **Paste** | Direct paste into an import box — tab-separated, comma-separated, or pasted table |
| **Images / scans** | Photographs and scans of printed price lists; OCR with visibly lower confidence and mandatory review |
| **Supplier quotations** | A quotation used as a price source, with quote-specific pricing flagged as such |
| **Invoices with product pricing** | An invoice used as a price source, flagged as actual-paid rather than list price |

**Rules for every channel:**

- The **original file is stored immutably** and remains viewable next to the extracted result, so a
  reviewer can always compare against the source.
- **Provenance is recorded per line** — file, sheet, page, row — so any extracted value can be traced
  back to where it came from.
- **An unsupported or unreadable file fails honestly**, naming what was received and why it could not
  be read. It is never accepted as an empty or zero-line import.
- **Quotations and invoices are marked by price basis** (`list`, `quoted`, `invoiced`) and never
  silently treated as a standard list price.
- **Size, type and malware limits** apply, and are enforced before extraction.

---

## Import workflow

Twelve steps. A price list moves forward only when the current step succeeds; nothing skips review or
approval.

| # | Step | Requirement |
|---|------|-------------|
| 1 | **Receive** | Capture the source from any input channel — upload, paste, or a detected supplier email. Record who supplied it, when, and through which channel. |
| 2 | **Register & store** | Create an import job and store the original file immutably with a content hash. The hash is what prevents the same attachment being imported twice. |
| 3 | **Identify the supplier** | Match to an existing supplier by name, email domain, or the user's explicit selection. An unmatched supplier is **asked**, never guessed and never auto-created silently. |
| 4 | **Detect format** | Determine the real format and choose an extraction strategy — spreadsheet, delimited text, PDF table, document table, or OCR. Detection is by content, not by file extension alone. |
| 5 | **Extract** | Pull raw rows, cells and text with position and provenance retained. Nothing is normalised yet; the raw payload is preserved for every line. |
| 6 | **Map columns** | Map the supplier's columns to TITAN fields. AURA suggests a mapping, the user confirms or corrects it, and the confirmed mapping is remembered for that supplier. |
| 7 | **Clean & normalise** | Normalise amounts, VAT treatment, units, pack sizes, dates and codes — keeping raw, cleaned and confidence side by side. Anything uncertain is flagged, never corrected silently. |
| 8 | **Match** | Compare each line against the supplier's existing catalogue by code, normalised description, unit and pack size. |
| 9 | **Classify** | Assign each line exactly one outcome: new, unchanged, price changed, possible duplicate / replacement, discontinued, needs review, or invalid. |
| 10 | **Review** | Present the full result for human review. Every uncertain, changed, duplicate, discontinued and invalid line must be resolved by a person. Nothing uncertain auto-merges. |
| 11 | **Approve** | An authorised user approves, partially approves, or rejects. **No price becomes active without this step.** The approval decision, approver and timestamp are recorded. |
| 12 | **Publish & propagate** | Approval creates a **new supplier price-list version** (append-only, previous version retained) and makes it available to downstream consumers. |

### Downstream consumers of an approved version

Approved supplier prices become available to — and only to — the following, each of which continues
to apply its own approval rules:

- **Quotes** — new quotes may use current supplier costs. **Existing quotes are never repriced
  retroactively.**
- **Inventory** — item cost, valuation inputs and supplier links reference the approved version.
- **Purchasing / procurement** — purchase orders and cost comparisons use the approved version.
  Import never creates or sends a purchase order.
- **Job costing** — material costs on jobs resolve against the version that applied at the time.
- **Finance** — cost movement is visible to finance reporting. Import **never writes to the ledger**
  and never touches Xero.

---

## Fields to extract

Extract every field below **when present in the source**. A field that is absent stays `null` with a
reason — it is never defaulted to a plausible-looking value, and a missing price is never `R0`.

**Identity**

- Supplier name / supplier identity
- Supplier product code / stock code / SKU
- Alternative code, manufacturer code, or cross-reference code
- Barcode / EAN / UPC

**Product**

- Short description
- Long description / specification / detail
- Brand / manufacturer
- Category / product group / department
- Range or series
- Size, weight, dimensions
- Material / type attributes where itemised

**Quantity & measure**

- Unit of measure (each, metre, millimetre, kilogram, litre, box, roll, length, pack)
- Pack size / quantity per pack
- Minimum order quantity
- Quantity price breaks / tiered pricing

**Price**

- Unit cost excluding VAT
- Unit cost including VAT
- VAT rate and VAT treatment (inclusive, exclusive, zero-rated, exempt)
- List price and nett / trade price where both appear
- Discount — percentage and amount
- Currency
- Price basis (`list`, `quoted`, `invoiced`)

**Validity**

- Effective date / valid from
- Expiry date / valid until
- Price list name, reference, or version as stated by the supplier
- Lead time
- Stock availability as stated
- Discontinued flag and replacement code

**Provenance & confidence** (recorded by TITAN, not supplied by the supplier)

- Source channel, file name and content hash
- Sheet / page / row / cell location
- Raw extracted text for each mapped field
- Extraction confidence per field and per line
- Extraction method used (spreadsheet parse, PDF table, OCR, manual entry)
- Any transformation applied during cleaning

---

## Flexible column mapping

**There is no hard-coded layout.** Every supplier's format differs, the same supplier changes format
between versions, and no supplier will be asked to match a TITAN template.

- **AURA suggests a mapping** from the detected headers and the shape of the data — a column of
  currency-formatted numbers is a price candidate, a column of short alphanumeric tokens is a code
  candidate. The suggestion carries a confidence per column.
- **The user confirms or corrects** the mapping before extraction is committed. A low-confidence
  suggestion is presented as a question, not applied as a fact.
- **AURA remembers the confirmed mapping per supplier** as a reusable mapping profile, so the next
  price list from that supplier maps automatically.
- **Layout change is detected.** When a remembered profile no longer fits the file, TITAN says so and
  asks for confirmation rather than mapping the wrong columns and importing silently corrupted data.
- **Multiple profiles per supplier** are supported, because one supplier may issue different lists
  for different product ranges.
- **Unmapped columns are retained** in the raw payload rather than discarded, so nothing from the
  source is lost.
- **Structural noise is handled** — repeated header rows, subtotal and total rows, section headings,
  blank separator rows, page headers and footers, merged cells, and multi-row header stacks. These
  are excluded from product lines with the reason recorded, never counted as products.

---

## Data cleaning

Cleaning is **explicit and reversible**. For every value TITAN stores the raw original, the cleaned
value, the transformation applied, and a confidence. **An uncertain value is never silently changed** —
it is flagged for review with both versions visible.

| Area | Requirement |
|------|-------------|
| **Currency** | Recognise ZAR conventions — `R`, `ZAR`, `R1 234,56`, `1 234.56`, `1,234.56`. Store amounts in cents as integers. A non-ZAR currency is recorded as that currency and **never converted at an invented exchange rate**. |
| **Decimals & separators** | Handle decimal comma and decimal point, space and comma thousands separators. Where a value is genuinely ambiguous (`1.234` — one thousand two hundred thirty-four, or one point two three four), flag it for review rather than picking one. |
| **Negatives & oddities** | Parenthesised negatives, trailing minus, currency suffixes, trailing footnote markers, "POA" / "on request" / "call" — the last of which is `unavailable`, not zero. |
| **VAT** | Determine inclusive vs exclusive from stated headers or totals. Where VAT treatment cannot be established, mark it `unknown` and require review. **Never assume a VAT rate** to make a number balance. Both incl and excl are stored once treatment is known. |
| **Units** | Normalise to a canonical unit set — `each`, `m`, `mm`, `kg`, `l`, `box`, `roll`, `length`, `pack` — mapping common variants (`ea`, `pc`, `pcs`, `no`, `unit`, `mtr`, `metre`, `lm`). An unrecognised unit is kept verbatim and flagged, never forced into the nearest match. |
| **Pack size** | Parse quantity per pack from text such as `Box of 10`, `10/box`, `100pk`, `2.5m length`. Where a unit price and pack price are both present, keep both and state which is which. Do **not** derive a unit price by dividing when the pack quantity is uncertain. |
| **Codes** | Trim whitespace, normalise case for matching while preserving the supplier's original casing for display, and strip non-breaking spaces. Never alter the stored code itself. |
| **Descriptions** | Collapse repeated whitespace and line breaks for matching, keeping the original text intact for display. |
| **Dates** | Assume the South African `DD/MM/YYYY` convention, but flag any date that is ambiguous under `MM/DD/YYYY` and any date outside a plausible range. Never invent an effective date — absent means absent. |
| **Discounts** | Distinguish a percentage from an amount, and record which price the discount applies to. Do not apply a discount to produce a nett price unless the basis is unambiguous. |
| **OCR text** | Correct only the character confusions that are safe and verifiable in context, at explicitly reduced confidence. **All OCR-derived prices require review.** |

---

## Matching & duplicate handling

Every line receives **exactly one** classification. **Nothing uncertain is auto-merged.**

| Classification | Meaning | Behaviour |
|----------------|---------|-----------|
| **New** | No plausible match in the supplier's catalogue | Created on approval as a new catalogue item |
| **Unchanged** | Matched, and price and attributes are identical | Recorded as confirmed at this date; no new version content |
| **Price changed** | Matched, price differs | Shows old price, new price, delta, percentage and margin impact; requires review before approval |
| **Possible duplicate / replacement** | Similar to an existing item but not conclusively the same, or looks like a superseding code | **Never auto-merged.** Sent to the review queue with the candidate shown side by side for a human decision |
| **Discontinued** | Previously present, absent from this list, or explicitly marked discontinued | Flagged as a suggestion. Absence from one list is weak evidence, so it is **never automatically deactivated** without review |
| **Needs review** | Extraction or cleaning confidence is below threshold, VAT or unit is unknown, or the match is ambiguous | Blocked from approval until resolved by a person |
| **Invalid** | Not a product line, unparseable, or internally contradictory | Excluded with a stored reason and shown in the reconciliation count. **Never silently dropped** |

**Matching rules:**

- Match on supplier code first, then on normalised description together with unit and pack size.
  Scoring is deterministic and idempotent — re-running the same import produces the same result.
- Match **within the same supplier and same company**. Cross-supplier and cross-tenant matches are
  refused.
- A match below the confidence threshold is a **possible** duplicate, not a duplicate.
- **Uncertain rows are preserved, never deleted** — this preserves the existing SPI-001 rule.
- Line counts must reconcile: rows extracted = classified + excluded-with-reason.

---

## Price history & reporting

- **History is immutable and append-only.** Every approved version creates new catalogue rows chained
  by `previousVersionId`. Approved history is never edited in place and never deleted, so the price
  that applied on any past date is always recoverable.
- Every version records **who approved it, when, and from which import job and source file**.
- **Job costing and finance resolve against the version that applied at the time**, so a historical
  job's costs do not shift when a new price list is approved.

**AURA reports over real history only** — never estimated, never extrapolated, and `unavailable`
where history is too thin to support the answer:

- Price movement per item, per supplier, and across the catalogue over a chosen period
- Largest increases and decreases, with the versions and source files as evidence
- Supplier cost comparison for equivalent items
- Margin erosion warnings where cost has risen against a selling price that has not
- Items whose cost has not been confirmed for an unusually long time
- Anomalies — an implausible jump worth verifying before approval

**AURA never auto-changes customer selling prices.** It may report, warn and recommend. Every price
answer states its source version and "as at" date, and distinguishes **supplier fact** from
**calculated** from **recommendation**.

---

## Young Guns pricebook connection

**Conditional on YGP-001, which does not yet exist** (see *Existing surface*). Until the pricebook is
built, the import path stops at the approved supplier catalogue and reports this connection as
`unavailable` — it does not invent a selling price.

When the pricebook exists:

- An approved supplier cost change **proposes** a pricebook review for the affected items. It does
  not perform one.
- **The calculation is always shown** — supplier cost, markup or margin rule applied, resulting
  selling price, and the resulting margin — so the Owner can see exactly how a proposed price was
  reached. No opaque number.
- **Minimum margins are protected.** A proposed price that would breach a configured minimum margin
  is blocked and raised as a warning, not quietly accepted.
- **Approval is required** before any selling price changes. The proposal is a draft; approval is a
  separate, audited decision by an authorised user.
- **Locked prices are never overwritten.** An item with a locked or manually fixed price is reported
  as needing attention and left untouched.
- **Existing quotes and invoices are never repriced** by a pricebook change.

---

## Email automation

Active **only when Gmail is connected**. Built on the existing Email Centre / Communications Platform
and `integration-connections` — not as a separate mail stack.

- **Detect** likely supplier price-list emails from known supplier addresses and domains, subject and
  body signals, and attachment types.
- **Prepare** a draft import — supplier identified, attachment stored, mapping suggested from the
  remembered profile, extraction ready to run.
- **Notify** the responsible user that a price list has arrived and is ready for review.
- **Never activate on arrival.** A price list arriving by email is **never** extracted-and-approved
  automatically, and never becomes an active price without human review and approval. Arrival is a
  notification, not an event that changes prices.
- **Prevent duplicate attachment import.** Deduplicate on message ID and attachment content hash, so
  a forwarded, re-sent or repeatedly synced email cannot create a second import of the same file. A
  detected duplicate is reported as already-imported with a link to the original job.
- **A genuinely revised list is not a duplicate** — the same supplier sending an updated file with
  different content creates a new import, not a rejection.
- **Uncertain detection asks.** A misdetected or ambiguous email is offered for confirmation, and can
  be dismissed without side effects. No silent discard.
- Attachments are stored and access-controlled exactly as TITAN documents are — supplier pricing is
  not world-readable.

---

## Import preview & controls

The reviewer must be able to see and correct everything before anything is approved.

- **Side-by-side view** — the original source (file, page, or email) next to the extracted result.
- **Summary before detail** — counts by classification, total lines, excluded lines with reasons,
  and reconciliation, so the reviewer knows the shape of the import before reading rows.
- **Per-line detail** — raw value, cleaned value, transformation applied, confidence, provenance
  (sheet / page / row), match candidate and classification.
- **Low confidence is visually obvious** and filterable, so review effort goes where it matters.
- **Edit** — correct any field inline, remap a column, fix a unit or VAT treatment, or resolve a
  duplicate against a chosen candidate. Every edit is attributed and audited, and the raw original
  is retained.
- **Approve** — all lines, or a subset. Partial approval is explicit about what was and was not
  approved, and unapproved lines stay in review rather than disappearing.
- **Reject** — the whole import or individual lines, with a reason. A rejected import leaves the
  active catalogue **completely unchanged**.
- **Nothing is approvable while blocking issues remain** — unresolved `needs review`, unknown VAT
  treatment, or unresolved possible duplicates.
- **Re-run extraction** with a corrected mapping without re-uploading the file.
- **Cancel and resume** — a large import can be left and returned to without losing work.

---

## Security

- RBAC enforced at the router gate **and** again in the service. Owner / Admin and
  procurement/inventory-permitted roles only; **Technician and Client denied**, decided by role, not
  by permission breadth.
- Reads require real procurement / inventory / supplier read permissions; writes, approvals and
  settings changes require the corresponding write or manage permission. Approval is a distinct,
  higher-privilege action than upload.
- `companyId` scoping on every query, job, line, catalogue row, mapping profile, file, log and audit
  row. Cross-tenant supplier, catalogue, file and email references are **refused, not merged**.
- Uploaded files are validated for type and size, scanned, and stored access-controlled the same way
  TITAN documents are. Supplier pricing is commercially sensitive and is not publicly readable.
- Extraction runs in a constrained context. A hostile or malformed file must fail safely without
  affecting other tenants or the API process, and spreadsheet formulas are read as values, never
  executed.
- Credentials, tokens and email contents are never logged, never returned to the client, and never
  included in error messages or extraction logs.
- Every upload, extraction, mapping change, edit, review decision, approval, rejection and settings
  change is audited via `security_audit_logs`.
- No production integration is written to by this phase. No deploy. Never touches Yoco `0123`.

---

## Honesty & failure handling

- **Confidence is always visible.** Extraction confidence is reported per field and per line, and a
  low-confidence value is presented as uncertain rather than as a fact.
- **Format support is claimed only when proven.** A channel is not described as supported until it has
  been demonstrated on a **real supplier file**. A passing unit test against a synthetic fixture is
  **never** evidence that a format works.
- **Failure is reported as failure.** A file that cannot be read, a page that cannot be parsed, or an
  extraction that produced nothing is reported as failed with the reason — never as a completed
  import with zero lines.
- **Partial extraction is labelled partial**, stating what was extracted and what was not. Presenting
  a partial import as complete is a defect.
- **Zero silent skips.** Every unimported row, page, sheet or attachment carries a stored reason, and
  the reconciliation between rows read and rows accounted for must balance.
- **No invented values.** No guessed price, code, unit, VAT rate, currency, date or pack size. Missing
  stays missing, and a missing price is **never** `R0`.
- **`available` / `partial` / `unavailable`** with a rationale on every count, figure and panel.
- **AURA refuses honestly** where the catalogue or history does not support an answer, and never
  fills a gap with an estimate presented as a fact.
- **No success claim without evidence** — real supplier files, real extracted counts, real
  reconciliation, real approval records.

---

## Acceptance criteria

Each item requires recorded evidence from **real supplier price lists**, not synthetic fixtures.

| # | Criterion |
|---|-----------|
| A1 | A real supplier XLSX imports end to end with **no manual retyping** of codes, descriptions or prices |
| A2 | XLS, CSV, PDF, DOCX, paste, email body, email attachment and image/scan each proven on a real file, or honestly reported as unsupported |
| A3 | Multi-sheet, multi-page and merged-cell sources handled, with repeated headers, subtotals and footers excluded and the exclusion reason recorded |
| A4 | Supplier quotations and invoices import with price basis (`list` / `quoted` / `invoiced`) correctly recorded |
| A5 | Every extracted line carries provenance — source file, hash, sheet/page/row — traceable back to the original |
| A6 | The original file remains stored immutably and viewable beside the extracted result |
| A7 | AURA suggests a column mapping on an unseen supplier layout, with per-column confidence |
| A8 | A confirmed mapping is remembered and applied automatically to that supplier's next list |
| A9 | A changed supplier layout is detected and raised for confirmation instead of mapping the wrong columns |
| A10 | Unmapped source columns are retained in the raw payload, not discarded |
| A11 | ZAR formats, decimal comma and point, spaces and thousands separators all parse correctly; genuinely ambiguous values are flagged, not guessed |
| A12 | VAT inclusive / exclusive determined where stated, and marked `unknown` with mandatory review where not — no assumed rate |
| A13 | Units and pack sizes normalised, with unrecognised values kept verbatim and flagged |
| A14 | Every cleaned value stores raw, cleaned, transformation and confidence; **no uncertain value silently changed** |
| A15 | Dates parse under the SA convention, ambiguous dates are flagged, and no effective date is invented |
| A16 | "POA" / "on request" resolves to `unavailable`, never to `R0` |
| A17 | All seven classifications produced correctly on a real list: new, unchanged, price changed, possible duplicate/replacement, discontinued, needs review, invalid |
| A18 | A possible duplicate is **never auto-merged** — it reaches the review queue with the candidate shown for a human decision |
| A19 | An item absent from a new list is **never** auto-deactivated without review |
| A20 | Re-running the same import is idempotent — same classifications, no duplicate catalogue rows |
| A21 | Line counts reconcile: rows extracted = classified + excluded-with-reason. **Zero silent skips** |
| A22 | Import preview shows source beside result, summary counts, per-line detail and filterable low-confidence lines |
| A23 | Edit, approve, partial-approve and reject all work, are attributed and audited, and preserve the raw original |
| A24 | Approval is blocked while unresolved review items, unknown VAT treatment or unresolved duplicates remain |
| A25 | A rejected import leaves the active catalogue completely unchanged |
| A26 | **No price becomes active without approval** — proven by attempting it and being refused, with the refusal audited |
| A27 | Approval creates a new immutable version with the previous version retained and the approver recorded |
| A28 | Quotes, Inventory, Purchasing, Job Costing and Finance each read the approved version; **existing quotes are not repriced** and job costs resolve against the version that applied at the time |
| A29 | Price history reports price movement, largest changes, supplier comparison and margin erosion from real versions, with `unavailable` where history is thin |
| A30 | **Customer selling prices are never auto-changed** by an import |
| A31 | Young Guns pricebook link shows the full calculation, blocks minimum-margin breaches, requires approval and never overwrites a locked price — or reports `unavailable` while YGP-001 does not exist |
| A32 | With Gmail connected, a supplier price-list email is detected, prepared and notified — and **not activated on arrival** |
| A33 | The same attachment cannot be imported twice (message ID + content hash), while a genuinely revised list is still accepted |
| A34 | Technician and Client are denied at the router gate and again in the service, before any database access |
| A35 | Every job, line, catalogue row, mapping profile and file is `companyId` scoped; cross-tenant references are refused |
| A36 | A malformed or hostile file fails safely, with the failure reported as a failure and never as an empty successful import |
| A37 | Every upload, extraction, mapping change, edit, review decision, approval and rejection appears in `security_audit_logs` |
| A38 | No fake suppliers, products or prices exist anywhere in the delivered feature |

---

## Report requirements

The implementation report for this phase must contain:

1. **Existing-surface audit** — confirmation or correction of the starting point above, with
   `file:line` evidence.
2. **What changed** — files, routes, schema, migration number, commit hashes.
3. **Real extraction evidence** — per channel, the real supplier files tested, lines extracted,
   classification counts and reconciliation. A format with no real-file evidence is reported as
   unproven.
4. **Acceptance results** — all 38 items, pass/fail, with evidence for each.
5. **Honest gaps** — what remains partial or unimplemented, and why. Understating a gap is a defect.
6. **Confirmation** of: no active price without approval, no auto-merge of uncertain lines, no
   auto-change of customer selling prices, immutable history preserved, RBAC / tenant isolation /
   audit intact, Xero and Finance untouched, Yoco `0123` untouched, no deploy.

---

## Status

**⬜ Planned / required for TITAN V1.0 — Inventory, Procurement, Supplier Intelligence, Email
Operations. NOT started.**

- Scope is recorded. **No code has been written for this phase.**
- **Do not begin while the Xero Complete Historical Sync phase is active.** That phase's
  in-progress files must not be touched by this work.
- Extends `supplier-price-intelligence` (`0110`), Supplier & Procurement Intelligence (`0143`),
  Inventory Intelligence (`0142`) and the existing Email Centre — it does not replace any of them.
- The Young Guns pricebook (YGP-001) is a **real, unbuilt dependency**; the pricebook connection is
  conditional on it and reports `unavailable` until it exists.
- When implemented, this phase is committed and reported separately from Xero and department work.
