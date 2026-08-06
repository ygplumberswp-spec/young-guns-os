import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAccountsReceivableReportHtml,
  buildCashflowCollectionsReportHtml,
  buildCustomerPropertyHistoryReportHtml,
  buildFinanceAggregateReportHtml,
  countPdfPages,
  financeMetric,
  isValidPdfBuffer,
  FINANCE_PROFIT_UNAVAILABLE_NOTE,
} from '@titan/shared';
import { probeChromiumPdfAvailability, renderHtmlToPdf } from './chromium-pdf.service.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const artifactDir = join(repoRoot, 'test-results', 'j67d');

const provenance = {
  sourceSystem: 'mixed' as const,
  sourceRecordType: 'test_fixture',
  syncedAt: '2026-08-01T10:00:00.000Z',
  lastSuccessfulSyncAt: '2026-08-01T10:00:00.000Z',
  coverageStatus: 'fixture',
  completenessStatus: 'partial',
  duplicatePreventionBasis: 'Payments only for cash totals',
  reportingBasis: 'mixed' as const,
  currency: 'ZAR',
  vatBasis: 'Stored fields only',
};

function aggregateCtx(long = false) {
  const invoiceLines = long
    ? Array.from({ length: 100 }, (_, i) =>
        financeMetric(`Invoice ${i}`, { amountCents: 10000 + i, state: 'recorded' }, (c) =>
          `R${(c / 100).toFixed(2)}`,
        ),
      )
    : [financeMetric('Invoice count', { count: 3, state: 'recorded' }, (c) => String(c))];

  return {
    reportReference: long ? 'FAS-LONG' : 'FAS-MIN',
    reportKind: 'finance_aggregate' as const,
    companyName: 'Young Guns Plumbing',
    currency: 'ZAR',
    periodStart: '2025-08-01',
    periodEnd: '2026-08-05',
    snapshotDate: null,
    timezone: 'Africa/Johannesburg',
    generatedAt: '2026-08-05T12:00:00.000Z',
    provenance,
    freshnessState: 'stale' as const,
    dataSourceNote: 'Fixture — stale sync warning test',
    dataQualityWarnings: long ? ['Extended fixture for pagination.'] : ['Stale sync test warning.'],
    metrics: invoiceLines,
    revenueByMonth: Array.from({ length: long ? 12 : 3 }, (_, i) => ({
      month: `2026-${String(i + 1).padStart(2, '0')}`,
      amountCents: 500000 + i * 1000,
    })),
    paymentsByMonth: Array.from({ length: long ? 12 : 3 }, (_, i) => ({
      month: `2026-${String(i + 1).padStart(2, '0')}`,
      amountCents: 400000 + i * 1000,
    })),
    agingSummary: [
      { bucket: 'current' as const, bucketLabel: 'Current', invoiceCount: 2, balanceDueCents: 50000 },
      { bucket: 'days_1_30' as const, bucketLabel: '1–30', invoiceCount: 1, balanceDueCents: 25000 },
    ],
    statusBreakdown: [{ status: 'sent', count: 3, totalCents: 75000 }],
    topOutstandingCustomers: [{ customerName: 'Fixture Customer', balanceDueCents: 75000 }],
    profitNote: FINANCE_PROFIT_UNAVAILABLE_NOTE,
    cashFlowNote: 'Cash movement is not profit.',
    vatNote: 'VAT from stored invoice fields.',
  };
}

