# Xero Complete Historical Sync & Financial Memory

**Status: ⬜ Approved — queued after Department 20 (UX Final Pass); NOT started.**

This document records approved scope only. **No implementation exists for this phase and none may be
started yet.** It is written so the work can be picked up later without re-deciding the requirements.

Implementation begins **only after Department 20 (UX Final Pass) completes**. Do not begin this work
alongside Department 21, hardening, or any other department. When it is implemented, it is committed
and reported **separately** from department work.

---

## Purpose

Repair and complete the existing Xero integration so that TITAN holds the **full historical
financial record** of the business — not a partial, recent, or sampled slice of it.

The business already has years of real accounting history in Xero. TITAN is currently unable to
answer ordinary questions about that history with evidence. This phase closes that gap.

**Division of responsibility (not negotiable):**

| System | Role |
|--------|------|
| **Xero** | The accounting **source of truth**. Ledger, tax position, reconciliation, statutory accounting. |
| **TITAN** | The **operations, search and intelligence layer** over that truth. Fast retrieval, cross-linking to jobs/customers/properties, insight, recommendation. |

**Explicitly out of scope:**

- **No rebuild of Finance.** The existing Finance module, Finance AURA Agent (`0139`), Cashflow &
  Profit Intelligence (`0140`), Financial Reporting & Forecasting (`0141`) and Xero Finance
  Foundation Repair (`0145`) are **extended**, not replaced.
- **No second ledger.** TITAN does not become an accounting system, does not recompute the ledger,
  and does not hold an authoritative balance that could drift from Xero.
- **No fake data.** No seeded, sampled, estimated, placeholder or demo financial records — ever.
- **No success without real sync evidence.** "Working" means real records imported from a real Xero
  organisation with counts, IDs and logs to prove it. A page, a nav label, a passing unit test
  against a mock, or a green status badge is **never** evidence of a working sync.

---

## Global rules

These apply to every task in every phase below.

1. **Architecture** — Extend the existing Xero foundation (OAuth, sync service, mapping tables,
   sync runs, write-approval gate). Do not create a parallel Xero stack, a duplicate sync service,
   or a second set of mapping tables that competes with the existing ones.
2. **RBAC** — Financial history is Owner/Admin/Accountant territory. Technician and Client are
   **denied**. Reads and writes require real finance/integration permissions; a wildcard permission
   does not grant entry where the rule is role-based.
3. **Tenant isolation** — Every read, write, query, job, checkpoint and log row is scoped by
   `companyId`. Cross-tenant Xero IDs, mappings and attachments are refused, not merged.
4. **Audit** — Every sync run, every write-back, every approval decision and every settings change
   is recorded via `security_audit_logs` with the acting user, company, action and result.
5. **Approvals** — Anything that changes data **in Xero** is approval-gated (see *Write-back
   safety*). Import is read-only and needs no approval; write-back always does.
6. **Staging only** — All development, testing and verification runs against a **staging Xero
   organisation**. No production Xero tenant is connected, synced against, or written to during
   this phase. No deploy.
7. **Separate commit** — This phase lands as its own commit (or its own series), separate from
   Department 20 UX work and separate from any other department. Do not mix UX WIP into it.
8. **Honest state everywhere** — Where a figure or entity is not available, report `unavailable` /
   `partial` with a rationale. Never coerce a missing amount to `R0`, never invent a date, and never
   present an incomplete import as complete.

---

## Existing surface (starting point for the audit)

Recorded so the audit begins from fact, not from a blank page. The audit must confirm or correct
this list with file:line evidence.

**API services** — `apps/api/src/services/`: `xero-oauth.service.ts`, `xero-sync.service.ts`,
`xero-import-job.processor.ts`, `xero-import-job.shared.ts`, `xero-mapping-conflict.service.ts`,
`xero-write-approval-gate.service.ts`, `xero-write-approval-workflow.service.ts`,
`xero-two-way-verify.service.ts`.

**Shared** — `packages/shared/src/`: `xero-sync.ts`, `xero-finance-pipeline.ts`,
`xero-two-way-sync.ts`.

**Database schema** — `packages/db/src/schema/`: `xero-customer-mappings.ts`,
`xero-quote-mappings.ts`, `xero-invoice-mappings.ts`, `xero-payment-mappings.ts`,
`xero-bank-transactions.ts`, `xero-sync-logs.ts`, `xero-sync-entity-status.ts`,
`xero-finance-sync-runs.ts`, `xero-write-approvals.ts`, plus `integration-connections.ts`,
`integration-oauth-states.ts`, `integration-sync-jobs.ts`.

