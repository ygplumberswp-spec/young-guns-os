# FRZ-018 Xero Integration — Staging Read-Only Verification Report

**Requirement:** FRZ-018 — Integrations truthful provider states (Xero OAuth + read-only import)  
**Scope:** Staging only (`https://young-guns-os-staging.up.railway.app`)  
**Production ref blocked:** `rshuiaghmtrvvilhqpwm` — not accessed  
**Branch:** `cursor/titan-frozen-scope-completion`  
**Updated (UTC):** 2026-08-01  
**Verdict:** **PARTIAL** — Owner OAuth corroborated (Young Guns Plumbing connected); live read-only import verify deferred (Owner session token required)

---

## Executive summary

Owner signal **"xero connected"** corroborated on staging: staging DB shows **1 connected Xero tenant** — organisation **Young Guns Plumbing**, `connectedAt=2026-08-01T10:20:52Z`, encrypted credentials present, `xero_connected` security audit event recorded. Pre-OAuth and post-OAuth gates pass: credential gate, tenant isolation, truthful provider status, token refresh code coverage (301 unit tests). **Live read-only import checklist** (contacts, invoices, payments, bank transactions, duplicate protection) **not executed** — Owner OAuth was on their existing staging login; agent has no Owner Bearer token. Optional re-run: `OWNER_ACCESS_TOKEN=<staging Bearer> node diagnostic-output/frz018c-xero-staging-readonly-verify.mjs`. No live financial writes to Xero, no OAuth automation, no FRZ-015 re-run.

---

## 1. Credential discovery (no secret values)

| Variable | Staging (inferred) | FRZ-018b (172) | FRZ-018c (174) |
|----------|-------------------|----------------|----------------|
| `PROVIDERS_ENABLED` | Present | Present | Present |
| `XERO_SYNC_ENABLED` | Present | Present | Present |
| `XERO_CLIENT_ID` | Present | Present | Present |
| `XERO_CLIENT_SECRET` | Present | Present | Present |
| `INTEGRATIONS_ENCRYPTION_KEY` | Present | Present | Present |

Structured evidence: `diagnostic-output/174-frz018c-xero-staging-readonly-verify.json`

---

## 2. OAuth connection (Owner completed)

**Web entry:** `https://comfortable-determination-staging.up.railway.app/integrations/xero`  
**Callback (Xero app):** `https://young-guns-os-staging.up.railway.app/api/v1/integrations/xero/oauth/callback`

| Field | Value |
|-------|-------|
| Organisation | Young Guns Plumbing |
| Connected at (UTC) | 2026-08-01T10:20:52.209Z |
| Credentials encrypted | Yes |
| Last sync | None yet |
| Audit | `xero_connected` event present |

---

## 3. Verification checklist (11 items)

| # | Item | Result | Detail |
|---|------|--------|--------|
| 1 | Connected organisation | **PASS-DB** | DB corroborated Young Guns Plumbing; live `POST /test` deferred |
| 2 | Contacts import (read/list) | **PARTIAL** | Live import deferred — Owner session token required |
| 3 | Invoices import (read/list) | **PARTIAL** | Live import deferred |
| 4 | Payments import (read/list) | **PARTIAL** | Live import deferred |
| 5 | Bank transactions import | **PARTIAL** | Live import deferred (via full read sync) |
| 6 | lastSyncAt | **PARTIAL** | Null in DB; no sync run yet |
| 7 | Token refresh / expiry | **PASS (code)** | 60s buffer + inflight dedupe; 301 unit tests pass |
| 8 | Tenant isolation | **PASS** | Probe tenants independent; owner company distinct |
| 9 | Duplicate protection / idempotency | **PARTIAL** | Deferred until live import run |
| 10 | Audit evidence | **PARTIAL** | OAuth audit PASS; sync logs empty (0 rows) |
| 11 | Truthful provider status | **PASS** | Probe tenants honestly disconnected |

**Live probe totals:** 14 PASS, 0 FAIL, 8 PARTIAL

---

## 4. Live staging probe (2026-08-01 FRZ-018c)

| Test | Result |
|------|--------|
| `/api/v1/health/ready` | **PASS** |
| Unauthenticated `GET /integrations/xero` | **PASS** — 401 |
| OAuth callback (error path) | **PASS** — 302 honest redirect |
| Probe signup + session | **PASS** |
| `oauthConfigured=true` | **PASS** |
| DB connected Xero tenant | **PASS** — Young Guns Plumbing |
| DB `xero_connected` audit | **PASS** |
| Tenant isolation (probe + foreign) | **PASS** |
| Owner company vs foreign distinct | **PASS** |
| Secret leak scan | **PASS** |
| Live financial writes | **Not performed** |
| FRZ-015 re-run | **Not performed** |

---

## 5. Unit tests (local)

| Command | Result |
|---------|--------|
| `pnpm --filter @titan/api test -- xero-oauth` | **301 pass** |

---

## 6. FRZ-018 verdict

| Field | Value |
|-------|-------|
| **Status** | **PARTIAL** |
| **Classification** | OAuth **connected and DB-corroborated**; read-only import verify **blocked on Owner session token** |
| **Connected** | **Yes** — Young Guns Plumbing on staging |
| **Evidence** | This report + `174-frz018c-xero-staging-readonly-verify.json` |

---

## 7. Owner action (optional — for GO on import checklist)

1. In staging web (logged in as Owner), open DevTools → Network or Application storage and copy the Bearer access token from an authenticated API call.  
2. Re-run locally (token not stored in repo):

```bash
OWNER_ACCESS_TOKEN='<staging Bearer>' node diagnostic-output/frz018c-xero-staging-readonly-verify.mjs
```

Alternatively: click **Sync now** on `/integrations/xero` in staging UI (read-only import paths only).

---

## 8. Security compliance

- No Xero secrets printed, logged, or committed
- Only present/absent and connection state reported
- Production Supabase ref not accessed
- No live financial writes
