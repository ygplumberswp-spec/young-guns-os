# TITAN Progress Tracker

Live status of the TITAN Business OS roadmap.

**Legend**

| Symbol | Meaning |
|--------|---------|
| 🟢 | Completed |
| 🟡 | Built / testing |
| ⬜ | Remaining |

Update this file when a milestone changes status. Source of truth for scope: [`TITAN_AURA_MASTER_BLUEPRINT.md`](./TITAN_AURA_MASTER_BLUEPRINT.md).

---

## Operations

| Module | Status |
|--------|--------|
| Jobs | 🟢 Completed |
| Scheduling | 🟢 Completed |
| Dispatch | 🟢 Completed |
| Fleet | 🟢 Completed |
| Vehicle Intelligence | 🟢 Completed |
| Technician Intelligence | 🟢 Completed |
| Workflow Automation Engine | 🟢 Completed |
| Recurring Maintenance Engine | 🟢 Completed |

---

## Communication

| Module | Status |
|--------|--------|
| Gmail | 🟢 Completed |
| Resend | 🟢 Completed |
| Email Centre | 🟢 Completed |
| Communication Timeline | 🟢 Completed |
| Client Completion Reports | 🟢 Completed |
| Personal WhatsApp Intelligence (foundation) | 🟢 Completed |
| Personal WhatsApp Connection Layer | 🟢 Completed |
| Communication AURA Intelligence | 🟢 Completed |
| Owner Voice & WhatsApp Command Mode | ⬜ Remaining (planned / required) |

---

## AURA Ecosystem

| Module | Status |
|--------|--------|
| AURA Chat | 🟡 Built / testing |
| Command Centre | 🟢 Completed |
| Agent coordination | 🟢 Completed |
| Business memory | 🟢 Completed |
| Executive assistant mode | 🟢 Completed |
| Morning Business Briefing | ⬜ Remaining |
| Agent-to-agent communication | 🟢 Completed |
| AURA Evolution / Learning Agent | 🟢 Completed |

---

## Marketing

| Module | Status |
|--------|--------|
| Marketing Agent | 🟢 Completed |
| Facebook | 🟢 Completed |
| Instagram | 🟢 Completed |
| TikTok | 🟢 Completed |
| LinkedIn | 🟢 Completed |
| Google Business Profile | 🟢 Completed |
| Website monitoring | ⬜ Remaining |
| Content intelligence | 🟢 Completed |
| Reputation management | 🟢 Completed |
| Competitor intelligence | 🟢 Completed |

---

## Finance

| Module | Status |
|--------|--------|
| Xero Finance Foundation Repair (historical sync & pipeline) | 🟢 Completed |
| Finance Intelligence Agent | 🟢 Completed |
| Cashflow intelligence | 🟢 Complete |
| Profit forecasting | ⬜ Remaining |
| Job profitability | 🟢 Complete |
| Expense intelligence | 🟡 Partial (PO-only) |
| Reporting automation | 🟢 Completed |

---

## Inventory

| Module | Status |
|--------|--------|
| Inventory Intelligence | 🟢 Completed |
| Stock intelligence | 🟡 Built / testing |
| Warehouse | 🟡 Built / testing |
| Suppliers | 🟢 Completed |
| Pricing | 🟢 Completed |
| Purchase orders | 🟢 Completed |
| Reorder alerts | 🟡 Built / testing |
| Forecasting | 🟢 |


---

## HR

| Module | Status |
|--------|--------|
| HR Intelligence | 🟡 Built / testing |
| Employee records | 🟢 Completed |
| Payroll intelligence | 🟢 Completed |
| Timesheets | 🟢 Completed |
| Overtime | 🟢 Completed |
| Leave | ⬜ Remaining |
| Performance | 🟢 Completed |
| Recruitment | 🟢 Completed |

---

## Customer Experience

