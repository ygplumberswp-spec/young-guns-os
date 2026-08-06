# TITAN Master Agent Register

**Document ID:** AGENT-001  
**Document type:** Permanent master register — AI workforce source of truth  
**Generated (UTC):** 2026-08-06  
**Repository:** young-guns-os (Titan-Aura-Consolidation)  
**Branch:** `cursor/titan-agent-register-001`  
**Base HEAD:** `23debd9cfa90a05ab31f051b76d3e7a86708b14f`  

**Related documents:**

- [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) (AGENT-002)
- [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) (AGENT-003)
- [TITAN_AGENT_ACTIVATION_ROADMAP.md](./TITAN_AGENT_ACTIVATION_ROADMAP.md) (AGENT-004)
- [TITAN_INTEGRATION_REGISTER.md](./TITAN_INTEGRATION_REGISTER.md) (INT-UNIVERSAL-001)
- [TITAN_MASTER_ACCEPTANCE_REGISTER.md](./TITAN_MASTER_ACCEPTANCE_REGISTER.md)

---

## Register principles (locked)

1. **AURA is the Owner-facing executive coordinator.** AURA routes context, assembles specialist work, and enforces approval gates. AURA is not a substitute for domain specialists.
2. **Specialist agents work underneath AURA.** Each agent maps to a real business function with bounded tools and data access.
3. **Agents are functional roles, not decorative cards.** A nav entry or prompt without executable, tested tools is **Defined** at best — never **Active**.
4. **One role may use several tools, workflows, and models.** Tooling is grouped by business responsibility.
5. **One automation is not automatically a separate agent.** Automations inherit the supervising agent's governance.
6. **New agents may be added when justified by an actual business function.** Append to this register with a new stable ID; do not renumber existing IDs.
7. **There is no arbitrary numerical agent cap.** TITAN may grow beyond 150+ specialists as product and tenant needs require. This register is **extensible**, not a fixed maximum.
8. **Agents are tenant-isolated.** No cross-tenant reads, writes, learning, or inference.
9. **Agents cannot silently take high-risk actions.** Draft → Approve → Execute is mandatory for external effects.

---

## Organisational hierarchy

```
Owner
  └── AURA-001 (central interface & coordinator)
        └── Executive leadership agents (EXEC-*)
              └── Department specialist agents
                    └── Audit department (AUD-*, independent)
```

---

## Implementation status vocabulary (exactly one per agent)

| Status | Meaning |
|--------|---------|
| **Defined** | Role documented in this register; no executable agent loop |
| **Planned** | Approved for build; dependencies identified |
| **Build-ready** | Design + RBAC + integration prerequisites met; implementation queued |
| **Implemented but inactive** | Code/tools exist; not activated for autonomous or supervised operation |
| **Shadow mode** | Observes and drafts only; no execution path enabled |
| **Supervised** | Executes only with explicit human approval per action |
| **Active** | Operates within approved policy with monitoring (Owner activation required) |
| **Paused** | Temporarily disabled; state preserved |
| **Retired** | Removed from activation; historical audit retained |

**Truth rule:** Documentation alone never implies **Active**. Prior informal statuses (e.g. "Verified complete", "Partial") are superseded by this vocabulary.

---

## Register summary

| Metric | Count |
|--------|------:|
| **Departments (A–M + AURA)** | 14 |
| **Registered agent roles (minimum set)** | 191 |
| **Active (autonomous operational)** | 0 |
| **Supervised** | 1 (AURA-001) |
| **Implemented but inactive** | 1 (Facebook Agent) |
| **Build-ready** | 2 |
| **Defined / Planned** | remainder |

> **Extensibility:** Additional agents (e.g. industry packs, SaaS tenants) are added by appending new stable IDs. The register does **not** impose a maximum workforce size.

---

## Central intelligence

#### AURA-001 — AURA (Central Executive Coordinator)

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `AURA-001` |
| **Agent name** | AURA (Central Executive Coordinator) |
| **Department** | Central Intelligence (`AURA`) |
| **Role type** | Specialist |
| **Mission** | Support aura (central executive coordinator) responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | Owner; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Supervised** |
| **Activation phase** | Phase B |
| **Notes** | AURA chat, agent registry, routing — Owner-facing coordinator active in supervised mode |

## A. Executive leadership

**Department code:** `EXEC` · **Agents:** 11
| Agent ID | Agent name | Status | Activation phase |
|----------|------------|--------|------------------|
| `EXEC-001` | Chief Executive Agent | Defined | Phase A |
| `EXEC-002` | Chief Operating Agent | Defined | Phase A |
| `EXEC-003` | Chief Financial Agent | Defined | Phase A |
| `EXEC-004` | Chief Technology Agent | Defined | Phase A |
| `EXEC-005` | Chief Product Agent | Defined | Phase A |
| `EXEC-006` | Chief Data Agent | Defined | Phase A |
| `EXEC-007` | Executive Strategy Agent | Defined | Phase A |
| `EXEC-008` | Business Coach Agent | Defined | Phase A |
| `EXEC-009` | Business Analyst Agent | Defined | Phase A |
| `EXEC-010` | Growth Strategy Agent | Defined | Phase A |
| `EXEC-011` | Risk and Decision Support Agent | Defined | Phase A |
### Agent profiles
#### EXEC-001 — Chief Executive Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `EXEC-001` |
| **Agent name** | Chief Executive Agent |
| **Department** | A. Executive leadership (`EXEC`) |
| **Role type** | Specialist |
| **Mission** | Support chief executive responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### EXEC-002 — Chief Operating Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `EXEC-002` |
| **Agent name** | Chief Operating Agent |
| **Department** | A. Executive leadership (`EXEC`) |
| **Role type** | Specialist |
| **Mission** | Support chief operating responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### EXEC-003 — Chief Financial Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `EXEC-003` |
| **Agent name** | Chief Financial Agent |
| **Department** | A. Executive leadership (`EXEC`) |
| **Role type** | Specialist |
| **Mission** | Support chief financial responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### EXEC-004 — Chief Technology Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `EXEC-004` |
| **Agent name** | Chief Technology Agent |
| **Department** | A. Executive leadership (`EXEC`) |
| **Role type** | Specialist |
| **Mission** | Support chief technology responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### EXEC-005 — Chief Product Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `EXEC-005` |
| **Agent name** | Chief Product Agent |
| **Department** | A. Executive leadership (`EXEC`) |
| **Role type** | Specialist |
| **Mission** | Support chief product responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### EXEC-006 — Chief Data Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `EXEC-006` |
| **Agent name** | Chief Data Agent |
| **Department** | A. Executive leadership (`EXEC`) |
| **Role type** | Specialist |
| **Mission** | Support chief data responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### EXEC-007 — Executive Strategy Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `EXEC-007` |
| **Agent name** | Executive Strategy Agent |
| **Department** | A. Executive leadership (`EXEC`) |
| **Role type** | Specialist |
| **Mission** | Support executive strategy responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### EXEC-008 — Business Coach Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `EXEC-008` |
| **Agent name** | Business Coach Agent |
| **Department** | A. Executive leadership (`EXEC`) |
| **Role type** | Specialist |
| **Mission** | Support business coach responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### EXEC-009 — Business Analyst Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `EXEC-009` |
| **Agent name** | Business Analyst Agent |
| **Department** | A. Executive leadership (`EXEC`) |
| **Role type** | Specialist |
| **Mission** | Support business analyst responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### EXEC-010 — Growth Strategy Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `EXEC-010` |
| **Agent name** | Growth Strategy Agent |
| **Department** | A. Executive leadership (`EXEC`) |
| **Role type** | Specialist |
| **Mission** | Support growth strategy responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### EXEC-011 — Risk and Decision Support Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `EXEC-011` |
| **Agent name** | Risk and Decision Support Agent |
| **Department** | A. Executive leadership (`EXEC`) |
| **Role type** | Specialist |
| **Mission** | Support risk and decision support responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |

## B. Finance and accounting

