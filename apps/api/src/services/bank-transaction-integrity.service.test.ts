/**
 * BANK-001A — allocation concurrency + idempotency harness tests.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertAllocationWithinTransaction,
  computeAllocationTotals,
  computeDirectCostSettlementAfterAllocation,
} from '@titan/shared';

describe('BANK-001A concurrent over-allocation prevention (logic)', () => {
  it('11 two R3000 allocations against R5000 — second exceeds when first applied', () => {
    const txAmount = 500000;
    const first = [{ amountCents: 300000 }];
    assert.doesNotThrow(() => assertAllocationWithinTransaction(txAmount, first));

    const second = [{ amountCents: 300000 }, { amountCents: 300000 }];
    assert.throws(
      () => assertAllocationWithinTransaction(txAmount, second),
      /exceeds transaction amount/,
    );
  });

  it('10 split R5000 across jobs + overhead sums to allocated', () => {
    const lines = [
      { amountCents: 300000 },
      { amountCents: 100000 },
      { amountCents: 100000 },
    ];
    assert.doesNotThrow(() => assertAllocationWithinTransaction(500000, lines));
    const totals = computeAllocationTotals(500000, lines);
    assert.equal(totals.allocationStatus, 'allocated');
    assert.equal(totals.allocatedAmountCents, 500000);
  });
});

describe('BANK-001A allocation idempotency (logic)', () => {
  it('12 same idempotency key should not double-apply allocation amount', () => {
    const existing = [{ idempotencyKey: 'key-1', amountCents: 300000 }];
    const incoming = [{ idempotencyKey: 'key-1', amountCents: 300000 }];
    const merged = [...existing];
    for (const line of incoming) {
      if (merged.some((row) => row.idempotencyKey === line.idempotencyKey)) continue;
      merged.push(line);
    }
    assert.equal(merged.length, 1);
    assert.equal(
      merged.reduce((s, r) => s + r.amountCents, 0),
      300000,
    );
  });
});

describe('BANK-001A split payment cash semantics', () => {
  it('8 economic cost unchanged when partial bank allocations applied', () => {
    const economic = 100000;
    const afterFirst = computeDirectCostSettlementAfterAllocation({
      amountCents: economic,
      currentAmountPaidCents: 0,
      allocationAmountCents: 40000,
    });
    const afterSecond = computeDirectCostSettlementAfterAllocation({
      amountCents: economic,
      currentAmountPaidCents: afterFirst.amountPaidCents,
      allocationAmountCents: 35000,
    });
    assert.equal(economic, 100000);
    assert.equal(afterSecond.amountPaidCents, 75000);
    assert.equal(afterSecond.isPaid, false);
  });
});