**Migrations** — `0018_xero_sync.sql`, `0093_xero_bank_transaction_entity_type.sql`,
`0109_xero_two_way_sync_scaffolding.sql`, `0145_xero_finance_foundation_repair.sql`.
New migration number is allocated at implementation time (latest in tree is `0170`).

**Wiring** — Xero services are constructed and registered in `apps/api/src/index.ts`.

---

## Phase A — Read-only audit

**Read-only. No code changes in Phase A.** Classify each of the 36 items as **WORKING** /
**PARTIAL** / **BROKEN** / **NOT FOUND**, each with `file:line` evidence. A classification without
file:line evidence is not accepted. "Looks implemented" is not a classification.

### Connection & authentication

| # | Item |
|---|------|
| A1 | Xero OAuth 2.0 connect flow — authorise URL, redirect, callback, error paths |
| A2 | Token exchange and encrypted storage of access/refresh tokens |
| A3 | Refresh-token rotation and expiry handling (Xero rotates on every refresh) |
| A4 | Tenant/organisation selection and storage of the Xero `tenantId` |
| A5 | Disconnect / reconnect flow, and what happens to existing mappings on reconnect |
| A6 | Connection health/status reporting — is it real, or a hardcoded/optimistic badge? |

### Sync engine

| # | Item |
|---|------|
| A7 | Sync trigger paths — manual "Sync now", scheduled job, webhook (which exist and which run?) |
| A8 | Pagination handling across Xero list endpoints (page size, page loop, termination) |
| A9 | Rate-limit handling — Xero minute/daily limits, `429` handling, backoff, retry |
| A10 | Date-range/`If-Modified-Since` filtering — is any arbitrary date floor applied? |
| A11 | Resumability — can an interrupted sync resume, or does it restart from zero? |
| A12 | Checkpoint persistence — what is stored, per entity, to allow resume |
| A13 | Idempotency — does re-running a sync duplicate records or update in place? |
| A14 | Error handling per record vs per batch — does one bad record kill the whole run? |
| A15 | Silent skips — are records ever dropped without a log row? |
| A16 | Sync run lifecycle — start/finish/fail states, counts, duration, failure reasons |

### Entity coverage

| # | Item |
|---|------|
| A17 | Contacts — import, matching, duplicate prevention |
| A18 | Quotes |
| A19 | Invoices (ACCREC) — header and **line items** |
| A20 | Bills / supplier invoices (ACCPAY) |
| A21 | Payments — including allocation to invoices |
| A22 | Credit notes |
| A23 | Bank transactions |
| A24 | Chart of accounts / account codes |
| A25 | Tracking categories |
| A26 | Attachments (invoice/bill PDFs and supporting files) |

### Data model & storage

| # | Item |
|---|------|
| A27 | Xero ID storage on every mapped entity (is the Xero GUID always retained?) |
| A28 | Provenance fields — source, imported-at, last-synced-at, sync-run reference |
| A29 | Amount/currency/tax field fidelity — precision, currency code, tax handling |
| A30 | Sync log table content and retention — is it queryable evidence? |

### Surfaces

| # | Item |
|---|------|
| A31 | Owner-facing sync status UI — last sync, counts, failures, progress |
| A32 | Finance module reads over Xero-imported data |
| A33 | Customer 360 financial history section |
| A34 | Finance AURA / AURA financial answers over Xero data, and their attribution |
| A35 | Write-back paths that exist today, and their approval gating |
| A36 | Test coverage — which tests hit real sync behaviour vs mocks only |

---

## Phase B — Root cause investigation

For every Phase A item classified **PARTIAL**, **BROKEN** or **NOT FOUND**, establish the root cause
before any fix is designed. No fix is written against a guess.

| # | Question |
|---|----------|
| B1 | Is the code absent, present-but-unwired, or wired-but-failing? |
| B2 | If unwired — where does the call chain stop, and why (`file:line`)? |
| B3 | Is an arbitrary date limit, page cap, record cap or `LIMIT` truncating history? |
| B4 | Is pagination terminating early (off-by-one, missing next-page check, fixed single page)? |
| B5 | Is a rate limit or `429` aborting runs silently? |
| B6 | Are tokens expiring mid-run and failing the remainder of the run? |
| B7 | Is a schema/type mismatch rejecting valid Xero payloads (nullable, precision, enum)? |
| B8 | Are records being skipped by a filter, a `try/catch` that swallows, or a `continue`? |
| B9 | Is a unique constraint or mapping conflict causing silent upsert failure? |
| B10 | Is the failure environmental (missing credentials/config in staging) rather than code? |
| B11 | Does an existing test pass **only** because it mocks the Xero client? |
| B12 | Which of the 36 items are genuinely fine and must **not** be touched? |

