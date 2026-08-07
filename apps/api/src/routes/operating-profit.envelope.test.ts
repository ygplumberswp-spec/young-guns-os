import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function readSource(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('FIN-003 operating-profit route envelope', () => {
  it('exposes summary/overhead/issues routes', () => {
    const routeSource = readSource('src/routes/operating-profit.ts');
    assert.ok(routeSource.includes("'/operating-profit/summary'"));
    assert.ok(routeSource.includes("'/operating-profit/overhead'"));
    assert.ok(routeSource.includes("'/operating-profit/issues'"));
    assert.ok(routeSource.includes('denyTechnician'));
    assert.ok(routeSource.includes('canViewOperatingProfit'));
  });

  it('wires OperatingProfitService in index bootstrap', () => {
    const indexSource = readSource('src/index.ts');
    assert.ok(indexSource.includes('OperatingProfitService'));
    assert.ok(indexSource.includes('createOperatingProfitRouter'));
  });

  it('blocks technician/client via shared gate', () => {
    const shared = readFileSync(
      join(root, '../../packages/shared/src/operating-profit.ts'),
      'utf8',
    );
    assert.ok(shared.includes("roleName === 'Technician'"));
    assert.ok(shared.includes("roleName === 'Client'"));
  });
});
