# TITAN Clean Data, Uniform UX & Useful-Function — Phased Queue

**Status:** **QUEUED** — Phase A in progress (Xero background import)  
**Branch:** `cursor/titan-frozen-scope-completion`  
**Staging ref:** `cpkuwtaipjxeipvbssvn` only — production never touched  
**Updated (UTC):** 2026-08-01 — BINDING-RULE-001 queued after Phase A  

---

## Phase F — Binding rule enforcement (queued after Phase A)

Per `TITAN_BINDING_ACCEPTANCE_RULE.md` and `TITAN_COMPLETE_APP_AUDIT.md`:

| Step | Action | Gate |
|------|--------|------|
| F1 | Close Xero import GO | Auto |
| F2 | Owner approves cleanup manifest | **Owner** |
| F3 | Hide or complete decorative enterprise pages | Engineering |
| F4 | Extend domain events to full business chain | Engineering |
| F5 | Embed live background-work status on operational pages | Engineering |
| F6 | Uniform data standard (SA phone, ZAR, VAT) audit + fixes | Engineering |
| F7 | Useful-function sweep on all visible controls | Engineering |
| F8 | Staging smoke per binding criterion 10 | Auto + Owner |

---

## Gate: do not start destructive or UX-sweep work until Phase A completes

| Active item | State |
|-------------|--------|
| Xero background job `8e6aec9b…` | Running — contacts import in batches |
| Global auto-sync framework | Deployed `5239239`; `/api/v1/background-work/status` live (401 unauth) |
| Data cleanup | **Audit only** — manifest ready, **no deletes** |

---

## Phase A — Wait for Xero import GO

**Auto-continues** when scheduler completes all stages.

| Check | Target |
|-------|--------|
| Job status | `completed` |
| Stages | contacts → invoices → payments → bank transactions |
| `last_sync_at` | populated on Young Guns Plumbing |
| Duplicates | idempotent re-run produces no new mappings |

**Evidence scripts:** `frz018g-xero-background-sync-verify.mjs`, `frz018f-auto-sync-schedulers-verify.mjs`, `global-autosync-staging-verify.mjs`

**Owner signal optional:** reply **"xero synced"** when UI shows **Synced**.

---

## Phase B — Staging backup + approved E2E cleanup

**Requires explicit Owner approval** of `TITAN_STAGING_DATA_CLEANUP_MANIFEST.md`.

| Step | Action |
|------|--------|
| B1 | Create recoverable staging backup (Supabase snapshot / pg_dump) |
| B2 | Owner approves cleanup of **59 confirmed E2E tenants** |
| B3 | Delete child → parent per manifest (referential integrity) |
| B4 | **Preserve** Young Guns Plumbing `095aef76…` + all Xero mappings |
| B5 | Verify only 1 live company visible in normal Owner session |

**Cleanup candidates:** FRZ-015/018 probes (19) + STAGING-P5/P6/P8-12 E2E (40)  
**Uncertain records:** 0 identified — none deleted without review

---

## Phase C — Uniform data standard audit

**Non-destructive first** — review proposals only, no auto-merge.

| Area | Action |
|------|--------|
| SA mobile formatting | Audit + formatter gaps |
| ZAR / VAT presentation | Audit finance modules |
| Duplicate customers / properties | Detect + **review proposal** |
| Duplicate Xero mappings | Verify idempotency post-import |
| Orphaned records | Report only |
| Job numbers / Xero refs | Consistency check |

---

## Phase D — Uniform UX & useful-function audit

| Area | Action |
|------|--------|
| Layout / terminology consistency | Page-by-page audit |
| Primary actions | One clear action per screen |
| Loading / empty / error states | Truthful states everywhere |
| Useful-function rule | Every visible control must work or be hidden |
| Manual Sync now | Confirmed fallback-only post auto-sync |

---

## Phase E — Verification + documentation

1. Legitimate data only in Owner-visible staging  
2. Provider data intact (Xero, future Cartrack)  
3. Duplicate / orphan checks  
4. Tenant isolation + RBAC tests  
5. Event propagation smoke (lead convert, job complete)  
6. Repeated provider sync — no duplicates  
7. Pages update without manual refresh  
8. `pnpm typecheck`, `pnpm test`, `pnpm build`  
9. Deploy staging  
10. UX/workflow smoke tests  
11. Update acceptance, sprint, evidence, pilot, launch docs  
12. Commit and push

---

## Future contamination prevention (implement during Phase B/E)

- E2E signups tagged `metadata.source = 'e2e_staging'`  
- Automatic post-test teardown for tagged tenants  
- No demo seeds in staging/production  
- Search/dashboards exclude E2E-tagged records  
- Disposable email domains only in automated scripts  

---

## Owner approval gates

| Gate | Required for |
|------|----------------|
| **Cleanup manifest approval** | Phase B deletes |
| **Duplicate merge approval** | Any customer/property merge |
| **Financial write approval** | Unchanged — always gated |

---

## Evidence index

| Artifact | Purpose |
|----------|---------|
| `TITAN_STAGING_DATA_CLEANUP_MANIFEST.md` | Human-readable audit + preserve/cleanup lists |
| `diagnostic-output/180-staging-data-cleanup-audit.json` | Machine-readable company classification |
| `TITAN_GLOBAL_REALTIME_AUTO_SYNC_ARCHITECTURE.md` | App-wide sync framework |
| `TITAN_INTEGRATION_AUTO_SYNC_REPORT.md` | Integration auto-sync status |
