# TITAN XERO-001 — Full Connection and Finance Audit Report

**Audit type:** READ-ONLY evidence-first audit — no fixes, no OAuth, no mutations  
**Generated (UTC):** 2026-08-06  
**Worktree:** `/workspace/.worktrees/titan-recovery`  
**Branch:** `cursor/titan-v1-integration` @ `1f32ed83ece1c1122a7c333aeb6b0d3c1cb3f10f` (integrated XERO-001A)  
**Audit commit:** `c670f4eaf0b0f38dfd5ae57c83d1621c5bb3e020`  
**Tenant:** Young Guns Plumbing (`095aef76-fef5-4139-af37-a42f2d7e2faf`)  
**Staging DB fingerprint:** `9658e88c5789` (ref `cpkuwtaipjxeipvbssvn`)  
**Production DB:** **FORBIDDEN** — ref `rshuiaghmtrvvilhqpwm` not accessed  
**Evidence artifact:** `diagnostic-output/xero-001-readonly-audit.json`  

---

## Executive summary

Xero OAuth connection to **Young Guns Plumbing** is **connected on staging** with substantial **read import** data (contacts, quotes, invoices, payments, bank transactions). The **full business chain is not proven end-to-end**. **Attachments remain at zero** with provider rejection evidence. **Two-way write** and **Owner live workflow** are **implemented in code + tests** but **not live-verified**. **Internal pilot: not ready.** **Production: not ready.**

**Do not mark Xero complete.** Next locked task: **XERO-002 implementation** (Owner-approved scope only).

---

## A. Precheck (audit run)

| Item | Result |
|------|--------|
| pwd | `/workspace/.worktrees/titan-recovery` |
| HEAD | `363111f5df0f0ffa6e06e915320b4a88a0824aad` |
| Tracked tree | Clean |
| Staging API health | 200 |
| Staging deployed SHA | `363111f` (API: no deploy on docs-only commits) |
| Production | Untouched |

---

## B. Architecture evidence map

See appendix **Architecture map** below. Implementation is **substantial** across OAuth, 10-stage import pipeline, financial memory tables, write-approval queue, dashboard honesty, and RBAC.

---

## C. Live connection diagnosis (read-only, Young Guns)

| Field | Value |
|-------|-------|
| Connection exists | **Yes** |
| TITAN status | `connected` |
| Organisation | **Young Guns Plumbing** |
| Organisation / tenant ID | `20176b90-a093-4da1-a04e-8ae616f89fef` |
| Base currency | ZAR |
| Encrypted credentials | **Present** (blob length 2139 — not decrypted) |
| Refresh token | **Assumed present** inside encrypted blob (OAuth uses `offline_access`) |
| Token expiry | **Unknown without decrypt** — not read during audit |
| Token refresh triggered | **No** |
| Last successful connection sync timestamp | `2026-08-05T16:55:39.411Z` |
| Last connection error | `null` |
| Granted scopes in DB config | **Not persisted** (`null`) |
| Requested scopes (code) | `openid profile email offline_access accounting.settings accounting.contacts accounting.invoices accounting.payments accounting.banktransactions accounting.attachments.read` |
| Active import job | **1 running** (id `3fae9975-…`, started `2026-08-05T23:53:00Z`) |
| Scheduled sync | **No row** in `integration_sync_schedules` for Xero |
| Webhook state | **Not implemented** for Xero |

**Most recent sanitized provider errors (sync logs):**

- Attachments: `Xero rejected attachment access while reading invoice … Verify the tenant ID and granted scopes`
- Accounts stage (import jobs): `Xero rejected the request. Verify the tenant ID and granted scopes`
- Legacy invoice failures: `Invalid time value` (quote stage, Aug 3)
- Write-blocked (expected): `Xero write blocked: no approval for invoice_create …`

---

## D. Current imported data (@ 2026-08-06 read-only recount)

### Historical evidence vs current (not assumed equal)

| Entity | Historical report (~Aug 3) | **Current TITAN count** | Mapping count | Notes |
|--------|------------------------------|-------------------------|---------------|-------|
| Contacts | ~900 cited | customers **837** | mappings **678** | 159 customers without mapping |
| Quotes | — | **251** | **251** | Improved since Aug 3 (was 0 stored) |
| Invoices | ~585 | **587** | **585** | Near historical; 2 invoice/mapping gap |
| Payments | ~511 | **512** | **511** | Near historical |
| Bank transactions | ~3,095 | **3,111** | — | Slight increase |
| Attachments | **0** | **0** | — | **Still zero** |
| Credit notes | — | **0** | — | Not imported |
| Accounts (chart) | — | **69** | — | Partial |
| Bills | — | **1** | — | Minimal |
| Tracking categories | — | **0** | — | Not imported |

