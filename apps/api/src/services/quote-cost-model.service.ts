import { and, asc, desc, eq, sql } from 'drizzle-orm';
import {
  companyFinanceSettings,
  companyPricebookRuleSets,
  planEstimateCostComponents,
  quoteCostAuditEvents,
  quoteCostComponents,
  quoteCostSnapshots,
  quoteCostWarnings,
  quotes,
  securityAuditLogs,
  type DatabaseClient,
} from '@titan/db';
import {
  assertRow92GlobalAutomationDisabled,
  assertRow96SafetyGates,
  computeComponentTotalCents,
  detectDuplicatePlanImport,
  mapPlanEstimateComponentType,
  mapPlanEstimateProvenance,
  summarizeQuoteCost,
  validateQuoteCostComponent,
  type QuoteCostComponentInput,
  type QuoteCostComponentType,
  type QuoteCostConfidence,
  type QuoteCostProvenance,
  type QuoteCostSummary,
  type QuoteCostVatBasis,
  type QuoteCostWarningCode,
} from '@titan/shared';

export class QuoteCostModelServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'QuoteCostModelServiceError';
  }
}

export type QuoteCostActor = {
  companyId: string;
  userId?: string | null;
  roleName?: string | null;
  permissions?: string[] | null;
};

const EDITABLE_STATUSES = new Set(['draft', 'internal_review']);

function canViewCost(actor: QuoteCostActor): boolean {
  const role = (actor.roleName ?? '').toLowerCase();
  if (role.includes('client') || role.includes('technician') || role.includes('tech')) {
    return false;
  }
  const perms = actor.permissions ?? [];
  return perms.includes('*') || perms.includes('finance:read') || perms.includes('finance:write');
}

function canEditCost(actor: QuoteCostActor): boolean {
  const role = (actor.roleName ?? '').toLowerCase();
  if (role.includes('client') || role.includes('technician') || role.includes('tech')) {
    return false;
  }
  const perms = actor.permissions ?? [];
  return perms.includes('*') || perms.includes('finance:write');
}

export class QuoteCostModelService {
  constructor(private readonly db: DatabaseClient) {}

  private assertView(actor: QuoteCostActor) {
    if (!canViewCost(actor)) {
      throw new QuoteCostModelServiceError('FORBIDDEN', 'Quote cost model access denied', 403);
    }
  }

  private assertEdit(actor: QuoteCostActor) {
    if (!canEditCost(actor)) {
      throw new QuoteCostModelServiceError('FORBIDDEN', 'Quote cost model write denied', 403);
    }
  }

  private async assertRow92Safe(companyId: string) {
    assertRow92GlobalAutomationDisabled(false);
    assertRow96SafetyGates();
    const [rule] = await this.db
      .select({
        status: companyPricebookRuleSets.status,
        globalAutomationEnabled: companyPricebookRuleSets.globalAutomationEnabled,
      })
      .from(companyPricebookRuleSets)
      .where(eq(companyPricebookRuleSets.companyId, companyId))
      .limit(1);
    if (rule?.globalAutomationEnabled === true) {
      throw new QuoteCostModelServiceError(
        'ROW92_AUTOMATION_ACTIVE',
        'Row 92 global automation must remain OFF for Row 96',
        409,
      );
    }
  }

  private async loadQuote(companyId: string, quoteId: string) {
    const [row] = await this.db
      .select({
        id: quotes.id,
        companyId: quotes.companyId,
        status: quotes.status,
        subtotalCents: quotes.subtotalCents,
        totalCents: quotes.totalCents,
        quoteNumber: quotes.quoteNumber,
        scopeOfWork: quotes.scopeOfWork,
        exclusions: quotes.exclusions,
        assumptions: quotes.assumptions,
        estimatedCostCents: quotes.estimatedCostCents,
      })
      .from(quotes)
      .where(and(eq(quotes.companyId, companyId), eq(quotes.id, quoteId)))
      .limit(1);
    if (!row) {
      throw new QuoteCostModelServiceError('QUOTE_NOT_FOUND', 'Quote not found', 404);
    }
    return row;
  }

