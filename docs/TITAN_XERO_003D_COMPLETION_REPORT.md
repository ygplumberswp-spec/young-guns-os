# TITAN XERO-003D — Webhook Malformed-Payload Hardening

**Status:** STOP FOR OWNER APPROVAL  
**Canonical branch:** `cursor/titan-v1-integration`  
**Starting HEAD:** `6fe0743e3c6b42b12733523540d10629fe0ea623`

---

## Root cause

Global `express.json()` parsed webhook POST bodies before the Xero route handler ran. Malformed JSON triggered Express's parser error, which surfaced as **500 INTERNAL_ERROR** instead of reaching HMAC verification and the service's **400 INVALID_PAYLOAD** path.

---

## Fix

1. Mount `express.raw({ type: 'application/json' })` on `/api/v1/webhooks/xero` **before** global JSON middleware so the raw body is preserved for HMAC verification.
2. Extract structural validation to `apps/api/src/lib/xero-webhook-payload.ts`.
3. Return **400** for invalid JSON or structurally invalid envelopes after signature verification passes.
4. Sanitise async error logging (no stack/raw payload in responses).

---

## Response matrix

| Case | HTTP | Code |
|------|-----:|------|
| Valid signature + valid payload | 200 | `{ received: N }` |
| Missing signature | 401 | `INVALID_SIGNATURE` |
| Invalid signature | 401 | `INVALID_SIGNATURE` |
| Webhook not configured | 503 | `WEBHOOK_NOT_CONFIGURED` |
| Valid signature + malformed JSON | **400** | `INVALID_PAYLOAD` |
| Valid signature + invalid structure | **400** | `INVALID_PAYLOAD` |
| Valid empty validation envelope | 200 | `{ received: 0 }` |
| Unsupported category (well-formed) | 200 | skipped safely |
| Unexpected internal failure | 500 | `INTERNAL_ERROR` (no stack trace) |

Malformed input creates **no** `xero_webhook_events` row and **no** targeted refresh job.

---

## Tests added

- `apps/api/src/lib/xero-webhook-payload.test.ts` (7 tests)
- `apps/api/src/services/xero-realtime-intersync.service.test.ts` (10 tests)
- `apps/api/src/routes/xero-webhook.test.ts` (3 HTTP integration tests)

**STOP FOR OWNER APPROVAL**