**Department code:** `FIN` · **Agents:** 17
| Agent ID | Agent name | Status | Activation phase |
|----------|------------|--------|------------------|
| `FIN-001` | Chartered Accountant-level Finance Agent | Defined | Phase A |
| `FIN-002` | Financial Controller Agent | Defined | Phase A |
| `FIN-003` | Management Accountant Agent | Defined | Phase A |
| `FIN-004` | Bookkeeper Agent | Defined | Phase A |
| `FIN-005` | Accounts Receivable Agent | Defined | Phase A |
| `FIN-006` | Accounts Payable Agent | Defined | Phase A |
| `FIN-007` | Cashflow Forecasting Agent | Defined | Phase A |
| `FIN-008` | Budgeting Agent | Defined | Phase A |
| `FIN-009` | Profitability Agent | Defined | Phase A |
| `FIN-010` | Pricing and Margin Protection Agent | Defined | Phase A |
| `FIN-011` | Tax/VAT Support Agent | Defined | Phase A |
| `FIN-012` | Payroll Agent | Defined | Phase A |
| `FIN-013` | Bank Reconciliation Agent | Defined | Phase A |
| `FIN-014` | Xero Integration Agent | Planned | Phase D |
| `FIN-015` | Yoco Reconciliation Agent | Defined | Phase A |
| `FIN-016` | Debt Collection and Follow-up Agent | Defined | Phase A |
| `FIN-017` | Financial Audit Agent | Defined | Phase A |
### Agent profiles
#### FIN-001 — Chartered Accountant-level Finance Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `FIN-001` |
| **Agent name** | Chartered Accountant-level Finance Agent |
| **Department** | B. Finance and accounting (`FIN`) |
| **Role type** | Specialist |
| **Mission** | Support chartered accountant-level finance responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### FIN-002 — Financial Controller Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `FIN-002` |
| **Agent name** | Financial Controller Agent |
| **Department** | B. Finance and accounting (`FIN`) |
| **Role type** | Specialist |
| **Mission** | Support financial controller responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### FIN-003 — Management Accountant Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `FIN-003` |
| **Agent name** | Management Accountant Agent |
| **Department** | B. Finance and accounting (`FIN`) |
| **Role type** | Specialist |
| **Mission** | Support management accountant responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### FIN-004 — Bookkeeper Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `FIN-004` |
| **Agent name** | Bookkeeper Agent |
| **Department** | B. Finance and accounting (`FIN`) |
| **Role type** | Specialist |
| **Mission** | Support bookkeeper responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### FIN-005 — Accounts Receivable Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `FIN-005` |
| **Agent name** | Accounts Receivable Agent |
| **Department** | B. Finance and accounting (`FIN`) |
| **Role type** | Specialist |
| **Mission** | Support accounts receivable responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### FIN-006 — Accounts Payable Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `FIN-006` |
| **Agent name** | Accounts Payable Agent |
| **Department** | B. Finance and accounting (`FIN`) |
| **Role type** | Specialist |
| **Mission** | Support accounts payable responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### FIN-007 — Cashflow Forecasting Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `FIN-007` |
| **Agent name** | Cashflow Forecasting Agent |
| **Department** | B. Finance and accounting (`FIN`) |
| **Role type** | Specialist |
| **Mission** | Support cashflow forecasting responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### FIN-008 — Budgeting Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `FIN-008` |
| **Agent name** | Budgeting Agent |
| **Department** | B. Finance and accounting (`FIN`) |
| **Role type** | Specialist |
| **Mission** | Support budgeting responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### FIN-009 — Profitability Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `FIN-009` |
| **Agent name** | Profitability Agent |
| **Department** | B. Finance and accounting (`FIN`) |
| **Role type** | Specialist |
| **Mission** | Support profitability responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### FIN-010 — Pricing and Margin Protection Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `FIN-010` |
| **Agent name** | Pricing and Margin Protection Agent |
| **Department** | B. Finance and accounting (`FIN`) |
| **Role type** | Specialist |
| **Mission** | Support pricing and margin protection responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | High |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### FIN-011 — Tax/VAT Support Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `FIN-011` |
| **Agent name** | Tax/VAT Support Agent |
| **Department** | B. Finance and accounting (`FIN`) |
| **Role type** | Specialist |
| **Mission** | Support tax/vat support responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | High |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### FIN-012 — Payroll Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `FIN-012` |
| **Agent name** | Payroll Agent |
| **Department** | B. Finance and accounting (`FIN`) |
| **Role type** | Specialist |
| **Mission** | Support payroll responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | High |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### FIN-013 — Bank Reconciliation Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `FIN-013` |
| **Agent name** | Bank Reconciliation Agent |
| **Department** | B. Finance and accounting (`FIN`) |
| **Role type** | Specialist |
| **Mission** | Support bank reconciliation responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### FIN-014 — Xero Integration Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `FIN-014` |
| **Agent name** | Xero Integration Agent |
| **Department** | B. Finance and accounting (`FIN`) |
| **Role type** | Specialist |
| **Mission** | Support xero integration responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | High |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Planned** |
| **Activation phase** | Phase D |
| **Notes** | Xero integration scaffold; XERO-002 parked — not started |
#### FIN-015 — Yoco Reconciliation Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `FIN-015` |
| **Agent name** | Yoco Reconciliation Agent |
| **Department** | B. Finance and accounting (`FIN`) |
| **Role type** | Specialist |
| **Mission** | Support yoco reconciliation responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | High |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### FIN-016 — Debt Collection and Follow-up Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `FIN-016` |
| **Agent name** | Debt Collection and Follow-up Agent |
| **Department** | B. Finance and accounting (`FIN`) |
| **Role type** | Specialist |
| **Mission** | Support debt collection and follow-up responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | High |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### FIN-017 — Financial Audit Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `FIN-017` |
| **Agent name** | Financial Audit Agent |
| **Department** | B. Finance and accounting (`FIN`) |
| **Role type** | Specialist |
| **Mission** | Support financial audit responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | High |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |

## C. Sales and business development

**Department code:** `SAL` · **Agents:** 15
| Agent ID | Agent name | Status | Activation phase |
|----------|------------|--------|------------------|
| `SAL-001` | Sales Director Agent | Defined | Phase A |
| `SAL-002` | Lead Qualification Agent | Defined | Phase A |
| `SAL-003` | Sales Follow-up Agent | Defined | Phase A |
| `SAL-004` | Non-pushy Lead Hunting Agent | Defined | Phase A |
| `SAL-005` | Objection Handling Agent | Defined | Phase A |
| `SAL-006` | Negotiation Support Agent | Defined | Phase A |
| `SAL-007` | Proposal Agent | Defined | Phase A |
| `SAL-008` | Quote Follow-up Agent | Defined | Phase A |
| `SAL-009` | Customer Retention Agent | Defined | Phase A |
| `SAL-010` | Service Agreement Agent | Defined | Phase A |
| `SAL-011` | Business Development Agent | Defined | Phase A |
| `SAL-012` | Commercial Tender Agent | Defined | Phase A |
| `SAL-013` | Partnership Agent | Defined | Phase A |
| `SAL-014` | Competitor Research Agent | Defined | Phase A |
| `SAL-015` | Market Opportunity Agent | Defined | Phase A |
### Agent profiles
#### SAL-001 — Sales Director Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SAL-001` |
| **Agent name** | Sales Director Agent |
| **Department** | C. Sales and business development (`SAL`) |
| **Role type** | Specialist |
| **Mission** | Support sales director responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SAL-002 — Lead Qualification Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SAL-002` |
| **Agent name** | Lead Qualification Agent |
| **Department** | C. Sales and business development (`SAL`) |
| **Role type** | Specialist |
| **Mission** | Support lead qualification responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SAL-003 — Sales Follow-up Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SAL-003` |
| **Agent name** | Sales Follow-up Agent |
| **Department** | C. Sales and business development (`SAL`) |
| **Role type** | Specialist |
| **Mission** | Support sales follow-up responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SAL-004 — Non-pushy Lead Hunting Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SAL-004` |
| **Agent name** | Non-pushy Lead Hunting Agent |
| **Department** | C. Sales and business development (`SAL`) |
| **Role type** | Specialist |
| **Mission** | Support non-pushy lead hunting responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SAL-005 — Objection Handling Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SAL-005` |
| **Agent name** | Objection Handling Agent |
| **Department** | C. Sales and business development (`SAL`) |
| **Role type** | Specialist |
| **Mission** | Support objection handling responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SAL-006 — Negotiation Support Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SAL-006` |
| **Agent name** | Negotiation Support Agent |
| **Department** | C. Sales and business development (`SAL`) |
| **Role type** | Specialist |
| **Mission** | Support negotiation support responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SAL-007 — Proposal Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SAL-007` |
| **Agent name** | Proposal Agent |
| **Department** | C. Sales and business development (`SAL`) |
| **Role type** | Specialist |
| **Mission** | Support proposal responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SAL-008 — Quote Follow-up Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SAL-008` |
| **Agent name** | Quote Follow-up Agent |
| **Department** | C. Sales and business development (`SAL`) |
| **Role type** | Specialist |
| **Mission** | Support quote follow-up responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SAL-009 — Customer Retention Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SAL-009` |
| **Agent name** | Customer Retention Agent |
| **Department** | C. Sales and business development (`SAL`) |
| **Role type** | Specialist |
| **Mission** | Support customer retention responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SAL-010 — Service Agreement Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SAL-010` |
| **Agent name** | Service Agreement Agent |
| **Department** | C. Sales and business development (`SAL`) |
| **Role type** | Specialist |
| **Mission** | Support service agreement responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SAL-011 — Business Development Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SAL-011` |
| **Agent name** | Business Development Agent |
| **Department** | C. Sales and business development (`SAL`) |
| **Role type** | Specialist |
| **Mission** | Support business development responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SAL-012 — Commercial Tender Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SAL-012` |
| **Agent name** | Commercial Tender Agent |
| **Department** | C. Sales and business development (`SAL`) |
| **Role type** | Specialist |
| **Mission** | Support commercial tender responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SAL-013 — Partnership Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SAL-013` |
| **Agent name** | Partnership Agent |
| **Department** | C. Sales and business development (`SAL`) |
| **Role type** | Specialist |
| **Mission** | Support partnership responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SAL-014 — Competitor Research Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SAL-014` |
| **Agent name** | Competitor Research Agent |
| **Department** | C. Sales and business development (`SAL`) |
| **Role type** | Specialist |
| **Mission** | Support competitor research responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SAL-015 — Market Opportunity Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SAL-015` |
| **Agent name** | Market Opportunity Agent |
| **Department** | C. Sales and business development (`SAL`) |
| **Role type** | Specialist |
| **Mission** | Support market opportunity responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |

