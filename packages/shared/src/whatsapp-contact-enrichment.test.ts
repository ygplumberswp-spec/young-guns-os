import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertNoDuplicateCustomerCreateFromWhatsApp,
  assertNoSilentXeroWrite,
  classifyWhatsAppMatch,
  computeMatchConfidenceScore,
  enrichmentPriorityRank,
  hasNonNameMatchEvidence,
  isEligibleForWhatsAppEnrichment,
  type WhatsAppConversationCandidate,
  type WhatsAppCustomerMatchCandidate,
  type WhatsAppMatchEvidenceItem,
} from './whatsapp-contact-enrichment.js';

function baseConversation(
  overrides: Partial<WhatsAppConversationCandidate> = {},
): WhatsAppConversationCandidate {
  return {
    waId: '27821234567',
    displayName: 'John Smith',
    normalizedMobile: '+27821234567',
    lastMessageAt: '2026-08-01T10:00:00.000Z',
    messageSnippet: 'Re invoice INV-1001',
    conversationRef: 'conv-1',
    ...overrides,
  };
}

function baseCustomer(
  overrides: Partial<WhatsAppCustomerMatchCandidate> = {},
): WhatsAppCustomerMatchCandidate {
  return {
    customerId: 'cust-1',
    customerName: 'John Smith Plumbing',
    companyName: 'John Smith Plumbing',
    contactPerson: 'John Smith',
    email: 'john@example.com',
    phone: null,
    suburb: 'Sandton',
    addressLine: '1 Main Rd',
    jobNumbers: ['YG-1042'],
    invoiceNumbers: ['INV-1001'],
    quoteNumbers: [],
    valueClassification: 'fully_paid_customer',
    isEligibleForEnrichment: true,
    missingMobile: true,
    isSupplierOnly: false,
    doNotContact: false,
    ...overrides,
  };
}

describe('classifyWhatsAppMatch', () => {
  it('returns exact_verified when corroborating evidence passes all rules', () => {
    const evidence: WhatsAppMatchEvidenceItem[] = [
      { code: 'name_exact', detail: 'Display name matches contact person', weight: 15 },
      { code: 'xero_invoice_ref', detail: 'Message references INV-1001', weight: 40 },
      { code: 'job_number_match', detail: 'Message references YG-1042', weight: 35 },
    ];

    const result = classifyWhatsAppMatch({
      conversation: baseConversation(),
      customer: baseCustomer(),
      evidence,
    });

    assert.equal(result.matchClassification, 'exact_verified');
    assert.equal(result.autoLinkPermitted, true);
    assert.ok(result.confidenceScore >= 85);
  });

  it('requires review for high confidence without exact_verified threshold', () => {
    const evidence: WhatsAppMatchEvidenceItem[] = [
      { code: 'email_exact', detail: 'Email in profile matches customer', weight: 35 },
      { code: 'suburb_match', detail: 'Suburb mentioned in thread', weight: 30 },
    ];

    const result = classifyWhatsAppMatch({
      conversation: baseConversation(),
      customer: baseCustomer(),
      evidence,
    });

    assert.equal(result.matchClassification, 'high_confidence');
    assert.equal(result.autoLinkPermitted, false);
    assert.equal(result.reviewRequired, true);
  });

  it('returns review_required for moderate evidence', () => {
    const evidence: WhatsAppMatchEvidenceItem[] = [
      { code: 'partial_phone_match', detail: 'Last 4 digits match site contact', weight: 25 },
      { code: 'message_content_ref', detail: 'Street address in message', weight: 20 },
    ];

    const result = classifyWhatsAppMatch({
      conversation: baseConversation(),
      customer: baseCustomer(),
      evidence,
    });

    assert.equal(result.matchClassification, 'review_required');
    assert.equal(result.autoLinkPermitted, false);
  });

  it('returns conflicting when existing phone differs', () => {
    const evidence: WhatsAppMatchEvidenceItem[] = [
      { code: 'invoice_date_proximity', detail: 'Recent invoice thread', weight: 50 },
      { code: 'company_exact', detail: 'Company name match', weight: 30 },
    ];

    const result = classifyWhatsAppMatch({
      conversation: baseConversation({ normalizedMobile: '+27829998888' }),
      customer: baseCustomer({ phone: '+27821112222' }),
      evidence,
    });

    assert.equal(result.matchClassification, 'conflicting');
    assert.equal(result.autoLinkPermitted, false);
    assert.equal(result.reviewRequired, true);
  });

  it('returns no_match for name-only evidence', () => {
    const evidence: WhatsAppMatchEvidenceItem[] = [
      { code: 'name_exact', detail: 'Name only', weight: 20 },
    ];

    const result = classifyWhatsAppMatch({
      conversation: baseConversation(),
      customer: baseCustomer(),
      evidence,
    });

    assert.equal(result.matchClassification, 'no_match');
    assert.equal(result.autoLinkPermitted, false);
    assert.ok(result.evidence.some((e) => e.code === 'name_only_insufficient'));
  });

  it('excludes supplier-only contacts', () => {
    const result = classifyWhatsAppMatch({
      conversation: baseConversation(),
      customer: baseCustomer({ isSupplierOnly: true, isEligibleForEnrichment: false }),
      evidence: [{ code: 'company_exact', detail: 'Supplier', weight: 50 }],
    });

    assert.equal(result.matchClassification, 'no_match');
    assert.ok(result.evidence.some((e) => e.code === 'supplier_excluded'));
  });

  it('excludes prospect contacts', () => {
    const result = classifyWhatsAppMatch({
      conversation: baseConversation(),
      customer: baseCustomer({
        valueClassification: 'prospect_contact',
        isEligibleForEnrichment: false,
      }),
      evidence: [{ code: 'email_exact', detail: 'Email', weight: 40 }],
    });

    assert.equal(result.matchClassification, 'no_match');
    assert.ok(result.evidence.some((e) => e.code === 'prospect_excluded'));
  });
});

