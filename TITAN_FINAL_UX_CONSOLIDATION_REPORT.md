# TITAN Final UX Consolidation Report

Generated: 2026-08-01T20:52:00.000Z
Branch: `cursor/titan-final-product-consolidation`
Base commit: `5f585d3` (integration-lock-auto-sync tip)
Consolidation tip: `f067c2e` (local — staging deploy pending Owner review)
Staging API: `https://young-guns-os-staging.up.railway.app/api/v1/health` → **200**
Staging Web: `https://comfortable-determination-staging.up.railway.app/` → **200** (pre-consolidation deploy)

---

## Stage A — Branch reconciliation (COMPLETE)

| Source branch | Approved commits | Status on consolidation |
|---------------|------------------|-------------------------|
| `cursor/integration-lock-auto-sync` | `5f585d3` base — `4e9d67c`, `e372214`, `1881f69`, `fb2e88e` | **Included** (branch base) |
| `cursor/cal-001-scheduling-calendar` | `d3252dd`, `00f1da0`, migration `0117` | **Included** (`ef9ca26`, `f067c2e`) |
| `cursor/xero-payments-hotfix` | `f03dc24`, `529d27f` (CV marker + payments) | **Included** (`753c84e`, `e8b814b`) |
| `cursor/visual-alignment-polish` | `5a4162f`, `491e397`, `6135383` (`99159f9` absorbed — identical grid rules) | **Included** (`588849a`, `0481f9b`, `f85155f`) |
| `cursor/leads-customers-ui-patch` | `eca227f` inline badges | **Absorbed via `fb2e88e`** — StatusBadgeDropdown + RowActionsCell already present; cherry-pick skipped to preserve quick actions |
| `cursor/ux-hardening-phase1` | — | **NOT merged** (obsolete per Owner directive) |

### Prior worker absorption

| Worker | Scope | Status |
|--------|-------|--------|
| `211b51cb` | Integration lock + Cartrack auto-map | **Absorbed** — commits on base branch |
| `e54c0e6a` | Dashboard 4→2→1 card separation | **Absorbed** — `6135383` / `f85155f` |
| `3e1abe53` | CAL-001 calendar-primary UX | **Absorbed** — `00f1da0` / `f067c2e` |
| `c2db31b1` | 187 probe | Not found as separate commits — diagnostics artifacts preserved on base |

### Post-reconcile fix commits (consolidation-only)

- Remove duplicate `AppContentContainer` import / dead layouts copy
- `RowActionsCell`: drop unsupported `usePortal` prop on `MoreMenu`
- `CustomerListPage`: typed fallback via `classifyCustomerValueFromEvidence`

---

## Stage B — Shared shell (PARTIAL — gap-fill only)

| Requirement | Status |
|-------------|--------|
| `AppContentContainer` wired in `AppLayout` | **Y** |
| `PageHeader` / `BackButton` on staff routes | **133/134** (only `/` excluded by design) |
| Design system spacing tokens (24px sections, 16–20px card gap) | **Y** on dashboard via `6135383` |
| Complete route matrix | **Generated** — 134 routes, see below |
| Sidebar restructure per directive | **NOT verified on staging** — deferred |
| Unified Communications workspace | **NOT in this pass** — deferred |
| WhatsApp/Email connect-once | **Code on base branch** — staging proof pending |

---

## Technical checks (local, consolidation branch)

| Check | Result |
|-------|--------|
| `pnpm typecheck` | **PASS** |
| `@titan/api` tests | **369 pass** |
| `@titan/web` tests | **136 pass** |
| `@titan/web` build | **PASS** |
| Staging API health (`/api/v1/health`) | **200** |
| Staging web root | **200** (current deploy = pre-consolidation SHA) |

---

## Remaining blockers (honest — NOT complete)

1. **Staging deploy of consolidation branch not yet run** — Owner must approve push + `railway up` for web + API
2. **Cartrack live proof** — CF172047/CF77263 mapped=2 needs post-deploy curl against staging API
3. **Fleet Live Map** — all vehicles route may need additional work (not verified)
4. **Unified Communications workspace** — not implemented in consolidation pass
5. **Sidebar restructure** — not verified against Owner directive section 22
6. **Customer 360 / Job file completeness / Finance Sage-like clarity** — gap-fill deferred
7. **Settings index** (`/settings`) — redirect-only, missing PageHeader (1 route in matrix)
8. **Acceptance gates section 22** — require Owner staging click-through after deploy

