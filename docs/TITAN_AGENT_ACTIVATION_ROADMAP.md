# TITAN Agent Activation Roadmap

**Document type:** Permanent activation plan — documentation only (no activation performed)  
**Generated (UTC):** 2026-08-06  
**Register:** 307 agents — [TITAN_MASTER_AGENT_REGISTER.md](./TITAN_MASTER_AGENT_REGISTER.md)  
**Current state:** 0 Verified complete; 21 Partial; 3 Provider-blocked; 283 Missing  

---

## Rules

- **No agent is activated by this document.** Activation requires tools, RBAC, tests, and Owner approval per phase gate.
- Phases are sequential gates; parallel work within a phase is allowed when dependencies are met.
- Facebook advanced capabilities are **not** a current development blocker (basic connection complete on staging).

---

## Phase 1 — Agent registry, tools, permissions, approvals and audit foundation

| Deliverable | Agents / artifacts |
|-------------|-------------------|
| Master register (this programme) | All 307 IDs documented |
| Capability matrix + governance standard | Field templates locked |
| Tool registry wiring audit | Map `AGENT_REGISTRY` suggestedToolKeys → executable handlers |
| RBAC matrix per agent class | Owner/Admin/Office/Technician boundaries |
| Approval workflow schema | Draft → approve → execute pattern |
| Audit event schema | Learning + action audit |
| Acceptance register linkage | Agent rows ↔ requirement IDs |

**Exit gate:** Owner approves register + governance; no fake statuses.

---

## Phase 2 — Executive and Owner briefing agents

| Priority agents | Register IDs |
|-----------------|--------------|
| AURA Central Intelligence | AURA-001 |
| Executive Command | EXEC-007 |
| Daily Owner Briefing | EXEC-008 |
| Business Strategist | EXEC-010 |
| Risk and Opportunity | EXEC-016 |

**Exit gate:** Owner receives daily briefing from live tenant data with approval-gated actions only.

---

## Phase 3 — Finance and accounting

| Priority agents | Register IDs |
|-----------------|--------------|
| Financial Controller | FIN-004 |
| Xero Reconciliation | FIN-006 |
| Cash-Flow | FIN-007 |
| Job Costing and Margin | FIN-013 |
| Invoice Follow-Up | FIN-010 |

**Exit gate:** Quote → invoice → Xero chain assisted (not replacing human sign-off).

---

## Phase 4 — Operations and dispatch

| Priority agents | Register IDs |
|-----------------|--------------|
| Operations Manager | OPS-001 |
| Dispatch Coordinator | OPS-002 |
| Scheduling | OPS-003 |
| Field Execution | OPS-010 |
| Job Completion | OPS-012 |

---

## Phase 5 — Communications and receptionist

| Priority agents | Register IDs |
|-----------------|--------------|
| AI Phone Receptionist | COM-001 |
| WhatsApp Business | COM-004 |
| Unified Communications | COM-008 |
| Escalation Routing | COM-016 |

**Note:** Facebook Messenger (COM-007) remains Provider-blocked until Meta grants messaging scopes.

---

## Phase 6 — Sales and customer experience

| Priority agents | Register IDs |
|-----------------|--------------|
| Lead Qualification | CRM-003 |
| Sales Follow-Up | CRM-004 |
| Customer Success | CRM-010 |
| Review and Referral | CRM-018 |

---

## Phase 7 — Marketing, trend and creative production

| Priority agents | Register IDs |
|-----------------|--------------|
| Marketing Director | MKT-001 |
| Content Approval Coordinator | MKT-020 |
| Creative Director | CRE-001 |
| Brand Consistency Reviewer | CRE-011 |
| Video Quality Controller | VID-017 |

**Note:** Publishing and Scheduling (MKT-021) Provider-blocked until Meta App Review.

---

## Phase 8 — QS, estimating and commercial intelligence

| Workflow | Agents |
|----------|--------|
| Full estimating chain | QS-001 through QS-012 |
| Supplier pricing | QS-013, INV-005 |
| Quote quality | QS-012 |

**Locked workflow:** Upload plan → scale → measure → BOQ → price → margin → options → QA → Owner approval.

---

## Phase 9 — HR, legal, safety and compliance

| Priority agents | Register IDs |
|-----------------|--------------|
| HR Manager | HR-001 |
| SOP Agent | HR-017 |
| Legal Counsel | LEG-001 |
| POPIA and Privacy Officer | LEG-005 |
| Health and Safety Officer | LEG-008 |

---

## Phase 10 — Inventory, procurement, fleet and Maps

| Priority agents | Register IDs |
|-----------------|--------------|
| Procurement | INV-004 |
| Fleet Manager | FLT-001 |
| Google Maps and Routing | FLT-002 |
| Cartrack Telemetry | FLT-003 (Owner credentials) |

---

## Phase 11 — Software, IT, product, QA and self-healing

| Priority agents | Register IDs |
|-----------------|--------------|
| Release Manager | SW-022 |
| System Health and Self-Healing | SW-024 |
| Automated Testing | SW-020 |
| Accessibility Testing | SW-019 |
| Prompt and Agent Engineer | SW-014 |

**Code-change path:** branch → test → preview → Owner → staging → production approval.

---

## Phase 12 — Data and analytics

| Priority agents | Register IDs |
|-----------------|--------------|
| Business Intelligence | DAT-010 |
| Report Automation | DAT-009 |
| KPI Design | DAT-008 |
| Data Quality | DAT-003 |

---

## Phase 13 — SaaS, onboarding and expansion

| Priority agents | Register IDs |
|-----------------|--------------|
| Tenant Onboarding | SaaS-001 |
| Platform Usage and Health | SaaS-004 |
| SaaS Customer Success | SaaS-003 |

---

## Phase 14 — Permanent Audit Department

| Priority agents | Register IDs |
|-----------------|--------------|
| Chief Audit | AUD-001 |
| Browser and User-Journey Auditor | AUD-003 |
| Tenant-Isolation Auditor | AUD-005 |
| Acceptance Register Reconciliation | AUD-014 |

See [TITAN_AUDIT_DEPARTMENT_AND_TOOLING_STANDARD.md](./TITAN_AUDIT_DEPARTMENT_AND_TOOLING_STANDARD.md).

---

## Phase 15 — Full cross-agent orchestration and final acceptance

| Deliverable | Detail |
|-------------|--------|
| AURA orchestration | Route tasks to specialist agents with context boundaries |
| Final business chain audit | Lead → … → Reporting (Stage 2 audit) |
| Owner sign-off | V1 workforce acceptance |

**Final business chain:**

```
Lead → Customer → Property → Booking → Job → Dispatch → Technician → Vehicle
  → Materials → Variation → Quote → Approval → Invoice → Yoco/Payment → Xero
  → Profit → Follow-Up → Marketing → Reporting
```

---

## Two-stage audit policy (activation companion)

### Stage 1 — After each major section

1. Targeted tests  
2. Browser journey  
3. Fix critical failures  
4. Update acceptance register  
5. Mark only proven items complete  
6. Then continue  

### Stage 2 — After complete locked list

Audit every module, role, button, form, route, provider, agent, desktop/mobile/tablet layout, security boundary, backup and rollback process.

---

## Related documents

- [TITAN_GAP_CLOSURE_PLAN.md](./TITAN_GAP_CLOSURE_PLAN.md)
- [TITAN_MASTER_ACCEPTANCE_REGISTER.md](./TITAN_MASTER_ACCEPTANCE_REGISTER.md)
