# TITAN Master Execution Plan

**Product:** TITAN Business OS, powered by AURA  
**Repository:** `/Users/keanuventer/Downloads/Titan Aura V1`  
**Binding scope:** `TITAN_FINAL_SCOPE_FREEZE (2).md` (31 July 2026)  
**Completion branch:** `cursor/titan-frozen-scope-completion`  
**Checkpoint verified:** `8d35bfd` — lead conversion site-address integrity fix  
**Started (UTC):** 2026-08-01  
**Mode:** Sequential frozen-scope completion — one active phase at a time  

---

## GLOBAL BINDING ACCEPTANCE RULE

**Authoritative text:** `TITAN_BINDING_ACCEPTANCE_RULE.md`  
**Architecture:** `TITAN_GLOBAL_REALTIME_AUTO_SYNC_ARCHITECTURE.md`, `TITAN_INTEGRATION_AUTO_SYNC_ARCHITECTURE.md`

No feature, module, dashboard, role experience, API workflow, mobile screen, AURA capability, document, report, automation, integration, or future provider (including Sage) is **complete** unless it satisfies all **10 binding criteria** (legitimate data, fully wired, automatic dependent updates, consistent UX, correct role, tenant isolation, truthful states, retry/duplicate prevention, audit evidence, staging verification).

Ordinary users must not manually sync routine data, refresh for normal updates, re-enter data across modules, or use decorative controls. **Sync now / Retry / Reconnect / Refresh** are fallback only. Automatic sync does not bypass approval gates for financial writes, customer sends, publishing, spend, permissions, destructive actions, or production changes.

**Complete-app audit:** `TITAN_COMPLETE_APP_AUDIT.md` — **2 PASS / 18 PARTIAL / 3 FAIL / 4 NOT_AUDITED** (2026-08-01).

---

## Executive summary

TITAN has substantial implementation across 108 web routes, 84 API route modules, 104 SQL migrations (latest `0104`), and 45 automated test files. **Code existence is not completion.** Current verified-complete rate against the 116-row traceability register is **~27% VERIFIED LIVE** with **41 PARTIAL**, **17 MISSING**, and **5 provider-blocked** items.

This plan executes Phases 0–24 from the 100% Frozen-Scope Completion Master Directive in dependency order, prioritising **Young Guns internal pilot** evidence before full commercial launch.

---

## Repository safety (active)

| Item | State |
|------|--------|
| Branch | `cursor/titan-frozen-scope-completion` from `8d35bfd` |
| Unrelated work | Quote-validation edits **stashed** as `preserve-quote-validation-unrelated` |
| Force-push | **Prohibited** |
| Auto-deploy merge | **Prohibited** without approval |
| Production migration | **Gate** — staging-first only |

---

## Phase map and dependency order

| Phase | Name | Priority | Depends on | Approval gates |
|------:|------|----------|------------|----------------|
| 0 | Repository, architecture and acceptance audit | **NOW** | — | None |
| 1 | Foundation, deployment, auth and session reliability | High | 0 | Prod deploy |
| 2 | Tenant isolation, RBAC, audit and security hardening | Critical | 1 | Prod migration |
| 3 | Locked TITAN brand, login and responsive shell | High | 1 | — |
| 4 | Owner Command Centre and universal navigation | High | 3 | — |
| 5 | Customer, property, lead and job contract | **Pilot-critical** | 2 | Staging E2E |
| 6 | Scheduling, dispatcher, crews, vehicles, assignment | Pilot-critical | 5 | — |
| 7 | Technician mobile field execution | Pilot-critical | 6 | — |
| 8 | Business-day timeline, attendance and labour | High | 7 | — |
| 9 | Quotes, estimates, BOQs, tenders and approvals | Pilot-critical | 5, 8 | — |
| 10 | Materials, stock, procurement and job costing | Pilot-critical | 9 | — |
| 11 | Documents, scanning, OCR, reports, COC and job packs | High | 7, 10 | — |
| 12 | Completion, invoice, payment, Xero and profit chain | **Top pilot priority** | 9–11 | **Xero live write** |
| 13 | Owner daily target and financial control | High | 12 | Owner config approval |
| 14 | Customer/Xero data quality, comms and marketing consent | High | 12 | Marketing send |
| 15 | Workforce, HR, payroll support and labour compliance | Medium | 8 | HR legal approval |
| 16 | AURA central chat and specialist departments | High | 1, 2 | AI provider creds |
| 17 | Multi-AI gateway and controlled self-learning | Medium | 16 | Policy change approval |
| 18 | Marketing, sales, digital presence and attribution | Medium | 14 | Publish/spend approval |
| 19 | Integrations and truthful provider states | Critical | 1 | OAuth/credentials |
| 20 | Owner Configuration Studio | Medium | 2 | Config publish approval |
| 21 | Controlled AURA Developer Studio | Medium | 20 | Prod deploy approval |
| 22 | Reliability, observability, backup, recovery, performance | High | 1 | Prod load test |
| 23 | Internal pilot readiness | **Gate** | 5–12, 19 | Pilot sign-off |
| 24 | Complete commercial launch acceptance | **Final gate** | 0–23 | Production deploy |

