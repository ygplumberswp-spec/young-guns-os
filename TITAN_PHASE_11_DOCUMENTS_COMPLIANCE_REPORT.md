# TITAN Phase 11 — Documents, COCs and Compliance

**Branch:** `cursor/titan-owner-operating-model-final`  
**Base (Phase 10):** `eaa560c`  
**Code SHA:** `cf8a742`  
**Final SHA:** `cf8a742`  
**Environment:** Staging only — production not touched  
**Generated:** 2026-08-02

## Verdict

| Surface | Verdict | Evidence |
|---|---|---|
| **Daily compliance workspace** | **GO** | `/documents/compliance` — 11 queue filters, disclaimer, 2 real items on YGP staging |
| **Queue summaries (API)** | **GO** | All 11 queues present in `GET /documents/compliance/workspace` |
| **COC field guidance (Job 360)** | **GO** | 12-section authorised-plumber checklist + snapshot fields; no fake issuance |
| **Document audit trail** | **GO** | `security_audit_logs` on upload/update; 0 entries last 30d on staging (honest) |
| **RBAC / tenant isolation** | **GO** (owner) / **HOLD** (tech verify) | Owner 200; technician session mint failed in 243 (same pattern as Phase 10) |
| **Honest empty states** | **GO** | Queues functional at zero; items appear only from real job/vehicle gaps |

**Overall:** **GO** @ `cf8a742` — authenticated staging verification 243 (0 blockers)

## Summary

Phase 11 delivers a daily compliance workspace at `/documents/compliance` backed by `GET /api/v1/documents/compliance/workspace`. Queue counts aggregate live jobs (completion gates, COC classification, photos, signatures, material slips, finance links), uploaded COC documents, workforce certificates, fleet vehicles, and asset equipment — with no simulated compliance records. The Job 360 COC tab shows professional-responsibility disclaimer and a 12-field authorised-plumber checklist (guidance only). Document create/update actions now write to `security_audit_logs`.

## Deliverables

| Deliverable | Path |
|---|---|
| Phase 11 report | `TITAN_PHASE_11_DOCUMENTS_COMPLIANCE_REPORT.md` |
| Staging verify script | `diagnostic-output/243-documents-compliance-verify.mjs` |
| Staging verify JSON | `diagnostic-output/243-documents-compliance-verify.json` |
| Staging screenshots | `diagnostic-output/phase11-documents-compliance-staging/` |

## Scope delivered

### Daily compliance workspace (`/documents/compliance`)

| Queue | Source | YGP staging |
|---|---|---|
| Missing COC | Jobs requiring COC without linked certificate doc | **GO** (count from real jobs) |
| Missing signature | Active jobs without signature evidence | **GO** |
| Missing photos | Active jobs missing before/after photo evidence | **GO** |
| Missing slips | Active jobs without material lines / inventory usage | **GO** |
| Missing quote/invoice link | Jobs without linked quote or invoice | **GO** |
| COC awaiting completion | Classified `required`, job not completed | **GO** |
| Issued | Uploaded COC/certificate documents | **GO** |
| Correction required | Completion snapshot outstanding defects | **GO** |
| Expiring certificates | Workforce `certifications` within 30 days | **GO** (0 on staging) |
| Vehicle documents | Vehicles without linked registration/licence docs | **GO** (2 vehicles flagged) |
| Equipment documents | Asset calibrations / equipment without docs | **GO** (0 on staging) |

Nav tabs: Daily compliance · Documents · Job packs · Categories.

### COC support (Job 360 tab)

| Field section | UI | API backing |
|---|---|---|
| Plumber details, registration, installation | Checklist guidance | Snapshot when job completed |
| SANS checks, temperatures, isolator, lagging, bonding, overflow | Checklist guidance | **HOLD** — no structured COC form API |
| Signature, correction workflow, final PDF | Checklist + upload link | Mobile completion + documents store |

Disclaimer on workspace and Job 360: TITAN supports authorised plumbers; does not issue COCs or replace legal responsibility.

### Document security

| Control | Status |
|---|---|
| RBAC `documents:read` / `documents:write` on all routes | **GO** |
| Tenant isolation (`companyId` scope) | **GO** |
| Audit on upload (`document_uploaded`) | **GO** |
| Audit on update (`document_updated`) | **GO** |
| Technician workspace scoped to assigned jobs | **GO** (code); **HOLD** (243 tech mint) |

## API endpoints (new)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/documents/compliance/workspace` | Daily compliance queues, items, disclaimer |

## Files changed (Phase 11)

### New

- `packages/shared/src/documents-compliance.ts`
- `packages/shared/src/documents-compliance.test.ts`
- `apps/api/src/services/documents-compliance.service.ts`
- `apps/web/src/pages/documents/ComplianceWorkspacePage.tsx`
- `diagnostic-output/243-documents-compliance-verify.mjs`

### Updated

- `apps/api/src/routes/documents.ts` — compliance workspace route
- `apps/api/src/services/documents.service.ts` — audit logging
- `apps/api/src/index.ts` — wire compliance service
- `apps/web/src/features/documents/DocumentsNav.tsx` — compliance tab
- `apps/web/src/features/jobs/JobCompliancePanel.tsx` — COC checklist + disclaimer
- `apps/web/src/lib/documents-api.ts` — fetch workspace
- `apps/web/src/App.tsx`, `owner-pages.tsx`, `index.css`

## Staging verification (243)

| Check | Result |
|---|---|
| API health/ready | 200 |
| Owner programmatic session (237 pattern) | **GO** |
| `GET /documents/compliance/workspace` | 200, 11 queues, 2 items |
| UI `/documents/compliance` nav + queue filter + disclaimer | **GO** |
| Screenshots | `documents-compliance-1440.png`, `documents-library-1440.png` |
| Console errors | None |

**Staging deploy IDs**

| Service | Deployment ID |
|---|---|
| API (`young-guns-os`) | `7af2ce09-d2e2-4e14-85c2-95b74aea3a20` |
| Web (`comfortable-determination`) | `639adb69-9cf7-450e-86e9-976d0e06eb6e` |

## Remaining HOLD items

1. **Structured COC form API** — SANS field capture remains guidance-only; full plumber COC form deferred until API/schema exists.
2. **Technician RBAC automated verify** — no active technician user on YGP staging for 243 mint (manual check: technicians scoped to assigned jobs in service).
3. **Document audit count on staging** — 0 entries in last 30 days (expected until next upload after deploy).

## Phase 12 boundary

Phase 11 complete. Do **not** start Phase 12 from this report.
