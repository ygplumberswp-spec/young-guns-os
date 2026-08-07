import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildBudgetAlerts,
  buildForecast,
  buildOverheadSpendRows,
  budgetMonthRange,
  canViewBudgetControl,
  canWriteBudgetControl,
  compareMargin,
  compareMetric,
  deriveGrossProfitTargetCents,
  emptyBudgetPlan,
  forecastDoesNotAlterActuals,
  projectRunRate,
  resolveBudgetPlanMonth,
  safeAnalyticsCents,
  safePct,
} from './budget-control.js';

describe('FIN-004 budget control', () => {
  it('1/2/3/4 actual fields are pass-through from finance truth inputs', () => {
    // Shared layer does not invent actuals — compares use provided actual cents.
    const revenue = compareMetric('Revenue', 800_000, 1_000_000);
    assert.equal(revenue.actualCents, 800_000);
    const gp = compareMetric('Gross profit', 450_000, 500_000);
    assert.equal(gp.actualCents, 450_000);
    const oh = compareMetric('Overhead', 120_000, 100_000);
    assert.equal(oh.actualCents, 120_000);
    const op = compareMetric('Operating profit', 330_000, 400_000);
    assert.equal(op.actualCents, 330_000);
  });

  it('5 budget does not alter actual', () => {
    const actual = 500_000;
    const compare = compareMetric('Revenue', actual, 900_000);
    assert.equal(compare.actualCents, actual);
    assert.equal(actual, 500_000);
  });

  it('6 forecast does not alter actual', () => {
    const proof = forecastDoesNotAlterActuals(250_000);
    assert.equal(proof.actualUnchanged, 250_000);
    assert.equal(proof.forecast, 750_000);
  });

  it('9/10 current and previous month selection', () => {
    const now = new Date('2026-08-07T12:00:00.000Z');
    assert.equal(resolveBudgetPlanMonth(undefined, now), '2026-08-01');
    assert.equal(resolveBudgetPlanMonth('2026-07', now), '2026-07-01');
    const current = budgetMonthRange('2026-08-01', now);
    assert.equal(current.fromDate, '2026-08-01');
    assert.equal(current.toDate, '2026-08-07');
    assert.equal(current.isCurrentMonth, true);
    const prev = budgetMonthRange('2026-07-01', now);
    assert.equal(prev.fromDate, '2026-07-01');
    assert.equal(prev.toDate, '2026-07-31');
    assert.equal(prev.isPastMonth, true);
  });

  it('11 revenue target % correct', () => {
    const c = compareMetric('Revenue', 750_000, 1_000_000);
    assert.equal(c.percentAchieved, 75);
    assert.equal(c.differenceCents, -250_000);
  });

  it('12 margin variance correct', () => {
    const m = compareMargin(42.5, 50);
    assert.equal(m.differencePct, -7.5);
    assert.equal(m.configured, true);
  });

  it('13 overhead budget remaining correct', () => {
    const rows = buildOverheadSpendRows({
      budgetLines: [{ category: 'marketing', budgetCents: 20_000_00 }],
      actualByCategory: [{ category: 'marketing', amountCents: 13_500_00 }],
      totalOverheadBudgetCents: null,
      actualCompleteness: 'PROVISIONAL',
    });
    assert.equal(rows[0]?.budgetCents, 2_000_000);
    assert.equal(rows[0]?.actualCents, 1_350_000);
    assert.equal(rows[0]?.remainingCents, 650_000);
    assert.equal(rows[0]?.percentUsed, 67.5);
  });

  it('14 category overspend detected', () => {
    const rows = buildOverheadSpendRows({
      budgetLines: [{ category: 'software', budgetCents: 10_000 }],
      actualByCategory: [{ category: 'software', amountCents: 15_000 }],
      totalOverheadBudgetCents: null,
      actualCompleteness: 'VERIFIED',
    });
    assert.equal(rows[0]?.overspent, true);
  });

  it('15 total overspend detected', () => {
    const overhead = compareMetric('Overhead', 150_000, 100_000);
    const alerts = buildBudgetAlerts({
      revenue: compareMetric('Revenue', 1, 1),
      grossMargin: compareMargin(50, 50),
      overhead,
      operatingProfit: compareMetric('OP', 1, 1),
      cashCollected: compareMetric('Cash', 1, null),
      overheadSpend: [],
    });
    assert.ok(alerts.some((a) => a.kind === 'overhead_over_budget'));
  });

  it('16 behind-target alert correct', () => {
    const alerts = buildBudgetAlerts({
      revenue: compareMetric('Revenue', 400_000, 1_000_000),
      grossMargin: compareMargin(40, 50),
      overhead: compareMetric('OH', 50_000, 100_000),
      operatingProfit: compareMetric('OP', 100_000, 300_000),
      cashCollected: compareMetric('Cash', 200_000, 500_000),
      overheadSpend: [
        {
          category: 'marketing',
          budgetCents: 10,
          actualCents: 20,
          remainingCents: -10,
          percentUsed: 200,
          overspent: true,
          dataQuality: 'PROVISIONAL',
        },
      ],
    });
    assert.ok(alerts.some((a) => a.kind === 'revenue_behind_target'));
    assert.ok(alerts.some((a) => a.kind === 'margin_below_target'));
    assert.ok(alerts.some((a) => a.kind === 'operating_profit_below_target'));
    assert.ok(alerts.some((a) => a.kind === 'cash_collection_behind_target'));
    assert.ok(alerts.some((a) => a.kind === 'overhead_category_overspend'));
  });

  it('17 incomplete data labelled on forecast', () => {
    const f = buildForecast({
      planMonth: '2026-08-01',
      now: new Date('2026-08-07T12:00:00.000Z'),
      revenueCents: 0,
      grossProfitCents: 0,
      overheadCents: 0,
      operatingProfitCents: 0,
      cashCollectedCents: 0,
      actualCompleteness: 'INCOMPLETE',
      jobsIncluded: 0,
    });
    assert.equal(f.label, 'FORECAST');
    assert.equal(f.confidence, 'INCOMPLETE');
  });

  it('18 forecast clearly qualified', () => {
    const f = buildForecast({
      planMonth: '2026-08-01',
      now: new Date('2026-08-07T12:00:00.000Z'),
      revenueCents: 700_000,
      grossProfitCents: 300_000,
      overheadCents: 50_000,
      operatingProfitCents: 250_000,
      cashCollectedCents: 400_000,
      actualCompleteness: 'PROVISIONAL',
      jobsIncluded: 4,
    });
    assert.equal(f.label, 'FORECAST');
    assert.equal(f.method, 'elapsed_day_run_rate');
    assert.ok(f.confidenceNote.includes('FORECAST'));
    assert.equal(f.projectedRevenueCents, projectRunRate(700_000, 7, 31));
  });

  it('19 no divide-by-zero / NaN', () => {
    assert.equal(safePct(10, 0), null);
    assert.equal(projectRunRate(100, 0, 30), null);
    assert.equal(Number.isNaN(safeAnalyticsCents(Number.NaN)), false);
    const c = compareMetric('x', 10, 0);
    assert.equal(c.percentAchieved, null);
  });

  it('20 cent precision', () => {
    assert.equal(deriveGrossProfitTargetCents({
      revenueTargetCents: 1_000_000,
      grossMarginTargetPct: 45.5,
      grossProfitTargetCents: null,
    }), 455_000);
  });

  it('21/22 technician and client blocked', () => {
    assert.equal(canViewBudgetControl({ roleName: 'Technician', permissions: ['*'] }), false);
    assert.equal(canWriteBudgetControl({ roleName: 'Technician', permissions: ['finance:write'] }), false);
    assert.equal(canViewBudgetControl({ roleName: 'Client', permissions: ['finance:read'] }), false);
    assert.equal(canWriteBudgetControl({ roleName: 'Owner', permissions: ['finance:write'] }), true);
    assert.equal(
      canWriteBudgetControl({ roleName: 'Office Admin', permissions: ['finance:read'] }),
      false,
    );
  });

  it('24 empty plan state', () => {
    const plan = emptyBudgetPlan('2026-08');
    assert.equal(plan.isEmpty, true);
    assert.equal(plan.planMonth, '2026-08-01');
    assert.equal(plan.revenueTargetCents, null);
  });
});
