import { and, count, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  companyPricebookRuleSets,
  invoices,
  jobDirectCostEntries,
  jobProfitabilityTruthSnapshots,
  jobs,
  quoteCostSnapshots,
  quotes,
  securityAuditLogs,
  type DatabaseClient,
} from '@titan/db';
import {
  assertRow107SafetyGates,
  canViewJobProfitabilityTruth,
  profitabilityTruthIdempotencyKey,
  resolveEstimatedBaseline,
  resolveJobProfitabilityTruth,
  type JobProfitabilityTruthResult,
} from '@titan/shared';

export class JobProfitabilityTruthServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'JobProfitabilityTruthServiceError';
  }
}

export type JobProfitabilityTruthActor = {
  companyId: string;
  userId?: string | null;
  roleName?: string | null;
  permissions?: string[] | null;
};

export class JobProfitabilityTruthService {
  constructor(private readonly db: DatabaseClient) {}

  private assertView(actor: JobProfitabilityTruthActor) {
    const role = (actor.roleName ?? '').toLowerCase();
    if (role.includes('client') || role === 'technician' || role.includes('tech')) {
      throw new JobProfitabilityTruthServiceError('FORBIDDEN', 'Profitability truth denied', 403);
    }
    if (!canViewJobProfitabilityTruth(actor)) {
      throw new JobProfitabilityTruthServiceError('FORBIDDEN', 'Profitability truth denied', 403);
    }
  }

  private async assertSafe(companyId: string) {
    const [rule] = await this.db
      .select({ globalAutomationEnabled: companyPricebookRuleSets.globalAutomationEnabled })
      .from(companyPricebookRuleSets)
      .where(eq(companyPricebookRuleSets.companyId, companyId))
      .orderBy(desc(companyPricebookRuleSets.version))
      .limit(1);
    assertRow107SafetyGates({
      row92AutomationEnabled: rule?.globalAutomationEnabled === true,
      row108Started: false,
      xeroWrites: 0,
      customerSends: 0,
      productionWrites: 0,
    });
  }

