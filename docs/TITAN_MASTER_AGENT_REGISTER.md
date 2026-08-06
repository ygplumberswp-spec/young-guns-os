# TITAN Master Agent Register

**Document ID:** AGENT-001 (restored AGENT-001B — approved 307-agent scope)  
**Document type:** Permanent source of truth — documentation and reconciliation only  
**Generated (UTC):** 2026-08-06  
**Repository:** young-guns-os (Titan-Aura-Consolidation)  
**Branch:** `cursor/titan-agent-register-001`  
**Recovered from:** `363111f5df0f0ffa6e06e915320b4a88a0824aad`  
**Binding documents:**

- [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) (AGENT-002)
- [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) (AGENT-003)
- [TITAN_AGENT_ACTIVATION_ROADMAP.md](./TITAN_AGENT_ACTIVATION_ROADMAP.md) (AGENT-004)
- [TITAN_AGENT001_ROLE_RECONCILIATION.md](./TITAN_AGENT001_ROLE_RECONCILIATION.md)
- [TITAN_INTEGRATION_REGISTER.md](./TITAN_INTEGRATION_REGISTER.md) (INT-UNIVERSAL-001)
- [TITAN_MASTER_ACCEPTANCE_REGISTER.md](./TITAN_MASTER_ACCEPTANCE_REGISTER.md)

---

## Locked quality standard

> **TITAN must contain the world's best practical business agents for their defined responsibilities.**

A decorative card, nav entry, prompt, role-family heading, or automation does **not** count as an implemented agent.

Every operational agent must define all capability fields in [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md).

---

## Register principles (locked)

1. **AURA is the Owner-facing executive coordinator.** AURA routes context, assembles specialist work, and enforces approval gates.
2. **Specialist agents work underneath AURA.** Each row maps to a real business function with bounded tools and data access.
3. **There is no arbitrary numerical agent cap.** TITAN may grow beyond **307** approved agents. The register is **extensible** — new IDs append; approved IDs are never deleted without Owner approval.
4. **307 approved agents are the permanent minimum superset** (commit `363111f`). AGENT-001 role families (191 headings) map to these IDs — they do not replace them.
5. **Agents are tenant-isolated.** No cross-tenant reads, writes, learning, or inference.
6. **Agents cannot silently take high-risk actions.** Draft → Approve → Execute is mandatory for external effects.
7. **Two status dimensions are required** — implementation evidence and activation lifecycle answer different questions and must not replace one another.

---

## Organisational hierarchy

```
Owner
  └── AURA-001 (central interface & coordinator)
        └── Executive Board (EXEC-*)
              └── 18 permanent departments (307 specialist agents)
                    └── AUD-* (independent audit department)
```

### Approved 18 departments (permanent)

| Dept | Department | Agents |
|------|------------|-------:|
| AURA | Central Intelligence | 1 |
| EXEC | Executive & Professional | 20 |
| FIN | Finance & Accounting | 19 |
| QS | QS, Estimating & Commercial | 17 |
| OPS | Operations & Field Service | 17 |
| CRM | Sales, CRM & Customer Experience | 22 |
| COM | Communications & Reception | 16 |
| MKT | Marketing, Trends & Strategy | 31 |
| CRE | Creative Production | 14 |
| VID | Video & Audio Production | 20 |
| HR | HR, Training & Administration | 20 |
| LEG | Legal, Safety, Risk & Compliance | 16 |
| SW | Software, IT & Product | 26 |
| DAT | Data & Analytics | 10 |
| INV | Inventory, Procurement & Assets | 17 |
| FLT | Fleet, Maps & Driver Safety | 13 |
| SaaS | SaaS, Partnerships & Expansion | 14 |
| AUD | Permanent Audit Department | 14 |
| **Total** | | **307** |

### AGENT-001 workforce categories (display groupings — do not replace departments)

Broader categories A–M from AGENT-001 remain as **role-family headings** in [TITAN_AGENT001_ROLE_RECONCILIATION.md](./TITAN_AGENT001_ROLE_RECONCILIATION.md). They map to the 307 permanent IDs above.

---

## Dual status model (both required per agent)

### Implementation evidence status (technical truth)

| Status | Meaning |
|--------|---------|
| **Verified complete** | Tools, RBAC, tenant isolation, tests, and live or Owner-verified proof |
| **Implemented but not live-verified** | Executable backend/tools + automated tests; staging Owner proof pending |
| **Partial** | Registry entry, UI shell, or read-only tools — not a full operational agent |
| **Provider-blocked** | Design approved; external provider permission or review required |
| **Owner-action required** | Blocked on Owner credential, policy, or sign-off |
| **Missing** | Approved in scope; no meaningful implementation |
| **Deferred by Owner** | Explicitly deferred — remains in register |
| **Not applicable** | Out of scope for this tenant or product line |

### Activation lifecycle status (operational gate)

| Status | Meaning |
|--------|---------|
| **Defined** | Documented; no executable agent loop activated |
| **Planned** | Approved for build; dependencies identified |
| **Build-ready** | Prerequisites met; implementation queued |
| **Implemented but inactive** | Code/tools exist; not activated for operation |
| **Shadow mode** | Observes and drafts only |
| **Supervised** | Executes only with explicit per-action human approval |
| **Active** | Operates within approved policy (Owner activation required) |
| **Paused** | Temporarily disabled |
| **Retired** | Removed from activation; audit retained |

**Rules:** Do not use **Defined** or **Planned** to conceal **Missing** implementation. Do not mark **Active** because documentation exists alone.

---

## Summary (@ AGENT-001B restoration)

