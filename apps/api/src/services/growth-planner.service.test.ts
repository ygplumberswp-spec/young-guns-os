import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  buildNotConfiguredPlan,
  canViewGrowthPlanner,
  computeRevenueRemaining,
  jobsRequiredFromTicket,
} from '@titan/shared';
import { GrowthPlannerError } from './growth-planner.service.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('GROWTH-001 GrowthPlannerService invariants', () => {
  it('blocks technician and client', () => {
    assert.equal(canViewGrowthPlanner({ roleName: 'Technician', permissions: ['finance:read'] }), false);
    assert.equal(canViewGrowthPlanner({ roleName: 'Client', permissions: [] }), false);
  });

  it('GrowthPlannerError FORBIDDEN', () => {
    assert.equal(new GrowthPlannerError('FORBIDDEN', 'x').code, 'FORBIDDEN');
  });

  it('empty target state is NOT_CONFIGURED', () => {
    const plan = buildNotConfiguredPlan('2026-08-01');
    assert.equal(plan.status, 'NOT_CONFIGURED');
    assert.equal(plan.configured, false);
  });

  it('jobs required math stays in shared layer', () => {
    assert.equal(jobsRequiredFromTicket(computeRevenueRemaining(1_200_000, 0), 40_000), 30);
  });

  it('service composes budget + profit analytics and does not write plans', () => {
    const src = readFileSync(join(here, 'growth-planner.service.ts'), 'utf8');
    assert.ok(src.includes('budgetControlService'));
    assert.ok(src.includes('profitAnalyticsService'));
    assert.equal(src.includes('upsertPlan'), false);
    assert.equal(/from ['"].*xero/i.test(src), false);
  });

  it('tenant scope uses actor.companyId', () => {
    const src = readFileSync(join(here, 'growth-planner.service.ts'), 'utf8');
    assert.ok(src.includes('actor.companyId'));
    assert.ok(src.includes('eq(quotes.companyId, actor.companyId)'));
    assert.ok(src.includes('eq(jobs.companyId, actor.companyId)'));
  });
});
