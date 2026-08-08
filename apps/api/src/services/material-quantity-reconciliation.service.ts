import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  companyPricebookRuleSets,
  jobDirectCostEntries,
  jobProcurementChainLinks,
  jobProcurementChains,
  jobProcurementDeliveryEvidence,
  materialQuantityReconciliations,
  materialReturnToStockEvents,
  materialSupplierCreditEvents,
  materialSupplierReturnEvents,
  materialWasteEvents,
  purchaseOrderItems,
  purchaseOrders,
  securityAuditLogs,
  type DatabaseClient,
} from '@titan/db';
import {
  assertRow104SafetyGates,
  canManageMaterialQtyReconciliation,
  qtyEvidence,
  resolveMaterialCostAdjustment,
  resolveMaterialQuantityReconciliation,
  validateSupplierCredit,
  validateSupplierReturn,
  validateWasteEvent,
} from '@titan/shared';

export class MaterialQtyReconServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'MaterialQtyReconServiceError';
  }
}

export type MaterialQtyReconActor = {
  companyId: string;
  userId?: string | null;
  roleName?: string | null;
  permissions?: string[] | null;
};

export class MaterialQuantityReconciliationService {
  constructor(private readonly db: DatabaseClient) {}

  private assertManage(actor: MaterialQtyReconActor) {
    const role = (actor.roleName ?? '').toLowerCase();
    if (role.includes('client') || role === 'technician' || role.includes('tech')) {
      throw new MaterialQtyReconServiceError('FORBIDDEN', 'Material reconciliation denied', 403);
    }
    if (!canManageMaterialQtyReconciliation(actor)) {
      throw new MaterialQtyReconServiceError('FORBIDDEN', 'Material reconciliation denied', 403);
    }
  }

  private async assertSafe(companyId: string) {
    const [rule] = await this.db
      .select({ globalAutomationEnabled: companyPricebookRuleSets.globalAutomationEnabled })
      .from(companyPricebookRuleSets)
      .where(eq(companyPricebookRuleSets.companyId, companyId))
      .orderBy(desc(companyPricebookRuleSets.version))
      .limit(1);
    assertRow104SafetyGates({
      row92AutomationEnabled: rule?.globalAutomationEnabled === true,
      row105Started: false,
      row106107Started: false,
      xeroWrites: 0,
      customerSends: 0,
      productionWrites: 0,
    });
  }

