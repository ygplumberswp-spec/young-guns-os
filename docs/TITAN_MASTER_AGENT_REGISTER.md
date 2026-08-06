# TITAN Master Agent Register

**Document type:** Permanent source of truth — documentation and reconciliation only  
**Generated (UTC):** 2026-08-06  
**Repository:** young-guns-os (Titan-Aura-Consolidation)  
**Branch:** cursor/titan-master-agent-register-998f  
**Binding documents:** This register supersedes informal agent counts (77/100/150). There is **no fixed agent limit**.

---

## Locked quality standard

> **TITAN must contain the world's best practical business agents for their defined responsibilities.**

A decorative card, nav entry, or prompt with no executable tools does **not** count as an implemented agent.

Every operational agent must define all fields in [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md).

---

## Organisational hierarchy

```
Owner
  └── AURA (central intelligence & user interface)
        └── Executive Board (EXEC-* C-suite and command agents)
              └── Department Leaders (directors / managers per department)
                    └── Specialist Agents (domain experts with tools)
```

AURA orchestrates routing, context assembly, approval gates, and audit — it is not a substitute for specialist agents.

---

## Implementation status vocabulary (exactly one per agent)

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

**Reconciliation rule:** Do not mark **Verified complete** because a name, schema, or UI card exists.

---

## Summary (@ register creation)

| Metric | Count |
|--------|------:|
| **Total unique agents in permanent register** | **307** |
| Partial (registry/UI foundation only) | 21 |
| Provider-blocked | 3 |
| Missing | 283 |
| Verified complete | 0 |
| Implemented but not live-verified | 0 |

### Department totals

| Dept code | Department | Agents |
|-----------|------------|-------:|
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

---

## Duplicate resolution: historical 77-agent list vs permanent register

The Owner's historical **77-agent V1 list** (`docs/TITAN_AI_AGENT_ARCHITECTURE.md`, `TITAN_AURA_V1_FINAL_ACCEPTANCE_CHECKLIST.md`) remains **recorded heritage**, not the ceiling.

| Decision | Detail |
|----------|--------|
| **Superset policy** | This register (307 agents) is the **permanent superset**. No agent from Owner discussions is removed. |
| **77 → register mapping** | Each of the 77 maps to one or more register IDs (e.g. Finance Manager AI → FIN-004; AURA Orchestrator → AURA-001). |
| **48 code registry keys** | `AGENT_REGISTRY` in `packages/shared/src/agents.ts` defines **48** foundation keys — mapped to **21** register rows as **Partial** only. |
| **No merge without Owner approval** | Specialist splits (e.g. QS take-off vs BOQ) stay separate rows. |
| **Facebook / social** | Connection infrastructure is recorded in [TITAN_INTEGRATION_REGISTER.md](./TITAN_INTEGRATION_REGISTER.md), not as agent completion. |

---

## Facebook integration result (Young Guns staging — recorded 2026-08-06)

| Field | Value |
|-------|-------|
| Basic Page connection | **Complete on staging** |
| Page | Young Guns Plumbing – Cape Town |
| State | `CONNECTED_LIMITED` |
| `pages_show_list` | Granted |
| `business_management` | Granted |
| `public_profile` | Granted |
| `pages_read_engagement` | Provider-blocked — Meta App Review pending |
| Publishing, comments, messaging, leads, insights | Provider-blocked |
| Sync | Inactive until required permissions granted |
| Development blocker? | **No** — advanced Facebook capabilities are not a current development blocker |

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

See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) for the full capability field template.

### Central Intelligence (1 agents)

| Agent ID | Professional role | Implementation status | Code registry key | Evidence pointer |
|----------|-------------------|----------------------|-------------------|------------------|
| AURA-001 | AURA Central Intelligence | **Partial** | decision_intelligence | `packages/shared/src/agents.ts` → `decision_intelligence` |

### Executive & Professional (20 agents)

