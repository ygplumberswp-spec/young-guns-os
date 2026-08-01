# TITAN Gap Backlog

**Project:** `/Users/keanuventer/Downloads/Titan Aura V1`  
**Generated (UTC):** 2026-07-31  
**Updated (UTC):** 2026-07-31 — Controlled staging isolated harness **CONDITIONAL GO** (75/0); cloud Railway URLs **BLOCKED_OWNER_ACTIONS**; provider sandbox **NO-GO**  

**Source:** `TITAN_MASTER_ACCEPTANCE_REGISTER.md` + binding decisions + `TITAN_OPERATIONAL_UX_AUDIT.md`  
**Mode:** Audit/docs only — no code, credential, database, migration, Git or deployment changes.

---

## Snapshot

| Register status | Count |
|-----------------|------:|
| VERIFIED LIVE | 31 |
| VERIFIED WITH MOCKS | 7 |
| BUILT BUT NOT CONNECTED | 5 |
| BUILT BUT NOT VISIBLE | 10 |
| PARTIAL | 41 |
| MISSING | 17 |
| BLOCKED BY CREDENTIALS/PROVIDER | 5 |
| REQUIREMENT CONFLICT | **0** |
| **Traceability rows** | **116** |
| **UX/handoff issues (UX-*)** | **55** |

All six former REQUIREMENT CONFLICT rows are decided. UX audit confirmed handoff/screen gaps (Critical/High/Medium/Low below + UX catalogue).

---

## Critical

