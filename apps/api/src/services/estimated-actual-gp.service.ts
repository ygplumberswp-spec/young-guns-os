import { and, count, desc, eq, isNotNull, sql } from 'drizzle-orm';
import {
  companyPricebookRuleSets,
  estimatedActualGpComparisons,
  invoiceLineItems,
  invoices,
  jobDirectCostEntries,
  jobs,
  planEstimates,
  quoteCostSnapshots,
  quoteLineItems,
  quotes,
  securityAuditLogs,
  type DatabaseClient,
} from '@titan/db';
import {
  assertRow106SafetyGates,
  canViewEstimatedActualGp,
  gpComparisonIdempotencyKey,
  resolveEstimatedBaseline,
  resolveInvoiceGpComparison,
  resolveJobGpComparison,
  resolveLineGpComparison,
  resolveQuoteGpComparison,
  type EstimatedActualGpResult,
} from '@titan/shared';

export class EstimatedActualGpServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'EstimatedActualGpServiceError';
  }
}

export type EstimatedActualGpActor = {
  companyId: string;
  userId?: string | null;
  roleName?: string | null;
  permissions?: string[] | null;
};

export class EstimatedActualGpService {
  constructor(private readonly db: DatabaseClient) {}

  private assertView(actor: EstimatedActualGpActor) {
    const role = (actor.roleName ?? '').toLowerCase();
    if (role.includes('client') || role === 'technician' || role.includes('tech')) {
      throw new EstimatedActualGpServiceError('FORBIDDEN', 'GP comparison denied', 403);
    }
    if (!canViewEstimatedActualGp(actor)) {
      throw new EstimatedActualGpServiceError('FORBIDDEN', 'GP comparison denied', 403);
    }
  }

  private async assertSafe(companyId: string) {
    const [rule] = await this.db
      .select({ globalAutomationEnabled: companyPricebookRuleSets.globalAutomationEnabled })
      .from(companyPricebookRuleSets)
      .where(eq(companyPricebookRuleSets.companyId, companyId))
      .orderBy(desc(companyPricebookRuleSets.version))
      .limit(1);
    assertRow106SafetyGates({
      row92AutomationEnabled: rule?.globalAutomationEnabled === true,
      row107Started: false,
      xeroWrites: 0,
      customerSends: 0,
      productionWrites: 0,
    });
  }

