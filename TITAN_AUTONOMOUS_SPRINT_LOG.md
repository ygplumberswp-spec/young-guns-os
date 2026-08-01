# TITAN Autonomous Sprint Log

**Repository:** `/Users/keanuventer/Downloads/Titan Aura V1`  
**Branch:** `cursor/titan-frozen-scope-completion`  

---

## Sprint 000 — Phase 0 audit baseline

| Field | Value |
|-------|--------|
| **Timestamp (UTC)** | 2026-08-01 |
| **Phase** | 0 — Repository, architecture and acceptance audit |
| **Result** | Complete — audit deliverables created; no application code changed |
| **Checkpoint** | `8d35bfdddf0b6526cd584f011d3e61284c75b72be` |
| **Prior commits referenced** | `0b28c5b` job doc picker, `43ca436` mobile envelope, `b9bd4b0` technician fixes, `8d35bfd` lead conversion |
| **Files changed** | Control documents only (see commit) |
| **Migration** | None |
| **Tests** | Not run this sprint (audit-only) |
| **Build** | Not run this sprint (audit-only) |
| **Unrelated work** | Stashed `preserve-quote-validation-unrelated` (finance quote validation — isolated) |
| **Remaining issues** | Staging not verified on `8d35bfd`; ~73% of traceability rows not verified complete |
| **Approval required?** | No |
| **Next phase selected** | Phase 1 — Foundation, deployment, auth and session reliability |

### Audit findings (concise)

- **108** web routes, **84** API route modules, migration **0104**, **45** test files  
- **7** canonical roles + 3 legacy aliases  
- **5** available integrations + **5** planned + honesty-only gmail/n8n  
- API envelope outlier: `enterprise-unified-communications.ts` (8 handlers)  
- Placeholder site tokens blocked in lead conversion; no `"Address pending"` in production services  
- Railway Docker deploy config present (`apps/api/railway.toml`, `apps/web/railway.toml`)  
- Untracked audit reports and tooling dirs preserved outside commits  

---

## Sprint 001 — Phase 1 foundation

| Field | Value |
|-------|--------|
| **Timestamp (UTC)** | 2026-08-01 |
| **Phase** | 1 — Foundation, deployment, auth and session reliability |
| **Result** | Complete |
| **Checkpoint** | `07a1093` |
| **Files changed** | API envelope (`enterprise-unified-communications.ts`), MFA login gate (auth service, routes, web login/MFA pages) |
| **Migration** | None |
| **Tests** | `pnpm typecheck`, `pnpm test` (94), `pnpm build` — pass |
| **Approval required?** | No |
| **Next phase selected** | Phase 2 — Tenant isolation, RBAC, audit hardening |

---

## Sprint 002 — Phase 2 tenant isolation hardening

| Field | Value |
|-------|--------|
| **Timestamp (UTC)** | 2026-08-01 |
| **Phase** | 2 — Tenant isolation, RBAC, audit hardening |
| **Result** | Complete (local test expansion) |
| **Checkpoint** | `a619b01` |
| **Files changed** | `tenant-scope.test.ts` (expanded), `packages/auth/src/tokens.test.ts` (MFA challenge tokens), auth package test script |
| **Migration** | None — `0094` role matrix apply deferred (staging approval gate) |
| **Tests** | `pnpm test` — 209 pass (96 API, 23 auth, 59 shared, 31 web) |
| **Approval required?** | No |
| **Next phase selected** | Phase 5 prep — CRM list search (OPS-001 / UX-013) |

---

## Sprint 003 — CRM customer search and address column

| Field | Value |
|-------|--------|
| **Timestamp (UTC)** | 2026-08-01 |
| **Phase** | 5 prep — Customer list search (OPS-001 / UX-013) |
| **Result** | Complete |
| **Checkpoint** | `509cbb5` |
| **Files changed** | `packages/shared/src/crm.ts`, `crm.service.ts`, `crm.ts` route, `crm-api.ts`, `CustomerListPage.tsx`, `CustomerList.tsx` |
| **Migration** | None |
| **Tests** | `pnpm typecheck`, `pnpm test` (209 pass), `pnpm build` — pass |
| **Approval required?** | No |
| **Next phase selected** | Phase 4 — Owner Command Centre and universal navigation |

---

## Sprint 004 — Phase 3 brand shell hardening

