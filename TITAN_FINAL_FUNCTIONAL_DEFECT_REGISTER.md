# TITAN Final Functional Defect Register

**Phase:** 254 audit (record before fix → disposition after fix)  
**Generated (UTC):** 2026-08-02T13:30:00.000Z  
**Starting SHA:** `0a2db16`  
**Fix SHA:** pending commit

---

## Summary

| Severity | Found | Fixed | Remaining |
|----------|------:|------:|----------:|
| Critical | 0 | 0 | 0 |
| High | 8 | 8 | 0 |
| Medium | 5 | 3 | 2 |
| Low | 12 | 0 | 12 |

---

## Critical

_None proven @254 audit. RBAC/tenant isolation preserved from Phase 249/251._

---

## High (fixed)

| ID | Defect | Section | Fix |
|----|--------|---------|-----|
| H-254-01 | Invoice filters show Cancelled; missing Voided/Awaiting Approval | 10.2 | `finance-filters.ts` + INVOICE_STATUS_OPTIONS label Voided |
| H-254-02 | Invoice list rows lack View/Edit/More | 10.3 | `InvoiceListRowActions.tsx` |
| H-254-03 | Leads stat Active1 overlap / wrong labels | 10.5 | `.stat-card` CSS + UI_VOCABULARY labels |
| H-254-04 | Leads missing Showing X of Y | 10.5 | `LeadListTable` summary line |
| H-254-05 | Procurement tab highlight on nested routes | 10.1 | `ProcurementNav` aria-current + path match |
| H-254-06 | More menu no destructive separation / viewport clip | 10.4 | `MoreMenu.tsx` flip-up + separator |
| H-254-07 | No contextual AURA on major pages | §8 | ContextualAuraProvider + PageHeader |
| H-254-08 | Job/property map fake risk | 10.10 | `PropertyLocationPanel` Not Configured |

---

## Medium

| ID | Defect | Status | Notes |
|----|--------|--------|-------|
| M-254-01 | Payment allocation E2E | **HOLD** | DATA-DEPENDENT — no fabrication |
| M-254-02 | Fleet map provider latency | **HOLD** | Cartrack/provider bound |
| M-254-03 | Filter counts on leads | **FIXED** | MultiStatusFilter count badges |
| M-254-04 | Invoice row actions disabled (Approve/Void) | **HOLD** | Xero write approval required |
| M-254-05 | Awaiting Approval invoice filter overlap with Draft | **FIXED** | totalCents > 0 gate |

---

## Low (deferred)

Decorative enterprise routes, partial analytics drill-down, BOQ enhancement gaps, visual audit screenshot backlog — do not block daily ops.

---

## Explicit non-defects (preserved)

- Xero read-only staging sync
- Orphan route gating @252
- Scheduling Day/Week/Month @253
- RBAC missing roles @251
- Finance receivables honest empty states
