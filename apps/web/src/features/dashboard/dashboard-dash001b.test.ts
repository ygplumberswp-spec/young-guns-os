import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  OPEN_AR_IMPORT_PENDING_NOTE,
  openArOwnerCaption,
  resolveOpenArHistoryCoverage,
} from './dashboard-honesty';

function readPanel(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8');
}

const PANELS_WITH_DISCLOSURE = [
  'TodayAtAGlancePanel.tsx',
  'ActiveJobsPanel.tsx',
  'CompletedTodayPanel.tsx',
  'TeamPerformancePanel.tsx',
  'FleetOverviewPanel.tsx',
  'LiveOperationsPanel.tsx',
  'OutstandingInvoicesPanel.tsx',
  'SalesOpportunitiesPanel.tsx',
  'AuraExecutiveRecommendationsPanel.tsx',
  'ConnectionsPanel.tsx',
] as const;

const OUTSTANDING_SOURCE = readPanel('OutstandingInvoicesPanel.tsx');

describe('DASH-001B owner dashboard final cleanup', () => {
  it('hides default-visible Source metadata behind View source on listed panels', () => {
    for (const panel of PANELS_WITH_DISCLOSURE) {
      const source = readPanel(panel);
      assert.match(source, /DashboardDetailsDisclosure/, `${panel} must use disclosure`);
      assert.match(source, /DashboardFreshnessFooter|exec-aura-recommendations__freshness/, `${panel} must show freshness`);
    }
  });

  it('does not expose failed-to-import or PARTIAL wording on the default Outstanding Invoices surface', () => {
    assert.doesNotMatch(OUTSTANDING_SOURCE, /failed to import/i);
    assert.doesNotMatch(OUTSTANDING_SOURCE, />\s*PARTIAL\s*</i);
    assert.doesNotMatch(OUTSTANDING_SOURCE, /Partial financial history/);
    assert.doesNotMatch(OUTSTANDING_SOURCE, /exec-outstanding__xero-meta/);
    assert.match(OUTSTANDING_SOURCE, /OPEN_AR_IMPORT_PENDING_NOTE|Some earlier financial records are still being imported/);
    assert.match(OUTSTANDING_SOURCE, /data-testid="xero-finance-meta"/);
    assert.match(OUTSTANDING_SOURCE, /DashboardDetailsDisclosure/);
  });

  it('uses calm owner captions instead of technical partial history labels', () => {
    assert.equal(openArOwnerCaption('partial'), OPEN_AR_IMPORT_PENDING_NOTE);
    assert.equal(openArOwnerCaption('syncing'), OPEN_AR_IMPORT_PENDING_NOTE);
    assert.equal(openArOwnerCaption('complete'), null);

    const technical = resolveOpenArHistoryCoverage(
      {
        connected: true,
        lastSyncAt: '2026-08-04T06:00:00.000Z',
        failedRecordCount: 12,
        importStatus: null,
        importMessage: null,
        organisationName: null,
        lastError: null,
        syncedCustomerCount: 0,
        syncedInvoiceCount: 0,
        syncedPaymentCount: 0,
        syncedQuoteCount: 0,
        syncedBankTransactionCount: 0,
        revenueCents: 0,
        outstandingCents: 0,
        paidCents: 0,
        overdueCents: 0,
        unpaidInvoiceCount: 0,
        paidInvoiceCount: 0,
        overdueInvoiceCount: 0,
        quotePipelineCents: 0,
        quotePipelineCount: 0,
        monthlyTurnover: [],
        paymentTrends: [],
        currency: 'ZAR',
      },
      null,
    );
    assert.match(technical.note, /failed to import/i);
    assert.equal(openArOwnerCaption(technical.coverage), OPEN_AR_IMPORT_PENDING_NOTE);
  });

  it('preserves independent quote metric module untouched', () => {
    const quoteMetricsSource = readFileSync(
      fileURLToPath(
        new URL('../../../../../packages/shared/src/dashboard-quote-metrics.ts', import.meta.url),
      ),
      'utf8',
    );
    assert.match(quoteMetricsSource, /countQuotesAwaitingCustomerApproval/);
    assert.match(quoteMetricsSource, /countQuotesFollowUpDue/);
    assert.doesNotMatch(readPanel('OutstandingInvoicesPanel.tsx'), /dashboard-quote-metrics/);
  });
});