## D. Marketing and brand

**Department code:** `MKT` · **Agents:** 22
| Agent ID | Agent name | Status | Activation phase |
|----------|------------|--------|------------------|
| `MKT-001` | Chief Marketing Agent | Defined | Phase A |
| `MKT-002` | Marketing Strategy Agent | Defined | Phase A |
| `MKT-003` | Campaign Planning Agent | Defined | Phase A |
| `MKT-004` | Social Media Agent | Defined | Phase A |
| `MKT-005` | Facebook Agent | Implemented but inactive | Phase C |
| `MKT-006` | Instagram Agent | Defined | Phase A |
| `MKT-007` | TikTok Agent | Defined | Phase A |
| `MKT-008` | LinkedIn Agent | Defined | Phase A |
| `MKT-009` | YouTube Agent | Defined | Phase A |
| `MKT-010` | Google Business Profile Agent | Defined | Phase A |
| `MKT-011` | Content Writing Agent | Defined | Phase A |
| `MKT-012` | Graphic Design Agent | Defined | Phase A |
| `MKT-013` | Video Production Agent | Defined | Phase A |
| `MKT-014` | Video Quality-Control Agent | Defined | Phase A |
| `MKT-015` | Brand Compliance Agent | Defined | Phase A |
| `MKT-016` | Reputation and Reviews Agent | Defined | Phase A |
| `MKT-017` | SEO Agent | Defined | Phase A |
| `MKT-018` | Website Content Agent | Defined | Phase A |
| `MKT-019` | Email Marketing Agent | Defined | Phase A |
| `MKT-020` | Trend Hunter Agent | Defined | Phase A |
| `MKT-021` | Marketing Analytics Agent | Defined | Phase A |
| `MKT-022` | Media Library Agent | Defined | Phase A |
### Agent profiles
#### MKT-001 — Chief Marketing Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `MKT-001` |
| **Agent name** | Chief Marketing Agent |
| **Department** | D. Marketing and brand (`MKT`) |
| **Role type** | Specialist |
| **Mission** | Support chief marketing responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### MKT-002 — Marketing Strategy Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `MKT-002` |
| **Agent name** | Marketing Strategy Agent |
| **Department** | D. Marketing and brand (`MKT`) |
| **Role type** | Specialist |
| **Mission** | Support marketing strategy responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### MKT-003 — Campaign Planning Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `MKT-003` |
| **Agent name** | Campaign Planning Agent |
| **Department** | D. Marketing and brand (`MKT`) |
| **Role type** | Specialist |
| **Mission** | Support campaign planning responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### MKT-004 — Social Media Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `MKT-004` |
| **Agent name** | Social Media Agent |
| **Department** | D. Marketing and brand (`MKT`) |
| **Role type** | Specialist |
| **Mission** | Support social media responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### MKT-005 — Facebook Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `MKT-005` |
| **Agent name** | Facebook Agent |
| **Department** | D. Marketing and brand (`MKT`) |
| **Role type** | Specialist |
| **Mission** | Support facebook responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Medium |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Implemented but inactive** |
| **Activation phase** | Phase C |
| **Notes** | Facebook Business module exists; webhook subscription pending Owner deploy proof |
#### MKT-006 — Instagram Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `MKT-006` |
| **Agent name** | Instagram Agent |
| **Department** | D. Marketing and brand (`MKT`) |
| **Role type** | Specialist |
| **Mission** | Support instagram responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Medium |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### MKT-007 — TikTok Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `MKT-007` |
| **Agent name** | TikTok Agent |
| **Department** | D. Marketing and brand (`MKT`) |
| **Role type** | Specialist |
| **Mission** | Support tiktok responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### MKT-008 — LinkedIn Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `MKT-008` |
| **Agent name** | LinkedIn Agent |
| **Department** | D. Marketing and brand (`MKT`) |
| **Role type** | Specialist |
| **Mission** | Support linkedin responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### MKT-009 — YouTube Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `MKT-009` |
| **Agent name** | YouTube Agent |
| **Department** | D. Marketing and brand (`MKT`) |
| **Role type** | Specialist |
| **Mission** | Support youtube responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### MKT-010 — Google Business Profile Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `MKT-010` |
| **Agent name** | Google Business Profile Agent |
| **Department** | D. Marketing and brand (`MKT`) |
| **Role type** | Specialist |
| **Mission** | Support google business profile responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### MKT-011 — Content Writing Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `MKT-011` |
| **Agent name** | Content Writing Agent |
| **Department** | D. Marketing and brand (`MKT`) |
| **Role type** | Specialist |
| **Mission** | Support content writing responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### MKT-012 — Graphic Design Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `MKT-012` |
| **Agent name** | Graphic Design Agent |
| **Department** | D. Marketing and brand (`MKT`) |
| **Role type** | Specialist |
| **Mission** | Support graphic design responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### MKT-013 — Video Production Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `MKT-013` |
| **Agent name** | Video Production Agent |
| **Department** | D. Marketing and brand (`MKT`) |
| **Role type** | Specialist |
| **Mission** | Support video production responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### MKT-014 — Video Quality-Control Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `MKT-014` |
| **Agent name** | Video Quality-Control Agent |
| **Department** | D. Marketing and brand (`MKT`) |
| **Role type** | Specialist |
| **Mission** | Support video quality-control responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### MKT-015 — Brand Compliance Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `MKT-015` |
| **Agent name** | Brand Compliance Agent |
| **Department** | D. Marketing and brand (`MKT`) |
| **Role type** | Specialist |
| **Mission** | Support brand compliance responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### MKT-016 — Reputation and Reviews Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `MKT-016` |
| **Agent name** | Reputation and Reviews Agent |
| **Department** | D. Marketing and brand (`MKT`) |
| **Role type** | Specialist |
| **Mission** | Support reputation and reviews responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### MKT-017 — SEO Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `MKT-017` |
| **Agent name** | SEO Agent |
| **Department** | D. Marketing and brand (`MKT`) |
| **Role type** | Specialist |
| **Mission** | Support seo responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### MKT-018 — Website Content Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `MKT-018` |
| **Agent name** | Website Content Agent |
| **Department** | D. Marketing and brand (`MKT`) |
| **Role type** | Specialist |
| **Mission** | Support website content responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### MKT-019 — Email Marketing Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `MKT-019` |
| **Agent name** | Email Marketing Agent |
| **Department** | D. Marketing and brand (`MKT`) |
| **Role type** | Specialist |
| **Mission** | Support email marketing responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Medium |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### MKT-020 — Trend Hunter Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `MKT-020` |
| **Agent name** | Trend Hunter Agent |
| **Department** | D. Marketing and brand (`MKT`) |
| **Role type** | Specialist |
| **Mission** | Support trend hunter responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### MKT-021 — Marketing Analytics Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `MKT-021` |
| **Agent name** | Marketing Analytics Agent |
| **Department** | D. Marketing and brand (`MKT`) |
| **Role type** | Specialist |
| **Mission** | Support marketing analytics responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### MKT-022 — Media Library Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `MKT-022` |
| **Agent name** | Media Library Agent |
| **Department** | D. Marketing and brand (`MKT`) |
| **Role type** | Specialist |
| **Mission** | Support media library responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |

## E. Operations and service delivery

