# Xero Payment Allocation Parity Matrix

**Phase:** 5 — read-only staging DB probe  
**Company:** Young Guns Plumbing (`095aef76-fef5-4139-af37-a42f2d7e2faf`)  
**Xero mode:** Read-only — no writes  
**Generated:** 2026-08-02

## Summary

| Entity | TITAN staging | Xero mapping table | Parity |
|--------|---------------|-------------------|--------|
| Payments (`payments`) | Queried live | `xero_payment_mappings` | **Partial** |
| Payment allocations per invoice | One payment → one invoice FK | Xero supports multi-invoice allocation | **Gap** |
| Integer cents | `amount_cents` | N/A | **Match** |
| Deposit stage invoices | `invoices.stage = deposit` | Xero invoice types | **Partial** |
| Prepayments / overpayments | Not modelled | Xero credit notes / prepayments | **Gap** |

## Probe method

232 verify script runs `railway run` SQL against staging:

```sql
SELECT count(*) FROM payments WHERE company_id = :ygp;
SELECT count(*) FROM xero_payment_mappings WHERE company_id = :ygp;
SELECT count(*) FROM payments WHERE company_id = :ygp AND xero_payment_id IS NOT NULL;
```

## Parity matrix

| Capability | Xero | TITAN Phase 5 | Verdict |
|------------|------|---------------|---------|
| Record payment against invoice | Yes | Yes (`payments.invoice_id`) | GO |
| Multiple payments per invoice | Yes | Yes (separate rows) | GO |
| Payment import from Xero | Yes | Read via sync jobs | Partial |
| `xero_payment_mappings` populated | Expected when synced | Often 0 on staging | **HOLD** |
| Allocate one payment to multiple invoices | Yes | Not implemented | **HOLD** |
| Prepayment / unallocated credit | Yes | Not implemented | **HOLD** |
| Refund / credit note linkage | Yes | Not implemented | **HOLD** |
| Write-off | Yes | Not implemented | **HOLD** |
| Payment plan / promise to pay | Yes (tracking) | Not implemented | **HOLD** |
| Disputed payment state | Yes | Not implemented | **HOLD** |

## Owner impact

Daily "who owes us" on jobs is **GO** for TITAN-native payments linked to job invoices. Full Xero allocation parity remains **HOLD** until `xero_payment_mappings` populate from read-only sync and allocation model extends beyond single-invoice FK.

## Next steps (Phase 6+, not started)

1. Read-only backfill verification when Xero payment sync runs
2. Allocation join table (payment_id → invoice_id → amount_cents) without Xero writes
3. Map Xero credit notes to `creditsCents` / `refundsCents` on job ledger
