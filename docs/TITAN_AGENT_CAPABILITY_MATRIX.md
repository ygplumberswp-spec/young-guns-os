# TITAN Agent Capability Matrix

**Document ID:** AGENT-002  
**Document type:** Permanent capability schema — documentation only  
**Generated (UTC):** 2026-08-06  
**Parent register:** [TITAN_MASTER_AGENT_REGISTER.md](./TITAN_MASTER_AGENT_REGISTER.md) (191 minimum roles; extensible)  
**Governance:** [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md)  
**Activation:** [TITAN_AGENT_ACTIVATION_ROADMAP.md](./TITAN_AGENT_ACTIVATION_ROADMAP.md)  

---

## Purpose

This matrix maps TITAN specialist agents to platform modules and integrations. It defines **what each capability class means** and enforces **Draft → Approve → Execute** for every execution-capable role.

**Owner visibility:** The Owner retains unrestricted visibility across all tenant data and agent actions permitted by RBAC.

---

## Capability verbs (standard)

| Verb | Meaning |
|------|---------|
| **Read** | View tenant-scoped data within RBAC |
| **Propose** | Suggest an action or change (no side effects) |
| **Draft** | Create a draft record or outbound content pending approval |
| **Approve** | Human or policy gate records approval (Owner/Admin where required) |
| **Execute** | Perform provider or database write after approval |
| **Monitor** | Observe events, KPIs, alerts — no writes |
| **Rollback** | Revert a prior executed change where technically supported |
| **Forbidden** | Must never be attempted by the agent |

**Execution rule:** No agent may **Execute** without passing **Draft → Approve → Execute**, except **Monitor** and **Read** operations explicitly listed.

---

## RBAC boundaries (consistent with TITAN)

| Role | Agent interaction boundary |
|------|---------------------------|
| **Owner** | Full visibility; approves high-risk Execute; unrestricted Command Centre |
| **Admin** | Staff operations; no platform Owner powers; limited finance write |
| **Office Staff** | Scheduling, CRM, job create; no Owner-only integrations |
| **Technician** | Mobile execution; no finance write; no marketing publish |
| **Client** | Portal-only; no agent administration |

Agents inherit the **most restrictive** intersection of their role class and the acting user's RBAC.

---

## Platform modules (capability columns)

| Module | Primary agent departments |
|--------|--------------------------|
| AURA Chat | All (coordination layer) |
| Jobs | OPS, PLM, FIN |
| Dispatch | OPS |
| Fleet | OPS, INV |
| Quotes | SAL, PLM, FIN |
| Invoices | FIN |
| Payments | FIN |
| Documents | PLM, FIN, HRL |
| CRM | SAL, COM |
| Marketing | MKT |
| Analytics | EXEC, FIN, MKT, RSH |
| Security | SWD, AUD |
| Audit logs | AUD, LRN |
| Inventory | INV |
| Suppliers | INV |
| Payroll | FIN, HRL |

---

## Integration capability matrix

Legend: **R** Read · **P** Propose · **D** Draft · **A** Approve (human) · **E** Execute · **M** Monitor · **X** Forbidden

### Finance integrations

| Agent (examples) | Xero | Yoco |
|------------------|------|------|
| FIN-014 Xero Integration | R,M | X |
| FIN-015 Yoco Reconciliation | X | R,M |
| FIN-004 Financial Controller | R,P,D | R,M |
| FIN-006 Cashflow Forecasting | R,P,D | R,M |
| Bookkeeper / AR / AP agents | R,D | X |
| Pricing and Margin Protection | R,P | X — **Execute Forbidden** (policy change) |

**Rule:** Reconciliation **Execute** requires evidence (provider receipt, matching transaction IDs). No silent reconcile.

### Communications integrations

| Agent (examples) | WhatsApp | Gmail | SMS |
|------------------|----------|-------|-----|
| COM-002 WhatsApp | R,D — **E** after Approve | X | X |
| COM-003 Email / COM-004 Gmail | X | R,D — **E** after Approve | X |
| COM-005 SMS | X | X | D — **E** after Approve |
| COM-006 AI Receptionist | R,D | R | D |
| Unified Communications | R,M across channels | R,M | R,M |

**Rule:** No agent **Executes** outbound customer messages without approval.

### Social and marketing integrations

