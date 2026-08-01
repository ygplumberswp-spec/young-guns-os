# TITAN Final Route and Gap Matrix

**Phase:** 0 — Discovery only (no implementation)  
**Generated (UTC):** 2026-08-01T20:54:07.575Z  
**Branch:** `cursor/titan-owner-operating-model-final` @ `45b41ca`  
**Base:** `cursor/titan-final-product-consolidation` (includes Fleet API @ 8fe0109, MapLibre fix @ 45b41ca)  
**Generator:** `scripts/generate-route-matrix.mjs` + Phase 0 enrichment  
**Staging API:** `https://young-guns-os-staging.up.railway.app`  
**Staging Web:** `https://comfortable-determination-staging.up.railway.app`  
**Young Guns companyId:** `095aef76-fef5-4139-af37-a42f2d7e2faf`

---

## Executive summary

| Metric | Count |
|--------|------:|
| Staff routes (AppLayout) | 133 |
| Mobile routes (/mobile/*) | 9 |
| Customer portal routes (/my/*) | 9 |
| Auth routes | 7 |
| **Total inventoried routes** | **158** |
| Sidebar-linked staff routes | 45 |
| Orphan/hidden staff routes | 88 |
| Missing Back button (excl. design) | 0 |
| Missing PageHeader | 1 |

### GO / HOLD / NO-GO (staff + mobile + portal)

| Verdict | Count | Meaning |
|---------|------:|---------|
| **GO** | 56 | Route exists, staging evidence or DB truth, usable for daily ops (may still have Phase 1–18 enhancement gaps) |
| **HOLD** | 42 | Partial implementation, missing Phase requirements, or re-verification needed |
| **NO-GO** | 53 | Decorative, orphan enterprise, scaffold, or blocked |

---

## Prerequisite worker status (pre-Phase 0)

| Worker | Status | Evidence |
|--------|--------|----------|
| Xero UI consolidation merge | **DONE** | @ 4430edd → cherry-pick 44b2b4d; `228-xero-ui-refresh-verify.json` verdict GO |
| Fleet API deploy reconciliation | **DONE** | @ 8fe0109; `229-fleet-api-deployment-reconciliation.json` verdict GO |
| Fleet map provider fix | **DONE** | @ 45b41ca `fix(fleet): MapLibre tile provider`; no deploy in progress |
| Visual audit | **INCOMPLETE** | `titan-final-visual-audit-run.log` — Playwright missing; no screenshot artifacts |

---

## Sidebar inventory (45 linked items)

From `packages/shared/src/role-experience.ts` → `OWNER_STAFF_NAV_ITEMS`:

| Group | Nav items |
|-------|-----------|
| Core | Dashboard, Search, Customers, Leads, Jobs, Scheduling |
| Finance | Quotes, Invoices, Payments |
| Operations | Inventory, Procurement, Fleet, Live Map, Live Dispatch, Communications, Documents |
| Intelligence | Analytics, Marketing, AURA Team, Automation, Company Health |
| Platform | Integrations, Security, Enterprise modules (Platform Owner), Release Center, SaaS Management, Settings, Team & Access, AURA Executive Chat |

**Gap vs Phase 1.1:** Missing Finance → Receivables, Bills & Payables, Cashflow. BOQ not nested under Quotes. Procurement hidden-by-default not implemented. Settings sub-pages duplicated in main nav partially resolved.

---

## Cross-cutting gaps flagged

| Flag | Count / detail |
|------|----------------|
| Duplicated modules | `/marketing` vs `/marketing-intelligence`; `/sales-intelligence`; `/leads` vs intelligence pages |
| Unfinished routes | 90 orphan enterprise routes not in sidebar |
| Placeholder / foundation copy | Enterprise modules, AI orchestration, asset intelligence |
| False zeroes | Dashboard mitigated (UX-I); payment_mappings=0 may show $0 paid incorrectly |
| Missing Back buttons | 1 by design (`/`); `/settings` redirect lacks PageHeader |
| Touching cards / layout | Visual audit not run — 103 routes with `centredContainer: partial` |
| Web/API route mismatch | **RESOLVED** for `/api/v1/fleet/live-map` @ 229; no other known 404s |
| Phase 3 missing routes | `/finance/receivables`, `/finance/payables`, `/finance/cashflow` — **do not exist** |

---

## Staff route matrix (133 routes)

| Page | Route | Module | Sidebar | Role access | Data source | Back | Header | Primary | Edit | More | Bulk | Loading | Empty | Error | Responsive | Data truth | Verdict | Gap notes |
|------|-------|--------|---------|-------------|-------------|------|--------|---------|------|------|------|---------|-------|-------|------------|------------|---------|-----------|
| Dashboard | `/` | Dashboard | Dashboard (home) | Owner, Admin/Manager, role-filtered staff | Aggregated TITAN + Xero metrics | N | N | Y | partial | Y | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | KPIs truthful post UX-I; action centre incomplete | **HOLD** | missing PageHeader; Phase 2: Owner Action Centre, 4-card Today, Live Ops missing |
| Not Found | `/:rest*` | Enterprise / Orphan | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Staging-verified or DB-backed | **GO** | layout container partial; no primary action pattern; not in sidebar nav |
| Ai Orchestration | `/ai-orchestration` | AURA & Automation | — | Owner (direct URL); nav hidden from most roles | OpenAI + TITAN DB | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; no primary action pattern; not in sidebar nav; enterprise/orphan — decorative |
| Analytics | `/analytics` | Analytics | — | Owner (direct URL); nav hidden from most roles | Aggregated TITAN + Xero metrics | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | layout container partial; no primary action pattern; not in sidebar nav |
| App Builder | `/app-builder` | Enterprise / Orphan | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav; enterprise/orphan — decorative |
| Asset Equipment | `/asset-equipment` | Enterprise / Orphan | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; no primary action pattern; not in sidebar nav; enterprise/orphan — decorative |
| Asset Intelligence | `/asset-intelligence` | Enterprise / Orphan | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav; enterprise/orphan — decorative |
| Aura | `/aura` | AURA & Automation | AURA Executive Chat | Owner, Admin/Manager, role-filtered staff | OpenAI + TITAN DB | Y | partial | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Staging-verified or DB-backed | **GO** | BackButton only, no full PageHeader; no primary action pattern |
| Agent Dashboard | `/aura/agents` | AURA & Automation | AURA Executive Chat | Owner, Admin/Manager, role-filtered staff | OpenAI + TITAN DB | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | — |
| Agent Profile Detail | `/aura/agents/:id` | AURA & Automation | AURA Executive Chat | Owner, Admin/Manager, role-filtered staff | OpenAI + TITAN DB | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | layout container partial |
| Agent Execution List | `/aura/agents/executions` | AURA & Automation | AURA Executive Chat | Owner, Admin/Manager, role-filtered staff | OpenAI + TITAN DB | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | layout container partial; no primary action pattern |
| Agent Profile Create | `/aura/agents/new` | AURA & Automation | AURA Executive Chat | Owner, Admin/Manager, role-filtered staff | OpenAI + TITAN DB | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | layout container partial; no primary action pattern |
| Business Rules | `/aura/business-rules` | AURA & Automation | AURA Executive Chat | Owner, Admin/Manager, role-filtered staff | OpenAI + TITAN DB | Y | partial | Y | partial | Y | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | BackButton only, no full PageHeader; layout container partial |
| Capability Builder | `/aura/capabilities/create` | AURA & Automation | AURA Executive Chat | Owner, Admin/Manager, role-filtered staff | OpenAI + TITAN DB | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | no primary action pattern |
| Todays Plan | `/aura/todays-plan` | AURA & Automation | AURA Executive Chat | Owner, Admin/Manager, role-filtered staff | OpenAI + TITAN DB | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | no primary action pattern |
| Workflow List | `/automation` | AURA & Automation | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Staging-verified or DB-backed | **GO** | layout container partial; not in sidebar nav |
| Automation Studio | `/automation-studio` | AURA & Automation | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav |
| Workflow Detail | `/automation/:id` | AURA & Automation | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav |
| Execution List | `/automation/executions` | AURA & Automation | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; no primary action pattern; not in sidebar nav |
| N8n Orchestration | `/automation/n8n` | AURA & Automation | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; no primary action pattern; not in sidebar nav |
| Workflow Create | `/automation/new` | AURA & Automation | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; no primary action pattern; not in sidebar nav |
| Business Continuity | `/business-continuity` | Enterprise / Orphan | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav |
| Business Evolution | `/business-evolution` | Enterprise / Orphan | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav |
| Communications Hub | `/communications-hub` | Communications | — | Owner (direct URL); nav hidden from most roles | Comms providers (partial) + TITAN DB | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | layout container partial; not in sidebar nav |
| Communications Intelligence | `/communications-intelligence` | Communications | — | Owner (direct URL); nav hidden from most roles | Comms providers (partial) + TITAN DB | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | layout container partial; no primary action pattern; not in sidebar nav |
| Message List | `/communications/messages` | Communications | — | Owner (direct URL); nav hidden from most roles | Comms providers (partial) + TITAN DB | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | layout container partial; not in sidebar nav |
| Message Create | `/communications/messages/new` | Communications | — | Owner (direct URL); nav hidden from most roles | Comms providers (partial) + TITAN DB | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | layout container partial; no primary action pattern; not in sidebar nav |
| Template List | `/communications/templates` | Communications | — | Owner (direct URL); nav hidden from most roles | Comms providers (partial) + TITAN DB | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | layout container partial; not in sidebar nav |
| Template Create | `/communications/templates/new` | Communications | — | Owner (direct URL); nav hidden from most roles | Comms providers (partial) + TITAN DB | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | layout container partial; no primary action pattern; not in sidebar nav |
| Customer List | `/crm` | CRM & Leads | — | Owner (direct URL); nav hidden from most roles | TITAN CRM DB + Xero contact sync | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | CRM GO @ 224; CV classification partial | **GO** | layout container partial; not in sidebar nav |
| Customer Detail | `/crm/:id` | CRM & Leads | — | Owner (direct URL); nav hidden from most roles | TITAN CRM DB + Xero contact sync | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | CRM GO @ 224; CV classification partial | **GO** | layout container partial; not in sidebar nav |
| Customer Create | `/crm/new` | CRM & Leads | — | Owner (direct URL); nav hidden from most roles | TITAN CRM DB + Xero contact sync | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | CRM GO @ 224; CV classification partial | **GO** | layout container partial; no primary action pattern; not in sidebar nav |
| Customer Experience | `/customer-experience` | Enterprise / Orphan | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav |
| Data Migration | `/data-migration` | Enterprise / Orphan | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav; enterprise/orphan — decorative |
| Digital Twin | `/digital-twin` | Enterprise / Orphan | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav; enterprise/orphan — decorative |
| Dispatch Intelligence | `/dispatch-intelligence` | Fleet & Dispatch | — | Owner (direct URL); nav hidden from most roles | Cartrack + TITAN fleet DB | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav |
| Document Ai | `/document-ai` | Enterprise / Orphan | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav; enterprise/orphan — decorative |
| Document List | `/documents` | Documents & COC | — | Owner (direct URL); nav hidden from most roles | TITAN documents store | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Staging-verified or DB-backed | **GO** | layout container partial; not in sidebar nav |
| Document Detail | `/documents/:id` | Documents & COC | — | Owner (direct URL); nav hidden from most roles | TITAN documents store | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Staging-verified or DB-backed | **GO** | layout container partial; not in sidebar nav |
| Category List | `/documents/categories` | Documents & COC | — | Owner (direct URL); nav hidden from most roles | TITAN documents store | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Staging-verified or DB-backed | **GO** | layout container partial; not in sidebar nav |
| Category Create | `/documents/categories/new` | Documents & COC | — | Owner (direct URL); nav hidden from most roles | TITAN documents store | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; no primary action pattern; not in sidebar nav |
| Job Pack List | `/documents/job-packs` | Documents & COC | — | Owner (direct URL); nav hidden from most roles | TITAN documents store | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Staging-verified or DB-backed | **GO** | layout container partial; no primary action pattern; not in sidebar nav |
| Job Pack Detail | `/documents/job-packs/:id` | Documents & COC | — | Owner (direct URL); nav hidden from most roles | TITAN documents store | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; no primary action pattern; not in sidebar nav |
| Document Create | `/documents/new` | Documents & COC | — | Owner (direct URL); nav hidden from most roles | TITAN documents store | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Staging-verified or DB-backed | **GO** | layout container partial; no primary action pattern; not in sidebar nav |
| Drafts | `/drafts` | Enterprise / Orphan | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; no primary action pattern; not in sidebar nav |
| Enterprise Modules | `/enterprise-modules` | Enterprise Modules | — | Platform Owner | TITAN DB / mock or scaffold | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Staging-verified or DB-backed | **GO** | layout container partial; no primary action pattern; not in sidebar nav |
| Evolution | `/evolution` | Enterprise / Orphan | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav; enterprise/orphan — decorative |
| Boq List | `/finance/boq` | Finance | Finance module | Owner, Admin/Manager, role-filtered staff | Xero (read-only staging) + TITAN DB | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Xero sync partial — payment_mappings=0 per 228 | **GO** | no primary action pattern; Phase 3: Receivables/Payables/Cashflow routes missing |
| Boq Detail | `/finance/boq/:id` | Finance | Finance module | Owner, Admin/Manager, role-filtered staff | Xero (read-only staging) + TITAN DB | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Xero sync partial — payment_mappings=0 per 228 | **GO** | no primary action pattern; Phase 3: Receivables/Payables/Cashflow routes missing |
| Boq Create | `/finance/boq/new` | Finance | Finance module | Owner, Admin/Manager, role-filtered staff | Xero (read-only staging) + TITAN DB | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Xero sync partial — payment_mappings=0 per 228 | **GO** | no primary action pattern; Phase 3: Receivables/Payables/Cashflow routes missing |
| Invoice List | `/finance/invoices` | Finance | Finance module | Owner, Admin/Manager, role-filtered staff | Xero (read-only staging) + TITAN DB | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Xero sync partial — payment_mappings=0 per 228 | **GO** | Phase 3: Receivables/Payables/Cashflow routes missing |
| Invoice Detail | `/finance/invoices/:id` | Finance | Finance module | Owner, Admin/Manager, role-filtered staff | Xero (read-only staging) + TITAN DB | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Xero sync partial — payment_mappings=0 per 228 | **GO** | Phase 3: Receivables/Payables/Cashflow routes missing |
| Invoice Create | `/finance/invoices/new` | Finance | Finance module | Owner, Admin/Manager, role-filtered staff | Xero (read-only staging) + TITAN DB | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Xero sync partial — payment_mappings=0 per 228 | **GO** | no primary action pattern; Phase 3: Receivables/Payables/Cashflow routes missing |
| Payment List | `/finance/payments` | Finance | Finance module | Owner, Admin/Manager, role-filtered staff | Xero (read-only staging) + TITAN DB | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Xero sync partial — payment_mappings=0 per 228 | **GO** | no primary action pattern; Phase 3: Receivables/Payables/Cashflow routes missing |
| Payment Detail | `/finance/payments/:id` | Finance | Finance module | Owner, Admin/Manager, role-filtered staff | Xero (read-only staging) + TITAN DB | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Xero sync partial — payment_mappings=0 per 228 | **GO** | no primary action pattern; Phase 3: Receivables/Payables/Cashflow routes missing |
| Payment Create | `/finance/payments/new` | Finance | Finance module | Owner, Admin/Manager, role-filtered staff | Xero (read-only staging) + TITAN DB | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Xero sync partial — payment_mappings=0 per 228 | **GO** | no primary action pattern; Phase 3: Receivables/Payables/Cashflow routes missing |
| Quote List | `/finance/quotes` | Finance | Finance module | Owner, Admin/Manager, role-filtered staff | Xero (read-only staging) + TITAN DB | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Xero sync partial — payment_mappings=0 per 228 | **GO** | no primary action pattern; Phase 3: Receivables/Payables/Cashflow routes missing |
| Quote Detail | `/finance/quotes/:id` | Finance | Finance module | Owner, Admin/Manager, role-filtered staff | Xero (read-only staging) + TITAN DB | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Xero sync partial — payment_mappings=0 per 228 | **GO** | Phase 3: Receivables/Payables/Cashflow routes missing |
| Quote Edit | `/finance/quotes/:id/edit` | Finance | Finance module | Owner, Admin/Manager, role-filtered staff | Xero (read-only staging) + TITAN DB | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Xero sync partial — payment_mappings=0 per 228 | **GO** | no primary action pattern; Phase 3: Receivables/Payables/Cashflow routes missing |
| Quote Create | `/finance/quotes/new` | Finance | Finance module | Owner, Admin/Manager, role-filtered staff | Xero (read-only staging) + TITAN DB | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Xero sync partial — payment_mappings=0 per 228 | **GO** | no primary action pattern; Phase 3: Receivables/Payables/Cashflow routes missing |
| Financial Planning | `/financial-planning` | Enterprise / Orphan | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav |
| Vehicle List | `/fleet` | Fleet & Dispatch | — | Owner (direct URL); nav hidden from most roles | Cartrack + TITAN fleet DB | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Staging-verified or DB-backed | **GO** | layout container partial; not in sidebar nav |
| Fleet Intelligence | `/fleet-intelligence` | Fleet & Dispatch | — | Owner (direct URL); nav hidden from most roles | Cartrack + TITAN fleet DB | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; no primary action pattern; not in sidebar nav |
| Vehicle Detail | `/fleet/:id` | Fleet & Dispatch | — | Owner (direct URL); nav hidden from most roles | Cartrack + TITAN fleet DB | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Staging-verified or DB-backed | **GO** | layout container partial; not in sidebar nav |
| Fleet Live Map | `/fleet/live-map` | Fleet & Dispatch | — | Owner, Manager (read), Dispatcher (read) | Cartrack + TITAN fleet DB | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Live Cartrack GO @ 229 — MapLibre tiles HOLD | **GO** | layout container partial; not in sidebar nav; MapLibre tile rendering unverified post-deploy |
| Vehicle Create | `/fleet/new` | Fleet & Dispatch | — | Owner (direct URL); nav hidden from most roles | Cartrack + TITAN fleet DB | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Staging-verified or DB-backed | **GO** | layout container partial; no primary action pattern; not in sidebar nav |
| Global Search | `/global-search` | Enterprise / Orphan | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav; enterprise/orphan — decorative |
| Go Live | `/go-live` | Enterprise / Orphan | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav; enterprise/orphan — decorative |
| Industry Packs | `/industry-packs` | Enterprise / Orphan | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav; enterprise/orphan — decorative |
| Integrations Dashboard | `/integrations` | Integrations | Integrations | Owner, Admin/Manager, role-filtered staff | Integration connector state | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Staging-verified or DB-backed | **GO** | — |
| Cartrack Settings | `/integrations/cartrack` | Integrations | Integrations | Owner, Admin/Manager, role-filtered staff | Cartrack + TITAN fleet DB | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | layout container partial; no primary action pattern |
| Email Settings | `/integrations/email` | Integrations | Integrations | Owner, Admin/Manager, role-filtered staff | Integration connector state | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | layout container partial; no primary action pattern |
| Sync Job List | `/integrations/sync-jobs` | Integrations | Integrations | Owner, Admin/Manager, role-filtered staff | Integration connector state | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | layout container partial; no primary action pattern |
| Webhook Foundation | `/integrations/webhooks` | Integrations | Integrations | Owner, Admin/Manager, role-filtered staff | Integration connector state | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | layout container partial; no primary action pattern |
| Whatsapp Settings | `/integrations/whatsapp` | Integrations | Integrations | Owner, Admin/Manager, role-filtered staff | Integration connector state | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | layout container partial; no primary action pattern |
| Xero Settings | `/integrations/xero` | Integrations | Integrations | Owner, Admin/Manager, role-filtered staff | Xero (read-only staging) + TITAN DB | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Staging-verified or DB-backed | **GO** | layout container partial; no primary action pattern |
| Yoco Settings | `/integrations/yoco` | Integrations | Integrations | Owner, Admin/Manager, role-filtered staff | Integration connector state | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | layout container partial; no primary action pattern |
| Stock Movements | `/inventory/movements` | Inventory & Procurement | — | Owner (direct URL); nav hidden from most roles | TITAN inventory DB | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; no primary action pattern; not in sidebar nav |
| Product List | `/inventory/products` | Inventory & Procurement | — | Owner (direct URL); nav hidden from most roles | TITAN inventory DB | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Staging-verified or DB-backed | **GO** | layout container partial; not in sidebar nav |
| Product Create | `/inventory/products/new` | Inventory & Procurement | — | Owner (direct URL); nav hidden from most roles | TITAN inventory DB | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; no primary action pattern; not in sidebar nav |
| Stock Overview | `/inventory/stock` | Inventory & Procurement | — | Owner (direct URL); nav hidden from most roles | TITAN inventory DB | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Staging-verified or DB-backed | **GO** | layout container partial; not in sidebar nav |
| It Operations | `/it-operations` | Enterprise / Orphan | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav; enterprise/orphan — decorative |
| Job List | `/jobs` | Jobs & Scheduling | — | Owner (direct URL); nav hidden from most roles | TITAN jobs DB | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Staging-verified or DB-backed | **GO** | layout container partial; not in sidebar nav |
| Job Detail | `/jobs/:id` | Jobs & Scheduling | — | Owner (direct URL); nav hidden from most roles | TITAN jobs DB | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Staging-verified or DB-backed | **GO** | layout container partial; not in sidebar nav |
| Job Create | `/jobs/new` | Jobs & Scheduling | — | Owner (direct URL); nav hidden from most roles | TITAN jobs DB | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Staging-verified or DB-backed | **GO** | layout container partial; no primary action pattern; not in sidebar nav |
| Knowledge Graph | `/knowledge` | Enterprise / Orphan | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav; enterprise/orphan — decorative |
| Launch Center | `/launch-center` | Enterprise / Orphan | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav; enterprise/orphan — decorative |
| Lead List | `/leads` | CRM & Leads | — | Owner (direct URL); nav hidden from most roles | TITAN CRM DB + Xero contact sync | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Staging-verified or DB-backed | **GO** | not in sidebar nav |
| Lead Detail | `/leads/:id` | CRM & Leads | — | Owner (direct URL); nav hidden from most roles | TITAN CRM DB + Xero contact sync | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Staging-verified or DB-backed | **GO** | not in sidebar nav |
| Lead Create | `/leads/new` | CRM & Leads | — | Owner (direct URL); nav hidden from most roles | TITAN CRM DB + Xero contact sync | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Staging-verified or DB-backed | **GO** | no primary action pattern; not in sidebar nav |
| Legal Compliance | `/legal-compliance` | Enterprise / Orphan | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav |
| Marketing Intelligence | `/marketing` | Marketing & Sales | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | not in sidebar nav |
| Marketing Intelligence | `/marketing-intelligence` | Marketing & Sales | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | not in sidebar nav; enterprise/orphan — decorative |
| Mission Control | `/mission-control` | Enterprise / Orphan | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | not in sidebar nav |
| Mobile Platform | `/mobile-platform` | Fleet & Dispatch | Live Dispatch | Technician (+ Owner inspect) | TITAN mobile API (assigned jobs) | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | layout container partial |
| Mobile Dispatcher | `/mobile-platform/dispatcher` | Fleet & Dispatch | Live Dispatch | Technician (+ Owner inspect) | Cartrack + TITAN fleet DB | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Staging-verified or DB-backed | **GO** | layout container partial |
| Notifications | `/notifications` | Enterprise / Orphan | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav |
| Operations | `/operations` | Enterprise / Orphan | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav; enterprise/orphan — decorative |
| Personal Communications Intelligence | `/personal-communications-intelligence` | Enterprise / Orphan | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; no primary action pattern; not in sidebar nav |
| Platform | `/platform` | Platform & Security | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav; enterprise/orphan — decorative |
| Purchase Order List | `/procurement` | Inventory & Procurement | — | Owner (direct URL); nav hidden from most roles | TITAN inventory DB | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Staging-verified or DB-backed | **GO** | layout container partial; not in sidebar nav |
| Parts Requests | `/procurement/parts-requests` | Inventory & Procurement | — | Owner (direct URL); nav hidden from most roles | TITAN inventory DB | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; no primary action pattern; not in sidebar nav |
| Purchase Order Detail | `/procurement/purchase-orders/:id` | Inventory & Procurement | — | Owner (direct URL); nav hidden from most roles | TITAN inventory DB | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; no primary action pattern; not in sidebar nav |
| Purchase Order Create | `/procurement/purchase-orders/new` | Inventory & Procurement | — | Owner (direct URL); nav hidden from most roles | TITAN inventory DB | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; no primary action pattern; not in sidebar nav |
| Supplier List | `/procurement/suppliers` | Inventory & Procurement | — | Owner (direct URL); nav hidden from most roles | TITAN inventory DB | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Staging-verified or DB-backed | **GO** | layout container partial; not in sidebar nav |
| Supplier Detail | `/procurement/suppliers/:id` | Inventory & Procurement | — | Owner (direct URL); nav hidden from most roles | TITAN inventory DB | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav |
| Quality | `/quality` | Enterprise / Orphan | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; no primary action pattern; not in sidebar nav; enterprise/orphan — decorative |
| Recruiting | `/recruiting` | Enterprise / Orphan | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav; enterprise/orphan — decorative |
| Release | `/release` | Enterprise / Orphan | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav |
| Release Center | `/release-center` | Enterprise / Orphan | — | Platform Owner | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav |
| Saas Management | `/saas-management` | Platform & Security | — | Platform Owner | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav |
| Sales Intelligence | `/sales-intelligence` | Marketing & Sales | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | not in sidebar nav; enterprise/orphan — decorative |
| Scheduling | `/scheduling` | Jobs & Scheduling | — | Owner (direct URL); nav hidden from most roles | TITAN jobs DB | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Staging-verified or DB-backed | **GO** | layout container partial; not in sidebar nav; Phase 6: day/week/month calendar not complete |
| Enterprise Security | `/security` | Platform & Security | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | no primary action pattern; not in sidebar nav |
| Service Delivery | `/service-delivery` | Enterprise / Orphan | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav |
| Settings Index | `/settings` | Settings & Admin | Settings | Owner, Admin/Manager, role-filtered staff | TITAN DB / mock or scaffold | Y | N | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | missing PageHeader; layout container partial; no primary action pattern |
| About Settings | `/settings/about` | Settings & Admin | Settings | Owner, Admin/Manager, role-filtered staff | TITAN DB / mock or scaffold | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | layout container partial; no primary action pattern |
| Data Protection Settings | `/settings/advanced/data-protection` | Settings & Admin | Settings | Owner, Admin/Manager, role-filtered staff | TITAN DB / mock or scaffold | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | no primary action pattern |
| Platform Health | `/settings/advanced/platform-health` | Settings & Admin | Settings | Platform Owner | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | — |
| Owner Billing | `/settings/billing` | Settings & Admin | Settings | Owner, Admin/Manager, role-filtered staff | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | layout container partial |
| Cartrack Settings | `/settings/cartrack` | Settings & Admin | Settings | Owner, Admin/Manager, role-filtered staff | Cartrack + TITAN fleet DB | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | layout container partial; no primary action pattern |
| Company Settings | `/settings/company` | Settings & Admin | Settings | Owner, Admin/Manager, role-filtered staff | TITAN DB / mock or scaffold | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Staging-verified or DB-backed | **GO** | layout container partial; no primary action pattern |
| Dashboard Settings | `/settings/dashboard` | Settings & Admin | Settings | Owner, Admin/Manager, role-filtered staff | TITAN DB / mock or scaffold | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | no primary action pattern |
| Documents Records Settings | `/settings/documents-records` | Settings & Admin | Settings | Owner, Admin/Manager, role-filtered staff | TITAN DB / mock or scaffold | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | no primary action pattern |
| Notifications Settings | `/settings/notifications` | Settings & Admin | Settings | Owner, Admin/Manager, role-filtered staff | TITAN DB / mock or scaffold | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | no primary action pattern |
| Portal Settings | `/settings/portal` | Settings & Admin | Settings | Owner, Admin/Manager, role-filtered staff | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | layout container partial |
| Security Settings | `/settings/security` | Settings & Admin | Settings | Owner, Admin/Manager, role-filtered staff | TITAN DB / mock or scaffold | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Partial / unverified | **HOLD** | layout container partial; no primary action pattern |
| Team Settings | `/settings/team` | Settings & Admin | Settings | Owner, Admin/Manager, role-filtered staff | TITAN DB / mock or scaffold | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Staging-verified or DB-backed | **GO** | layout container partial; no primary action pattern |
| Voice Reception | `/voice-reception` | Enterprise / Orphan | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav; enterprise/orphan — decorative |
| Workforce Intelligence | `/workforce-intelligence` | Jobs & Scheduling | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav |
| Business Day Timeline | `/workforce/day-timeline` | Jobs & Scheduling | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | N | N | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; no primary action pattern; not in sidebar nav |
| Manager Workspace | `/workforce/manager` | Jobs & Scheduling | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav |
| Self Service | `/workforce/self-service` | Jobs & Scheduling | — | Owner (direct URL); nav hidden from most roles | TITAN DB / mock or scaffold | Y | Y | Y | partial | n/a | n/a | standard QueryLoader | standard EmptyState | standard ErrorState | verified-css | Scaffold/mock — not operational truth | **NO-GO** | layout container partial; not in sidebar nav |
---

## Mobile routes (9)

| Page | Route | Module | Role | Data source | Verdict | Phase 5 gaps |
|------|-------|--------|------|-------------|---------|--------------|
| Mobile Dashboard | `/mobile` | Mobile Technician | Technician | TITAN mobile API | **GO** | Field execution baseline verified UX-B |
| My Jobs | `/mobile/jobs` | Mobile Technician | Technician | TITAN mobile API | **GO** | Field execution baseline verified UX-B |
| Job Detail | `/mobile/jobs/:jobId` | Mobile Technician | Technician | TITAN mobile API | **GO** | Field execution baseline verified UX-B |
| Navigation | `/mobile/route` | Mobile Technician | Technician | TITAN mobile API | **HOLD** | Map view, schedule calendar, comms depth |
| Parts Used | `/mobile/inventory` | Mobile Technician | Technician | TITAN mobile API | **GO** | Field execution baseline verified UX-B |
| Timesheets | `/mobile/time` | Mobile Technician | Technician | TITAN mobile API | **GO** | Field execution baseline verified UX-B |
| Messages | `/mobile/notifications` | Mobile Technician | Technician | TITAN mobile API | **HOLD** | Map view, schedule calendar, comms depth |
| Schedule | `/mobile/schedule` | Mobile Technician | Technician | TITAN mobile API | **HOLD** | Map view, schedule calendar, comms depth |
| Offline Sync | `/mobile/sync` | Mobile Technician | Technician | TITAN mobile API | **GO** | Field execution baseline verified UX-B |

---

## Customer portal routes (9)

| Page | Route | Module | Role | Verdict | Gaps |
|------|-------|--------|------|---------|------|
| Portal Home | `/my` | Customer Portal | Customer | **GO** | Canonical /my/* path live |
| My Jobs | `/my/jobs` | Customer Portal | Customer | **GO** | Canonical /my/* path live |
| Job Detail | `/my/jobs/:jobId` | Customer Portal | Customer | **HOLD** | ETA/live tracking, pay invoice, docs empty |
| Quotes | `/my/quotes` | Customer Portal | Customer | **GO** | Canonical /my/* path live |
| Finance | `/my/finance` | Customer Portal | Customer | **HOLD** | ETA/live tracking, pay invoice, docs empty |
| Book Job | `/my/appointments` | Customer Portal | Customer | **GO** | Canonical /my/* path live |
| Communications | `/my/communications` | Customer Portal | Customer | **HOLD** | ETA/live tracking, pay invoice, docs empty |
| Documents | `/my/documents` | Customer Portal | Customer | **HOLD** | ETA/live tracking, pay invoice, docs empty |
| Profile | `/my/profile` | Customer Portal | Customer | **GO** | Canonical /my/* path live |

---

## Phase 1–18 gap summary (requirements vs current state)

| Phase | Requirement headline | Current state | Route impact |
|-------|---------------------|---------------|--------------|
| 1 | Final navigation + shared page structure | 45 sidebar items; 90 orphans; inconsistent PageHeader | HOLD — global nav reorg needed |
| 2 | Owner Dashboard command centre | KPIs exist; no Action Centre, 4-card Today, Live Ops | `/` HOLD |
| 3 | Finance Receivables/Payables/Cashflow | Quotes/Invoices/Payments only | **3 routes missing** — NO-GO for daily finance ops |
| 4 | CRM Customer 360 tabs | Customer detail partial | `/crm/:id` HOLD |
| 5 | Job 360 + mobile field | Job detail + mobile UX-B GO baseline | `/jobs/:id`, `/mobile/*` HOLD/GO mix |
| 6 | Calendar scheduling + Live Dispatch | List scheduling; dispatch map GO | `/scheduling` HOLD |
| 7 | Fleet live map + trips/drivers | Live map GO; tabs missing | `/fleet/*` HOLD |
| 8 | Inventory/pricebook | Products/stock/procurement GO | Partial |
| 9 | Unified communications | Messages route HOLD | COM blocked providers |
| 10 | Documents/COC compliance | Documents list GO; COC queue missing | HOLD |
| 11 | Team/timesheets | Day timeline local; payroll support partial | HOLD |
| 12 | Recurring maintenance | Not implemented | NO-GO |
| 13 | AURA morning/evening brief | Chat GO; structured brief missing | HOLD |
| 14 | Analytics drill-down | Page exists; KPI definitions partial | HOLD |
| 15 | Role-specific experiences | RBAC matrix defined; live E2E incomplete | HOLD |
| 16 | Settings consolidation | Fragmented settings routes | HOLD |
| 17 | Quality/security/performance | Tests pass locally @ 225; visual audit failed | HOLD |
| 18 | Visual acceptance | Playwright missing — **not captured** | NO-GO evidence |

---

## Evidence references

- `diagnostic-output/212-final-ux-route-matrix.json` — 133 staff routes
- `diagnostic-output/228-xero-ui-refresh-verify.json` — Xero UI cache invalidation GO
- `diagnostic-output/229-fleet-api-deployment-reconciliation.json` — Fleet live-map API GO
- `diagnostic-output/224-crm-final-staging-acceptance.json` — CRM 57/57 GO
- `diagnostic-output/225-final-consolidation-status.json` — typecheck/tests/build PASS
- `diagnostic-output/titan-final-visual-audit-run.log` — **FAILED** (playwright not installed)

---

**Phase 0 complete — stopped before Phase 1 implementation per instructions.**
