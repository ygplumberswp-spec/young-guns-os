# TITAN WhatsApp Business Flow Audit

**Date (UTC):** 2026-08-03  
**Branch:** `cursor/titan-v1-integration`  
**Mode:** Approved audit documentation only  
**Constraints:** **Do not implement WhatsApp changes yet.** No commit/deploy from this audit. No demo/fake data. No architecture redesign.

---

## Verdict

**Core Meta Cloud API → `whatsapp_messages` → CRM customer matching → AURA draft context → approve/send is built.**

**Incomplete / unwired:** Communications Hub inbox bridge, Business media ingest, enrichment auto-match + review UI, WhatsApp→job/lead creation, executive WhatsApp KPIs, and hard feature-flag enforcement on live routes.

Staging is honest that WhatsApp is off (`WHATSAPP_ENABLED=false`), but that flag is **not enforced** on connect/webhook/send paths today.

---

## Staging honesty

| Flag | Staging default | Enforcement today |
|------|-----------------|-------------------|
| `WHATSAPP_ENABLED` | `false` | Parsed as `whatsappEnabled = WHATSAPP_ENABLED && PROVIDERS_ENABLED` in `apps/api/src/config.ts` — **not used to gate** WhatsApp routes/webhook/send |
| `PROVIDERS_ENABLED` | `false` (typical) | Required for `whatsappEnabled` config bit only |
| `WEBHOOKS_ENABLED` | `false` | Health reporting — webhook route still mounted |
| `OUTBOUND_MESSAGES_ENABLED` | `false` | **Not checked** in WhatsApp send/approve |
| Meta credentials | Expected unset while gates false | Connection blocked in practice by missing credentials, not by flag enforcement |

---

## Area 1 — Communications Hub bridge

### Current state
- Business WhatsApp lives on `whatsapp_connections` + `whatsapp_messages` (migration `0019`).
- Incoming webhook writes `whatsapp_messages` and can emit hub webhook events when `hubService` is present.
- Communications Platform Hub inbox is driven primarily by `comm_platform_inbox_index` (Gmail indexer path).
- Personal WhatsApp is a **separate** Owner-only path (`comm_platform_accounts.account_kind=personal_whatsapp`) and must stay out of Business search/index.
- Hub settings can reflect Business WhatsApp connection status; fallback chat listing maps raw `whatsapp_messages` rows without real threading.

### Gap
- Webhook **does not** write `comm_platform_inbox_index` for Business WhatsApp → Hub Inbox often shows no Business WA threads.
- Chat grouping is weak (row-as-chat, missing phone/name threading).
- No durable bridge from `whatsapp_messages` → unified Hub conversation UX.

### Recommended connect (when approved — not now)
1. On inbound webhook insert → upsert `comm_platform_inbox_index` with `account_kind=business_whatsapp`, channel `whatsapp`, phone, preview, `customerId` when matched.
2. Group Hub chats by WA id / customer phone; surface in Hub Inbox + business chats API.
3. Keep Personal WhatsApp excluded from Business index/search.

**Key files:** `apps/api/src/services/whatsapp.service.ts`, `routes/whatsapp-webhook.ts`, `services/communications-platform.service.ts`, Hub UI `CommunicationsPlatformPanel.tsx`.

---

## Area 2 — Media support

### Current state
- Inbound non-text types become placeholder text (e.g. `[image message]`).
- No Business download/store pipeline for Meta media IDs.
- Real media handling exists on PCI/Personal paths, not Business Cloud API ingest.

### Gap
- Business media is not stored, previewed, or attached to CRM/job evidence.
- Webhook parses contact name but does **not** persist it.
- No `X-Hub-Signature-256` verification on the webhook.

### Recommended connect (when approved — not now)
1. Either implement Meta media download → tenant-scoped storage + message attachment metadata, **or** ship explicit “text-only Business WhatsApp” honesty in UI/settings.
2. Persist inbound contact display name on message/conversation records.
3. Verify Meta webhook signatures before processing.

**Key files:** `apps/api/src/lib/whatsapp.client.ts`, `services/whatsapp.service.ts`, `routes/whatsapp-webhook.ts`, `packages/db/src/schema/whatsapp-messages.ts`.

---

## Area 3 — Customer enrichment

### Current state
- Basic match: `findCustomerByPhone` (digit normalize + suffix) sets `whatsapp_messages.customer_id` when matched.
- Enrichment scaffold (COM-013): tables `customer_contact_sources`, `whatsapp_match_reviews` (migration `0107`); classifier in `@titan/shared`; API `/api/v1/whatsapp/enrichment/{metrics,reviews,approve}`.
- Safety rules exist: no silent new-customer create from WhatsApp; no silent Xero write.

### Gap
- `runAutoSyncPass` stubs `processed: 0`; not triggered from webhook.
- No staff web UI for match reviews / approve / reject.
- Unmatched inbound traffic does not create a review queue in practice.

### Recommended connect (when approved — not now)
1. Trigger enrichment from inbound unmatched / missing-mobile events.
2. Wire Owner/Manager review UI to existing enrichment approve endpoints.
3. Keep “no auto-create customer / no silent Xero” invariants.

