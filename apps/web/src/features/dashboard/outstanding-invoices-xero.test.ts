import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ExecutiveXeroFinance } from '@titan/shared';
import {
  OPEN_AR_COVERAGE_CAPTIONS,
  buildOpenArEmptyDescription,
  resolveOpenArHistoryCoverage,
} from './dashboard-honesty';

function emptyFinance(overrides: Partial<ExecutiveXeroFinance> = {}): ExecutiveXeroFinance {
  return {
    connected: false,
    organisationName: null,
    lastSyncAt: null,
    lastError: null,
    importStatus: null,
    importMessage: null,
    syncedCustomerCount: 0,
    syncedInvoiceCount: 0,
    syncedPaymentCount: 0,
    syncedQuoteCount: 0,
    syncedBankTransactionCount: 0,
    failedRecordCount: 0,
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
    ...overrides,
  };
}

describe('outstanding invoices Xero honesty', () => {
  it('prompts connect/sync when Xero is disconnected', () => {
    assert.match(buildOpenArEmptyDescription(emptyFinance({ connected: false })), /Connect Xero/);
  });

  it('prompts Sync now when connected but never imported', () => {
    assert.match(
      buildOpenArEmptyDescription(emptyFinance({ connected: true, organisationName: 'Acme' })),
      /no invoices have been imported/,
    );
  });

  it('surfaces import-in-progress messaging', () => {
    assert.match(
      buildOpenArEmptyDescription(
        emptyFinance({
          connected: true,
          organisationName: 'Acme',
          importStatus: 'running',
          importMessage: 'Importing invoices…',
          syncedCustomerCount: 3,
        }),
      ),
      /Importing invoices/,
    );
  });
});

describe('open AR headline caption', () => {
  it('never presents a still-importing figure as the full historical position', () => {
    // The headline number is the card's loudest element, so its caption is the one place
    // an incomplete Xero import must be admitted.
    assert.equal(OPEN_AR_COVERAGE_CAPTIONS.syncing, 'Xero import still running');
    assert.equal(OPEN_AR_COVERAGE_CAPTIONS.partial, 'Partial financial history');
    assert.equal(OPEN_AR_COVERAGE_CAPTIONS.unavailable, 'Financial history unavailable');
    for (const coverage of ['syncing', 'partial', 'unavailable'] as const) {
      assert.doesNotMatch(OPEN_AR_COVERAGE_CAPTIONS[coverage], /complete/i);
    }
    assert.match(OPEN_AR_COVERAGE_CAPTIONS.complete, /complete/i);
  });
});

describe('open AR financial-history coverage', () => {
  it('reports syncing, not complete, while the Xero import is still running', () => {
    const result = resolveOpenArHistoryCoverage(
      emptyFinance({ connected: true, importStatus: 'running', lastSyncAt: null }),
    );
    assert.equal(result.coverage, 'syncing');
    assert.match(result.note, /Partial financial history — Xero import still running/);
  });

  it('separates complete current balances from incomplete history', () => {
    const result = resolveOpenArHistoryCoverage(
      emptyFinance({ connected: true, importStatus: 'queued' }),
    );
    assert.match(result.note, /complete for the invoices already imported/);
    assert.match(result.note, /earlier history is still arriving/);
  });

  it('never claims complete history when Xero is not connected', () => {
    assert.equal(resolveOpenArHistoryCoverage(emptyFinance({ connected: false })).coverage, 'partial');
  });

  it('never claims complete history when records failed to import', () => {
    const result = resolveOpenArHistoryCoverage(
      emptyFinance({
        connected: true,
        lastSyncAt: '2026-08-04T06:00:00.000Z',
        failedRecordCount: 12,
      }),
    );
    assert.equal(result.coverage, 'partial');
    assert.match(result.note, /12 Xero record\(s\) failed/);
  });

  it('reports unavailable rather than a zero balance when the read failed', () => {
    const result = resolveOpenArHistoryCoverage(emptyFinance({ connected: true }), 'unavailable');
    assert.equal(result.coverage, 'unavailable');
    assert.match(result.note, /not a zero balance/);
  });

  it('claims complete only after a clean successful sync', () => {
    const result = resolveOpenArHistoryCoverage(
      emptyFinance({
        connected: true,
        lastSyncAt: '2026-08-04T06:00:00.000Z',
        importStatus: 'completed',
      }),
    );
    assert.equal(result.coverage, 'complete');
  });
});
