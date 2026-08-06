# TITAN AURA-FIRST-001 — AI Companion Standard

**Status:** RECORD ONLY — **permanent product rule**  
**Recorded (UTC):** 2026-08-06  
**Active blocker:** XERO-002 Gate sequence remains active — **do not implement during Xero proof**

---

## Purpose

Establish the permanent TITAN product rule: **every major business module must have an associated AURA specialist capability** that operates behind the single AURA user interface.

AURA remains the **only user-facing AI interface**. Specialist agents operate behind AURA — no separate disconnected chat interfaces per agent.

---

## Permanent product rule

Every major business module must have an AURA specialist that:

1. Understands the module's **authorised data** only
2. Explains current status in plain language
3. Identifies risks with evidence
4. Identifies opportunities with evidence
5. Recommends the next best action
6. Drafts work for human review
7. Tracks approved actions through execution
8. Measures outcomes against expectations
9. Learns **only** from approved and sufficiently complete evidence

---

## Required operating model

```
Observe
  → Analyse
  → Explain
  → Recommend
  → Draft
  → Human Review
  → Human Approval
  → Execute
  → Measure
  → Learn
```

**AI must never silently change operational or financial truth.**

---

## AURA routing architecture

| Layer | Role |
|-------|------|
| **AURA-001** | Single Owner-facing conversation and audit trail |
| **Specialist agents** | Module-scoped analysis, drafts, and recommendations |
| **Routing** | AURA routes Owner requests to relevant specialist while preserving one conversation |

Do **not** create separate disconnected chat interfaces for every agent.

---

## AI Companion requirement (checklist gate)

Every major TITAN milestone must identify:

| Field | Description |
|-------|-------------|
| Primary business module | Module being delivered |
| Associated AURA specialist | Agent ID from register |
| Data sources | Authorised read paths only |
| Permitted analysis | What the specialist may infer |
| Permitted draft actions | What may be drafted for review |
| Prohibited autonomous actions | What must never auto-execute |
| Approval requirements | Who must approve before execute |
| Confidence requirements | Minimum confidence for recommendations |
| Audit requirements | What must be logged |
| Learning rules | When learning is permitted |
| Fallback when data missing | Honest incomplete-data behaviour |
| Permitted user roles | RBAC for intelligence access |

### Module completion gate

No major module may be marked **fully complete** unless:

- Its AURA companion is **defined** in [TITAN_AURA_MODULE_COMPANION_MATRIX.md](./TITAN_AURA_MODULE_COMPANION_MATRIX.md)
- Its permissions are defined
- Its recommendations cite real TITAN evidence
- Its actions follow **Draft → Review → Approve → Execute**
- Its AI behaviour has been tested
- Its role restrictions have been tested

Where AI adds no genuine value, record:

> **AI companion not required — reason documented.**

Do **not** add AI merely for appearance.

---

## Master checklist integration

The master completion checklist adds an **AI Companion** column (see [TITAN_MASTER_COMPLETION_CHECKLIST.md](./TITAN_MASTER_COMPLETION_CHECKLIST.md)):

- New and major milestones must populate the field
- Existing rows backfill via the Module Companion Matrix
- Value: agent ID · `NOT REQUIRED (reason)` · `PENDING`

---

## Cross-links

| Document | Purpose |
|----------|---------|
| [TITAN_AURA_MODULE_COMPANION_MATRIX.md](./TITAN_AURA_MODULE_COMPANION_MATRIX.md) | Module ↔ specialist mapping |
| [TITAN_AURA_GROWTH_PLANNER_SPECIFICATION.md](./TITAN_AURA_GROWTH_PLANNER_SPECIFICATION.md) | AURA-GROWTH-001 capability |
| [TITAN_MASTER_AGENT_REGISTER.md](./TITAN_MASTER_AGENT_REGISTER.md) | Agent IDs and departments |
| [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) | Learning governance |
| [TITAN_AI_AGENT_ARCHITECTURE.md](./TITAN_AI_AGENT_ARCHITECTURE.md) | Agent architecture rules |
| [TITAN_OWNER_COMMAND_CENTER_AURA_COACH_SPECIFICATION.md](./TITAN_OWNER_COMMAND_CENTER_AURA_COACH_SPECIFICATION.md) | OCC-001 AURA integration |

---

## Implementation gate

| Gate | Rule |
|------|------|
| During XERO-002 | Documentation and matrix only — no orchestration code |
| Production | `rshuiaghmtrvvilhqpwm` forbidden until explicit Owner GO |

---

*Permanent product rule — record only. No code, schema, or provider data modified.*