| ID | Gap | Type | Why critical | Bound decision / repair |
|----|-----|------|--------------|-------------------------|
| PLT-003 | Binding migration ready; live/staging DB not yet migrated | PARTIAL | Access model underpins every module | Pre-check platform Owner count ≤1; apply `0094` on **staging** only (`TITAN_BATCH1A_MIGRATION_STAGING_REPORT.md`); Members stay until manual Users & Access reassignment |
| POR-007 | Zero `/my/*` routes; `/portal` is only client surface | PARTIAL | Canonical client path | **Decision 2** — `/my/*` canonical; `/portal/*` safe alias; one app |
| FIN-006 | ~~Xero still imports all contacts into customer classification~~ **UX-H classifier CLOSED staging** (import may still create contact rows) | PARTIAL | Contaminates CRM + marketing | **Decision 3** ACCREC paid-buyer classifier live; retain mappings; exclude suppliers/draft/void; placeholder emails; consent separate |
| CD-007 | ~~No sales-invoice-buyer reactivation eligibility~~ **CLOSED staging (UX-H)** | CLOSED | Marketing reactivation unsafe | Implements Decision 3 eligibility |
| CD-006 | ~~Marketing consent not enforced on campaign send~~ **CLOSED staging gates** (provider send still blocked) | PARTIAL | POPIA risk | Opt-out/unknown blocked from eligibility; execute returns SEND_PATH_NOT_IMPLEMENTED |
| COM-006 | Gmail grouped as if present; no Gmail backend | MISSING | False capability claim | **Decision 4** — NOT IMPLEMENTED until backend; truthful states |
| COM-011 | ~~n8n listed without connector~~ **CLOSED staging (UX-J)** | CLOSED | Automation-owned connector + Integrations deep-link honesty | **Decision 6 Option C** |
| AUT-002 | ~~n8n backbone absent~~ **CLOSED staging (UX-J)** (loopback-only; live cloud OUT) | PARTIAL→UX-J VERIFIED | Hybrid native + signed n8n orchestration with execution visibility | **Decision 5** |
| AI-006 | False connected impressions from UI grouping | PARTIAL | Trust | Same as Decisions 4 + 6 |
| OPS-008–011, OPS-015 | Job card capture + gated complete | **IMPLEMENTED (staging UX-B)** | Field techs can finish jobs in mobile UI | Staging E2E 35/35 — **UX-028** |
| POR-005 / POR-006 | Technician write UI + crew-scoped access | **IMPLEMENTED (staging UX-B)** | Unassigned tech denied; finance denied | Keep hardening portal/client surfaces — **UX-028** |
| POR-003 / OPS-016 | ETA in API, not shown on client jobs UI | BUILT BUT NOT VISIBLE / PARTIAL | Client promise | Render ETA on `/my` (and aliased `/portal`) — **UX-030** |
| FIN-005 / FIN-007 | Xero connect/import live path not acceptance-proven this audit | BLOCKED | Core accounting | Staging Sync after Decision 3 classifier — **UX-006–011, UX-021** |
| FLT-008 | ~~Honest Maps/ETA surfaces missing~~ **UX-I CLOSED staging** (live Maps SDK/Directions still OUT) | PARTIAL | Live provider ETA still open | Honest address/deep-link + capability states — **UX-024, UX-043 ✓**; live Maps deferred |
| PLT-008 | MFA built but not enforced at login | **CLOSED (Sprint 001/005)** | Security | Login MFA gate + `/auth/login/mfa` + web challenge flow |
| ~~UX-001 / UX-002 / UX-005~~ | **CLOSED (UX-A)** — auto title, full create fields, `JOB-######` | — | — | Apply `0095` on staging; prove E2E against staging DB |
| ~~UX-003 / UX-004~~ | **CLOSED (UX-A)** — immutable snapshot + explicit verified update checkboxes + audit | — | — | Staging acceptance |
| ~~UX-010 (remainder)~~ | **CLOSED (UX-E staging)** — finance list search (q/status/overdue); job list already searchable | — | — | Live Xero # sync still depends on FIN-007 |
| ~~UX-006 / UX-007 / UX-011~~ | **CLOSED (UX-E staging, no live Xero)** — internal TITAN-INV; Pending Xero sync display; job # → reference; never invent Xero # | — | — | Live Xero number authority still FIN-005/007 |
| UX-010 / UX-016 | Job search done; finance search done in UX-E; live Xero # depth still open | PARTIAL | Dispatch findability mostly closed | Live Xero # import — **FIN-007** |
| UX-012 | ~~Dashboard false “all zero” welcome~~ **CLOSED staging (UX-I)** | CLOSED | Owner home KPIs truthful | Real KPIs + `/jobs/today` Upcoming Work |
| UX-014 / UX-015 / UX-040 | CRM/portal missing address/property handoff into jobs | PARTIAL | No site of work | Properties first-class; portal property address — **OPS-001–002** |
| UX-019 | Lead convert → customer/property/job (transactional, idempotent) | **CLOSED (UX-D staging)** | Lead→job handoff live | Convert wizard — **OPS-003** |
| UX-051 | “Add a lead” → `/leads/new` create form; `/leads` registry | **CLOSED (UX-D staging)** | Lead capture reachable | Real lead create form + convert wizard — **OPS-003** |
| ~~UX-020 / UX-021~~ | **CLOSED (UX-E staging)** — line items + VAT + invoice stages | — | — | — |
| UX-055 | Portal quote **accept** closed (UX-E); pay invoice still unavailable; compose message closed earlier | PARTIAL | Client pay loop open | Honest pay unavailable until payment-link provider — **FIN-014** |
| ~~UX-023 / UX-042~~ | **CLOSED (UX-F staging Option B)** — procurement UI + van stock + PO receive↑stock + authorize↓stock | — | — | See `TITAN_UX_F_STAGING_REPORT.md` |
| UX-025 / UX-027 | ~~Comms may be log-only; Gmail/n8n false capability~~ **CLOSED staging** | CLOSED | False ops trust | Truthful send states + Decision 4/6 — **COM-006–007, COM-011, AI-006** |
| UX-026 | ~~Marketing Execute without consent/eligibility / real send~~ **CLOSED staging (UX-H)** | CLOSED | POPIA + fake success | Gate + honest execute (no provider send) — **MKT-001, CD-006–007** |
| UX-033 | ~~n8n backbone absent~~ **CLOSED staging (UX-J)** for Automations visibility | CLOSED | Live cloud n8n still OUT | Decision 5–6 — **AUT-002, COM-011** |

---

## High

