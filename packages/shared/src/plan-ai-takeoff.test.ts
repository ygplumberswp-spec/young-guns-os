import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PLAN_AI_TAKEOFF_ROYAL_CAPE,
  acceptAiTakeoffItemToRow94,
  aiTakeoffIdempotencyFingerprint,
  assertAiCannotSelfApprove,
  assertNoAiTakeoffClientLeak,
  assertRow98SafetyGates,
  assertRow99NotStarted,
  assertRoyalCapeUnchangedForRow98,
  rejectAiTakeoffItem,
  resolveAiPlanTakeoffDraft,
  type AiTakeoffEvidenceCandidate,
} from './plan-ai-takeoff.js';
import type { PlanDocumentProvenance } from './plan-estimate.js';

const source: PlanDocumentProvenance = {
  sourceDocumentId: '11111111-1111-1111-1111-111111111111',
  sourceFilename: 'fixture-plan-rev-a.pdf',
  uploadedAt: '2026-08-01T00:00:00.000Z',
  customerId: null,
  propertyId: null,
  jobId: null,
  pageNumber: 1,
  fileHash: 'abc123',
  revisionLabel: 'Rev A',
};

function cand(
  partial: Partial<AiTakeoffEvidenceCandidate> &
    Pick<AiTakeoffEvidenceCandidate, 'clientKey' | 'pointType' | 'description'>,
): AiTakeoffEvidenceCandidate {
  return {
    quantity: 1,
    unit: 'each',
    isLengthMeasurement: false,
    quantityOrigin: 'AI_DETECTION',
    pageReference: 'Sheet 1',
    annotationRef: 'ann-1',
    supportingText: 'labelled fixture',
    providerConfidence: 'HIGH',
    ...partial,
  };
}

