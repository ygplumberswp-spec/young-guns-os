import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertRow131SafetyGates,
  projectReceivablesAgeing,
  RECEIVABLES_AGEING_BUCKETS,
  resolveReceivablesAgeingBucket,
} from './receivables-ageing-row131.js';

describe('Row 131 receivables ageing', () => {
  it('buckets by due date + outstanding; preserves plan/promise/owner; no false R0', () => {
    assert.equal(resolveReceivablesAgeingBucket(0), 'Current');
    assert.equal(resolveReceivablesAgeingBucket(5), '1-7');
    assert.equal(resolveReceivablesAgeingBucket(20), '8-30');
    assert.equal(resolveReceivablesAgeingBucket(45), '31-60');
    assert.equal(resolveReceivablesAgeingBucket(75), '61-90');
    assert.equal(resolveReceivablesAgeingBucket(100), '90+');

    const disc = projectReceivablesAgeing({
      invoices: [],
      asOfDate: '2024-06-01',
      sourceAvailability: 'NOT_CONNECTED',
    });
    assert.equal(disc.availability, 'NOT_CONNECTED');
    assert.equal(disc.totalOutstandingCents, null);
    assert.equal(disc.displayTotal, 'NOT CONNECTED');

    const ageing = projectReceivablesAgeing({
      asOfDate: '2024-06-01',
      invoices: [
        {
          id: 'a',
          dueDate: '2024-06-10',
          outstandingCents: 1000,
          nextAction: 'Call',
          followUpOwnerName: 'Owner',
        },
        {
          id: 'b',
          dueDate: '2024-05-28',
          outstandingCents: 2000,
          hasPromiseToPay: true,
          unallocatedCents: 500,
        },
        {
          id: 'c',
          dueDate: '2024-04-01',
          outstandingCents: 3000,
          hasPaymentPlan: true,
          followUpOwnerUserId: 'u1',
        },
        {
          id: 'd',
          dueDate: '2024-01-01',
          outstandingCents: 4000,
        },
        {
          id: 'e',
          dueDate: '2024-05-01',
          outstandingCents: null,
        },
      ],
    });
    assert.deepEqual(
      ageing.buckets.map((b) => b.bucket),
      [...RECEIVABLES_AGEING_BUCKETS],
    );
    assert.equal(ageing.availability, 'INCOMPLETE');
    assert.equal(ageing.totalOutstandingCents, null);
    const b = ageing.rows.find((r) => r.invoiceId === 'b');
    assert.equal(b?.hasPromiseToPay, true);
    assert.equal(b?.unallocatedCents, 500);
    assert.equal(b?.partialPaymentPreserved, true);
    const c = ageing.rows.find((r) => r.invoiceId === 'c');
    assert.equal(c?.hasPaymentPlan, true);
    assert.equal(c?.followUpOwnerUserId, 'u1');
    assert.equal(assertRow131SafetyGates({ row92AutomationEnabled: false }).falseR0, false);
  });
});