| Module | Status |
|--------|--------|
| Customer portal | 🟢 Completed |
| Booking | ⬜ Remaining |
| ETA tracking | ⬜ Remaining |
| Notifications | ⬜ Remaining |
| Reviews | ⬜ Remaining |
| Customer lifetime value | 🟡 Built / testing |
| HomeShield experience | 🟢 Completed |

---

## Expansion

| Module | Status |
|--------|--------|
| Voice AI Receptionist | 🟢 Completed |
| Call Intelligence Engine | 🟢 Completed |
| Sales Intelligence Agent | 🟢 Completed |
| Sales Follow-up Intelligence | 🟢 Completed |
| Sales Analytics Intelligence | 🟢 Completed |
| Customer 360 | 🟢 Completed |
| Property Intelligence | 🟢 Completed |
| Document Intelligence | 🟢 Completed |
| Compliance Intelligence | 🟢 Completed |
| Executive Command Centre | 🟢 Completed |
| Smart Notifications | ⬜ Remaining |
| Market Intelligence | ⬜ Remaining |
| Security Monitoring | ⬜ Remaining |
| Industry Templates | ⬜ Remaining |
| SaaS Scaling | ⬜ Remaining |

---

## Notes

- Owner Voice & WhatsApp Command Mode — **planned / required scope, not started**. Owner call-in to the business number and Owner WhatsApp commands to the office number, handled inside the existing Communications / Voice AI Receptionist / WhatsApp / AURA orchestration / Executive Assistant phase rather than as a new parallel architecture. Verified Owner identity plus short-lived verification (caller ID / WhatsApp sender alone is never enough), explicit Owner confirmation for money, payroll, bank, deletes, campaign publish, bulk comms, permission changes and important cancellations, RBAC + `companyId` scoping, and full audit of every command, approval and execution. Full scope: [`OWNER_VOICE_WHATSAPP_COMMAND_MODE.md`](./OWNER_VOICE_WHATSAPP_COMMAND_MODE.md).
- Executive Command Centre (Department 15, `executive-command-centre`, migration `0166`, journal idx 162) — Owner-only unified business view that **extends** the existing AURA Command Centre (Dept `aura-command-centre`, migration `0133`) instead of rebuilding it: agent orchestration, memory and handoffs stay at `/aura/command-centre` and are linked from here, and finance operations stay under `/finance` and Cashflow & Profit Intelligence. This layer composes real connected sources rather than recomputing them — revenue, profit, margin, cash position and outstanding/overdue receivables are read from `FinanceCashflowProfitService` (real `invoices` / `payments` rows), while jobs, staff, fleet, marketing and sales panels are counted from real `jobs`, `users`, `vehicles`, `marketing_campaigns`, `sales_opportunities` and `leads` rows. No business figure is stored or cached, so a metric can never drift from its source. Financial figures are never invented: every money value carries `available` / `partial` / `unavailable` plus a rationale, a missing figure stays `null` rather than being coerced to `R0`, labour cost is excluded until a real rate exists, margin reports `unavailable` rather than being estimated, and open pipeline value is only summed from opportunity rows carrying a real estimated value in a single currency — mixed currencies report the currency spread instead of applying an invented exchange rate. Unfilled panels are surfaced through `unavailablePanels` with the reason. Risks (cash shortfall, overdue receivables, unknown margin, job backlog, fleet downtime, sales pipeline stall, staffing gap) and opportunities (open pipeline, unconverted leads, idle capacity, marketing reach, margin improvement) are derived only from real signals and never self-resolve. AURA may summarise and recommend only: `autoExecuteActionsEnabled`, `inventFinancialFiguresEnabled` and `autoExecuted` are invariant false in the service, the route envelopes and CHECK constraints, refreshed drafts are queued rather than applied, and Owner approval records a decision that never executes a finance, payroll, dispatch or marketing change. Access is Owner only and decided by role, not permission breadth — a wildcard permission does not grant entry, and Technician, Client, Manager, Dispatcher, Accountant and Staff are denied at the router gate and again in the service (proven behaviourally across 7 non-owner roles × 10 endpoints, with denial occurring before any database access). Every query and mutation is scoped by `companyId`, cross-tenant action-draft links and decisions are refused, and every mutation is audited via `security_audit_logs`. No fake business data. One consolidated Owner nav entry `/executive-command-centre` (no additional Intelligence entries). No deploy. Never touches Yoco `0123`.
- Compliance Intelligence (Department 14, `compliance-intelligence`, migration `0164`, journal idx 161) — extends Document Intelligence (COC/certificate profiles and document expiry), Legal & Compliance (frameworks, insurance, obligations), documents, properties, jobs and equipment rather than rebuilding any of them: company-tracked SANS standards, COC workflows with a staged lifecycle, compliance checks over real job/workflow evidence, expiry tracking across DI document profiles, LC compliance records, LC insurance policies, asset warranties and COC workflows, plus audit preparation packs assembled only from real document IDs and real check results. SANS, COC, checks, expiry and audit snapshots each report `available` / `unavailable` with a rationale and stay `unavailable` rather than inventing counts, and checks never invent a pass or fail. No certificate is ever issued automatically: `autoCertificationEnabled`, `inventComplianceRecordsEnabled`, `autoExecuteActionsEnabled`, `autoCertified`, `certificationDecision` and `autoExecuted` are invariant false in the service, the route envelopes and CHECK constraints; moving a COC workflow to `issued` requires Company Owner approval on a real workflow row, and every status change is recorded as a status change only, never as a certification decision. Compliance risk, missing-document and expiry-alert drafts are recommendations requiring Owner approval, and approval never certifies, renews, sends notices, or mutates legal records. Technician and Client denied; reads need `legal_compliance:read`/`:write`/`:manage`, `documents:read`/`:write` or `agents:read` while writes need `legal_compliance:write`, `legal_compliance:manage` or `documents:write`; every cross-entity FK (document, job, property, customer, SANS standard, source draft) is validated against the caller's company before it is stored, audit pack document IDs are intersected with company-owned documents, and every read and write is scoped by `companyId` and audited via `security_audit_logs`. No fake compliance records. Owner UI `/compliance-intelligence`. No deploy. Never touches Yoco `0123`.
- Document Intelligence (Department 13, `document-intelligence`, migration `0163`, journal idx 160) — extends the existing documents foundation (`documents` / `document_categories` / job document packs) rather than rebuilding upload and CRUD, which stay under `/documents`: typed profiles for COCs, quotes, invoices, reports, warranties, certificates and photos; cross-field document search over real rows; version history with a baseline seeded from the existing document register; expiry reminders from real profile expiry dates; and document linking to customers, jobs and `cx_customer_properties` via real FKs only. Search, expiry and version snapshots each report `available` / `unavailable` with a rationale and stay `unavailable` rather than inventing counts when no real documents, expiry dates or versions exist. Expiry alert and missing-document suggestion drafts are recommendations only: `autoSendRemindersEnabled` / `inventDocumentsEnabled` / `autoExecuted` are invariant false and enforced by CHECK constraints, only Company Owner may approve drafts or change settings, and approval never issues, certifies, publishes, sends or deletes a document — there are no DELETE endpoints and no outbound send path in this layer. Technician and Client denied; reads need `documents:read` / `documents:write` / `agents:read` and writes need `documents:write`; every read and write is scoped by `companyId` and audited via `security_audit_logs`. No fake documents. Owner UI `/document-intelligence`. No deploy. Never touches Yoco `0123`.
- Property Intelligence (Department 12, `property-intelligence`, migration `0161`, journal idx 159) — property-centric overlay on real `cx_customer_properties` plus customers / jobs / completion reports / job document packs / CX documents / asset registry / recurring maintenance plans and runs (does not rebuild property CRUD, which stays under CRM, and coexists with Customer 360 rather than duplicating it): property profiles with composed addresses, installed equipment and geyser signals, COC and photo evidence, previous work, and maintenance history. Google Maps pins report `unavailable` unless the property row holds real validated coordinates — coordinates are never invented, and the Maps snapshot explains why when the integration is disconnected. Insight drafts (property history, maintenance opportunity, follow-up, equipment attention, COC attention) are recommendations only: `autoSend` / `inventedProperty` / `autoSendEnabled` / `inventPropertiesEnabled` are invariant false, only Company Owner may approve or change sensitive settings, and approval never sends customer communications or mutates CRM / jobs / maintenance. Technician and Client denied; reads need customers/jobs/documents/ops/agents permissions and writes need `customers:write`, `jobs:write`, or `ops:manage`; every read and write is scoped by `companyId` and audited via `security_audit_logs`. No fake properties. Owner UI `/property-intelligence`. No deploy. Never touches Yoco `0123`.
- Sales Analytics Intelligence (Department 10.3, `sales-analytics-intelligence`, migration `0158`, journal idx 156) — extends Sales Intelligence Agent (10.1) and Sales Follow-up (10.2) plus real CRM leads / quotes / `sales_opportunities` / jobs / finance aggregates (does not rebuild them): leads created, quotes sent/accepted/declined, quote conversion rate, lead-to-quote rate, win rate, open pipeline value, and sales performance rows. Rates and revenue are never invented — each metric reports `available` / `partial` / `unavailable` with a rationale, and conversion stays `unavailable` until the Owner-configured minimum sample of sent quotes is reached. Insight drafts (sales trend, lost opportunity, improvement area, revenue opportunity) and AURA handoffs are recommendations only: `inventedRates` / `autoOutreach` / `inventRatesEnabled` / `autoOutreachEnabled` are invariant false and approval never sends. Technician and Client denied; Owner + sales/leads/analytics RBAC; audited via `security_audit_logs`. Owner UI `/sales-analytics-intelligence`. No deploy. Never touches Yoco `0123`.
- Sales Follow-up Intelligence (Department 10.2, `sales-followup-intelligence`, migration `0159`) — extends Sales Intelligence Agent Foundation (10.1) plus real quotes / CRM customers / jobs / communications / recurring maintenance (does not rebuild the agent): quote follow-up reminders with scheduling and honest customer-response tracking, objection handling drafts (price / timing / scope / trust / competitor — category `unavailable` when no stored signal text), and reactivation opportunity drafts from real completed-job and maintenance history. Every outbound artefact is draft-only with Owner approval; `autoSend` / `autoSendEnabled` are invariant false and approval still does not send (Email Centre / approved outbound path executes). Technician and Client denied; Owner + sales/leads/quotes RBAC; audited via `security_audit_logs`. No fake campaigns or invented responses. Owner UI `/sales-followup-intelligence`. No deploy. Never touches Yoco `0123`.
- Sales Intelligence Agent Foundation (Department 10.1, `sales-intelligence-agent`, migration `0157`) — extends existing CRM / leads / sales pipeline / quotes / communications (does not rebuild CRM): lead hunting from real sources/quotes/comms, honest lead qualification (needs/urgency/score/potential value when stored), pipeline + conversion tracking foundation, and AURA sales insight/recommendation drafts (best next action, lead priority, revenue opportunities). Owner approval required before outreach; no spam / no uncontrolled outreach / never auto-send. Registers Command Centre `sales` key. Owner UI `/sales-intelligence-agent`. No fake leads; no deploy. Never touches Yoco `0123`.
- Call Intelligence Engine (Department 9.2, `call-intelligence`, migration `0156`) — extends Voice AI Receptionist (9.1) + core `/voice` sessions: call summaries/key points/requests/actions/follow-up recommendations from real transcripts/notes; privacy-gated customer history lookup; lead extraction drafts with Owner approval (never auto CRM write / never auto customer communication); sentiment when lexical signal present else unavailable; aggregated call insights from real call text only. Owner UI `/call-intelligence`. No fake calls/leads. No deploy. Never touches Yoco `0123`.
- Driver Intelligence (Department 8.2, `driver-intelligence`, migration `0155`) — extends Fleet / Cartrack / Vehicle Intelligence / job-vehicle: driver profiles, driving behaviour insights, route efficiency, vehicle usage, trip analysis from real GPS/behaviour/assignment signals; AURA recommendation drafts (efficiency/risk/training — never auto-discipline). Owner/Admin only for behaviour intelligence. No fake GPS; honest unavailable when Cartrack/trips missing. Operational CRUD stays under `/fleet`; GPS analytics under `/fleet-intelligence`; vehicle profiles under `/vehicle-intelligence`. Owner UI `/driver-intelligence`. No deploy. Never touches Yoco `0123`.
- Customer Engagement Intelligence (Department 7.2, `customer-engagement-intelligence`, migration `0147`) — engagement/relationship scoring, satisfaction tracking, follow-ups, review requests, communication insights (Communication AURA + timeline when present), retention opportunities including HomeShield renewal/inactive signals. Connects Customer 360 (honest unavailable — not rebuilt), Communication Timeline/AURA, Jobs, Recurring Maintenance, HomeShield. AURA suggests follow-ups / unhappy customers / opportunities as drafts only; no auto-send; Owner/ops approval. Extends Communication Intelligence / CX foundations. No fake customers or scores. Owner UI `/customer-engagement-intelligence`. No deploy. Never touches Yoco `0123`.
- Recruitment & Performance Intelligence (Department 6.3, `recruitment-performance-intelligence`, migration `0152`) — extends recruiting candidates/applications, workforce skills/certs/training, Technician Intelligence, jobs/quality/timesheets, HR Employee Intelligence, Payroll & Timesheet Intelligence: candidate pipeline, interview workflow drafts, Owner-gated hiring drafts, performance insights, and AURA recommendation drafts (training/capacity/workforce risk/planning — recommendations only; no automatic hiring; no fake candidates/scores). Owner UI `/recruitment-performance-intelligence`. No deploy. Never touches Yoco `0123`.
- Fleet AI Recommendations (Department 8.3, `fleet-ai-recommendations`, migration `0154`) — Owner/Admin-gated AURA optimisation recommendation drafts from real Cartrack/fleet/job/cost/maintenance signals: maintenance suggestions, cost reduction, route improvements, fleet efficiency, replacement planning. Recommendations only; never auto-assign/sell/replace/execute maintenance; no invented GPS/costs. Extends Vehicle Intelligence + existing fleet; does not rebuild Driver Intelligence.
- Voice AI Receptionist Foundation (Department 9.1, `voice-ai-receptionist`, migration `0153`) — extends `/voice` + enterprise voice reception: inbound call session records, caller identification, CRM customer lookup, approval-gated lead create (execute on Owner approve), booking drafts (never auto-schedule), routing rules, SA locale/voice config with honest `not_configured` TTS/STT/telephony until credentials connect, always-on human takeover + audit. Owner UI `/voice-ai-receptionist`. No fake calls/customers/leads. No deploy. Never touches Yoco `0123`.

