# Smart Invoice & Receipt Capture

**Status: ⬜ Planned / required for TITAN V1.0 — Finance, Inventory, Procurement, Documents, Email
Operations, Mobile. NOT started. Do not begin while the Xero Complete Historical Sync phase is
active.**

This document records approved scope only. **No implementation exists for this capability and none
may be started yet.** It is written so the work can be picked up later without re-deciding the
requirements.

---

## Objective

Let the Owner and staff capture any supplier paperwork — by photographing it, scanning it, uploading
a file, forwarding an email, or sending it on WhatsApp — and have TITAN turn it into a **clean,
readable, searchable document** plus **structured extracted data presented for review**.

The capability covers supplier invoices, receipts, delivery notes and supplier statements.

**The original file is always preserved, unchanged, forever.** Enhancement and extraction produce
*additional* artefacts alongside the original; they never replace it, never overwrite it, and never
become the record of what was received.

**Extraction is a proposal, not a posting.** Nothing reaches Finance, Xero, inventory or job costing
until a human has reviewed and approved it.

**Explicitly out of scope:**

- **No new document store.** This extends the existing documents foundation, Document Intelligence
  typed profiles, Email Centre / Email Operations and the WhatsApp channel — it does not create a
  parallel document system.
- **No second ledger and no direct posting to Xero.** Approved bills follow the existing
  Draft → Approve → Execute write-approval gate.
- **No invented values.** A field that is not legible in the document stays empty. See *Honesty
  rules*.
- **No automatic price or cost changes.** Approved invoices may update cost records where scoped
  below, but **never selling prices**.

---

## Supported inputs

| Input | Notes |
|-------|-------|
| **Mobile camera photo** | Single page or multi-page capture in one session, on-device guidance during capture |
| **Mobile batch capture** | Several separate documents captured back-to-back in one sitting |
| **Desktop file upload** | Drag-and-drop or file picker |
| **Scanner output** | Flatbed or sheet-feed scans, including multi-page scans |
| **Email attachment** | Forwarded or received into the existing Email Operations inbox |
| **Email body / inline image** | Where the document is embedded rather than attached |
| **WhatsApp image** | Photo sent to the business WhatsApp number |
| **WhatsApp document** | PDF or image file sent as a document |
| **Existing TITAN document** | An already-stored document re-submitted for capture and extraction |

**Accepted file types:** JPEG, PNG, HEIC, WebP, PDF (single and multi-page), TIFF. Password-protected
and corrupt files are rejected with a readable reason, never silently dropped.

Every capture records **how it arrived** (channel), **who or what sent it** (user, email sender,
WhatsApp sender), and **when** — as provenance on the stored record.

---

## Document enhancement

Enhancement makes the document readable. It is applied to a **copy**; the original is untouched.

| Step | Requirement |
|------|-------------|
| **Edge detection** | Detect the page boundary against the background |
| **Auto-crop** | Crop to the detected page, removing desk, hands and surroundings |
| **Rotation** | Correct 90° / 180° / 270° orientation so text reads upright |
| **Perspective correction** | Flatten a photo taken at an angle into a square-on page |
| **Deskew** | Straighten small rotations so lines are level |
| **Contrast & brightness** | Normalise so faint thermal receipts and dark photos become legible |
| **Shadow removal** | Remove hand, phone and body shadows across the page |
| **Glare reduction** | Reduce flash hotspots and reflections on glossy paper |
| **Multipage ordering** | Keep pages in the order captured; allow manual reorder before saving |
| **Clean PDF output** | Produce a single tidy PDF for the whole document |
| **Thumbnails** | Generate previews for list views and search results |

**Every enhancement step is reversible in the sense that the original remains available.** The user
can always view the original next to the enhanced version, and can re-run or discard enhancement
without losing anything.

**Stored per capture:**

