import { and, count, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import {
  companyPricebookRuleSets,
  jobDirectCostEntries,
  jobProcurementSupplierInvoiceEvidence,
  jobs,
  multiJobSupplierInvoiceAllocationCorrections,
  multiJobSupplierInvoiceAllocations,
  multiJobSupplierInvoiceLines,
  multiJobSupplierInvoices,
  purchaseOrders,
  securityAuditLogs,
  xeroBills,
  type DatabaseClient,
} from '@titan/db';
import {
  assertRow105SafetyGates,
  buildAllocationCorrection,
  canManageMultiJobInvoiceAllocation,
  freezeSourceInvoice,
  linkXeroBillForAllocation,
  resolveAllocationBalance,
  resolveAllocationJpePosting,
  resolveCreditAgainstAllocations,
  validateJobAllocation,
} from '@titan/shared';

export class MultiJobAllocServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'MultiJobAllocServiceError';
  }
}

export type MultiJobAllocActor = {
  companyId: string;
  userId?: string | null;
  roleName?: string | null;
  permissions?: string[] | null;
};

export class MultiJobSupplierInvoiceAllocationService {
  constructor(private readonly db: DatabaseClient) {}

  private assertManage(actor: MultiJobAllocActor) {
    const role = (actor.roleName ?? '').toLowerCase();
    if (role.includes('client') || role === 'technician' || role.includes('tech')) {
      throw new MultiJobAllocServiceError('FORBIDDEN', 'Invoice allocation denied', 403);
    }
    if (!canManageMultiJobInvoiceAllocation(actor)) {
      throw new MultiJobAllocServiceError('FORBIDDEN', 'Invoice allocation denied', 403);
    }
  }

  private async assertSafe(companyId: string) {
    const [rule] = await this.db
      .select({ globalAutomationEnabled: companyPricebookRuleSets.globalAutomationEnabled })
      .from(companyPricebookRuleSets)
      .where(eq(companyPricebookRuleSets.companyId, companyId))
      .orderBy(desc(companyPricebookRuleSets.version))
      .limit(1);
    assertRow105SafetyGates({
      row92AutomationEnabled: rule?.globalAutomationEnabled === true,
      row106107Started: false,
      xeroWrites: 0,
      customerSends: 0,
      productionWrites: 0,
    });
  }