**Xero source counts:** Not queried live from Xero API during this audit (would require token use). **Counts do not match claim unless proven** — TITAN-side only.

| Classification | Finding |
|----------------|---------|
| Linked | 678 customers, 585 invoices, 511 payments, 251 quotes via mapping tables |
| Unlinked customers | **159** customers without `xero_customer_mappings` row |
| Orphan mappings | **0** orphan invoice mappings |
| Duplicate prevention | Mapping tables + idempotency keys in write path (code) |
| Stale | Last invoice sync success log **2026-08-04**; quotes/bank **2026-08-05** |

---

## E. Source-of-truth matrix

| Domain | Classification | Evidence |
|--------|----------------|----------|
| Xero contact ID / official contact fields | **Xero authoritative** on import | Mappings + import pipeline |
| TITAN customer CRM fields | **TITAN authoritative** for ops; sync enriches | CRM modules |
| Quote numbers (official) | **Xero authoritative** when synced | `xero_quote_mappings`, `stripXeroOwnedFields` |
| Invoice numbers (official) | **Xero authoritative** when synced | `xeroInvoiceNumber`, document engine |
| TITAN local draft numbers | **TITAN authoritative** until Xero assigns | Finance editors |
| Quote/invoice status (synced docs) | **Bidirectional with conflict rules** | Write approval queue for pushes |
| Payment status (accounting) | **Xero authoritative** for reconciliation | `yoco-payment-links.ts` explicit |
| Yoco checkout events | **Provider event only** — not Xero | Yoco module |
| Outstanding balance | **Derived in TITAN** from imported invoices/payments | Dashboard pipeline |
| VAT/tax on synced lines | **Xero authoritative** on import | Line item mapper |
| Bank transactions | **Xero authoritative** (read import) | `xero_bank_transactions` |
| Reconciliation status | **Unresolved / partial** | No proven live reconcile loop |
| Job revenue / material / labour cost | **TITAN authoritative** | Job costing; Xero overlap partial |
| Gross/net profit on dashboard | **Derived in TITAN** — partial Xero inputs | Dashboard honesty states |
| Document PDFs (TITAN-generated) | **TITAN authoritative** | Document engine |
| Xero attachments | **Xero authoritative** — **not imported** | 0 rows |

**Circular risk:** Dashboard may combine TITAN job data with partial Xero AR — honesty helpers mitigate but **live proof pending**.

---

## F. Numbering and status mapping

| Area | Verdict | Gap |
|------|---------|-----|
| Xero invoice numbering | **Partial** | Imported numbers on 585 mappings; local drafts separate |
| Xero quote numbering | **Partial** | 251 mapped |
| Duplicate prevention | **Implemented but not live-verified** | Idempotency + mapping conflict service |
| Status mapping (quote) | **Implemented** | `mapXeroQuoteStatus` in shared |
| Paid / partial / overdue | **Partial** | Derived; stale if sync incomplete |
| Voided / deleted | **Partial** | Mapper handles VOIDED/DELETED → cancelled |
| Credit notes / overpayments | **Missing import data** | 0 credit notes stored |

---

## G. Financial correctness

| Metric | Verdict | Notes |
|--------|---------|-------|
| Subtotal/VAT/total on imported lines | **Implemented but not live-verified** | `mapXeroLineItemsToTitan`, 1786 line items stored |
| Amount paid / due | **Partial** | Depends on payment import completeness |
| Dashboard revenue/profit | **Partial** | `dashboard-honesty.ts` — never fake zero |
| Cash flow vs accounting profit | **Partial** | Separate pages; Xero availability markers |
| VAT as revenue | **Guards in code** | Pipeline uses line amounts — live proof pending |
| Hard-coded demo values | **Not found in Xero pipeline** | Honesty vocabulary enforced |

**No dashboard metric marked Verified complete.**

---

## H. Quote → invoice workflow (20 steps — code + staging DB)