| Agent ID | Professional role | Implementation status | Code registry key | Evidence pointer |
|----------|-------------------|----------------------|-------------------|------------------|
| EXEC-001 | Chief Executive Officer Agent | **Missing** | — | No executable agent implementation |
| EXEC-002 | Chief Operating Officer Agent | **Missing** | — | No executable agent implementation |
| EXEC-003 | Chief Financial Officer Agent | **Missing** | — | No executable agent implementation |
| EXEC-004 | Chief Technology Officer Agent | **Missing** | — | No executable agent implementation |
| EXEC-005 | Chief Product Officer Agent | **Missing** | — | No executable agent implementation |
| EXEC-006 | Chief Data Officer Agent | **Missing** | — | No executable agent implementation |
| EXEC-007 | Executive Command Agent | **Partial** | executive | `packages/shared/src/agents.ts` → `executive` |
| EXEC-008 | Daily Owner Briefing Agent | **Missing** | — | No executable agent implementation |
| EXEC-009 | Business Coach Agent | **Missing** | — | No executable agent implementation |
| EXEC-010 | Business Strategist Agent | **Missing** | — | No executable agent implementation |
| EXEC-011 | Business Analyst Agent | **Missing** | — | No executable agent implementation |
| EXEC-012 | Business Development Specialist | **Missing** | — | No executable agent implementation |
| EXEC-013 | Market Research Agent | **Missing** | — | No executable agent implementation |
| EXEC-014 | Competitor Intelligence Agent | **Missing** | — | No executable agent implementation |
| EXEC-015 | Profit Improvement Agent | **Missing** | — | No executable agent implementation |
| EXEC-016 | Risk and Opportunity Agent | **Missing** | — | No executable agent implementation |
| EXEC-017 | Programme Manager Agent | **Missing** | — | No executable agent implementation |
| EXEC-018 | Senior Project Manager Agent | **Missing** | — | No executable agent implementation |
| EXEC-019 | Executive Assistant Agent | **Missing** | — | No executable agent implementation |
| EXEC-020 | Administrative Manager Agent | **Missing** | — | No executable agent implementation |

### Finance & Accounting (19 agents)

| Agent ID | Professional role | Implementation status | Code registry key | Evidence pointer |
|----------|-------------------|----------------------|-------------------|------------------|
| FIN-001 | Chartered Accountant-Level Finance Agent | **Missing** | — | No executable agent implementation |
| FIN-002 | Management Accountant Agent | **Missing** | — | No executable agent implementation |
| FIN-003 | Bookkeeper Agent | **Missing** | — | No executable agent implementation |
| FIN-004 | Financial Controller Agent | **Partial** | finance | `packages/shared/src/agents.ts` → `finance` |
| FIN-005 | Tax and Compliance Preparation Agent | **Missing** | — | No executable agent implementation |
| FIN-006 | Xero Reconciliation Agent | **Partial** | finance | `packages/shared/src/agents.ts` → `finance` |
| FIN-007 | Cash-Flow Agent | **Missing** | — | No executable agent implementation |
| FIN-008 | Financial Forecasting Agent | **Missing** | — | No executable agent implementation |
| FIN-009 | Budgeting Agent | **Missing** | — | No executable agent implementation |
| FIN-010 | Invoice Follow-Up Agent | **Missing** | — | No executable agent implementation |
| FIN-011 | Debtors and Collections Agent | **Missing** | — | No executable agent implementation |
| FIN-012 | Credit Risk Agent | **Missing** | — | No executable agent implementation |
| FIN-013 | Job Costing and Margin Agent | **Missing** | — | No executable agent implementation |
| FIN-014 | Payroll Agent | **Missing** | — | No executable agent implementation |
| FIN-015 | Fraud and Financial Anomaly Agent | **Missing** | — | No executable agent implementation |
| FIN-016 | Project Profitability Controller | **Missing** | — | No executable agent implementation |
| FIN-017 | Pricing Director Agent | **Missing** | — | No executable agent implementation |
| FIN-018 | Pricebook Intelligence Agent | **Missing** | — | No executable agent implementation |
| FIN-019 | Contract Pricing Agent | **Missing** | — | No executable agent implementation |

### QS, Estimating & Commercial Intelligence (17 agents)

| Agent ID | Professional role | Implementation status | Code registry key | Evidence pointer |
|----------|-------------------|----------------------|-------------------|------------------|
| QS-001 | Quantity Surveyor Agent | **Missing** | — | No executable agent implementation |
| QS-002 | Floor Plan Take-Off Agent | **Missing** | — | No executable agent implementation |
| QS-003 | Plumbing Estimator Agent | **Missing** | — | No executable agent implementation |
| QS-004 | General Trade Estimator Agent | **Missing** | — | No executable agent implementation |
| QS-005 | BOQ Generation Agent | **Missing** | — | No executable agent implementation |
| QS-006 | Tender and Commercial Quote Agent | **Missing** | — | No executable agent implementation |
| QS-007 | Tender Compliance Agent | **Missing** | — | No executable agent implementation |
| QS-008 | Cost Engineering Agent | **Missing** | — | No executable agent implementation |
| QS-009 | Variation and Claims Agent | **Missing** | — | No executable agent implementation |
| QS-010 | Site Survey Agent | **Missing** | — | No executable agent implementation |
| QS-011 | Project Cost Controller | **Missing** | — | No executable agent implementation |
| QS-012 | Quote Quality Controller | **Missing** | — | No executable agent implementation |
| QS-013 | Supplier Price-Hunting Agent | **Missing** | — | No executable agent implementation |
| QS-014 | Market Pricing Analyst | **Missing** | — | No executable agent implementation |
| QS-015 | Competitor Pricing Research Agent | **Missing** | — | No executable agent implementation |
| QS-016 | Procurement Cost Analyst | **Missing** | — | No executable agent implementation |
| QS-017 | Insurance Estimate Agent | **Missing** | — | No executable agent implementation |

