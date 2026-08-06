import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PORTAL_EXPANSION_FORBIDDEN_FIELDS,
  assertNoForbiddenPortalExpansionFields,
  buildPortalSafeInvoiceDisplayNumber,
  canStaffManagePortalDocumentShares,
  canStaffReadPortalDocumentShares,
  derivePortalSafePaymentStatus,
  isPortalSafeCommunicationVisibility,
  summarizePortalSafePaymentStatuses,
  toPortalSafeQuoteLine,
} from './portal-expansion.js';

describe('portal expansion customer-safe contracts', () => {
  it('blocks Technician/Client from staff document-share management', () => {
    assert.equal(canStaffManagePortalDocumentShares({ roleName: 'Technician', permissions: ['*', 'documents:write'] }), false);
    assert.equal(canStaffReadPortalDocumentShares({ roleName: 'Client', permissions: ['portal:read'] }), false);
    assert.equal(canStaffManagePortalDocumentShares({ roleName: 'Manager', permissions: ['documents:write'] }), true);
  });
  it('allowlists only customer_visible communication visibility', () => {
    assert.equal(isPortalSafeCommunicationVisibility('customer_visible'), true);
    assert.equal(isPortalSafeCommunicationVisibility('internal_note'), false);
  });
  it('derives customer-facing payment status without provider internals', () => {
    assert.equal(derivePortalSafePaymentStatus({ status: 'sent', outstandingCents: 1000, amountPaidCents: 0, isOverdue: false }), 'unpaid');
    assert.equal(derivePortalSafePaymentStatus({ status: 'partial', outstandingCents: 500, amountPaidCents: 500, isOverdue: false }), 'partial');
    assert.equal(derivePortalSafePaymentStatus({ status: 'paid', outstandingCents: 0, amountPaidCents: 1000, isOverdue: false }), 'paid');
    assert.equal(derivePortalSafePaymentStatus({ status: 'sent', outstandingCents: 1000, amountPaidCents: 0, isOverdue: true }), 'overdue');
    assert.deepEqual(summarizePortalSafePaymentStatuses([{ paymentStatus: 'unpaid' }, { paymentStatus: 'paid' }, { paymentStatus: 'overdue' }, { paymentStatus: 'partial' }]), { unpaidCount: 1, partialCount: 1, paidCount: 1, overdueCount: 1 });
  });
  it('builds customer invoice display numbers without Xero internals', () => {
    assert.equal(buildPortalSafeInvoiceDisplayNumber({ invoiceNumber: 'INV-100', title: 'Service' }), 'INV-100');
  });
  it('maps quote lines without cost or margin fields', () => {
    const line = toPortalSafeQuoteLine({ id: 'line-1', position: 1, category: 'labour', description: 'Callout', quantity: '1', unitPriceCents: 50000, lineSubtotalCents: 50000, lineVatCents: 7500, lineTotalCents: 57500, isOptional: false });
    assert.deepEqual(assertNoForbiddenPortalExpansionFields(line), []);
  });
  it('detects forbidden finance/internal fields in nested payloads', () => {
    const violations = assertNoForbiddenPortalExpansionFields({ invoice: { displayNumber: 'INV-1', marginBps: 1200, payment: { xeroPaymentId: 'xero-1', amountCents: 100 } } });
    assert.ok(violations.some((v) => v.endsWith('marginBps')));
    assert.ok(PORTAL_EXPANSION_FORBIDDEN_FIELDS.includes('yocoPaymentId'));
  });
});
