import { and, desc, eq } from 'drizzle-orm';
import {
  companyPricebookRuleSets,
  planEstimateAiTakeoffItems,
  planEstimateAiTakeoffs,
  planEstimateItems,
  planEstimates,
  securityAuditLogs,
  type DatabaseClient,
} from '@titan/db';
import {
  acceptAiTakeoffItemToRow94,
  aiTakeoffIdempotencyFingerprint,
  assertRow98SafetyGates,
  canManagePlanEstimates,
  rejectAiTakeoffItem,
  resolveAiPlanTakeoffDraft,
  resolvePlanEstimateStatus,
  type AiTakeoffDraftItem,
  type AiTakeoffEvidenceCandidate,
  type PlanDocumentProvenance,
  type PlanItemConfidence,
  type PlanQuantityOrigin,
  type PlanScaleStatus,
  type PlanTakeoffPointType,
} from '@titan/shared';

export class PlanAiTakeoffServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'PlanAiTakeoffServiceError';
  }
}

export type PlanAiTakeoffActor = {
  companyId: string;
  userId?: string | null;
  roleName?: string | null;
  permissions?: string[] | null;
};

/**
 * Provider path: AURA structured evidence candidates.
 * Callers (or fixtures) supply evidence-backed candidates — this service never invents them.
 */
export class PlanAiTakeoffService {
  constructor(private readonly db: DatabaseClient) {}

  private assertManage(actor: PlanAiTakeoffActor) {
    const role = (actor.roleName ?? '').toLowerCase();
    if (role.includes('client') || role === 'technician' || role.includes('tech')) {
      throw new PlanAiTakeoffServiceError('FORBIDDEN', 'AI take-off access denied', 403);
    }
    if (!canManagePlanEstimates(actor)) {
      throw new PlanAiTakeoffServiceError('FORBIDDEN', 'AI take-off access denied', 403);
    }
  }

  private async assertRow92Safe(companyId: string) {
    const [rule] = await this.db
      .select({
        status: companyPricebookRuleSets.status,
        globalAutomationEnabled: companyPricebookRuleSets.globalAutomationEnabled,
      })
      .from(companyPricebookRuleSets)
      .where(eq(companyPricebookRuleSets.companyId, companyId))
      .orderBy(desc(companyPricebookRuleSets.version))
      .limit(1);
    assertRow98SafetyGates({
      row92AutomationEnabled: rule?.globalAutomationEnabled === true,
      row99Started: false,
      xeroWrites: 0,
      customerSends: 0,
      productionWrites: 0,
    });
    return { status: rule?.status ?? 'DRAFT', automation: false as const };
  }

