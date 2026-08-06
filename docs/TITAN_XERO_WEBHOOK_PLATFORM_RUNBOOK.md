# TITAN XERO Webhook — Platform Runbook

**Audience:** Platform Owner only — not shown to tenant customers.  
**Task:** XERO-003  
**Updated (UTC):** 2026-08-06

---

## Staging callback URL

```
https://young-guns-os-staging.up.railway.app/api/v1/webhooks/xero
```

Production callback URL must **not** be configured until Owner approves production GO.

---

## Required Xero Developer Portal settings

1. Open the TITAN Xero app in [Xero Developer Portal](https://developer.xero.com/app/manage).
2. Navigate to **Webhooks**.
3. Set delivery URL to the staging callback above.
4. Subscribe to event categories:
   - **INVOICE** (CREATE, UPDATE)
   - **CONTACT** (optional — customer alignment)
   - **CREDITNOTE** (optional — credit allocations)
5. Do **not** subscribe to SUBSCRIPTION unless marketplace billing is required.

---

## Environment variable (API service)

| Variable | Required | Notes |
|----------|----------|-------|
| `XERO_WEBHOOK_KEY` | Yes | Webhook signing key from Xero app dashboard |
| `WEBHOOKS_ENABLED` | Yes | Must be `true` on staging for receiver to accept events |

**Never** commit the signing key to Git, documentation, screenshots, or client-visible output.

---

## Intent-to-receive validation

1. Deploy API with `XERO_WEBHOOK_KEY` set and `WEBHOOKS_ENABLED=true`.
2. Save webhook URL in Xero Developer Portal.
3. Xero sends a validation payload — TITAN must return **HTTP 200** when signature is valid, **401** when invalid.
4. Confirm validation succeeds in Xero dashboard before enabling live delivery.

Manual probe (invalid signature — expect 401):

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  -X POST 'https://young-guns-os-staging.up.railway.app/api/v1/webhooks/xero' \
  -H 'Content-Type: application/json' \
  -H 'x-xero-signature: invalid' \
  -d '{"events":[],"firstEventSequence":1,"lastEventSequence":1,"entropy":"test"}'
```

---

## Health verification

| Check | Expected |
|-------|----------|
| Invalid signature | 401 |
| Webhooks disabled | 503 |
| Missing key | 503 |
| Valid signed payload | 200 + async processing |

Review API logs for `[xero-webhook]` processing entries (sanitized — no payload secrets).

---

## Rollback / disable procedure

1. Set `WEBHOOKS_ENABLED=false` on API service → redeploy.
2. Remove or disable webhook URL in Xero Developer Portal.
3. Targeted refresh queue stops accepting new webhook events; existing scheduled import remains as backfill.
4. No data deletion required — `xero_webhook_events` retains audit history.

---

## Customer organisations

Tenants connecting Xero via OAuth **never** configure:

- Webhook URLs
- Signing keys
- Client secrets
- Developer dashboard settings

This is one-time TITAN platform administration.