| Metric | Count |
|--------|------:|
| **Total unique agents (approved minimum)** | **307** |
| Verified complete | 0 |
| Implemented but not live-verified | 0 |
| Partial | 21 |
| Provider-blocked | 3 |
| Missing | 283 |
| **Active (lifecycle)** | **0** |
| Supervised (lifecycle) | 1 (AURA-001) |

> **Extensibility:** Additional agents append with new stable IDs. Total may exceed 307; it must **never fall below** the approved 307.

---

## Duplicate resolution: historical 77-agent list vs permanent register

| Decision | Detail |
|----------|--------|
| **Superset policy** | This register (307 agents) is the **permanent superset**. No approved agent is removed. |
| **77 → register mapping** | Each of the 77 maps to one or more register IDs. |
| **48 code registry keys** | `AGENT_REGISTRY` in `packages/shared/src/agents.ts` — **21** register rows as **Partial** only. |
| **AGENT-001 191 role families** | Mapped in reconciliation appendix — not additional unique agents. |
| **Facebook / social** | Integration truth in [TITAN_INTEGRATION_REGISTER.md](./TITAN_INTEGRATION_REGISTER.md). |

---

## Facebook integration result (Young Guns staging — J-6.7F14 deployed)

| Field | Value |
|-------|-------|
| Deployed task | J-6.7F14 to staging |
| Page | Young Guns Plumbing - Cape Town — connected and verified |
| Content permissions | Publishing, scheduling, comments, replies, Page details, insights |
| Webhook fields (provider-confirmed) | **feed**, **mention** |
| Meta dashboard sample delivery | Succeeded — no webhook error |
| Polling fallback | Active every 15 minutes |
| Genuine live Page event | Pending — Meta app unpublished |
| Messenger / Lead Ads | Separate future scopes — not in J-6.7F14 |
| Production | **Not production-complete** |

---

## QS estimating workflow (locked requirement)

```
Upload plan → identify scale → measure quantities → generate take-off → create BOQ
  → obtain supplier prices → calculate labour and overhead → apply margin and VAT
  → compare market position → produce quote options → quality review → Owner approval
```

**Never invent measurements from unreadable plans.**

---

## Finance and legal sign-off (locked)

AI may analyse, prepare, reconcile and advise. Formal statutory or regulated sign-off must be completed by a properly qualified human where required.

---

## Full agent register

See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) for the full capability field template (24 required fields per operational agent).

Each table row below includes **implementation evidence status** and **activation lifecycle status**.

### Central Intelligence (1 agents)

| Agent ID | Professional role | Implementation evidence | Activation lifecycle | Code registry key | Evidence pointer |
|----------|-------------------|-------------------------|----------------------|-------------------|------------------|
| AURA-001 | AURA Central Intelligence | **Partial** | **Supervised** | decision_intelligence | `packages/shared/src/agents.ts` → `decision_intelligence` |

### Executive & Professional (20 agents)

| Agent ID | Professional role | Implementation evidence | Activation lifecycle | Code registry key | Evidence pointer |
|----------|-------------------|-------------------------|----------------------|-------------------|------------------|
| EXEC-001 | Chief Executive Officer Agent | **Missing** | **Defined** | — | No executable agent implementation |
| EXEC-002 | Chief Operating Officer Agent | **Missing** | **Defined** | — | No executable agent implementation |
| EXEC-003 | Chief Financial Officer Agent | **Missing** | **Defined** | — | No executable agent implementation |
| EXEC-004 | Chief Technology Officer Agent | **Missing** | **Defined** | — | No executable agent implementation |
| EXEC-005 | Chief Product Officer Agent | **Missing** | **Defined** | — | No executable agent implementation |
| EXEC-006 | Chief Data Officer Agent | **Missing** | **Defined** | — | No executable agent implementation |
| EXEC-007 | Executive Command Agent | **Partial** | **Shadow mode** | executive | `packages/shared/src/agents.ts` → `executive` |
| EXEC-008 | Daily Owner Briefing Agent | **Missing** | **Defined** | — | No executable agent implementation |
| EXEC-009 | Business Coach Agent | **Missing** | **Defined** | — | No executable agent implementation |
| EXEC-010 | Business Strategist Agent | **Missing** | **Defined** | — | AURA-GROWTH-001 product capability — growth planning, cash-aware expansion, initiative tracking. See [TITAN_AURA_GROWTH_PLANNER_SPECIFICATION.md](./TITAN_AURA_GROWTH_PLANNER_SPECIFICATION.md). Alias: Growth Strategy Agent, Growth Planner AI. |
| EXEC-011 | Business Analyst Agent | **Missing** | **Defined** | — | No executable agent implementation |
| EXEC-012 | Business Development Specialist | **Missing** | **Defined** | — | No executable agent implementation |
| EXEC-013 | Market Research Agent | **Missing** | **Defined** | — | No executable agent implementation |
| EXEC-014 | Competitor Intelligence Agent | **Missing** | **Defined** | — | No executable agent implementation |
| EXEC-015 | Profit Improvement Agent | **Missing** | **Defined** | — | No executable agent implementation |
| EXEC-016 | Risk and Opportunity Agent | **Missing** | **Defined** | — | No executable agent implementation |
| EXEC-017 | Programme Manager Agent | **Missing** | **Defined** | — | No executable agent implementation |
| EXEC-018 | Senior Project Manager Agent | **Missing** | **Defined** | — | No executable agent implementation |
| EXEC-019 | Executive Assistant Agent | **Missing** | **Defined** | — | No executable agent implementation |
| EXEC-020 | Administrative Manager Agent | **Missing** | **Defined** | — | No executable agent implementation |

### Finance & Accounting (19 agents)

