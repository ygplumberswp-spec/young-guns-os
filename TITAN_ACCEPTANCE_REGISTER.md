# TITAN Acceptance Register

**Source of truth:** `TITAN_FINAL_SCOPE_FREEZE (2).md` (31 July 2026)  
**Repository:** `/Users/keanuventer/Downloads/Titan Aura V1`  
**Branch:** `cursor/titan-frozen-scope-completion`  
**Checkpoint:** `767b947` (Sprint 017 staging verification)  
**Updated (UTC):** 2026-08-01 — Sprint 018: migrations 0105–0106 on staging DB (journal 106); public API smokes blocked (Railway DB 28P01)  

---

## Classification legend (binding)

| Classification | Meaning |
|----------------|---------|
| **Verified complete** | End-to-end proven on staging or production with evidence |
| **Implemented, not staging-verified** | Code/API/DB exist; staging click-path not re-run this cycle |
| **Partially implemented** | Significant pieces exist; acceptance chain incomplete |
| **Missing** | No meaningful implementation |
| **Blocked by credential/provider** | Needs external credential or OAuth |
| **Blocked by approval** | Needs Owner/production approval |
| **Not applicable** | Written justification required |
| **Failed verification** | Tested; did not meet acceptance |

---

## Summary totals

| Classification | Freeze sections (§) | Traceability rows (116) |
|----------------|--------------------:|------------------------:|
| Verified complete | 0 / 23 | 31 |
| Implemented, not staging-verified | 3 / 23 | 7 |
| Partially implemented | 14 / 23 | 41 |
| Missing | 2 / 23 | 17 |
| Blocked by credential/provider | 3 / 23 | 5 |
| Blocked by approval | 4 / 23 | 0 |
| Failed verification | 0 | 0 |
| **Estimated completion (verified only)** | **~0% sections / ~27% rows** | |

*116-row detail preserved in `TITAN_MASTER_ACCEPTANCE_REGISTER.md`. This register maps **freeze sections** to implementation status.*

---

## Freeze section register

