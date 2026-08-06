# TITAN XERO-003 — Provider Capability Report

**Captured (UTC):** 2026-08-06  
**Sources:** [Xero Developer webhooks overview](https://developer.xero.com/documentation/guides/webhooks/overview/), [Xero OpenAPI xero-webhooks.yaml](https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero-webhooks.yaml)

---

## Official webhook categories

| Category | CREATE | UPDATE | TITAN use |
|----------|--------|--------|-----------|
| **INVOICE** | Yes | Yes | **Primary** — targeted invoice + payment state refresh |
| **CONTACT** | Yes | Yes | Optional — customer mapping alignment (not full import) |
| **CREDITNOTE** | Yes | Yes | Optional — credit allocation on affected invoices |
| **SUBSCRIPTION** | Yes | Yes | Ignored — app marketplace billing only |

## Not supported by official Xero webhooks

| Entity | Official webhook | TITAN fallback |
|--------|------------------|----------------|
| **Quotes** | **No** | Incremental `If-Modified-Since` pull via `/Quotes`; active-page adaptive refresh |
| **Payments** | **No separate category** | Payment truth refreshed via **invoice** webhook + targeted invoice fetch |
| **Bank transactions** | **No** | Existing slower scheduled import cycle (unchanged) |

---

## Webhook protocol requirements

| Requirement | Official | TITAN implementation |
|-------------|----------|---------------------|
| Signature header | `x-xero-signature` | Verified HMAC-SHA256 base64 |
| Intent to receive | 200 valid / 401 invalid | Implemented in `xero-webhook-signing.ts` |
| Response time | Fast 2xx; process async | 200 immediately; queue async refresh |
| Payload | Metadata only — fetch via API | Targeted `fetchInvoice` after INVOICE events |
| Signing key | One per app; server-side only | `XERO_WEBHOOK_KEY` env var — never in Git/UI |

---

## Incremental retrieval (Accounting API)

| Endpoint | If-Modified-Since | TITAN use |
|----------|-------------------|-----------|
| `/Quotes` | Supported | Quote incremental refresh (max 2 pages per active refresh) |
| `/Invoices` | Supported | Full import jobs + targeted single-invoice fetch |
| `/Payments` | Supported | Via invoice refresh; not standalone webhook |

---

## Rate limits

Xero returns headers including:

- `X-MinLimit-Remaining`
- `X-DayLimit-Remaining`
- `X-AppMinLimit-Remaining`
- `Retry-After`
- `X-Rate-Limit-Problem`
- `Xero-Correlation-Id`

TITAN records these per tenant in `xero_rate_budget_state`, honours `Retry-After`, caps concurrent calls at **5 per tenant**, and prioritises webhook-targeted invoice refreshes.

---

## TITAN design vs official capability

**Invoice path:** Xero webhook → signature verify → 200 ack → dedupe → targeted invoice fetch → local update → SSE invalidation.

**Quote path:** No webhook — incremental `If-Modified-Since` while Quotes page is active; background schedule unchanged as safety backfill.

**Payment path:** No payment webhook category — amount paid / amount due updated from refreshed invoice payload.

**Bank transactions:** Unchanged slower scheduled cycle.
