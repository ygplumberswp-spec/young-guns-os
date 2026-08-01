# TITAN Test Evidence Index

**Updated (UTC):** 2026-08-01 — FRZ-018d Xero staging NO-GO; FRZ-019 local audit PARTIAL  
**Automated test files:** 56 (`*.test.ts`, excluding `.tmp-origin-build`)

---

## Test commands

| Command | Scope |
|---------|--------|
| `pnpm typecheck` | Full monorepo TypeScript |
| `pnpm lint` | Workspace lint where configured |
| `pnpm test` | shared → auth → web → api (sequential) — **498 pass** (Sprint 028) |
| `pnpm build` | typecheck + all package builds |

---

## Test inventory by risk domain

### Authentication & session

| File | Domain |
|------|--------|
| `apps/api/src/lib/auth-cookies.test.ts` | Cookie flags / refresh path |
| `apps/api/src/middleware/security-headers.test.ts` | Security headers |
| `apps/api/src/routes/auth-mfa.test.ts` | MFA login gate — challenge/enrollment/verify |
| `apps/api/src/routes/mfa-login-gate.test.ts` | **MFA login gate matrix (risk #5)** — policy × enrollment, session guard, challenge edge cases |
| `apps/web/src/lib/login-mfa.test.ts` | MFA client contract + web flow routing |

### RBAC & routing

| File | Domain |
|------|--------|
| `packages/auth/src/rbac-matrix.test.ts` | Role matrix |
| `packages/auth/src/role-experience.test.ts` | Experience mapping |
| `packages/shared/src/role-experience-routes.test.ts` | Blocked route prefixes |
| `apps/web/src/lib/role-forbidden-direct-url.test.ts` | **Sprint 025 — forbidden direct URL redirect contract (FRZ-002)** |
| `apps/web/src/lib/role-experience-nav-honesty.test.ts` | Nav honesty |
| `apps/web/src/lib/nested-routing.test.ts` | Mobile nested routes |
| `apps/web/src/lib/portal-routing.test.ts` | Portal `/my` routing |

### Tenant isolation

| File | Domain |
|------|--------|
| `apps/api/src/lib/tenant-scope.test.ts` | Scope helpers |
| `apps/api/src/lib/cross-tenant-denial-matrix.test.ts` | **Phase 2 denial matrix** — 7 roles × 11 domains + route wiring + param guard |
| `apps/api/src/lib/role-forbidden-api-action.test.ts` | **Sprint 028 — forbidden-action API matrix (FRZ-001)** — 10 pilot actions × role denial/allow + route wiring |

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
| `diagnostic-output/167-staging-health-ready.json` | Public health ready — **503/28P01** (Sprint 020 post-`58a16b7`; redeploy blocked) |
| `diagnostic-output/167-staging-deploy-verification-summary.json` | Sprint 020 deploy/health verification summary |
| `TITAN_STAGING_VERIFICATION_SPRINT020_REPORT.md` | Sprint 020 full staging verification report |

| `TITAN_STAGING_VERIFICATION_SPRINT019_REPORT.md` | Sprint 019 full staging verification report |
| `TITAN_STAGING_VERIFICATION_SPRINT018_REPORT.md` | | Sprint 018 full staging verification report |

| `apps/api/src/lib/customer-visible-job-eta.test.ts` | UX-030 customer-visible job ETA helper tests |
| `apps/api/src/routes/session-refresh.test.ts` | Sprint 023 — `/auth/refresh` SESSION_MISSING vs SESSION_EXPIRED contract |
| `apps/web/src/lib/session-expiry.test.ts` | Sprint 023 — bootstrap classification + ProtectedRoute redirect/banner contract |
| `apps/web/src/lib/mobile-offline-completion.test.ts` | Sprint 024 — mobile completion submit gate + offline flush tally contract |
| `apps/api/src/services/job-execution-completion-idempotency.test.ts` | Sprint 024 — gated completion clientActionId replay + snapshot duplicate guards |
| `apps/api/src/routes/mobile-offline-completion.test.ts` | Sprint 024 — `/offline/flush` duplicate replay + `/complete-gated` idempotency API contract |
| `apps/web/src/lib/role-forbidden-direct-url.test.ts` | Sprint 025 — OwnerStaffRoute + TechnicianRoute forbidden direct URL redirect contract |
| `apps/api/src/lib/role-forbidden-api-action.test.ts` | Sprint 028 — forbidden-action API permission matrix (10 pilot actions) |
| `TITAN_FRZ015_AURA_STAGING_REPORT.md` | **FRZ-015 staging verify — GO** (Owner configured; live synthetic 12/12) |
| `diagnostic-output/169-frz015-aura-staging-verify.json` | FRZ-015 blocked probe (credential absent) |
| `diagnostic-output/170-frz015-aura-staging-verify-go.json` | **FRZ-015 GO** — live synthetic AURA staging verify (12/12, no secrets) |
| `TITAN_FRZ018_XERO_STAGING_REPORT.md` | **FRZ-018 staging verify — NO-GO** (OAuth connected; sync not DB-corroborated) |
| `diagnostic-output/171-frz018-xero-staging-readiness.json` | FRZ-018 blocked probe (credential absent) |
| `diagnostic-output/172-frz018-xero-staging-readonly-verify.json` | FRZ-018b PAUSE-OAUTH — oauthConfigured=true, 14 PASS / 8 PAUSE |
| `diagnostic-output/174-frz018c-xero-staging-readonly-verify.json` | FRZ-018c PARTIAL — Young Guns Plumbing connected; 14 PASS / 8 PARTIAL, no secrets |
| `diagnostic-output/175-frz018d-xero-staging-post-sync-verify.json` | **FRZ-018d NO-GO** — Owner sync signal not DB-corroborated; 12 PASS / 4 FAIL, no secrets |
| `diagnostic-output/frz018c-xero-staging-readonly-verify.mjs` | FRZ-018c probe script (DB + API; optional OWNER_ACCESS_TOKEN) |
| `diagnostic-output/frz018d-xero-staging-post-sync-verify.mjs` | FRZ-018d post-sync probe script (DB + API; optional OWNER_ACCESS_TOKEN) |
| `TITAN_FRZ019_CONFIG_STUDIO_AUDIT.md` | **FRZ-019 local audit — PARTIAL** (settings exist; version/rollback missing) |
| `diagnostic-output/173-frz019-config-studio-audit.json` | FRZ-019 structured local audit |

## Coverage gaps (Phase 2+ targets)

- Live Xero sync integration (staging, read-only) — **NO-GO** (FRZ-018d: OAuth connected; sync not DB-corroborated)  
- AURA provider connection e2e — **GO** (FRZ-015b staging synthetic verify)  

---

## Phase 1 baseline (pending)

Will record typecheck/lint/build/test output in Sprint 001 log entry.
