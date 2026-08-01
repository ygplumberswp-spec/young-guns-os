# TITAN Final Data Source Matrix

**Phase:** 0 — Discovery only (no implementation)  
**Generated (UTC):** 2026-08-01T21:00:00.000Z  
**Branch:** `cursor/titan-owner-operating-model-final` @ `45b41ca`  
**Staging API:** `https://young-guns-os-staging.up.railway.app`  
**Staging Web:** `https://comfortable-determination-staging.up.railway.app`  
**Young Guns companyId:** `095aef76-fef5-4139-af37-a42f2d7e2faf`

---

## Executive summary

| Provider / domain | True state (staging) | Import/sync | UI truth pattern | Verdict |
|-------------------|---------------------|-------------|------------------|---------|
| **Xero** | OAuth connected; background import running | Auto-sync seeded; incremental bank-tx may run | Cache invalidation fixed @ 228 | **HOLD** |
| **Cartrack** | Connected; 2 mapped vehicles | Auto-map on sync; 3s UI poll | Live map API GO @ 229; tiles HOLD | **HOLD** |
| **ServiceM8** | Not integrated | N/A — workflow reference only | N/A | **N/A** |
| **Communications** | WhatsApp blocked; SMTP partial | Incoming auto-sync where configured | Honest blocked states | **HOLD** |
| **Job lifecycle** | TITAN DB authoritative for ops | N/A | Status chips on lists | **GO/HOLD** |
| **Documents / COC** | Binary upload live | N/A | Empty states honest | **HOLD** |
| **Dashboard metrics** | Aggregated API + Xero | Background refresh post-sync | False-zero mitigation UX-I | **HOLD** |

---

## Xero

### Connection & sync state fields

| Field / surface | Location | Current value (evidence) |
|-----------------|----------|--------------------------|
| OAuth status | Integrations DB | Connected |
| `lastSyncAt` | Connection record | `2026-08-01T19:29:24.777Z` (228) |
| `xeroImportInProgress` | API flag | Fixed: incremental bank-tx no longer forces CV partial (228) |
| Auto-sync schedule | DB | Seeded schedule=1 (179) |
| Background work panel | AppLayout | Polls sync settlement; invalidates caches |
| `cvMetricsRefreshAt` | Connector autoSync | Set @ job 93144ea8 |

### Import support (read-only staging)

| Xero object | Import stage | TITAN mapping table | Count (228/220) | Visible UI | Verdict |
|-------------|-------------|---------------------|-----------------|------------|---------|
| Organisation / settings | Supported | Company prefs | — | Settings | GO |
| Contacts | Supported | `customer_mappings` | 673 | CRM, Customers | GO |
| ACCREC invoices | Supported | `invoice_mappings` | 5 | Finance invoices | HOLD — low mapping count vs Xero total |
| Payments | Supported | `payment_mappings` | **0** | Finance payments | **NO-GO** — UI may show unpaid incorrectly |
| Bank transactions | Supported | `bank_tx_logs` | 3078 | Not dedicated page | HOLD |
| Quotes | Supported | Quote records | Partial | Finance quotes | HOLD |
| Bills / ACCPAY | Scaffold | Limited | Unknown | `/finance/payables` HOLD page | HOLD |
| Credit notes | Scaffold | Partial | Unknown | Limited | HOLD |
| Items / products | Partial | Inventory link | Unknown | Inventory | HOLD |
| Tracking categories | Read | Config | — | Settings | HOLD |

### Known Xero UI surfaces vs truth

| Surface | Source of truth | Stale risk | Fix status |
|---------|----------------|------------|------------|
| Dashboard Customer Value panel | Xero + classifier API | Was stale during bank-tx sync | **Fixed @ 228** |
| CRM customer value filters | Same | Same | **Fixed @ 228** |
| Finance invoice amounts | Xero + TITAN | Preserve INV-0423 R2,472.50; INV-0424 R2,266.39 | Verified in 228 DB sample |
| Integrations Xero panel | Connector state | Shows syncing honestly | GO |
| Receivables / aging | **Phase 1 HOLD route** | N/A | `/finance/receivables` honest empty | Phase 3 backend gap |

