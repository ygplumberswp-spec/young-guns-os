import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CUSTOMER_DUPLICATE_RECONCILIATION_CRC,
  assertConsentNotWeakened,
  assertCrcRowanNotDestructivelyMerged,
  assertCrcRowanRegression,
  assertNoFinancialDoubleCount,
  assertPreviewHashMatches,
  assertReconciliationLifecycleTransition,
  assertTechnicianDeniedDuplicateReconciliation,
  buildDuplicateReconciliationAuditActions,
  buildReconciliationPreviewHash,
  canAccessDuplicateReconciliation,
  canExecuteDuplicateReconciliation,
  classifyDuplicateCandidate,
  isCrcRowanPair,
  planSameCompanyDifferentPersonAction,
  planTrueDuplicateCanonicalization,
} from './customer-duplicate-reconciliation.js';
import {
  emptyCustomerMergeLinkCounts,
  type CustomerMergeLinkCounts,
} from './customer-duplicate-merge.js';

const emptyCounts = (): CustomerMergeLinkCounts => emptyCustomerMergeLinkCounts();

describe('Customer Duplicate Reconciliation (Row 85)', () => {
  it('flags same Xero Contact ID as high confidence without auto-merge', () => {
    const result = classifyDuplicateCandidate({
      leftCustomerId: 'a',
      rightCustomerId: 'b',
      leftName: 'Acme',
      rightName: 'Acme Pty',
      leftXeroContactIds: ['xero-1'],
      rightXeroContactIds: ['xero-1'],
    });
    assert.equal(result.confidenceLabel, 'HIGH_CONFIDENCE_DUPLICATE');
    assert.equal(result.autoMerge, false);
    assert.ok(result.matchSignals.some((s) => s.startsWith('same_xero')));
  });

  it('does not auto-merge different Xero IDs', () => {
    const result = classifyDuplicateCandidate({
      leftCustomerId: 'a',
      rightCustomerId: 'b',
      leftName: 'Acme',
      rightName: 'Acme',
      leftContactPerson: 'Alice',
      rightContactPerson: 'Bob',
      leftXeroContactIds: ['x1'],
      rightXeroContactIds: ['x2'],
    });
    assert.equal(result.confidenceLabel, 'SAME_COMPANY_DIFFERENT_CONTACT');
    assert.equal(result.blocksDestructiveMerge, true);
    assert.equal(result.autoMerge, false);
    assert.equal(
      planTrueDuplicateCanonicalization({
        leftXeroContactIds: ['x1'],
        rightXeroContactIds: ['x2'],
        resolutionAllowed: true,
      }).mode,
      'BLOCKED_XERO_CONFLICT',
    );
  });

  it('surfaces same normalized email / phone / VAT as candidates', () => {
    const email = classifyDuplicateCandidate({
      leftCustomerId: 'a',
      rightCustomerId: 'b',
      leftName: 'One',
      rightName: 'Two',
      leftEmail: 'Owner@Acme.co.za',
      rightEmail: 'owner@acme.co.za',
      leftXeroContactIds: [],
      rightXeroContactIds: [],
    });
    assert.equal(email.confidenceLabel, 'POSSIBLE_DUPLICATE');
    assert.ok(email.matchSignals.includes('exact_normalized_email'));

    const phone = classifyDuplicateCandidate({
      leftCustomerId: 'a',
      rightCustomerId: 'b',
      leftName: 'One',
      rightName: 'Two',
      leftPhone: '082 555 0101',
      rightPhone: '+27825550101',
      leftXeroContactIds: [],
      rightXeroContactIds: [],
    });
    assert.equal(phone.confidenceLabel, 'POSSIBLE_DUPLICATE');

    const vat = classifyDuplicateCandidate({
      leftCustomerId: 'a',
      rightCustomerId: 'b',
      leftName: 'One',
      rightName: 'Two',
      leftVat: 'VAT-123',
      rightVat: 'vat 123',
      leftXeroContactIds: [],
      rightXeroContactIds: [],
    });
    assert.equal(vat.confidenceLabel, 'HIGH_CONFIDENCE_DUPLICATE');
  });

  it('keeps fuzzy name alone and email-domain-alone weak', () => {
    const nameOnly = classifyDuplicateCandidate({
      leftCustomerId: 'a',
      rightCustomerId: 'b',
      leftName: 'CRC',
      rightName: 'CRC',
      leftXeroContactIds: [],
      rightXeroContactIds: [],
    });
    assert.equal(nameOnly.confidenceLabel, 'REVIEW_REQUIRED');
    assert.notEqual(nameOnly.suggestedResolution, 'TRUE_DUPLICATE_CANONICALIZE');

    const domain = classifyDuplicateCandidate({
      leftCustomerId: 'a',
      rightCustomerId: 'b',
      leftName: 'Alpha',
      rightName: 'Beta',
      leftEmail: 'a@company.co.za',
      rightEmail: 'b@company.co.za',
      leftXeroContactIds: [],
      rightXeroContactIds: [],
    });
    assert.equal(domain.confidenceLabel, 'LIKELY_DIFFERENT');
  });

  it('classifies CRC/Rowan as same company / different person and blocks destructive merge', () => {
    assert.equal(
      isCrcRowanPair(
        CUSTOMER_DUPLICATE_RECONCILIATION_CRC.canonicalCustomerId,
        CUSTOMER_DUPLICATE_RECONCILIATION_CRC.rowanSourceCustomerId,
      ),
      true,
    );
    const result = classifyDuplicateCandidate({
      leftCustomerId: CUSTOMER_DUPLICATE_RECONCILIATION_CRC.canonicalCustomerId,
      rightCustomerId: CUSTOMER_DUPLICATE_RECONCILIATION_CRC.rowanSourceCustomerId,
      leftName: 'CRC',
      rightName: 'Rowan CRC',
      leftXeroContactIds: [CUSTOMER_DUPLICATE_RECONCILIATION_CRC.xeroContactId],
      rightXeroContactIds: [CUSTOMER_DUPLICATE_RECONCILIATION_CRC.rowanXeroContactId],
    });
    assert.equal(result.confidenceLabel, 'SAME_COMPANY_DIFFERENT_CONTACT');
    assert.equal(result.suggestedResolution, 'SAME_COMPANY_DIFFERENT_PERSON');
    assert.throws(() =>
      assertCrcRowanNotDestructivelyMerged({
        leftCustomerId: CUSTOMER_DUPLICATE_RECONCILIATION_CRC.canonicalCustomerId,
        rightCustomerId: CUSTOMER_DUPLICATE_RECONCILIATION_CRC.rowanSourceCustomerId,
        resolutionType: 'TRUE_DUPLICATE_CANONICALIZE',
      }),
    );
    assert.deepEqual(
      assertCrcRowanRegression({
        canonicalCustomerId: CUSTOMER_DUPLICATE_RECONCILIATION_CRC.canonicalCustomerId,
        rowanSourceCustomerId: CUSTOMER_DUPLICATE_RECONCILIATION_CRC.rowanSourceCustomerId,
        rowanPersonExists: true,
        associationActive: true,
        rowanXeroContactId: CUSTOMER_DUPLICATE_RECONCILIATION_CRC.rowanXeroContactId,
        royalCapeQuoteCustomerId: CUSTOMER_DUPLICATE_RECONCILIATION_CRC.canonicalCustomerId,
        crcDestructivelyMerged: false,
      }),
      { ok: true },
    );
  });

  it('enforces Draft → Approve → Execute and stale preview denial', () => {
    assert.deepEqual(
      assertReconciliationLifecycleTransition({
        from: 'unreviewed',
        to: 'draft',
        resolutionType: 'SAME_COMPANY_DIFFERENT_PERSON',
      }),
      { ok: true },
    );
    assert.deepEqual(
      assertReconciliationLifecycleTransition({
        from: 'draft',
        to: 'approved',
        resolutionType: 'SAME_COMPANY_DIFFERENT_PERSON',
      }),
      { ok: true },
    );
    assert.throws(() =>
      assertReconciliationLifecycleTransition({
        from: 'draft',
        to: 'executed',
        resolutionType: 'SAME_COMPANY_DIFFERENT_PERSON',
      }),
    );
    const hash = buildReconciliationPreviewHash({
      canonicalCustomerId: 'c1',
      secondaryCustomerId: 'c2',
      resolutionType: 'NOT_DUPLICATE',
      leftUpdatedAt: 't1',
      rightUpdatedAt: 't2',
      leftXeroContactIds: [],
      rightXeroContactIds: [],
      leftLinkCounts: emptyCounts(),
      rightLinkCounts: emptyCounts(),
    });
    assert.deepEqual(assertPreviewHashMatches({ draftHash: hash, currentHash: hash }), { ok: true });
    assert.throws(() =>
      assertPreviewHashMatches({ draftHash: hash, currentHash: hash + 'x' }),
    );
  });

  it('plans same-company association without inventing people or moving finance', () => {
    const plan = planSameCompanyDifferentPersonAction({
      canonicalCustomerId: 'c1',
      sourceCustomerId: 'c2',
      personIdentityKnown: false,
    });
    assert.equal(plan.action, 'ASSOCIATE_SOURCE');
    assert.equal(plan.createsCustomerPeople, false);
    assert.equal(plan.movesFinancialOwnership, false);
    assert.equal(plan.xeroWrite, false);
  });

  it('preserves consent/opt-out and prevents financial double counting', () => {
    assert.throws(() =>
      assertConsentNotWeakened({
        leftDoNotContact: true,
        rightDoNotContact: false,
        consolidatedDoNotContact: false,
      }),
    );
    assert.deepEqual(
      assertNoFinancialDoubleCount({
        canonicalQuoteIds: ['q1'],
        associatedQuoteIds: ['q2'],
        displayedQuoteIds: ['q1', 'q2'],
      }),
      { ok: true },
    );
    assert.throws(() =>
      assertNoFinancialDoubleCount({
        canonicalQuoteIds: ['q1'],
        associatedQuoteIds: ['q2'],
        displayedQuoteIds: ['q1', 'q1'],
      }),
    );
  });

  it('denies Technician/Client and allows Owner execute', () => {
    assert.equal(
      assertTechnicianDeniedDuplicateReconciliation({ roleName: 'Technician' }).allowed,
      false,
    );
    assert.equal(
      assertTechnicianDeniedDuplicateReconciliation({ roleName: 'Client' }).allowed,
      false,
    );
    assert.equal(canAccessDuplicateReconciliation({ roleName: 'Manager', permissions: ['customers:read'] }), true);
    assert.equal(canExecuteDuplicateReconciliation({ roleName: 'Company Owner', permissions: [] }), true);
    assert.ok(buildDuplicateReconciliationAuditActions().includes('duplicate_executed'));
  });
});
