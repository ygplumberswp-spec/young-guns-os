# TITAN Audit Department and Tooling Standard

**Document type:** Permanent audit framework — documentation only  
**Generated (UTC):** 2026-08-06  
**Department:** AUD (14 agents) — [TITAN_MASTER_AGENT_REGISTER.md](./TITAN_MASTER_AGENT_REGISTER.md)  

---

## Mission

The Permanent Audit Department provides continuous, evidence-based verification that TITAN modules, agents, integrations, and security boundaries work as claimed — without fake completion statuses.

---

## Organisational placement

```
Owner
  └── AURA
        └── Chief Audit Agent (AUD-001)
              ├── Application Auditor (AUD-002)
              ├── Browser and User-Journey Auditor (AUD-003)
              ├── Role and Permission Auditor (AUD-004)
              ├── Tenant-Isolation Auditor (AUD-005)
              ├── Financial Data Auditor (AUD-006)
              ├── Integration Auditor (AUD-007)
              ├── Mobile and Responsive Auditor (AUD-008)
              ├── Accessibility Auditor (AUD-009)
              ├── Security and Privacy Auditor (AUD-010)
              ├── Data Quality Auditor (AUD-011)
              ├── Document and Compliance Auditor (AUD-012)
              ├── Performance and Reliability Auditor (AUD-013)
              └── Acceptance Register Reconciliation Agent (AUD-014)
```

**Implementation status:** All AUD agents **Missing** (framework documented; agents not activated).

---

## Required audit tools

| Tool | Purpose | Staging sandbox |
|------|---------|-----------------|
| **BrowserStack** | Cross-browser/device matrix, Website Scanner | [BROWSERSTACK_AUDIT_SANDBOX.md](./BROWSERSTACK_AUDIT_SANDBOX.md) |
| **Playwright** | Automated user journeys, regression | `tests/browser/*.spec.ts`, `playwright.config.ts` |
| **Percy / BrowserStack Visual** | Visual regression | Finance J-6.4 layout specs as pattern |
| **Accessibility testing** | WCAG checks | axe / BrowserStack accessibility |
| **API security testing** | Auth boundaries, injection | Route tests, cross-tenant matrix |
| **Tenant-isolation testing** | Cross-tenant denial | `cross-tenant-denial-matrix.test.ts` (97 tests) |
| **Role-access testing** | RBAC matrix | `role-forbidden-*` tests |
| **Provider-state verification** | Honest integration states | Mock + staging OAuth proofs |
| **Migration and rollback testing** | DB safety | Owner-approved staging only; no prod |

---

## Two-stage audit policy

### Stage 1 — Incremental (after each major section)

1. Run targeted automated tests for the section  
2. Execute browser journey (Playwright + optional BrowserStack)  
3. Fix **critical** failures before proceeding  
4. Update [TITAN_MASTER_ACCEPTANCE_REGISTER.md](./TITAN_MASTER_ACCEPTANCE_REGISTER.md)  
5. Mark only **proven** items complete  
6. Continue to next section  

### Stage 2 — Final (after complete locked list)

Audit every:

- Module and subdomain route  
- Role and permission boundary  
- Button, form, and workflow  
- Provider connection state  
- Agent tool execution path  
- Desktop (1440), tablet (768), mobile (390) layout  
- Security boundary and tenant isolation  
- Backup and rollback process  

**Final business chain verification:**

```
Lead → Customer → Property → Booking → Job → Dispatch → Technician → Vehicle
  → Materials → Variation → Quote → Approval → Invoice → Yoco/Payment → Xero
  → Profit → Follow-Up → Marketing → Reporting
```

---

## QA sandbox isolation

| Field | Value |
|-------|-------|
| Tenant | TITAN Audit Sandbox (`titan-audit-sandbox`) |
| Banner | `STAGING AUDIT SANDBOX — NO REAL BUSINESS DATA` |
| Provisioning | `packages/db/scripts/staging-audit-sandbox-provision.mjs` |
| Reset | Owner-gated: `STAGING_CONFIRM_RESET=1` only |
| Production | **Forbidden** — never use production DB ref |

---

## Audit outputs (required artifacts)

| Artifact | Owner |
|----------|-------|
| Test run summary (pass/fail counts) | AUD-002, AUD-013 |
| Playwright trace on failure | AUD-003 |
| RBAC denial evidence | AUD-004 |
| Cross-tenant denial log | AUD-005 |
| Integration state snapshot | AUD-007 |
| Acceptance register diff | AUD-014 |

---

## Acceptance register reconciliation (AUD-014)

AUD-014 must:

- Compare requirement status claims against code, test, and staging evidence  
- Flag **COMPLETE** rows lacking proof  
- Never upgrade status without evidence  
- Cross-link to [TITAN_GAP_CLOSURE_PLAN.md](./TITAN_GAP_CLOSURE_PLAN.md)  

---

## Agent activation dependencies

| Dependency | Phase |
|------------|-------|
| Master agent register | Phase 1 (complete — documentation) |
| Audit sandbox provisioned | Phase 14 |
| BrowserStack credentials | Owner-action required |
| Playwright CI green | Ongoing |

---

## Related documents

- [TITAN_MASTER_ACCEPTANCE_REGISTER.md](./TITAN_MASTER_ACCEPTANCE_REGISTER.md)
- [TITAN_AGENT_ACTIVATION_ROADMAP.md](./TITAN_AGENT_ACTIVATION_ROADMAP.md) — Phase 14
- [BROWSERSTACK_AUDIT_SANDBOX.md](./BROWSERSTACK_AUDIT_SANDBOX.md)