| ID | Gap | Type | Recommended repair |
|----|-----|------|--------------------|
| ~~INV-004–006~~ | **CLOSED (UX-F staging)** — `/procurement` suppliers/POs/receive UI on existing APIs | — | — |
| ~~INV-003~~ | **CLOSED (UX-F staging)** — van location type + vehicle link | — | — |
| ~~INV-008~~ | **CLOSED (UX-F staging)** — approve material → idempotent stock decrement ledger | — | — |
| FIN-011 | Yoco profile sync only (no payment links/charges) | PARTIAL | Checkout / payment-link flow |
| FIN-014 | Payment links missing | MISSING | Spec Yoco/Stripe/link provider — **UX-022 remainder** |
| ~~FIN-004~~ | **CLOSED (UX-E staging)** — `payment_receipts` on payment record/detail (PDF polish later) | — | — | — |
| ~~UX-049~~ | **CLOSED (UX-E staging)** — quote/invoice/payment detail routes | — | — | — |
| ~~UX-053~~ | **CLOSED (UX-A)** — preferred appointment + optional assignee on create | — | — |
| FIN-015 | Quote cost/margin/profit-floor **CLOSED (UX-E)**; dedicated pricebook catalog UI still open | PARTIAL | Pricebook catalog / inventory sell-cost UI remains future |
| CD-002–004 | Placeholder email detect, verify, CRM duplicates | MISSING | Data-quality pipeline (Decision 3 placeholder rule) |
| CD-005 / UX-004 | Safe Xero contact correction; verified customer/property update option missing | BLOCKED / PARTIAL | Guided correction + explicit verified-detail update UX |
| FLT-002 | Cartrack live not credential-verified here | BLOCKED | Deferred from UX-I (Option A) → controlled provider-integration phase |
| FLT-003 / FLT-006 | Drivers + geofences missing | MISSING | Spec + implement |
| COM-001 | WhatsApp live send needs Meta credentials | BLOCKED | Deferred from UX-I (Option A) → controlled provider-integration phase (honesty closed under UX-G) |
| COM-003 | WhatsApp human takeover missing | MISSING | Handoff state + UI |
| COM-008 | Google Calendar planned only | BUILT BUT NOT CONNECTED | OAuth + sync |
| MKT-001 | ~~Reactivation without buyer eligibility~~ **CLOSED staging gates (UX-H)**; live send OUT | PARTIAL | Depends on CD-007 / Decision 3 — **UX-026** |
| MKT-003 / COM-012 | Social/ads adapters not live | BUILT BUT NOT CONNECTED | One real Meta/Google adapter |
| MKT-008 | Campaign response → job conversion incomplete | PARTIAL | Conversion pipeline — **UX-019** |
| AUT-006–007 | Reminder set incomplete (warranty/review/referral/maintenance) | PARTIAL | Add triggers + proof sends |
| YG-001–002 / UX-035 | ~~Cape Town geography + SANS/COC not encoded~~ **CLOSED staging (UX-I)** | CLOSED | Company prefs + Settings UI + COC applicability helpers |
| PLT-006 | Subscriptions/billing not fully payable | PARTIAL | Define Company Owner billing path |
| PLT-009 | SSO missing | MISSING | Spec IdP |
| Dashboard / UX-012 | ~~False zero welcome / empty upcoming~~ **CLOSED staging (UX-I)** | CLOSED | Truthful KPI strip + today scheduled panel |
| ~~UX-008 / UX-009~~ | **CLOSED (UX-E staging)** — job finance chips + invoice stages | — | — |
| UX-013 | Customer list no search; no address column | **CLOSED (Sprint 003)** | Search name/phone/address — **OPS-001** |
| UX-017 | Job detail finance strip + quick actions | **CLOSED (local + staging empty state)** | `JobFinanceStrip` + Phase 5 finance summary 0 chips — **OPS-005** |
| UX-018 | Schedule cards show JOB#/site/contact/priority/access | **CLOSED (UX-D staging)** | Suburb + operational context on events — **OPS-006** |
| UX-022 | Receipts + payment search **CLOSED (UX-E)**; payment links still missing | PARTIAL | Payment links — **FIN-014** |
| UX-024 / UX-043 | ~~No Maps honesty / address deep-link~~ **CLOSED staging (UX-I)** | CLOSED | Stored-data Maps surfaces; live Directions still OUT — **FLT-008** |
| UX-031 | Lead convert → internal dispatch handoff (notify + event once) | **CLOSED (UX-D staging)** | Booking→dispatch via lead/job conversion — **OPS-007** |
| UX-032 | AURA approved actions may no-op | PARTIAL | Fail loudly; ops writeback — **AI-004–006** |
| UX-037 | ~~Documents metadata ≠ real upload~~ | **CLOSED (staging)** | Binary upload/retrieve + ACL — see UX-B closure report |
| UX-041 | Portal docs/assets empty “will appear here” | PARTIAL | Surface real docs or honest empty — **POR-002** |

---

## Medium