- HomeShield Customer Experience (Department 7.3, `homeshield-experience`, migration `0148`) — membership plans, subscriptions, benefits, service reminders, maintenance history from Recurring Maintenance, renewal/outreach drafts, honest customer lifetime value (unavailable without stored CLV — never invented), AURA retention/customer-value/maintenance/renewal recommendation drafts (Owner approval; never auto-bill). Portal `/my/homeshield` own data only. No fake memberships.

- Vehicle Intelligence Foundation (Department 8.1, `vehicle-intelligence`, migration `0150`) — extends existing Fleet / Cartrack / job-vehicle modules: real vehicle profiles, fuel tracking foundation from fleet operating costs, maintenance cues from vehicle status + vehicle-linked asset schedules, vehicle costs, usage history from job assignments, AURA insight drafts (maintenance/cost/risk; Owner approval; never auto-mutate fleet). No fake GPS/fuel; honest unavailable when Cartrack disconnected or no records. Operational CRUD stays under `/fleet`; GPS analytics under `/fleet-intelligence`.
- Employee Intelligence Foundation (`hr-employee-intelligence`, migration `0151`) — Owner/Admin-gated profiles, workforce overview/capacity, skills intelligence (gaps/training needs), and AURA recommendation drafts only (skills shortage, training opportunity, capacity — never auto HR). Connects Technician Intelligence, Jobs, Scheduling, and Legal & Compliance (qualification-expiry signals from real `certifications.expires_at`, migration `0165`); timesheets/payroll/recruitment future-ready with honest unavailable. No fake employees/payroll. Extends users/roles/workforce/wi_profiles/technician-intelligence.
- Payroll & Timesheet Intelligence (Department 6.2, `payroll-timesheet-intelligence`, migration `0149`) — extends `wi_timesheets` / `mobile_time_entries` / payroll prep / jobs / Technician Intelligence / HR Employee Intelligence: hours, job time, attendance, overtime, approval workflow insights; labour-cost/payroll summaries/cost trends from real hours (unavailable without stored rate); AURA workforce insight drafts (overtime trends, labour-cost risks, capacity issues, productivity patterns, scheduling opportunities — recommendations only). Owner/Admin only for sensitive payroll; optional technician self hours. No fake data; no auto payroll mutation; no deploy.
- Xero Finance Foundation Repair (Department 4.0, migration `0145`) — extends existing Xero OAuth + sync foundation: historical invoice/quote/payment/contact import with provenance + line-item account codes, durable bank-transaction import (read-only, no automatic accounting), contact match by Xero ID/email/phone (duplicate prevention), finance sync-run pipeline for Owner Sync now / last sync / counts / failures (scheduled-job ready), Owner dashboard `xeroFinance` connected to real Xero-mapped TITAN totals (revenue/outstanding/paid/overdue/quote pipeline/monthly turnover/payment trends — zero when empty). Does not rebuild Xero integration; does not overwrite Xero; does not touch Yoco `0123` or Finance AURA `0139`.
- Inventory Intelligence Foundation (`inventory-intelligence`, migration `0142`) — extends existing inventory/procurement/job-material modules: stock & warehouse visibility from real records, material usage + movement history, shortage/reorder alert drafts (Owner approval; never auto-PO/auto-reorder), AURA insight handoffs, Owner-gated settings. No fake stock; honest unavailable states. Suppliers/POs remain under procurement; operational CRUD stays under `/inventory`.
- Supplier & Procurement Intelligence (Department 5.2, migration `0143`) — extends existing procurement/suppliers/supplier-price modules (+ Inventory Intelligence when present): real supplier profiles, purchase history, pricing records, cost comparisons from real pricing, Owner-gated purchase recommendation drafts (optional draft PO only — never auto-purchase / never auto-order). No fake suppliers/POs/prices; honest empty states. Owner approval for recommend-accept / PO execute.
- Stock Forecasting & Automation (Department 5.3, migration `0144`) — extends Inventory Intelligence + Procurement Intelligence: material demand, shortage risk, reorder timing, usage trends, and seasonal demand from real issue/waste movements (unavailable when history insufficient; assumptions explained; never invents demand). AURA reorder recommendation drafts (what/when/expected usage/why) with Owner approval; optional draft PO on accept via Procurement (never auto-order). Connects inventory, jobs, recurring maintenance, procurement, suppliers.
- Recurring Maintenance Engine committed (`a11160e`) — marked **🟢 Completed**.
- Personal WhatsApp Connection Layer extends Communications Platform `personal_whatsapp` + owner gates; live Meta Graph / device-link pairing remains additive (honest testing matrix in Owner UI).
- Communication AURA Intelligence extends Email Centre / Communications Platform business inbox — prioritisation, honest sentiment (unavailable when no signal), smart-reply & follow-up drafts (approval only, never auto-send), scoring, customer insights, CRM/timeline link proposals. Does not source Personal WhatsApp.
- AURA Command Centre (Department 2.1, migration `0133`) — Owner command dashboard, business memory foundation, executive assistant mode, and agent coordination registry/handoffs. Extends existing AURA chat / `aura_memory` / agent tasks; specialist agents remain foundation-only; no demo analytics; Personal WA private never sourced. AURA Chat marked 🟡 (existing chat surfaces; Global AURA FAB / route-context WIP may remain uncommitted).
- Marketing Agent Foundation (`marketing-agent`, migration `0136`) — campaigns/goals/recommendations, plumbing & educational content draft generators, analytics from real stored activity only, Owner approval before publish path. Social platform publish execute is gated (Facebook/Instagram/TikTok/LinkedIn/GBP not live). Content intelligence foundation included; channel connectors remain remaining.
- Social Media Integration Layer (`social-media-integrations`, migration `0137`) — Facebook/Instagram/TikTok/LinkedIn/GBP connection settings, honest status/health/provider info, encrypted credentials, sync foundation, monitoring storage for real items only, Marketing Agent draft handoff, and Owner approval queue (draft → review → approved → execute gated). No auto-post/auto-reply; live OAuth/sync/publish remain additive.
- Content & Reputation Intelligence (`content-reputation-intelligence`, migration `0138`) — extends Marketing Agent + Social Media: content quality scoring on real drafts, plumbing suggestion categories (draft templates only), review tracking with honest sentiment/reputation (unavailable without signals), Owner-entered competitor observations (no scraping), AURA insight handoffs. Approval-gated outbound drafts; never auto-publish/auto-reply; no demo reviews/competitors/scores.
- Finance AURA Agent Foundation (`finance-aura-agent`, migration `0139`) — Owner-gated finance intelligence layer: agent identity registered on Command Centre / Agent Network `finance` key, recommendations (drafts), insights, alerts, Owner approval workflow, ask/summary over real TITAN invoices/payments/jobs/customers and post-import Xero markers. Extends existing finance/Xero/finance-intelligence; no fake balances; no auto-execute of financial mutations; Technician/Client denied. Cashflow & Profit Intelligence delivered in `0140` (`finance-cashflow-profit`); expense ledger depth remains partial (PO-only).
- Financial Reporting & Forecasting (Department 4.3, migration `0141`) — Owner-gated revenue/expense/profit/invoice/payment/job-profitability reports and transparent forecasts with assumptions + confidence (`unavailable`/`insufficient_history` when thin); executive insight handoffs to Command Centre / Dashboard / Finance AURA; approval-gated actions; no invented forecasts; no deploy.
- Cashflow & Profit Intelligence (`finance-cashflow-profit`, migration `0140`) — extends Finance AURA Agent with cashflow (income/incoming 30d/receivables/overdue/trends/risks), job profitability (material costs when real; labour minutes from timesheets; labour $ unavailable without hourly rate), AURA draft insights/actions with Owner approval + audit. Real TITAN data only; Xero via post-import markers. Expense cash position incomplete without POs/expense ledger.
- AURA Agent Network (Department 2.2, migration `0134`) — secure A2A messages/handoffs, controlled context sharing, sequential/parallel workflow runs, Owner approval queue + monitoring UI. Extends Command Centre `aura_command_agent_registry` + `AGENT_REGISTRY` / `agent_profiles`; no demo agent activity; messaging/financial/sensitive actions never auto-execute.
- AURA Evolution / Learning Agent (Department 2.3, migration `0135`) — Owner-gated learning from real Command Centre decisions, agent/workflow/maintenance outcomes, and recommendation scoring; honest pattern unavailable states; knowledge links extend Command Centre / `aura_memory`; no demo insights; no auto business/finance/customer mutations.
- Do not mark modules complete until owner-accepted and production-safe for that milestone.
- Keep department work isolated; see [`TITAN_DEVELOPMENT_RULES.md`](./TITAN_DEVELOPMENT_RULES.md).
