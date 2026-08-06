# TITAN Agent Activation Roadmap

**Document ID:** AGENT-004  
**Document type:** Permanent activation plan — documentation only (no activation performed by this document)  
**Generated (UTC):** 2026-08-06  
**Register:** [TITAN_MASTER_AGENT_REGISTER.md](./TITAN_MASTER_AGENT_REGISTER.md) (191 minimum roles; extensible)  
**Governance:** [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md)  
**Capability matrix:** [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md)  

---

## Rules

- **No agent is activated by this document alone.** Activation requires tools, RBAC, tests, audit wiring, and Owner approval per phase gate.
- Phases are sequential gates; parallel preparation within a phase is allowed when dependencies are met.
- **Do not invent milestone numbers** beyond Phase A–F defined here.
- Facebook J-6.7F14 **deployed to staging** — connected, verified, webhooks feed+mention confirmed; genuine live Page event pending (Meta app unpublished); **not production-complete**
- **XERO-002 remains parked** — Xero execution agents stay **Planned** until Owner reopens

---

## Young Guns Plumbing priorities

Activation order reflects real operational value:

1. Finance and Xero truth  
2. Cashflow and profitability  
3. Leads and follow-up  
4. Scheduling and dispatch  
5. Job completion  
6. Customer communications  
7. Recurring maintenance  
8. Fleet and job timing  
9. Documents and compliance  
10. Inventory, warehouse and tools  
11. Marketing with Owner approval  
12. Audit and system health  

---

## Phase A — Foundation and governance

| Item | Deliverable |
|------|-------------|
| Register | AGENT-001 master register approved by Owner |
| Matrix | AGENT-002 capability matrix maintained |
| Governance | AGENT-003 learning standard adopted |
| Integration standard | INT-UNIVERSAL-001 in integration register |
| Tool registry audit | Map agent tools → executable handlers |
| RBAC per agent class | Owner / Admin / Office / Technician boundaries |
| Audit schema | Agent action + approval + learning version events |

**Entry criteria:** Documentation complete; no false **Active** statuses.

**Required integrations:** None for client execution.

**Required RBAC:** Existing TITAN role matrix documented.

**Required audit proof:** Acceptance register rows AGENT-001–004, INT-UNIVERSAL-001.

**Required test coverage:** RBAC and tenant-isolation suites remain green.

**Owner approval point:** Owner approves register and governance standard.

**Rollback criteria:** Pause LRN activations; revert to prior register version in git.

**Exit criteria:** Owner sign-off on Phase A; AUD-001..014 remain **Defined** but framework approved.

---

## Phase B — Read-only insight agents

| Priority agents | Register IDs |
|---------------|--------------|
| AURA coordinator | AURA-001 |
| Executive / business health | EXEC-001, EXEC-007, EXEC-008, EXEC-009 |
| Financial read models | FIN-004, FIN-006, FIN-009 |
| Ops visibility | OPS-001, OPS-005, OPS-006 |
| CRM pipeline read | SAL-002, SAL-003 |
| System health | SWD-015, AUD-013 |

**Entry criteria:** Phase A exit; staging API reachable.

**Required integrations:** Connected read-only where applicable (Xero read, Cartrack read).

**Required RBAC:** Owner + Admin read paths verified.

**Required audit proof:** Read actions logged.

**Required test coverage:** Agent read tool unit tests; tenant isolation.

**Owner approval point:** Enable **Shadow mode** for listed agents.

**Rollback criteria:** Set agents to **Paused**; disable tool keys.

**Exit criteria:** Owner receives accurate read-only briefings from live tenant data.

---

## Phase C — Draft and recommendation agents

| Priority agents | Register IDs |
|---------------|--------------|
| Quote / proposal drafts | SAL-007, PLM-011, PLM-014 |
| Marketing content drafts | MKT-011, MKT-005 (Facebook — draft only) |
| Schedule recommendations | OPS-003, OPS-002 |
| Cashflow recommendations | FIN-006, FIN-009 |
| Customer reply drafts | COM-001, COM-002 |

**Entry criteria:** Phase B exit; Draft → Approve → Execute pattern wired.

**Required integrations:** Facebook Connected (staging); WhatsApp Partial read.

**Required RBAC:** Office Staff draft; Owner approve.

**Required audit proof:** Draft ID + approver ID on every outbound path.

**Required test coverage:** Draft-only tests; no Execute without approval mock.

**Owner approval point:** Promote agents from Shadow to Supervised.

**Rollback criteria:** Revert to Shadow; purge pending drafts if policy requires.

