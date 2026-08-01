import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateCustomerValueMetrics,
  classifyCustomerValueFromEvidence,
  customerMatchesValueFilter,
  isMarketingEligibleCustomerValue,
} from './customer-value-classification.js';

const AS_OF = '2026-08-01T12:00:00.000Z';

describe('classifyCustomerValueFromEvidence', () => {
  it('treats invoiced-only as verified invoiced / unpaid debtor, not paying', () => {
    const result = classifyCustomerValueFromEvidence({
      customerId: 'c1',
      customerName: 'Ada',
      customerStatus: 'active',
      isSupplierOnly: false,
      xeroContactId: null,
      asOf: AS_OF,
      invoices: [
        {
          id: 'i1',
          invoiceNumber: 'INV-1',
          status: 'sent',
          amountCents: 5000,
          amountPaidCents: 0,
          totalCents: 5000,
          issuedAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ],
    });

    assert.equal(result.primaryClassification, 'unpaid_debtor');
    assert.equal(result.isVerifiedInvoiced, true);
    assert.equal(result.isPayingCustomer, false);
    assert.equal(result.cashReceivedCents, 0);
    assert.equal(result.totalInvoicedCents, 5000);
    assert.equal(result.outstandingCents, 5000);
    assert.equal(isMarketingEligibleCustomerValue(result), false);
  });

  it('classifies partial payment with remaining balance', () => {
    const result = classifyCustomerValueFromEvidence({
      customerId: 'c1',
      customerName: 'Ada',
      customerStatus: 'active',
      isSupplierOnly: false,
      xeroContactId: 'x1',
      asOf: AS_OF,
      invoices: [
        {
          id: 'i1',
          invoiceNumber: 'INV-1',
          status: 'partial',
          amountCents: 10000,
          amountPaidCents: 4000,
          totalCents: 10000,
          issuedAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ],
    });

    assert.equal(result.primaryClassification, 'partially_paid_customer');
    assert.equal(result.isPayingCustomer, true);
    assert.equal(result.isPartiallyPaid, true);
    assert.equal(result.cashReceivedCents, 4000);
    assert.equal(result.outstandingCents, 6000);
    assert.equal(isMarketingEligibleCustomerValue(result), true);
  });

  it('classifies fully paid when outstanding is zero', () => {
    const result = classifyCustomerValueFromEvidence({
      customerId: 'c1',
      customerName: 'Ada',
      customerStatus: 'active',
      isSupplierOnly: false,
      xeroContactId: 'x1',
      asOf: AS_OF,
      invoices: [
        {
          id: 'i1',
          invoiceNumber: 'INV-1',
          status: 'paid',
          amountCents: 5000,
          amountPaidCents: 5000,
          totalCents: 5000,
          issuedAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ],
    });

    assert.equal(result.primaryClassification, 'fully_paid_customer');
    assert.equal(result.isFullyPaid, true);
    assert.equal(result.outstandingCents, 0);
    assert.equal(result.cashReceivedCents, 5000);
  });

  it('flags overdue debtor when balance is past due date', () => {
    const result = classifyCustomerValueFromEvidence({
      customerId: 'c1',
      customerName: 'Ada',
      customerStatus: 'active',
      isSupplierOnly: false,
      xeroContactId: null,
      asOf: AS_OF,
      invoices: [
        {
          id: 'i1',
          invoiceNumber: 'INV-1',
          status: 'overdue',
          amountCents: 8000,
          amountPaidCents: 0,
          totalCents: 8000,
          dueDate: '2026-07-01T00:00:00.000Z',
          issuedAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ],
    });

    assert.equal(result.primaryClassification, 'overdue_debtor');
    assert.equal(result.isOverdueDebtor, true);
    assert.equal(result.overdueOutstandingCents, 8000);
  });

  it('classifies prospect when no qualifying invoice exists', () => {
    const result = classifyCustomerValueFromEvidence({
      customerId: 'c1',
      customerName: 'Ada',
      customerStatus: 'lead',
      isSupplierOnly: false,
      xeroContactId: null,
      asOf: AS_OF,
      invoices: [],
    });

    assert.equal(result.primaryClassification, 'prospect_contact');
    assert.equal(result.isProspect, true);
    assert.equal(result.isVerifiedInvoiced, false);
  });

  it('excludes supplier-only contacts from customer metrics', () => {
    const result = classifyCustomerValueFromEvidence({
      customerId: 'c1',
      customerName: 'Supplier Co',
      customerStatus: 'active',
      isSupplierOnly: true,
      xeroContactId: 'x1',
      asOf: AS_OF,
      invoices: [
        {
          id: 'i1',
          invoiceNumber: 'INV-1',
          status: 'paid',
          amountCents: 1000,
          amountPaidCents: 1000,
          totalCents: 1000,
          issuedAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ],
    });

    assert.equal(result.primaryClassification, 'supplier_only_contact');
    assert.equal(result.isSupplierOnly, true);
    assert.equal(result.totalInvoicedCents, 0);
    assert.equal(isMarketingEligibleCustomerValue(result), false);
  });

  it('excludes draft and voided invoices from proof', () => {
    const result = classifyCustomerValueFromEvidence({
      customerId: 'c1',
      customerName: 'Ada',
      customerStatus: 'active',
      isSupplierOnly: false,
      xeroContactId: null,
      asOf: AS_OF,
      invoices: [
        {
          id: 'i1',
          invoiceNumber: 'DRAFT-1',
          status: 'draft',
          amountCents: 1000,
          amountPaidCents: 0,
          totalCents: 1000,
          issuedAt: null,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'i2',
          invoiceNumber: 'VOID-1',
          status: 'cancelled',
          amountCents: 2000,
          amountPaidCents: 2000,
          totalCents: 2000,
          issuedAt: '2026-01-02T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ],
    });

    assert.equal(result.primaryClassification, 'prospect_contact');
    assert.equal(result.qualifyingInvoiceCount, 0);
  });

  it('never counts unpaid invoice totals as cash received', () => {
    const result = classifyCustomerValueFromEvidence({
      customerId: 'c1',
      customerName: 'Ada',
      customerStatus: 'active',
      isSupplierOnly: false,
      xeroContactId: null,
      asOf: AS_OF,
      invoices: [
        {
          id: 'i1',
          invoiceNumber: 'INV-1',
          status: 'sent',
          amountCents: 25000,
          amountPaidCents: 0,
          totalCents: 25000,
          issuedAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ],
    });

    assert.equal(result.cashReceivedCents, 0);
    assert.notEqual(result.cashReceivedCents, result.totalInvoicedCents);
  });
});

describe('aggregateCustomerValueMetrics', () => {
  it('does not double-count customers across exclusive primary buckets', () => {
    const summaries = [
      classifyCustomerValueFromEvidence({
        customerId: 'c1',
        customerName: 'Paid',
        customerStatus: 'active',
        isSupplierOnly: false,
        xeroContactId: null,
        asOf: AS_OF,
        invoices: [
          {
            id: 'i1',
            invoiceNumber: 'INV-1',
            status: 'paid',
            amountCents: 1000,
            amountPaidCents: 1000,
            totalCents: 1000,
            issuedAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z',
          },
        ],
      }),
      classifyCustomerValueFromEvidence({
        customerId: 'c2',
        customerName: 'Prospect',
        customerStatus: 'lead',
        isSupplierOnly: false,
        xeroContactId: null,
        asOf: AS_OF,
        invoices: [],
      }),
    ].map((row) => ({ ...row, computedAt: AS_OF }));

    const metrics = aggregateCustomerValueMetrics(summaries);
    const fullyPaid = metrics.buckets.find((b) => b.classification === 'fully_paid_customer');
    const prospect = metrics.buckets.find((b) => b.classification === 'prospect_contact');
    const paying = metrics.buckets.find((b) => b.classification === 'paying_customer');

    assert.equal(fullyPaid?.count, 1);
    assert.equal(prospect?.count, 1);
    assert.equal(paying?.count, 1);
    assert.equal(metrics.totals.customerRecords, 2);
    assert.equal(metrics.totals.cashReceivedCents, 1000);
  });

  it('supports filter matching for list endpoints', () => {
    const summary = {
      ...classifyCustomerValueFromEvidence({
        customerId: 'c1',
        customerName: 'Ada',
        customerStatus: 'active',
        isSupplierOnly: false,
        xeroContactId: null,
        asOf: AS_OF,
        invoices: [
          {
            id: 'i1',
            invoiceNumber: 'INV-1',
            status: 'partial',
            amountCents: 5000,
            amountPaidCents: 2000,
            totalCents: 5000,
            issuedAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z',
          },
        ],
      }),
      computedAt: AS_OF,
    };

    assert.equal(customerMatchesValueFilter(summary, 'partially_paid_customer'), true);
    assert.equal(customerMatchesValueFilter(summary, 'paying_customer'), true);
    assert.equal(customerMatchesValueFilter(summary, 'unpaid_debtor'), false);
  });
});

describe('tenant isolation contract', () => {
  it('classifies per-customer evidence only (no cross-customer fields)', () => {
    const a = classifyCustomerValueFromEvidence({
      customerId: 'tenant-a',
      customerName: 'Tenant A',
      customerStatus: 'active',
      isSupplierOnly: false,
      xeroContactId: null,
      asOf: AS_OF,
      invoices: [
        {
          id: 'i1',
          invoiceNumber: 'A-1',
          status: 'paid',
          amountCents: 100,
          amountPaidCents: 100,
          totalCents: 100,
          issuedAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ],
    });
    const b = classifyCustomerValueFromEvidence({
      customerId: 'tenant-b',
      customerName: 'Tenant B',
      customerStatus: 'active',
      isSupplierOnly: false,
      xeroContactId: null,
      asOf: AS_OF,
      invoices: [],
    });

    assert.notEqual(a.customerId, b.customerId);
    assert.equal(a.isFullyPaid, true);
    assert.equal(b.isProspect, true);
  });
});
