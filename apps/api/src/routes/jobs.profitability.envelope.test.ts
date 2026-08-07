import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function readSource(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('job profitability route envelope', () => {
  it('exposes profitability endpoints with RBAC guards', () => {
    const routeSource = readSource('src/routes/jobs.ts');
    assert.ok(routeSource.includes("'/:jobId/profitability'"));
    assert.ok(routeSource.includes("'/:jobId/cost-adjustments'"));
    assert.ok(routeSource.includes("'/:jobId/profitability/recalculate'"));
    assert.ok(routeSource.includes('canAccessJobProfitability'));
    assert.ok(routeSource.includes('canViewJobProfitabilityMargin'));
    assert.ok(routeSource.includes('canManageJobProfitabilityAdjustments'));
  });

  it('wires JobProfitabilityService in index bootstrap', () => {
    const indexSource = readSource('src/index.ts');
    assert.ok(indexSource.includes('JobProfitabilityService'));
    assert.ok(indexSource.includes('jobProfitabilityService'));
  });
});
