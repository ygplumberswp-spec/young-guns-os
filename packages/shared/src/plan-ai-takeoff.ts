/**
 * Row 98 — AI Plan Take-Off (DRAFT assistance only)
 *
 * Deterministic gates over evidence-backed AI proposals.
 * AI must NEVER invent quantities, lengths, materials, labour, costs, or scale.
 * Reuses Row 94 plan-estimate lifecycle / scale / confidence / approval gates.
 * Row 96/97 remain separate (cost / pricing intelligence).
 * Row 92 stays DRAFT / automation=false. Row 99 not started.
 */

import {
  assertMeasurementAllowed,
  assertPlanQuantityValid,
  assertRow92StillInactiveForPlanEstimate,
  canApprovePlanEstimate,
  canManagePlanEstimates,
  planRevisionRequiresReview,
  type PlanDocumentProvenance,
  type PlanEstimateItemInput,
  type PlanItemConfidence,
  type PlanQuantityOrigin,
  type PlanScaleStatus,
  type PlanTakeoffPointType,
} from './plan-estimate.js';
import { XERO_OFFICIAL_NUMBER_ROYAL_CAPE } from './xero-official-number-authority.js';

export const PLAN_AI_TAKEOFF_KEY = 'ai-plan-takeoff' as const;

export const PLAN_AI_TAKEOFF_ROYAL_CAPE = {
  ...XERO_OFFICIAL_NUMBER_ROYAL_CAPE,
  expectedTotalCents: 4_272_250,
  expectedPricingMode: 'ITEMISED' as const,
} as const;

/** Draft item lifecycle before / alongside Row 94 confidence. */
export type AiTakeoffItemLifecycle =
  | 'AI_DRAFT'
  | 'REVIEW_REQUIRED'
  | 'HUMAN_CONFIRMED'
  | 'REJECTED';

export type AiTakeoffAmbiguityFlag =
  | 'SCALE_MISSING'
  | 'SYMBOL_AMBIGUOUS'
  | 'QUANTITY_UNCLEAR'
  | 'ROUTE_UNCLEAR'
  | 'FIXTURE_TYPE_UNCLEAR'
  | 'REVISION_CONFLICT'
  | 'MEASUREMENT_UNSUPPORTED'
  | 'SOURCE_EVIDENCE_INSUFFICIENT';

export type AiTakeoffRunStatus =
  | 'READY_FOR_REVIEW'
  | 'NO_AUTHORISED_PLAN_SOURCE_AVAILABLE'
  | 'SOURCE_EVIDENCE_INSUFFICIENT'
  | 'EMPTY_DRAFT';

export type AiTakeoffConfidenceBand = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export type AiTakeoffEvidence = {
  sourceDocumentId: string | null;
  revisionLabel: string | null;
  pageReference: string | null;
  sheetLabel: string | null;
  pointType: PlanTakeoffPointType;
  quantityOrigin: PlanQuantityOrigin | 'AI_DETECTION';
  supportingText: string | null;
  annotationRef: string | null;
  scaleStatus: PlanScaleStatus;
  scaleProvenance: string | null;
};

/**
 * Evidence-backed candidate from an authorised provider / fixture.
 * Resolver never invents these — it only validates and gates them.
 */
export type AiTakeoffEvidenceCandidate = {
  clientKey: string;
  pointType: PlanTakeoffPointType;
  subtypeLabel?: string | null;
  description: string;
  /** Must be explicitly evidenced — null/omit means unclear. */
  quantity: number | null;
  unit: string;
  isLengthMeasurement: boolean;
  quantityOrigin: PlanQuantityOrigin | 'AI_DETECTION';
  pageReference?: string | null;
  annotationRef?: string | null;
  supportingText?: string | null;
  providerConfidence: AiTakeoffConfidenceBand;
  ambiguityFlags?: AiTakeoffAmbiguityFlag[];
  /** Forbidden if present — costs are never AI-invented. */
  unitCostCents?: number | null;
  materialSku?: string | null;
  labourHours?: number | null;
};