1. **The original file**, byte-for-byte, with its file hash.
2. **The enhanced version(s)**, including the generated clean PDF and thumbnails.
3. **The extracted structured data**, with per-field confidence.
4. **The audit trail** — who captured it, from which channel, when, what enhancement ran, what was
   extracted, what a reviewer changed, who approved it, and what it was matched to.

---

## Data extraction

Extraction reads the enhanced document and proposes structured values. **A value that cannot be read
from the document is left empty and reported as missing — it is never guessed, inferred from
history, or defaulted.**

### Document-level fields

| Field | Notes |
|-------|-------|
| Document type | Invoice / receipt / delivery note / statement / credit note / unknown |
| Supplier name | As printed on the document |
| Supplier trading name | Where different from the registered name |
| Supplier VAT number | |
| Supplier company registration number | |
| Supplier address | |
| Supplier contact details | Phone, email, website as printed |
| Supplier account number | The buyer's account number with that supplier |
| Invoice / receipt number | |
| Document date | |
| Due date | |
| Purchase order number | As referenced on the document |
| Delivery note number | |
| Delivery date | |
| Delivery address | |
| Order reference | Any other reference printed by the supplier |
| Payment terms | e.g. 30 days from statement |
| Payment method | Where stated (cash, card, EFT, account) |
| Payment status | Paid / unpaid / part-paid, where stated on the document |
| Bank details | Where printed, for supplier verification only |
| Currency | |
| Subtotal (excl. VAT) | |
| VAT rate(s) | |
| VAT amount | |
| Discount | |
| Rounding | |
| Delivery / freight charge | |
| Other charges | |
| **Total (incl. VAT)** | |
| Amount paid | Where stated |
| Balance due | Where stated |
| Notes / terms text | Free text printed on the document |

### Line-item fields

Extracted per line, for every line on the document:

| Field | Notes |
|-------|-------|
| Line number | Position on the document |
| Supplier item / stock code | |
| Description | |
| Barcode | Where printed |
| Quantity | |
| Unit of measure | Each, metre, box, kg, litre, etc. |
| Pack size / quantity per pack | Where stated |
| Unit price (excl. VAT) | |
| Unit price (incl. VAT) | Where the document prices inclusive |
| Discount (line) | Amount or percentage as printed |
| VAT rate (line) | |
| VAT amount (line) | |
| Line total | |
| Backorder / short-supplied quantity | Relevant on delivery notes |

### Statement-specific fields

| Field | Notes |
|-------|-------|
| Statement period | From / to |
| Opening balance | |
| Closing balance | |
| Ageing buckets | Current, 30, 60, 90, 120+ as printed |
| Listed transactions | Date, reference, description, debit, credit, running balance |

### Arithmetic checks

Where enough values are legible, TITAN checks that lines sum to the subtotal, that VAT is consistent
with the stated rate, and that subtotal + VAT + charges equals the stated total. **A failed check is
surfaced as a discrepancy for the reviewer — it is never "fixed" by adjusting an extracted number.**

---

## Confidence and review

Every extracted field carries a **confidence** value and is presented for human review before it can
be used for anything.

- **Field-level confidence** on every extracted value, plus an overall document confidence.
- **Highlight-on-hover** — selecting a field highlights the exact region of the document image it was
  read from, so a reviewer can verify it at a glance.
- **Low-confidence fields are visually flagged** and, where the Owner requires it, must be explicitly
  confirmed before approval.
- **Missing fields are shown as missing**, with the reason (not present on document / not legible /
  extraction failed) — never as a blank that looks like a zero.
- **Discrepancies are shown**, including failed arithmetic checks, totals that disagree with line
  sums, and values that conflict with the matched PO or GRN.
- **Every reviewer correction is recorded** — original extracted value, corrected value, who changed
  it and when.
- **Side-by-side review** — the document image and the extracted fields on one screen, with page
  navigation for multi-page documents.
- The review screen states plainly when a document is **unreadable** and offers re-capture rather
  than presenting a half-extracted result as usable.

---

## Matching

