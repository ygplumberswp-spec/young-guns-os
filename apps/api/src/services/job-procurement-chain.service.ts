import { and, count, desc, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import {
  boqImports,
  boqSplitPurchaseProposalLines,
  boqSplitPurchaseProposals,
  companyPricebookRuleSets,
  jobDirectCostEntries,
  jobProcurementChainLinks,
  jobProcurementChains,
  jobProcurementDeliveryEvidence,
  jobProcurementSupplierInvoiceEvidence,
  purchaseOrderItems,
  purchaseOrders,
  quotes,
  securityAuditLogs,
  suppliers,
  xeroBills,
  type DatabaseClient,
} from '@titan/db';
import {
  assertRow103SafetyGates,
  buildBoqQuoteJobTrace,
  buildPoDraftFromApprovedProposal,
  canManageJobProcurementChain,
  chainIdempotencyKey,
  projectXeroBillLinkage,
  recordDeliveryEvidence,
  recordSupplierInvoiceEvidence,
  resolveMaterialCostPosting,
  type PurchasePath,
} from '@titan/shared';
import type { ProcurementService } from './procurement.service.js';

export class JobProcurementChainServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'JobProcurementChainServiceError';
  }
}

export type JobProcurementChainActor = {
  companyId: string;
  userId?: string | null;
  roleName?: string | null;
  permissions?: string[] | null;
};