| ID | Gap | Type | Recommended repair |
|----|-----|------|--------------------|
| OPS-002 | Properties not first-class in CRM | **PARTIAL (Sprint 006)** | CRM property panel + create job at property — **UX-015** |
| OPS-003 | `/leads` and `/sales-intelligence` overlap (+ convert gap Critical above) | PARTIAL | Single nav entry — **UX-019** |
| OPS-004 | Standalone contacts entity missing | MISSING | Spec if needed |
| OPS-013 / UX-044 | ~~Offline observability-only~~ | **CLOSED (staging web)** | IndexedDB queue + flush + states; optional store packaging later |
| OPS-014 / UX-029 | Time tracking job-linked in office + mobile UI | **CLOSED (local)** | Office day timeline + execution labour rollup + mobile job-scoped time/break/travel |
| FIN-009–010 | Outstanding surfaced on home (**UX-I**); richer cash-flow analytics still open | PARTIAL | Home outstanding ✓ — deeper cash panels later |
| FIN-012–013 | Stripe missing; EFT manual only | MISSING / PARTIAL | Product decision |
| FLT-004–005 | Trips/events derived heuristically | PARTIAL | Prefer provider trip/event APIs |
| FLT-009 | Non-Cartrack adapters stubbed | BUILT BUT NOT CONNECTED | Roadmap adapters |
| COM-002 / COM-004 | Voice receptionist/calls unproven live | PARTIAL | Telco provider |
| COM-005 | Media transcription placeholders | PARTIAL | Media sync |
| COM-007 | SMTP ≠ Gmail intelligence | VERIFIED LIVE but incomplete vs promise | Keep SMTP truthful; Gmail separate (Decision 4) — **UX-025** |
| MKT-005–006 / MKT-009 | Campaign/review/ROI depth | PARTIAL | Feed spend + outcomes |
| AI-001 | Chat blocked without keys | BLOCKED | Configure staging keys |
| AI-005 / UX-046 | Some execution pages “foundation” tone | VERIFIED WITH MOCKS | Tighten UX honesty |
| AUT-004 / UX-045 | Webhook foundation “not connected” copy | PARTIAL | Finish foundation UX |
| POR-001 / UX-039 | Mission Control orphan remains; UX-048/050/052 **CLOSED (UX-K)** | PARTIAL (UX-039 only) | Optional IA polish outside UX-K |
| ~~UX-054~~ | **CLOSED (UX-F staging)** — location address (+ type/vehicle) on Stock form | — | — |
| POR-002 | Client includes loyalty/knowledge/feedback beyond stated minimum | VERIFIED WITH MOCKS | Confirm scope under `/my/*` — **UX-041** |
| YG-003 | Anti-demo posture not uniformly enforced | PARTIAL | Seed/data policy checks |
| PLT-005 | Dual branding paths | PARTIAL | Single branding source |
| PLT-012 | Release controls not deploy-verified | VERIFIED WITH MOCKS | Staging dry-run |
| UX-034 | Users & Access lacks Young Guns role descriptions | PARTIAL | Role purpose copy — **PLT-003** |
| UX-036 | Dispatch Intelligence not tied to job create | **CLOSED (Phase 6 local)** | Deep-link to New Job from dispatch intel — **OPS-006** |
| UX-038 | Analytics KPI definitions not on home | PARTIAL | Definitions + home cards — Dashboard |

---

## Low

| ID | Gap | Type | Recommended repair |
|----|-----|------|--------------------|
| Docs/README | README still mentions historical “placeholder routes” | Docs drift | Update README |
| Automation/agents copy | “Foundation milestone / not connected” on some lists | UX honesty | Refresh copy where live — **UX-033, UX-046** |
| Playwright Chromium install | Managed browser install hangs; smoke uses system Chrome | Tooling | Fix installer or document Chrome path |
| Format/report artifacts | `.pnpm-store/`, `diagnostic-output/`, report markdown untracked | Hygiene | Keep out of commits |
| ~~Orphan enterprise modules / UX-048~~ | **CLOSED (UX-K staging)** — `/enterprise-modules` index + Owner nav | — | — |
| UX-047 | No shared modal system (inline panels + rare confirm) | UX system | Introduce modal pattern only where interaction needs it |
| ~~UX-050~~ | **CLOSED (UX-K staging)** — Finance=Quotes duplicate removed | — | — |

---

## Missing functionality (summary)

- Platform Owner / Manager / Accountant roles (Decision 1 — to implement)
- `/my/*` Client routes (Decision 2 — to implement; keep `/portal` alias)
- SSO (PLT-009)
- CRM contacts entity (OPS-004)
- Receipts (FIN-004)
- Stripe (FIN-012)
- Payment links (FIN-014)
- Company-email placeholder detection, email/mobile verification, CRM duplicate engine (CD-002–004)
- Sales-invoice-buyer reactivation eligibility (CD-007)
- Van stock (INV-003)
- Cartrack drivers + geofences (FLT-003, FLT-006)
- WhatsApp human takeover (COM-003)
- Gmail intelligence (COM-006 — NOT IMPLEMENTED until built)
- n8n connector + execution mirror (AUT-002 / COM-011 — Decisions 5–6)
- Cape Town geography rules + SANS/COC workflows (YG-001–002)