| Field | Value |
|-------|--------|
| **Timestamp (UTC)** | 2026-08-01 |
| **Phase** | 3 — Locked TITAN brand, login and responsive shell |
| **Result** | Complete (local) |
| **Checkpoint** | `043d23b` |
| **Files changed** | `brand-shell.test.ts` (auth/portal/owner shell contracts), control doc updates |
| **Migration** | None |
| **Tests** | `pnpm typecheck`, `pnpm test` (212 pass), `pnpm build` — pass |
| **Approval required?** | No |
| **Next phase selected** | Phase 4 — Owner Command Centre and navigation |

---

## Sprint 005 — Phase 4 Owner Command Centre

| Field | Value |
|-------|--------|
| **Timestamp (UTC)** | 2026-08-01 |
| **Phase** | 4 — Owner Command Centre and universal navigation |
| **Result** | Complete (local) |
| **Checkpoints** | `66da253`, `9717439` |
| **Files changed** | Dashboard quick actions, attention panel, clickable KPIs (+ overdue card), global search nav/header + entity routes, portal nav dedupe, search matching improvements |
| **Migration** | None |
| **Tests** | `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` — pass |
| **Approval required?** | No |
| **Next phase selected** | Phase 5 — Customer/property/lead/job contract (**approval gate**: staging deploy for E2E proof) |

---

## Sprint 006 — Phase 5 CRM properties panel (local)

| Field | Value |
|-------|--------|
| **Timestamp (UTC)** | 2026-08-01 |
| **Phase** | 5 — Customer, property, lead and job contract (local slice) |
| **Result** | Partial — CRM properties first-class in UI |
| **Checkpoint** | `c8045f5` |
| **Files changed** | `CustomerPropertiesPanel.tsx`, `CustomerDetailPage.tsx`, `JobCreatePage.tsx` query prefill, CRM property styles |
| **Migration** | None |
| **Tests** | `pnpm typecheck`, `pnpm test` (225 pass), `pnpm build` — pass |
| **Approval required?** | Staging E2E for full Phase 5 sign-off — **yes (deploy gate)** |
| **Next phase selected** | Phase 5 remainder or Phase 6 scheduling (safe local) |

---

## Sprint 007 — Phase 5 staging verification + Phase 6 dispatch handoff (local)

| Field | Value |
|-------|--------|
| **Timestamp (UTC)** | 2026-08-01 |
| **Phase** | 5 staging sign-off + Phase 6 scheduling/dispatcher start |
| **Result** | Phase 5 **GO** (public E2E 10/10); Phase 6 UX-036 local closure |
| **Checkpoint** | `306ba6e` |
| **Files changed** | `staging-phase5-public-e2e.mjs`, `TITAN_PHASE5_STAGING_REPORT.md`, dispatch intel → job create links, control doc updates |
| **Migration** | Local staging apply **blocked** (`28P01`); live API implies `0099+` |
| **Tests** | `pnpm typecheck`, `pnpm test` (228 pass), `pnpm build` — pass |
| **Staging E2E** | `diagnostic-output/140-staging-phase5-e2e.json` — **10/10 GO** |
| **Deploy** | Railway CLI/token **blocked** — staging API already live |
| **Approval required?** | Staging DB password + Railway token for local migrate/redeploy |
| **Next phase selected** | Phase 6 remainder — crew/vehicle assignment staging proof |

---

## Sprint 008 — Phase 6 crew assignment UI (local)

| Field | Value |
|-------|--------|
| **Timestamp (UTC)** | 2026-08-01 |
| **Phase** | 6 — Scheduling/dispatcher crew & vehicle assignment (local) |
| **Result** | Office crew assignment panel wired to existing `PUT /jobs/:id/crew`; schedule→crew sync |
| **Checkpoint** | `cc0f5c5` |
| **Files changed** | `JobCrewAssignmentPanel.tsx`, `crew-assignment-utils.ts`, `JobDetailPage.tsx`, `scheduling.service.ts`, `scheduling.ts` route, control doc updates |
| **Migration** | None |
| **Tests** | `pnpm typecheck`, `pnpm test` (233 pass), `pnpm build` — pass |
| **Approval required?** | Staging E2E for FRZ-006 crew/vehicle chain — staging DB password + deploy |
| **Next phase selected** | Phase 6 staging proof (FRZ-006) when credentials available; UX-017 finance strip / UX-029 job time UX locally |

---

