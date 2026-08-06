import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  customerUiStatusToDbStatus,
  resolveCustomerUiStatus,
  validateCustomerStatusChange,
} from './crm-list-ui.js';

describe('crm-list-ui customer status guards', () => {
  it('derives payment attention from overdue classification', () => {
    assert.equal(
      resolveCustomerUiStatus('active', {
        isVerifiedInvoiced: true,
        isPayingCustomer: false,
        isOverdueDebtor: true,
        isUnpaidDebtor: false,
        isPartiallyPaid: false,
        isProspect: false,
      }),
      'payment_attention',
    );
  });

  it('blocks inactive/archived for paying customers', () => {
    const paying = {
      isVerifiedInvoiced: false,
      isPayingCustomer: true,
      isFullyPaid: false,
    };

    assert.deepEqual(validateCustomerStatusChange('inactive', paying), {
      allowed: false,
      reason:
        'Cannot archive or deactivate a paying or invoiced customer. Resolve billing first.',
    });
    assert.deepEqual(validateCustomerStatusChange('archived', paying), {
      allowed: false,
      reason:
        'Cannot archive or deactivate a paying or invoiced customer. Resolve billing first.',
    });
    assert.deepEqual(validateCustomerStatusChange('active', paying), { allowed: true });
  });

  it('blocks inactive/archived for invoiced customers', () => {
    const invoiced = {
      isVerifiedInvoiced: true,
      isPayingCustomer: false,
      isFullyPaid: false,
    };

    assert.equal(validateCustomerStatusChange('archived', invoiced).allowed, false);
    assert.equal(validateCustomerStatusChange('active', invoiced).allowed, true);
  });

  it('maps UI statuses to DB statuses', () => {
    assert.equal(customerUiStatusToDbStatus('active'), 'active');
    assert.equal(customerUiStatusToDbStatus('archived'), 'inactive');
    assert.equal(customerUiStatusToDbStatus('duplicate_review'), 'lead');
  });
});
