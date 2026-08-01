# TITAN Phase 1 — Global Organisation Report

**Generated:** 2026-08-01T21:10:00.000Z  
**Branch:** `cursor/titan-owner-operating-model-final`  
**Staging API:** `https://young-guns-os-staging.up.railway.app`  
**Staging Web:** `https://comfortable-determination-staging.up.railway.app`  
**Scope:** Phase 1 only — navigation shell + honest finance HOLD pages. Phase 2 not started.

---

## Executive summary

Phase 1 reorganises the staff product into four grouped sidebar sections (Core, Finance, Operations, Intelligence), moves Settings into a header-triggered workspace, adds finance Receivables/Payables/Cashflow routes with honest empty states (no fake Xero data), and updates RBAC/nav honesty tests. Phase 0 route arithmetic reconciles after adding three finance HOLD routes (**163 = 62 + 46 + 55**).

| Area | Verdict | Notes |
|------|---------|-------|
| Phase 0 reconciliation | **GO** | `235-phase0-route-reconciliation-verify.json` PASS |
| Grouped sidebar | **GO** | `nav-groups.ts` wired in `AppLayout` |
| Settings workspace | **GO** | Header identity link → `/settings/company`; `SettingsNav` compact tabs |
| Finance HOLD pages | **HOLD** | Routes live; backend Xero aggregation deferred to Phase 3 |
| Role nav filtering | **GO** | Owner / Accountant / Dispatcher tests + staging proof @ 236 |
| Build & tests | **GO** | typecheck, 373 API tests, web/shared nav tests, web build |

---

## Phase 0 reconciliation (235)

| Metric | Value |
|--------|------:|
| Staff routes | 138 |
| Mobile routes | 9 |
| Portal routes | 9 |
| Auth routes | 7 |
| **Total inventoried** | **163** |
| GO | 62 |
| HOLD | 46 |
| NO-GO | 55 |

**Root cause resolved:** Seven auth routes (`/auth/*` + `/my/login`) were inventoried but excluded from GO/HOLD/NO-GO table — now classified in Auth routes section.

**Matrix fixes:** Auth section (7 routes), `/developer` + `/developers` staff rows, finance HOLD rows for receivables/payables/cashflow, role + data matrix alignment.

---

## Phase 1 implementation

### Navigation (`packages/shared/src/role-experience.ts`)

- Removed Settings, Integrations, Search, Enterprise modules from main sidebar
- Added Receivables, Bills & Payables, Cashflow nav items (experience-gated; not visible to Dispatcher)
- Procurement remains permission-gated insert after Inventory
- `DISPATCHER_ALLOWED_HREFS` / `ACCOUNTANT_ALLOWED_HREFS` updated

### Grouped sidebar (`apps/web/src/lib/nav-groups.ts` + `AppLayout.tsx`)

- Four groups: Core, Finance, Operations, Intelligence
- Group labels with expand-on-active styling (existing CSS)

### Settings workspace (`apps/web/src/features/settings/SettingsNav.tsx`)

- Compact tabs workspace (Company, Team, Integrations, Security, Platform Health, etc.)
- Entry via header identity link — not sidebar

### Finance HOLD pages

| Route | Component | State |
|-------|-----------|-------|
| `/finance/receivables` | `FinanceReceivablesPage` | Honest Phase 3 coming-soon |
| `/finance/payables` | `FinancePayablesPage` | Honest Phase 3 coming-soon |
| `/finance/cashflow` | `FinanceCashflowPage` | Honest Phase 3 coming-soon |

Shared shell: `FinancePhaseHoldPage` + `FinanceNav` tabs (includes new sections).

### Tests updated

- `packages/shared/src/nav-honesty.test.ts` — Phase 1 sidebar honesty
- `apps/web/src/lib/role-experience-nav-honesty.test.ts` — Owner/Accountant/Dispatcher nav

---

## Verification results

| Check | Result |
|-------|--------|
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS — 373 API + shared/auth/web |
| `pnpm --filter @titan/web run build` | PASS |
| `node diagnostic-output/235-regen-verify.mjs` | PASS — 163 = 62 + 46 + 55 |
| Staging deploy (web only) | See `236-phase1-global-organisation-verify.json` |
| Staging nav screenshots | Owner / Accountant / Dispatcher @ 1440/1280/1024/768/375 |

---

## Deploy

- **Service:** `comfortable-determination` (staging web only)
- **Production:** untouched
- **API:** no deploy (nav changes are web-only)
- **Migrations:** none
- **Xero writes:** none

---

## GO / HOLD / NO-GO (Phase 1 deliverable)

| Deliverable | Verdict |
|-------------|---------|
| Phase 0 matrix reconciliation | **GO** |
| Grouped sidebar wired | **GO** |
| Settings via header | **GO** |
| Finance receivables/payables/cashflow routes | **HOLD** (UI shell only) |
| Role nav visibility (Owner/Accountant/Dispatcher) | **GO** |
| Phase 2 dashboard work | **NO-GO** — intentionally not started |

---

## Evidence

- `diagnostic-output/235-phase0-route-reconciliation-verify.json`
- `diagnostic-output/236-phase1-global-organisation-verify.json`
- `diagnostic-output/phase1-global-org-staging/*.png`
- `TITAN_FINAL_ROUTE_AND_GAP_MATRIX.md` (updated)
- `TITAN_FINAL_ROLE_ACCESS_MATRIX.md` (updated)
- `TITAN_FINAL_DATA_SOURCE_MATRIX.md` (updated)

**Stopped after Phase 1 per instructions — Phase 2 not started.**