Output of Phase B is a written root-cause statement per broken item, with evidence, and a proposed
minimal fix that extends the existing foundation.

---

## Phase C — Complete historical import

Import the **complete history**, per entity, from the business's real Xero organisation (staging
first). Each entity below must import fully, retain its Xero ID, carry provenance, and be provable
by count.

| Entity | Requirements |
|--------|--------------|
| **Contacts** | All customers and suppliers. Matched to existing TITAN customers by Xero ID first, then email, then phone. Duplicate prevention required; ambiguous matches recorded as conflicts for review, never auto-merged. |
| **Quotes** | All quotes, all statuses (draft, sent, accepted, declined, invoiced, deleted/voided), with line items, dates and totals. |
| **Invoices (ACCREC)** | All sales invoices, all statuses including voided and deleted, with **line items**, account codes, tax lines, due dates, amounts due/paid, and invoice numbers. |
| **Bills (ACCPAY)** | All supplier invoices with line items and account codes — this is what makes real expense intelligence possible. |
| **Payments** | All payments with **allocation to the invoices/bills they settle**, including part-payments, overpayments and prepayments. |
| **Credit notes** | All credit notes with allocations and line items. |
| **Bank transactions** | All bank transactions, **read-only** — imported as financial record, never used to perform automatic accounting or reconciliation. |
| **Chart of accounts** | All accounts with codes, names, types and status, so line items resolve to real account meaning. |
| **Tracking categories** | Categories and options, and their use on line items. |
| **Attachments** | Invoice/bill/quote attachments and supporting documents, linked to the parent record and to TITAN documents where a real link exists. |

---

## Historical sync rules

1. **No arbitrary date limit.** No "last 12 months", no "since 2024", no hardcoded floor. History
   goes back as far as the Xero organisation holds records. Any date filter must be an explicit
   Owner choice, defaulting to *everything*.
2. **No record cap.** No page cap, no `LIMIT`, no "first N" sampling.
3. **Full pagination.** Every list endpoint is paged to exhaustion, with the terminating condition
   proven by test, not assumed.
4. **Rate-limit compliance.** Respect Xero's minute and daily limits. Handle `429` with the
   retry-after signal and exponential backoff. Throttling slows a sync; it must never truncate one.
5. **Resumable checkpoints.** Per-entity checkpoints are persisted so an interrupted, throttled,
   timed-out or redeployed sync **resumes** where it stopped instead of restarting or losing ground.
6. **Idempotent upserts.** Re-running a sync updates in place by Xero ID. It never duplicates and
   never resurrects deleted records as new ones.
7. **Sync logs are mandatory.** Every run records start, finish, per-entity counts (fetched,
   created, updated, skipped, failed), duration and failure reasons — queryable as evidence.
8. **No silent skips.** A skipped or failed record produces a log row with the Xero ID and the
   reason. A record may never disappear without a trace.
9. **Xero IDs always retained.** Every imported record stores its Xero GUID, so re-sync,
   deduplication, drill-back and write-back can all be anchored to the source.
10. **Provenance on every row.** Source system, sync run reference, imported-at and last-synced-at.
11. **Per-record error isolation.** One malformed record fails that record only; the run continues
    and reports it.
12. **Token refresh mid-run.** Long historical runs refresh tokens as needed and continue.
13. **Progress is observable.** A long-running historical import reports real progress, not a
    spinner and not an optimistic "complete".
14. **Deleted/voided states preserved.** Voided and deleted Xero records are recorded as such, not
    dropped — the history must explain what happened, not hide it.
15. **Currency and precision fidelity.** Amounts, currency codes and tax values are stored as Xero
    holds them, without rounding drift and without cross-currency conversion.

---

## Ongoing sync rules

Once history is complete, it must stay complete.

1. **Incremental sync** on a schedule, using modified-since semantics, without re-importing
   everything each time.