| Agent ID | Professional role | Implementation evidence | Activation lifecycle | Code registry key | Evidence pointer |
|----------|-------------------|-------------------------|----------------------|-------------------|------------------|
| FIN-001 | Chartered Accountant-Level Finance Agent | **Missing** | **Defined** | — | No executable agent implementation |
| FIN-002 | Management Accountant Agent | **Missing** | **Defined** | — | No executable agent implementation |
| FIN-003 | Bookkeeper Agent | **Missing** | **Defined** | — | No executable agent implementation |
| FIN-004 | Financial Controller Agent | **Partial** | **Shadow mode** | finance | `packages/shared/src/agents.ts` → `finance` |
| FIN-005 | Tax and Compliance Preparation Agent | **Missing** | **Defined** | — | No executable agent implementation |
| FIN-006 | Xero Reconciliation Agent | **Partial** | **Shadow mode** | finance | `packages/shared/src/agents.ts` → `finance` |
| FIN-007 | Cash-Flow Agent | **Missing** | **Defined** | — | No executable agent implementation |
| FIN-008 | Financial Forecasting Agent | **Missing** | **Defined** | — | No executable agent implementation |
| FIN-009 | Budgeting Agent | **Missing** | **Defined** | — | No executable agent implementation |
| FIN-010 | Invoice Follow-Up Agent | **Missing** | **Defined** | — | No executable agent implementation |
| FIN-011 | Debtors and Collections Agent | **Missing** | **Defined** | — | No executable agent implementation |
| FIN-012 | Credit Risk Agent | **Missing** | **Defined** | — | No executable agent implementation |
| FIN-013 | Job Costing and Margin Agent | **Missing** | **Defined** | — | No executable agent implementation |
| FIN-014 | Payroll Agent | **Missing** | **Defined** | — | No executable agent implementation |
| FIN-015 | Fraud and Financial Anomaly Agent | **Missing** | **Defined** | — | No executable agent implementation |
| FIN-016 | Project Profitability Controller | **Missing** | **Defined** | — | No executable agent implementation |
| FIN-017 | Pricing Director Agent | **Missing** | **Defined** | — | No executable agent implementation |
| FIN-018 | Pricebook Intelligence Agent | **Missing** | **Defined** | — | No executable agent implementation |
| FIN-019 | Contract Pricing Agent | **Missing** | **Defined** | — | No executable agent implementation |

### QS, Estimating & Commercial Intelligence (17 agents)

| Agent ID | Professional role | Implementation evidence | Activation lifecycle | Code registry key | Evidence pointer |
|----------|-------------------|-------------------------|----------------------|-------------------|------------------|
| QS-001 | Quantity Surveyor Agent | **Missing** | **Defined** | — | No executable agent implementation |
| QS-002 | Floor Plan Take-Off Agent | **Missing** | **Defined** | — | No executable agent implementation |
| QS-003 | Plumbing Estimator Agent | **Missing** | **Defined** | — | No executable agent implementation |
| QS-004 | General Trade Estimator Agent | **Missing** | **Defined** | — | No executable agent implementation |
| QS-005 | BOQ Generation Agent | **Missing** | **Defined** | — | No executable agent implementation |
| QS-006 | Tender and Commercial Quote Agent | **Missing** | **Defined** | — | No executable agent implementation |
| QS-007 | Tender Compliance Agent | **Missing** | **Defined** | — | No executable agent implementation |
| QS-008 | Cost Engineering Agent | **Missing** | **Defined** | — | No executable agent implementation |
| QS-009 | Variation and Claims Agent | **Missing** | **Defined** | — | No executable agent implementation |
| QS-010 | Site Survey Agent | **Missing** | **Defined** | — | No executable agent implementation |
| QS-011 | Project Cost Controller | **Missing** | **Defined** | — | No executable agent implementation |
| QS-012 | Quote Quality Controller | **Missing** | **Defined** | — | No executable agent implementation |
| QS-013 | Supplier Price-Hunting Agent | **Missing** | **Defined** | — | No executable agent implementation |
| QS-014 | Market Pricing Analyst | **Missing** | **Defined** | — | No executable agent implementation |
| QS-015 | Competitor Pricing Research Agent | **Missing** | **Defined** | — | No executable agent implementation |
| QS-016 | Procurement Cost Analyst | **Missing** | **Defined** | — | No executable agent implementation |
| QS-017 | Insurance Estimate Agent | **Missing** | **Defined** | — | No executable agent implementation |

### Operations & Field Service (17 agents)

| Agent ID | Professional role | Implementation evidence | Activation lifecycle | Code registry key | Evidence pointer |
|----------|-------------------|-------------------------|----------------------|-------------------|------------------|
| OPS-001 | Operations Manager Agent | **Partial** | **Shadow mode** | operations | `packages/shared/src/agents.ts` → `operations` |
| OPS-002 | Dispatch Coordinator Agent | **Partial** | **Shadow mode** | operations | `packages/shared/src/agents.ts` → `operations` |
| OPS-003 | Scheduling Agent | **Missing** | **Defined** | — | No executable agent implementation |
| OPS-004 | Emergency Triage Agent | **Missing** | **Defined** | — | No executable agent implementation |
| OPS-005 | Capacity Planning Agent | **Missing** | **Defined** | — | No executable agent implementation |
| OPS-006 | Job Progress Agent | **Missing** | **Defined** | — | No executable agent implementation |
| OPS-007 | Service Delivery Quality Agent | **Missing** | **Defined** | — | No executable agent implementation |
| OPS-008 | Recurring Maintenance Agent | **Missing** | **Defined** | — | No executable agent implementation |
| OPS-009 | Technician ETA Agent | **Missing** | **Defined** | — | No executable agent implementation |
| OPS-010 | Field Execution Agent | **Missing** | **Defined** | — | No executable agent implementation |
| OPS-011 | Variation Management Agent | **Missing** | **Defined** | — | No executable agent implementation |
| OPS-012 | Job Completion Agent | **Missing** | **Defined** | — | No executable agent implementation |
| OPS-013 | Preventive Maintenance Agent | **Missing** | **Defined** | — | No executable agent implementation |
| OPS-014 | Equipment Lifecycle Agent | **Missing** | **Defined** | — | No executable agent implementation |
| OPS-015 | Site Progress Verification Agent | **Missing** | **Defined** | — | No executable agent implementation |
| OPS-016 | Snag List and Handover Agent | **Missing** | **Defined** | — | No executable agent implementation |
| OPS-017 | Subcontractor Management Agent | **Missing** | **Defined** | — | No executable agent implementation |

