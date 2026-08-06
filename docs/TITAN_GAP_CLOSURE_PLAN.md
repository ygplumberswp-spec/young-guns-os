# TITAN Gap Closure Plan

**Audit type:** READ-ONLY planning artifact — no new features  
**Generated (UTC):** 2026-08-05  
**Last updated (UTC):** 2026-08-06 — PERF-001 performance foundation implemented on `cursor/titan-perf-001-foundation`; staging deploy pending Owner/Railway action  
**Base HEAD:** `cc0abbcde96902711fc0e141590144470abc5444` → task branch `cursor/titan-xero-002-p0-finance`  
**Branch:** `cursor/titan-v1-integration`  
**Scope:** Unmet **accepted** requirements only — deferred items at end  

---

## Agent workforce gaps (AGENT-001B — 2026-08-06)

| Gap | Count | Closure path |
|-----|------:|--------------|
| Agents Missing (no meaningful implementation) | 283 of 307 | [TITAN_AGENT_ACTIVATION_ROADMAP.md](./TITAN_AGENT_ACTIVATION_ROADMAP.md) Phases B–F |
| Agents Partial (registry/UI shell only) | 21 | Phase B–D tool wiring |
| Provider-blocked | 3 | External provider gates |
| Supervised (AURA only) | 1 | Phase B exit → expand read-only agents |
| Shadow mode | 20 | Phase B–C |
| **Active** | **0** | None — do not fake |
| AUD department agents | 14 Defined | Phase A approved → Phase B shadow |

**Register restoration:** Approved **307** unique agents across **18 departments** recovered from commit `363111f`. **0 missing approved Agent IDs.** AGENT-001 role families (191) reconciled as mappings/aliases — not replacements.

**Facebook (J-6.7F14 deployed to staging):** Young Guns Plumbing - Cape Town connected and verified. Content permissions granted (publish, schedule, comments, reply, Page details, insights). Webhook fields **feed** + **mention** provider-confirmed; Meta dashboard sample delivery succeeded; no webhook error; polling fallback every 15 minutes. Genuine live Page event pending (Meta app unpublished). Messenger and Lead Ads outside scope. **Not production-complete.**

**XERO-001 audit (2026-08-06):** [TITAN_XERO_FULL_AUDIT_REPORT.md](./TITAN_XERO_FULL_AUDIT_REPORT.md) — read-only staging recount complete. OAuth connected; read import partial; attachments provider-blocked; full chain **not proven**.

**XERO-002 (2026-08-06):** Implementation complete on task branch — connection health, scope persistence, stale-job recovery, customer mapping dry-run, reconciliation model, finance UI panels. **Live proof NOT executed.** See [TITAN_XERO_002_LIVE_PROOF_PLAN.md](./TITAN_XERO_002_LIVE_PROOF_PLAN.md).