---

## Hidden / unreachable functionality

| Capability | Where it lives | Why hidden | UX ID |
|------------|----------------|------------|-------|
| Job documentation create (photo/checklist/signature) | Mobile API | No web mobile forms | UX-028 |
| Job complete | `POST /mobile/.../complete` | No Complete button | UX-028 |
| Procurement suppliers/POs/catalogues | `/api/v1/procurement` | No Owner UI routes | UX-023 |
| Client job ETA / live tracking detail | Portal experience API | Not rendered; `fetchPortalJob` unused | UX-030 |
| Invoice count on finance stats | `/finance/stats` | Not mapped to home cards | UX-012 |
| Many enterprise Owner pages | `App.tsx` routes | Absent from `OWNER_STAFF_NAV_ITEMS` | UX-048 |
| Lead handoff preview → customer/job | Leads API | Convert patches status only | UX-019 |
| Job finance linkage strip | Finance tables | Not shown on job detail | UX-008 |

---

## UX / handoff issue catalogue (confirmed)

Full screen matrix + acceptance tests: **`TITAN_OPERATIONAL_UX_AUDIT.md`**.

| Severity | Count |
|----------|------:|
| Critical | 30 |
| High | 14 |
| Medium | 8 |
| Low | 3 |
| **Total** | **55** |

| UX ID | Severity | Summary | Register IDs |
|-------|----------|---------|--------------|
| UX-001 | **CLOSED (UX-A)** | Auto operational job title (replace manual Title) | OPS-005, YG |
| UX-002 | **CLOSED (UX-A)** | New Job missing property/address/contact/urgency/access/docs | OPS-005, OPS-002 |
| UX-003 | **CLOSED (UX-A)** | Auto-fill + immutable job snapshot | OPS-005, CD-005 |
| UX-004 | **CLOSED (UX-A)** | Explicit verified customer/property update | CD-005, OPS-001 |
| UX-005 | **CLOSED (UX-A)** | TITAN job number first-class | OPS-005 |
| UX-006 | Critical | Xero owns final invoice numbering | FIN-002, FIN-007 |
| UX-007 | Critical | Job number → Xero Reference | FIN-007 |
| UX-008 | High | Job shows quote/invoice/payment/receipt numbers | OPS-005, FIN-001–004 |
| UX-009 | High | Deposit / progress / final invoices per job | FIN-002 |
| UX-010 | Partial / UX-A | Ops search done; Xero # / payment ref open | OPS-005, FIN-* |
| UX-011 | Critical | Never invent invoice numbers if Xero unavailable | FIN-002, FIN-005 |
| UX-012 | **CLOSED (UX-I)** | Dashboard KPI truth + today scheduled | Dashboard |
| UX-013 | High | CRM list search + address | **CLOSED (Sprint 003)** → OPS-001 |
| UX-014 | Critical | Customer create address/property/consent | OPS-001–002, CD-006 |
| UX-015 | Critical | CRM detail properties + create-job-at-property | OPS-002 |
| UX-016 | **CLOSED (UX-A)** | Job list job # / address / search | OPS-005 |
| UX-017 | Partial / UX-A | Snapshot done; finance strip open | OPS-005, FIN-* |
| UX-018 | High | Schedule site context + notify | OPS-006 |
| UX-019 | Critical | Lead convert → customer/job | OPS-003 |
| UX-020 | Critical | Quote line items / VAT / send | FIN-001 |
| UX-021 | Critical | Invoice stages + Xero authority UX | FIN-002 |
| UX-022 | High | Payment receipts / links / ref search | FIN-003–004, FIN-014 |
| UX-023 | Critical | Van stock + procurement UI + PO→stock | INV-003–008 |
| UX-024 | **CLOSED (UX-I)** | Honest dispatch Maps/ETA surface (no fake live) | FLT-008 |
| UX-025 | Critical | ~~Comms delivery truth + job threads~~ **CLOSED staging** | COM-001, COM-007 |
| UX-026 | Critical | ~~Marketing consent + eligibility + real execute~~ **CLOSED staging** | MKT-001, CD-006–007 |
| UX-027 | Critical | ~~Integrations capability honesty~~ **CLOSED staging** | COM-006, COM-011, AI-006 |
| UX-028 | Critical | Mobile job write/complete UI | OPS-008–015, POR-005 |
| UX-029 | Medium | Job-linked time UX | OPS-014 |
| UX-030 | Critical | Portal ETA render + `/my` | POR-003, POR-007, OPS-016 |
| UX-031 | High | Portal booking → dispatch | OPS-007 |
| UX-032 | High | AURA ops writeback honesty | AI-004–006 |
| UX-033 | **CLOSED (UX-J)** | Automation / n8n visibility | AUT-002 |
| UX-034 | Medium | Role descriptions for YG | PLT-003 |
| UX-035 | **CLOSED (UX-I)** | Cape Town / SANS/COC ops config | YG-001–002 |
| UX-036 | Medium | Dispatch intel → job create | **CLOSED (Phase 6 local)** |
| UX-037 | High | ~~Real document upload evidence~~ **CLOSED staging** | OPS-008 |
| UX-038 | Medium | Analytics definitions on home | Dashboard |
| UX-039 | Low | Mission Control orphaned | POR-001 |
| UX-040 | Critical | Portal property without address | OPS-002, POR-002 |
| UX-041 | High | Portal docs/assets empty UX | POR-002 |
| UX-042 | Critical | Mobile parts submit | INV-008 |
| UX-043 | **CLOSED (UX-I)** | Mobile route address + Maps deep-link honesty | FLT-008 |
| UX-044 | Medium | ~~Offline sync partial~~ **CLOSED staging web** | OPS-013 |
| UX-045 | Medium | Webhook foundation UX | AUT-004 |
| UX-046 | Medium | Agents foundation copy | AI-005 |
| UX-047 | Low | No shared modal pattern | — |
| UX-048 | **CLOSED (UX-K)** | Enterprise routes indexed + Owner nav | POR-001 |
| UX-049 | High | Finance lists have no detail routes | FIN-001–003 |
| UX-050 | **CLOSED (UX-K)** | Nav duplicate Finance = Quotes removed | POR-001 |
| UX-051 | Critical | “Add a lead” CTA self-loop; no create form | OPS-003 |
| UX-052 | **CLOSED (UX-K)** | Dispatcher console in staff nav | OPS-006, POR-001 |
| UX-053 | **CLOSED (UX-A)** | Job create omits schedule/assignee despite API | OPS-005–006 |
| UX-054 | Medium | Stock location address unused in UI | INV-001 |
| UX-055 | Critical | Portal missing quote approve / pay / compose | POR-002, FIN-003–014 |

