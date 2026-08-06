# TITAN Gap Closure Plan

**Audit type:** READ-ONLY planning artifact — no new features  
**Generated (UTC):** 2026-08-05  
**Last updated (UTC):** 2026-08-06 — AGENT-001 formal master AI workforce standard  
**Base HEAD:** `23debd9cfa90a05ab31f051b76d3e7a86708b14f`  
**Branch:** `cursor/titan-agent-register-001`  
**Scope:** Unmet **accepted** requirements only — deferred items at end  

---

## Agent workforce gaps (AGENT-001 — 2026-08-06)

| Gap | Count | Closure path |
|-----|------:|--------------|
| Agents Defined / Planned (no executable loop) | majority of 191 | [TITAN_AGENT_ACTIVATION_ROADMAP.md](./TITAN_AGENT_ACTIVATION_ROADMAP.md) Phases B–F |
| Supervised (AURA only) | 1 | Phase B exit → expand read-only agents |
| Implemented but inactive | 1 (Facebook) | Phase C–E; agent activation gate not yet passed |
| Build-ready | 2 | Phase D prerequisites |
| **Active** | **0** | None — do not fake |
| AUD department agents | 14 Defined | Phase A approved → Phase B shadow |

**Facebook (J-6.7F14 deployed to staging):** Young Guns Plumbing - Cape Town connected and verified. Content permissions granted (publish, schedule, comments, reply, Page details, insights). Webhook fields **feed** + **mention** provider-confirmed; Meta dashboard sample delivery succeeded; no webhook error; polling fallback every 15 minutes. Genuine live Page event pending (Meta app unpublished). Messenger and Lead Ads outside scope. **Not production-complete.**

**XERO-002:** **Parked** — no work started.

**Owner approval gate:** Review [TITAN_MASTER_AGENT_REGISTER.md](./TITAN_MASTER_AGENT_REGISTER.md) (AGENT-001) before any agent activation work.

**Universal integration gap:** Client-facing wizard must hide developer setup per [INT-UNIVERSAL-001](./TITAN_INTEGRATION_REGISTER.md).

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
| 6.10 | Master agent register (307 agents) activation | AGT-001–AGT-010 | [TITAN_AGENT_ACTIVATION_ROADMAP.md](./TITAN_AGENT_ACTIVATION_ROADMAP.md) |

---

## Phase summary

| Phase | Focus | Type |
|-------|-------|------|
| 1 | Staging verification | Verification only |
| 2 | Security & data integrity | Implementation + verify |
| 3 | E2E business chain | Implementation + verify |
| 4 | External providers | Config + verify |
| 5 | Partial modules | Implementation |
| 6 | Deferred | Owner approval gates |

**Next recommended action:** Owner review this audit → approve Phase 1 staging verification sprint (J-6.7G).
