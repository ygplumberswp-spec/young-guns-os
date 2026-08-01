# TITAN Role Permission Matrix

**Updated (UTC):** 2026-08-01 — GLOBAL BINDING ACCEPTANCE RULE  
**Sources:** `packages/auth/src/rbac-matrix.ts`, `packages/shared/src/role-experience.ts`, `packages/db/drizzle/0094_canonical_role_matrix.sql`

---

## GLOBAL BINDING ACCEPTANCE RULE

Role experiences must satisfy `TITAN_BINDING_ACCEPTANCE_RULE.md` criteria **(5)** correct role and **(6)** tenant isolation. Matrix rows alone do not mark features complete — staging verification per role path required.

---

## Canonical roles

| Role | Experience key | Executive visibility | Field/mobile | Client portal |
|------|----------------|---------------------|--------------|---------------|
| Platform Owner | `platform_owner` | Full platform + SaaS | No | Inspect where authorized |
| Company Owner | `company_owner` | Full company executive | No | Inspect where authorized |
| Manager | `manager` | Operations + reports (no private Owner targets) | No | No |
| Dispatcher | `dispatcher` | Jobs, scheduling, dispatch, fleet read | No | No |
| Accountant | `accountant` | Finance, invoices, payments | No | No |
| Technician | `technician` | Assigned jobs + crew context only | **Yes** `/mobile` | No |
| Client | `client` | Own records only | No | **Yes** `/my/*` |

**Legacy aliases (deprecated):** Owner→Company Owner, Admin→Manager, Member (manual only)

---

## Domain access matrix (summary)

Legend: **A** = allowed (read/write as permitted), **R** = read-only, **—** = forbidden, **O** = Owner-only executive

| Domain | Platform Owner | Company Owner | Manager | Dispatcher | Accountant | Technician | Client |
|--------|:--------------:|:-------------:|:-------:|:----------:|:----------:|:----------:|:------:|
| Finance / Xero / margins | O | O | R | — | A | — | — |
| Customers / leads (broad) | A | A | A | R | R | — | — |
| Jobs (all company) | A | A | A | A | R | Assigned only | Own only |
| Scheduling / dispatch | A | A | A | A | — | Assigned view | — |
| Fleet / live map (full) | O | O | R | R | — | — | — |
| Inventory / procurement | A | A | A | R | R | Materials only | — |
| Marketing / campaigns | A | A | R | — | — | — | — |
| AURA chat (Owner) | A | A | R | — | R | — | — |
| Integrations / secrets | A | A | — | — | — | — | — |
| Security / SaaS / platform | A | O | — | — | — | — | — |
| Settings / team | A | A | R | — | — | — | — |
| Portal quotes/invoices | — | — | — | — | — | — | Own only |

---

## Verification checklist (per protected feature)

For each feature marked complete, prove:

- [ ] UI visibility matches matrix  
- [ ] Client route guard (`role-experience.ts`, layout guards)  
- [ ] API `requirePermission` / RBAC middleware  
- [ ] Tenant query filter (`companyId`)  
- [ ] Record ownership (job assignment, portal user link)  
- [ ] Direct URL access denied when forbidden  
- [ ] Direct API access returns 403/404 (not 500 leak)  
- [ ] Error response uses standard envelope  
- [ ] Audit event for sensitive mutations  

**Status:** Matrix defined in code; **automated forbidden-action API matrix complete** (Sprint 028); cross-role live E2E incomplete.

---

## Known gaps

| ID | Gap | Phase |
|----|-----|-------|
| PLT-003 | Migration `0094` not applied on all environments | 2 |
| PLT-008 | MFA not enforced at login | 1–2 |
| POR-005/006 | Technician finance denial — staging verified UX-B | 7 |
| FRZ-004 | Owner-only fleet/target panels not fully restricted in UI audit | 4 |

---

## Test evidence

| Test file | Coverage |
|-----------|----------|
| `packages/auth/src/rbac-matrix.test.ts` | Role assignment rules |
| `packages/shared/src/role-experience-routes.test.ts` | Route prefix blocking |
| `apps/web/src/lib/role-experience-nav-honesty.test.ts` | Nav visibility |
| `apps/api/src/lib/tenant-scope.test.ts` | Tenant scope helpers |
| `apps/api/src/lib/cross-tenant-denial-matrix.test.ts` | Cross-tenant scope + route wiring |
| `apps/api/src/lib/role-forbidden-api-action.test.ts` | Forbidden-action API permission matrix (Sprint 028) |
| `apps/web/src/lib/role-forbidden-direct-url.test.ts` | Forbidden direct URL redirect contract |

Phase 2 forbidden-action API matrix per domain — **DONE (Sprint 028)**. Live cross-role browser E2E remains open.