TITAN proposes links between the captured document and existing records. **Matching is a proposal.
An uncertain match is never auto-merged, never auto-applied, and never silently chosen.**

| Match target | Basis |
|--------------|-------|
| **Supplier** | Existing supplier record, by VAT number, registration number, account number, name and stored contact details |
| **Purchase order** | PO number printed on the document, plus supplier + amount corroboration |
| **Goods received note** | GRN for the matched PO, including partial and over-delivery cases |
| **Job** | Job number or reference printed on the document, or the job the PO was raised against |
| **Customer** | Via the matched job or property, where the cost is customer-attributable |
| **Vehicle** | Fleet vehicle, for fuel, parts and servicing documents |
| **Stock item** | Line-by-line to inventory items, by supplier item code, barcode, then description |
| **Xero bill** | Existing imported Xero bill (ACCPAY), by Xero ID where already linked, then supplier + invoice number + date + total |
| **Bank transaction** | Imported Xero bank transaction, by amount, date proximity and supplier |

**Matching rules:**

1. Every proposed match shows **what it matched on** and **how confident it is**.
2. A confident, unambiguous match may be pre-selected — but it is still visible and still
   overridable by the reviewer.
3. **Ambiguous matches are presented as a list of candidates for the reviewer to choose from.** They
   are never resolved automatically by picking the top score.
4. **No match is ever forced.** "No match found" is a valid, honest outcome, and the document can be
   approved without one where the Owner allows it.
5. A three-way discrepancy between invoice, PO and GRN (price, quantity or item) is surfaced
   explicitly and blocks approval until a human resolves it.
6. Matches are recorded as real foreign-key links only — never as inferred or invented associations.

---

## Duplicate prevention

The same document must not enter TITAN twice, whichever way it arrives. Duplicate detection runs on
capture, **before** review, and again before approval.

**Detection signals:**

| Signal | Purpose |
|--------|---------|
| Supplier + invoice number | The primary business key |
| Supplier + invoice number + date + total | Stronger confirmation for the same key |
| File hash | Exact same file re-submitted through any channel |
| Email message ID + attachment ID | Same email attachment processed twice |
| WhatsApp media ID | Same WhatsApp media re-delivered or re-forwarded |
| Xero bill ID | Document already represented by an imported Xero bill |

**Rules:**

1. A suspected duplicate is **flagged for review with the existing record shown side by side** — it
   is not silently discarded and not silently accepted.
2. The reviewer decides: mark as duplicate, or confirm it is genuinely a separate document (for
   example a re-issued invoice or a legitimately identical receipt).
3. A confirmed duplicate is **retained and linked** to the original, not deleted — the audit trail
   must show what arrived.
4. Duplicate checks are scoped by `companyId`; a matching invoice number in another tenant is not a
   duplicate and must never be visible.

---

## Finance and Xero

**Nothing reaches Xero automatically.** This capability prepares work; the existing Xero write-back
gate executes it.

- After a captured supplier invoice is **approved in TITAN**, a **bill is prepared** from the
  reviewed data — supplier, date, due date, reference, line items, account codes, tax and totals.
- The prepared bill enters the existing **Draft → Approve → Execute** write-approval workflow.
  Auto-execute remains invariant false, exactly as recorded in
  [`XERO_COMPLETE_HISTORICAL_SYNC_AND_FINANCIAL_MEMORY.md`](./XERO_COMPLETE_HISTORICAL_SYNC_AND_FINANCIAL_MEMORY.md).
- The approver sees **exactly what will be created in Xero** before approving.
- Where a matching Xero bill already exists (imported by the historical sync), the capture is
  **linked to it** rather than creating a second bill.
- The captured document is **attached** to the bill where the integration supports it.
- **Sync status is shown honestly** on the captured document: not sent / draft / awaiting approval /
  approved / executing / synced / failed, with the Xero ID once it exists and the failure reason
  when it fails. A failed write-back is reported as failed — never as done.
