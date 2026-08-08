import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  countByCanonicalInvoiceStatus,
  invoiceMatchesCanonicalFilter,
  isInvoiceOverdueDerived,
  quoteMatchesCanonicalFilter,
  resolveCanonicalInvoiceDisplayStatus,
  resolveCanonicalQuoteDisplayStatus,
} from './finance-canonical-status.js';

describe('Row 124 canonical finance statuses', () => {
  it('quote filters/statuses resolve consistently', () => {
    assert.equal(resolveCanonicalQuoteDisplayStatus({ status: 'draft' }), 'Draft');
    assert.equal(
      resolveCanonicalQuoteDisplayStatus({ status: 'internal_review' }),
      'Awaiting Approval',
    );
    assert.equal(resolveCanonicalQuoteDisplayStatus({ status: 'sent' }), 'Sent');
    assert.equal(resolveCanonicalQuoteDisplayStatus({ status: 'accepted' }), 'Accepted');
    assert.equal(resolveCanonicalQuoteDisplayStatus({ status: 'declined' }), 'Declined');
    assert.equal(resolveCanonicalQuoteDisplayStatus({ status: 'cancelled' }), 'Archived');
    assert.equal(quoteMatchesCanonicalFilter({ status: 'viewed' }, 'sent'), true);
    assert.equal(quoteMatchesCanonicalFilter({ status: 'converted' }, 'archived'), true);
  });

  it('overdue derived from due date + outstanding; no fake overdue without evidence', () => {
    assert.equal(
      isInvoiceOverdueDerived({
        dueDate: '2020-01-01',
        balanceDueCents: 1000,
        asOfDate: '2024-01-01',
        status: 'sent',
      }),
      true,
    );
    assert.equal(
      isInvoiceOverdueDerived({
        dueDate: '2020-01-01',
        balanceDueCents: 0,
        asOfDate: '2024-01-01',
        status: 'sent',
      }),
      false,
    );
    assert.equal(
      resolveCanonicalInvoiceDisplayStatus({
        status: 'overdue',
        dueDate: '2020-01-01',
        balanceDueCents: null,
        asOfDate: '2024-01-01',
      }),
      'Awaiting Payment',
    );
    assert.equal(
      resolveCanonicalInvoiceDisplayStatus({
        status: 'sent',
        dueDate: '2020-01-01',
        balanceDueCents: 500,
        asOfDate: '2024-01-01',
      }),
      'Overdue',
    );
    assert.equal(
      resolveCanonicalInvoiceDisplayStatus({ status: 'draft', awaitingApproval: true }),
      'Awaiting Approval',
    );
    assert.equal(resolveCanonicalInvoiceDisplayStatus({ status: 'cancelled' }), 'Voided');
    assert.equal(
      resolveCanonicalInvoiceDisplayStatus({ status: 'paid', archivedAt: '2024-01-01' }),
      'Archived',
    );
  });

  it('filters and counts use same resolver', () => {
    const rows = [
      { status: 'draft' as const },
      {
        status: 'sent' as const,
        dueDate: '2020-01-01',
        balanceDueCents: 100,
        asOfDate: '2024-06-01',
      },
      { status: 'partial' as const, dueDate: '2099-01-01', balanceDueCents: 50, asOfDate: '2024-06-01' },
      { status: 'paid' as const },
      { status: 'cancelled' as const },
    ];
    const counts = countByCanonicalInvoiceStatus(rows);
    assert.equal(counts.Draft, 1);
    assert.equal(counts.Overdue, 1);
    assert.equal(counts['Partially Paid'], 1);
    assert.equal(counts.Paid, 1);
    assert.equal(counts.Voided, 1);
    assert.equal(invoiceMatchesCanonicalFilter(rows[1]!, 'overdue'), true);
    assert.equal(invoiceMatchesCanonicalFilter(rows[2]!, 'partially_paid'), true);
  });
});