**Department code:** `OPS` · **Agents:** 17
| Agent ID | Agent name | Status | Activation phase |
|----------|------------|--------|------------------|
| `OPS-001` | Operations Manager Agent | Defined | Phase A |
| `OPS-002` | Dispatch Agent | Defined | Phase A |
| `OPS-003` | Scheduling Agent | Defined | Phase A |
| `OPS-004` | Job Coordinator Agent | Defined | Phase A |
| `OPS-005` | Technician Support Agent | Defined | Phase A |
| `OPS-006` | Job Progress Agent | Defined | Phase A |
| `OPS-007` | Job Timer Agent | Defined | Phase A |
| `OPS-008` | Route Optimisation Agent | Defined | Phase A |
| `OPS-009` | Google Maps Agent | Defined | Phase A |
| `OPS-010` | Fleet Coordination Agent | Defined | Phase A |
| `OPS-011` | Emergency Response Agent | Defined | Phase A |
| `OPS-012` | Recurring Maintenance Agent | Defined | Phase A |
| `OPS-013` | Service Agreement Operations Agent | Defined | Phase A |
| `OPS-014` | Quality Control Agent | Defined | Phase A |
| `OPS-015` | Customer ETA Agent | Defined | Phase A |
| `OPS-016` | Job Completion Agent | Defined | Phase A |
| `OPS-017` | Follow-up and Callback Agent | Defined | Phase A |
### Agent profiles
#### OPS-001 — Operations Manager Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `OPS-001` |
| **Agent name** | Operations Manager Agent |
| **Department** | E. Operations and service delivery (`OPS`) |
| **Role type** | Specialist |
| **Mission** | Support operations manager responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### OPS-002 — Dispatch Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `OPS-002` |
| **Agent name** | Dispatch Agent |
| **Department** | E. Operations and service delivery (`OPS`) |
| **Role type** | Specialist |
| **Mission** | Support dispatch responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Medium |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### OPS-003 — Scheduling Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `OPS-003` |
| **Agent name** | Scheduling Agent |
| **Department** | E. Operations and service delivery (`OPS`) |
| **Role type** | Specialist |
| **Mission** | Support scheduling responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### OPS-004 — Job Coordinator Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `OPS-004` |
| **Agent name** | Job Coordinator Agent |
| **Department** | E. Operations and service delivery (`OPS`) |
| **Role type** | Specialist |
| **Mission** | Support job coordinator responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### OPS-005 — Technician Support Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `OPS-005` |
| **Agent name** | Technician Support Agent |
| **Department** | E. Operations and service delivery (`OPS`) |
| **Role type** | Specialist |
| **Mission** | Support technician support responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### OPS-006 — Job Progress Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `OPS-006` |
| **Agent name** | Job Progress Agent |
| **Department** | E. Operations and service delivery (`OPS`) |
| **Role type** | Specialist |
| **Mission** | Support job progress responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### OPS-007 — Job Timer Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `OPS-007` |
| **Agent name** | Job Timer Agent |
| **Department** | E. Operations and service delivery (`OPS`) |
| **Role type** | Specialist |
| **Mission** | Support job timer responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### OPS-008 — Route Optimisation Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `OPS-008` |
| **Agent name** | Route Optimisation Agent |
| **Department** | E. Operations and service delivery (`OPS`) |
| **Role type** | Specialist |
| **Mission** | Support route optimisation responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### OPS-009 — Google Maps Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `OPS-009` |
| **Agent name** | Google Maps Agent |
| **Department** | E. Operations and service delivery (`OPS`) |
| **Role type** | Specialist |
| **Mission** | Support google maps responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### OPS-010 — Fleet Coordination Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `OPS-010` |
| **Agent name** | Fleet Coordination Agent |
| **Department** | E. Operations and service delivery (`OPS`) |
| **Role type** | Specialist |
| **Mission** | Support fleet coordination responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### OPS-011 — Emergency Response Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `OPS-011` |
| **Agent name** | Emergency Response Agent |
| **Department** | E. Operations and service delivery (`OPS`) |
| **Role type** | Specialist |
| **Mission** | Support emergency response responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Medium |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### OPS-012 — Recurring Maintenance Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `OPS-012` |
| **Agent name** | Recurring Maintenance Agent |
| **Department** | E. Operations and service delivery (`OPS`) |
| **Role type** | Specialist |
| **Mission** | Support recurring maintenance responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### OPS-013 — Service Agreement Operations Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `OPS-013` |
| **Agent name** | Service Agreement Operations Agent |
| **Department** | E. Operations and service delivery (`OPS`) |
| **Role type** | Specialist |
| **Mission** | Support service agreement operations responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### OPS-014 — Quality Control Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `OPS-014` |
| **Agent name** | Quality Control Agent |
| **Department** | E. Operations and service delivery (`OPS`) |
| **Role type** | Specialist |
| **Mission** | Support quality control responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### OPS-015 — Customer ETA Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `OPS-015` |
| **Agent name** | Customer ETA Agent |
| **Department** | E. Operations and service delivery (`OPS`) |
| **Role type** | Specialist |
| **Mission** | Support customer eta responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### OPS-016 — Job Completion Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `OPS-016` |
| **Agent name** | Job Completion Agent |
| **Department** | E. Operations and service delivery (`OPS`) |
| **Role type** | Specialist |
| **Mission** | Support job completion responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### OPS-017 — Follow-up and Callback Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `OPS-017` |
| **Agent name** | Follow-up and Callback Agent |
| **Department** | E. Operations and service delivery (`OPS`) |
| **Role type** | Specialist |
| **Mission** | Support follow-up and callback responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |

## F. Plumbing and industry specialists

**Department code:** `PLM` · **Agents:** 16
| Agent ID | Agent name | Status | Activation phase |
|----------|------------|--------|------------------|
| `PLM-001` | Plumbing Technical Advisor Agent | Defined | Phase A |
| `PLM-002` | SANS Compliance Agent | Defined | Phase A |
| `PLM-003` | Certificate of Compliance Agent | Defined | Phase A |
| `PLM-004` | Geyser Compliance Agent | Defined | Phase A |
| `PLM-005` | Drainage Diagnostic Agent | Defined | Phase A |
| `PLM-006` | CCTV Inspection Agent | Defined | Phase A |
| `PLM-007` | Leak Detection Agent | Defined | Phase A |
| `PLM-008` | Bathroom Renovation Agent | Defined | Phase A |
| `PLM-009` | Construction Plumbing Agent | Defined | Phase A |
| `PLM-010` | Maintenance Planner Agent | Defined | Phase A |
| `PLM-011` | Estimator Agent | Defined | Phase A |
| `PLM-012` | Quantity Surveyor Agent | Defined | Phase A |
| `PLM-013` | Floor-plan Takeoff Agent | Defined | Phase A |
| `PLM-014` | Bill of Quantities Agent | Defined | Phase A |
| `PLM-015` | Scope-of-work Agent | Defined | Phase A |
| `PLM-016` | Materials Specification Agent | Defined | Phase A |
### Agent profiles
#### PLM-001 — Plumbing Technical Advisor Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `PLM-001` |
| **Agent name** | Plumbing Technical Advisor Agent |
| **Department** | F. Plumbing and industry specialists (`PLM`) |
| **Role type** | Specialist |
| **Mission** | Support plumbing technical advisor responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### PLM-002 — SANS Compliance Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `PLM-002` |
| **Agent name** | SANS Compliance Agent |
| **Department** | F. Plumbing and industry specialists (`PLM`) |
| **Role type** | Specialist |
| **Mission** | Support sans compliance responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### PLM-003 — Certificate of Compliance Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `PLM-003` |
| **Agent name** | Certificate of Compliance Agent |
| **Department** | F. Plumbing and industry specialists (`PLM`) |
| **Role type** | Specialist |
| **Mission** | Support certificate of compliance responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### PLM-004 — Geyser Compliance Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `PLM-004` |
| **Agent name** | Geyser Compliance Agent |
| **Department** | F. Plumbing and industry specialists (`PLM`) |
| **Role type** | Specialist |
| **Mission** | Support geyser compliance responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### PLM-005 — Drainage Diagnostic Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `PLM-005` |
| **Agent name** | Drainage Diagnostic Agent |
| **Department** | F. Plumbing and industry specialists (`PLM`) |
| **Role type** | Specialist |
| **Mission** | Support drainage diagnostic responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### PLM-006 — CCTV Inspection Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `PLM-006` |
| **Agent name** | CCTV Inspection Agent |
| **Department** | F. Plumbing and industry specialists (`PLM`) |
| **Role type** | Specialist |
| **Mission** | Support cctv inspection responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### PLM-007 — Leak Detection Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `PLM-007` |
| **Agent name** | Leak Detection Agent |
| **Department** | F. Plumbing and industry specialists (`PLM`) |
| **Role type** | Specialist |
| **Mission** | Support leak detection responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### PLM-008 — Bathroom Renovation Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `PLM-008` |
| **Agent name** | Bathroom Renovation Agent |
| **Department** | F. Plumbing and industry specialists (`PLM`) |
| **Role type** | Specialist |
| **Mission** | Support bathroom renovation responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### PLM-009 — Construction Plumbing Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `PLM-009` |
| **Agent name** | Construction Plumbing Agent |
| **Department** | F. Plumbing and industry specialists (`PLM`) |
| **Role type** | Specialist |
| **Mission** | Support construction plumbing responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### PLM-010 — Maintenance Planner Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `PLM-010` |
| **Agent name** | Maintenance Planner Agent |
| **Department** | F. Plumbing and industry specialists (`PLM`) |
| **Role type** | Specialist |
| **Mission** | Support maintenance planner responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### PLM-011 — Estimator Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `PLM-011` |
| **Agent name** | Estimator Agent |
| **Department** | F. Plumbing and industry specialists (`PLM`) |
| **Role type** | Specialist |
| **Mission** | Support estimator responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### PLM-012 — Quantity Surveyor Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `PLM-012` |
| **Agent name** | Quantity Surveyor Agent |
| **Department** | F. Plumbing and industry specialists (`PLM`) |
| **Role type** | Specialist |
| **Mission** | Support quantity surveyor responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### PLM-013 — Floor-plan Takeoff Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `PLM-013` |
| **Agent name** | Floor-plan Takeoff Agent |
| **Department** | F. Plumbing and industry specialists (`PLM`) |
| **Role type** | Specialist |
| **Mission** | Support floor-plan takeoff responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### PLM-014 — Bill of Quantities Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `PLM-014` |
| **Agent name** | Bill of Quantities Agent |
| **Department** | F. Plumbing and industry specialists (`PLM`) |
| **Role type** | Specialist |
| **Mission** | Support bill of quantities responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### PLM-015 — Scope-of-work Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `PLM-015` |
| **Agent name** | Scope-of-work Agent |
| **Department** | F. Plumbing and industry specialists (`PLM`) |
| **Role type** | Specialist |
| **Mission** | Support scope-of-work responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### PLM-016 — Materials Specification Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `PLM-016` |
| **Agent name** | Materials Specification Agent |
| **Department** | F. Plumbing and industry specialists (`PLM`) |
| **Role type** | Specialist |
| **Mission** | Support materials specification responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |

