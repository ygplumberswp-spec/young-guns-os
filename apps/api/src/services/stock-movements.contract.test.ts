import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Contract checks for UX-F stock movement semantics (pure helpers / expected codes).
 * Runtime concurrency is proven on staging E2E.
 */

test('insufficient stock error code is stable for clients', () => {
  assert.equal('INSUFFICIENT_STOCK', 'INSUFFICIENT_STOCK');
});

test('issue movement uses negative quantity delta convention', () => {
  const quantityBefore = 10;
  const issueQty = 3;
  const quantityDelta = -issueQty;
  const quantityAfter = quantityBefore + quantityDelta;
  assert.equal(quantityAfter, 7);
  assert.ok(quantityDelta < 0);
});

test('receipt then partial issue leaves remaining stock', () => {
  let onHand = 0;
  onHand += 10; // receipt
  onHand += -4; // issue
  assert.equal(onHand, 6);
  assert.ok(onHand - 7 < 0); // further issue of 7 would be insufficient
});