### Journey handoff results (UX audit)

| # | Journey | Result |
|---|---------|--------|
| 1 | Lead → booked job | **FAIL** |
| 2 | Customer / property creation | **FAIL** |
| 3 | Job creation and dispatch | **PARTIAL** |
| 4 | Technician field completion | **FAIL** |
| 5 | Quote / invoice / payment / Xero | **PARTIAL** |
| 6 | Inventory and procurement | **FAIL** |
| 7 | Fleet / ETA / customer tracking | **FAIL** |
| 8 | Communication and documents | **PARTIAL** |
| 9 | Marketing / reactivation | **FAIL** |
| 10 | Customer portal | **PARTIAL** |
| 11 | Reporting / dashboard decisions | **FAIL** |
| 12 | AURA approvals and automation failures | **PARTIAL** |

---

## Connected-but-not-working / not-proven providers

| Provider | Code posture | Gap |
|----------|--------------|-----|
| Xero | Live OAuth + sync client; hardened import | Live Sync acceptance not re-run; must apply Decision 3 classification |
| Cartrack | Live vehicles/status client | Credentials not verified this audit; no drivers/geofences |
| WhatsApp | Live Graph client + webhooks | Needs Meta credentials; no human takeover |
| Yoco | Live business profile sync | No payments/links |
| SMTP email | Available connector | Not Gmail; must not be labelled as Gmail (Decision 4) |
| Google Maps / Calendar / Gmail | Planned or UI-only | NOT IMPLEMENTED / IMPLEMENTED NOT CONNECTED per Decision 4 |
| Meta social / Google Ads | MI adapter config | Not live network clients |
| n8n | UI label only | Decision 5–6: build tenant-scoped connector + visibility |
| Stripe | Absent | Missing |
| OpenAI / Gemini | Provider factory | Blocked until keys configured |

---

## Required credentials / manual setup

