# TITAN Button-to-Outcome Matrix

**Phase:** 254 functional + AURA audit  
**Branch:** `cursor/titan-owner-operating-model-final`  
**Generated (UTC):** 2026-08-02T13:30:00.000Z  
**Staging Web:** https://comfortable-determination-staging.up.railway.app  
**Evidence:** `diagnostic-output/254-titan-full-functional-aura-audit-verify.json`

---

## Summary

| Metric | Count |
|--------|------:|
| Active retained staff routes audited | 111 |
| Controls inventoried | 842 |
| PASS (click-to-outcome) | 798 |
| HOLD (partial / provider-dependent) | 38 |
| FAIL (corrected in Phase 254) | 6 → 0 post-fix |

---

## Section 10 explicit corrections (pre → post)

| ID | Route | Control | Pre | Post | Verdict |
|----|-------|---------|-----|------|---------|
| 10.1 | `/procurement/*` | Procure-to-Pay tab | URL OK; highlight partial on nested PO | Title Case labels; `aria-current`; unique content per tab | **PASS** |
| 10.1 | `/procurement` | Purchase Orders tab | OK | Empty state + PO list | **PASS** |
| 10.1 | `/procurement/suppliers` | Suppliers tab | OK | Supplier workspace | **PASS** |
| 10.1 | `/procurement/price-lists` | Price Lists tab | OK | HOLD panel honest | **PASS** |
| 10.1 | `/procurement/parts-requests` | Parts Requests tab | Redirect gated @252 | Live material requests page restored in nav | **PASS** |
| 10.2 | `/finance/invoices` | Filter tabs | Cancelled visible; missing Voided/Awaiting Approval | All, Draft, Awaiting Approval, Awaiting Payment, Partially Paid, Paid, Overdue, Voided, Archived | **PASS** |
| 10.3 | `/finance/invoices` | Row View/Edit/More | Missing actions column | View + Edit (draft) + More (role-valid) | **PASS** |
| 10.4 | Global | More menus | No destructive separator; no flip | Keyboard nav, flip-up, destructive separator | **PASS** |
| 10.5 | `/leads` | Stat cards | Active1 overlap; wrong labels | All Leads, Open Leads, Overdue Follow-Ups, Converted + Showing X of Y | **PASS** |
| 10.6 | `/scheduling` | Day/Week/Month | Phase 253 GO preserved | Regression re-verified @254 | **PASS** |
| 10.7 | Module nav | Back | Tab/filter loss on procurement | Module roots + history preserved | **PASS** |
| 10.8 | List pages | Loading | Standard QueryLoader | Skeleton/retained content; no infinite spinner | **HOLD** |
| 10.9 | Mobile header | 375px | Overlap risk | Stack actions; hide secondary meta | **PASS** |
| 10.10 | `/jobs/:id` | Property map | Address only | PropertyLocationPanel — Not Configured when no API key | **PASS** |

---

## Active module controls (sample — full inventory in generator)

| Route | Role | Control | Expected outcome | Verdict |
|-------|------|---------|------------------|---------|
| `/` | Owner | Ask AURA | Opens contextual drawer with dashboard chips | **PASS** |
| `/leads` | Owner | Add Lead | Navigate `/leads/new` | **PASS** |
| `/leads` | Owner | Filter pill + count | Filter table; count badge updates | **PASS** |
| `/finance/invoices` | Owner | Overdue filter | Shows overdue + isOverdue rows | **PASS** |
| `/finance/invoices` | Owner | View row action | Navigate invoice detail | **PASS** |
| `/procurement/flow` | Owner | Pipeline stage link | Navigate stage route | **PASS** |
| `/scheduling` | Owner | Month tab | `data-view=month`; month grid | **PASS** |
| `/jobs/:id` | Owner | Open in Google Maps | External maps search (address) | **PASS** |
| `/finance/payments` | Owner | Match payment | HOLD — DATA-DEPENDENT allocation | **HOLD** |

---

## Rules compliance

- No visible control does nothing on active retained routes
- Tabs change URL and content (procurement, finance filters, scheduling views)
- Filters apply server + client matching
- Destructive actions separated in More menus
- Payment allocation remains HOLD until real overlapping paid invoice

**Matrix generator:** Manual audit + Phase 254 verify script  
**Next re-verify:** After staging deploy of Phase 254 SHA
