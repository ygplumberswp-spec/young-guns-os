import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function readSource(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('FIN-004 budget-control route envelope', () => {
  it('exposes dashboard/put/actuals/forecast routes', () => {
    const routeSource = readSource('src/routes/budget-control.ts');
    assert.ok(routeSource.includes("'/budget-control'"));
    assert.ok(routeSource.includes("'/budget-control/:month'"));
    assert.ok(routeSource.includes("'/budget-control/:month/actuals'"));
    assert.ok(routeSource.includes("'/budget-control/:month/forecast'"));
    assert.ok(routeSource.includes('denyTechnician'));
    assert.ok(routeSource.includes('canViewBudgetControl'));
    assert.ok(routeSource.includes('canWriteBudgetControl'));
  });

  it('wires BudgetControlService in index bootstrap', () => {
    const indexSource = readSource('src/index.ts');
    assert.ok(indexSource.includes('BudgetControlService'));
    assert.ok(indexSource.includes('createBudgetControlRouter'));
  });

  it('migration 0191 persists plan only', () => {
    const sql = readFileSync(
      join(root, '../../packages/db/drizzle/0191_finance_monthly_budget_plans.sql'),
      'utf8',
    );
    assert.ok(sql.includes('finance_monthly_plans'));
    assert.ok(sql.includes('finance_monthly_plan_overhead_lines'));
    assert.ok(sql.includes('revenue_target_cents'));
    assert.equal(sql.includes('actual_revenue'), false);
  });
});