1. Xero OAuth app + staging org (for controlled import acceptance after Decision 3).  
2. Cartrack API username/password + vehicle access.  
3. Meta WhatsApp Business credentials (phone number ID, token, webhook verify).  
4. Yoco secret key (and product decision for checkout).  
5. SMTP credentials (Gmail OAuth only if Gmail adapter is later implemented).  
6. Google Cloud (Maps + Calendar) if ETA/routing/calendar remain in scope.  
7. AURA_OPENAI_API_KEY / Gemini keys for Owner AI Chat.  
8. n8n instance URL + tenant webhook/API credentials (Batch 4).  
9. ~~Decision record~~ — **done:** `TITAN_REQUIREMENT_DECISIONS.md`.

---

## Recommended repair order (implementation batches)

Decision batches from `TITAN_REQUIREMENT_DECISIONS.md`, plus UX-shaped batches from `TITAN_OPERATIONAL_UX_AUDIT.md`:

| Batch | Focus | Critical IDs |
|-------|-------|--------------|
| **0** | Decision freeze (docs) | — |
| **1A** | Role matrix *(code done; migrate/remap pending)* | PLT-003, POR-004–006 |
| **1B** | Capability states + `/my/*` + `/portal` alias | POR-007, COM-006, COM-011, AI-006, **UX-027, UX-030** |
| **UX-A** | **DONE** — job contract shipped; apply `0095` on staging only | Closed **UX-001–005, UX-016, UX-053**; partial **UX-010, UX-017** |
| **UX-B** | **CLOSED (staging)** — crew/vehicle, binary evidence, signature pad, offline flush, labour/materials, variations, gated completion | **UX-028–029 ✓, UX-037 ✓, UX-044 ✓**; UX-042 remainder + INV-008 closed under **UX-F** |
| **UX-C** | **CLOSED (local)** — Client ETA + property address + `/my` + approve/message; pay honestly unavailable | **UX-030 ✓, UX-040 ✓, UX-041 ✓, UX-055 ✓ (pay deferred honest)** → POR-003, POR-007, OPS-016 |
| **UX-D** | **CLOSED (staging)** — Lead create + convert→job wizard; booking→dispatch notify; schedule context | **UX-019 ✓, UX-031 ✓, UX-018 ✓, UX-051 ✓** → OPS-003, OPS-007 |
| **2 / UX-E** | **CLOSED (staging)** — Quote-to-Cash + FIN-015 floors + genuine portal acceptance; no live Xero; CD-006–007 deferred to UX-H | **UX-006–011 ✓, UX-020–022 ✓ (links remainder), UX-008–009 ✓, UX-049 ✓**, FIN-001–004 ✓, FIN-015 quote floors ✓ |
| **UX-F** | **CLOSED (staging Option B)** — van stock + procurement UI + PO receive↑stock + UX-042 authorize↓stock + location address | **UX-023 ✓, UX-054 ✓, UX-042 remainder ✓** → **INV-003–008 ✓** |
| **Future (freeze text only)** | Reports & Compliance Agent; supplier PDF/OCR/AI match; freeze §12 OCR/Xero bill match | **Do not implement** until a dedicated freeze batch — **BOQ local foundation Phase 9**; **job costing panel + stock ledger UI Phase 10**; **job pack approval + portal share Phase 11** |
| **3** | Field ops wrap after UX-B/C — **Maps/ETA IDs moved to UX-I (Option A)**; INV-008 closed under UX-F | OPS-008–015 ✓, POR-003 ✓ (via UX-B/C); **UX-024/043 → UX-I** |
| **UX-G** | **CLOSED (staging)** — Comms honesty + Integrations capability states; migration `0102` | **UX-025 ✓, UX-027 ✓** → COM-006–007, COM-011, AI-006 |
| **UX-H** | **CLOSED (staging)** — ACCREC buyer classification + contact quality + consent/suppression + reactivation eligibility + audience approval; execute blocked (`SEND_PATH_NOT_IMPLEMENTED`); migration `0103` | **UX-026 ✓** → MKT-001–002, CD-006–007, FIN-006 |
| **UX-I** | **CLOSED (staging, Option A)** — Dashboard KPI truth + honest Maps/ETA surfaces + YG Cape Town geography/COC; **no** live providers; no new migration | **UX-012 ✓, UX-024 ✓, UX-035 ✓, UX-043 ✓** → YG-001–002 ✓; FLT-008 honest surface ✓ |
| **4 / UX-J** | **CLOSED (staging)** — Hybrid n8n orchestration; migration `0104` | **COM-011 ✓, AUT-002 ✓**, UX-033 ✓; UX-032 AURA writeback remainder may remain |
| **Provider phase (deferred)** | Live WhatsApp + Cartrack depth (was Batch 5 ambiguity) | **COM-001, FLT-002** — not UX-I; not UX-J by default |
| **UX-K** | **CLOSED (staging)** — Nav honesty; no new migration; journal **104/104**; E2E **24/24** | **UX-050 ✓, UX-052 ✓, UX-048 ✓** → POR-001 |
| **6** | Security polish: MFA at login, SSO roadmap | PLT-008, PLT-009 |

