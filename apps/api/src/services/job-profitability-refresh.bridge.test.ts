import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JobProfitabilityRefreshBridge } from '../services/job-profitability-refresh.bridge.js';
import type { JobProfitabilityService } from '../services/job-profitability.service.js';

describe('JobProfitabilityRefreshBridge', () => {
  it('refreshes snapshot for payment.received with invoice job lookup', async () => {
    const calls: Array<{ companyId: string; jobId: string }> = [];
    const bridge = new JobProfitabilityRefreshBridge(
      {
        query: {
          invoices: {
            findFirst: async () => ({ jobId: 'job-abc' }),
          },
        },
      } as never,
      {
        recalculateJobProfitability: async (companyId: string, jobId: string) => {
          calls.push({ companyId, jobId });
          return {} as never;
        },
      } as unknown as JobProfitabilityService,
    );

    await bridge.handleBusinessEvent({
      companyId: 'company-1',
      eventType: 'payment.received',
      entityType: 'payment',
      entityId: 'pay-1',
      payload: {
        payment: { id: 'pay-1', invoiceId: 'inv-1', amountCents: 5000 },
        invoice: { id: 'inv-1' },
      },
    });

    assert.deepEqual(calls, [{ companyId: 'company-1', jobId: 'job-abc' }]);
  });

  it('ignores unrelated business events', async () => {
    let called = false;
    const bridge = new JobProfitabilityRefreshBridge(
      { query: {} } as never,
      {
        recalculateJobProfitability: async () => {
          called = true;
          return {} as never;
        },
      } as unknown as JobProfitabilityService,
    );

    await bridge.handleBusinessEvent({
      companyId: 'company-1',
      eventType: 'customer.created',
      entityType: 'customer',
      entityId: 'cust-1',
      payload: {},
    });

    assert.equal(called, false);
  });
});
