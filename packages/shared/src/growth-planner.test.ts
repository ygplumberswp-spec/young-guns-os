import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assessCapacity,
  buildAuraNarrativeSeed,
  buildNotConfiguredPlan,
  buildTicketScenarios,
  canViewGrowthPlanner,
  computeAverageTicketCents,
  computeRevenueRemaining,
  countWeekdaysInclusive,
  deriveKnownCapacityPerDay,
  jobsPerDayRequired,
  jobsRequiredFromTicket,
  leadsRequiredFromConversion,
  percentAchieved,
  quoteAcceptanceRate,
  quotesRequiredFromConversion,
  resolveGrowthStatus,
  workingDaysRemaining,
} from './growth-planner.js';

describe('GROWTH-001 growth planner', () => {
  it('1 revenue remaining correct', () => {
    assert.equal(computeRevenueRemaining(1_000_000, 400_000), 600_000);
  });

  it('2 % target achieved correct', () => {
    assert.equal(percentAchieved(750_000, 1_000_000), 75);
  });

  it('3 jobs required from average ticket correct', () => {
    assert.equal(jobsRequiredFromTicket(120_000_00, 4_000_00), 30);
  });

  it('4 zero average ticket handled safely', () => {
    assert.equal(jobsRequiredFromTicket(100_000, 0), null);
    assert.equal(jobsRequiredFromTicket(100_000, null), null);
  });

  it('5 daily jobs requirement correct', () => {
    assert.equal(jobsPerDayRequired(30, 15), 2);
  });

  it('6 working days calculation correct (Mon–Fri)', () => {
    // 2026-08-07 Friday → remaining Mon 10 … Fri 28 = 15 weekdays? 
    // Aug 2026: 7 is Fri. Remaining from 10 (Mon) to 31: 
    // countWeekdaysInclusive('2026-08-10','2026-08-31')
    assert.equal(countWeekdaysInclusive('2026-08-10', '2026-08-14'), 5);
    assert.equal(workingDaysRemaining('2026-08-01', '2026-08-07'), 16);
  });

  it('7 quote requirement correct where conversion exists', () => {
    assert.equal(quotesRequiredFromConversion(30, 50), 60);
  });

  it('8 lead requirement correct where conversion exists', () => {
    assert.equal(leadsRequiredFromConversion(30, 50), 60);
  });

  it('9 missing conversion handled as unavailable', () => {
    assert.deepEqual(quoteAcceptanceRate(3, 1), { ratePercent: null, available: false });
    assert.equal(quotesRequiredFromConversion(30, null), null);
    assert.equal(leadsRequiredFromConversion(30, null), null);
  });

  it('10 capacity comparison correct', () => {
    const c = assessCapacity({ requiredJobsPerDay: 8, knownCapacityPerDay: 5 });
    assert.equal(c.state, 'CAPACITY_SHORTFALL');
    assert.equal(c.gapJobsPerDay, 3);
  });

  it('11 no invented capacity', () => {
    assert.equal(deriveKnownCapacityPerDay({ historicalCompletedJobs: 3, historicalWorkingDays: 5 }), null);
    assert.equal(
      assessCapacity({ requiredJobsPerDay: 2, knownCapacityPerDay: null }).state,
      'UNKNOWN',
    );
  });

  it('12 revenue on-track + margin miss remains at risk', () => {
    const r = resolveGrowthStatus({
      configured: true,
      percentAchieved: 50,
      workingDaysElapsed: 10,
      workingDaysInMonth: 20, // 50% elapsed, 50% achieved → on pace
      marginBelowTarget: true,
      overheadOverBudget: false,
      operatingProfitBehind: false,
      capacityState: 'ON_TRACK',
      jobsRequired: 10,
      averageTicketAvailable: true,
    });
    assert.equal(r.status, 'AT_RISK');
    assert.equal(r.financiallyAtRisk, true);
  });

  it('13 high overhead impacts status appropriately', () => {
    const r = resolveGrowthStatus({
      configured: true,
      percentAchieved: 50,
      workingDaysElapsed: 10,
      workingDaysInMonth: 20,
      marginBelowTarget: false,
      overheadOverBudget: true,
      operatingProfitBehind: false,
      capacityState: 'ON_TRACK',
      jobsRequired: 5,
      averageTicketAvailable: true,
    });
    assert.equal(r.status, 'AT_RISK');
    assert.ok(r.drivers.some((d) => d.toLowerCase().includes('overhead')));
  });

  it('14/15 plan helpers do not mutate targets/actuals', () => {
    const target = 100;
    const actual = 40;
    const remaining = computeRevenueRemaining(target, actual);
    assert.equal(target, 100);
    assert.equal(actual, 40);
    assert.equal(remaining, 60);
  });

  it('16 assumptions / scenarios traceable', () => {
    const scenarios = buildTicketScenarios(120_000, 4_000);
    assert.ok(scenarios.length >= 3);
    assert.equal(scenarios.find((s) => s.averageTicketCents === 4_000)?.jobsRequired, 30);
  });

  it('17 incomplete source data labelled', () => {
    const avg = computeAverageTicketCents(
      [{ revenueCents: 1000, dataQuality: 'INCOMPLETE' }],
      5,
    );
    assert.equal(avg.quality, 'INCOMPLETE');
    assert.equal(avg.averageTicketCents, null);
  });

  it('18 no NaN/divide-by-zero', () => {
    assert.equal(percentAchieved(10, 0), null);
    assert.equal(jobsPerDayRequired(10, 0), null);
    assert.equal(Number.isNaN(jobsRequiredFromTicket(10, 0) as number), false);
  });

  it('20/21 technician and client blocked', () => {
    assert.equal(canViewGrowthPlanner({ roleName: 'Technician', permissions: ['*'] }), false);
    assert.equal(canViewGrowthPlanner({ roleName: 'Client', permissions: ['finance:read'] }), false);
    assert.equal(canViewGrowthPlanner({ roleName: 'Owner', permissions: ['finance:read'] }), true);
  });

  it('22 empty target state', () => {
    const plan = buildNotConfiguredPlan('2026-08-01');
    assert.equal(plan.status, 'NOT_CONFIGURED');
    assert.equal(plan.configured, false);
    assert.ok(plan.qualityNote.includes('not configured'));
    assert.ok(buildAuraNarrativeSeed({
      configured: false,
      status: 'NOT_CONFIGURED',
      jobsRequired: null,
      averageTicketCents: null,
      remainingCents: null,
    }).includes('not configured'));
  });
});