### Sales, CRM & Customer Experience (22 agents)

| Agent ID | Professional role | Implementation evidence | Activation lifecycle | Code registry key | Evidence pointer |
|----------|-------------------|-------------------------|----------------------|-------------------|------------------|
| CRM-001 | Sales Director Agent | **Missing** | **Defined** | — | No executable agent implementation |
| CRM-002 | Sales Specialist Agent | **Missing** | **Defined** | — | No executable agent implementation |
| CRM-003 | Lead Qualification Agent | **Partial** | **Shadow mode** | lead_generation | `packages/shared/src/agents.ts` → `lead_generation` |
| CRM-004 | Sales Follow-Up Agent | **Missing** | **Defined** | — | No executable agent implementation |
| CRM-005 | Quote Follow-Up Agent | **Missing** | **Defined** | — | No executable agent implementation |
| CRM-006 | Objection Handling Agent | **Missing** | **Defined** | — | No executable agent implementation |
| CRM-007 | Commercial Negotiation Agent | **Missing** | **Defined** | — | No executable agent implementation |
| CRM-008 | Customer Support Manager | **Partial** | **Shadow mode** | customer_support | `packages/shared/src/agents.ts` → `customer_support` |
| CRM-009 | Customer Service Agent | **Partial** | **Shadow mode** | sales | `packages/shared/src/agents.ts` → `sales` |
| CRM-010 | Customer Success Agent | **Partial** | **Shadow mode** | customer_experience | `packages/shared/src/agents.ts` → `customer_experience` |
| CRM-011 | Customer Experience Director | **Missing** | **Defined** | — | No executable agent implementation |
| CRM-012 | Customer Journey Designer | **Missing** | **Defined** | — | No executable agent implementation |
| CRM-013 | Complaint Resolution Agent | **Missing** | **Defined** | — | No executable agent implementation |
| CRM-014 | Service Recovery Agent | **Missing** | **Defined** | — | No executable agent implementation |
| CRM-015 | Customer Escalation Agent | **Missing** | **Defined** | — | No executable agent implementation |
| CRM-016 | Customer Retention Agent | **Missing** | **Defined** | — | No executable agent implementation |
| CRM-017 | Customer Churn Prediction Agent | **Missing** | **Defined** | — | No executable agent implementation |
| CRM-018 | Review and Referral Agent | **Missing** | **Defined** | — | No executable agent implementation |
| CRM-019 | Loyalty Programme Agent | **Missing** | **Defined** | — | No executable agent implementation |
| CRM-020 | Membership/HomeShield Agent | **Missing** | **Defined** | — | No executable agent implementation |
| CRM-021 | VIP Customer Agent | **Missing** | **Defined** | — | No executable agent implementation |
| CRM-022 | Reputation Crisis Manager | **Missing** | **Defined** | — | No executable agent implementation |

### Communications & Reception (16 agents)

| Agent ID | Professional role | Implementation evidence | Activation lifecycle | Code registry key | Evidence pointer |
|----------|-------------------|-------------------------|----------------------|-------------------|------------------|
| COM-001 | AI Phone Receptionist | **Partial** | **Shadow mode** | voice_receptionist | `packages/shared/src/agents.ts` → `voice_receptionist` |
| COM-002 | Receptionist Training Agent | **Missing** | **Defined** | — | No executable agent implementation |
| COM-003 | Call Quality Reviewer | **Missing** | **Defined** | — | No executable agent implementation |
| COM-004 | WhatsApp Business Agent | **Partial** | **Shadow mode** | communications | `packages/shared/src/agents.ts` → `communications` |
| COM-005 | SMS Agent | **Missing** | **Defined** | — | No executable agent implementation |
| COM-006 | Email Inbox Agent | **Missing** | **Defined** | — | No executable agent implementation |
| COM-007 | Facebook Messenger Agent | **Provider-blocked** | **Planned** | — | No executable agent implementation |
| COM-008 | Unified Communications Agent | **Missing** | **Defined** | — | No executable agent implementation |
| COM-009 | Conversation Compliance Agent | **Missing** | **Defined** | — | No executable agent implementation |
| COM-010 | Translation and Language Agent | **Missing** | **Defined** | — | No executable agent implementation |
| COM-011 | Afrikaans Communications Agent | **Missing** | **Defined** | — | No executable agent implementation |
| COM-012 | English Communications Agent | **Missing** | **Defined** | — | No executable agent implementation |
| COM-013 | Tone and Brand Voice Agent | **Missing** | **Defined** | — | No executable agent implementation |
| COM-014 | Message Delivery Monitoring Agent | **Missing** | **Defined** | — | No executable agent implementation |
| COM-015 | Spam and Abuse Protection Agent | **Missing** | **Defined** | — | No executable agent implementation |
| COM-016 | Escalation Routing Agent | **Missing** | **Defined** | — | No executable agent implementation |

