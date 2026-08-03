import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ExecutiveXeroFinance } from '@titan/shared';

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

function buildEmptyDescription(xero: ExecutiveXeroFinance | null | undefined): string {
  if (!xero?.connected) {
    return 'Open balances appear from TITAN finance records. Connect Xero and sync, or create invoices in Finance.';
  }
  if (xero.importStatus === 'running' || xero.importStatus === 'queued' || xero.importStatus === 'pending') {
    return xero.importMessage ?? 'Xero import is in progress. Outstanding balances will appear when sync finishes.';
  }
  if (xero.lastError) {
    return `Xero sync needs attention: ${xero.lastError}`;
  }
  if (!xero.lastSyncAt && xero.syncedInvoiceCount === 0) {
    return 'Xero is connected, but no invoices have been imported yet. Run Sync now from Integrations → Xero.';
  }
  return 'Open balances will appear here when invoices are sent and unpaid.';
}

describe('outstanding invoices Xero honesty', () => {
  it('prompts connect/sync when Xero is disconnected', () => {
    assert.match(buildEmptyDescription(emptyFinance({ connected: false })), /Connect Xero/);
  });

  it('prompts Sync now when connected but never imported', () => {
    assert.match(
      buildEmptyDescription(emptyFinance({ connected: true, organisationName: 'Acme' })),
      /no invoices have been imported/,
    );
  });

  it('surfaces import-in-progress messaging', () => {
    assert.match(
      buildEmptyDescription(
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
