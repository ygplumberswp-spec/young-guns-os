# TITAN Agent Learning and Governance Standard

**Document ID:** AGENT-003  
**Document type:** Permanent governance standard — documentation only  
**Generated (UTC):** 2026-08-06  
**Applies to:** All agents in [TITAN_MASTER_AGENT_REGISTER.md](./TITAN_MASTER_AGENT_REGISTER.md)  
**Capability matrix:** [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md)  
**Activation:** [TITAN_AGENT_ACTIVATION_ROADMAP.md](./TITAN_AGENT_ACTIVATION_ROADMAP.md)  

---

## Principle

TITAN agents may improve over time only through **controlled self-learning**. Learning is never silent, never cross-tenant, and never bypasses Owner approval for material changes.

AURA coordinates specialists but does not override governance rules defined here.

---

## Locked learning lifecycle

```
Observe → Analyse → Propose → Test in isolation → Human or policy approval → Activate → Monitor → Roll back when necessary
```

| Stage | Requirement |
|-------|-------------|
| **Observe** | Capture tenant-scoped events, outcomes, human corrections |
| **Analyse** | Pattern detection within allowed data only |
| **Propose** | Versioned proposal with diff, rationale, risk class |
| **Test in isolation** | Sandbox / shadow mode — no production side effects |
| **Human or policy approval** | Owner or delegated policy sign-off recorded |
| **Activate** | Versioned memory or policy update with audit record |
| **Monitor** | KPIs and regression checks post-activation |
| **Roll back when necessary** | Revert to prior version on regression or Owner command |

---

## Forbidden silent actions

Agents must **never** silently:

| Category | Forbidden silent action |
|----------|------------------------|
| Engineering | Change production code |
| Commercial | Change pricing or margins |
| Policy | Change financial, legal, or compliance policy |
| Security | Change permissions or roles |
| Marketing | Publish social content |
| Communications | Send external messages (email, SMS, WhatsApp, social DM) |
| Finance | Create payments or move money |
| Finance | Reconcile transactions without evidence |
| Data | Delete records |
| Platform | Run database migrations |
| Tenancy | Access another tenant's data |
| Learning | Train or infer across tenant boundaries |
| Integrations | Activate a new provider connection |
| Legal | Change compliance wording without human review |

---

## Approval levels

| Level | Approver | Examples |
|-------|----------|----------|
| **L0 — Informational** | None | Read, Monitor, internal summaries |
| **L1 — Staff draft** | Office Staff or above | Internal schedule drafts, CRM notes |
| **L2 — Owner approval** | Company Owner | Publish, payment, integration connect, policy change |
| **L3 — Professional sign-off** | Qualified human | Tax submission, statutory CoC, legal contract execution |

Agents may reach **L0–L1** autonomously only when explicitly **Active** and listed in the capability matrix. **L2+** always requires human action.

---

## Risk classes

| Class | Description | Default mode |
|-------|-------------|--------------|
| **Low** | Read, summarise, internal draft | Shadow or Supervised |
| **Medium** | Customer-facing drafts, scheduling proposals | Supervised |
| **High** | Finance, legal, publish, payments, permissions | Supervised — Execute forbidden without L2+ |
| **Critical** | Cross-tenant, security, migration, provider activation | Forbidden without platform admin + Owner |

Every agent in the register carries a **Risk rating** aligned to this table.

---

## Sandboxed testing and shadow mode

| Mode | Behaviour |
|------|-----------|
| **Shadow mode** | Agent observes and produces drafts; no Execute path wired |
| **Sandbox** | Isolated test tenant or fixture dataset; no production writes |
| **Supervised** | Production reads; Execute requires per-action approval |
| **Active** | Policy-bound automation with monitoring and kill switch |

Promotion: Shadow → Supervised → Active requires roadmap phase exit criteria and Owner approval.

---

## Evaluation, regression, and rollback

| Control | Requirement |
|---------|-------------|
| **Evaluation datasets** | Tenant-scoped, redacted, versioned |
| **Regression checks** | Automated tests before learning activation |
| **Model/version recording** | Model ID, prompt version, activation timestamp in audit log |
| **Prompt/version recording** | Immutable prompt hash stored with each agent action |
| **Human override** | Owner may override any agent output before Execute |
| **Kill switch** | Owner can Pause any agent immediately |
| **Rollback procedure** | One-click revert to prior learning/policy version |

LRN department agents (see register § M) maintain this infrastructure.

---

## Cross-tenant learning prohibition

- All learning artifacts scoped to `companyId`
- No federated training across tenants
- No use of Tenant A outcomes to advise Tenant B
- Platform-wide improvements use **aggregated, anonymised** metrics only — never raw tenant payloads

---

## Personal data and POPIA

| Rule | Implementation |
|------|----------------|
| **Minimisation** | Agents read minimum fields required for task |
| **Purpose limitation** | Data used only for stated agent mission |
| **Retention** | Learning artifacts TTL-defined; deletable on Owner request |
| **Redaction** | PII stripped from logs and evaluation sets where possible |
| **Escalation** | POPIA/privacy conflicts → HRL-013 POPIA Agent + human |

---

## Financial and legal escalation

| Trigger | Escalate to |
|---------|-------------|
| Tax, VAT, statutory accounts | FIN + qualified accountant human |
| Contract execution | HRL-012 Contract Agent draft → human sign |
| Debt collection tone / legal threat | FIN-016 + human |
| Compliance wording change | HRL + AUD Document Auditor |

---

## Agent conflict resolution

When two agents produce conflicting recommendations:

1. AURA presents both with evidence citations  
2. Higher **Risk rating** agent does not override lower — human decides  
3. AUD agents may flag conflict without executing either recommendation  
4. Owner decision recorded in audit log  

---

## Recommendation vs execution separation

| Layer | Responsibility |
|-------|----------------|
| **Recommendation** | Propose, Draft — any agent in Shadow/Supervised |
| **Execution** | Separate tool path; requires Approve gate and audit entry |
| **AURA** | May assemble recommendations; must not bypass Execute gates |

---

## Audit logging (required events)

- Agent ID, user ID, tenant ID, timestamp  
- Action verb (Read/Propose/Draft/Approve/Execute/Monitor/Rollback)  
- Input hash (not raw secrets)  
- Output reference or draft ID  
- Approval record ID when Execute  
- Model and prompt version  
- Integration receipt ID when provider involved  

---

## Universal Integration Rule (client-facing)

All client-facing provider integrations must follow:

```
Connect → Official provider login → Choose business/account → Choose Page/profile/resource → TITAN verifies → Secure server-side save → Connected
```

Clients must never be required to open developer dashboards, paste API keys, configure webhooks, or understand OAuth scopes. Platform administration completes technical provider setup before client use.

Full standard: [TITAN_INTEGRATION_REGISTER.md](./TITAN_INTEGRATION_REGISTER.md) § INT-UNIVERSAL-001.

**Facebook lesson (2026-08-06):** Two-day Facebook setup proved developer-level configuration is unacceptable for normal customer onboarding. TITAN must hide infrastructure behind a reusable integration wizard and platform-managed provider configuration.

---

## Governance maintenance

- Any new **Execute** capability requires update to AGENT-002 matrix and Owner approval  
- Learning activation requires LRN department regression sign-off  
- Documentation existence does not imply governance is wired in runtime  

**Document control:** AGENT-003 · Binding on all current and future register agents.
