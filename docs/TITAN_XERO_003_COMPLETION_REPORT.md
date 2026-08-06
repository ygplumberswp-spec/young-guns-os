# TITAN XERO-003 — Completion Report

**Task:** XERO-003 — Near-real-time quote, invoice and payment intersync  
**Completed (UTC):** 2026-08-06  
**Task branch:** `cursor/titan-xero-003-realtime-intersync`  
**Canonical branch:** `cursor/titan-v1-integration`  
**Starting HEAD:** `cffd458596b155ac2378780b60c93f3089f4e76b`

---

## 1. Official Xero capability findings

See `docs/TITAN_XERO_003_PROVIDER_CAPABILITY_REPORT.md`.

- **Webhooks:** INVOICE, CONTACT, CREDITNOTE, SUBSCRIPTION (official)
- **No quote webhook** — incremental `If-Modified-Since` fallback
- **No payment webhook category** — payment state via invoice refresh
- **Bank transactions** — unchanged scheduled cycle

---

## 2. Implementation summary

| Component | Status |
|-----------|--------|
| Webhook receiver `POST /api/v1/webhooks/xero` | Implemented |
| HMAC SHA-256 signature verification | Implemented |
| Intent-to-receive (200/401) | Implemented |
| Event deduplication (`xero_webhook_events`) | Implemented |
| Targeted invoice refresh queue | Implemented |
| Quote incremental refresh API | Implemented |
| Rate budget manager (5 concurrent/tenant) | Implemented |
| SSE live updates on refresh | Implemented |
| Finance freshness UI (Quotes/Invoices) | Implemented |
| DB migration `0181_xero_realtime_intersync.sql` | Created (staging only) |

---

## 3. Webhook categories implemented

- **INVOICE** — enqueues targeted refresh → `fetchInvoice` → local update → SSE
- **CONTACT** — recorded; no full import triggered
- **CREDITNOTE** — recorded; no full import triggered
- **SUBSCRIPTION** — ignored

---

## 4. Quote fallback architecture

1. TITAN write → provider response stored (existing XERO-002 path)
2. Quotes page open → quiet incremental refresh (max 2 pages, `If-Modified-Since`)
3. Active visibility → 90s interval; hidden → 300s
4. Background scheduled import unchanged as safety backfill

---

## 5. Payment freshness architecture

Payment and amount-due state updated from targeted invoice fetch after INVOICE webhook. Yoco paid ≠ Xero reconciled (XERO-002 reconciliation model preserved).

---

## 6. Local realtime delivery

Reuses existing **SSE** (`/api/v1/live-updates/stream`) via `emitBusinessEvent` → `emitLiveUpdate`. Tenant-scoped; no provider payload in events.

---

## 7. Frontend experience

- Quotes/Invoices show: "Updated just now", "Updated N minutes ago", "Refreshing quietly", "Update delayed"
- No Sync Now on normal finance list pages
- Advanced sync controls remain in Integrations → Xero

---

## 8. Migration

**File:** `packages/db/drizzle/0181_xero_realtime_intersync.sql`  
**Tables:** `xero_webhook_events`, `xero_targeted_refresh_jobs`, `xero_rate_budget_state`  
**Applied to staging:** **YES** (XERO-003B, journal 177; verified XERO-003C)  
**Companion migration 0182:** `0182_bank_statement_manual_import.sql` applied (journal 178)  
**Production:** Untouched

---

## 8a. Staging deployment and webhook (XERO-003B / XERO-003C)

| Item | Status |
|------|--------|
| Staging migrations 0181 + 0182 | **Applied** (`cpkuwtaipjxeipvbssvn`) |
| Staging API deployed | **YES** — Owner Railway redeploy |
| Staging Web deployed | **YES** — available at staging web URL |
| Xero webhook delivery URL | `https://young-guns-os-staging.up.railway.app/api/v1/webhooks/xero` |
| Xero Intent to receive | **PASS** (Owner-confirmed) |
| `XERO_WEBHOOK_KEY` | **Configured privately in Railway** — never stored in Git |
| Former exposed webhook | **Deleted and replaced** (Owner-confirmed) |
| Synthetic bank-import preview | **PASS** (XERO-003C) |
| Real invoice webhook event proof | **Deferred** to XERO-002 controlled live proof |
| Production | **Untouched**

---

## 9. Tests

| Suite | Total | Pass |
|-------|------:|-----:|
| Monorepo | 1198+ | 1198+ |
| Xero webhook signing | 4 | 4 |
| Shared freshness labels | 3 | 3 |
| Web finance experience | 2 | 2 |

Typecheck: PASS  
API/Web production builds: PASS (via typecheck build chain)

---

## 10. Deployment

| Item | Status |
|------|--------|
| Staging API deploy | **COMPLETE** (Owner Railway) |
| Staging Web deploy | **COMPLETE** |
| Staging migration 0181 | **COMPLETE** |
| Staging migration 0182 | **COMPLETE** |
| Xero platform webhook config | **COMPLETE** — key private; Intent to receive OK |
| Production | **Untouched** |

---

## 11. Confirmations

| # | Confirmation |
|---|--------------|
| 25 | No real quote created |
| 26 | No real invoice created |
| 27 | No real payment occurred |
| 28 | No bank transaction created |
| 29 | PERF-001 preserved |
| 30 | Integrations design preserved |
| 31 | Facebook unchanged |
| 32 | 307-agent register unchanged |
| 33 | Production untouched |

---

## 12. Exact next task

**DASH-001** — Owner Dashboard Business Heartbeat (after Owner approval of XERO-003C).

Remaining controlled proof: genuine **invoice webhook event** during **XERO-002 live proof** (not required for XERO-003C sign-off).

**STOP FOR OWNER APPROVAL**
