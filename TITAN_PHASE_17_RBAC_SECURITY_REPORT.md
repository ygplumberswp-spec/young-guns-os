# TITAN Phase 17 — RBAC, Security, Performance and Quality Gate

**Branch:** `cursor/titan-owner-operating-model-final`  
**Base (Phase 16):** `c53bd1a`  
**Final SHA:** `376e15d`  
**Environment:** Staging only — production not touched  
**Generated:** 2026-08-02  

## Verdict

| Surface | Verdict | Evidence |
|---|---|---|
| **Local test suite** | **GO** | typecheck PASS; 679 unit tests PASS (373 API + 137 web + 24 auth + 145 shared) |
| **Production web build** | **GO** | `pnpm --filter @titan/web build` succeeded |
| **Staging RBAC API matrix** | **GO** | Verify 249 — owner/technician probes pass; forbidden routes return 403 |
| **Technician UI guard** | **GO** | `/finance/receivables`, `/jobs`, `/fleet/live-map` redirect to `/mobile` @ 249 |
| **Security headers & session** | **GO** | API security headers present; refresh rejects missing cookie with `SESSION_MISSING` |
| **CSP / auth / encryption** | **GO** | No weakening commits; credential encryption unit tests pass |
| **Accountant / Dispatcher / Client staging** | **HOLD** | No active YGP users for these roles — matrix rows marked hold |
| **Performance (cold API)** | **HOLD** | `platform/tenants/provision` probe p95 ~60s (timeout before 403); median 1.2s |

**Overall:** **GO** @ `376e15d` — authenticated staging RBAC evidence for Owner + Technician; honest HOLD gaps for unavailable roles

## Summary

Phase 17 runs the full local quality gate (typecheck, API, web, auth, shared tests; production web build) and authenticated staging verification **249** against Young Guns Plumbing (YGP). Owner sessions access finance, fleet, integrations, jobs, and team endpoints as expected. Technician sessions are denied finance, fleet, integrations, CRM, and staff jobs list (403) while mobile workforce dashboard succeeds (200). UI direct-URL guards redirect technician away from owner routes to `/mobile`. Platform tenant provisioning is denied for Company Owner (403). No security control weakening was introduced.

## Local test suite

| Check | Result | Count |
|---|---|---|
| `pnpm typecheck` | **PASS** | all packages |
| `pnpm --filter @titan/api test` | **PASS** | 373 tests |
| `pnpm --filter @titan/web test` | **PASS** | 137 tests |
| `pnpm --filter @titan/auth test` | **PASS** | 24 tests (RBAC matrix, role experience, MFA tokens) |
| `pnpm --filter @titan/shared test` | **PASS** | 145 tests (tenant routing, scheduling, Xero sync, payroll) |
| `pnpm --filter @titan/web build` | **PASS** | production bundle |

### Targeted test categories (all included in suites above)

| Category | Key files | Result |
|---|---|---|
| RBAC matrix | `packages/auth/src/rbac-matrix.test.ts` | PASS |
| API forbidden actions | `apps/api/src/lib/role-forbidden-api-action.test.ts` | PASS |
| Direct URL guards | `apps/web/src/lib/role-forbidden-direct-url.test.ts` | PASS |
| CRM list RBAC | `apps/web/src/features/crm/crm-list-status-rbac.test.ts` | PASS |
| Tenant isolation | `apps/api/src/lib/cross-tenant-denial-matrix.test.ts`, `tenant-scope.test.ts` | PASS |
| Audit | `apps/api/src/services/scheduling-override-audit.test.ts` | PASS |
| Approval gate | `apps/api/src/services/xero-write-approval-gate.test.ts` | PASS |
| Xero read-only / import | `xero-import-sync.test.ts`, `xero-oauth.test.ts`, etc. | PASS |
| Cartrack | `apps/api/src/lib/cartrack.client.test.ts` | PASS |
| Scheduling | `packages/shared/src/scheduling.test.ts`, `scheduling-access.test.ts` | PASS |
| Mobile | `apps/web/src/lib/mobile-offline-completion.test.ts` | PASS |
| Security headers | `apps/api/src/middleware/security-headers.test.ts` | PASS |
| Secure session | `packages/auth/src/secure-session.test.ts`, `apps/web/src/lib/secure-session.test.ts` | PASS |