### Marketing, Trends & Strategy (31 agents)

| Agent ID | Professional role | Implementation evidence | Activation lifecycle | Code registry key | Evidence pointer |
|----------|-------------------|-------------------------|----------------------|-------------------|------------------|
| MKT-001 | Marketing Director Agent | **Partial** | **Shadow mode** | marketing | `packages/shared/src/agents.ts` → `marketing` |
| MKT-002 | Marketing Specialist Agent | **Missing** | **Defined** | — | No executable agent implementation |
| MKT-003 | Marketing Analytics Agent | **Missing** | **Defined** | — | No executable agent implementation |
| MKT-004 | Advertising and Campaign Agent | **Missing** | **Defined** | — | No executable agent implementation |
| MKT-005 | Local SEO Agent | **Missing** | **Defined** | — | No executable agent implementation |
| MKT-006 | Google Business Profile Agent | **Missing** | **Defined** | — | No executable agent implementation |
| MKT-007 | Social Media Agent | **Provider-blocked** | **Planned** | — | No executable agent implementation |
| MKT-008 | Community Management Agent | **Missing** | **Defined** | — | No executable agent implementation |
| MKT-009 | Content Director Agent | **Missing** | **Defined** | — | No executable agent implementation |
| MKT-010 | Content Strategy Agent | **Missing** | **Defined** | — | No executable agent implementation |
| MKT-011 | Content Calendar Agent | **Missing** | **Defined** | — | No executable agent implementation |
| MKT-012 | Copywriting Agent | **Missing** | **Defined** | — | No executable agent implementation |
| MKT-013 | Advertising Copy Agent | **Missing** | **Defined** | — | No executable agent implementation |
| MKT-014 | SEO Content Writer | **Missing** | **Defined** | — | No executable agent implementation |
| MKT-015 | Blog and Website Writer | **Missing** | **Defined** | — | No executable agent implementation |
| MKT-016 | Email Campaign Writer | **Missing** | **Defined** | — | No executable agent implementation |
| MKT-017 | Case Study Writer | **Missing** | **Defined** | — | No executable agent implementation |
| MKT-018 | Customer Education Agent | **Missing** | **Defined** | — | No executable agent implementation |
| MKT-019 | Campaign Planning Agent | **Missing** | **Defined** | — | No executable agent implementation |
| MKT-020 | Content Approval Coordinator | **Missing** | **Defined** | — | No executable agent implementation |
| MKT-021 | Publishing and Scheduling Agent | **Provider-blocked** | **Planned** | — | No executable agent implementation |
| MKT-022 | Global Trend Research Agent | **Missing** | **Defined** | — | No executable agent implementation |
| MKT-023 | Cape Town Trend Research Agent | **Missing** | **Defined** | — | No executable agent implementation |
| MKT-024 | Industry Trend Analyst | **Missing** | **Defined** | — | No executable agent implementation |
| MKT-025 | Social Media Trend Hunter | **Missing** | **Defined** | — | No executable agent implementation |
| MKT-026 | Viral Content Research Agent | **Missing** | **Defined** | — | No executable agent implementation |
| MKT-027 | Customer Behaviour Research Agent | **Missing** | **Defined** | — | No executable agent implementation |
| MKT-028 | Competitor Content Analyst | **Missing** | **Defined** | — | No executable agent implementation |
| MKT-029 | Platform Algorithm Research Agent | **Missing** | **Defined** | — | No executable agent implementation |
| MKT-030 | Seasonal Campaign Research Agent | **Missing** | **Defined** | — | No executable agent implementation |
| MKT-031 | Emerging Technology Research Agent | **Missing** | **Defined** | — | No executable agent implementation |

### Creative Production (14 agents)

| Agent ID | Professional role | Implementation evidence | Activation lifecycle | Code registry key | Evidence pointer |
|----------|-------------------|-------------------------|----------------------|-------------------|------------------|
| CRE-001 | Creative Director Agent | **Missing** | **Defined** | — | No executable agent implementation |
| CRE-002 | Senior Graphic Designer Agent | **Missing** | **Defined** | — | No executable agent implementation |
| CRE-003 | Brand Identity Designer Agent | **Missing** | **Defined** | — | No executable agent implementation |
| CRE-004 | Social Media Designer Agent | **Missing** | **Defined** | — | No executable agent implementation |
| CRE-005 | Advertising Designer Agent | **Missing** | **Defined** | — | No executable agent implementation |
| CRE-006 | Document and Proposal Designer Agent | **Missing** | **Defined** | — | No executable agent implementation |
| CRE-007 | Web and UI Designer Agent | **Missing** | **Defined** | — | No executable agent implementation |
| CRE-008 | Presentation Designer Agent | **Missing** | **Defined** | — | No executable agent implementation |
| CRE-009 | Infographic Designer Agent | **Missing** | **Defined** | — | No executable agent implementation |
| CRE-010 | Image Retouching and Quality Agent | **Missing** | **Defined** | — | No executable agent implementation |
| CRE-011 | Brand Consistency Reviewer Agent | **Missing** | **Defined** | — | No executable agent implementation |
| CRE-012 | Photography Director Agent | **Missing** | **Defined** | — | No executable agent implementation |
| CRE-013 | Shot List Planner Agent | **Missing** | **Defined** | — | No executable agent implementation |
| CRE-014 | On-Site Content Coordinator Agent | **Missing** | **Defined** | — | No executable agent implementation |

### Video & Audio Production (20 agents)

