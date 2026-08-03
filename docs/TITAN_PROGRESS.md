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
| Performance | ⬜ Remaining |
| Recruitment | ⬜ Remaining |

---

## Customer Experience

| Module | Status |
|--------|--------|
| Customer portal | ⬜ Remaining |
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
| Sales Intelligence Agent | ⬜ Remaining |
| Customer 360 | ⬜ Remaining |
| Property Intelligence | ⬜ Remaining |
| Document Intelligence | ⬜ Remaining |
| Compliance Intelligence | ⬜ Remaining |
| Executive Command Centre | ⬜ Remaining |
| Smart Notifications | ⬜ Remaining |
| Market Intelligence | ⬜ Remaining |
| Security Monitoring | ⬜ Remaining |
| Industry Templates | ⬜ Remaining |
| SaaS Scaling | ⬜ Remaining |

---

## Notes

- Voice AI Receptionist Foundation (Department 9.1, `voice-ai-receptionist`, migration `0153`) — extends `/voice` + enterprise voice reception: inbound call session records, caller identification, CRM customer lookup, approval-gated lead create (execute on Owner approve), booking drafts (never auto-schedule), routing rules, SA locale/voice config with honest `not_configured` TTS/STT/telephony until credentials connect, always-on human takeover + audit. Owner UI `/voice-ai-receptionist`. No fake calls/customers/leads. No deploy. Never touches Yoco `0123`.

- HomeShield Customer Experience (Department 7.3, `homeshield-experience`, migration `0148`) — membership plans, subscriptions, benefits, service reminders, maintenance history from Recurring Maintenance, renewal/outreach drafts, honest customer lifetime value (unavailable without stored CLV — never invented), AURA retention/customer-value/maintenance/renewal recommendation drafts (Owner approval; never auto-bill). Portal `/my/homeshield` own data only. No fake memberships.

- Vehicle Intelligence Foundation (Department 8.1, `vehicle-intelligence`, migration `0150`) — extends existing Fleet / Cartrack / job-vehicle modules: real vehicle profiles, fuel tracking foundation from fleet operating costs, maintenance cues from vehicle status + vehicle-linked asset schedules, vehicle costs, usage history from job assignments, AURA insight drafts (maintenance/cost/risk; Owner approval; never auto-mutate fleet). No fake GPS/fuel; honest unavailable when Cartrack disconnected or no records. Operational CRUD stays under `/fleet`; GPS analytics under `/fleet-intelligence`.
- Employee Intelligence Foundation (`hr-employee-intelligence`, migration `0151`) — Owner/Admin-gated profiles, workforce overview/capacity, skills intelligence (gaps/training needs), and AURA recommendation drafts only (skills shortage, training opportunity, capacity — never auto HR). Connects Technician Intelligence, Jobs, Scheduling; timesheets/payroll/recruitment future-ready with honest unavailable. No fake employees/payroll. Extends users/roles/workforce/wi_profiles/technician-intelligence.
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
