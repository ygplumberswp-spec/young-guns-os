# TITAN Acceptance Register

**Source of truth:** `TITAN_FINAL_SCOPE_FREEZE (2).md` (31 July 2026)  
**Repository:** `/Users/keanuventer/Downloads/Titan Aura V1`  
**Branch:** `cursor/titan-frozen-scope-completion`  
**Checkpoint:** `pending Sprint 009`  
**Updated (UTC):** 2026-08-01 — Sprint 009 UX-017 finance strip + UX-029 job time UX  

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
| FRZ-005 | §6 | Customer/property/job contract + immutable snapshots | Owner/Dispatch | Yes | Yes | Partial | Yes | Yes | Partial | Yes | Yes | **Staging Phase 5 E2E 10/10** | — | — | Partially implemented | Job detail finance strip quick-actions local (UX-017); CRM properties panel local | Cursor | Sprint 009 | `TITAN_PHASE5_STAGING_REPORT.md`, `JobFinanceStrip.tsx` |
| FRZ-006 | §7 | Crew/vehicle/technician mobile execution | Tech/Dispatch | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Staging UX-B 35/35 | Cartrack optional | — | Implemented, not staging-verified | Staging E2E not re-run on current commit | Cursor | b9bd4b0 | `TITAN_UX_B_CLOSURE_VERIFICATION_REPORT.md` |
| FRZ-007 | §8 | Complete business-day timeline + labour events | Owner/HR | Partial | Partial | Partial | Partial | Yes | Partial | Partial | Partial | None | — | — | Partially implemented | Mobile `/mobile/time` job picker + job # on entries (UX-029); full day timeline incomplete | Cursor | Sprint 009 | `MobileTimePage.tsx`, OPS-014 |
| FRZ-008 | §9 | Owner daily target + financial control | Owner | Partial | Partial | Partial | Owner-only | Yes | Partial | Partial | Partial | None | — | Config approval | Partially implemented | Target engine not fully on dashboard | Cursor | — | FIN/dashboard gaps |
| FRZ-009 | §10 | Quotes, BOQs, tenders, approval workflow | Owner/Finance | Yes | Yes | Partial | Yes | Yes | Partial | Yes | Yes | UX-E staging | — | Quote send | Partially implemented | BOQ workspace + plan quotes largely missing | Cursor | UX-E | `finance-contract.test.ts` |
| FRZ-010 | §11 | Job numbering + Xero finance chain | Finance | Yes | Yes | Partial | Yes | Yes | Partial | Yes | Yes | UX-E staging | **Xero** | Live write | Partially implemented | TITAN-INV works; live Xero # authority open | Cursor | UX-E | FIN-002, FIN-007 |
| FRZ-011 | §12 | Materials, PO, job costing chain | Owner/Procurement | Yes | Yes | Partial | Yes | Yes | Partial | Yes | Yes | UX-F staging | Xero bills | — | Partially implemented | Procurement UI closed staging; live bill match open | Cursor | UX-F | `stock-movements.contract.test.ts` |
| FRZ-012 | §13 | Documents, OCR, reports, COC, job packs | All roles | Yes | Yes | Partial | Yes | Yes | Partial | Yes | Partial | UX-B docs | AI provider | Send approval | Partially implemented | Job pack send workflow incomplete | Cursor | — | DOC/COM gaps |
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
| Lead → Customer → Property → Job | **Verified complete (staging)** | Phase 5 E2E 10/10 GO — `diagnostic-output/140-staging-phase5-e2e.json` |
| Crew/Vehicle assignment | **Office UI implemented (local)** | `JobCrewAssignmentPanel` + schedule calendar execution labels; staging E2E pending FRZ-006 |
| Field execution | Implemented, not staging-verified | UX-B staging closure |
| Materials/Variation | Partially implemented | UX-F procurement |
| Quote/BOQ → Approval | Partially implemented | UX-E quotes; job detail finance quick-actions local (UX-017); BOQ workspace missing |
| Invoice → Payment | Partially implemented | UX-E; live Xero blocked |
| Profit | Partially implemented | Margin on quotes; job actuals partial |
| Follow-up/Marketing | Partially implemented | UX-H gates; no live send |
| Reporting | Partially implemented | Analytics partial |

---

## Next verification targets (ordered)

1. ~~**FRZ-005** — Staging lead conversion with real SA address/phone after deploy of `8d35bfd`~~ **DONE** — see `TITAN_PHASE5_STAGING_REPORT.md`  
2. **FRZ-006 / Phase 6** — Crew assignment office UI **local complete**; scheduling calendar execution labels **local complete**; staging E2E proof still required  
3. **FRZ-015** — AURA provider verified connection (Owner credential gate)  
4. **FRZ-018** — Xero OAuth staging connect (Owner approval)  

---

## Row-level traceability

Detailed module rows (PLT-001 … YG-003) remain authoritative in **`TITAN_MASTER_ACCEPTANCE_REGISTER.md`**. Update both documents when a row or freeze section changes classification.
