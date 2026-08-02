# TITAN Department RACI Matrix

**Phase:** 13 — Corporate Department Operating Model  
**Company:** Young Guns Plumbing  
**Legend:** **R** = Responsible · **A** = Accountable · **C** = Consulted · **I** = Informed  

Accountable owners match `packages/shared/src/corporate-departments.ts`.

---

## Cross-department RACI (key activities)

| Activity | Exec & Strategy | Finance | Sales | Marketing | CX | Operations | Scheduling | Projects | HR | Procurement | Inventory | Fleet | Quality | H&S | Legal | IT | Data | Admin | AURA |
|----------|-----------------|---------|-------|-----------|-----|------------|------------|----------|-----|-------------|-----------|-------|---------|-----|-------|-----|------|-------|------|
| Daily owner action queue review | **A/R** | C | C | I | C | C | C | I | C | I | C | C | I | I | C | I | C | I | C |
| Overdue invoice follow-up | A | **A/R** | C | I | C | I | I | I | I | I | I | I | I | I | I | I | C | I | I |
| Quote → job conversion | A | C | **A/R** | I | C | C | C | C | I | I | I | I | I | I | I | I | I | I | I |
| Job dispatch / assign | A | I | I | I | C | C | **A/R** | C | C | I | C | C | I | C | I | I | I | I | C |
| Field job execution | I | I | I | I | C | **A/R** | C | C | C | C | C | C | C | **R** | I | I | I | I | I |
| Completed job → invoice | A | **R** | C | I | I | C | I | C | I | I | I | I | C | I | I | I | I | I | I |
| Parts / stock shortage | I | I | I | I | I | C | C | C | I | **R** | **A** | I | I | I | I | I | I | I | I |
| Fleet vehicle unavailable | I | I | I | I | I | C | **R** | I | I | I | I | **A** | I | I | I | C | I | I | I |
| Payroll preparation batch | A | C | I | I | I | I | I | I | **A/R** | I | I | I | I | I | C | I | I | C | I |
| Marketing campaign send | **A** | I | C | **R** | C | I | I | I | I | I | I | I | I | I | C | I | C | I | C |
| AURA / automation approval | **A** | C | C | C | C | C | C | C | C | C | C | C | C | C | C | C | C | C | **R** |
| Integration / Xero health | A | C | I | I | I | I | I | I | I | I | I | I | I | I | C | **A/R** | C | I | I |
| Team role changes | **A** | I | I | I | I | I | I | I | C | I | I | I | I | I | C | C | I | **R** | I |
| Compliance / COC job pack | A | I | I | I | C | C | I | C | I | I | I | I | **R** | **A** | C | I | I | I | I |

---

## Accountable owner by department

| Department | Accountable (A) |
|------------|-----------------|
| Executive & Strategy | Company Owner |
| Finance & Accounting | Accountant |
| Sales & Business Development | Company Owner |
| Marketing & Growth | Company Owner |
| Customer Experience | Operations Manager |
| Operations | Operations Manager |
| Scheduling & Dispatch | Dispatcher |
| Projects & Construction | Company Owner |
| HR & Workforce | Company Owner |
| Procurement | Company Owner |
| Inventory | Operations Manager |
| Fleet & Assets | Operations Manager |
| Quality | Operations Manager |
| Health Safety & Compliance | Company Owner |
| Legal Risk & Internal Control | Company Owner |
| IT & Cybersecurity | Company Owner |
| Data & Analytics | Company Owner |
| Administration | Company Owner |
| AURA Digital Workforce | Company Owner |

---

## Escalation path (Young Guns)

1. **Field issue** → Operations Manager (R) → Dispatcher if scheduling (C) → Owner if customer/money impact (A).
2. **Cash / invoice dispute** → Accountant (R) → Sales for scope (C) → Owner if write-off (A).
3. **Safety incident** → Operations Manager (R) → Owner + Legal (A/C) within 24h.
4. **Integration failure** → IT/Owner (R/A) → Finance informed if Xero read affected (I).
5. **AURA proposed action** → AURA Digital Workforce surfaces queue → Owner approval (A) before execution.

---

## Notes

- At YGP staging scale, Company Owner often holds **A** for multiple departments — matrix documents target operating model, not headcount.
- Technicians are **R** for field execution only; excluded from corporate department hub (mobile RBAC).
- RACI is operational guidance; enforcement is via TITAN RBAC permissions on routes and API endpoints.