**Exit criteria:** Owner approves quality of drafts in supervised review UI.

---

## Phase D — Supervised operational agents

| Priority agents | Register IDs |
|---------------|--------------|
| Dispatch and scheduling execute | OPS-002, OPS-003, OPS-004 |
| Job completion chain | OPS-016, OPS-017 |
| AR follow-up (no legal threat) | FIN-016, SAL-008 |
| WhatsApp supervised replies | COM-002, COM-006 |
| Inventory PO draft-to-approved | INV-006, INV-005 |
| Recurring maintenance | OPS-012, OPS-013 |

**Entry criteria:** Phase C exit; integration Connected states truthful.

**Required integrations:** Xero read (execute remains gated); Cartrack; Calendar; Maps.

**Required RBAC:** Per capability matrix Execute rows.

**Required audit proof:** Execute receipts stored; rollback tested on one workflow.

**Required test coverage:** End-to-end supervised Execute tests on staging.

**Owner approval point:** Owner enables **Supervised** per agent.

**Rollback criteria:** Kill switch → **Paused**; manual completion of in-flight jobs.

**Exit criteria:** One full operational day supervised without unauthorised Execute.

---

## Phase E — Controlled execution agents

| Priority agents | Register IDs |
|---------------|--------------|
| Owner-approved Facebook publish | MKT-005 |
| Approved invoice push (Xero) | FIN-014 — **blocked until XERO-002 reopened** |
| Yoco reconciliation assist | FIN-015 |
| Review requests post-job | COM-011 |
| AUD continuous reconciliation | AUD-014 |

**Entry criteria:** Phase D exit; Provider integrations **Connected** with evidence.

**Required integrations:** Facebook publish + webhook proof; Xero when un-parked; Yoco.

**Required RBAC:** Owner L2 approval on all Execute.

**Required audit proof:** Provider receipt + approval record immutable.

**Required test coverage:** Execute integration tests; regression suite.

**Owner approval point:** Per-agent **Active** promotion.

**Rollback criteria:** Pause agent; provider disconnect if required; financial reversal manual.

**Exit criteria:** Owner confirms value outweighs risk for each Active agent.

---

## Phase F — Multi-industry and SaaS expansion

| Scope | Description |
|-------|-------------|
| Industry packs | Additional PLM/SWD agents per vertical |
| SaaS tenants | Tenant-isolated agent packs; no cross-tenant learning |
| Partner integrations | New providers via INT-UNIVERSAL-001 wizard only |
| Research expansion | RSH agents for new markets |

**Entry criteria:** Phase E stable on Young Guns for 30 days (Owner-defined).

**Required integrations:** Platform-managed provider onboarding.

**Required RBAC:** Multi-tenant isolation proofs.

**Required audit proof:** Cross-tenant denial matrix green.

**Required test coverage:** Tenant pack regression suite.

**Owner approval point:** Owner approves SaaS agent catalogue append.

**Rollback criteria:** Disable tenant pack; retain register IDs as **Paused**.

**Exit criteria:** Second tenant pilot with supervised agents only.

---

## Phase gate template (all phases)

| Field | Required content |
|-------|------------------|
| Entry criteria | Prior phase exit + dependencies |
| Required integrations | Truthful Connected states from integration register |
| Required RBAC | Role matrix rows affected |
| Required audit proof | Event types and sample records |
| Required test coverage | Suites and pass threshold |
| Owner approval point | Named Owner action |
| Rollback criteria | Pause/kill/revert procedure |
| Exit criteria | Measurable outcome |

---

## Current state (@ 2026-08-06)

| Phase | Status |
|-------|--------|
| Phase A | **Documentation complete — pending Owner approval** |
| Phase B–F | **Not started** |

| Agent status (register) | Count |
|-------------------------|------:|
| Supervised | 1 (AURA-001) |
| Implemented but inactive | 1 (MKT-005 Facebook) |
| Build-ready | 2 |
| Defined / Planned | remainder |
| **Active** | **0** |

---

## Cross-links

- [TITAN_MASTER_ACCEPTANCE_REGISTER.md](./TITAN_MASTER_ACCEPTANCE_REGISTER.md) — AGENT-001–004 acceptance rows  
- [TITAN_GAP_CLOSURE_PLAN.md](./TITAN_GAP_CLOSURE_PLAN.md) — workforce gap closure  
- [TITAN_INTEGRATION_REGISTER.md](./TITAN_INTEGRATION_REGISTER.md) — provider truth  

**Document control:** AGENT-004 · No activation performed without Owner gate.
