# FRZ-018 Xero Integration — Staging Read-Only Verification Report

**Requirement:** FRZ-018 — Integrations truthful provider states (Xero OAuth + read-only import)  
**Scope:** Staging only (`https://young-guns-os-staging.up.railway.app`)  
**Production ref blocked:** `rshuiaghmtrvvilhqpwm` — not accessed  
**Branch:** `cursor/titan-frozen-scope-completion`  
**Updated (UTC):** 2026-08-01  
**Verdict:** **PAUSE-OAUTH** — credential gate passed; Owner browser OAuth required before read-only import verify

---

## Executive summary

Owner signal "xero configured" confirmed on staging: `oauthConfigured=true`, `POST /integrations/xero/oauth/start` returns a valid Xero authorize URL (no `OAUTH_NOT_CONFIGURED`). Probe tenant remains honestly disconnected (`hasCredentials=false`) — import checklist items deferred until Owner completes **Sign in with Xero** in browser. Pre-OAuth gates pass: tenant isolation, truthful provider status, sync blocked when disconnected, token refresh covered in code + unit tests. No live financial writes to Xero, no OAuth automation, no FRZ-015 re-run.

---

## 1. Credential discovery (no secret values)

| Variable | Staging (inferred) | Prior run (171) | This run (172) |
|----------|-------------------|-----------------|----------------|
| `PROVIDERS_ENABLED` | Present | Present | Present |
| `XERO_SYNC_ENABLED` | **Present (inferred)** | Absent | Present via `oauthConfigured=true` |
| `XERO_CLIENT_ID` | **Present (inferred)** | Absent | Present via OAuth start success |
| `XERO_CLIENT_SECRET` | **Present (inferred)** | Absent | Present via OAuth start success |
| `INTEGRATIONS_ENCRYPTION_KEY` | Present | Present | Present |

Structured evidence: `diagnostic-output/172-frz018-xero-staging-readonly-verify.json`

---

## 2. OAuth URL (Owner action)

**Web entry:** `https://comfortable-determination-staging.up.railway.app/integrations/xero`  
**Callback (Xero app):** `https://young-guns-os-staging.up.railway.app/api/v1/integrations/xero/oauth/callback`

Owner: open staging web → Integrations → Xero → **Sign in with Xero**. Agent cannot perform browser OAuth.

---

## 3. Verification checklist (11 items)

| # | Item | Result | Detail |
|---|------|--------|--------|
| 1 | Connected organisation | **PAUSE** | No connected tenant on probe account; Owner OAuth required |
| 2 | Contacts import (read/list) | **PAUSE** | Deferred until connected |
| 3 | Invoices import (read/list) | **PAUSE** | Deferred until connected |
| 4 | Payments import (read/list) | **PAUSE** | Deferred until connected |
| 5 | Bank transactions import | **PAUSE** | Deferred until connected (via full read sync) |
| 6 | lastSyncAt | **PAUSE** | Deferred until connected |
| 7 | Token refresh / expiry | **PASS (code)** | 60s buffer + inflight dedupe; 301 unit tests pass |
| 8 | Tenant isolation | **PASS** | Independent disconnected state; no shared sync logs |
| 9 | Duplicate protection / idempotency | **PAUSE** | Deferred until connected |
| 10 | Audit evidence | **PAUSE** | Sync logs API exists; deferred until import |
| 11 | Truthful provider status | **PASS** | `configured_unverified` / disconnected honest; sync → `NOT_CONNECTED` |

**Live probe totals:** 14 PASS, 0 FAIL, 8 PAUSE

---

## 4. Live staging probe (2026-08-01)

| Test | Result |
|------|--------|
| `/api/v1/health/ready` | **PASS** |
| Unauthenticated `GET /integrations/xero` | **PASS** — 401 |
| OAuth callback (error path) | **PASS** — 302 honest redirect |
| Owner signup + session | **PASS** |
| `oauthConfigured=true` | **PASS** — credential gate cleared |
| Truthful disconnected state | **PASS** |
| `POST /oauth/start` | **PASS** — authorize URL issued |
| Hub provider status | **PASS** — `configured_unverified` |
| Tenant isolation (2 tenants) | **PASS** |
| Sync when disconnected | **PASS** — `NOT_CONNECTED` |
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
| **Status** | **PAUSE-OAUTH** |
| **Classification** | Credential gate **passed**; read-only import verify **blocked on Owner browser OAuth** |
| **Connected** | **No** (on probe tenant; Owner tenant unknown to agent) |
| **Evidence** | This report + `172-frz018-xero-staging-readonly-verify.json` |

---

## 7. Owner action (one step)

Open `https://comfortable-determination-staging.up.railway.app/integrations/xero` → **Sign in with Xero** → authorize staging org. After connected, re-run FRZ-018 Phase C read-only import verify (contacts, invoices, payments, bank transactions — GET/list only).

---

## 8. Phase C (deferred)

Post-OAuth read-only verify runs when staging DB shows `status=connected` with OAuth credentials on Owner's tenant. Agent will re-probe import endpoints and duplicate protection on next Owner signal.

---

## 9. Security compliance

- No Xero secrets printed, logged, or committed
- Only present/absent and connection state reported
- Production Supabase ref not accessed
- No live financial writes
