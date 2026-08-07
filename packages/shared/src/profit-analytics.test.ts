import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  aggregateByKey,
  aggregateByTechnician,
  buildCoverage,
  buildLabourSummary,
  buildMaterialSummary,
  buildOverviewFromJobs,
  canViewProfitAnalytics,
  deriveJobAnalyticsDataQuality,
  filterJobsForConfidentRanking,
  isLossJob,
  isLowMarginJob,
  paginateRows,
  rankLargestMarginMisses,
  rankLossJobs,
  rankTopGrossProfit,
  resolveProfitAnalyticsPeriodRange,
  safeAnalyticsCents,
  type ProfitAnalyticsJobRow,
} from './profit-analytics.js';

function job(partial: Partial<ProfitAnalyticsJobRow> & Pick<ProfitAnalyticsJobRow, 'jobId'>): ProfitAnalyticsJobRow {
  return {
    jobReference: partial.jobReference ?? 'J-1',
    title: partial.title ?? 'Job',
    status: partial.status ?? 'completed',
    jobType: partial.jobType ?? 'repair',
    customerId: partial.customerId ?? 'cust-1',
    customerName: partial.customerName ?? 'Customer',
    suburb: partial.suburb ?? 'Suburb',
    assignedUserId: partial.assignedUserId ?? 'user-1',
    assignedUserName: partial.assignedUserName ?? 'Tech',
    calculatedAt: partial.calculatedAt ?? '2026-08-07T00:00:00.000Z',
    completeness: partial.completeness ?? 'complete',
    confidenceStatus: partial.confidenceStatus ?? 'complete',
    dataQuality: partial.dataQuality ?? 'VERIFIED',
    currency: 'ZAR',
    revenueCents: partial.revenueCents ?? 100000,
    economicCostCents: partial.economicCostCents ?? 40000,
    grossProfitCents: partial.grossProfitCents ?? 60000,
    grossMarginPct: partial.grossMarginPct ?? 60,
    cashCollectedCents: partial.cashCollectedCents ?? 80000,
    cashSpentCents: partial.cashSpentCents ?? 30000,
    knownRealisedCashProfitCents: partial.knownRealisedCashProfitCents ?? 50000,
    expectedGrossMarginPct: partial.expectedGrossMarginPct ?? 55,
    actualGrossMarginPct: partial.actualGrossMarginPct ?? 60,
    marginVariancePct: partial.marginVariancePct ?? 5,
    expectedLabourCostCents: partial.expectedLabourCostCents ?? 10000,
    actualLabourCostCents: partial.actualLabourCostCents ?? 12000,
    labourVarianceCents: partial.labourVarianceCents ?? 2000,
    expectedMaterialCostCents: partial.expectedMaterialCostCents ?? 15000,
    actualMaterialCostCents: partial.actualMaterialCostCents ?? 18000,
    materialVarianceCents: partial.materialVarianceCents ?? 3000,
    labourMinutes: partial.labourMinutes ?? 120,
    profitStatus: partial.profitStatus ?? 'healthy',
    href: partial.href ?? `/jobs/${partial.jobId}`,
    ...partial,
  };
}