export type AiTakeoffDraftItem = {
  clientKey: string;
  pointType: PlanTakeoffPointType;
  subtypeLabel: string | null;
  description: string;
  quantity: number | null;
  unit: string;
  isLengthMeasurement: boolean;
  quantityOrigin: PlanQuantityOrigin | 'AI_DETECTION';
  pageReference: string | null;
  annotationRef: string | null;
  supportingText: string | null;
  lifecycle: AiTakeoffItemLifecycle;
  row94Confidence: PlanItemConfidence;
  providerConfidence: AiTakeoffConfidenceBand;
  ambiguityFlags: AiTakeoffAmbiguityFlag[];
  measurementAllowed: boolean;
  evidence: AiTakeoffEvidence;
  blockedReasons: string[];
  /** True only after explicit human accept — never set by AI. */
  humanConfirmed: boolean;
  entersCanonicalEstimate: boolean;
};

export type AiTakeoffHumanReviewReason =
  | 'COMPLEX_WORK'
  | 'COMPLIANCE_SENSITIVE'
  | 'LOW_CONFIDENCE'
  | 'AMBIGUOUS'
  | 'MEASUREMENT_DEPENDENT_WITHOUT_STRONG_EVIDENCE'
  | 'SCALE_UNVERIFIED_LENGTH'
  | 'REVISION_CHANGED';

export type ResolveAiPlanTakeoffInput = {
  authorisedSource: PlanDocumentProvenance | null;
  scaleStatus: PlanScaleStatus;
  scaleProvenance?: string | null;
  /** Provider/fixture candidates only — never synthesised by this resolver. */
  evidenceCandidates: AiTakeoffEvidenceCandidate[];
  complexWork?: boolean;
  complianceSensitive?: boolean;
  previousRevisionLabel?: string | null;
  nextRevisionLabel?: string | null;
  /** Prior accepted descriptions for deterministic revision diff highlight. */
  previousAcceptedDescriptions?: string[];
  idempotencyKey?: string | null;
  row92Status?: string;
  row92GlobalAutomationEnabled?: boolean;
};

export type AiPlanTakeoffResult = {
  status: AiTakeoffRunStatus;
  providerPath: 'AURA_STRUCTURED_EVIDENCE_CANDIDATES';
  draftOnly: true;
  aiMayApprove: false;
  items: AiTakeoffDraftItem[];
  ambiguityFlags: AiTakeoffAmbiguityFlag[];
  humanReviewRequired: boolean;
  humanReviewReasons: AiTakeoffHumanReviewReason[];
  revision: {
    changed: boolean;
    flags: string[];
    returnedToReview: boolean;
    changedItemKeys: string[];
  };
  missingInputs: string[];
  warnings: string[];
  inventedCostBlocked: true;
  inventedQuantityBlocked: true;
  row92: { status: string; globalAutomationEnabled: false; labelled: 'DRAFT_OFF' };
  row99NotStarted: true;
  evidenceSummary: {
    sourceDocumentId: string | null;
    revisionLabel: string | null;
    candidateCount: number;
    acceptedForDraftCount: number;
    blockedCount: number;
  };
  auraNarrativeFacts: string[];
  idempotencyKey: string | null;
};

function hasAuthorisedSource(source: PlanDocumentProvenance | null): boolean {
  if (!source) return false;
  if (source.sourceDocumentId) return true;
  if (source.fileHash && source.sourceFilename) return true;
  return false;
}

function lengthUnit(unit: string): boolean {
  const u = unit.trim().toLowerCase();
  return ['m', 'metre', 'metres', 'meter', 'meters', 'mm', 'cm', 'ft', 'feet'].includes(u);
}

function mapQuantityOriginForRow94(
  origin: PlanQuantityOrigin | 'AI_DETECTION',
): PlanQuantityOrigin {
  if (origin === 'AI_DETECTION') return 'PLAN_ANNOTATION';
  return origin;
}

