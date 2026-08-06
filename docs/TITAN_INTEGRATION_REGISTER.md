# TITAN Integration Register

**Document ID:** INT register (includes INT-UNIVERSAL-001)  
**Document type:** Permanent provider and integration source of truth — documentation only  
**Generated (UTC):** 2026-08-06  
**Last updated (UTC):** 2026-08-06 — AGENT-001B restore approved 307-agent workforce scope  
**No provider calls made during register maintenance**  

**Related documents:**

- [TITAN_MASTER_AGENT_REGISTER.md](./TITAN_MASTER_AGENT_REGISTER.md) (AGENT-001 — 307 approved agents)
- [TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md](./TITAN_AGENT_LEARNING_AND_GOVERNANCE_STANDARD.md) (AGENT-003)
- [TITAN_MASTER_ACCEPTANCE_REGISTER.md](./TITAN_MASTER_ACCEPTANCE_REGISTER.md)

---

## INT-UNIVERSAL-001 — Universal Integration Wizard Standard (permanent)

All **client-facing** provider integrations must follow this journey:

```
Connect → Official provider login → Choose business/account → Choose Page/profile/resource → TITAN verifies → Secure server-side save → Connected
```

### Applies to

Facebook · Instagram · TikTok · Google Business Profile · LinkedIn · YouTube · WhatsApp Business · Gmail · Microsoft 365 · Xero · Yoco · Google Maps · Cartrack · **Future providers**

### Clients must never be required to

- Open provider developer dashboards  
- Use Railway or infrastructure consoles  
- Paste API keys, client secrets, or access tokens  
- Find Page IDs or resource identifiers manually  
- Configure callback URLs or webhook verify tokens  
- Understand OAuth scopes or repair integration state manually  

### Platform administration responsibility

Technical provider setup (app registration, webhook URLs, verify tokens, redirect URIs, encryption keys) is completed by **TITAN platform administration** before clients use the integration.

### Truthful client-facing states only

| State | Meaning |
|-------|---------|
| Not connected | No credentials stored |
| Connect | Owner may start official provider login |
| Choose account | OAuth succeeded; pick business/account |
| Choose Page/profile/resource | Pick the resource TITAN will operate on |
| Approval required | Owner must approve a pending action |
| Provider review pending | Meta/provider review in progress |
| Connected | Verified token + resource stored |
| Connected with limited permissions | Connected; optional capabilities not yet granted |
| Attention required | Action needed (reconnect, choose resource) — plain language only |
| Temporarily unavailable | Provider outage or platform misconfiguration |

### Facebook lesson (recorded 2026-08-06)

The multi-day Facebook setup for Young Guns proved that **developer-level configuration is unacceptable** as a normal customer onboarding journey. Meta App Dashboard webhook configuration, OAuth scope tiers, and infrastructure secrets must be hidden behind:

1. A **reusable integration wizard** (Connect → Choose Page → Connected)  
2. **Platform-managed provider configuration** (staging/production env vars managed by TITAN ops, not the client)  

Clients see Sync & Alerts webhook status in plain language — never verify tokens, app secrets, or raw provider errors with credentials.

**Do not expose** secrets, tokens, or technical diagnostics to normal clients.

---

## Scope

Records connection infrastructure for TITAN integrations. Integration completion ≠ agent completion. Agent rows reference this register for provider truth.

**Execution-capable integrations** require Draft → Approve → Execute per [TITAN_AGENT_CAPABILITY_MATRIX.md](./TITAN_AGENT_CAPABILITY_MATRIX.md).

---

## Integration status vocabulary

| Status | Meaning |
|--------|---------|
| **Verified complete (staging)** | Owner or automated proof on staging |
| **Verified complete (production)** | Production proof — **none recorded** |
| **Partial** | Code + tests; live credentials or review pending |
| **Provider-blocked** | Meta/provider review or scope not granted |
| **Owner-action required** | Credentials, OAuth portal, or policy gate |
| **Not started** | No meaningful implementation |
| **Not applicable** | Out of scope |

---

## Facebook Business (Young Guns — J-6.7F14 deployed to staging)

| Field | Value |
|-------|-------|
| Integration ID | `INT-FB-001` |
| Module | `/facebook-business` |
| API | `apps/api/src/services/facebook-business.service.ts` |
| Tenant | Young Guns (`095aef76-fef5-4139-af37-a42f2d7e2faf`) |
| **Page** | **Young Guns Plumbing - Cape Town** — connected and verified |
| Page ID | `394603137072407` |
| Environment | **Staging only** — not production-complete |
| Deployed task | J-6.7F14 (`23debd9cfa90a05ab31f051b76d3e7a86708b14f`) |
| Staging API | https://young-guns-os-staging.up.railway.app |
| Staging Web | https://comfortable-determination-staging.up.railway.app |

### Content permissions granted (@ staging)

Publishing · scheduling · reading comments · replying to comments · Page details · insights.

### Webhook status (J-6.7F14 — staging)

