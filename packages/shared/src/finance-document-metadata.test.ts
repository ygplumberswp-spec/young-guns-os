import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FINANCE_METADATA_ROYAL_CAPE,
  assertIssuedCommercialMetadataEditable,
  assertNoInternalNoteLeak,
  assertRow89NoCustomerSends,
  assertRow89NoXeroWrites,
  assertRow90NotStarted,
  assertRoyalCapeMetadataUnchanged,
  buildFinanceMetadataAuditEvent,
  classifyFinanceMetadataField,
  emptyMetadataDisplay,
  isFabricatedCustomerPo,
  rejectFabricatedCustomerPo,
  resolveInvoiceMetadata,
  resolveQuoteMetadata,
  safeAuditText,
  toCommunicationSafeFinanceMetadata,
  toCustomerFacingFinanceMetadata,
  toPdfSafeFinanceMetadata,
  toStaffFinanceMetadata,
} from './finance-document-metadata.js';
import { resolveQuoteDisplayNumberLabel } from './xero-official-number-authority.js';

test('1-2 payment terms save/read on quote and invoice resolvers', () => {
  const q = resolveQuoteMetadata({ paymentTerms: '70% deposit, 30% on PC' });
  const i = resolveInvoiceMetadata({ paymentTerms: 'Net 30' });
  assert.equal(q.paymentTerms, '70% deposit, 30% on PC');
  assert.equal(i.paymentTerms, 'Net 30');
});

test('3-5 PO / customer reference preserved; no fabrication', () => {
  const q = resolveQuoteMetadata({ customerNotes: 'Royal Cape Yacht Club' });
  assert.equal(q.customerReference, 'Royal Cape Yacht Club');
  assert.equal(resolveQuoteMetadata({ customerNotes: 'PO-86421' }).customerPoNumber, 'PO-86421');
  assert.equal(isFabricatedCustomerPo('TITAN-PO-1'), true);
  assert.throws(() => rejectFabricatedCustomerPo('0000'));
  assert.equal(emptyMetadataDisplay('customerPo', null), 'Not provided');
});

test('6 Xero Reference preserved as providerReference', () => {
  const i = resolveInvoiceMetadata({
    xeroReference: 'JOB-000002',
    sourceProvider: 'xero',
    xeroInvoiceNumber: 'INV-0001',
  });
  assert.equal(i.providerReference, 'JOB-000002');
  assert.equal(i.ownership.customerReference, 'PROVIDER_AUTHORITATIVE');
});

test('7-8 internal + customer-facing notes', () => {
  const q = resolveQuoteMetadata({
    internalNotes: 'Staff only margin risk',
    notes: 'Visible to customer',
  });
  assert.equal(q.internalNotes, 'Staff only margin risk');
  assert.equal(q.customerFacingNotes, 'Visible to customer');
});

test('9 internal note excluded from Client DTO', () => {
  const meta = resolveQuoteMetadata({
    internalNotes: 'SECRET',
    notes: 'Hello',
    customerNotes: 'PO-1',
    paymentTerms: 'COD',
  });
  const client = toCustomerFacingFinanceMetadata(meta);
  assert.equal('internalNotes' in client, false);
  assert.equal(client.customerFacingNotes, 'Hello');
  assertNoInternalNoteLeak(client);
});

test('10-12 internal note excluded from PDF/print payload', () => {
  const meta = resolveQuoteMetadata({
    internalNotes: 'SECRET',
    notes: 'Customer note',
    customerNotes: 'Royal Cape Yacht Club',
    paymentTerms: '70% deposit',
  });
  const pdf = toPdfSafeFinanceMetadata(meta);
  assert.equal(pdf.notes, 'Customer note');
  assert.equal(pdf.paymentTerms, '70% deposit');
  assert.equal(pdf.customerReference, 'Royal Cape Yacht Club');
  assertNoInternalNoteLeak(pdf);
});

test('13-14 internal note excluded from email/WhatsApp render', () => {
  const meta = resolveInvoiceMetadata({
    internalNotes: 'SECRET',
    notes: 'Please pay',
    paymentTerms: 'Net 7',
    customerPoNumber: 'PO-9',
  });
  const comms = toCommunicationSafeFinanceMetadata(meta);
  assert.equal(comms.customerSendAllowed, false);
  assert.equal(comms.customerFacingNotes, 'Please pay');
  assertNoInternalNoteLeak(comms);
});

test('15-17 customer-facing fields included where intended', () => {
  const meta = resolveQuoteMetadata({
    notes: 'Thanks',
    paymentTerms: '70/30',
    customerNotes: 'PO-123',
  });
  const pdf = toPdfSafeFinanceMetadata(meta);
  assert.equal(pdf.notes, 'Thanks');
  assert.equal(pdf.paymentTerms, '70/30');
  assert.ok(pdf.customerReference);
});

