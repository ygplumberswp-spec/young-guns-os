import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyHumanReconciliationReview,
  assertRow111SafetyGates,
  buildAuraBankMatchSuggestion,
  canManageBankReconciliation,
  canViewBankReconciliation,
  mapLegacyReconciliationStatus,
  resolveBankReconciliationState,
} from './bank-reconciliation-states.js';
import type { ExpandedBankMatchCandidate } from './bank-transaction-matching.js';

const candidate = (id: string, confidence: 'high' | 'medium' | 'low'): ExpandedBankMatchCandidate => ({
  targetType: 'invoice',
  targetId: id,
  targetLabel: id,
  confidence,
  amountCents: 1000,
  amountDifferenceCents: 0,
  reason: 'test',
  evidence: [
    { signal: 'exact_amount', detail: 'ok' },
    { signal: 'reference', detail: 'ok' },
  ],
  sequenceUsedAsProof: false,
});

describe('Row 111 reconciliation states + AURA', () => {
  it('resolves states including REVIEW_REQUIRED / PARTIAL / RECONCILED', () => {
    assert.equal(
      resolveBankReconciliationState({
        disposition: 'NO_CANDIDATES',
        candidateCount: 0,
        allocatedAmountCents: 0,
        transactionAmountCents: 1000,
      }),
      'UNMATCHED',
    );
    assert.equal(
      resolveBankReconciliationState({
        disposition: 'DETERMINISTIC_UNIQUE',
        candidateCount: 1,
        allocatedAmountCents: 0,
        transactionAmountCents: 1000,
      }),
      'POSSIBLE_MATCH',
    );
    assert.equal(
      resolveBankReconciliationState({
        disposition: 'REVIEW_REQUIRED',
        candidateCount: 2,
        allocatedAmountCents: 0,
        transactionAmountCents: 1000,
      }),
      'REVIEW_REQUIRED',
    );
    assert.equal(
      resolveBankReconciliationState({
        disposition: 'SINGLE_CANDIDATE',
        candidateCount: 1,
        allocatedAmountCents: 400,
        transactionAmountCents: 1000,
      }),
      'PARTIAL',
    );
    assert.equal(
      resolveBankReconciliationState({
        disposition: 'REVIEW_REQUIRED',
        candidateCount: 2,
        allocatedAmountCents: 0,
        transactionAmountCents: 1000,
        humanReviewed: true,
      }),
      'REVIEWED',
    );
    assert.equal(
      resolveBankReconciliationState({
        disposition: 'DETERMINISTIC_UNIQUE',
        candidateCount: 1,
        allocatedAmountCents: 1000,
        transactionAmountCents: 1000,
        humanReconciled: true,
      }),
      'RECONCILED',
    );
    assert.equal(mapLegacyReconciliationStatus('partially_reconciled'), 'PARTIAL');
  });

  it('AURA suggests only; cannot independently reconcile', () => {
    const suggestion = buildAuraBankMatchSuggestion({
      candidates: [candidate('a', 'high'), candidate('b', 'high')],
      disposition: 'REVIEW_REQUIRED',
    });
    assert.equal(suggestion.kind, 'SUGGEST');
    assert.equal(suggestion.canIndependentlyReconcile, false);
    assert.equal(suggestion.requiresHumanReview, true);

    assert.throws(() =>
      applyHumanReconciliationReview({
        currentState: 'REVIEW_REQUIRED',
        nextState: 'RECONCILED',
        reviewedByUserId: 'u1',
        reviewedAt: '2026-08-08T12:00:00Z',
        evidence: { note: 'ok' },
        auraForcedReconcile: true,
      }),
    );

    const review = applyHumanReconciliationReview({
      currentState: 'REVIEW_REQUIRED',
      nextState: 'RECONCILED',
      reviewedByUserId: 'u1',
      reviewedAt: '2026-08-08T12:00:00Z',
      evidence: { matchedInvoiceId: 'a' },
      auraSuggestion: suggestion,
    });
    assert.equal(review.humanConfirmed, true);
    assert.equal(review.reviewedByUserId, 'u1');
    assert.equal(review.state, 'RECONCILED');
    assert.equal(review.previousState, 'REVIEW_REQUIRED');
  });

  it('RBAC + safety', () => {
    assert.equal(canViewBankReconciliation({ roleName: 'owner' }), true);
    assert.equal(canManageBankReconciliation({ roleName: 'technician' }), false);
    assert.equal(canViewBankReconciliation({ roleName: 'client' }), false);
    assert.equal(assertRow111SafetyGates({ row92AutomationEnabled: false }).moneyMovement, 0);
  });
});
