# TITAN Master Completion Checklist

**Authoritative master list** — consolidates Claude and Gemini audits from baseline **`f8cc0c4`** (`feat(ui): apply Young Guns theme across TITAN and document engine`).

| Field | Value |
|-------|-------|
| **Document role** | Single source of truth for TITAN completion status |
| **Supersedes** | Staging-release-only checklist content in repo root `TITAN_MASTER_COMPLETION_CHECKLIST.md` (now a pointer only) |
| **Audit baseline (HEAD f8cc0c4)** | **Built ~72%** · **Verified locally ~48%** · **Production ready ~12%** |
| **Recovery worktree** | `/workspace/.worktrees/titan-recovery` |
| **Recovery branch** | `cursor/titan-v1-integration-recovery` |
| **Deploy branch** | `cursor/titan-v1-integration` |
| **Staging Supabase ref** | `cpkuwtaipjxeipvbssvn` |
| **Production ref (forbidden)** | `rshuiaghmtrvvilhqpwm` |
| **Updated (UTC)** | 2026-08-06 |
| **Agent register** | [TITAN_MASTER_AGENT_REGISTER.md](./TITAN_MASTER_AGENT_REGISTER.md) (AGENT-001) |
| **Binding rule** | `TITAN_BINDING_ACCEPTANCE_RULE.md` (10 criteria) |
| **Audit sources** | `TITAN_COMPLETE_APP_AUDIT.md`, `TITAN_ACCEPTANCE_REGISTER.md`, `TITAN_GAP_BACKLOG.md`, `TITAN_AURA_AGENT_COLLABORATION_AUDIT.md`, finance J-6.x phase evidence |

---

## Audit baseline summary

Consolidated Claude + Gemini pass at **`f8cc0c4`**:

| Metric | Estimate | Meaning |
|--------|----------|---------|
| **Built ~72%** | Code/API/UI exists for most modules | Substantial implementation (~155 web pages, 84 API route modules); includes foundation-only and decorative surfaces |
| **Verified locally ~48%** | Automated tests + local proofs | Cross-tenant matrix, finance editor suites, role guards, UX tranche closures |
| **Production ready ~12%** | Meets all 10 binding criteria with Owner sign-off | Pilot-critical chains partially proven; production forbidden until staging GO |

Prior register estimate (**~27% verified live** on 116-row traceability) remains valid for **strict binding-rule verified complete** classification. The 72/48/12 split reflects **breadth of built code** vs **local verification depth** vs **production gates**.

---

## AI workforce documentation (AGENT-001B — 2026-08-06)

| Document | ID | Checklist status |
|----------|-----|------------------|
| [TITAN_MASTER_AGENT_REGISTER.md](./TITAN_MASTER_AGENT_REGISTER.md) | AGENT-001 (restored) | **DOCUMENTED** — **307 approved unique agents**; 18 departments; extensible; 0 Active |
| [TITAN_AGENT001_ROLE_RECONCILIATION.md](./TITAN_AGENT001_ROLE_RECONCILIATION.md) | AGENT-001B | **DOCUMENTED** — 191 role families reconciled |
| [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) | AGENT-002 | **DOCUMENTED** — dual status fields |
| [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) | AGENT-003 | **DOCUMENTED** |
| [TITAN_AGENT_ACTIVATION_ROADMAP.md](./TITAN_AGENT_ACTIVATION_ROADMAP.md) | AGENT-004 | **DOCUMENTED** — Phase A pending Owner approval |
| Universal Integration Standard | INT-UNIVERSAL-001 | **DOCUMENTED** in integration register |

**Note:** Documentation complete ≠ agent implementation complete. No agent marked **Active** without activation gate evidence. Dual status model: implementation evidence (21 Partial · 3 Provider-blocked · 283 Missing) and activation lifecycle (0 Active).

**Facebook (staging — J-6.7F14 deployed):** Connected and verified; content permissions granted; webhooks feed+mention provider-confirmed; Meta dashboard sample delivery succeeded; genuine live Page event pending (Meta app unpublished); not production-complete.

---

## Merged master sequence (16 steps)

Execute in order. Do **not** skip gates. Production is forbidden until step 16 grants a **separate** production approval.

| Step | Gate | Requirement | Current status @ f8cc0c4 |
|------|------|-------------|---------------------------|
| **1** | Identity | Repository / worktree / branch / HEAD `f8cc0c4` confirmed | **DONE** |
| **2** | Git safety | `git fetch origin` — no rebase/reset; deploy branch lineage verified | **DONE** |
| **3** | Credentials | `APP_ENV=staging`, `TITAN_ENV=staging`, `DATABASE_URL` ref `cpkuwtaipjxeipvbssvn` only | **BLOCKED** — no local `.env.staging.local` |
| **4** | Backup | Verified `pg_dump` custom backup, SHA-256, `pg_restore --list`, rollback command recorded | **NOT RUN** |
| **5** | Migration precheck | Read-only: prior migration applied, target not yet applied, protected row counts | **NOT RUN** — blocked by step 4 |
| **6** | Migration apply | Guarded staging-only scripts **0176 → 0177 → 0178** (never `drizzle-kit migrate`) | **NOT RUN** |
| **7** | Local quality | `pnpm` build + automated test suite green (incl. J-6.6C document sections) | **TESTED LOCALLY** — J-6.6C |
| **8** | Git publish | Push recovery branch; fast-forward deploy branch without force-push | **PENDING** — Owner gate |
| **9** | Deploy | Railway staging API + Web from `cursor/titan-v1-integration`; Chromium on API pod | **PARTIAL** — health probes OK; revision unconfirmed |
| **10** | Smoke probes | `/health`, `/health/ready`, finance routes return 401 not 404, PDF renderer diagnostic | **PARTIAL** |
| **11** | Security auto | Finance RBAC + tenant isolation automated tests green | **IN PROGRESS** — J-6.6A |
| **12** | Owner E2E | Authenticated finance smoke (`docs/TITAN_FINANCE_STAGING_SMOKE_J65.md`) | **NOT STARTED** — supersedes J-5 |
| **13** | Desktop | Visual verification ~1440px (finance editors, core ops surfaces) | **PARTIAL** — finance layout tests only |
| **14** | Tablet | Visual verification 1024px / 768px reflow | **PARTIAL** — CSS/tests; not Owner-verified |
| **15** | Mobile | Visual verification ~390px (finance + technician paths) | **PARTIAL** — UX-B mobile GO; finance tests only |
| **16** | Sign-off | Owner staging GO → separate production approval gate | **NO-GO** |

---

## Status vocabulary

| Status | Definition |
|--------|------------|
| **NOT FOUND** | No meaningful implementation |
| **FOUNDATION ONLY** | Scaffold/service/page exists; not wired to useful workflow |
| **PARTIALLY IMPLEMENTED** | Significant pieces exist; acceptance chain incomplete |
| **BUILT LOCALLY** | Implemented in recovery worktree; not staging-verified |
| **TESTED LOCALLY** | Automated local tests pass; staging/live proof pending |
| **STAGING READY** | Committed; awaiting deploy + smoke |
| **DEPLOYED TO STAGING** | Live on staging URLs with route/health evidence |
| **OWNER VERIFIED** | Owner authenticated click-path or sign-off recorded |
| **PRODUCTION READY** | All 10 binding criteria met; production gate may be requested |

Boolean columns use **YES** / **NO** / **—** (not applicable).

---

## Requirements register

**Total requirement rows:** 257

