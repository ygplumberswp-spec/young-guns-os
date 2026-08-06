# TITAN XERO-003C — Final Staging Webhook and Finance Verification

**Status:** STOP FOR OWNER APPROVAL  
**Canonical branch:** `cursor/titan-v1-integration`  
**HEAD:** `878f1b5f154bf9e2c535b55669ceec16550536a1`  
**Staging Supabase:** `cpkuwtaipjxeipvbssvn`  
**Production:** not accessed

---

## Executive summary

| Phase | Result |
|-------|--------|
| A. Precheck | PASS |
| B. Webhook configuration verification | PASS |
| C. Webhook data safety | PASS |
| D. Quote read-freshness verification | PASS |
| E. Invoice/payment UI verification | PASS |
| F. Bank-statement import staging smoke | PASS |
| G. Regression, performance, tests/builds | PASS |
| H. Documentation | Updated |

Evidence harness: `diagnostic-output/xero-003c-staging-verification.mjs`  
Evidence output: `diagnostic-output/xero-003c-staging-verification.json`

---

## 1. Starting and ending HEAD

Both: `878f1b5f154bf9e2c535b55669ceec16550536a1`

---

## 2. Staging API and Web health

| Endpoint | Result |
|----------|--------|
| `GET …/api/v1/health/ready` | **200** — `webhooksEnabled: true`, database connected |
| `GET …/api/v1/health` | **200** — service titan-api v0.2.0 |
| Staging Web root | **200** — bundle `index-B_kjmeGy.js` + vendor splits (`vendor-react`, `vendor-router`) |

---

## 3. Migration 0181 / 0182 confirmation

Journal count **178** on staging (`cpkuwtaipjxeipvbssvn`):

- **0181** `xero_realtime_intersync` — applied
- **0182** `bank_statement_manual_import` — applied

All expected tables and indexes present (verified via migration verify script).

---

## 4. Webhook environment presence (no values printed)

| Check | Evidence |
|-------|----------|
| `XERO_WEBHOOK_KEY` configured | Live POST returns **401 INVALID_SIGNATURE**, not **503 WEBHOOK_NOT_CONFIGURED** |
| `WEBHOOKS_ENABLED` | `/health/ready` reports `webhooksEnabled: true` |
| Endpoint registered | `POST /api/v1/webhooks/xero` responds on live staging |

---

## 5–7. Webhook rejection matrix

| Case | HTTP | Code |
|------|-----:|------|
| Missing signature | 401 | `INVALID_SIGNATURE` |
| Invalid signature | 401 | `INVALID_SIGNATURE` |
| Malformed body + invalid sig | ~~500~~ **401** after XERO-003D (raw body preserved; no JSON parser 500) |
| Valid signature + malformed JSON | **400** `INVALID_PAYLOAD` (service + route tests; live invalid-sig probe cannot sign without key) |

---

## 8. Xero Intent-to-receive Owner evidence

Owner-confirmed:

- Fresh Invoices webhook created in Xero Developer Portal
- Delivery URL: `https://young-guns-os-staging.up.railway.app/api/v1/webhooks/xero`
- Intent to receive returned **OK**
- Configuration saved
- Former exposed webhook **deleted and replaced**
- Current key stored **privately in Railway only**

---

## 9. Validation traffic / log evidence

- Harness used **invalid signatures only** on live staging — no key material accessed
- Local API log tail contains startup/health lines only — **no signature or payload secrets**
- No webhook processing loop observed during verification window

---

## 10. Webhook event counts

| Metric | Before | After |
|--------|-------:|------:|
| `xero_webhook_events` | 0 | 0 |
| `xero_targeted_refresh_jobs` | 0 | 0 |
| `invoices` | 594 | 594 |
| `payments` | 512 | 512 |

Intent-to-receive validation traffic did not persist duplicate processing rows in the verification window.

---

## 11. No secret leakage

Confirmed — harness and report contain **no env values**, **no webhook key**, **no valid signatures**.

---

## 12. Quote incremental-refresh verification

| Check | Result |
|-------|--------|
| Endpoint available | `POST /integrations/xero/quotes/incremental-refresh` — live **401** auth gate; local route registered |
| Tenant-scoped | Wrong-tenant token does not succeed (401/403/500/503) |
| If-Modified-Since | Code contract in `refreshQuotesIncrementalFromXero` |
| Max two pages | `maxPages = options?.maxPages ?? 2` |
| Adaptive timing | 90s visible / 300s hidden in `useXeroFinanceRefresh` |
| No full historical import | Incremental path only; no manual sync on list pages |
| No Sync Now on Quotes | UI contract verified |

---

## 13. Invoice / payment UI verification

| Check | Result |
|-------|--------|
| Invoices page freshness UI | `FinanceFreshnessLine` present; no Sync Now |
| Payment status truthfulness | XERO-002 model preserved — Yoco paid ≠ Xero reconciled |
| No technical diagnostics on finance lists | Confirmed via page source contracts |
| Finance freshness endpoint | **200** for authorised owner session |
| No state changes | invoices 594, payments 512 unchanged |

Real invoice webhook event proof: **deferred to XERO-002 controlled live proof**.

---

## 14. Synthetic bank-import preview result

All checks **PASS** (local API + staging DB; live route **401** auth gate):

- Header detection, dry-run preview (`preview_ready`), classifications (`imported_awaiting_review`)
- Owner access OK; Technician **403**; Client **403**
- Upload alone does not approve; no Xero payment; no reconciliation

Batch: `786bf11f-4d74-49ae-8fc5-c4d6cd6248ce` — **reverted**

---

## 15. Preview batch removed

**YES** — `bankBatchReverted: true` (status `reverted` in staging DB)

---

## 16. Test totals

| Package | Tests | Pass |
|---------|------:|-----:|
| @titan/shared | 1130 | 1130 |
| @titan/auth | 24 | 24 |
| @titan/web | 389 | 389 |
| @titan/api | 1216 | 1216 |
| **Total** | **2759** | **2759** |

Includes webhook signing, bank-import, RBAC, tenant-isolation, and finance experience coverage.

---

## 17. Typecheck and builds

- `pnpm typecheck` — PASS
- `@titan/api` build — PASS
- `@titan/web` build — PASS

---

## 18–23. Safety and regression confirmations

| # | Confirmation |
|---|-------------|
| 18 | **No Xero write** |
| 19 | **No invoice marked paid** |
| 20 | **No reconciliation occurred** |
| 21 | **Facebook and Yoco unchanged** |
| 22 | **307-agent register complete** (0 missing) |
| 23 | **Production untouched** |

PERF-001 bundle splitting intact on staging Web (separate vendor chunks).

Protected untracked files unchanged (checksums match XERO-003B baseline).

---

## 24. Remaining controlled proof item

**Genuine INVOICE webhook event** end-to-end (receive → targeted refresh → SSE) — deferred to **XERO-002 controlled live proof**.

---

## 25. Exact next task

**DASH-001 — Owner Dashboard Business Heartbeat**

**STOP FOR OWNER APPROVAL** — Do not begin DASH-001 automatically.