## Sprint 009 — UX-017 finance strip + UX-029 job time UX (local)

| Field | Value |
|-------|--------|
| **Timestamp (UTC)** | 2026-08-01 |
| **Phase** | 6 remainder — job finance quick-actions, mobile job-scoped time, calendar execution labels |
| **Result** | UX-017 finance strip with Create quote/invoice/payment links; UX-029 mobile time job picker + job #; scheduling calendar crew/vehicle labels from execution tables |
| **Checkpoint** | `04344dd` (UX-017 `d691e73`) |
| **Files changed** | `JobFinanceStrip.tsx`, finance create prefill, `MobileTimePage.tsx`, `scheduling.service.ts`, `scheduling-execution-labels.ts`, control doc updates |
| **Migration** | None |
| **Tests** | `pnpm typecheck`, `pnpm test` (235 pass), `pnpm build` — pass |
| **Approval required?** | FRZ-006 staging E2E — staging DB password + Railway deploy |
| **Next phase selected** | FRZ-006 staging proof when credentials available; CRM properties panel / UX-018 schedule map remain safe local |

---

## Sprint 011 — Phase 5 re-verification + Phase 6 staging GO

| Field | Value |
|-------|--------|
| **Timestamp (UTC)** | 2026-08-01 |
| **Phase** | 5 staging re-verification + Phase 6 FRZ-006 staging proof + UX-029 office labour rollup |
| **Result** | Phase 5 **GO 17/17**; Phase 6 **GO 12/12**; UX-029 office job detail labour summary |
| **Checkpoint** | `26fd917` |
| **Files changed** | `staging-phase5-public-e2e.mjs` (audit + record links), `staging-phase6-public-e2e.mjs`, `job-execution.service.ts`, `JobDetailPage.tsx`, `job-execution.ts`, control docs |
| **Migration** | Local staging apply **blocked** (`28P01`); live API implies **104** via prior 0104 apply + E2E behaviour |
| **Tests** | `pnpm typecheck`, `pnpm test` (235 pass), `pnpm build` — pass |
| **Staging E2E** | `140-staging-phase5-e2e.json` **17/17**; `141-staging-phase6-e2e.json` **12/12** |
| **Deploy** | Railway CLI **blocked** (no token); verified against live staging API |
| **Backup** | Local snapshot **blocked** (`28P01`); Supabase PITR + Railway rollback documented |
| **Approval required?** | Staging DB password + Railway token for local migrate/redeploy only |
| **Next phase selected** | Field execution UX-B re-run on current commit; FRZ-015 AURA provider gate |

---

## Sprint 012 — Phase 8 business-day timeline (local)

| Field | Value |
|-------|--------|
| **Timestamp (UTC)** | 2026-08-01 |
| **Phase** | 8 — Business-day timeline, attendance and labour (local slice) |
| **Result** | Office day-timeline API + page; mobile break/travel time entries; job→time deep-link |
| **Checkpoint** | `ec79a82` |
| **Files changed** | `business-day-timeline.ts`, `business-day-timeline.service.ts`, `BusinessDayTimelinePage.tsx`, `MobileTimePage.tsx`, `MobileJobDetailPage.tsx`, scheduling route `/day-timeline`, control docs |
| **Migration** | None |
| **Tests** | `pnpm typecheck`, `pnpm test` (**242** pass: 68 shared + 23 auth + 46 web + 105 api), `pnpm build` — pass |
| **Approval required?** | No — local only; staging E2E for FRZ-007 remainder deferred |
| **Next phase selected** | Phase 9 quotes/BOQs (safe local) or FRZ-015 AURA provider gate (Owner credentials) |

---

## Sprint 013 — Phase 9 quotes, BOQ workspace (local)

| Field | Value |
|-------|--------|
| **Timestamp (UTC)** | 2026-08-01 |
| **Phase** | 9 — Quotes, estimates, BOQs, tenders (local slice) |
| **Result** | Quote edit page; internal approval workflow (draft→review→approved→issue); BOQ workspace API + UI; BOQ→quote conversion |
| **Checkpoint** | `85c97d6` |
| **Files changed** | `boq.ts` schema/service/routes, `QuoteEditPage.tsx`, `BoqListPage.tsx`, `BoqDetailPage.tsx`, `BoqCreatePage.tsx`, `finance.service.ts`, `quote-workflow.test.ts`, control docs |
| **Migration** | `0105_boq_workspace.sql` (boq_documents, boq_line_items, quotes.boq_document_id, si_tenders.quote_id) |
| **Tests** | `pnpm typecheck`, `pnpm test` (**248** pass: 74 shared + 23 auth + 46 web + 105 api), `pnpm build` — pass |
| **Approval required?** | No — local only; migration apply on staging deferred |
| **Next phase selected** | Phase 10 materials/procurement remainder or FRZ-015 AURA provider gate (Owner credentials) |