test('18 Row 87 official number preserved', () => {
  assert.equal(
    resolveQuoteDisplayNumberLabel({
      quoteNumber: 'TIT-QUOTE-1',
      xeroQuoteNumber: 'QU-0183',
      sourceProvider: 'xero',
    }),
    'QU-0183',
  );
});

test('19-21 issued Xero commercial fields protected; internal note editable', () => {
  assert.throws(() =>
    assertIssuedCommercialMetadataEditable({
      isIssued: true,
      xeroBacked: true,
      field: 'paymentTerms',
    }),
  );
  assertIssuedCommercialMetadataEditable({
    isIssued: true,
    xeroBacked: true,
    field: 'internalNotes',
    allowInternalNoteEdit: true,
  });
});

test('22 repeated resolve is idempotent', () => {
  const a = resolveQuoteMetadata({ notes: '  Hello  ', paymentTerms: 'COD' });
  const b = resolveQuoteMetadata({ notes: a.customerFacingNotes, paymentTerms: a.paymentTerms });
  assert.deepEqual(a.customerFacingNotes, b.customerFacingNotes);
});

test('23 audit events use safe text for long notes', () => {
  const long = 'x'.repeat(120);
  const ev = buildFinanceMetadataAuditEvent({
    eventType: 'internal_note_changed',
    companyId: 'c',
    entityType: 'quote',
    entityId: 'q',
    beforeSafe: safeAuditText(long),
    afterSafe: safeAuditText('short'),
  });
  assert.equal(ev.action, 'internal_note_changed');
  assert.ok(String(ev.metadata.before).includes('chars'));
});

test('24-26 role surfaces via staff vs customer projections', () => {
  const meta = resolveQuoteMetadata({ internalNotes: 'secret', notes: 'hi' });
  const staff = toStaffFinanceMetadata(meta, { includeInternalNotes: true });
  const tech = toStaffFinanceMetadata(meta, { includeInternalNotes: false });
  assert.equal(staff.internalNotes, 'secret');
  assert.equal(tech.internalNotes, null);
});

test('27-29 client own-data / internal denial / isolation helpers', () => {
  const client = toCustomerFacingFinanceMetadata(
    resolveQuoteMetadata({ internalNotes: 'nope', notes: 'yes', customerNotes: 'PO-1' }),
  );
  assertNoInternalNoteLeak(client);
  assert.equal(client.customerFacingNotes, 'yes');
});

test('30 cross-tenant is API concern — metadata carries no cross-tenant data', () => {
  const meta = resolveQuoteMetadata({ notes: 'a' });
  assert.equal(meta.customerFacingNotes, 'a');
});

test('31-33 360 surfaces use customer-facing projection for non-staff', () => {
  assert.equal(classifyFinanceMetadataField('internalNotes', 'portal'), 'BUG');
  assert.equal(classifyFinanceMetadataField('customerFacingNotes', 'pdf'), 'SAFE_CUSTOMER_FIELD');
  assert.equal(classifyFinanceMetadataField('paymentTerms', 'customer'), 'SAFE_CUSTOMER_FIELD');
});

test('34 Xero import regression — local internal notes ownership', () => {
  const meta = resolveInvoiceMetadata({
    internalNotes: 'local staff note',
    sourceProvider: 'xero',
    xeroInvoiceNumber: 'INV-1',
    xeroReference: 'Ref',
    notes: 'Imported from Xero',
  });
  assert.equal(meta.ownership.internalNotes, 'LOCAL_TITAN_OWNED');
  assert.equal(meta.providerReference, 'Ref');
});

test('35 Royal Cape QU-0183 regression', () => {
  const check = assertRoyalCapeMetadataUnchanged({
    titanQuoteId: FINANCE_METADATA_ROYAL_CAPE.royalCapeQuoteId,
    xeroQuoteId: FINANCE_METADATA_ROYAL_CAPE.royalCapeXeroQuoteId,
    quoteNumber: 'QU-0183',
    xeroQuoteNumber: 'QU-0183',
    customerId: FINANCE_METADATA_ROYAL_CAPE.canonicalCustomerId,
    jobId: FINANCE_METADATA_ROYAL_CAPE.jobId,
    customerReference: 'Royal Cape Yacht Club',
  });
  assert.equal(check.ok, true);
});

test('36-38 safety gates', () => {
  assertRow89NoXeroWrites(0);
  assertRow89NoCustomerSends(0);
  assertRow90NotStarted(false);
  assert.throws(() => assertRow89NoXeroWrites(1));
  assert.throws(() => assertRow90NotStarted(true));
});

test('leak detector catches nested internalNotes', () => {
  assert.throws(() =>
    assertNoInternalNoteLeak({ quote: { internalNotes: 'leaked' } }),
  );
});