---

## Acceptance gates before “production ready” claim

- [x] Role model **decided** (Decision 1) — [x] code + disposable 0094 — [x] **staging migrate** through `0098` (dedicated staging only).  
- [x] Client path **decided** (`/my/*` + `/portal` alias) — [x] **implemented** (UX-C).  
- [x] Xero classification **decided** (Decision 3) — [ ] importer + eligibility **implemented**; staging Sync green.  
- [x] Integration honesty **decided** (Decision 4) — [x] UI shows truthful capability states (UX-G); Gmail/n8n NOT IMPLEMENTED.  
- [x] Automation hybrid **decided** (Decisions 5–6) — [x] n8n honesty deep-link (UX-G) — [x] n8n connector + executions visible in TITAN (UX-J, loopback-only).  
- [x] Operational UX audit published — [x] UX-A — [x] UX-B Closure — [x] UX-C — [x] UX-D — [x] UX-E — [x] UX-F — [x] UX-G — [x] UX-H — [x] UX-I — [x] UX-J — [x] UX-K.  
- [x] Nav honesty closed (**UX-050/052/048** / UX-K) — staging E2E **24/24**.  
- [x] Production/provider **preflight (read-only)** published — `TITAN_PRODUCTION_PROVIDER_PREFLIGHT_REPORT.md`.  
- [x] Protected production logical backup + clone restore + migrate dry-run — `TITAN_PRODUCTION_BACKUP_CLONE_DRY_RUN_REPORT.md`.  
- [x] Production migration cutover `0094`–`0104` — **COMPLETE** — prod journal **104/104**.  
- [x] Production hosting foundation — **COMPLETE** — `TITAN_PRODUCTION_HOSTING_FOUNDATION_REPORT.md` (**GO** for staging deploy only).  
- [x] Controlled staging **isolated** harness (DB 104, API/web gates, RBAC/smoke) — **CONDITIONAL GO** (`TITAN_STAGING_DEPLOYMENT_REPORT.md`).  
- [ ] Public Railway/Render staging URLs — **owner actions** (`TITAN_STAGING_OWNER_ACTIONS.md`).  
- [ ] Staging Redis provisioned + `READY_REQUIRE_REDIS=true` — owner cost approval.  
- [ ] Lead convert returned 400 in staging-ctrl harness (non-blocking; UX-D previously green) — recheck on cloud staging.  
- [ ] Staging provider sandbox integration — **NO-GO** until public staging live.  
- [ ] Provider activation — **not started**.  
- [x] Client `/my` shows ETA for in-progress/scheduled jobs; `/portal` alias works (**UX-030**, POR-007).  

- [x] Scope freeze reconciled (`TITAN_FINAL_SCOPE_FREEZE.md` §24–§27) into Master Register + Gap Backlog.  
- [x] New Job creates auto title + TITAN job # with property/address/site contact/urgency/access snapshot (**UX-001–005**) — [x] staging `0095`+.  
- [x] Jobs searchable by job # / customer / address / mobile — [x] finance search (**UX-010**); live Xero # import still FIN-007.  
- [x] Internal invoice numbers + job # reference + no fake Xero numbers offline (**UX-006–007, UX-011**) — [ ] live Xero number authority (FIN-005/007).  
- [x] Technician completes job with **binary** photo + checklist + signature pad / reason (**UX-028/037/011**).  
- [x] Offline queue + idempotent flush (**UX-044** web native).  
- [x] Lead convert creates customer + property + job (**UX-019** / UX-D) — staging E2E **26/26**.  
- [x] Parts used → stock decrement; PO receive increases stock (**UX-023, UX-042** / INV-008) — UX-F staging **30/30**.  
- [x] Marketing cannot message opted-out / ineligible contacts (**UX-026** / UX-H) — eligibility blocked; provider execute not implemented.  
- [x] Home dashboard KPIs truthful + today scheduled (**UX-012** / UX-I) — staging E2E **20/20**; live Maps Directions still OUT.  
- [x] No live Young Guns data mutated during tests; staging dataset used.

---

## Explicit non-actions from this audit / decision phase

- No source code changes  
- No `.env` / credential changes  
- No live provider writes  
- No database record mutations  
- No migrations applied (including 0094)  
- No Git commits / pushes / deployments