---

**Root cause:** `shouldShowBackButton()` hid back on all `MODULE_ROOT_PATHS` (list/landing pages like `/jobs`, `/crm`, `/leads`, `/settings`).

**Fix applied:**
- `apps/web/src/lib/back-navigation.ts` — show back on every staff route except `/`; settings sub-pages → `/settings/company`; company profile → `/`
- `apps/web/src/pages/aura/AuraPage.tsx` — shared `BackButton` on Executive Chat
- `apps/web/src/layouts/AppLayout.tsx` — `AppContentContainer` for centred max-width layout
- All list/detail/create pages using `components/ux/PageHeader` inherit back automatically

## 2. Integration lock + auto-sync (prior commits)

See `diagnostic-output/211-integration-lock-auto-sync-verify.json` and commits `4e9d67c`, `d2d2d41`.

## 3. Visual alignment

- `apps/web/src/styles/layout-grid.css` — content max-width, summary grids, responsive breakpoints @ 99159f9 parity
- Wide routes: scheduling, live dispatch, day timeline use `app-content-container--wide`

## 4. Tests / build

Run: `pnpm typecheck`, `pnpm test`, `pnpm build` (results appended after CI run).

## 5. Remaining blockers

See route matrix gaps below. Staging Cartrack CF172047/CF77263 live verification pending post-deploy.

## Route matrix (134 staff routes)

