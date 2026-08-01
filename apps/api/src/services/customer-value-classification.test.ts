import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  aggregateCustomerValueMetrics,
  classifyCustomerValueFromEvidence,
  customerMatchesValueFilter,
} from '@titan/shared';

const AS_OF = '2026-08-01T12:00:00.000Z';

describe('CustomerValueClassificationService contract', () => {
  it('loadClassificationSummaries avoids undeployed xero mapping columns', () => {
    const source = readFileSync(
      new URL('./customer-value-classification.service.ts', import.meta.url),
      'utf8',
    );
    const fnStart = source.indexOf('private async loadClassificationSummaries');
    const fnEnd = source.indexOf('private async resolveXeroImportState', fnStart);
    const fn = source.slice(fnStart, fnEnd);

    assert.match(fn, /customerId:\s*xeroCustomerMappings\.customerId/);
    assert.match(fn, /xeroContactId:\s*xeroCustomerMappings\.xeroContactId/);
    assert.doesNotMatch(fn, /\.select\(\)\s*\n\s*\.from\(xeroCustomerMappings\)/);
    assert.doesNotMatch(fn, /conflictMetadata|conflict_metadata/);
  });

  it('aggregates metrics without duplicate primary customer records', () => {
    const summaries = [
      {
        ...classifyCustomerValueFromEvidence({
          customerId: 'c1',
          customerName: 'A',
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
        computedAt: AS_OF,
      },
      {
        ...classifyCustomerValueFromEvidence({
          customerId: 'c2',
          customerName: 'B',
          customerStatus: 'lead',
          isSupplierOnly: false,
          xeroContactId: null,
          asOf: AS_OF,
          invoices: [],
        }),
        computedAt: AS_OF,
      },
      {
        ...classifyCustomerValueFromEvidence({
          customerId: 'c3',
          customerName: 'Supplier',
          customerStatus: 'active',
          isSupplierOnly: true,
          xeroContactId: 'x1',
          asOf: AS_OF,
          invoices: [],
        }),
        computedAt: AS_OF,
      },
    ];

    const metrics = aggregateCustomerValueMetrics(summaries);
    assert.equal(metrics.totals.customerRecords, 3);
    assert.equal(metrics.totals.qualifyingCustomers, 1);
    assert.equal(
      metrics.buckets.find((b) => b.classification === 'supplier_only_contact')?.count,
      1,
    );
  });

  it('tenant isolation: classifications are keyed by customerId only', () => {
    const companyA = classifyCustomerValueFromEvidence({
      customerId: 'company-a-customer',
      customerName: 'A',
      customerStatus: 'active',
      isSupplierOnly: false,
      xeroContactId: null,
      asOf: AS_OF,
      invoices: [],
    });
    const companyB = classifyCustomerValueFromEvidence({
      customerId: 'company-b-customer',
      customerName: 'B',
      customerStatus: 'active',
      isSupplierOnly: false,
      xeroContactId: null,
      asOf: AS_OF,
      invoices: [
        {
          id: 'i1',
          invoiceNumber: 'INV-1',
          status: 'sent',
          amountCents: 500,
          amountPaidCents: 0,
          totalCents: 500,
          issuedAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ],
    });

    assert.equal(companyA.primaryClassification, 'prospect_contact');
    assert.equal(companyB.primaryClassification, 'unpaid_debtor');
    assert.notEqual(companyA.customerId, companyB.customerId);
  });

  it('filter keys map to non-overlapping unpaid vs overdue views', () => {
    const overdue = {
      ...classifyCustomerValueFromEvidence({
        customerId: 'c1',
        customerName: 'Overdue',
        customerStatus: 'active',
        isSupplierOnly: false,
        xeroContactId: null,
        asOf: AS_OF,
        invoices: [
          {
            id: 'i1',
            invoiceNumber: 'INV-1',
            status: 'overdue',
            amountCents: 1000,
            amountPaidCents: 0,
            totalCents: 1000,
            dueDate: '2026-07-01T00:00:00.000Z',
            issuedAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z',
          },
        ],
      }),
      computedAt: AS_OF,
    };

    assert.equal(customerMatchesValueFilter(overdue, 'overdue_debtor'), true);
    assert.equal(customerMatchesValueFilter(overdue, 'unpaid_debtor'), false);
  });

  it('resolveXeroImportState skips incremental bank-tx-only jobs after CV refresh marker', () => {
    const source = readFileSync(
      new URL('./customer-value-classification.service.ts', import.meta.url),
      'utf8',
    );
    const fnStart = source.indexOf('private async resolveXeroImportState');
    const fnEnd = source.indexOf('function toInvoiceClassificationInput', fnStart);
    const fn = source.slice(fnStart, fnEnd);

    assert.match(fn, /integrationConnectors/);
    assert.match(fn, /cvMetricsRefreshJobId/);
    assert.match(fn, /incrementalBankTxOnly/);
    assert.match(fn, /importInProgress: importJobs\.length > 0 && !incrementalBankTxOnly/);
  });
});
