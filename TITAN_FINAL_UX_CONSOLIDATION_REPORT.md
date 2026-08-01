# TITAN Final UX Consolidation Report

Generated: 2026-08-01T18:11:31.007Z
Branch: `cursor/integration-lock-auto-sync`
Staging API: `https://young-guns-os-staging.up.railway.app`
Staging Web: `https://comfortable-determination-staging.up.railway.app`

## 1. Back button — app-wide fix (BLOCKER RESOLVED)

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

| Check | Result |
|-------|--------|
| `pnpm typecheck` | PASS |
| `@titan/web` tests (incl. back-navigation) | PASS |
| `@titan/api` tests (356) | PASS |
| `pnpm build` | PASS |

Back-navigation tests updated: module roots (`/jobs`, `/crm`, `/integrations`) now expect back visible; settings sub-pages fall back to `/settings/company`.

## 5. Remaining blockers

- **Staging Cartrack live proof** — CF172047/CF77263 auto-map count=2 pending post-deploy curl against staging API
- `/settings` route is redirect-only (no visible page) — back N/A
- Dashboard `/` intentionally has no back button

All other **134 staff routes** show back via `shouldShowBackButton` + `PageHeader`/`BackButton` (see matrix).

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
| Job List | `/jobs` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | Y |
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
| Platform Health | `/platform-health` | — | Y | `/` | Y | partial | Y | verified-css | ProtectedRoute | standard | n/a |
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


## 6. WhatsApp / Email support status

| Channel | Status |
|---------|--------|
| WhatsApp Business | Real connection lock + auto incoming sync; outgoing requires approval |
| Personal WhatsApp | Blocked/unsupported — honest banner, never simulated |
| Email (IMAP/SMTP) | Real connection lock + auto incoming; send/delete/forward approval |
| Gmail/M365 OAuth | Roadmap — not faked |

## 7. Cartrack evidence

- Registration normalize: `packages/shared/src/vehicle-registration.ts`
- Auto-map on connect/sync: `apps/api/src/services/integrations.service.ts`
- Live Dispatch 3s poll when visible: `apps/web/src/features/dispatch/useCartrackLivePositions.ts`
