# TITAN Row 96 — Canonical Quote Cost Model Delivery Report

**Branch:** `cursor/canonical-quote-cost-model-663e`  
**Starting HEAD:** `63871e6` (PR #80 Row 95 tip)  
**Environment:** Staging only — production untouched  
**Generated:** 2026-08-08  

## Executive verdict

| Gate | Result |
|------|--------|
| Canonical cost model | **GO** |
| Cost ≠ sell separation | **GO** |
| Staging fixture matrix | **GO** (13 PASS / 0 FAIL) |
| Rows 87–95 regressions | **GO** (103 focused shared tests) |
| Royal Cape read-only | **GO** (total unchanged; cost incomplete reported truthfully) |
| Row 92 automation | **OFF** |
| Rows 97/98/99 | **Not started** |
| Xero writes / customer sends / production | **0** |

---

## Architecture audit (pre-build)

| Path | Classification |
|------|----------------|
| `quote_line_items.unit_cost_cents` / `line_cost_cents` | CANONICAL (line-level) |
| `quotes.estimated_cost_cents` / GP / markup / margin | CANONICAL summary (kept aligned when structured components exist) |
| `belowFloorOverride` + `profit_floor_margin_bps` | CANONICAL deterministic floor (preserved; not Row 97) |
| `scope_of_work` / `exclusions` / `assumptions` text | REUSABLE |
| `company_finance_settings.default_internal_labour_rate_cents_per_hour` | REUSABLE labour config |
| `plan_estimate_cost_components` (Row 94) | REUSABLE import source |
| Row 90 customer-visible lines | CANONICAL sell presentation |
| New `quote_cost_components` / snapshots / warnings / audit | CANONICAL additive (Row 96) |
| Scenario-specific cost engines | NOT INTRODUCED |
| Inferring cost from sell price | UNSAFE — rejected |

---

## Delivery checklist (1–62)

1. **repo root** — `/Users/keanuventer/Downloads/Titan-Aura-Row95` (maps `/workspace`)
2. **branch** — `cursor/canonical-quote-cost-model-663e`
3. **starting HEAD** — `63871e6`
4. **ending HEAD** — `0e8a20504f3172b9e38047919861021da9e77321`
5. **ancestry** — PR #80 (`cursor/quote-scenarios-663e` @ `63871e6`)
6. **architecture reused** — FinanceService quote engine, Row 90/91/92/93/94/95, JPE cost separation, portal forbid list, audit/RBAC
7. **files changed** — shared model+tests, migration `0215`, db schema, API service+routes, web panel+API client, portal forbid fields, verify JSON, this report
8. **migration** — `0215_quote_cost_model.sql` (additive; applied on staging for proof)
9. **canonical cost model** — `packages/shared/src/quote-cost-model.ts` + `QuoteCostModelService`
10. **component types** — MATERIAL, LABOUR, WASTAGE, TRAVEL, CALL_OUT, EQUIPMENT, SUBCONTRACTOR, PRELIMINARY, OVERHEAD, CONTINGENCY, WARRANTY, OTHER_APPROVED
11. **provenance** — SUPPLIER_NET_DISCOUNTED … COST_REVIEW_REQUIRED (never invented)
12. **materials** — GO (known + missing)
13. **labour** — GO (LABOUR_RATE_CONFIG; incomplete when missing)
14. **wastage** — GO (explicit only; no default %)
15. **travel** — GO (internal cost)
16. **call-out** — GO (internal; not customer revenue)
17. **equipment** — GO (explicit hire/tools only)
18. **subcontractors** — GO (explicit quote provenance)
19. **preliminaries** — GO (explicit; not auto from CONSTRUCTION)
20. **overhead** — GO when entered; company setting otherwise OVERHEAD_NOT_CONFIGURED
21. **contingency** — GO (explicit; not silent)
22. **warranty** — GO (provision cost internal)
23. **scope** — reuses quote `scopeOfWork`
24. **exclusions** — reuses quote `exclusions`
25. **assumptions** — reuses quote `assumptions`
26. **missing-info warnings** — MATERIAL_COST_MISSING, LABOUR_*, COST_ESTIMATE_INCOMPLETE, VAT_BASIS_REVIEW_REQUIRED, etc.
27. **confidence** — COMPLETE / PARTIAL / REVIEW_REQUIRED / INSUFFICIENT_INFORMATION
28. **direct cost** — sum of direct component types only
29. **total estimated cost** — direct + overhead + contingency + warranty
30. **VAT basis** — VAT_EXCLUSIVE / VAT_INCLUSIVE / UNKNOWN (+ normalize helper)
31. **multiplier** — Sell/Cost (null when cost missing/0)
32. **markup** — (Sell−Cost)/Cost in bps
33. **gross margin** — (Sell−Cost)/Sell in bps
34. **estimated GP** — Sell ex VAT − Total Estimated Cost (internal)
35. **options** — `optionTier` supported on components; no multi-accepted revenue
36. **snapshot** — `quote_cost_snapshots` with version + idempotent client_action_id; issued quotes blocked from silent rewrite
37. **Row 90 protection** — customer presentation unchanged; internal call-out ≠ customer charge
38. **Row 92 protection** — DRAFT / automation OFF enforced
39. **Row 93 protection** — sell override recalculates GP from unchanged cost
40. **Row 94 integration** — plan import with duplicate-id guard + PLAN_ESTIMATE provenance
41. **Row 95 integration** — same cost model for all scenarios (no separate engines)
42. **no-double-count** — plan import unique index; overhead/contingency once; direct vs indirect split
43. **PDF/customer-safe** — cost fields forbidden in portal projection helpers
44. **Client Portal Row-96** — forbidden field list extended; tech denied via route guard
45. **Technician restriction** — `createDenyTechnicianFromOwnerModules` on cost routes
46. **RBAC** — finance:read/write; Client/Tech denied
47. **tenant isolation** — company_id on all tables; staging probe PASS
48. **audit** — quote_cost_* events + security_audit_logs (no customer leak of full cost dumps)
49. **real staging cost audit** — see below
50. **safe fixture proof** — see verify JSON
51. **Royal Cape** — QU-0183 total 4,272,250; ITEMISED; Xero ID unchanged; estimated cost 0 (incomplete — not backfilled)
52. **tests/builds** — shared Row96 11/11; focused 103/103; web build PASS; db TS2589 baseline truthful
53. **known gaps** — inventory catalogue still 0; all 1556 YG lines lack unit cost; company overhead rate setting not present; Client Portal full E2E remains OPEN; API not redeployed in this pass (schema applied via staging SQL)
54. **commit** — `0e8a205` feat(finance): add Row 96 canonical quote cost model
55. **PR URL** — create via https://github.com/ygplumberswp-spec/young-guns-os/compare/cursor/quote-scenarios-663e...cursor/canonical-quote-cost-model-663e?expand=1 (local `gh` unauthenticated; branch pushed)
56. **Row 97 not started** — true
57. **Row 98 not started** — true
58. **Row 99 not started** — true
59. **Row 92 automation OFF** — true
60. **Xero writes** — 0
61. **customer sends** — 0
62. **production deploy/migration/writes** — 0

---

## Real staging audit (YGP)

| Metric | Value |
|--------|------:|
| Quotes | 253 |
| Quote lines | 1556 |
| Lines with internal unit cost | 0 |
| Lines without cost | 1556 |
| Structured Row 96 components (pre-fixture) | 0 |
| Plan estimate cost components | 0 |
| Inventory items | 0 |
| Labour rate config | 8000 c/hr (present) |
| Overhead company setting | NOT_CONFIGURED |
| Contingency / warranty auto | NOT_AUTO_APPLIED |
| Row 92 | DRAFT / OFF |

---

## Safety confirmation

- Historical auto cost backfill = **0**
- Royal Cape not mutated
- Production deploy/migration/writes = **0**
- STOP AFTER ROW 96
