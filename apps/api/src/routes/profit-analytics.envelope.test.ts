import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function readSource(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('FIN-002 profit-analytics route envelope', () => {
  it('exposes overview/jobs/services/customers/labour/suppliers routes', () => {
    const routeSource = readSource('src/routes/profit-analytics.ts');
    assert.ok(routeSource.includes("'/profit-analytics/overview'"));
    assert.ok(routeSource.includes("'/profit-analytics/jobs'"));
    assert.ok(routeSource.includes("'/profit-analytics/services'"));
    assert.ok(routeSource.includes("'/profit-analytics/customers'"));
    assert.ok(routeSource.includes("'/profit-analytics/labour'"));
    assert.ok(routeSource.includes("'/profit-analytics/suppliers'"));
    assert.ok(routeSource.includes('denyTechnician'));
    assert.ok(routeSource.includes('canViewProfitAnalytics'));
  });

  it('wires ProfitAnalyticsService in index bootstrap', () => {
    const indexSource = readSource('src/index.ts');
    assert.ok(indexSource.includes('ProfitAnalyticsService'));
    assert.ok(indexSource.includes('createProfitAnalyticsRouter'));
  });

  it('blocks technician/client via shared gate', () => {
    const shared = readFileSync(
      join(root, '../../packages/shared/src/profit-analytics.ts'),
      'utf8',
    );
    assert.ok(shared.includes("roleName === 'Technician'"));
    assert.ok(shared.includes("roleName === 'Client'"));
  });
});
