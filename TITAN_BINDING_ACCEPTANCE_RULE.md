# GLOBAL BINDING TITAN ACCEPTANCE RULE

**Binding scope:** Complete TITAN Business OS — every module, dashboard, role experience, API, database workflow, mobile screen, AURA agent, document, report, internal automation, current and future integration (including Sage).  
**Effective (UTC):** 2026-08-01  
**Queued after:** Active Xero background import + global auto-sync framework (`5239239`, `3120483`)

**Architecture references:**
- `TITAN_GLOBAL_REALTIME_AUTO_SYNC_ARCHITECTURE.md`
- `TITAN_INTEGRATION_AUTO_SYNC_ARCHITECTURE.md`
- `TITAN_STAGING_DATA_CLEANUP_MANIFEST.md`

---

## No feature is complete unless

1. It uses **legitimate verified data** (live business, provider-imported, or clearly isolated test fixtures never visible in normal UI).
2. It is **useful and fully wired** — every visible control opens a real workflow with meaningful business outcome.
3. It **updates dependent TITAN modules automatically** via tenant-safe domain events, background work, webhooks, or scheduled incremental sync.
4. It has a **consistent, simple user experience** aligned with approved TITAN visual identity.
5. It **works for the correct role** per `TITAN_ROLE_PERMISSION_MATRIX.md`.
6. It **enforces tenant isolation and permissions** with truthful denial (403/404, not fake data).
7. It has **truthful loading, success, empty, partial and failure states** (no fake connected/synced metrics).
8. It **handles retries and duplicate prevention** (idempotency keys, inflight locks, checkpoint resume).
9. It **produces audit evidence** where sensitive (security, financial, integration, permission changes).
10. It is **verified through the real staging application** with recorded evidence.

---

## Ordinary users must not need to

- Manually synchronize routine data
- Refresh pages to see normal updates
- Enter the same information in multiple modules
- Understand APIs, tokens, schedulers, queues or developer settings
- Use unfinished or decorative controls

**Manual Sync, Retry, Reconnect and Refresh** are **fallback tools only**.

---

## Automatic updates — approval safety

Automatic data synchronisation is **allowed** for read paths, cache invalidation, incremental imports, and internal module propagation.

**Explicit approval still required for:**

- Financial writes (invoice create/update/void, bills, bank transactions)
- Payments and refunds
- Real customer communication (email, SMS, WhatsApp)
- Marketing publication and advertising spend
- Permission and role changes
- Destructive data actions
- Production configuration or deployment changes

---

## Enforcement

This rule is incorporated into all control documents listed in Sprint **BINDING-RULE-001**. Gap items that violate criteria 1–10 remain open until verified on staging.