  private async audit(
    actor: MultiJobAllocActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'financial',
      action,
      entityType: 'multi_job_supplier_invoice_allocation',
      entityId,
      userId: actor.userId ?? null,
      metadata: { ...metadata, xeroWrites: 0, timestamp: new Date().toISOString() },
    });
  }

  async stagingAudit(actor: MultiJobAllocActor) {
    this.assertManage(actor);
    await this.assertSafe(actor.companyId);
    const companyId = actor.companyId;

    const [[evidence], [evidenceLines], [allocs], [xero], [jpe], [invoices]] = await Promise.all([
      this.db
        .select({ c: count() })
        .from(jobProcurementSupplierInvoiceEvidence)
        .where(eq(jobProcurementSupplierInvoiceEvidence.companyId, companyId)),
      this.db
        .select({ c: count() })
        .from(multiJobSupplierInvoiceLines)
        .where(eq(multiJobSupplierInvoiceLines.companyId, companyId)),
      this.db
        .select({ c: count() })
        .from(multiJobSupplierInvoiceAllocations)
        .where(eq(multiJobSupplierInvoiceAllocations.companyId, companyId)),
      this.db.select({ c: count() }).from(xeroBills).where(eq(xeroBills.companyId, companyId)),
      this.db
        .select({ c: count() })
        .from(jobDirectCostEntries)
        .where(
          and(
            eq(jobDirectCostEntries.companyId, companyId),
            inArray(jobDirectCostEntries.sourceType, ['supplier_invoice', 'material_line', 'adjustment']),
          ),
        ),
      this.db
        .select({ c: count() })
        .from(multiJobSupplierInvoices)
        .where(eq(multiJobSupplierInvoices.companyId, companyId)),
    ]);

    const [poLinked] = await this.db
      .select({ c: count() })
      .from(jobProcurementSupplierInvoiceEvidence)
      .where(
        and(
          eq(jobProcurementSupplierInvoiceEvidence.companyId, companyId),
          sql`${jobProcurementSupplierInvoiceEvidence.purchaseOrderId} IS NOT NULL`,
        ),
      );
    const [jobLinked] = await this.db
      .select({ c: count() })
      .from(jobProcurementSupplierInvoiceEvidence)
      .where(
        and(
          eq(jobProcurementSupplierInvoiceEvidence.companyId, companyId),
          sql`${jobProcurementSupplierInvoiceEvidence.jobId} IS NOT NULL`,
        ),
      );
    const [over] = await this.db
      .select({ c: count() })
      .from(multiJobSupplierInvoices)
      .where(
        and(
          eq(multiJobSupplierInvoices.companyId, companyId),
          eq(multiJobSupplierInvoices.balanceStatus, 'OVER_ALLOCATED'),
        ),
      );

    const fullInvoiceKeys = await this.db
      .select({ sourceId: jobDirectCostEntries.sourceId })
      .from(jobDirectCostEntries)
      .where(
        and(
          eq(jobDirectCostEntries.companyId, companyId),
          eq(jobDirectCostEntries.sourceType, 'supplier_invoice'),
        ),
      );
    const keyCounts = new Map<string, number>();
    for (const row of fullInvoiceKeys) {
      if (!row.sourceId.startsWith('supplier_invoice:')) continue;
      keyCounts.set(row.sourceId, (keyCounts.get(row.sourceId) ?? 0) + 1);
    }
    const possibleDuplicatePostingPaths = [...keyCounts.values()].filter((n) => n > 1).length;

    return {
      supplierInvoiceEvidence: Number(evidence.c),
      supplierInvoiceLinesRow105: Number(evidenceLines.c),
      multiJobInvoices: Number(invoices.c),
      multiJobCandidateInvoices: 0,
      invoicesLinkedToPo: Number(poLinked.c),
      invoicesLinkedToJob: Number(jobLinked.c),
      importedXeroBills: Number(xero.c),
      allocationRecords: Number(allocs.c),
      overAllocationCases: Number(over.c),
      jpeSupplierInvoiceMaterialEntries: Number(jpe.c),
      possibleDuplicatePostingPaths,
      xeroWrites: 0,
      note: 'READ-ONLY staging audit; no fabricated allocations',
    };
  }

  async registerInvoice(
    actor: MultiJobAllocActor,
    input: {
      supplierId?: string | null;
      supplierInvoiceEvidenceId?: string | null;
      sourceDocumentRef?: string | null;
      sourceDocumentHash?: string | null;
      invoiceNumber?: string | null;
      invoiceDate?: string | null;
      netAmountCents?: number | null;
      vatAmountCents?: number | null;
      vatBasis?: string | null;
      grossAmountCents?: number | null;
      knownXeroBillId?: string | null;
      knownXeroInvoiceId?: string | null;
      clientActionId?: string | null;
      lines?: Array<{
        lineOrder?: number;
        itemCode?: string | null;
        description?: string | null;
        quantity?: number | null;
        unit?: string | null;
        netAmountCents?: number | null;
        vatAmountCents?: number | null;
        vatBasis?: string | null;
        grossAmountCents?: number | null;
        purchaseOrderId?: string | null;
        purchaseOrderLineId?: string | null;
      }>;
    },
  ) {
    this.assertManage(actor);
    await this.assertSafe(actor.companyId);

    if (input.clientActionId) {
      const [existing] = await this.db
        .select()
        .from(multiJobSupplierInvoices)
        .where(
          and(
            eq(multiJobSupplierInvoices.companyId, actor.companyId),
            eq(multiJobSupplierInvoices.clientActionId, input.clientActionId),
          ),
        )
        .limit(1);
      if (existing) return { invoice: existing, lines: [], idempotentReplay: true };
    }

    const xero = linkXeroBillForAllocation({
      companyId: actor.companyId,
      supplierInvoiceId: input.supplierInvoiceEvidenceId ?? 'pending',
      knownXeroBillId: input.knownXeroBillId ?? null,
      knownXeroInvoiceId: input.knownXeroInvoiceId ?? null,
      xeroWrites: 0,
    });

    const [invoice] = await this.db
      .insert(multiJobSupplierInvoices)
      .values({
        companyId: actor.companyId,
        supplierId: input.supplierId ?? null,
        supplierInvoiceEvidenceId: input.supplierInvoiceEvidenceId ?? null,
        sourceDocumentRef: input.sourceDocumentRef ?? null,
        sourceDocumentHash: input.sourceDocumentHash ?? null,
        invoiceNumber: input.invoiceNumber ?? null,
        invoiceDate: input.invoiceDate ?? null,
        netAmountCents: input.netAmountCents ?? null,
        vatAmountCents: input.vatAmountCents ?? null,
        vatBasis: input.vatBasis ?? null,
        grossAmountCents: input.grossAmountCents ?? null,
        knownXeroBillId: xero.xeroBillId,
        knownXeroInvoiceId: xero.xeroInvoiceId,
        xeroLinkStatus: xero.status,
        immutableSource: true,
        balanceStatus: 'UNALLOCATED',
        warnings: xero.warning ? [xero.warning] : [],
        idempotencyKey: input.clientActionId ?? null,
        clientActionId: input.clientActionId ?? null,
        createdBy: actor.userId ?? null,
      })
      .returning();

    const lines = [];
    for (const [i, line] of (input.lines ?? []).entries()) {
      const [row] = await this.db
        .insert(multiJobSupplierInvoiceLines)
        .values({
          companyId: actor.companyId,
          invoiceId: invoice.id,
          lineOrder: line.lineOrder ?? i + 1,
          itemCode: line.itemCode ?? null,
          description: line.description ?? null,
          quantity: line.quantity != null ? String(line.quantity) : null,
          unit: line.unit ?? null,
          netAmountCents: line.netAmountCents ?? null,
          vatAmountCents: line.vatAmountCents ?? null,
          vatBasis: line.vatBasis ?? null,
          grossAmountCents: line.grossAmountCents ?? null,
          purchaseOrderId: line.purchaseOrderId ?? null,
          purchaseOrderLineId: line.purchaseOrderLineId ?? null,
        })
        .returning();
      lines.push(row);
    }

    await this.audit(actor, 'multi_job_supplier_invoice_registered', invoice.id, {
      immutableSource: true,
      xeroLinkStatus: xero.status,
      lineCount: lines.length,
    });

    return { invoice, lines, idempotentReplay: false, xero };
  }

  async allocateToJob(
    actor: MultiJobAllocActor,
    input: {
      invoiceId: string;
      invoiceLineId?: string | null;
      jobId: string;
      purchaseOrderId?: string | null;
      purchaseOrderLineId?: string | null;
      allocationNetCents: number;
      allocationVatCents?: number | null;
      allocationGrossCents?: number | null;
      allocationQuantity?: number | null;
      reason?: string | null;
      reviewStatus?: 'DRAFT' | 'REVIEWED' | 'APPROVED';
      clientActionId?: string | null;
      postJpe?: boolean;
      expectedJobId?: string | null;
    },
  ) {
    this.assertManage(actor);
    await this.assertSafe(actor.companyId);

    if (input.clientActionId) {
      const [existing] = await this.db
        .select()
        .from(multiJobSupplierInvoiceAllocations)
        .where(
          and(
            eq(multiJobSupplierInvoiceAllocations.companyId, actor.companyId),
            eq(multiJobSupplierInvoiceAllocations.clientActionId, input.clientActionId),
          ),
        )
        .limit(1);
      if (existing) return { allocation: existing, balance: null, jpe: null, idempotentReplay: true };
    }

    const [invoice] = await this.db
      .select()
      .from(multiJobSupplierInvoices)
      .where(
        and(
          eq(multiJobSupplierInvoices.companyId, actor.companyId),
          eq(multiJobSupplierInvoices.id, input.invoiceId),
        ),
      )
      .limit(1);
    if (!invoice) throw new MultiJobAllocServiceError('NOT_FOUND', 'Invoice not found', 404);
    if (!invoice.immutableSource) {
      throw new MultiJobAllocServiceError('SOURCE_MUTATION_BLOCKED', 'Source invoice must stay immutable', 409);
    }

    const [job] = await this.db
      .select({ id: jobs.id, companyId: jobs.companyId })
      .from(jobs)
      .where(and(eq(jobs.id, input.jobId), eq(jobs.companyId, actor.companyId)))
      .limit(1);
    if (!job) throw new MultiJobAllocServiceError('WRONG_JOB', 'Job not found in tenant', 404);

    let poSupplierId: string | null = null;
    let poNet: number | null = null;
    if (input.purchaseOrderId) {
      const [po] = await this.db
        .select()
        .from(purchaseOrders)
        .where(
          and(
            eq(purchaseOrders.companyId, actor.companyId),
            eq(purchaseOrders.id, input.purchaseOrderId),
          ),
        )
        .limit(1);
      poSupplierId = po?.supplierId ?? null;
      poNet = po?.totalCostCents ?? null;
    }

    const allocationKey =
      input.clientActionId ??
      `${invoice.id}:${input.jobId}:${input.invoiceLineId ?? 'header'}:${input.allocationNetCents}`;

    const validated = validateJobAllocation({
      allocationKey,
      supplierInvoiceId: invoice.id,
      invoiceLineId: input.invoiceLineId ?? null,
      jobId: input.jobId,
      expectedJobId: input.expectedJobId ?? input.jobId,
      expectedJobCompanyId: actor.companyId,
      companyId: actor.companyId,
      purchaseOrderId: input.purchaseOrderId ?? null,
      purchaseOrderLineId: input.purchaseOrderLineId ?? null,
      allocationNetCents: input.allocationNetCents,
      allocationVatCents: input.allocationVatCents ?? null,
      allocationGrossCents: input.allocationGrossCents ?? null,
      allocationQuantity: input.allocationQuantity ?? null,
      reason: input.reason ?? null,
      reviewStatus: input.reviewStatus ?? 'APPROVED',
      actorUserId: actor.userId ?? null,
      occurredAt: new Date().toISOString(),
      invoiceSupplierId: invoice.supplierId,
      poSupplierId,
      poNetAmountCents: poNet,
      poQuantity: null,
    });
    if (!validated.ok || !validated.allocation) {
      throw new MultiJobAllocServiceError(
        validated.warnings[0] ?? 'REVIEW_REQUIRED',
        `Allocation blocked: ${validated.warnings.join(', ')}`,
        409,
      );
    }

    const existingAllocs = await this.db
      .select()
      .from(multiJobSupplierInvoiceAllocations)
      .where(
        and(
          eq(multiJobSupplierInvoiceAllocations.companyId, actor.companyId),
          eq(multiJobSupplierInvoiceAllocations.invoiceId, invoice.id),
          ne(multiJobSupplierInvoiceAllocations.reviewStatus, 'SUPERSEDED'),
        ),
      );

    const projectedBalance = resolveAllocationBalance({
      source: freezeSourceInvoice({
        companyId: invoice.companyId,
        supplierInvoiceId: invoice.id,
        supplierId: invoice.supplierId,
        sourceDocumentRef: invoice.sourceDocumentRef,
        sourceDocumentHash: invoice.sourceDocumentHash,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        netAmountCents: invoice.netAmountCents,
        vatAmountCents: invoice.vatAmountCents,
        vatBasis: invoice.vatBasis,
        grossAmountCents: invoice.grossAmountCents,
        knownXeroBillId: invoice.knownXeroBillId,
        knownXeroInvoiceId: invoice.knownXeroInvoiceId,
        lines: [],
      }),
      allocations: [
        ...existingAllocs.map((a) => ({
          allocationNetCents: a.allocationNetCents,
          allocationVatCents: a.allocationVatCents,
          allocationGrossCents: a.allocationGrossCents,
        })),
        {
          allocationNetCents: validated.allocation.allocationNetCents,
          allocationVatCents: validated.allocation.allocationVatCents,
          allocationGrossCents: validated.allocation.allocationGrossCents,
        },
      ],
    });
    if (projectedBalance.status === 'OVER_ALLOCATED') {
      throw new MultiJobAllocServiceError(
        'OVER_ALLOCATED',
        'Allocation would exceed source invoice net',
        409,
      );
    }

    const [allocation] = await this.db
      .insert(multiJobSupplierInvoiceAllocations)
      .values({
        companyId: actor.companyId,
        invoiceId: invoice.id,
        invoiceLineId: input.invoiceLineId ?? null,
        jobId: validated.allocation.jobId,
        purchaseOrderId: validated.allocation.purchaseOrderId,
        purchaseOrderLineId: validated.allocation.purchaseOrderLineId,
        allocationKey: validated.allocation.allocationKey,
        allocationNetCents: validated.allocation.allocationNetCents,
        allocationVatCents: validated.allocation.allocationVatCents,
        allocationGrossCents: validated.allocation.allocationGrossCents,
        allocationQuantity:
          validated.allocation.allocationQuantity != null
            ? String(validated.allocation.allocationQuantity)
            : null,
        reason: validated.allocation.reason,
        reviewStatus: validated.allocation.reviewStatus,
        warnings: validated.allocation.warnings,
        jpeSourceId: validated.allocation.jpeSourceId,
        jpePosted: false,
        idempotencyKey: input.clientActionId ?? null,
        clientActionId: input.clientActionId ?? null,
        actorUserId: actor.userId ?? null,
      })
      .returning();

    await this.db
      .update(multiJobSupplierInvoices)
      .set({
        balanceStatus: projectedBalance.status,
        warnings: projectedBalance.warnings,
        updatedAt: new Date(),
      })
      .where(eq(multiJobSupplierInvoices.id, invoice.id));

    let jpe: Record<string, unknown> | null = null;
    if (input.postJpe !== false && actor.userId) {
      const existingJpe = await this.db
        .select({ sourceId: jobDirectCostEntries.sourceId })
        .from(jobDirectCostEntries)
        .where(eq(jobDirectCostEntries.companyId, actor.companyId));
      const post = resolveAllocationJpePosting({
        allocationKey: validated.allocation.allocationKey,
        supplierInvoiceId: invoice.supplierInvoiceEvidenceId ?? invoice.id,
        jobId: validated.allocation.jobId,
        amountCents: validated.allocation.allocationNetCents,
        existingJpeSourceKeys: existingJpe.map((e) => e.sourceId),
      });
      if (post.shouldPost && post.jpeSourceId && post.amountCents != null) {
        const [posted] = await this.db
          .insert(jobDirectCostEntries)
          .values({
            companyId: actor.companyId,
            jobId: validated.allocation.jobId,
            category: 'consumables',
            description: `Row105 allocation ${allocation.id}`,
            amountCents: post.amountCents,
            supplierId: invoice.supplierId,
            sourceType: 'supplier_invoice',
            sourceId: post.jpeSourceId,
            enteredByUserId: actor.userId,
            purchaseOrderId: validated.allocation.purchaseOrderId,
          })
          .onConflictDoNothing()
          .returning();
        if (posted) {
          await this.db
            .update(multiJobSupplierInvoiceAllocations)
            .set({ jpePosted: true, jpeSourceId: post.jpeSourceId })
            .where(eq(multiJobSupplierInvoiceAllocations.id, allocation.id));
        }
        jpe = { posted: Boolean(posted), ...post };
      } else {
        jpe = post;
      }
    }

    await this.audit(actor, 'multi_job_supplier_invoice_allocated', allocation.id, {
      invoiceId: invoice.id,
      jobId: allocation.jobId,
      allocationNetCents: allocation.allocationNetCents,
      balanceStatus: projectedBalance.status,
      jpe,
    });

    return { allocation, balance: projectedBalance, jpe, idempotentReplay: false };
  }

  async correctAllocation(
    actor: MultiJobAllocActor,
    input: {
      priorAllocationId: string;
      newJobId?: string | null;
      newAllocationNetCents?: number | null;
      reason: string;
      clientActionId?: string | null;
    },
  ) {
    this.assertManage(actor);
    await this.assertSafe(actor.companyId);

    const [prior] = await this.db
      .select()
      .from(multiJobSupplierInvoiceAllocations)
      .where(
        and(
          eq(multiJobSupplierInvoiceAllocations.companyId, actor.companyId),
          eq(multiJobSupplierInvoiceAllocations.id, input.priorAllocationId),
        ),
      )
      .limit(1);
    if (!prior) throw new MultiJobAllocServiceError('NOT_FOUND', 'Allocation not found', 404);

    const corr = buildAllocationCorrection({
      priorAllocationKey: prior.allocationKey,
      priorAmountCents: prior.allocationNetCents,
      newAllocationKey: input.newJobId ? `${prior.allocationKey}:corr` : null,
      reason: input.reason,
    });

    let newAllocation = null;
    if (input.newJobId && input.newAllocationNetCents != null) {
      const created = await this.allocateToJob(actor, {
        invoiceId: prior.invoiceId,
        invoiceLineId: prior.invoiceLineId,
        jobId: input.newJobId,
        purchaseOrderId: prior.purchaseOrderId,
        purchaseOrderLineId: prior.purchaseOrderLineId,
        allocationNetCents: input.newAllocationNetCents,
        allocationVatCents: prior.allocationVatCents,
        allocationGrossCents: prior.allocationGrossCents,
        reason: input.reason,
        clientActionId: input.clientActionId ?? corr.correctionKey,
        postJpe: true,
      });
      newAllocation = created.allocation;
    }

    await this.db
      .update(multiJobSupplierInvoiceAllocations)
      .set({
        reviewStatus: 'SUPERSEDED',
        supersededByAllocationId: newAllocation?.id ?? null,
      })
      .where(eq(multiJobSupplierInvoiceAllocations.id, prior.id));

    if (prior.jpePosted && prior.jpeSourceId && actor.userId) {
      const reverseKey = `supplier_invoice_alloc_reversal:${prior.allocationKey}`;
      await this.db
        .insert(jobDirectCostEntries)
        .values({
          companyId: actor.companyId,
          jobId: prior.jobId,
          category: 'consumables',
          description: `Row105 allocation reversal ${prior.id}`,
          amountCents: corr.reverseAmountCents,
          supplierId: null,
          sourceType: 'adjustment',
          sourceId: reverseKey,
          enteredByUserId: actor.userId,
          purchaseOrderId: prior.purchaseOrderId,
        })
        .onConflictDoNothing();
    }

    const [correction] = await this.db
      .insert(multiJobSupplierInvoiceAllocationCorrections)
      .values({
        companyId: actor.companyId,
        invoiceId: prior.invoiceId,
        priorAllocationId: prior.id,
        newAllocationId: newAllocation?.id ?? null,
        correctionKey: corr.correctionKey,
        reverseAmountCents: corr.reverseAmountCents,
        reason: input.reason,
        preservesHistory: true,
        actorUserId: actor.userId ?? null,
      })
      .returning();

    await this.audit(actor, 'multi_job_allocation_corrected', correction.id, {
      priorAllocationId: prior.id,
      newAllocationId: newAllocation?.id ?? null,
      preservesHistory: true,
    });

    return { correction, prior, newAllocation };
  }

  async applyCreditToAllocation(
    actor: MultiJobAllocActor,
    input: {
      allocationIds: string[];
      creditAmountCents: number;
      ambiguous?: boolean;
      clientActionId?: string | null;
    },
  ) {
    this.assertManage(actor);
    await this.assertSafe(actor.companyId);

    const allocs = await this.db
      .select()
      .from(multiJobSupplierInvoiceAllocations)
      .where(
        and(
          eq(multiJobSupplierInvoiceAllocations.companyId, actor.companyId),
          inArray(multiJobSupplierInvoiceAllocations.id, input.allocationIds),
        ),
      );
    const existingJpe = await this.db
      .select({ sourceId: jobDirectCostEntries.sourceId })
      .from(jobDirectCostEntries)
      .where(eq(jobDirectCostEntries.companyId, actor.companyId));

    const resolved = resolveCreditAgainstAllocations({
      creditAmountCents: input.creditAmountCents,
      relatedAllocationKeys: allocs.map((a) => a.allocationKey),
      existingJpeSourceKeys: existingJpe.map((e) => e.sourceId),
      ambiguous: input.ambiguous === true || allocs.length !== 1,
    });
    if (!resolved.ok) {
      throw new MultiJobAllocServiceError(
        resolved.warnings[0] ?? 'REVIEW_REQUIRED',
        `Credit blocked: ${resolved.warnings.join(', ')}`,
        409,
      );
    }

    const posted = [];
    for (const adj of resolved.adjustments) {
      const alloc = allocs.find((a) => a.allocationKey === adj.allocationKey);
      if (!alloc || !actor.userId) continue;
      const [row] = await this.db
        .insert(jobDirectCostEntries)
        .values({
          companyId: actor.companyId,
          jobId: alloc.jobId,
          category: 'consumables',
          description: `Row105 credit on allocation ${alloc.id}`,
          amountCents: adj.amountCents,
          sourceType: 'adjustment',
          sourceId: adj.jpeSourceId,
          enteredByUserId: actor.userId,
          purchaseOrderId: alloc.purchaseOrderId,
        })
        .onConflictDoNothing()
        .returning();
      posted.push({ allocationId: alloc.id, posted: Boolean(row), ...adj });
    }

    await this.audit(actor, 'multi_job_allocation_credit_applied', input.allocationIds[0] ?? 'none', {
      posted,
      warnings: resolved.warnings,
    });

    return { adjustments: posted, warnings: resolved.warnings };
  }
}