---

## Sprint 014 — Phase 10 job costing + stock movements (local)

| Field | Value |
|-------|--------|
| **Timestamp (UTC)** | 2026-08-01 |
| **Phase** | 10 — Materials, stock, procurement and job costing (local slice) |
| **Result** | Job costing summary API + `JobCostingPanel` on job detail; stock movement ledger list API + `/inventory/movements` UI; enriched movement rows with item/location names |
| **Checkpoint** | `4a31e46` |
| **Files changed** | `job-costing.ts`/service, `StockMovementsPage.tsx`, `JobCostingPanel.tsx`, inventory/jobs routes, control docs |
| **Migration** | None |
| **Tests** | `pnpm typecheck`, `pnpm test` (**254** pass: 80 shared + 23 auth + 46 web + 105 api), `pnpm build` — pass |
| **Approval required?** | No — local only |
| **Next phase selected** | Phase 11 documents/OCR remainder (safe local) or pause at FRZ-015 / FRZ-018 / staging migration 0105 |

---

## Sprint 015 — Phase 11 job packs + COC compliance (local)

| Field | Value |
|-------|--------|
| **Timestamp (UTC)** | 2026-08-01 |
| **Phase** | 11 — Documents, scanning, OCR, reports, COC and job packs (local slice) |
| **Result** | Job document pack API + approval workflow (draft→review→approved→portal share); job pack list/detail UI; COC compliance panel on job detail; email/WhatsApp send honestly blocked (`SEND_PATH_NOT_IMPLEMENTED`) |
| **Checkpoint** | `6418419` |
| **Files changed** | `job-document-packs` schema/service/routes, `JobDocumentPackPanel.tsx`, `JobCompliancePanel.tsx`, `JobPackListPage.tsx`, `JobPackDetailPage.tsx`, control docs |
| **Migration** | `0106_job_document_packs.sql` (job_document_packs, job_document_pack_items) |
| **Tests** | `pnpm typecheck`, `pnpm test` (**259** pass: 85 shared + 23 auth + 46 web + 105 api), `pnpm build` — pass |
| **Approval required?** | No — local only; migrations 0105–0106 apply on staging deferred |
| **Next phase selected** | Pause at FRZ-015 AURA provider gate, FRZ-018 Xero OAuth, or Phase 12 quote-to-cash remainder (safe local) |

---

## Sprint 016 — Phase 12 completion / invoice / payment / Xero chain (local)

| Field | Value |
|-------|--------|
| **Timestamp (UTC)** | 2026-08-01 |
| **Phase** | 12 — Completion / invoice / payment / Xero finance chain remainder (local slice) |
| **Result** | Job completion snapshot on execution summary; `JobCompletionFinancePanel` with Booked→Completed→Invoiced→Paid chain; invoice-from-job API (`POST /finance/jobs/:jobId/invoices`); payment prefill by invoice/job; Xero entity sync panel with honest OAuth blocking |
| **Checkpoint** | `8afeb87` |
| **Files changed** | `job-finance-workflow.ts`, `JobCompletionFinancePanel.tsx`, `XeroSyncPanel.tsx`, `finance.service.ts`, `job-execution.service.ts`, `PaymentCreatePage.tsx`, `InvoiceDetailPage.tsx`, control docs |
| **Migration** | None |
| **Tests** | `pnpm typecheck`, `pnpm test` (**265** pass: 91 shared + 23 auth + 46 web + 105 api), `pnpm build` — pass |
| **Approval required?** | No — local only; live Xero OAuth/sync still FRZ-018 |
| **Next phase selected** | Pause at FRZ-015 AURA provider gate, FRZ-018 Xero OAuth staging connect, staging migrations 0105–0106 apply |

---

## Sprint 017 — Staging verification (Phases 5–12, migrations 0105–0106)

