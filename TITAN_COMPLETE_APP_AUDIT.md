# TITAN Complete Application Audit — Non-Destructive

**Audit type:** Read-only codebase + staging DB probe  
**Scope:** Complete TITAN Business OS  
**Staging ref:** `cpkuwtaipjxeipvbssvn` only — production not accessed  
**Destructive actions:** **NONE**  
**Updated (UTC):** 2026-08-01  
**Binding rule:** `TITAN_BINDING_ACCEPTANCE_RULE.md`  
**Evidence JSON:** `diagnostic-output/181-complete-app-audit.json`

---

## Executive summary

| Verdict | Areas |
|---------|------:|
| **PASS** | 2 |
| **PARTIAL** | 18 |
| **FAIL** | 3 |
| **NOT_AUDITED** | 4 |
| **Total areas** | 27 |

TITAN has substantial implementation (~155 web pages, 84 API route modules) but **~27% verified complete** against the 116-row register. The binding acceptance rule is **not yet met** for most modules. Staging contains **1 verified live tenant** (Young Guns Plumbing) and **59 confirmed E2E disposable companies** — see `TITAN_STAGING_DATA_CLEANUP_MANIFEST.md`.

**Active work — not interrupted:** Xero background import job running; contacts mapping in progress; `last_sync_at` null until full workflow completes.

---

## Module audit register

| Area | Verdict | Binding criteria gaps | Evidence / notes |
|------|---------|----------------------|------------------|
| **Auth & session** | PARTIAL | (3)(7) — hard-refresh fix deployed `7741976`; MFA local only | `session-expiry.test.ts`, staging session UX pending full live proof |
| **RBAC & tenant isolation** | **PASS** | Meets (5)(6)(9) — 97 cross-tenant + 71 forbidden-action tests; Sprint 022 staging GO | `cross-tenant-denial-matrix.test.ts` |
| **Leads & CRM** | PARTIAL | (3)(10) — Phase 5 staging GO; `lead.converted` domain event wired | `staging-phase5-public-e2e.mjs` |
| **Jobs & properties** | PARTIAL | (3)(10) — Phase 5 chain; job lifecycle events partial | Phase 5/6 E2E |
| **Scheduling & dispatch** | PARTIAL | (3)(4) — Phase 6 staging GO; `job.scheduled` event; live map depth open | Sprint 017 |
| **Technician mobile** | PARTIAL | (3)(7)(10) — UX-B staging GO; offline idempotency local | `mobile-offline-completion.test.ts` |
| **Business-day timeline** | PARTIAL | (3)(10) — Phase 8 staging smoke GO | Sprint 018 |
| **Quotes, BOQ, tenders** | PARTIAL | (3)(4) — Phase 9 BOQ staging GO; UUID placeholders in BOQ UI | Sprint 019 |
| **Materials & procurement** | PARTIAL | (3)(10) — Phase 10/11 stock smoke GO | Sprint 022 |
| **Documents & job packs** | PARTIAL | (3)(10) — Pack routes live; OCR depth partial | Sprint 022 |
| **Finance & invoicing** | PARTIAL | (1)(2)(3) — Local chain; Xero numbering honesty; live write gated | UX-E staging |
| **Xero integration** | PARTIAL | (3)(7)(8) — OAuth connected; background import running; not yet GO | `TITAN_FRZ018_XERO_STAGING_REPORT.md` |
| **Other integrations** | PARTIAL | (2)(7) — Auto-sync orchestrator; Cartrack full path; stubs honest | `TITAN_INTEGRATION_AUTO_SYNC_REPORT.md` |
| **AURA / AI** | PARTIAL | (7)(10) — FRZ-015 staging GO; no autonomous destructive actions | FRZ-015 evidence |
| **Integrations hub UX** | PARTIAL | (4)(7) — Auto-sync panel; manual Sync de-emphasized | `IntegrationAutoSyncStatusPanel` |
| **Dashboards & targets** | PARTIAL | (1)(2) — Owner dashboard wired; KPI depth varies | Sprint 005 |
| **Client portal** | PARTIAL | (5)(10) — UX-C staging partial | `TITAN_UX_C_STAGING_REPORT.md` |
| **Global search** | PARTIAL | (2)(3) — Nav wired; cross-module live invalidation partial | UX-I |
| **Marketing & consent** | PARTIAL | (2) — Classifier closed; send paths honest blocked | UX-H |
| **HR / workforce** | PARTIAL | (2) — Draft discipline modules; legal gates | FRZ-013 partial |
| **Configuration studio** | PARTIAL | (2)(9) — FRZ-019 audit: draft/version/rollback missing | `TITAN_FRZ019_CONFIG_STUDIO_AUDIT.md` |
| **Background work / events** | PARTIAL | (3)(8) — Framework `5239239`; lead convert + job completion wired; most modules not subscribed | `TITAN_GLOBAL_REALTIME_AUTO_SYNC_ARCHITECTURE.md` |
| **Enterprise intelligence pages** | **FAIL** | (2)(5) — Decorative / BUILT BUT NOT VISIBLE; mislead on completion | Gap backlog UX catalogue |
| **Gmail integration card** | **FAIL** | (2)(7) — Honesty-only; Decision 4 NOT IMPLEMENTED | `TITAN_GAP_BACKLOG.md` COM-006 |
| **Staging data hygiene** | **FAIL** | (1) — 59 E2E tenants in DB; cleanup manifest ready, **awaiting Owner approval** | `180-staging-data-cleanup-audit.json` |
| **Cartrack live fleet** | NOT_AUDITED | — | Credentials not configured on staging |
| **WhatsApp live** | NOT_AUDITED | — | Meta credentials gate |
| **Meta / advertising** | NOT_AUDITED | — | Stub; no credentials |
| **Sage (future)** | NOT_AUDITED | — | Not in codebase |