  private async audit(
    actor: QuoteCostActor,
    eventType: string,
    quoteId: string,
    componentId: string | null,
    before: unknown,
    after: unknown,
    provenance?: string | null,
  ) {
    await this.db.insert(quoteCostAuditEvents).values({
      companyId: actor.companyId,
      quoteId,
      componentId,
      eventType,
      actorUserId: actor.userId ?? null,
      beforeJson: (before as Record<string, unknown>) ?? null,
      afterJson: (after as Record<string, unknown>) ?? null,
      provenance: provenance ?? null,
    });
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'financial',
      action: eventType,
      entityType: 'quote_cost',
      entityId: quoteId,
      userId: actor.userId ?? null,
      metadata: {
        componentId,
        provenance,
        // Avoid dumping full cost into customer-visible channels — metadata is staff audit only.
        hasBefore: before != null,
        hasAfter: after != null,
      },
    });
  }

  private mapRow(row: typeof quoteCostComponents.$inferSelect) {
    return {
      id: row.id,
      companyId: row.companyId,
      quoteId: row.quoteId,
      quoteLineId: row.quoteLineId,
      componentType: row.componentType as QuoteCostComponentType,
      description: row.description,
      quantity: Number(row.quantity),
      unit: row.unit,
      unitCostCents: row.unitCostCents,
      totalCostCents: row.totalCostCents,
      vatBasis: row.vatBasis as QuoteCostVatBasis,
      provenance: row.provenance as QuoteCostProvenance,
      confidence: row.confidence as QuoteCostConfidence,
      customerVisible: row.customerVisible,
      optionTier: row.optionTier,
      wastagePercentBps: row.wastagePercentBps,
      percentOfBaseBps: row.percentOfBaseBps,
      percentBase: row.percentBase as 'DIRECT_COST' | 'MATERIALS' | 'LABOUR' | null,
      sourceRef: row.sourceRef,
      catalogueItemId: row.catalogueItemId,
      planEstimateCostComponentId: row.planEstimateCostComponentId,
      clientActionId: row.clientActionId,
      position: row.position,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async getModel(actor: QuoteCostActor, quoteId: string) {
    this.assertView(actor);
    await this.assertRow92Safe(actor.companyId);
    const quote = await this.loadQuote(actor.companyId, quoteId);
    const components = await this.db
      .select()
      .from(quoteCostComponents)
      .where(
        and(
          eq(quoteCostComponents.companyId, actor.companyId),
          eq(quoteCostComponents.quoteId, quoteId),
        ),
      )
      .orderBy(asc(quoteCostComponents.position), asc(quoteCostComponents.createdAt));

    const mapped = components.map((c) => this.mapRow(c));
    const summary = summarizeQuoteCost({
      components: mapped.map((c) => ({
        componentType: c.componentType,
        totalCostCents: c.totalCostCents,
        provenance: c.provenance,
        vatBasis: c.vatBasis,
      })),
      sellExVatCents: quote.subtotalCents,
      overheadConfigured: mapped.some((c) => c.componentType === 'OVERHEAD' && c.totalCostCents != null),
    });

    const warnings = await this.db
      .select()
      .from(quoteCostWarnings)
      .where(
        and(
          eq(quoteCostWarnings.companyId, actor.companyId),
          eq(quoteCostWarnings.quoteId, quoteId),
          eq(quoteCostWarnings.resolved, false),
        ),
      );

    const [latestSnapshot] = await this.db
      .select()
      .from(quoteCostSnapshots)
      .where(
        and(
          eq(quoteCostSnapshots.companyId, actor.companyId),
          eq(quoteCostSnapshots.quoteId, quoteId),
        ),
      )
      .orderBy(desc(quoteCostSnapshots.snapshotVersion))
      .limit(1);

    const [labourConfig] = await this.db
      .select({
        defaultInternalLabourRateCentsPerHour:
          companyFinanceSettings.defaultInternalLabourRateCentsPerHour,
      })
      .from(companyFinanceSettings)
      .where(eq(companyFinanceSettings.companyId, actor.companyId))
      .limit(1);

    return {
      quoteId: quote.id,
      quoteNumber: quote.quoteNumber,
      status: quote.status,
      editable: EDITABLE_STATUSES.has(quote.status),
      scopeOfWork: quote.scopeOfWork,
      exclusions: quote.exclusions,
      assumptions: quote.assumptions,
      components: mapped,
      summary,
      warnings: warnings.map((w) => ({
        id: w.id,
        warningCode: w.warningCode,
        severity: w.severity,
        message: w.message,
        componentId: w.componentId,
      })),
      latestSnapshot: latestSnapshot
        ? {
            id: latestSnapshot.id,
            snapshotVersion: latestSnapshot.snapshotVersion,
            lifecycleStatus: latestSnapshot.lifecycleStatus,
            sellExVatCents: latestSnapshot.sellExVatCents,
            totalEstimatedCostCents: latestSnapshot.totalEstimatedCostCents,
            estimatedGrossProfitCents: latestSnapshot.estimatedGrossProfitCents,
            confidence: latestSnapshot.confidence,
            createdAt: latestSnapshot.createdAt.toISOString(),
          }
        : null,
      labourRateConfigCentsPerHour:
        labourConfig?.defaultInternalLabourRateCentsPerHour ?? null,
      row92AutomationOff: true,
    };
  }

  async upsertComponent(
    actor: QuoteCostActor,
    quoteId: string,
    input: QuoteCostComponentInput,
  ) {
    this.assertEdit(actor);
    await this.assertRow92Safe(actor.companyId);
    const quote = await this.loadQuote(actor.companyId, quoteId);
    if (!EDITABLE_STATUSES.has(quote.status)) {
      throw new QuoteCostModelServiceError(
        'QUOTE_NOT_EDITABLE',
        'Issued/sent quote cost baseline cannot be silently rewritten',
        409,
      );
    }

    const validation = validateQuoteCostComponent({ ...input, customerVisible: false });
    if (!validation.ok) {
      throw new QuoteCostModelServiceError(
        'COST_COMPONENT_INVALID',
        validation.errors.join('; '),
        400,
      );
    }

    if (input.clientActionId) {
      const [existing] = await this.db
        .select()
        .from(quoteCostComponents)
        .where(
          and(
            eq(quoteCostComponents.companyId, actor.companyId),
            eq(quoteCostComponents.clientActionId, input.clientActionId),
          ),
        )
        .limit(1);
      if (existing) return this.mapRow(existing);
    }

    const totalCostCents = computeComponentTotalCents({
      quantity: input.quantity,
      unitCostCents: input.unitCostCents,
      wastagePercentBps:
        input.componentType === 'WASTAGE' ? null : input.wastagePercentBps,
    });

    let confidence: QuoteCostConfidence = 'COMPLETE';
    if (totalCostCents == null) confidence = 'INSUFFICIENT_INFORMATION';
    else if (validation.warnings.length > 0) confidence = 'PARTIAL';

    const [maxPos] = await this.db
      .select({
        max: sql<number>`coalesce(max(${quoteCostComponents.position}), -1)`,
      })
      .from(quoteCostComponents)
      .where(
        and(
          eq(quoteCostComponents.companyId, actor.companyId),
          eq(quoteCostComponents.quoteId, quoteId),
        ),
      );

    const [inserted] = await this.db
      .insert(quoteCostComponents)
      .values({
        companyId: actor.companyId,
        quoteId,
        quoteLineId: input.quoteLineId ?? null,
        componentType: input.componentType,
        description: input.description.trim(),
        quantity: String(input.quantity),
        unit: input.unit?.trim() || 'each',
        unitCostCents: input.unitCostCents,
        totalCostCents,
        vatBasis: input.vatBasis,
        provenance: input.provenance,
        confidence,
        customerVisible: false,
        optionTier: input.optionTier ?? null,
        wastagePercentBps: input.wastagePercentBps ?? null,
        percentOfBaseBps: input.percentOfBaseBps ?? null,
        percentBase: input.percentBase ?? null,
        sourceRef: input.sourceRef ?? null,
        catalogueItemId: input.catalogueItemId ?? null,
        planEstimateCostComponentId: input.planEstimateCostComponentId ?? null,
        clientActionId: input.clientActionId ?? null,
        position: Number(maxPos?.max ?? -1) + 1,
        createdBy: actor.userId ?? null,
        updatedBy: actor.userId ?? null,
      })
      .returning();

    await this.refreshWarnings(actor.companyId, quoteId, validation.warnings);
    await this.syncEstimatedCostFromComponents(actor.companyId, quoteId);
    await this.audit(
      actor,
      'quote_cost_component_added',
      quoteId,
      inserted.id,
      null,
      this.mapRow(inserted),
      input.provenance,
    );
    return this.mapRow(inserted);
  }

  async removeComponent(actor: QuoteCostActor, quoteId: string, componentId: string) {
    this.assertEdit(actor);
    const quote = await this.loadQuote(actor.companyId, quoteId);
    if (!EDITABLE_STATUSES.has(quote.status)) {
      throw new QuoteCostModelServiceError(
        'QUOTE_NOT_EDITABLE',
        'Issued/sent quote cost baseline cannot be silently rewritten',
        409,
      );
    }
    const [existing] = await this.db
      .select()
      .from(quoteCostComponents)
      .where(
        and(
          eq(quoteCostComponents.companyId, actor.companyId),
          eq(quoteCostComponents.quoteId, quoteId),
          eq(quoteCostComponents.id, componentId),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new QuoteCostModelServiceError('COMPONENT_NOT_FOUND', 'Cost component not found', 404);
    }
    await this.db
      .delete(quoteCostComponents)
      .where(eq(quoteCostComponents.id, componentId));
    await this.syncEstimatedCostFromComponents(actor.companyId, quoteId);
    await this.audit(
      actor,
      'quote_cost_component_removed',
      quoteId,
      componentId,
      this.mapRow(existing),
      null,
      existing.provenance,
    );
    return { deleted: true, id: componentId };
  }

  async importFromPlanEstimate(
    actor: QuoteCostActor,
    quoteId: string,
    estimateId: string,
    clientActionId?: string | null,
  ) {
    this.assertEdit(actor);
    await this.assertRow92Safe(actor.companyId);
    const quote = await this.loadQuote(actor.companyId, quoteId);
    if (!EDITABLE_STATUSES.has(quote.status)) {
      throw new QuoteCostModelServiceError(
        'QUOTE_NOT_EDITABLE',
        'Cannot import plan costs into non-editable quote',
        409,
      );
    }

    if (clientActionId) {
      const [idem] = await this.db
        .select()
        .from(quoteCostAuditEvents)
        .where(
          and(
            eq(quoteCostAuditEvents.companyId, actor.companyId),
            eq(quoteCostAuditEvents.quoteId, quoteId),
            eq(quoteCostAuditEvents.eventType, 'quote_cost_plan_imported'),
            sql`${quoteCostAuditEvents.afterJson}->>'clientActionId' = ${clientActionId}`,
          ),
        )
        .limit(1);
      if (idem) {
        return this.getModel(actor, quoteId);
      }
    }

    const planComponents = await this.db
      .select()
      .from(planEstimateCostComponents)
      .where(
        and(
          eq(planEstimateCostComponents.companyId, actor.companyId),
          eq(planEstimateCostComponents.estimateId, estimateId),
        ),
      );

    const existing = await this.db
      .select({
        planEstimateCostComponentId: quoteCostComponents.planEstimateCostComponentId,
      })
      .from(quoteCostComponents)
      .where(
        and(
          eq(quoteCostComponents.companyId, actor.companyId),
          eq(quoteCostComponents.quoteId, quoteId),
        ),
      );

    const dup = detectDuplicatePlanImport(
      existing,
      planComponents.map((p) => p.id),
    );

    let imported = 0;
    for (const pc of planComponents) {
      if (dup.duplicateIds.includes(pc.id)) continue;
      await this.upsertComponent(actor, quoteId, {
        componentType: mapPlanEstimateComponentType(
          pc.componentType as 'MATERIAL' | 'LABOUR' | 'SITE' | 'OTHER',
        ),
        description: pc.description,
        quantity: Number(pc.quantity),
        unit: pc.unit,
        unitCostCents: pc.unitCostCents,
        vatBasis: 'VAT_EXCLUSIVE',
        provenance: mapPlanEstimateProvenance(pc.costProvenance),
        planEstimateCostComponentId: pc.id,
        catalogueItemId: pc.catalogueItemId,
        clientActionId: clientActionId
          ? `${clientActionId}:${pc.id}`
          : `plan-import:${quoteId}:${pc.id}`,
      });
      imported += 1;
    }

    await this.audit(
      actor,
      'quote_cost_plan_imported',
      quoteId,
      null,
      null,
      { estimateId, imported, skippedDuplicates: dup.duplicateIds.length, clientActionId },
      'PLAN_ESTIMATE',
    );

    return { imported, skippedDuplicates: dup.duplicateIds.length, model: await this.getModel(actor, quoteId) };
  }

  async snapshotBaseline(
    actor: QuoteCostActor,
    quoteId: string,
    clientActionId?: string | null,
  ) {
    this.assertEdit(actor);
    const model = await this.getModel(actor, quoteId);

    if (clientActionId) {
      const [existing] = await this.db
        .select()
        .from(quoteCostSnapshots)
        .where(
          and(
            eq(quoteCostSnapshots.companyId, actor.companyId),
            eq(quoteCostSnapshots.clientActionId, clientActionId),
          ),
        )
        .limit(1);
      if (existing) {
        return {
          id: existing.id,
          snapshotVersion: existing.snapshotVersion,
          idempotent: true,
        };
      }
    }

    const [maxVer] = await this.db
      .select({
        max: sql<number>`coalesce(max(${quoteCostSnapshots.snapshotVersion}), 0)`,
      })
      .from(quoteCostSnapshots)
      .where(
        and(
          eq(quoteCostSnapshots.companyId, actor.companyId),
          eq(quoteCostSnapshots.quoteId, quoteId),
        ),
      );

    const version = Number(maxVer?.max ?? 0) + 1;
    const payload = {
      summary: model.summary,
      components: model.components.map((c) => ({
        id: c.id,
        componentType: c.componentType,
        description: c.description,
        quantity: c.quantity,
        unit: c.unit,
        unitCostCents: c.unitCostCents,
        totalCostCents: c.totalCostCents,
        provenance: c.provenance,
        vatBasis: c.vatBasis,
        quoteLineId: c.quoteLineId,
        optionTier: c.optionTier,
      })),
      sellExVatCents: model.summary.sellExVatCents,
      snapshottedAt: new Date().toISOString(),
    };

    const [row] = await this.db
      .insert(quoteCostSnapshots)
      .values({
        companyId: actor.companyId,
        quoteId,
        snapshotVersion: version,
        lifecycleStatus: model.status,
        sellExVatCents: model.summary.sellExVatCents,
        totalEstimatedCostCents: model.summary.totalEstimatedCostCents,
        estimatedGrossProfitCents: model.summary.estimatedGrossProfitCents,
        confidence: model.summary.confidence,
        payload,
        clientActionId: clientActionId ?? null,
        createdBy: actor.userId ?? null,
      })
      .returning();

    await this.audit(
      actor,
      'quote_cost_baseline_snapshotted',
      quoteId,
      null,
      null,
      { snapshotId: row.id, version },
      null,
    );

    return { id: row.id, snapshotVersion: version, idempotent: false };
  }

  private async refreshWarnings(
    companyId: string,
    quoteId: string,
    warnings: QuoteCostWarningCode[],
  ) {
    for (const code of warnings) {
      await this.db.insert(quoteCostWarnings).values({
        companyId,
        quoteId,
        warningCode: code,
        severity: code === 'COST_ESTIMATE_INCOMPLETE' ? 'WARNING' : 'INFO',
        message: code.replaceAll('_', ' '),
      });
    }
  }

  /**
   * Keep legacy quote.estimatedCostCents aligned with structured model when components exist.
   * Does NOT mutate customer sell prices.
   */
  private async syncEstimatedCostFromComponents(companyId: string, quoteId: string) {
    const quote = await this.loadQuote(companyId, quoteId);
    if (!EDITABLE_STATUSES.has(quote.status)) return;

    const components = await this.db
      .select()
      .from(quoteCostComponents)
      .where(
        and(
          eq(quoteCostComponents.companyId, companyId),
          eq(quoteCostComponents.quoteId, quoteId),
        ),
      );

    if (components.length === 0) return;

    const summary = summarizeQuoteCost({
      components: components.map((c) => ({
        componentType: c.componentType as QuoteCostComponentType,
        totalCostCents: c.totalCostCents,
        provenance: c.provenance as QuoteCostProvenance,
        vatBasis: c.vatBasis as QuoteCostVatBasis,
      })),
      sellExVatCents: quote.subtotalCents,
    });

    if (summary.totalEstimatedCostCents == null) return;

    const gp =
      summary.estimatedGrossProfitCents ??
      quote.subtotalCents - summary.totalEstimatedCostCents;
    const markupBps = summary.markupBps ?? 0;
    const marginBps = summary.grossMarginBps ?? 0;

    await this.db
      .update(quotes)
      .set({
        estimatedCostCents: summary.totalEstimatedCostCents,
        grossProfitCents: gp,
        markupBps,
        marginBps,
        updatedAt: new Date(),
      })
      .where(and(eq(quotes.companyId, companyId), eq(quotes.id, quoteId)));
  }

  /** Recalculate GP after Row 93 sell override — cost unchanged. */
  async recalculateGpAfterSellChange(actor: QuoteCostActor, quoteId: string): Promise<QuoteCostSummary> {
    this.assertView(actor);
    const model = await this.getModel(actor, quoteId);
    return model.summary;
  }
}
