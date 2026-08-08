import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertInvoiceNumberNotReused,
  assertIssuedInvoiceMutationAllowed,
  isInvoiceIssued,
  xeroBackedIssuedIsAuthoritative,
} from './issued-invoice-protection.js';

describe('Row 125 issued invoice protection', () => {
  it('blocks casual edit/delete on issued; allows void/credit/archive', () => {
    const issued = {
      status: 'sent' as const,
      issuedAt: '2024-01-01T00:00:00.000Z',
      invoiceNumber: 'INV-1',
    };
    assert.equal(isInvoiceIssued(issued), true);
    assert.equal(assertIssuedInvoiceMutationAllowed(issued, 'edit').allowed, false);
    assert.equal(assertIssuedInvoiceMutationAllowed(issued, 'delete').allowed, false);
    assert.equal(assertIssuedInvoiceMutationAllowed(issued, 'void').allowed, true);
    assert.equal(assertIssuedInvoiceMutationAllowed(issued, 'credit_note').allowed, true);
    assert.equal(assertIssuedInvoiceMutationAllowed(issued, 'archive').allowed, true);
    assert.equal(assertIssuedInvoiceMutationAllowed(issued, 'reuse_number').allowed, false);

    const draft = { status: 'draft' as const, issuedAt: null };
    assert.equal(assertIssuedInvoiceMutationAllowed(draft, 'edit').allowed, true);
    assert.equal(assertIssuedInvoiceMutationAllowed(draft, 'delete').allowed, true);
  });

  it('never reuses issued numbers; Xero-backed remains authoritative', () => {
    assert.throws(() =>
      assertInvoiceNumberNotReused({
        candidateNumber: 'INV-100',
        existingIssuedNumbers: ['INV-100'],
      }),
    );
    assert.equal(
      xeroBackedIssuedIsAuthoritative({
        status: 'sent',
        numberAuthority: 'xero',
        xeroInvoiceNumber: 'INV-9',
      }),
      true,
    );
  });
});
