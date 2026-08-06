# TITAN Staging Data Cleanup — Non-Destructive Audit Manifest

**Status:** **QUEUED** — await Xero background import completion + explicit Owner cleanup approval  
**Scope:** Staging only (`cpkuwtaipjxeipvbssvn`)  
**Production:** Not accessed  
**Destructive actions:** **NONE** — audit only  
**Updated (UTC):** 2026-08-01

---

## Active work — do not interrupt

| Item | State |
|------|--------|
| Xero background import job `8e6aec9b-2d99-493c-85b8-75f61d7f414b` | **running** (contacts stage) |
| Xero customer mappings (global) | **266+** (in progress) |
| Global auto-sync framework | Deployed `5239239` (API deploy may still be rolling) |

**Rule:** No cleanup, no schema changes, no company deletes until import completes and Owner approves manifest.

---

## Staging totals (read-only probe)

| Entity | Count |
|--------|------:|
| Companies | 60 |
| Users | 78 |
| Customers | 286 |
| Jobs | 17 |
| Xero customer mappings | 266+ |

---

## Classification summary

| Classification | Companies | Action |
|----------------|----------:|--------|
| **verified_live_owner** | 1 | **PRESERVE** |
| **confirmed_e2e_phase** (`STAGING-P*`) | 40 | Cleanup candidate after approval |
| **confirmed_e2e_frz** (`FRZ0*`, probes) | 19 | Cleanup candidate after approval |
| **uncertain_review** | 0 | None flagged |

Classification basis: **confirmed naming conventions** from automated E2E scripts (`staging-p5.test`, `staging-p6.test`, `staging-frz018*.test`, `FRZ015 Co`, `FRZ018 Probe`, etc.) — not guesswork from dates alone.

---

## PRESERVE — verified live / provider data

### Owner tenant (never delete)

| Field | Value |
|-------|-------|
| Company ID | `095aef76-fef5-4139-af37-a42f2d7e2faf` |
| Name | **Young Guns Plumbing** |
| Created | 2026-07-31 |
| Customers | 270 (includes Xero-imported) |
| Jobs | 1 |
| Users | 1 |
| Xero | Connected — Young Guns Plumbing org |
| Xero customer mappings | 266 (provider-imported — **preserve**) |

### Provider-imported records

- All `xero_customer_mappings` rows for company `095aef76…` — **preserve**
- Future invoice/payment/bank mappings for same company — **preserve**
- `integration_connections` Xero row for Owner company — **preserve**
- `security_audit_logs` / sync logs — **preserve** (compliance)

---

## CLEANUP CANDIDATES — confirmed staging E2E (59 companies)

**Approval required before delete.** Each row is tenant-isolated disposable signup from public E2E verification scripts.

### Pattern A — FRZ-015 / FRZ-018 probes (19 companies)

Examples: `FRZ015 Co *`, `FRZ015 Foreign *`, `FRZ018 Co *`, `FRZ018c Co *`, `FRZ018 Probe *`, `FRZ018f Co *`

| Dependents (typical) | Count per company |
|---------------------|-------------------|
| users | 1 |
| customers | 0 |
| jobs | 0 |
| integration_connections | 0 (disconnected probes) |

**Reason:** Documented FRZ-015/018 synthetic signup probes; email domains `@staging-frz015.test`, `@staging-frz018e.test`, etc.

### Pattern B — Phase 5/6/8–12 E2E (40 companies)

Examples: `STAGING-P5 Young Guns *`, `STAGING-P5 Foreign *`, `STAGING-P6 Crew Co *`, `STAGING-P6 Foreign *`, `STAGING-P8-12 Co *`

| Dependents (where present) | Typical |
|---------------------------|---------|
| users | 1–3 |
| customers | 0–1 (synthetic lead→convert fixture) |
| jobs | 0–1 (synthetic fixture) |

**Reason:** Documented Sprint 022 public E2E scripts; email domains `@staging-p5.test`, `@staging-p6.test`.

### Full company ID list

See structured evidence: `diagnostic-output/180-staging-data-cleanup-audit.json`

---

## UNCERTAIN — Owner review required

**None identified** in this audit pass. Every non–Young Guns company matched a confirmed E2E naming pattern.

If Owner knows of additional legitimate staging companies beyond **Young Guns Plumbing**, flag before approval.

---

## Dependent-record cleanup plan (post-approval only)

For each confirmed E2E company, delete in **child → parent** order preserving referential integrity:

1. Job execution / timeline / materials linked to synthetic jobs  
2. Jobs  
3. Customers / properties / leads (synthetic fixtures only)  
4. BOQ / quotes / invoices (if any on test tenants)  
5. Integration probe rows (disconnected only)  
6. Users  
7. Company  

**Never delete** rows where `company_id = 095aef76-fef5-4139-af37-a42f2d7e2faf`.

---

## Pre-cleanup safety checklist (required before any delete)

- [ ] Recoverable staging backup created and verified  
- [ ] Xero background import job **completed** or safely paused  
- [ ] Owner explicit approval of this manifest  
- [ ] Dry-run delete script reviewed  
- [ ] Audit log export of cleanup actions  

---

## Future contamination prevention (queued implementation)

1. E2E scripts use disposable email domains only; tag `metadata.source = 'e2e_staging'` on signup  
2. Post-test teardown job removes tagged tenants automatically  
3. No demo seeds in staging/production env  
4. Staging signup rate-limit or block non-`@staging-*.test` disposable patterns in non-prod  
5. Dashboard/search exclude `e2e_staging` tagged records  

---

## Queued follow-on work (after Xero import + cleanup approval)

1. Approved destructive cleanup per manifest  
2. Uniform data standard audit (SA phone, ZAR, duplicates — review proposals only)  
3. Uniform UX / useful-function audit  
4. App-wide auto-sync verification on clean staging  
5. Full test/build/deploy/smoke cycle  
6. Update acceptance, sprint, pilot, launch documents  

---

## Approval gate

**Reply with explicit approval** to proceed with staging backup + confirmed E2E tenant cleanup only.

Until then: **no deletes, no merges, no production changes.**
