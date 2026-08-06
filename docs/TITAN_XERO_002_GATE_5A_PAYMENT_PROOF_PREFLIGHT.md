# TITAN XERO-002 — Gate 5A Payment Proof Preflight (READ-ONLY)

**Status:** PREPARED — **DO NOT EXECUTE** Gate 5 payment proof  
**Executed (UTC):** 2026-08-06  
**Environment:** Staging only (`cpkuwtaipjxeipvbssvn`)  
**Controlled records audited:**

| Record | Identifier |
|--------|------------|
| Quote | **Q-0253** |
| TITAN invoice | **TITAN-INV-000589** |
| Xero invoice | **INV-0586** (`4615427d…`) |

**No writes performed.** No Xero payment, Yoco payment, invoice authorisation, or reconciliation action taken.

---

## 1. Audit findings (15 items)

| # | Question | Finding |
|---|----------|---------|
| 1 | **Current Xero status of INV-0586** | Gate 4 evidence confirms **DRAFT** in Xero at push time. Staging TITAN row: `status=draft`, `xero_invoice_number=INV-0586`, `amount_paid_cents=0`, `total_cents=66125`. Reconciliation snapshot: **`invoice_issued`**, balance due **R661.25**. |
| 2 | **Payment against DRAFT invoice?** | **No.** Xero requires invoice **AUTHORISED** before payments apply ([Xero Invoices API](https://developer.xero.com/documentation/api/accounting/invoices)). TITAN `createPayment` in Xero client posts to `/Payments` without status pre-check — provider will reject DRAFT. |
| 3 | **Authorisation required first?** | **Yes.** Two-step Xero flow: DRAFT → **AUTHORISED** → payment → PAID. |
| 4 | **Authorisation consequences?** | **Yes — material.** AUTHORISED creates **accounting journals** in Xero; invoice becomes **Awaiting Payment**; may appear in customer-facing channels if emailed/online invoice enabled. Gate 4 explicitly kept INV-0586 **DRAFT** to avoid this. |
| 5 | **Zero-value payment?** | **Not supported.** TITAN `finance.service.createPayment` and `executeApprovedPaymentPush` both require `amountCents > 0`. Not appropriate for proof. |
| 6 | **Simulated/local-only proof?** | **Partially valid.** Can prove: write-approval **Request → Approve** without Execute; reconciliation state machine (`deriveInvoiceReconciliationState`); unit tests; TITAN ledger payment **without** Xero Execute. **Cannot** prove live Xero payment API or post-payment intersync without a real authorised payment. |
| 7 | **Existing genuine transaction?** | **Yes.** Gate 2 invoice **INV-0280** is **paid** in TITAN with mapped Xero payment (`6fb956e7…`, R1,749.20). Read-only Gate 2 proof already verified live Xero read. **511** payment mappings on staging, **0** duplicate Xero payment IDs. |
| 8 | **Payment removal/reversal?** | TITAN has **no** Xero payment delete API wrapper. Rollback requires **Owner manual delete** of payment in Xero (API supports DELETE) + TITAN payment/mapping cleanup. Yoco webhook path documents **“Nothing is written to Xero.”** |
| 9 | **Bank account mapping** | `xero.client.createPayment` uses `getDefaultBankAccountCode()` — first **BANK** type account from `GET /Accounts?where=Type=="BANK"`. Throws `CONFIG_ERROR` if none. Account **Code** sent (not AccountID). Not persisted in TITAN config — resolved at push time. |
| 10 | **Required payment fields** | **TITAN payment:** `invoiceId`, `amountCents` (>0), optional `paidAt`, `reference`, `method`, `currency`, `clientActionId`. **Xero push:** `InvoiceID`, `Account.Code`, `Amount`, `Date`, optional `Reference`. Full invoice balance: **66125 cents** (R661.25 incl. VAT). |
| 11 | **Idempotency / duplicates** | `payment_create` idempotency key: `pay:{paymentId}:{amountCents}`. Existing `xeroPaymentId` on payment or mapping → **idempotent return**. `clientActionId` on TITAN payment insert prevents duplicate ledger rows. Staging: **0** duplicate `xero_payment_id` across 511 mappings. **0** prior `payment_create` write approvals. |
| 12 | **Yoco vs Xero vs reconciled** | Explicitly separated in `xero-reconciliation.ts` and financial truth matrix. Yoco webhook (`handleYocoWebhook`) **never writes to Xero**. States: `yoco_payment_received` ≠ `xero_payment_recorded` ≠ `bank_reconciliation_confirmed`. Staging: **0** Yoco webhook deliveries; Yoco integration **connected** but no live Yoco events to observe. |
| 13 | **Webhook / targeted refresh after payment** | Xero webhook handler supports **INVOICE**, CONTACT, CREDITNOTE — **not PAYMENT** category. Payment state refresh relies on **invoice** webhook → `refreshTargetedInvoiceFromXero`, or manual/write-confirm enqueue. Staging: **1** INVOICE webhook event total; **0** payment-category events. |
| 14 | **Rollback procedure** | If Gate 5C executed: (1) Delete Xero payment in Xero UI/API; (2) Void/delete test invoice if still draft, or credit note if authorised; (3) Remove TITAN `payments` row + `xero_payment_mappings`; (4) Reset invoice `amount_paid_cents` / status; (5) Cancel Yoco link if created; (6) Refund real Yoco charge if applicable. |
| 15 | **Risks / stop conditions** | **STOP** if: attempting payment on DRAFT; fabricating payment; equating Yoco paid with reconciled; zero-amount payment; using INV-0586 without explicit authorise approval; missing bank account; duplicate Execute clicks; production access. |

---

## 2. Three options

### OPTION A — No-write simulated verification

| | |
|---|---|
| **What** | Request + Approve `payment_create` in workflow **without Execute**; run reconciliation/unit tests; optional TITAN-only ledger payment on a **non-Xero** test invoice fixture. |
| **Proves** | Approval gate, idempotency keys, state labels, Yoco≠Xero separation in code. |
| **Does not prove** | Live Xero `/Payments` POST, post-payment invoice refresh, bank mapping under real tenant. |
| **Real money** | **No** |
| **Real Xero payment** | **No** |
| **INV-0586 authorise first?** | **No** (if Execute skipped) |

### OPTION B — Read-only observation of existing genuine paid invoice

| | |
|---|---|
| **What** | Observe **INV-0280** (or similar paid mapped invoice) via Gate 2 read-only proof + reconciliation snapshots + payment mapping rows. Compare `yoco_payment_received` vs `xero_payment_recorded` vs `bank_reconciliation_confirmed` without any write. |
| **Proves** | Payment-state **observation** and honest labelling on real historical data; paid vs reconciled separation (Gate 2 already showed `paidStateDistinctFromReconciled`). |
| **Does not prove** | TITAN → Xero payment **push** path for new test invoice. |
| **Real money** | **No** |
| **Real Xero payment** | **No** (observes existing) |
| **INV-0586 authorise first?** | **No** |

### OPTION C — Controlled real payment using actual authorised business transaction

| | |
|---|---|
| **What** | Owner confirms a **real** small authorised transaction OR authorises INV-0586 in Xero then records matching TITAN payment + Owner Execute `payment_create`. |
| **Proves** | Full live payment intersync including Xero payment row, mapping, invoice status transition, optional targeted refresh. |
| **Risks** | **Real Xero payment** (accounting entries); authorising INV-0586 creates journals; Yoco path may move **real money**; rollback is manual. |
| **Real money** | **Possibly yes** (Yoco) |
| **Real Xero payment** | **Yes** |
| **INV-0586 authorise first?** | **Yes** — mandatory for Xero payment API |

---

## 3. Recommendation

**Recommend OPTION B** as the **safest valid Gate 5 proof method** for payment-state intersync **without fabricating a payment**.

**Reason:** INV-0586 is **DRAFT** in both TITAN and Xero; Xero will reject payments until **AUTHORISED**, and authorisation contradicts Gate 4 constraints and creates real accounting exposure. Staging has **no Yoco webhook history** to prove Yoco path live. **INV-0280** already provides a genuine paid invoice with mapped Xero payment and Gate 2 read-only verification — sufficient to prove state separation read-only.

If Owner additionally requires proof of the **TITAN → Xero payment push** write path, that requires a **separate explicit Gate 5C approval** with: (1) authorise a **dedicated test invoice** (not necessarily INV-0586), (2) accept Xero accounting consequences, (3) confirm bank account, (4) define rollback before Execute.

**OPTION A** is acceptable as a **supplement** for workflow/gate testing only — not as sole Gate 5 completion.

---

## 4. Owner decision block

| Field | Value |
|-------|-------|
| **Recommended proof method** | **OPTION B** — read-only observation of existing genuine paid invoice (**INV-0280**), plus reconciliation snapshot review |
| **Reason** | No write, no fabricated payment, no authorisation of test invoice, uses real mapped Xero payment evidence |
| **Real money involved?** | **No** (Option B) |
| **Real Xero payment involved?** | **No** (Option B — observes existing) |
| **Must INV-0586 be authorised first?** | **Yes** for any new Xero payment against INV-0586; **Not required** for Option B |
| **Exact Owner action required** | Review this preflight; reply with chosen option |
| **Exact next approval wording (Option B)** | **`XERO-002 GATE 5B GO — READ-ONLY PAYMENT STATE OBSERVATION`** |
| **Exact next approval wording (Option A supplement)** | **`XERO-002 GATE 5A-SIM GO — WORKFLOW SIMULATION WITHOUT EXECUTE`** |
| **Exact next approval wording (Option C — high risk)** | **`XERO-002 GATE 5C GO — CONTROLLED REAL PAYMENT`** plus written confirmation of: authorise invoice Y/N, amount, rollback owner, bank account |

---

## 5. Rollback plan (if Option C ever approved)

1. Delete Xero payment in Xero (Owner).
2. Void draft or credit authorised invoice in Xero.
3. Delete TITAN payment + `xero_payment_mappings` row.
4. Reset invoice paid fields to pre-proof state.
5. Refund Yoco charge if real payment was taken.
6. Capture audit log export before/after.

---

## 6. Stop — awaiting Owner approval

**Gate 5 payment proof was NOT executed.**

Do not authorise INV-0586, create payments, or reconcile until Owner selects an option and sends the exact approval wording above.