| ID | Area | Requirement | Status | Built locally | Tests passed | Real DB/provider connected | RBAC tested | Tenant isolation tested | Deployed to staging | Authenticated E2E passed | Desktop verified | Tablet verified | Mobile verified | Claude verified | Gemini verified | Owner verified | Production ready | Evidence | Commit | Migration/provider dependency | Blocker | Next action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| REPO-001 | repo | Monorepo structure (apps/api, apps/web, packages/*) intact and buildable | BUILT LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | pnpm workspace | f8cc0c4 |  |  |  |
| REPO-002 | repo | Recovery worktree on cursor/titan-v1-integration-recovery @ f8cc0c4 | BUILT LOCALLY | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | git HEAD f8cc0c4 | f8cc0c4 |  |  |  |
| REPO-003 | repo | Deploy branch cursor/titan-v1-integration linear descendant of af56e32 | PARTIALLY IMPLEMENTED | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | git log | f8cc0c4 |  |  | Confirm origin SHA after push |
| REPO-004 | repo | CI typecheck + test pipeline green on recovery branch | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | pnpm test (partial suites) | f8cc0c4 |  |  |  |
| AUTH-001 | auth | Email/password login with session cookie | DEPLOYED TO STAGING | YES | YES | NO | NO | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO | session-expiry.test.ts | f8cc0c4 |  |  |  |
| AUTH-002 | auth | MFA TOTP challenge at login when enabled | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | mfa-login-gate.test.ts | f8cc0c4 |  | Staging login MFA click-path unverified |  |
| AUTH-003 | auth | Secure persistent session (HttpOnly, cross-tab, step-up) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | TITAN_SECURE_SESSION_ARCHITECTURE.md | f8cc0c4 |  |  |  |
| AUTH-004 | auth | Session expiry UX — no silent data loss on hard refresh | DEPLOYED TO STAGING | YES | YES | NO | NO | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO | session-expiry.test.ts | 7741976 |  |  |  |
| AUTH-005 | auth | SSO / IdP integration | NOT FOUND | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | PLT-009 missing |  |
| ROLE-001 | roles | Owner role — full Command Centre + finance write | TESTED LOCALLY | YES | YES | NO | YES | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | role-forbidden-api-action.test.ts | f8cc0c4 |  |  |  |
| ROLE-002 | roles | Admin role — staff operations without platform Owner powers | PARTIALLY IMPLEMENTED | YES | YES | NO | YES | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | PLT-003 role matrix partial | f8cc0c4 |  |  |  |
| ROLE-003 | roles | Office/Dispatch role — scheduling, CRM, job create | TESTED LOCALLY | YES | YES | NO | YES | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO | Phase 5/6 staging E2E | f8cc0c4 |  |  |  |
| ROLE-004 | roles | Technician role — mobile execution, no finance write | TESTED LOCALLY | YES | YES | NO | YES | YES | NO | NO | NO | NO | NO | YES | YES | NO | NO | UX-B staging 35/35 | f8cc0c4 |  |  |  |
| ROLE-005 | roles | Client role — /my/* portal canonical with /portal alias | PARTIALLY IMPLEMENTED | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | UX-C local; pay honestly unavailable | f8cc0c4 |  |  |  |
| ROLE-006 | roles | Platform Owner / Manager / Accountant roles (Decision 1) | NOT FOUND | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | PLT-003 queued |  |
| ROLE-007 | roles | Role-forbidden direct URL redirects | TESTED LOCALLY | YES | YES | NO | YES | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO | role-forbidden-direct-url.test.ts | f8cc0c4 |  |  |  |
| ROLE-008 | roles | Cross-tenant denial matrix (97 tests) | TESTED LOCALLY | YES | YES | NO | YES | YES | YES | NO | NO | NO | NO | YES | YES | NO | NO | cross-tenant-denial-matrix.test.ts | f8cc0c4 |  |  |  |
| CRM-001 | customers | Customer CRUD with SA phone/ZAR formatting (partial app-wide) | PARTIALLY IMPLEMENTED | YES | YES | NO | NO | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  |  |  |
| CRM-002 | customers | Customer search (name/phone/address) on list | TESTED LOCALLY | YES | YES | NO | NO | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO | Sprint 003 | f8cc0c4 |  |  |  |
| CRM-003 | customers | Customer value classification (8 buckets, API) | BUILT LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | customer-value-classification.ts | f8cc0c4 |  |  |  |
| CRM-004 | customers | Finance customer search with inline create (RBAC gated) | BUILT LOCALLY | YES | YES | NO | YES | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance routes @ f8cc0c4 | f8cc0c4 |  |  |  |
| CRM-005 | customers | Placeholder email detection + duplicate engine | NOT FOUND | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | CD-002–004 |  |
| CRM-006 | properties | Properties first-class in CRM with create-job-at-property | PARTIALLY IMPLEMENTED | YES | NO | NO | NO | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO | Sprint 006 partial | f8cc0c4 |  |  |  |
| CRM-007 | properties | Immutable job/property snapshots with verified update checkboxes | TESTED LOCALLY | YES | YES | NO | NO | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO | UX-A closed | f8cc0c4 |  |  |  |
| CRM-008 | CRM | Lead create form + convert → customer/property/job wizard | DEPLOYED TO STAGING | YES | YES | NO | NO | NO | YES | YES | NO | NO | NO | YES | YES | NO | NO | UX-D staging GO | f8cc0c4 |  |  |  |
| CRM-009 | CRM | Sales intelligence overlap with /leads resolved | PARTIALLY IMPLEMENTED | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  |  | Single nav entry polish |
| JOB-001 | jobs | Auto operational job title + JOB-###### numbering | DEPLOYED TO STAGING | YES | YES | NO | NO | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO | UX-A | f8cc0c4 |  |  |  |
| JOB-002 | jobs | New Job full create fields (property, urgency, access, docs) | DEPLOYED TO STAGING | YES | NO | NO | NO | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO | UX-A | f8cc0c4 |  |  |  |
| JOB-003 | jobs | Lead → customer → property → job chain (Phase 5 E2E 10/10) | OWNER VERIFIED | YES | YES | NO | NO | NO | YES | YES | NO | NO | NO | YES | YES | YES | NO | 140-staging-phase5-e2e.json | f8cc0c4 |  |  |  |
| JOB-004 | jobs | Job detail finance strip + quick actions | PARTIALLY IMPLEMENTED | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | JobFinanceStrip local | f8cc0c4 |  |  |  |
| JOB-005 | jobs | Job completion → billing chain panel | BUILT LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | Sprint 016 | f8cc0c4 |  |  |  |
| JOB-006 | booking | Portal appointment booking workflow | PARTIALLY IMPLEMENTED | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | EnterpriseCustomerExperienceService | f8cc0c4 |  |  |  |
| JOB-007 | booking | Lead/booking → dispatch notify on convert | DEPLOYED TO STAGING | YES | NO | NO | NO | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO | UX-D | f8cc0c4 |  |  |  |
| DSP-001 | dispatch | Dispatcher console in staff nav | DEPLOYED TO STAGING | YES | NO | NO | NO | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO | UX-K | f8cc0c4 |  |  |  |
| DSP-002 | dispatch | Crew/vehicle assignment office UI | OWNER VERIFIED | YES | YES | NO | NO | NO | YES | YES | NO | NO | NO | YES | YES | YES | NO | 141-staging-phase6-e2e.json | f8cc0c4 |  |  |  |
| DSP-003 | dispatch | Scheduling calendar with execution labels | TESTED LOCALLY | YES | YES | NO | NO | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  |  |  |
| DSP-004 | dispatch | Live dispatch map with honest capability states (no fake ETA) | PARTIALLY IMPLEMENTED | YES | NO | NO | NO | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO | UX-I Maps honesty | f8cc0c4 |  |  |  |
| DSP-005 | dispatch | Live technician travel/arrive/work domain events | NOT FOUND | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | Auto-update gap — TITAN_COMPLETE_APP_AUDIT |  |
| EXE-001 | job execution | Mobile job card capture + gated complete | DEPLOYED TO STAGING | YES | YES | NO | NO | NO | YES | NO | NO | NO | YES | YES | YES | NO | NO | UX-B 35/35 | f8cc0c4 |  |  |  |
| EXE-002 | job execution | Offline idempotency + IndexedDB flush | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | YES | YES | YES | NO | NO | mobile-offline-completion.test.ts | f8cc0c4 |  |  |  |
| EXE-003 | job execution | Binary evidence upload (photo/checklist/signature) | DEPLOYED TO STAGING | YES | NO | NO | NO | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO | UX-B/037 | f8cc0c4 |  |  |  |
| EXE-004 | job execution | Materials/variations → costing auto-update | NOT FOUND | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | Domain event not wired |  |
| EXE-005 | job execution | Technician tracking share with customer (live map) | NOT FOUND | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | UX-030; future phase |  |
| SCH-001 | schedules | Day/week/month calendar component with drag-drop reschedule | PARTIALLY IMPLEMENTED | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  |  | TITAN_NEXT_IMPLEMENTATION_STAGE_PLAN calendar phase |
| SCH-002 | schedules | Business-day timeline route (Phase 8 smoke GO) | DEPLOYED TO STAGING | YES | NO | NO | NO | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO | 142-staging-phase8-12-e2e.json | f8cc0c4 |  |  |  |
| TS-001 | timesheets | Job-linked time tracking office + mobile | BUILT LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | Sprint OPS-014 | f8cc0c4 |  |  |  |
| TS-002 | timesheets | Labour events in business-day timeline | PARTIALLY IMPLEMENTED | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  |  | Full AURA taxonomy |
| PAY-001 | payroll | Payroll preparation module (draft discipline) | FOUNDATION ONLY | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | EnterpriseWorkforceIntelligenceService scaffold | f8cc0c4 |  |  |  |
| PAY-002 | payroll | Live payroll provider integration | NOT FOUND | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | HR legal + provider gate |  |
| INV-001 | inventory | Stock levels + movement ledger | DEPLOYED TO STAGING | YES | NO | NO | NO | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO | Phase 10/11 smoke | f8cc0c4 |  |  |  |
| INV-002 | inventory | Van stock location + vehicle link | DEPLOYED TO STAGING | YES | NO | NO | NO | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO | UX-F | f8cc0c4 |  |  |  |
| INV-003 | inventory | Approve material → idempotent stock decrement | DEPLOYED TO STAGING | YES | NO | NO | NO | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO | INV-008 closed UX-F | f8cc0c4 |  |  |  |
| INV-004 | inventory | Tenant inventory in finance catalogue search | BUILT LOCALLY | YES | YES | NO | YES | YES | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-catalogue.service.test.ts | f8cc0c4 |  |  |  |
| WH-001 | warehouse | Warehouse locations + bin management UI | PARTIALLY IMPLEMENTED | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | Stock form location address UX-054 closed | f8cc0c4 |  |  |  |
| SUP-001 | suppliers | Supplier registry + price catalogue (procurement) | BUILT LOCALLY | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | supplier_price_catalogue_items schema | f8cc0c4 |  |  |  |
| PO-001 | PO | Purchase order create/receive → stock | DEPLOYED TO STAGING | YES | NO | NO | NO | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO | UX-F procurement UI | f8cc0c4 |  |  |  |
| PROC-001 | procurement | Procurement hub UI (/procurement suppliers/POs/receive) | DEPLOYED TO STAGING | YES | NO | NO | NO | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO | UX-F | f8cc0c4 |  |  |  |
| PROC-002 | procurement | Supplier OCR / Xero bill match | NOT FOUND | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | Sprint 014 deferral |  |
| FLT-001 | fleet | Fleet vehicle registry + status | PARTIALLY IMPLEMENTED | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | IntegrationsService | f8cc0c4 |  |  |  |
| FLT-002 | Cartrack | Cartrack live vehicle status client | FOUNDATION ONLY | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 | Cartrack API | Credentials not configured staging |  |
| FLT-003 | Cartrack | Cartrack drivers + geofences | NOT FOUND | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | FLT-003/006 |  |
| FLT-004 | Cartrack | Live fleet map on Owner Command Centre | NOT FOUND | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | FRZ-004 open; future phase |  |
| MNT-001 | maintenance | Preventative maintenance schedules | FOUNDATION ONLY | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | EnterpriseAssetLifecycleService scaffold | f8cc0c4 |  |  |  |
| MNT-002 | maintenance | Equipment lifecycle IoT telemetry | FOUNDATION ONLY | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | IoT provider gate |  |
| COC-001 | COC | COC compliance panel + SANS applicability helpers | DEPLOYED TO STAGING | YES | NO | NO | NO | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO | YG-001 UX-I | f8cc0c4 |  |  |  |
| COC-002 | COC | COC generation linked to job pack | PARTIALLY IMPLEMENTED | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | Sprint 015 local | f8cc0c4 |  |  |  |
| DOC-001 | document engine | TitanDocumentView Young Guns A4 template | BUILT LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | young-guns-theme @ f8cc0c4 | f8cc0c4 |  |  |  |
| DOC-002 | document engine | Job document pack approval + portal share | BUILT LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | Sprint 015 | f8cc0c4 |  |  |  |
| DOC-003 | document engine | OCR / supplier PDF match depth | PARTIALLY IMPLEMENTED | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | OCR depth partial per audit |  |
| FIN-001 | quotes | Title-free quote editor (no required title field) | BUILT LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | J-6.1 0178 | f8cc0c4 |  |  |  |
| FIN-002 | quotes | Full-width quote workspace (1440/1024/768/390) | BUILT LOCALLY | YES | YES | NO | NO | NO | NO | NO | YES | YES | YES | YES | YES | NO | NO | finance-workspace-layout.test.ts | f8cc0c4 |  |  |  |
| FIN-003 | quotes | Catalogue line search (inventory + YG pricebook gated) | BUILT LOCALLY | YES | YES | NO | YES | YES | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-j62-phase.test.ts | f8cc0c4 |  |  |  |
| FIN-004 | quotes | Genuine server PDF preview (Puppeteer/Chromium) | BUILT LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-document-pdf.service.test.ts | f8cc0c4 | Chromium on API pod |  |  |
| FIN-005 | quotes | Google Maps address autocomplete + manual fallback | BUILT LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-addresses-manual-fallback.test.ts | f8cc0c4 | Google Maps API key |  |  |
| FIN-006 | quotes | Live updates SSE without dirty-form overwrite | BUILT LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | live-updates stream route | f8cc0c4 |  |  |  |
| FIN-007 | invoices | Title-free invoice editor + Xero number pending honesty | BUILT LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-j6-phase.test.ts | f8cc0c4 |  |  |  |
| FIN-008 | invoices | Invoice stages (deposit/progress/final) per job | PARTIALLY IMPLEMENTED | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | UX-E staging | f8cc0c4 |  |  |  |
| FIN-009 | invoices | Synced Xero invoice edit blocked (409 SYNC_CONFLICT) | BUILT LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | xero-write-approval-gate.test.ts | f8cc0c4 |  |  |  |
| FIN-010 | finance | Finance list search + detail routes | DEPLOYED TO STAGING | YES | NO | NO | NO | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO | UX-E | f8cc0c4 |  |  |  |
| FIN-011 | finance | Cashflow / profit / reporting forecast pages | FOUNDATION ONLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-cashflow-profit.ts | f8cc0c4 |  | NOT VISUALLY VERIFIED on staging |  |
| FIN-012 | finance | Payment receipts on payment record | DEPLOYED TO STAGING | YES | NO | NO | NO | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO | FIN-004 UX-E | f8cc0c4 |  |  |  |
| FIN-013 | finance | Payment links / Yoco checkout | NOT FOUND | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | FIN-014 |  |
| FIN-014 | pricebook | Tenant-scoped pricebook table (YGP-001) | PARTIALLY IMPLEMENTED | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | YOUNG_GUNS_APPROVED_FINANCE_PRICEBOOK temp constants | f8cc0c4 |  |  |  |
| FIN-015 | pricebook | Dedicated pricebook catalog UI | NOT FOUND | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | FIN-015 deferral |  |
| J66A-001 | finance | Phase J-6.6A: Finance RBAC hardening (cost strip, catalogue, document routes) | TESTED LOCALLY | YES | YES | NO | YES | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-tenant-pricebook.test.ts; finance.service.ts sanitize | J-6.6A |  |  | Staging apply 0176–0178 |
| J66A-002 | finance | Phase J-6.6A: Save semantics (Save vs Save Draft vs Save & New) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-document-save.test.ts | J-6.6A |  |  | Owner finance E2E |
| J66A-003 | finance | Phase J-6.6A: Five reproducible test fixes (Cartrack TZ, doc-engine, merge heading) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | shared 909/909; web 303/303; api 1046/1046 | J-6.6A |  |  |  |
| J66A-004 | finance | Phase J-6.6A: Migration 0176 apply script hardening (backup gate, staging ref) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-migration-0176.test.ts; apply-0176-staging-only.mjs | J-6.6A | 0176 |  | Owner-approved staging apply |
| J66A-005 | repo | Phase J-6.6A: Authoritative master completion checklist (this document) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | docs/TITAN_MASTER_COMPLETION_CHECKLIST.md (166 rows) | J-6.6A |  |  | Maintain register each phase |
| J66B-001 | ui | Phase J-6.6B: Global Young Guns tokens and shared component remediation | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | tokens.css; styles.css; young-guns-utilities.css | J-6.6B |  |  | Owner visual sign-off |
| J66B-002 | ui | Phase J-6.6B: Command surface visual parity (Owner/Executive/AURA) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | command-centre-page classes; Executive + AURA pages | J-6.6B |  |  | Canonical route decision pending Owner |
| J66B-003 | ui | Phase J-6.6B: Intelligence page legacy cyan/teal removal | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | remediate-legacy-cyan.mjs; young-guns-visual-j66b.test.ts | J-6.6B |  |  |  |
| J66B-004 | ui | Phase J-6.6B: Finance preview modal + completion report Young Guns styling | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-document-preview.css; buildCompletionReportHtml shell | J-6.6B |  |  | Report export pipeline still not implemented |
| J66B-005 | ui | Phase J-6.6B: Skip-to-content, map/banner tokens, visual contract tests | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | layout.tsx skip link; young-guns-theme.spec.ts | J-6.6B |  |  | Authenticated viewport E2E pending |
| J66C-001 | finance | Phase J-6.6C: Work Completed section (invoice-only, populated) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-document-preview-html.test.ts | J-6.6C |  |  | Finance editor UI field not wired — preview API accepts workCompleted |
| J66C-002 | finance | Phase J-6.6C: Warranty conditional rendering (no defaults) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-document-preview-sections.test.ts | J-6.6C |  |  | Editor UI field not wired — preview API accepts warranty |
| J66C-003 | finance | Phase J-6.6C: COC support (attached state only, no fabrication) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-document-preview-html.test.ts | J-6.6C |  |  | Editor COC wiring pending — API discriminated union |
| J66C-004 | finance | Phase J-6.6C: Before/after photo grouping + non-image file refs | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-document-preview-photos.service.ts | J-6.6C |  |  |  |
| J66C-005 | finance | Phase J-6.6C: Contact/help section from YOUNG_GUNS_CONTACT | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | document-engine.ts YOUNG_GUNS_CONTACT | J-6.6C |  |  | Tenant config override future |
| J66C-006 | finance | Phase J-6.6C: Payment/bank visibility (draft hidden unless override) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-document-preview-sections.test.ts | J-6.6C |  |  | Owner decision: draft preview payment override policy |
| J66C-007 | finance | Phase J-6.6C: Yoco payment link conditional render | PARTIALLY IMPLEMENTED | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | sanitizeFinancePreviewPaymentUrl; yoco HTML tests | J-6.6C |  | BLOCKED — finance preview has no auto source from invoice_payment_links | Wire document-engine Yoco link into finance preview |
| J66C-008 | finance | Phase J-6.6C: Google review stars + optional QR | PARTIALLY IMPLEMENTED | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | review section lifecycle tests | J-6.6C |  | BLOCKED — VERIFIED URL NOT FOUND in tenant config | Add tenant googleReviewUrl configuration |
| J66C-009 | finance | Phase J-6.6C: Document number/status honesty (Xero pending, no UUID) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-document-preview.test.ts | J-6.6C |  |  |  |
| J66C-010 | finance | Phase J-6.6C: Multi-page print CSS (break-inside, table headers) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-document-preview-html.test.ts 30-line table | J-6.6C |  | NOT VISUALLY VERIFIED | Puppeteer multi-page render audit pending |
| J66C-011 | finance | Phase J-6.6C: Quote vs invoice section visibility contract tests | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-document-preview-sections.test.ts; html tests | J-6.6C |  |  |  |
| J66C-012 | repo | Phase J-6.6C: Authoritative checklist update (this document) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | docs/TITAN_MASTER_COMPLETION_CHECKLIST.md | J-6.6C |  |  | Maintain register each phase |
| J66D-001 | finance | Phase J-6.6D: Quote editor section wiring (scope, terms, warranty, maintenance) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | FinanceDocumentSectionsFields; QuoteCreate/Edit pages; finance-document-sections-state.test.ts | J-6.6D |  | NOT VISUALLY VERIFIED | Authenticated staging editor E2E pending |
| J66D-002 | finance | Phase J-6.6D: Invoice Work Completed dedicated field (save/reload/preview) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | titan_documents.content; InvoiceCreate/Edit; roundtrip tests | J-6.6D |  | NOT VISUALLY VERIFIED |  |
| J66D-003 | finance | Phase J-6.6D: Warranty + Recommended Maintenance round-trip (no defaults) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-document-content.test.ts; sections-state.test.ts | J-6.6D |  |  |  |
| J66D-004 | finance | Phase J-6.6D: Genuine COC evidence connection (typed metadata, tenant-scoped) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-document-sections.service.test.ts; FinanceCocEvidenceSelector | J-6.6D |  | NOT VISUALLY VERIFIED |  |
| J66D-005 | finance | Phase J-6.6D: Server-sourced Yoco payment URL from invoice_payment_links | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-document-preview-enrichment.service.test.ts | J-6.6D |  |  | Client paymentUrl ignored; saved invoice only |
| J66D-006 | finance | Phase J-6.6D: Owner-managed googleReviewUrl tenant setting | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | CompanySettingsPage; company route Owner gate; security audit log | J-6.6D |  | NOT VISUALLY VERIFIED | No migration — JSON preferences |
| J66D-007 | finance | Phase J-6.6D: Draft bank-detail preview policy (Owner override) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | FinanceDraftPaymentToggle; enrichment resolveShowPaymentDetails | J-6.6D |  | NOT VISUALLY VERIFIED | Interim policy pending Owner visual verification |
| J66D-008 | finance | Phase J-6.6D: Preview API server authority (spoofed URL rejection) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance routes preview schema; enrichment service | J-6.6D |  |  |  |
| J66D-009 | finance | Phase J-6.6D: Four-editor round-trip tests (create/edit save reload) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-document-roundtrip.service.test.ts; finance-document-sections-state.test.ts | J-6.6D |  |  |  |
| J66D-010 | finance | Phase J-6.6D: Genuine multi-page Puppeteer PDF proof | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-document-multipage-pdf.test.ts; test-results/j66d/*.pdf | J-6.6D | Chromium | NOT VISUALLY VERIFIED | Local Puppeteer evidence only — not Owner verified |
| J66D-011 | finance | Phase J-6.6D: Accessibility/responsive finance section fields | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-j64/j64a Playwright contracts; labeled controls | J-6.6D |  | NOT VISUALLY VERIFIED | Not authenticated staging verification |
| J66D-012 | repo | Phase J-6.6D: Authoritative checklist update (this document) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | docs/TITAN_MASTER_COMPLETION_CHECKLIST.md | J-6.6D |  |  | 195 requirement rows after J-6.6D |
| J67A-001 | reports | Phase J-6.7A: Shared operational report PDF architecture (shell + Chromium renderer) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | chromium-pdf.service.ts; young-guns-report-shell; operational-report*.ts | J-6.7A | Chromium | NOT VISUALLY VERIFIED | Local Puppeteer only |
| J67A-002 | reports | Phase J-6.7A: Genuine job report PDF export (tenant data, RBAC) | TESTED LOCALLY | YES | YES | NO | YES | YES | NO | NO | NO | NO | NO | YES | YES | NO | NO | report-export.service.ts; GET /report-exports/jobs/:jobId/pdf | J-6.7A |  | NOT VISUALLY VERIFIED |  |
| J67A-003 | reports | Phase J-6.7A: Completion report Young Guns PDF export | TESTED LOCALLY | YES | YES | NO | YES | YES | NO | NO | NO | NO | NO | YES | YES | NO | NO | completion-report HTML + embedded photos; GET /completion/:id/pdf | J-6.7A |  | NOT VISUALLY VERIFIED | Stored HTML preview retained |
| J67A-004 | reports | Phase J-6.7A: Service report PDF export from job execution data | TESTED LOCALLY | YES | YES | NO | YES | YES | NO | NO | NO | NO | NO | YES | YES | NO | NO | buildServiceReportHtml; GET /jobs/:id/service/pdf | J-6.7A |  | NOT VISUALLY VERIFIED |  |
| J67A-005 | reports | Phase J-6.7A: Maintenance report PDF export from plan/run data | TESTED LOCALLY | YES | YES | NO | YES | YES | NO | NO | NO | NO | NO | YES | YES | NO | NO | ops maintenance runs; GET /maintenance/runs/:id/pdf | J-6.7A |  | NOT VISUALLY VERIFIED |  |
| J67A-006 | reports | Phase J-6.7A: Internal vs client-safe report models (server-side filtering) | TESTED LOCALLY | YES | YES | NO | YES | YES | NO | NO | NO | NO | NO | YES | YES | NO | NO | resolveJobContextForAudience; operational-report-html.test.ts | J-6.7A |  |  |  |
| J67A-007 | reports | Phase J-6.7A: Report export RBAC matrix tests | TESTED LOCALLY | YES | YES | NO | YES | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | report-export.service.test.ts | J-6.7A |  |  |  |
| J67A-008 | reports | Phase J-6.7A: Tenant-scoped report routes and evidence denial | TESTED LOCALLY | YES | YES | NO | YES | YES | NO | NO | NO | NO | NO | YES | YES | NO | NO | companyId filters in report-export.service; embed service job match | J-6.7A |  |  | Cross-tenant matrix reuses existing patterns |
| J67A-009 | reports | Phase J-6.7A: Photos/signatures/attachments honest rendering | TESTED LOCALLY | YES | YES | NO | NO | YES | NO | NO | NO | NO | NO | YES | YES | NO | NO | report-photo-embed.service.ts; no storage paths in HTML | J-6.7A |  |  |  |
| J67A-010 | reports | Phase J-6.7A: Multi-page Puppeteer operational report proof | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | operational-report-multipage-pdf.test.ts; test-results/j67a/*.pdf | J-6.7A | Chromium | NOT VISUALLY VERIFIED | Local artifacts gitignored |
| J67A-011 | reports | Phase J-6.7A: UI entry points (Preview/Download on job, completion, maintenance) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | ReportExportActions; JobDetailPage; CompletionReportDetailPage; RecurringMaintenancePage | J-6.7A |  | NOT VISUALLY VERIFIED | Playwright layout contracts |
| J67A-012 | repo | Phase J-6.7A: Authoritative checklist update (this document) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | docs/TITAN_MASTER_COMPLETION_CHECKLIST.md | J-6.7A |  |  | 207 requirement rows after J-6.7A |
| J67B-001 | reports | Phase J-6.7B: Canonical server-derived report audience resolver | TESTED LOCALLY | YES | YES | NO | YES | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | packages/shared/src/report-audience.ts | J-6.7B |  |  | Query audience not security authority |
| J67B-002 | reports | Phase J-6.7B: Technician internal-report escalation blocked | TESTED LOCALLY | YES | YES | NO | YES | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | report-audience.test.ts; assigned tech ?audience=internal clamped | J-6.7B |  |  | Closes J-6.7A jobs:read internal gap |
| J67B-003 | reports | Phase J-6.7B: Technician assignment enforcement (job/crew/run) | TESTED LOCALLY | YES | YES | NO | YES | YES | NO | NO | NO | NO | NO | YES | YES | NO | NO | userHasJobAccess; report-export.service.ts | J-6.7B |  |  |  |
| J67B-004 | reports | Phase J-6.7B: Client Portal customer relationship enforcement | TESTED LOCALLY | YES | YES | NO | YES | YES | NO | NO | NO | NO | NO | YES | YES | NO | NO | /api/v1/portal/report-exports; resolvePortalReportAudience | J-6.7B |  | NOT VISUALLY VERIFIED |  |
| J67B-005 | reports | Phase J-6.7B: Query-parameter escalation prevention + audit | TESTED LOCALLY | YES | YES | NO | YES | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | parseRequestedReportAudience; security audit log on clamp | J-6.7B |  |  |  |
| J67B-006 | reports | Phase J-6.7B: Audience-safe typed projections (job/completion/maintenance) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | toClientSafe*; projectCompletionPayloadForAudience | J-6.7B |  |  |  |
| J67B-007 | reports | Phase J-6.7B: HTML/PDF sensitive-field leak tests | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | assertReportHtmlFreeOfSensitiveFields | J-6.7B |  |  |  |
| J67B-008 | reports | Phase J-6.7B: UI role behaviour (no audience selector; portal/mobile/staff) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | ReportExportActions; MobileJobDetailPage; PortalJobDetailPage | J-6.7B |  | NOT VISUALLY VERIFIED |  |
| J67B-009 | reports | Phase J-6.7B: RBAC matrix tests all four report families | TESTED LOCALLY | YES | YES | NO | YES | YES | NO | NO | NO | NO | NO | YES | YES | NO | NO | report-export-audience.test.ts; report-audience.test.ts | J-6.7B |  |  |  |
| J67B-010 | repo | Phase J-6.7B: Authoritative checklist update (this document) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | docs/TITAN_MASTER_COMPLETION_CHECKLIST.md | J-6.7B |  |  | 219 requirement rows after J-6.7B |
| J67C-001 | reports | Phase J-6.7C: Workforce report kinds (activity/timesheet/productivity/operations) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | packages/shared/src/workforce-report.ts | J-6.7C |  |  |  |
| J67C-002 | reports | Phase J-6.7C: Technician Activity Report PDF (genuine tenant data) | TESTED LOCALLY | YES | YES | NO | YES | YES | NO | NO | NO | NO | NO | YES | YES | NO | NO | workforce-report-data.service.ts; buildTechnicianActivityReportHtml | J-6.7C |  | NOT VISUALLY VERIFIED |  |
| J67C-003 | reports | Phase J-6.7C: Technician Timesheet Report PDF (wi_timesheets + mobile entries) | TESTED LOCALLY | YES | YES | NO | YES | YES | NO | NO | NO | NO | NO | YES | YES | NO | NO | buildTimesheetDailyRows; no wage calculation | J-6.7C |  |  |  |
| J67C-004 | reports | Phase J-6.7C: Technician Productivity Report (transparent metrics, no scores) | TESTED LOCALLY | YES | YES | NO | YES | YES | NO | NO | NO | NO | NO | YES | YES | NO | NO | numerator/denominator metrics; no computeProductivityScore in PDF | J-6.7C |  |  |  |
| J67C-005 | reports | Phase J-6.7C: Workforce Operations Summary (internal aggregates) | TESTED LOCALLY | YES | YES | NO | YES | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | exportWorkforceOperationsPdf | J-6.7C |  |  |  |
| J67C-006 | reports | Phase J-6.7C: Report period validation (Africa/Johannesburg, max 93 days) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | workforce-report-period.ts | J-6.7C |  |  |  |
| J67C-007 | reports | Phase J-6.7C: Workforce RBAC + technician self-service /me routes | TESTED LOCALLY | YES | YES | NO | YES | YES | NO | NO | NO | NO | NO | YES | YES | NO | NO | workforce-report-access.ts; /workforce/me/* | J-6.7C |  |  |  |
| J67C-008 | reports | Phase J-6.7C: Honest unavailable states (no fake zeroes) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | WorkforceMetricState; dataQualityNotes | J-6.7C |  |  |  |
| J67C-009 | reports | Phase J-6.7C: Multi-page Puppeteer workforce PDF proof | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | workforce-report-multipage-pdf.test.ts; test-results/j67c/*.pdf | J-6.7C | Chromium | NOT VISUALLY VERIFIED |  |
| J67C-010 | reports | Phase J-6.7C: UI entry points (mobile self-service + TI workforce summary) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | WorkforceReportExportActions; MobilePerformancePage | J-6.7C |  | NOT VISUALLY VERIFIED |  |
| J67C-011 | reports | Phase J-6.7C: HTML/PDF payroll leakage tests | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | assertWorkforceReportHtmlSafe | J-6.7C |  |  |  |
| J67C-012 | repo | Phase J-6.7C: Authoritative checklist update (this document) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | docs/TITAN_MASTER_COMPLETION_CHECKLIST.md | J-6.7C |  |  | 231 requirement rows after J-6.7C |
| J67D-001 | reports | Phase J-6.7D: Finance/customer source audit + source-of-truth policy | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-report-source-policy.ts | J-6.7D |  |  | TITAN ledger + Xero history; no double-count |
| J67D-002 | reports | Phase J-6.7D: Finance Aggregate Summary PDF export | TESTED LOCALLY | YES | YES | NO | YES | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-report-data.service.ts; GET /finance/aggregate/pdf | J-6.7D |  | NOT VISUALLY VERIFIED | Profit unavailable unless canonical P&amp;L |
| J67D-003 | reports | Phase J-6.7D: Cash-Flow and Collections Report PDF export | TESTED LOCALLY | YES | YES | NO | YES | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | payments-only inflows; bank feed informational | J-6.7D |  |  |  |
| J67D-004 | reports | Phase J-6.7D: Accounts Receivable and Aging Report PDF export | TESTED LOCALLY | YES | YES | NO | YES | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | classifyAgingBucket; GET /finance/receivables/pdf | J-6.7D |  |  | Server-side aging buckets |
| J67D-005 | reports | Phase J-6.7D: Customer and Property History Report (internal) | TESTED LOCALLY | YES | YES | NO | YES | YES | NO | NO | NO | NO | NO | YES | YES | NO | NO | GET /customers/:id/history/pdf | J-6.7D |  |  | Public references only |
| J67D-006 | reports | Phase J-6.7D: Client-safe customer history (portal) | TESTED LOCALLY | YES | YES | NO | YES | YES | NO | NO | NO | NO | NO | YES | YES | NO | NO | projectCustomerHistoryForClient; GET /portal/.../customer/history/pdf | J-6.7D |  |  | Server-derived portal customer |
| J67D-007 | reports | Phase J-6.7D: Finance report period validation (366d / 5yr history) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-report-period.ts | J-6.7D |  |  | Africa/Johannesburg default |
| J67D-008 | reports | Phase J-6.7D: Finance RBAC + technician/client denial matrix | TESTED LOCALLY | YES | YES | NO | YES | YES | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-report-access.ts | J-6.7D |  |  |  |
| J67D-009 | reports | Phase J-6.7D: Duplicate-prevention + honest freshness states | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | resolveFinanceFreshness; FINANCE_DUPLICATE_PREVENTION_BASIS | J-6.7D |  |  |  |
| J67D-010 | reports | Phase J-6.7D: Money/VAT/currency safety (no float; stored VAT) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | formatFinanceAuraCents; mixed-currency warnings | J-6.7D |  |  |  |
| J67D-011 | reports | Phase J-6.7D: Multi-page Puppeteer finance PDF proof | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-report-multipage-pdf.test.ts; test-results/j67d/*.pdf | J-6.7D | Chromium | NOT VISUALLY VERIFIED |  |
| J67D-012 | reports | Phase J-6.7D: UI entry points (finance pages, CRM, portal) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | FinanceReportExportActions; FinanceReportingForecastPage; PortalFinancePage | J-6.7D |  | NOT VISUALLY VERIFIED |  |
| J67D-013 | reports | Phase J-6.7D: HTML/PDF sensitive-field leak tests | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | assertFinanceReportHtmlSafe | J-6.7D |  |  |  |
| J67D-014 | repo | Phase J-6.7D: Authoritative checklist update (this document) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | docs/TITAN_MASTER_COMPLETION_CHECKLIST.md | J-6.7D |  |  | 243 requirement rows after J-6.7D |
| J67E-001 | reports | Phase J-6.7E: Extended report kinds (inspection/fleet/compliance) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | packages/shared/src/extended-report.ts | J-6.7E |  |  |  |
| J67E-002 | reports | Phase J-6.7E: Inspection Report PDF (eligible job evidence only) | TESTED LOCALLY | YES | YES | NO | YES | YES | NO | NO | NO | NO | NO | YES | YES | NO | NO | extended-report-data.service.ts; GET /jobs/:id/inspection/pdf | J-6.7E |  | NOT VISUALLY VERIFIED | isJobInspectionEligible gate |
| J67E-003 | reports | Phase J-6.7E: Fleet Vehicle Activity Report (stored GPS segmentation) | TESTED LOCALLY | YES | YES | NO | YES | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | GET /fleet/vehicles/:id/activity/pdf | J-6.7E |  |  | No live Cartrack calls |
| J67E-004 | reports | Phase J-6.7E: Fleet Operations Summary PDF | TESTED LOCALLY | YES | YES | NO | YES | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | GET /fleet/operations/pdf | J-6.7E |  |  |  |
| J67E-005 | reports | Phase J-6.7E: Compliance and COC Support Report (legal notice) | TESTED LOCALLY | YES | YES | NO | YES | YES | NO | NO | NO | NO | NO | YES | YES | NO | NO | resolveCocAttachmentState; GET /jobs/:id/compliance-support/pdf | J-6.7E |  |  | No fake COC |
| J67E-006 | reports | Phase J-6.7E: Compliance and COC Register Report (internal) | TESTED LOCALLY | YES | YES | NO | YES | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | GET /compliance/coc-register/pdf | J-6.7E |  |  | Technician/portal denied |
| J67E-007 | reports | Phase J-6.7E: Extended report period validation (93d fleet / 366d register) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | extended-report-period.ts | J-6.7E |  |  |  |
| J67E-008 | reports | Phase J-6.7E: Extended RBAC + fleet/compliance denial matrix | TESTED LOCALLY | YES | YES | NO | YES | YES | NO | NO | NO | NO | NO | YES | YES | NO | NO | extended-report-access.ts | J-6.7E |  |  | Job reports use report-audience |
| J67E-009 | reports | Phase J-6.7E: Fleet freshness + honest COC attachment states | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | extended-report-source-policy.ts | J-6.7E |  |  |  |
| J67E-010 | reports | Phase J-6.7E: Coordinate/payroll/provider-ID leak prevention | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | assertExtendedReportHtmlSafe | J-6.7E |  |  |  |
| J67E-011 | reports | Phase J-6.7E: Multi-page Puppeteer extended PDF proof | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | extended-report-multipage-pdf.test.ts; test-results/j67e/*.pdf | J-6.7E | Chromium | NOT VISUALLY VERIFIED | 5 PDF scenarios |
| J67E-012 | reports | Phase J-6.7E: UI entry points (job, fleet, compliance, portal) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | ExtendedReportExportActions; JobDetailPage; FleetIntelligencePage; ComplianceIntelligencePage | J-6.7E |  | NOT VISUALLY VERIFIED |  |
| J67E-013 | reports | Phase J-6.7E: Client-safe inspection/compliance-support portal exports | TESTED LOCALLY | YES | YES | NO | YES | YES | NO | NO | NO | NO | NO | YES | YES | NO | NO | PortalJobDetailPage; portal report-exports routes | J-6.7E |  |  |  |
| J67E-014 | repo | Phase J-6.7E: Authoritative checklist update (this document) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | docs/TITAN_MASTER_COMPLETION_CHECKLIST.md | J-6.7E |  |  | 257 requirement rows after J-6.7E |
| J67F-001 | integrations | Phase J-6.7F: Social connection foundation types + foundation status model | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | packages/shared/src/social-connection.ts | J-6.7F |  |  | 3 social publishing providers |
| J67F-002 | integrations | Phase J-6.7F: OAuth state storage (social_oauth_states migration 0179) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | packages/db/drizzle/0179_social_connection_foundation.sql | J-6.7F |  |  | Migration file only — not applied |
| J67F-003 | integrations | Phase J-6.7F: Server-controlled OAuth start/callback + state replay rejection | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | social-connection.service.ts; POST /oauth/start; GET /oauth/callback | J-6.7F |  |  | Mock OAuth for local tests |
| J67F-004 | integrations | Phase J-6.7F: Account discovery + server-validated account selection | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | GET /accounts/:provider; POST /accounts/select | J-6.7F |  |  | Invalid selection rejected |
| J67F-005 | integrations | Phase J-6.7F: Encrypted credential storage + no token exposure in API | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | encryptSocialMediaCredentials; redactSocialConnectionForApi | J-6.7F |  |  |  |
| J67F-006 | integrations | Phase J-6.7F: Connection health check (tenant-scoped, no publish) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | POST /social-connections/health | J-6.7F |  |  |  |
| J67F-007 | integrations | Phase J-6.7F: Reconnect + disconnect credential revocation | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | POST /reconnect; POST /disconnect | J-6.7F |  |  |  |
| J67F-008 | integrations | Phase J-6.7F: RBAC — Owner manage; Admin boundaries; tech/client denied | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | canAccessSocialConnections; canManageSocialConnections | J-6.7F |  |  | Cross-tenant denial |
| J67F-009 | integrations | Phase J-6.7F: Provider cards UI in Integrations (3 social providers) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | SocialConnectionsSection; IntegrationsDashboardPage | J-6.7F |  | NOT VISUALLY VERIFIED | Mobile 390px |
| J67F-010 | integrations | Phase J-6.7F: TikTok PROVIDER_REVIEW_REQUIRED — no fake Connected | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | social-connection-provider.adapter.ts | J-6.7F |  |  | TIKTOK_LIVE_OAUTH_ENABLED gate |
| J67F-011 | integrations | Phase J-6.7F: WhatsApp remains separate Communications integration | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | /integrations/whatsapp; whatsapp_connections unchanged | J-6.7F |  |  | Not in Social Connections UI |
| J67F-012 | integrations | Phase J-6.7F: Audit events for connect/callback/select/reconnect/disconnect/failure | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | securityAuditLogs; socialMediaConnectionEvents | J-6.7F |  |  |  |
| J67F-013 | integrations | Phase J-6.7F: Provider setup documentation (no secrets) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | docs/SOCIAL_CONNECTION_PROVIDER_SETUP.md | J-6.7F |  |  |  |
| J67F-014 | repo | Phase J-6.7F: Authoritative checklist update (this document) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | docs/TITAN_MASTER_COMPLETION_CHECKLIST.md | J-6.7F |  |  | 271 requirement rows after J-6.7F |
| XERO-001 | Xero | OAuth connect + tenant isolation | DEPLOYED TO STAGING | YES | NO | YES | NO | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO | TITAN_FRZ018_XERO_STAGING_REPORT.md | f8cc0c4 |  |  |  |
| XERO-002 | Xero | Background historical import (contacts/invoices/payments) | PARTIALLY IMPLEMENTED | YES | NO | YES | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 | Xero OAuth | Import job running; last_sync_at null |  |
| XERO-003 | Xero | Xero as sole official quote/invoice numbering authority | BUILT LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-document-preview.test.ts | f8cc0c4 |  |  |  |
| XERO-004 | Xero | Two-way write with Owner approval gate | PARTIALLY IMPLEMENTED | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | Live write gated — FIN-005/007 NOT GO |  |
| XERO-005 | Xero | Decision 3 contact classification (ACCREC paid-buyer) | DEPLOYED TO STAGING | YES | NO | NO | NO | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO | UX-H classifier | f8cc0c4 |  |  |  |
| ATT-001 | attachments | Finance direct upload (image/PDF) without job link | BUILT LOCALLY | YES | YES | NO | YES | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-j64a-phase.test.ts | f8cc0c4 |  |  |  |
| ATT-002 | attachments | Job evidence storage + titan_documents.photos JSONB | BUILT LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-document-evidence-storage.service.test.ts | f8cc0c4 |  |  |  |
| ATT-003 | attachments | Include-in-PDF toggle + caption/order persistence | BUILT LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-document-photos.test.ts | f8cc0c4 |  |  |  |
| PDF-001 | Chromium/PDF | PuppeteerFinanceDocumentPdfRenderer (%PDF signature) | BUILT LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-document-pdf.service.test.ts | f8cc0c4 | Chromium |  |  |
| PDF-002 | Chromium/PDF | API /health/pdf-renderer diagnostic | BUILT LOCALLY | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | health route | f8cc0c4 | Chromium on staging pod |  |  |
| STOR-001 | storage | JOB_EVIDENCE_STORAGE_PATH persistent volume | PARTIALLY IMPLEMENTED | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 | Railway volume /var/lib/titan/storage | Staging volume mount unverified locally |  |
| STOR-002 | storage | Staging finance attachment cleanup service | BUILT LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-document-staging-cleanup.service.test.ts | f8cc0c4 |  |  |  |
| CLN-001 | cleanup | 59 E2E disposable tenant cleanup manifest | FOUNDATION ONLY | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | TITAN_STAGING_DATA_CLEANUP_MANIFEST.md | f8cc0c4 |  | Owner approval required |  |
| CLN-002 | cleanup | Staging data hygiene (1 live tenant + QA isolation) | PARTIALLY IMPLEMENTED | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | 180-staging-data-cleanup-audit FAIL |  |
| INT-001 | Gmail | Gmail intelligence backend (Decision 4 NOT IMPLEMENTED) | NOT FOUND | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | TITAN_COMPLETE_APP_AUDIT FAIL | f8cc0c4 |  | COM-006 honesty-only card |  |
| INT-002 | WhatsApp | WhatsApp Graph client + webhooks scaffold | FOUNDATION ONLY | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 | Meta credentials | NOT_AUDITED live |  |
| INT-003 | WhatsApp | WhatsApp human takeover + live send | NOT FOUND | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | COM-003; credentials gate |  |
| INT-004 | WhatsApp | Contact enrichment for missing mobile (COM-013) | PARTIALLY IMPLEMENTED | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | TITAN_WHATSAPP_CONTACT_ENRICHMENT.md | f8cc0c4 |  |  |  |
| INT-005 | Yoco | Yoco business profile sync | PARTIALLY IMPLEMENTED | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 | Yoco secret | No payment links/charges FIN-011 |  |
| INT-006 | Resend | Transactional email via Resend/SMTP connector | PARTIALLY IMPLEMENTED | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | SMTP available; not Gmail-branded | f8cc0c4 |  |  |  |
| INT-007 | Maps | Google Maps autocomplete (finance addresses) | BUILT LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 | Google Maps API |  |  |
| INT-008 | Maps | Live Directions / ETA routing | NOT FOUND | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | FLT-008 deferred |  |
| INT-009 | social | Meta/Google ads adapters live | FOUNDATION ONLY | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | MKT-003 not connected |  |
| INT-010 | bank | Open banking / bank feed integration | NOT FOUND | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | Future scope |  |
| INT-011 | notifications | Push + in-app notification delivery | PARTIALLY IMPLEMENTED | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | notification_intelligence agent scaffold | f8cc0c4 |  |  |  |
| INT-012 | Gmail | Integrations hub truthful NOT IMPLEMENTED badge | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | IntegrationAutoSyncStatusPanel | f8cc0c4 |  |  |  |
| MKT-001 | marketing | Marketing consent + eligibility gates (POPIA) | DEPLOYED TO STAGING | YES | NO | NO | NO | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO | UX-H/UX-026 | f8cc0c4 |  |  |  |
| MKT-002 | marketing | Campaign execute — honest SEND_PATH_NOT_IMPLEMENTED | DEPLOYED TO STAGING | YES | NO | NO | NO | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  |  |  |
| MKT-003 | marketing | Live email/SMS/WhatsApp campaign send | NOT FOUND | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | Provider + Owner approval |  |
| RPT-001 | reports | Owner dashboard KPI strip + today scheduled panel | DEPLOYED TO STAGING | YES | NO | NO | NO | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO | UX-I/UX-012 | f8cc0c4 |  |  |  |
| RPT-002 | reports | Analytics KPI definitions on home | PARTIALLY IMPLEMENTED | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | UX-038 |  |
| RPT-003 | reports | End-to-end quote → cash reporting chain | NOT FOUND | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | Chain not live-verified |  |
| RPT-004 | reports | Enterprise BI / data warehouse pages | FOUNDATION ONLY | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | NOT VISUALLY VERIFIED — decorative |  |
| AURA-001 | AURA | AURA chat with configured provider (OpenAI/Claude/Gemini) | DEPLOYED TO STAGING | YES | NO | YES | NO | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO | FRZ-015 12/12 GO | f8cc0c4 |  |  |  |
| AURA-002 | AURA | Multi-AI gateway + provider registry | PARTIALLY IMPLEMENTED | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | ai-orchestration routes | f8cc0c4 |  |  |  |
| AURA-003 | AURA | Agent orchestration engine (backend handoffs) | BUILT LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | agent-orchestration.service.ts | f8cc0c4 |  |  |  |
| AURA-004 | AURA | Agent orchestration web UI | NOT FOUND | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | TITAN_AURA_AGENT_COLLABORATION_AUDIT |  |
| AURA-005 | AURA | AURA approved actions fail loudly (no silent no-op) | PARTIALLY IMPLEMENTED | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | UX-032 |  |
| AI-001 | AI agent families | Executive Intelligence agents (6) — registry + runtime scaffold | FOUNDATION ONLY | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | AGENT_REGISTRY executive* | f8cc0c4 |  |  |  |
| AI-002 | AI agent families | Finance Intelligence agents (8) — finance_aura routes wired | PARTIALLY IMPLEMENTED | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | finance-aura-agent.test.ts | f8cc0c4 |  |  |  |
| AI-003 | AI agent families | Operations/Dispatch agents (8) — scheduling/dispatch scaffold | FOUNDATION ONLY | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  |  |  |
| AI-004 | AI agent families | Technician Intelligence agents (5) — mobile assistant scaffold | FOUNDATION ONLY | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  |  |  |
| AI-005 | AI agent families | Fleet Intelligence agents (5) — fleet manager scaffold | FOUNDATION ONLY | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | Cartrack gate |  |
| AI-006 | AI agent families | Inventory & Procurement agents (5) | FOUNDATION ONLY | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  |  |  |
| AI-007 | AI agent families | HR & Workforce agents (5) | FOUNDATION ONLY | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  |  |  |
| AI-008 | AI agent families | Marketing Intelligence agents (8) — honest blocked send | PARTIALLY IMPLEMENTED | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  |  |  |
| AI-009 | AI agent families | Customer Experience agents (7) — receptionist/voice scaffold | FOUNDATION ONLY | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  |  |  |
| AI-010 | AI agent families | Document/Compliance agents — document_intelligence wired | PARTIALLY IMPLEMENTED | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  |  |  |
| AI-011 | AI agent families | 77-agent V1 audit complete per checklist | NOT FOUND | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | TITAN_AURA_V1_FINAL_ACCEPTANCE_CHECKLIST.md — 0/77 verified |  |
| OPS-001 | audit logs | Workflow audit logs + central security audit | PARTIALLY IMPLEMENTED | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | workflow-audit-logs schema | f8cc0c4 |  |  |  |
| OPS-002 | system health | /api/v1/health + /health/ready database connected | DEPLOYED TO STAGING | YES | NO | YES | NO | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  |  |  |
| OPS-003 | system health | Background work status panel | PARTIALLY IMPLEMENTED | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | Not embedded all pages |  |
| SEC-001 | security | Forbidden-action API matrix (71 tests) | TESTED LOCALLY | YES | YES | NO | YES | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  |  |  |
| SEC-002 | security | MFA + step-up auth for sensitive actions | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  |  |  |
| SEC-003 | security | Enterprise zero-trust decorative pages vs real controls | PARTIALLY IMPLEMENTED | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | Useful-function audit FAIL on enterprise pages |  |
| BAK-001 | backups | Staging pg_dump backup gate before migrations | FOUNDATION ONLY | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | apply-0176-staging-only.mjs | f8cc0c4 |  | Phase 2 not run — no credentials |  |
| BAK-002 | backups | Disaster recovery policies + backup verification UI | FOUNDATION ONLY | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | EnterpriseProductionReadinessService | f8cc0c4 |  |  |  |
| RB-001 | rollback | Git + Railway revision rollback documented | PARTIALLY IMPLEMENTED | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | TITAN_STAGING_BASELINE_FREEZE.md | f8cc0c4 |  |  |  |
| RB-002 | rollback | Database restore from verified backup | NOT FOUND | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | No backup created this cycle |  |
| MON-001 | monitoring | Mission Control alert sync | FOUNDATION ONLY | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | NOT VISUALLY VERIFIED |  |
| MON-002 | monitoring | Performance audit + observability Phase 22 | NOT FOUND | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | PIPE-10 queued |  |
| UX-001 | accessibility | Finance workspace reflow without overflow-x clip | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | YES | YES | YES | YES | YES | NO | NO |  | f8cc0c4 |  |  |  |
| UX-002 | accessibility | Young Guns dark theme consistent (global J-6.6B remediation) | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | young-guns-theme.test.ts; young-guns-visual-j66b.test.ts | J-6.6B |  |  | Owner/Gemini live visual audit |
| UX-003 | accessibility | WCAG audit across 155 pages | NOT FOUND | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | No full a11y audit |  |
| MOB-001 | mobile/tablet | Technician mobile execution UX-B closure | DEPLOYED TO STAGING | YES | NO | NO | NO | NO | YES | NO | NO | YES | YES | YES | YES | NO | NO | UX-B 35/35 | f8cc0c4 |  |  |  |
| MOB-002 | mobile/tablet | Finance editor tablet/mobile reflow verified in tests | TESTED LOCALLY | YES | YES | NO | NO | NO | NO | NO | NO | YES | YES | YES | YES | NO | NO |  | f8cc0c4 |  |  |  |
| MOB-003 | mobile/tablet | Client portal /my mobile parity | PARTIALLY IMPLEMENTED | YES | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | YES | NO | NO |  | f8cc0c4 |  |  |  |
| TST-001 | testing | Automated cross-tenant + RBAC test matrix | TESTED LOCALLY | YES | YES | NO | YES | YES | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  |  |  |
| TST-002 | testing | Staging public E2E scripts (Phases 5–12) | OWNER VERIFIED | YES | YES | NO | NO | NO | YES | YES | NO | NO | NO | YES | YES | YES | NO | 140–142 staging E2E JSON | f8cc0c4 |  |  |  |
| TST-003 | testing | Owner authenticated finance smoke J-5/J-6.5 | PARTIALLY IMPLEMENTED | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO | docs/TITAN_FINANCE_STAGING_SMOKE_J65.md | f8cc0c4 |  | SUPERSEDED — awaiting J-6.6A deploy |  |
| TST-004 | testing | Playwright browser suite with staging credentials | NOT FOUND | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | No apps/api/.env.staging.local on agent host |  |
| STG-001 | staging | Railway API + Web deployed from integration branch | PARTIALLY IMPLEMENTED | NO | NO | NO | NO | NO | YES | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | Deploy revision unconfirmed; route probes suggest partial live |  |
| STG-002 | staging | Migrations 0176→0177→0178 applied exactly once | PARTIALLY IMPLEMENTED | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 | 0176,0177,0178 | Blocked by backup/credentials gate |  |
| STG-003 | staging | APP_ENV=staging + DATABASE_URL ref cpkuwtaipjxeipvbssvn only | NOT FOUND | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | apps/api/.env.staging.local absent locally |  |
| PRD-001 | production | Production ref rshuiaghmtrvvilhqpwm never targeted | OWNER VERIFIED | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | YES | NO | Safety rule enforced | f8cc0c4 |  |  |  |
| PRD-002 | production | Production deploy + migration gate | NOT FOUND | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | Explicit Owner gate — staging must GO first |  |
| PRD-003 | production | Pilot readiness sign-off (FRZ-022) | NOT FOUND | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | YES | YES | NO | NO |  | f8cc0c4 |  | TITAN_PILOT_READINESS_REPORT.md blocked by approval |  |
---

## NOT VISUALLY VERIFIED surfaces

The following surfaces have **code/routes/tests** but lack **Owner authenticated visual verification** on staging at `f8cc0c4`. Do not treat as complete.

| Surface | Route / module | Why unverified | Register / gap |
|---------|----------------|----------------|----------------|
| Enterprise Mission Control | `/mission-control`, `/enterprise-modules` | Decorative / generic placeholders | BIND-001, UX-039 |
| Enterprise Digital Twin | `/digital-twin` | Foundation milestone copy; no live ops proof | Milestone 55 |
| Enterprise Knowledge Graph | `/knowledge-graph` | Semantic search not Owner-click verified | Milestone 56 |
| Enterprise Analytics / BI warehouse | `/enterprise-analytics` | KPI depth varies; not pilot-critical path | RPT-004 |
| Enterprise Automation Studio | `/automation-studio` | Designer not staging smoke tested | Milestone 54 |
| Enterprise Financial Planning | `/financial-planning` | Simulation pages not Owner verified | Milestone 68 |
| Enterprise Marketing Intelligence | `/marketing-intelligence` | Execute paths honest-blocked; UI not visually signed off | MKT-003 |
| Enterprise Sales Intelligence | `/sales-intelligence` | Overlaps /leads; decorative sections | CRM-009 |
| Enterprise IT Operations | `/it-operations` | Health monitors exist; not visually verified | Milestone 97 |
| Enterprise App Builder | `/app-builder` | Owner-only NL feature lifecycle — not started visually | Milestone 71 |
| Finance cashflow / profit / forecast pages | `/finance/cashflow-profit`, etc. | API wired; no staging visual sign-off | FIN-011 |
| Configuration Studio publish/rollback | `/settings/configuration` | FRZ-019 — draft/version/rollback missing | FRZ-019 |
| Gmail integration card | Integrations hub | Honesty-only NOT IMPLEMENTED | COM-006 FAIL |
| Cartrack live fleet map | Owner Command Centre | Credentials not configured | FLT-004 |
| WhatsApp live send + human takeover | Comms / Integrations | Meta credentials gate | COM-001, COM-003 |
| Portal live technician tracking map | `/my/jobs/:id` | fetchPortalJob ETA depth open | UX-030 |
| AURA Agent Orchestration web UI | *(no web pages)* | Backend only — no UI | AURA-004 |
| Google Calendar sync | Integrations | BUILT BUT NOT CONNECTED | COM-008 |
| Payment links / Yoco checkout | Finance / portal pay | FIN-014 missing | UX-055 remainder |
| n8n live cloud connector | Automations | Loopback-only; live cloud OUT | AUT-002 |
| Meta / Google live ad spend UI | Marketing integrations | Adapter config only | INT-009 |
| Platform Owner / Manager / Accountant roles | Users & Access | PLT-003 not implemented | ROLE-006 |
| SSO / IdP login | Auth settings | PLT-009 missing | AUTH-005 |
| Global search live invalidation | Nav search | UX-I partial | FRZ-004 |
| Live UI auto-refresh all operational lists | App-wide | Domain events limited subset | BIND-003 |
| Stripe payments | Finance | FIN-012 missing | — |
| Business evolution / continuous learning UI | `/business-evolution` | Extensive nav; not Owner verified | Milestone 70 |
| Young Guns theme on all 155 pages | App-wide | J-6.6B token/class remediation complete; Owner live visual audit pending | UX-002 J-6.6B |


---

## Future phases (visible — not started)

These phases are **documented and visible in backlog/plans** but must **not** be treated as in-progress unless explicitly approved.

| Phase | Focus | Source | Status |
|-------|-------|--------|--------|
| **Theme cleanup** | Young Guns theme consistency across remaining 155 pages; remove legacy tokens | J-6.6B local remediation | **BUILT LOCALLY** — Owner/Gemini visual audit pending |
| **Reports & analytics** | KPI definitions on home; quote→cash reporting; BI warehouse useful wiring | FRZ-008, RPT-002–004 | **QUEUED** |
| **Technician tracking** | Live en-route map; portal ETA; Cartrack Directions | UX-030, FLT-008, EXE-005 | **QUEUED** |
| **Integrations live** | Cartrack, WhatsApp live send, Gmail backend, Google Calendar, Meta/Google ads | COM-001–008, INT-009 | **QUEUED** — credential gates |
| **Xero complete sync** | Background import GO; two-way write verify; official numbering live | XERO-002, XERO-004 | **IN PROGRESS** — import running |
| **Pricebook YGP-001** | Tenant-scoped pricebook DB replacing temp YG constants | FIN-014, FIN-015 | **QUEUED** |
| **Configuration Studio** | Draft / preview / version / rollback (FRZ-019) | TITAN_FRZ019_CONFIG_STUDIO_AUDIT.md | **QUEUED** |
| **Domain events app-wide** | Materials, invoice, document, webhook → live UI invalidation | BIND-003, BIND-004 | **QUEUED** |
| **Staging data cleanup** | Delete 59 E2E disposable tenants after Owner approval | CLN-001 | **BLOCKED** — Owner gate |
| **Decorative enterprise hide/complete** | Hide or wire enterprise intelligence pages | TITAN_CLEAN_DATA_UX_QUEUE Phase F3 | **QUEUED** |
| **Calendar drag-drop** | Day/week/month scheduling component | TITAN_NEXT_IMPLEMENTATION_STAGE_PLAN | **QUEUED** |
| **Job detail 360** | Per-visit tabs; mobile parity | TITAN_NEXT_IMPLEMENTATION_STAGE_PLAN | **QUEUED** |
| **AURA Developer Agent + Cursor Cloud provider** | Owner-only dev assistant via `cursor_cloud_agent` adapter | Root checklist future section | **PLANNED / NOT STARTED** |
| **AURA Voice throughout TITAN** | Persistent mic + STT/TTS all channels | docs/AURA_VOICE_THROUGHOUT_TITAN.md | **PLANNED / NOT STARTED** |
| **Department 21 SaaS scaling** | Multi-tenant billing, white-label, entitlements | docs/TITAN_AURA_DEPARTMENT_21_SAAS_SCALING.md | **QUEUED** — after Xero phase |
| **Production hardening** | Phase 22 observability, backup, perf | TITAN_MASTER_EXECUTION_PLAN Phase 22 | **QUEUED** |
| **Pilot sign-off → commercial launch** | FRZ-022 / FRZ-023 complete chain | TITAN_PILOT_READINESS_REPORT.md | **BLOCKED** |

---

## Phase J-6.6C scope (completed locally)

Items **J66C-001 … J66C-012** in the register above were completed in **Phase J-6.6C**. Boolean columns marked **YES** only where proven locally — not deployed, Owner-verified, or production-ready.

| ID | Deliverable | J-6.6C outcome |
|----|-------------|----------------|
| J66C-001 | Work Completed | Invoice-only section from genuine preview input; hidden on quotes |
| J66C-002 | Warranty | Conditional heading + body; no default promises |
| J66C-003 | COC support | Attached state only; filename shown; no internal paths |
| J66C-004 | Photos/attachments | Before/after grouping; PDFs as file references |
| J66C-005 | Contact/help | Phone, email, location, verified website from YOUNG_GUNS_CONTACT |
| J66C-006 | Payment/bank | Hidden on draft invoices; large readable bank fields when visible |
| J66C-007 | Yoco link | Renders when genuine HTTPS pay.yoco.com URL passed; auto-source BLOCKED |
| J66C-008 | Google review | Stars + text on sent invoices; QR BLOCKED without tenant review URL |
| J66C-009 | Number/status | Xero pending labels; dynamic status text + colour |
| J66C-010 | Multi-page CSS | break-inside, thead repeat, 30-line table contract test |
| J66C-011 | Visibility tests | Quote/invoice section matrix covered in shared tests |
| J66C-012 | Checklist | This document updated to 183 requirement rows |

**J-6.6D closures:** editor section wiring, server Yoco lookup, tenant `googleReviewUrl`, COC evidence selector, draft payment Owner override, preview API authority, Puppeteer multi-page proof (local only).

---

## Phase J-6.6D scope (completed locally)

Items **J66D-001 … J66D-012** in the register above were completed in **Phase J-6.6D**. Boolean columns marked **YES** only where proven locally — not deployed, Owner-verified, or production-ready.

| ID | Deliverable | J-6.6D outcome |
|----|-------------|----------------|
| J66D-001 | Quote editor sections | Scope, exclusions, payment terms, warranty, maintenance wired on create/edit |
| J66D-002 | Work Completed | Invoice-only field in `titan_documents.content`; save/reload/preview |
| J66D-003 | Warranty + maintenance | Optional text; no defaults; empty sections hidden in PDF |
| J66D-004 | COC evidence | Typed metadata only; tenant/job validation; no storage paths in API/PDF |
| J66D-005 | Yoco URL | Server lookup from `invoice_payment_links`; client spoof ignored |
| J66D-006 | Google review URL | Owner-managed `preferences.googleReviewUrl`; audit logged |
| J66D-007 | Draft bank details | Hidden on draft unless Owner preview override |
| J66D-008 | Preview authority | Server enriches payment/review/COC/status; editor content only for narratives |
| J66D-009 | Round-trip tests | Four editors + API roundtrip suite green |
| J66D-010 | Multi-page PDF | Puppeteer proof: 1-line=2pp, 30-line=4pp, 100-line=6pp (local artifacts) |
| J66D-011 | Responsive UX | Labeled fields; existing Playwright layout contracts preserved |
| J66D-012 | Checklist | This document updated to 195 requirement rows |

**Still NOT VISUALLY VERIFIED:** authenticated staging editor journeys; Owner acceptance of draft payment policy; Gemini live visual audit.

**Owner decisions still required:** controlled migration apply on staging; live provider connection; production release.

---

## Phase J-6.7A scope (completed locally)

Items **J67A-001 … J67A-012** in the register above were completed in **Phase J-6.7A**. Boolean columns marked **YES** only where proven locally — not deployed, Owner-verified, or production-ready.

| ID | Deliverable | J-6.7A outcome |
|----|-------------|----------------|
| J67A-001 | Shared report architecture | Young Guns shell + shared Chromium PDF renderer |
| J67A-002 | Job report | Tenant job data → authenticated PDF export |
| J67A-003 | Completion report | Existing completion data → Young Guns PDF (canonical download) |
| J67A-004 | Service report | Job execution fields only; honest empty states |
| J67A-005 | Maintenance report | Plan/run metadata + optional linked job evidence |
| J67A-006 | Audience models | internal / client / technician server-side filtering |
| J67A-007 | RBAC tests | assertAudienceAccess matrix |
| J67A-008 | Tenant isolation | companyId-scoped queries and evidence embed |
| J67A-009 | Evidence handling | Embedded photos/signatures; no storage paths |
| J67A-010 | Multi-page PDF | Puppeteer proof under test-results/j67a/ |
| J67A-011 | UI entry points | Preview/Download on job, completion, maintenance screens |
| J67A-012 | Checklist | This document updated to 207 requirement rows |

**Remaining report families (not in J-6.7A):** finance aggregate, customer history, fleet, compliance/COC standalone exports.

**Still NOT VISUALLY VERIFIED:** authenticated staging report journeys; Owner acceptance of client-safe report shapes.

---

## Phase J-6.7B scope (completed locally)

Items **J67B-001 … J67B-010** close the report-audience security gap before additional report families.

| ID | Deliverable | J-6.7B outcome |
|----|-------------|----------------|
| J67B-001 | Audience resolver | Server derives effective audience; query param is hint only |
| J67B-002 | Technician internal block | Technicians never receive internal output; escalation clamped/audited |
| J67B-003 | Assignment enforcement | userHasJobAccess + run creator for maintenance |
| J67B-004 | Portal isolation | Portal routes + customerId match on resources |
| J67B-005 | Escalation prevention | Invalid audience 400; privileged attempts audited |
| J67B-006 | Typed projections | Allow-list client/technician models for all four families |
| J67B-007 | Leak tests | assertReportHtmlFreeOfSensitiveFields on generated HTML |
| J67B-008 | UI alignment | No audience selector; portal/mobile/staff entry points |
| J67B-009 | RBAC matrix tests | Owner/office/tech/client/portal scenarios |
| J67B-010 | Checklist | 219 requirement rows |

---

## Phase J-6.7C scope (completed locally)

Items **J67C-001 … J67C-012** add technician activity, timesheet, productivity and workforce operations PDF exports.

| ID | Deliverable | J-6.7C outcome |
|----|-------------|----------------|
| J67C-001 | Report kinds | technician_activity, technician_timesheet, technician_productivity, workforce_operations |
| J67C-002 | Activity report | Genuine jobs, workflow, maintenance, completion counts — no inferred travel |
| J67C-003 | Timesheet report | wi_timesheets + mobile_time_entries; overtime policy honest when unconfigured |
| J67C-004 | Productivity report | Transparent numerator/denominator metrics — no weighted scores |
| J67C-005 | Workforce summary | Internal aggregates; technicians denied |
| J67C-006 | Period validation | Africa/Johannesburg; max 93 days; server-validated dates |
| J67C-007 | RBAC + /me routes | Technician self-service; peer/cross-tenant denied |
| J67C-008 | Honest empty states | measured_zero vs not_recorded vs unavailable |
| J67C-009 | Multi-page PDF | Puppeteer proof under test-results/j67c/ |
| J67C-010 | UI entry points | MobilePerformancePage + TechnicianIntelligencePage |
| J67C-011 | Leak tests | assertWorkforceReportHtmlSafe — no payroll/wage |
| J67C-012 | Checklist | 231 requirement rows |

**Remaining report families (not in J-6.7C):** inspection, fleet, compliance/COC standalone exports.

---

## Phase J-6.7D scope (completed locally)

Items **J67D-001 … J67D-014** add finance aggregate, cash-flow/collections, accounts receivable aging, and customer/property history PDF exports (internal + client-safe portal).

| ID | Deliverable | J-6.7D outcome |
|----|-------------|----------------|
| J67D-001 | Source audit + policy | TITAN ledger primary; Xero history supplemental; duplicate prevention |
| J67D-002 | Finance aggregate | Period summary; profit unavailable; aging + status breakdown |
| J67D-003 | Cash-flow/collections | Payments-only inflows; bank feed informational |
| J67D-004 | Accounts receivable | Server aging buckets; snapshot date; public invoice numbers |
| J67D-005 | Customer history (internal) | Jobs/quotes/invoices/payments/completion timeline |
| J67D-006 | Client-safe history | Portal-only; server-derived customer; no internal notes |
| J67D-007 | Period validation | Max 366d finance; 5yr customer history; server dates |
| J67D-008 | Finance RBAC | Owner/finance full; office receivables; tech/client denied |
| J67D-009 | Freshness + dedupe | never_synced/stale states; no payment+bank double-count |
| J67D-010 | Money/VAT safety | Stored VAT; mixed currency warnings; no float math |
| J67D-011 | Multi-page PDF | Puppeteer proof under test-results/j67d/ |
| J67D-012 | UI entry points | FinanceReportingForecastPage, CashflowProfitPage, CRM, Portal |
| J67D-013 | Leak tests | assertFinanceReportHtmlSafe — tokens, costs, provider IDs |
| J67D-014 | Checklist | 243 requirement rows |

**Remaining report families (not in J-6.7D):** ~~inspection, fleet, compliance/COC standalone exports.~~ Completed in J-6.7E.

---

## Phase J-6.7E scope (completed locally)

Items **J67E-001 … J67E-014** add inspection, fleet vehicle activity, fleet operations summary, compliance/COC support, and compliance/COC register PDF exports.

| ID | Deliverable | J-6.7E outcome |
|----|-------------|----------------|
| J67E-001 | Extended report kinds | inspection, fleet_vehicle_activity, fleet_operations, compliance_coc_support, compliance_coc_register |
| J67E-002 | Inspection report | Eligible jobs only; sd_inspection/mobile form/titan doc; audience projection |
| J67E-003 | Fleet vehicle activity | Stored GPS trip segmentation; behaviour events; no coordinates in HTML |
| J67E-004 | Fleet operations | Tenant vehicle rollup; freshness/stale counts |
| J67E-005 | Compliance support | Legal notice; honest COC attachment from linked records |
| J67E-006 | COC register | Internal workflow register; status filter; no fabricated COC |
| J67E-007 | Period validation | 93d fleet; 366d register; Africa/Johannesburg |
| J67E-008 | RBAC | Fleet/compliance register denied for technicians and portal |
| J67E-009 | Source policy | Fleet stored-data note; COC attachment resolution |
| J67E-010 | Leak tests | assertExtendedReportHtmlSafe — lat/long, payroll, provider IDs |
| J67E-011 | Multi-page PDF | Puppeteer proof under test-results/j67e/ (5 scenarios) |
| J67E-012 | UI entry points | JobDetailPage, FleetIntelligencePage, ComplianceIntelligencePage |
| J67E-013 | Portal exports | Client-safe inspection and compliance-support on portal job detail |
| J67E-014 | Checklist | 257 requirement rows |

**Deferred improvements (append-only):** Live authenticated extended report E2E on staging; Chromium staging PDF verification; per-vehicle fleet export selector on all utilization rows; plumber registration entity when available.

---

## Phase J-6.7F scope (completed locally)

Items **J67F-001 … J67F-014** add secure social-account connection foundation for **Facebook, Instagram and TikTok** (Social Connections module).

| ID | Deliverable | J-6.7F outcome |
|----|-------------|----------------|
| J67F-001 | Foundation types | 3 social publishing providers; foundation status model; account selection types |
| J67F-002 | OAuth state schema | social_oauth_states (migration 0179 file — not applied) |
| J67F-003 | OAuth flow | Server start/callback; state hash; replay rejection |
| J67F-004 | Account selection | Discovery + server validation; invalid selection rejected |
| J67F-005 | Credential security | AES-256-GCM; no token exposure in API responses |
| J67F-006 | Health check | Tenant-scoped; updates status; no publish side effects |
| J67F-007 | Reconnect/disconnect | Credential revocation; audit events |
| J67F-008 | RBAC | Owner manage; Admin boundaries; tech/client/cross-tenant denied |
| J67F-009 | UI | SocialConnectionsSection on /integrations; **3** provider cards (FB/IG/TikTok); GBP + WhatsApp linked separately |
| J67F-010 | TikTok honesty | PROVIDER_REVIEW_REQUIRED; no fake Connected |
| J67F-011 | WhatsApp bridge | whatsapp_connections; does not overwrite operational hub |
| J67F-012 | Audit | securityAuditLogs + socialMediaConnectionEvents |
| J67F-013 | Documentation | docs/SOCIAL_CONNECTION_PROVIDER_SETUP.md |
| J67F-014 | Checklist | 271 requirement rows |

**Explicitly NOT complete in J-6.7F:** live provider authorization on staging/production; provider application review; production callback verification; publishing; scheduling; analytics; automatic marketing campaigns.

---

## Phase J-6.6B scope (completed locally)

Items **J66B-001 … J66B-005** in the register above were completed in **Phase J-6.6B**. Boolean columns marked **YES** only where proven locally — not deployed, Owner-verified, or production-ready.

| ID | Deliverable | J-6.6B outcome |
|----|-------------|----------------|
| J66B-001 | Tokens + shared UI | Electric blue primary button; info/map/banner/preview tokens |
| J66B-002 | Command surfaces | Owner/Executive/AURA share `command-centre-page` system |
| J66B-003 | Intelligence pages | Legacy cyan/teal Tailwind removed from page sources |
| J66B-004 | Preview + completion report | Token-based preview modal; YG report shell for completion HTML |
| J66B-005 | A11y + contracts | Skip-to-content; visual contract tests + Playwright |

**Canonical Owner Command Centre route** — still requires separate Owner approval (not decided in this phase).

---

## Phase J-6.6A scope (completed)

Items **J66A-001 … J66A-005** in the register above are targeted for completion in **Phase J-6.6A**. Use **YES** in boolean columns **only after proven at the new J-6.6A commit** — not preemptively at baseline `f8cc0c4`.

| ID | Deliverable | J-6.6A target |
|----|-------------|---------------|
| J66A-001 | Finance RBAC hardening | Cost strip, catalogue, document-engine routes |
| J66A-002 | Save semantics | Draft placeholder lines; save-from-preview idempotency |
| J66A-003 | Five test fixes | Finance regression suite green |
| J66A-004 | Migration 0176 hardening | Backup gate + staging ref guards |
| J66A-005 | This checklist | Authoritative `docs/TITAN_MASTER_COMPLETION_CHECKLIST.md` |

---

## GO / NO-GO @ f8cc0c4

| Gate | Verdict |
|------|---------|
| Staging release | **NO-GO** |
| Production | **FORBIDDEN** |
| Primary blockers | No staging credentials locally; migrations 0176–0178 not applied; Owner finance E2E not run; J-6.6A in progress |
| Next action | Complete J-6.6A → commit → Owner approval → execute master sequence steps 3–16 |

---

## Deferred: Future social provider expansion (post approved J-6.7F sequence)

**Do not implement during J-6.7F.** Record only — execution begins only after the current approved social-connection sequence is complete, live providers are verified, and Owner grants a separate expansion approval.

| ID | Area | Requirement | Status | Entry gates (all required) |
|----|------|-------------|--------|----------------------------|
| J67X-001 | integrations | **LinkedIn Company Page** — secure connection via existing canonical architecture (`social_media_connections` + `social_oauth_states` + `/api/v1/social-connections`; no parallel OAuth/token store) | **DEFERRED** | Facebook, Instagram and TikTok fully connected and verified on staging; LinkedIn API scopes and app-review requirements confirmed; Owner approval; architecture reuse proven without duplication |
| J67X-002 | integrations | **Additional social providers** (e.g. YouTube, other suitable platforms) — evaluate and scope individually | **DEFERRED** | Same gates as J67X-001; per-provider API/approval audit; explicit Owner approval per provider; no implementation until prior deferred items are closed |

**Initial future provider:** LinkedIn Company Page.

**Possible later providers:** YouTube and other suitable platforms — only after core Meta-family providers (Facebook, Instagram, TikTok) are fully connected and verified, provider APIs and approval requirements are confirmed, Owner approval is obtained, and the existing canonical connection architecture can be reused without duplication.

**Explicitly out of scope until deferred gates close:** LinkedIn OAuth, YouTube OAuth, new migration tags, new provider cards on `/integrations`, publishing/scheduling/analytics for any new provider.

---

*Generated requirement count: **243** rows. Update this document when any row changes classification; do not maintain competing checklists elsewhere.*