## G. Inventory, procurement and suppliers

**Department code:** `INV` · **Agents:** 11
| Agent ID | Agent name | Status | Activation phase |
|----------|------------|--------|------------------|
| `INV-001` | Inventory Controller Agent | Defined | Phase A |
| `INV-002` | Warehouse Agent | Defined | Phase A |
| `INV-003` | Tool Tracking Agent | Defined | Phase A |
| `INV-004` | Procurement Agent | Defined | Phase A |
| `INV-005` | Supplier Management Agent | Defined | Phase A |
| `INV-006` | Purchase Order Agent | Defined | Phase A |
| `INV-007` | Supplier Price Hunting Agent | Defined | Phase A |
| `INV-008` | Market Price Analyst Agent | Defined | Phase A |
| `INV-009` | Material Availability Agent | Defined | Phase A |
| `INV-010` | Supplier Performance Agent | Defined | Phase A |
| `INV-011` | Stock Usage Audit Agent | Defined | Phase A |
### Agent profiles
#### INV-001 — Inventory Controller Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `INV-001` |
| **Agent name** | Inventory Controller Agent |
| **Department** | G. Inventory, procurement and suppliers (`INV`) |
| **Role type** | Specialist |
| **Mission** | Support inventory controller responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### INV-002 — Warehouse Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `INV-002` |
| **Agent name** | Warehouse Agent |
| **Department** | G. Inventory, procurement and suppliers (`INV`) |
| **Role type** | Specialist |
| **Mission** | Support warehouse responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### INV-003 — Tool Tracking Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `INV-003` |
| **Agent name** | Tool Tracking Agent |
| **Department** | G. Inventory, procurement and suppliers (`INV`) |
| **Role type** | Specialist |
| **Mission** | Support tool tracking responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### INV-004 — Procurement Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `INV-004` |
| **Agent name** | Procurement Agent |
| **Department** | G. Inventory, procurement and suppliers (`INV`) |
| **Role type** | Specialist |
| **Mission** | Support procurement responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### INV-005 — Supplier Management Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `INV-005` |
| **Agent name** | Supplier Management Agent |
| **Department** | G. Inventory, procurement and suppliers (`INV`) |
| **Role type** | Specialist |
| **Mission** | Support supplier management responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### INV-006 — Purchase Order Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `INV-006` |
| **Agent name** | Purchase Order Agent |
| **Department** | G. Inventory, procurement and suppliers (`INV`) |
| **Role type** | Specialist |
| **Mission** | Support purchase order responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### INV-007 — Supplier Price Hunting Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `INV-007` |
| **Agent name** | Supplier Price Hunting Agent |
| **Department** | G. Inventory, procurement and suppliers (`INV`) |
| **Role type** | Specialist |
| **Mission** | Support supplier price hunting responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### INV-008 — Market Price Analyst Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `INV-008` |
| **Agent name** | Market Price Analyst Agent |
| **Department** | G. Inventory, procurement and suppliers (`INV`) |
| **Role type** | Specialist |
| **Mission** | Support market price analyst responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### INV-009 — Material Availability Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `INV-009` |
| **Agent name** | Material Availability Agent |
| **Department** | G. Inventory, procurement and suppliers (`INV`) |
| **Role type** | Specialist |
| **Mission** | Support material availability responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### INV-010 — Supplier Performance Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `INV-010` |
| **Agent name** | Supplier Performance Agent |
| **Department** | G. Inventory, procurement and suppliers (`INV`) |
| **Role type** | Specialist |
| **Mission** | Support supplier performance responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### INV-011 — Stock Usage Audit Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `INV-011` |
| **Agent name** | Stock Usage Audit Agent |
| **Department** | G. Inventory, procurement and suppliers (`INV`) |
| **Role type** | Specialist |
| **Mission** | Support stock usage audit responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |

## H. Customer service and communications

**Department code:** `COM` · **Agents:** 13
| Agent ID | Agent name | Status | Activation phase |
|----------|------------|--------|------------------|
| `COM-001` | Customer Support Agent | Defined | Phase A |
| `COM-002` | WhatsApp Agent | Build-ready | Phase D |
| `COM-003` | Email Agent | Defined | Phase A |
| `COM-004` | Gmail Organisation Agent | Defined | Phase A |
| `COM-005` | SMS Agent | Defined | Phase A |
| `COM-006` | AI Receptionist Agent | Build-ready | Phase D |
| `COM-007` | Calling Agent | Defined | Phase A |
| `COM-008` | Booking Agent | Defined | Phase A |
| `COM-009` | Complaint Resolution Agent | Defined | Phase A |
| `COM-010` | Customer Satisfaction Agent | Defined | Phase A |
| `COM-011` | Review Request Agent | Defined | Phase A |
| `COM-012` | Client Portal Support Agent | Defined | Phase A |
| `COM-013` | Unified Communications Agent | Defined | Phase A |
### Agent profiles
#### COM-001 — Customer Support Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `COM-001` |
| **Agent name** | Customer Support Agent |
| **Department** | H. Customer service and communications (`COM`) |
| **Role type** | Specialist |
| **Mission** | Support customer support responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### COM-002 — WhatsApp Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `COM-002` |
| **Agent name** | WhatsApp Agent |
| **Department** | H. Customer service and communications (`COM`) |
| **Role type** | Specialist |
| **Mission** | Support whatsapp responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Medium |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Build-ready** |
| **Activation phase** | Phase D |
| **Notes** | WhatsApp module partial; webhook infrastructure exists |
#### COM-003 — Email Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `COM-003` |
| **Agent name** | Email Agent |
| **Department** | H. Customer service and communications (`COM`) |
| **Role type** | Specialist |
| **Mission** | Support email responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Medium |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### COM-004 — Gmail Organisation Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `COM-004` |
| **Agent name** | Gmail Organisation Agent |
| **Department** | H. Customer service and communications (`COM`) |
| **Role type** | Specialist |
| **Mission** | Support gmail organisation responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### COM-005 — SMS Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `COM-005` |
| **Agent name** | SMS Agent |
| **Department** | H. Customer service and communications (`COM`) |
| **Role type** | Specialist |
| **Mission** | Support sms responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Medium |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### COM-006 — AI Receptionist Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `COM-006` |
| **Agent name** | AI Receptionist Agent |
| **Department** | H. Customer service and communications (`COM`) |
| **Role type** | Specialist |
| **Mission** | Support ai receptionist responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Build-ready** |
| **Activation phase** | Phase D |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### COM-007 — Calling Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `COM-007` |
| **Agent name** | Calling Agent |
| **Department** | H. Customer service and communications (`COM`) |
| **Role type** | Specialist |
| **Mission** | Support calling responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Medium |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### COM-008 — Booking Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `COM-008` |
| **Agent name** | Booking Agent |
| **Department** | H. Customer service and communications (`COM`) |
| **Role type** | Specialist |
| **Mission** | Support booking responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### COM-009 — Complaint Resolution Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `COM-009` |
| **Agent name** | Complaint Resolution Agent |
| **Department** | H. Customer service and communications (`COM`) |
| **Role type** | Specialist |
| **Mission** | Support complaint resolution responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### COM-010 — Customer Satisfaction Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `COM-010` |
| **Agent name** | Customer Satisfaction Agent |
| **Department** | H. Customer service and communications (`COM`) |
| **Role type** | Specialist |
| **Mission** | Support customer satisfaction responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### COM-011 — Review Request Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `COM-011` |
| **Agent name** | Review Request Agent |
| **Department** | H. Customer service and communications (`COM`) |
| **Role type** | Specialist |
| **Mission** | Support review request responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### COM-012 — Client Portal Support Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `COM-012` |
| **Agent name** | Client Portal Support Agent |
| **Department** | H. Customer service and communications (`COM`) |
| **Role type** | Specialist |
| **Mission** | Support client portal support responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### COM-013 — Unified Communications Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `COM-013` |
| **Agent name** | Unified Communications Agent |
| **Department** | H. Customer service and communications (`COM`) |
| **Role type** | Specialist |
| **Mission** | Support unified communications responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-002; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |

## I. People, HR, legal and compliance

**Department code:** `HRL` · **Agents:** 16
| Agent ID | Agent name | Status | Activation phase |
|----------|------------|--------|------------------|
| `HRL-001` | HR Manager Agent | Defined | Phase A |
| `HRL-002` | Recruitment Agent | Defined | Phase A |
| `HRL-003` | Candidate Screening Agent | Defined | Phase A |
| `HRL-004` | Onboarding Agent | Defined | Phase A |
| `HRL-005` | Training Agent | Defined | Phase A |
| `HRL-006` | Timesheet Agent | Defined | Phase A |
| `HRL-007` | Overtime Agent | Defined | Phase A |
| `HRL-008` | Performance Management Agent | Defined | Phase A |
| `HRL-009` | Staff Scheduling Agent | Defined | Phase A |
| `HRL-010` | Labour Compliance Agent | Defined | Phase A |
| `HRL-011` | Legal Support Agent | Defined | Phase A |
| `HRL-012` | Contract Agent | Defined | Phase A |
| `HRL-013` | POPIA and Privacy Agent | Defined | Phase A |
| `HRL-014` | Health and Safety Agent | Defined | Phase A |
| `HRL-015` | Policy Agent | Defined | Phase A |
| `HRL-016` | Disciplinary Process Support Agent | Defined | Phase A |
### Agent profiles
#### HRL-001 — HR Manager Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `HRL-001` |
| **Agent name** | HR Manager Agent |
| **Department** | I. People, HR, legal and compliance (`HRL`) |
| **Role type** | Specialist |
| **Mission** | Support hr manager responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### HRL-002 — Recruitment Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `HRL-002` |
| **Agent name** | Recruitment Agent |
| **Department** | I. People, HR, legal and compliance (`HRL`) |
| **Role type** | Specialist |
| **Mission** | Support recruitment responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### HRL-003 — Candidate Screening Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `HRL-003` |
| **Agent name** | Candidate Screening Agent |
| **Department** | I. People, HR, legal and compliance (`HRL`) |
| **Role type** | Specialist |
| **Mission** | Support candidate screening responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### HRL-004 — Onboarding Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `HRL-004` |
| **Agent name** | Onboarding Agent |
| **Department** | I. People, HR, legal and compliance (`HRL`) |
| **Role type** | Specialist |
| **Mission** | Support onboarding responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### HRL-005 — Training Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `HRL-005` |
| **Agent name** | Training Agent |
| **Department** | I. People, HR, legal and compliance (`HRL`) |
| **Role type** | Specialist |
| **Mission** | Support training responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### HRL-006 — Timesheet Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `HRL-006` |
| **Agent name** | Timesheet Agent |
| **Department** | I. People, HR, legal and compliance (`HRL`) |
| **Role type** | Specialist |
| **Mission** | Support timesheet responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### HRL-007 — Overtime Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `HRL-007` |
| **Agent name** | Overtime Agent |
| **Department** | I. People, HR, legal and compliance (`HRL`) |
| **Role type** | Specialist |
| **Mission** | Support overtime responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### HRL-008 — Performance Management Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `HRL-008` |
| **Agent name** | Performance Management Agent |
| **Department** | I. People, HR, legal and compliance (`HRL`) |
| **Role type** | Specialist |
| **Mission** | Support performance management responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### HRL-009 — Staff Scheduling Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `HRL-009` |
| **Agent name** | Staff Scheduling Agent |
| **Department** | I. People, HR, legal and compliance (`HRL`) |
| **Role type** | Specialist |
| **Mission** | Support staff scheduling responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### HRL-010 — Labour Compliance Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `HRL-010` |
| **Agent name** | Labour Compliance Agent |
| **Department** | I. People, HR, legal and compliance (`HRL`) |
| **Role type** | Specialist |
| **Mission** | Support labour compliance responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### HRL-011 — Legal Support Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `HRL-011` |
| **Agent name** | Legal Support Agent |
| **Department** | I. People, HR, legal and compliance (`HRL`) |
| **Role type** | Specialist |
| **Mission** | Support legal support responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | High |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### HRL-012 — Contract Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `HRL-012` |
| **Agent name** | Contract Agent |
| **Department** | I. People, HR, legal and compliance (`HRL`) |
| **Role type** | Specialist |
| **Mission** | Support contract responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | High |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### HRL-013 — POPIA and Privacy Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `HRL-013` |
| **Agent name** | POPIA and Privacy Agent |
| **Department** | I. People, HR, legal and compliance (`HRL`) |
| **Role type** | Specialist |
| **Mission** | Support popia and privacy responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | High |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### HRL-014 — Health and Safety Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `HRL-014` |
| **Agent name** | Health and Safety Agent |
| **Department** | I. People, HR, legal and compliance (`HRL`) |
| **Role type** | Specialist |
| **Mission** | Support health and safety responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### HRL-015 — Policy Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `HRL-015` |
| **Agent name** | Policy Agent |
| **Department** | I. People, HR, legal and compliance (`HRL`) |
| **Role type** | Specialist |
| **Mission** | Support policy responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### HRL-016 — Disciplinary Process Support Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `HRL-016` |
| **Agent name** | Disciplinary Process Support Agent |
| **Department** | I. People, HR, legal and compliance (`HRL`) |
| **Role type** | Specialist |
| **Mission** | Support disciplinary process support responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | High |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |

## J. Product, software, data and infrastructure