| Item | State |
|------|-------|
| Deployed to staging | **Yes** — J-6.7F14 |
| Provider-confirmed fields | **feed**, **mention** |
| Meta dashboard sample delivery | **Succeeded** |
| Webhook errors recorded | **None** |
| Polling fallback | **Active** — every 15 minutes |
| Genuine live Young Guns Page event | **Pending** — Meta app is **unpublished** |
| Messenger webhooks | **Outside completed scope** — requires separate Meta approval |
| Lead Ads webhooks | **Outside completed scope** — requires separate Meta approval |

### Production boundary

Facebook integration is **staging-complete for J-6.7F14** but **must not be marked production-complete**.

### Client journey compliance

| Step | Status |
|------|--------|
| Connect via official Meta login | ✅ |
| Choose Page | ✅ |
| TITAN verifies | ✅ |
| Server-side encrypted save | ✅ |
| Developer dashboard required for client | ❌ Platform admin configures Meta App webhook URL |

### Agent impact

| Agent | Register ID | Status |
|-------|-------------|--------|
| Facebook Agent | MKT-005 | **Implemented but inactive** — integration staging-ready; agent activation gate not passed |
| Social Media Agent | MKT-004 | **Defined** |

**XERO-002 remains parked.**

## Instagram Business

| Field | Value |
|-------|-------|
| Integration ID | `INT-IG-001` |
| Module | Social Connections |
| Status | **Partial** — code + tests; live OAuth Owner-action required |
| Blocker | Meta app review for production; requires linked Facebook Page |
| Agent impact | MKT-007 Social Media Agent — Provider-blocked for publish |

---

## TikTok

| Field | Value |
|-------|-------|
| Integration ID | `INT-TT-001` |
| Status | **Partial** — readiness structure only |
| Blocker | `TIKTOK_LIVE_OAUTH_ENABLED=1` + provider review |
| Rule | Never fake Connected state |

---

## WhatsApp Business

| Field | Value |
|-------|-------|
| Integration ID | `INT-WA-001` |
| Module | `/integrations/whatsapp` (separate from Social Connections) |
| Status | **Partial** |
| Blocker | Meta Business credentials; live send Owner-action required |
| Agent impact | COM-004 WhatsApp Business Agent — Partial |

**Rule:** WhatsApp unchanged during Facebook J-6.7F11 work.

---

## Xero

| Field | Value |
|-------|-------|
| Integration ID | `INT-XERO-001` |
| Status | **Partial** |
| Evidence | Xero settings UI, sync services, RBAC tests |
| Blocker | OAuth on staging; two-way write Owner approval |
| Agent impact | FIN-006 Xero Reconciliation — Partial |

---

## Google (Maps, Calendar, Gmail)

| Integration ID | Service | Status |
|----------------|---------|--------|
| `INT-GMAPS-001` | Maps autocomplete, routing | **Partial** — API key staging |
| `INT-GCAL-001` | Calendar sync | **Owner-action required** |
| `INT-GMAIL-001` | Gmail backend | **Deferred** (Decision 4) |

---

## Yoco / Payments

| Field | Value |
|-------|-------|
| Integration ID | `INT-YOCO-001` |
| Status | **Not started** / payment links queued |
| Requirement | FIN-013, BC-013 |

---

## Cartrack / Fleet

| Field | Value |
|-------|-------|
| Integration ID | `INT-CAR-001` |
| Status | **Owner-action required** — credentials not on staging |
| Agent impact | FLT-003 Cartrack Telemetry — Missing |

---

## Resend / Email

| Field | Value |
|-------|-------|
| Integration ID | `INT-RESEND-001` |
| Status | **Partial** — signing tests, client |
| Agent impact | COM-006 Email Inbox — Missing |

---

## n8n Orchestration

| Field | Value |
|-------|-------|
| Integration ID | `INT-N8N-001` |
| Status | **Partial** — signing, orchestration pages |

---

## Production exclusion (locked)

| Rule | Status |
|------|--------|
| No production access during register maintenance | **Confirmed** |
| No production deploy | **Confirmed** |
| Production integration states | **Not recorded — untouched** |

---

## Environment references

| Environment | APP_ENV | Notes |
|-------------|---------|-------|
| Staging | `staging` | Young Guns primary verification tenant |
| Production | — | **Forbidden** for this register update |

Setup details: [SOCIAL_CONNECTION_PROVIDER_SETUP.md](./SOCIAL_CONNECTION_PROVIDER_SETUP.md)

---

## Related documents

- [TITAN_MASTER_AGENT_REGISTER.md](./TITAN_MASTER_AGENT_REGISTER.md) — Facebook result summary
- [TITAN_MASTER_ACCEPTANCE_REGISTER.md](./TITAN_MASTER_ACCEPTANCE_REGISTER.md) — J67F requirements
- [TITAN_GAP_CLOSURE_PLAN.md](./TITAN_GAP_CLOSURE_PLAN.md) — Phase 4 provider blockers