### Operations & Field Service (17 agents)

| Agent ID | Professional role | Implementation status | Code registry key | Evidence pointer |
|----------|-------------------|----------------------|-------------------|------------------|
| OPS-001 | Operations Manager Agent | **Partial** | operations | `packages/shared/src/agents.ts` → `operations` |
| OPS-002 | Dispatch Coordinator Agent | **Partial** | operations | `packages/shared/src/agents.ts` → `operations` |
| OPS-003 | Scheduling Agent | **Missing** | — | No executable agent implementation |
| OPS-004 | Emergency Triage Agent | **Missing** | — | No executable agent implementation |
| OPS-005 | Capacity Planning Agent | **Missing** | — | No executable agent implementation |
| OPS-006 | Job Progress Agent | **Missing** | — | No executable agent implementation |
| OPS-007 | Service Delivery Quality Agent | **Missing** | — | No executable agent implementation |
| OPS-008 | Recurring Maintenance Agent | **Missing** | — | No executable agent implementation |
| OPS-009 | Technician ETA Agent | **Missing** | — | No executable agent implementation |
| OPS-010 | Field Execution Agent | **Missing** | — | No executable agent implementation |
| OPS-011 | Variation Management Agent | **Missing** | — | No executable agent implementation |
| OPS-012 | Job Completion Agent | **Missing** | — | No executable agent implementation |
| OPS-013 | Preventive Maintenance Agent | **Missing** | — | No executable agent implementation |
| OPS-014 | Equipment Lifecycle Agent | **Missing** | — | No executable agent implementation |
| OPS-015 | Site Progress Verification Agent | **Missing** | — | No executable agent implementation |
| OPS-016 | Snag List and Handover Agent | **Missing** | — | No executable agent implementation |
| OPS-017 | Subcontractor Management Agent | **Missing** | — | No executable agent implementation |

### Sales, CRM & Customer Experience (22 agents)

| Agent ID | Professional role | Implementation status | Code registry key | Evidence pointer |
|----------|-------------------|----------------------|-------------------|------------------|
| CRM-001 | Sales Director Agent | **Missing** | — | No executable agent implementation |
| CRM-002 | Sales Specialist Agent | **Missing** | — | No executable agent implementation |
| CRM-003 | Lead Qualification Agent | **Partial** | lead_generation | `packages/shared/src/agents.ts` → `lead_generation` |
| CRM-004 | Sales Follow-Up Agent | **Missing** | — | No executable agent implementation |
| CRM-005 | Quote Follow-Up Agent | **Missing** | — | No executable agent implementation |
| CRM-006 | Objection Handling Agent | **Missing** | — | No executable agent implementation |
| CRM-007 | Commercial Negotiation Agent | **Missing** | — | No executable agent implementation |
| CRM-008 | Customer Support Manager | **Partial** | customer_support | `packages/shared/src/agents.ts` → `customer_support` |
| CRM-009 | Customer Service Agent | **Partial** | sales | `packages/shared/src/agents.ts` → `sales` |
| CRM-010 | Customer Success Agent | **Partial** | customer_experience | `packages/shared/src/agents.ts` → `customer_experience` |
| CRM-011 | Customer Experience Director | **Missing** | — | No executable agent implementation |
| CRM-012 | Customer Journey Designer | **Missing** | — | No executable agent implementation |
| CRM-013 | Complaint Resolution Agent | **Missing** | — | No executable agent implementation |
| CRM-014 | Service Recovery Agent | **Missing** | — | No executable agent implementation |
| CRM-015 | Customer Escalation Agent | **Missing** | — | No executable agent implementation |
| CRM-016 | Customer Retention Agent | **Missing** | — | No executable agent implementation |
| CRM-017 | Customer Churn Prediction Agent | **Missing** | — | No executable agent implementation |
| CRM-018 | Review and Referral Agent | **Missing** | — | No executable agent implementation |
| CRM-019 | Loyalty Programme Agent | **Missing** | — | No executable agent implementation |
| CRM-020 | Membership/HomeShield Agent | **Missing** | — | No executable agent implementation |
| CRM-021 | VIP Customer Agent | **Missing** | — | No executable agent implementation |
| CRM-022 | Reputation Crisis Manager | **Missing** | — | No executable agent implementation |

