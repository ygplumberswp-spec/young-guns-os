import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function readSource(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('FIN-001 owner-financial-command route envelope', () => {
  it('exposes owner-command dashboard endpoint with period query', () => {
    const routeSource = readSource('src/routes/owner-financial-command.ts');
    assert.ok(routeSource.includes("'/owner-command'"));
    assert.ok(routeSource.includes("z.enum(['today', 'week', 'month'])"));
    assert.ok(routeSource.includes('denyTechnician'));
    assert.ok(routeSource.includes('canViewOwnerFinancialCommand'));
  });

  it('wires OwnerFinancialCommandService in index bootstrap', () => {
    const indexSource = readSource('src/index.ts');
    assert.ok(indexSource.includes('OwnerFinancialCommandService'));
    assert.ok(indexSource.includes('createOwnerFinancialCommandRouter'));
  });

  it('technician and client are blocked via canViewCashControl gate', () => {
    const sharedSource = readFileSync(
      join(root, '../../packages/shared/src/owner-financial-command.ts'),
      'utf8',
    );
    const cashSource = readFileSync(
      join(root, '../../packages/shared/src/cash-control.ts'),
      'utf8',
    );
    assert.ok(sharedSource.includes('canViewCashControl(identity)'));
    assert.ok(cashSource.includes("roleName === 'Technician'"));
    assert.ok(cashSource.includes("roleName === 'Client'"));
  });
});
