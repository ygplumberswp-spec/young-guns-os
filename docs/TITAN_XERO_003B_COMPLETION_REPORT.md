# TITAN XERO-003B — Guarded Staging Migration and Deployment

**Status:** STOP FOR OWNER REVIEW  
**Canonical branch:** `cursor/titan-v1-integration`  
**Ending HEAD:** `da6a983a31566dcd4afae571c18b889ac7a815e4`  
**Staging Supabase:** `cpkuwtaipjxeipvbssvn`  
**Production Supabase:** `rshuiaghmtrvvilhqpwm` — **not accessed**

---

## Executive summary

| Phase | Result |
|-------|--------|
| A. Precheck | PASS |
| B. Protected staging backup | PASS |
| C. Migration 0181 | PASS (staging DB) |
| D. Migration 0182 | PASS (staging DB) |
| E. Pre-deploy validation | PASS |
| F. Deploy staging API | **BLOCKED** — Owner Railway credentials required |
| G. Deploy staging Web | **BLOCKED** — Owner Railway credentials required |
| H. Synthetic staging smoke | PASS (local API + staging DB, preview-only) |
| I. Regression check | PASS (no regressions introduced; live deploy pending) |

Migrations **0181** and **0182** are applied to the staging database. Code validation and synthetic bank-import smoke passed from canonical commit `da6a983`. Railway redeploy of API and Web from this commit remains an **Owner-only** action.

---

## 1. Starting canonical HEAD

Precheck (before fast-forward):

`0a7333e620f8a804aae67778d3af7d5aa1be6eb1`

After clean fast-forward to include XERO-003A:

`365c0c1cc36af94003c83e3b6e7b3f70cefd8db8`

## 2. Ending canonical HEAD

`da6a983a31566dcd4afae571c18b889ac7a815e4`

(chore: journal entries 0181/0182 + guarded staging apply script)

## 3. Staging database identity proof

- `apps/api/.env.staging.local` contains project ref **`cpkuwtaipjxeipvbssvn`**
- Production ref **`rshuiaghmtrvvilhqpwm`** absent from active staging env
- Migration verify scripts assert staging ref before any DDL
- API startup log during smoke: `aws-0-eu-west-1.pooler.supabase.com` (Supabase pooler, staging)

## 4. Backup path, timestamp and SHA-256

| Field | Value |
|-------|-------|
| Path | `/home/ubuntu/titan-staging-backups/titan-staging-pre-xero003b-20260806T120735Z.dump` |
| Timestamp (UTC) | `20260806T120735Z` |
| SHA-256 | `1c32e6ded2000b428a15324e04694b88a5a004dd9fd19b86825893883372359b` |
| Size | 11,705,593 bytes |
| Permissions | `600` |
| Format | `pg_dump -Fc` (schema + data) |
| Read verified | `pg_restore --list` OK |

Meta: `/home/ubuntu/titan-staging-backups/titan-staging-pre-xero003b-20260806T120735Z.dump.meta.json`

## 5. Migration journal before and after

| Stage | Journal count | Last tags |
|-------|--------------:|-----------|
| Before backup | 176 | … `0180_fb_oauth_initiator_role` |
| After 0181 | 177 | … `0181_xero_realtime_intersync` |
| After 0182 | 178 | … `0182_bank_statement_manual_import` |

Note: `0174_facebook_business_integration` remains in journal file but intentionally unapplied (out of scope).

## 6. 0181 application evidence

- Script: `packages/db/scripts/apply-staging-0181-0182.mjs --apply --only 0181_xero_realtime_intersync`
- Journal advanced exactly once (176 → 177)
- Evidence: `diagnostic-output/xero-003b-migration-post-0181.json`

## 7. 0182 application evidence

- Script: `packages/db/scripts/apply-staging-0181-0182.mjs --apply --only 0182_bank_statement_manual_import`
- Journal advanced exactly once (177 → 178)
- Duplicate fingerprint constraint verified: `diagnostic-output/xero-003b-fingerprint-constraint-check.mjs`
- Evidence: `diagnostic-output/xero-003b-migration-post-0182.json`

## 8. Schema / table / index verification

**0181 tables:** `xero_webhook_events`, `xero_targeted_refresh_jobs`, `xero_rate_budget_state`  
**0181 indexes:** company, tenant, status, dedupe_key (10 indexes total)

**0182 tables:** `bank_statement_import_batches`, `bank_statement_import_rows`, `bank_statement_import_audit_logs`  
**0182 indexes:** company/status, batch, classification, fingerprint unique (`bank_statement_import_rows_company_id_row_fingerprint_key`)

Tenant/company scoping, audit fields, and review-state columns verified via post-migration script.

## 9. Pre/post key table counts

| Table | Before | After 0181 | After 0182 |
|-------|-------:|-----------:|-----------:|
| xero_bank_transactions | 3142 | 3142 | 3142 |
| xero_invoice_mappings | 585 | 585 | 585 |
| invoices | 594 | 594 | 594 |
| payments | 512 | 512 | 512 |
| companies | 157 | 157 | 157 |

No destructive schema changes. Existing financial and Xero data counts intact.

## 10. Test totals (canonical `da6a983`)