2. **Manual "Sync now"** available to the Owner, with real progress and a real result.
3. **Webhook support** where Xero provides it, treated as a trigger for verified fetch — never as
   trusted payload data on its own.
4. **Gap detection.** If an incremental run fails or is skipped, the next run must close the gap
   rather than leaving a hole in history.
5. **Conflict handling.** Where TITAN and Xero disagree, **Xero wins** for accounting fields.
   Conflicts are recorded for review; they are never silently overwritten in Xero's direction
   without a log, and never resolved in TITAN's favour.
6. **Health and staleness reporting.** Last successful sync per entity, current failures, and an
   honest "stale" state when sync has not run.
7. **No silent degradation.** A repeatedly failing sync raises an Owner-visible alert; it does not
   quietly keep showing old totals as if current.

---

## Customer 360 financial history

Customer 360 gains the complete financial relationship for each customer, composed from imported
Xero records — read from source, not recalculated into a stored balance.

- Full invoice history with status, dates, amounts and amounts outstanding.
- Full quote history and what became of each quote.
- Full payment history, including how payments were allocated and how promptly they arrived.
- Credit notes and adjustments.
- Lifetime revenue, outstanding balance and overdue exposure — each reporting `available` /
  `partial` / `unavailable` with a rationale, never coerced to `R0`.
- Payment behaviour signals (average days to pay, late-payment pattern) only where there is enough
  real history; otherwise `unavailable` with the reason.
- Links from a financial record to the real job, property and document it relates to, where a real
  link exists — never an inferred or invented link.
- Attribution on every figure: this came from Xero, as at this sync time.

---

## Finance experience

The Finance module becomes usable over the full history without becoming an accounting system.

- Search and filter across the complete history — by customer, date range, status, amount, account
  code, tracking category and invoice number.
- Drill from a summary figure to the underlying records, and from a record back to Xero.
- Real receivables and payables ageing built from real invoices and bills.
- Revenue and expense views by period, account and tracking category, over full history.
- Honest sync state visible in-module: last sync, coverage, failures, staleness.
- Every figure carries attribution and an "as at" sync timestamp.
- No figure is stored as an authoritative balance that could drift from Xero.
- Existing Finance, Cashflow & Profit, and Reporting & Forecasting surfaces are extended to read
  the deeper history — they are not rebuilt or replaced.

---

## Xero AI / AURA financial intelligence

AURA must be able to answer real financial questions about the business's actual history, with
evidence — and must be unambiguous about where every part of an answer came from.

**Evidence-backed answers.** Every answer cites the real records behind it (record type, Xero ID,
date, amount). An answer that cannot cite evidence must say it cannot answer, and why. AURA never
estimates a financial figure and presents it as fact.

**Required attribution fields on every financial answer:**

| Field | Meaning |
|-------|---------|
| `source` | Which system the value came from |
| `sourceRecordIds` | The real Xero / TITAN record IDs supporting it |
| `asAt` | The sync timestamp the answer reflects |
| `coverage` | `complete` / `partial` / `unavailable`, with a rationale |
| `classification` | One of the four categories below |

**The four categories must be visibly distinguished — never blended into one confident sentence:**

1. **Xero fact** — read directly from imported Xero records. Authoritative.
2. **TITAN operational fact** — from TITAN's own jobs, customers, timesheets, properties.
3. **Calculated** — derived by TITAN from the above, with the calculation and its inputs stated.
4. **Recommendation / opinion** — AURA's suggestion. Never presented as a fact and never
   auto-executed.

**Non-negotiable:** if history is incomplete for the question asked, AURA says so and scopes the
answer to what is actually covered. A confident answer over a partial import is a false claim and
is treated as a defect.

---

## Write-back safety

Writing to Xero is the highest-risk capability in this phase. It stays behind the existing
write-approval gate and workflow.

- **Draft → Approve → Execute.** Every write-back is created as a draft, requires explicit Owner
  approval, and only then executes against Xero.
- **No uncontrolled writes.** No automatic, inferred, bulk, background or AI-initiated write to
  Xero. AURA may **propose** a write; it may never perform one.
- **No auto-execute flags.** Auto-execute remains invariant false in the service, the route
  envelopes and the database CHECK constraints — enforced in all three places, not just in code.
- **Explicit preview.** The approver sees exactly what will change in Xero before approving.
- **No deletes or voids** of Xero records from TITAN in this phase.
- **Idempotent execution** with a recorded external reference, so an approved write cannot be
  applied twice.