### Communications & Reception (16 agents)

| Agent ID | Professional role | Implementation status | Code registry key | Evidence pointer |
|----------|-------------------|----------------------|-------------------|------------------|
| COM-001 | AI Phone Receptionist | **Partial** | voice_receptionist | `packages/shared/src/agents.ts` → `voice_receptionist` |
| COM-002 | Receptionist Training Agent | **Missing** | — | No executable agent implementation |
| COM-003 | Call Quality Reviewer | **Missing** | — | No executable agent implementation |
| COM-004 | WhatsApp Business Agent | **Partial** | communications | `packages/shared/src/agents.ts` → `communications` |
| COM-005 | SMS Agent | **Missing** | — | No executable agent implementation |
| COM-006 | Email Inbox Agent | **Missing** | — | No executable agent implementation |
| COM-007 | Facebook Messenger Agent | **Provider-blocked** | — | No executable agent implementation |
| COM-008 | Unified Communications Agent | **Missing** | — | No executable agent implementation |
| COM-009 | Conversation Compliance Agent | **Missing** | — | No executable agent implementation |
| COM-010 | Translation and Language Agent | **Missing** | — | No executable agent implementation |
| COM-011 | Afrikaans Communications Agent | **Missing** | — | No executable agent implementation |
| COM-012 | English Communications Agent | **Missing** | — | No executable agent implementation |
| COM-013 | Tone and Brand Voice Agent | **Missing** | — | No executable agent implementation |
| COM-014 | Message Delivery Monitoring Agent | **Missing** | — | No executable agent implementation |
| COM-015 | Spam and Abuse Protection Agent | **Missing** | — | No executable agent implementation |
| COM-016 | Escalation Routing Agent | **Missing** | — | No executable agent implementation |

### Marketing, Trends & Strategy (31 agents)

| Agent ID | Professional role | Implementation status | Code registry key | Evidence pointer |
|----------|-------------------|----------------------|-------------------|------------------|
| MKT-001 | Marketing Director Agent | **Partial** | marketing | `packages/shared/src/agents.ts` → `marketing` |
| MKT-002 | Marketing Specialist Agent | **Missing** | — | No executable agent implementation |
| MKT-003 | Marketing Analytics Agent | **Missing** | — | No executable agent implementation |
| MKT-004 | Advertising and Campaign Agent | **Missing** | — | No executable agent implementation |
| MKT-005 | Local SEO Agent | **Missing** | — | No executable agent implementation |
| MKT-006 | Google Business Profile Agent | **Missing** | — | No executable agent implementation |
| MKT-007 | Social Media Agent | **Provider-blocked** | — | No executable agent implementation |
| MKT-008 | Community Management Agent | **Missing** | — | No executable agent implementation |
| MKT-009 | Content Director Agent | **Missing** | — | No executable agent implementation |
| MKT-010 | Content Strategy Agent | **Missing** | — | No executable agent implementation |
| MKT-011 | Content Calendar Agent | **Missing** | — | No executable agent implementation |
| MKT-012 | Copywriting Agent | **Missing** | — | No executable agent implementation |
| MKT-013 | Advertising Copy Agent | **Missing** | — | No executable agent implementation |
| MKT-014 | SEO Content Writer | **Missing** | — | No executable agent implementation |
| MKT-015 | Blog and Website Writer | **Missing** | — | No executable agent implementation |
| MKT-016 | Email Campaign Writer | **Missing** | — | No executable agent implementation |
| MKT-017 | Case Study Writer | **Missing** | — | No executable agent implementation |
| MKT-018 | Customer Education Agent | **Missing** | — | No executable agent implementation |
| MKT-019 | Campaign Planning Agent | **Missing** | — | No executable agent implementation |
| MKT-020 | Content Approval Coordinator | **Missing** | — | No executable agent implementation |
| MKT-021 | Publishing and Scheduling Agent | **Provider-blocked** | — | No executable agent implementation |
| MKT-022 | Global Trend Research Agent | **Missing** | — | No executable agent implementation |
| MKT-023 | Cape Town Trend Research Agent | **Missing** | — | No executable agent implementation |
| MKT-024 | Industry Trend Analyst | **Missing** | — | No executable agent implementation |
| MKT-025 | Social Media Trend Hunter | **Missing** | — | No executable agent implementation |
| MKT-026 | Viral Content Research Agent | **Missing** | — | No executable agent implementation |
| MKT-027 | Customer Behaviour Research Agent | **Missing** | — | No executable agent implementation |
| MKT-028 | Competitor Content Analyst | **Missing** | — | No executable agent implementation |
| MKT-029 | Platform Algorithm Research Agent | **Missing** | — | No executable agent implementation |
| MKT-030 | Seasonal Campaign Research Agent | **Missing** | — | No executable agent implementation |
| MKT-031 | Emerging Technology Research Agent | **Missing** | — | No executable agent implementation |