describe('Row 98 AI plan take-off', () => {
  it('1 authorised source accepted', () => {
    const r = resolveAiPlanTakeoffDraft({
      authorisedSource: source,
      scaleStatus: 'SCALE_NOT_PROVIDED',
      evidenceCandidates: [cand({ clientKey: 'w1', pointType: 'WATER', description: 'WHB cold' })],
    });
    assert.equal(r.status, 'READY_FOR_REVIEW');
    assert.equal(r.evidenceSummary.sourceDocumentId, source.sourceDocumentId);
  });

  it('2 no source blocked', () => {
    const r = resolveAiPlanTakeoffDraft({
      authorisedSource: null,
      scaleStatus: 'SCALE_NOT_PROVIDED',
      evidenceCandidates: [cand({ clientKey: 'w1', pointType: 'WATER', description: 'x' })],
    });
    assert.equal(r.status, 'NO_AUTHORISED_PLAN_SOURCE_AVAILABLE');
    assert.equal(r.items.length, 0);
  });

  it('3 WATER draft', () => {
    const r = resolveAiPlanTakeoffDraft({
      authorisedSource: source,
      scaleStatus: 'SCALE_NOT_PROVIDED',
      evidenceCandidates: [cand({ clientKey: 'w1', pointType: 'WATER', description: 'basin' })],
    });
    assert.equal(r.items[0]?.pointType, 'WATER');
    assert.equal(r.items[0]?.lifecycle === 'AI_DRAFT' || r.items[0]?.lifecycle === 'REVIEW_REQUIRED', true);
  });

  it('4 WASTE draft', () => {
    const r = resolveAiPlanTakeoffDraft({
      authorisedSource: source,
      scaleStatus: 'SCALE_NOT_PROVIDED',
      evidenceCandidates: [cand({ clientKey: 's1', pointType: 'WASTE', description: 'soil' })],
    });
    assert.equal(r.items[0]?.pointType, 'WASTE');
  });

  it('5 GEYSER draft', () => {
    const r = resolveAiPlanTakeoffDraft({
      authorisedSource: source,
      scaleStatus: 'SCALE_NOT_PROVIDED',
      evidenceCandidates: [cand({ clientKey: 'g1', pointType: 'GEYSER', description: '150L' })],
    });
    assert.equal(r.items[0]?.pointType, 'GEYSER');
  });

  it('6 explicit quantity evidence', () => {
    const r = resolveAiPlanTakeoffDraft({
      authorisedSource: source,
      scaleStatus: 'SCALE_NOT_PROVIDED',
      evidenceCandidates: [
        cand({
          clientKey: 'w1',
          pointType: 'WATER',
          description: '2× taps',
          quantity: 2,
          quantityOrigin: 'EXPLICIT_PLAN_LABEL',
          supportingText: 'schedule: 2 taps',
        }),
      ],
    });
    assert.equal(r.items[0]?.quantity, 2);
    assert.equal(r.items[0]?.evidence.supportingText, 'schedule: 2 taps');
  });

  it('7 missing scale blocks length', () => {
    const r = resolveAiPlanTakeoffDraft({
      authorisedSource: source,
      scaleStatus: 'SCALE_NOT_PROVIDED',
      evidenceCandidates: [
        cand({
          clientKey: 'pipe',
          pointType: 'WATER',
          description: 'cold main',
          quantity: 12.5,
          unit: 'm',
          isLengthMeasurement: true,
        }),
      ],
    });
    assert.equal(r.items[0]?.quantity, null);
    assert.ok(r.items[0]?.ambiguityFlags.includes('SCALE_MISSING'));
    assert.equal(r.items[0]?.measurementAllowed, false);
  });

  it('8 verified scale permits supported measurement', () => {
    const r = resolveAiPlanTakeoffDraft({
      authorisedSource: source,
      scaleStatus: 'SCALE_VERIFIED',
      scaleProvenance: 'title-block 1:100 verified by office',
      evidenceCandidates: [
        cand({
          clientKey: 'pipe',
          pointType: 'WATER',
          description: 'cold main',
          quantity: 12.5,
          unit: 'm',
          isLengthMeasurement: true,
          supportingText: 'scaled polyline sheet 1',
        }),
      ],
    });
    assert.equal(r.items[0]?.quantity, 12.5);
    assert.equal(r.items[0]?.measurementAllowed, true);
  });

  it('9 ambiguous symbol → review required', () => {
    const r = resolveAiPlanTakeoffDraft({
      authorisedSource: source,
      scaleStatus: 'SCALE_NOT_PROVIDED',
      evidenceCandidates: [
        cand({
          clientKey: 'a1',
          pointType: 'OTHER',
          description: 'unknown symbol',
          ambiguityFlags: ['SYMBOL_AMBIGUOUS'],
          providerConfidence: 'MEDIUM',
        }),
      ],
    });
    assert.equal(r.items[0]?.lifecycle, 'REVIEW_REQUIRED');
    assert.ok(r.humanReviewReasons.includes('AMBIGUOUS'));
  });

  it('10 low confidence → review required', () => {
    const r = resolveAiPlanTakeoffDraft({
      authorisedSource: source,
      scaleStatus: 'SCALE_NOT_PROVIDED',
      evidenceCandidates: [
        cand({
          clientKey: 'a1',
          pointType: 'WATER',
          description: 'maybe tap',
          providerConfidence: 'LOW',
        }),
      ],
    });
    assert.equal(r.items[0]?.lifecycle, 'REVIEW_REQUIRED');
    assert.ok(r.humanReviewReasons.includes('LOW_CONFIDENCE'));
  });

  it('11 complex/compliance-sensitive → human review', () => {
    const r = resolveAiPlanTakeoffDraft({
      authorisedSource: source,
      scaleStatus: 'SCALE_NOT_PROVIDED',
      complexWork: true,
      complianceSensitive: true,
      evidenceCandidates: [cand({ clientKey: 'w1', pointType: 'WATER', description: 'main' })],
    });
    assert.equal(r.humanReviewRequired, true);
    assert.ok(r.humanReviewReasons.includes('COMPLEX_WORK'));
    assert.ok(r.humanReviewReasons.includes('COMPLIANCE_SENSITIVE'));
  });

  it('12 AI cannot self-approve', () => {
    const r = resolveAiPlanTakeoffDraft({
      authorisedSource: source,
      scaleStatus: 'SCALE_NOT_PROVIDED',
      evidenceCandidates: [cand({ clientKey: 'w1', pointType: 'WATER', description: 'tap' })],
    });
    assert.equal(r.aiMayApprove, false);
    assert.throws(() =>
      assertAiCannotSelfApprove({
        actorIsAi: true,
        lifecycle: 'HUMAN_CONFIRMED',
        confidence: 'CONFIRMED',
      }),
    );
    const denied = acceptAiTakeoffItemToRow94({
      item: r.items[0]!,
      humanConfirm: true,
      actorRole: 'aura',
      actorPermissions: ['*'],
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, 'AI_CANNOT_SELF_APPROVE');
  });

  it('13 accepted AI item becomes canonical reviewed Row94 item', () => {
    const r = resolveAiPlanTakeoffDraft({
      authorisedSource: source,
      scaleStatus: 'SCALE_NOT_PROVIDED',
      evidenceCandidates: [cand({ clientKey: 'w1', pointType: 'WATER', description: 'tap', quantity: 3 })],
    });
    const accepted = acceptAiTakeoffItemToRow94({
      item: r.items[0]!,
      humanConfirm: true,
      actorRole: 'owner',
      actorPermissions: ['finance:write'],
    });
    assert.equal(accepted.ok, true);
    if (accepted.ok) {
      assert.equal(accepted.lifecycle, 'HUMAN_CONFIRMED');
      assert.equal(accepted.item.confidence, 'CONFIRMED');
      assert.equal(accepted.item.quantity, 3);
      assert.equal(accepted.item.quantityOrigin, 'PLAN_ANNOTATION');
    }
  });

  it('14 rejected item does not enter quote', () => {
    const r = resolveAiPlanTakeoffDraft({
      authorisedSource: source,
      scaleStatus: 'SCALE_NOT_PROVIDED',
      evidenceCandidates: [cand({ clientKey: 'w1', pointType: 'WATER', description: 'tap' })],
    });
    const rejected = rejectAiTakeoffItem(r.items[0]!);
    assert.equal(rejected.entersCanonicalEstimate, false);
    assert.equal(rejected.lifecycle, 'REJECTED');
    const accept = acceptAiTakeoffItemToRow94({
      item: rejected,
      humanConfirm: true,
      actorRole: 'owner',
    });
    assert.equal(accept.ok, false);
  });

  it('15 plan revision preserves history flags', () => {
    const r = resolveAiPlanTakeoffDraft({
      authorisedSource: { ...source, revisionLabel: 'Rev B' },
      scaleStatus: 'SCALE_NOT_PROVIDED',
      previousRevisionLabel: 'Rev A',
      nextRevisionLabel: 'Rev B',
      evidenceCandidates: [cand({ clientKey: 'w1', pointType: 'WATER', description: 'tap' })],
    });
    assert.equal(r.revision.changed, true);
    assert.ok(r.revision.flags.includes('PLAN_REVISION_CHANGED'));
  });

  it('16 revision returns changed draft to review', () => {
    const r = resolveAiPlanTakeoffDraft({
      authorisedSource: { ...source, revisionLabel: 'Rev B' },
      scaleStatus: 'SCALE_NOT_PROVIDED',
      previousRevisionLabel: 'Rev A',
      nextRevisionLabel: 'Rev B',
      previousAcceptedDescriptions: ['old item'],
      evidenceCandidates: [cand({ clientKey: 'w2', pointType: 'WATER', description: 'new tap' })],
    });
    assert.equal(r.revision.returnedToReview, true);
    assert.ok(r.revision.changedItemKeys.includes('w2'));
  });

  it('17 no invented material/cost', () => {
    const r = resolveAiPlanTakeoffDraft({
      authorisedSource: source,
      scaleStatus: 'SCALE_NOT_PROVIDED',
      evidenceCandidates: [
        cand({
          clientKey: 'w1',
          pointType: 'WATER',
          description: 'tap',
          unitCostCents: 999,
          materialSku: 'FAKE',
          labourHours: 2,
        }),
      ],
    });
    assert.ok(r.warnings.includes('AI_COST_OR_MATERIAL_INVENTION_BLOCKED'));
    assert.equal(r.inventedCostBlocked, true);
  });

  it('18 Row96 integration no double count (draft has no cost components)', () => {
    const r = resolveAiPlanTakeoffDraft({
      authorisedSource: source,
      scaleStatus: 'SCALE_NOT_PROVIDED',
      evidenceCandidates: [cand({ clientKey: 'w1', pointType: 'WATER', description: 'tap' })],
    });
    assert.equal(r.inventedCostBlocked, true);
    assert.equal('costComponents' in r, false);
  });

  it('19 Row97 preserved (advisory key untouched)', () => {
    const r = resolveAiPlanTakeoffDraft({
      authorisedSource: source,
      scaleStatus: 'SCALE_NOT_PROVIDED',
      evidenceCandidates: [],
    });
    assert.equal(r.providerPath, 'AURA_STRUCTURED_EVIDENCE_CANDIDATES');
    assert.equal(r.draftOnly, true);
  });

  it('20 Client denied', () => {
    assert.throws(() => assertNoAiTakeoffClientLeak({ aiTakeoff: { x: 1 } }));
    const denied = acceptAiTakeoffItemToRow94({
      item: resolveAiPlanTakeoffDraft({
        authorisedSource: source,
        scaleStatus: 'SCALE_NOT_PROVIDED',
        evidenceCandidates: [cand({ clientKey: 'w1', pointType: 'WATER', description: 'tap' })],
      }).items[0]!,
      humanConfirm: true,
      actorRole: 'client',
    });
    assert.equal(denied.ok, false);
  });

  it('21 tenant isolation helper — fingerprint includes estimate identity', () => {
    const a = aiTakeoffIdempotencyFingerprint({
      estimateId: 'e1',
      sourceDocumentId: 'd1',
      revisionLabel: 'Rev A',
      candidateKeys: ['a', 'b'],
    });
    const b = aiTakeoffIdempotencyFingerprint({
      estimateId: 'e2',
      sourceDocumentId: 'd1',
      revisionLabel: 'Rev A',
      candidateKeys: ['a', 'b'],
    });
    assert.notEqual(a, b);
  });

  it('22 audit facts present', () => {
    const r = resolveAiPlanTakeoffDraft({
      authorisedSource: source,
      scaleStatus: 'SCALE_NOT_PROVIDED',
      evidenceCandidates: [cand({ clientKey: 'w1', pointType: 'WATER', description: 'tap' })],
    });
    assert.ok(r.auraNarrativeFacts.some((f) => f.includes('DRAFT')));
    assert.ok(r.auraNarrativeFacts.some((f) => f.includes('human review')));
  });

  it('23 idempotent retry same fingerprint', () => {
    const fp1 = aiTakeoffIdempotencyFingerprint({
      estimateId: 'e1',
      sourceDocumentId: source.sourceDocumentId,
      revisionLabel: 'Rev A',
      candidateKeys: ['w1', 's1'],
    });
    const fp2 = aiTakeoffIdempotencyFingerprint({
      estimateId: 'e1',
      sourceDocumentId: source.sourceDocumentId,
      revisionLabel: 'Rev A',
      candidateKeys: ['s1', 'w1'],
    });
    assert.equal(fp1, fp2);
    const r1 = resolveAiPlanTakeoffDraft({
      authorisedSource: source,
      scaleStatus: 'SCALE_NOT_PROVIDED',
      idempotencyKey: fp1,
      evidenceCandidates: [cand({ clientKey: 'w1', pointType: 'WATER', description: 'tap' })],
    });
    const r2 = resolveAiPlanTakeoffDraft({
      authorisedSource: source,
      scaleStatus: 'SCALE_NOT_PROVIDED',
      idempotencyKey: fp1,
      evidenceCandidates: [cand({ clientKey: 'w1', pointType: 'WATER', description: 'tap' })],
    });
    assert.deepEqual(r1.items, r2.items);
  });

  it('24 cleanup / safety gates', () => {
    const g = assertRow98SafetyGates({ row92AutomationEnabled: false });
    assert.equal(g.row92Off, true);
    assert.equal(g.row99NotStarted, true);
    assert.throws(() => assertRow99NotStarted(true));
    assertRoyalCapeUnchangedForRow98({ totalCents: 4_272_250, pricingPresentationMode: 'ITEMISED' });
    assert.equal(PLAN_AI_TAKEOFF_ROYAL_CAPE.expectedTotalCents, 4_272_250);
  });

  it('technician denied accept', () => {
    const r = resolveAiPlanTakeoffDraft({
      authorisedSource: source,
      scaleStatus: 'SCALE_NOT_PROVIDED',
      evidenceCandidates: [cand({ clientKey: 'w1', pointType: 'WATER', description: 'tap' })],
    });
    const denied = acceptAiTakeoffItemToRow94({
      item: r.items[0]!,
      humanConfirm: true,
      actorRole: 'technician',
    });
    assert.equal(denied.ok, false);
  });
});