- **Full audit** of draft, approver, payload, execution result and Xero response.
- **Honest failure.** A failed write-back is reported as failed. Success is only reported when Xero
  confirms it.

---

## Security

- Tokens and credentials encrypted at rest; never logged, never returned to the client, never
  included in error messages or sync logs.
- OAuth state validated on callback; redirect URIs strictly matched.
- `companyId` scoping enforced on every query, job, checkpoint, log row and attachment.
- Cross-tenant Xero `tenantId` / record IDs refused, not merged.
- RBAC enforced at the router gate **and** again in the service; Technician and Client denied.
- Attachment storage access-controlled the same way TITAN documents are; financial attachments are
  not world-readable.
- All access to financial history and all write-backs audited via `security_audit_logs`.
- No production Xero tenant used during development or verification.

---

## Verification checklist

Run against a **staging Xero organisation** containing real historical shape. Each item requires
recorded evidence — counts, IDs, log rows, screenshots of real state. A passing mock-based unit test
does not satisfy any item on this list.

| # | Verification |
|---|--------------|
| V1 | OAuth connect completes and stores an encrypted token plus tenant ID |
| V2 | Token refresh succeeds, including rotation, and a long run survives expiry |
| V3 | Disconnect/reconnect preserves existing mappings without duplicating records |
| V4 | Full historical sync completes with no arbitrary date floor applied |
| V5 | Contact count in TITAN matches the Xero contact count |
| V6 | Quote count and status distribution match Xero |
| V7 | Invoice (ACCREC) count matches Xero, including voided and deleted |
| V8 | Invoice **line items** match Xero for a sampled set, including account codes and tax |
| V9 | Bill (ACCPAY) count and line items match Xero |
| V10 | Payment count matches Xero and allocations tie to the correct invoices |
| V11 | Credit note count and allocations match Xero |
| V12 | Bank transaction count matches Xero and is stored read-only |
| V13 | Chart of accounts fully imported; line items resolve to real accounts |
| V14 | Tracking categories imported and correctly applied to line items |
| V15 | Attachments imported and linked to the correct parent records |
| V16 | Pagination proven to exhaust multi-page entities (not a single page) |
| V17 | `429` / rate limit is backed off and the run still completes in full |
| V18 | An interrupted sync resumes from checkpoint without loss or duplication |
| V19 | Re-running a full sync is idempotent — no duplicates, no count change |
| V20 | Every skipped or failed record has a log row with Xero ID and reason (zero silent skips) |
| V21 | Every imported record carries its Xero ID and provenance fields |
| V22 | Owner sync status UI shows real last-sync, counts, failures and staleness |
| V23 | Customer 360 shows complete financial history for a real customer, with attribution |
| V24 | Finance search/filter/drill works across full history and drills back to Xero |
| V25 | AURA answers a real historical financial question with citations and correct classification, and refuses honestly where coverage is partial |
| V26 | Write-back requires Draft → Approve → Execute; auto-execute proven false in service, envelope and CHECK constraint; unapproved write refused and audited |

---

## Report requirements

The implementation report for this phase must contain:

1. **Phase A results** — all 36 items with WORKING / PARTIAL / BROKEN / NOT FOUND and `file:line`
   evidence.
2. **Phase B root causes** — per broken item, the actual cause and the minimal fix applied.
3. **What changed** — files, routes, schema, migration number, commit hashes.
4. **Real sync evidence** — per-entity counts imported from the staging Xero organisation, compared
   against Xero's own counts, with the sync run IDs and log excerpts.
5. **Verification results** — all 26 items, pass/fail, with the evidence for each.
6. **Honest gaps** — what remains PARTIAL or unimplemented, and why. Understating a gap is a defect.
7. **Confirmation** of: no second ledger, no fake data, no production Xero tenant touched, no
   uncontrolled write-back, RBAC/tenant/audit preserved, Yoco `0123` untouched, no deploy.
8. **No success claim** for any entity without the count and log evidence to support it.

---

## Status

**⬜ Approved — queued after Department 20 UX Final Pass; NOT started.**

- Scope is approved and recorded. **No code has been written for this phase.**
- Implementation begins **only after Department 20 (UX Final Pass) completes**.
- Do **not** start this alongside Department 21, hardening, or any other work.
- Department 20's in-progress files (role experience, navigation, web UX) must not be touched by
  this phase.
- When implemented, this phase is committed and reported separately from department work.