**Department code:** `SWD` · **Agents:** 20
| Agent ID | Agent name | Status | Activation phase |
|----------|------------|--------|------------------|
| `SWD-001` | Product Manager Agent | Defined | Phase A |
| `SWD-002` | Project Manager Agent | Defined | Phase A |
| `SWD-003` | Software Architecture Agent | Defined | Phase A |
| `SWD-004` | Backend Development Agent | Defined | Phase A |
| `SWD-005` | Frontend Development Agent | Defined | Phase A |
| `SWD-006` | Mobile Development Agent | Defined | Phase A |
| `SWD-007` | Database Agent | Defined | Phase A |
| `SWD-008` | Integration Agent | Defined | Phase A |
| `SWD-009` | API Agent | Defined | Phase A |
| `SWD-010` | DevOps Agent | Defined | Phase A |
| `SWD-011` | Release Agent | Defined | Phase A |
| `SWD-012` | QA Agent | Defined | Phase A |
| `SWD-013` | Security Agent | Defined | Phase A |
| `SWD-014` | Incident Response Agent | Defined | Phase A |
| `SWD-015` | System Health Agent | Defined | Phase A |
| `SWD-016` | Performance Agent | Defined | Phase A |
| `SWD-017` | Data Quality Agent | Defined | Phase A |
| `SWD-018` | Data Migration Agent | Defined | Phase A |
| `SWD-019` | Documentation Agent | Defined | Phase A |
| `SWD-020` | Technical Support Agent | Defined | Phase A |
### Agent profiles
#### SWD-001 — Product Manager Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SWD-001` |
| **Agent name** | Product Manager Agent |
| **Department** | J. Product, software, data and infrastructure (`SWD`) |
| **Role type** | Specialist |
| **Mission** | Support product manager responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-004; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SWD-002 — Project Manager Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SWD-002` |
| **Agent name** | Project Manager Agent |
| **Department** | J. Product, software, data and infrastructure (`SWD`) |
| **Role type** | Specialist |
| **Mission** | Support project manager responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-004; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SWD-003 — Software Architecture Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SWD-003` |
| **Agent name** | Software Architecture Agent |
| **Department** | J. Product, software, data and infrastructure (`SWD`) |
| **Role type** | Specialist |
| **Mission** | Support software architecture responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-004; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SWD-004 — Backend Development Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SWD-004` |
| **Agent name** | Backend Development Agent |
| **Department** | J. Product, software, data and infrastructure (`SWD`) |
| **Role type** | Specialist |
| **Mission** | Support backend development responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-004; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SWD-005 — Frontend Development Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SWD-005` |
| **Agent name** | Frontend Development Agent |
| **Department** | J. Product, software, data and infrastructure (`SWD`) |
| **Role type** | Specialist |
| **Mission** | Support frontend development responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-004; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SWD-006 — Mobile Development Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SWD-006` |
| **Agent name** | Mobile Development Agent |
| **Department** | J. Product, software, data and infrastructure (`SWD`) |
| **Role type** | Specialist |
| **Mission** | Support mobile development responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-004; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SWD-007 — Database Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SWD-007` |
| **Agent name** | Database Agent |
| **Department** | J. Product, software, data and infrastructure (`SWD`) |
| **Role type** | Specialist |
| **Mission** | Support database responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-004; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SWD-008 — Integration Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SWD-008` |
| **Agent name** | Integration Agent |
| **Department** | J. Product, software, data and infrastructure (`SWD`) |
| **Role type** | Specialist |
| **Mission** | Support integration responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-004; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Medium |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SWD-009 — API Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SWD-009` |
| **Agent name** | API Agent |
| **Department** | J. Product, software, data and infrastructure (`SWD`) |
| **Role type** | Specialist |
| **Mission** | Support api responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-004; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Medium |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SWD-010 — DevOps Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SWD-010` |
| **Agent name** | DevOps Agent |
| **Department** | J. Product, software, data and infrastructure (`SWD`) |
| **Role type** | Specialist |
| **Mission** | Support devops responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-004; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Medium |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SWD-011 — Release Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SWD-011` |
| **Agent name** | Release Agent |
| **Department** | J. Product, software, data and infrastructure (`SWD`) |
| **Role type** | Specialist |
| **Mission** | Support release responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-004; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Medium |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SWD-012 — QA Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SWD-012` |
| **Agent name** | QA Agent |
| **Department** | J. Product, software, data and infrastructure (`SWD`) |
| **Role type** | Specialist |
| **Mission** | Support qa responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-004; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SWD-013 — Security Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SWD-013` |
| **Agent name** | Security Agent |
| **Department** | J. Product, software, data and infrastructure (`SWD`) |
| **Role type** | Specialist |
| **Mission** | Support security responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-004; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | High |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SWD-014 — Incident Response Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SWD-014` |
| **Agent name** | Incident Response Agent |
| **Department** | J. Product, software, data and infrastructure (`SWD`) |
| **Role type** | Specialist |
| **Mission** | Support incident response responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-004; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SWD-015 — System Health Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SWD-015` |
| **Agent name** | System Health Agent |
| **Department** | J. Product, software, data and infrastructure (`SWD`) |
| **Role type** | Specialist |
| **Mission** | Support system health responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-004; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SWD-016 — Performance Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SWD-016` |
| **Agent name** | Performance Agent |
| **Department** | J. Product, software, data and infrastructure (`SWD`) |
| **Role type** | Specialist |
| **Mission** | Support performance responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-004; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SWD-017 — Data Quality Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SWD-017` |
| **Agent name** | Data Quality Agent |
| **Department** | J. Product, software, data and infrastructure (`SWD`) |
| **Role type** | Specialist |
| **Mission** | Support data quality responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-004; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SWD-018 — Data Migration Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SWD-018` |
| **Agent name** | Data Migration Agent |
| **Department** | J. Product, software, data and infrastructure (`SWD`) |
| **Role type** | Specialist |
| **Mission** | Support data migration responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-004; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Medium |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SWD-019 — Documentation Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SWD-019` |
| **Agent name** | Documentation Agent |
| **Department** | J. Product, software, data and infrastructure (`SWD`) |
| **Role type** | Specialist |
| **Mission** | Support documentation responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-004; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### SWD-020 — Technical Support Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `SWD-020` |
| **Agent name** | Technical Support Agent |
| **Department** | J. Product, software, data and infrastructure (`SWD`) |
| **Role type** | Specialist |
| **Mission** | Support technical support responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-004; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |

## K. Permanent TITAN Audit Department

**Department code:** `AUD` · **Agents:** 14
| Agent ID | Agent name | Status | Activation phase |
|----------|------------|--------|------------------|
| `AUD-001` | Chief Audit Agent | Defined | Phase A |
| `AUD-002` | Application Auditor | Defined | Phase A |
| `AUD-003` | Browser and User-Journey Auditor | Defined | Phase A |
| `AUD-004` | Role and Permission Auditor | Defined | Phase A |
| `AUD-005` | Tenant-Isolation Auditor | Defined | Phase A |
| `AUD-006` | Financial Data Auditor | Defined | Phase A |
| `AUD-007` | Integration Auditor | Defined | Phase A |
| `AUD-008` | Mobile and Responsive Auditor | Defined | Phase A |
| `AUD-009` | Accessibility Auditor | Defined | Phase A |
| `AUD-010` | Security and Privacy Auditor | Defined | Phase A |
| `AUD-011` | Data Quality Auditor | Defined | Phase A |
| `AUD-012` | Document and Compliance Auditor | Defined | Phase A |
| `AUD-013` | Performance and Reliability Auditor | Defined | Phase A |
| `AUD-014` | Acceptance Register Reconciliation Agent | Defined | Phase A |
### Agent profiles
#### AUD-001 — Chief Audit Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `AUD-001` |
| **Agent name** | Chief Audit Agent |
| **Department** | K. Permanent TITAN Audit Department (`AUD`) |
| **Role type** | Specialist |
| **Mission** | Support chief audit responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### AUD-002 — Application Auditor

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `AUD-002` |
| **Agent name** | Application Auditor |
| **Department** | K. Permanent TITAN Audit Department (`AUD`) |
| **Role type** | Specialist |
| **Mission** | Support application auditor responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### AUD-003 — Browser and User-Journey Auditor

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `AUD-003` |
| **Agent name** | Browser and User-Journey Auditor |
| **Department** | K. Permanent TITAN Audit Department (`AUD`) |
| **Role type** | Specialist |
| **Mission** | Support browser and user-journey auditor responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### AUD-004 — Role and Permission Auditor

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `AUD-004` |
| **Agent name** | Role and Permission Auditor |
| **Department** | K. Permanent TITAN Audit Department (`AUD`) |
| **Role type** | Specialist |
| **Mission** | Support role and permission auditor responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### AUD-005 — Tenant-Isolation Auditor

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `AUD-005` |
| **Agent name** | Tenant-Isolation Auditor |
| **Department** | K. Permanent TITAN Audit Department (`AUD`) |
| **Role type** | Specialist |
| **Mission** | Support tenant-isolation auditor responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### AUD-006 — Financial Data Auditor

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `AUD-006` |
| **Agent name** | Financial Data Auditor |
| **Department** | K. Permanent TITAN Audit Department (`AUD`) |
| **Role type** | Specialist |
| **Mission** | Support financial data auditor responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### AUD-007 — Integration Auditor

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `AUD-007` |
| **Agent name** | Integration Auditor |
| **Department** | K. Permanent TITAN Audit Department (`AUD`) |
| **Role type** | Specialist |
| **Mission** | Support integration auditor responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Medium |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### AUD-008 — Mobile and Responsive Auditor

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `AUD-008` |
| **Agent name** | Mobile and Responsive Auditor |
| **Department** | K. Permanent TITAN Audit Department (`AUD`) |
| **Role type** | Specialist |
| **Mission** | Support mobile and responsive auditor responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### AUD-009 — Accessibility Auditor

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `AUD-009` |
| **Agent name** | Accessibility Auditor |
| **Department** | K. Permanent TITAN Audit Department (`AUD`) |
| **Role type** | Specialist |
| **Mission** | Support accessibility auditor responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### AUD-010 — Security and Privacy Auditor

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `AUD-010` |
| **Agent name** | Security and Privacy Auditor |
| **Department** | K. Permanent TITAN Audit Department (`AUD`) |
| **Role type** | Specialist |
| **Mission** | Support security and privacy auditor responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | High |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### AUD-011 — Data Quality Auditor

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `AUD-011` |
| **Agent name** | Data Quality Auditor |
| **Department** | K. Permanent TITAN Audit Department (`AUD`) |
| **Role type** | Specialist |
| **Mission** | Support data quality auditor responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### AUD-012 — Document and Compliance Auditor

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `AUD-012` |
| **Agent name** | Document and Compliance Auditor |
| **Department** | K. Permanent TITAN Audit Department (`AUD`) |
| **Role type** | Specialist |
| **Mission** | Support document and compliance auditor responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### AUD-013 — Performance and Reliability Auditor

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `AUD-013` |
| **Agent name** | Performance and Reliability Auditor |
| **Department** | K. Permanent TITAN Audit Department (`AUD`) |
| **Role type** | Specialist |
| **Mission** | Support performance and reliability auditor responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### AUD-014 — Acceptance Register Reconciliation Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `AUD-014` |
| **Agent name** | Acceptance Register Reconciliation Agent |
| **Department** | K. Permanent TITAN Audit Department (`AUD`) |
| **Role type** | Specialist |
| **Mission** | Support acceptance register reconciliation responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |

## L. Research and intelligence

**Department code:** `RSH` · **Agents:** 10
| Agent ID | Agent name | Status | Activation phase |
|----------|------------|--------|------------------|
| `RSH-001` | Market Research Agent | Defined | Phase A |
| `RSH-002` | Competitor Intelligence Agent | Defined | Phase A |
| `RSH-003` | Industry Trend Agent | Defined | Phase A |
| `RSH-004` | Technology Research Agent | Defined | Phase A |
| `RSH-005` | Supplier Intelligence Agent | Defined | Phase A |
| `RSH-006` | Regulatory Research Agent | Defined | Phase A |
| `RSH-007` | Customer Behaviour Agent | Defined | Phase A |
| `RSH-008` | Location and Expansion Agent | Defined | Phase A |
| `RSH-009` | SaaS Opportunity Agent | Defined | Phase A |
| `RSH-010` | Multi-industry Research Agent | Defined | Phase A |
### Agent profiles
#### RSH-001 — Market Research Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `RSH-001` |
| **Agent name** | Market Research Agent |
| **Department** | L. Research and intelligence (`RSH`) |
| **Role type** | Specialist |
| **Mission** | Support market research responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-006; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### RSH-002 — Competitor Intelligence Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `RSH-002` |
| **Agent name** | Competitor Intelligence Agent |
| **Department** | L. Research and intelligence (`RSH`) |
| **Role type** | Specialist |
| **Mission** | Support competitor intelligence responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-006; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### RSH-003 — Industry Trend Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `RSH-003` |
| **Agent name** | Industry Trend Agent |
| **Department** | L. Research and intelligence (`RSH`) |
| **Role type** | Specialist |
| **Mission** | Support industry trend responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-006; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### RSH-004 — Technology Research Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `RSH-004` |
| **Agent name** | Technology Research Agent |
| **Department** | L. Research and intelligence (`RSH`) |
| **Role type** | Specialist |
| **Mission** | Support technology research responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-006; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### RSH-005 — Supplier Intelligence Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `RSH-005` |
| **Agent name** | Supplier Intelligence Agent |
| **Department** | L. Research and intelligence (`RSH`) |
| **Role type** | Specialist |
| **Mission** | Support supplier intelligence responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-006; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### RSH-006 — Regulatory Research Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `RSH-006` |
| **Agent name** | Regulatory Research Agent |
| **Department** | L. Research and intelligence (`RSH`) |
| **Role type** | Specialist |
| **Mission** | Support regulatory research responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-006; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### RSH-007 — Customer Behaviour Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `RSH-007` |
| **Agent name** | Customer Behaviour Agent |
| **Department** | L. Research and intelligence (`RSH`) |
| **Role type** | Specialist |
| **Mission** | Support customer behaviour responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-006; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### RSH-008 — Location and Expansion Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `RSH-008` |
| **Agent name** | Location and Expansion Agent |
| **Department** | L. Research and intelligence (`RSH`) |
| **Role type** | Specialist |
| **Mission** | Support location and expansion responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-006; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### RSH-009 — SaaS Opportunity Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `RSH-009` |
| **Agent name** | SaaS Opportunity Agent |
| **Department** | L. Research and intelligence (`RSH`) |
| **Role type** | Specialist |
| **Mission** | Support saas opportunity responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-006; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### RSH-010 — Multi-industry Research Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `RSH-010` |
| **Agent name** | Multi-industry Research Agent |
| **Department** | L. Research and intelligence (`RSH`) |
| **Role type** | Specialist |
| **Mission** | Support multi-industry research responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | EXEC-006; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |

## M. Controlled learning and improvement

**Department code:** `LRN` · **Agents:** 8
| Agent ID | Agent name | Status | Activation phase |
|----------|------------|--------|------------------|
| `LRN-001` | Agent Performance Evaluator | Defined | Phase A |
| `LRN-002` | Prompt and Instruction Optimisation Agent | Defined | Phase A |
| `LRN-003` | Workflow Improvement Agent | Defined | Phase A |
| `LRN-004` | Knowledge Curator Agent | Defined | Phase A |
| `LRN-005` | Model Evaluation Agent | Defined | Phase A |
| `LRN-006` | Controlled Experiment Agent | Defined | Phase A |
| `LRN-007` | Regression Detection Agent | Defined | Phase A |
| `LRN-008` | Rollback Coordinator Agent | Defined | Phase A |
### Agent profiles
#### LRN-001 — Agent Performance Evaluator

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `LRN-001` |
| **Agent name** | Agent Performance Evaluator |
| **Department** | M. Controlled learning and improvement (`LRN`) |
| **Role type** | Specialist |
| **Mission** | Support agent performance evaluator responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### LRN-002 — Prompt and Instruction Optimisation Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `LRN-002` |
| **Agent name** | Prompt and Instruction Optimisation Agent |
| **Department** | M. Controlled learning and improvement (`LRN`) |
| **Role type** | Specialist |
| **Mission** | Support prompt and instruction optimisation responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### LRN-003 — Workflow Improvement Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `LRN-003` |
| **Agent name** | Workflow Improvement Agent |
| **Department** | M. Controlled learning and improvement (`LRN`) |
| **Role type** | Specialist |
| **Mission** | Support workflow improvement responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### LRN-004 — Knowledge Curator Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `LRN-004` |
| **Agent name** | Knowledge Curator Agent |
| **Department** | M. Controlled learning and improvement (`LRN`) |
| **Role type** | Specialist |
| **Mission** | Support knowledge curator responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### LRN-005 — Model Evaluation Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `LRN-005` |
| **Agent name** | Model Evaluation Agent |
| **Department** | M. Controlled learning and improvement (`LRN`) |
| **Role type** | Specialist |
| **Mission** | Support model evaluation responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### LRN-006 — Controlled Experiment Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `LRN-006` |
| **Agent name** | Controlled Experiment Agent |
| **Department** | M. Controlled learning and improvement (`LRN`) |
| **Role type** | Specialist |
| **Mission** | Support controlled experiment responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### LRN-007 — Regression Detection Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `LRN-007` |
| **Agent name** | Regression Detection Agent |
| **Department** | M. Controlled learning and improvement (`LRN`) |
| **Role type** | Specialist |
| **Mission** | Support regression detection responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |
#### LRN-008 — Rollback Coordinator Agent

| Field | Value |
|-------|-------|
| **Stable Agent ID** | `LRN-008` |
| **Agent name** | Rollback Coordinator Agent |
| **Department** | M. Controlled learning and improvement (`LRN`) |
| **Role type** | Specialist |
| **Mission** | Support rollback coordinator responsibilities for the tenant with draft-first, approval-gated outputs. |
| **Owner or supervising agent** | AURA-001; AURA-001 coordinates |
| **Primary inputs** | Tenant-scoped operational data, policies, integration read models |
| **Primary outputs** | Drafts, recommendations, monitored alerts — execution only via approval gates |
| **Required modules** | See [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md) |
| **Required integrations** | Per capability matrix; none mandatory until activation phase |
| **Permitted tools** | Read and draft tools only until phase gate permits execute |
| **Data it may read** | Tenant `companyId`-scoped tables permitted by RBAC |
| **Data it may write** | Draft records, agent audit events — no silent production writes |
| **Forbidden data/actions** | Cross-tenant data; secrets; silent external sends; unapproved financial/legal changes |
| **Tenant-isolation requirements** | Mandatory single-tenant scope; no cross-tenant inference |
| **Required approval gates** | Draft → Approve → Execute for all external or financial effects |
| **Human escalation conditions** | High-risk, ambiguous, or policy-bound requests → Owner or qualified human |
| **Learning allowance** | Controlled per [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) |
| **Risk rating** | Low |
| **Audit evidence required** | Agent action log, approval record, integration receipt where applicable |
| **Dependencies** | Phase gate, RBAC, relevant integration Connected state |
| **Current implementation status** | **Defined** |
| **Activation phase** | Phase A |
| **Notes** | Specialist role registered; no autonomous execution without activation gate. |

---

## Register maintenance

- **Append-only IDs:** Never reuse a retired Agent ID.
- **Status changes:** Require evidence link (commit, test, staging proof) in acceptance register.
- **Contradictions:** Reconcile wording with historical evidence; do not delete audit history.

**Document control:** AGENT-001 · Total registered roles: **191** · No fixed maximum.
