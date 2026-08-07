/**
 * SYS-001 — Full system integrity contracts.
 * Proves stacked closed modules remain wired; no journey expansion.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = join(apiRoot, '../..');
const webRoot = join(repoRoot, 'apps/web');
const sharedRoot = join(repoRoot, 'packages/shared');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('SYS-001 stacked ancestry + wiring integrity', () => {
  it('API package.json runs SEC-001 security matrix in default test script', () => {
    const pkg = read(join(apiRoot, 'package.json'));
    assert.ok(
      pkg.includes('sec-001-security-matrix.test.ts'),
      'SEC-001 matrix must be in @titan/api test script',
    );
  });

  it('finance stack routers remain mounted in API bootstrap', () => {
    const index = read(join(apiRoot, 'src/index.ts'));
    for (const token of [
      'createCashControlRouter',
      'createOwnerFinancialCommandRouter',
      'createProfitAnalyticsRouter',
      'createOperatingProfitRouter',
      'createBudgetControlRouter',
      'createGrowthPlannerRouter',
      'createBankTransactionControlRouter',
      'JobProfitabilityService',
    ]) {
      assert.ok(index.includes(token), `missing bootstrap wiring: ${token}`);
    }
  });

  it('OWNER-001 dashboard composes FIN-001 + GROWTH-001 without new engines', () => {
    const dash = read(join(webRoot, 'src/features/dashboard/ExecutiveDashboard.tsx'));
    assert.ok(dash.includes('OwnerCommandFinancePulse'));
    assert.ok(dash.includes('exec-dashboard--owner001'));
    const pulse = read(join(webRoot, 'src/features/dashboard/OwnerCommandFinancePulse.tsx'));
    assert.ok(pulse.includes('fetchOwnerFinancialCommandDashboard'));
    assert.ok(pulse.includes('fetchGrowthPlannerPlan'));
    assert.doesNotMatch(pulse, /computeKnownOperatingProfit|revenueTargetCents\s*\+/);
  });

  it('web App registers closed finance + growth + owner routes', () => {
    const app = read(join(webRoot, 'src/App.tsx'));
    for (const path of [
      '/finance/owner-command',
      '/finance/cash-control',
      '/finance/profit-analytics',
      '/finance/operating-profit',
      '/finance/budget-control',
      '/finance/growth-planner',
      '/finance/bank-control',
    ]) {
      assert.ok(app.includes(`path="${path}"`), `missing App route ${path}`);
    }
  });

  it('shared pure engines exist for JPE/CASH/FIN/GROWTH (no UI calc engines)', () => {
    for (const file of [
      'job-profitability.ts',
      'cash-control.ts',
      'owner-financial-command.ts',
      'profit-analytics.ts',
      'operating-profit.ts',
      'budget-control.ts',
      'growth-planner.ts',
      'bank-transaction-control.ts',
    ]) {
      assert.ok(
        existsSync(join(sharedRoot, 'src', file)),
        `missing shared engine ${file}`,
      );
    }
  });

  it('migration journal includes 0191 budget plans and no SYS-001 migration required', () => {
    const journal = JSON.parse(
      read(join(repoRoot, 'packages/db/drizzle/meta/_journal.json')),
    ) as { entries: Array<{ tag: string; idx: number }> };
    const tags = journal.entries.map((e) => e.tag);
    assert.ok(tags.some((t) => t.includes('0191_finance_monthly_budget_plans')));
    const idxs = journal.entries.map((e) => e.idx);
    assert.equal(new Set(idxs).size, idxs.length, 'duplicate journal idx');
    // SYS-001 must not invent a new migration file
    assert.equal(
      existsSync(join(repoRoot, 'packages/db/drizzle/0192_sys_001.sql')),
      false,
    );
  });

  it('Technician hard-deny remains on finance owner modules', () => {
    for (const file of [
      'cash-control.ts',
      'owner-financial-command.ts',
      'profit-analytics.ts',
      'operating-profit.ts',
      'budget-control.ts',
      'growth-planner.ts',
      'bank-transaction-control.ts',
    ]) {
      const src = read(join(apiRoot, 'src/routes', file));
      assert.ok(src.includes('denyTechnician'), `${file} missing denyTechnician`);
    }
  });

  it('budget and growth planners are advisory and do not mutate actuals APIs', () => {
    const budget = read(join(apiRoot, 'src/services/budget-control.service.ts'));
    const growth = read(join(apiRoot, 'src/services/growth-planner.service.ts'));
    assert.ok(budget.includes('upsert') || budget.includes('PUT') || budget.includes('plan'));
    assert.equal(growth.includes('upsertPlan'), false);
    assert.ok(growth.includes('budgetControlService'));
  });

  it('SSE live updates remain Authorization-header authenticated', () => {
    const route = read(join(apiRoot, 'src/routes/live-updates.ts'));
    assert.ok(route.includes('createAuthMiddleware'));
    assert.equal(route.includes('req.query.token'), false);
  });

  it('AURA command centre preserves draft→approve→execute boundary', () => {
    const aura = read(join(sharedRoot, 'src/aura-command-centre.ts'));
    assert.ok(/approv/i.test(aura));
    assert.ok(/draft/i.test(aura) || /pending/i.test(aura));
  });
});
