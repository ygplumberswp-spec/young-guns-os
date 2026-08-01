# TITAN Provider State Register

**Updated (UTC):** 2026-08-01 — Phase 0  
**Rule:** No provider marked **Connected** without verified credential + successful server-side test.

---

## Summary

| State | Count |
|-------|------:|
| Connected (verified this cycle) | 0 |
| Configured locally, not verified | 1 (OpenAI env — prior session log only) |
| Disconnected / not configured | Most |
| Honesty-only (no backend) | 2 (gmail, n8n UI cards) |
| Planned registry entry | 5 |
| Blocked — credential required | 5+ |

---

## Provider register

| Provider | Surface | Config path | Credential storage | Last verified | UI state | True state | Next action |
|----------|---------|-------------|-------------------|---------------|----------|------------|-------------|
| **OpenAI (AURA)** | AURA Chat, AI orchestration | `apps/api/.env` → `AURA_OPENAI_API_KEY` | Server env only | Not re-verified Phase 0 | May show Ready if key set | **Unverified this cycle** | Owner: confirm credential; Stage 2 verify |
| **Xero** | `/integrations/xero` | OAuth + encrypted DB | `INTEGRATIONS_ENCRYPTION_KEY` | Prior OAuth work; not this cycle | Varies | **Blocked** | Staging OAuth — Owner approval |
| **Cartrack** | `/integrations/cartrack`, fleet | Integration settings | Encrypted DB | Not verified | Disconnected expected | **Blocked** | Owner credentials |
| **WhatsApp** | `/integrations/whatsapp` | Meta Business API | Encrypted DB | Not verified | **Blocked** | Owner Meta credentials |
| **Email (SMTP)** | `/integrations/email` | SMTP settings | Encrypted DB | Partial | Available if configured | Verify send on staging |
| **Yoco** | `/integrations/yoco` | API keys | Encrypted DB | Profile sync only | Partial | No payment links |
| **Google Maps** | Fleet/dispatch/maps | Planned registry | — | N/A | Planned/honest | **Missing live SDK** | Product decision |
| **Google Calendar** | Integrations | Planned | — | N/A | Planned | **Not connected** | OAuth implementation |
| **Gmail** | Integrations UI | Honesty-only | — | N/A | Shown honestly | **NOT IMPLEMENTED** (Decision 4) | Backend or remove card |
| **n8n** | Automations + Integrations | Hybrid loopback | Signing secret | UX-J staging | Honesty deep-link | Loopback only; cloud OUT | Owner cloud URL if desired |
| **Meta/ads** | Marketing | Adapter stub | — | N/A | Planned | **Not connected** | Owner approval + creds |
| **Stripe** | — | Not in registry | — | N/A | Missing | **Missing** | Product decision |

---

## AI provider architecture (reference)

| Layer | Mechanism |
|-------|-----------|
| Platform env | `AURA_*` variables — OpenAI only at env level |
| Tenant DB | `POST/PATCH /api/v1/ai-orchestration/providers` with encrypted keys |
| Status endpoints | `GET /api/v1/ai-orchestration/providers`, `/resilience`, `/gateway/status` |
| Health test | **No dedicated test route** — verification via successful `generate()` |

**Defect tracked:** Env provider may show `healthStatus: healthy` before real API call (`ai-orchestration.service.ts`).

---

## Integration honesty rules (Decision 4 / 6)

- Gmail and n8n cards must not imply live connection without backend.  
- AI grouping on Integrations must not imply connected without `credentialsConfigured`.  
- Failed sync must show last error + retry, never fake success.

---

## Approval gates

| Action | Approval |
|--------|----------|
| Xero live invoice write | Owner + staging proof |
| WhatsApp live send | Owner + Meta |
| Marketing mass send | Owner + consent proof |
| Cartrack live poll | Owner credentials |
| Production OAuth redirect URI change | Owner |