### Creative Production (14 agents)

| Agent ID | Professional role | Implementation status | Code registry key | Evidence pointer |
|----------|-------------------|----------------------|-------------------|------------------|
| CRE-001 | Creative Director Agent | **Missing** | — | No executable agent implementation |
| CRE-002 | Senior Graphic Designer Agent | **Missing** | — | No executable agent implementation |
| CRE-003 | Brand Identity Designer Agent | **Missing** | — | No executable agent implementation |
| CRE-004 | Social Media Designer Agent | **Missing** | — | No executable agent implementation |
| CRE-005 | Advertising Designer Agent | **Missing** | — | No executable agent implementation |
| CRE-006 | Document and Proposal Designer Agent | **Missing** | — | No executable agent implementation |
| CRE-007 | Web and UI Designer Agent | **Missing** | — | No executable agent implementation |
| CRE-008 | Presentation Designer Agent | **Missing** | — | No executable agent implementation |
| CRE-009 | Infographic Designer Agent | **Missing** | — | No executable agent implementation |
| CRE-010 | Image Retouching and Quality Agent | **Missing** | — | No executable agent implementation |
| CRE-011 | Brand Consistency Reviewer Agent | **Missing** | — | No executable agent implementation |
| CRE-012 | Photography Director Agent | **Missing** | — | No executable agent implementation |
| CRE-013 | Shot List Planner Agent | **Missing** | — | No executable agent implementation |
| CRE-014 | On-Site Content Coordinator Agent | **Missing** | — | No executable agent implementation |

### Video & Audio Production (20 agents)

| Agent ID | Professional role | Implementation status | Code registry key | Evidence pointer |
|----------|-------------------|----------------------|-------------------|------------------|
| VID-001 | Video Creative Director Agent | **Missing** | — | No executable agent implementation |
| VID-002 | Video Content Strategist Agent | **Missing** | — | No executable agent implementation |
| VID-003 | Scriptwriting Agent | **Missing** | — | No executable agent implementation |
| VID-004 | Hook and Storytelling Agent | **Missing** | — | No executable agent implementation |
| VID-005 | Short-Form Video Creator Agent | **Missing** | — | No executable agent implementation |
| VID-006 | Long-Form Video Creator Agent | **Missing** | — | No executable agent implementation |
| VID-007 | Professional Video Editor Agent | **Missing** | — | No executable agent implementation |
| VID-008 | Motion Graphics Agent | **Missing** | — | No executable agent implementation |
| VID-009 | Animation Agent | **Missing** | — | No executable agent implementation |
| VID-010 | Voice-Over Planning Agent | **Missing** | — | No executable agent implementation |
| VID-011 | Caption and Subtitle Agent | **Missing** | — | No executable agent implementation |
| VID-012 | Thumbnail Designer Agent | **Missing** | — | No executable agent implementation |
| VID-013 | Podcast and Audio Editor Agent | **Missing** | — | No executable agent implementation |
| VID-014 | Audio Engineer Agent | **Missing** | — | No executable agent implementation |
| VID-015 | Colour-Grading Agent | **Missing** | — | No executable agent implementation |
| VID-016 | Visual Effects Agent | **Missing** | — | No executable agent implementation |
| VID-017 | Video Quality Controller Agent | **Missing** | — | No executable agent implementation |
| VID-018 | Content Repurposing Agent | **Missing** | — | No executable agent implementation |
| VID-019 | Content Rights and Licensing Agent | **Missing** | — | No executable agent implementation |
| VID-020 | Creative Performance Analyst Agent | **Missing** | — | No executable agent implementation |

### HR, Training & Administration (20 agents)

