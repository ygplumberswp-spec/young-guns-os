# TITAN Test Evidence Index

**Updated (UTC):** 2026-08-01 — Sprint 004  
**Automated test files:** 46 (`*.test.ts`, excluding `.tmp-origin-build`)

---

## Test commands

| Command | Scope |
|---------|--------|
| `pnpm typecheck` | Full monorepo TypeScript |
| `pnpm lint` | Workspace lint where configured |
| `pnpm test` | shared → auth → web → api (sequential) |
| `pnpm build` | typecheck + all package builds |

---

## Test inventory by risk domain

### Authentication & session

| File | Domain |
|------|--------|
| `apps/api/src/lib/auth-cookies.test.ts` | Cookie flags / refresh path |
| `apps/api/src/middleware/security-headers.test.ts` | Security headers |

### RBAC & routing

| File | Domain |
|------|--------|
| `packages/auth/src/rbac-matrix.test.ts` | Role matrix |
| `packages/auth/src/role-experience.test.ts` | Experience mapping |
| `packages/shared/src/role-experience-routes.test.ts` | Blocked route prefixes |
| `apps/web/src/lib/role-experience-nav-honesty.test.ts` | Nav honesty |
| `apps/web/src/lib/nested-routing.test.ts` | Mobile nested routes |
| `apps/web/src/lib/portal-routing.test.ts` | Portal `/my` routing |

### Tenant isolation

| File | Domain |
|------|--------|
| `apps/api/src/lib/tenant-scope.test.ts` | Scope helpers |

### Lead / job / finance contracts

| File | Domain |
|------|--------|
| `apps/api/src/services/leads-contract.test.ts` | Lead conversion rules |
| `apps/web/src/features/leads/lead-conversion-contract.test.ts` | Client contract |
| `packages/shared/src/job-contract.test.ts` | Job contract types |
| `apps/api/src/services/jobs-contract.test.ts` | Job API contract |
| `apps/web/src/features/jobs/job-form-contract.test.ts` | Job form |
| `apps/api/src/services/job-execution.service.test.ts` | Execution states |
| `packages/shared/src/job-execution.test.ts` | Execution shared |
| `apps/api/src/services/finance-contract.test.ts` | Finance contract |
| `apps/api/src/services/stock-movements.contract.test.ts` | Stock movements |

### Integrations & honesty

| File | Domain |
|------|--------|
| `packages/shared/src/integration-capability.test.ts` | Integration capabilities |
| `packages/shared/src/nav-honesty.test.ts` | Nav capability honesty |
| `apps/api/src/services/xero-oauth.test.ts` | Xero OAuth |
| `apps/api/src/services/xero-import-sync.test.ts` | Xero import |
| `packages/shared/src/n8n-orchestration.test.ts` | n8n signing |
| `apps/api/src/lib/n8n-signing.test.ts` | n8n HMAC |

### Marketing & validation

| File | Domain |
|------|--------|
| `packages/shared/src/marketing-eligibility.test.ts` | Consent/eligibility |
| `packages/shared/src/contact-validation.test.ts` | Placeholder email/phone |

### AURA / AI

| File | Domain |
|------|--------|
| `apps/api/src/services/aura-context-routing.test.ts` | Context routing |
| `apps/api/src/services/ai-routing-cache.test.ts` | AI routing cache |
| `apps/web/src/features/aura/aura-message-content.test.ts` | Message content |

### Performance / cache

| File | Domain |
|------|--------|
| `apps/web/src/lib/query-cache.test.ts` | Query cache |
| `apps/web/src/lib/background-scheduler.test.ts` | Background scheduler |
| `apps/web/src/lib/route-prefetch-registry.test.ts` | Prefetch registry |
| `apps/api/src/services/api-read-cache.test.ts` | API read cache |

### Brand / UI

| File | Domain |
|------|--------|
### Brand & shell

| File | Domain |
|------|--------|
| `apps/web/src/brand/TitanWordmark.test.ts` | SVG wordmark |
| `apps/web/src/brand/brand-shell.test.ts` | Auth + owner/portal shell responsive contracts |
| `packages/auth/src/tokens.test.ts` | MFA challenge tokens |
| `packages/ui/src/button-variants.test.ts` | UI components |

### Infrastructure

| File | Domain |
|------|--------|
| `packages/db/src/connection-options.test.ts` | DB connection |
| `apps/api/src/lib/storage-paths.test.ts` | Storage paths |
| `apps/api/src/lib/env-flags.test.ts` | Env flags |
| `apps/api/src/lib/public-url.test.ts` | Public URL |
| `apps/web/src/lib/runtime-env.test.ts` | Runtime env |

---

## Staging / browser evidence (manual & scripted)

| Artifact | Description |
|----------|-------------|
| `TITAN_FULL_TEST_REPORT.md` | Prior full test report |
| `TITAN_UX_*_STAGING_REPORT.md` | UX tranches A–K |
| `TITAN_STAGING_TEST_RESULTS.md` | Staging harness 75/0 |
| `diagnostic-output/*.json` | Playwright diagnostics |
| `scripts/phase3-operational-verify.mjs` | Operational verification |
| `scripts/ux-audit.mjs` | UX audit runner |

---

## Coverage gaps (Phase 2+ targets)

- Cross-tenant API denial matrix (automated)  
- Session expiry UI e2e  
- MFA login gate e2e  
- Live Xero sync integration (staging, read-only)  
- AURA provider connection e2e  
- Offline duplicate-completion e2e  
- Role-forbidden direct URL browser tests  

---

## Phase 1 baseline (pending)

Will record typecheck/lint/build/test output in Sprint 001 log entry.