**Key files:** `apps/api/src/services/whatsapp-contact-enrichment.service.ts`, `routes/whatsapp-enrichment.ts`, `packages/shared/src/whatsapp-contact-enrichment.ts`, `TITAN_WHATSAPP_CONTACT_ENRICHMENT.md`.

---

## Area 4 — Job / lead creation flow

### Current state
- CRM customer page can load WhatsApp history, draft, approve/send.
- Hub has generic link actions for indexed items, but Business WA is rarely indexed (see Hub bridge).
- Automations/agents create **drafts only** (`asDraft: true` / draft tools).

### Gap
- No WhatsApp → lead or job create pipeline.
- No first-class “create lead/job from this conversation” office action wired to Business WA threads.
- Forced approval is soft: API still allows immediate send when `asDraft=false` (UI toggle); AURA/automations are draft-first but API is not hard-gated.

### Recommended connect (when approved — not now)
1. Explicit CRM/Hub actions only (never silent import): Create lead / Create job from conversation with phone + matched customer prefill.
2. Depend on Hub index bridge so conversations are discoverable.
3. Optionally harden API to draft-only unless Owner override permission.

**Key files:** WhatsApp routes/services, Hub link flows, CRM `CustomerDetailPage.tsx`, jobs/leads create pages.

---

## Area 5 — Executive metrics

### Current state
- Owner dashboard honesty strip includes WhatsApp provider connection status.
- Integrations dashboard groups WhatsApp under Communications.
- Communications Intelligence can aggregate `whatsapp_messages` into channel usage in places.
- Executive / UC timeline metrics largely count generic `communications` / `uc_timeline_index`.

### Gap
- No dedicated executive WhatsApp KPIs (inbound volume, unmatched rate, pending draft approvals, response SLA).
- UC timeline ingest for Business WhatsApp not found.
- Dashboard visibility is connection-health oriented, not ops-message oriented.

### Recommended connect (when approved — not now)
1. Derive exec metrics from `whatsapp_messages` (+ drafts/approvals), not only `communications`.
2. Optionally index notable events into `uc_timeline_index`.
3. Surface pending Business WA draft approvals on Owner ops/exec surfaces with honest empty states when disabled.

**Key files:** `communications-intelligence.service.ts`, `enterprise-unified-communications.service.ts`, dashboard utility/honesty strips, exec panels.

---

## Area 6 — Feature flag enforcement

### Current state
- Flags parsed in `apps/api/src/config.ts` and documented in staging/production env examples.
- Staging defaults keep WhatsApp conceptually off.

### Gap
- `WHATSAPP_ENABLED`, `OUTBOUND_MESSAGES_ENABLED`, and `WEBHOOKS_ENABLED` are **not enforced** inside WhatsApp connect/send/webhook handlers.
- Risk: if Meta credentials exist while flags are false, routes may still accept traffic.

### Recommended connect (when approved — not now)
1. Gate connect + outbound send/approve on `whatsappEnabled` (+ `outboundMessagesEnabled` for send).
2. Gate webhook processing (or return early/disabled) when `webhooksEnabled` / `whatsappEnabled` is false — with honest API errors.
3. Reflect gated state in Integrations + Hub UI (Disconnected / Disabled by flag).

**Key files:** `apps/api/src/config.ts`, `routes/whatsapp.ts`, `routes/whatsapp-webhook.ts`, `services/whatsapp.service.ts`, staging env name lists.

---

## What is already complete (do not rebuild)

| Capability | Evidence |
|------------|----------|
| Connect / disconnect / templates | `/api/v1/integrations/whatsapp*`, `WhatsappSettingsPage.tsx` |
| Inbound webhook → DB | `GET\|POST /api/v1/webhooks/whatsapp` → `whatsapp_messages` |
| Dedup + tenant resolve | `(companyId, externalMessageId)`; `phone_number_id` → connection |
| Basic customer phone match | `findCustomerByPhone` → `customer_id` |
| Conversation history API/UI | `GET /api/v1/whatsapp/messages?customerId=`; Customer detail |
| AURA draft context | `whatsappService.buildAuraContext()` in `aura-context-build.ts` |
| Draft → approve → Meta send | send `asDraft` + `POST .../messages/:id/approve` |
| Personal vs Business separation | Personal Owner-only; separate tables/account kind |
| Enrichment scaffold | migration `0107` + enrichment API (not auto-wired) |

---

## Explicit non-goals for this slice

- **Not implementing** WhatsApp Hub bridge, media, enrichment wiring, jobs/leads, exec metrics, or flag enforcement in this Operations-focused pass.
- WhatsApp work resumes only after explicit approval.
- Focus returned to **Jobs / Scheduling** operational continuity (completion → invoice → payment).

---

## Source audit

Findings summarized from the approved WhatsApp Business status audit on `cursor/titan-v1-integration` (report-only pass, 2026-08-03). Acceptance cross-refs: COM-001 / COM-003 / COM-005 / COM-013 in `TITAN_MASTER_ACCEPTANCE_REGISTER.md`.
