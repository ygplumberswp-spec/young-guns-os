import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertRow121CoverageComplete,
  assertRow121SafetyGates,
  proveBillingLifecycleCoverage,
  proveConsequentialTransitionCoverage,
  proveQuoteLifecycleCoverage,
} from './finance-lifecycle-coverage.js';
import type { QuoteLifecycleRecord } from './quote-lifecycle.js';

describe('Row 121 finance lifecycle coverage', () => {
  it('covers quote Draft/Sent/Accepted/Declined/Convert/Void-Archive', () => {
    const cells = proveQuoteLifecycleCoverage();
    assert.deepEqual(
      cells.map((c) => c.label),
      ['Draft', 'Sent', 'Accepted', 'Declined', 'Convert', 'Void/Archive'],
    );
    assert.ok(cells.every((c) => c.status === 'SUPPORTED'));
    assertRow121CoverageComplete(cells);
  });

  it('covers billing deposit/progress/final/credit', () => {
    const cells = proveBillingLifecycleCoverage();
    assert.ok(cells.every((c) => c.status === 'SUPPORTED'));
    assertRow121CoverageComplete(cells);
  });

  it('preserves Xero authority; does not fake provider state', () => {
    const quote = {
      id: 'q1',
      companyId: 'c1',
      status: 'accepted',
      isImmutable: true,
      issuedAt: '2024-01-01T00:00:00.000Z',
      xeroQuoteId: 'xero-1',
      numberAuthority: 'xero',
      quoteNumber: 'QU-1',
      officialQuoteNumber: 'QU-1',
      updatedAt: '2024-01-01T00:00:00.000Z',
    } as unknown as QuoteLifecycleRecord;
    const proved = proveConsequentialTransitionCoverage({
      quote,
      role: 'owner',
      xeroAuthorityPreserved: true,
    });
    assert.equal(proved.providerStateFaked, false);
    assert.equal(proved.xeroAuthorityPreserved, true);
    assert.equal(assertRow121SafetyGates({ row92AutomationEnabled: false }).xeroWrites, 0);
  });
});