export function resolveAiPlanTakeoffDraft(
  input: ResolveAiPlanTakeoffInput,
): AiPlanTakeoffResult {
  assertRow92StillInactiveForPlanEstimate({
    status: input.row92Status ?? 'DRAFT',
    globalAutomationEnabled: input.row92GlobalAutomationEnabled === true,
  });

  const warnings: string[] = [];
  const missingInputs: string[] = [];
  const ambiguityAll = new Set<AiTakeoffAmbiguityFlag>();
  const reviewReasons = new Set<AiTakeoffHumanReviewReason>();

  const revision = planRevisionRequiresReview({
    previousRevisionLabel: input.previousRevisionLabel ?? null,
    nextRevisionLabel: input.nextRevisionLabel ?? input.authorisedSource?.revisionLabel ?? null,
  });
  if (revision.changed) {
    reviewReasons.add('REVISION_CHANGED');
  }

  if (!hasAuthorisedSource(input.authorisedSource)) {
    missingInputs.push('authorisedPlanSource');
    return {
      status: 'NO_AUTHORISED_PLAN_SOURCE_AVAILABLE',
      providerPath: 'AURA_STRUCTURED_EVIDENCE_CANDIDATES',
      draftOnly: true,
      aiMayApprove: false,
      items: [],
      ambiguityFlags: ['SOURCE_EVIDENCE_INSUFFICIENT'],
      humanReviewRequired: true,
      humanReviewReasons: ['AMBIGUOUS'],
      revision: {
        changed: revision.changed,
        flags: revision.flags,
        returnedToReview: revision.changed,
        changedItemKeys: [],
      },
      missingInputs,
      warnings: ['NO_AUTHORISED_PLAN_SOURCE_AVAILABLE'],
      inventedCostBlocked: true,
      inventedQuantityBlocked: true,
      row92: {
        status: input.row92Status ?? 'DRAFT',
        globalAutomationEnabled: false,
        labelled: 'DRAFT_OFF',
      },
      row99NotStarted: true,
      evidenceSummary: {
        sourceDocumentId: input.authorisedSource?.sourceDocumentId ?? null,
        revisionLabel: input.authorisedSource?.revisionLabel ?? null,
        candidateCount: 0,
        acceptedForDraftCount: 0,
        blockedCount: 0,
      },
      auraNarrativeFacts: [
        'No authorised plan/document provenance is available for AI take-off.',
        'AI must not invent plan sources, quantities, or costs.',
        'Status: NO_AUTHORISED_PLAN_SOURCE_AVAILABLE.',
      ],
      idempotencyKey: input.idempotencyKey ?? null,
    };
  }

  const source = input.authorisedSource!;
  const prevSet = new Set(
    (input.previousAcceptedDescriptions ?? []).map((d) => d.trim().toLowerCase()),
  );
  const changedItemKeys: string[] = [];
  const items: AiTakeoffDraftItem[] = [];
  let blockedCount = 0;

  if (input.complexWork) reviewReasons.add('COMPLEX_WORK');
  if (input.complianceSensitive) reviewReasons.add('COMPLIANCE_SENSITIVE');

  for (const candidate of input.evidenceCandidates) {
    const ambiguity = new Set<AiTakeoffAmbiguityFlag>(candidate.ambiguityFlags ?? []);
    const blockedReasons: string[] = [];
    const isLength = candidate.isLengthMeasurement || lengthUnit(candidate.unit);

    if (candidate.unitCostCents != null || candidate.materialSku || candidate.labourHours != null) {
      blockedReasons.push('AI_COST_OR_MATERIAL_INVENTION_BLOCKED');
      warnings.push('AI_COST_OR_MATERIAL_INVENTION_BLOCKED');
    }

    if (!candidate.supportingText && !candidate.annotationRef && !candidate.pageReference) {
      ambiguity.add('SOURCE_EVIDENCE_INSUFFICIENT');
      blockedReasons.push('SOURCE_EVIDENCE_INSUFFICIENT');
    }

    if (candidate.quantity == null || !Number.isFinite(candidate.quantity)) {
      ambiguity.add('QUANTITY_UNCLEAR');
      blockedReasons.push('QUANTITY_UNCLEAR');
    } else {
      try {
        assertPlanQuantityValid({
          quantity: candidate.quantity,
          quantityOrigin: mapQuantityOriginForRow94(candidate.quantityOrigin),
          confidence: 'REVIEW_REQUIRED',
        });
      } catch {
        ambiguity.add('QUANTITY_UNCLEAR');
        blockedReasons.push('QUANTITY_INVALID');
      }
    }

    let measurementAllowed = true;
    if (isLength) {
      const gate = assertMeasurementAllowed({
        scaleStatus: input.scaleStatus,
        isLengthMeasurement: true,
      });
      if (!gate.ok) {
        measurementAllowed = false;
        ambiguity.add(
          gate.code === 'SCALE_NOT_PROVIDED' ? 'SCALE_MISSING' : 'MEASUREMENT_UNSUPPORTED',
        );
        blockedReasons.push(gate.code);
        reviewReasons.add('SCALE_UNVERIFIED_LENGTH');
        reviewReasons.add('MEASUREMENT_DEPENDENT_WITHOUT_STRONG_EVIDENCE');
      }
      if (input.scaleStatus !== 'SCALE_VERIFIED' || !input.scaleProvenance) {
        if (input.scaleStatus === 'SCALE_VERIFIED' && !input.scaleProvenance) {
          ambiguity.add('SOURCE_EVIDENCE_INSUFFICIENT');
          blockedReasons.push('SCALE_PROVENANCE_MISSING');
          measurementAllowed = false;
        }
      }
    }

    if (candidate.providerConfidence === 'LOW' || candidate.providerConfidence === 'NONE') {
      reviewReasons.add('LOW_CONFIDENCE');
      ambiguity.add('SYMBOL_AMBIGUOUS');
    }
    if (ambiguity.size > 0) reviewReasons.add('AMBIGUOUS');

    for (const flag of ambiguity) ambiguityAll.add(flag);

    const quantityBlocked = blockedReasons.includes('QUANTITY_UNCLEAR') ||
      blockedReasons.includes('QUANTITY_INVALID');
    const evidenceBlocked = blockedReasons.includes('SOURCE_EVIDENCE_INSUFFICIENT');
    const lengthBlocked = isLength && !measurementAllowed;
    const inventionBlocked = blockedReasons.includes('AI_COST_OR_MATERIAL_INVENTION_BLOCKED');

    // Length without scale: keep as draft note with null quantity — never invent metres.
    const draftQuantity =
      quantityBlocked || lengthBlocked ? null : candidate.quantity;

    const lifecycle: AiTakeoffItemLifecycle =
      ambiguity.size > 0 ||
      candidate.providerConfidence === 'LOW' ||
      candidate.providerConfidence === 'NONE' ||
      lengthBlocked
        ? 'REVIEW_REQUIRED'
        : 'AI_DRAFT';

    // AI never confirms — Row 94 confidence stays review/insufficient.
    const row94Confidence: PlanItemConfidence =
      draftQuantity == null || evidenceBlocked || lengthBlocked
        ? 'INSUFFICIENT_INFORMATION'
        : 'REVIEW_REQUIRED';

    const descKey = candidate.description.trim().toLowerCase();
    if (prevSet.size > 0 && !prevSet.has(descKey)) {
      changedItemKeys.push(candidate.clientKey);
    }

    if (quantityBlocked || evidenceBlocked || inventionBlocked) blockedCount += 1;

    items.push({
      clientKey: candidate.clientKey,
      pointType: candidate.pointType,
      subtypeLabel: candidate.subtypeLabel ?? null,
      description: candidate.description.trim(),
      quantity: draftQuantity,
      unit: candidate.unit,
      isLengthMeasurement: isLength,
      quantityOrigin: candidate.quantityOrigin,
      pageReference: candidate.pageReference ?? null,
      annotationRef: candidate.annotationRef ?? null,
      supportingText: candidate.supportingText ?? null,
      lifecycle,
      row94Confidence,
      providerConfidence: candidate.providerConfidence,
      ambiguityFlags: [...ambiguity],
      measurementAllowed,
      evidence: {
        sourceDocumentId: source.sourceDocumentId,
        revisionLabel: source.revisionLabel,
        pageReference: candidate.pageReference ?? null,
        sheetLabel: null,
        pointType: candidate.pointType,
        quantityOrigin: candidate.quantityOrigin,
        supportingText: candidate.supportingText ?? null,
        annotationRef: candidate.annotationRef ?? null,
        scaleStatus: input.scaleStatus,
        scaleProvenance: input.scaleProvenance ?? null,
      },
      blockedReasons,
      humanConfirmed: false,
      entersCanonicalEstimate: false,
    });
  }

  const acceptedForDraftCount = items.filter((i) => i.quantity != null).length;
  let status: AiTakeoffRunStatus = 'READY_FOR_REVIEW';
  if (input.evidenceCandidates.length === 0) {
    status = 'EMPTY_DRAFT';
    missingInputs.push('evidenceCandidates');
    warnings.push('SOURCE_EVIDENCE_INSUFFICIENT');
    ambiguityAll.add('SOURCE_EVIDENCE_INSUFFICIENT');
  }

  // AI drafts always require human review — AI cannot clear the gate.
  // Do not invent a monetary high-value threshold when none is configured.

  const auraNarrativeFacts = [
    `Authorised source: ${source.sourceDocumentId ?? source.sourceFilename ?? 'unknown'} rev ${source.revisionLabel ?? '—'}.`,
    `Scale status: ${input.scaleStatus}${input.scaleProvenance ? ` (${input.scaleProvenance})` : ''}.`,
    `Draft items proposed: ${items.length}; with quantity: ${acceptedForDraftCount}; blocked: ${blockedCount}.`,
    'AI take-off is DRAFT only — human review required before quote generation.',
    'AI cannot approve its own take-off; costs/materials are not invented here.',
    ...(missingInputs.length
      ? [`Missing inputs: ${missingInputs.join(', ')}.`]
      : []),
    ...(ambiguityAll.size
      ? [`Ambiguity: ${[...ambiguityAll].join(', ')}.`]
      : []),
  ];

  return {
    status,
    providerPath: 'AURA_STRUCTURED_EVIDENCE_CANDIDATES',
    draftOnly: true,
    aiMayApprove: false,
    items,
    ambiguityFlags: [...ambiguityAll],
    humanReviewRequired: true as const,
    humanReviewReasons: [...reviewReasons],
    revision: {
      changed: revision.changed || changedItemKeys.length > 0,
      flags: revision.flags,
      returnedToReview: revision.changed || changedItemKeys.length > 0,
      changedItemKeys,
    },
    missingInputs,
    warnings,
    inventedCostBlocked: true,
    inventedQuantityBlocked: true,
    row92: {
      status: input.row92Status ?? 'DRAFT',
      globalAutomationEnabled: false,
      labelled: 'DRAFT_OFF',
    },
    row99NotStarted: true,
    evidenceSummary: {
      sourceDocumentId: source.sourceDocumentId,
      revisionLabel: source.revisionLabel,
      candidateCount: input.evidenceCandidates.length,
      acceptedForDraftCount,
      blockedCount,
    },
    auraNarrativeFacts,
    idempotencyKey: input.idempotencyKey ?? null,
  };
}

