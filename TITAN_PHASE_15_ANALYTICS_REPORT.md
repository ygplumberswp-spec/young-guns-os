# TITAN Phase 15 — Analytics & Reporting

**Branch:** `cursor/titan-owner-operating-model-final`  
**Base (Phase 14):** `6f3bf9f`  
**Final SHA:** `845fa9c`  
**Environment:** Staging only — production not touched  
**Generated:** 2026-08-02  

## Verdict

| Surface | Verdict | Evidence |
|---|---|---|
| **Reporting workspace API** | **GO** | `GET /api/v1/analytics/reporting-workspace` @ 247 — 200, 4 sections, 12 data sources |
| **Invoiced vs cash separation** | **GO** | Executive metrics `invoiced_revenue` and `cash_received` both `money` kind, distinct values |
| **Report UX contract** | **GO** | Date range, source label, last updated, drill-down hrefs, truthful `unavailable` empty states |
| **Analytics UI** | **GO** | `/analytics` @ 1440/768 — Executive / Operational / Financial / Sales + Report catalog |
| **Staging verify 247** | **GO** | 0 blockers, 11 expected HOLD metrics (sparse staging data) |

**Overall:** **GO** @ `845fa9c` — authenticated staging verification 247

## Summary

Phase 15 delivers a **reporting workspace** aggregating reconciled tenant metrics into Executive, Operational, Financial, and Sales sections. Invoiced revenue (accrual from invoices) and cash received (payments) are reported separately. Metrics include definition, source table/API, generated timestamp, drill-down links where records exist, and explicit unavailable reasons — never fabricated zeros for missing signals.

## API

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/v1/analytics/reporting-workspace` | Full reporting workspace for selected period |

Query: `period=daily|weekly|monthly` (optional `from`/`to` ISO datetimes)

### Data sources (reconciled)

1. `invoices` — invoiced revenue, outstanding, overdue
2. `payments` — cash received, collection rate
3. `jobs` — completion, status/technician/service breakdowns
4. `customers` — retention, repeat business
5. `quotes` — conversion, quote value
6. `leads` / `lead_activities` — sales funnel, response time
7. `mobile_time_entries` — travel, utilisation
8. `mobile_workforce_requests` — overtime
9. `inventory_stock_movements` — stock use (issues)
10. `sd_callback_records` — callbacks
11. `purchase_orders` — supplier spend / cash out
12. `vehicles` — fleet availability

### Executive metrics (13)

Invoiced revenue, cash received, net cash movement, outstanding, overdue, jobs completed, average job value, quote conversion, collection rate, first-time completion, customer retention, workforce utilisation, fleet availability.

### Operational metrics + breakdowns

Late jobs, callbacks, cancelled, unassigned, overtime, travel, stock use, estimated vs actual; breakdowns: jobs by status, by technician, by service.

### Financial metrics + breakdowns

Invoiced vs collected, cash in/out, debtor aging, payments, customer value, job profitability, supplier spend, expense categories; breakdown: debtor aging buckets.

### Sales metrics + breakdowns

Lead conversion, response time, quote value, follow-up performance; breakdowns: leads by source, decline/lost reasons, revenue by source.

## UI

| Route | Component | Notes |
|---|---|---|
| `/analytics` | `AnalyticsPage` | Period selector, 4 reporting sections, report catalog tab |

Each metric card shows value (or `—` + reason), definition, source, last updated, and drill-down link when applicable.

## Deliverables

| Deliverable | Path |
|---|---|
| Phase 15 report | `TITAN_PHASE_15_ANALYTICS_REPORT.md` |
| Report definitions | `docs/ANALYTICS_REPORT_DEFINITIONS.md` |
| Staging verify script | `diagnostic-output/247-analytics-reporting-verify.mjs` |
| Staging verify JSON | `diagnostic-output/247-analytics-reporting-verify.json` |
| Staging screenshots | `diagnostic-output/phase15-analytics-reporting-staging/` |

## Files changed (Phase 15)

### New
- `packages/shared/src/analytics-reporting.ts`
- `apps/api/src/services/analytics-reporting.service.ts`
- `apps/api/src/services/analytics-reporting-utils.ts`
- `apps/web/src/features/analytics/ReportingSectionView.tsx`
- `apps/web/src/features/analytics/format-metric-value.ts`
- `docs/ANALYTICS_REPORT_DEFINITIONS.md`
- `diagnostic-output/247-analytics-reporting-verify.mjs`

### Updated
- `packages/shared/src/index.ts`
- `apps/api/src/index.ts`
- `apps/api/src/routes/analytics.ts`
- `apps/web/src/lib/analytics-api.ts`
- `apps/web/src/pages/analytics/AnalyticsPage.tsx`
- `apps/web/src/index.css`

## Local verification

| Check | Result |
|---|---|
| Shared build | PASS |
| API typecheck | PASS |
| Web typecheck | PASS |
| Web build | PASS |

## Staging verification @ 247

| Check | Result |
|---|---|
| `GET /analytics/reporting-workspace` | 200 |
| 4 sections (executive/operational/financial/sales) | PASS |
| 12 dataSources | PASS |
| Metric contract (definition/source/lastUpdated/value) | PASS |
| Invoiced revenue + cash received separate | PASS |
| `/analytics` UI @ 1440/768 | PASS |
| Date range + source labels visible | PASS |
| Console blockers | None |

**YGP staging snapshot:** Real reconciled counts from tenant DB; sparse Sunday staging yields truthful `unavailable` for 11 metrics (see HOLD list below) — not synthetic zeros.

**Staging deploy IDs**

| Service | Deployment ID |
|---|---|
| API (`young-guns-os`) | `6caac810-bd5e-41f9-8dd7-4cdeeca48a4e` |
| Web (`comfortable-determination`) | `f85fac4d-51ae-4f58-bfdb-58c96f3b5a15` |

## HOLD metrics (expected on sparse staging)

| Section | Metric | Reason |
|---|---|---|
| Executive | average_job_value | No completed jobs in period |
| Executive | quote_conversion | No quotes sent in period |
| Executive | first_time_completion | No completed jobs in period |
| Executive | customer_retention | No verified customers |
| Executive | workforce_utilisation | No mobile time entries in period |
| Operational | travel | No travel entries in period |
| Operational | estimated_vs_actual | No jobs with both schedule and logged time |
| Financial | customer_value | No customer payments in period |
| Sales | response_time | No lead activities in period |
| Sales | quote_value | No quotes in period |
| Sales | follow_up_performance | No scheduled follow-ups in period |

These display as `—` with explicit reason in UI — correct honest empty state per master directive.

## Phase 16

**Not started.** Phase 15 stop gate observed.