| Field | Value |
|-------|--------|
| **Timestamp (UTC)** | 2026-08-01 |
| **Phase** | Staging-only verification — migrations 0105–0106, redeploy, smoke Phases 5–12 |
| **Result** | Phase 5 **10/10 GO**, Phase 6 **12/12 GO** on live Railway API; migrations **BLOCKED** (`28P01`); Railway redeploy **BLOCKED** (no `RAILWAY_TOKEN`); Phase 8–12 smoke **PARTIAL** (deployed API behind HEAD — BOQ/packs/day-timeline/movements 404) |
| **Checkpoint** | `767b947` (pre-commit) |
| **Files changed** | `staging-phase8-12-public-e2e.mjs`, control docs, diagnostic JSON |
| **Migration** | `0105_boq_workspace`, `0106_job_document_packs` — **NOT APPLIED** (staging DB password auth) |
| **Tests** | `pnpm typecheck`, `pnpm test` (**242** pass), `pnpm build` — pass |
| **Approval required?** | Staging DB password + Railway token (Owner); production untouched |
| **Next phase selected** | Pause at staging credential gates; safe local work continues; FRZ-015 / FRZ-018 Owner gates |

---

## Sprint 018 — Staging ops (backup, 0105–0106 apply, smokes)

| Field | Value |
|-------|--------|
| **Timestamp (UTC)** | 2026-08-01 |
| **Phase** | Staging-only — pg_dump backup, journal 0105–0106, redeploy attempt, public smokes |
| **Result** | Backup **PASS**; journal **104→106** via controlled apply; `migrate-staging-safe.mjs` drizzle-kit no-op (exit 4 post-check); Railway redeploy **BLOCKED** (no token); public health **503/28P01**; Phase 5/6/8–12 smokes **NO-GO** (DB on Railway) |
| **Checkpoint** | (post-commit) |
| **Files changed** | Sprint 018 report, diagnostic JSON/txt, control docs |
| **Migration** | `0105_boq_workspace`, `0106_job_document_packs` — **APPLIED on staging DB** |
| **Tests** | `pnpm typecheck`, `pnpm test` (**105** pass), `pnpm build` — pass |
| **Approval required?** | Railway `DATABASE_URL` sync + `RAILWAY_TOKEN` or dashboard redeploy |
| **Next phase selected** | Owner updates Railway staging env; rerun public smokes; optional drizzle-kit migrator investigation |

---

## Sprint 019 — Staging ops rerun (credentials validated locally)

| Field | Value |
|-------|--------|
| **Timestamp (UTC)** | 2026-08-01 |
| **Phase** | Staging-only — backup, journal proof, migrate idempotent, redeploy attempt, public smokes |
| **Result** | Backup **PASS** (`staging-backup-2026-08-01T08-25-06-002Z.dump`); journal **106/106** before and after; `migrate-staging-safe.mjs` **exit 0** (no pending 0105–0106); Railway redeploy **BLOCKED** (CLI unauthorized); public `/health/ready` **503/28P01**; Phase 5/6/8–12 public smokes **NO-GO** |
| **Checkpoint** | (post-commit) |
| **Files changed** | Sprint 019 report, diagnostic JSON/txt, control docs |
| **Migration** | 0105–0106 already applied on staging DB |
| **Tests** | `pnpm typecheck`, `pnpm test`, `pnpm build` — pass |
| **Approval required?** | Sync Railway staging `DATABASE_URL` + valid `RAILWAY_TOKEN` or dashboard redeploy |
| **Next phase selected** | Owner Railway env sync; rerun public smokes; safe local Master Directive pause at FRZ-015 / FRZ-018 |


---

## Sprint 020 — UX-030 portal job list ETA (local)

| Field | Value |
|-------|--------|
| **Timestamp (UTC)** | 2026-08-01 |
| **Phase** | POR-003 / OPS-016 — customer-visible ETA on `/my/jobs` list |
| **Result** | `resolveCustomerVisibleJobEtaAt` helper; portal/mobile job summaries include `etaAt`; `PortalJobsPage` renders ETA row |
| **Checkpoint** | (post-commit) |
| **Files changed** | `customer-visible-job-eta.ts`, `mobile.service.ts`, `portal-experience.service.ts`, `PortalJobsPage.tsx`, `JobSummary` type |
| **Migration** | None |
| **Tests** | `customer-visible-job-eta.test.ts` (3 pass); `pnpm typecheck`, `pnpm test`, `pnpm build` — pass |
| **Approval required?** | No — local only; staging proof waits on Railway DB fix |
| **Next phase selected** | Owner Railway env sync + public smokes; Phase 2 cross-tenant denial matrix (automated) |

