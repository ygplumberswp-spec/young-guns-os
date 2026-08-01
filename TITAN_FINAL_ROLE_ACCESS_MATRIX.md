# TITAN Final Role Access Matrix

**Phase:** 0 — Discovery only (no implementation)  
**Generated (UTC):** 2026-08-01T21:00:00.000Z  
**Branch:** `cursor/titan-owner-operating-model-final` @ `45b41ca`  
**Sources:** `packages/auth/src/rbac-matrix.ts`, `packages/shared/src/role-experience.ts`, `TITAN_ROLE_PERMISSION_MATRIX.md`, `apps/api/src/lib/role-forbidden-api-action.test.ts`

---

## Role mapping (Owner directive → canonical TITAN roles)

| Owner directive role | Canonical TITAN role | Experience key | Notes |
|---------------------|---------------------|----------------|-------|
| **Owner** | Company Owner (+ Platform Owner for SaaS) | `company_owner` / `platform_owner` | Only unrestricted company role; full finance, fleet, AURA, integrations |
| **Admin** | Manager | `manager` | Operations + approved finance read; no Owner-only fleet/target panels (FRZ-004 gap) |
| **Office Staff** | Dispatcher + Accountant subset | `dispatcher` / `accountant` | Dispatch/scheduling/comms OR finance-focused nav; not both full sets |
| **Technician** | Technician | `technician` | `/mobile/*` only; assigned jobs; finance denied (POR-005/006 staging verified) |
| **Customer** | Client | `client` | `/my/*` canonical; `/portal/*` redirect alias |

**Legacy aliases (deprecated):** Owner→Company Owner, Admin→Manager, Member (manual only, ambiguous)

---

## Domain access summary

Legend: **A** = read/write (within permissions), **R** = read-only, **—** = forbidden, **O** = Owner-only executive

| Domain / module | Owner | Admin (Manager) | Office Staff (Dispatcher) | Office Staff (Accountant) | Technician | Customer |
|-----------------|:-----:|:---------------:|:-------------------------:|:-------------------------:|:----------:|:--------:|
| Dashboard & command centre | O/A | R | R | R | — | — |
| Global search | A | A | R | R | — | — |
| Customers / CRM | A | A | R | R | — | Own only |
| Leads | A | A | R | — | — | — |
| Jobs (all company) | A | A | A | R | Assigned | Own |
| Scheduling / calendar | A | A | A | — | Assigned view | — |
| Live Dispatch | O/A | R | A | — | — | — |
| Fleet / live map | O | R | R | — | — | — |
| Finance — Quotes | A | R | R | A | — | Own quotes |
| Finance — Invoices | A | R | — | A | — | Own invoices |
| Finance — Payments | A | R | — | A | — | Own payments |
| Finance — Receivables *(Phase 3)* | O | R | — | A | — | — |
| Finance — Payables *(Phase 3)* | O | R | — | A | — | — |
| Finance — Cashflow *(Phase 3)* | O | R | — | A | — | — |
| Finance — margins / profitability | O | — | — | — | — | — |
| Inventory / procurement | A | A | R | R | Materials only | — |
| Documents / COC | A | A | R | R | Job-scoped | Own docs |
| Communications | A | A | R | — | Job messages | Own threads |
| Marketing / campaigns | A | R | — | — | — | — |
| Analytics / reporting | A | R | — | R | — | — |
| AURA Executive Chat | A | R | — | R | — | — |
| AURA Team / agents | A | R | — | — | — | — |
| Automation / n8n | A | R | — | — | — | — |
| Integrations / secrets | A | — | — | — | — | — |
| Security / platform health | A/O | — | — | — | — | — |
| Settings / team | A | R | — | — | — | Profile only |
| SaaS / Release Center | Platform Owner | — | — | — | — | — |
| Enterprise modules index | Platform Owner | — | — | — | — | — |
| Mobile field execution | Inspect | — | — | — | A | — |
| Customer portal | Inspect | — | — | — | — | A |

---

## Nav visibility by role (sidebar routes)

### Company Owner / Platform Owner

Full `OWNER_STAFF_NAV_ITEMS` (45 items) subject to permission packs. Additional direct-URL access to 90 orphan enterprise routes (Platform Owner sees Enterprise modules index).

### Manager (Admin)

Same business nav as Owner minus:
- Platform Owner-only: `/enterprise-modules`, `/release-center`, `/saas-management`, `/settings/advanced/platform-health`
- AURA Executive Chat restricted to read where configured
- Owner-only fleet/target panels not fully UI-restricted (**FRZ-004** — known gap)

### Dispatcher (Office Staff — operations)

Allowed hrefs per `DISPATCHER_ALLOWED_HREFS`:
`/`, `/crm`, `/leads`, `/jobs`, `/scheduling`, `/finance/quotes`, `/finance/invoices`, `/finance/payments`, `/communications/messages`, `/documents`, `/fleet/live-map`, `/mobile-platform/dispatcher`, `/dispatch-intelligence`, `/settings/team`

**Blocked:** Integrations, Security, Marketing, AURA owner chat, Analytics (unless permission override), Inventory admin, Settings company

### Accountant (Office Staff — finance)

Allowed hrefs per `ACCOUNTANT_ALLOWED_HREFS`:
`/`, `/crm`, `/finance/quotes`, `/finance/invoices`, `/finance/payments`, `/documents`, `/integrations`, `/analytics`

**Blocked:** Jobs write, Scheduling, Fleet, Live Dispatch, Leads, Marketing, AURA

### Technician

`TECHNICIAN_NAV_ITEMS` only — redirects to `/mobile`:
- `/mobile` (Today)
- `/mobile/jobs`
- `/mobile/route`
- `/mobile/inventory`
- `/mobile/time`
- `/mobile/notifications`
- `/mobile/sync`

