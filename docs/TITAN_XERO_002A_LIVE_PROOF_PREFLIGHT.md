# TITAN XERO-002A — Controlled Live Proof Preflight

**Status:** READ-ONLY PREFLIGHT COMPLETE — **DO NOT EXECUTE LIVE PROOF**  
**Prepared (UTC):** 2026-08-06  
**Task branch:** `cursor/titan-xero-002a-live-proof-preflight`  
**Canonical branch:** `cursor/titan-v1-integration`  
**Evidence:** `diagnostic-output/xero-002a-preflight-readonly.json` (sanitized)

**Environments**

| Target | URL / ref | Access |
|--------|-----------|--------|
| Staging API | https://young-guns-os-staging.up.railway.app | Read-only probes only |
| Staging Web | https://comfortable-determination-staging.up.railway.app | Read-only probes only |
| Staging DB | `cpkuwtaipjxeipvbssvn` | Read-only SQL audit |
| Production DB | `rshuiaghmtrvvilhqpwm` | **FORBIDDEN** |

**Sequencing:** DASH-001 approved and closed. XERO-002A is the only active task. Controlled live proof (XERO-002) remains **blocked** until Owner approves each gate below.

---

## A. Precheck

| # | Item | Result |
|---|------|--------|
| 1 | pwd | `/workspace/.worktrees/titan-recovery` |
| 2 | Branch | `cursor/titan-xero-002a-live-proof-preflight` |
| 3 | Starting HEAD | `122af1bde8d1eddd93173a1ee92e4cf8725d5698` |
| 4 | git status | Modified tracked: `diagnostic-output/206b-xero-staging-migration-state.json`, `apply-staging-journal-chain.dry-run.json`. Untracked diagnostics preserved — not cleaned. |
| 5 | Protected untracked checksums | `206b-xero-staging-migration-state.json` → `cf29a4b5…`; `apply-staging-journal-chain.dry-run.json` → `3a6b511f…`; `xero-001-readonly-audit.json` → `602866b7…`; `xero-003c-staging-verification.json` → `ab1971b1…`; `xero-003d-staging-webhook-probe.json` → `40b926cf…` |
| 6 | Canonical ancestry | `122af1b` is ancestor of task HEAD |
| 7 | Staging API health | **200** — `ready`, database connected, webhooks enabled |
| 8 | Staging Web health | **200** — HTML shell served |
| 9 | Staging DB identity | Fingerprint `9658e88c5789`; ref `cpkuwtaipjxeipvbssvn` verified |
| 10 | Migration journal | **178** applied migrations |
| 11 | Xero connection | **Connected** |
| 12 | Tenant / org | **Young Guns Plumbing** · tenant `20176b90-a093-4da1-a04e-8ae616f89fef` |
| 13 | Token/scopes metadata | `grantedScopes` persisted (10 scopes incl. `accounting.attachments.read`); `scopeGrantedAt` **2026-08-06T15:15:54Z**; encrypted blob present; expiry not decrypted |
| 14 | Webhook config | Platform delivery URL documented in XERO-003 runbook; signing key stored server-side — **not exposed**; 0 webhook events recorded (no live deliveries yet) |
| 15 | Sync job status | Recent import jobs **completed** (latest **2026-08-06T15:38:47Z**) |
| 16 | Imported record counts | Customers 841 · Quotes 252 · Invoices 587 · Payments 512 · Bank tx 3142 · Attachments **0** |
| 17 | Customer mapping counts | Mapped 682 · Unmapped 159 · Quote mappings 252 · Invoice mappings 585 · Payment mappings 511 |
| 18 | Attachment counts | **0** metadata rows |
| 19 | Yoco / payment mapping | Yoco webhook deliveries **0** · Payments with Yoco ID **0** · Xero payment mappings **511** |

**Never printed:** access tokens, refresh tokens, client secret, webhook signing key, encryption keys, private customer financial data.

---

## B. Official Xero capability audit