export class JobProcurementChainService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly procurementService: ProcurementService,
  ) {}

  private assertManage(actor: JobProcurementChainActor) {
    const role = (actor.roleName ?? '').toLowerCase();
    if (role.includes('client') || role === 'technician' || role.includes('tech')) {
      throw new JobProcurementChainServiceError('FORBIDDEN', 'Procurement chain denied', 403);
    }
    if (!canManageJobProcurementChain(actor)) {
      throw new JobProcurementChainServiceError('FORBIDDEN', 'Procurement chain denied', 403);
    }
  }

  private async assertSafe(companyId: string) {
    const [rule] = await this.db
      .select({
        globalAutomationEnabled: companyPricebookRuleSets.globalAutomationEnabled,
      })
      .from(companyPricebookRuleSets)
      .where(eq(companyPricebookRuleSets.companyId, companyId))
      .orderBy(desc(companyPricebookRuleSets.version))
      .limit(1);
    assertRow103SafetyGates({
      row92AutomationEnabled: rule?.globalAutomationEnabled === true,
      row104Started: false,
      row105Started: false,
      row106107Started: false,
      xeroWrites: 0,
      customerSends: 0,
      productionWrites: 0,
    });
  }

  private async audit(
    actor: JobProcurementChainActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'financial',
      action,
      entityType: 'job_procurement_chain',
      entityId,
      userId: actor.userId ?? null,
      metadata: {
        ...metadata,
        xeroWrites: 0,
        customerFacing: false,
        timestamp: new Date().toISOString(),
      },
    });
  }

  async stagingAudit(actor: JobProcurementChainActor) {
    this.assertManage(actor);
    await this.assertSafe(actor.companyId);
    const companyId = actor.companyId;

    const [[supplierCount], [poCount], [poJobCount], [poFreeText], [billCount], [jpeCount], [chainCount]] =
      await Promise.all([
        this.db.select({ c: count() }).from(suppliers).where(eq(suppliers.companyId, companyId)),
        this.db
          .select({ c: count() })
          .from(purchaseOrders)
          .where(eq(purchaseOrders.companyId, companyId)),
        this.db
          .select({ c: count() })
          .from(purchaseOrders)
          .where(and(eq(purchaseOrders.companyId, companyId), isNotNull(purchaseOrders.jobId))),
        this.db
          .select({ c: count() })
          .from(purchaseOrders)
          .where(
            and(
              eq(purchaseOrders.companyId, companyId),
              isNull(purchaseOrders.jobId),
              ne(purchaseOrders.jobReference, ''),
              isNotNull(purchaseOrders.jobReference),
            ),
          ),
        this.db.select({ c: count() }).from(xeroBills).where(eq(xeroBills.companyId, companyId)),
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
          .from(jobProcurementChains)
          .where(eq(jobProcurementChains.companyId, companyId)),
      ]);

    await this.audit(actor, 'job_procurement_chain_staging_audit', companyId, {
      readOnly: true,
    });

    return {
      readOnly: true as const,
      xeroWrites: 0 as const,
      counts: {
        suppliers: Number(supplierCount?.c ?? 0),
        purchaseOrders: Number(poCount?.c ?? 0),
        purchaseOrdersWithJobId: Number(poJobCount?.c ?? 0),
        purchaseOrdersFreeTextJobOnly: Number(poFreeText?.c ?? 0),
        xeroBillsImported: Number(billCount?.c ?? 0),
        jpeMaterialLikeCosts: Number(jpeCount?.c ?? 0),
        jobProcurementChains: Number(chainCount?.c ?? 0),
      },
      gaps: {
        formalDeliveryNotes: 'GAP_OVERLAY_EVIDENCE_ONLY',
        titanSupplierInvoicesTable: 'GAP_OVERLAY_EVIDENCE_ONLY',
        xeroBillJobMapping: 'PROJECTION_ONLY',
      },
      row104NotStarted: true as const,
      row105NotStarted: true as const,
      row106107NotStarted: true as const,
      row118NotClosed: true as const,
    };
  }

  async createFromApprovedProposal(
    actor: JobProcurementChainActor,
    input: {
      proposalId: string;
      proposalLineId: string;
      purchasePath?: PurchasePath;
      clientActionId?: string | null;
    },
  ) {
    this.assertManage(actor);
    await this.assertSafe(actor.companyId);

    if (input.clientActionId) {
      const [existing] = await this.db
        .select()
        .from(jobProcurementChains)
        .where(
          and(
            eq(jobProcurementChains.companyId, actor.companyId),
            eq(jobProcurementChains.clientActionId, input.clientActionId),
          ),
        )
        .limit(1);
      if (existing) {
        return { chain: existing, idempotentReplay: true as const };
      }
    }

    const [proposal] = await this.db
      .select()
      .from(boqSplitPurchaseProposals)
      .where(
        and(
          eq(boqSplitPurchaseProposals.companyId, actor.companyId),
          eq(boqSplitPurchaseProposals.id, input.proposalId),
        ),
      )
      .limit(1);
    if (!proposal) {
      throw new JobProcurementChainServiceError('NOT_FOUND', 'Proposal not found', 404);
    }

    const [line] = await this.db
      .select()
      .from(boqSplitPurchaseProposalLines)
      .where(
        and(
          eq(boqSplitPurchaseProposalLines.companyId, actor.companyId),
          eq(boqSplitPurchaseProposalLines.id, input.proposalLineId),
          eq(boqSplitPurchaseProposalLines.proposalId, input.proposalId),
        ),
      )
      .limit(1);
    if (!line) {
      throw new JobProcurementChainServiceError('NOT_FOUND', 'Proposal line not found', 404);
    }

    let quoteId: string | null = null;
    let jobId: string | null = null;
    if (proposal.boqImportId) {
      const [boq] = await this.db
        .select()
        .from(boqImports)
        .where(
          and(
            eq(boqImports.companyId, actor.companyId),
            eq(boqImports.id, proposal.boqImportId),
          ),
        )
        .limit(1);
      quoteId = boq?.quoteId ?? null;
      if (quoteId) {
        const [q] = await this.db
          .select()
          .from(quotes)
          .where(and(eq(quotes.companyId, actor.companyId), eq(quotes.id, quoteId)))
          .limit(1);
        jobId = q?.jobId ?? null;
      }
    }

    const trace = buildBoqQuoteJobTrace({
      boqImportId: proposal.boqImportId,
      boqImportRowId: line.boqImportRowId,
      quoteId,
      quoteLineId: null,
      jobId,
    });
    if (!trace.ok || !trace.chain) {
      throw new JobProcurementChainServiceError(
        trace.warnings[0] ?? 'JOB_LINK_MISSING',
        `Chain blocked: ${trace.warnings.join(', ')}`,
        409,
      );
    }

    const poPlan = buildPoDraftFromApprovedProposal({
      companyId: actor.companyId,
      proposalId: proposal.id,
      proposalLineId: line.id,
      proposalStatus: proposal.status,
      boqImportId: proposal.boqImportId,
      boqImportRowId: line.boqImportRowId,
      quoteId,
      jobId,
      supplierId: line.supplierId,
      supplierName: line.supplierName,
      row100ProposalKey: line.row100ProposalKey,
      offerKey: line.offerKey,
      quantityProposed: line.quantityProposed != null ? Number(line.quantityProposed) : null,
      unitPriceCents: line.unitPriceCents,
      vatBasis: line.vatBasis,
      expectedSupplierCostCents: line.expectedSupplierCostCents,
      sourceDocumentRef: line.supplierDocumentRef,
    });
    if (!poPlan.ok || !poPlan.poDraft) {
      throw new JobProcurementChainServiceError(
        poPlan.warnings[0] ?? 'REVIEW_REQUIRED',
        `PO draft blocked: ${poPlan.warnings.join(', ')}`,
        409,
      );
    }

    if (!actor.userId) {
      throw new JobProcurementChainServiceError('FORBIDDEN', 'Actor required to create PO', 403);
    }

    const po = await this.procurementService.createPurchaseOrder(
      { companyId: actor.companyId, userId: actor.userId },
      {
        supplierId: poPlan.poDraft.supplierId,
        jobId: poPlan.poDraft.jobId,
        jobReference: null,
        notes: `Row103 chain from proposal ${proposal.id}`,
        clientActionId: input.clientActionId
          ? `${input.clientActionId}:po`
          : `row103-po:${line.id}`,
        items: poPlan.poDraft.items.map((i) => ({
          description: i.description,
          quantity: i.quantity,
          unitCostCents: i.unitCostCents,
        })),
      },
    );

    const idempotencyKey = chainIdempotencyKey({
      companyId: actor.companyId,
      proposalLineId: line.id,
      hop: 'chain',
    });

    const [chain] = await this.db
      .insert(jobProcurementChains)
      .values({
        companyId: actor.companyId,
        boqImportId: proposal.boqImportId,
        quoteId,
        jobId: trace.chain.jobId,
        splitProposalId: proposal.id,
        purchasePath: input.purchasePath ?? 'DIRECT_TO_JOB',
        status: 'PO_DRAFT',
        warnings: poPlan.warnings,
        auraNarrativeFacts: [
          'Row103 chain created from approved Row101 proposal.',
          'Uses existing ProcurementService PO draft — no parallel PO engine.',
          'Rows104–107 not started. Row118 not closed.',
        ],
        idempotencyKey,
        clientActionId: input.clientActionId ?? null,
        createdBy: actor.userId ?? null,
      })
      .returning();

    const poLineId = po.items[0]?.id ?? null;
    await this.db.insert(jobProcurementChainLinks).values({
      companyId: actor.companyId,
      chainId: chain.id,
      boqImportRowId: line.boqImportRowId,
      splitProposalLineId: line.id,
      row100ProposalKey: line.row100ProposalKey,
      offerKey: line.offerKey,
      supplierId: line.supplierId,
      purchaseOrderId: po.id,
      purchaseOrderLineId: poLineId,
      quantity: line.quantityProposed,
      unitPriceCents: line.unitPriceCents,
      lineCostCents: line.expectedSupplierCostCents,
      vatBasis: line.vatBasis,
      warnings: poPlan.warnings,
      position: 0,
    });

    await this.audit(actor, 'job_procurement_chain_created', chain.id, {
      proposalId: proposal.id,
      purchaseOrderId: po.id,
      jobId: trace.chain.jobId,
      mutatesBoqSource: false,
      createsXeroWrite: false,
    });

    return {
      chain,
      purchaseOrder: po,
      idempotentReplay: false as const,
      mutatesBoqSource: false as const,
      row100EvidencePreserved: true as const,
      row101ProposalPreserved: true as const,
      createsXeroWrite: false as const,
    };
  }

  async recordDelivery(
    actor: JobProcurementChainActor,
    chainId: string,
    input: {
      deliveredQuantity: number | null;
      deliveredAt?: string | null;
      deliveryReference?: string | null;
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
          eq(jobProcurementChains.id, chainId),
        ),
      )
      .limit(1);
    if (!chain) throw new JobProcurementChainServiceError('NOT_FOUND', 'Chain not found', 404);

    const [link] = await this.db
      .select()
      .from(jobProcurementChainLinks)
      .where(
        and(
          eq(jobProcurementChainLinks.companyId, actor.companyId),
          eq(jobProcurementChainLinks.chainId, chainId),
        ),
      )
      .limit(1);
    if (!link?.purchaseOrderId || !link.purchaseOrderLineId) {
      throw new JobProcurementChainServiceError('PO_LINK_MISSING', 'PO link missing', 409);
    }

    const [poItem] = await this.db
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.id, link.purchaseOrderLineId))
      .limit(1);

    const recorded = recordDeliveryEvidence({
      companyId: actor.companyId,
      purchaseOrderId: link.purchaseOrderId,
      purchaseOrderLineId: link.purchaseOrderLineId,
      jobId: chain.jobId,
      expectedJobId: chain.jobId,
      deliveredQuantity: input.deliveredQuantity,
      deliveredAt: input.deliveredAt ?? null,
      deliveryReference: input.deliveryReference ?? null,
      orderedQuantity: poItem?.quantity != null ? Number(poItem.quantity) : null,
    });
    if (!recorded.ok || !recorded.evidence) {
      throw new JobProcurementChainServiceError(
        recorded.warnings[0] ?? 'DELIVERY_EVIDENCE_MISSING',
        `Delivery blocked: ${recorded.warnings.join(', ')}`,
        409,
      );
    }

    const [evidence] = await this.db
      .insert(jobProcurementDeliveryEvidence)
      .values({
        companyId: actor.companyId,
        chainId,
        chainLinkId: link.id,
        purchaseOrderId: recorded.evidence.purchaseOrderId,
        purchaseOrderLineId: recorded.evidence.purchaseOrderLineId,
        jobId: recorded.evidence.jobId,
        deliveredQuantity:
          recorded.evidence.deliveredQuantity != null
            ? String(recorded.evidence.deliveredQuantity)
            : null,
        deliveredAt: recorded.evidence.deliveredAt
          ? new Date(recorded.evidence.deliveredAt)
          : null,
        deliveryReference: recorded.evidence.deliveryReference,
        isPartial: recorded.partial,
        createdBy: actor.userId ?? null,
      })
      .returning();

    await this.db
      .update(jobProcurementChainLinks)
      .set({ deliveryEvidenceId: evidence.id })
      .where(
        and(
          eq(jobProcurementChainLinks.companyId, actor.companyId),
          eq(jobProcurementChainLinks.id, link.id),
        ),
      );
    await this.db
      .update(jobProcurementChains)
      .set({
        status: recorded.partial ? 'DELIVERED_PARTIAL' : 'DELIVERED',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(jobProcurementChains.companyId, actor.companyId),
          eq(jobProcurementChains.id, chainId),
        ),
      );

    await this.audit(actor, 'job_procurement_delivery_recorded', evidence.id, {
      chainId,
      partial: recorded.partial,
    });

    return { evidence, partial: recorded.partial, warnings: recorded.warnings };
  }

  async recordSupplierInvoice(
    actor: JobProcurementChainActor,
    chainId: string,
    input: {
      invoiceNumber?: string | null;
      invoiceDate?: string | null;
      sourceDocumentRef?: string | null;
      lineQuantity?: number | null;
      lineCostCents?: number | null;
      vatBasis?: string | null;
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
          eq(jobProcurementChains.id, chainId),
        ),
      )
      .limit(1);
    if (!chain) throw new JobProcurementChainServiceError('NOT_FOUND', 'Chain not found', 404);

    const [link] = await this.db
      .select()
      .from(jobProcurementChainLinks)
      .where(
        and(
          eq(jobProcurementChainLinks.companyId, actor.companyId),
          eq(jobProcurementChainLinks.chainId, chainId),
        ),
      )
      .limit(1);
    if (!link) throw new JobProcurementChainServiceError('NOT_FOUND', 'Chain link not found', 404);

    const recorded = recordSupplierInvoiceEvidence({
      companyId: actor.companyId,
      supplierId: link.supplierId,
      invoiceNumber: input.invoiceNumber ?? null,
      invoiceDate: input.invoiceDate ?? null,
      sourceDocumentRef: input.sourceDocumentRef ?? null,
      purchaseOrderId: link.purchaseOrderId,
      purchaseOrderLineId: link.purchaseOrderLineId,
      deliveryEvidenceId: link.deliveryEvidenceId,
      jobId: chain.jobId,
      expectedJobId: chain.jobId,
      lineQuantity: input.lineQuantity ?? null,
      lineCostCents: input.lineCostCents ?? null,
      vatBasis: input.vatBasis ?? null,
    });
    if (!recorded.ok || !recorded.line) {
      throw new JobProcurementChainServiceError(
        recorded.warnings[0] ?? 'SUPPLIER_INVOICE_LINK_MISSING',
        `Invoice blocked: ${recorded.warnings.join(', ')}`,
        409,
      );
    }

    const [evidence] = await this.db
      .insert(jobProcurementSupplierInvoiceEvidence)
      .values({
        companyId: actor.companyId,
        chainId,
        chainLinkId: link.id,
        supplierId: recorded.line.supplierId,
        jobId: recorded.line.jobId,
        purchaseOrderId: recorded.line.purchaseOrderId,
        purchaseOrderLineId: recorded.line.purchaseOrderLineId,
        deliveryEvidenceId: recorded.line.deliveryEvidenceId,
        invoiceNumber: recorded.line.invoiceNumber,
        invoiceDate: recorded.line.invoiceDate,
        sourceDocumentRef: recorded.line.sourceDocumentRef,
        lineQuantity:
          recorded.line.lineQuantity != null ? String(recorded.line.lineQuantity) : null,
        lineCostCents: recorded.line.lineCostCents,
        vatBasis: recorded.line.vatBasis,
        missingFields: recorded.line.missingFields,
        warnings: recorded.warnings,
        createdBy: actor.userId ?? null,
      })
      .returning();

    await this.db
      .update(jobProcurementChainLinks)
      .set({
        supplierInvoiceEvidenceId: evidence.id,
        lineCostCents: recorded.line.lineCostCents,
      })
      .where(
        and(
          eq(jobProcurementChainLinks.companyId, actor.companyId),
          eq(jobProcurementChainLinks.id, link.id),
        ),
      );
    await this.db
      .update(jobProcurementChains)
      .set({ status: 'INVOICED', updatedAt: new Date() })
      .where(
        and(
          eq(jobProcurementChains.companyId, actor.companyId),
          eq(jobProcurementChains.id, chainId),
        ),
      );

    await this.audit(actor, 'job_procurement_supplier_invoice_recorded', evidence.id, {
      chainId,
      missingFields: recorded.line.missingFields,
    });

    return { evidence, warnings: recorded.warnings, missingFields: recorded.line.missingFields };
  }

  async projectXeroBill(
    actor: JobProcurementChainActor,
    chainId: string,
    input: { knownXeroBillId?: string | null; knownXeroInvoiceId?: string | null },
  ) {
    this.assertManage(actor);
    await this.assertSafe(actor.companyId);

    const [link] = await this.db
      .select()
      .from(jobProcurementChainLinks)
      .where(
        and(
          eq(jobProcurementChainLinks.companyId, actor.companyId),
          eq(jobProcurementChainLinks.chainId, chainId),
        ),
      )
      .limit(1);
    if (!link?.supplierInvoiceEvidenceId) {
      throw new JobProcurementChainServiceError(
        'SUPPLIER_INVOICE_LINK_MISSING',
        'Supplier invoice evidence required',
        409,
      );
    }

    let knownBillId = input.knownXeroBillId ?? null;
    let knownInvoiceId = input.knownXeroInvoiceId ?? null;
    if (knownBillId) {
      const [bill] = await this.db
        .select()
        .from(xeroBills)
        .where(
          and(eq(xeroBills.companyId, actor.companyId), eq(xeroBills.id, knownBillId)),
        )
        .limit(1);
      if (!bill) {
        throw new JobProcurementChainServiceError(
          'XERO_BILL_NOT_LINKED',
          'Known Xero bill id not found in tenant import store',
          404,
        );
      }
      knownInvoiceId = bill.xeroInvoiceId;
    }

    const projection = projectXeroBillLinkage({
      companyId: actor.companyId,
      supplierInvoiceEvidenceId: link.supplierInvoiceEvidenceId,
      knownXeroBillId: knownBillId,
      knownXeroInvoiceId: knownInvoiceId,
      xeroWrites: 0,
    });

    if (projection.linked) {
      await this.db
        .update(jobProcurementChainLinks)
        .set({
          xeroBillId: projection.projection.xeroBillId,
          xeroInvoiceId: projection.projection.xeroInvoiceId,
        })
        .where(
          and(
            eq(jobProcurementChainLinks.companyId, actor.companyId),
            eq(jobProcurementChainLinks.id, link.id),
          ),
        );
    }

    await this.audit(actor, 'job_procurement_xero_bill_projected', chainId, {
      status: projection.projection.status,
      xeroWrites: 0,
    });

    return projection;
  }

  async postMaterialCost(
    actor: JobProcurementChainActor,
    chainId: string,
    input: {
      materialUseTransactionId?: string | null;
      stockReceiptMovementId?: string | null;
    },
  ) {
    this.assertManage(actor);
    await this.assertSafe(actor.companyId);

    if (!actor.userId) {
      throw new JobProcurementChainServiceError('FORBIDDEN', 'Actor required for JPE post', 403);
    }

    const [chain] = await this.db
      .select()
      .from(jobProcurementChains)
      .where(
        and(
          eq(jobProcurementChains.companyId, actor.companyId),
          eq(jobProcurementChains.id, chainId),
        ),
      )
      .limit(1);
    if (!chain) throw new JobProcurementChainServiceError('NOT_FOUND', 'Chain not found', 404);

    const [link] = await this.db
      .select()
      .from(jobProcurementChainLinks)
      .where(
        and(
          eq(jobProcurementChainLinks.companyId, actor.companyId),
          eq(jobProcurementChainLinks.chainId, chainId),
        ),
      )
      .limit(1);
    if (!link) throw new JobProcurementChainServiceError('NOT_FOUND', 'Chain link not found', 404);

    const existing = await this.db
      .select({
        sourceType: jobDirectCostEntries.sourceType,
        sourceId: jobDirectCostEntries.sourceId,
      })
      .from(jobDirectCostEntries)
      .where(eq(jobDirectCostEntries.companyId, actor.companyId));

    const existingKeys = existing.map((e) => e.sourceId);

    const resolved = resolveMaterialCostPosting({
      companyId: actor.companyId,
      jobId: chain.jobId,
      path: (chain.purchasePath as PurchasePath) || 'DIRECT_TO_JOB',
      supplierInvoiceEvidenceId: link.supplierInvoiceEvidenceId,
      stockReceiptMovementId: input.stockReceiptMovementId ?? null,
      materialUseTransactionId: input.materialUseTransactionId ?? null,
      amountCents: link.lineCostCents,
      existingJpeSourceKeys: existingKeys,
    });

    if (!resolved.shouldPost) {
      await this.db
        .update(jobProcurementChainLinks)
        .set({
          costAuthority: resolved.costAuthority,
          warnings: [...((link.warnings as string[]) ?? []), ...resolved.warnings],
        })
        .where(eq(jobProcurementChainLinks.id, link.id));
      return {
        posted: false as const,
        duplicateBlocked: resolved.duplicateBlocked,
        warnings: resolved.warnings,
        costAuthority: resolved.costAuthority,
      };
    }

    const [posted] = await this.db
      .insert(jobDirectCostEntries)
      .values({
        companyId: actor.companyId,
        jobId: chain.jobId,
        category: 'consumables',
        description: `Row103 chain material cost ${chainId}`,
        amountCents: resolved.amountCents!,
        supplierId: link.supplierId,
        sourceType: resolved.jpeSourceType!,
        sourceId: resolved.jpeSourceId!,
        enteredByUserId: actor.userId,
        purchaseOrderId: link.purchaseOrderId,
      })
      .onConflictDoNothing()
      .returning();

    await this.db
      .update(jobProcurementChainLinks)
      .set({
        jpeSourceType: resolved.jpeSourceType,
        jpeSourceId: resolved.jpeSourceId,
        costAuthority: resolved.costAuthority,
        materialUseTransactionId: input.materialUseTransactionId ?? null,
        stockMovementId: input.stockReceiptMovementId ?? null,
      })
      .where(eq(jobProcurementChainLinks.id, link.id));

    await this.db
      .update(jobProcurementChains)
      .set({ status: 'COST_POSTED', updatedAt: new Date() })
      .where(eq(jobProcurementChains.id, chainId));

    await this.audit(actor, 'job_procurement_jpe_cost_posted', chainId, {
      jpeSourceId: resolved.jpeSourceId,
      posted: Boolean(posted),
      duplicateBlocked: !posted,
    });

    return {
      posted: Boolean(posted),
      duplicateBlocked: !posted,
      jpeEntry: posted ?? null,
      costAuthority: resolved.costAuthority,
      warnings: resolved.warnings,
    };
  }

  async get(actor: JobProcurementChainActor, chainId: string) {
    this.assertManage(actor);
    const [chain] = await this.db
      .select()
      .from(jobProcurementChains)
      .where(
        and(
          eq(jobProcurementChains.companyId, actor.companyId),
          eq(jobProcurementChains.id, chainId),
        ),
      )
      .limit(1);
    if (!chain) throw new JobProcurementChainServiceError('NOT_FOUND', 'Chain not found', 404);
    const links = await this.db
      .select()
      .from(jobProcurementChainLinks)
      .where(
        and(
          eq(jobProcurementChainLinks.companyId, actor.companyId),
          eq(jobProcurementChainLinks.chainId, chainId),
        ),
      );
    return {
      chain,
      links,
      row99Immutable: true as const,
      row100EvidencePreserved: true as const,
      row101ProposalPreserved: true as const,
      row102ExportsUnchanged: true as const,
      row104NotStarted: true as const,
      row118NotClosed: true as const,
    };
  }
}