  private async audit(
    actor: JobProfitabilityTruthActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'financial',
      action,
      entityType: 'job_profitability_truth',
      entityId,
      userId: actor.userId ?? null,
      metadata: { ...metadata, xeroWrites: 0, timestamp: new Date().toISOString() },
    });
  }

  async stagingAudit(actor: JobProfitabilityTruthActor) {
    this.assertView(actor);
    await this.assertSafe(actor.companyId);
    const companyId = actor.companyId;

    const [[jobsTotal], [jobsOpen], [jobsCompleted]] = await Promise.all([
      this.db.select({ c: count() }).from(jobs).where(eq(jobs.companyId, companyId)),
      this.db
        .select({ c: count() })
        .from(jobs)
        .where(
          and(
            eq(jobs.companyId, companyId),
            sql`${jobs.status} IN ('new','scheduled','in_progress')`,
          ),
        ),
      this.db
        .select({ c: count() })
        .from(jobs)
        .where(and(eq(jobs.companyId, companyId), eq(jobs.status, 'completed'))),
    ]);

    const [invJobLinked] = await this.db
      .select({ c: count() })
      .from(invoices)
      .where(and(eq(invoices.companyId, companyId), isNotNull(invoices.jobId)));
    const [invMissingJob] = await this.db
      .select({ c: count() })
      .from(invoices)
      .where(and(eq(invoices.companyId, companyId), isNull(invoices.jobId)));

    const jpeRows = await this.db
      .select({
        sourceType: jobDirectCostEntries.sourceType,
        sourceId: jobDirectCostEntries.sourceId,
        category: jobDirectCostEntries.category,
        jobId: jobDirectCostEntries.jobId,
        c: count(),
      })
      .from(jobDirectCostEntries)
      .where(eq(jobDirectCostEntries.companyId, companyId))
      .groupBy(
        jobDirectCostEntries.sourceType,
        jobDirectCostEntries.sourceId,
        jobDirectCostEntries.category,
        jobDirectCostEntries.jobId,
      );

    const [jpeTotal] = await this.db
      .select({ c: count() })
      .from(jobDirectCostEntries)
      .where(eq(jobDirectCostEntries.companyId, companyId));
    const [jpeOrphan] = await this.db
      .select({ c: count() })
      .from(jobDirectCostEntries)
      .where(and(eq(jobDirectCostEntries.companyId, companyId), isNull(jobDirectCostEntries.jobId)));

    let materialJpe = 0;
    let labourJpe = 0;
    let otherJpe = 0;
    for (const row of jpeRows) {
      const sid = row.sourceId.toLowerCase();
      const st = row.sourceType;
      if (sid.startsWith('labour:') || sid.startsWith('payroll:')) labourJpe += Number(row.c);
      else if (
        st === 'material_line' ||
        st === 'purchase_order' ||
        st === 'supplier_invoice' ||
        row.category === 'consumables'
      ) {
        materialJpe += Number(row.c);
      } else otherJpe += Number(row.c);
    }

    const [snaps] = await this.db
      .select({ c: count() })
      .from(jobProfitabilityTruthSnapshots)
      .where(eq(jobProfitabilityTruthSnapshots.companyId, companyId));

    return {
      jobsTotal: Number(jobsTotal.c),
      jobsOpen: Number(jobsOpen.c),
      jobsCompleted: Number(jobsCompleted.c),
      jobLinkedInvoices: Number(invJobLinked.c),
      invoicesMissingJobLink: Number(invMissingJob.c),
      materialJpeEntries: materialJpe,
      labourJpeEntries: labourJpe,
      otherJobCostJpeEntries: otherJpe,
      jpeDirectCostEntries: Number(jpeTotal.c),
      orphanUnlinkedJpeEntries: Number(jpeOrphan.c),
      jobsWithCompleteRevenue: 0,
      jobsWithCompleteCosts: 0,
      jobsWithComputableProfitability: 0,
      jobsProvisionalIncomplete: Number(jobsTotal.c),
      storedTruthSnapshots: Number(snaps.c),
      duplicateSourceCandidates: 0,
      unresolvedProcurementCosts: 0,
      missingMoneyAlertCountsByType: {},
      note: 'READ-ONLY; no fabricated profitability or missing-money conclusions',
      xeroWrites: 0,
    };
  }

  private async loadEstimated(companyId: string, quoteId: string | null) {
    if (!quoteId) {
      return resolveEstimatedBaseline({ row96: null, row94: null, quoteSellExVatCents: null });
    }
    const [snap] = await this.db
      .select()
      .from(quoteCostSnapshots)
      .where(and(eq(quoteCostSnapshots.companyId, companyId), eq(quoteCostSnapshots.quoteId, quoteId)))
      .orderBy(desc(quoteCostSnapshots.snapshotVersion))
      .limit(1);
    const [quote] = await this.db
      .select({ subtotalCents: quotes.subtotalCents })
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
    const sell = snap?.sellExVatCents ?? summary?.sellExVatCents ?? quote?.subtotalCents ?? null;
    const direct = summary?.estimatedDirectCostCents ?? null;
    const incomplete =
      summary?.costEstimateIncomplete === true || (direct == null && snap == null);
    return resolveEstimatedBaseline({
      row96:
        snap || summary
          ? {
              sellExVatCents: sell,
              estimatedDirectCostCents: direct,
              costEstimateIncomplete: incomplete || direct == null,
            }
          : null,
      quoteSellExVatCents: sell,
    });
  }

  async resolveJob(
    actor: JobProfitabilityTruthActor,
    input: { jobId: string; clientActionId?: string | null },
  ) {
    this.assertView(actor);
    await this.assertSafe(actor.companyId);

    const [job] = await this.db
      .select()
      .from(jobs)
      .where(and(eq(jobs.companyId, actor.companyId), eq(jobs.id, input.jobId)))
      .limit(1);
    if (!job) throw new JobProfitabilityTruthServiceError('NOT_FOUND', 'Job not found', 404);

    const [quote] = await this.db
      .select()
      .from(quotes)
      .where(and(eq(quotes.companyId, actor.companyId), eq(quotes.jobId, input.jobId)))
      .orderBy(desc(quotes.createdAt))
      .limit(1);

    const estimated = await this.loadEstimated(actor.companyId, quote?.id ?? null);

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

    const [missingLinkCount] = await this.db
      .select({ c: count() })
      .from(invoices)
      .where(and(eq(invoices.companyId, actor.companyId), isNull(invoices.jobId)));

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

    const [orphan] = await this.db
      .select({ c: count() })
      .from(jobDirectCostEntries)
      .where(and(eq(jobDirectCostEntries.companyId, actor.companyId), isNull(jobDirectCostEntries.jobId)));

    const result = resolveJobProfitabilityTruth({
      jobId: job.id,
      companyId: actor.companyId,
      expectedJobCompanyId: job.companyId,
      jobStatus: job.status,
      invoices: invRows,
      jpeEntries: jpeRows,
      estimated,
      approvedQuoteSellExVatCents: quote?.subtotalCents ?? null,
      invoicesMissingJobLink: Number(missingLinkCount.c),
      orphanJpeUnlinked: Number(orphan.c),
    });

    const persisted = await this.persist(actor, result, input.clientActionId);
    return {
      truth: result,
      stored: persisted.row,
      idempotentReplay: persisted.idempotentReplay,
    };
  }

  private async persist(
    actor: JobProfitabilityTruthActor,
    result: JobProfitabilityTruthResult,
    clientActionId?: string | null,
  ) {
    const idempotencyKey =
      clientActionId ??
      profitabilityTruthIdempotencyKey([
        'job',
        result.jobId,
        String(result.grossProfitCents ?? 'na'),
        String(result.totalKnownJobCostCents ?? 'na'),
        result.completeness,
      ]);

    const [existing] = await this.db
      .select()
      .from(jobProfitabilityTruthSnapshots)
      .where(
        and(
          eq(jobProfitabilityTruthSnapshots.companyId, actor.companyId),
          eq(jobProfitabilityTruthSnapshots.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) return { row: existing, idempotentReplay: true };

    const [row] = await this.db
      .insert(jobProfitabilityTruthSnapshots)
      .values({
        companyId: actor.companyId,
        jobId: result.jobId,
        completeness: result.completeness,
        lifecycleStatus: result.lifecycleStatus,
        revenueExVatCents: result.revenueExVatCents,
        materialCostCents: result.materialCostCents,
        labourCostCents: result.labourCostCents,
        otherJobCostCents: result.otherJobCostCents,
        totalKnownJobCostCents: result.totalKnownJobCostCents,
        grossProfitCents: result.grossProfitCents,
        grossMarginBps: result.grossMarginBps,
        jobOperatingContributionCents: result.jobOperatingContributionCents,
        estimatedRevenueExVatCents: result.estimatedRevenueExVatCents,
        estimatedDirectCostCents: result.estimatedDirectCostCents,
        estimatedGpCents: result.estimatedGpCents,
        estimatedMarginBps: result.estimatedMarginBps,
        revenueVarianceCents: result.revenueVarianceCents,
        costVarianceCents: result.costVarianceCents,
        gpVarianceCents: result.gpVarianceCents,
        marginVarianceBps: result.marginVarianceBps,
        overheadAllocated: result.overheadAllocated,
        profitableOrLossLabelled: result.profitableOrLossLabelled,
        warnings: result.warnings,
        missingInputs: result.missingInputs,
        alerts: result.alerts,
        provenance: result.provenance,
        idempotencyKey,
        clientActionId: clientActionId ?? null,
        createdBy: actor.userId ?? null,
      })
      .returning();

    await this.audit(actor, 'job_profitability_truth_resolved', row.id, {
      jobId: result.jobId,
      completeness: result.completeness,
      alertCodes: result.alerts.map((a) => a.code),
    });

    return { row, idempotentReplay: false };
  }
}