| Req ID | Freeze § | Summary | Role | DB | API | UI | Permissions | Tenant isolation | Loading/error/retry | Audit | Automated tests | Staging evidence | Provider dep | Approval dep | Classification | Gap | Owner | Commit | Evidence |
|--------|----------|---------|------|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|
| FRZ-001 | §1–2 | Binding scope + definition of complete | All | Partial | Partial | Partial | Partial | Partial | Partial | Partial | Partial | Partial | — | — | Partially implemented | Control docs now exist; full traceability in progress | Cursor | Phase 0 | This register |
| FRZ-002 | §3 | One responsive app, role experiences | All | Yes | Yes | Yes | Yes | Yes | Partial | Partial | Yes | Mocks | — | — | Implemented, not staging-verified | `/my` alias + role guards need live re-proof | Cursor | 8d35bfd | `role-experience-routes.test.ts` |
| FRZ-003 | §4 | Locked visual identity (SVG wordmark, fonts, login) | All | N/A | N/A | Partial | N/A | N/A | Partial | N/A | Yes | Staging reports + Sprint 004 shell tests | — | — | Partially implemented | Brand foundation closed; responsive shell contract tests added Phase 3 | Cursor | UX reports | `TitanWordmark.test.ts`, `brand-shell.test.ts` |
| FRZ-004 | §5 | Owner Command Centre (quick actions + panels + search) | Owner | Partial | Partial | Partial | Partial | Yes | Partial | Partial | Partial | UX-I partial | Cartrack/Maps | — | Partially implemented | Quick actions, attention panel, KPI deep-links, global search nav wired locally; live fleet map still open | Cursor | Sprint 005 | `entity-routes.test.ts`, dashboard |
| FRZ-005 | §6 | Customer/property/job contract + immutable snapshots | Owner/Dispatch | Yes | Yes | Partial | Yes | Yes | Partial | Yes | Yes | **Staging Phase 5 E2E 10/10 GO** (Sprint 017 rerun) | — | — | Partially implemented | Lead→convert→job chain verified staging; canonical 17-check evidence at `306ba6e` | Cursor | Sprint 017 | `TITAN_STAGING_VERIFICATION_SPRINT017_REPORT.md`, `140-staging-phase5-e2e.json` |
| FRZ-006 | §7 | Crew/vehicle/technician mobile execution | Tech/Dispatch | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | **Staging Phase 6 E2E 12/12** + UX-B 35/35 | Cartrack optional | — | **Verified complete (staging)** | Crew assign + calendar labels + cross-tenant job denial on Railway staging | Cursor | Sprint 011 | `diagnostic-output/141-staging-phase6-e2e.json` |
| FRZ-007 | §8 | Complete business-day timeline + labour events | Owner/HR | Partial | Partial | Partial | Partial | Yes | Partial | Partial | Partial | **Blocked staging** — route 404 on deployed API | — | Deploy | Partially implemented | Local slice done; staging smoke blocked until Railway redeploy HEAD | Cursor | Sprint 012/017 | `142-staging-phase8-12-e2e.json` |
| FRZ-008 | §9 | Owner daily target + financial control | Owner | Partial | Partial | Partial | Owner-only | Yes | Partial | Partial | Partial | None | — | Config approval | Partially implemented | Target engine not fully on dashboard | Cursor | — | FIN/dashboard gaps |
| FRZ-009 | §10 | Quotes, BOQs, tenders, approval workflow | Owner/Finance | Yes | Yes | Partial | Yes | Yes | Partial | Yes | Yes | **Blocked staging** — Railway DB `28P01`; BOQ routes need redeploy after env fix | — | Deploy + DB creds | Partially implemented | BOQ local foundation done; staging DB migrated; Railway env/redeploy blocked | Cursor | Sprint 013/017 | `boq.test.ts`, `156-staging-verification-summary.json` |
| FRZ-010 | §11 | Job numbering + Xero finance chain | Finance | Yes | Yes | Partial | Yes | Yes | Partial | Yes | Yes | UX-E staging | **Xero** | Live write | Partially implemented | TITAN-INV + job completion/billing panel local (Sprint 016); live Xero # authority + entity sync require OAuth | Cursor | Sprint 016 | `job-finance-workflow.test.ts`, `JobCompletionFinancePanel.tsx`, `XeroSyncPanel.tsx` |
| FRZ-011 | §12 | Materials, PO, job costing chain | Owner/Procurement | Yes | Yes | Partial | Yes | Yes | Partial | Yes | Yes | **Partial staging** — stock levels pass; movements 404 | Xero bills | Deploy | Partially implemented | Job costing local; staging movements route undeployed | Cursor | Sprint 014/017 | `142-staging-phase8-12-e2e.json` |
| FRZ-012 | §13 | Documents, OCR, reports, COC, job packs | All roles | Yes | Yes | Partial | Yes | Yes | Partial | Yes | Partial | **Blocked staging** — Railway DB `28P01`; pack routes need redeploy after env fix | AI provider | Deploy + DB creds | Partially implemented | Job pack local foundation; staging blocked | Cursor | Sprint 015/017 | `job-document-pack.test.ts`, `156-staging-verification-summary.json` |
| FRZ-013 | §14 | Workforce/HR/labour-law AURA team | Owner/HR | Partial | Partial | Partial | Partial | Yes | Partial | Partial | Partial | None | — | HR legal | Partially implemented | Draft-only discipline; no auto-dismiss | Cursor | — | HR modules |
| FRZ-014 | §15 | Xero data quality + marketing consent | Owner/Marketing | Yes | Yes | Partial | Yes | Yes | Partial | Yes | Yes | UX-H staging | Xero | Send approval | Partially implemented | Classifier closed; live send blocked | Cursor | UX-H | `marketing-eligibility.test.ts` |
| FRZ-015 | §16 | AURA specialist departments + orchestration | Owner | Yes | Yes | Partial | Yes | Yes | Partial | Yes | Partial | Mocks | **AI provider** | — | Blocked by credential/provider | AURA chat needs verified provider connection | Owner | — | AI-001, AI-006 |
| FRZ-016 | §17 | Multi-AI gateway + controlled self-learning | Owner | Yes | Yes | Partial | Yes | Yes | Partial | Yes | Partial | None | **AI provider** | Policy approval | Partially implemented | Gateway exists; live provider + policy gates open | Owner | — | `ai-orchestration` routes |
| FRZ-017 | §18 | Marketing/sales/digital presence | Owner | Partial | Partial | Partial | Yes | Yes | Partial | Partial | Partial | UX-H gates | Meta/Google | Publish approval | Partially implemented | Execute/send paths honest but not live | Cursor | UX-H | MKT module |
| FRZ-018 | §19 | Integrations truthful provider states | Owner | Yes | Yes | Partial | Yes | Yes | Partial | Yes | Yes | Preflight | **Multi** | OAuth | Partially implemented | Honesty improved; live creds not verified | Owner | — | `TITAN_PRODUCTION_PROVIDER_PREFLIGHT_REPORT.md` |
| FRZ-019 | §20 | Owner Configuration Studio | Owner | Yes | Yes | Partial | Owner | Yes | Partial | Yes | Partial | None | — | Config publish | Partially implemented | Studio pages exist; rollback/version depth TBD | Cursor | — | Platform pages |
| FRZ-020 | §21 | Controlled AURA Developer Studio | Owner | Partial | Partial | Partial | Owner | Yes | Partial | Yes | Partial | None | — | Prod deploy | Partially implemented | Workflow exists; prod isolation must be proven | Cursor | — | Developer portal |
| FRZ-021 | §22 | Build-control protocol | Team | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | — | — | Verified complete | This completion run follows protocol | Cursor | Phase 0 | Master directive |
| FRZ-022 | §21 launch | Internal pilot milestone | Young Guns | Partial | Partial | Partial | Partial | Partial | Partial | Partial | Partial | Reports | Multi | Pilot sign-off | Blocked by approval | Gates defined in pilot report | Owner | — | `TITAN_PILOT_READINESS_REPORT.md` |
| FRZ-023 | §23 | Full business chain acceptance | All | Partial | Partial | Partial | Partial | Partial | Partial | Partial | Partial | Partial | Multi | Launch approval | Partially implemented | Chain not end-to-end proven live | Owner | — | Final launch report |

