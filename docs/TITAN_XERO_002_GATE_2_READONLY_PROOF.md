# TITAN XERO-002 — Gate 2 Read-Only Live Proof

**Status:** PARTIAL — org live-read verified · full contact/invoice/attachment proof blocked on staging API deploy  
**Executed (UTC):** 2026-08-06  
**Task branch:** `cursor/titan-xero-002-gate2-readonly-proof-998f`  
**Canonical HEAD:** `b4e991cb0c064e4abdbe7b30429128a3280893f9`  
**Evidence:** `diagnostic-output/xero-002-gate2-readonly-proof.json`

---

## A. Precheck

| # | Item | Result |
|---|------|--------|
| 1 | pwd | `/workspace/.worktrees/titan-recovery` |
| 2 | Branch | `cursor/titan-v1-integration` |
| 3 | HEAD | `b4e991cb0c064e4abdbe7b30429128a3280893f9` |
| 4 | git status | Diagnostic churn only — protected untracked preserved |
| 5 | Staging DB | `cpkuwtaipjxeipvbssvn` (fingerprint `9658e88c5789`) |
| 6 | Xero connection | **Connected** |
| 7 | Organisation | **Young Guns Plumbing** |
| 8 | Granted scopes | **10** (incl. `accounting.attachments.read`) — values not printed |
| 9 | Webhook | Enabled on staging API; signing key not exposed |
| 10 | Counts | Customers mapped 682 · Invoices 587 · Attachments metadata 0 |
| 11 | Protected untracked | Preserved — not cleaned |

---

## B. Selected records (masked)

| Field | Masked evidence |
|-------|-----------------|
| Classification | **confirmed_linked** (`sync_status = synced`) |
| TITAN customer | `5834ee96…` |
| Xero ContactID | `3307015e…` |
| TITAN invoice | `a58f98a7…` |
| Xero InvoiceID | `dcccdb37…` |
| Invoice number | `INV-0280` |

---

## C. Contact read proof

| Check | Result |
|-------|--------|
| Live Xero GET /Contacts/{id} | **Pending** — Gate 2 API route not yet on staging deployment |
| Mapping pre-check | **Pass** — confirmed linked mapping exists |
| Provider write | **None** |

---

## D. Invoice read proof

| Check | Result |
|-------|--------|
| Live Xero GET /Invoices/{id} | **Pending** — staging API deploy required |
| Mapping pre-check | **Pass** — verified Xero InvoiceID mapping |
| Paid vs reconciled | Distinct states preserved in service design |

---

## E. Attachment metadata proof

| Check | Result |
|-------|--------|
| Live Xero GET …/Attachments | **Pending** — staging API deploy required |
| Historical scope failures | Resolved — `accounting.attachments.read` granted 2026-08-06 |
| Gate 1 reconnect | **Not required** unless attachment list returns insufficient scope after deploy |

---

## F. Before / after counts

| Metric | Before | After | Δ |
|--------|-------:|------:|---|
| Contact mappings | 682 | 682 | 0 |
| Invoice mappings | 585 | 585 | 0 |
| Invoices | 587 | 587 | 0 |
| Payments | 512 | 512 | 0 |
| Attachment metadata | 0 | 0 | 0 |
| Webhook events | 0 | 0 | 0 |
| Targeted refresh jobs | 0 | 0 | 0 |
| Write approvals | 0 | 0 | 0 |

---

## G. Live evidence captured

| Proof | Result |
|-------|--------|
| Staging API health | **200** |
| Staging Web health | **200** |
| **POST /integrations/xero/test** (live Xero org read) | **200 — Young Guns Plumbing** |
| POST /integrations/xero/gate2-readonly-proof | **404** — route not on current staging deployment |

Implementation is on canonical (`b4e991c`). **Owner action:** redeploy staging API from canonical, then re-run:

```bash
node diagnostic-output/xero-002-gate2-readonly-proof.mjs
```

---

## H. Confirmations

| Confirmation | Status |
|--------------|--------|
| No Xero write | ✅ |
| No contact created/updated | ✅ |
| No invoice created/updated | ✅ |
| No payment created | ✅ |
| No attachment content downloaded | ✅ |
| No secret leakage | ✅ |
| Production untouched | ✅ |

---

## I. Next gate

**GATE 3 — One controlled DRAFT quote** — requires separate explicit Owner approval. **Do not execute automatically.**

**Immediate next action:** Redeploy staging API, re-run Gate 2 harness for full contact/invoice/attachment proof.

---

**STOP FOR OWNER APPROVAL**
