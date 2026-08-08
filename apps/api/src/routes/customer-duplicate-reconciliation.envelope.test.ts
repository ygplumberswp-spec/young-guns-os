import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'customer-duplicate-reconciliation.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/customer-duplicate-reconciliation.service.ts'),
  'utf8',
);

describe('Customer Duplicate Reconciliation route envelope', () => {
  it('denies Technician/Client and exposes draft/approve/execute', () => {
    assert.match(routeSource, /Technician/);
    assert.match(routeSource, /Client/);
    assert.match(routeSource, /\/draft/);
    assert.match(routeSource, /\/approve/);
    assert.match(routeSource, /\/execute/);
    assert.match(routeSource, /\/reverse/);
    assert.match(routeSource, /autoMerge: false/);
    assert.match(routeSource, /xeroWrites: 0/);
  });

  it('reuses Row 83 associations and never moves finance / writes Xero', () => {
    assert.match(serviceSource, /associateSource/);
    assert.match(serviceSource, /customerPeople|customer_people|createPerson/);
    assert.match(serviceSource, /movesFinancialOwnership: false/);
    assert.match(serviceSource, /xeroWrites: 0/);
    assert.match(serviceSource, /assertCrcRowanNotDestructivelyMerged/);
    assert.match(serviceSource, /NON_DESTRUCTIVE_CANONICAL|mergedIntoCustomerId/);
    assert.doesNotMatch(serviceSource, /repointLinkedRecords/);
  });
});
