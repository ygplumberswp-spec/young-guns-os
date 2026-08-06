import { and, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import {
  companies,
  completionReports,
  customers,
  cxCustomerProperties,
  invoices,
  jobs,
  payments,
  quotes,
  xeroBankTransactions,
  xeroCreditNotes,
  xeroEntityCoverage,
} from '@titan/db';
import {
  annotateBankFeedRows,
  buildReceivableAgingSummary,
  classifyAgingBucket,
  FINANCE_CASH_NOT_PROFIT_NOTE,
  FINANCE_DUPLICATE_PREVENTION_BASIS,
  FINANCE_PROFIT_UNAVAILABLE_NOTE,
  invoiceBalanceDueCents,
  resolveFinanceFreshness,
  resolveFinanceSourceSystem,
  type ReceivableInvoiceLine,
} from '@titan/shared';
import type {
  AccountsReceivableReportContext,
  CashflowCollectionsReportContext,
  CustomerHistoryTimelineItem,
  CustomerPropertyHistoryReportContext,
  FinanceAggregateReportContext,
} from '@titan/shared';
import {
  displayOfficialInvoiceNumber,
  displayOfficialQuoteNumber,
  financeMetric,
  formatFinanceAuraCents,
  resolveCompanyLocale,
  resolveCustomerPublicReference,
  type FinanceReportPeriod,
} from '@titan/shared';

export class FinanceReportDataError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'VALIDATION_ERROR',
    message: string,
  ) {
    super(message);
    this.name = 'FinanceReportDataError';
  }
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function maskBankDescription(description: string | null): string | null {
  if (!description) return description;
  return description.replace(/\b\d{6,}\b/g, '****');
}

function reportRef(prefix: string, suffix: string): string {
  return `${prefix}-${suffix}`;
}

function isoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function invoicePublicNumber(row: {
  xeroInvoiceNumber: string | null;
  invoiceNumber: string;
}): string {
  return displayOfficialInvoiceNumber({ xeroInvoiceNumber: row.xeroInvoiceNumber });
}

function quotePublicNumber(row: {
  xeroQuoteNumber: string | null;
  quoteNumber: string;
}): string {
  const official = displayOfficialQuoteNumber({ xeroQuoteNumber: row.xeroQuoteNumber });
  if (official.startsWith('Draft')) return row.quoteNumber;
  return official;
}

function jobPublicReference(row: { jobNumber: string | null; id: string }): string {
  return row.jobNumber?.trim() || `JOB-${row.id.slice(0, 8).toUpperCase()}`;
}