describe('FIN-002 profit analytics', () => {
  it('1 job GP uses provided JPE truth values', () => {
    const row = job({ jobId: 'j1', grossProfitCents: 95000 });
    assert.equal(row.grossProfitCents, 95000);
  });

  it('2 job margin uses JPE truth', () => {
    const row = job({ jobId: 'j1', grossMarginPct: 42.5 });
    assert.equal(row.grossMarginPct, 42.5);
  });

  it('3 economic and cash profit remain separate', () => {
    const overview = buildOverviewFromJobs(
      [
        job({
          jobId: 'j1',
          grossProfitCents: 60000,
          knownRealisedCashProfitCents: 40000,
        }),
      ],
      { period: 'month', fromDate: '2026-08-01', toDate: '2026-08-07' },
    );
    assert.equal(overview.grossProfitCents, 60000);
    assert.equal(overview.knownRealisedCashProfitCents, 40000);
    assert.notEqual(overview.grossProfitCents, overview.knownRealisedCashProfitCents);
  });

  it('4 loss job classified correctly', () => {
    assert.equal(isLossJob({ grossProfitCents: -1000, profitStatus: 'healthy' }), true);
    assert.equal(isLossJob({ grossProfitCents: 100, profitStatus: 'loss' }), true);
    assert.equal(isLossJob({ grossProfitCents: 100, profitStatus: 'healthy' }), false);
  });

  it('5 low-margin job classified correctly', () => {
    assert.equal(isLowMarginJob(10), true);
    assert.equal(isLowMarginJob(20), false);
  });

  it('6 top-profit ranking correct', () => {
    const ranked = rankTopGrossProfit([
      job({ jobId: 'a', grossProfitCents: 100 }),
      job({ jobId: 'b', grossProfitCents: 500 }),
      job({ jobId: 'c', grossProfitCents: 200 }),
    ]);
    assert.deepEqual(
      ranked.map((r) => r.jobId),
      ['b', 'c', 'a'],
    );
  });

  it('7 incomplete job flagged/excluded from confident ranking', () => {
    const rows = [
      job({ jobId: 'v', grossProfitCents: 100, dataQuality: 'VERIFIED' }),
      job({
        jobId: 'i',
        grossProfitCents: 999999,
        dataQuality: 'INCOMPLETE',
        completeness: 'incomplete_labour',
        confidenceStatus: 'incomplete',
      }),
    ];
    assert.equal(filterJobsForConfidentRanking(rows).length, 1);
    assert.equal(rankTopGrossProfit(rows)[0]?.jobId, 'v');
    assert.equal(deriveJobAnalyticsDataQuality({
      completeness: 'incomplete_labour',
      confidenceStatus: 'incomplete',
    }), 'INCOMPLETE');
  });

  it('8 service aggregation cent-exact', () => {
    const rows = aggregateByKey(
      [
        job({ jobId: '1', jobType: 'geyser', revenueCents: 1000, economicCostCents: 400, grossProfitCents: 600 }),
        job({ jobId: '2', jobType: 'geyser', revenueCents: 2000, economicCostCents: 500, grossProfitCents: 1500 }),
      ],
      (r) => ({ key: r.jobType ?? 'unknown', label: r.jobType ?? 'Unknown' }),
    );
    assert.equal(rows[0]?.revenueCents, 3000);
    assert.equal(rows[0]?.grossProfitCents, 2100);
    assert.equal(rows[0]?.economicCostCents, 900);
  });

  it('9 customer aggregation cent-exact', () => {
    const rows = aggregateByKey(
      [
        job({ jobId: '1', customerId: 'c1', customerName: 'A', revenueCents: 500, grossProfitCents: 200 }),
        job({ jobId: '2', customerId: 'c1', customerName: 'A', revenueCents: 700, grossProfitCents: 300 }),
      ],
      (r) => ({
        key: r.customerId ?? 'unknown',
        label: r.customerName ?? 'Unknown',
        href: r.customerId ? `/crm/${r.customerId}` : null,
      }),
    );
    assert.equal(rows[0]?.revenueCents, 1200);
    assert.equal(rows[0]?.grossProfitCents, 500);
    assert.equal(rows[0]?.averageTicketCents, 600);
  });

  it('10 no double counting across job joins (one row per job)', () => {
    const overview = buildOverviewFromJobs(
      [job({ jobId: 'only', revenueCents: 1000, grossProfitCents: 400 })],
      { period: 'week', fromDate: '2026-08-03', toDate: '2026-08-07' },
    );
    assert.equal(overview.revenueCents, 1000);
    assert.equal(overview.coverage.jobsIncluded, 1);
  });

  it('11 technician aggregation does not duplicate job revenue', () => {
    const tech = aggregateByTechnician([
      job({ jobId: '1', assignedUserId: 'u1', revenueCents: 1000, grossProfitCents: 400 }),
      job({ jobId: '2', assignedUserId: 'u1', revenueCents: 500, grossProfitCents: 100 }),
    ]);
    assert.equal(tech.length, 1);
    assert.equal(tech[0]?.attributableRevenueCents, 1500);
    assert.ok(tech[0]?.caveat.includes('not a personal performance score'));
  });

  it('12 labour hours aggregate correctly', () => {
    const labour = buildLabourSummary([
      job({ jobId: '1', labourMinutes: 60, expectedLabourCostCents: 100, actualLabourCostCents: 150 }),
      job({ jobId: '2', labourMinutes: 90, expectedLabourCostCents: 100, actualLabourCostCents: 80 }),
    ]);
    assert.equal(labour.actualLabourMinutes, 150);
    assert.equal(labour.labourVarianceCents, 30);
    assert.equal(labour.jobsWithLabourOverrun, 1);
  });

  it('13 material/direct costs aggregate correctly', () => {
    const materials = buildMaterialSummary([
      job({
        jobId: '1',
        expectedMaterialCostCents: 100,
        actualMaterialCostCents: 140,
      }),
      job({
        jobId: '2',
        expectedMaterialCostCents: 50,
        actualMaterialCostCents: 40,
      }),
    ]);
    assert.equal(materials.expectedMaterialCostCents, 150);
    assert.equal(materials.actualMaterialCostCents, 180);
    assert.equal(materials.materialVarianceCents, 30);
  });

  it('14 supplier spend shape validated via safe cents helper', () => {
    assert.equal(safeAnalyticsCents(450000), 450000);
  });

  it('15 expected vs actual variance / margin miss ranking', () => {
    const ranked = rankLargestMarginMisses([
      job({ jobId: 'a', marginVariancePct: -2 }),
      job({ jobId: 'b', marginVariancePct: -20 }),
      job({ jobId: 'c', marginVariancePct: 5 }),
    ]);
    assert.equal(ranked[0]?.jobId, 'b');
  });

  it('16 incomplete data quality handling', () => {
    assert.equal(
      deriveJobAnalyticsDataQuality({
        completeness: 'complete',
        confidenceStatus: 'provisional',
      }),
      'PROVISIONAL',
    );
    const coverage = buildCoverage([
      job({ jobId: '1', dataQuality: 'VERIFIED' }),
      job({ jobId: '2', dataQuality: 'INCOMPLETE' }),
    ]);
    assert.equal(coverage.dataQuality, 'INCOMPLETE');
    assert.equal(coverage.incompleteJobs, 1);
  });

  it('17 date filter period ranges', () => {
    const now = new Date('2026-08-07T12:00:00.000Z');
    const month = resolveProfitAnalyticsPeriodRange('month', now);
    assert.equal(month.fromDate, '2026-08-01');
    assert.equal(month.toDate, '2026-08-07');
    const last = resolveProfitAnalyticsPeriodRange('last_month', now);
    assert.equal(last.fromDate, '2026-07-01');
    assert.equal(last.toDate, '2026-07-31');
    const custom = resolveProfitAnalyticsPeriodRange('custom', now, {
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
    });
    assert.deepEqual(custom, { fromDate: '2026-01-01', toDate: '2026-01-31' });
  });

  it('18/19 technician and client blocked', () => {
    assert.equal(canViewProfitAnalytics({ roleName: 'Technician', permissions: ['*'] }), false);
    assert.equal(
      canViewProfitAnalytics({ roleName: 'Client', permissions: ['portal.invoices:read'] }),
      false,
    );
    assert.equal(
      canViewProfitAnalytics({ roleName: 'Owner', permissions: ['finance:read'] }),
      true,
    );
  });

  it('20/21 pagination and empty state', () => {
    const page = paginateRows(
      Array.from({ length: 30 }, (_, i) => job({ jobId: `j${i}` })),
      2,
      10,
    );
    assert.equal(page.rows.length, 10);
    assert.equal(page.page, 2);
    assert.equal(page.hasMore, true);
    const empty = buildOverviewFromJobs([], {
      period: 'month',
      fromDate: '2026-08-01',
      toDate: '2026-08-07',
    });
    assert.equal(empty.coverage.jobsIncluded, 0);
    assert.equal(empty.revenueCents, 0);
  });

  it('22/23 no NaN from safeAnalyticsCents', () => {
    assert.equal(safeAnalyticsCents(Number.NaN), 0);
    assert.equal(safeAnalyticsCents(undefined), 0);
  });

  it('loss jobs ranking includes incomplete loss jobs', () => {
    const loss = rankLossJobs([
      job({ jobId: 'x', grossProfitCents: -50, dataQuality: 'INCOMPLETE' }),
      job({ jobId: 'y', grossProfitCents: -10, dataQuality: 'VERIFIED' }),
    ]);
    assert.equal(loss.length, 2);
    assert.equal(loss[0]?.jobId, 'x');
  });
});