Sources: [Xero Granular Scopes FAQ](https://developer.xero.com/faq/granular-scopes), [Upcoming scope changes (dev blog)](https://devblog.xero.com/upcoming-changes-to-xero-accounting-api-scopes-705c5a9621a0), TITAN `OAUTH_SCOPES` in `apps/api/src/services/xero-oauth.service.ts`.

**Official design (2026):** Broad `accounting.transactions` is deprecated for new apps. TITAN uses **granular** scopes only. Re-authorisation is required to add scopes to existing tokens — scopes are additive via Owner consent, not silent migration.

| Capability | Official required scope | TITAN requests | Token granted (staging) | Status | Correction required |
|------------|-------------------------|----------------|-------------------------|--------|---------------------|
| OpenID identity | `openid` | ✅ | ✅ | OK | No |
| Profile | `profile` | ✅ | ✅ | OK | No |
| Email | `email` | ✅ | ✅ | OK | No |
| Offline refresh | `offline_access` | ✅ | ✅ | OK | No |
| Chart / settings | `accounting.settings` | ✅ | ✅ | OK | No |
| Contacts R/W | `accounting.contacts` | ✅ | ✅ | OK | No |
| Invoices, quotes, credit notes | `accounting.invoices` | ✅ | ✅ | OK | No |
| Payments | `accounting.payments` | ✅ | ✅ | OK | No |
| Bank transactions | `accounting.banktransactions` | ✅ | ✅ | OK | No |
| Attachment metadata read | `accounting.attachments.read` | ✅ | ✅ (since 2026-08-06) | OK | **No reconnect for scope** — verify Gate 2 list |
| Webhooks | App config + HTTPS endpoint | Configured (XERO-003) | N/A | Partial | Owner platform webhook verification pending live event |
| Rate limits | `X-Rate-Limit-*` headers | Honoured in client | N/A | OK | Retry/backoff in import |

TITAN does **not** request legacy `accounting.transactions`. Least-privilege preserved.

---

## C. Attachment access preflight (X-P0-1)

| Question | Evidence |
|----------|----------|
| Authorisation URL requests `accounting.attachments.read`? | **Yes** — `OAUTH_SCOPES` and `XERO_REQUESTED_SCOPES` |
| Token authorised before scope added? | **Yes** — original connect **2026-08-04**; scope failures **2026-08-04/05** |
| Current token granted attachment read? | **Yes** — `grantedScopes` includes `accounting.attachments.read`; `scopeGrantedAt` **2026-08-06T15:15:54Z** |
| Can list invoice attachments today? | **Not verified live in this task** — no provider API call executed. Latest import attachments stage completed with **0 pulled, 0 failed** |
| Root cause | **Historical:** `stale_token_missing_scope`. **Current:** scope granted; zero rows likely **incremental parent scan window** or **no attachments on scanned invoices** — Gate 2 must list metadata on a known invoice |
| Reconnect required? | **No** for scope alone (already granted). Reconnect only if Gate 2 live list fails with `insufficient_scope` |
| Organisation preserved on reconnect? | **Yes** — OAuth callback merges `tenantId`, `organisationName`; encrypted token storage unchanged |
| Callback / storage correct? | **Yes** — `XeroOAuthService.completeOAuth`, encrypted blob v2, `mergeXeroScopeConfig` |

**Owner reconnect journey (if ever needed):**

1. TITAN → **Integrations** → **Xero**
2. **Review access** / **Reconnect securely**
3. Official Xero login and consent (organisation selection if prompted)
4. Return to TITAN — **Access confirmed**
5. TITAN verifies granted scopes (Owner sees **Connected** or **Connected with limited permissions** — not raw scope strings)

Owner must **never** use Railway, paste tokens, or edit developer credentials.

---

## D. Customer and contact mapping (X-P0-3)

**Staging counts (2026-08-06):**

| Metric | Count |
|--------|------:|
| TITAN customers | 841 |
| Xero contact mappings | 682 |
| Mapped | 682 |
| Unmapped | 159 |
| Orphan invoice mappings | 0 |

**Classification model** (`packages/shared/src/xero-customer-mapping.ts`):

| Owner bucket | Internal classification | Auto-merge | Owner approval |
|--------------|-------------------------|------------|----------------|
| Already mapped | `confirmed_linked` | N/A | No |
| Exact match | `safe_deterministic_match` (email/phone) | Dry-run apply only | No |
| Strong suggested match | `safe_deterministic_match` (name + corroboration) | Dry-run apply only | No |
| Ambiguous | `possible_match_review_required`, invalid/archived | **Never** | **Yes** |
| Conflict | `duplicate_xero_contacts` | **Never** | **Yes** |
| No match | `no_matching_xero_contact` | No | Optional create in live proof only |

**Unmapped reasons:** new TITAN customers post-import; contacts never imported into mapping directory; missing email/phone/name; name-only matches held for review; import auto-create path bypasses review queue.

**Gaps (preflight):** No persisted approve/reject queue; VAT/TaxNumber not in matcher; full Xero contact corpus not in directory builder. **Do not silently merge.**

**Cross-tenant:** All mapping queries scoped by `company_id`; unique indexes per tenant.

---

## E. Write-path code audit (not executed)

| Path | Entry | Approval gate | Idempotency | Duplicate risk |
|------|-------|---------------|-------------|----------------|
| Quote → Xero | `syncQuotes` | `quote_create` | Local mapping + approval key | Medium — not in Execute workflow; no provider idempotency header |
| Invoice → Xero | `executeApprovedInvoicePush` / `syncInvoices` | Owner Execute | Mapping + `markExecuted` | Medium — concurrent Execute tabs |
| Payment → Xero | `executeApprovedPaymentPush` | Owner Execute | Mapping + payment row | Medium |
| Attachment list | `importAttachmentBatch` | Read-only | DB unique on xero_attachment_id | Low |
| Webhook invoice refresh | `XeroRealtimeIntersyncService` | Read-only | dedupe_key unique | Low |
| Quote incremental | `refreshQuotesIncrementalFromXero` | Read-only | Mapping unique | Low |
| Yoco webhook | `handleYocoWebhook` | N/A | **No Xero write** | Delivery dedupe unique |
| Retry recovery | `recoverStaleImportJob` | Owner for AUTH_FAILED | Checkpoint resume | Writes re-attempt if approval still `approved` |

**Draft → Approve → Execute:** Owner-only approve/execute for `invoice_create`, `payment_create`, `contact_update`. Quotes use gate but **not** formal workflow API.

---

## F. Financial truth matrix

Implemented in `packages/shared/src/xero-financial-truth-matrix.ts` (12 states). Key non-equivalences:

- Quote created ≠ sent ≠ accepted
- Invoice issued ≠ cash collected
- Yoco paid ≠ Xero reconciled
- Bank import ≠ reconciliation
- Approved document ≠ paid document

Reconciliation derives from `packages/shared/src/xero-reconciliation.ts` — Yoco alone yields `yoco_payment_received`, not `bank_reconciliation_confirmed`.

---

## G. Controlled live-proof gates (DO NOT EXECUTE)

See [TITAN_XERO_002_LIVE_PROOF_PLAN.md](./TITAN_XERO_002_LIVE_PROOF_PLAN.md) for full gate definitions G1–G7.

| Gate | Purpose | Owner approval | Creates real Xero data? |
|------|---------|----------------|-------------------------|
| **G1** | Reconnect / scope verify | If Gate 2 fails scope test | No |
| **G2** | Read-only contact, invoice, attachment metadata | Required | No |
| **G3** | One DRAFT quote | Explicit | **Yes** (draft only) |
| **G4** | One DRAFT invoice | Separate explicit | **Yes** (draft only) |
| **G5** | Payment proof | Separate; no fake payment | Only if Owner confirms real txn |
| **G6** | Attachment metadata read | Separate | No download to public |
| **G7** | Reconciliation observation | Separate | No auto-reconcile |

Each gate includes prerequisites, Owner action, expected result, stop condition, rollback, audit evidence, forbidden actions in the live proof plan.

---

## H. Owner experience

All proof steps via TITAN UI. Normal labels: **Connected**, **Review access**, **Reconnect securely**, **Access confirmed**, **Additional permission required**, **Verification complete**, **Action required**.

Hidden on default surfaces: HTTP codes, scope strings, token expiry, tenant IDs, API routes, raw provider errors. Advanced review may show scope evidence after Owner authorisation.

---

## I. Testing (this task)

Added/updated:

- `packages/shared/src/xero-financial-truth-matrix.test.ts`
- `packages/shared/src/xero-customer-mapping.test.ts` (Owner review buckets)
- `apps/api/src/services/xero-002a-preflight.test.ts`

Existing coverage retained: OAuth, idempotency, webhook dedupe, attachment scope failure, reconciliation, write approval gate.

---

## J. Related documents

| Document | Action |
|----------|--------|
| [TITAN_XERO_002_LIVE_PROOF_PLAN.md](./TITAN_XERO_002_LIVE_PROOF_PLAN.md) | Updated with G1–G7 gates |
| [TITAN_XERO_002_COMPLETION_REPORT.md](./TITAN_XERO_002_COMPLETION_REPORT.md) | Created — implementation vs proof status |
| [TITAN_GAP_CLOSURE_PLAN.md](./TITAN_GAP_CLOSURE_PLAN.md) | XERO-002A preflight recorded; DASH-001 closed |
| [TITAN_MASTER_COMPLETION_CHECKLIST.md](./TITAN_MASTER_COMPLETION_CHECKLIST.md) | DASH-001 approved; XERO-002A active |

**Recorded only:** UI-THEME-001, AI-FIN-DOC-001 — not implemented.

---

## K. Deployment

Read-only preflight + tests/docs only. No migration. No Xero reconnect. No provider writes. Staging deploy **optional** (shared/API test additions only).

---

## L. Confirmations

| Confirmation | Status |
|--------------|--------|
| No Xero write executed | ✅ |
| No real quote/invoice/payment created | ✅ |
| No attachment content downloaded | ✅ |
| No credential changes | ✅ |
| Facebook / Yoco / 307 agents unchanged | ✅ |
| Production untouched | ✅ |

---

## Exact next Owner action

**Approve XERO-002A preflight report**, then authorise **Gate 2 (read-only proof)** on staging — list attachment metadata on one existing invoice with a known Xero attachment. Do **not** authorise Gate 3+ until Gate 2 evidence is reviewed.

**Next gate requiring explicit approval:** **GATE 2 — Read-only proof**

**STOP FOR OWNER APPROVAL.**