  private async audit(
    actor: MaterialQtyReconActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'financial',
      action,
      entityType: 'material_quantity_reconciliation',
      entityId,
      userId: actor.userId ?? null,
      metadata: { ...metadata, xeroWrites: 0, timestamp: new Date().toISOString() },
    });
  }

  async stagingAudit(actor: MaterialQtyReconActor) {
    this.assertManage(actor);
    await this.assertSafe(actor.companyId);
    const companyId = actor.companyId;

    const [
      [poLines],
      [deliveries],
      [chains],
      [returns],
      [credits],
      [waste],
      [rts],
      [jpe],
      [poNoJob],
    ] = await Promise.all([
      this.db
        .select({ c: count() })
        .from(purchaseOrderItems)
        .innerJoin(purchaseOrders, eq(purchaseOrderItems.purchaseOrderId, purchaseOrders.id))
        .where(eq(purchaseOrders.companyId, companyId)),
      this.db
        .select({ c: count() })
        .from(jobProcurementDeliveryEvidence)
        .where(eq(jobProcurementDeliveryEvidence.companyId, companyId)),
      this.db
        .select({ c: count() })
        .from(jobProcurementChains)
        .where(eq(jobProcurementChains.companyId, companyId)),
      this.db
        .select({ c: count() })
        .from(materialSupplierReturnEvents)
        .where(eq(materialSupplierReturnEvents.companyId, companyId)),
      this.db
        .select({ c: count() })
        .from(materialSupplierCreditEvents)
        .where(eq(materialSupplierCreditEvents.companyId, companyId)),
      this.db
        .select({ c: count() })
        .from(materialWasteEvents)
        .where(eq(materialWasteEvents.companyId, companyId)),
      this.db
        .select({ c: count() })
        .from(materialReturnToStockEvents)
        .where(eq(materialReturnToStockEvents.companyId, companyId)),
      this.db
        .select({ c: count() })
        .from(jobDirectCostEntries)
        .where(
          and(
            eq(jobDirectCostEntries.companyId, companyId),
            sql`${jobDirectCostEntries.sourceType} in ('material_line','purchase_order','supplier_invoice')`,
          ),
        ),
      this.db
        .select({ c: count() })
        .from(purchaseOrders)
        .where(and(eq(purchaseOrders.companyId, companyId), isNull(purchaseOrders.jobId))),
    ]);

    await this.audit(actor, 'material_qty_recon_staging_audit', companyId, { readOnly: true });

    return {
      readOnly: true as const,
      xeroWrites: 0 as const,
      counts: {
        purchaseOrderLines: Number(poLines?.c ?? 0),
        deliveryEvidence: Number(deliveries?.c ?? 0),
        jobProcurementChains: Number(chains?.c ?? 0),
        supplierReturns: Number(returns?.c ?? 0),
        supplierCredits: Number(credits?.c ?? 0),
        wasteEvents: Number(waste?.c ?? 0),
        returnToStockEvents: Number(rts?.c ?? 0),
        jpeMaterialLikeCosts: Number(jpe?.c ?? 0),
        purchaseOrdersMissingJobLink: Number(poNoJob?.c ?? 0),
      },
      row103Preserved: true as const,
      row105NotStarted: true as const,
      row118NotClosed: true as const,
    };
  }

  async reconcileChainLink(
    actor: MaterialQtyReconActor,
    input: {
      chainId: string;
      chainLinkId: string;
      quotedQty?: number | null;
      quotedUnit?: string | null;
      usedQty?: number | null;
      clientActionId?: string | null;
    },
  ) {
    this.assertManage(actor);
    await this.assertSafe(actor.companyId);

    if (input.clientActionId) {
      const [existing] = await this.db
        .select()
        .from(materialQuantityReconciliations)
        .where(
          and(
            eq(materialQuantityReconciliations.companyId, actor.companyId),
            eq(materialQuantityReconciliations.clientActionId, input.clientActionId),
          ),
        )
        .limit(1);
      if (existing) return { reconciliation: existing, idempotentReplay: true as const };
    }

    const [chain] = await this.db
      .select()
      .from(jobProcurementChains)
      .where(
        and(
          eq(jobProcurementChains.companyId, actor.companyId),
          eq(jobProcurementChains.id, input.chainId),
        ),
      )
      .limit(1);
    if (!chain) throw new MaterialQtyReconServiceError('NOT_FOUND', 'Chain not found', 404);

    const [link] = await this.db
      .select()
      .from(jobProcurementChainLinks)
      .where(
        and(
          eq(jobProcurementChainLinks.companyId, actor.companyId),
          eq(jobProcurementChainLinks.id, input.chainLinkId),
          eq(jobProcurementChainLinks.chainId, input.chainId),
        ),
      )
      .limit(1);
    if (!link) throw new MaterialQtyReconServiceError('NOT_FOUND', 'Chain link not found', 404);

    let orderedQty: number | null = null;
    let orderedUnit: string | null = null;
    if (link.purchaseOrderLineId) {
      const [item] = await this.db
        .select()
        .from(purchaseOrderItems)
        .where(eq(purchaseOrderItems.id, link.purchaseOrderLineId))
        .limit(1);
      orderedQty = item?.quantity != null ? Number(item.quantity) : null;
    }

    let receivedQty: number | null = null;
    if (link.deliveryEvidenceId) {
      const [del] = await this.db
        .select()
        .from(jobProcurementDeliveryEvidence)
        .where(eq(jobProcurementDeliveryEvidence.id, link.deliveryEvidenceId))
        .limit(1);
      receivedQty = del?.deliveredQuantity != null ? Number(del.deliveredQuantity) : null;
    }

    const returns = await this.db
      .select()
      .from(materialSupplierReturnEvents)
      .where(
        and(
          eq(materialSupplierReturnEvents.companyId, actor.companyId),
          eq(materialSupplierReturnEvents.chainLinkId, link.id),
        ),
      );
    const rts = await this.db
      .select()
      .from(materialReturnToStockEvents)
      .where(
        and(
          eq(materialReturnToStockEvents.companyId, actor.companyId),
          eq(materialReturnToStockEvents.chainLinkId, link.id),
        ),
      );
    const waste = await this.db
      .select()
      .from(materialWasteEvents)
      .where(
        and(
          eq(materialWasteEvents.companyId, actor.companyId),
          eq(materialWasteEvents.chainLinkId, link.id),
        ),
      );

    const sum = (rows: Array<{ quantity: string | null }>) =>
      rows.reduce((a, r) => a + (r.quantity != null ? Number(r.quantity) : 0), 0);

    const resolved = resolveMaterialQuantityReconciliation({
      companyId: actor.companyId,
      jobId: chain.jobId,
      expectedJobCompanyId: actor.companyId,
      chainLinkId: link.id,
      materialKey: link.offerKey ?? link.id,
      quoted: qtyEvidence(
        input.quotedQty ?? null,
        input.quotedUnit ?? null,
        'quote_baseline',
        null,
        input.quotedQty != null,
      ),
      ordered: qtyEvidence(orderedQty, orderedUnit, 'po_line', link.purchaseOrderLineId, orderedQty != null),
      received: qtyEvidence(
        receivedQty,
        orderedUnit,
        'delivery',
        link.deliveryEvidenceId,
        receivedQty != null,
      ),
      used: qtyEvidence(
        input.usedQty ?? null,
        orderedUnit,
        'material_use',
        null,
        input.usedQty != null,
      ),
      returnedToSupplier: qtyEvidence(sum(returns), orderedUnit, 'supplier_return', null, true),
      returnedToStock: qtyEvidence(sum(rts), orderedUnit, 'return_to_stock', null, true),
      wasted: qtyEvidence(sum(waste), orderedUnit, 'waste', null, true),
    });

    const [row] = await this.db
      .insert(materialQuantityReconciliations)
      .values({
        companyId: actor.companyId,
        jobId: chain.jobId,
        chainId: chain.id,
        chainLinkId: link.id,
        materialKey: link.offerKey ?? link.id,
        unit: resolved.unit,
        quotedQty: resolved.quoted != null ? String(resolved.quoted) : null,
        orderedQty: resolved.ordered != null ? String(resolved.ordered) : null,
        receivedQty: resolved.received != null ? String(resolved.received) : null,
        usedQty: resolved.used != null ? String(resolved.used) : null,
        returnedToSupplierQty:
          resolved.returnedToSupplier != null ? String(resolved.returnedToSupplier) : null,
        returnedToStockQty:
          resolved.returnedToStock != null ? String(resolved.returnedToStock) : null,
        wastedQty: resolved.wasted != null ? String(resolved.wasted) : null,
        unaccountedQty: resolved.unaccounted != null ? String(resolved.unaccounted) : null,
        status: resolved.status,
        warnings: resolved.warnings,
        quoteBaselineUnchanged: true,
        idempotencyKey: `recon:${link.id}:${resolved.status}`,
        clientActionId: input.clientActionId ?? null,
        createdBy: actor.userId ?? null,
      })
      .returning();

    await this.audit(actor, 'material_qty_reconciled', row.id, {
      chainId: chain.id,
      status: resolved.status,
      quoteBaselineUnchanged: true,
    });

    return {
      reconciliation: row,
      intelligence: resolved,
      idempotentReplay: false as const,
      row103ChainPreserved: true as const,
    };
  }

  async recordSupplierReturn(
    actor: MaterialQtyReconActor,
    input: {
      chainId: string;
      chainLinkId: string;
      quantity: number;
      unit?: string | null;
      reason?: string | null;
      sourceDocumentRef?: string | null;
      availableQuantity: number;
      clientActionId?: string | null;
      postCostAdjustment?: boolean;
    },
  ) {
    this.assertManage(actor);
    await this.assertSafe(actor.companyId);

    const [chain] = await this.db
      .select()
      .from(jobProcurementChains)
      .where(
        and(
          eq(jobProcurementChains.companyId, actor.companyId),
          eq(jobProcurementChains.id, input.chainId),
        ),
      )
      .limit(1);
    if (!chain) throw new MaterialQtyReconServiceError('NOT_FOUND', 'Chain not found', 404);
    const [link] = await this.db
      .select()
      .from(jobProcurementChainLinks)
      .where(
        and(
          eq(jobProcurementChainLinks.companyId, actor.companyId),
          eq(jobProcurementChainLinks.id, input.chainLinkId),
        ),
      )
      .limit(1);
    if (!link) throw new MaterialQtyReconServiceError('NOT_FOUND', 'Link not found', 404);

    const existing = await this.db
      .select({ k: materialSupplierReturnEvents.idempotencyKey })
      .from(materialSupplierReturnEvents)
      .where(eq(materialSupplierReturnEvents.companyId, actor.companyId));

    const validated = validateSupplierReturn({
      companyId: actor.companyId,
      jobId: chain.jobId,
      expectedJobId: chain.jobId,
      expectedJobCompanyId: actor.companyId,
      supplierId: link.supplierId,
      purchaseOrderId: link.purchaseOrderId,
      purchaseOrderLineId: link.purchaseOrderLineId,
      supplierInvoiceEvidenceId: link.supplierInvoiceEvidenceId,
      deliveryEvidenceId: link.deliveryEvidenceId,
      materialKey: link.offerKey ?? link.id,
      quantity: input.quantity,
      unit: input.unit ?? null,
      availableQuantity: input.availableQuantity,
      reason: input.reason ?? null,
      sourceDocumentRef: input.sourceDocumentRef ?? null,
      actorUserId: actor.userId ?? null,
      occurredAt: new Date().toISOString(),
      existingEventKeys: existing.map((e) => e.k).filter(Boolean) as string[],
      clientActionId: input.clientActionId ?? null,
    });
    if (!validated.ok || !validated.event) {
      throw new MaterialQtyReconServiceError(
        validated.warnings[0] ?? 'REVIEW_REQUIRED',
        `Return blocked: ${validated.warnings.join(', ')}`,
        409,
      );
    }

    const jpeSourceId = `supplier_return:${validated.event.idempotencyKey}`;
    const [event] = await this.db
      .insert(materialSupplierReturnEvents)
      .values({
        companyId: actor.companyId,
        jobId: chain.jobId,
        chainId: chain.id,
        chainLinkId: link.id,
        supplierId: link.supplierId,
        purchaseOrderId: link.purchaseOrderId,
        purchaseOrderLineId: link.purchaseOrderLineId,
        supplierInvoiceEvidenceId: link.supplierInvoiceEvidenceId,
        deliveryEvidenceId: link.deliveryEvidenceId,
        materialKey: link.offerKey ?? link.id,
        quantity: String(validated.event.quantity),
        unit: validated.event.unit,
        reason: input.reason ?? null,
        sourceDocumentRef: input.sourceDocumentRef ?? null,
        deletesOriginalReceipt: false,
        jpeSourceId,
        idempotencyKey: validated.event.idempotencyKey,
        clientActionId: input.clientActionId ?? null,
        actorUserId: actor.userId ?? null,
      })
      .returning();

    let costAdjustment = null;
    if (input.postCostAdjustment && actor.userId && link.lineCostCents != null) {
      const unit = link.quantity != null ? Number(link.quantity) : null;
      const unitCost =
        unit && unit > 0 ? Math.round(link.lineCostCents / unit) : link.unitPriceCents;
      const amount =
        unitCost != null ? -Math.round(unitCost * validated.event.quantity) : null;
      const existingJpe = await this.db
        .select({ sourceId: jobDirectCostEntries.sourceId })
        .from(jobDirectCostEntries)
        .where(eq(jobDirectCostEntries.companyId, actor.companyId));
      const adj = resolveMaterialCostAdjustment({
        path: 'DIRECT_JOB_RETURN_CREDIT',
        amountCents: amount,
        sourceKey: jpeSourceId,
        existingJpeSourceKeys: existingJpe.map((e) => e.sourceId),
      });
      if (adj.shouldAdjust && adj.amountCents != null) {
        const [posted] = await this.db
          .insert(jobDirectCostEntries)
          .values({
            companyId: actor.companyId,
            jobId: chain.jobId,
            category: 'consumables',
            description: `Row104 supplier return ${event.id}`,
            amountCents: adj.amountCents,
            supplierId: link.supplierId,
            sourceType: 'adjustment',
            sourceId: jpeSourceId,
            enteredByUserId: actor.userId,
            purchaseOrderId: link.purchaseOrderId,
          })
          .onConflictDoNothing()
          .returning();
        costAdjustment = { posted: Boolean(posted), jpeSourceId, amountCents: adj.amountCents };
      } else {
        costAdjustment = {
          posted: false,
          duplicateBlocked: adj.duplicateBlocked,
          warnings: adj.warnings,
        };
      }
    }

    await this.audit(actor, 'material_supplier_return_recorded', event.id, {
      deletesOriginalReceipt: false,
      costAdjustment,
    });

    return { event, costAdjustment, warnings: validated.warnings };
  }

  async recordSupplierCredit(
    actor: MaterialQtyReconActor,
    input: {
      chainId: string;
      amountCents: number;
      relatedReturnEventId?: string | null;
      creditNoteRef?: string | null;
      sourceDocumentRef?: string | null;
      vatBasis?: string | null;
      creditDate?: string | null;
      knownXeroCreditNoteId?: string | null;
      clientActionId?: string | null;
      postCostAdjustment?: boolean;
    },
  ) {
    this.assertManage(actor);
    await this.assertSafe(actor.companyId);

    const [chain] = await this.db
      .select()
      .from(jobProcurementChains)
      .where(
        and(
          eq(jobProcurementChains.companyId, actor.companyId),
          eq(jobProcurementChains.id, input.chainId),
        ),
      )
      .limit(1);
    if (!chain) throw new MaterialQtyReconServiceError('NOT_FOUND', 'Chain not found', 404);

    const [link] = await this.db
      .select()
      .from(jobProcurementChainLinks)
      .where(
        and(
          eq(jobProcurementChainLinks.companyId, actor.companyId),
          eq(jobProcurementChainLinks.chainId, input.chainId),
        ),
      )
      .limit(1);

    const existing = await this.db
      .select({ k: materialSupplierCreditEvents.idempotencyKey })
      .from(materialSupplierCreditEvents)
      .where(eq(materialSupplierCreditEvents.companyId, actor.companyId));

    const validated = validateSupplierCredit({
      companyId: actor.companyId,
      jobId: chain.jobId,
      expectedJobId: chain.jobId,
      expectedJobCompanyId: actor.companyId,
      supplierId: link?.supplierId ?? null,
      creditNoteRef: input.creditNoteRef ?? null,
      sourceDocumentRef: input.sourceDocumentRef ?? null,
      relatedReturnEventId: input.relatedReturnEventId ?? null,
      relatedInvoiceEvidenceId: link?.supplierInvoiceEvidenceId ?? null,
      purchaseOrderId: link?.purchaseOrderId ?? null,
      amountCents: input.amountCents,
      vatBasis: input.vatBasis ?? null,
      creditDate: input.creditDate ?? null,
      knownXeroCreditNoteId: input.knownXeroCreditNoteId ?? null,
      xeroWrites: 0,
      existingEventKeys: existing.map((e) => e.k).filter(Boolean) as string[],
      clientActionId: input.clientActionId ?? null,
    });
    if (!validated.ok || !validated.event) {
      throw new MaterialQtyReconServiceError(
        validated.warnings[0] ?? 'REVIEW_REQUIRED',
        `Credit blocked: ${validated.warnings.join(', ')}`,
        409,
      );
    }

    const jpeSourceId = `supplier_credit:${validated.event.idempotencyKey}`;
    const [event] = await this.db
      .insert(materialSupplierCreditEvents)
      .values({
        companyId: actor.companyId,
        jobId: chain.jobId,
        chainId: chain.id,
        supplierId: link?.supplierId ?? null,
        purchaseOrderId: link?.purchaseOrderId ?? null,
        relatedReturnEventId: input.relatedReturnEventId ?? null,
        relatedInvoiceEvidenceId: link?.supplierInvoiceEvidenceId ?? null,
        creditNoteRef: validated.event.creditNoteRef,
        sourceDocumentRef: input.sourceDocumentRef ?? null,
        amountCents: validated.event.amountCents,
        vatBasis: input.vatBasis ?? null,
        creditDate: input.creditDate ?? null,
        xeroCreditNoteId: validated.event.xeroCreditNoteId,
        xeroStatus: validated.event.xeroStatus,
        jpeSourceId,
        idempotencyKey: validated.event.idempotencyKey,
        clientActionId: input.clientActionId ?? null,
        actorUserId: actor.userId ?? null,
      })
      .returning();

    let costAdjustment = null;
    if (input.postCostAdjustment && actor.userId) {
      const existingJpe = await this.db
        .select({ sourceId: jobDirectCostEntries.sourceId })
        .from(jobDirectCostEntries)
        .where(eq(jobDirectCostEntries.companyId, actor.companyId));
      const pairedReturnKey = input.relatedReturnEventId
        ? (
            await this.db
              .select()
              .from(materialSupplierReturnEvents)
              .where(eq(materialSupplierReturnEvents.id, input.relatedReturnEventId))
              .limit(1)
          )[0]?.jpeSourceId
        : null;
      const adj = resolveMaterialCostAdjustment({
        path: 'SUPPLIER_RETURN_AND_CREDIT',
        amountCents: -Math.abs(validated.event.amountCents),
        sourceKey: jpeSourceId,
        pairedCreditKey: pairedReturnKey,
        existingJpeSourceKeys: existingJpe.map((e) => e.sourceId),
      });
      if (adj.shouldAdjust && adj.amountCents != null) {
        const [posted] = await this.db
          .insert(jobDirectCostEntries)
          .values({
            companyId: actor.companyId,
            jobId: chain.jobId,
            category: 'consumables',
            description: `Row104 supplier credit ${event.id}`,
            amountCents: adj.amountCents,
            supplierId: link?.supplierId ?? null,
            sourceType: 'adjustment',
            sourceId: jpeSourceId,
            enteredByUserId: actor.userId,
            purchaseOrderId: link?.purchaseOrderId ?? null,
          })
          .onConflictDoNothing()
          .returning();
        costAdjustment = { posted: Boolean(posted), jpeSourceId };
      } else {
        costAdjustment = {
          posted: false,
          duplicateBlocked: adj.duplicateBlocked,
          warnings: adj.warnings,
        };
      }
    }

    await this.audit(actor, 'material_supplier_credit_recorded', event.id, {
      xeroStatus: validated.event.xeroStatus,
      xeroWrites: 0,
      costAdjustment,
    });

    return {
      event,
      costAdjustment,
      warnings: validated.warnings,
      xeroWrites: 0 as const,
    };
  }

  async recordWaste(
    actor: MaterialQtyReconActor,
    input: {
      chainId: string;
      chainLinkId: string;
      quantity: number;
      unit?: string | null;
      reason?: string | null;
      availableQuantity: number;
      clientActionId?: string | null;
    },
  ) {
    this.assertManage(actor);
    await this.assertSafe(actor.companyId);
    const [chain] = await this.db
      .select()
      .from(jobProcurementChains)
      .where(
        and(
          eq(jobProcurementChains.companyId, actor.companyId),
          eq(jobProcurementChains.id, input.chainId),
        ),
      )
      .limit(1);
    if (!chain) throw new MaterialQtyReconServiceError('NOT_FOUND', 'Chain not found', 404);
    const [link] = await this.db
      .select()
      .from(jobProcurementChainLinks)
      .where(eq(jobProcurementChainLinks.id, input.chainLinkId))
      .limit(1);
    if (!link) throw new MaterialQtyReconServiceError('NOT_FOUND', 'Link not found', 404);

    const existing = await this.db
      .select({ k: materialWasteEvents.idempotencyKey })
      .from(materialWasteEvents)
      .where(eq(materialWasteEvents.companyId, actor.companyId));

    const validated = validateWasteEvent({
      companyId: actor.companyId,
      jobId: chain.jobId,
      expectedJobId: chain.jobId,
      expectedJobCompanyId: actor.companyId,
      materialKey: link.offerKey ?? link.id,
      quantity: input.quantity,
      unit: input.unit ?? null,
      availableQuantity: input.availableQuantity,
      reason: input.reason ?? null,
      actorUserId: actor.userId ?? null,
      occurredAt: new Date().toISOString(),
      existingEventKeys: existing.map((e) => e.k).filter(Boolean) as string[],
      clientActionId: input.clientActionId ?? null,
    });
    if (!validated.ok || !validated.event) {
      throw new MaterialQtyReconServiceError(
        validated.warnings[0] ?? 'REVIEW_REQUIRED',
        `Waste blocked: ${validated.warnings.join(', ')}`,
        409,
      );
    }

    const [event] = await this.db
      .insert(materialWasteEvents)
      .values({
        companyId: actor.companyId,
        jobId: chain.jobId,
        chainId: chain.id,
        chainLinkId: link.id,
        materialKey: link.offerKey ?? link.id,
        quantity: String(validated.event.quantity),
        unit: validated.event.unit,
        reason: input.reason ?? null,
        idempotencyKey: validated.event.idempotencyKey,
        clientActionId: input.clientActionId ?? null,
        actorUserId: actor.userId ?? null,
      })
      .returning();

    await this.audit(actor, 'material_waste_recorded', event.id, { chainId: chain.id });
    return { event };
  }
}
