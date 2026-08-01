# TITAN Final UX Consolidation Report

**Generated:** 2026-08-01T19:42:14.000Z  
**Branch:** `cursor/titan-final-product-consolidation`  
**Tip SHA:** `4c14050` (`4c14050b225511aef160a78e5accf131d81aae2e`)  
**Code base (pre-report):** `f20524c` (CRM 224 acceptance)  
**Prior consolidation:** `04f3999`  
**Production touched:** NO  
**Migrations 0107–0110 applied:** NO  
**Xero financial writes:** NO  

| Service | URL | Deploy ID | Status |
|---------|-----|-----------|--------|
| Staging Web | https://comfortable-determination-staging.up.railway.app | `313001b5-00ac-4404-84d5-3902d291902a` | SUCCESS |
| Staging API | https://young-guns-os-staging.up.railway.app | `01b48519-924e-4e22-a979-a9484cb335b2` | SUCCESS |
| Web bundle (live) | `index-xo8UM38E.js` | CRM acceptance deploy | — |
| Prior API deploy | — | `3653e7bd-9989-4c1f-903c-7c6b02c4a35c` | superseded |

**Health (2026-08-01):** API `/api/v1/health` → 200 · `/api/v1/health/ready` → 200 (database connected) · Web root → 200

**Evidence pack:** `diagnostic-output/225-final-consolidation-status.json`

---

## Final verdict table

| Area | Verdict | Blocker (if HOLD/NO-GO) | Code change required |
|------|---------|---------------------------|----------------------|
| Dashboard | **HOLD** | Staging Playwright screenshots not captured at 1440/1280/1024/768/375; CSS audit PASS only | No |
| Customers | **GO** | — | No |
| Leads | **GO** | — | No |
| Jobs | **GO** | — | No |
| Scheduling | **HOLD** | CAL-001 gaps: resize, team filter, overlap layout; staging screenshot pack missing | Yes (gaps) |
| Finance / Xero | **GO** | Phase 2 GO per 220; import 93144ea8 completed; 187 PASS | No |
| Cartrack / Fleet Live Map | **HOLD** | Branch `cursor/cartrack-live-map-final` fixes GPS parser + `/fleet/live-map`; staging deploy + authenticated GPS proof for CF172047/CF77263 still required post-deploy | Yes (deploy + GPS proof) |
| Communications | **HOLD** | Unified workspace not implemented; WhatsApp blocked (owner creds); email not fully verified | Yes (workspace) |
| AURA | **GO** | Routes exist; content scoped per directive | No |
| Settings | **HOLD** | `/settings` index missing PageHeader (1 route gap) | Yes (minor) |
| Back-button audit | **HOLD** | 133/134 code-verified; staging click-through not automated for all routes | No (verify only) |
| Mobile | **GO** | CRM 375px PASS (224); `/mobile/schedule` → 200 | No |
| Security | **GO** | RBAC ProtectedRoute on staff routes; tenant isolation PASS in CRM acceptance | No |
| Performance | **GO** | typecheck PASS · API 369 · Web 136 · build PASS | No |

**Overall:** **HOLD** — Owner review required before production. Top blockers: Cartrack GPS/live map proof, dashboard staging screenshots, communications workspace, CAL-001 remaining gaps.

---

## 1. Deployed state confirmation

| Check | Result |
|-------|--------|
| Branch | `cursor/titan-final-product-consolidation` @ `4c14050` |
| CRM acceptance code base | YES (`f20524c` — 224 GO 57/57) |
| Web deploy matches CRM acceptance | YES (`313001b5`) |
| API deploy | `01b48519` (SUCCESS 2026-08-01 20:56 +02:00; supersedes `3653e7bd`) |
| Production untouched | YES |
| Staging health 200 | YES |

**Branch reconciliation (included on consolidation):**

| Source branch | Status |
|---------------|--------|
| `cursor/integration-lock-auto-sync` | Included (base) |
| `cursor/cal-001-scheduling-calendar` | Included (migration 0117) |
| `cursor/xero-payments-hotfix` | Included |
| `cursor/visual-alignment-polish` | Included |
| `cursor/leads-customers-ui-patch` | Absorbed via integration-lock |
| `cursor/ux-hardening-phase1` | NOT merged (obsolete) |

---

## 2. Xero Phase 2 evidence

**Reference:** `220-xero-phase2-final-verify.json` · commit `cb13207` on `cursor/xero-payments-hotfix`

| Check | Result |
|-------|--------|
| Import job `93144ea8` | completed (contacts → invoices → payments → bank_transactions, 3078 bank tx) |
| `187` verify | PASS |
| `cv_auto_recalc_fired` | PASS |
| `cvMetricsRefreshJobId` | `93144ea8-f159-416f-bc48-b3b7b5445f98` |
| Phase 2 GO | yes |
| Payments synced | YES (stage completed) |
| Bank transactions | 3078 pulled |
| Duplicate mappings | none (187 check) |
| Manual sync required | NO (background import completed) |
| Financial writes | NO (read-only import) |

---

## 3. CRM final acceptance

**Reference:** `224-crm-final-staging-acceptance.json` · deploy `313001b5` · **GO 57/57**

| Requirement | Result |
|-------------|--------|
| Bulk actions (customers/leads/jobs) | PASS |
| No unsafe bulk delete | PASS |
| Custom ConfirmDialog (no native alert/confirm) | PASS |
| Archive/delete/cancel flows | PASS |
| Mobile 375px overflow/actions | PASS |
| Audit logs tenant-scoped | PASS |
| Cross-tenant leakage | 0 |
| Row actions visible | PASS |
| Screenshots | 15 viewports in `diagnostic-output/crm-acceptance-screenshots/` |

