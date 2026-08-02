# TITAN Orphan Route Cleanup Report

**Phase:** 252 — Orphan & Scaffold Route Cleanup  
**Generated (UTC):** 2026-08-02T12:15:00.000Z  
**Branch:** `cursor/titan-owner-operating-model-final`  
**Starting SHA:** `fdc70d3`  
**Staging Web:** `https://comfortable-determination-staging.up.railway.app`  
**Staging API:** `https://young-guns-os-staging.up.railway.app`  
**YGP companyId:** `095aef76-fef5-4139-af37-a42f2d7e2faf`

---

## Executive summary

| Metric | Before | After |
|--------|-------:|------:|
| Inventoried staff routes | 138 | 138 (unchanged — conservative redirect, not delete) |
| Orphan/hidden staff routes | 113 | **61** (52 scaffolds gated) |
| NO-GO routes exposed via deep link | 55 | **3** (`/global-search` retained + 2 alias redirects chain) |
| Sidebar-linked routes | 22 | 22 (no orphan leaks) |

### Disposition counts (52 cleanup rules)

| Disposition | Count | Action |
|-------------|------:|--------|
| **RETAIN_COMPLETE** | 111 | Keep route — GO/HOLD operational or intentional deep links |
| **HIDE_REDIRECT** | 50 | Guard redirects to parent or `/enterprise-modules` |
| **REMOVE** | 2 | Duplicate aliases redirect (`/developers`, `/marketing-intelligence`) |

**Overall orphan cleanup verdict:** **GO** (post-staging verify 252)  
**Finance / Xero / production:** **UNTOUCHED**

---

## Implementation

| Component | Change |
|-----------|--------|
| `packages/shared/src/orphan-route-cleanup.ts` | Authoritative disposition registry + `resolveOrphanRouteCleanup()` |
| `apps/web/src/components/StaffExperienceRoute.tsx` | Orphan guard runs before RBAC direct-URL guard |
| `packages/shared/src/enterprise-modules.ts` | Index links trimmed to 3 RETAIN_COMPLETE orphans |
| `apps/web/src/pages/enterprise/EnterpriseModulesPage.tsx` | Honest copy — scaffolds gated until phase ships |

---

## Classification table (NO-GO + cleanup routes)

