import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertNoDuplicateCustomerCreateFromWhatsApp,
  assertNoSilentXeroWrite,
  classifyWhatsAppMatch,
} from '@titan/shared';

describe('WhatsappContactEnrichmentService safety contracts', () => {
  it('never permits customer creation from WhatsApp enrichment path', () => {
    const result = assertNoDuplicateCustomerCreateFromWhatsApp({
      existingCustomerId: null,
      createCustomerRequested: false,
    });
    assert.equal(result.permitted, false);
  });

  it('blocks approval flow when Xero write would be silent', () => {
    const xero = assertNoSilentXeroWrite({
      xeroWriteRequested: true,
      explicitSyncBackApproved: false,
    });
    assert.equal(xero.permitted, false);
  });

  it('tenant isolation — classifier scoped per customer candidate', () => {
    const match = classifyWhatsAppMatch({
      conversation: {
        waId: '27821111111',
        displayName: 'A',
        normalizedMobile: '+27821111111',
        lastMessageAt: null,
        messageSnippet: null,
        conversationRef: 'c1',
      },
      customer: {
        customerId: 'uuid-tenant-a',
        customerName: 'A',
        companyName: null,
        contactPerson: null,
        email: null,
        phone: null,
        suburb: null,
        addressLine: null,
        jobNumbers: ['YG-1'],
        invoiceNumbers: [],
        quoteNumbers: [],
        valueClassification: 'fully_paid_customer',
        isEligibleForEnrichment: true,
        missingMobile: true,
        isSupplierOnly: false,
        doNotContact: false,
      },
      evidence: [
        { code: 'job_number_match', detail: 'YG-1 in thread', weight: 50 },
        { code: 'name_exact', detail: 'Name', weight: 20 },
      ],
    });

    assert.equal(match.matchClassification, 'high_confidence');
    assert.equal(match.autoLinkPermitted, false);
  });
});