| Agent ID | Professional role | Implementation evidence | Activation lifecycle | Code registry key | Evidence pointer |
|----------|-------------------|-------------------------|----------------------|-------------------|------------------|
| VID-001 | Video Creative Director Agent | **Missing** | **Defined** | — | No executable agent implementation |
| VID-002 | Video Content Strategist Agent | **Missing** | **Defined** | — | No executable agent implementation |
| VID-003 | Scriptwriting Agent | **Missing** | **Defined** | — | No executable agent implementation |
| VID-004 | Hook and Storytelling Agent | **Missing** | **Defined** | — | No executable agent implementation |
| VID-005 | Short-Form Video Creator Agent | **Missing** | **Defined** | — | No executable agent implementation |
| VID-006 | Long-Form Video Creator Agent | **Missing** | **Defined** | — | No executable agent implementation |
| VID-007 | Professional Video Editor Agent | **Missing** | **Defined** | — | No executable agent implementation |
| VID-008 | Motion Graphics Agent | **Missing** | **Defined** | — | No executable agent implementation |
| VID-009 | Animation Agent | **Missing** | **Defined** | — | No executable agent implementation |
| VID-010 | Voice-Over Planning Agent | **Missing** | **Defined** | — | No executable agent implementation |
| VID-011 | Caption and Subtitle Agent | **Missing** | **Defined** | — | No executable agent implementation |
| VID-012 | Thumbnail Designer Agent | **Missing** | **Defined** | — | No executable agent implementation |
| VID-013 | Podcast and Audio Editor Agent | **Missing** | **Defined** | — | No executable agent implementation |
| VID-014 | Audio Engineer Agent | **Missing** | **Defined** | — | No executable agent implementation |
| VID-015 | Colour-Grading Agent | **Missing** | **Defined** | — | No executable agent implementation |
| VID-016 | Visual Effects Agent | **Missing** | **Defined** | — | No executable agent implementation |
| VID-017 | Video Quality Controller Agent | **Missing** | **Defined** | — | No executable agent implementation |
| VID-018 | Content Repurposing Agent | **Missing** | **Defined** | — | No executable agent implementation |
| VID-019 | Content Rights and Licensing Agent | **Missing** | **Defined** | — | No executable agent implementation |
| VID-020 | Creative Performance Analyst Agent | **Missing** | **Defined** | — | No executable agent implementation |

### HR, Training & Administration (20 agents)

| Agent ID | Professional role | Implementation evidence | Activation lifecycle | Code registry key | Evidence pointer |
|----------|-------------------|-------------------------|----------------------|-------------------|------------------|
| HR-001 | HR Manager Agent | **Partial** | **Shadow mode** | workforce_intelligence | `packages/shared/src/agents.ts` → `workforce_intelligence` |
| HR-002 | Recruitment Specialist Agent | **Partial** | **Shadow mode** | recruiting | `packages/shared/src/agents.ts` → `recruiting` |
| HR-003 | Employee Relations Agent | **Missing** | **Defined** | — | No executable agent implementation |
| HR-004 | Performance Management Agent | **Missing** | **Defined** | — | No executable agent implementation |
| HR-005 | Attendance Agent | **Missing** | **Defined** | — | No executable agent implementation |
| HR-006 | Payroll and Overtime Agent | **Missing** | **Defined** | — | No executable agent implementation |
| HR-007 | Technician Performance Agent | **Missing** | **Defined** | — | No executable agent implementation |
| HR-008 | Training and Development Agent | **Missing** | **Defined** | — | No executable agent implementation |
| HR-009 | Leadership Development Agent | **Missing** | **Defined** | — | No executable agent implementation |
| HR-010 | Employee Onboarding Agent | **Missing** | **Defined** | — | No executable agent implementation |
| HR-011 | Skills Assessment Agent | **Missing** | **Defined** | — | No executable agent implementation |
| HR-012 | Technical Training Agent | **Missing** | **Defined** | — | No executable agent implementation |
| HR-013 | Health and Safety Training Agent | **Missing** | **Defined** | — | No executable agent implementation |
| HR-014 | Customer Service Coach Agent | **Missing** | **Defined** | — | No executable agent implementation |
| HR-015 | Sales Coach Agent | **Missing** | **Defined** | — | No executable agent implementation |
| HR-016 | Knowledge Manager Agent | **Missing** | **Defined** | — | No executable agent implementation |
| HR-017 | SOP Agent | **Missing** | **Defined** | — | No executable agent implementation |
| HR-018 | Knowledge Quality Reviewer Agent | **Missing** | **Defined** | — | No executable agent implementation |
| HR-019 | Document and Filing Agent | **Missing** | **Defined** | — | No executable agent implementation |
| HR-020 | Compliance Administration Agent | **Missing** | **Defined** | — | No executable agent implementation |

### Legal, Safety, Risk & Compliance (16 agents)

