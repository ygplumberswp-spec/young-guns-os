# TITAN CRM Actions and Bulk UX Report

**Phase:** 4 — CRM, Customer 360 and row actions  
**Branch:** `cursor/titan-owner-operating-model-final`  
**Environment:** Staging only  
**Generated:** 2026-08-02

## Row action design

| Requirement | Implementation | Status |
|---|---|---|
| Dedicated Actions column | `RowActionsCell` — WA, Email, Edit (text), More | GO |
| No floating edit pencil | Removed `✎` icon; Edit is text button | GO |
| Sticky on desktop | `.leads-table__actions-col--wide` sticky right | GO |
| Mobile single Actions menu | `.ux-row-actions--mobile` MoreMenu aggregates all actions | GO |

## Customers list columns

| Column | Source |
|---|---|
| Customer + status beside name | Link + `StatusBadgeDropdown` |
| Contact | phone / email |
| Property / suburb | `primaryAddressDisplay` / `primarySuburb` |
| Type / value | Xero-backed `CUSTOMER_VALUE_CLASSIFICATION_LABELS` |
| Last job | CRM list enrichment (`lastJobNumber`, `lastJobAt`) |
| Outstanding / overdue | classification cents |
| Last activity | `lastActivityAt` or `updatedAt` |
| Next action | `nextAction` (follow-up field when set) |
| Actions | WhatsApp, Email, Edit, More |

## Leads list columns

| Column | Source |
|---|---|
| Lead + status | name + badge dropdown |
| Contact | phone / email |
| Service | `serviceType` |
| Suburb | `suburb` |
| Source / owner | `sourceName` / `assignedUserName` |
| Estimated value | **HOLD —** no persisted estimate on lead row; shows `—` honestly |
| Age | `ageDays` |
| Next action | `nextAction` + due date |
| Actions | WhatsApp, Email, Edit, More |

## Bulk actions

| Action | Customers | Leads | Notes |
|---|---|---|---|
| Assign | Status shortcut (active) | Nav to assign flow | Partial — dedicated assign picker deferred |
| Change status | API bulk `set_status` | API bulk `set_status` | GO |
| Email | Review modal → drafts | Review modal → drafts | Never immediate send |
| WhatsApp | Review modal → drafts | Review modal → drafts | Never immediate send |
| Archive | API bulk `archive` | API bulk `archive` | Default over delete |
| Delete | Owner + typed `DELETE` | Owner + typed `DELETE` | Blocked when protected |
| Clear selection | UI | UI | GO |

## Bulk delete safety (API)

- `POST /api/v1/crm/customers/bulk` and `POST /api/v1/leads/bulk`
- Owner role required for permanent delete
- Typed confirmation `DELETE` required
- Paying/invoiced customers and job-linked records blocked with per-row results
- Audit via existing `emitBusinessEvent` on each affected record

## Customer 360 tabs

Overview, Properties, Jobs, Quotes, Invoices, Payments, Finance, Equipment, Communications, Documents, Maintenance, Activity — hash-navigated tab bar on `/crm/:id`.

Equipment, Documents, Maintenance show honest empty states with module deep-links until customer-scoped asset/document indexes exist.

## Verification

- Script: `diagnostic-output/234-crm-actions-bulk-delete-verify.mjs`
- Output: `diagnostic-output/234-crm-actions-bulk-delete-verify.json`
