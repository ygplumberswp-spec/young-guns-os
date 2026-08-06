# TITAN FNB-CASH-001 — Bank Feed Architecture

**Status:** RECORD ONLY — **not implemented**  
**Parent:** [TITAN_FNB_BANK_FEED_CASH_INTELLIGENCE_SPECIFICATION.md](./TITAN_FNB_BANK_FEED_CASH_INTELLIGENCE_SPECIFICATION.md)  
**Recorded (UTC):** 2026-08-06

---

## Design principles

1. **Xero is ledger truth** — TITAN never replaces Xero reconciliation authority
2. **Read-only first** — no payment initiation in initial release
3. **No credential storage** — OAuth/provider tokens only; never banking passwords or OTP capture
4. **No app automation** — no FNB mobile scraping or click automation
5. **Idempotent imports** — provider IDs + fingerprints prevent duplicates
6. **Suggest, don't post** — matching and classification require human approval
7. **Tenant isolation** — all bank data scoped by `company_id`
8. **Honest labelling** — feed vs reconciled vs estimated clearly distinguished

---

## Integration route decision tree (Phase 1 audit)

```
                    ┌─────────────────────┐
                    │ FNB business account │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
     Xero bank feed    Open-banking provider   Manual CSV
     (preferred audit   (FNB API / aggregator)  (BANK-IMPORT-001
      path first)                              fallback)
              │                │                │
              └────────────────┼────────────────┘
                               ▼
                    ┌─────────────────────┐
                    │  Bank Feed Ingestion │
                    │  Service (read-only) │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
        Dedup engine    Matching engine   Classification
                               │
                               ▼
                    ┌─────────────────────┐
                    │ JOB-COST-001 / OCC  │
                    │ Cash dashboard/AURA │
                    └──────────┬──────────┘
                               ▼
                    ┌─────────────────────┐
                    │ Xero reconciliation │
                    │ status sync (read)   │
                    └─────────────────────┘
```

**Phase 1 audit** determines which upstream path(s) are active for Young Guns FNB today.

---

## Logical components

| Component | Responsibility |
|-----------|----------------|
| Bank Feed Connector | OAuth/provider token management; read-only fetch |
| Transaction Normalizer | Map provider/Xero rows to canonical schema |
| Dedup Service | Provider ID + fingerprint idempotency |
| Matching Engine | Suggest invoice/customer/job matches with confidence |
| Classification Engine | Suggest expense categories |
| Allocation Service | Link transactions to jobs/POs/vehicles |
| Cash Aggregation | Balance, commitments, forecasts |
| AURA Cash Intelligence | Alerts, narratives, leak detection |
| Reconciliation Sync | Read Xero reconciliation status; surface discrepancies |
| Audit Logger | All imports, matches, overrides |

---

## Canonical transaction schema (planned)

| Field | Type | Notes |
|-------|------|-------|
| `id` | uuid | TITAN internal |
| `company_id` | uuid | Tenant scope |
| `provider` | enum | `xero_feed` · `open_banking` · `manual_import` |
| `provider_transaction_id` | text | Unique per provider |
| `idempotency_fingerprint` | text | SHA-256 dedup key |
| `bank_account_id` | uuid | Links to Xero/manual account |
| `transaction_date` | date | |
| `description` | text | |
| `reference` | text | |
| `amount_cents` | bigint | Signed or in/out pair |
| `direction` | enum | `in` · `out` |
| `running_balance_cents` | bigint | nullable |
| `reconciliation_status` | enum | `unreconciled` · `suggested` · `matched` · `xero_reconciled` · `disputed` |
| `xero_bank_transaction_id` | text | nullable |
| `source_synced_at` | timestamptz | |
| `import_batch_id` | uuid | nullable |

Extends BANK-IMPORT-001 `bank_statement_import_*` tables where possible — **no duplicate bank stores**.

---

## Existing foundation (do not duplicate)

| Capability | Status | Relationship |
|------------|--------|--------------|
| BANK-IMPORT-001 | Implemented (staging) | Manual CSV fallback; fingerprint dedup pattern |
| Xero bank_transactions import | Partial via XERO sync | Audit Phase 1 — primary feed candidate |
| `xero-reconciliation.ts` | Implemented | Yoco ≠ Xero reconciled truth model |
| `xero_accounts` (BANK type) | Synced | Account selection for imports |
| INT-010 checklist row | NOT_FOUND | FNB-CASH-001 supersedes scope definition |

---

## Payment matching architecture

```
Incoming transaction
    → normalise reference + amount + date
    → score candidates (invoices, customers, jobs)
    → if confidence ≥ threshold → status: suggested_match
    → if confidence < threshold → status: review_required
    → staff approves → status: matched (audit logged)
    → Xero reconciliation remains separate step
```

Match scoring signals weighted at implementation — never auto-post to Xero.

---

## Job costing integration

Approved transaction allocations create **JOB-COST-001** actual cost entries:

- State: `Captured` → `Review required` → `Approved`
- Source reference: bank transaction ID
- Never double-count with supplier invoice if same payment

---

## Cash dashboard data flow

```
Bank feed balances
  + AR outstanding (finance)
  + AP due (finance/Xero)
  + Payroll commitments (future payroll module)
  + VAT estimate (finance)
  = Available operational cash

Historical in/out patterns
  + scheduled commitments
  = 7-day / 30-day forecast (labelled projection)
```

Feeds **OCC-001** cash panels — single aggregation service, no dashboard-local formulas.

---

## AURA cash intelligence

Read-only analysis pipeline:

1. Ingest latest cash position + unreconciled items
2. Compare against commitments and historical patterns
3. Generate alerts with R amounts and evidence links
4. Store as draft recommendations — Owner reviews

No auto-reconcile · no auto-classify · no auto-pay.

---

## Security architecture

| Control | Implementation |
|---------|----------------|
| Authentication | OAuth 2.0 / provider tokens only |
| Storage | Encrypted tokens; no passwords |
| Transport | TLS only |
| RBAC | Owner-first; finance:write for matching approval |
| Audit | `bank_feed_audit_logs` (planned) |
| Logging | Redact account numbers; no tokens in logs |
| Revocation | Token revoke on disconnect |
| Staging gate | `cpkuwtaipjxeipvbssvn` only until Owner GO |

---

## Phased delivery map

| Phase | Deliverable |
|-------|-------------|
| FNB-CASH-001A | Gap report — Xero FNB feed audit, provider assessment, security plan |
| FNB-CASH-001B | Connector + normalizer + dedup + staging read-only import |
| FNB-CASH-001C | Matching + classification + job allocation |
| FNB-CASH-001D | Cash forecast + AURA intelligence + OCC integration |

**Stop gate:** Owner review after each phase with evidence package.

---

## Explicit non-goals (this record)

- No FNB app scraping or automation
- No payment initiation
- No password/OTP storage
- No production connection
- No implementation during XERO-002 (except Phase 1 read-only audit when Owner sequences)
- No duplicate bank transaction stores outside unified feed model

---

*Architecture record only. No schema migrations or application code created.*