## Staging role discovery (YGP)

| Role | Active users on staging |
|---|---|
| Company Owner | 1 |
| Technician (role exists; session minted programmatically) | 0 dedicated users — fallback mint used |
| Accountant | 0 |
| Dispatcher | 0 |
| Client / Customer | 0 |

## Role × route access matrix (verify 249)

| Route / probe | Owner | Technician | Accountant | Dispatcher | Client |
|---|---|---|---|---|---|
| `finance-intelligence/receivables` | pass | pass (403) | hold | hold | hold |
| `finance/quotes` | pass | pass (403) | hold | hold | hold |
| `fleet/vehicles` | pass | pass (403) | hold | hold | hold |
| `integrations/hub` | pass | pass (403) | hold | hold | hold |
| `jobs` (staff list) | pass | pass (403) | hold | hold | hold |
| `crm/customers` | pass | pass (403) | hold | hold | hold |
| `team/members` | pass | pass (403) | hold | hold | hold |
| `platform/tenants/provision` (POST) | pass (403) | pass (403) | hold | hold | hold |
| `mobile/technician/workforce/dashboard` | pass | pass (200) | hold | hold | hold |

**UI direct URL (browser @ 249)**

| Route | Owner | Technician |
|---|---|---|
| `/` | loads dashboard | redirects → `/mobile` |
| `/finance/receivables` | loads | redirects → `/mobile` |
| `/jobs` | loads | redirects → `/mobile` |
| `/mobile` | loads | loads |
| `/fleet/live-map` | loads | redirects → `/mobile` |

## Security controls (unchanged)

| Control | Status | Notes |
|---|---|---|
| API security headers | **PASS** | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Cross-Origin-Resource-Policy` |
| Refresh cookie contract | **PASS** | Missing cookie → 401 `SESSION_MISSING` |
| Credential encryption | **PASS** | `encryptXeroOAuthCredentials` round-trip tests pass |
| CSP | **Unchanged** | No CSP weakening commits; web served via existing Vite build |
| Authentication | **Unchanged** | JWT + httpOnly refresh cookie pattern preserved |
| Audit | **Unchanged** | Scheduling override audit tests pass |

## Browser console scan (critical routes)

| Role | Console errors | Page errors |
|---|---|---|
| Owner (5 routes) | 0 | 0 |
| Technician (5 routes) | 1 unique (`404` resource during redirect chain) | 0 |

Owner routes clean. Technician 404 is a non-blocking asset fetch during RBAC redirect — logged as HOLD, not a security regression.

## Performance (reasonable check)

| Metric | Value | Assessment |
|---|---|---|
| API probe median | 1,201 ms | Acceptable for staging |
| API probe max | 60,202 ms | Cold `platform/tenants/provision` timeout → 403; HOLD |
| Owner UI load (median) | ~6.6 s | Staging networkidle; acceptable |
| Technician UI redirect | ~7–8 s | Acceptable |

No formal load test run (per directive). No performance-driven code changes required.

## Deliverables

| Deliverable | Path |
|---|---|
| Phase 17 report | `TITAN_PHASE_17_RBAC_SECURITY_REPORT.md` |
| Staging verify script | `diagnostic-output/249-rbac-security-gate-verify.mjs` |
| Staging verify JSON | `diagnostic-output/249-rbac-security-gate-verify.json` |
| Staging screenshots | `diagnostic-output/phase17-rbac-security-staging/` |

## Deploy (staging)

**No deploy required** — all tests passed locally; staging RBAC verification passed without code fixes.

| Service | Deployment | Status |
|---|---|---|
| `young-guns-os` | unchanged @ Phase 16 | — |
| `comfortable-determination` | unchanged @ Phase 16 | — |

- **Production:** untouched  

## Gaps (honest)

1. **No Accountant, Dispatcher, or Client users** on YGP staging — API/UI matrix rows marked **hold**; unit tests cover these roles locally.
2. **Technician session** minted programmatically (no dedicated staging technician user account).
3. **Platform provision probe latency** — 60s cold timeout before 403; RBAC outcome correct, performance noted.
4. **Phase 18 not started** — Playwright full visual audit deferred to Phase 18 per master directive.

## Phase 18 boundary

Phase 17 complete. Phase 18 (Playwright full visual audit install) **not started**.
