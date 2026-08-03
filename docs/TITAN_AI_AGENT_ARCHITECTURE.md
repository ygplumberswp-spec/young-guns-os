# TITAN AI Agent Architecture & Final Acceptance Checklist

**Status: authoritative standard — recorded, not yet audited.**
This document records the architecture rules and the Final Acceptance Audit standard for TITAN's AI agents. It does **not** run the audit, and it does **not** claim any agent is complete. No implementation work is authorised by this document.

---

## 1. Purpose

This is the authoritative reference for:

- the intended scope of TITAN's AI agents (the Owner's planned **77 agents**),
- the architecture rules every agent must obey,
- the **Final Acceptance Audit** classification system and the evidence required before any agent may be called complete,
- the rule that **V1.0 may not be declared fully aligned** while any agent remains PARTIALLY IMPLEMENTED or MISSING without explicit Owner approval.

It exists so that agent completeness is judged against a written standard and real evidence, never against a page name, a nav entry, or a placeholder screen.

---

## 2. Agent list — PENDING OWNER PASTE

> **The complete 77-agent list is NOT recorded yet. It must be pasted by the Owner, exactly, before the Final Acceptance Audit can run.**

The authoritative list of 77 planned agents does not exist in any material currently available in this repository or in the Owner's local working materials. It was **not invented, inferred, or reconstructed** here, because an invented list would produce a false acceptance standard — the exact failure mode this document is meant to prevent.

### 2.1 Where the list was searched for (all negative)

| Location searched | Result |
| --- | --- |
| `docs/` in this repository (`ARCHITECTURE.md`, `MILESTONES.md`, `TITAN_PROGRESS.md`, voice/UX standards) | No agent catalogue; no reference to 77 |
| Repository root reports (`TITAN_AURA_AGENT_COLLABORATION_AUDIT.md`, `TITAN_COMPLETE_APP_AUDIT.md`, `TITAN_MASTER_COMPLETION_REPORT.md`, and other `TITAN_*.md`) | Agent discussion, but no numbered 77-agent catalogue |
| `TITAN_AURA_Departments_12_to_21_Master_Prompts.md` | Departments 12–21 only; no agent catalogue |
| `TITAN_AURA_Remaining_Phases_Master_Prompts.md` (and `(1)` / `(2)` variants) | Phases 2–9 only; no agent catalogue |
| `TITAN_100_PERCENT_COMPLETION_MASTER_DIRECTIVE.md` (and `(1)` variant) | No agent catalogue |
| `TITAN_FINAL_SCOPE_FREEZE.md` (and `(1)` / `(2)` / `(3)` variants) | No agent catalogue |
| Sibling working copies (`Titan-Aura-V1-roadmap-ship`, `Titan-Aura-Consolidation`, `Titan-Aura-CAL-001`, `Titan-Aura-Leads-UI`, `Titan-Aura-UX-F`, `Titan-Aura-UX-Hardening`, `Titan-Aura-Visual-Polish`, `Titan-Aura-Xero-Hotfix`) | No agent catalogue |
| Earlier source dumps (`titan-os-source/attached_assets/*`, `titan-plumbing-os`) | Build prompts only; no agent catalogue |
| Shared agent modules (`packages/shared/src/agents.ts`, `aura-agent-network.ts`, `aura-command-centre.ts`, `agent-orchestration.ts`, `agent-runtime.ts`) | Real registries of 48 / 11 / 10 entries — **not** the 77-agent list |
| Prior chat transcripts for this project | Only the unfilled placeholder `[PASTE THE COMPLETE 77-AGENT LIST HERE EXACTLY]` |

### 2.2 Required Owner action

The Owner must paste the complete, exact list of 77 agents — numbered `1`–`77`, with the intended name of each agent — so it can be recorded verbatim in this section. Until then:

- the Final Acceptance Audit **cannot** be started,
- no statement about "all 77 agents" may be made in any report,
- no agent may be created, renamed, or duplicated to fit a guessed name.

### 2.3 Existing agent inventory (reference baseline only — NOT the 77)

Recorded here as factual evidence of what exists today, so that the eventual audit can map the Owner's 77 onto real code rather than guessing. **This is not a substitute for the Owner's list and must not be treated as it.**

`AGENT_REGISTRY` in `packages/shared/src/agents.ts` currently defines **48** agent entries:

| # | Key | Name |
| --- | --- | --- |
| 1 | `executive` | Executive Command Agent |
| 2 | `operations` | Operations Agent |
| 3 | `finance` | Finance Controller Agent |
| 4 | `recruiting` | Workforce Intelligence Agent |
| 5 | `sales` | Sales Agent |
| 6 | `marketing` | Marketing Agent |
| 7 | `lead_generation` | Lead Generation Agent |
| 8 | `voice_receptionist` | Voice Receptionist Agent |
| 9 | `customer_support` | Customer Support Agent |
| 10 | `procurement` | Procurement Intelligence Agent |
| 11 | `security` | AURA Security Agent |
| 12 | `integration` | AURA Integration Agent |
| 13 | `business_intelligence` | AURA Business Intelligence Agent |
| 14 | `automation` | AURA Automation Agent |
| 15 | `decision_intelligence` | AURA Decision Intelligence Agent |
| 16 | `knowledge` | AURA Knowledge Agent |
| 17 | `executive_operations` | AURA Executive Operations Agent |
| 18 | `evolution` | AURA Evolution Agent |
| 19 | `developer` | AURA Developer Agent |
| 20 | `saas` | AURA SaaS Agent |
| 21 | `production_operations` | AURA Production Operations Agent |
| 22 | `mobile_field` | AURA Mobile Agent |
| 23 | `communications` | AURA Communications Agent |
| 24 | `customer_experience` | AURA Customer Experience Agent |
| 25 | `asset_intelligence` | AURA Asset Intelligence Agent |
| 26 | `workforce_intelligence` | AURA Workforce Intelligence Agent |
| 27 | `legal_compliance` | AURA Legal & Compliance Agent |
| 28 | `financial_planning` | AURA Financial Planning Agent |
| 29 | `sales_intelligence` | AURA Sales Intelligence Agent |
| 30 | `marketing_intelligence` | AURA Marketing Intelligence Agent |
| 31 | `service_delivery` | AURA Service Delivery Agent |
| 32 | `it_operations` | AURA IT Operations Agent |
| 33 | `business_evolution` | AURA Business Evolution Agent |
| 34 | `app_builder` | AURA App Builder Agent |
| 35 | `industry_intelligence` | AURA Industry Intelligence Agent |
| 36 | `developer_platform` | AURA Developer Platform Agent |
| 37 | `saas_management` | AURA SaaS Management Agent |
| 38 | `voice_reception` | AURA Voice Reception Agent |
| 39 | `document_intelligence` | AURA Document Intelligence Agent |
| 40 | `business_continuity` | AURA Business Continuity Agent |
| 41 | `search_intelligence` | AURA Search Intelligence Agent |
| 42 | `migration_intelligence` | AURA Migration Intelligence Agent |
| 43 | `notification_intelligence` | AURA Notification Intelligence Agent |
| 44 | `platform_health` | AURA Platform Health Agent |
| 45 | `launch_readiness` | AURA Launch Readiness Agent |
| 46 | `release_candidate` | AURA Release Candidate Agent |
| 47 | `production_launch` | AURA Production Launch Agent |
| 48 | `release_manager` | AURA Release Manager Agent |

Two narrower coordination registries also exist and must not be confused with the catalogue above:

- `AURA_COMMAND_AGENT_KEYS` (`packages/shared/src/aura-command-centre.ts`) — 10 command-centre keys: `finance`, `operations`, `marketing`, `sales`, `hr`, `inventory`, `customer_support`, `compliance`, `fleet`, `market_intelligence`, each mapped to an existing `AGENT_REGISTRY` key where one exists.
- `AURA_NETWORK_AGENT_KEYS` (`packages/shared/src/aura-agent-network.ts`) — 11 agent-to-agent coordination keys (the 10 above plus `executive`).

Registry presence proves **registration only**. It is not evidence of implementation, and on its own it can never justify an IMPLEMENTED classification.

---

## 3. Architecture rules (Owner-mandated)

These rules are binding on every agent, every department, and every future audit.

