# TITAN WhatsApp Customer Contact Enrichment — Binding Specification

**Status:** BINDING  
**Branch:** `cursor/titan-frozen-scope-completion`  
**Updated (UTC):** 2026-08-01  
**Staging ref:** `cpkuwtaipjxeipvbssvn` only — **never** production `rshuiaghmtrvvilhqpwm`

---

## 1. Purpose

When WhatsApp Business is connected, TITAN **auto-helps complete missing mobiles** for **legitimate Young Guns customers only**. WhatsApp contacts are **never** imported as new customers.

WhatsApp enriches existing CRM records with auditable contact-source history. Manual review is the fallback, not the primary path when auto-sync is healthy.

---

## 2. Customer eligibility (cross-ref — do not duplicate)

Legitimate customer sources use **Customer Value Classification** (`packages/shared/src/customer-value-classification.ts`):

| Classification | Eligible for enrichment |
|----------------|------------------------|
| `verified_invoiced_customer` | Yes |
| `paying_customer` | Yes |
| `fully_paid_customer` | Yes (priority) |
| `partially_paid_customer` | Yes |
| `unpaid_debtor` | Yes |
| `overdue_debtor` | Yes |
| `prospect_contact` | **No** |
| `supplier_only_contact` | **No** |

**Prioritization:** `fully_paid_customer` → `paying_customer` → other eligible classes (see `enrichmentPriorityRank()`).

**Related:** UX-H buyer classification (`marketing-eligibility.ts`) remains separate — used for marketing consent, not enrichment eligibility.

---

## 3. Matching rules

### 3.1 Evidence signals (corroboration required)

Matching may use: name, company, site contact, address, suburb, job #, Xero invoice/ref, quote ref, message content, email, partial phone, job/invoice dates.

**Name alone is never sufficient** for auto-link (`name_only_insufficient`).

### 3.2 Match classes

| Class | Meaning | Auto-link |
|-------|---------|-----------|
| `exact_verified` | All rules pass; confidence ≥ 85; missing mobile | **Yes** (TITAN save) |
| `high_confidence` | Strong evidence; confidence ≥ 65 | Review → approve |
| `review_required` | Moderate evidence; confidence ≥ 40 | Review → approve |
| `conflicting` | Evidence conflicts with existing phone/customer | Review only |
| `no_match` | Insufficient / excluded (supplier, prospect) | No action |

Pure classifier: `classifyWhatsAppMatch()` in `@titan/shared`.

---

## 4. Contact source history

Each enrichment writes/updates `customer_contact_sources`:

| Field | Requirement |
|-------|-------------|
| `normalizedMobile` | SA E.164 via `normalizeSaMobile()` |
| `originalFormat` | Raw WhatsApp/profile format |
| `source` | `whatsapp_conversation` / `manual_review` / etc. |
| `conversationRef` | WhatsApp thread reference |
| `evidence` | Weighted evidence items + codes |
| `confidenceScore` | 0–100 |
| `matchClassification` | Enum |
| `history` | Append-only audit trail |
| `isVerified` | True after approved link |
| `isServiceSafe` | Operational contact OK |
| `marketingConsentStatus` | **Separate** — never inferred from WhatsApp |

---

## 5. Xero boundary

| Action | Rule |
|--------|------|
| TITAN customer phone save | After review approval (or exact_verified auto-link) |
| Xero contact update | **Separate explicit Owner-approved sync-back** — never silent |
| Guard | `assertNoSilentXeroWrite()` |

---

## 6. WhatsApp safety

- **Tenant isolation:** all queries filter `company_id`; RBAC on enrichment routes
- **No unauthorized role access:** `integrations:read` / `integrations:manage` / `communications:write` / `crm:*`
- **No unrelated personal contacts** imported as customers
- **No suppliers as customers** — `supplier_only` excluded
- **No auto-send** — enrichment does not send messages
- **No consent inference** — marketing consent tracked in `customer_marketing_consents`
- **Preserve opt-outs** — `do_not_contact` blocks auto-link
- **Audit history** — `customer_contact_sources.history`, `whatsapp_match_reviews`

---

## 7. Auto-sync queue discipline

**Queues BEHIND** active Xero import + global auto-sync:

1. Check `integration_sync_jobs` for running/pending Xero jobs
2. If import in progress → state `queued_behind_xero`; block approvals
3. Priority constant: `WHATSAPP_ENRICHMENT_QUEUE_PRIORITY = 50` (lower than Xero)

After WhatsApp connect (when Xero quiescent):

1. Auto-import permitted conversations (webhook + stored messages; live Meta fetch stubbed without creds)
2. Process messages for match evidence
3. Re-check matches on new evidence; update confidence; dedupe
4. Resume after restart via DB checkpoints
5. Truthful UI states via `WhatsAppEnrichmentMetrics.autoSyncState`

Manual review = fallback only.

---

## 8. Dashboard metrics (drill-down)

`GET /api/v1/whatsapp/enrichment/metrics` returns:

| Metric | Drill-down filter |
|--------|-------------------|
| Match class buckets | `?matchClassification=` |
| Paid/fully paid missing mobile | `?missingMobile=true&valueClassification=` |
| Review pending | `?status=pending` |
| Eligible missing mobile | metrics.totals |
| Conversations imported | message count |
| Contact sources verified / service-safe | contactSources.* |
| Safety counters | safety.* |

---

## 9. API routes (scaffold)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/whatsapp/enrichment/metrics` | Dashboard counts |
| GET | `/api/v1/whatsapp/enrichment/reviews` | Review queue |
| POST | `/api/v1/whatsapp/enrichment/reviews/:id/approve` | Approval-gated TITAN save |

---

## 10. Schema (migration `0107`)

- `customer_contact_sources` — tenant-scoped enrichment history
- `whatsapp_match_reviews` — human review queue

Apply locally/disposable only when safe; **not staging during active Xero import**.

---

## 11. Implementation map

| Layer | File |
|-------|------|
| Binding spec | `TITAN_WHATSAPP_CONTACT_ENRICHMENT.md` |
| Shared types | `packages/shared/src/whatsapp-contact-enrichment.ts` |
| Service | `apps/api/src/services/whatsapp-contact-enrichment.service.ts` |
| Routes | `apps/api/src/routes/whatsapp-enrichment.ts` |
| DB schema | `packages/db/src/schema/whatsapp-contact-enrichment.ts` |
| Migration | `packages/db/drizzle/0107_whatsapp_contact_enrichment.sql` |
| CVC cross-ref | `packages/shared/src/customer-value-classification.ts` |
| Auto-sync arch | `TITAN_INTEGRATION_AUTO_SYNC_ARCHITECTURE.md` |

---

## 12. Explicit prohibitions

- Do **not** connect live WhatsApp or send messages in this sprint
- Do **not** import WhatsApp contacts as customers
- Do **not** interrupt Xero import
- Do **not** delete data without Owner approval
- Do **not** re-run FRZ-015

---

## 13. Dependencies

| Dependency | Status |
|------------|--------|
| Customer Value Classification | Required — parallel work (`customer-value-classification.ts`) |
| Xero invoice/payment import | Partial — enrichment queues behind import |
| WhatsApp Business connected | Staging state probed read-only in evidence JSON |

---

## 14. Acceptance criteria

1. Shared types + pure classifier unit tests pass
2. Service scaffold returns honest disconnected/partial states
3. Approval path updates TITAN only; Xero sync-back opt-in separate
4. No duplicate customer create from WhatsApp path
5. Tenant isolation enforced on routes
6. Control docs + evidence JSON updated
