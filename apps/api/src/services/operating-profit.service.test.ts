import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  buildOperatingProfitSummary,
  canViewOperatingProfit,
  computeKnownOperatingProfitCents,
} from '@titan/shared';
import { OperatingProfitError } from './operating-profit.service.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('FIN-003 OperatingProfitService invariants', () => {
  it('blocks technician and client', () => {
    assert.equal(canViewOperatingProfit({ roleName: 'Technician', permissions: ['finance:read'] }), false);
    assert.equal(canViewOperatingProfit({ roleName: 'Client', permissions: [] }), false);
  });

  it('OperatingProfitError FORBIDDEN', () => {
    assert.equal(new OperatingProfitError('FORBIDDEN', 'x').code, 'FORBIDDEN');
  });

  it('operating profit = GP - overhead', () => {
    assert.equal(computeKnownOperatingProfitCents(600_000, 100_000), 500_000);
  });

  it('keeps economic OP separate from cash movement', () => {
    const summary = buildOperatingProfitSummary({
      period: 'month',
      fromDate: '2026-08-01',
      toDate: '2026-08-07',
      economicRevenueCents: 1_000_000,
      directEconomicCostCents: 400_000,
      companyGrossProfitCents: 600_000,
      knownOverheadCents: 100_000,
      customerCashCollectedCents: 700_000,
      directCashOutCents: 250_000,
      overheadCashOutCents: 100_000,
      excludedTransferOutCents: 0,
      excludedNonOperatingOutCents: 0,
      unexplainedDebitCents: 0,
      jobsIncluded: 2,
      incompleteJobs: 0,
      unallocatedDebitCount: 0,
      missingReceiptCount: 0,
      unresolvedOverheadCategoryCents: 0,
      hasBankAccounts: true,
    });
    assert.notEqual(summary.knownOperatingProfitCents, summary.knownOperatingCashMovementCents);
  });

  it('service source does not import Xero clients', () => {
    const src = readFileSync(join(here, 'operating-profit.service.ts'), 'utf8');
    assert.equal(/from ['"].*xero/i.test(src), false);
    assert.equal(src.includes('XeroClient'), false);
    assert.ok(src.includes('cashControlService'));
    assert.ok(src.includes('profitAnalyticsService'));
    // Explicitly ignores parallel Xero amounts (set to 0) — no dual-sum.
    assert.ok(src.includes('xeroBillExpenseCents: 0'));
  });
});
