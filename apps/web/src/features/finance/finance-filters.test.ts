import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { InvoiceSummary, QuoteSummary } from '@titan/shared';
import {
  invoiceMatchesFilter,
  isInvoiceDraft,
  isQuoteDraft,
  paymentMatchesFilter,
  quoteMatchesFilter,
  visibleWorkspaceDrafts,
} from './finance-filters';

describe('finance-filters', () => {
  it('never treats issued quotes as drafts', () => {
    const quote = {
      status: 'draft',
      isImmutable: false,
      issuedAt: '2026-01-01T00:00:00.000Z',
    } as QuoteSummary;
    assert.equal(isQuoteDraft(quote), false);
  });

  it('never treats Xero-synced invoices as drafts', () => {
    const invoice = {
      status: 'draft',
      xeroInvoiceNumber: 'INV-100',
      numberAuthority: 'internal_pending_xero',
    } as InvoiceSummary;
    assert.equal(isInvoiceDraft(invoice), false);
  });

  it('maps quote awaiting approval filter', () => {
    assert.equal(
      quoteMatchesFilter({ status: 'internal_review' } as QuoteSummary, 'awaiting_approval'),
      true,
    );
    assert.equal(
      quoteMatchesFilter({ status: 'sent' } as QuoteSummary, 'awaiting_approval'),
      false,
    );
  });

  it('maps invoice overdue filter', () => {
    assert.equal(
      invoiceMatchesFilter({ status: 'sent', isOverdue: true } as InvoiceSummary, 'overdue'),
      true,
    );
  });

  it('classifies unallocated payments without Xero id', () => {
    assert.equal(
      paymentMatchesFilter(
        {
          invoiceId: 'inv-1',
          amountCents: 1000,
          xeroPaymentId: null,
          reference: null,
        } as never,
        'unallocated',
      ),
      true,
    );
  });

  it('dedupes workspace drafts already represented in list', () => {
    const drafts = [
      {
        id: 'd1',
        status: 'active',
        recordId: 'q1',
        recordType: 'quote',
        lastEditedAt: '2026-01-01T00:00:00.000Z',
      },
    ] as never[];
    const quotes = [{ id: 'q1', status: 'draft', isImmutable: false, issuedAt: null }] as QuoteSummary[];
    const visible = visibleWorkspaceDrafts(drafts, quotes, {
      filter: 'drafts',
      isDraftRecord: (record) => isQuoteDraft(record),
    });
    assert.equal(visible.length, 0);
  });
});
