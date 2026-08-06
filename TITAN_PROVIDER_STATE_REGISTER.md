# TITAN Provider State Register

**Updated (UTC):** 2026-08-01 — GLOBAL-AUTOSYNC-179: Xero background import + auto-sync schedule seeded (Young Guns)  
**Rule:** No provider marked **Connected** without verified credential + successful server-side test.

---

## Summary

| State | Count |
|-------|------:|
| Connected (verified this cycle) | 2 (OpenAI AURA — staging; Xero OAuth — staging DB) |
| Configured locally (dev only), not staging-verified | 0 |
| Staging verified | 2 |
| Disconnected / not configured | Most |
| Honesty-only (no backend) | 2 (gmail, n8n UI cards) |
| Planned registry entry | 5 |
| Blocked — credential required | 3+ |

---

## Provider register

| Provider | Surface | Config path | Credential storage | Last verified | UI state | True state | Next action |
|----------|---------|-------------|-------------------|---------------|----------|------------|-------------|
| **OpenAI (AURA)** | AURA Chat, AI orchestration | `AURA_OPENAI_API_KEY` + `PROVIDERS_ENABLED` | Server env only | **2026-08-01 FRZ-015 GO** — synthetic live 12/12 | Connected (staging) | **Connected — staging verified** | Monitor usage; optional key scope restriction |
| **Xero** | `/integrations/xero` | OAuth + encrypted DB | `INTEGRATIONS_ENCRYPTION_KEY` | **2026-08-01 GLOBAL-AUTOSYNC-179 PARTIAL** — OAuth connected; schedule=1; background import at contacts checkpoint; no 90s timeout | Auto-sync + background work panels | **OAuth connected — background import running** | Monitor `179-global-autosync-staging-verify.json`; await full import for lastSyncAt |
| **Cartrack** | `/integrations/cartrack`, fleet | Integration settings | Encrypted DB | Not verified | Disconnected expected | **Blocked** | Owner credentials |
| **WhatsApp** | `/integrations/whatsapp` | Meta Business API | Encrypted DB | Not verified | **Blocked** | Owner Meta credentials |
| **Email (SMTP)** | `/integrations/email` | SMTP settings | Encrypted DB | Partial | Available if configured | Verify send on staging |
| **Yoco** | `/integrations/yoco` | API keys | Encrypted DB | Profile sync only | Partial | No payment links |
| **Google Maps** | Fleet/dispatch/maps | Planned registry | — | N/A | Planned/honest | **Missing live SDK** | Product decision |
| **Google Calendar** | `/integrations/google-calendar`, scheduling overlay | OAuth (`GOOGLE_CLIENT_ID`/`SECRET` + `GOOGLE_CALENDAR_REDIRECT_URI`) | Encrypted DB (`INTEGRATIONS_ENCRYPTION_KEY`) | **2026-08-04** — migration 0173 applied to staging (7 tables, 0 rows); 20 routes live; authenticated Owner GETs 200; technician 403; API reports `oauthConfigured:false` | Awaiting configuration (honest) | **Code complete — not connected; no Google OAuth client in staging env** | Owner: set `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` + consent screen scopes, then run acceptance tests |
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
