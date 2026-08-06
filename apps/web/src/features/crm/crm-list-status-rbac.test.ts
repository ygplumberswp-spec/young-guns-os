import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TECHNICIAN_PERMISSIONS } from '@titan/auth';
import { canManageCustomers } from '../../features/crm/CustomerList';
import { canManageLeads } from '../../features/leads/utils';

describe('crm list status RBAC', () => {
  it('allows lead status changes only for leads:write', () => {
    assert.equal(canManageLeads(['leads:write']), true);
    assert.equal(canManageLeads(['leads:read']), false);
    assert.equal(canManageLeads(['customers:read', 'customers:write']), false);
    assert.equal(canManageLeads([...TECHNICIAN_PERMISSIONS]), false);
  });

  it('allows customer status changes only for customers:write', () => {
    assert.equal(canManageCustomers(['customers:write']), true);
    assert.equal(canManageCustomers(['customers:read']), false);
    assert.equal(canManageCustomers(['leads:read', 'leads:write']), false);
    assert.equal(canManageCustomers([...TECHNICIAN_PERMISSIONS]), false);
  });
});