/**
 * Human accept → canonical Row 94 item input (still REVIEW_REQUIRED unless confirm=true).
 * AI path must never call this with actorRole implying self-approve.
 */
export function acceptAiTakeoffItemToRow94(input: {
  item: AiTakeoffDraftItem;
  humanConfirm: boolean;
  actorRole?: string | null;
  actorPermissions?: string[] | null;
}):
  | { ok: true; item: PlanEstimateItemInput; lifecycle: AiTakeoffItemLifecycle }
  | { ok: false; code: string } {
  if (input.item.lifecycle === 'REJECTED') {
    return { ok: false, code: 'ITEM_REJECTED' };
  }
  if (input.item.quantity == null || !Number.isFinite(input.item.quantity)) {
    return { ok: false, code: 'QUANTITY_UNCLEAR' };
  }
  if (input.item.isLengthMeasurement && !input.item.measurementAllowed) {
    return { ok: false, code: 'MEASUREMENT_UNSUPPORTED' };
  }
  if (!canManagePlanEstimates({
    roleName: input.actorRole,
    permissions: input.actorPermissions,
  })) {
    return { ok: false, code: 'FORBIDDEN' };
  }
  // AI / system may never self-approve to CONFIRMED.
  const role = (input.actorRole ?? '').toLowerCase();
  if (role === 'ai' || role === 'aura' || role === 'system') {
    return { ok: false, code: 'AI_CANNOT_SELF_APPROVE' };
  }

  const confidence: PlanItemConfidence = input.humanConfirm ? 'CONFIRMED' : 'REVIEW_REQUIRED';
  if (input.humanConfirm && !canApprovePlanEstimate({
    roleName: input.actorRole,
    permissions: input.actorPermissions,
  }) && !canManagePlanEstimates({
    roleName: input.actorRole,
    permissions: input.actorPermissions,
  })) {
    return { ok: false, code: 'FORBIDDEN' };
  }

  return {
    ok: true,
    lifecycle: input.humanConfirm ? 'HUMAN_CONFIRMED' : 'REVIEW_REQUIRED',
    item: {
      pointType: input.item.pointType,
      subtypeLabel: input.item.subtypeLabel,
      description: input.item.description,
      quantity: input.item.quantity,
      unit: input.item.unit,
      quantityOrigin: mapQuantityOriginForRow94(input.item.quantityOrigin),
      pageReference: input.item.pageReference,
      planAnnotationRef: input.item.annotationRef,
      confidence,
      customerVisibleScopeText: input.item.description,
    },
  };
}