| Package | Tests | Pass |
|---------|------:|-----:|
| @titan/shared | 1130 | 1130 |
| @titan/auth | 24 | 24 |
| @titan/web | 389 | 389 |
| @titan/api | 1216 | 1216 |
| **Total** | **2759** | **2759** |

Includes bank-import, Xero webhook, RBAC, and tenant-isolation coverage within package suites.

## 11. Typecheck and build results

- `pnpm typecheck` — PASS
- `@titan/api` build — PASS
- `@titan/web` build — PASS (local bundle: `index-CyE2hcdp.js`)

## 12. API deployment ID / status / SHA

**BLOCKED — Owner action required**

- Railway CLI: not authenticated (`npx @railway/cli whoami` → Unauthorized)
- `RAILWAY_TOKEN`: unset on runner
- Canonical branch pushed; no verified redeploy from this runner

Live staging API (pre-redeploy observation):

- URL: `https://young-guns-os-staging.up.railway.app`
- Health `/api/v1/health/ready`: **200**
- Deployed commit SHA: **not verified** (Railway API access unavailable)

## 13. Web deployment ID / status / SHA

**BLOCKED — Owner action required**

Live staging Web (pre-redeploy observation):

- URL: `https://comfortable-determination-staging.up.railway.app`
- Root: **200**
- Deployed bundle: `index-B_kjmeGy.js` (differs from local `da6a983` build `index-CyE2hcdp.js` — confirms Web not yet on canonical commit)

## 14. Staging API health result

`GET /api/v1/health/ready` → **200 OK**

## 15. Bank-import route result

- Live staging unauthenticated `POST /api/v1/finance/bank-statements/detect-headers` → **401** (auth middleware; route namespace registered)
- Controlled smoke (local API + staging DB): detect-headers **200**, preview **201**, revert **200** — see §17

## 16. Webhook route safe-disabled result

`POST /api/v1/webhooks/xero` (synthetic signature) → **503**

```json
{"error":{"code":"WEBHOOK_NOT_CONFIGURED","message":"Webhook key not configured"}}
```

No webhook secret generated or exposed. Xero Developer Portal not configured.

## 17. Synthetic preview smoke result

Harness: `diagnostic-output/xero-003b-bank-import-smoke.mjs`  
Evidence: `diagnostic-output/xero-003b-bank-import-smoke.json`

| Check | Result |
|-------|--------|
| API ready (local, staging DB) | PASS |
| Authorised bank account seed | PASS (`YC-00000`) |
| Header detection | PASS |
| Dry-run preview | PASS (`preview_ready`) |
| Row classifications | PASS (`imported_awaiting_review`) |
| Technician denied | PASS (403) |
| Webhook safe disabled | PASS (503) |

## 18. Preview batch reverted or removed

**YES** — batch `dcd31aa2-00f8-462b-a077-4f3d9604adef` reverted via `POST …/batches/{id}/revert` → 200 (`reverted: true`)

## 19. No genuine statement uploaded

**YES** — synthetic CSV only (`REF-SYNTH-003B`, invented amounts/descriptions)

## 20. No synthetic batch approved

**YES** — preview-only; no approve call

## 21. No Xero write occurred

**YES** — `XERO_SYNC_ENABLED=false`, `WEBHOOKS_ENABLED=false`; no OAuth or API write paths exercised

## 22. No invoice marked paid

**YES** — preview workflow only; table counts unchanged

## 23. No reconciliation occurred

**YES** — no approve/reconcile actions

## 24. No production access

**YES** — staging project only; production ref never selected

## 25. Protected files unchanged

| File | SHA-256 |
|------|---------|
| `diagnostic-output/130-staging-controlled-deploy.json` | `477c674061e9733afd0c5add3490b43be96d1a5bf8d72ab183b3400549517b95` |
| `diagnostic-output/xero-001-readonly-audit.json` | `602866b74c5f208ab7fe3ed1f28cddfd27c56608ce611eb414dc134b56c1334e` |
| `tests/browser/facebook-choose-correct-page-j67f8.spec.ts` | `60b33e3890a22d1c1c7e00bf000397e0950969eccdfb173e8f682ac0ba890482` |

## 26. Facebook unchanged

**YES** — no Facebook integration code or schema modified in XERO-003B scope

## 27. 307-agent register unchanged

**YES** — `docs/TITAN_MASTER_ACCEPTANCE_REGISTER.md` still records **307 agents, 0 missing**

## 28. Remaining Owner-only configuration

1. **Railway redeploy** staging API + Web from `da6a983a31566dcd4afae571c18b889ac7a815e4`
2. **Private Xero staging webhook** — set `XERO_WEBHOOK_KEY` on API service; configure Xero Developer Portal delivery URL (not performed in this task)
3. Post-deploy UI smoke: Finance → Bank Transactions → Import statement (after Web redeploy)

## 29. Exact next task

**Private Xero staging webhook configuration and verification** (Owner-only; includes Railway redeploy if not done first)

---

## Guard confirmations

- PR #11 **not merged** to main or production
- DASH-001 **not started**
- XERO-002 live proof **not executed**
- No rebase, squash, force-push, or file deletion
- No real bank statement, real Xero write, or webhook secret generation

**STOP FOR OWNER REVIEW**