| Agent ID | Professional role | Implementation evidence | Activation lifecycle | Code registry key | Evidence pointer |
|----------|-------------------|-------------------------|----------------------|-------------------|------------------|
| LEG-001 | Legal Counsel Agent | **Partial** | **Shadow mode** | legal_compliance | `packages/shared/src/agents.ts` → `legal_compliance` |
| LEG-002 | Contract Review Agent | **Missing** | **Defined** | — | No executable agent implementation |
| LEG-003 | Employment Compliance Agent | **Missing** | **Defined** | — | No executable agent implementation |
| LEG-004 | Consumer Protection Agent | **Missing** | **Defined** | — | No executable agent implementation |
| LEG-005 | POPIA and Privacy Officer Agent | **Missing** | **Defined** | — | No executable agent implementation |
| LEG-006 | Commercial Risk Agent | **Missing** | **Defined** | — | No executable agent implementation |
| LEG-007 | Plumbing and Trade Compliance Agent | **Missing** | **Defined** | — | No executable agent implementation |
| LEG-008 | Health and Safety Officer Agent | **Missing** | **Defined** | — | No executable agent implementation |
| LEG-009 | Incident Investigation Agent | **Missing** | **Defined** | — | No executable agent implementation |
| LEG-010 | Insurance Claims Agent | **Missing** | **Defined** | — | No executable agent implementation |
| LEG-011 | Occupational Health Compliance Agent | **Missing** | **Defined** | — | No executable agent implementation |
| LEG-012 | Municipal Permit and Approval Agent | **Missing** | **Defined** | — | No executable agent implementation |
| LEG-013 | Trade Certification Agent | **Missing** | **Defined** | — | No executable agent implementation |
| LEG-014 | Environmental Compliance Agent | **Missing** | **Defined** | — | No executable agent implementation |
| LEG-015 | Emergency and Disaster Response Agent | **Missing** | **Defined** | — | No executable agent implementation |
| LEG-016 | Audit and Governance Agent | **Missing** | **Defined** | — | No executable agent implementation |

### Software, IT & Product (26 agents)

| Agent ID | Professional role | Implementation evidence | Activation lifecycle | Code registry key | Evidence pointer |
|----------|-------------------|-------------------------|----------------------|-------------------|------------------|
| SW-001 | AURA Developer Coordinator | **Missing** | **Defined** | — | No executable agent implementation |
| SW-002 | Software Engineering Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SW-003 | Frontend Engineering Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SW-004 | Backend Engineering Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SW-005 | Mobile App Engineer Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SW-006 | Database Engineering Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SW-007 | IT Systems Engineer Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SW-008 | Cloud and Infrastructure Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SW-009 | Integration Engineer Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SW-010 | DevOps Engineer Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SW-011 | Site Reliability Engineer Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SW-012 | Cybersecurity Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SW-013 | AI Systems Engineer Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SW-014 | Prompt and Agent Engineer Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SW-015 | Architecture Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SW-016 | Product Manager Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SW-017 | Product Owner Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SW-018 | UX Research Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SW-019 | Accessibility Testing Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SW-020 | Automated Testing Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SW-021 | Integration Testing Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SW-022 | Release Manager Agent | **Partial** | **Shadow mode** | release_manager | `packages/shared/src/agents.ts` → `release_manager` |
| SW-023 | Technical Documentation Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SW-024 | System Health and Self-Healing Agent | **Partial** | **Shadow mode** | platform_health | `packages/shared/src/agents.ts` → `platform_health` |
| SW-025 | Disaster Recovery Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SW-026 | Technical Support Agent | **Missing** | **Defined** | — | No executable agent implementation |

### Data & Analytics (10 agents)

| Agent ID | Professional role | Implementation evidence | Activation lifecycle | Code registry key | Evidence pointer |
|----------|-------------------|-------------------------|----------------------|-------------------|------------------|
| DAT-001 | Data Analyst Agent | **Missing** | **Defined** | — | No executable agent implementation |
| DAT-002 | Analytics Engineer Agent | **Missing** | **Defined** | — | No executable agent implementation |
| DAT-003 | Data Quality Agent | **Missing** | **Defined** | — | No executable agent implementation |
| DAT-004 | Data Governance Agent | **Missing** | **Defined** | — | No executable agent implementation |
| DAT-005 | Master Data Management Agent | **Missing** | **Defined** | — | No executable agent implementation |
| DAT-006 | CRM Data-Cleaning Agent | **Missing** | **Defined** | — | No executable agent implementation |
| DAT-007 | Forecasting and Predictive Analytics Agent | **Missing** | **Defined** | — | No executable agent implementation |
| DAT-008 | KPI Design Agent | **Missing** | **Defined** | — | No executable agent implementation |
| DAT-009 | Report Automation Agent | **Missing** | **Defined** | — | No executable agent implementation |
| DAT-010 | Business Intelligence Agent | **Partial** | **Shadow mode** | business_intelligence | `packages/shared/src/agents.ts` → `business_intelligence` |

### Inventory, Procurement & Assets (17 agents)

| Agent ID | Professional role | Implementation evidence | Activation lifecycle | Code registry key | Evidence pointer |
|----------|-------------------|-------------------------|----------------------|-------------------|------------------|
| INV-001 | Inventory Control Agent | **Missing** | **Defined** | — | No executable agent implementation |
| INV-002 | Warehouse Agent | **Missing** | **Defined** | — | No executable agent implementation |
| INV-003 | Tool Tracking Agent | **Missing** | **Defined** | — | No executable agent implementation |
| INV-004 | Procurement Agent | **Partial** | **Shadow mode** | procurement | `packages/shared/src/agents.ts` → `procurement` |
| INV-005 | Supplier Price Comparison Agent | **Missing** | **Defined** | — | No executable agent implementation |
| INV-006 | Vendor Relationship Manager Agent | **Missing** | **Defined** | — | No executable agent implementation |
| INV-007 | Supplier Contract Agent | **Missing** | **Defined** | — | No executable agent implementation |
| INV-008 | Purchase Approval Agent | **Missing** | **Defined** | — | No executable agent implementation |
| INV-009 | Demand Forecasting Agent | **Missing** | **Defined** | — | No executable agent implementation |
| INV-010 | Stock Replenishment Agent | **Missing** | **Defined** | — | No executable agent implementation |
| INV-011 | Dead-Stock Detection Agent | **Missing** | **Defined** | — | No executable agent implementation |
| INV-012 | Tool Maintenance Agent | **Missing** | **Defined** | — | No executable agent implementation |
| INV-013 | Tool Loss Investigation Agent | **Missing** | **Defined** | — | No executable agent implementation |
| INV-014 | Asset Lifecycle Agent | **Missing** | **Defined** | — | No executable agent implementation |
| INV-015 | Facilities Manager Agent | **Missing** | **Defined** | — | No executable agent implementation |
| INV-016 | Warehouse Layout Agent | **Missing** | **Defined** | — | No executable agent implementation |
| INV-017 | Delivery and Logistics Agent | **Missing** | **Defined** | — | No executable agent implementation |

