import { and, desc, eq, sql } from 'drizzle-orm';
import {
  companyPricebookRuleSets,
  planEstimateCostComponents,
  planEstimateItems,
  planEstimates,
  securityAuditLogs,
  type DatabaseClient,
} from '@titan/db';
import {
  assertCanApproveForQuote,
  assertCanGenerateDraftQuote,
  assertRow92StillInactiveForPlanEstimate,
  buildPlanEstimateAuditEvent,
  buildPlanEstimateSummary,
  buildPlanVsActualComparison,
  canApprovePlanEstimate,
  canManagePlanEstimates,
  mapEstimateItemsToQuoteLines,
  planRevisionRequiresReview,
  resolvePlanEstimateStatus,
  type PlanCostComponentType,
  type PlanCostProvenance,
  type PlanEstimateStatus,
  type PlanItemConfidence,
  type PlanQuantityOrigin,
  type PlanScaleStatus,
  type PlanTakeoffPointType,
} from '@titan/shared';
import type { FinanceService } from './finance.service.js';

export class PlanEstimateServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'PlanEstimateServiceError';
  }
}

export type PlanEstimateActor = {
  companyId: string;
  userId?: string | null;
  roleName?: string | null;
  permissions?: string[] | null;
};

export class PlanEstimateService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly financeService: FinanceService,
  ) {}

  private assertManage(actor: PlanEstimateActor) {
    if (!canManagePlanEstimates(actor)) {
      throw new PlanEstimateServiceError('FORBIDDEN', 'Plan estimate access denied', 403);
    }
  }

  private assertApprove(actor: PlanEstimateActor) {
    if (!canApprovePlanEstimate(actor)) {
      throw new PlanEstimateServiceError('FORBIDDEN', 'Plan estimate approval denied', 403);
    }
  }

  private async audit(
    actor: PlanEstimateActor,
    eventType: Parameters<typeof buildPlanEstimateAuditEvent>[0]['eventType'],
    estimateId: string,
    sourceDocumentId?: string | null,
    before?: unknown,
    after?: unknown,
  ) {
    const event = buildPlanEstimateAuditEvent({
      eventType,
      companyId: actor.companyId,
      estimateId,
      actorId: actor.userId ?? null,
      sourceDocumentId,
      before,
      after,
    });
    await this.db.insert(securityAuditLogs).values({
      companyId: event.companyId,
      category: 'financial',
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      userId: actor.userId ?? null,
      metadata: event.metadata,
    });
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
    assertRow92StillInactiveForPlanEstimate({
      status: rule?.status ?? 'DRAFT',
      globalAutomationEnabled: rule?.globalAutomationEnabled === true,
    });
  }

  async list(actor: PlanEstimateActor) {
    this.assertManage(actor);
    const rows = await this.db
      .select()
      .from(planEstimates)
      .where(eq(planEstimates.companyId, actor.companyId))
      .orderBy(desc(planEstimates.updatedAt))
      .limit(100);
    return { estimates: rows };
  }

  async get(actor: PlanEstimateActor, estimateId: string) {
    this.assertManage(actor);
    const [estimate] = await this.db
      .select()
      .from(planEstimates)
      .where(and(eq(planEstimates.id, estimateId), eq(planEstimates.companyId, actor.companyId)))
      .limit(1);
    if (!estimate) {
      throw new PlanEstimateServiceError('NOT_FOUND', 'Plan estimate not found', 404);
    }
    const items = await this.db
      .select()
      .from(planEstimateItems)
      .where(
        and(
          eq(planEstimateItems.estimateId, estimateId),
          eq(planEstimateItems.companyId, actor.companyId),
        ),
      )
      .orderBy(planEstimateItems.position);
    const components = await this.db
      .select()
      .from(planEstimateCostComponents)
      .where(
        and(
          eq(planEstimateCostComponents.estimateId, estimateId),
          eq(planEstimateCostComponents.companyId, actor.companyId),
        ),
      )
      .orderBy(planEstimateCostComponents.position);

    const summary = buildPlanEstimateSummary({
      components: components.map((c) => ({
        componentType: c.componentType as PlanCostComponentType,
        quantity: Number(c.quantity),
        unitCostCents: c.unitCostCents,
        costProvenance: c.costProvenance as PlanCostProvenance,
      })),
      sell: {
        proposedSellExVatCents: estimate.proposedSellExVatCents,
        sellSource: (estimate.sellSource as 'MANUAL_DRAFT' | 'MISSING') ?? 'MISSING',
      },
    });

    return { estimate, items, components, summary };
  }

  async create(
    actor: PlanEstimateActor,
    input: {
      customerId?: string | null;
      propertyId?: string | null;
      jobId?: string | null;
      sourceDocumentId?: string | null;
      sourceFilename?: string | null;
      sourceFileHash?: string | null;
      sourceRevisionLabel?: string | null;
      scaleStatus?: PlanScaleStatus;
      scaleProvenance?: string | null;
      proposedSellExVatCents?: number | null;
      sellSource?: string;
      clientActionId?: string | null;
      items: Array<{
        pointType: PlanTakeoffPointType;
        subtypeLabel?: string | null;
        description: string;
        quantity: number;
        unit?: string;
        quantityOrigin: PlanQuantityOrigin;
        pageReference?: string | null;
        planAnnotationRef?: string | null;
        confidence: PlanItemConfidence;
        customerVisibleScopeText?: string | null;
      }>;
      costComponents?: Array<{
        estimateItemIndex?: number | null;
        componentType: PlanCostComponentType;
        description: string;
        quantity: number;
        unit?: string;
        unitCostCents?: number | null;
        costProvenance: PlanCostProvenance;
        catalogueItemId?: string | null;
      }>;
    },
  ) {
    this.assertManage(actor);
    await this.assertRow92Safe(actor.companyId);

    if (input.clientActionId) {
      const [existing] = await this.db
        .select()
        .from(planEstimates)
        .where(
          and(
            eq(planEstimates.companyId, actor.companyId),
            eq(planEstimates.clientActionId, input.clientActionId),
          ),
        )
        .limit(1);
      if (existing) {
        return { estimate: existing, idempotent: true as const };
      }
    }

    const status = resolvePlanEstimateStatus({ items: input.items });
    const [estimate] = await this.db
      .insert(planEstimates)
      .values({
        companyId: actor.companyId,
        customerId: input.customerId ?? null,
        propertyId: input.propertyId ?? null,
        jobId: input.jobId ?? null,
        sourceDocumentId: input.sourceDocumentId ?? null,
        sourceFilename: input.sourceFilename ?? null,
        sourceFileHash: input.sourceFileHash ?? null,
        sourceRevisionLabel: input.sourceRevisionLabel ?? null,
        sourceUploadedAt: input.sourceDocumentId || input.sourceFilename ? new Date() : null,
        status,
        scaleStatus: input.scaleStatus ?? 'SCALE_NOT_PROVIDED',
        scaleProvenance: input.scaleProvenance ?? null,
        proposedSellExVatCents: input.proposedSellExVatCents ?? null,
        sellSource: input.sellSource ?? (input.proposedSellExVatCents != null ? 'MANUAL_DRAFT' : 'MISSING'),
        clientActionId: input.clientActionId ?? null,
        createdBy: actor.userId ?? null,
      })
      .returning();

    const itemIds: string[] = [];
    for (let i = 0; i < input.items.length; i += 1) {
      const item = input.items[i]!;
      const [row] = await this.db
        .insert(planEstimateItems)
        .values({
          companyId: actor.companyId,
          estimateId: estimate!.id,
          pointType: item.pointType,
          subtypeLabel: item.subtypeLabel ?? null,
          description: item.description,
          quantity: String(item.quantity),
          unit: item.unit ?? 'each',
          quantityOrigin: item.quantityOrigin,
          pageReference: item.pageReference ?? null,
          planAnnotationRef: item.planAnnotationRef ?? null,
          confidence: item.confidence,
          customerVisibleScopeText: item.customerVisibleScopeText ?? null,
          enteredBy: actor.userId ?? null,
          position: i,
        })
        .returning();
      itemIds.push(row!.id);
      await this.audit(actor, 'plan_takeoff_item_added', estimate!.id, estimate!.sourceDocumentId, null, row);
    }

    for (let i = 0; i < (input.costComponents ?? []).length; i += 1) {
      const c = input.costComponents![i]!;
      const itemId =
        c.estimateItemIndex != null && c.estimateItemIndex >= 0
          ? itemIds[c.estimateItemIndex] ?? null
          : null;
      await this.db.insert(planEstimateCostComponents).values({
        companyId: actor.companyId,
        estimateId: estimate!.id,
        estimateItemId: itemId,
        componentType: c.componentType,
        description: c.description,
        quantity: String(c.quantity),
        unit: c.unit ?? 'each',
        unitCostCents: c.unitCostCents ?? null,
        costProvenance: c.costProvenance,
        catalogueItemId: c.catalogueItemId ?? null,
        position: i,
      });
    }

    await this.audit(
      actor,
      'plan_estimate_created',
      estimate!.id,
      estimate!.sourceDocumentId,
      null,
      { status: estimate!.status },
    );
    if (estimate!.sourceDocumentId || estimate!.sourceFilename) {
      await this.audit(actor, 'plan_document_linked', estimate!.id, estimate!.sourceDocumentId);
    }
    if (status === 'REVIEW_REQUIRED') {
      await this.audit(actor, 'plan_estimate_review_requested', estimate!.id);
    }
    return { estimate: estimate!, idempotent: false as const };
  }

  async markReviewed(actor: PlanEstimateActor, estimateId: string) {
    this.assertApprove(actor);
    const detail = await this.get(actor, estimateId);
    if (detail.estimate.status === 'SUPERSEDED') {
      throw new PlanEstimateServiceError('PLAN_ESTIMATE_SUPERSEDED', 'Estimate superseded', 400);
    }
    const [updated] = await this.db
      .update(planEstimates)
      .set({
        status: 'REVIEWED',
        reviewedBy: actor.userId ?? null,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(planEstimates.id, estimateId), eq(planEstimates.companyId, actor.companyId)),
      )
      .returning();
    await this.audit(actor, 'plan_estimate_reviewed', estimateId);
    return { estimate: updated! };
  }

  async approveForQuote(actor: PlanEstimateActor, estimateId: string) {
    this.assertApprove(actor);
    const detail = await this.get(actor, estimateId);
    try {
      assertCanApproveForQuote(detail.estimate.status as PlanEstimateStatus);
    } catch (error) {
      throw new PlanEstimateServiceError(
        'PLAN_ESTIMATE_REVIEW_REQUIRED',
        error instanceof Error ? error.message : 'Review required',
        400,
      );
    }
    // If still REVIEW_REQUIRED items, block
    if (detail.items.some((i) => i.confidence !== 'CONFIRMED')) {
      throw new PlanEstimateServiceError(
        'PLAN_ESTIMATE_REVIEW_REQUIRED',
        'All take-off items must be CONFIRMED before approval for quote',
        400,
      );
    }
    const [updated] = await this.db
      .update(planEstimates)
      .set({
        status: 'APPROVED_FOR_QUOTE',
        approvedBy: actor.userId ?? null,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(planEstimates.id, estimateId), eq(planEstimates.companyId, actor.companyId)),
      )
      .returning();
    await this.audit(actor, 'plan_estimate_approved', estimateId);
    return { estimate: updated! };
  }

  async generateDraftQuote(
    actor: PlanEstimateActor,
    estimateId: string,
    input: { clientActionId: string; customerId?: string | null },
  ) {
    this.assertManage(actor);
    await this.assertRow92Safe(actor.companyId);
    const detail = await this.get(actor, estimateId);

    if (detail.estimate.quoteId) {
      return {
        quoteId: detail.estimate.quoteId,
        idempotent: true as const,
        estimate: detail.estimate,
      };
    }

    try {
      assertCanGenerateDraftQuote(detail.estimate.status as PlanEstimateStatus);
    } catch (error) {
      throw new PlanEstimateServiceError(
        'PLAN_ESTIMATE_NOT_APPROVED_FOR_QUOTE',
        error instanceof Error ? error.message : 'Not approved',
        400,
      );
    }

    const customerId = input.customerId ?? detail.estimate.customerId;
    if (!customerId) {
      throw new PlanEstimateServiceError('VALIDATION_ERROR', 'customerId required', 400);
    }

    const unitPrice =
      detail.estimate.proposedSellExVatCents != null && detail.items.filter((i) => i.confidence === 'CONFIRMED').length === 1
        ? detail.estimate.proposedSellExVatCents
        : Math.round(
            (detail.estimate.proposedSellExVatCents ?? 0) /
              Math.max(1, detail.items.filter((i) => i.confidence === 'CONFIRMED').length),
          );

    const lineInputs = mapEstimateItemsToQuoteLines({
      items: detail.items.map((i) => ({
        description: i.description,
        quantity: Number(i.quantity),
        customerVisibleScopeText: i.customerVisibleScopeText,
        confidence: i.confidence as PlanItemConfidence,
        pointType: i.pointType as PlanTakeoffPointType,
      })),
      defaultUnitPriceCents: unitPrice,
    });

    if (!lineInputs.length) {
      throw new PlanEstimateServiceError(
        'VALIDATION_ERROR',
        'No CONFIRMED take-off items to quote',
        400,
      );
    }

    // Attach unit costs from material components where available (estimate only — not inventing)
    const materialComponents = detail.components.filter((c) => c.componentType === 'MATERIAL');
    const quote = await this.financeService.createQuote(
      {
        companyId: actor.companyId,
        userId: actor.userId ?? undefined,
        permissions: actor.permissions ?? ['finance:write', '*'],
        roleName: actor.roleName ?? 'Owner',
      },
      {
        customerId,
        jobId: detail.estimate.jobId,
        propertyId: detail.estimate.propertyId,
        status: 'draft',
        clientActionId: input.clientActionId,
        scopeOfWork: `Generated from plan estimate ${estimateId} v${detail.estimate.estimateVersion}`,
        pricingPresentationMode: 'ITEMISED',
        labourIncluded: false,
        calloutIncluded: false,
        lineItems: lineInputs.map((line, idx) => ({
          ...line,
          // Persist 0 when estimate material cost unknown — do not invent supplier cost.
          unitCostCents: materialComponents[idx]?.unitCostCents ?? 0,
        })),
      },
    );

    const [updated] = await this.db
      .update(planEstimates)
      .set({ quoteId: quote.id, updatedAt: new Date() })
      .where(
        and(eq(planEstimates.id, estimateId), eq(planEstimates.companyId, actor.companyId)),
      )
      .returning();

    await this.audit(actor, 'plan_quote_generated', estimateId, detail.estimate.sourceDocumentId, null, {
      quoteId: quote.id,
    });

    return { quoteId: quote.id, idempotent: false as const, estimate: updated! };
  }

  async linkJob(actor: PlanEstimateActor, estimateId: string, jobId: string) {
    this.assertManage(actor);
    const detail = await this.get(actor, estimateId);
    if (detail.estimate.jobId && detail.estimate.jobId !== jobId) {
      throw new PlanEstimateServiceError(
        'VALIDATION_ERROR',
        'Estimate already linked to a different job',
        409,
      );
    }
    const [updated] = await this.db
      .update(planEstimates)
      .set({ jobId, updatedAt: new Date() })
      .where(
        and(eq(planEstimates.id, estimateId), eq(planEstimates.companyId, actor.companyId)),
      )
      .returning();
    await this.audit(actor, 'plan_estimate_job_linked', estimateId, null, null, { jobId });
    return { estimate: updated! };
  }

  async supersedeWithRevision(
    actor: PlanEstimateActor,
    estimateId: string,
    nextRevisionLabel: string,
    clientActionId?: string | null,
  ) {
    this.assertManage(actor);
    const detail = await this.get(actor, estimateId);
    const flags = planRevisionRequiresReview({
      previousRevisionLabel: detail.estimate.sourceRevisionLabel,
      nextRevisionLabel,
    });
    const created = await this.create(actor, {
      customerId: detail.estimate.customerId,
      propertyId: detail.estimate.propertyId,
      jobId: detail.estimate.jobId,
      sourceDocumentId: detail.estimate.sourceDocumentId,
      sourceFilename: detail.estimate.sourceFilename,
      sourceFileHash: detail.estimate.sourceFileHash,
      sourceRevisionLabel: nextRevisionLabel,
      scaleStatus: detail.estimate.scaleStatus as PlanScaleStatus,
      scaleProvenance: detail.estimate.scaleProvenance,
      proposedSellExVatCents: detail.estimate.proposedSellExVatCents,
      sellSource: detail.estimate.sellSource,
      clientActionId: clientActionId ?? null,
      items: detail.items.map((i) => ({
        pointType: i.pointType as PlanTakeoffPointType,
        subtypeLabel: i.subtypeLabel,
        description: i.description,
        quantity: Number(i.quantity),
        unit: i.unit,
        quantityOrigin: i.quantityOrigin as PlanQuantityOrigin,
        pageReference: i.pageReference,
        planAnnotationRef: i.planAnnotationRef,
        confidence: 'REVIEW_REQUIRED' as PlanItemConfidence,
        customerVisibleScopeText: i.customerVisibleScopeText,
      })),
      costComponents: detail.components.map((c) => ({
        componentType: c.componentType as PlanCostComponentType,
        description: c.description,
        quantity: Number(c.quantity),
        unit: c.unit,
        unitCostCents: c.unitCostCents,
        costProvenance: c.costProvenance as PlanCostProvenance,
        catalogueItemId: c.catalogueItemId,
      })),
    });

    // Bump version on new estimate
    await this.db
      .update(planEstimates)
      .set({
        estimateVersion: detail.estimate.estimateVersion + 1,
        status: 'REVIEW_REQUIRED',
        updatedAt: new Date(),
      })
      .where(eq(planEstimates.id, created.estimate.id));

    await this.db
      .update(planEstimates)
      .set({
        status: 'SUPERSEDED',
        supersededBy: created.estimate.id,
        updatedAt: new Date(),
      })
      .where(eq(planEstimates.id, estimateId));

    await this.audit(actor, 'plan_estimate_superseded', estimateId, null, null, {
      supersededBy: created.estimate.id,
      flags: flags.flags,
    });

    return { previousId: estimateId, nextId: created.estimate.id, flags: flags.flags };
  }

  async comparison(actor: PlanEstimateActor, estimateId: string, jobComplete = false) {
    const detail = await this.get(actor, estimateId);
    const comparison = buildPlanVsActualComparison({
      estimateSummary: detail.summary,
      jobComplete,
      actual: detail.estimate.jobId
        ? {
            materialsCostCents: null,
            labourCostCents: null,
            otherDirectCostCents: null,
            revenueCents: null,
            grossProfitCents: null,
            actualCostComplete: false,
          }
        : null,
    });
    // When job linked but actuals not loaded here, status is ACTUAL_COST_INCOMPLETE / NO_JOB
    if (detail.estimate.jobId && comparison.status === 'ACTUAL_COST_INCOMPLETE') {
      comparison.status = 'PROVISIONAL';
    }
    return { comparison, estimateId, jobId: detail.estimate.jobId };
  }

  async stagingAudit(companyId: string) {
    const [{ estimateCount }] = await this.db
      .select({ estimateCount: sql<number>`count(*)::int` })
      .from(planEstimates)
      .where(eq(planEstimates.companyId, companyId));
    const [{ quoteLinked }] = await this.db
      .select({ quoteLinked: sql<number>`count(*)::int` })
      .from(planEstimates)
      .where(
        and(eq(planEstimates.companyId, companyId), sql`${planEstimates.quoteId} is not null`),
      );
    return { estimateCount: estimateCount ?? 0, quoteLinked: quoteLinked ?? 0 };
  }
}
