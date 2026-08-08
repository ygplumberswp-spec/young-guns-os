import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizeInvoiceActionRole,
  resolveInvoiceRowActions,
  serverAcceptsInvoiceAction,
} from './invoice-row-actions.js';

describe('Row 126 state/role invoice actions', () => {
  it('draft owner gets edit/send; issued gets void/credit not edit', () => {
    const draftActions = resolveInvoiceRowActions({
      role: 'owner',
      invoice: { status: 'draft', customerId: 'c1', jobId: 'j1' },
    });
    assert.ok(draftActions.includes('edit'));
    assert.ok(draftActions.includes('send'));
    assert.ok(!draftActions.includes('void'));

    const issuedActions = resolveInvoiceRowActions({
      role: 'owner',
      invoice: {
        status: 'sent',
        issuedAt: '2024-01-01T00:00:00.000Z',
        invoiceNumber: 'INV-1',
        customerId: 'c1',
        jobId: 'j1',
      },
    });
    assert.ok(!issuedActions.includes('edit'));
    assert.ok(issuedActions.includes('void'));
    assert.ok(issuedActions.includes('credit_note'));
    assert.ok(issuedActions.includes('resend'));
    assert.ok(issuedActions.includes('payment_history'));
    assert.ok(issuedActions.includes('duplicate_as_draft'));
  });

  it('tech/client cannot gain internal finance controls', () => {
    assert.deepEqual(
      resolveInvoiceRowActions({
        role: 'technician',
        invoice: { status: 'draft' },
      }),
      ['view'],
    );
    assert.deepEqual(
      resolveInvoiceRowActions({
        role: normalizeInvoiceActionRole('client'),
        invoice: { status: 'sent', issuedAt: '2024-01-01' },
      }),
      ['view'],
    );
    assert.equal(
      serverAcceptsInvoiceAction({
        role: 'technician',
        invoice: { status: 'draft' },
        action: 'void',
      }),
      false,
    );
  });
});