test('genuine Puppeteer PDF renders multi-page finance reports when Chromium is available', async (t) => {
  const probe = await probeChromiumPdfAvailability();
  if (!probe.available) {
    t.skip(`Chromium unavailable (${probe.source})`);
    return;
  }

  mkdirSync(artifactDir, { recursive: true });

  const arLines = Array.from({ length: 100 }, (_, i) => ({
    publicNumber: `INV-${1000 + i}`,
    customerName: `Customer ${i}`,
    invoiceDate: '2026-01-15',
    dueDate: '2026-02-15',
    originalTotalCents: 100000,
    amountPaidCents: 0,
    balanceDueCents: 100000,
    status: 'overdue',
    daysOverdue: 30 + (i % 60),
    agingBucket: (i % 3 === 0 ? 'days_31_60' : 'days_1_30') as 'days_1_30' | 'days_31_60',
    lastPaymentDate: null,
    flags: [] as string[],
  }));

  const timeline = Array.from({ length: 100 }, (_, i) => ({
    date: `2026-0${(i % 8) + 1}-${String((i % 28) + 1).padStart(2, '0')}`,
    kind: 'job' as const,
    publicReference: `YG-${2000 + i}`,
    title: `Service visit ${i}`,
    status: 'completed',
    amountCents: null,
    propertyName: i % 2 === 0 ? 'Main House' : 'Granny Flat',
  }));

  const scenarios = [
    {
      name: 'finance-aggregate-minimal',
      html: buildFinanceAggregateReportHtml(aggregateCtx(false)),
      minPages: 1,
    },
    {
      name: 'finance-aggregate-12-months',
      html: buildFinanceAggregateReportHtml(aggregateCtx(true)),
      minPages: 2,
    },
    {
      name: 'cashflow-long-bank-feed',
      html: buildCashflowCollectionsReportHtml({
        reportReference: 'FCF-LONG',
        reportKind: 'cashflow_collections',
        companyName: 'Young Guns Plumbing',
        currency: 'ZAR',
        periodStart: '2026-01-01',
        periodEnd: '2026-08-05',
        snapshotDate: null,
        timezone: 'Africa/Johannesburg',
        generatedAt: '2026-08-05T12:00:00.000Z',
        provenance,
        freshnessState: 'current',
        dataSourceNote: 'Payments only for inflows',
        dataQualityWarnings: [],
        cashInflowsCents: 5000000,
        cashOutflowsCents: null,
        netCashMovementCents: 5000000,
        customerPaymentsCents: 5000000,
        refundsCents: null,
        supplierPaymentsCents: null,
        monthlyMovement: Array.from({ length: 8 }, (_, i) => ({
          month: `2026-0${i + 1}`,
          inflowCents: 600000,
          outflowCents: 0,
          netCents: 600000,
        })),
        collectionsByCustomer: Array.from({ length: 40 }, (_, i) => ({
          customerName: `Customer ${i}`,
          amountCents: 50000,
        })),
        bankFeedLines: Array.from({ length: 80 }, (_, i) => ({
          transactionDate: `2026-0${(i % 8) + 1}-15`,
          amountCents: 10000 + i,
          currency: 'ZAR',
          description: `Bank line ${i}`,
          category: i % 5 === 0 ? 'Transfer' : 'Unclassified',
          type: i % 5 === 0 ? 'TRANSFER' : 'RECEIVE',
          excludedFromCashTotals: true,
          exclusionReason: 'Informational only',
        })),
        unallocatedPaymentsNote: null,
        metrics: [
          financeMetric('Cash inflows', { amountCents: 5000000, state: 'recorded' }, (c) =>
            `R${(c / 100).toFixed(2)}`,
          ),
        ],
      }),
      minPages: 2,
    },
    {
      name: 'receivables-minimal',
      html: buildAccountsReceivableReportHtml({
        reportReference: 'FAR-MIN',
        reportKind: 'accounts_receivable',
        companyName: 'Young Guns Plumbing',
        currency: 'ZAR',
        periodStart: null,
        periodEnd: null,
        snapshotDate: '2026-08-05',
        timezone: 'Africa/Johannesburg',
        generatedAt: '2026-08-05T12:00:00.000Z',
        provenance,
        freshnessState: 'current',
        dataSourceNote: 'AR snapshot fixture',
        dataQualityWarnings: [],
        totalOutstandingCents: 100000,
        agingSummary: [
          { bucket: 'current', bucketLabel: 'Current', invoiceCount: 1, balanceDueCents: 100000 },
        ],
        invoiceLines: arLines.slice(0, 3),
      }),
      minPages: 1,
    },
    {
      name: 'receivables-100-invoices',
      html: buildAccountsReceivableReportHtml({
        reportReference: 'FAR-100',
        reportKind: 'accounts_receivable',
        companyName: 'Young Guns Plumbing',
        currency: 'ZAR',
        periodStart: null,
        periodEnd: null,
        snapshotDate: '2026-08-05',
        timezone: 'Africa/Johannesburg',
        generatedAt: '2026-08-05T12:00:00.000Z',
        provenance,
        freshnessState: 'current',
        dataSourceNote: 'AR snapshot fixture',
        dataQualityWarnings: [],
        totalOutstandingCents: arLines.reduce((s, l) => s + l.balanceDueCents, 0),
        agingSummary: [
          { bucket: 'days_1_30', bucketLabel: '1–30', invoiceCount: 50, balanceDueCents: 5000000 },
          { bucket: 'days_31_60', bucketLabel: '31–60', invoiceCount: 50, balanceDueCents: 5000000 },
        ],
        invoiceLines: arLines,
      }),
      minPages: 3,
    },
    {
      name: 'customer-history-one-property',
      html: buildCustomerPropertyHistoryReportHtml({
        reportReference: 'FCH-ONE',
        reportKind: 'customer_property_history',
        companyName: 'Young Guns Plumbing',
        currency: 'ZAR',
        periodStart: '2026-01-01',
        periodEnd: '2026-08-05',
        snapshotDate: null,
        timezone: 'Africa/Johannesburg',
        generatedAt: '2026-08-05T12:00:00.000Z',
        provenance,
        freshnessState: 'current',
        dataSourceNote: 'Internal history',
        dataQualityWarnings: [],
        audience: 'internal',
        customerName: 'Fixture Customer',
        customerReference: 'CUST-42',
        contactEmail: 'client@example.com',
        contactPhone: '0110000000',
        properties: [{ name: 'Main House', address: '1 Test Street' }],
        timeline: timeline.slice(0, 10),
        outstandingBalanceCents: 50000,
        amountPaidCents: 150000,
        internalNotes: 'Office note — internal only',
      }),
      minPages: 1,
    },
    {
      name: 'customer-history-multi-property-100-items',
      html: buildCustomerPropertyHistoryReportHtml({
        reportReference: 'FCH-MULTI',
        reportKind: 'customer_property_history',
        companyName: 'Young Guns Plumbing',
        currency: 'ZAR',
        periodStart: '2024-01-01',
        periodEnd: '2026-08-05',
        snapshotDate: null,
        timezone: 'Africa/Johannesburg',
        generatedAt: '2026-08-05T12:00:00.000Z',
        provenance,
        freshnessState: 'current',
        dataSourceNote: 'Internal history',
        dataQualityWarnings: [],
        audience: 'internal',
        customerName: 'Fixture Customer',
        customerReference: 'CUST-42',
        contactEmail: 'client@example.com',
        contactPhone: null,
        properties: [
          { name: 'Main House', address: '1 Test Street' },
          { name: 'Granny Flat', address: '1 Test Street rear' },
        ],
        timeline,
        outstandingBalanceCents: 250000,
        amountPaidCents: 900000,
        internalNotes: 'Long internal note for pagination test.',
      }),
      minPages: 2,
    },
    {
      name: 'customer-history-client-safe',
      html: buildCustomerPropertyHistoryReportHtml({
        reportReference: 'FCH-CLIENT',
        reportKind: 'customer_property_history',
        companyName: 'Young Guns Plumbing',
        currency: 'ZAR',
        periodStart: '2026-01-01',
        periodEnd: '2026-08-05',
        snapshotDate: null,
        timezone: 'Africa/Johannesburg',
        generatedAt: '2026-08-05T12:00:00.000Z',
        provenance,
        freshnessState: 'current',
        dataSourceNote: 'Client-safe history',
        dataQualityWarnings: [],
        audience: 'client',
        customerName: 'Fixture Customer',
        customerReference: 'CUST-42',
        contactEmail: 'client@example.com',
        contactPhone: null,
        properties: [{ name: 'Main House', address: '1 Test Street' }],
        timeline: timeline.slice(0, 15),
        outstandingBalanceCents: 50000,
        amountPaidCents: 150000,
        internalNotes: null,
      }),
      minPages: 1,
    },
    {
      name: 'finance-stale-profit-unavailable',
      html: buildFinanceAggregateReportHtml(aggregateCtx(false)),
      minPages: 1,
    },
  ];

  for (const scenario of scenarios) {
    const pdf = await renderHtmlToPdf(scenario.html);
    writeFileSync(join(artifactDir, `${scenario.name}.pdf`), pdf);
    assert.ok(isValidPdfBuffer(pdf), `${scenario.name}: valid %PDF signature`);
    const pages = countPdfPages(pdf);
    assert.ok(
      pages >= scenario.minPages,
      `${scenario.name}: expected >= ${scenario.minPages} pages, got ${pages}`,
    );
    assert.doesNotMatch(scenario.html, /access_token|refresh_token|xero tenant id/i);
  }
});
