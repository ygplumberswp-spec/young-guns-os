# TITAN Agent Learning and Governance Standard

**Document type:** Permanent governance standard — documentation only  
**Generated (UTC):** 2026-08-06  
**Applies to:** All 307 agents in [TITAN_MASTER_AGENT_REGISTER.md](./TITAN_MASTER_AGENT_REGISTER.md)  

---

## Principle

All TITAN agents must support **controlled continuous learning**. Learning is never silent, never cross-tenant, and never bypasses Owner approval for material changes.

---

## Locked learning lifecycle

```
Observe → analyse → propose improvement → test → Owner approval → activate → monitor → rollback if necessary
```

| Stage | Requirement |
|-------|-------------|
| **Observe** | Capture tenant-scoped events, outcomes, corrections |
| **Analyse** | Pattern detection within allowed data only |
| **Propose improvement** | Versioned proposal with diff, rationale, risk |
| **Test** | Automated + sandbox validation before activation |
| **Owner approval** | Explicit Owner (or delegated policy) sign-off |
| **Activate** | Versioned memory/policy update with audit record |
| **Monitor** | KPIs tracked post-activation |
| **Rollback** | One-click revert to prior version |

---

## Approved learning sources

Agents may learn from:

- Completed jobs and actual job duration
- Materials used and inventory movements
- Estimate-versus-actual results
- Quote acceptance and rejection reasons
- Customer feedback (tenant-scoped, consented)
- Approved Owner corrections
- Approved company policies and SOPs
- Approved pricebooks
- Provider outcomes (OAuth, sync, delivery receipts)
- Campaign performance (when integrations permit)
- System incidents and post-mortems
- Verified audit findings

---

## Forbidden silent actions

Agents must **never** silently:

- Change prices or margin rules
- Modify permissions or RBAC
- Alter legal or financial policies
- Send customer communications
- Publish content to external channels
- Deploy code or infrastructure
- Apply database migrations
- Delete records
- Train or infer across tenant boundaries
- Expose confidential information (PII, credentials, cross-tenant data)

---

## Learning properties (required)

| Property | Rule |
|----------|------|
| **Tenant-isolated** | All learning artifacts scoped to `companyId` |
| **Versioned** | Immutable version history with semantic labels |
| **Auditable** | Who approved, when, what changed, rollback pointer |
| **Reversible** | Owner may rollback any activated learning version |
| **Measurable** | KPI delta recorded before/after activation |
| **Owner-controlled** | No auto-activation of material policy changes |

---

## Memory rules

| Memory type | Default TTL | Notes |
|-------------|-------------|-------|
| Session context | End of session | No PII in prompts beyond job need |
| Job outcome memory | 24 months | Tenant-scoped |
| Owner correction memory | Permanent until rollback | Highest trust weight |
| Pricebook learning | Versioned with pricebook | Never override approved pricebook without approval |
| Cross-agent shared memory | Via AURA orchestration only | No direct agent-to-agent secret sharing |

---

## Human professional sign-off

| Domain | AI may | Human must |
|--------|--------|------------|
| Finance / tax | Analyse, prepare drafts, reconcile suggestions | Statutory sign-off, filing, payment execution |
| Legal | Draft, summarise, flag risks | Regulated legal advice and contract execution |
| HR / employment | Draft policies, schedule training | Disciplinary decisions, terminations |
| Safety | Incident analysis, checklist drafts | Regulatory notifications, OHS sign-off |
| Publishing | Draft content, schedule proposals | Approve customer-facing publish |

---

## Finance-specific disclaimer (locked)

> AI may analyse, prepare, reconcile and advise, but formal statutory or regulated sign-off must be completed by a properly qualified human where required.

---

## QS-specific disclaimer (locked)

> Never invent measurements from unreadable plans. If scale cannot be verified, agent must request Owner input or site survey (QS-010).

---

## Code-changing agents

Software agents (SW-*) follow an extended lifecycle:

```
Detect → investigate → isolated branch/worktree → implement → test → preview
  → Owner approval → staging → production approval → rollback
```

Production modification without approval path is **forbidden**.

---

## Audit requirements for learning events

Every learning activation logs:

- `agentId`, `companyId`, `userId` (approver)
- `proposalVersion`, `activatedVersion`
- `kpiBaseline`, `kpiTarget`
- `rollbackVersionId`
- Timestamp and correlation ID

Retention: minimum 7 years for finance-affecting learning; 2 years for operational learning unless Owner extends.

---

## Related documents

- [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md)
- [TITAN_AUDIT_DEPARTMENT_AND_TOOLING_STANDARD.md](./TITAN_AUDIT_DEPARTMENT_AND_TOOLING_STANDARD.md)
- [TITAN_AGENT_ACTIVATION_ROADMAP.md](./TITAN_AGENT_ACTIVATION_ROADMAP.md)