### Sync behaviour requirements (Phase 3/Owner directive)

| Requirement | Current | Gap |
|-------------|---------|-----|
| Full pagination | Implemented in orchestrator | — |
| Checkpoint resume | Implemented | Active job ca479272 running bank_transactions @ page 17 |
| Idempotent upserts | Implemented | — |
| `last_sync_at` only after full pipeline | Partial | Incremental stages may run between full completes |
| No manual Sync for normal ops | Partial | Manual recovery still exposed |
| Automatic UI refresh post-sync | **Fixed @ 228** | `invalidateAfterXeroSyncSettled` |
| No Xero writes (staging) | **Enforced** | All probes confirm `xeroWrites: false` |

**Xero overall verdict:** **HOLD** — OAuth connected, import running, UI refresh fixed; payment_mappings=0 and missing Receivables/Payables/Cashflow block Owner daily finance ops.

---

## Cartrack (Fleet)

### Connection & sync state

| Field | Value (229) |
|-------|-------------|
| Status | connected |
| `lastSyncAt` | 2026-08-01T20:32:49.694Z |
| Mapped vehicles | 2 (CF77263, CF172047) |
| GPS positions | 12 raw / 2 mapped in tracking API |
| Credentials | Encrypted DB; hasCredentials=true |

### API routes

| Endpoint | Pre-fix (229) | Post-fix (229) | UI consumer |
|----------|---------------|----------------|-------------|
| `GET /api/v1/fleet/live-map` | 404 Route not found | 200 authenticated | `FleetLiveMapPage`, Live Dispatch |
| Fleet list/detail | 200 | 200 | `/fleet`, `/fleet/:id` |

### UI surfaces

| Surface | Data source | Poll interval | Verdict |
|---------|-------------|---------------|---------|
| `/fleet/live-map` | Cartrack → API → MapLibre tiles | 3s when visible | **HOLD** — API GO; MapLibre tile render unverified |
| `/mobile-platform/dispatcher` | Same live-map API | 3s | GO |
| Vehicle list | TITAN fleet DB + Cartrack sync | On load | GO |
| Trips / drivers / geofences | **Not implemented** | — | NO-GO (Phase 7) |

### Web/API mismatch (resolved)

**Root cause @ 229:** Web deployed from cartrack branch tip; API @ 4430edd lacked live-map route.  
**Resolution:** Merge @ 8fe0109 + redeploy; authenticated live-map returns 200 with 2 vehicles.

**Cartrack overall verdict:** **HOLD** — live positions proven; full Fleet tabs and map tile visual acceptance pending.

---

## ServiceM8 (reference only — not a data source)

ServiceM8 screenshots inform Phase 5 mobile workflow design only. TITAN does **not** import ServiceM8 data.

| Concept borrowed | TITAN implementation | Status |
|-----------------|---------------------|--------|
| Job card field flow | Mobile job detail + checklist | GO baseline UX-B |
| Schedule list/calendar/map views | `/mobile/schedule` partial | HOLD |
| On-site quote/invoice | Job finance strip | HOLD |
| Customer signature | Mobile capture API | GO |
| Payment on site | Yoco scaffold only | NO-GO |

---

## Communications

| Channel | Backend | Auto incoming sync | Outgoing | UI state | Verdict |
|---------|---------|-------------------|----------|----------|---------|
| WhatsApp Business | Meta API scaffold | Lock + sync when connected | Approval required | **Blocked** — no Meta creds | NO-GO |
| Personal WhatsApp | Unsupported | — | — | Honest banner | GO (honesty) |
| Email SMTP | Real when configured | Auto incoming | Approval for send | Partial | HOLD |
| Gmail | **NOT IMPLEMENTED** | — | — | Honesty-only card (Decision 4) | GO (honesty) |
| SMS | Scaffold | — | — | Planned | NO-GO |
| Voice/calls | Unproven | — | — | Voice reception page orphan | NO-GO |
| n8n automations | Loopback only | — | — | UX-J honesty | HOLD |