| Step | Verdict |
|------|---------|
| 1 Create customer | **Implemented but not live-verified** |
| 2 Link Xero contact | **Partial** — 159 customers unmapped |
| 3 Create TITAN quote | **Implemented but not live-verified** |
| 4 Catalogue items | **Implemented but not live-verified** |
| 5 Pricing/VAT | **Implemented but not live-verified** |
| 6 Preview document | **Implemented but not live-verified** |
| 7 Owner approval | **Partial** — write approval for Xero push |
| 8 Send quote | **Owner-action required** — not proven |
| 9 Accept quote | **Partial** — status mapper exists |
| 10 Convert to invoice | **Partial** |
| 11 Xero number allocation | **Provider-blocked** without approved write |
| 12 Invoice document | **Implemented but not live-verified** |
| 13 Yoco payment link | **Missing** (FIN-013 NOT_STARTED) |
| 14 Receive payment | **Partial** — 512 payments imported |
| 15 Import Xero payment | **Partial** — 511 mappings |
| 16 Outstanding balance | **Partial** |
| 17 Reconcile | **Missing** live proof |
| 18 Job profitability | **Partial** |
| 19 Dashboard update | **Partial** |
| 20 Audit history | **Partial** — sync logs + security audit |

---

## I. Attachments root cause

| Classification | **Implemented but permission-blocked / broken at runtime** |
|----------------|-----------------------------------------------------------|
| OAuth scope requested | `accounting.attachments.read` in `OAUTH_SCOPES` |
| Stored attachments | **0** |
| Sync log failures | **2,348** attachment failures |
| Sample error | Xero rejected attachment access — verify tenant/scopes |
| Recent import jobs | Failed at **attachments** stage (Aug 5) |
| Provider data empty | **Unresolved** — cannot confirm without live API read |

**Likely root cause:** Attachment stage fails at Xero API (scope/tenant rejection), not missing code path. **Do not add scope during audit.**

---

## J. Sync reliability

| Area | Verdict |
|------|---------|
| 10 import stages | **Implemented** — accounts → … → attachments |
| Pagination | **Implemented** (code) |
| Incremental / modified-since | **Partial** |
| Rate limiting / backoff | **Implemented** (code + tests) |
| Idempotency | **Implemented** |
| Stage failure blocks pipeline | **Yes** — failed stage recorded; attachments blocked recent jobs |
| Resume / retry | **Partial** — 1 running job; 15 failed, 92 completed |
| Token expiry handling | **Implemented** (code) — not triggered in audit |
| Sync log volume | **89,622** entries — high failure noise on invoice/bank historical runs |
| Manual sync | **Owner-action** — POST routes exist |
| Scheduled sync | **Missing** — no schedule row |
| Concurrency | **Partial** — 1 active job observed |

---

## K. Security and access

| Check | Verdict |
|-------|---------|
| Owner full finance/integrations | **Implemented** — RBAC tests pass |
| Admin / Office finance | **Partial** — matrix exists; staging click-path not run |
| Technician denial | **Implemented** — `technician cannot request Xero writes` test |
| Client portal isolation | **Implemented** — portal hides Xero internals |
| Tenant isolation | **Implemented** — companyId scoping; cross-tenant matrix elsewhere |
| Token encryption | **Implemented** |
| Write approval enforcement | **Implemented** — gate + workflow tests |
| Attachment access | **Not live-verified** |

---

## L. Browser / UI audit (Stage 1 — static + unauthenticated)

**Authenticated staging click-path:** **Owner-action required** — no Owner token used; no OAuth.

| Surface | Static verdict |
|---------|----------------|
| `/integrations/xero` | **Implemented** — connect, test, disconnect, sync panel |
| Finance dashboard Xero strip | **Implemented** — honesty states |
| Quote/invoice editors | **Implemented** — Xero number fields gated |
| Write approvals page | **Implemented** |
| API unauthenticated | **401** on `GET /integrations/xero` ✓ |

**Playwright Xero-specific journey:** **Not present** — no dedicated spec. Finance layout specs exist (J-6.4).

---

## N. Audit verdicts

| Area | Verdict |
|------|---------|
| OAuth connection | **Verified complete** (staging DB + connection row) |
| Token refresh | **Implemented but not live-verified** |
| Organisation identity | **Verified complete** (Young Guns Plumbing) |
| Contacts | **Partial** (678/837 mapped) |
| Quotes | **Partial** (251 imported) |
| Invoices | **Partial** (587 / 585 mapped) |
| Payments | **Partial** (512 / 511 mapped) |
| Bank transactions | **Partial** (3111 imported; historical log failures) |
| Attachments | **Provider-blocked** |
| Numbering | **Partial** |
| Reconciliation | **Missing** |
| Job costing | **Partial** |
| Dashboard financials | **Partial** |
| Documents | **Implemented but not live-verified** |
| Yoco linkage | **Missing** |
| Security | **Implemented but not live-verified** |
| Role access | **Implemented but not live-verified** (tests pass) |
| Tenant isolation | **Implemented but not live-verified** |
| Browser usability | **Partial** (static only) |
| Internal-pilot readiness | **Owner-action required** |
| Production readiness | **Not applicable** (forbidden) |

