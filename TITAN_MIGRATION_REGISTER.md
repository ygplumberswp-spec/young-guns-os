# TITAN Migration Register

**Updated (UTC):** 2026-08-01 — Phase 5 staging verification  
**ORM:** Drizzle (PostgreSQL / Supabase)  
**Latest file:** `packages/db/drizzle/0104_n8n_hybrid_orchestration.sql`  
**Journal count:** 104 entries  

---

## Pilot-critical migrations (0094–0104)

| Migration | Name | Purpose | Staging status | Production status | Rollback |
|-----------|------|---------|----------------|-------------------|----------|
| 0094 | `canonical_role_matrix` | Binding role remaps + platform Owner rules | Indirect — UX tranches + Phase 5 E2E | **NOT APPLIED — approval gate** | `.down.sql` exists |
| 0095 | `job_operational_contract` | Job # counters, snapshots, search | Staging cutover + Phase 5 E2E | Approval gate | Forward-only |
| 0096 | `job_execution_crew_contract` | Crew assignments | Staging reports | Approval gate | Forward-only |
| 0097 | `job_evidence_offline_contract` | Evidence storage + offline | Staging UX-B | Approval gate | Forward-only |
| 0098 | `job_material_used_trigger` | Materials ledger | Staging UX-F | Approval gate | Forward-only |
| 0099 | `lead_intake_conversion` | Lead convert transactional | **Phase 5 E2E 10/10 GO** | Approval gate | Forward-only |
| 0100 | `quote_to_cash_finance` | Quote/invoice/payment stages | Staging UX-E | Approval gate | Forward-only |
| 0101 | `inventory_procurement_loop` | PO + stock | Staging UX-F | Approval gate | Forward-only |
| 0102 | `comms_honesty` | Truthful comms states | Staging UX-G | Approval gate | Forward-only |
| 0103 | `marketing_eligibility_consent` | Buyer classifier + consent | Staging UX-H | Approval gate | Forward-only |
| 0104 | `n8n_hybrid_orchestration` | n8n signing + visibility | Staging UX-J | Approval gate | Forward-only |

---

## Pre-migration checks (0094)

```sql
-- Platform Owner count must be ≤ 1 before applying 0094
SELECT COUNT(*) FROM users u
JOIN roles r ON r.id = u.role_id
WHERE r.name = 'Platform Owner';
```

Documented in: `TITAN_BATCH1A_MIGRATION_STAGING_REPORT.md`

---

## Environment separation

| Environment | Database | Migration policy |
|-------------|----------|------------------|
| Local dev | `apps/api/.env` DATABASE_URL | Developer applies via `pnpm db:migrate` |
| Staging | Railway staging service | Apply after pre-check; evidence in staging reports |
| Production | Supabase production | **Explicit Owner approval**; backup + clone dry-run first |

Reports:
- `TITAN_PRODUCTION_BACKUP_CLONE_DRY_RUN_REPORT.md`
- `TITAN_PRODUCTION_MIGRATION_0094_0104_REPORT.md`
- `TITAN_STAGING_CUTOVER_0094_0095_REPORT.md`

---

## Rules (binding)

1. Never apply production migration without approval gate report.  
2. Never `--force` or rewrite applied migration history.  
3. Test upgrade on disposable clone before production.  
4. Record journal hash + row count evidence after apply.  
5. Drizzle only — **no Prisma**.

---

## Current gap

Local staging DB password in `apps/api/.env.staging.local` returns **`28P01`** — row-count verification blocked. Live staging API + Phase 5 E2E confirm lead-conversion schema behaviour (`0099+`). Exact journal count **104** not confirmed from this machine.

**Next action:** Owner refresh staging DB password; optional Railway redeploy of completion branch.