### Fleet, Maps & Driver Safety (13 agents)

| Agent ID | Professional role | Implementation evidence | Activation lifecycle | Code registry key | Evidence pointer |
|----------|-------------------|-------------------------|----------------------|-------------------|------------------|
| FLT-001 | Fleet Manager Agent | **Partial** | **Shadow mode** | asset_intelligence | `packages/shared/src/agents.ts` → `asset_intelligence` |
| FLT-002 | Google Maps and Routing Agent | **Missing** | **Defined** | — | No executable agent implementation |
| FLT-003 | Cartrack Telemetry Agent | **Missing** | **Defined** | — | No executable agent implementation |
| FLT-004 | Vehicle Maintenance Agent | **Missing** | **Defined** | — | No executable agent implementation |
| FLT-005 | Driver Behaviour Agent | **Missing** | **Defined** | — | No executable agent implementation |
| FLT-006 | Fuel Consumption Agent | **Missing** | **Defined** | — | No executable agent implementation |
| FLT-007 | Vehicle Utilisation Agent | **Missing** | **Defined** | — | No executable agent implementation |
| FLT-008 | Accident and Incident Agent | **Missing** | **Defined** | — | No executable agent implementation |
| FLT-009 | Licence and Registration Agent | **Missing** | **Defined** | — | No executable agent implementation |
| FLT-010 | Fleet Insurance Agent | **Missing** | **Defined** | — | No executable agent implementation |
| FLT-011 | Route Efficiency Agent | **Missing** | **Defined** | — | No executable agent implementation |
| FLT-012 | Vehicle Replacement Planning Agent | **Missing** | **Defined** | — | No executable agent implementation |
| FLT-013 | Driver Coaching Agent | **Missing** | **Defined** | — | No executable agent implementation |

### SaaS, Partnerships & Expansion (14 agents)

| Agent ID | Professional role | Implementation evidence | Activation lifecycle | Code registry key | Evidence pointer |
|----------|-------------------|-------------------------|----------------------|-------------------|------------------|
| SaaS-001 | Tenant Onboarding Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SaaS-002 | Subscription and Billing Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SaaS-003 | SaaS Customer Success Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SaaS-004 | Platform Usage and Health Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SaaS-005 | Partnerships Director Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SaaS-006 | Franchise Development Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SaaS-007 | Corporate Accounts Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SaaS-008 | Property Manager Relationship Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SaaS-009 | Construction Partnership Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SaaS-010 | Supplier Partnership Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SaaS-011 | Geographic Expansion Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SaaS-012 | New Industry Research Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SaaS-013 | Acquisition and Merger Research Agent | **Missing** | **Defined** | — | No executable agent implementation |
| SaaS-014 | Investor Relations Agent | **Missing** | **Defined** | — | No executable agent implementation |

### Permanent Audit Department (14 agents)

| Agent ID | Professional role | Implementation evidence | Activation lifecycle | Code registry key | Evidence pointer |
|----------|-------------------|-------------------------|----------------------|-------------------|------------------|
| AUD-001 | Chief Audit Agent | **Missing** | **Defined** | — | No executable agent implementation |
| AUD-002 | Application Auditor | **Missing** | **Defined** | — | No executable agent implementation |
| AUD-003 | Browser and User-Journey Auditor | **Missing** | **Defined** | — | No executable agent implementation |
| AUD-004 | Role and Permission Auditor | **Missing** | **Defined** | — | No executable agent implementation |
| AUD-005 | Tenant-Isolation Auditor | **Missing** | **Defined** | — | No executable agent implementation |
| AUD-006 | Financial Data Auditor | **Missing** | **Defined** | — | No executable agent implementation |
| AUD-007 | Integration Auditor | **Missing** | **Defined** | — | No executable agent implementation |
| AUD-008 | Mobile and Responsive Auditor | **Missing** | **Defined** | — | No executable agent implementation |
| AUD-009 | Accessibility Auditor | **Missing** | **Defined** | — | No executable agent implementation |
| AUD-010 | Security and Privacy Auditor | **Missing** | **Defined** | — | No executable agent implementation |
| AUD-011 | Data Quality Auditor | **Missing** | **Defined** | — | No executable agent implementation |
| AUD-012 | Document and Compliance Auditor | **Missing** | **Defined** | — | No executable agent implementation |
| AUD-013 | Performance and Reliability Auditor | **Missing** | **Defined** | — | No executable agent implementation |
| AUD-014 | Acceptance Register Reconciliation Agent | **Missing** | **Defined** | — | No executable agent implementation |

---

## AGENT-001 role-family reconciliation

The 191 AGENT-001 role-family headings map to this 307-agent permanent register. See [TITAN_AGENT001_ROLE_RECONCILIATION.md](./TITAN_AGENT001_ROLE_RECONCILIATION.md) for the full mapping appendix.

---

**Maintenance:** Regenerate via `node scripts/generate-master-agent-register.mjs` → `node scripts/render-agent-register-tables.mjs` → `node scripts/assemble-master-agent-register.mjs` → `node scripts/reconcile-agent001-roles.mjs`.

**Document control:** AGENT-001B · Approved minimum **307** unique agents · Extensible beyond 307 · Recovered from `363111f`.