### Communications UI route

`/communications/messages` — unified inbox **partial**; queues (Needs reply, Payment follow-up, etc.) from Phase 9 **not implemented**.

**Communications overall verdict:** **HOLD**

---

## Job lifecycle

### Canonical states (Phase 5 target vs current)

| Phase 5 lifecycle state | Current TITAN status | Source |
|-------------------------|---------------------|--------|
| New → Scheduled → Assigned | Implemented | `jobs.status` |
| Travelling / On site | Partial | Mobile + dispatch |
| Waiting for parts/customer | Partial | Status enum |
| Work completed / Ready to invoice | Implemented UX-B | Mobile complete |
| Invoiced / Partially paid / Paid | Partial | Finance strip; payment_mappings gap |
| Cancelled / Archived | Implemented | — |

### Data flow

```
Lead (TITAN) → Customer/Property (TITAN) → Job (TITAN) → Field execution (mobile API)
     ↓                                              ↓
Xero contact sync                            Quote/Invoice (TITAN + Xero read)
                                                     ↓
                                              Payment ledger (INCOMPLETE)
```

**Job lifecycle verdict:** **HOLD** — ops chain works; payment aggregation and Phase 5 unified lifecycle labels incomplete.

---

## Documents / COC

| Capability | API | Web UI | Mobile | Verdict |
|------------|-----|--------|--------|---------|
| Binary upload/retrieve | ✓ | `/documents` | Job attachments | GO |
| ACL / tenant scope | ✓ | ✓ | ✓ | GO |
| COC form (SANS fields) | Partial helpers | Limited | — | HOLD |
| Compliance daily queue | — | **Missing** | — | NO-GO (Phase 10) |
| Job pack approval | Partial | Job detail | — | HOLD |
| Portal document surfacing | API | `/my/documents` empty honest | — | HOLD |

**Documents/COC verdict:** **HOLD**

---

## Dashboard metrics

### Current KPI sources

| Metric / card | Data source | False-zero risk | Phase 2 requirement | Status |
|---------------|-------------|-----------------|---------------------|--------|
| Jobs today | TITAN schedule API | Low | 4-card Today panel | Partial |
| Team status | TITAN + Cartrack partial | Medium | Live ops panel | Missing |
| Money today (outstanding/overdue) | Xero + classifier | **Was high** — mitigated UX-I | Separate invoiced vs cash | Partial |
| Customer activity / leads | TITAN CRM | Low | Drill-through | Partial |
| Customer value (8 buckets) | Xero classifier API | **Fixed @ 228** | Drill-through | GO |
| Upcoming work | `/jobs/today` | Fixed UX-I | — | GO |
| Owner Action Centre | **Not implemented** | — | Phase 2.3 | NO-GO |
| Completed today | Partial | — | Phase 2.5 | HOLD |

### Truthful state labels (required Phase 2.6)

| State | Implemented | Where |
|-------|-------------|-------|
| Live / Updated X ago | Partial | Integrations, some cards |
| Syncing | Yes | Xero panel, CV panel |
| Not connected | Yes | Provider cards |
| Attention required | Partial | — |
| Permission required | Partial | — |
| Temporarily unavailable | Partial | Fleet map fallback |

**Dashboard verdict:** **HOLD**

---

## Payment ledger (Job Payment Ledger addendum)

| Requirement | Current | Gap |
|-------------|---------|-----|
| Job list payment status column | Partial chips | Phase addendum |
| Job 360 Finance tab | Partial strip | Full ledger missing |
| Multiple payments per invoice | Xero supports; TITAN payment_mappings=0 | **Critical** |
| Deposit tracking | Not implemented | Settings → Finance & Pricing |
| Receivables uses same ledger | Route missing | Phase 3 |
| Integer cents calculations | Implemented in shared finance | — |