**Integrations overview (2026-08-06):** Enterprise connection status + unified card system + fine-details finishing pass on branch `cursor/integrations-ui-polish-enterprise-status-998f` ([PR #10](https://github.com/ygplumberswp-spec/young-guns-os/pull/10)). **Pending Owner approval** — do not treat as complete until visual sign-off.

**Owner approval gate (sequencing):** Do **not** begin **XERO-002 LIVE PROOF** until the Integrations overview is approved and the next two enterprise priorities below are **formally sequenced** by Owner. See [Next enterprise priorities](#next-enterprise-priorities-record-only--do-not-implement-yet).

**Universal integration gap:** Client-facing wizard must hide developer setup per [INT-UNIVERSAL-001](./TITAN_INTEGRATION_REGISTER.md).

---

## Next enterprise priorities (RECORD ONLY — do not implement yet)

**Status:** High-priority enterprise gaps — **documented only**. No implementation during Integrations overview or before Owner formal sequencing.

**Formal sequence after Integrations overview approval (INT-UI-001B):**

| Order | Task ID | Name | Gate |
|------:|---------|------|------|
| 0 | INT-OVERVIEW-001 | Integrations overview + Dashboard Connections alignment | **Pending Owner approval** |
| 1 | **PERF-001** | **TITAN Performance Foundation** | **Implemented** — [TITAN_PERF_001_COMPLETION_REPORT.md](./TITAN_PERF_001_COMPLETION_REPORT.md); staging deploy pending |
| 2 | **XERO-003** | **Near-real-time Xero quote, invoice and payment intersync** | Owner sequences after PERF-001 |
| 3 | **DASH-001** | **Owner Dashboard — Business Heartbeat** | Owner sequences after XERO-003 |
| 4 | XERO-002 | Controlled Xero live proof (Owner gate) | **Blocked** until steps 0–3 formally sequenced |

Both tasks must meet the **Enterprise Product Quality Gate** and **Fine Details & Finishing** standard applied to the Integrations overview.

### PERF-001 — TITAN Performance Foundation

**Status (2026-08-06):** Implemented on branch `cursor/titan-perf-001-foundation`. Measured main bundle reduction 566 KB → 332 KB entry (+ vendor splits). Dashboard deferred panel loading, social connection dedupe, cache policies, prefetch alignment. See [TITAN_PERF_001_BASELINE_REPORT.md](./TITAN_PERF_001_BASELINE_REPORT.md) and [TITAN_PERF_001_COMPLETION_REPORT.md](./TITAN_PERF_001_COMPLETION_REPORT.md). Staging deploy and authenticated route verification **pending**.

**Gap (remaining):**

- Authenticated Owner route before/after timings
- List pagination (CRM, jobs, quotes, invoices)
- DB index audit with tenant query evidence
- Post-deploy staging verification

**Deliverable:** Measurable performance evidence (before/after metrics) plus improved perceived and actual speed.

### DASH-001 — Owner Dashboard — Business Heartbeat

**Gap:** Current Owner Dashboard has significant visual, information and usability gaps — **not enterprise-demo ready**.

**Future redesign scope (not started)** — centre on business heartbeat:

- Financial truth (revenue vs cash vs profit; monthly profit and margin)
- Jobs and dispatch; overdue operational work
- Quotes and sales follow-up
- Invoices and collections
- Technicians and job duration
- Fleet
- Leads
- Recurring maintenance
- System and integration alerts
- AURA executive recommendations
- Source freshness and drill-down evidence

**Explicit exclusions:** Do not add irrelevant low-stock or supplier-order metrics where they do not apply to Young Guns Plumbing.

**Quality bar:** Same Enterprise Product Quality Gate + Fine Details & Finishing as Integrations overview.

### XERO-003 — Near-real-time Xero quote, invoice and payment intersync

**Gap:** Quote → invoice → payment state changes are not reflected near-real-time across TITAN and Xero.

**Future scope (not started):** Near-real-time intersync for quotes, invoices and payments — incremental sync, webhook-driven updates where available, honest UI freshness, and measurable latency evidence. **Does not replace** XERO-002 controlled live proof; runs as a separate sequenced task before DASH-001.

---

## Xero gaps (XERO-001 audit 2026-08-06)

**Report:** [TITAN_XERO_FULL_AUDIT_REPORT.md](./TITAN_XERO_FULL_AUDIT_REPORT.md)

### P0 — blocks Young Guns internal pilot

| ID | Action | Requirements | XERO-002 status |
|----|--------|--------------|-----------------|
| X-P0-1 | Fix attachment stage / scope diagnosis | XERO-004 | **Partial** — root cause classified; Owner reconnect required |
| X-P0-2 | Owner authenticated quote→invoice→payment E2E proof | XERO-005, BC-024 | **Owner gate** — plan prepared, not executed |
| X-P0-3 | Close 159 unmapped customers | XERO-009 | **Partial** — dry-run + review queue; Owner apply on staging |
| X-P0-4 | Recover stale/running import job safely | XERO-002 | **Closed in code** — recovery APIs + UI |
| X-P0-5 | Live-verify write approval execute path | XERO-008 | **Partial** — tests pass; live proof pending |
| X-P0-6 | Yoco payment link implementation | XERO-006, FIN-013 | **Partial** — foundation in shared + document engine |
| X-P0-7 | Reconciliation workflow proof | XERO-007 | **Partial** — model + API; live proof pending |

### P1 — first 30 days

| ID | Action |
|----|--------|
| X-P1-1 | Credit notes + tracking category import |
| X-P1-2 | Configure scheduled Xero sync |
| X-P1-3 | Persist granted scopes on connection row | **Addressed in XERO-002** |
| X-P1-4 | Playwright authenticated Xero journeys |
| X-P1-5 | Reduce sync log failure noise / date parsing |

**Next locked task:** **PERF-001 — TITAN Performance Foundation** (after INT-OVERVIEW-001 Owner approval). **XERO-002 live proof remains blocked** until PERF-001, XERO-003 and DASH-001 are formally sequenced.

---

## Principles

- No new ideas — only closes documented gaps
- Security + data integrity + broken E2E workflows first
- Separate local-only work from staging verification
- Separate external-provider blockers
- Deferred Owner decisions last
- Do not rebuild completed architecture

---

## Phase 1 — Staging proof (verification only)

**Goal:** Convert COMPLETE_LOCAL_ONLY → COMPLETE_AND_PROVEN without new features.

| ID | Action | Requirements |
|----|--------|--------------|
| 1.1 | Owner authenticated finance staging smoke per `docs/TITAN_FINANCE_STAGING_SMOKE_J65.md` | J66A–J66D, FIN-001–FIN-010, BC-010, BC-012 |
| 1.2 | Owner authenticated report PDF download smoke (job, completion, workforce, finance, extended) | J67A–J67E, BC-019 |
| 1.3 | Owner/Admin/Office/Tech/Client RBAC click-path on new routes | J67B, J67F-008, ROLE-001–008 |
| 1.4 | Visual sign-off 1440/1024/768/390 — finance + integrations | UX-001, UX-002, J66B, J67F-009 |
| 1.5 | Re-run cross-tenant matrix against staging API | ROLE-008, SEC-001 |

**Exit gate:** All Phase 1 items COMPLETE_AND_PROVEN with recorded JSON/screenshots.

---

## Phase 2 — Security & data integrity

| ID | Action | Requirements |
|----|--------|--------------|
| 2.1 | Staging data cleanup — 59 E2E tenants after Owner approval | CLN-001, CLN-002 |
| 2.2 | Configuration Studio draft/preview/version/rollback | FRZ-019 |
| 2.3 | Domain events: materials/variations → costing | EXE-004, BIND-003 |
| 2.4 | Session/MFA staging click-path | AUTH-002, AUTH-003 |
| 2.5 | Backup restore drill from verified pg_dump | BAK-001, RB-002 |

---

## Phase 3 — Broken end-to-end business chain

| ID | Action | Requirements |
|----|--------|--------------|
| 3.1 | Quote → job → complete → invoice → payment chain live proof | BC-024, FRZ-023, FIN-008 |
| 3.2 | Payment links / Yoco checkout implementation | FIN-013, BC-013, J66D-005 |
| 3.3 | Invoice stages (deposit/progress/final) staging proof | FIN-008 |
| 3.4 | Job detail finance strip + billing chain panel wiring | JOB-004, JOB-005 |
| 3.5 | Portal appointment booking completion | JOB-006, BC-004 |

---

## Phase 4 — External provider blockers

| ID | Action | Requirements | Blocker |
|----|--------|--------------|---------|
| 4.1 | Xero import GO + two-way write verify queue | XERO-002, XERO-004, BC-014 | Xero OAuth + Owner write approval |
| 4.2 | Meta FB OAuth on staging — basic Page connection **Verified complete (staging)** Young Guns Plumbing – Cape Town `CONNECTED_LIMITED`; advanced scopes Provider-blocked (not dev blocker) | J67F-003, J67F-004, AGT-008 | Meta App Review for `pages_read_engagement`, publishing, messaging |
| 4.3 | TikTok live OAuth after review | J67F-010 | `TIKTOK_LIVE_OAUTH_ENABLED` + provider review |
| 4.4 | WhatsApp live send + human takeover | INT-003, BC-022 | Meta Business credentials |
| 4.5 | Cartrack credentials + fleet map | FLT-002–FLT-004, BC-021 | Cartrack API |
| 4.6 | Yoco business profile + checkout | INT-005, FIN-013 | Yoco secret |
| 4.7 | Google Calendar live sync | COM-008 | Google OAuth |
| 4.8 | Gmail backend (Decision 4) | INT-001 | Google OAuth + scope |

---

## Phase 5 — Partial module completion

| ID | Action | Requirements |
|----|--------|--------------|
| 5.1 | Pricebook YGP-001 DB + UI | FIN-014, FIN-015 |
| 5.2 | Warehouse/bin management UI completion | WH-001 |
| 5.3 | COC generation linked to job pack | COC-002 |
| 5.4 | Global search live invalidation | FRZ-004 |
| 5.5 | Hide or wire enterprise decorative pages | TITAN_CLEAN_DATA_UX_QUEUE F3 |
| 5.6 | Marketing live send (post consent gates) | MKT-003, BC-018 |
| 5.7 | Technician live tracking + portal ETA | EXE-005, UX-030 |

---

## Phase 6 — Deferred (Owner decision required)

| ID | Item | Requirements |
|----|------|--------------|
| 6.1 | LinkedIn Company Page | J67X-001 |
| 6.2 | YouTube / additional social | J67X-002 |
| 6.3 | YG-VIS / final branding | Documented deferred |
| 6.4 | Platform Owner/Manager/Accountant roles | ROLE-006 |
| 6.5 | SSO / IdP | AUTH-005 |
| 6.6 | Production deploy + migration | PRD-002 |
| 6.7 | Pilot sign-off → commercial launch | PRD-003, FRZ-022 |
| 6.8 | AURA Voice throughout TITAN | Future phases doc |
| 6.10 | Master agent register (AGENT-001B — 307 approved minimum; extensible) activation | AGENT-001–004, AGT-001–010 | [TITAN_AGENT_ACTIVATION_ROADMAP.md](./TITAN_AGENT_ACTIVATION_ROADMAP.md) |

---

## Phase summary

| Phase | Focus | Type |
|-------|-------|------|
| **0** | **Next enterprise priorities (PERF-001, XERO-003, DASH-001)** | **Recorded — Owner sequencing required** |
| 1 | Staging verification | Verification only |
| 2 | Security & data integrity | Implementation + verify |
| 3 | E2E business chain | Implementation + verify |
| 4 | External providers | Config + verify |
| 5 | Partial modules | Implementation |
| 6 | Deferred | Owner approval gates |

**Next recommended action:** Owner approve INT-OVERVIEW-001 → formally sequence **PERF-001 → XERO-003 → DASH-001** → then approve Xero live proof.