---

## O. Prioritised gap plan

### P0 — blocks Young Guns internal pilot (7)

| ID | Gap | Root cause | Risk |
|----|-----|------------|------|
| X-P0-1 | Attachments always zero | Xero rejects attachment API at sync stage | Compliance/docs incomplete |
| X-P0-2 | Full chain not Owner-proven | No authenticated E2E staging proof | False confidence |
| X-P0-3 | 159 customers unmapped | Import/matching incomplete | CRM/Xero drift |
| X-P0-4 | Active import job running/stalled | Stage failures on accounts/attachments | Stale data |
| X-P0-5 | Write path not live-verified | Approval queue code-only on staging UX | Cannot push quotes/invoices |
| X-P0-6 | Yoco → Xero payment chain missing | FIN-013 not implemented | Broken payment story |
| X-P0-7 | Reconciliation not proven | No live reconcile workflow | Profit/dashboard unreliable |

### P1 — first 30 days (5)

| ID | Gap |
|----|-----|
| X-P1-1 | Credit notes / tracking categories not imported |
| X-P1-2 | Scheduled sync not configured |
| X-P1-3 | Granted scopes not persisted on connection for audit |
| X-P1-4 | Playwright authenticated Xero journey missing |
| X-P1-5 | Sync log failure noise / invoice date parsing legacy errors |

### P2 — optional (3)

| ID | Gap |
|----|-----|
| X-P2-1 | Multi-org tenant picker |
| X-P2-2 | Webhook-driven incremental sync |
| X-P2-3 | Xero live source count parity dashboard |

---

## P. Tests executed

| Suite | Result |
|-------|--------|
| API Xero service tests (15 files) | **123 / 123 pass** |
| Shared package (includes Xero contracts) | **1092 / 1092 pass** (full shared run) |
| Read-only DB audit script | Executed — artifact JSON |
| Playwright Xero journey | **Not run** (no auth; no write clicks) |
| Full application test suite | **Not run** (Xero-focused subset only) |

---

## Q. Recommended XERO-002 implementation scope

1. **Fix attachment stage** — diagnose scope vs tenant rejection; Owner reconnect only if needed  
2. **Owner authenticated staging E2E** — quote → approval → invoice → payment chain proof  
3. **Customer mapping closure** — 159 unmapped customers  
4. **Import job recovery** — safe resume/cancel stale running job  
5. **Persist granted scopes** on connection for auditability  
6. **Yoco payment link** (FIN-013) — separate batch  
7. **Playwright read-only + Owner write-path specs**  
8. **Do not mark Xero complete** until chain proven  

---

## Appendix: Architecture component index

| # | Component | Primary file(s) |
|---|-----------|-----------------|
| 1 | OAuth start | `integrations.ts` POST `/xero/oauth/start`, `xero-oauth.service.ts` |
| 2 | OAuth callback | `integrations.ts` GET `/xero/oauth/callback` |
| 3 | Token storage | `integration_connections.credentials_encrypted` |
| 4 | Encryption | `apps/api/src/lib/crypto.ts` |
| 5 | Token refresh | `xero-oauth.service.ts` `refreshAndPersistTokens` |
| 6 | Org selection | First connection auto-select |
| 7 | Scopes | `OAUTH_SCOPES` constant |
| 8 | Connection resolver | `getXeroConnection` |
| 9 | Sync coordinator | `xero-sync.service.ts` |
| 10 | Sync stages | `xero-import-job.processor.ts` (10 stages) |
| 11 | Retry | `retrySyncJob`, `requiresOwnerActionToRetry` |
| 12 | Idempotency | `xero-two-way-sync.ts` |
| 13 | Background jobs | `integration-sync.scheduler.ts` |
| 14 | API routes | `integrations.ts` (see section 7 in subagent map) |
| 15 | DB tables | `packages/db/src/schema/xero-*.ts` |
| 16 | Shared contracts | `packages/shared/src/xero-*.ts` |
| 17 | Web UI | `XeroSettingsPage.tsx`, `XeroSyncPanel.tsx` |
| 18 | Owner controls | Write approval workflow |
| 19 | Document engine | `document-engine.ts` Xero field stripping |
| 20 | Yoco | `yoco-payment-links.ts` (separate from Xero write) |
| 21 | Dashboard | `dashboard-executive.service.ts`, `dashboard-honesty.ts` |
| 22 | Audit logs | `security_audit_logs`, `xero_sync_logs` |
| 23 | RBAC | `integrations:read/manage`, finance permissions |

---

**STOP FOR OWNER APPROVAL.**