**Payment ledger verdict:** **NO-GO** for Owner "who owes us" daily requirement until payment_mappings populate and Receivables route exists.

---

## Empty / loading / error patterns (app-wide)

| Pattern | Implementation | Coverage |
|---------|----------------|----------|
| QueryLoader / skeleton | `components/ux` standard | Most list pages |
| EmptyState with honest copy | Standard component | Most lists |
| ErrorState + retry | Standard component | API failures |
| Integration blocked banner | Provider-specific | Integrations |
| Map fallback (no silent blank) | FleetLiveMapPage | HOLD — tile verify pending |
| Sync-in-progress (not false zero) | Xero/CV panels | **Fixed @ 228** |

---

## Auto-sync architecture summary

| Integration | Scheduler | Connection lock | Background worker | UI invalidation |
|-------------|-----------|-----------------|--------------------|-----------------|
| Xero | ✓ | ✓ | ✓ (import jobs) | ✓ @ 228 |
| Cartrack | ✓ | ✓ | ✓ | Partial |
| Email | ✓ when configured | ✓ | ✓ | Partial |
| WhatsApp | ✓ when configured | ✓ | Blocked | N/A |

**Reference docs:** `TITAN_INTEGRATION_AUTO_SYNC_ARCHITECTURE.md`, `TITAN_GLOBAL_REALTIME_AUTO_SYNC_ARCHITECTURE.md`

---

## Phase 1–18 data source gaps

| Phase | Data requirement | Current gap |
|-------|-----------------|-------------|
| 2 | Dashboard 30-second Owner comprehension | Action Centre, live ops, truthful money cards incomplete |
| 3 | Receivables/Payables/Cashflow from Xero | Phase 1 HOLD routes live (honest empty); backend aggregation Phase 3 | payment_mappings=0 |
| 6 | Live Dispatch ETA from real GPS | Positions GO; ETA comms HOLD |
| 7 | Fleet trips/drivers/geofences | Cartrack API partial |
| 9 | Unified comms queues | Provider blocked; inbox partial |
| 10 | COC compliance queue | Not implemented |
| 13 | AURA brief from real data | Chat GO; structured brief missing |
| 14 | Analytics drill-down | Definitions partial |
| Job Payment Ledger | Xero payment parity | **Blocking** — 0 payment mappings |

---

## Staging probe summary (no secrets)

| Probe | Artifact | Result |
|-------|----------|--------|
| API health/ready | 229, 225 | 200 ready, DB connected |
| Xero UI refresh | 228 | GO — cache fix deployed |
| Fleet live-map | 229 | GO — 200 authenticated, 2 vehicles |
| CRM acceptance | 224 | GO — 57/57 |
| Visual audit | titan-final-visual-audit-run.log | **FAILED** — playwright missing |
| Owner API probe | 228 | Skipped — token not in env (DB simulation used) |

---

## Evidence index

| File | Relevance |
|------|-----------|
| `diagnostic-output/228-xero-ui-refresh-verify.json` | Xero sync UI truth |
| `diagnostic-output/229-fleet-api-deployment-reconciliation.json` | Fleet API parity |
| `diagnostic-output/224-crm-final-staging-acceptance.json` | CRM data truth |
| `diagnostic-output/220-xero-phase2-final-verify.json` | Xero import job 93144ea8 |
| `diagnostic-output/225-final-consolidation-status.json` | Build/test baseline |
| `TITAN_PROVIDER_STATE_REGISTER.md` | Provider honesty register |
| `TITAN_GAP_BACKLOG.md` | 116-row traceability |

---

**Phase 0 complete @ 235. Phase 1 global organisation complete @ 236 — finance HOLD pages documented; stopped before Phase 2.**
