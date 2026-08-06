# SPI-001 Supplier Price Intelligence (Binding)

**Status:** Phase 1 scaffold implemented  
**Branch:** `cursor/titan-frozen-scope-completion`  
**Migration:** `0110_supplier_price_intelligence.sql`  

---

## Purpose

Ingest supplier price lists (PDF/CSV/manual), deduplicate against a versioned canonical catalogue, route uncertain matches to a review queue, and expose dashboard counts — **without deleting uncertain data or silently changing customer pricing**.

---

## Binding rules

| Rule | Enforcement |
|------|-------------|
| No silent customer price changes | Import pipeline updates supplier catalogue only; quote/customer prices require YGP-001 / explicit approval |
| Uncertain rows preserved | `dedup_verdict=uncertain` → review queue; never deleted |
| Price changes require review | `variant` + `price_change` → review queue with `marginImpactCents` |
| Version history | New approved catalogue rows bump `version`; `previousVersionId` chain |
| Idempotent dedup | Code + normalized description + unit + pack scoring |

---

## API (staging)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/supplier-price-intelligence/dashboard` | Dashboard counts |
| GET | `/api/v1/supplier-price-intelligence/imports` | Import job list |
| GET | `/api/v1/supplier-price-intelligence/review-queue` | Pending review items |
| POST | `/api/v1/supplier-price-intelligence/imports` | Import line batch |

---

## Evidence

`diagnostic-output/189-spi001-staging-verify.json`

---

## Gate for YGP-001

SPI-001 tests + staging verify **PASS** before Young Guns Pricing (YGP-001) starts.