| Agent ID | Professional role | Implementation status | Code registry key | Evidence pointer |
|----------|-------------------|----------------------|-------------------|------------------|
| HR-001 | HR Manager Agent | **Partial** | workforce_intelligence | `packages/shared/src/agents.ts` → `workforce_intelligence` |
| HR-002 | Recruitment Specialist Agent | **Partial** | recruiting | `packages/shared/src/agents.ts` → `recruiting` |
| HR-003 | Employee Relations Agent | **Missing** | — | No executable agent implementation |
| HR-004 | Performance Management Agent | **Missing** | — | No executable agent implementation |
| HR-005 | Attendance Agent | **Missing** | — | No executable agent implementation |
| HR-006 | Payroll and Overtime Agent | **Missing** | — | No executable agent implementation |
| HR-007 | Technician Performance Agent | **Missing** | — | No executable agent implementation |
| HR-008 | Training and Development Agent | **Missing** | — | No executable agent implementation |
| HR-009 | Leadership Development Agent | **Missing** | — | No executable agent implementation |
| HR-010 | Employee Onboarding Agent | **Missing** | — | No executable agent implementation |
| HR-011 | Skills Assessment Agent | **Missing** | — | No executable agent implementation |
| HR-012 | Technical Training Agent | **Missing** | — | No executable agent implementation |
| HR-013 | Health and Safety Training Agent | **Missing** | — | No executable agent implementation |
| HR-014 | Customer Service Coach Agent | **Missing** | — | No executable agent implementation |
| HR-015 | Sales Coach Agent | **Missing** | — | No executable agent implementation |
| HR-016 | Knowledge Manager Agent | **Missing** | — | No executable agent implementation |
| HR-017 | SOP Agent | **Missing** | — | No executable agent implementation |
| HR-018 | Knowledge Quality Reviewer Agent | **Missing** | — | No executable agent implementation |
| HR-019 | Document and Filing Agent | **Missing** | — | No executable agent implementation |
| HR-020 | Compliance Administration Agent | **Missing** | — | No executable agent implementation |

### Legal, Safety, Risk & Compliance (16 agents)

| Agent ID | Professional role | Implementation status | Code registry key | Evidence pointer |
|----------|-------------------|----------------------|-------------------|------------------|
| LEG-001 | Legal Counsel Agent | **Partial** | legal_compliance | `packages/shared/src/agents.ts` → `legal_compliance` |
| LEG-002 | Contract Review Agent | **Missing** | — | No executable agent implementation |
| LEG-003 | Employment Compliance Agent | **Missing** | — | No executable agent implementation |
| LEG-004 | Consumer Protection Agent | **Missing** | — | No executable agent implementation |
| LEG-005 | POPIA and Privacy Officer Agent | **Missing** | — | No executable agent implementation |
| LEG-006 | Commercial Risk Agent | **Missing** | — | No executable agent implementation |
| LEG-007 | Plumbing and Trade Compliance Agent | **Missing** | — | No executable agent implementation |
| LEG-008 | Health and Safety Officer Agent | **Missing** | — | No executable agent implementation |
| LEG-009 | Incident Investigation Agent | **Missing** | — | No executable agent implementation |
| LEG-010 | Insurance Claims Agent | **Missing** | — | No executable agent implementation |
| LEG-011 | Occupational Health Compliance Agent | **Missing** | — | No executable agent implementation |
| LEG-012 | Municipal Permit and Approval Agent | **Missing** | — | No executable agent implementation |
| LEG-013 | Trade Certification Agent | **Missing** | — | No executable agent implementation |
| LEG-014 | Environmental Compliance Agent | **Missing** | — | No executable agent implementation |
| LEG-015 | Emergency and Disaster Response Agent | **Missing** | — | No executable agent implementation |
| LEG-016 | Audit and Governance Agent | **Missing** | — | No executable agent implementation |

### Software, IT & Product (26 agents)

