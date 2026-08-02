# TITAN AURA Context Coverage Matrix

**Phase:** 254 contextual AURA rollout  
**Generated (UTC):** 2026-08-02T13:30:00.000Z

---

## Global access pattern

| Capability | Implementation | Verdict |
|------------|----------------|---------|
| Ask AURA in page header | `PageHeader` + `AskAuraButton` (default on) | **GO** |
| App header Ask AURA | `AppLayout` global button | **GO** |
| Keyboard shortcut | ⌘⇧A / Ctrl⇧A toggles drawer | **GO** |
| Contextual side drawer | `ContextualAuraDrawer` | **GO** |
| Suggestion chips | `aura-page-suggestions.ts` per module | **GO** |
| Context contract | route, module, recordId, customerId, jobId | **GO** |
| No page loss on open | Drawer overlay; no navigation | **GO** |

---

## Module coverage (active retained routes)

| Module | Routes | Ask AURA | Chips | Context fields | Verdict |
|--------|-------:|:--------:|:-----:|----------------|---------|
| Dashboard | 1 | Y | priorities, actions | module=dashboard | **GO** |
| Leads | 3 | Y | summarise, follow-up | module=leads | **GO** |
| CRM | 3 | Y | history, retention | customerId on detail | **GO** |
| Jobs | 3 | Y | readiness, missing | jobId on detail | **GO** |
| Scheduling | 1 | Y | technician, clashes | schedulingView | **GO** |
| Finance | 12 | Y | invoice-state, follow-up | module=finance | **GO** |
| Inventory | 4 | Y | shortage, reorder | module=inventory | **GO** |
| Procurement | 6 | Y | pipeline, approval | module=procurement | **GO** |
| Fleet | 3 | Y | status, maintenance | vehicleId optional | **GO** |
| Communications | 4 | Y | thread, draft | module=communications | **GO** |
| Documents | 4 | Y | completeness, gaps | module=documents | **GO** |
| Analytics | 1 | Y | metrics, trends | module=analytics | **GO** |
| Settings/Integrations | 18 | Y | config, diagnose | module=settings | **GO** |
| AURA ops | 8 | Y | plan, health | module=aura | **GO** |

**Pages with contextual AURA:** 71 / 71 major active pages (via shared PageHeader + AppLayout)

---

## Response standard

| Field | Status |
|-------|--------|
| What AURA found | Composer + message list |
| Confidence / evidence | Diagnostics panel (full /aura page) |
| Approval requirement | Disclaimer in drawer footer |
| Financial never guess | No auto Xero writes; HOLD on allocation |

---

## RBAC isolation

AURA context limited to authorised API domains per role (existing aura routing). Technician/client roles: drawer available where route accessible; finance context withheld per permissions.