- Account code and tax treatment are **proposed** from the supplier's history and the line content,
  and are always reviewable. They are never chosen silently.
- TITAN does not become the ledger. Xero remains the accounting source of truth.

---

## Inventory, job costing and procurement

These consume the captured data **only after approval**.

- **Stock receipting** — approved delivery notes and invoices may update stock on hand for matched
  items, through the existing inventory movement path, with the capture as the source reference.
- **Cost records** — approved line prices update **supplier cost / last-paid price** records so
  purchasing decisions use real recent costs.
- **No automatic selling-price changes.** Approved invoices **never** alter customer-facing pricing,
  quote pricing, rate cards or markup. A cost change may *raise a recommendation* for the Owner to
  review; it may never apply one.
- **Job costing** — approved costs attach to the matched job as real material cost, visible in job
  profitability.
- **PO / GRN reconciliation** — approved documents close or partially fulfil the matched PO and
  reconcile against the GRN, with variances recorded rather than absorbed.
- Every downstream effect is traceable back to the captured document and the approval that released
  it.

---

## Search and reopen

Captured documents are first-class searchable records inside the existing documents surface.

- **Full-text search** over the extracted text and the extracted fields.
- **Filter** by supplier, document type, date range, amount range, VAT amount, status (pending
  review / approved / rejected / duplicate / failed), capture channel, capturing user, matched job,
  matched customer, matched vehicle, matched PO and Xero sync status.
- **Search by line item** — find every document containing a given stock item, supplier code or
  barcode, so "what did we last pay for this" is answerable from real documents.
- **Open any captured document** and see the original, the enhanced version, the extracted data, the
  matches, the review history and the full audit trail together.
- **Reopen and re-review** — a previously reviewed document can be reopened, corrected and
  re-approved, with the change recorded. Corrections after a Xero write-back require a new approved
  write-back; they never mutate Xero silently.
- **Re-run extraction** on the stored original (for example after an extraction improvement) without
  re-capturing, preserving prior review history.
- **Drill-through** from a job cost, a stock movement, a supplier record or a Xero bill **back to the
  captured document image** that supports it.

---

## Mobile capture flow

The mobile flow must be usable one-handed, in a van, in a supplier yard, in poor light.

| Step | Behaviour |
|------|-----------|
| 1 | Open capture from a single obvious action (Documents, or a job, or the home screen) |
| 2 | Camera opens with a live page-edge overlay showing what will be captured |
| 3 | On-screen guidance while framing — move closer, flatten the page, hold steady |
| 4 | Capture, automatically or on tap when the frame is stable |
| 5 | Immediate preview with the detected crop, and the option to adjust the corners by hand |
| 6 | Add another page, retake the current page, or finish — page count always visible |
| 7 | Reorder or delete pages before saving |
| 8 | Choose the document type and, optionally, the job / supplier / vehicle it belongs to |
| 9 | Save — upload continues in the background and survives a poor or dropped connection |
| 10 | Review the extracted data on the phone, or defer it to a desktop review queue |

**Capture guidance:**

- **Blur detection** — a blurred frame is flagged before saving, with a prompt to retake. A blurred
  page is never quietly accepted as if it extracted cleanly.
- **Flash guidance** — automatic low-light detection with a flash suggestion, plus a warning when
  flash is causing glare on glossy paper.
- **Framing warnings** — page edge outside the frame, page too small in frame, extreme angle.
- **Offline capture** — pages captured without signal are queued locally and upload when connectivity
  returns; the queue state is visible and honest, never a false "sent".

---

## Security, privacy and RBAC

- **Tenant isolation** — every capture, file, extraction, match, review and audit row is scoped by
  `companyId`. Cross-tenant documents, suppliers, POs, jobs and Xero IDs are refused, not merged.
- **RBAC** — capture, review/edit, approve, and Xero write-back are **separate permissions**.
  Approval of financial effect is Owner / Admin / Accountant territory. Technicians may capture
  documents for their own jobs where the Owner enables it; Clients have no access to supplier
  documents at all.