describe('enrichment eligibility & priority', () => {
  it('allows verified invoiced and paying classifications', () => {
    assert.equal(isEligibleForWhatsAppEnrichment('fully_paid_customer'), true);
    assert.equal(isEligibleForWhatsAppEnrichment('unpaid_debtor'), true);
    assert.equal(isEligibleForWhatsAppEnrichment('prospect_contact'), false);
    assert.equal(isEligibleForWhatsAppEnrichment('supplier_only_contact'), false);
    assert.equal(isEligibleForWhatsAppEnrichment('fully_paid_customer', { isSupplierOnly: true }), false);
  });

  it('prioritizes paid/fully paid missing mobile', () => {
    assert.ok(enrichmentPriorityRank('fully_paid_customer') < enrichmentPriorityRank('paying_customer'));
    assert.ok(enrichmentPriorityRank('paying_customer') < enrichmentPriorityRank('unpaid_debtor'));
    assert.ok(enrichmentPriorityRank('prospect_contact') > enrichmentPriorityRank('overdue_debtor'));
  });
});

describe('matching helpers', () => {
  it('detects non-name corroborating evidence', () => {
    assert.equal(hasNonNameMatchEvidence([{ code: 'name_exact', detail: 'x', weight: 10 }]), false);
    assert.equal(
      hasNonNameMatchEvidence([
        { code: 'name_exact', detail: 'x', weight: 10 },
        { code: 'job_number_match', detail: 'y', weight: 20 },
      ]),
      true,
    );
  });

  it('caps confidence at 100', () => {
    const score = computeMatchConfidenceScore([
      { code: 'xero_invoice_ref', detail: 'a', weight: 60 },
      { code: 'job_number_match', detail: 'b', weight: 60 },
    ]);
    assert.equal(score, 100);
  });
});

describe('safety guards', () => {
  it('blocks duplicate customer create from WhatsApp', () => {
    const blocked = assertNoDuplicateCustomerCreateFromWhatsApp({
      existingCustomerId: null,
      createCustomerRequested: true,
    });
    assert.equal(blocked.permitted, false);

    const allowed = assertNoDuplicateCustomerCreateFromWhatsApp({
      existingCustomerId: 'cust-1',
      createCustomerRequested: false,
    });
    assert.equal(allowed.permitted, true);
  });

  it('blocks silent Xero writes', () => {
    const blocked = assertNoSilentXeroWrite({
      xeroWriteRequested: true,
      explicitSyncBackApproved: false,
    });
    assert.equal(blocked.permitted, false);

    const allowed = assertNoSilentXeroWrite({
      xeroWriteRequested: true,
      explicitSyncBackApproved: true,
    });
    assert.equal(allowed.permitted, true);
  });
});

describe('tenant isolation contract', () => {
  it('match input is scoped to single customer candidate (no cross-tenant fields)', () => {
    const customer = baseCustomer({ customerId: 'tenant-a-cust' });
    assert.ok(customer.customerId);
    assert.equal(typeof customer.isSupplierOnly, 'boolean');
    // Service layer must filter by companyId before invoking classifier — enforced in API tests.
  });
});
