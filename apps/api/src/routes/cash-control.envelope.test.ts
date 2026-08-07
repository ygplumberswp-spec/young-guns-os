import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function readSource(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('CASH-001 cash-control route envelope', () => {
  it('exposes summary, ledger, issues, and job drill-down routes', () => {
    const routeSource = readSource('src/routes/cash-control.ts');
    assert.ok(routeSource.includes("'/cash-control/summary'"));
    assert.ok(routeSource.includes("'/cash-control/ledger'"));
    assert.ok(routeSource.includes("'/cash-control/issues'"));
    assert.ok(routeSource.includes("'/cash-control/jobs/:jobId'"));
    assert.ok(routeSource.includes('denyTechnician'));
    assert.ok(routeSource.includes('canViewCashControl'));
  });

  it('wires CashControlService in index bootstrap under /api/v1/finance', () => {
    const indexSource = readSource('src/index.ts');
    assert.ok(indexSource.includes('CashControlService'));
    assert.ok(indexSource.includes('createCashControlRouter'));
    assert.ok(indexSource.includes("'/api/v1/finance'"));
  });

  it('technician and client are blocked', () => {
    const routeSource = readSource('src/routes/cash-control.ts');
    const sharedSource = readFileSync(
      join(root, '../../packages/shared/src/cash-control.ts'),
      'utf8',
    );
    assert.ok(routeSource.includes('createDenyTechnicianFromOwnerModules'));
    assert.ok(sharedSource.includes("roleName === 'Technician'"));
    assert.ok(sharedSource.includes("roleName === 'Client'"));
  });
});
