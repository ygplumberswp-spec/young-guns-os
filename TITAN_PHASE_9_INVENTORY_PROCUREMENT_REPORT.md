# TITAN Phase 9 — Inventory, Suppliers and Procurement

**Branch:** `cursor/titan-owner-operating-model-final`  
**Base (Phase 8):** `bc816cc`  
**Code SHA:** `f380460`  
**Final SHA:** `5b20e30`  
**Environment:** Staging only — production not touched  
**Generated:** 2026-08-02

## Verdict

| Surface | Verdict | Evidence |
|---|---|---|
| **Inventory workspace** | **GO** | `/inventory/overview` — warehouse/van/reserved/used/reorder/supplier/price columns from live API; honest empty (0 products on YGP staging) |
| **Suppliers workspace** | **GO** | `/procurement/suppliers` — contacts, price lists, lead time, last order, comms; categories/bills/docs explicit HOLD |
| **Procure-to-pay pipeline** | **GO** | `/procurement/flow` — 11 stages; 5 LIVE + 5 HOLD + 1 PARTIAL; approve gate before order |
| **Approval gates** | **GO** | PO status transitions enforced in API (`draft→pending_approval→approved→ordered→received`); no skip-to-spend |

**Overall:** **GO** @ `c505ad6` — authenticated staging verification 241 (0 blockers)

## Summary

Phase 9 delivers owner inventory and procurement workspaces with traceable handoffs from real API aggregates. Inventory workspace rows combine stock levels (warehouse/van split), material-line reservations/usage, supplier price links, and purchase-required signals. Suppliers workspace extends list views with price-list counts, lead time, last order, communications, and honest HOLD for categories, bills, and documents. Procure-to-pay pipeline maps need through reconciliation with explicit HOLD on inspect, match, bill, payment approval, and reconciliation stages — no demo POs or fake supplier bills.

## Deliverables

| Deliverable | Path |
|---|---|
| Phase 9 report | `TITAN_PHASE_9_INVENTORY_PROCUREMENT_REPORT.md` |
| Staging verify script | `diagnostic-output/241-inventory-procurement-verify.mjs` |
| Staging verify JSON | `diagnostic-output/241-inventory-procurement-verify.json` |
| Staging screenshots | `diagnostic-output/phase9-inventory-procurement-staging/` |

## Scope delivered

### Inventory workspace (`/inventory/overview`)

| Column | Source | Status |
|---|---|---|
| Warehouse stock | `inventory_stock_levels` × warehouse locations | **GO** |
| Van stock | `inventory_stock_levels` × van locations | **GO** |
| Reserved | `job_material_lines` (requested/approved) | **GO** |
| Used | `job_material_lines` + issue movements | **GO** |
| Low / out of stock | reorder level vs on-hand | **GO** |
| Reorder amount | `max(0, reorderLevel − onHand)` | **GO** |
| Supplier | lowest-cost `supplier_products` link | **GO** |
| Latest price | supplier product or item cost | **GO** |
| Price change | item vs supplier cost delta | **GO** / **HOLD** when no link |
| Purchase required | low/out-of-stock flag | **GO** |
| Unmatched usage | used lines without stock movement | **GO** |

Nav tabs: Workspace, Products, Stock, Movements + Procurement cross-link.

### Suppliers workspace (`/procurement/suppliers`)

| Column | Status |
|---|---|
| Contacts (name, email) | **GO** |
| Categories | **HOLD** — taxonomy not in schema |
| Price lists | **GO** — `supplier_products` count |
| Last orders | **GO** — most recent PO reference/date |
| Bills | **HOLD** — Xero ACCPAY not imported |
| Lead time | **GO** — avg from linked products |
| Preferred | **GO** — derived from completed PO count |
| Documents | **HOLD** — per-supplier vault not wired |
| Communications | **GO** — `supplier_activities` count |

### Procure-to-pay (`/procurement/flow`)