| Agent ID | Professional role | Implementation status | Code registry key | Evidence pointer |
|----------|-------------------|----------------------|-------------------|------------------|
| SW-001 | AURA Developer Coordinator | **Missing** | — | No executable agent implementation |
| SW-002 | Software Engineering Agent | **Missing** | — | No executable agent implementation |
| SW-003 | Frontend Engineering Agent | **Missing** | — | No executable agent implementation |
| SW-004 | Backend Engineering Agent | **Missing** | — | No executable agent implementation |
| SW-005 | Mobile App Engineer Agent | **Missing** | — | No executable agent implementation |
| SW-006 | Database Engineering Agent | **Missing** | — | No executable agent implementation |
| SW-007 | IT Systems Engineer Agent | **Missing** | — | No executable agent implementation |
| SW-008 | Cloud and Infrastructure Agent | **Missing** | — | No executable agent implementation |
| SW-009 | Integration Engineer Agent | **Missing** | — | No executable agent implementation |
| SW-010 | DevOps Engineer Agent | **Missing** | — | No executable agent implementation |
| SW-011 | Site Reliability Engineer Agent | **Missing** | — | No executable agent implementation |
| SW-012 | Cybersecurity Agent | **Missing** | — | No executable agent implementation |
| SW-013 | AI Systems Engineer Agent | **Missing** | — | No executable agent implementation |
| SW-014 | Prompt and Agent Engineer Agent | **Missing** | — | No executable agent implementation |
| SW-015 | Architecture Agent | **Missing** | — | No executable agent implementation |
| SW-016 | Product Manager Agent | **Missing** | — | No executable agent implementation |
| SW-017 | Product Owner Agent | **Missing** | — | No executable agent implementation |
| SW-018 | UX Research Agent | **Missing** | — | No executable agent implementation |
| SW-019 | Accessibility Testing Agent | **Missing** | — | No executable agent implementation |
| SW-020 | Automated Testing Agent | **Missing** | — | No executable agent implementation |
| SW-021 | Integration Testing Agent | **Missing** | — | No executable agent implementation |
| SW-022 | Release Manager Agent | **Partial** | release_manager | `packages/shared/src/agents.ts` → `release_manager` |
| SW-023 | Technical Documentation Agent | **Missing** | — | No executable agent implementation |
| SW-024 | System Health and Self-Healing Agent | **Partial** | platform_health | `packages/shared/src/agents.ts` → `platform_health` |
| SW-025 | Disaster Recovery Agent | **Missing** | — | No executable agent implementation |
| SW-026 | Technical Support Agent | **Missing** | — | No executable agent implementation |

### Data & Analytics (10 agents)

| Agent ID | Professional role | Implementation status | Code registry key | Evidence pointer |
|----------|-------------------|----------------------|-------------------|------------------|
| DAT-001 | Data Analyst Agent | **Missing** | — | No executable agent implementation |
| DAT-002 | Analytics Engineer Agent | **Missing** | — | No executable agent implementation |
| DAT-003 | Data Quality Agent | **Missing** | — | No executable agent implementation |
| DAT-004 | Data Governance Agent | **Missing** | — | No executable agent implementation |
| DAT-005 | Master Data Management Agent | **Missing** | — | No executable agent implementation |
| DAT-006 | CRM Data-Cleaning Agent | **Missing** | — | No executable agent implementation |
| DAT-007 | Forecasting and Predictive Analytics Agent | **Missing** | — | No executable agent implementation |
| DAT-008 | KPI Design Agent | **Missing** | — | No executable agent implementation |
| DAT-009 | Report Automation Agent | **Missing** | — | No executable agent implementation |
| DAT-010 | Business Intelligence Agent | **Partial** | business_intelligence | `packages/shared/src/agents.ts` → `business_intelligence` |

### Inventory, Procurement & Assets (17 agents)

| Agent ID | Professional role | Implementation status | Code registry key | Evidence pointer |
|----------|-------------------|----------------------|-------------------|------------------|
| INV-001 | Inventory Control Agent | **Missing** | — | No executable agent implementation |
| INV-002 | Warehouse Agent | **Missing** | — | No executable agent implementation |
| INV-003 | Tool Tracking Agent | **Missing** | — | No executable agent implementation |
| INV-004 | Procurement Agent | **Partial** | procurement | `packages/shared/src/agents.ts` → `procurement` |
| INV-005 | Supplier Price Comparison Agent | **Missing** | — | No executable agent implementation |
| INV-006 | Vendor Relationship Manager Agent | **Missing** | — | No executable agent implementation |
| INV-007 | Supplier Contract Agent | **Missing** | — | No executable agent implementation |
| INV-008 | Purchase Approval Agent | **Missing** | — | No executable agent implementation |
| INV-009 | Demand Forecasting Agent | **Missing** | — | No executable agent implementation |
| INV-010 | Stock Replenishment Agent | **Missing** | — | No executable agent implementation |
| INV-011 | Dead-Stock Detection Agent | **Missing** | — | No executable agent implementation |
| INV-012 | Tool Maintenance Agent | **Missing** | — | No executable agent implementation |
| INV-013 | Tool Loss Investigation Agent | **Missing** | — | No executable agent implementation |
| INV-014 | Asset Lifecycle Agent | **Missing** | — | No executable agent implementation |
| INV-015 | Facilities Manager Agent | **Missing** | — | No executable agent implementation |
| INV-016 | Warehouse Layout Agent | **Missing** | — | No executable agent implementation |
| INV-017 | Delivery and Logistics Agent | **Missing** | — | No executable agent implementation |

### Fleet, Maps & Driver Safety (13 agents)

