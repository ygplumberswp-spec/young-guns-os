import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyBuyerFromEvidence,
  isMarketingConsentGranted,
  isMarketingSuppressed,
  HUMAN_QUALITY_CONTENT_STANDARD,
} from './marketing-eligibility.js';

describe('classifyBuyerFromEvidence (UX-H / Decision 3)', () => {
  it('does not treat contact existence as buyer proof', () => {
    const result = classifyBuyerFromEvidence({
      customerId: 'c1',
      customerName: 'Ada',
      customerStatus: 'active',
      isSupplierOnly: false,
      xeroContactId: null,
      invoices: [],
    });
    assert.equal(result.primaryClassification, 'contact_record');
    assert.equal(result.isPaidBuyer, false);
    assert.equal(result.isAccrecBuyer, false);
  });

  it('excludes draft and cancelled invoices from buyer proof', () => {
    const result = classifyBuyerFromEvidence({
      customerId: 'c1',
      customerName: 'Ada',
      customerStatus: 'active',
      isSupplierOnly: false,
      xeroContactId: 'x1',
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
    assert.equal(result.isAccrecBuyer, false);
    assert.equal(result.isPaidBuyer, false);
    assert.equal(result.primaryClassification, 'uncertain_manual_review');
    assert.ok(result.evidence.some((e) => e.code === 'excluded_draft'));
    assert.ok(result.evidence.some((e) => e.code === 'excluded_void_cancelled'));
  });

  it('separates unpaid ACCREC buyer from paid buyer', () => {
    const result = classifyBuyerFromEvidence({
      customerId: 'c1',
      customerName: 'Ada',
      customerStatus: 'active',
      isSupplierOnly: false,
      xeroContactId: null,
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
    assert.equal(result.primaryClassification, 'accrec_buyer');
    assert.equal(result.isAccrecBuyer, true);
    assert.equal(result.isPaidBuyer, false);
  });

  it('classifies paid and repeat buyers from qualifying ACCREC evidence', () => {
    const paid = classifyBuyerFromEvidence({
      customerId: 'c1',
      customerName: 'Ada',
      customerStatus: 'active',
      isSupplierOnly: false,
      xeroContactId: 'x1',
      invoices: [
        {
          id: 'i1',
          invoiceNumber: 'INV-1',
          status: 'paid',
          amountCents: 5000,
          amountPaidCents: 5000,
          totalCents: 5000,
          issuedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });
    assert.equal(paid.primaryClassification, 'paid_buyer');
    assert.equal(paid.isPaidBuyer, true);

    const repeat = classifyBuyerFromEvidence({
      customerId: 'c1',
      customerName: 'Ada',
      customerStatus: 'active',
      isSupplierOnly: false,
      xeroContactId: 'x1',
      invoices: [
        {
          id: 'i1',
          invoiceNumber: 'INV-1',
          status: 'paid',
          amountCents: 5000,
          amountPaidCents: 5000,
          totalCents: 5000,
          issuedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'i2',
          invoiceNumber: 'INV-2',
          status: 'paid',
          amountCents: 3000,
          amountPaidCents: 3000,
          totalCents: 3000,
          issuedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });
    assert.equal(repeat.primaryClassification, 'repeat_buyer');
    assert.equal(repeat.isRepeatBuyer, true);
  });

  it('excludes supplier-only contacts', () => {
    const result = classifyBuyerFromEvidence({
      customerId: 'c1',
      customerName: 'Supplier Co',
      customerStatus: 'active',
      isSupplierOnly: true,
      xeroContactId: 'x1',
      invoices: [
        {
          id: 'i1',
          invoiceNumber: 'INV-1',
          status: 'paid',
          amountCents: 100,
          amountPaidCents: 100,
          totalCents: 100,
          issuedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });
    assert.equal(result.primaryClassification, 'supplier_only');
    assert.equal(result.isPaidBuyer, false);
  });
});

describe('marketing consent helpers', () => {
  it('treats missing/unknown as not consent', () => {
    assert.equal(isMarketingConsentGranted(undefined), false);
    assert.equal(isMarketingConsentGranted('unknown'), false);
    assert.equal(isMarketingConsentGranted('granted'), true);
  });

  it('treats opt-out states as suppressed', () => {
    assert.equal(isMarketingSuppressed('denied'), true);
    assert.equal(isMarketingSuppressed('withdrawn'), true);
    assert.equal(isMarketingSuppressed('do_not_contact'), true);
    assert.equal(isMarketingSuppressed('granted'), false);
  });
});

describe('Human-Quality Content Standard', () => {
  it('records Owner-approved future marketing requirements', () => {
    assert.ok(HUMAN_QUALITY_CONTENT_STANDARD.requirements.length >= 4);
    assert.match(HUMAN_QUALITY_CONTENT_STANDARD.requirements.join(' '), /Owner approval/);
  });
});
