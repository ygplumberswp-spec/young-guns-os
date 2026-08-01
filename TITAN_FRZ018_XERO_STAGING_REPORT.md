# FRZ-018 Xero Integration — Staging Read-Only Verification Report

**Requirement:** FRZ-018 — Integrations truthful provider states (Xero OAuth + read-only import)  
**Scope:** Staging only (`https://young-guns-os-staging.up.railway.app`)  
**Production ref blocked:** `rshuiaghmtrvvilhqpwm` — not accessed  
**Branch:** `cursor/titan-frozen-scope-completion`  
**Updated (UTC):** 2026-08-01  
**Verdict:** **NO-GO (partial)** — session/UX fixes deployed; OAuth connected (Young Guns Plumbing); contacts import evidenced (49 mappings, 49 sync logs) but `last_sync_at` null, sync job failed (90s contacts timeout); invoices/payments/bank transactions not complete

---

## Executive summary

Staging web/API health **PASS**. UX fixes shipped on branch `cursor/titan-frozen-scope-completion`:

1. **Session on hard refresh** — coerce cross-origin baked `VITE_API_BASE_URL` to same-origin `/api/v1` so httpOnly refresh cookies survive reload through the nginx proxy.
2. **Deep link restore** — protected routes append `returnTo`; login/MFA return to `/integrations/xero` (etc.) instead of role home.
3. **Xero read-only sync UX** — prominent **Sync now (read-only)** on `/integrations/xero` calling full import (`/integration-platform/connectors/sync`); per-entity sync + bank-transaction guidance.

DB probe (FRZ-018e, no Owner token): **49 customer mappings** and sync logs present (progress vs FRZ-018d zero), but **`last_sync_at` still null** and **`last_error` reports 90s contacts timeout** on a failed import job. Invoices, payments, and bank transactions remain unimported. **Owner must retry Sync now (read-only)** after deploy and confirm UI success message.

**Likely prior session bug:** Web bundle baked `https://young-guns-os-staging.up.railway.app` as API base; login Set-Cookie landed on API host while refresh on hard reload hit web proxy without cookie → login redirect. Fixed via `coerceSameOriginApiBase` + inline `__TITAN_API_BASE__=""`.

---

## Prior FRZ-018d summary (unchanged baseline)

Owner signal **"xero synced"** (Sync clicked on staging `/integrations/xero`) was **not corroborated** by read-only staging DB probes: `integration_connections.last_sync_at` remains **null**, `updated_at` unchanged since OAuth (`2026-08-01T10:20:52Z`), **0** `xero_sync_logs`, **0** `integration_sync_jobs`, **0** customer/invoice/payment mappings. OAuth connection remains valid — Young Guns Plumbing connected, encrypted credentials present, `last_error` null, `xero_connected` audit event. Pre-OAuth gates pass: credential gate, tenant isolation, token refresh code coverage (301 unit tests). **No live financial writes**, no FRZ-015 re-run.

**Likely cause (018d):** Sync did not complete successfully on the server (API error, timeout, or UI action did not reach import endpoints). Note: `/integrations/xero` exposed per-entity sync buttons and **Test connection**; dashboard **Sync now** calls `/integration-platform/connectors/sync` for full import.

---

## FRZ-018e post-UX verification (2026-08-01)

| Check | Result |
|-------|--------|
| Web `/healthz` | **PASS** |
| Web runtime same-origin API | **PASS** |
| API `/health/ready` | **PASS** |
| OAuth connected (Young Guns Plumbing) | **PASS-DB** |
| Contacts import | **PASS-DB** — 49 customer mappings, 49 sync logs |
| Invoices import | **PARTIAL** — 0 mappings |
| Payments import | **PARTIAL** — 0 mappings |
| Bank transactions | **PARTIAL** — 0 bank_transaction logs |
| `last_sync_at` | **FAIL** — null (failed job kept partial imports) |
| Session/UX unit tests | **PASS** — 92 web + 301 API xero tests |

Evidence: `diagnostic-output/176-frz018e-xero-staging-post-ux-verify.json`

---

## 1. Credential discovery (no secret values)

| Variable | Staging (inferred) | FRZ-018b (172) | FRZ-018c (174) | FRZ-018d (175) |
|----------|-------------------|----------------|----------------|----------------|
| `PROVIDERS_ENABLED` | Present | Present | Present | Present |
| `XERO_SYNC_ENABLED` | Present | Present | Present | Present |
| `XERO_CLIENT_ID` | Present | Present | Present | Present |
| `XERO_CLIENT_SECRET` | Present | Present | Present | Present |
| `INTEGRATIONS_ENCRYPTION_KEY` | Present | Present | Present | Present |

