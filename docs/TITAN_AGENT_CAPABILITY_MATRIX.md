# TITAN Agent Capability Matrix

**Document type:** Permanent capability schema — documentation only  
**Generated (UTC):** 2026-08-06  
**Parent register:** [TITAN_MASTER_AGENT_REGISTER.md](./TITAN_MASTER_AGENT_REGISTER.md)  
**Total agents:** 307 unique IDs  

---

## Purpose

This matrix defines the **required fields** for every agent in TITAN's permanent workforce. An agent row in the master register is incomplete until every field below is populated with truthful evidence.

---

## Required fields (every operational agent)

| # | Field | Description |
|---|-------|-------------|
| 1 | **Unique ID** | Stable register ID (e.g. `FIN-004`) |
| 2 | **Department** | EXEC, FIN, QS, OPS, CRM, COM, MKT, CRE, VID, HR, LEG, SW, DAT, INV, FLT, SaaS, AUD, AURA |
| 3 | **Professional role** | Human-equivalent job title |
| 4 | **Mission** | One-sentence purpose |
| 5 | **Responsibilities** | Bounded duties the agent may perform |
| 6 | **Inputs** | Data, documents, events, APIs it may consume |
| 7 | **Outputs** | Drafts, reports, actions, recommendations it may produce |
| 8 | **Tools** | Executable tool keys wired to backend handlers |
| 9 | **Provider access** | External APIs (Xero, Meta, Cartrack, etc.) |
| 10 | **Allowed data** | Tenant-scoped tables, documents, metrics |
| 11 | **Forbidden data** | Cross-tenant, PII outside scope, production secrets |
| 12 | **Tenant scope** | Single-tenant enforced; no cross-tenant learning |
| 13 | **Role permissions** | RBAC keys required (Owner, Admin, Office, etc.) |
| 14 | **Autonomous actions** | What it may do without human approval |
| 15 | **Actions requiring approval** | Draft-only until Owner/staff sign-off |
| 16 | **Escalation rules** | When to route to human or AURA |
| 17 | **Human professional sign-off** | Statutory/regulated outputs requiring qualified human |
| 18 | **Learning sources** | Approved inputs for controlled learning (see governance standard) |
| 19 | **Memory rules** | What may be stored, TTL, redaction |
| 20 | **Audit requirements** | Events logged, retention, replay protection |
| 21 | **Performance KPIs** | Measurable success criteria |
| 22 | **Tests** | Automated unit, integration, RBAC, tenant-isolation tests |
| 23 | **Activation dependencies** | Integrations, migrations, Owner gates |
| 24 | **Implementation status** | Exactly one status from master register vocabulary |

---

## Exemplar: EXEC-007 Executive Command Agent (Partial)

| Field | Value |
|-------|-------|
| ID | EXEC-007 |
| Department | EXEC |
| Role | Executive Command Agent |
| Mission | Provide Owner-grade business health overview and strategic recommendations without autonomous decisions |
| Registry key | `executive` |
| Tools (sample) | `read_business_health`, `read_executive_alerts`, `draft_executive_action` (approval required) |
| Status | **Partial** — registry + suggested tools exist; not Verified complete |
| Evidence | `packages/shared/src/agents.ts`, AURA chat routing, Agent Dashboard UI shell |
| Gap | No live-verified Owner briefing loop; many suggested tools not proven executable end-to-end |

---

## Exemplar: FIN-004 Financial Controller Agent (Partial)

| Field | Value |
|-------|-------|
| ID | FIN-004 |
| Mission | Support invoicing, reconciliation analysis, and finance operations within RBAC |
| Human sign-off | Tax submissions, statutory accounts, payment execution |
| Status | **Partial** |
| Evidence | Finance module APIs, `finance` registry entry, finance RBAC tests (J-6.6A) |
| Gap | Dedicated agent execution loop not live-verified |

---

## Exemplar: QS-002 Floor Plan Take-Off Agent (Missing)

| Field | Value |
|-------|-------|
| ID | QS-002 |
| Mission | Measure quantities from uploaded plans with scale verification |
| Forbidden | Invent measurements from unreadable or unscaled plans |
| Workflow step | Upload plan → identify scale → measure quantities |
| Status | **Missing** |
| Activation dependency | Document upload pipeline, scale metadata, BOQ agent (QS-005) |

---

## Exemplar: COM-007 Facebook Messenger Agent (Provider-blocked)

| Field | Value |
|-------|-------|
| ID | COM-007 |
| Provider access | Meta Graph — `pages_messaging` (not granted) |
| Status | **Provider-blocked** |
| Note | Basic Page connection complete (`CONNECTED_LIMITED`); messaging requires Meta App Review |
| Not a dev blocker | Facebook advanced capabilities deferred per integration register |

---

## Department capability summary

| Dept | Agents | Verified | Partial | Provider-blocked | Missing |
|------|-------:|---------:|--------:|-----------------:|--------:|
| AURA | 1 | 0 | 1 | 0 | 0 |
| EXEC | 20 | 0 | 1 | 0 | 19 |
| FIN | 19 | 0 | 2 | 0 | 17 |
| QS | 17 | 0 | 0 | 0 | 17 |
| OPS | 17 | 0 | 2 | 0 | 15 |
| CRM | 22 | 0 | 4 | 0 | 18 |
| COM | 16 | 0 | 2 | 1 | 13 |
| MKT | 31 | 0 | 1 | 2 | 28 |
| CRE | 14 | 0 | 0 | 0 | 14 |
| VID | 20 | 0 | 0 | 0 | 20 |
| HR | 20 | 0 | 2 | 0 | 18 |
| LEG | 16 | 0 | 1 | 0 | 15 |
| SW | 26 | 0 | 2 | 0 | 24 |
| DAT | 10 | 0 | 1 | 0 | 9 |
| INV | 17 | 0 | 1 | 0 | 16 |
| FLT | 13 | 0 | 1 | 0 | 12 |
| SaaS | 14 | 0 | 0 | 0 | 14 |
| AUD | 14 | 0 | 0 | 0 | 14 |
| **Total** | **307** | **0** | **21** | **3** | **283** |

---

## Young Guns creative agents (YGP Signature Premium)

Creative (CRE-*) and video (VID-*) agents must:

- Use approved Young Guns brand assets and tokens (`apps/web/src/brand/`)
- Follow YGP Signature Premium style guidance
- Route all customer-facing publish actions through Content Approval Coordinator (MKT-020)
- Never publish without Owner or delegated approval

---

## Code-changing agents (SW-* subset)

Agents that modify code must follow:

```
Detect → investigate → isolated branch/worktree → implement → test → preview
  → Owner approval → staging → production approval → rollback plan
```

They must **never** directly modify production.

---

## Cross-reference

- Full agent list: [TITAN_MASTER_AGENT_REGISTER.md](./TITAN_MASTER_AGENT_REGISTER.md)
- Learning rules: [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md)
- Activation order: [TITAN_AGENT_ACTIVATION_ROADMAP.md](./TITAN_AGENT_ACTIVATION_ROADMAP.md)
- Machine-readable index: `docs/.agent-register-data.json`
