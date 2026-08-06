# TITAN Staging Baseline Freeze

**Authoritative record of the Owner-approved frozen staging baseline.**  
**Date:** 2026-08-01  
**Repository:** `/Users/keanuventer/Downloads/Titan Aura V1`  
**Branch:** `cursor/titan-frozen-scope-completion`  
**Status:** **OWNER APPROVED / FROZEN BASELINE**

---

## 1. Frozen commit

| Field | Value |
|-------|-------|
| **Full SHA** | `60b482995b4d6298afccdc3047308ce83d1322e7` |
| **Short SHA** | `60b4829` |
| **Message** | `fix(xero): reconcile imported invoice totals and sync state on staging` |
| **Branch** | `cursor/titan-frozen-scope-completion` |
| **Prior verified deploy chain** | `934d0f3` (finance drafts) → `03a6984` (dashboard) → `60b4829` (Xero invoice fix) |

---

## 2. Staging deploy IDs (verified baseline)

| Service | Railway service | Deploy ID | URL |
|---------|-----------------|-----------|-----|
| **API** | young-guns-os | `deadf1aa-5e88-430e-99f4-79f690503669` | https://young-guns-os-staging.up.railway.app |
| **Web** | comfortable-determination | `0fedc602-42be-44b3-8308-a7ff2be5c2a6` | https://comfortable-determination-staging.up.railway.app |

**Production:** Not deployed. Production project `rshuiaghmtrvvilhqpwm` must not be touched.

---

## 3. What is included in this baseline

### Master completion session (`60b4829`)

- Xero imported invoice financial integrity fix (INV-0423/0424 R0,00 and false sync-pending)
- `resolveEffectiveInvoiceTotalCents` and mapping-aware sync status
- Staging backfill: 5 invoices reconciled (`xero-invoice-financial-backfill.mjs --apply`)
- Customer value + analytics use verified classification counts (not raw Xero contact import count)
- `AutosaveIndicator` on invoice create; `SectionErrorBoundary` rollout
- Invoice list: truthful money, sync badge, filter tabs, workspace draft rows

### Prior commits in baseline chain

| Commit | Scope |
|--------|-------|
| `934d0f3` | Finance drafts workspace, debounced autosave API |
| `03a6984` | Executive dashboard redesign, `GET /dashboard/executive-summary`, customer value verified buckets |
| Earlier frozen-scope chain | UX tranches A–K, Phase 5/6 staging E2E, secure session, business rules + today's plan (0114–0115), back-button rollout |

### Validation at freeze

| Gate | Result |
|------|--------|
| `pnpm run typecheck` | PASS |
| API tests | 354 pass |
| Web tests | 130 pass |
| Production builds (api + web) | PASS |
| Staging health | HTTP 200 web `/` |

---

## 4. What is explicitly NOT included (deferred)

See `TITAN_NEXT_IMPLEMENTATION_STAGE_PLAN.md` for ordered phases. Summary:

- Full scheduling calendar (day/week/month, drag-drop)
- Complete job file 360 per visit
- Fleet/Cartrack live map when connected
- Remaining autosave modules (customer, PO, documents, marketing)
- Xero two-way live writes (Owner approval gate)
- Pending migrations 0107, 0109, 0110 (quiescent window required)
- Duplicate customer merge review (Owner queue)
- NL today's plan parse from natural language
- Authenticated performance profiling
- Pilot FRZ-022 final acceptance
- Production deploy

---

## 5. Obsolete branches — do not merge

| Branch | Status | Action |
|--------|--------|--------|
| `cursor/ux-hardening-phase1` | **SUPERSEDED** | All UX hardening work absorbed into `cursor/titan-frozen-scope-completion`. Do not merge. Remote branch retained for audit; safe to ignore. |
| `main` | **Not the completion branch** | Railway staging must track `cursor/titan-frozen-scope-completion`, not `main`. |
| Other obsolete UX/feature branches | **Ignore** | See git remote list; only `cursor/titan-frozen-scope-completion` is authoritative for staging completion work. |

**Do not delete** remote `cursor/ux-hardening-phase1` unless Owner explicitly approves cleanup — document-only supersession is sufficient.

---

## 6. Hard prohibitions (binding)

| Rule | Rationale |
|------|-----------|
| **No production deploy** | Owner approval required on separate gate |
| **No merge to main** | Preserve completion branch until explicit future approval |
| **No merge of `cursor/ux-hardening-phase1`** | Superseded; would regress or duplicate work |
| **No destructive migrations** | Pending 0107/0109/0110 require Xero import quiescent window |
| **No live Xero writes without Owner gate** | Read import + financial display fixed; writes remain gated |

---

## 7. Owner approval record

| Field | Value |
|-------|-------|
| **Date** | 2026-08-01 |
| **Approver** | Owner |
| **Decision** | Master completion staging baseline approved and frozen at `60b4829` |
| **Note** | Remaining scope deferred to next implementation stage; staging-only until pilot FRZ-022 and production gates pass |

---

## 8. Related control documents

| Document | Purpose |
|----------|---------|
| `TITAN_MASTER_COMPLETION_REPORT.md` | Session report + Owner Approval section |
| `TITAN_ACCEPTANCE_REGISTER.md` | FRZ section register; frozen baseline status |
| `TITAN_PILOT_READINESS_REPORT.md` | Pilot gates; not pilot-ready until next stages |
| `TITAN_AUTONOMOUS_SPRINT_LOG.md` | Sprint FREEZE-001 entry |
| `TITAN_NEXT_IMPLEMENTATION_STAGE_PLAN.md` | Ordered remaining work |
| `TITAN_AUTO_WORK_PIPELINE.md` | Pipeline phases (Xero GO, SPI, JOB-DEL, etc.) |
| `TITAN_GAP_BACKLOG.md` | Gap register aligned to binding rule |

---

## 9. Rollback reference

If staging regresses after this freeze:

1. Redeploy API + web from commit `60b4829` on `cursor/titan-frozen-scope-completion`
2. Use deploy IDs above as known-good reference
3. Database: forward-only — restore from backup only if bad migration applied
4. See `TITAN_STAGING_ROLLBACK_TEST.md`, `TITAN_PRODUCTION_ROLLBACK_PLAN.md`

---

**This document is the authoritative staging baseline freeze record.** Update only with explicit Owner approval on a new freeze event.
