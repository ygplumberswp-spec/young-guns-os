import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildImportedInvoiceFinancialFields,
  resolveImportedSubtotalCents,
} from './xero-sync.service.js';

/**
 * Staging invoice INV-0550 is the real case. It carries a "Paid Deposit" line of -R32,507.33
 * against R25,180.20 of work, so Xero reports SubTotal -288356, TotalTax 444357 and Total 156001.
 * The importer was substituting the total for any subtotal that was not positive, which stored
 * 156001 as the subtotal and left the only invoice on the tenant where subtotal + VAT did not
 * equal the total.
 */
const INV_0550 = { total: 1560.01, subtotal: -2883.56, totalTax: 4443.57, amountPaid: 0 };

test('a negative Xero subtotal is stored as Xero reported it', () => {
  const fields = buildImportedInvoiceFinancialFields(INV_0550);

  assert.equal(fields.subtotalCents, -288356);
  assert.equal(fields.vatCents, 444357);
  assert.equal(fields.totalCents, 156001);
  assert.equal(fields.amountCents, 156001);
  assert.equal(fields.subtotalCents + fields.vatCents, fields.totalCents);
});

test('an ordinary invoice is unchanged', () => {
  const fields = buildImportedInvoiceFinancialFields({
    total: 1150,
    subtotal: 1000,
    totalTax: 150,
    amountPaid: 1150,
  });

  assert.equal(fields.subtotalCents, 100000);
  assert.equal(fields.vatCents, 15000);
  assert.equal(fields.totalCents, 115000);
  assert.equal(fields.amountPaidCents, 115000);
});

test('a subtotal Xero did not report is derived from the total less tax', () => {
  assert.equal(
    resolveImportedSubtotalCents({ subtotalCents: 0, vatCents: 15000, resolvedTotalCents: 115000 }),
    100000,
  );

  // Nothing to reconcile: no total, no tax, no subtotal.
  assert.equal(
    resolveImportedSubtotalCents({ subtotalCents: 0, vatCents: 0, resolvedTotalCents: 0 }),
    0,
  );
});

test('a zero-rated document keeps the total as its subtotal', () => {
  const fields = buildImportedInvoiceFinancialFields({
    total: 500,
    subtotal: 0,
    totalTax: 0,
    amountPaid: 0,
  });

  assert.equal(fields.subtotalCents, 50000);
  assert.equal(fields.vatCents, 0);
});