| Stage | Status | Handoff |
|---|---|---|
| Need | **LIVE** | `/inventory/overview` |
| Request | **LIVE** | `/procurement/parts-requests` |
| Compare | **PARTIAL** | `/procurement/price-lists` (HOLD panel) |
| Approve | **LIVE** | `/procurement` (pending_approval POs) |
| Order | **LIVE** | `/procurement` (approved POs) |
| Receive | **LIVE** | PO detail receive form |
| Inspect | **HOLD** | QC workflow not mounted |
| Match | **HOLD** | Xero three-way match |
| Bill | **HOLD** | Finance payables (ACCPAY) |
| Payment approval | **HOLD** | Job payment ledger live; supplier AP partial |
| Reconciliation | **HOLD** | Bank reconciliation partial |

### Price lists (`/procurement/price-lists`)

**HOLD** — supplier price intelligence API exists; owner compare/import UI not fully wired. Honest HOLD panel, no demo catalogue rows.

## API endpoints (new)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/inventory/workspace` | Aggregated inventory workspace rows |
| GET | `/api/v1/procurement/workspace/suppliers` | Supplier workspace rows |
| GET | `/api/v1/procurement/workspace/procure-to-pay` | 11-stage pipeline with counts |

## Files changed (Phase 9)

### New

- `apps/web/src/features/inventory/InventoryHoldPanel.tsx`
- `apps/web/src/pages/inventory/InventoryWorkspacePage.tsx`
- `apps/web/src/pages/procurement/ProcureToPayPage.tsx`
- `apps/web/src/pages/procurement/SupplierPriceListsPage.tsx`
- `diagnostic-output/241-inventory-procurement-verify.mjs`

### Updated

- `packages/shared/src/inventory.ts` — `InventoryWorkspaceRow`
- `packages/shared/src/procurement.ts` — `SupplierWorkspaceRow`, `ProcureToPayPipeline`
- `apps/api/src/services/inventory.service.ts` — `buildInventoryWorkspace`
- `apps/api/src/services/procurement.service.ts` — `listSupplierWorkspace`, `getProcureToPayPipeline`
- `apps/api/src/routes/inventory.ts`, `apps/api/src/routes/procurement.ts`
- `apps/web/src/features/inventory/InventoryNav.tsx`, `ProcurementNav.tsx`
- `apps/web/src/pages/procurement/SupplierListPage.tsx`
- `apps/web/src/lib/inventory-api.ts`, `procurement-api.ts`
- `apps/web/src/routes/owner-pages.tsx`, `App.tsx`, `index.css`

## Local verification

| Check | Result |
|---|---|
| Shared build | PASS |
| API typecheck | PASS |
| Web typecheck | PASS |
| Web build | PASS |

## Staging verification

| Service | Deployment ID | Status |
|---|---|---|
| API (`young-guns-os`) | `f92052c4-cebf-4ec8-9973-59b5426f04a9` | SUCCESS |
| Web (`comfortable-determination`) | `c1725e51-15da-4601-89b4-ba410d326a49` | SUCCESS |

### 241 — Inventory and procurement verification

**GO** — `diagnostic-output/241-inventory-procurement-verify.json`

- Authenticated owner session (237 pattern, route intercept)
- GET `/inventory/workspace` 200, rows array contract verified (0 rows — honest empty)
- GET `/procurement/workspace/suppliers` 200 (0 suppliers)
- GET `/procurement/workspace/procure-to-pay` 200 — 11 stages, approve LIVE
- Inventory nav on 4 routes; procurement nav on 5 routes
- Procure-to-pay pipeline rendered; price-lists HOLD panel rendered
- Screenshots: workspace, pipeline, suppliers @ 1440

## Remaining HOLD items

1. Supplier categories taxonomy
2. Xero ACCPAY bills per supplier (`billCount`)
3. Per-supplier document vault
4. Supplier price list compare/import owner UI (API partial)
5. QC inspect on receipt
6. Three-way PO/receipt/bill match
7. Supplier payment approval and bank reconciliation (Finance partial)

## Phase 10 boundary

Phase 9 complete. Do **not** start Phase 10 from this report.