| Page | URL | Sidebar | Back | Back dest | Header | Centred | Primary | Responsive | RBAC | States | Quick actions |
|------|-----|---------|------|-----------|--------|---------|---------|------------|------|--------|---------------|
| Dashboard | `/` | Dashboard (home) | N | `—` | N | Y | Y | verified-css | ProtectedRoute | standard | Y |
| Not Found | `/:rest*` | — | Y | `/` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Ai Orchestration | `/ai-orchestration` | — | Y | `/` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Analytics | `/analytics` | — | Y | `/` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| App Builder | `/app-builder` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Asset Equipment | `/asset-equipment` | — | Y | `/` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Asset Intelligence | `/asset-intelligence` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Aura | `/aura` | AURA Executive Chat | Y | `/` | partial | Y | N | verified-css | ProtectedRoute | standard | n/a |
| Agent Dashboard | `/aura/agents` | AURA Executive Chat | Y | `/` | Y | Y | Y | verified-css | ProtectedRoute | standard | n/a |
| Agent Profile Detail | `/aura/agents/:id` | AURA Executive Chat | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Agent Execution List | `/aura/agents/executions` | AURA Executive Chat | Y | `/` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Agent Profile Create | `/aura/agents/new` | AURA Executive Chat | Y | `/` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Business Rules | `/aura/business-rules` | AURA Executive Chat | Y | `/aura` | partial | partial | Y | verified-css | ProtectedRoute | standard | Y |
| Capability Builder | `/aura/capabilities/create` | AURA Executive Chat | Y | `/` | Y | Y | N | verified-css | ProtectedRoute | standard | n/a |
| Todays Plan | `/aura/todays-plan` | AURA Executive Chat | Y | `/aura` | Y | Y | N | verified-css | ProtectedRoute | standard | n/a |
| Workflow List | `/automation` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Automation Studio | `/automation-studio` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Workflow Detail | `/automation/:id` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Execution List | `/automation/executions` | — | Y | `/` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| N8n Orchestration | `/automation/n8n` | — | Y | `/` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Workflow Create | `/automation/new` | — | Y | `/` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Business Continuity | `/business-continuity` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Business Evolution | `/business-evolution` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Communications Hub | `/communications-hub` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Communications Intelligence | `/communications-intelligence` | — | Y | `/` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Message List | `/communications/messages` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Message Create | `/communications/messages/new` | — | Y | `/` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Template List | `/communications/templates` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Template Create | `/communications/templates/new` | — | Y | `/` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Customer List | `/crm` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Customer Detail | `/crm/:id` | — | Y | `/crm` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Customer Create | `/crm/new` | — | Y | `/crm` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Customer Experience | `/customer-experience` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Data Migration | `/data-migration` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Developer Portal | `/developer` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Developers | `/developers` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Digital Twin | `/digital-twin` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Dispatch Intelligence | `/dispatch-intelligence` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Document Ai | `/document-ai` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Document List | `/documents` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Document Detail | `/documents/:id` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Category List | `/documents/categories` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Category Create | `/documents/categories/new` | — | Y | `/` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Job Pack List | `/documents/job-packs` | — | Y | `/` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Job Pack Detail | `/documents/job-packs/:id` | — | Y | `/` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Document Create | `/documents/new` | — | Y | `/` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Drafts | `/drafts` | — | Y | `/` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Enterprise Modules | `/enterprise-modules` | — | Y | `/` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Evolution | `/evolution` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Boq List | `/finance/boq` | Finance module | Y | `/` | Y | Y | N | verified-css | ProtectedRoute | standard | n/a |
| Boq Detail | `/finance/boq/:id` | Finance module | Y | `/finance/boq` | Y | Y | N | verified-css | ProtectedRoute | standard | n/a |
| Boq Create | `/finance/boq/new` | Finance module | Y | `/finance/boq` | Y | Y | N | verified-css | ProtectedRoute | standard | n/a |
| Invoice List | `/finance/invoices` | Finance module | Y | `/` | Y | Y | Y | verified-css | ProtectedRoute | standard | n/a |
| Invoice Detail | `/finance/invoices/:id` | Finance module | Y | `/finance/invoices` | Y | Y | Y | verified-css | ProtectedRoute | standard | n/a |
| Invoice Create | `/finance/invoices/new` | Finance module | Y | `/finance/invoices` | Y | Y | N | verified-css | ProtectedRoute | standard | n/a |
| Payment List | `/finance/payments` | Finance module | Y | `/` | Y | Y | N | verified-css | ProtectedRoute | standard | n/a |
| Payment Detail | `/finance/payments/:id` | Finance module | Y | `/finance/payments` | Y | Y | N | verified-css | ProtectedRoute | standard | n/a |
| Payment Create | `/finance/payments/new` | Finance module | Y | `/finance/payments` | Y | Y | N | verified-css | ProtectedRoute | standard | n/a |
| Quote List | `/finance/quotes` | Finance module | Y | `/` | Y | Y | N | verified-css | ProtectedRoute | standard | n/a |
| Quote Detail | `/finance/quotes/:id` | Finance module | Y | `/finance/quotes` | Y | Y | Y | verified-css | ProtectedRoute | standard | n/a |
| Quote Edit | `/finance/quotes/:id/edit` | Finance module | Y | `/finance/quotes/:id` | Y | Y | N | verified-css | ProtectedRoute | standard | n/a |
| Quote Create | `/finance/quotes/new` | Finance module | Y | `/finance/quotes` | Y | Y | N | verified-css | ProtectedRoute | standard | n/a |
| Financial Planning | `/financial-planning` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Vehicle List | `/fleet` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Fleet Intelligence | `/fleet-intelligence` | — | Y | `/` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Vehicle Detail | `/fleet/:id` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Vehicle Create | `/fleet/new` | — | Y | `/` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Global Search | `/global-search` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Go Live | `/go-live` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Industry Packs | `/industry-packs` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Integrations Dashboard | `/integrations` | Integrations | Y | `/` | Y | Y | Y | verified-css | ProtectedRoute | standard | n/a |
| Cartrack Settings | `/integrations/cartrack` | Integrations | Y | `/integrations` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Email Settings | `/integrations/email` | Integrations | Y | `/integrations` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Sync Job List | `/integrations/sync-jobs` | Integrations | Y | `/integrations` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Webhook Foundation | `/integrations/webhooks` | Integrations | Y | `/integrations` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Whatsapp Settings | `/integrations/whatsapp` | Integrations | Y | `/integrations` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Xero Settings | `/integrations/xero` | Integrations | Y | `/integrations` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Yoco Settings | `/integrations/yoco` | Integrations | Y | `/integrations` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Stock Movements | `/inventory/movements` | — | Y | `/` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Product List | `/inventory/products` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Product Create | `/inventory/products/new` | — | Y | `/` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Stock Overview | `/inventory/stock` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| It Operations | `/it-operations` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Job List | `/jobs` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Job Detail | `/jobs/:id` | — | Y | `/jobs` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Job Create | `/jobs/new` | — | Y | `/jobs` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Knowledge Graph | `/knowledge` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Launch Center | `/launch-center` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Lead List | `/leads` | — | Y | `/` | Y | Y | Y | verified-css | ProtectedRoute | standard | n/a |
| Lead Detail | `/leads/:id` | — | Y | `/leads` | Y | Y | Y | verified-css | ProtectedRoute | standard | n/a |
| Lead Create | `/leads/new` | — | Y | `/leads` | Y | Y | N | verified-css | ProtectedRoute | standard | n/a |
| Legal Compliance | `/legal-compliance` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Marketing Intelligence | `/marketing` | — | Y | `/` | Y | Y | Y | verified-css | ProtectedRoute | standard | n/a |
| Marketing Intelligence | `/marketing-intelligence` | — | Y | `/` | Y | Y | Y | verified-css | ProtectedRoute | standard | n/a |
| Mission Control | `/mission-control` | — | Y | `/` | Y | Y | Y | verified-css | ProtectedRoute | standard | n/a |
| Mobile Platform | `/mobile-platform` | Live Dispatch | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Mobile Dispatcher | `/mobile-platform/dispatcher` | Live Dispatch | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Notifications | `/notifications` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Operations | `/operations` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Personal Communications Intelligence | `/personal-communications-intelligence` | — | Y | `/` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Platform | `/platform` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Purchase Order List | `/procurement` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Parts Requests | `/procurement/parts-requests` | — | Y | `/` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Purchase Order Detail | `/procurement/purchase-orders/:id` | — | Y | `/` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Purchase Order Create | `/procurement/purchase-orders/new` | — | Y | `/` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Supplier List | `/procurement/suppliers` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Supplier Detail | `/procurement/suppliers/:id` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Quality | `/quality` | — | Y | `/` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Recruiting | `/recruiting` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Release | `/release` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Release Center | `/release-center` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Saas Management | `/saas-management` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Sales Intelligence | `/sales-intelligence` | — | Y | `/` | Y | Y | Y | verified-css | ProtectedRoute | standard | n/a |
| Scheduling | `/scheduling` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Enterprise Security | `/security` | — | Y | `/` | Y | Y | N | verified-css | ProtectedRoute | standard | n/a |
| Service Delivery | `/service-delivery` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Settings Index | `/settings` | Settings | Y | `/` | N | partial | N | verified-css | ProtectedRoute | standard | n/a |
| About Settings | `/settings/about` | Settings | Y | `/settings/company` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Data Protection Settings | `/settings/advanced/data-protection` | Settings | Y | `/settings/company` | Y | Y | N | verified-css | ProtectedRoute | standard | n/a |
| Platform Health | `/settings/advanced/platform-health` | Settings | Y | `/settings/company` | Y | Y | Y | verified-css | ProtectedRoute | standard | n/a |
| Owner Billing | `/settings/billing` | Settings | Y | `/settings/company` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Cartrack Settings | `/settings/cartrack` | Settings | Y | `/settings/company` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Company Settings | `/settings/company` | Settings | Y | `/` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Dashboard Settings | `/settings/dashboard` | Settings | Y | `/settings/company` | Y | Y | N | verified-css | ProtectedRoute | standard | n/a |
| Documents Records Settings | `/settings/documents-records` | Settings | Y | `/settings/company` | Y | Y | N | verified-css | ProtectedRoute | standard | n/a |
| Notifications Settings | `/settings/notifications` | Settings | Y | `/settings/company` | Y | Y | N | verified-css | ProtectedRoute | standard | n/a |
| Portal Settings | `/settings/portal` | Settings | Y | `/settings/company` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Security Settings | `/settings/security` | Settings | Y | `/settings/company` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Team Settings | `/settings/team` | Settings | Y | `/settings/company` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Voice Reception | `/voice-reception` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Workforce Intelligence | `/workforce-intelligence` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Business Day Timeline | `/workforce/day-timeline` | — | Y | `/scheduling` | Y | partial | N | verified-css | ProtectedRoute | standard | n/a |
| Manager Workspace | `/workforce/manager` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
| Self Service | `/workforce/self-service` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |

### Back button gaps
- Missing back (should be Y): **1**
- Missing PageHeader/BackButton in component: **1**
- `/settings` → apps/web/src/pages/settings/SettingsIndexPage.tsx


## 6. Customers, Leads and Jobs — Edit, Delete and Quick Actions Verification

**Branch:** `cursor/integration-lock-auto-sync` · **Commit:** `aae3327`  
**Staging:** https://comfortable-determination-staging.up.railway.app  
**Evidence:** `diagnostic-output/214-owner-actions-staging-verify.json` (22/22 GO)

### Implementation summary

| Area | Status | Notes |
|------|--------|-------|
| Actions column (Edit ✎ + More ⋮) | **Working** | `RowActionsCell` on Customers, Leads, Jobs — always visible, not hover-only |
| Status badges + row tint | **Working** | `StatusBadgeDropdown` + `StatusRowAccent` via `packages/shared/src/crm-list-ui.ts` |
| Bulk actions | **Working** | Checkboxes + `BulkActionBar` on all three lists |
| Customer Edit + Archive/Delete | **Working** | Edit opens `#edit` form; paying/invoiced → archive only (400 blocked delete) |
| Lead Accept/Pending/Decline + Delete | **Working** | Status dropdown + row menu; delete blocked when converted/linked |
| Job Edit + Cancel/Archive | **Working** | Full row menu; empty draft delete owner-only; linked job → cancel (400) |
| Saving indicator | **Working** | Saving… / Saved / Failed inline via `InlineSaveIndicator` |
| Back button | **Working** | Visible on all list + detail pages verified |