1. **AURA Orchestrator is the master AI.** All agent behaviour is coordinated through AURA orchestration; specialist agents do not become independent parallel products.
2. **The Owner interacts primarily through one AURA Chat and one voice interface.** A single conversational surface is the intended entry point to agent capability.
3. **Specialist agents work behind the scenes.** They are invoked by orchestration, not browsed to as destinations.
4. **Do not add 77 top-level navigation items.** Navigation stays consolidated. Agent count must never drive nav count.
5. **Intelligence appears inside the relevant business module.** Finance intelligence lives in Finance, fleet intelligence in Fleet, and so on — not in a parallel tree of "Intelligence" pages.
6. **Do not create duplicate services merely to match a name.** A new service is justified by missing responsibility, never by naming symmetry with the Owner's list.
7. **Existing equivalents may satisfy a planned agent** where evidence shows the full responsibility is genuinely covered. This is recorded as IMPLEMENTED BY EQUIVALENT, with the equivalence stated explicitly and the evidence attached.
8. **Preserve RBAC, tenant isolation, audit logging, and approval workflows.** No agent may weaken, bypass, or shortcut them; voice and chat entry points are never an RBAC bypass.
9. **Risky actions are approval-gated.** Money movement, payroll, bank actions, deletions, campaign publishing, bulk communications, permission changes, and important cancellations require explicit Owner approval. Agents propose; they do not autonomously execute.
10. **No invented business data and no false success claims.** Missing data is reported as unavailable with a rationale — never coerced to zero, never estimated silently. Success is reported only when the underlying service confirms it.

---

## 4. Final Acceptance Audit — classification system

Every agent in the Owner's 77-agent list is assigned exactly one classification.

| Classification | Meaning |
| --- | --- |
| **IMPLEMENTED** | The agent's full responsibility exists, is reachable by the intended user, is backed by real data, and is proven by tests and commits. |
| **IMPLEMENTED BY EQUIVALENT** | An existing service/module fully covers the responsibility under a different name. The equivalence is stated and evidenced; nothing is duplicated to match the name. |
| **PARTIALLY IMPLEMENTED** | Some responsibility exists; a specific, named gap remains. |
| **MISSING** | No real implementation exists. Registry entries, placeholder pages, and nav labels do not change this. |
| **INTENTIONALLY DEFERRED BY OWNER** | Out of scope for this release by explicit Owner decision, which must be recorded with the deferral reason. |

### 4.1 Evidence required for every classification

No classification may be recorded without all of the following. "Not applicable" is acceptable only with a stated reason.

1. **Agent number and name** exactly as written in the Owner's 77-agent list.
2. **Existing service / module** that fulfils it (or the nearest candidate, when PARTIAL or MISSING).
3. **Exact files** — real repository paths (service, routes, shared contracts, schema, UI page, API client).
4. **Routes** — API endpoints and the user-facing route(s).
5. **Database support** — tables and migration numbers backing the capability.
6. **User-facing workflow** — how a real user actually reaches and uses it, end to end.
7. **Permissions** — required permissions/roles, plus the RBAC and tenant-isolation behaviour proven.
8. **Tests** — the test files and cases that prove the behaviour, including denial and honest-unavailable paths.
9. **Commit evidence** — the commit hash(es) that delivered it.
10. **Remaining gap** — the precise outstanding work, mandatory for PARTIALLY IMPLEMENTED and MISSING.

### 4.2 Audit integrity rules

- **A page name is not evidence.** Neither is a nav label, a route that renders a placeholder, a registry key, a type definition, or a service that returns unavailable for every field.
- **No agent may be marked complete on the strength of naming alone.** The user-facing workflow and the tests must exist.
- **Real data only.** An agent operating on invented or demo business data is not IMPLEMENTED.
- **Approval gating is part of correctness.** An agent that can execute a risky action without Owner approval is not IMPLEMENTED, regardless of feature completeness.
- **V1.0 may not be declared fully aligned** while any agent is PARTIALLY IMPLEMENTED or MISSING, unless the Owner has explicitly approved that state — recorded per agent as INTENTIONALLY DEFERRED BY OWNER.
- **Uncertainty is reported, not resolved by assumption.** If evidence is ambiguous, the agent is PARTIALLY IMPLEMENTED with the ambiguity named.

---

## 5. Status

- **This document:** recorded. It is the standard, and it is binding on future audits.
- **The 77-agent list:** **not recorded — pending Owner paste** (see section 2).
- **The Final Acceptance Audit:** **not started.** Running it is deliberately later work and requires the Owner's exact list first.
- **Implementation impact of this commit:** none. No agent was created, renamed, rebuilt, or duplicated; no department was started; no service, route, schema, or navigation entry was changed.

### Next step (blocked on Owner)

The Owner pastes the exact numbered 77-agent list. It is then recorded verbatim in section 2, replacing the pending notice. Only after that may the Final Acceptance Audit be scheduled as its own separately scoped, evidence-driven pass.