---

## 4. Dashboard visual verification

**Method:** CSS/code audit + staging bundle fetch (`index-xo8UM38E.js`). Playwright screenshots **NOT RUN** this session.

| Viewport | 4→2→1 grid | No 3+1 | Card gaps | Paired sections | CV single loading |
|----------|------------|--------|-----------|-----------------|-------------------|
| 1440px | PASS (4 col @ min-width 1440px) | PASS | 18px/20px tokens | PASS (2-col grid) | PASS |
| 1280px | PASS (2 col @ 768–1439px) | PASS | PASS | PASS | PASS |
| 1024px | PASS (2 col) | PASS | PASS | PASS | PASS |
| 768px | PASS (2 col) | PASS | PASS | stacks @767px | PASS |
| 375px | PASS (1 col) | PASS | PASS | 1 col | PASS |

**Code refs:** `apps/web/src/styles/layout-grid.css`, `ExecutiveDashboard.tsx`, `CustomerValueMetricsPanel.tsx`.

**Missing evidence:** Authenticated staging screenshots at all five widths.

---

## 5. Scheduling verification

| Check | Result |
|-------|--------|
| `/scheduling` calendar primary | YES |
| Week default | YES |
| Day / week / month views | YES |
| Drag-drop + conflicts | YES |
| Unscheduled tray | YES |
| Back button | YES → `/` |
| `/mobile/schedule` | 200 · day default |
| Migration 0117 | On branch (not applied this session) |

**Known gaps (CAL-001):** resize duration · team filter · duplicate-as-draft pre-fill · overlap lane-packing · tablet swipe · staging screenshots.

---

## 6. Back button route audit

**Generated:** `scripts/generate-route-matrix.mjs` → `diagnostic-output/212-final-ux-route-matrix.json` (134 routes)

| Metric | Count |
|--------|------:|
| Total staff routes | 134 |
| Back visible | 133 |
| Missing back (by design) | 1 (`/` dashboard home) |
| Missing PageHeader | 1 (`/settings` SettingsIndexPage) |

Full matrix below. Staging click-through for all 134 routes not automated.

---

## 7. Cartrack and Fleet Live Map

**Probes:** `217-cartrack-staging-verify.json` · `226-cartrack-live-map-final-verify.json` · code `cartrack.client.ts` · `useFleetLiveMap.ts`

| Check | Result |
|-------|--------|
| CF172047 / CF77263 mapped | 2 (auto_matched per 217/218) |
| Credentials locked | YES (`hasCredentials: true`, connection lock per 211) |
| Root cause (GPS=0) | `/vehicles/status` vehicle_id ≠ mapping external_vehicle_id; parser missed nested/PascalCase lat/lng |
| Fix branch | `cursor/cartrack-live-map-final` @ post-679e3b9 |
| GPS import fix | Registration fallback mapping + `/positions` fallback + fresh-only deduped inserts |
| `/fleet/live-map` route | **ADDED** (web + `GET /api/v1/fleet/live-map`) |
| Live Dispatch console | `/mobile-platform/dispatcher` → shared tracking source |
| 3s visible / 60s hidden poll | PASS (code — `LIVE_POLL_MS=3000`, `HIDDEN_POLL_MS=60000`, inflight guard) |
| Permissions probe | `GET /integrations/cartrack/permissions` (read endpoints only) |
| GPS positions stored (staging) | **Pending post-deploy proof** (217 baseline: 0) |

**Verdict: HOLD** — code fix + live map route implemented; **GO requires staging deploy and authenticated proof that both vehicles have non-zero GPS positions with auto-updating `last_sync_at`.**

---

## 8. Integrations and communications

| Provider | Status | CONNECT ONCE → LOCK → AUTO-SYNC |
|----------|--------|----------------------------------|
| Xero | Connected — Phase 2 GO (220) | Verified |
| Cartrack | Connected — mapped=2; GPS fix on branch 226 | Verified (credentials lock) |
| WhatsApp Business | Blocked — owner credentials | Pattern ready |
| Personal WhatsApp | Unsupported — honest banner | N/A |
| SMTP / Email | Ready to configure | Verified (211) |
| Gmail | Unsupported — roadmap card | N/A |
| M365 | Unsupported — roadmap card | N/A |
| Payments (Yoco) | Incomplete — profile sync only | Partial |

Unified Communications workspace: NOT implemented.

---

## 9. AURA and Company Health

Routes: `/aura`, `/aura/agents`, `/aura/todays-plan`, `/aura/business-rules`, `/mission-control`, `/settings/advanced/platform-health` — all present; staging 200 where probed.

---

## 10. Performance, safety, build

| Check | Result |
|-------|--------|
| `pnpm typecheck` | PASS |
| API tests | 369 pass |
| Web tests | 136 pass |
| Web build | PASS |
| Staging health | 200 |

---

## 11. Back button — app-wide fix (BLOCKER RESOLVED)

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

## 12. Tests / build (local)

Run on consolidation branch @ `4c14050` (2026-08-01T19:42Z): typecheck PASS · API 369 · Web 136 · build PASS · staging health 200.

## 13. Route matrix (134 staff routes)

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


---

## 14. Owner review checklist

1. Staging click-through on dashboard at 1440/1280/1024/768/375
2. Cartrack staging deploy + authenticated GPS proof for CF172047/CF77263 on `/fleet/live-map`
3. Communications unified workspace scope
4. CAL-001 gap-fill (resize, team filter)
5. `/settings` PageHeader gap

**Stop for Owner review.** No production deploy until HOLD items resolved or explicitly waived.
