import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertRow127AcceptanceGate,
  assertRow127SafetyGates,
  PROCURE_TO_PAY_STEPS,
  proveProcureToPayCoverage,
  procureToPaySupportedCount,
} from './procure-to-pay-row127.js';

describe('Row 127 procure-to-pay', () => {
  it('covers full step list; mid-chain supported; gaps explicit; no fabrication', () => {
    const cells = proveProcureToPayCoverage();
    assert.deepEqual(
      cells.map((c) => c.step),
      [...PROCURE_TO_PAY_STEPS],
    );
    assert.ok(cells.every((c) => c.fabricatesLiveYg === false));
    const need = cells.find((c) => c.step === 'need');
    assert.equal(need?.status, 'NOT_AVAILABLE');
    const po = cells.find((c) => c.step === 'po');
    assert.equal(po?.status, 'SUPPORTED');
    const pay = cells.find((c) => c.step === 'payment_approval');
    assert.equal(pay?.status, 'NOT_AVAILABLE');
    assertRow127AcceptanceGate(cells);
    const counts = procureToPaySupportedCount(cells);
    assert.ok(counts.supported >= 6);
    assert.ok(counts.missing >= 1);
    assert.equal(assertRow127SafetyGates({ row92AutomationEnabled: false }).xeroWrites, 0);
  });
});