- **Access-controlled storage** — original and enhanced files are stored under the same
  access-controlled path as TITAN documents. No world-readable URLs, no unguessable-link-as-security.
- **Supplier bank details** are treated as sensitive: masked by default, revealed only to permitted
  roles, and every reveal audited — they are a fraud target.
- **Audit** — capture, enhancement, extraction, every field correction, match selection, duplicate
  decision, approval, rejection, Xero write-back and file access are recorded via
  `security_audit_logs` with the acting user, company, action and result.
- **Retention** — configurable retention for originals in line with statutory record-keeping;
  deletion is Owner-gated, audited, and never silently cascades away an approved financial record.
- **Third-party processing** — if any OCR or extraction provider is external, that is stated to the
  Owner, configurable, and covered by the same encryption, access control and audit rules. Documents
  are never sent to a third party without the Owner knowing.
- **Inbound channels are not trusted** — an email or WhatsApp message is a trigger to fetch and
  process, never trusted payload data. Sender verification, file-type validation and malware
  scanning apply before any file is stored or opened.

---

## Honesty rules

1. **Never invent a value.** If a field is not on the document or not legible, it stays empty with a
   stated reason. No inference from supplier history, no "usual" VAT rate, no assumed date.
2. **Never coerce a missing amount to `R0`.** Missing is `unavailable`, not zero.
3. **Never present an unreviewed extraction as fact.** Extracted data is proposed until a human
   approves it.
4. **Never auto-match on uncertainty.** Ambiguity is shown to a human, not resolved by a threshold.
5. **Never claim a sync that did not happen.** Xero status reflects what Xero actually confirmed.
6. **Never hide a failure.** Failed capture, failed enhancement, failed extraction and failed
   matching each produce a visible state with the reason — no silent drops, no empty success.
7. **Never modify the original.** Enhancement writes new artefacts; the original is immutable.
8. **Never let confidence be cosmetic.** A displayed confidence must reflect real extraction
   confidence, not a fixed or decorative number.
9. **A page, a nav label or a passing mock-based test is not evidence** that capture works. Evidence
   is real documents captured, extracted, reviewed and traced end to end.
10. **No fake documents.** No seeded, sampled or demo invoices, receipts or suppliers — ever.

---

## Acceptance criteria

Each item requires recorded evidence against **real documents**. A mock-based unit test satisfies
nothing on this list.