export function rejectAiTakeoffItem(item: AiTakeoffDraftItem): AiTakeoffDraftItem {
  return {
    ...item,
    lifecycle: 'REJECTED',
    humanConfirmed: false,
    entersCanonicalEstimate: false,
    row94Confidence: 'INSUFFICIENT_INFORMATION',
  };
}

export function assertAiCannotSelfApprove(input: {
  lifecycle: AiTakeoffItemLifecycle;
  confidence: PlanItemConfidence;
  actorIsAi: boolean;
}): void {
  if (input.actorIsAi && (input.lifecycle === 'HUMAN_CONFIRMED' || input.confidence === 'CONFIRMED')) {
    throw new Error('AI_CANNOT_SELF_APPROVE');
  }
}

export function assertNoAiTakeoffClientLeak(payload: unknown, path = 'root'): void {
  if (payload == null || typeof payload !== 'object') return;
  if (Array.isArray(payload)) {
    payload.forEach((item, i) => assertNoAiTakeoffClientLeak(item, `${path}[${i}]`));
    return;
  }
  const obj = payload as Record<string, unknown>;
  const forbidden = [
    'aiTakeoff',
    'aiDraftItems',
    'ambiguityFlags',
    'providerConfidence',
    'humanReviewReasons',
    'scaleProvenance',
    'unitCostCents',
    'materialSku',
    'labourHours',
    'auraNarrativeFacts',
    'evidenceCandidates',
    'planAiTakeoffInternal',
  ];
  for (const key of forbidden) {
    if (key in obj && obj[key] != null) {
      throw new Error(`AI take-off internal field leaked at ${path}.${key}`);
    }
  }
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object') assertNoAiTakeoffClientLeak(value, `${path}.${key}`);
  }
}

