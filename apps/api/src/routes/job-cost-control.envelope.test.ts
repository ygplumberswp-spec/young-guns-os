import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function readSource(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('JPE-002 job cost control route envelope', () => {
  it('exposes finance job-cost-control and allocation endpoints', () => {
    const routeSource = readSource('src/routes/job-cost-control.ts');
    assert.ok(routeSource.includes("'/job-cost-control'"));
    assert.ok(routeSource.includes("'/unallocated-costs'"));
    assert.ok(routeSource.includes("'/costs/:costId/allocate'"));
    assert.ok(routeSource.includes('denyTechnicianClient'));
    assert.ok(routeSource.includes('canAccessJobCostControl'));
  });

  it('exposes job financial review endpoints on jobs router', () => {
    const routeSource = readSource('src/routes/job-cost-control.ts');
    assert.ok(routeSource.includes("'/financial-review'"));
    assert.ok(routeSource.includes("'/financial-review/complete'"));
    assert.ok(routeSource.includes("'/cost-checklist'"));
  });

  it('wires JobCostControlService in index bootstrap', () => {
    const indexSource = readSource('src/index.ts');
    assert.ok(indexSource.includes('JobCostControlService'));
    assert.ok(indexSource.includes('createJobCostControlRouter'));
  });
});
