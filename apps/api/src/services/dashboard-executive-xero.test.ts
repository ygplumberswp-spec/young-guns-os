import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ExecutiveXeroFinance, XeroSyncStatusResponse } from '@titan/shared';

/** Mirrors DashboardExecutiveService.loadXeroFinance mapping for unit coverage. */
function mapXeroStatusToExecutiveFinance(status: XeroSyncStatusResponse): ExecutiveXeroFinance {
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
    assert.equal(mapped.currency, 'ZAR');
  });

  it('exposes connection lastSync and synced entity counts when connected', () => {
    const mapped = mapXeroStatusToExecutiveFinance({
      connected: true,
      organisationName: 'Acme Plumbing',
      baseCurrency: 'ZAR',
      lastSyncAt: '2026-08-03T08:00:00.000Z',
      lastError: null,
      customers: { ...emptyEntityStats(), syncedCount: 12 },
      quotes: emptyEntityStats(),
      invoices: { ...emptyEntityStats(), syncedCount: 4 },
      payments: { ...emptyEntityStats(), syncedCount: 2 },
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
        completedStages: ['contacts', 'invoices', 'payments', 'bank_transactions'],
        checkpoint: {
          stage: 'bank_transactions',
          contactsPage: 1,
          invoicesPage: 1,
          paymentsPage: 1,
          bankTransactionsPage: 1,
        },
        contacts: {
          createdCount: 12,
          updatedCount: 0,
          pulledCount: 12,
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
          createdCount: 0,
          updatedCount: 0,
          pulledCount: 0,
          failedCount: 0,
          skippedCount: 0,
        },
        failedStage: null,
        message: 'Import complete',
        syncedAt: '2026-08-03T08:00:00.000Z',
        heartbeatAt: null,
        nextRetryAt: null,
        activity: null,
        processedCount: 18,
      },
    });

    assert.equal(mapped.connected, true);
    assert.equal(mapped.organisationName, 'Acme Plumbing');
    assert.equal(mapped.lastSyncAt, '2026-08-03T08:00:00.000Z');
    assert.equal(mapped.importStatus, 'completed');
    assert.equal(mapped.importMessage, 'Import complete');
    assert.equal(mapped.syncedCustomerCount, 12);
    assert.equal(mapped.syncedInvoiceCount, 4);
    assert.equal(mapped.syncedPaymentCount, 2);
  });
});