**API enforcement:** Assigned jobs only; finance endpoints return 403 (Sprint 028 matrix verified). Cannot see company-wide finance, margins, other techs' data, integration secrets.

### Customer (Client)

`CLIENT_PORTAL_NAV_ITEMS` on `/my/*`:
- Home, Book Job, My Jobs, Quotes, Finance, Appointments, Communications, Documents, Profile (+ loyalty/feedback/assets/knowledge routes exist but scope beyond minimum)

**Blocked:** All staff routes, fleet-wide tracking, internal notes, AURA, analytics

---

## Route-level access matrix (primary operational routes)

| Route | Owner | Admin | Office (Dispatch) | Office (Finance) | Technician | Customer |
|-------|:-----:|:-----:|:-----------------:|:----------------:|:----------:|:--------:|
| `/` | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| `/crm`, `/crm/:id` | ✓ | ✓ | ✓ read | ✓ read | ✗ | ✗ |
| `/leads` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `/jobs`, `/jobs/:id` | ✓ | ✓ | ✓ | read | mobile only | ✗ |
| `/scheduling` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `/finance/quotes` | ✓ | read | read | ✓ | ✗ | ✗ |
| `/finance/invoices` | ✓ | read | read | ✓ | ✗ | `/my/finance` |
| `/finance/payments` | ✓ | read | read | ✓ | ✗ | ✗ |
| `/finance/receivables` *(Phase 1 route, Phase 3 backend)* | ✓ | read | ✗ | ✓ | ✗ | ✗ |
| `/finance/payables` *(Phase 1 route, Phase 3 backend)* | ✓ | read | ✗ | ✓ | ✗ | ✗ |
| `/finance/cashflow` *(Phase 1 route, Phase 3 backend)* | ✓ | read | ✗ | ✓ | ✗ | ✗ |
| `/fleet/live-map` | ✓ | read | read | ✗ | ✗ | ✗ |
| `/mobile-platform/dispatcher` | ✓ | read | ✓ | ✗ | ✗ | ✗ |
| `/inventory/*`, `/procurement` | ✓ | ✓ | read | read | materials | ✗ |
| `/communications/messages` | ✓ | ✓ | ✓ | ✗ | limited | ✗ |
| `/documents` | ✓ | ✓ | read | read | job-scoped | `/my/documents` |
| `/analytics` | ✓ | read | ✗ | ✓ | ✗ | ✗ |
| `/marketing` | ✓ | read | ✗ | ✗ | ✗ | ✗ |
| `/aura` | ✓ | read | ✗ | read | ✗ | ✗ |
| `/integrations` | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ |
| `/settings/company` | ✓ | read | ✗ | ✗ | ✗ | ✗ |
| `/settings/team` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `/mobile/*` | inspect | ✗ | ✗ | ✗ | ✓ | ✗ |
| `/my/*` | inspect | ✗ | ✗ | ✗ | ✗ | ✓ |

---

## API enforcement status

| Check | Status | Evidence |
|-------|--------|----------|
| `requirePermission` middleware | Implemented | API route modules |
| Forbidden-action API matrix | **DONE** Sprint 028 | `role-forbidden-api-action.test.ts` |
| Cross-tenant denial | **DONE** Sprint 028 | `cross-tenant-denial-matrix.test.ts` |
| Direct URL redirect contract | **DONE** | `role-forbidden-direct-url.test.ts` |
| Live cross-role browser E2E | **OPEN** | Matrix defined; staging per-role click-path incomplete |
| Migration `0094` on all envs | **PARTIAL** | PLT-003 — staging may lag |
| MFA at login | **CLOSED** | PLT-008 Sprint 001/005 |

---

## Phase 1–18 role gaps (requirements vs current)

| Phase | Role requirement | Gap |
|-------|-----------------|-----|
| 1 | Consistent nav per role; no Settings duplication | **Phase 1 DONE** — grouped sidebar; Settings via header workspace; role-filtered nav tests pass |
| 3 | Owner-only receivables/margins; Admin finance without Owner-only | Receivables routes live (HOLD empty); margin panels may leak (FRZ-004) |
| 5 | Technician minimum payment visibility | Partial — job payment strip exists; deposit rules not complete |
| 10 | Job payment ledger role visibility | Payment ledger model incomplete; technician sees minimum only |
| 15 | Same app, correct experience after login | Experience routing exists; live E2E per role not proven |
| 16 | Integration secrets never in UI for non-Owner | Enforced in API; UI audit incomplete |

---

## Verification checklist (per Phase 15 acceptance)

- [ ] UI visibility matches matrix for all 6 roles
- [ ] Client route guard blocks staff routes
- [ ] API returns 403/404 (not 500) for forbidden actions
- [ ] Tenant query filter on all list endpoints
- [ ] Record ownership (job assignment, portal user link)
- [ ] Direct URL access denied when forbidden
- [ ] Owner-only panels hidden from Manager/Dispatcher
- [ ] Technician cannot access `/finance/*` or company dashboard
- [ ] Customer cannot access fleet map or other customers' records

**Overall role matrix status:** **HOLD** — code matrix complete; authenticated staging per-role proof incomplete.

---

## Evidence references

- `TITAN_ROLE_PERMISSION_MATRIX.md`
- `packages/auth/src/rbac-matrix.ts`
- `packages/shared/src/role-experience.ts`
- `apps/web/src/lib/role-experience-nav-honesty.test.ts`
- `diagnostic-output/224-crm-final-staging-acceptance.json`

---

**Phase 0 complete @ 235. Phase 1 global organisation complete @ 236 — stopped before Phase 2.**
