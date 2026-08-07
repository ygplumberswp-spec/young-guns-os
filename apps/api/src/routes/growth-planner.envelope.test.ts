import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function readSource(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('GROWTH-001 growth-planner route envelope', () => {
  it('exposes growth-planner and scenarios routes', () => {
    const routeSource = readSource('src/routes/growth-planner.ts');
    assert.ok(routeSource.includes("'/growth-planner'"));
    assert.ok(routeSource.includes("'/growth-planner/scenarios'"));
    assert.ok(routeSource.includes('denyTechnician'));
    assert.ok(routeSource.includes('canViewGrowthPlanner'));
  });

  it('wires GrowthPlannerService in index bootstrap', () => {
    const indexSource = readSource('src/index.ts');
    assert.ok(indexSource.includes('GrowthPlannerService'));
    assert.ok(indexSource.includes('createGrowthPlannerRouter'));
  });

  it('prefers no migration — uses FIN-004 plans', () => {
    const service = readSource('src/services/growth-planner.service.ts');
    assert.ok(service.includes('budgetControlService'));
    assert.equal(service.includes('financeMonthlyPlans'), false);
  });
});