Structured evidence: `diagnostic-output/175-frz018d-xero-staging-post-sync-verify.json`

---

## 2. OAuth connection (Owner completed — still valid)

**Web entry:** `https://comfortable-determination-staging.up.railway.app/integrations/xero`  
**Callback (Xero app):** `https://young-guns-os-staging.up.railway.app/api/v1/integrations/xero/oauth/callback`

| Field | Value |
|-------|-------|
| Organisation | Young Guns Plumbing |
| Connected at (UTC) | 2026-08-01T10:20:52.209Z |
| Credentials encrypted | Yes |
| Last sync | **None** — unchanged since OAuth |
| Last error | None |
| Audit | `xero_connected` event present |

---

## 3. Verification checklist (11 items) — FRZ-018d post-sync

| # | Item | Result | Detail |
|---|------|--------|--------|
| 1 | Connected organisation | **PASS-DB** | Young Guns Plumbing connected; live `POST /test` deferred |
| 2 | Contacts import (read/list) | **FAIL** | 0 customer mappings; 0 sync logs |
| 3 | Invoices import (read/list) | **FAIL** | 0 invoice mappings; 0 sync logs |
| 4 | Payments import (read/list) | **FAIL** | 0 payment mappings; 0 sync logs |
| 5 | Bank transactions import | **FAIL** | 0 bank_transaction sync logs |
| 6 | lastSyncAt | **FAIL** | Null; `updated_at` unchanged since OAuth |
| 7 | Token refresh / expiry | **PASS (code)** | 60s buffer + inflight dedupe; 301 unit tests pass |
| 8 | Tenant isolation | **PASS** | Probe tenants independent; owner company distinct |
| 9 | Duplicate protection / idempotency | **PASS (code+schema)** | Unique mapping indexes; unit tests; no live sync to verify |
| 10 | Audit evidence | **FAIL** | OAuth audit only; 0 sync logs |
| 11 | Truthful provider status | **PASS** | Probe tenants honestly disconnected |

**FRZ-018d probe totals:** 12 PASS, 4 FAIL, 1 PARTIAL

---

## 4. Live staging probe (2026-08-01 FRZ-018d)

| Test | Result |
|------|--------|
| `/api/v1/health/ready` | **PASS** |
| Unauthenticated `GET /integrations/xero` | **PASS** — 401 |
| DB connected Xero tenant | **PASS** — Young Guns Plumbing |
| DB `last_sync_at` populated | **FAIL** — null |
| DB sync logs | **FAIL** — 0 global |
| DB sync jobs | **FAIL** — 0 for owner tenant |
| DB import mappings | **FAIL** — all zero |
| DB token/connection valid | **PASS** — credentials present, no last_error |
| Tenant isolation | **PASS** |
| Duplicate protection (schema+tests) | **PASS** |
| Secret leak scan | **PASS** |
| Live financial writes | **Not performed** |
| FRZ-015 re-run | **Not performed** |

---

## 5. Unit tests (local)

| Command | Result |
|---------|--------|
| `pnpm --filter @titan/api test -- xero-oauth xero-import-sync` | **301 pass** |

---

## 6. FRZ-018 verdict

| Field | Value |
|-------|-------|
| **Status** | **NO-GO (partial)** |
| **Classification** | OAuth **connected**; contacts **partially imported** (49); full read-only import **incomplete** — sync job timeout |
| **Connected** | **Yes** — Young Guns Plumbing on staging |
| **Evidence** | This report + `176-frz018e-xero-staging-post-ux-verify.json` |

---

## 7. Owner action (required — for GO)

1. After deploy lands, sign in on staging, open `/integrations/xero`, hard-refresh once to confirm session persists.
2. Click **Sync now (read-only)** on the Xero page (or Integrations dashboard **Sync now**). Wait for success banner; note any error.
3. If sync succeeds, signal **"xero synced"** for FRZ-018f re-verify or run:

```bash
OWNER_ACCESS_TOKEN='<staging Bearer>' node diagnostic-output/frz018e-xero-staging-post-ux-verify.mjs
```

4. If sync times out again, check Railway API logs for Xero rate limits / scope errors (prior failure: 90s contacts timeout).

---

## 8. Security compliance

- No Xero secrets printed, logged, or committed
- Only present/absent and connection state reported
- Production Supabase ref not accessed
- No live financial writes