---

## Pilot-critical acceptance chain (§23)

`Lead → Customer → Property → Job → Crew/Vehicle → Field execution → Materials/Variation → Quote/BOQ → Approval → Invoice → Payment → Profit → Follow-up/Marketing → Reporting`

| Chain link | Classification | Evidence |
|------------|----------------|----------|
| Lead → Customer → Property → Job | **Verified complete (staging)** — **smoke rerun NO-GO Sprint 019** until Railway DB fixed | Phase 5 E2E **10/10 GO** (Sprint 017); latest rerun **NO-GO** — `140-staging-phase5-e2e.json` |
| Crew/Vehicle assignment | **Verified complete (staging)** — **smoke rerun NO-GO Sprint 019** | Phase 6 E2E 12/12 GO (Sprint 017); latest rerun **NO-GO** — `141-staging-phase6-e2e.json` |
| Field execution | Implemented, not staging-verified | UX-B staging closure |
| Materials/Variation | Partially implemented | UX-F procurement + Phase 10 job costing panel + stock movement ledger |
| Quote/BOQ → Approval | Partially implemented | UX-E quotes; quote edit + internal approval workflow local (Sprint 013); BOQ workspace local foundation |
| Invoice → Payment | Partially implemented | UX-E + Phase 12 local: invoice-from-job, payment prefill, completion/billing chain panel; live Xero blocked |
| Profit | Partially implemented | Quote margin + job gross-profit estimate on job detail (authorized roles) |
| Follow-up/Marketing | Partially implemented | UX-H gates; no live send |
| Reporting | Partially implemented | Analytics partial |

---

## Next verification targets (ordered)

1. ~~**FRZ-005** — Staging lead conversion with real SA address/phone after deploy of `8d35bfd`~~ **DONE** — see `TITAN_PHASE5_STAGING_REPORT.md`  
2. ~~**FRZ-006 / Phase 6** — Crew assignment office UI **local complete**; scheduling calendar execution labels **local complete**; staging E2E proof still required~~ **DONE** — see `diagnostic-output/141-staging-phase6-e2e.json` (12/12 GO)  
3. ~~**FRZ-007 / Phase 8** — Office business-day timeline local slice **DONE**; AURA opening/closing brief + full event taxonomy remain~~ **DONE** — Sprint 012 `ec79a82`  
4. ~~**FRZ-009 / Phase 9** — Quote edit + approval workflow + BOQ workspace local foundation **DONE**; plan quotes + supplier PDF match remain~~ **DONE** — Sprint 013 `85c97d6`  
5. ~~**FRZ-011 / Phase 10 (local slice)** — Job costing summary API + panel; stock movement ledger route + UI **DONE**; supplier OCR/Xero bill match remain~~ **DONE (local)** — Sprint 014  
6. ~~**FRZ-012 / Phase 11 (local slice)** — Job document pack approval workflow + portal share + COC compliance panel **DONE**; supplier OCR + Reports & Compliance Agent remain~~ **DONE (local)** — Sprint 015  
7. ~~**FRZ-010 / Phase 12 (local slice)** — Job completion/billing chain panel + invoice-from-job + payment prefill + Xero sync UI stubs **DONE**; live Xero OAuth/sync remain~~ **DONE (local)** — Sprint 016  
8. **Staging migrations 0105–0106** — **DONE** (journal 106, Sprint 018–019 idempotent); **Railway redeploy + public smokes** — **BLOCKED** (Railway API `28P01`, invalid/unauthorized `RAILWAY_TOKEN`)  
9. **FRZ-015** — AURA provider verified connection (Owner credential gate)  
10. **FRZ-018** — Xero OAuth staging connect (Owner approval)  

---

## Row-level traceability

Detailed module rows (PLT-001 … YG-003) remain authoritative in **`TITAN_MASTER_ACCEPTANCE_REGISTER.md`**. Update both documents when a row or freeze section changes classification.
