# Analytics Report Definitions (Phase 15)

Companion reference for metrics surfaced in `/analytics` reporting workspace.
Each metric includes definition, data source, date range (from workspace `range`), last update (`generatedAt`), drill-down href when records exist, and truthful empty state (`unavailable` reason) when data cannot be computed.

## Executive

| Metric | Definition | Source |
|---|---|---|
| Invoiced revenue | Invoice amounts created in period (accrual) | `invoices.created_at` |
| Cash received | Payments recorded in period (cash basis) | `payments.paid_at` |
| Net cash movement | Cash received minus supplier PO spend | `payments` + `purchase_orders` |
| Outstanding | Open invoice balances | `invoices.status` |
| Overdue | Invoices with overdue status | `invoices.status` |
| Jobs completed | Jobs marked completed in period | `jobs.status` |
| Average job value | Invoiced revenue ÷ completed jobs | `invoices` + `jobs` |
| Quote conversion | Accepted ÷ sent/accepted quotes | `quotes.status` |
| Collection rate | Paid invoice amount ÷ invoiced in period | `invoices.amount_paid_cents` |
| First-time completion | Completed jobs without parent/reopen | `jobs.parent_job_id` |
| Customer retention | Repeat customers ÷ verified customers | `jobs.customer_id` |
| Workforce utilisation | Job time vs available technician hours | `mobile_time_entries.job_time` |
| Fleet availability | Available vehicles ÷ fleet total | `vehicles.status` |

## Operational

| Metric / breakdown | Definition | Source |
|---|---|---|
| Jobs by status | Count by workflow status | `jobs.status` |
| Jobs by technician | Assigned/completed per technician | `jobs.assigned_user_id` |
| Jobs by service | Count by job type | `jobs.job_type` |
| Late jobs | Scheduled past due, not completed | `jobs.scheduled_at` |
| Callbacks | SD callbacks + reopened/child jobs | `sd_callback_records` + `jobs` |
| Cancelled / unassigned | Status and assignment filters | `jobs` |
| Overtime | Mobile overtime requests | `mobile_workforce_requests` |
| Travel | Travel minutes from time entries | `mobile_time_entries.travel` |
| Stock use | Inventory issue movements | `inventory_stock_movements.issue` |
| Estimated vs actual | Jobs with schedule + logged time | `jobs` + `mobile_time_entries` |

## Financial

| Metric / breakdown | Definition | Source |
|---|---|---|
| Invoiced vs collected | Period invoiced amount (see cash in for collected) | `invoices` + `payments` |
| Cash in / out | Payment inflow; supplier procurement spend | `payments`; `purchase_orders` |
| Debtor aging | Overdue receivable balance + buckets | `finance-intelligence/receivables` |
| Payments | Payment record count in period | `payments` |
| Customer value | Top customer by payment revenue | `payments.invoice.customer` |
| Job profitability | Invoice-linked revenue (cost tracking pending) | `analytics/profitability` |
| Supplier spend | Ordered/received PO value | `purchase_orders` |
| Expense categories | Distinct payment method categories | `finance-intelligence/expenses` |

## Sales

| Metric / breakdown | Definition | Source |
|---|---|---|
| Leads by source | Lead count by source | `leads.source_id` |
| Response time | Hours from lead create to first activity | `lead_activities.occurred_at` |
| Lead conversion | Converted ÷ created leads | `leads.status` |
| Decline/lost reasons | Lost leads by `lost_reason` | `leads.lost_reason` |
| Revenue by source | Accepted quote value by lead source | `quotes` + `leads.source_id` |
| Quote value | Sum of quote totals in period | `quotes.total_cents` |
| Follow-up performance | Overdue follow-ups vs scheduled | `leads.next_action_due_at` |

## HOLD metrics (expected empty on sparse staging)

Metrics return `—` with reason when underlying records are absent — never fabricated zero for unavailable signals:

- Workforce utilisation (no mobile time entries)
- Estimated vs actual (no schedule + logged time pairs)
- Lead response time (no lead activities)
- Follow-up performance (no scheduled follow-ups)
- Fleet availability (no vehicles)