| Agent (examples) | Facebook | Instagram | TikTok | LinkedIn | YouTube | Google Business Profile |
|------------------|----------|-----------|--------|----------|---------|------------------------|
| MKT-005 Facebook | R,D — publish **E** Owner-approved only | X | X | X | X | X |
| MKT-006 Instagram | X | R,D | X | X | X | X |
| MKT-007 TikTok | X | X | R,P | X | X | X |
| MKT-008 LinkedIn | X | X | X | R,D | X | X |
| MKT-009 YouTube | X | X | X | X | R,D | X |
| MKT-010 Google Business Profile | X | X | X | X | X | R,D |
| Brand Compliance / Reputation | R,M all connected channels | R,M | R,M | R,M | R,M | R,M |

**Facebook truth (2026-08-06):** Staging connection complete for Young Guns; content features and webhook subscription code pushed (`23debd9`); live event proof pending Owner deploy. Agents remain **Implemented but inactive** until activation gate.

### Operations integrations

| Agent (examples) | Google Maps | Cartrack | Calendar |
|------------------|-------------|----------|----------|
| OPS-008 Route Optimisation | R,P,D | R,M | R |
| OPS-009 Google Maps | R,P | X | R |
| OPS-010 Fleet Coordination | R | R,M | R |
| Dispatch / Scheduling | R | R,M | R,D |

### Cross-cutting

| Agent class | CRM | Jobs | Documents | Analytics | Security | Audit logs |
|-------------|-----|------|-------------|-----------|----------|------------|
| Sales agents | R,D | R | R | R,M | X | M |
| Ops agents | R | R,D,E* | R,D | R,M | X | M |
| Finance agents | R | R | R,D | R,M | X | M |
| AUD department | R | R | R | R | R,M | R,M,E* |

\* **Execute** only for audit findings recorded as tickets — never production data mutation without human workflow.

---

## Department capability summary

| Dept | Read-heavy modules | Draft-capable | Execute (supervised) | Forbidden |
|------|-------------------|---------------|----------------------|-----------|
| EXEC | All summary modules | Strategy briefs | None autonomous | Policy/pricing changes |
| FIN | Finance, Jobs, CRM | Invoices, quotes, journals | Approved sync posts only | Silent payment, margin rules |
| SAL | CRM, Quotes | Proposals, follow-ups | Approved CRM updates | Contract sign without human |
| MKT | Marketing, Analytics | Content, campaigns | Owner-approved publish only | Silent social publish |
| OPS | Jobs, Dispatch, Fleet | Schedules, dispatch plans | Approved schedule commits | Emergency dispatch without human |
| PLM | Jobs, Documents, QS | Estimates, BOQ, CoC drafts | None without human sign-off | Statutory sign-off |
| INV | Inventory, Suppliers | PO drafts | Approved PO issue | Stock adjustment without approval |
| COM | CRM, Comms | Replies, bookings | Approved sends only | Unapproved outbound |
| HRL | HR modules | Policies, contracts draft | None statutory | Disciplinary execution |
| SWD | Platform | Specs, runbooks | None in tenant prod | Prod deploy without release gate |
| AUD | All (read) | Audit reports | Finding registration | Any tenant mutation |
| RSH | External + Analytics | Research briefs | None | Unlicensed scraping |
| LRN | Agent metrics | Improvement proposals | None — activation via governance | Silent learning apply |

---

## Required fields (every operational agent)

Every agent profile in the master register must populate:

1. Stable Agent ID  
2. Agent name  
3. Department  
4. Role type  
5. Mission  
6. Owner or supervising agent  
7. Primary inputs  
8. Primary outputs  
9. Required modules  
10. Required integrations  
11. Permitted tools  
12. Data it may read  
13. Data it may write  
14. Forbidden data/actions  
15. Tenant-isolation requirements  
16. Required approval gates  
17. Human escalation conditions  
18. Learning allowance  
19. Risk rating  
20. Audit evidence required  
21. Dependencies  
22. Current implementation status  
23. Activation phase  

---

## Matrix maintenance

- Update this matrix when a new integration or module is added.
- Cross-reference [TITAN_INTEGRATION_REGISTER.md](./TITAN_INTEGRATION_REGISTER.md) for provider truth states.
- Do not mark **Execute** permitted without documented approval gate and audit evidence.

**Document control:** AGENT-002 · Applies to extensible register — no fixed agent maximum.
