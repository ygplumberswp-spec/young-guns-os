# TITAN Phase 4 — CRM, Customer 360 and Row Actions

**Branch:** `cursor/titan-owner-operating-model-final`  
**Base (Phase 3):** `ec9cfc3`  
**Final SHA:** `d5c36ad`  
**Code SHA:** `bb398e2`  
**Environment:** Staging only — production not touched  
**Generated:** 2026-08-02

## Verdict

**GO** @ `d5c36ad` — authenticated staging verification 234 (0 blockers)

## Summary

Phase 4 delivers CRM list column parity, dedicated row actions (WhatsApp / Email / Edit / More), bulk action bar with review-first Email/WhatsApp and Owner-only typed DELETE, Customer 360 tabbed detail, and safe bulk archive/delete APIs with audit and protection guards.

## Deliverables

| Deliverable | Path |
|---|---|
| Actions & bulk UX report | `TITAN_CRM_ACTIONS_AND_BULK_UX_REPORT.md` |
| Staging verify script | `diagnostic-output/234-crm-actions-bulk-delete-verify.mjs` |
| Staging verify JSON | `diagnostic-output/234-crm-actions-bulk-delete-verify.json` |
| Phase 4 report | `TITAN_PHASE_4_CRM_REPORT.md` |

## Files changed (summary)

### Shared
- `packages/shared/src/contact-actions.ts` — WhatsApp/mailto helpers, money formatting
- `packages/shared/src/crm-bulk.ts` — bulk result types
- `packages/shared/src/crm.ts` — list enrichment fields on `CustomerSummary`

### API
- `apps/api/src/services/crm.service.ts` — list enrichment, `bulkCustomers`
- `apps/api/src/routes/crm.ts` — `POST /crm/customers/bulk`
- `apps/api/src/services/leads.service.ts` — `bulkLeads`
- `apps/api/src/routes/leads.ts` — `POST /leads/bulk`
- `apps/api/src/services/customer-value-classification.service.ts` — extended customer shape

### Web
- `apps/web/src/components/ux/RowActionsCell.tsx` — WA / Email / Edit / More
- `apps/web/src/components/ux/BulkCommunicationsReview.tsx`
- `apps/web/src/components/ux/TypedDeleteDialog.tsx`
- `apps/web/src/features/crm/CustomerList.tsx` — columns + bulk UX
- `apps/web/src/features/crm/Customer360Tabs.tsx` — 12-tab Customer 360
- `apps/web/src/features/leads/LeadListTable.tsx` — columns + bulk UX
- `apps/web/src/pages/crm/CustomerDetailPage.tsx` — Customer 360 integration
- `apps/web/src/lib/crm-api.ts`, `apps/web/src/lib/leads-api.ts` — bulk clients
- `apps/web/src/index.css` — row actions + Customer 360 styles

## Local verification

| Check | Result |
|---|---|
| `@titan/shared` test | PASS (132) |
| `@titan/api` test | PASS (373) |
| `@titan/web` test | PASS (137) |
| API typecheck | PASS |
| Web typecheck | PASS |
| Web build | PASS |

## Staging verification

| Service | Deployment ID | Status |
|---|---|---|
| API (`young-guns-os`) | `0aae8a9f-5754-4c8a-848b-19d5f09c43e1` | SUCCESS |
| Web (`comfortable-determination`) | `17635f39-21e7-42c0-ab7e-a6692d2390b9` | SUCCESS |

Verify script result: **GO** — `diagnostic-output/234-crm-actions-bulk-delete-verify.json`

- 678 customers on staging API
- Bulk endpoint HTTP 200 with per-row results
- Customer + lead list columns and row actions verified @ 1440/768/375
- Customer 360 — 12 tabs verified on live customer
- Screenshots: `diagnostic-output/phase4-crm-staging/`

Run locally:

```bash
node diagnostic-output/234-crm-actions-bulk-delete-verify.mjs
```

## HOLD items (remaining)

1. **Lead estimated value** — no persisted estimate on lead records; column shows `—` until quote/sales linkage is added.
2. **Bulk assign picker** — bulk Assign on leads still routes to assign flow; dedicated multi-assign modal deferred.
3. **Customer next action** — populated when follow-up records exist; otherwise `—`.
4. **Equipment / Documents / Maintenance tabs** — honest empty states; customer-scoped indexes not yet wired.

## Phase 5

Not started — await Owner approval per master directive.
