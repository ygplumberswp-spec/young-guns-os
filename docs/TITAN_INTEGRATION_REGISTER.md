# TITAN Integration Register

**Document type:** Permanent provider and integration source of truth — documentation only  
**Generated (UTC):** 2026-08-06  
**No provider calls made during register creation**  

---

## Scope

Records connection infrastructure for TITAN integrations. Integration completion ≠ agent completion. Agent rows reference this register for **Provider-blocked** status.

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

## Facebook Business (Young Guns — recorded 2026-08-06)

| Field | Value |
|-------|-------|
| Integration ID | `INT-FB-001` |
| Module | `/facebook-business` |
| API | `apps/api/src/services/facebook-business.service.ts` |
| Tenant | Young Guns (`095aef76-fef5-4139-af37-a42f2d7e2faf`) |
| **Basic Page connection** | **Verified complete (staging)** |
| Page | Young Guns Plumbing – Cape Town |
| State | `CONNECTED_LIMITED` |
| Staging API | https://young-guns-os-staging.up.railway.app |
| Staging Web | https://comfortable-determination-staging.up.railway.app |

### Granted scopes

| Scope | Status |
|-------|--------|
| `pages_show_list` | Granted |
| `business_management` | Granted |
| `public_profile` | Granted |

### Provider-blocked scopes (Meta App Review)

| Capability | Scope | Agent impact |
|------------|-------|--------------|
| Page read / verification | `pages_read_engagement` | Deferred to page-read OAuth tier |
| Publishing | `pages_manage_posts` | MKT-021 Provider-blocked |
| Comments | `pages_manage_engagement` | Provider-blocked |
| Messaging | `pages_messaging` | COM-007 Provider-blocked |
| Leads | `leads_retrieval` | Provider-blocked |
| Insights | `read_insights` | Provider-blocked |

### Operational notes

- Sync **inactive** until required permissions granted  
- **Not a current development blocker** for non-Facebook work  
- J-6.7F11 basic Page selection deployed (`0782ebb` integration branch)  
- No automatic OAuth or Page selection during deploy verification  

---

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
