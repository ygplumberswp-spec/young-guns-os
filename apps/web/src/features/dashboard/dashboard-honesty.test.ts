import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ExecutiveXeroFinance } from '@titan/shared';
import {
  formatUpdatedLabel,
  resolveFinanceCardHonesty,
  resolveFleetCardHonesty,
} from './dashboard-honesty';

function finance(overrides: Partial<ExecutiveXeroFinance> = {}): ExecutiveXeroFinance {
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

describe('finance card honesty', () => {
  it('never claims live while Xero is disconnected', () => {
    const result = resolveFinanceCardHonesty(finance({ connected: false }));
    assert.equal(result.state, 'disconnected');
    assert.match(result.note ?? '', /not a complete financial position/);
  });

  it('reports needs setup when connected but never synced', () => {
    const result = resolveFinanceCardHonesty(finance({ connected: true }));
    assert.equal(result.state, 'needs_setup');
  });

  it('reports partial while the Xero import is still running', () => {
    const result = resolveFinanceCardHonesty(
      finance({ connected: true, lastSyncAt: '2026-08-01T00:00:00.000Z', importStatus: 'running' }),
    );
    assert.equal(result.state, 'partial');
    assert.match(result.note ?? '', /incomplete/);
  });

  it('reports partial when Xero records failed to import', () => {
    const result = resolveFinanceCardHonesty(
      finance({
        connected: true,
        lastSyncAt: '2026-08-01T00:00:00.000Z',
        failedRecordCount: 4,
      }),
    );
    assert.equal(result.state, 'partial');
    assert.match(result.note ?? '', /4 Xero record/);
  });

  it('reports unavailable when the summary request failed', () => {
    const result = resolveFinanceCardHonesty(finance({ connected: true }), 'Network error');
    assert.equal(result.state, 'unavailable');
  });

  it('only reports live once a completed sync exists', () => {
    const result = resolveFinanceCardHonesty(
      finance({ connected: true, lastSyncAt: '2026-08-01T00:00:00.000Z' }),
    );
    assert.equal(result.state, 'live');
  });
});

describe('fleet card honesty', () => {
  const base = {
    hasTracking: true,
    cartrackConnected: true,
    connectionDisplayState: 'connected',
    hasStoredPositions: true,
    error: null as string | null,
  };

  it('reports disconnected when Cartrack is not connected', () => {
    const result = resolveFleetCardHonesty({ ...base, cartrackConnected: false });
    assert.equal(result.state, 'disconnected');
    assert.match(result.note ?? '', /will not invent vehicle positions/);
  });

  it('reports partial on a stale feed', () => {
    assert.equal(
      resolveFleetCardHonesty({ ...base, connectionDisplayState: 'stale' }).state,
      'partial',
    );
  });

  it('reports needs setup when connected without stored positions', () => {
    assert.equal(
      resolveFleetCardHonesty({ ...base, hasStoredPositions: false }).state,
      'needs_setup',
    );
  });

  it('reports live for a healthy connected feed', () => {
    assert.equal(resolveFleetCardHonesty(base).state, 'live');
  });
});

describe('last-updated labelling', () => {
  it('says Never rather than rendering a blank timestamp', () => {
    assert.equal(formatUpdatedLabel(null), 'Never');
  });

  it('formats recent timestamps as relative ages', () => {
    assert.equal(formatUpdatedLabel(new Date(Date.now() - 5 * 60_000).toISOString()), '5 minutes ago');
    assert.equal(formatUpdatedLabel(new Date(Date.now() - 3 * 3_600_000).toISOString()), '3 hours ago');
  });
});
