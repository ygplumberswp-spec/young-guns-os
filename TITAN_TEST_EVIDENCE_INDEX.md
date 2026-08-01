# TITAN Test Evidence Index

**Updated (UTC):** 2026-08-01 — Sprint 017 staging verification (Phases 5–12 smoke; migrations 0105–0106 blocked)  
**Automated test files:** 52 (`*.test.ts`, excluding `.tmp-origin-build`)

---

## Test commands

| Command | Scope |
|---------|--------|
| `pnpm typecheck` | Full monorepo TypeScript |
| `pnpm lint` | Workspace lint where configured |
| `pnpm test` | shared → auth → web → api (sequential) — **242 pass** (Sprint 017) |
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

### Dispatch / scheduling (Phase 6)

| File | Domain |
|------|--------|
| `apps/web/src/features/dispatch/build-job-create-href.test.ts` | Dispatch intel → job create deep-link |
| `apps/web/src/features/jobs/crew-assignment-utils.test.ts` | Crew assignment draft validation (2–4 members, primary, uniqueness) |
| `apps/web/src/features/finance/build-job-finance-action-href.test.ts` | Job detail finance quick-action href builder (UX-017) |
| `apps/api/src/services/scheduling-execution-labels.test.ts` | Calendar crew/vehicle label formatting from execution tables |

### Workforce / business-day timeline (Phase 8)

| File | Domain |
|------|--------|
| `packages/shared/src/business-day-timeline.test.ts` | Day range parsing, event merge/summary helpers |
| `packages/shared/src/boq.test.ts` | BOQ CSV/TSV import parser + markup helper |
| `packages/shared/src/quote-workflow.test.ts` | Quote approval workflow guards |
| `apps/api/src/services/business-day-timeline.service.ts` | Office timeline aggregation (time entries + workflow events) |
| `apps/api/src/services/boq.service.ts` | BOQ CRUD + convert-to-quote |

### Brand / UI

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
| `diagnostic-output/140-staging-phase5-e2e.json` | **Phase 5 staging E2E — 10/10 GO** (Sprint 017 rerun; canonical 17-check at commit `306ba6e`) |
| `diagnostic-output/141-staging-phase6-e2e.json` | **Phase 6 staging E2E — 12/12 GO** (crew + calendar labels, cross-tenant job denial) |
| `diagnostic-output/142-staging-phase8-12-e2e.json` | **Phase 8–12 staging smoke — PARTIAL** (3 pass, 5 fail route-404, 6 blocked deploy/migration) |
| `diagnostic-output/156-staging-verification-summary.json` | Sprint 017 structured staging verification summary |
| `packages/db/scripts/staging-phase8-12-public-e2e.mjs` | Phase 8–12 public API smoke runner |
| `packages/db/scripts/staging-phase6-public-e2e.mjs` | Phase 6 public API E2E runner (crew + calendar labels) |
| `TITAN_STAGING_VERIFICATION_SPRINT017_REPORT.md` | Sprint 017 full staging verification report |
| `TITAN_PHASE5_STAGING_REPORT.md` | Phase 5 staging verification report (prior cycle) |
| `packages/db/scripts/staging-phase5-public-e2e.mjs` | Phase 5 public API E2E runner |
| `scripts/phase3-operational-verify.mjs` | Operational verification |
| `scripts/ux-audit.mjs` | UX audit runner |

---

| `diagnostic-output/staging-pg-dump-2026-08-01T08-20-02.dump` | **Staging logical backup** (~3.4 MB, local only — not in Git) |
| `diagnostic-output/157-staging-backup-journal-before.json` | Sprint 018 pre-migrate journal (104) + backup meta |
| `diagnostic-output/159-staging-apply-0105-0106.json` | Controlled staging apply 0105–0106 — journal **106** |
| `diagnostic-output/160-staging-health-ready.json` | Public health ready — **503 DB_UNAVAILABLE** |
| `diagnostic-output/164-staging-verification-summary.json` | Sprint 018 structured summary |
| `diagnostic-output/staging-backup-2026-08-01T08-25-06-002Z.dump` | **Staging logical backup** (Sprint 019, local only — not in Git) |
| `diagnostic-output/159-staging-backup-journal-before.json` | Sprint 019 pre-migrate journal **106** + backup meta |
| `diagnostic-output/160-staging-journal-after-migrate.json` | Sprint 019 post-migrate journal **106** |
| `diagnostic-output/161-staging-migrate-console.txt` | `migrate-staging-safe.mjs` console (redacted) |
| `diagnostic-output/162-staging-health-ready.json` | Public health ready — **503/28P01** (Sprint 019) |
| `diagnostic-output/163-typecheck-staging-ops.txt` | Sprint 019 `pnpm typecheck` |
| `diagnostic-output/164-pnpm-test-staging-ops.txt` | Sprint 019 `pnpm test` |
| `diagnostic-output/165-build-staging-ops.txt` | Sprint 019 `pnpm build` |
| `diagnostic-output/166-staging-verification-summary.json` | Sprint 019 structured staging verification summary |
| `TITAN_STAGING_VERIFICATION_SPRINT019_REPORT.md` | Sprint 019 full staging verification report |
| `TITAN_STAGING_VERIFICATION_SPRINT018_REPORT.md` | | Sprint 018 full staging verification report |

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
