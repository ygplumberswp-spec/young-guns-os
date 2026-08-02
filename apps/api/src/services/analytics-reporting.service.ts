import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import type {
  AnalyticsDashboardQuery,
  AnalyticsReportingSection,
  AnalyticsReportingWorkspace,
  ReportBreakdown,
  ReportMetric,
  ReportMetricValue,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  inventoryStockMovements,
  jobs,
  leadActivities,
  leads,
  mobileTimeEntries,
  mobileWorkforceRequests,
  quotes,
  sdCallbackRecords,
} from '@titan/db';
import type { AnalyticsService } from './analytics.service.js';
import type { FinanceIntelligenceService } from './finance-intelligence.service.js';
import type { FleetService } from './fleet.service.js';
import { resolveRange } from './analytics-reporting-utils.js';

type AnalyticsReportingServiceDeps = {
  db: DatabaseClient;
  analyticsService: AnalyticsService;
  financeIntelligenceService: FinanceIntelligenceService;
  fleetService: FleetService;
};

export class AnalyticsReportingService {
  constructor(private readonly deps: AnalyticsReportingServiceDeps) {}

  async getReportingWorkspace(
    companyId: string,
    query: AnalyticsDashboardQuery = {},
  ): Promise<AnalyticsReportingWorkspace> {
    const range = resolveRange(query);
    const generatedAt = new Date().toISOString();

    const [
      dashboard,
      finance,
      customers,
      technicians,
      profitability,
      receivables,
      expenses,
      fleetStats,
      jobRows,
      quoteRows,
      leadRows,
      callbackRows,
      timeEntryRows,
      overtimeRequests,
      stockMovements,
    ] = await Promise.all([
      this.deps.analyticsService.getDashboard(companyId, query),
      this.deps.analyticsService.getFinanceAnalytics(companyId, query),
      this.deps.analyticsService.getCustomerAnalytics(companyId, query),
      this.deps.analyticsService.getTechnicianPerformance(companyId, query),
      this.deps.analyticsService.getProfitability(companyId, query),
      this.deps.financeIntelligenceService.getReceivablesIntelligence(companyId),
      this.deps.financeIntelligenceService.getExpenseIntelligence(companyId),
      this.deps.fleetService.getStats(companyId),
      this.deps.db.query.jobs.findMany({
        where: and(
          eq(jobs.companyId, companyId),
          gte(jobs.createdAt, range.from),
          lte(jobs.createdAt, range.to),
        ),
        with: { assignedUser: true, customer: true },
      }),
      this.deps.db.query.quotes.findMany({
        where: and(
          eq(quotes.companyId, companyId),
          gte(quotes.createdAt, range.from),
          lte(quotes.createdAt, range.to),
        ),
        with: { lead: { with: { source: true } } },
      }),
      this.deps.db.query.leads.findMany({
        where: and(
          eq(leads.companyId, companyId),
          gte(leads.createdAt, range.from),
          lte(leads.createdAt, range.to),
        ),
        with: { source: true },
      }),
      this.deps.db.query.sdCallbackRecords.findMany({
        where: and(
          eq(sdCallbackRecords.companyId, companyId),
          gte(sdCallbackRecords.createdAt, range.from),
          lte(sdCallbackRecords.createdAt, range.to),
        ),
      }),
      this.deps.db.query.mobileTimeEntries.findMany({
        where: and(
          eq(mobileTimeEntries.companyId, companyId),
          gte(mobileTimeEntries.startedAt, range.from),
          lte(mobileTimeEntries.startedAt, range.to),
        ),
      }),
      this.deps.db.query.mobileWorkforceRequests.findMany({
        where: and(
          eq(mobileWorkforceRequests.companyId, companyId),
          eq(mobileWorkforceRequests.requestType, 'overtime_request'),
          gte(mobileWorkforceRequests.createdAt, range.from),
          lte(mobileWorkforceRequests.createdAt, range.to),
        ),
      }),
      this.deps.db.query.inventoryStockMovements.findMany({
        where: and(
          eq(inventoryStockMovements.companyId, companyId),
          eq(inventoryStockMovements.movementType, 'issue'),
          gte(inventoryStockMovements.createdAt, range.from),
          lte(inventoryStockMovements.createdAt, range.to),
        ),
      }),
    ]);

    const currency = dashboard.currency;
    const invoicedCents = dashboard.invoicePerformance.totalInvoicedCents;
    const cashReceivedCents = dashboard.paymentPerformance.totalCents;
    const supplierSpendCents = expenses.supplierSpendingCents;
    const netCashMovementCents = cashReceivedCents - supplierSpendCents;
    const completedJobs = dashboard.jobVolume.completed;
    const averageJobValueCents =
      completedJobs > 0 ? Math.round(invoicedCents / completedJobs) : null;
    const collectionRatePercent =
      invoicedCents > 0
        ? Math.round((dashboard.invoicePerformance.totalPaidCents / invoicedCents) * 100)
        : null;

    const firstTimeCompleted = jobRows.filter(
      (job) =>
        job.status === 'completed' && job.parentJobId == null && job.reopenAt == null,
    ).length;
    const firstTimeCompletionPercent =
      completedJobs > 0 ? Math.round((firstTimeCompleted / completedJobs) * 100) : null;

    const retentionPercent =
      customers.totalCustomers > 0
        ? Math.round((customers.repeatCustomers / customers.totalCustomers) * 100)
        : null;

    const jobTimeMinutes = timeEntryRows
      .filter((row) => row.entryType === 'job_time')
      .reduce((sum, row) => sum + (row.durationMinutes ?? 0), 0);
    const travelMinutes = timeEntryRows
      .filter((row) => row.entryType === 'travel')
      .reduce((sum, row) => sum + (row.durationMinutes ?? 0), 0);
    const assignedTechnicians = technicians.technicians.length;
    const periodDays = Math.max(
      1,
      Math.ceil((range.to.getTime() - range.from.getTime()) / (24 * 60 * 60 * 1000)),
    );
    const utilisationPercent =
      assignedTechnicians > 0 && jobTimeMinutes > 0
        ? Math.round(
            (jobTimeMinutes / (assignedTechnicians * periodDays * 8 * 60)) * 100,
          )
        : null;

    const fleetTotal = fleetStats.totalCount;
    const fleetAvailabilityPercent =
      fleetTotal > 0 ? Math.round((fleetStats.availableCount / fleetTotal) * 100) : null;

    const now = new Date();
    const lateJobs = jobRows.filter(
      (job) =>
        job.scheduledAt &&
        job.scheduledAt < now &&
        !['completed', 'cancelled'].includes(job.status),
    );
    const unassignedJobs = jobRows.filter((job) => !job.assignedUserId);
    const cancelledJobs = jobRows.filter((job) => job.status === 'cancelled');
    const callbackCount =
      callbackRows.length +
      jobRows.filter((job) => job.parentJobId != null || job.reopenAt != null).length;

    const jobsWithSchedule = jobRows.filter((job) => job.scheduledAt && job.scheduledEndAt);
    const estimatedVsActualSamples = jobsWithSchedule.filter((job) => {
      const actualMinutes = timeEntryRows
        .filter((row) => row.jobId === job.id && row.entryType === 'job_time')
        .reduce((sum, row) => sum + (row.durationMinutes ?? 0), 0);
      return actualMinutes > 0;
    });

    const leadActivityRows =
      leadRows.length > 0
        ? await this.deps.db.query.leadActivities.findMany({
            where: and(
              eq(leadActivities.companyId, companyId),
              inArray(
                leadActivities.leadId,
                leadRows.map((row) => row.id),
              ),
            ),
            orderBy: [leadActivities.occurredAt],
          })
        : [];

    const responseTimes: number[] = [];
    for (const lead of leadRows) {
      const firstActivity = leadActivityRows.find((row) => row.leadId === lead.id);
      if (firstActivity) {
        responseTimes.push(
          (firstActivity.occurredAt.getTime() - lead.createdAt.getTime()) / (1000 * 60 * 60),
        );
      }
    }
    const avgResponseHours =
      responseTimes.length > 0
        ? Math.round((responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) * 10) / 10
        : null;

    const convertedLeads = leadRows.filter((row) => row.status === 'converted').length;
    const leadConversionPercent =
      leadRows.length > 0 ? Math.round((convertedLeads / leadRows.length) * 100) : null;

    const lostReasonCounts = new Map<string, number>();
    for (const lead of leadRows.filter((row) => row.status === 'lost')) {
      const reason = lead.lostReason?.trim() || 'Unspecified';
      lostReasonCounts.set(reason, (lostReasonCounts.get(reason) ?? 0) + 1);
    }

    const leadsBySource = new Map<string, number>();
    for (const lead of leadRows) {
      const label = lead.source?.name ?? 'Unknown source';
      leadsBySource.set(label, (leadsBySource.get(label) ?? 0) + 1);
    }

    const revenueBySource = new Map<string, number>();
    for (const quote of quoteRows.filter((row) => row.status === 'accepted')) {
      const label = quote.lead?.source?.name ?? 'Direct / unknown';
      revenueBySource.set(
        label,
        (revenueBySource.get(label) ?? 0) + (quote.totalCents ?? 0),
      );
    }

    const quoteValueCents = quoteRows.reduce((sum, row) => sum + (row.totalCents ?? 0), 0);
    const followUpLeads = leadRows.filter(
      (row) => row.nextActionDueAt && row.nextActionDueAt >= range.from && row.nextActionDueAt <= range.to,
    );
    const overdueFollowUps = followUpLeads.filter(
      (row) => row.nextActionDueAt && row.nextActionDueAt < now,
    );

    const dataSources = [
      'invoices',
      'payments',
      'jobs',
      'customers',
      'quotes',
      'leads',
      'lead_activities',
      'mobile_time_entries',
      'inventory_stock_movements',
      'sd_callback_records',
      'purchase_orders',
      'vehicles',
    ];

    const metric = (
      id: string,
      label: string,
      definition: string,
      value: ReportMetricValue,
      source: string,
      drillDownHref: string | null,
    ): ReportMetric => ({
      id,
      label,
      definition,
      value,
      source,
      lastUpdatedAt: generatedAt,
      drillDownHref,
    });

    const money = (cents: number): ReportMetricValue => ({ kind: 'money', cents, currency });
    const count = (n: number): ReportMetricValue => ({ kind: 'count', count: n });
    const percent = (p: number): ReportMetricValue => ({ kind: 'percent', percent: p });
    const hours = (h: number): ReportMetricValue => ({ kind: 'hours', hours: h });
    const unavailable = (reason: string): ReportMetricValue => ({ kind: 'unavailable', reason });

    const executiveMetrics: ReportMetric[] = [
      metric(
        'invoiced_revenue',
        'Invoiced revenue',
        'Total invoice amounts created in the selected period (accrual).',
        money(invoicedCents),
        'invoices.created_at',
        '/finance/invoices',
      ),
      metric(
        'cash_received',
        'Cash received',
        'Payment amounts recorded in the selected period (cash basis).',
        money(cashReceivedCents),
        'payments.paid_at',
        '/finance/payments',
      ),
      metric(
        'net_cash_movement',
        'Net cash movement',
        'Cash received minus supplier procurement spend in period.',
        money(netCashMovementCents),
        'payments + purchase_orders',
        '/finance/cashflow',
      ),
      metric(
        'outstanding',
        'Outstanding',
        'Open invoice balances (sent, partial, overdue).',
        money(dashboard.outstandingBalances.totalCents),
        'invoices.status',
        '/finance/receivables',
      ),
      metric(
        'overdue',
        'Overdue',
        'Invoices with overdue status in period activity.',
        count(dashboard.invoicePerformance.overdue),
        'invoices.status',
        '/finance/receivables',
      ),
      metric(
        'jobs_completed',
        'Jobs completed',
        'Jobs marked completed in the selected period.',
        count(completedJobs),
        'jobs.status',
        '/jobs?status=completed',
      ),
      metric(
        'average_job_value',
        'Average job value',
        'Invoiced revenue divided by completed jobs in period.',
        averageJobValueCents !== null ? money(averageJobValueCents) : unavailable('No completed jobs in period'),
        'invoices + jobs',
        '/jobs',
      ),
      metric(
        'quote_conversion',
        'Quote conversion',
        'Accepted quotes divided by sent or accepted quotes in period.',
        customers.quoteConversionRatePercent !== null
          ? percent(customers.quoteConversionRatePercent)
          : unavailable('No quotes sent in period'),
        'quotes.status',
        '/quotes',
      ),
      metric(
        'collection_rate',
        'Collection rate',
        'Invoice amount paid divided by total invoiced in period.',
        collectionRatePercent !== null
          ? percent(collectionRatePercent)
          : unavailable('No invoiced amount in period'),
        'invoices.amount_paid_cents',
        '/finance/receivables',
      ),
      metric(
        'first_time_completion',
        'First-time completion',
        'Completed jobs without parent job or reopen in period.',
        firstTimeCompletionPercent !== null
          ? percent(firstTimeCompletionPercent)
          : unavailable('No completed jobs in period'),
        'jobs.parent_job_id',
        '/jobs?status=completed',
      ),
      metric(
        'customer_retention',
        'Customer retention',
        'Customers with more than one job as share of verified customers.',
        retentionPercent !== null
          ? percent(retentionPercent)
          : unavailable('No verified customers'),
        'jobs.customer_id',
        '/customers',
      ),
      metric(
        'workforce_utilisation',
        'Workforce utilisation',
        'Job time logged vs available technician hours in period.',
        utilisationPercent !== null
          ? percent(Math.min(utilisationPercent, 100))
          : unavailable('No mobile time entries in period'),
        'mobile_time_entries.job_time',
        '/workforce-intelligence',
      ),
      metric(
        'fleet_availability',
        'Fleet availability',
        'Vehicles marked available as share of fleet total.',
        fleetAvailabilityPercent !== null
          ? percent(fleetAvailabilityPercent)
          : unavailable('No fleet vehicles registered'),
        'vehicles.status',
        '/fleet',
      ),
    ];

    const statusBreakdown: ReportBreakdown = {
      id: 'jobs_by_status',
      title: 'Jobs by status',
      definition: 'Job count grouped by workflow status in the selected period.',
      source: 'jobs.status',
      lastUpdatedAt: generatedAt,
      emptyMessage: 'No jobs created in this period.',
      rows: ['new', 'scheduled', 'in_progress', 'completed', 'cancelled'].map((status) => ({
        label: status.replace(/_/g, ' '),
        value: jobRows.filter((job) => job.status === status).length,
        href: `/jobs?status=${status}`,
      })),
    };

    const technicianBreakdown: ReportBreakdown = {
      id: 'jobs_by_technician',
      title: 'Jobs by technician',
      definition: 'Assigned and completed jobs per technician in period.',
      source: 'jobs.assigned_user_id',
      lastUpdatedAt: generatedAt,
      emptyMessage: 'No technician assignments in this period.',
      rows: technicians.technicians.map((tech) => ({
        label: tech.name,
        value: tech.jobsAssigned,
        displayValue: `${tech.jobsCompleted} completed`,
        href: `/jobs?assigned=${tech.userId}`,
      })),
    };

    const serviceBreakdown: ReportBreakdown = {
      id: 'jobs_by_service',
      title: 'Jobs by service',
      definition: 'Job count grouped by job type / service in period.',
      source: 'jobs.job_type',
      lastUpdatedAt: generatedAt,
      emptyMessage: 'No jobs with service types in this period.',
      rows: [...groupBy(jobRows, (job) => job.jobType ?? 'Unspecified')].map(([label, rows]) => ({
        label,
        value: rows.length,
        href: '/jobs',
      })),
    };

    const operationalMetrics: ReportMetric[] = [
      metric(
        'late_jobs',
        'Late jobs',
        'Scheduled jobs past due date and not completed.',
        count(lateJobs.length),
        'jobs.scheduled_at',
        '/jobs',
      ),
      metric(
        'callbacks',
        'Callbacks',
        'Service delivery callbacks plus reopened or child jobs.',
        count(callbackCount),
        'sd_callback_records + jobs.reopen',
        '/jobs',
      ),
      metric(
        'cancelled',
        'Cancelled',
        'Jobs cancelled in the selected period.',
        count(cancelledJobs.length),
        'jobs.status',
        '/jobs?status=cancelled',
      ),
      metric(
        'unassigned',
        'Unassigned',
        'Jobs without an assigned technician in period.',
        count(unassignedJobs.length),
        'jobs.assigned_user_id',
        '/jobs?unassigned=1',
      ),
      metric(
        'overtime',
        'Overtime requests',
        'Mobile workforce overtime approval requests in period.',
        count(overtimeRequests.length),
        'mobile_workforce_requests',
        '/workforce-intelligence',
      ),
      metric(
        'travel',
        'Travel time',
        'Total travel minutes logged via mobile time entries.',
        travelMinutes > 0 ? hours(Math.round((travelMinutes / 60) * 10) / 10) : unavailable('No travel entries in period'),
        'mobile_time_entries.travel',
        '/mobile/time',
      ),
      metric(
        'stock_use',
        'Stock use',
        'Inventory issue movements linked to jobs in period.',
        count(stockMovements.length),
        'inventory_stock_movements.issue',
        '/inventory',
      ),
      metric(
        'estimated_vs_actual',
        'Estimated vs actual',
        'Jobs with scheduled duration and logged job time.',
        estimatedVsActualSamples.length > 0
          ? count(estimatedVsActualSamples.length)
          : unavailable('No jobs with both schedule and logged time'),
        'jobs.scheduled_at + mobile_time_entries',
        '/jobs',
      ),
    ];

    const financialMetrics: ReportMetric[] = [
      metric(
        'invoiced_vs_collected',
        'Invoiced vs collected',
        'Invoiced amount compared to cash received in period.',
        money(invoicedCents),
        'invoices + payments',
        '/finance',
      ),
      metric(
        'cash_in',
        'Cash in',
        'Payment inflow in the selected period.',
        money(finance.cashFlow.inflowCents),
        'payments.paid_at',
        '/finance/payments',
      ),
      metric(
        'cash_out',
        'Cash out',
        'Supplier procurement spend (ordered/received POs).',
        money(supplierSpendCents),
        'purchase_orders',
        '/procurement',
      ),
      metric(
        'debtor_aging',
        'Debtor aging (overdue)',
        'Overdue receivable balance from finance intelligence.',
        money(receivables.overdueAmountCents),
        'finance-intelligence/receivables',
        '/finance/receivables',
      ),
      metric(
        'payments_count',
        'Payments',
        'Number of payment records in period.',
        count(dashboard.paymentPerformance.count),
        'payments',
        '/finance/payments',
      ),
      metric(
        'customer_value',
        'Customer value (top)',
        'Highest revenue customer in period from payments.',
        customers.topCustomersByRevenue[0]
          ? money(customers.topCustomersByRevenue[0].revenueCents)
          : unavailable('No customer payments in period'),
        'payments.invoice.customer',
        customers.topCustomersByRevenue[0]
          ? `/customers/${customers.topCustomersByRevenue[0].customerId}`
          : '/customers',
      ),
      metric(
        'job_profitability',
        'Job profitability',
        'Total revenue from linked invoices (cost tracking not yet available).',
        money(profitability.totals.revenueCents),
        'analytics/profitability',
        '/analytics',
      ),
      metric(
        'supplier_spend',
        'Supplier spend',
        'Purchase order value for ordered/received/completed POs.',
        money(supplierSpendCents),
        'purchase_orders',
        '/procurement',
      ),
      metric(
        'expense_categories',
        'Expense categories',
        'Count of distinct payment method / expense categories tracked.',
        count(expenses.byCategory.length),
        'finance-intelligence/expenses',
        '/finance',
      ),
    ];

    const agingBreakdown: ReportBreakdown = {
      id: 'debtor_aging_buckets',
      title: 'Debtor aging buckets',
      definition: 'Outstanding receivable balances grouped by days overdue.',
      source: 'finance-intelligence/receivables',
      lastUpdatedAt: generatedAt,
      emptyMessage: 'No outstanding receivables.',
      rows: receivables.ageingBuckets.map((bucket) => ({
        label: bucket.bucket,
        value: bucket.amountCents,
        displayValue: `${bucket.count} invoice(s)`,
        href: '/finance/receivables',
      })),
    };

    const salesMetrics: ReportMetric[] = [
      metric(
        'lead_conversion',
        'Lead conversion',
        'Converted leads as share of leads created in period.',
        leadConversionPercent !== null
          ? percent(leadConversionPercent)
          : unavailable('No leads in period'),
        'leads.status',
        '/leads',
      ),
      metric(
        'response_time',
        'Response time',
        'Average hours from lead creation to first logged activity.',
        avgResponseHours !== null
          ? hours(avgResponseHours)
          : unavailable('No lead activities in period'),
        'lead_activities.occurred_at',
        '/leads',
      ),
      metric(
        'quote_value',
        'Quote value',
        'Total value of quotes created in period.',
        quoteRows.length > 0 ? money(quoteValueCents) : unavailable('No quotes in period'),
        'quotes.total_cents',
        '/quotes',
      ),
      metric(
        'follow_up_performance',
        'Follow-up performance',
        'Leads with overdue follow-up actions in period.',
        followUpLeads.length > 0
          ? count(overdueFollowUps.length)
          : unavailable('No scheduled follow-ups in period'),
        'leads.next_action_due_at',
        '/leads',
      ),
    ];

    const leadsBySourceBreakdown: ReportBreakdown = {
      id: 'leads_by_source',
      title: 'Leads by source',
      definition: 'Lead count grouped by lead source in period.',
      source: 'leads.source_id',
      lastUpdatedAt: generatedAt,
      emptyMessage: 'No leads captured in this period.',
      rows: [...leadsBySource.entries()].map(([label, value]) => ({
        label,
        value,
        href: '/leads',
      })),
    };

    const lostReasonBreakdown: ReportBreakdown = {
      id: 'decline_lost_reasons',
      title: 'Decline / lost reasons',
      definition: 'Lost leads grouped by recorded lost reason.',
      source: 'leads.lost_reason',
      lastUpdatedAt: generatedAt,
      emptyMessage: 'No lost leads in this period.',
      rows: [...lostReasonCounts.entries()].map(([label, value]) => ({
        label,
        value,
        href: '/leads?status=lost',
      })),
    };

    const revenueBySourceBreakdown: ReportBreakdown = {
      id: 'revenue_by_source',
      title: 'Revenue by source',
      definition: 'Accepted quote value grouped by lead source.',
      source: 'quotes + leads.source_id',
      lastUpdatedAt: generatedAt,
      emptyMessage: 'No accepted quotes linked to lead sources in period.',
      rows: [...revenueBySource.entries()].map(([label, cents]) => ({
        label,
        value: cents,
        displayValue: `${(cents / 100).toFixed(2)} ${currency}`,
        href: '/quotes',
      })),
    };

    const sections: AnalyticsReportingSection[] = [
      {
        id: 'executive',
        title: 'Executive reports',
        metrics: executiveMetrics,
        breakdowns: [],
      },
      {
        id: 'operational',
        title: 'Operational reports',
        metrics: operationalMetrics,
        breakdowns: [statusBreakdown, technicianBreakdown, serviceBreakdown],
      },
      {
        id: 'financial',
        title: 'Financial reports',
        metrics: financialMetrics,
        breakdowns: [agingBreakdown],
      },
      {
        id: 'sales',
        title: 'Sales reports',
        metrics: salesMetrics,
        breakdowns: [leadsBySourceBreakdown, lostReasonBreakdown, revenueBySourceBreakdown],
      },
    ];

    return {
      period: dashboard.period,
      range: dashboard.range,
      currency,
      generatedAt,
      dataSources,
      sections,
    };
  }
}

function groupBy<T>(rows: T[], keyFn: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}