### Staging verification (real records, disposable Owner tenant)

| Page | Result | Screenshot |
|------|--------|------------|
| `/crm` (Customers) | PASS — Actions column, Edit, More, status badge | `diagnostic-output/owner-actions-screenshots/customers_list-actions.png` |
| `/crm/:id#edit` | PASS — Edit form opens and saves | API: `customer_edit_save` |
| `/leads` | PASS — Actions, status tint (Declined=red), bulk bar | `diagnostic-output/owner-actions-screenshots/leads_list-actions.png` |
| `/leads/:id#edit` | PASS — Lead edit panel opens | Playwright: `lead_detail_edit_opens` |
| `/jobs` | PASS — Actions, status dropdown, bulk assign/schedule | `diagnostic-output/owner-actions-screenshots/jobs_list-actions.png` |
| `/jobs/:id#edit` | PASS — Job edit form opens and saves | API: `job_edit_save` |

### API gates verified

- `DELETE /crm/customers/:id` — blocked 400 when customer has linked jobs; owner-only
- `DELETE /leads/:id` — eligible leads deleted; converted/linked blocked
- `PATCH` status changes emit audit events (`customer.status_changed`, `lead.status_changed`)

### Files changed (key)

- `apps/web/src/components/ux/RowActionsCell.tsx`, `StatusBadgeDropdown.tsx`, `StatusRowAccent.tsx`
- `apps/web/src/features/crm/CustomerList.tsx`, `features/leads/LeadListTable.tsx`, `features/jobs/JobList.tsx`
- `packages/shared/src/crm-list-ui.ts`
- `apps/api/src/routes/crm.ts`, `leads.ts`, `jobs.ts` — DELETE endpoints
- `packages/db/scripts/staging-owner-actions-verify.mjs`

## 7. WhatsApp / Email support status

| Channel | Status |
|---------|--------|
| WhatsApp Business | Real connection lock + auto incoming sync; outgoing requires approval |
| Personal WhatsApp | Blocked/unsupported — honest banner, never simulated |
| Email (IMAP/SMTP) | Real connection lock + auto incoming; send/delete/forward approval |
| Gmail/M365 OAuth | Roadmap — not faked |

## 8. Cartrack evidence

- Registration normalize: `packages/shared/src/vehicle-registration.ts`
- Auto-map on connect/sync: `apps/api/src/services/integrations.service.ts`
- Live Dispatch 3s poll when visible: `apps/web/src/features/dispatch/useCartrackLivePositions.ts`
