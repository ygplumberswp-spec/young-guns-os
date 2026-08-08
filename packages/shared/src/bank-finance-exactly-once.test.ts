import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertRow113SafetyGates,
  canViewBankFinanceExactlyOnce,
  mayFeedFinanceOrJpe,
  resolveDuplicateEconomicEvents,
  selectExactlyOnceJpeFeed,
} from './bank-finance-exactly-once.js';

describe('Row 113 finance/JPE exactly-once', () => {
  it('only REVIEWED/RECONCILED may feed; no fabricated job allocation', () => {
    assert.equal(
      mayFeedFinanceOrJpe({
        reconState: 'UNMATCHED',
        allocationType: 'direct_job_cost',
        jobId: 'j1',
      }).mayFeedJpe,
      false,
    );
    assert.equal(
      mayFeedFinanceOrJpe({
        reconState: 'RECONCILED',
        allocationType: 'direct_job_cost',
        jobId: 'j1',
      }).mayFeedJpe,
      true,
    );
    assert.equal(
      mayFeedFinanceOrJpe({
        reconState: 'REVIEWED',
        allocationType: 'customer_payment',
        jobId: null,
      }).mayFeedJpe,
      false,
    );
    assert.equal(
      mayFeedFinanceOrJpe({
        reconState: 'RECONCILED',
        allocationType: 'overhead',
        jobId: null,
      }).mayFeedJpe,
      false,
    );
    assert.equal(
      mayFeedFinanceOrJpe({
        reconState: 'RECONCILED',
        allocationType: 'direct_job_cost',
        jobId: null,
      }).mayFeedJpe,
      false,
    );
    assert.throws(() =>
      mayFeedFinanceOrJpe({
        reconState: 'RECONCILED',
        allocationType: 'direct_job_cost',
        jobId: 'j',
        fabricateJobAllocation: true,
      }),
    );
  });

  it('FNB + Xero duplicate → one economic event, not two', () => {
    const resolved = resolveDuplicateEconomicEvents({
      companyId: 'co',
      events: [
        {
          id: 'fnb-1',
          source: 'fnb_import',
          amountCents: 5000,
          transactionDate: '2026-08-01',
          direction: 'debit',
          reference: 'INV-9',
          description: 'Supplier',
        },
        {
          id: 'xero-1',
          source: 'xero_bank',
          amountCents: 5000,
          transactionDate: '2026-08-01',
          direction: 'debit',
          reference: 'INV-9',
          description: 'Supplier',
          xeroBankTransactionId: 'xbt-1',
        },
      ],
    });
    assert.equal(resolved.uniqueEconomicEventCount, 1);
    assert.equal(resolved.groups[0].eventIds.length, 2);

    const feed = selectExactlyOnceJpeFeed({
      reconState: 'RECONCILED',
      allocationType: 'direct_job_cost',
      jobId: 'job-1',
      sourceRepresentations: [
        { id: 'fnb-1', source: 'fnb_import', alreadyPostedToJpe: false },
        { id: 'xero-1', source: 'xero_bank', alreadyPostedToJpe: false },
      ],
    });
    assert.equal(feed.jpePostCount, 1);
    assert.equal(feed.feedFromId, 'fnb-1');
    assert.deepEqual(feed.skippedDuplicateIds, ['xero-1']);
    assert.equal(feed.xeroWrites, 0);

    const already = selectExactlyOnceJpeFeed({
      reconState: 'RECONCILED',
      allocationType: 'direct_job_cost',
      jobId: 'job-1',
      sourceRepresentations: [
        { id: 'fnb-1', source: 'fnb_import', alreadyPostedToJpe: true },
        { id: 'xero-1', source: 'xero_bank', alreadyPostedToJpe: false },
      ],
    });
    assert.equal(already.jpePostCount, 0);
  });

  it('RBAC + safety + no automatic provider write', () => {
    assert.equal(canViewBankFinanceExactlyOnce({ roleName: 'owner' }), true);
    assert.equal(canViewBankFinanceExactlyOnce({ roleName: 'technician' }), false);
    assert.equal(canViewBankFinanceExactlyOnce({ roleName: 'client' }), false);
    assert.throws(() =>
      assertRow113SafetyGates({
        row92AutomationEnabled: false,
        automaticProviderAccountingWrite: true,
      }),
    );
    assert.equal(assertRow113SafetyGates({ row92AutomationEnabled: false }).xeroWrites, 0);
  });
});
