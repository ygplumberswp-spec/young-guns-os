import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { validateCustomerStatusChange } from '@titan/shared';

const servicePath = join(dirname(fileURLToPath(import.meta.url)), 'leads.service.ts');
const crmServicePath = join(dirname(fileURLToPath(import.meta.url)), 'crm.service.ts');

describe('crm status validation and audit hooks', () => {
  it('blocks archive/inactive for paying or invoiced customers', () => {
    const paying = {
      isVerifiedInvoiced: false,
      isPayingCustomer: true,
      isFullyPaid: false,
    };
    assert.equal(validateCustomerStatusChange('archived', paying).allowed, false);
    assert.equal(validateCustomerStatusChange('active', paying).allowed, true);
  });

  it('emits lead.status_changed audit event on status transition', () => {
    const source = readFileSync(servicePath, 'utf8');
    assert.match(source, /lead\.status_changed/);
    assert.match(source, /fromStatus: existingRow\.status/);
  });

  it('emits customer.status_changed audit event on status transition', () => {
    const source = readFileSync(crmServicePath, 'utf8');
    assert.match(source, /customer\.status_changed/);
    assert.match(source, /fromStatus: existing\.status/);
  });
});