| # | Criterion |
|---|-----------|
| ☐ 1 | A photographed supplier invoice is captured, enhanced and extracted end to end |
| ☐ 2 | A multi-page scan produces one clean PDF with pages in the captured order |
| ☐ 3 | A faded thermal receipt becomes legible after enhancement |
| ☐ 4 | A photo taken at an angle is perspective-corrected, deskewed and cropped correctly |
| ☐ 5 | Shadow and flash glare are reduced without destroying text |
| ☐ 6 | The original file is retrievable byte-for-byte after enhancement, with its hash intact |
| ☐ 7 | Original, enhanced version, extracted data and audit trail are all stored and linked |
| ☐ 8 | An emailed attachment is captured with sender, message ID and timestamp provenance |
| ☐ 9 | A WhatsApp image and a WhatsApp PDF are both captured with media ID provenance |
| ☐ 10 | Every document-level field on the list is extracted where present on the document |
| ☐ 11 | Line items are extracted with quantity, unit, unit price, discount, VAT and line total |
| ☐ 12 | A supplier statement is extracted with period, balances, ageing and transaction lines |
| ☐ 13 | A missing field is reported as missing with a reason, never as `0` and never invented |
| ☐ 14 | Arithmetic checks flag a document whose lines do not sum to its stated total |
| ☐ 15 | Every field shows a real confidence value; low confidence is visibly flagged |
| ☐ 16 | Selecting a field highlights the region of the image it was read from |
| ☐ 17 | Every reviewer correction is recorded with before, after, user and timestamp |
| ☐ 18 | Supplier, PO, GRN, job, customer, vehicle and stock-item matching each work on real records |
| ☐ 19 | An ambiguous match presents candidates and is not auto-selected |
| ☐ 20 | An invoice/PO/GRN price or quantity discrepancy blocks approval until resolved |
| ☐ 21 | A captured invoice matching an imported Xero bill links to it instead of duplicating it |
| ☐ 22 | Duplicate detection catches the same document via file hash, email attachment ID, WhatsApp media ID, and supplier + invoice number + date + total |
| ☐ 23 | A suspected duplicate is shown against the existing record and resolved by a human |
| ☐ 24 | An approved invoice prepares a Xero bill that requires Draft → Approve → Execute |
| ☐ 25 | Auto-execute is proven false in the service, the route envelopes and the CHECK constraints |
| ☐ 26 | Xero sync status is shown honestly, including a failed write-back reported as failed |
| ☐ 27 | Approved stock receipting updates inventory only after approval, with the capture as source |
| ☐ 28 | Approved costs appear in job costing against the matched job |
| ☐ 29 | No selling price, quote price or rate card changes as a result of any capture |
| ☐ 30 | Search finds a document by supplier, amount, date range, status and line-item code |
| ☐ 31 | A document can be reopened, corrected and re-approved, with the change audited |
| ☐ 32 | Extraction can be re-run on the stored original without re-capture and without data loss |
| ☐ 33 | A job cost, stock movement and Xero bill each drill back to the captured document image |
| ☐ 34 | The 10-step mobile flow completes one-handed on a real phone |
| ☐ 35 | Blur is detected and prompts a retake; flash guidance appears in low light and warns on glare |
| ☐ 36 | Offline capture queues locally, uploads on reconnect, and never shows a false "sent" |
| ☐ 37 | RBAC denies Client entirely and separates capture, review, approve and write-back |
| ☐ 38 | Cross-tenant access to a captured document, supplier, PO or Xero ID is refused |
| ☐ 39 | Supplier bank details are masked by default and every reveal is audited |
| ☐ 40 | Capture, extraction, correction, match, approval, write-back and file access are all audited |
| ☐ 41 | An unreadable document is honestly reported as unreadable and offers re-capture |
| ☐ 42 | No fake, seeded or demo documents, suppliers or amounts exist anywhere in the feature |

---

## Related scope

- [`UNIVERSAL_SUPPLIER_PRICE_LIST_IMPORT.md`](./UNIVERSAL_SUPPLIER_PRICE_LIST_IMPORT.md) — supplier
  price list ingestion. Shares supplier matching, stock-item matching, extraction review and the
  "never auto-update selling prices" rule. Price lists set catalogue cost; captured invoices record
  what was actually paid.
- [`XERO_COMPLETE_HISTORICAL_SYNC_AND_FINANCIAL_MEMORY.md`](./XERO_COMPLETE_HISTORICAL_SYNC_AND_FINANCIAL_MEMORY.md)
  — supplies the imported bills, bank transactions, chart of accounts and the Draft → Approve →
  Execute write-back gate this capability depends on. **That phase must be complete before this one
  begins.**

---

## Status

**⬜ Planned / required for TITAN V1.0 — Finance, Inventory, Procurement, Documents, Email
Operations, Mobile. NOT started.**

- Scope is recorded and approved. **No code has been written for this capability.**
- **Do not begin while the Xero Complete Historical Sync & Financial Memory phase is active.** This
  capability depends on that phase's imported bills, chart of accounts and write-approval gate.
- Extends the existing documents foundation, Document Intelligence, Email Operations, the WhatsApp
  channel, Inventory Intelligence, Supplier & Procurement Intelligence and the Xero integration —
  it does not rebuild or replace any of them.
- When implemented, it is committed and reported separately from department work.
