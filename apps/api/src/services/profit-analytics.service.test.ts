import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  buildOverviewFromJobs,
  canViewProfitAnalytics,
  rankTopGrossProfit,
  type ProfitAnalyticsJobRow,
} from '@titan/shared';
import { ProfitAnalyticsError } from './profit-analytics.service.js';

const here = dirname(fileURLToPath(import.meta.url));

function job(partial: Partial<ProfitAnalyticsJobRow> & { jobId: string }): ProfitAnalyticsJobRow {
  return {
    jobReference: 'J',
    title: 'Job',
    status: 'completed',
    jobType: 'repair',
    customerId: 'c1',
    customerName: 'Cust',
    suburb: 'Area',
    assignedUserId: 'u1',
    assignedUserName: 'Tech',
    calculatedAt: '2026-08-07T00:00:00.000Z',
    completeness: 'complete',
    confidenceStatus: 'complete',
    dataQuality: 'VERIFIED',
    currency: 'ZAR',
    revenueCents: 100000,
    economicCostCents: 40000,
    grossProfitCents: 60000,
    grossMarginPct: 60,
    cashCollectedCents: 80000,
    cashSpentCents: 30000,
    knownRealisedCashProfitCents: 50000,
    expectedGrossMarginPct: 55,
    actualGrossMarginPct: 60,
    marginVariancePct: 5,
    expectedLabourCostCents: 10000,
    actualLabourCostCents: 12000,
    labourVarianceCents: 2000,
    expectedMaterialCostCents: 15000,
    actualMaterialCostCents: 18000,
    materialVarianceCents: 3000,
    labourMinutes: 120,
    profitStatus: 'healthy',
    href: `/jobs/${partial.jobId}`,
    ...partial,
  };
}

describe('FIN-002 ProfitAnalyticsService invariants', () => {
  it('blocks technician and client', () => {
    assert.equal(canViewProfitAnalytics({ roleName: 'Technician', permissions: ['finance:read'] }), false);
    assert.equal(canViewProfitAnalytics({ roleName: 'Client', permissions: [] }), false);
  });

  it('ProfitAnalyticsError FORBIDDEN', () => {
    assert.equal(new ProfitAnalyticsError('FORBIDDEN', 'x').code, 'FORBIDDEN');
  });

  it('keeps economic GP separate from cash profit in overview', () => {
    const overview = buildOverviewFromJobs(
      [job({ jobId: '1', grossProfitCents: 90, knownRealisedCashProfitCents: 40 })],
      { period: 'month', fromDate: '2026-08-01', toDate: '2026-08-07' },
    );
    assert.notEqual(overview.grossProfitCents, overview.knownRealisedCashProfitCents);
  });

  it('top profit ranking uses JPE GP values', () => {
    const ranked = rankTopGrossProfit([
      job({ jobId: 'a', grossProfitCents: 10 }),
      job({ jobId: 'b', grossProfitCents: 99 }),
    ]);
    assert.equal(ranked[0]?.jobId, 'b');
  });

  it('tenant scope and JPE snapshot authority in service source', () => {
    const source = readFileSync(join(here, 'profit-analytics.service.ts'), 'utf8');
    assert.ok(source.includes('eq(jobProfitabilitySnapshots.companyId, companyId)'));
    assert.ok(source.includes('eq(jobs.companyId, companyId)'));
    assert.ok(source.includes('jobProfitabilitySnapshots'));
    assert.ok(source.includes('grossProfitCents'));
    assert.equal(source.includes('getProfitability'), false); // does not call analytics stub
  });

  it('does not invent controlled service taxonomy', () => {
    const source = readFileSync(join(here, 'profit-analytics.service.ts'), 'utf8');
    assert.ok(source.includes('taxonomySupported: false'));
    assert.ok(source.includes('SERVICE_TAXONOMY_NOTE'));
  });
});