export function assertRow99NotStarted(started: boolean): void {
  if (started) throw new Error('Row 99 must not start during Row 98');
}

export function assertRow98SafetyGates(input: {
  row92AutomationEnabled: boolean;
  row99Started?: boolean;
  xeroWrites?: number;
  customerSends?: number;
  productionWrites?: number;
}): {
  row92Off: true;
  row99NotStarted: true;
  xeroWrites: 0;
  customerSends: 0;
  productionWrites: 0;
} {
  if (input.row92AutomationEnabled) throw new Error('Row 92 must remain automation=false');
  assertRow99NotStarted(input.row99Started === true);
  if ((input.xeroWrites ?? 0) !== 0) throw new Error('Row 98 requires Xero writes = 0');
  if ((input.customerSends ?? 0) !== 0) throw new Error('Row 98 requires customer sends = 0');
  if ((input.productionWrites ?? 0) !== 0) throw new Error('Row 98 requires production writes = 0');
  return {
    row92Off: true,
    row99NotStarted: true,
    xeroWrites: 0,
    customerSends: 0,
    productionWrites: 0,
  };
}

export function assertRoyalCapeUnchangedForRow98(input: {
  totalCents: number;
  pricingPresentationMode?: string | null;
}): void {
  if (input.totalCents !== PLAN_AI_TAKEOFF_ROYAL_CAPE.expectedTotalCents) {
    throw new Error(`Royal Cape total changed: ${input.totalCents}`);
  }
  if (
    input.pricingPresentationMode != null &&
    input.pricingPresentationMode !== PLAN_AI_TAKEOFF_ROYAL_CAPE.expectedPricingMode
  ) {
    throw new Error('Royal Cape pricing mode changed');
  }
}

/** Deterministic fingerprint for idempotent retry of the same draft inputs. */
export function aiTakeoffIdempotencyFingerprint(input: {
  estimateId: string;
  sourceDocumentId: string | null;
  revisionLabel: string | null;
  candidateKeys: string[];
}): string {
  const keys = [...input.candidateKeys].sort().join('|');
  return `${input.estimateId}:${input.sourceDocumentId ?? 'none'}:${input.revisionLabel ?? 'none'}:${keys}`;
}
