import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateLineAmounts,
  calculateQuoteProfit,
  displayInvoiceNumber,
  formatInternalInvoiceNumber,
} from '@titan/shared';

test('calculates line VAT and costs in cents', () => {
  assert.deepEqual(calculateLineAmounts({ quantity: 2, unitPriceCents: 1000, unitCostCents: 600, vatRateBps: 1500 }), {
    lineSubtotalCents: 2000, lineVatCents: 300, lineTotalCents: 2300, lineCostCents: 1200,
  });
});

test('identifies quote below configured profit floor', () => {
  const profit = calculateQuoteProfit({ totalCents: 11000, estimatedCostCents: 10000, profitFloorMarginBps: 2000 });
  assert.equal(profit.profitFloorCents, 12000);
  assert.equal(profit.belowFloor, true);
});

test('uses internal invoice numbers until Xero assigns one', () => {
  assert.equal(formatInternalInvoiceNumber(42), 'TITAN-INV-000042');
  assert.equal(displayInvoiceNumber({ invoiceNumber: 'TITAN-INV-000042', internalNumber: 'TITAN-INV-000042' }), 'Pending Xero sync (TITAN-INV-000042)');
  assert.equal(displayInvoiceNumber({ invoiceNumber: 'TITAN-INV-000042', xeroInvoiceNumber: 'XERO-42' }), 'XERO-42');
});
