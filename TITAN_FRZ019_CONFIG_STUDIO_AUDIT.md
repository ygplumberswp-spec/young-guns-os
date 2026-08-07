# FRZ-019 Owner Configuration Studio — Local Audit Report

**Requirement:** FRZ-019 — Owner Configuration Studio (§20)  
**Scope:** Local code audit only — no staging deploy, no production  
**Branch:** `cursor/titan-frozen-scope-completion`  
**Updated (UTC):** 2026-08-01  
**Verdict:** **PARTIAL** — settings surfaces exist; draft/preview/version/rollback chain incomplete

---

## Executive summary

Configuration-related UI and API exist across company settings, portal settings, team access, platform/SaaS tabs, and integration hub. Freeze §20 requires draft/preview, approval, version history, audit, rollback, and future-record behavior for Owner config changes. Current implementation uses **direct save** patterns without a unified Configuration Studio workflow or versioned publish pipeline.

---

## 1. Surfaces found (local)

| Surface | Path | Owner-only | Save model | Version/rollback |
|---------|------|------------|------------|------------------|
| Company profile | `/settings/company` | Yes | Direct `updateCompanyProfile` | None |
| Portal options | `/settings/portal` | Yes | Direct save | None |
| Team & roles | `/settings/team` | Owner/PO | Invite + role assign | Audit logs partial |
| Platform SaaS | `/platform` | Platform owner | Direct mutations | Platform audits list only |
| Integrations hub | `/integrations/*` | `integrations:manage` | Per-provider connect/disconnect | Sync logs only |
| Business evolution | `/business-evolution` | Owner | Observation/sync APIs | Rollback refs in dashboard metadata only |

Key files: `apps/web/src/pages/settings/CompanySettingsPage.tsx`, `PortalSettingsPage.tsx`, `TeamSettingsPage.tsx`, `apps/web/src/pages/platform/PlatformPage.tsx`

---

## 2. Freeze §20 requirements vs implementation

| Requirement | Status | Notes |
|-------------|--------|-------|
| Services / pricebook config | **Missing** | No dedicated pricebook studio route |
| Job types / custom fields | **Partial** | Job fields inline on job forms; no central studio |
| Statuses / checklists | **Partial** | Mobile job checklist local state; no owner checklist editor |
| Quote/invoice templates | **Partial** | Finance templates in code/defaults; no template studio |
| Approval rules | **Partial** | Quote approval workflow local; no generic rule engine UI |
| Schedules / branches | **Partial** | Platform branch create; scheduling config limited |
| Notifications | **Partial** | Comms modules; no unified notification studio |
| Dashboard KPIs/widgets | **Partial** | Owner dashboard panels; no widget config studio |
| Portal options | **Implemented** | `PortalSettingsPage` |
| Technician permissions | **Partial** | RBAC roles; no per-field technician policy studio |
| Branding | **Implemented** | Company + platform branding tabs |
| Automations / AI instructions | **Partial** | AURA/n8n surfaces; owner config access gated in API |
| Draft / preview | **Missing** | All saves immediate |
| Approval before publish | **Missing** | Except AURA task approval cards (AI actions) |
| Version history | **Missing** | No config snapshot table for owner settings |
| Rollback | **Missing** | No revert API for company/profile config |
| Audit on config change | **Partial** | `security_audit_logs` for some actions; not unified |

---

## 3. API / permission review

| Check | Result |
|-------|--------|
| Owner-only company settings | **PASS** — company routes scoped by `companyId` |
| n8n owner config gate | **PASS** — `assertOwnerConfigAccess` in `n8n-orchestration.ts` |
| Cross-tenant settings denial | **PASS** — existing cross-tenant matrix patterns |
| Config publish approval workflow | **FAIL** — not implemented as unified studio |

---

## 4. FRZ-019 verdict

| Field | Value |
|-------|-------|
| **Classification** | **Partially implemented** |
| **Staging evidence** | None (local audit only) |
| **Next safe work** | Define config version schema + draft/publish API for company profile slice |
| **Evidence** | This report + `173-frz019-config-studio-audit.json` |

---

## 5. Recommended next phase (safe local)

1. Add `company_config_versions` snapshot table (staging migration disposable).  
2. Wrap `updateCompanyProfile` in draft → publish with audit + rollback pointer.  
3. Extend to portal settings as second config domain.  
4. Staging verify publish/rollback on isolated tenant after Owner approval.
