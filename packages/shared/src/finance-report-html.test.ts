import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertFinanceReportHtmlSafe,
  FINANCE_REPORT_SENSITIVE_PATTERNS,
} from './finance-report-access.js';
import {
  buildAccountsReceivableReportHtml,
  buildCustomerPropertyHistoryReportHtml,
  buildFinanceAggregateReportHtml,
} from './finance-report-html.js';
import { FINANCE_PROFIT_UNAVAILABLE_NOTE } from './finance-report-source-policy.js';
import { financeMetric } from './finance-report.js';

const baseHeader = {
  reportReference: 'FAS-TEST',
  companyName: 'Young Guns Plumbing',
  currency: 'ZAR',
  periodStart: '2026-08-01',
  periodEnd: '2026-08-07',
  snapshotDate: null as string | null,
  timezone: 'Africa/Johannesburg',
  generatedAt: '2026-08-05T12:00:00.000Z',
  freshnessState: 'current' as const,
  dataSourceNote: 'TITAN ledger test fixture',
  dataQualityWarnings: [] as string[],
  provenance: {
    sourceSystem: 'titan_local' as const,
    sourceRecordType: 'test',
    syncedAt: null,
    lastSuccessfulSyncAt: null,
    coverageStatus: 'test',
    completenessStatus: 'test',
    duplicatePreventionBasis: 'test fixture',
    reportingBasis: 'mixed' as const,
    currency: 'ZAR',
    vatBasis: 'stored fields',
  },
};

test('finance aggregate HTML includes profit unavailable note', () => {
  const html = buildFinanceAggregateReportHtml({
    ...baseHeader,
    reportKind: 'finance_aggregate',
    metrics: [
      financeMetric('Invoice count', { count: 2, state: 'recorded' }, (c) => `R${(c / 100).toFixed(2)}`),
    ],
    revenueByMonth: [],
    paymentsByMonth: [],
    agingSummary: [],
    statusBreakdown: [],
    topOutstandingCustomers: [],
    profitNote: FINANCE_PROFIT_UNAVAILABLE_NOTE,
    cashFlowNote: 'Cash movement is not profit.',
    vatNote: 'VAT from stored fields.',
  });
  assert.match(html, /Profit is not available/);
  assert.doesNotMatch(html, /access_token|xero tenant id/i);
});

test('client customer history HTML excludes internal notes section', () => {
  const html = buildCustomerPropertyHistoryReportHtml({
    ...baseHeader,
    reportKind: 'customer_property_history',
    audience: 'client',
    customerName: 'Test Customer',
    customerReference: 'CUST-1',
    contactEmail: 'client@example.com',
    contactPhone: null,
    properties: [{ name: 'Home', address: '1 Main Rd' }],
    timeline: [
      {
        date: '2026-08-01',
        kind: 'job',
        publicReference: 'YG-1001',
        title: 'Leak repair',
        status: 'completed',
        amountCents: null,
        propertyName: 'Home',
      },
    ],
    outstandingBalanceCents: 0,
    amountPaidCents: null,
    internalNotes: null,
  });
  assert.doesNotMatch(html, /Internal notes/);
  assertFinanceReportHtmlSafe(html, 'client');
});

test('internal AR HTML passes leak guard with fixture values', () => {
  const html = buildAccountsReceivableReportHtml({
    ...baseHeader,
    reportKind: 'accounts_receivable',
    snapshotDate: '2026-08-05',
    totalOutstandingCents: 150000,
    agingSummary: [
      {
        bucket: 'current',
        bucketLabel: 'Current / not yet due',
        invoiceCount: 1,
        balanceDueCents: 150000,
      },
    ],
    invoiceLines: [
      {
        publicNumber: 'INV-001',
        customerName: 'Test Customer',
        invoiceDate: '2026-08-01',
        dueDate: '2026-08-15',
        originalTotalCents: 150000,
        amountPaidCents: 0,
        balanceDueCents: 150000,
        status: 'sent',
        daysOverdue: 0,
        agingBucket: 'current',
        lastPaymentDate: null,
        flags: [],
      },
    ],
  });
  assertFinanceReportHtmlSafe(html, 'internal');
});

test('sensitive pattern list includes finance leak tokens', () => {
  assert.ok(FINANCE_REPORT_SENSITIVE_PATTERNS.length >= 8);
});