function buildMonthlyTotals(
  points: Array<{ at: Date; amountCents: number }>,
  period: FinanceReportPeriod,
): Array<{ month: string; amountCents: number }> {
  const map = new Map<string, number>();
  const cursor = new Date(Date.UTC(
    Number(period.periodStart.slice(0, 4)),
    Number(period.periodStart.slice(5, 7)) - 1,
    1,
  ));
  const end = new Date(Date.UTC(
    Number(period.periodEnd.slice(0, 4)),
    Number(period.periodEnd.slice(5, 7)) - 1,
    1,
  ));
  while (cursor <= end) {
    map.set(monthKey(cursor), 0);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  for (const p of points) {
    const key = monthKey(p.at);
    if (map.has(key)) {
      map.set(key, (map.get(key) ?? 0) + p.amountCents);
    }
  }
  return [...map.entries()].map(([month, amountCents]) => ({ month, amountCents }));
}

export class FinanceReportDataService {
  constructor(private readonly db: DatabaseClient) {}

  private async loadCompany(companyId: string) {
    const company = await this.db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });
    if (!company) throw new FinanceReportDataError('NOT_FOUND', 'Company not found');
    return company;
  }

  private async loadCustomer(companyId: string, customerId: string) {
    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.companyId, companyId)),
    });
    if (!customer) throw new FinanceReportDataError('NOT_FOUND', 'Customer not found');
    return customer;
  }

  private async loadSyncMeta(companyId: string) {
    const coverage = await this.db
      .select({ lastSyncedAt: xeroEntityCoverage.lastSyncedAt })
      .from(xeroEntityCoverage)
      .where(eq(xeroEntityCoverage.companyId, companyId));

    const invoiceSync = await this.db
      .select({ syncedAt: sql<Date | null>`max(${invoices.sourceSyncedAt})` })
      .from(invoices)
      .where(eq(invoices.companyId, companyId));

    const paymentSync = await this.db
      .select({ syncedAt: sql<Date | null>`max(${payments.sourceSyncedAt})` })
      .from(payments)
      .where(eq(payments.companyId, companyId));

    const timestamps = [
      ...coverage.map((c) => c.lastSyncedAt?.toISOString() ?? null),
      invoiceSync[0]?.syncedAt ? new Date(invoiceSync[0].syncedAt).toISOString() : null,
      paymentSync[0]?.syncedAt ? new Date(paymentSync[0].syncedAt).toISOString() : null,
    ].filter(Boolean) as string[];

    const lastSuccessfulSyncAt =
      timestamps.length > 0
        ? timestamps.sort((a, b) => Date.parse(b) - Date.parse(a))[0]!
        : null;

    return { lastSuccessfulSyncAt };
  }

  private async loadTenantInvoices(companyId: string, period?: FinanceReportPeriod) {
    const conditions = [eq(invoices.companyId, companyId)];
    if (period) {
      conditions.push(
        or(
          and(gte(invoices.issuedAt, period.fromInstant), lte(invoices.issuedAt, period.toInstant)),
          and(gte(invoices.createdAt, period.fromInstant), lte(invoices.createdAt, period.toInstant)),
        )!,
      );
    }
    return this.db.query.invoices.findMany({ where: and(...conditions) });
  }

  private async loadOutstandingInvoices(companyId: string) {
    return this.db.query.invoices.findMany({
      where: and(
        eq(invoices.companyId, companyId),
        inArray(invoices.status, ['sent', 'partial', 'overdue']),
      ),
    });
  }

  private async loadTenantPayments(companyId: string, period?: FinanceReportPeriod) {
    const conditions = [eq(payments.companyId, companyId)];
    if (period) {
      conditions.push(gte(payments.paidAt, period.fromInstant));
      conditions.push(lte(payments.paidAt, period.toInstant));
    }
    return this.db.query.payments.findMany({ where: and(...conditions) });
  }

  private async loadCustomerNames(companyId: string, customerIds: string[]) {
    if (!customerIds.length) return new Map<string, string>();
    const rows = await this.db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(and(eq(customers.companyId, companyId), inArray(customers.id, customerIds)));
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  private buildProvenance(input: {
    currency: string;
    invoices: Array<{ sourceProvider: string | null }>;
    lastSuccessfulSyncAt: string | null;
    coverageNote: string;
  }) {
    const sourceSystem = resolveFinanceSourceSystem(input.invoices);
    return {
      sourceSystem,
      sourceRecordType: 'titan_invoices_payments',
      syncedAt: input.lastSuccessfulSyncAt,
      lastSuccessfulSyncAt: input.lastSuccessfulSyncAt,
      coverageStatus: input.coverageNote,
      completenessStatus: input.lastSuccessfulSyncAt
        ? 'synchronized_where_available'
        : 'local_only',
      duplicatePreventionBasis: FINANCE_DUPLICATE_PREVENTION_BASIS,
      reportingBasis: 'mixed' as const,
      currency: input.currency,
      vatBasis: 'Stored invoice VAT fields only — not recalculated',
    };
  }

  private resolveCurrency(
    companyCurrency: string,
    rows: Array<{ currency: string }>,
  ): { currency: string; warnings: string[] } {
    const currencies = new Set(rows.map((r) => r.currency?.trim() || companyCurrency));
    if (currencies.size <= 1) {
      return { currency: [...currencies][0] ?? companyCurrency, warnings: [] };
    }
    return {
      currency: companyCurrency,
      warnings: [
        `Mixed currencies detected (${[...currencies].join(', ')}). Totals shown in ${companyCurrency} without conversion.`,
      ],
    };
  }

  async buildFinanceAggregateReport(
    companyId: string,
    period: FinanceReportPeriod,
  ): Promise<FinanceAggregateReportContext> {
    const company = await this.loadCompany(companyId);
    const locale = resolveCompanyLocale(company.preferences);
    const syncMeta = await this.loadSyncMeta(companyId);
    const allInvoices = await this.loadTenantInvoices(companyId, period);
    const activeInvoices = allInvoices.filter((i) => i.status !== 'cancelled' && i.status !== 'draft');
    const periodPayments = await this.loadTenantPayments(companyId, period);
    const outstandingInvoices = await this.loadOutstandingInvoices(companyId);
    const customerNames = await this.loadCustomerNames(
      companyId,
      [...new Set(outstandingInvoices.map((i) => i.customerId))],
    );

    const currencyInfo = this.resolveCurrency(locale.currency, [
      ...activeInvoices,
      ...periodPayments,
    ]);
    const freshnessState = resolveFinanceFreshness(syncMeta.lastSuccessfulSyncAt);
    const formatCents = (cents: number) => formatFinanceAuraCents(cents, currencyInfo.currency);

    const invoiceCount = activeInvoices.length;
    const subtotalCents = activeInvoices.reduce((s, i) => s + Math.max(0, i.subtotalCents), 0);
    const vatCents = activeInvoices.reduce((s, i) => s + Math.max(0, i.vatCents), 0);
    const totalInvoicedCents = activeInvoices.reduce(
      (s, i) => s + Math.max(0, i.totalCents || i.amountCents),
      0,
    );
    const paymentsReceivedCents = periodPayments.reduce((s, p) => s + Math.max(0, p.amountCents), 0);

    const creditNoteRows = await this.db.query.xeroCreditNotes.findMany({
      where: and(
        eq(xeroCreditNotes.companyId, companyId),
        eq(xeroCreditNotes.type, 'ACCRECCREDIT'),
      ),
    });
    const creditNotesCents = creditNoteRows.reduce((s, c) => s + Math.max(0, c.totalCents), 0);

    const receivableLines = this.buildReceivableLines(
      outstandingInvoices,
      customerNames,
      new Date(),
    );
    const agingSummary = buildReceivableAgingSummary(receivableLines);
    const totalOutstandingCents = receivableLines.reduce((s, l) => s + l.balanceDueCents, 0);
    const overdueCents = receivableLines
      .filter((l) => l.agingBucket !== 'current' && l.agingBucket !== 'due_date_unavailable')
      .reduce((s, l) => s + l.balanceDueCents, 0);

    const statusBreakdown = [...activeInvoices.reduce((map, inv) => {
      const bucket = map.get(inv.status) ?? { status: inv.status, count: 0, totalCents: 0 };
      bucket.count += 1;
      bucket.totalCents += Math.max(0, inv.totalCents || inv.amountCents);
      map.set(inv.status, bucket);
      return map;
    }, new Map<string, { status: string; count: number; totalCents: number }>())].map(([, v]) => v);

    const topOutstanding = [...receivableLines.reduce((map, line) => {
      const cur = map.get(line.customerName) ?? 0;
      map.set(line.customerName, cur + line.balanceDueCents);
      return map;
    }, new Map<string, number>())]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([customerName, balanceDueCents]) => ({ customerName, balanceDueCents }));

    const revenueByMonth = buildMonthlyTotals(
      activeInvoices.map((i) => ({
        at: i.issuedAt ?? i.createdAt,
        amountCents: Math.max(0, i.totalCents || i.amountCents),
      })),
      period,
    );
    const paymentsByMonth = buildMonthlyTotals(
      periodPayments.map((p) => ({ at: p.paidAt, amountCents: Math.max(0, p.amountCents) })),
      period,
    );

    const dataQualityWarnings = [...currencyInfo.warnings];
    if (freshnessState === 'never_synced') {
      dataQualityWarnings.push('Accounting data has not been synchronized from Xero.');
    } else if (freshnessState === 'stale') {
      dataQualityWarnings.push('Finance sync data may be stale — verify before executive decisions.');
    }

    const provenance = this.buildProvenance({
      currency: currencyInfo.currency,
      invoices: activeInvoices,
      lastSuccessfulSyncAt: syncMeta.lastSuccessfulSyncAt,
      coverageNote: activeInvoices.some((i) => i.sourceProvider === 'xero')
        ? 'Includes Xero-synchronized invoice rows'
        : 'Local TITAN invoice ledger only',
    });

    return {
      reportReference: reportRef('FAS', period.periodEnd.replace(/-/g, '')),
      reportKind: 'finance_aggregate',
      companyName: company.name,
      currency: currencyInfo.currency,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      snapshotDate: null,
      timezone: period.timezone,
      generatedAt: new Date().toISOString(),
      provenance,
      freshnessState,
      dataSourceNote: `${provenance.sourceSystem === 'xero_synchronized' ? 'Xero-synchronized TITAN ledger' : provenance.sourceSystem === 'mixed' ? 'Mixed local and Xero-synchronized records' : 'Local TITAN operational ledger'}. ${FINANCE_DUPLICATE_PREVENTION_BASIS}`,
      dataQualityWarnings,
      metrics: [
        financeMetric('Invoice count', { count: invoiceCount, state: invoiceCount ? 'recorded' : 'measured_zero' }, formatCents),
        financeMetric('Total invoiced (excl. VAT)', { amountCents: subtotalCents || null, state: subtotalCents ? 'recorded' : invoiceCount ? 'measured_zero' : 'not_recorded' }, formatCents),
        financeMetric('VAT / tax total', { amountCents: vatCents || null, state: vatCents ? 'recorded' : invoiceCount ? 'measured_zero' : 'not_recorded' }, formatCents),
        financeMetric('Total invoiced (incl. VAT)', { amountCents: totalInvoicedCents || null, state: totalInvoicedCents ? 'recorded' : invoiceCount ? 'measured_zero' : 'not_recorded' }, formatCents),
        financeMetric('Payments received', { amountCents: paymentsReceivedCents || null, state: periodPayments.length ? 'recorded' : 'not_recorded', note: 'Cash basis — payment records only' }, formatCents),
        financeMetric('Credit notes (Xero history)', { amountCents: creditNoteRows.length ? creditNotesCents : null, state: creditNoteRows.length ? 'recorded' : 'not_recorded', note: 'Separate from invoice totals' }, formatCents),
        financeMetric('Outstanding receivables', { amountCents: totalOutstandingCents, state: totalOutstandingCents ? 'recorded' : 'measured_zero' }, formatCents),
        financeMetric('Overdue receivables', { amountCents: overdueCents, state: overdueCents ? 'recorded' : 'measured_zero' }, formatCents),
        financeMetric('Cash inflows', { amountCents: paymentsReceivedCents || null, state: periodPayments.length ? 'recorded' : 'not_recorded', note: 'Customer payments — bank feed excluded' }, formatCents),
        financeMetric('Cash outflows', { amountCents: null, state: 'unavailable', note: 'Supplier/expense outflows require classified bill data' }, formatCents),
        financeMetric('Net cash movement', { amountCents: paymentsReceivedCents || null, state: periodPayments.length ? 'recorded' : 'not_recorded', note: 'Inflows only — outflows unavailable' }, formatCents),
      ],
      revenueByMonth,
      paymentsByMonth,
      agingSummary,
      statusBreakdown,
      topOutstandingCustomers: topOutstanding,
      profitNote: FINANCE_PROFIT_UNAVAILABLE_NOTE,
      cashFlowNote: FINANCE_CASH_NOT_PROFIT_NOTE,
      vatNote: 'VAT amounts use stored invoice tax fields. Missing tax is not assumed at 15%.',
    };
  }

  private buildReceivableLines(
    invoiceRows: typeof invoices.$inferSelect[],
    customerNames: Map<string, string>,
    asOf: Date,
  ): ReceivableInvoiceLine[] {
    const lines: ReceivableInvoiceLine[] = [];
    for (const inv of invoiceRows) {
      const balanceDueCents = invoiceBalanceDueCents(inv);
      if (balanceDueCents <= 0) continue;
      const aging = classifyAgingBucket({
        balanceDueCents,
        status: inv.status,
        dueDate: inv.dueDate,
        asOf,
      });
      const flags: string[] = [];
      if (balanceDueCents < 0) flags.push('Negative balance');
      if (!inv.dueDate) flags.push('Due date unavailable');
      lines.push({
        publicNumber: invoicePublicNumber(inv),
        customerName: customerNames.get(inv.customerId) ?? 'Customer',
        invoiceDate: isoDate(inv.issuedAt ?? inv.createdAt),
        dueDate: isoDate(inv.dueDate),
        originalTotalCents: Math.max(0, inv.totalCents || inv.amountCents),
        amountPaidCents: Math.max(0, inv.amountPaidCents),
        balanceDueCents,
        status: inv.status,
        daysOverdue: aging.daysOverdue,
        agingBucket: aging.bucket,
        lastPaymentDate: null,
        flags,
      });
    }
    return lines;
  }

  async buildCashflowCollectionsReport(
    companyId: string,
    period: FinanceReportPeriod,
  ): Promise<CashflowCollectionsReportContext> {
    const company = await this.loadCompany(companyId);
    const locale = resolveCompanyLocale(company.preferences);
    const syncMeta = await this.loadSyncMeta(companyId);
    const periodPayments = await this.loadTenantPayments(companyId, period);
    const invoiceRows = await this.loadTenantInvoices(companyId);
    const customerNames = await this.loadCustomerNames(
      companyId,
      [...new Set(invoiceRows.map((i) => i.customerId))],
    );

    const bankRows = await this.db.query.xeroBankTransactions.findMany({
      where: and(
        eq(xeroBankTransactions.companyId, companyId),
        gte(xeroBankTransactions.transactionDate, period.periodStart),
        lte(xeroBankTransactions.transactionDate, period.periodEnd),
      ),
    });

    const currencyInfo = this.resolveCurrency(locale.currency, periodPayments);
    const freshnessState = resolveFinanceFreshness(syncMeta.lastSuccessfulSyncAt);
    const formatCents = (cents: number) => formatFinanceAuraCents(cents, currencyInfo.currency);

    const cashInflowsCents = periodPayments.reduce((s, p) => s + Math.max(0, p.amountCents), 0);
    const refundsCents = periodPayments
      .filter((p) => p.amountCents < 0)
      .reduce((s, p) => s + p.amountCents, 0);

    const collectionsByCustomer = [...periodPayments.reduce((map, payment) => {
      const inv = invoiceRows.find((i) => i.id === payment.invoiceId);
      const name = inv ? customerNames.get(inv.customerId) ?? 'Customer' : 'Unallocated';
      map.set(name, (map.get(name) ?? 0) + Math.max(0, payment.amountCents));
      return map;
    }, new Map<string, number>())].map(([customerName, amountCents]) => ({ customerName, amountCents }));

    const monthlyMovement = buildMonthlyTotals(
      periodPayments.map((p) => ({ at: p.paidAt, amountCents: p.amountCents })),
      period,
    ).map((m) => ({
      month: m.month,
      inflowCents: Math.max(0, m.amountCents),
      outflowCents: m.amountCents < 0 ? Math.abs(m.amountCents) : 0,
      netCents: m.amountCents,
    }));

    const provenance = this.buildProvenance({
      currency: currencyInfo.currency,
      invoices: invoiceRows,
      lastSuccessfulSyncAt: syncMeta.lastSuccessfulSyncAt,
      coverageNote: 'Cash inflows from payment records; bank feed informational',
    });

    const dataQualityWarnings = [...currencyInfo.warnings];
    if (!periodPayments.length) {
      dataQualityWarnings.push('No payment records for this period.');
    }

    return {
      reportReference: reportRef('FCF', period.periodEnd.replace(/-/g, '')),
      reportKind: 'cashflow_collections',
      companyName: company.name,
      currency: currencyInfo.currency,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      snapshotDate: null,
      timezone: period.timezone,
      generatedAt: new Date().toISOString(),
      provenance,
      freshnessState,
      dataSourceNote: `Customer payments drive cash inflow totals. Bank feed is informational only. ${FINANCE_DUPLICATE_PREVENTION_BASIS}`,
      dataQualityWarnings,
      cashInflowsCents: periodPayments.length ? cashInflowsCents : null,
      cashOutflowsCents: null,
      netCashMovementCents: periodPayments.length ? cashInflowsCents : null,
      customerPaymentsCents: periodPayments.length ? cashInflowsCents : null,
      refundsCents: refundsCents ? refundsCents : null,
      supplierPaymentsCents: null,
      monthlyMovement,
      collectionsByCustomer,
      bankFeedLines: annotateBankFeedRows(
        bankRows.map((b) => ({
          transactionDate: b.transactionDate,
          amountCents: b.amountCents,
          currency: b.currency,
          description: maskBankDescription(b.description ?? b.reference),
          category: b.category,
          type: b.type,
        })),
      ),
      unallocatedPaymentsNote: periodPayments.some((p) => !invoiceRows.find((i) => i.id === p.invoiceId))
        ? 'Some payments could not be matched to an invoice in this tenant.'
        : null,
      metrics: [
        financeMetric('Opening balance', { state: 'unavailable', note: 'No canonical opening balance stored' }, formatCents),
        financeMetric('Cash inflows', { amountCents: periodPayments.length ? cashInflowsCents : null, state: periodPayments.length ? 'recorded' : 'not_recorded' }, formatCents),
        financeMetric('Cash outflows', { state: 'unavailable', note: 'Classified expense outflows not available' }, formatCents),
        financeMetric('Net cash movement', { amountCents: periodPayments.length ? cashInflowsCents : null, state: periodPayments.length ? 'recorded' : 'not_recorded' }, formatCents),
        financeMetric('Customer payments received', { amountCents: periodPayments.length ? cashInflowsCents : null, count: periodPayments.length, state: periodPayments.length ? 'recorded' : 'not_recorded' }, formatCents),
      ],
    };
  }

  async buildAccountsReceivableReport(
    companyId: string,
    snapshot: { snapshotDate: string; timezone: string; asOf: Date },
  ): Promise<AccountsReceivableReportContext> {
    const company = await this.loadCompany(companyId);
    const locale = resolveCompanyLocale(company.preferences);
    const syncMeta = await this.loadSyncMeta(companyId);
    const outstandingInvoices = await this.loadOutstandingInvoices(companyId);
    const customerNames = await this.loadCustomerNames(
      companyId,
      [...new Set(outstandingInvoices.map((i) => i.customerId))],
    );

    const invoiceLines = this.buildReceivableLines(outstandingInvoices, customerNames, snapshot.asOf);
    const agingSummary = buildReceivableAgingSummary(invoiceLines);
    const totalOutstandingCents = invoiceLines.reduce((s, l) => s + l.balanceDueCents, 0);
    const currencyInfo = this.resolveCurrency(locale.currency, outstandingInvoices);
    const freshnessState = resolveFinanceFreshness(syncMeta.lastSuccessfulSyncAt);

    const provenance = this.buildProvenance({
      currency: currencyInfo.currency,
      invoices: outstandingInvoices,
      lastSuccessfulSyncAt: syncMeta.lastSuccessfulSyncAt,
      coverageNote: 'Outstanding balances from TITAN invoice ledger',
    });

    return {
      reportReference: reportRef('FAR', snapshot.snapshotDate.replace(/-/g, '')),
      reportKind: 'accounts_receivable',
      companyName: company.name,
      currency: currencyInfo.currency,
      periodStart: null,
      periodEnd: null,
      snapshotDate: snapshot.snapshotDate,
      timezone: snapshot.timezone,
      generatedAt: new Date().toISOString(),
      provenance,
      freshnessState,
      dataSourceNote: `Accounts receivable snapshot from TITAN invoice balances (${provenance.sourceSystem}). Voided and paid invoices excluded.`,
      dataQualityWarnings: currencyInfo.warnings,
      totalOutstandingCents,
      agingSummary,
      invoiceLines,
    };
  }

  async buildCustomerPropertyHistoryReport(
    companyId: string,
    customerId: string,
    period: FinanceReportPeriod,
    audience: 'internal' | 'client',
  ): Promise<CustomerPropertyHistoryReportContext> {
    const company = await this.loadCompany(companyId);
    const customer = await this.loadCustomer(companyId, customerId);
    const locale = resolveCompanyLocale(company.preferences);
    const syncMeta = await this.loadSyncMeta(companyId);

    const properties = await this.db.query.cxCustomerProperties.findMany({
      where: and(
        eq(cxCustomerProperties.companyId, companyId),
        eq(cxCustomerProperties.customerId, customerId),
      ),
    });

    const customerJobs = await this.db.query.jobs.findMany({
      where: and(
        eq(jobs.companyId, companyId),
        eq(jobs.customerId, customerId),
        or(
          and(gte(jobs.createdAt, period.fromInstant), lte(jobs.createdAt, period.toInstant)),
          and(gte(jobs.scheduledAt, period.fromInstant), lte(jobs.scheduledAt, period.toInstant)),
          and(gte(jobs.updatedAt, period.fromInstant), lte(jobs.updatedAt, period.toInstant)),
        ),
      ),
    });

    const customerQuotes = await this.db.query.quotes.findMany({
      where: and(
        eq(quotes.companyId, companyId),
        eq(quotes.customerId, customerId),
        gte(quotes.createdAt, period.fromInstant),
        lte(quotes.createdAt, period.toInstant),
      ),
    });

    const customerInvoices = await this.db.query.invoices.findMany({
      where: and(
        eq(invoices.companyId, companyId),
        eq(invoices.customerId, customerId),
        gte(invoices.createdAt, period.fromInstant),
        lte(invoices.createdAt, period.toInstant),
      ),
    });

    const invoiceIds = customerInvoices.map((i) => i.id);
    const customerPayments = invoiceIds.length
      ? await this.db.query.payments.findMany({
          where: and(
            eq(payments.companyId, companyId),
            inArray(payments.invoiceId, invoiceIds),
            gte(payments.paidAt, period.fromInstant),
            lte(payments.paidAt, period.toInstant),
          ),
        })
      : [];

    const jobIds = customerJobs.map((j) => j.id);
    const reports = jobIds.length
      ? await this.db.query.completionReports.findMany({
          where: and(
            eq(completionReports.companyId, companyId),
            inArray(completionReports.jobId, jobIds),
          ),
        })
      : [];

    const propertyMap = new Map(properties.map((p) => [p.id, p.propertyName]));

    const timeline: CustomerHistoryTimelineItem[] = [];

    for (const job of customerJobs) {
      timeline.push({
        date: isoDate(job.scheduledAt ?? job.createdAt) ?? period.periodStart,
        kind: 'job',
        publicReference: jobPublicReference(job),
        title: job.title,
        status: job.status,
        amountCents: null,
        propertyName: job.propertyId ? propertyMap.get(job.propertyId) ?? null : null,
      });
    }

    for (const quote of customerQuotes) {
      timeline.push({
        date: isoDate(quote.createdAt) ?? period.periodStart,
        kind: 'quote',
        publicReference: quotePublicNumber(quote),
        title: quote.title ?? 'Quote',
        status: quote.status,
        amountCents: quote.totalCents ?? null,
        propertyName: quote.propertyId ? propertyMap.get(quote.propertyId) ?? null : null,
      });
    }

    for (const inv of customerInvoices) {
      timeline.push({
        date: isoDate(inv.issuedAt ?? inv.createdAt) ?? period.periodStart,
        kind: 'invoice',
        publicReference: invoicePublicNumber(inv),
        title: 'Invoice',
        status: inv.status,
        amountCents: Math.max(0, inv.totalCents || inv.amountCents),
        propertyName: inv.propertyId ? propertyMap.get(inv.propertyId) ?? null : null,
      });
    }

    for (const payment of customerPayments) {
      const inv = customerInvoices.find((i) => i.id === payment.invoiceId);
      timeline.push({
        date: isoDate(payment.paidAt) ?? period.periodStart,
        kind: 'payment',
        publicReference: inv ? invoicePublicNumber(inv) : 'Payment',
        title: `Payment (${payment.method})`,
        status: 'recorded',
        amountCents: payment.amountCents,
        propertyName: inv?.propertyId ? propertyMap.get(inv.propertyId) ?? null : null,
      });
    }

    for (const report of reports) {
      timeline.push({
        date: isoDate(report.generatedAt ?? report.createdAt) ?? period.periodStart,
        kind: 'completion',
        publicReference: report.reportNumber,
        title: 'Completion report',
        status: report.status,
        amountCents: null,
        propertyName: null,
      });
    }

    timeline.sort((a, b) => a.date.localeCompare(b.date));

    const allCustomerInvoices = await this.db.query.invoices.findMany({
      where: and(eq(invoices.companyId, companyId), eq(invoices.customerId, customerId)),
    });
    const outstandingBalanceCents = allCustomerInvoices.reduce(
      (s, inv) => s + invoiceBalanceDueCents(inv),
      0,
    );
    const amountPaidCents = customerPayments.reduce((s, p) => s + Math.max(0, p.amountCents), 0);

    const freshnessState = resolveFinanceFreshness(syncMeta.lastSuccessfulSyncAt);
    const provenance = this.buildProvenance({
      currency: locale.currency,
      invoices: allCustomerInvoices,
      lastSuccessfulSyncAt: syncMeta.lastSuccessfulSyncAt,
      coverageNote: 'Customer operational history',
    });

    return {
      reportReference: reportRef('FCH', customerId.slice(0, 8).toUpperCase()),
      reportKind: 'customer_property_history',
      companyName: company.name,
      currency: locale.currency,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      snapshotDate: null,
      timezone: period.timezone,
      generatedAt: new Date().toISOString(),
      provenance,
      freshnessState,
      dataSourceNote: audience === 'client'
        ? 'Client-safe customer history — public references and operational status only.'
        : 'Internal customer history from TITAN operational records.',
      dataQualityWarnings: timeline.length ? [] : ['No history records for this period.'],
      audience,
      customerName: customer.name,
      customerReference: resolveCustomerPublicReference({ customerNumber: null, name: customer.name }),
      contactEmail: customer.email,
      contactPhone: customer.phone,
      properties: properties.map((p) => ({
        name: p.propertyName,
        address: [p.addressLine1, p.city, p.postalCode].filter(Boolean).join(', ') || null,
      })),
      timeline,
      outstandingBalanceCents,
      amountPaidCents: customerPayments.length ? amountPaidCents : null,
      internalNotes: audience === 'internal' ? customer.notes : null,
    };
  }
}
