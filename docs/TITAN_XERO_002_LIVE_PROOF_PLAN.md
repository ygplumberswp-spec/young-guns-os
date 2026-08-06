# TITAN XERO-002 — Controlled Live-Write Proof Plan (Owner Gate)

**Status:** PREPARED — **DO NOT EXECUTE** until Owner explicitly approves  
**Prepared (UTC):** 2026-08-06  
**Environment:** Staging only  
**Staging API:** https://young-guns-os-staging.up.railway.app  
**Staging Web:** https://comfortable-determination-staging.up.railway.app  
**Staging DB ref:** `cpkuwtaipjxeipvbssvn`  
**Production DB ref:** `rshuiaghmtrvvilhqpwm` — **FORBIDDEN**

---

## Preconditions (must pass before live proof)

1. XERO-002 implementation deployed to staging (API + Web).
2. Owner signed in as **Company Owner** on staging Web.
3. Xero connection shows **Connected** with granted scopes including `accounting.attachments.read` (Owner reconnect if **Connected with limited permissions**).
4. No stale/running import job — use **Recover stale sync** or **Clear failed sync safely** if needed.
5. Customer mapping review queue cleared or test customer has **Confirmed linked** Xero contact.
6. Yoco credentials configured on staging (if real payment step included).
7. This document reviewed and explicitly approved by Owner.

---

## Test record naming

```
TITAN XERO E2E TEST — 2026-08-06T[HH:mm:ss]Z
```

Replace timestamp at execution time.

---

## Controlled test steps (Owner actions only)

| # | Step | Owner action | Expected evidence | Rollback |
|---|------|--------------|-------------------|----------|
| 1 | Select customer | Choose existing **Confirmed linked** customer OR create test customer with Owner approval | Customer shows Xero Contact ID (masked OK) | Archive test customer if created |
| 2 | Confirm contact link | Verify mapping state = **Confirmed linked** | Mapping audit record | Unlink only via manual correction |
| 3 | Create TITAN quote draft | New quote R500.00 ex VAT (or agreed test amount) | Local draft number only — **not** official Xero number | Delete draft |
| 4 | VAT treatment | 15% VAT (ZAR) — verify line totals | Preview shows subtotal/VAT/total | — |
| 5 | Account/item mapping | Confirm catalogue lines map to Xero items/accounts | Preflight validation passes | — |
| 6 | Document preview | Review PDF/preview — no payment link on quote | Preview honest labels | — |
| 7 | Owner approval | Approve write in approval queue | Approval audit record with idempotency key | Reject if wrong |
| 8 | Push quote to Xero | Click **Push to Xero** (explicit) | Official Xero quote number stored; TITAN draft no longer shows local as official | Void in Xero if needed |
| 9 | Quote acceptance | Mark accepted in TITAN / sync status | Status mapped correctly | — |
| 10 | Convert to invoice | Explicit **Convert to invoice** with Owner approval | Official Xero invoice number stored | Void/credit note in Xero |
| 11 | Invoice PDF | Generate PDF | Shows official number + Yoco link/QR (real URL only) | — |
| 12 | Yoco payment link | Generate link for outstanding balance | One active link; correct amount/currency | Cancel link |
| 13 | Payment | **Option A:** Yoco test/sandbox if available · **Option B:** Approved small real payment · **Option C:** Simulate webhook in controlled harness only | Payment event deduplicated | Refund if real payment |
| 14 | Xero payment import | Run read-only sync / wait for import | Xero payment mapping row | — |
| 15 | Reconciliation check | Open reconciliation view | States distinguish Yoco paid vs Xero reconciled | — |
| 16 | Job revenue | Link invoice to job if applicable | Revenue labelled with source | — |
| 17 | Job costs | Enter/verify materials + labour for job | Costs separate from revenue | — |
| 18 | Profit result | View job gross profit / margin | VAT excluded from revenue; unpaid not counted as cash | — |
| 19 | Dashboard update | Executive finance dashboard | Source labels + freshness timestamps | — |
| 20 | Audit evidence | Export sync logs + security audit + approval history | Full chain traceable | — |
| 21 | Cleanup | Void invoice/quote in Xero; cancel Yoco link; mark test records | Provider + TITAN consistent | Owner sign-off |

---

## Amounts and identifiers (fill at execution)

| Field | Planned value |
|-------|---------------|
| Customer | _Owner to select — prefer existing linked contact_ |
| Quote amount (ex VAT) | R500.00 ZAR (adjustable) |
| VAT | 15% |
| Xero tenant | Young Guns Plumbing |
| Test label prefix | `TITAN XERO E2E TEST` |

---

## Explicit prohibitions during automated CI

- No OAuth reconnect triggered by CI
- No Xero write API calls from tests
- No Yoco live payment from tests
- No production database access

---

## Success criteria

- Official Xero quote and invoice numbers assigned and stored
- No duplicate provider records on retry
- Yoco payment event recorded separately from Xero reconciliation state
- Dashboard figures show honest source/freshness labels
- Full audit trail captured

---

## Single next Owner action

**Approve this plan**, then execute manually on staging as Company Owner, OR reply **"XERO-002 LIVE PROOF GO"** to authorise a supervised agent run of the steps above.

**Do not mark Xero production-complete** until this proof succeeds.
