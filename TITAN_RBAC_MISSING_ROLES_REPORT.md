# TITAN Missing-Role RBAC Verification (Verify 251)

**Branch:** `cursor/titan-owner-operating-model-final`  
**Starting SHA:** `275769e`  
**Final SHA:** `275769e` (evidence-only commit pending)  
**Environment:** Staging only — **production NOT touched**  
**Generated:** 2026-08-02  

## Verdict

| Role | Verdict | Allowed | Forbidden | Data isolation |
|------|---------|---------|-----------|----------------|
| **Owner** (reference) | **GO** | 16/16 API+UI | n/a | pass |
| **Technician** (reference) | **GO** | 12/12 UI + API | 12/12 blocked | pass |
| **Accountant** | **GO** | 15/15 UI + 10/10 API | 11/11 UI redirects | pass |
| **Dispatcher** | **HOLD** | 16/17 UI + 9/10 API | 1 gap (receivables) | pass |
| **Client** (portal) | **GO** | 5/5 portal UI + 1/1 portal API | 5/5 staff routes blocked | pass |

**Overall RBAC verdict:** **HOLD** @ `275769e` — Accountant, Client, and reference roles verified on staging; **Dispatcher receivables exposure** remains (API + direct URL vs role-experience nav)

## Summary

Verify **251** seeds staging-only test accounts on Young Guns Plumbing (YGP), mints authenticated sessions via `railway run node` + Playwright route intercept (237/249 pattern), and exercises allowed/forbidden routes plus data-isolation probes. Accountant finance modules, CRM read, integrations hub, and UI redirect guards pass. Client portal `/my/*` routes load; staff routes redirect to login. Dispatcher operational routes pass; **executive receivables** (`/api/v1/finance-intelligence/receivables` and `/finance/receivables`) remain reachable despite exclusion from `DISPATCHER_ALLOWED_HREFS` / nav experiences — documented gap, no finance-route code change per scope.

**Explicit scope confirmation:** Production, finance payment/Xero work, and orphan route cleanup **untouched**.

## Staging test accounts (YGP only)

| Role | Email | Principal | Status |
|------|-------|-----------|--------|
| Accountant | `251-rbac-test-accountant@staging-verify.test` | Staff (`users`) | Created verify 251 |
| Dispatcher | `251-rbac-test-dispatcher@staging-verify.test` | Staff (`users`) | Created verify 251 |
| Client | `251-rbac-test-client@staging-verify.test` | Portal (`portal_users`) | Created verify 251 |

Passwords: staging-only test password (set by seed script; **redacted** from committed JSON). Reuse via `diagnostic-output/251-seed-staging-rbac-test-users.mjs` (idempotent).

**YGP company ID:** `095aef76-fef5-4139-af37-a42f2d7e2faf`  
**Client customer ID:** `3c400ace-f1c5-4933-8f4a-5d11a1bd3c55`

## Session mint method

| Role | Method |
|------|--------|
| Owner / Technician / Accountant / Dispatcher | `railway run --service young-guns-os node` → `createAccessToken` + DB session row |
| Client | `createPortalAccessToken` + `portal_sessions` row |
| Browser UI | Playwright intercept on `/api/v1/auth/refresh` (staff) or `/api/v1/portal/auth/refresh` (client) |

## Role × route matrix (verify 251)

### API probes

| Probe | Owner | Technician | Accountant | Dispatcher | Client |
|-------|-------|------------|------------|------------|--------|
| `finance-intelligence/receivables` | pass 200 | pass 403 | pass 200 | **fail 200** | pass 401 |
| `finance/quotes` | pass 200 | pass 403 | pass 200 | pass 200 | pass 401 |
| `fleet/vehicles` | pass 200 | pass 403 | pass 403 | pass 200 | pass 401 |
| `integrations/hub` | pass 200 | pass 403 | pass 200 | pass 403 | pass 401 |
| `jobs` (staff list) | pass 200 | pass 403 | pass 403 | pass 200 | pass 401 |
| `crm/customers` | pass 200 | pass 403 | pass 200 | pass 200 | pass 401 |
| `team/members` | pass 200 | pass 403 | pass 403 | pass 200 | pass 401 |
| `platform/tenants/provision` (POST) | pass 403 | pass 403 | pass 403 | pass 403 | pass 401 |
| `mobile/technician/workforce/dashboard` | pass 200 | pass 200 | pass 403 | pass 200 | pass 401 |
| `portal/dashboard` | pass 401 | pass 401 | pass 401 | pass 401 | pass 200 |

### UI direct URL (browser @ 251)

| Route | Accountant | Dispatcher | Client |
|-------|------------|------------|--------|
| Allowed finance/ops | loads | loads | n/a |
| `/scheduling` | redirect → `/finance/invoices` | loads | login block |
| `/fleet/live-map` | redirect → `/finance/invoices` | loads | login block |
| `/aura/agents` | redirect → `/finance/invoices` | redirect → `/` | login block |
| `/integrations` | n/a | redirect → `/` | login block |
| `/finance/receivables` | loads (allowed) | **loads (gap)** | login block |
| `/my`, `/my/jobs`, … | n/a | n/a | loads |

## Data isolation checks

| Check | Result |
|-------|--------|
| Foreign job UUID denied (all staff roles) | **pass** (403/404) |
| Client staff finance API denied | **pass** (401) |
| Client portal dashboard scoped | **pass** (200, own `customerId`) |
| Owner CRM tenant scope (no foreign `companyId`) | **pass** |
| Accountant team API denied | **pass** (403) |
| Dispatcher integrations API denied | **pass** (403) |

## Gaps (honest)

1. **Dispatcher receivables** — API guard accepts `finance:read`; nav/`DISPATCHER_ALLOWED_HREFS` excludes receivables. Direct URL and API both expose receivables data. **HOLD** until API guard aligns with role-experience (deferred — finance-intelligence route out of scope).
2. **Phase 17 rows** — Accountant/Dispatcher/Client were **hold** (no users); now **GO/HOLD/GO** with live staging evidence.
3. **Technician session** — still minted programmatically (no dedicated staging technician user).

## Deliverables

| Deliverable | Path |
|-------------|------|
| Seed script | `diagnostic-output/251-seed-staging-rbac-test-users.mjs` |
| Seed JSON | `diagnostic-output/251-seed-staging-rbac-test-users.json` |
| Verify script | `diagnostic-output/251-rbac-missing-roles-verify.mjs` |
| Verify JSON | `diagnostic-output/251-rbac-missing-roles-verify.json` |
| Screenshots | `diagnostic-output/phase251-rbac-missing-roles-staging/` |
| This report | `TITAN_RBAC_MISSING_ROLES_REPORT.md` |

## Deploy (staging)

**No deploy required** — verification only; no RBAC code fixes merged.

| Service | Deployment | Status |
|---------|------------|--------|
| `young-guns-os` (API) | unchanged @ Phase 16/17 | — |
| `comfortable-determination` (web) | unchanged @ Phase 18 | — |

- **Production:** untouched  
- **Finance / Xero / orphans:** untouched  

## Phase 17 cross-reference

Phase 17 verify **249** marked Accountant/Dispatcher/Client as **hold** (zero YGP users). This phase closes that gap for Accountant and Client; Dispatcher **HOLD** updated with receivables finding. See `TITAN_PHASE_17_RBAC_SECURITY_REPORT.md` § Gaps.