---

## First selected implementation phase (post-audit)

**PHASE 1 — Foundation, deployment, authentication and session reliability**

Rationale:
- Unblocks all staging verification without provider credentials.
- Fixes known API envelope inconsistency (`enterprise-unified-communications.ts`).
- Re-validates auth/session/CORS/build after recent mobile/dispatcher/envelope commits.
- Does not require production migration or live provider OAuth.

**Second queue (pilot-critical): PHASE 5** — deploy `8d35bfd` to staging and prove lead → customer → property → job with real SA address/phone (approval gate: staging deploy).

---

## Risk register (top 10)

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| 1 | Staging DB not on migrations `0094`–`0104` | Role matrix + job contract broken | Migration register; staging-only apply with pre-check |
| 2 | Xero live write without approval | Financial/legal | Read-only staging; explicit Owner gate for writes |
| 3 | False provider “connected” UI | Trust | Provider state register; honesty-only cards |
| 4 | Cross-tenant ID enumeration | Security | Phase 2 matrix + automated denial tests |
| 5 | MFA not enforced at login | Security | Phase 1/2 gate on `/auth/login` |
| 6 | Lead conversion regression on deploy | Pilot blocker | Phase 5 staging E2E with real address |
| 7 | API envelope drift | Client breakage | Standardise `{ data }` / `{ error }` |
| 8 | Uncommitted quote-validation work mixed into phases | Scope contamination | Stash isolated; restore on separate branch |
| 9 | Public GitHub repo | Secret exposure | No push of credentials; local-only commits |
| 10 | Decorative enterprise modules | False completion | Acceptance register “BUILT BUT NOT VISIBLE” tracking |

---

## Control documents (mandatory)

| Document | Path | Status |
|----------|------|--------|
| Master execution plan | `TITAN_MASTER_EXECUTION_PLAN.md` | This file |
| Acceptance register | `TITAN_ACCEPTANCE_REGISTER.md` | Created Phase 0 |
| Gap backlog | `TITAN_GAP_BACKLOG.md` | Updated Phase 0 |
| Autonomous sprint log | `TITAN_AUTONOMOUS_SPRINT_LOG.md` | Created Phase 0 |
| Final launch report | `TITAN_FINAL_LAUNCH_REPORT.md` | Created Phase 0 |
| Role permission matrix | `TITAN_ROLE_PERMISSION_MATRIX.md` | Created Phase 0 |
| Provider state register | `TITAN_PROVIDER_STATE_REGISTER.md` | Created Phase 0 |
| Migration register | `TITAN_MIGRATION_REGISTER.md` | Created Phase 0 |
| Test evidence index | `TITAN_TEST_EVIDENCE_INDEX.md` | Created Phase 0 |
| Pilot readiness report | `TITAN_PILOT_READINESS_REPORT.md` | Created Phase 0 |
| Prior audit (reference) | `TITAN_MASTER_ACCEPTANCE_REGISTER.md` | Retained |

---

## Quality gates (every phase)

1. TypeScript `pnpm typecheck`  
2. `pnpm lint` (where configured)  
3. Relevant test suites  
4. `pnpm build` (API + web production build)  
5. No secrets in git diff  
6. Acceptance register updated  
7. One clean local commit per phase  

---

## Approval gates (pause points)

Pause before: production migration, production deploy, auto-deploy branch push/merge, destructive data ops, secret rotation, provider OAuth, paid provider actions, real customer sends, marketing publish/ad spend, live Xero financial writes, role escalation, autonomous business actions, uncertain legal/financial actions.
