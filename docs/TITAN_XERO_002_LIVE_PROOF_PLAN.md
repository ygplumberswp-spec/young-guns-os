# TITAN XERO-002 — Controlled Live-Write Proof Plan (Owner Gate)

**Status:** PREPARED — **DO NOT EXECUTE** until Owner explicitly approves each gate  
**Preflight (2026-08-06):** [TITAN_XERO_002A_LIVE_PROOF_PREFLIGHT.md](./TITAN_XERO_002A_LIVE_PROOF_PREFLIGHT.md)  
**Gate 2 (2026-08-06):** [TITAN_XERO_002_GATE_2_READONLY_PROOF.md](./TITAN_XERO_002_GATE_2_READONLY_PROOF.md) — **PARTIAL** (org live-read verified; full proof after staging API deploy)
**Sequencing (2026-08-06):** DASH-001 **approved and closed**. Live proof remains gated per section **G1–G7** below.
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
3. Xero connection shows **Connected** with granted scopes including `accounting.attachments.read`. *(Staging 2026-08-06: scope granted — Gate 2 must confirm attachment list.)*

---

## Gated live-proof stages (G1–G7)

**Do not execute any gate without explicit Owner approval for that gate.**

### GATE 1 — Owner reconnect approval (conditional)

| | |
|---|---|
| **Prerequisites** | Gate 2 attachment list fails with insufficient scope |
| **Owner action** | Integrations → Xero → **Review access** → Reconnect securely → choose Young Guns Plumbing |
| **Expected result** | **Connected**; attachment read scope granted |
| **Stop condition** | Scope already granted (staging 2026-08-06 — **skip unless Gate 2 fails**) |
| **Rollback** | None — no financial write |
| **Forbidden** | Railway, manual tokens, credential edits |

### GATE 2 — Read-only proof

**Execution (2026-08-06):** PARTIAL — `POST /integrations/xero/test` returned **Young Guns Plumbing** (live Xero read). Full contact/invoice/attachment proof via `POST /integrations/xero/gate2-readonly-proof` pending staging API deploy of `b4e991c`.

| | |
|---|---|
| **Prerequisites** | Gate 1 pass or skipped; staging API deployed with Gate 2 route |
| **Owner action** | Open linked customer; open existing invoice; view attachment metadata if available |
| **Expected result** | Tenant mapping correct; attachment metadata lists without error; **no writes** |
| **Stop condition** | Any write prompt or provider error — stop and capture audit |
| **Rollback** | N/A |
| **Forbidden** | Download attachment to public URL; create records |

### GATE 3 — Controlled quote proof

| | |
|---|---|
| **Prerequisites** | Gate 2 pass; **Confirmed linked** test customer; explicit Owner approval |
| **Owner action** | Create one **DRAFT** quote labelled `TITAN XERO E2E TEST`; approve write; push once |
| **Expected result** | Official Xero quote ID stored; retry does not duplicate |
| **Stop condition** | Duplicate Xero quote on retry — stop proof |
| **Rollback** | Void/delete draft in Xero; remove TITAN draft |
| **Forbidden** | Send quote to customer |

### GATE 4 — Controlled invoice proof

| | |
|---|---|
| **Prerequisites** | Gate 3 pass; separate Owner approval |
| **Owner action** | Convert to one **DRAFT** invoice; approve; push once; wait for webhook refresh |
| **Expected result** | Official Xero invoice number; targeted refresh updates TITAN |
| **Rollback** | Void draft invoice in Xero |
| **Forbidden** | Email invoice; authorise unless separately approved |

### GATE 5 — Controlled payment proof

| | |
|---|---|
| **Prerequisites** | Gate 4 pass; separate Owner approval |
| **Owner action** | Only if Owner confirms real authorised transaction — or Yoco sandbox if configured |
| **Expected result** | Yoco event recorded; Xero payment import separate; reconciliation states distinct |
| **Rollback** | Refund if real payment |
| **Forbidden** | Fabricated payment; equating Yoco paid with reconciled |

### GATE 6 — Attachment proof

| | |
|---|---|
| **Prerequisites** | Gate 2 metadata pass; separate approval if upload needed |
| **Owner action** | List/read metadata; optional upload only if separately approved |
| **Expected result** | Private storage; RBAC on access |
| **Forbidden** | Public exposure of file bytes |

### GATE 7 — Reconciliation proof

| | |
|---|---|
| **Prerequisites** | Gate 5 pass or existing reconciled invoice for observation |
| **Owner action** | Open reconciliation view; compare Yoco vs Xero vs bank import states |
| **Expected result** | TITAN shows Xero reconciliation only with authoritative evidence |
| **Forbidden** | Auto-reconcile in TITAN |

---
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

**Approve XERO-002A preflight**, then authorise **Gate 2 (read-only proof)** on staging. Do not begin Gate 3+ until Gate 2 evidence is reviewed.

Reply **"XERO-002 GATE 2 GO"** to authorise supervised Gate 2 only.

**Do not mark Xero production-complete** until this proof succeeds.