| Path | Prior status | Disposition | Redirect target | RBAC note | Rationale |
|------|--------------|-------------|-----------------|-----------|-----------|
| `/developers` | NO-GO | **REMOVE** | `/developer` → `/enterprise-modules` | Owner only | Duplicate of `/developer` |
| `/marketing-intelligence` | NO-GO | **REMOVE** | `/marketing` | Owner only | Duplicate of `/marketing` |
| `/ai-orchestration` | NO-GO | HIDE_REDIRECT | `/enterprise-modules` | Owner only | Decorative AI shell |
| `/app-builder` | NO-GO | HIDE_REDIRECT | `/enterprise-modules` | Owner only | Low-code scaffold |
| `/asset-equipment` | NO-GO | HIDE_REDIRECT | `/enterprise-modules` | Owner only | Mock asset UI |
| `/asset-intelligence` | NO-GO | HIDE_REDIRECT | `/enterprise-modules` | Owner only | Mock asset analytics |
| `/automation-studio` | NO-GO | HIDE_REDIRECT | `/automation` | Owner only | Designer scaffold; list hub GO |
| `/automation/*` | NO-GO | HIDE_REDIRECT | `/automation` | Owner only | Workflow detail/create scaffolds |
| `/business-continuity` | NO-GO | HIDE_REDIRECT | `/enterprise-modules` | Owner only | Enterprise scaffold |
| `/business-evolution` | NO-GO | HIDE_REDIRECT | `/enterprise-modules` | Owner only | Enterprise scaffold |
| `/customer-experience` | NO-GO | HIDE_REDIRECT | `/enterprise-modules` | Owner only | CX scaffold |
| `/data-migration` | NO-GO | HIDE_REDIRECT | `/enterprise-modules` | Owner only | Migration scaffold |
| `/digital-twin` | NO-GO | HIDE_REDIRECT | `/enterprise-modules` | Owner only | Digital twin scaffold |
| `/dispatch-intelligence` | NO-GO | HIDE_REDIRECT | `/mobile-platform/dispatcher` | Dispatcher allowed href retained via redirect | Insights scaffold → live dispatch |
| `/document-ai` | NO-GO | HIDE_REDIRECT | `/enterprise-modules` | Owner only | Document AI scaffold |
| `/documents/categories/new` | NO-GO | HIDE_REDIRECT | `/documents/categories` | Owner only | Create scaffold |
| `/documents/job-packs/*` | NO-GO | HIDE_REDIRECT | `/documents/job-packs` | Owner only | Detail scaffold |
| `/drafts` | NO-GO | HIDE_REDIRECT | `/` | Owner only | Drafts inbox scaffold |
| `/evolution` | NO-GO | HIDE_REDIRECT | `/enterprise-modules` | Owner only | Evolution scaffold |
| `/financial-planning` | NO-GO | HIDE_REDIRECT | `/enterprise-modules` | Owner only | **Not** finance ops — scaffold only |
| `/fleet-intelligence` | NO-GO | HIDE_REDIRECT | `/fleet` | Owner only | Analytics scaffold |
| `/go-live` | NO-GO | HIDE_REDIRECT | `/enterprise-modules` | Owner only | Launch scaffold |
| `/industry-packs` | NO-GO | HIDE_REDIRECT | `/enterprise-modules` | Owner only | Industry pack scaffold |
| `/inventory/movements` | NO-GO | HIDE_REDIRECT | `/inventory/stock` | Owner only | Movements scaffold |
| `/inventory/products/new` | NO-GO | HIDE_REDIRECT | `/inventory/products` | Owner only | Create scaffold |
| `/it-operations` | NO-GO | HIDE_REDIRECT | `/enterprise-modules` | Owner only | IT ops scaffold |
| `/knowledge` | NO-GO | HIDE_REDIRECT | `/enterprise-modules` | Owner only | Knowledge graph scaffold |
| `/launch-center` | NO-GO | HIDE_REDIRECT | `/enterprise-modules` | Owner only | Launch center scaffold |
| `/legal-compliance` | NO-GO | HIDE_REDIRECT | `/enterprise-modules` | Owner only | Compliance scaffold |
| `/notifications` | NO-GO | HIDE_REDIRECT | `/` | Owner only | Notifications hub scaffold |
| `/operations` | NO-GO | HIDE_REDIRECT | `/enterprise-modules` | Owner only | Operations scaffold |
| `/personal-communications-intelligence` | NO-GO | HIDE_REDIRECT | `/communications/messages` | Owner only | Comms intelligence scaffold |
| `/platform` | NO-GO | HIDE_REDIRECT | `/enterprise-modules` | Owner only | Platform admin scaffold |
| `/procurement/parts-requests` | NO-GO | HIDE_REDIRECT | `/procurement` | Owner only | Parts requests scaffold |
| `/procurement/purchase-orders/*` | NO-GO | HIDE_REDIRECT | `/procurement` | Owner only | PO scaffolds |
| `/procurement/suppliers/*` | NO-GO | HIDE_REDIRECT | `/procurement/suppliers` | Owner only | Supplier detail scaffold |
| `/quality` | NO-GO | HIDE_REDIRECT | `/enterprise-modules` | Owner only | Quality scaffold |
| `/recruiting` | NO-GO | HIDE_REDIRECT | `/enterprise-modules` | Owner only | Recruiting scaffold |
| `/release` | NO-GO | HIDE_REDIRECT | `/enterprise-modules` | Owner only | Release scaffold |
| `/release-center` | NO-GO | HIDE_REDIRECT | `/enterprise-modules` | Platform owner | Release center scaffold |
| `/saas-management` | NO-GO | HIDE_REDIRECT | `/enterprise-modules` | Platform owner | SaaS scaffold |
| `/sales-intelligence` | NO-GO | HIDE_REDIRECT | `/enterprise-modules` | Owner only | Sales intelligence scaffold |
| `/security` | NO-GO | HIDE_REDIRECT | `/settings/security` | Owner only | Enterprise security → settings |
| `/service-delivery` | NO-GO | HIDE_REDIRECT | `/enterprise-modules` | Owner only | Service delivery scaffold |
| `/voice-reception` | NO-GO | HIDE_REDIRECT | `/enterprise-modules` | Owner only | Voice scaffold |
| `/developer` | NO-GO | HIDE_REDIRECT | `/enterprise-modules` | Owner only | Developer portal scaffold |
| `/workforce-intelligence` | NO-GO | HIDE_REDIRECT | `/scheduling` | Owner only | Workforce scaffold |
| `/workforce/day-timeline` | NO-GO | HIDE_REDIRECT | `/scheduling` | Owner only | Timeline scaffold |
| `/workforce/manager` | NO-GO | HIDE_REDIRECT | `/scheduling` | Owner only | Manager workspace scaffold |
| `/workforce/self-service` | NO-GO | HIDE_REDIRECT | `/scheduling` | Owner only | Self-service scaffold |

### RETAIN override

| Path | Prior status | Disposition | Rationale |
|------|--------------|-------------|-----------|
| `/global-search` | NO-GO (matrix) | **RETAIN_COMPLETE** | Command palette + API wired; matrix verdict superseded |

---

## RETAIN_COMPLETE orphan samples (operational deep links)

These routes remain outside the sidebar but are intentionally reachable:

| Path | Prior status | Module |
|------|--------------|--------|
| `/crm`, `/crm/:id` | GO | CRM |
| `/fleet/live-map`, `/fleet/:id` | GO | Fleet |
| `/communications-hub` | HOLD | Communications |
| `/aura/*` (except blocked by role) | HOLD | AURA |
| `/settings/*` | HOLD/GO | Settings |
| `/integrations/*` | HOLD/GO | Integrations |
| `/finance/*` | GO/HOLD | Finance (**untouched**) |

Full RETAIN list: all staff routes not in the 52-rule cleanup registry.

---

## Verification

| Check | Script | Verdict |
|-------|--------|---------|
| Deep-link redirects | `diagnostic-output/252-orphan-route-cleanup-verify.mjs` | **GO** |
| RBAC regression (251 subset) | same | **GO** |
| Finance routes unchanged | same | **GO** |
| Local gates | `pnpm typecheck`, `pnpm test`, web + api build | **PASS** |
| Staging smoke | `diagnostic-output/consolidation-staging-smoke.mjs` | **GO** |

---

## Scope confirmation

- **Finance pages:** not modified  
- **Finance-intelligence API:** not modified  
- **Xero integration / sync:** not modified  
- **Production:** not deployed  

---

**Phase 252 complete — stopped after report per instructions.**