  private async audit(
    actor: EstimatedActualGpActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'financial',
      action,
      entityType: 'estimated_actual_gp',
      entityId,
      userId: actor.userId ?? null,
      metadata: { ...metadata, xeroWrites: 0, timestamp: new Date().toISOString() },
    });
  }

  private async loadEstimatedBaseline(companyId: string, quoteId: string | null) {
    if (!quoteId) {
      return resolveEstimatedBaseline({ row96: null, row94: null, quoteSellExVatCents: null });
    }

    const [snap] = await this.db
      .select()
      .from(quoteCostSnapshots)
      .where(
        and(eq(quoteCostSnapshots.companyId, companyId), eq(quoteCostSnapshots.quoteId, quoteId)),
      )
      .orderBy(desc(quoteCostSnapshots.snapshotVersion))
      .limit(1);

    const [quote] = await this.db
      .select({
        id: quotes.id,
        subtotalCents: quotes.subtotalCents,
        amountCents: quotes.amountCents,
      })
      .from(quotes)
      .where(and(eq(quotes.companyId, companyId), eq(quotes.id, quoteId)))
      .limit(1);

    const payload = (snap?.payload ?? {}) as {
      summary?: {
        estimatedDirectCostCents?: number | null;
        costEstimateIncomplete?: boolean;
        sellExVatCents?: number | null;
      };
    };
    const summary = payload.summary;

    const [plan] = await this.db
      .select()
      .from(planEstimates)
      .where(and(eq(planEstimates.companyId, companyId), eq(planEstimates.quoteId, quoteId)))
      .limit(1);

    const sell =
      snap?.sellExVatCents ??
      summary?.sellExVatCents ??
      quote?.subtotalCents ??
      quote?.amountCents ??
      null;

    const directFromPayload = summary?.estimatedDirectCostCents ?? null;
    const incomplete =
      summary?.costEstimateIncomplete === true ||
      (snap != null && snap.totalEstimatedCostCents == null) ||
      (snap == null && directFromPayload == null);

    return resolveEstimatedBaseline({
      row96:
        snap || summary
          ? {
              sellExVatCents: sell,
              estimatedDirectCostCents: directFromPayload ?? snap?.totalEstimatedCostCents ?? null,
              // Prefer direct; if only total available treat as incomplete for GP-direct purity when payload missing
              costEstimateIncomplete:
                incomplete ||
                (directFromPayload == null && snap?.totalEstimatedCostCents == null),
            }
          : null,
      row94: plan
        ? {
            proposedSellExVatCents: plan.proposedSellExVatCents,
            directCostTotalCents: null,
            gpIncomplete: true,
          }
        : null,
      quoteSellExVatCents: sell,
    });
  }

  async stagingAudit(actor: EstimatedActualGpActor) {
    this.assertView(actor);
    await this.assertSafe(actor.companyId);
    const companyId = actor.companyId;

    const [[jobCount], [quoteCount], [quoteLineCount], [invCount], [invLineCount]] =
      await Promise.all([
        this.db.select({ c: count() }).from(jobs).where(eq(jobs.companyId, companyId)),
        this.db.select({ c: count() }).from(quotes).where(eq(quotes.companyId, companyId)),
        this.db
          .select({ c: count() })
          .from(quoteLineItems)
          .where(eq(quoteLineItems.companyId, companyId)),
        this.db.select({ c: count() }).from(invoices).where(eq(invoices.companyId, companyId)),
        this.db
          .select({ c: count() })
          .from(invoiceLineItems)
          .where(eq(invoiceLineItems.companyId, companyId)),
      ]);

    const [quoteJobLinks] = await this.db
      .select({ c: count() })
      .from(quotes)
      .where(and(eq(quotes.companyId, companyId), isNotNull(quotes.jobId)));
    const [invJobLinks] = await this.db
      .select({ c: count() })
      .from(invoices)
      .where(and(eq(invoices.companyId, companyId), isNotNull(invoices.jobId)));
    const [lineMaps] = await this.db
      .select({ c: count() })
      .from(invoiceLineItems)
      .where(
        and(eq(invoiceLineItems.companyId, companyId), isNotNull(invoiceLineItems.quoteLineItemId)),
      );
    const [row96Snaps] = await this.db
      .select({ c: count() })
      .from(quoteCostSnapshots)
      .where(eq(quoteCostSnapshots.companyId, companyId));
    const [jpe] = await this.db
      .select({ c: count() })
      .from(jobDirectCostEntries)
      .where(eq(jobDirectCostEntries.companyId, companyId));
    const [comparisons] = await this.db
      .select({ c: count() })
      .from(estimatedActualGpComparisons)
      .where(eq(estimatedActualGpComparisons.companyId, companyId));

    const jpeBySource = await this.db
      .select({
        sourceType: jobDirectCostEntries.sourceType,
        c: count(),
      })
      .from(jobDirectCostEntries)
      .where(eq(jobDirectCostEntries.companyId, companyId))
      .groupBy(jobDirectCostEntries.sourceType);

    return {
      jobs: Number(jobCount.c),
      quotes: Number(quoteCount.c),
      quoteLines: Number(quoteLineCount.c),
      invoices: Number(invCount.c),
      invoiceLines: Number(invLineCount.c),
      quoteJobLinks: Number(quoteJobLinks.c),
      invoiceJobLinks: Number(invJobLinks.c),
      quoteLineToInvoiceLineMappings: Number(lineMaps.c),
      row96CostSnapshots: Number(row96Snaps.c),
      jpeDirectCostEntries: Number(jpe.c),
      jpeBySourceType: Object.fromEntries(jpeBySource.map((r) => [r.sourceType, Number(r.c)])),
      storedComparisons: Number(comparisons.c),
      jobsWithActualGpComputable: 0,
      jobsIncomplete: Number(jobCount.c),
      quoteLevelComputable: 0,
      invoiceLevelComputable: 0,
      lineLevelComputable: 0,
      note: 'READ-ONLY; no fabricated GP; computable counts require complete evidence',
      xeroWrites: 0,
    };
  }

  private async persist(
    actor: EstimatedActualGpActor,
    result: EstimatedActualGpResult,
    ids: {
      quoteId?: string | null;
      invoiceId?: string | null;
      jobId?: string | null;
      quoteLineId?: string | null;
      invoiceLineId?: string | null;
    },
    clientActionId?: string | null,
  ) {
    const idempotencyKey =
      clientActionId ??
      gpComparisonIdempotencyKey([
        result.level,
        ids.jobId ?? '',
        ids.quoteId ?? '',
        ids.invoiceId ?? '',
        ids.quoteLineId ?? '',
        String(result.actualGpCents ?? 'na'),
        String(result.estimatedGpCents ?? 'na'),
      ]);

    const [existing] = await this.db
      .select()
      .from(estimatedActualGpComparisons)
      .where(
        and(
          eq(estimatedActualGpComparisons.companyId, actor.companyId),
          eq(estimatedActualGpComparisons.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) return { row: existing, idempotentReplay: true };

    const [row] = await this.db
      .insert(estimatedActualGpComparisons)
      .values({
        companyId: actor.companyId,
        level: result.level,
        quoteId: ids.quoteId ?? null,
        invoiceId: ids.invoiceId ?? null,
        jobId: ids.jobId ?? null,
        quoteLineId: ids.quoteLineId ?? null,
        invoiceLineId: ids.invoiceLineId ?? null,
        status: result.status,
        estimatedRevenueExVatCents: result.estimatedRevenueExVatCents,
        estimatedCostExVatCents: result.estimatedCostExVatCents,
        estimatedGpCents: result.estimatedGpCents,
        estimatedMarginBps: result.estimatedMarginBps,
        actualRevenueExVatCents: result.actualRevenueExVatCents,
        actualDirectCostExVatCents: result.actualDirectCostExVatCents,
        actualGpCents: result.actualGpCents,
        actualMarginBps: result.actualMarginBps,
        gpVarianceCents: result.gpVarianceCents,
        marginVarianceBps: result.marginVarianceBps,
        estimateSource: result.provenance.estimateSource,
        revenueSource: result.provenance.revenueSource,
        costSource: result.provenance.costSource,
        warnings: result.warnings,
        provenance: result.provenance,
        estimateBaselineUnchanged: true,
        profitableOrLossLabelled: result.profitableOrLossLabelled,
        idempotencyKey,
        clientActionId: clientActionId ?? null,
        createdBy: actor.userId ?? null,
      })
      .returning();

    await this.audit(actor, 'estimated_actual_gp_compared', row.id, {
      level: result.level,
      status: result.status,
      warnings: result.warnings,
    });

    return { row, idempotentReplay: false };
  }

  async compareJob(
    actor: EstimatedActualGpActor,
    input: { jobId: string; clientActionId?: string | null },
  ) {
    this.assertView(actor);
    await this.assertSafe(actor.companyId);

    const [job] = await this.db
      .select()
      .from(jobs)
      .where(and(eq(jobs.companyId, actor.companyId), eq(jobs.id, input.jobId)))
      .limit(1);
    if (!job) throw new EstimatedActualGpServiceError('NOT_FOUND', 'Job not found', 404);

    const [quote] = await this.db
      .select()
      .from(quotes)
      .where(and(eq(quotes.companyId, actor.companyId), eq(quotes.jobId, input.jobId)))
      .orderBy(desc(quotes.createdAt))
      .limit(1);

    const estimated = await this.loadEstimatedBaseline(actor.companyId, quote?.id ?? null);

    const invRows = await this.db
      .select({
        invoiceId: invoices.id,
        jobId: invoices.jobId,
        quoteId: invoices.quoteId,
        status: invoices.status,
        subtotalCents: invoices.subtotalCents,
      })
      .from(invoices)
      .where(and(eq(invoices.companyId, actor.companyId), eq(invoices.jobId, input.jobId)));

    const jpeRows = await this.db
      .select({
        entryId: jobDirectCostEntries.id,
        jobId: jobDirectCostEntries.jobId,
        amountCents: jobDirectCostEntries.amountCents,
        sourceType: jobDirectCostEntries.sourceType,
        sourceId: jobDirectCostEntries.sourceId,
        category: jobDirectCostEntries.category,
      })
      .from(jobDirectCostEntries)
      .where(
        and(
          eq(jobDirectCostEntries.companyId, actor.companyId),
          eq(jobDirectCostEntries.jobId, input.jobId),
        ),
      );

    const result = resolveJobGpComparison({
      jobId: job.id,
      jobLifecycleComplete: job.status === 'completed',
      companyId: actor.companyId,
      expectedJobCompanyId: job.companyId,
      estimated,
      invoices: invRows.map((r) => ({
        invoiceId: r.invoiceId,
        jobId: r.jobId,
        quoteId: r.quoteId,
        status: r.status,
        subtotalCents: r.subtotalCents,
      })),
      jpeEntries: jpeRows.map((r) => ({
        entryId: r.entryId,
        jobId: r.jobId,
        amountCents: r.amountCents,
        sourceType: r.sourceType,
        sourceId: r.sourceId,
        category: r.category,
      })),
      actualCostComplete: jpeRows.length > 0,
      actualRevenueComplete: invRows.some((i) => i.status !== 'draft' && i.status !== 'cancelled'),
    });

    const persisted = await this.persist(
      actor,
      result,
      { jobId: job.id, quoteId: quote?.id ?? null },
      input.clientActionId,
    );

    return { comparison: result, stored: persisted.row, idempotentReplay: persisted.idempotentReplay };
  }

  async compareQuote(
    actor: EstimatedActualGpActor,
    input: { quoteId: string; clientActionId?: string | null },
  ) {
    this.assertView(actor);
    await this.assertSafe(actor.companyId);

    const [quote] = await this.db
      .select()
      .from(quotes)
      .where(and(eq(quotes.companyId, actor.companyId), eq(quotes.id, input.quoteId)))
      .limit(1);
    if (!quote) throw new EstimatedActualGpServiceError('NOT_FOUND', 'Quote not found', 404);

    const estimated = await this.loadEstimatedBaseline(actor.companyId, quote.id);
    const invRows = await this.db
      .select({
        invoiceId: invoices.id,
        jobId: invoices.jobId,
        quoteId: invoices.quoteId,
        status: invoices.status,
        subtotalCents: invoices.subtotalCents,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.companyId, actor.companyId),
          sql`(${invoices.quoteId} = ${quote.id} OR ${invoices.jobId} = ${quote.jobId})`,
        ),
      );

    const jpeRows = quote.jobId
      ? await this.db
          .select({
            entryId: jobDirectCostEntries.id,
            jobId: jobDirectCostEntries.jobId,
            amountCents: jobDirectCostEntries.amountCents,
            sourceType: jobDirectCostEntries.sourceType,
            sourceId: jobDirectCostEntries.sourceId,
          })
          .from(jobDirectCostEntries)
          .where(
            and(
              eq(jobDirectCostEntries.companyId, actor.companyId),
              eq(jobDirectCostEntries.jobId, quote.jobId),
            ),
          )
      : [];

    const result = resolveQuoteGpComparison({
      quoteId: quote.id,
      jobId: quote.jobId,
      estimated,
      invoices: invRows.map((r) => ({
        invoiceId: r.invoiceId,
        jobId: r.jobId,
        quoteId: r.quoteId,
        status: r.status,
        subtotalCents: r.subtotalCents,
      })),
      jpeEntries: jpeRows,
    });

    const persisted = await this.persist(
      actor,
      result,
      { quoteId: quote.id, jobId: quote.jobId },
      input.clientActionId,
    );
    return { comparison: result, stored: persisted.row, idempotentReplay: persisted.idempotentReplay };
  }

  async compareInvoice(
    actor: EstimatedActualGpActor,
    input: {
      invoiceId: string;
      invoiceAttributedCostCents?: number | null;
      clientActionId?: string | null;
    },
  ) {
    this.assertView(actor);
    await this.assertSafe(actor.companyId);

    const [invoice] = await this.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.companyId, actor.companyId), eq(invoices.id, input.invoiceId)))
      .limit(1);
    if (!invoice) throw new EstimatedActualGpServiceError('NOT_FOUND', 'Invoice not found', 404);

    const estimated = await this.loadEstimatedBaseline(actor.companyId, invoice.quoteId);
    const attributionAvailable = input.invoiceAttributedCostCents != null;

    const result = resolveInvoiceGpComparison({
      invoiceId: invoice.id,
      jobId: invoice.jobId,
      status: invoice.status,
      subtotalCents: invoice.subtotalCents,
      invoiceAttributedCostCents: input.invoiceAttributedCostCents ?? null,
      invoiceCostAttributionAvailable: attributionAvailable,
      estimated,
    });

    const persisted = await this.persist(
      actor,
      result,
      { invoiceId: invoice.id, jobId: invoice.jobId, quoteId: invoice.quoteId },
      input.clientActionId,
    );
    return { comparison: result, stored: persisted.row, idempotentReplay: persisted.idempotentReplay };
  }

  async compareLine(
    actor: EstimatedActualGpActor,
    input: {
      quoteLineId: string;
      invoiceLineId?: string | null;
      clientActionId?: string | null;
    },
  ) {
    this.assertView(actor);
    await this.assertSafe(actor.companyId);

    const [qLine] = await this.db
      .select()
      .from(quoteLineItems)
      .where(
        and(
          eq(quoteLineItems.companyId, actor.companyId),
          eq(quoteLineItems.id, input.quoteLineId),
        ),
      )
      .limit(1);
    if (!qLine) throw new EstimatedActualGpServiceError('NOT_FOUND', 'Quote line not found', 404);

    let iLine: {
      id: string;
      lineSubtotalCents: number;
    } | null = null;
    if (input.invoiceLineId) {
      const [row] = await this.db
        .select()
        .from(invoiceLineItems)
        .where(
          and(
            eq(invoiceLineItems.companyId, actor.companyId),
            eq(invoiceLineItems.id, input.invoiceLineId),
          ),
        )
        .limit(1);
      iLine = row ?? null;
    } else {
      const [row] = await this.db
        .select()
        .from(invoiceLineItems)
        .where(
          and(
            eq(invoiceLineItems.companyId, actor.companyId),
            eq(invoiceLineItems.quoteLineItemId, input.quoteLineId),
          ),
        )
        .limit(1);
      iLine = row ?? null;
    }

    const result = resolveLineGpComparison({
      companyId: actor.companyId,
      expectedJobCompanyId: actor.companyId,
      quoteLineId: qLine.id,
      invoiceLineId: iLine?.id ?? null,
      lineCostEvidenceCents: null,
      lineCostEvidencePresent: false,
      estimatedLineRevenueExVatCents: qLine.lineSubtotalCents ?? null,
      estimatedLineCostExVatCents: qLine.lineCostCents ?? null,
      actualLineRevenueExVatCents: iLine?.lineSubtotalCents ?? null,
    });

    const persisted = await this.persist(
      actor,
      result,
      {
        quoteLineId: qLine.id,
        invoiceLineId: iLine?.id ?? null,
        quoteId: qLine.quoteId,
      },
      input.clientActionId,
    );
    return { comparison: result, stored: persisted.row, idempotentReplay: persisted.idempotentReplay };
  }
}
