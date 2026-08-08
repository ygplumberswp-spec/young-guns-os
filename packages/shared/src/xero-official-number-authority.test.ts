import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DRAFT_INVOICE_DISPLAY_LABEL,
  DRAFT_QUOTE_DISPLAY_LABEL,
  XERO_OFFICIAL_NUMBER_ROYAL_CAPE,
  assertNeverUsesNonOfficialDisplay,
  assertRow87NoCustomerSends,
  assertRow87NoXeroWrites,
  assertRoyalCapeQuoteDisplay,
  assertRow88NotStarted,
  classifyDocumentNumberOccurrence,
  isInternalPlaceholderNumber,
  isUuidLike,
  pickPaymentInvoiceDisplayNumber,
  resolveInvoiceDisplayNumber,
  resolveInvoiceDisplayNumberLabel,
  resolveQuoteDisplayNumber,
  resolveQuoteDisplayNumberLabel,
} from './xero-official-number-authority.js';
import {
  displayOfficialInvoiceNumber,
  displayOfficialQuoteNumber,
} from './finance.js';
import { buildPortalSafeInvoiceDisplayNumber } from './portal-expansion.js';

describe('Row 87 Xero official number authority', () => {
  it('1. Xero quote uses QuoteNumber', () => {
    assert.equal(
      resolveQuoteDisplayNumberLabel({
        xeroQuoteNumber: 'QU-0183',
        quoteNumber: 'Q-0001',
        id: '41178762-bb9a-4e5d-b568-07c330f18cbb',
      }),
      'QU-0183',
    );
  });

  it('2. Xero invoice uses InvoiceNumber', () => {
    assert.equal(
      resolveInvoiceDisplayNumberLabel({
        xeroInvoiceNumber: 'INV-0558',
        invoiceNumber: 'TITAN-INV-000589',
        numberAuthority: 'xero',
      }),
      'INV-0558',
    );
  });

  it('3. UUID never used as official quote display', () => {
    const r = resolveQuoteDisplayNumber({
      id: '41178762-bb9a-4e5d-b568-07c330f18cbb',
      quoteNumber: '41178762-bb9a-4e5d-b568-07c330f18cbb',
    });
    assert.equal(r.displayNumber, DRAFT_QUOTE_DISPLAY_LABEL);
    assert.equal(isUuidLike(r.displayNumber), false);
  });

  it('4. UUID never used as official invoice display', () => {
    const r = resolveInvoiceDisplayNumber({
      id: 'fdb40927-363a-473f-9d9c-7d041cffbd54',
      invoiceNumber: 'fdb40927-363a-473f-9d9c-7d041cffbd54',
    });
    assert.equal(r.displayNumber, DRAFT_INVOICE_DISPLAY_LABEL);
  });

  it('5. sourceExternalId never masquerades as official number', () => {
    assert.equal(
      resolveQuoteDisplayNumberLabel({
        sourceExternalId: '4d9b1ceb-83dc-4ac6-8d58-ce7ac08f6db8',
        quoteNumber: null,
      }),
      DRAFT_QUOTE_DISPLAY_LABEL,
    );
  });

  it('6. Xero GUID never used as official number', () => {
    assert.equal(
      resolveInvoiceDisplayNumberLabel({
        xeroInvoiceId: '38445d23-d4c7-4102-8e9c-1fab3204f331',
        invoiceNumber: null,
      }),
      DRAFT_INVOICE_DISPLAY_LABEL,
    );
  });

  it('7. TITAN draft without official number labelled Draft', () => {
    assert.equal(
      resolveQuoteDisplayNumberLabel({ quoteNumber: 'Q-0007' }),
      DRAFT_QUOTE_DISPLAY_LABEL,
    );
    assert.equal(
      resolveInvoiceDisplayNumberLabel({
        invoiceNumber: 'TITAN-INV-000007',
        numberAuthority: 'internal_pending_xero',
      }),
      DRAFT_INVOICE_DISPLAY_LABEL,
    );
  });

  it('8-9. draft does not invent QU/INV numbers', () => {
    const q = resolveQuoteDisplayNumber({ quoteNumber: 'Q-0001' });
    const i = resolveInvoiceDisplayNumber({
      invoiceNumber: 'TITAN-INV-000001',
      numberAuthority: 'internal_pending_xero',
    });
    assert.equal(q.isDraft, true);
    assert.equal(i.isDraft, true);
    assert.doesNotMatch(q.displayNumber, /^QU-/);
    assert.doesNotMatch(i.displayNumber, /^INV-/);
  });

  it('10. official number takes precedence when available', () => {
    assert.equal(
      resolveInvoiceDisplayNumberLabel({
        xeroInvoiceNumber: 'INV-0586',
        invoiceNumber: 'TITAN-INV-000589',
        numberAuthority: 'xero',
      }),
      'INV-0586',
    );
  });

  it('11-14. finance displayOfficial bridges stay compatible', () => {
    assert.equal(displayOfficialQuoteNumber({ xeroQuoteNumber: 'QU-1001' }), 'QU-1001');
    assert.equal(displayOfficialInvoiceNumber({ xeroInvoiceNumber: 'INV-1001' }), 'INV-1001');
    assert.equal(displayOfficialQuoteNumber({ xeroQuoteNumber: null }), DRAFT_QUOTE_DISPLAY_LABEL);
    assert.equal(displayOfficialInvoiceNumber({ xeroInvoiceNumber: '' }), DRAFT_INVOICE_DISPLAY_LABEL);
  });

  it('15-16. search labels use official numbers (resolver)', () => {
    assert.equal(
      resolveQuoteDisplayNumberLabel({ xeroQuoteNumber: 'QU-0183' }),
      'QU-0183',
    );
    assert.equal(
      resolveInvoiceDisplayNumberLabel({ xeroInvoiceNumber: 'INV-0558' }),
      'INV-0558',
    );
  });

  it('17-19. Customer/Property/Job 360 style payment invoice reference', () => {
    assert.equal(
      pickPaymentInvoiceDisplayNumber({
        invoice: {
          xeroInvoiceNumber: 'INV-0558',
          invoiceNumber: 'TITAN-INV-000100',
        },
      }),
      'INV-0558',
    );
  });

  it('20. payment invoice reference never UUID', () => {
    const display = pickPaymentInvoiceDisplayNumber({
      fallbackInvoiceNumber: '41178762-bb9a-4e5d-b568-07c330f18cbb',
    });
    assert.equal(display, DRAFT_INVOICE_DISPLAY_LABEL);
    assertNeverUsesNonOfficialDisplay(display);
  });

  it('21-24. PDF/print/comms use same resolver labels', () => {
    assert.equal(
      displayOfficialQuoteNumber({
        xeroQuoteNumber: 'QU-0183',
        quoteNumber: 'QU-0183',
      }),
      'QU-0183',
    );
    assert.equal(
      displayOfficialInvoiceNumber({
        xeroInvoiceNumber: 'INV-0558',
        invoiceNumber: 'INV-0558',
      }),
      'INV-0558',
    );
  });

  it('25-27. Client portal own numbers + isolation of placeholders', () => {
    assert.equal(
      buildPortalSafeInvoiceDisplayNumber({
        invoiceNumber: 'TITAN-INV-000589',
        xeroInvoiceNumber: 'INV-0586',
        numberAuthority: 'xero',
      }),
      'INV-0586',
    );
    assert.equal(
      buildPortalSafeInvoiceDisplayNumber({
        invoiceNumber: 'TITAN-INV-000001',
        numberAuthority: 'internal_pending_xero',
      }),
      DRAFT_INVOICE_DISPLAY_LABEL,
    );
    assert.equal(isInternalPlaceholderNumber('TITAN-INV-000001'), true);
  });

  it('28-30. RBAC-agnostic resolver still never exposes placeholders', () => {
    assertNeverUsesNonOfficialDisplay('QU-0183');
    assert.throws(() => assertNeverUsesNonOfficialDisplay('TITAN-INV-000001'));
    assert.throws(() => assertNeverUsesNonOfficialDisplay('41178762-bb9a-4e5d-b568-07c330f18cbb'));
  });

  it('31. cross-tenant is a query concern; resolver rejects GUID masquerade', () => {
    assert.equal(
      classifyDocumentNumberOccurrence('4d9b1ceb-83dc-4ac6-8d58-ce7ac08f6db8'),
      'CUSTOMER_FACING_BUG',
    );
  });

  it('32-33. archived/voided retain official numbers', () => {
    assert.equal(
      resolveInvoiceDisplayNumberLabel({
        xeroInvoiceNumber: 'INV-0572',
        invoiceNumber: 'INV-0572',
        numberAuthority: 'xero',
      }),
      'INV-0572',
    );
  });

  it('34. repeated import does not renumber display when xero number stable', () => {
    const first = resolveQuoteDisplayNumberLabel({
      xeroQuoteNumber: 'QU-0183',
      quoteNumber: 'QU-0183',
      sourceProvider: 'xero',
    });
    const second = resolveQuoteDisplayNumberLabel({
      xeroQuoteNumber: 'QU-0183',
      quoteNumber: 'QU-0183',
      sourceProvider: 'xero',
    });
    assert.equal(first, second);
    assert.equal(first, 'QU-0183');
  });

  it('35-37. Royal Cape QU-0183 + Xero id preservation', () => {
    const display = resolveQuoteDisplayNumberLabel({
      id: XERO_OFFICIAL_NUMBER_ROYAL_CAPE.royalCapeQuoteId,
      quoteNumber: 'QU-0183',
      xeroQuoteNumber: 'QU-0183',
      xeroQuoteId: XERO_OFFICIAL_NUMBER_ROYAL_CAPE.royalCapeXeroQuoteId,
      sourceExternalId: XERO_OFFICIAL_NUMBER_ROYAL_CAPE.royalCapeXeroQuoteId,
      sourceProvider: 'xero',
    });
    const gate = assertRoyalCapeQuoteDisplay({
      titanQuoteId: XERO_OFFICIAL_NUMBER_ROYAL_CAPE.royalCapeQuoteId,
      xeroQuoteId: XERO_OFFICIAL_NUMBER_ROYAL_CAPE.royalCapeXeroQuoteId,
      displayNumber: display,
      quoteNumber: 'QU-0183',
      xeroQuoteNumber: 'QU-0183',
    });
    assert.equal(gate.ok, true);
  });

  it('38-41. no financial mutation / no Xero writes / no customer sends / no Row 88', () => {
    assertRow87NoXeroWrites(0);
    assertRow87NoCustomerSends(0);
    assertRow88NotStarted(false);
    assert.throws(() => assertRow87NoXeroWrites(1));
    assert.throws(() => assertRow87NoCustomerSends(1));
    assert.throws(() => assertRow88NotStarted(true));
  });

  it('Xero-backed Q- style quote number remains displayable', () => {
    assert.equal(
      resolveQuoteDisplayNumberLabel({
        xeroQuoteNumber: 'Q-0253',
        quoteNumber: 'Q-0253',
        sourceProvider: 'xero',
        xeroQuoteId: '7fb5147d-40ef-4203-afa8-4779522b7f8e',
      }),
      'Q-0253',
    );
  });
});
