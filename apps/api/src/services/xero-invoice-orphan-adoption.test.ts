import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Staging surfaced exactly one of these: invoice INV-0094 (Xero id e100cef1…) was present in
 * `invoices` carrying source_provider='xero' and source_external_id set, but had no
 * xero_invoice_mappings row. Deciding insert-vs-update from the mapping table alone read that as
 * "never imported", so every run inserted a second row under the same invoice number, failed the
 * unique constraint, and skipped the payment allocated to it.
 */
const SOURCE = readFileSync(new URL('./xero-sync.service.ts', import.meta.url), 'utf8');

const IMPORT_INVOICE_BATCH = SOURCE.slice(
  SOURCE.indexOf('private async importInvoiceBatch'),
  SOURCE.indexOf('private async importPaymentBatch'),
);

test('importInvoiceBatch was found', () => {
  assert.ok(IMPORT_INVOICE_BATCH.length > 0);
});

test('an invoice row already carrying this Xero id is adopted rather than inserted again', () => {
  assert.match(IMPORT_INVOICE_BATCH, /eq\(invoices\.sourceProvider, 'xero'\)/);
  assert.match(IMPORT_INVOICE_BATCH, /eq\(invoices\.sourceExternalId, remote\.invoiceId\)/);

  const lookupIndex = IMPORT_INVOICE_BATCH.indexOf('eq(invoices.sourceExternalId, remote.invoiceId)');
  const insertIndex = IMPORT_INVOICE_BATCH.indexOf('.insert(invoices)');
  assert.ok(lookupIndex > -1 && insertIndex > -1);
  assert.ok(lookupIndex < insertIndex, 'the orphan lookup must happen before the insert path');
});

test('the update path keys off the resolved invoice, not the mapping row alone', () => {
  assert.match(IMPORT_INVOICE_BATCH, /if \(existingInvoiceId\) \{/);
  assert.match(
    IMPORT_INVOICE_BATCH,
    /existingInvoiceId = existingMapping\?\.invoiceId \?\? orphanedInvoice\?\.id \?\? null/,
  );

  // No branch inside the update path may still reach for existingMapping.invoiceId, or an adopted
  // orphan would update nothing.
  const updateBranch = IMPORT_INVOICE_BATCH.slice(
    IMPORT_INVOICE_BATCH.indexOf('if (existingInvoiceId) {'),
    IMPORT_INVOICE_BATCH.indexOf('.insert(invoices)'),
  );
  assert.ok(updateBranch.length > 0);
  assert.equal(
    updateBranch.includes('existingMapping.invoiceId'),
    false,
    'the update path still depends on a mapping row that an adopted orphan does not have',
  );
});

test('adopting an orphan rebuilds the mapping it was missing', () => {
  const updateBranch = IMPORT_INVOICE_BATCH.slice(
    IMPORT_INVOICE_BATCH.indexOf('if (existingInvoiceId) {'),
    IMPORT_INVOICE_BATCH.indexOf('.insert(invoices)'),
  );

  assert.match(updateBranch, /upsertInvoiceMapping\(ctx, existingInvoiceId, remote\.invoiceId, 'synced'/);
  assert.match(updateBranch, /restored its missing Xero mapping/);
});

test('the orphan lookup is skipped when a mapping already answers the question', () => {
  assert.match(IMPORT_INVOICE_BATCH, /const orphanedInvoice = existingMapping\s*\n?\s*\?\s*null/);
});

test('conflict detection uses whichever prior invoice number is known', () => {
  assert.match(
    IMPORT_INVOICE_BATCH,
    /knownInvoiceNumber =\s*\n?\s*existingMapping\?\.xeroInvoiceNumber \?\? orphanedInvoice\?\.xeroInvoiceNumber \?\? null/,
  );
  assert.match(IMPORT_INVOICE_BATCH, /\{ invoiceNumber: knownInvoiceNumber, amountCents: financials\.amountCents \}/);
});