---

## Sprint 021 — Phase 2 cross-tenant denial matrix (local)

| Field | Value |
|-------|--------|
| **Timestamp (UTC)** | 2026-08-01 |
| **Phase** | 2 — Tenant isolation (execution plan risk #4) |
| **Result** | `cross-tenant-denial-matrix.test.ts` — 97 new automated checks: 7 staff roles × 11 pilot domains, forged-tenant rejection, 9 key route wiring assertions, tenant company param guard (403/allow) |
| **Checkpoint** | (post-commit) |
| **Files changed** | `cross-tenant-denial-matrix.test.ts`, `apps/api/package.json` test script, control docs |
| **Migration** | None |
| **Tests** | `pnpm typecheck`, `pnpm test` (**362 pass**, +97 denial matrix), `pnpm build` — pass |
| **Staging** | `/health/ready` **503/28P01** — public smokes skipped |
| **Approval required?** | No — local only |
| **Next phase selected** | Owner Railway `DATABASE_URL` sync + redeploy; rerun Phase 5/6/8–12 public smokes; MFA login gate e2e (risk #5) |

---

## Sprint 022 — MFA login gate e2e (local)

| Field | Value |
|-------|--------|
| **Timestamp (UTC)** | 2026-08-01 |
| **Phase** | Security — MFA login gate (execution plan risk #5) |
| **Result** | `mfa-login-gate.test.ts` — 12 API gate checks (policy × enrollment matrix, session issuance guard, challenge verification); `login-mfa.test.ts` — 5 web client/flow checks; `auth.ts` maps invalid/expired challenge JWTs to `MFA_CHALLENGE_EXPIRED`; `isLoginMfaChallenge` requires token |
| **Checkpoint** | (post-commit) |
| **Files changed** | `mfa-login-gate.test.ts`, `login-mfa.test.ts`, `auth.ts`, `api-client.ts`, `LoginPage.tsx`, control docs |
| **Migration** | None |
| **Tests** | `pnpm typecheck`, `pnpm test` (**379 pass**, +17 MFA gate), `pnpm build` — pass |
| **Staging** | `/health/ready` **503/28P01** — Phase 8–12 public smokes skipped |
| **Approval required?** | No — local only |
| **Next phase selected** | Owner Railway `DATABASE_URL` sync + redeploy; rerun Phase 5/6/8–12 public smokes; session expiry UI e2e |

---

## Sprint 023 — Session expiry UI e2e (local)

| Field | Value |
|-------|--------|
| **Timestamp (UTC)** | 2026-08-01 |
| **Phase** | Auth UX — session expiry redirect, banner, re-login |
| **Result** | `session-refresh.test.ts` — 4 API refresh checks (`SESSION_MISSING` vs `SESSION_EXPIRED`/`SESSION_INVALID`, valid re-issue); `session-expiry.test.ts` — 9 web bootstrap/redirect checks; `classifyRestoreSessionRefresh` + `session-expiry-routing` helpers wired into `ProtectedRoute`, `LoginPage`, `SessionExpiredPage` |
| **Checkpoint** | (post-commit) |
| **Files changed** | `session-refresh.test.ts`, `session-expiry.test.ts`, `session-expiry-routing.ts`, `api-client.ts`, `ProtectedRoute.tsx`, `LoginPage.tsx`, `AuthStatusPages.tsx`, control docs |
| **Migration** | None |
| **Tests** | `pnpm typecheck`, `pnpm test` (**392 pass**, +13 session expiry), `pnpm build` — pass |
| **Staging** | `/health/ready` **503/28P01** — public smokes skipped |
| **Approval required?** | No — local only |
| **Next phase selected** | Owner Railway `DATABASE_URL` sync + redeploy; rerun Phase 5/6/8–12 public smokes; offline duplicate-completion e2e |

---

## Sprint 024 — Offline duplicate-completion e2e (local)

| Field | Value |
|-------|--------|
| **Timestamp (UTC)** | 2026-08-01 |
| **Phase** | Mobile UX — offline flush idempotency + gated completion duplicate protection |
| **Result** | `mobile-offline-completion.test.ts` — 11 web checks (completion submit gate, flush tally, stable clientActionId); `job-execution-completion-idempotency.test.ts` — 7 API pure guards (clientActionId replay, snapshot rejection, flush classify); `mobile-offline-completion.test.ts` (routes) — 4 API contract checks (flush duplicate replay, complete-gated idempotent replay, COMPLETION_SNAPSHOT_EXISTS); stable per-job completion `clientActionId` wired in `MobileJobDetailPage` |
| **Checkpoint** | (post-commit) |
| **Files changed** | `mobile-offline-completion.ts`, `mobile-offline-completion.test.ts`, `job-execution-completion-idempotency.ts`, `job-execution-completion-idempotency.test.ts`, `mobile-offline-completion.test.ts` (routes), `mobile-offline-queue.ts`, `mobile-api-client.ts`, `MobileJobDetailPage.tsx`, `job-execution.service.ts`, `mobile-workforce.service.ts`, control docs |
| **Migration** | None |
| **Tests** | `pnpm typecheck`, `pnpm test` (**413 pass**, +21 offline duplicate-completion), `pnpm build` — pass |
| **Staging** | `/health/ready` **503/28P01** — public smokes skipped |
| **Approval required?** | No — local only |
| **Next phase selected** | Owner Railway `DATABASE_URL` sync + redeploy; rerun Phase 5/6/8–12 public smokes; role-forbidden direct URL browser tests |

---

## Sprint 025 — Role-forbidden direct URL browser tests (local)

| Field | Value |
|-------|--------|
| **Timestamp (UTC)** | 2026-08-01 |
| **Phase** | RBAC — forbidden direct URL access by role (OwnerStaffRoute + TechnicianRoute contract) |
| **Result** | `role-forbidden-direct-url.ts` — pure path-prefix + redirect evaluators extracted from `StaffExperienceRoute`; `role-forbidden-direct-url.test.ts` — 14 web checks (technician owner-module URL guesses, accountant scheduling block, dispatcher AI/platform admin block, company owner allow-list, mobile URL guess for accountant) |
| **Checkpoint** | (post-commit) |
| **Files changed** | `role-forbidden-direct-url.ts`, `role-forbidden-direct-url.test.ts`, `StaffExperienceRoute.tsx`, control docs |
| **Migration** | None |
| **Tests** | `pnpm typecheck`, `pnpm test` (**427 pass**, +14 role-forbidden direct URL), `pnpm build` — pass |
| **Staging** | `/health/ready` **503/28P01** — public smokes skipped |
| **Approval required?** | No — local only |
| **Next phase selected** | Owner Railway `DATABASE_URL` sync + redeploy; rerun Phase 5/6/8–12 public smokes |

---

## Sprint 026 — APP_URL placeholder heuristic fix (local)

| Field | Value |
|-------|--------|
| **Timestamp (UTC)** | 2026-08-01 |
| **Phase** | Staging deploy blocker — `isPlaceholderPublicUrl` false positive |
| **Result** | Root cause: `host.includes('comfortable-determination')` rejected legitimate `comfortable-determination-staging.up.railway.app` (documented in `.env.staging.example`). Narrowed to docs slug `comfortable-determination-url` + `your-` prefixes; regression test for live staging web origin |
| **Checkpoint** | (post-commit) |
| **Files changed** | `apps/api/src/lib/public-url.ts`, `apps/api/src/lib/public-url.test.ts` |
| **Migration** | None |
| **Tests** | `pnpm typecheck`, `pnpm test`, `pnpm build` — pass |
| **Staging** | Requires Railway redeploy with this commit for API to bind; separate `DATABASE_URL` sync still required for DB health |
| **Approval required?** | No — validation fix only |
| **Next phase selected** | Railway redeploy API/web with fix; rerun public smokes after DB + APP_URL gates green |

## Sprint 027 — Staging deploy path post APP_URL fix (58a16b7)

| Field | Value |
|-------|-------|
| **Result** | Public staging **NO-GO** — health **503/28P01**; smokes skipped |
| **Deploy** | **BLOCKED** — `RAILWAY_TOKEN` unset, CLI unauthorized; Owner redeploy API/web required |
| **Evidence** | `167-staging-health-ready.json`, `167-staging-deploy-verification-summary.json`, `TITAN_STAGING_VERIFICATION_SPRINT020_REPORT.md` |