| Agent ID | Professional role | Implementation status | Code registry key | Evidence pointer |
|----------|-------------------|----------------------|-------------------|------------------|
| FLT-001 | Fleet Manager Agent | **Partial** | asset_intelligence | `packages/shared/src/agents.ts` → `asset_intelligence` |
| FLT-002 | Google Maps and Routing Agent | **Missing** | — | No executable agent implementation |
| FLT-003 | Cartrack Telemetry Agent | **Missing** | — | No executable agent implementation |
| FLT-004 | Vehicle Maintenance Agent | **Missing** | — | No executable agent implementation |
| FLT-005 | Driver Behaviour Agent | **Missing** | — | No executable agent implementation |
| FLT-006 | Fuel Consumption Agent | **Missing** | — | No executable agent implementation |
| FLT-007 | Vehicle Utilisation Agent | **Missing** | — | No executable agent implementation |
| FLT-008 | Accident and Incident Agent | **Missing** | — | No executable agent implementation |
| FLT-009 | Licence and Registration Agent | **Missing** | — | No executable agent implementation |
| FLT-010 | Fleet Insurance Agent | **Missing** | — | No executable agent implementation |
| FLT-011 | Route Efficiency Agent | **Missing** | — | No executable agent implementation |
| FLT-012 | Vehicle Replacement Planning Agent | **Missing** | — | No executable agent implementation |
| FLT-013 | Driver Coaching Agent | **Missing** | — | No executable agent implementation |

### SaaS, Partnerships & Expansion (14 agents)

| Agent ID | Professional role | Implementation status | Code registry key | Evidence pointer |
|----------|-------------------|----------------------|-------------------|------------------|
| SaaS-001 | Tenant Onboarding Agent | **Missing** | — | No executable agent implementation |
| SaaS-002 | Subscription and Billing Agent | **Missing** | — | No executable agent implementation |
| SaaS-003 | SaaS Customer Success Agent | **Missing** | — | No executable agent implementation |
| SaaS-004 | Platform Usage and Health Agent | **Missing** | — | No executable agent implementation |
| SaaS-005 | Partnerships Director Agent | **Missing** | — | No executable agent implementation |
| SaaS-006 | Franchise Development Agent | **Missing** | — | No executable agent implementation |
| SaaS-007 | Corporate Accounts Agent | **Missing** | — | No executable agent implementation |
| SaaS-008 | Property Manager Relationship Agent | **Missing** | — | No executable agent implementation |
| SaaS-009 | Construction Partnership Agent | **Missing** | — | No executable agent implementation |
| SaaS-010 | Supplier Partnership Agent | **Missing** | — | No executable agent implementation |
| SaaS-011 | Geographic Expansion Agent | **Missing** | — | No executable agent implementation |
| SaaS-012 | New Industry Research Agent | **Missing** | — | No executable agent implementation |
| SaaS-013 | Acquisition and Merger Research Agent | **Missing** | — | No executable agent implementation |
| SaaS-014 | Investor Relations Agent | **Missing** | — | No executable agent implementation |

### Permanent Audit Department (14 agents)

| Agent ID | Professional role | Implementation status | Code registry key | Evidence pointer |
|----------|-------------------|----------------------|-------------------|------------------|
| AUD-001 | Chief Audit Agent | **Missing** | — | No executable agent implementation |
| AUD-002 | Application Auditor | **Missing** | — | No executable agent implementation |
| AUD-003 | Browser and User-Journey Auditor | **Missing** | — | No executable agent implementation |
| AUD-004 | Role and Permission Auditor | **Missing** | — | No executable agent implementation |
| AUD-005 | Tenant-Isolation Auditor | **Missing** | — | No executable agent implementation |
| AUD-006 | Financial Data Auditor | **Missing** | — | No executable agent implementation |
| AUD-007 | Integration Auditor | **Missing** | — | No executable agent implementation |
| AUD-008 | Mobile and Responsive Auditor | **Missing** | — | No executable agent implementation |
| AUD-009 | Accessibility Auditor | **Missing** | — | No executable agent implementation |
| AUD-010 | Security and Privacy Auditor | **Missing** | — | No executable agent implementation |
| AUD-011 | Data Quality Auditor | **Missing** | — | No executable agent implementation |
| AUD-012 | Document and Compliance Auditor | **Missing** | — | No executable agent implementation |
| AUD-013 | Performance and Reliability Auditor | **Missing** | — | No executable agent implementation |
| AUD-014 | Acceptance Register Reconciliation Agent | **Missing** | — | No executable agent implementation |

---

**Maintenance:** Regenerate via `node scripts/generate-master-agent-register.mjs` then `node scripts/render-agent-register-tables.mjs` then `node scripts/assemble-master-agent-register.mjs`.
