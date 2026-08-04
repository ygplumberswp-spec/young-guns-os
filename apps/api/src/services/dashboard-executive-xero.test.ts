import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ExecutiveXeroFinance, XeroSyncStatusResponse } from '@titan/shared';
import { buildFinanceDashboardSnapshot } from '@titan/shared';
import { emptyImportCounts } from './xero-import-job.shared.js';

/** Mirrors DashboardExecutiveService.loadXeroFinance mapping for unit coverage. */
function mapXeroStatusToExecutiveFinance(
  status: XeroSyncStatusResponse,
  snapshot = buildFinanceDashboardSnapshot({ invoices: [], payments: [], quotes: [] }),
): ExecutiveXeroFinance {
  return {
    connected: status.connected,
    organisationName: status.organisationName,
    lastSyncAt: status.lastSyncAt,
    lastError: status.lastError,
    importStatus: status.importJob?.status ?? null,
    importMessage: status.importJob?.message ?? null,
    syncedCustomerCount: status.customers.syncedCount,
    syncedInvoiceCount: status.invoices.syncedCount,
    syncedPaymentCount: status.payments.syncedCount,
    syncedQuoteCount: status.quotes.syncedCount,
    syncedBankTransactionCount: status.bankTransactions?.syncedCount ?? 0,
    failedRecordCount:
      status.customers.failedCount +
      status.quotes.failedCount +
      status.invoices.failedCount +
      status.payments.failedCount +
      (status.bankTransactions?.failedCount ?? 0),
    revenueCents: snapshot.revenueCents,
    outstandingCents: snapshot.outstandingCents,
    paidCents: snapshot.paidCents,
    overdueCents: snapshot.overdueCents,
    unpaidInvoiceCount: snapshot.unpaidInvoiceCount,
    paidInvoiceCount: snapshot.paidInvoiceCount,
    overdueInvoiceCount: snapshot.overdueInvoiceCount,
    quotePipelineCents: snapshot.quotePipelineCents,
    quotePipelineCount: snapshot.quotePipelineCount,
    monthlyTurnover: snapshot.monthlyTurnover,
    paymentTrends: snapshot.paymentTrends,
    currency: status.currency,
  };
}

function emptyEntityStats() {
  return {
    syncedCount: 0,
    failedCount: 0,
    pendingCount: 0,
    outOfSyncCount: 0,
    lastSyncAt: null,
    lastSuccessfulSyncAt: null,
    lastError: null,
  };
}

describe('executive dashboard Xero finance mapping', () => {
  it('maps disconnected status to honest empty finance snapshot', () => {
    const mapped = mapXeroStatusToExecutiveFinance({
      connected: false,
      organisationName: null,
      baseCurrency: null,
      lastSyncAt: null,
      lastError: null,
      customers: emptyEntityStats(),
      quotes: emptyEntityStats(),
      invoices: emptyEntityStats(),
      payments: emptyEntityStats(),
      outstandingAmountCents: 0,
      unpaidInvoiceCount: 0,
      customersWithOutstandingCount: 0,
      currency: 'ZAR',
      importJob: null,
    });

    assert.equal(mapped.connected, false);
    assert.equal(mapped.lastSyncAt, null);
    assert.equal(mapped.syncedInvoiceCount, 0);
    assert.equal(mapped.revenueCents, 0);
    assert.equal(mapped.currency, 'ZAR');
  });

  it('exposes connection lastSync, synced counts, and real snapshot metrics', () => {
    const snapshot = buildFinanceDashboardSnapshot({
      now: new Date('2026-08-03T12:00:00.000Z'),
      invoices: [
        {
          status: 'paid',
          totalCents: 20_000,
          amountCents: 20_000,
          amountPaidCents: 20_000,
          issuedAt: '2026-07-01T00:00:00.000Z',
        },
        {
          status: 'sent',
          totalCents: 5_000,
          amountCents: 5_000,
          amountPaidCents: 0,
          dueDate: '2026-07-01T00:00:00.000Z',
        },
      ],
      payments: [{ amountCents: 20_000, paidAt: '2026-07-02T00:00:00.000Z' }],
      quotes: [{ status: 'sent', totalCents: 9_000, amountCents: 9_000 }],
    });

    const mapped = mapXeroStatusToExecutiveFinance(
      {
        connected: true,
        organisationName: 'Acme Plumbing',
        baseCurrency: 'ZAR',
        lastSyncAt: '2026-08-03T08:00:00.000Z',
        lastError: null,
        customers: { ...emptyEntityStats(), syncedCount: 12 },
        quotes: { ...emptyEntityStats(), syncedCount: 1 },
        invoices: { ...emptyEntityStats(), syncedCount: 4 },
        payments: { ...emptyEntityStats(), syncedCount: 2 },
        bankTransactions: { ...emptyEntityStats(), syncedCount: 3 },
        outstandingAmountCents: 150_000,
        unpaidInvoiceCount: 3,
        customersWithOutstandingCount: 2,
        currency: 'ZAR',
        importJob: {
          jobId: 'job-1',
          status: 'completed',
          uiStatus: 'completed',
          uiStatusLabel: 'Synced',
          currentStage: null,
          completedStages: ['contacts', 'quotes', 'invoices', 'payments', 'bank_transactions'],
          checkpoint: {
            stage: 'bank_transactions',
            contactsPage: 1,
            quotesPage: 1,
            invoicesPage: 1,
            billsPage: 1,
            creditNotesPage: 1,
            paymentsPage: 1,
            bankTransactionsPage: 1,
            attachmentsOffset: 0,
            modifiedSince: null,
          },
          accounts: emptyImportCounts(),
          trackingCategories: emptyImportCounts(),
          bills: emptyImportCounts(),
          creditNotes: emptyImportCounts(),
          attachments: emptyImportCounts(),
          contacts: {
            createdCount: 12,
            updatedCount: 0,
            pulledCount: 12,
            failedCount: 0,
            skippedCount: 0,
          },
          quotes: {
            createdCount: 1,
            updatedCount: 0,
            pulledCount: 1,
            failedCount: 0,
            skippedCount: 0,
          },
          invoices: {
            createdCount: 4,
            updatedCount: 0,
            pulledCount: 4,
            failedCount: 0,
            skippedCount: 0,
          },
          payments: {
            createdCount: 2,
            updatedCount: 0,
            pulledCount: 2,
            failedCount: 0,
            skippedCount: 0,
          },
          bankTransactions: {
            createdCount: 3,
            updatedCount: 0,
            pulledCount: 3,
            failedCount: 0,
            skippedCount: 0,
          },
          failedStage: null,
          message: 'Import complete',
          syncedAt: '2026-08-03T08:00:00.000Z',
          heartbeatAt: null,
          nextRetryAt: null,
          activity: null,
          processedCount: 22,
        },
      },
      snapshot,
    );

    assert.equal(mapped.connected, true);
    assert.equal(mapped.organisationName, 'Acme Plumbing');
    assert.equal(mapped.lastSyncAt, '2026-08-03T08:00:00.000Z');
    assert.equal(mapped.importStatus, 'completed');
    assert.equal(mapped.syncedCustomerCount, 12);
    assert.equal(mapped.syncedInvoiceCount, 4);
    assert.equal(mapped.syncedPaymentCount, 2);
    assert.equal(mapped.syncedQuoteCount, 1);
    assert.equal(mapped.syncedBankTransactionCount, 3);
    assert.equal(mapped.revenueCents, 20_000);
    assert.equal(mapped.outstandingCents, 5_000);
    assert.equal(mapped.quotePipelineCount, 1);
  });
});