  private async audit(
    actor: PlanAiTakeoffActor,
    action: string,
    estimateId: string,
    metadata: Record<string, unknown>,
  ) {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'financial',
      action,
      entityType: 'plan_estimate_ai_takeoff',
      entityId: estimateId,
      userId: actor.userId ?? null,
      metadata: {
        ...metadata,
        customerFacing: false,
        timestamp: new Date().toISOString(),
      },
    });
  }

  async listForEstimate(actor: PlanAiTakeoffActor, estimateId: string) {
    this.assertManage(actor);
    const runs = await this.db
      .select()
      .from(planEstimateAiTakeoffs)
      .where(
        and(
          eq(planEstimateAiTakeoffs.companyId, actor.companyId),
          eq(planEstimateAiTakeoffs.estimateId, estimateId),
        ),
      )
      .orderBy(desc(planEstimateAiTakeoffs.createdAt))
      .limit(20);
    const items = await this.db
      .select()
      .from(planEstimateAiTakeoffItems)
      .where(
        and(
          eq(planEstimateAiTakeoffItems.companyId, actor.companyId),
          eq(planEstimateAiTakeoffItems.estimateId, estimateId),
        ),
      )
      .orderBy(desc(planEstimateAiTakeoffItems.createdAt))
      .limit(200);
    return { runs, items };
  }

  /**
   * Generate AI DRAFT take-off from evidence candidates.
   * Without an authorised source → NO_AUTHORISED_PLAN_SOURCE_AVAILABLE (no fake plan).
   */
  async generateDraft(
    actor: PlanAiTakeoffActor,
    estimateId: string,
    input: {
      evidenceCandidates?: AiTakeoffEvidenceCandidate[];
      complexWork?: boolean;
      complianceSensitive?: boolean;
      idempotencyKey?: string | null;
      previousRevisionLabel?: string | null;
    } = {},
  ) {
    this.assertManage(actor);
    const row92 = await this.assertRow92Safe(actor.companyId);

    const [estimate] = await this.db
      .select()
      .from(planEstimates)
      .where(
        and(eq(planEstimates.companyId, actor.companyId), eq(planEstimates.id, estimateId)),
      )
      .limit(1);
    if (!estimate) {
      throw new PlanAiTakeoffServiceError('ESTIMATE_NOT_FOUND', 'Plan estimate not found', 404);
    }

    const authorisedSource: PlanDocumentProvenance | null =
      estimate.sourceDocumentId || (estimate.sourceFilename && estimate.sourceFileHash)
        ? {
            sourceDocumentId: estimate.sourceDocumentId,
            sourceFilename: estimate.sourceFilename,
            uploadedAt: estimate.sourceUploadedAt?.toISOString() ?? null,
            customerId: estimate.customerId,
            propertyId: estimate.propertyId,
            jobId: estimate.jobId,
            pageNumber: null,
            fileHash: estimate.sourceFileHash,
            revisionLabel: estimate.sourceRevisionLabel,
          }
        : null;

    const candidates = input.evidenceCandidates ?? [];
    const idempotencyKey =
      input.idempotencyKey ??
      aiTakeoffIdempotencyFingerprint({
        estimateId,
        sourceDocumentId: authorisedSource?.sourceDocumentId ?? null,
        revisionLabel: authorisedSource?.revisionLabel ?? null,
        candidateKeys: candidates.map((c) => c.clientKey),
      });

    if (input.idempotencyKey) {
      const [existing] = await this.db
        .select()
        .from(planEstimateAiTakeoffs)
        .where(
          and(
            eq(planEstimateAiTakeoffs.companyId, actor.companyId),
            eq(planEstimateAiTakeoffs.estimateId, estimateId),
            eq(planEstimateAiTakeoffs.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (existing) {
        const existingItems = await this.db
          .select()
          .from(planEstimateAiTakeoffItems)
          .where(
            and(
              eq(planEstimateAiTakeoffItems.companyId, actor.companyId),
              eq(planEstimateAiTakeoffItems.takeoffId, existing.id),
            ),
          );
        return { takeoff: existing, items: existingItems, idempotentReplay: true as const };
      }
    }

    const resolved = resolveAiPlanTakeoffDraft({
      authorisedSource,
      scaleStatus: estimate.scaleStatus as PlanScaleStatus,
      scaleProvenance: estimate.scaleProvenance,
      evidenceCandidates: candidates,
      complexWork: input.complexWork,
      complianceSensitive: input.complianceSensitive,
      previousRevisionLabel: input.previousRevisionLabel ?? null,
      nextRevisionLabel: estimate.sourceRevisionLabel,
      idempotencyKey,
      row92Status: row92.status,
      row92GlobalAutomationEnabled: false,
    });

    const [takeoff] = await this.db
      .insert(planEstimateAiTakeoffs)
      .values({
        companyId: actor.companyId,
        estimateId,
        sourceDocumentId: authorisedSource?.sourceDocumentId ?? null,
        sourceRevisionLabel: authorisedSource?.revisionLabel ?? null,
        scaleStatus: estimate.scaleStatus,
        scaleProvenance: estimate.scaleProvenance,
        status: resolved.status,
        providerPath: resolved.providerPath,
        idempotencyKey,
        humanReviewRequired: resolved.humanReviewRequired,
        humanReviewReasons: resolved.humanReviewReasons,
        ambiguityFlags: resolved.ambiguityFlags,
        warnings: resolved.warnings,
        auraNarrativeFacts: resolved.auraNarrativeFacts,
        evidenceSummary: resolved.evidenceSummary,
        revisionMeta: resolved.revision,
        createdBy: actor.userId ?? null,
      })
      .returning();

    const insertedItems =
      resolved.items.length > 0
        ? await this.db
            .insert(planEstimateAiTakeoffItems)
            .values(
              resolved.items.map((item, index) => ({
                companyId: actor.companyId,
                takeoffId: takeoff.id,
                estimateId,
                clientKey: item.clientKey,
                pointType: item.pointType,
                subtypeLabel: item.subtypeLabel,
                description: item.description,
                quantity: item.quantity != null ? String(item.quantity) : null,
                unit: item.unit,
                isLengthMeasurement: item.isLengthMeasurement,
                quantityOrigin: item.quantityOrigin,
                pageReference: item.pageReference,
                annotationRef: item.annotationRef,
                supportingText: item.supportingText,
                lifecycle: item.lifecycle,
                row94Confidence: item.row94Confidence,
                providerConfidence: item.providerConfidence,
                ambiguityFlags: item.ambiguityFlags,
                measurementAllowed: item.measurementAllowed,
                evidence: item.evidence,
                blockedReasons: item.blockedReasons,
                humanConfirmed: false,
                entersCanonicalEstimate: false,
                position: index,
              })),
            )
            .returning()
        : [];

    // Force estimate into review when AI draft produced items
    if (resolved.items.length > 0 && estimate.status !== 'SUPERSEDED') {
      await this.db
        .update(planEstimates)
        .set({
          status: resolvePlanEstimateStatus({
            items: [{ confidence: 'REVIEW_REQUIRED' }],
            explicitStatus: 'REVIEW_REQUIRED',
          }),
          updatedAt: new Date(),
        })
        .where(
          and(eq(planEstimates.companyId, actor.companyId), eq(planEstimates.id, estimateId)),
        );
    }

    await this.audit(actor, 'plan_ai_takeoff_draft_generated', estimateId, {
      takeoffId: takeoff.id,
      status: resolved.status,
      itemCount: insertedItems.length,
      idempotencyKey,
      providerPath: resolved.providerPath,
    });

    return {
      takeoff,
      items: insertedItems,
      intelligence: resolved,
      idempotentReplay: false as const,
      readOnlyQuoteSafe: true,
    };
  }

  private toDraftItem(row: typeof planEstimateAiTakeoffItems.$inferSelect): AiTakeoffDraftItem {
    return {
      clientKey: row.clientKey,
      pointType: row.pointType as PlanTakeoffPointType,
      subtypeLabel: row.subtypeLabel,
      description: row.description,
      quantity: row.quantity != null ? Number(row.quantity) : null,
      unit: row.unit,
      isLengthMeasurement: row.isLengthMeasurement,
      quantityOrigin: row.quantityOrigin as AiTakeoffDraftItem['quantityOrigin'],
      pageReference: row.pageReference,
      annotationRef: row.annotationRef,
      supportingText: row.supportingText,
      lifecycle: row.lifecycle as AiTakeoffDraftItem['lifecycle'],
      row94Confidence: row.row94Confidence as PlanItemConfidence,
      providerConfidence: row.providerConfidence as AiTakeoffDraftItem['providerConfidence'],
      ambiguityFlags: (row.ambiguityFlags as AiTakeoffDraftItem['ambiguityFlags']) ?? [],
      measurementAllowed: row.measurementAllowed,
      evidence: row.evidence as AiTakeoffDraftItem['evidence'],
      blockedReasons: (row.blockedReasons as string[]) ?? [],
      humanConfirmed: row.humanConfirmed,
      entersCanonicalEstimate: row.entersCanonicalEstimate,
    };
  }

  async acceptItem(
    actor: PlanAiTakeoffActor,
    estimateId: string,
    itemId: string,
    opts: { humanConfirm?: boolean } = {},
  ) {
    this.assertManage(actor);
    await this.assertRow92Safe(actor.companyId);

    const [row] = await this.db
      .select()
      .from(planEstimateAiTakeoffItems)
      .where(
        and(
          eq(planEstimateAiTakeoffItems.companyId, actor.companyId),
          eq(planEstimateAiTakeoffItems.estimateId, estimateId),
          eq(planEstimateAiTakeoffItems.id, itemId),
        ),
      )
      .limit(1);
    if (!row) {
      throw new PlanAiTakeoffServiceError('ITEM_NOT_FOUND', 'AI take-off item not found', 404);
    }
    if (row.entersCanonicalEstimate && row.canonicalItemId) {
      return { alreadyAccepted: true as const, canonicalItemId: row.canonicalItemId };
    }

    const mapped = acceptAiTakeoffItemToRow94({
      item: this.toDraftItem(row),
      humanConfirm: opts.humanConfirm === true,
      actorRole: actor.roleName,
      actorPermissions: actor.permissions,
    });
    if (!mapped.ok) {
      throw new PlanAiTakeoffServiceError(mapped.code, mapped.code, 400);
    }

    const [canonical] = await this.db
      .insert(planEstimateItems)
      .values({
        companyId: actor.companyId,
        estimateId,
        pointType: mapped.item.pointType,
        subtypeLabel: mapped.item.subtypeLabel ?? null,
        description: mapped.item.description,
        quantity: String(mapped.item.quantity),
        unit: mapped.item.unit,
        quantityOrigin: mapped.item.quantityOrigin as PlanQuantityOrigin,
        pageReference: mapped.item.pageReference ?? null,
        planAnnotationRef: mapped.item.planAnnotationRef ?? null,
        confidence: mapped.item.confidence,
        customerVisibleScopeText: mapped.item.customerVisibleScopeText ?? null,
        enteredBy: actor.userId ?? null,
        position: row.position,
      })
      .returning();

    await this.db
      .update(planEstimateAiTakeoffItems)
      .set({
        lifecycle: mapped.lifecycle,
        humanConfirmed: opts.humanConfirm === true,
        entersCanonicalEstimate: true,
        canonicalItemId: canonical.id,
        row94Confidence: mapped.item.confidence,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(planEstimateAiTakeoffItems.companyId, actor.companyId),
          eq(planEstimateAiTakeoffItems.id, itemId),
        ),
      );

    await this.db
      .update(planEstimates)
      .set({
        status: resolvePlanEstimateStatus({
          items: [{ confidence: mapped.item.confidence }],
          explicitStatus: 'REVIEW_REQUIRED',
        }),
        updatedAt: new Date(),
      })
      .where(and(eq(planEstimates.companyId, actor.companyId), eq(planEstimates.id, estimateId)));

    await this.audit(actor, 'plan_ai_takeoff_item_accepted', estimateId, {
      aiItemId: itemId,
      canonicalItemId: canonical.id,
      humanConfirm: opts.humanConfirm === true,
      lifecycle: mapped.lifecycle,
    });

    return {
      alreadyAccepted: false as const,
      canonicalItem: canonical,
      lifecycle: mapped.lifecycle,
    };
  }

  async rejectItem(actor: PlanAiTakeoffActor, estimateId: string, itemId: string) {
    this.assertManage(actor);
    await this.assertRow92Safe(actor.companyId);

    const [row] = await this.db
      .select()
      .from(planEstimateAiTakeoffItems)
      .where(
        and(
          eq(planEstimateAiTakeoffItems.companyId, actor.companyId),
          eq(planEstimateAiTakeoffItems.estimateId, estimateId),
          eq(planEstimateAiTakeoffItems.id, itemId),
        ),
      )
      .limit(1);
    if (!row) {
      throw new PlanAiTakeoffServiceError('ITEM_NOT_FOUND', 'AI take-off item not found', 404);
    }

    const rejected = rejectAiTakeoffItem(this.toDraftItem(row));
    await this.db
      .update(planEstimateAiTakeoffItems)
      .set({
        lifecycle: rejected.lifecycle,
        humanConfirmed: false,
        entersCanonicalEstimate: false,
        row94Confidence: rejected.row94Confidence,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(planEstimateAiTakeoffItems.companyId, actor.companyId),
          eq(planEstimateAiTakeoffItems.id, itemId),
        ),
      );

    await this.audit(actor, 'plan_ai_takeoff_item_rejected', estimateId, {
      aiItemId: itemId,
      // Rejected items never enter quote
      entersCanonicalEstimate: false,
    });

    return { rejected: true as const, entersCanonicalEstimate: false as const };
  }
}