---

## Useful-function audit (sample)

| Control / surface | Verdict | Issue |
|-------------------|---------|-------|
| Integrations → Sync now | PASS | Recovery fallback; auto-sync primary |
| Integrations → Not implemented badges | PASS | Truthful |
| Enterprise SaaS / Mission Control pages | FAIL | Decorative navigation; no real workflow |
| BOQ → Customer UUID field | FAIL | Developer-facing; not useful for Owner |
| Xero → per-entity sync buttons | PARTIAL | Useful fallback; should show auto-sync status first |
| AURA chat send | PASS | Real provider when configured |
| Marketing campaign execute | PASS | Honest SEND_PATH_NOT_IMPLEMENTED |
| Payment create | PARTIAL | Real form; live Xero write gated |

---

## Uniform UX gaps (priority)

1. Terminology drift: “Sync now” vs “Sync now (read-only)” vs auto-sync states — converging in integration pages only
2. Empty states inconsistent across 155 pages — many enterprise pages use generic placeholders
3. Mobile vs desktop action placement varies by module age (UX-A through UX-K tranches)
4. Error messages mix technical codes with user copy on some API failures
5. ZAR/VAT/SA phone formatting enforced in some forms (JobCreate) but not audited everywhere
6. Duplicate integration status surfaces (hub vs provider page vs platform dashboard)
7. Loading states: background work panel new; most list pages still fetch-on-mount only
8. Role home redirects inconsistent after login (partially fixed `7741976`)

---

## Auto-update coverage gaps

| Event / sync path | Status |
|-------------------|--------|
| `lead.converted` | Wired — cache invalidation + follow-up job |
| `job.completed` | Wired — cache invalidation + follow-up job (stages stubbed) |
| `job.scheduled` | Wired — cache invalidation only |
| Technician travel/arrive/work | **Not wired** |
| Materials/variations → costing | **Not wired** |
| Invoice/payment → Xero read sync | **Not wired** (manual/scheduled Xero only) |
| Document upload → compliance | **Not wired** |
| Provider webhooks (WhatsApp, Yoco) | **Partial / gated** |
| Live UI polling (`/background-work/status`) | Deployed; not embedded on all pages |

---

## Top 10 pilot-readiness gaps

1. **Xero full background import** not yet GO (`last_sync_at` null; invoices/payments pending)
2. **59 E2E staging tenants** visible in DB — cleanup awaits Owner approval
3. **Enterprise decorative modules** fail useful-function rule — hide or complete
4. **Domain event propagation** limited to leads/jobs — chain not app-wide
5. **Live UI without manual refresh** not proven on all operational pages
6. **End-to-end quote → job → complete → invoice → Xero** not live-verified
7. **Uniform SA data standards** not enforced app-wide
8. **Cartrack / WhatsApp / Meta** not staging-verified
9. **Configuration studio** missing draft/publish/rollback (FRZ-019)
10. **Useful-function audit** incomplete on intelligence and platform pages

---

## Owner approval gates (before destructive work)

| Gate | Action |
|------|--------|
| **Cleanup approval** | Explicit approval of `TITAN_STAGING_DATA_CLEANUP_MANIFEST.md` before deleting 59 E2E tenants |
| **Xero financial writes** | Separate approval — not part of this audit |
| **Production** | Never — staging only |

---

## Next queued phases

See `TITAN_CLEAN_DATA_UX_QUEUE.md` — Phases A–E after Xero import GO.
