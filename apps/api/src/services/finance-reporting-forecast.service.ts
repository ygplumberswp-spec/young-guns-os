import { and, desc, eq, gt, sql } from 'drizzle-orm';
import {
  buildFrfActionDraftsFromSignals,
  buildFrfBudgetPlanVariance,
  buildFrfExpenseReport,
  buildFrfForecast,
  buildFrfInsightDraftsFromSignals,
  buildFrfInvoiceReport,
  buildFrfJobProfitabilityReport,
  buildFrfJobReport,
  buildFrfPaymentReport,
  buildFrfProfitReport,
  buildFrfRevenueReport,
  canAccessFinanceReportingForecast,
  canApproveFinanceReportingForecast,
  canWriteFinanceReportingForecast,
  FRF_PRODUCT_COPY,
  frfInsightTargetHref,
  listFrfAuraConnections,
  type AcknowledgeFrfInsightRequest,
  type CreateFrfActionRequest,
  type CreateFrfBudgetPlanRequest,
  type CreateFrfInsightRequest,
  type DecideFrfActionRequest,
  type FrfActionSummary,
  type FrfBudgetPlanSummary,
  type FrfDashboard,
  type FrfForecastKind,
  type FrfForecastResult,
  type FrfForecastSnapshotSummary,
  type FrfInsightSummary,
  type FrfReportKind,
  type FrfReportResult,
  type FrfReportSnapshotSummary,
  type GenerateFrfForecastRequest,
  type GenerateFrfReportRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  frfActionRecommendations,
  frfBudgetPlans,
  frfForecastSnapshots,
  frfInsights,
  frfReportSnapshots,
  inventoryItems,
  invoices,
  jobMaterialLines,
  jobs,
  payments,
  purchaseOrders,
  securityAuditLogs,
} from '@titan/db';

export class FinanceReportingForecastError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FinanceReportingForecastError';
  }
}

export type FrfActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

function materialCostCents(row: {
  status: string;
  quantity: string | number;
  fulfilledQuantity: string | number | null;
  unitCostCents: number | null;
}): number | null {
  if (row.unitCostCents == null || row.unitCostCents <= 0) return null;
  const qty =
    row.fulfilledQuantity != null && Number(row.fulfilledQuantity) > 0
      ? Number(row.fulfilledQuantity)
      : Number(row.quantity);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  return Math.round(qty * row.unitCostCents);
}

export class FinanceReportingForecastService {
  constructor(private readonly db: DatabaseClient) {}

  private assertRead(actor: FrfActor): void {
    if (!canAccessFinanceReportingForecast(actor)) {
      throw new FinanceReportingForecastError(
        'FORBIDDEN',
        'Financial Reporting & Forecasting requires Owner or finance access (Technician/Client denied).',
      );
    }
  }

  private assertWrite(actor: FrfActor): void {
    this.assertRead(actor);
    if (!canWriteFinanceReportingForecast(actor)) {
      throw new FinanceReportingForecastError(
        'FORBIDDEN',
        'Write actions require Owner or finance:write.',
      );
    }
  }

  private assertApprove(actor: FrfActor): void {
    this.assertWrite(actor);
    if (!canApproveFinanceReportingForecast(actor)) {
      throw new FinanceReportingForecastError(
        'FORBIDDEN',
        'Only Company Owner or Platform Owner may approve reporting/forecast recommended actions.',
      );
    }
  }

  private async recordAudit(
    actor: FrfActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'ai',
      action,
      entityType: 'finance_reporting_forecast',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        autoExecuted: false,
        technicianClientDenied: true,
        fakeDataInvented: false,
      },
    });
  }

  private toReportSnapshot(
    row: typeof frfReportSnapshots.$inferSelect,
  ): FrfReportSnapshotSummary {
    return {
      id: row.id,
      kind: row.kind,
      availability: row.availability,
      title: row.title,
      currency: row.currency,
      periodStart: row.periodStart?.toISOString() ?? null,
      periodEnd: row.periodEnd?.toISOString() ?? null,
      totalCents: row.totalCents,
      lineCount: row.lineCount,
      summary: row.summary,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toForecastSnapshot(
    row: typeof frfForecastSnapshots.$inferSelect,
  ): FrfForecastSnapshotSummary {
    return {
      id: row.id,
      kind: row.kind,
      availability: row.availability,
      title: row.title,
      currency: row.currency,
      methodology: row.methodology,
      historyMonthsUsed: row.historyMonthsUsed,
      projectedTotalCents: row.projectedTotalCents,
      summary: row.summary,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toBudget(row: typeof frfBudgetPlans.$inferSelect): FrfBudgetPlanSummary {
    return {
      id: row.id,
      name: row.name,
      currency: row.currency,
      periodStart: row.periodStart.toISOString(),
      periodEnd: row.periodEnd.toISOString(),
      budgetedRevenueCents: row.budgetedRevenueCents,
      budgetedExpenseCents: row.budgetedExpenseCents,
      actualRevenueCents: row.actualRevenueCents,
      actualExpenseCents: row.actualExpenseCents,
      revenueVarianceCents: row.revenueVarianceCents,
      expenseVarianceCents: row.expenseVarianceCents,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toInsight(row: typeof frfInsights.$inferSelect): FrfInsightSummary {
    return {
      id: row.id,
      target: row.target,
      status: row.status,
      title: row.title,
      insight: row.insight,
      href: row.href,
      sourceReportId: row.sourceReportId,
      sourceForecastId: row.sourceForecastId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toAction(row: typeof frfActionRecommendations.$inferSelect): FrfActionSummary {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      title: row.title,
      recommendation: row.recommendation,
      sourceReportId: row.sourceReportId,
      sourceForecastId: row.sourceForecastId,
      autoExecuted: false,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    };
  }

  private async loadLedger(actor: FrfActor) {
    const [invoiceRows, paymentRows, poRows, jobRows, materialRows, inventoryCostCountRows] =
      await Promise.all([
        this.db
          .select({
            id: invoices.id,
            invoiceNumber: invoices.invoiceNumber,
            status: invoices.status,
            totalCents: invoices.totalCents,
            amountCents: invoices.amountCents,
            amountPaidCents: invoices.amountPaidCents,
            dueDate: invoices.dueDate,
            issuedAt: invoices.issuedAt,
            createdAt: invoices.createdAt,
            customerId: invoices.customerId,
            jobId: invoices.jobId,
            currency: invoices.currency,
          })
          .from(invoices)
          .where(eq(invoices.companyId, actor.companyId)),
        this.db
          .select({
            id: payments.id,
            amountCents: payments.amountCents,
            method: payments.method,
            paidAt: payments.paidAt,
            invoiceId: payments.invoiceId,
            currency: payments.currency,
          })
          .from(payments)
          .where(eq(payments.companyId, actor.companyId)),
        this.db
          .select({
            id: purchaseOrders.id,
            status: purchaseOrders.status,
            totalCostCents: purchaseOrders.totalCostCents,
            createdAt: purchaseOrders.createdAt,
          })
          .from(purchaseOrders)
          .where(eq(purchaseOrders.companyId, actor.companyId)),
        this.db
          .select({
            id: jobs.id,
            jobNumber: jobs.jobNumber,
            title: jobs.title,
            jobType: jobs.jobType,
            status: jobs.status,
          })
          .from(jobs)
          .where(eq(jobs.companyId, actor.companyId)),
        this.db
          .select({
            jobId: jobMaterialLines.jobId,
            status: jobMaterialLines.status,
            quantity: jobMaterialLines.quantity,
            fulfilledQuantity: jobMaterialLines.fulfilledQuantity,
            unitCostCents: jobMaterialLines.unitCostCents,
          })
          .from(jobMaterialLines)
          .where(eq(jobMaterialLines.companyId, actor.companyId)),
        this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(inventoryItems)
          .where(
            and(
              eq(inventoryItems.companyId, actor.companyId),
              gt(inventoryItems.unitCostCents, 0),
            ),
          ),
      ]);

    const currency =
      paymentRows[0]?.currency ?? invoiceRows[0]?.currency ?? 'ZAR';

    return {
      currency,
      invoices: invoiceRows,
      payments: paymentRows,
      purchaseOrders: poRows,
      jobs: jobRows,
      materialLines: materialRows,
      inventoryItemsWithCost: Number(inventoryCostCountRows[0]?.count ?? 0),
    };
  }

  private buildJobProfitRows(ledger: Awaited<ReturnType<typeof this.loadLedger>>) {
    const revenueByJob = new Map<string, number>();
    for (const inv of ledger.invoices) {
      if (!inv.jobId || inv.status === 'cancelled') continue;
      revenueByJob.set(
        inv.jobId,
        (revenueByJob.get(inv.jobId) ?? 0) +
          Math.max(0, inv.totalCents || inv.amountCents),
      );
    }

    const costByJob = new Map<string, number>();
    const costAvailable = new Set<string>();
    for (const line of ledger.materialLines) {
      const cost = materialCostCents({
        status: line.status,
        quantity: String(line.quantity),
        fulfilledQuantity:
          line.fulfilledQuantity != null ? String(line.fulfilledQuantity) : null,
        unitCostCents: line.unitCostCents,
      });
      if (cost == null) continue;
      costAvailable.add(line.jobId);
      costByJob.set(line.jobId, (costByJob.get(line.jobId) ?? 0) + cost);
    }

    return ledger.jobs
      .filter((job) => revenueByJob.has(job.id) || costAvailable.has(job.id))
      .map((job) => {
        const revenueCents = revenueByJob.get(job.id) ?? 0;
        const hasCost = costAvailable.has(job.id);
        const costCents = hasCost ? (costByJob.get(job.id) ?? 0) : null;
        return {
          jobId: job.id,
          jobNumber: job.jobNumber,
          title: job.title,
          revenueCents,
          costCents,
          marginCents: costCents == null ? null : revenueCents - costCents,
          costAvailability: hasCost
            ? ('available' as const)
            : ('unavailable' as const),
          costGapReason: hasCost
            ? null
            : ledger.inventoryItemsWithCost === 0
              ? 'No real unit_cost_cents on material/inventory lines.'
              : 'This job has no material lines with unit costs.',
        };
      });
  }

  async computeAllReports(actor: FrfActor): Promise<FrfDashboard['liveReports']> {
    this.assertRead(actor);
    const ledger = await this.loadLedger(actor);
    const jobProfitRows = this.buildJobProfitRows(ledger);
    const jobsWithCost = jobProfitRows.filter((j) => j.costAvailability === 'available');
    const revenueCents =
      jobProfitRows.length > 0
        ? jobProfitRows.reduce((s, j) => s + j.revenueCents, 0)
        : null;
    const costCents =
      jobsWithCost.length > 0
        ? jobsWithCost.reduce((s, j) => s + (j.costCents ?? 0), 0)
        : null;

    return {
      revenue: buildFrfRevenueReport({
        currency: ledger.currency,
        invoices: ledger.invoices,
      }),
      expense: buildFrfExpenseReport({
        currency: ledger.currency,
        purchaseOrders: ledger.purchaseOrders,
      }),
      profit: buildFrfProfitReport({
        currency: ledger.currency,
        revenueCents,
        costCents,
        marginCents: revenueCents != null && costCents != null ? revenueCents - costCents : null,
        jobsWithCostData: jobsWithCost.length,
        jobCount: ledger.jobs.length,
      }),
      invoice: buildFrfInvoiceReport({
        currency: ledger.currency,
        invoices: ledger.invoices,
      }),
      payment: buildFrfPaymentReport({
        currency: ledger.currency,
        payments: ledger.payments,
      }),
      job: buildFrfJobReport({
        currency: ledger.currency,
        jobs: ledger.jobs,
        invoices: ledger.invoices,
      }),
      jobProfitability: buildFrfJobProfitabilityReport({
        currency: ledger.currency,
        jobs: jobProfitRows,
      }),
    };
  }

  async computeAllForecasts(
    actor: FrfActor,
    horizonMonths = 3,
  ): Promise<FrfDashboard['liveForecasts']> {
    this.assertRead(actor);
    const reports = await this.computeAllReports(actor);

    const revenue = buildFrfForecast({
      kind: 'revenue',
      currency: reports.revenue.currency,
      historySeries: reports.revenue.series,
      horizonMonths,
    });
    const cashflow = buildFrfForecast({
      kind: 'cashflow',
      currency: reports.payment.currency,
      historySeries: reports.payment.series.map((p, idx) => ({
        ...p,
        // Net heuristic only when expense series aligned; else payment inflow history.
        amountCents:
          reports.expense.availability === 'available' && reports.expense.series[idx]
            ? Math.max(0, p.amountCents) -
              Math.max(0, reports.expense.series[idx]!.amountCents)
            : p.amountCents,
      })),
      horizonMonths,
      gaps:
        reports.expense.availability === 'unavailable'
          ? [
              'Cashflow forecast uses payment inflow history; procurement expense history unavailable — net cashflow not invented from missing expenses.',
            ]
          : [],
      extraAssumptions: [
        {
          key: 'cashflow_basis',
          label: 'Cashflow basis',
          value:
            reports.expense.availability === 'available'
              ? 'Payment inflow minus procurement PO expense by month (when both exist).'
              : 'Payment inflow only — expense side unavailable.',
        },
      ],
    });
    const trend = buildFrfForecast({
      kind: 'trend',
      currency: reports.revenue.currency,
      historySeries: reports.revenue.series,
      horizonMonths,
      extraAssumptions: [
        {
          key: 'trend_source',
          label: 'Trend source',
          value: 'Invoice revenue monthly series from real TITAN invoices.',
        },
      ],
    });
    const budgetPlanning = buildFrfForecast({
      kind: 'budget_planning',
      currency: reports.revenue.currency,
      historySeries: reports.revenue.series,
      horizonMonths,
      extraAssumptions: [
        {
          key: 'budget_note',
          label: 'Budget planning',
          value:
            'Owner-entered budget plans compare targets to actuals. This forecast only averages real revenue history when sufficient — never invents budgets.',
        },
      ],
    });

    return { revenue, cashflow, budgetPlanning, trend };
  }

  async generateReport(
    actor: FrfActor,
    input: GenerateFrfReportRequest,
  ): Promise<{ report: FrfReportResult; snapshot: FrfReportSnapshotSummary | null }> {
    this.assertWrite(actor);
    const all = await this.computeAllReports(actor);
    const map: Record<FrfReportKind, FrfReportResult> = {
      revenue: all.revenue,
      expense: all.expense,
      profit: all.profit,
      invoice: all.invoice,
      payment: all.payment,
      job: all.job,
      job_profitability: all.jobProfitability,
    };
    const report = map[input.kind];
    if (!report) {
      throw new FinanceReportingForecastError('VALIDATION', `Unknown report kind: ${input.kind}`);
    }

    let snapshot: FrfReportSnapshotSummary | null = null;
    if (input.persist !== false) {
      const [row] = await this.db
        .insert(frfReportSnapshots)
        .values({
          companyId: actor.companyId,
          kind: report.kind,
          availability: report.availability,
          title: `${report.kind} report`,
          currency: report.currency,
          periodStart: report.periodStart ? new Date(report.periodStart) : null,
          periodEnd: report.periodEnd ? new Date(report.periodEnd) : null,
          totalCents: report.totalCents,
          lineCount: report.lineCount,
          summary: report.summary,
          payload: report as unknown as Record<string, unknown>,
          createdByUserId: actor.userId,
          metadata: { invented: false, source: 'real_titan' },
        })
        .returning();
      if (row) {
        snapshot = this.toReportSnapshot(row);
        await this.recordAudit(actor, 'frf_report_generated', row.id, {
          kind: report.kind,
          availability: report.availability,
        });
      }
    }

    return { report, snapshot };
  }

  async generateForecast(
    actor: FrfActor,
    input: GenerateFrfForecastRequest,
  ): Promise<{ forecast: FrfForecastResult; snapshot: FrfForecastSnapshotSummary | null }> {
    this.assertWrite(actor);
    const all = await this.computeAllForecasts(actor, input.horizonMonths ?? 3);
    const map: Record<FrfForecastKind, FrfForecastResult> = {
      revenue: all.revenue,
      cashflow: all.cashflow,
      budget_planning: all.budgetPlanning,
      trend: all.trend,
    };
    const forecast = map[input.kind];
    if (!forecast) {
      throw new FinanceReportingForecastError(
        'VALIDATION',
        `Unknown forecast kind: ${input.kind}`,
      );
    }

    let snapshot: FrfForecastSnapshotSummary | null = null;
    if (input.persist !== false) {
      const [row] = await this.db
        .insert(frfForecastSnapshots)
        .values({
          companyId: actor.companyId,
          kind: forecast.kind,
          availability: forecast.availability,
          title: `${forecast.kind} forecast`,
          currency: forecast.currency,
          methodology: forecast.methodology,
          historyMonthsUsed: forecast.historyMonthsUsed,
          projectedTotalCents: forecast.projectedTotalCents,
          summary: forecast.summary,
          assumptions: forecast.assumptions as unknown as Record<string, unknown>[],
          payload: {
            ...(forecast as unknown as Record<string, unknown>),
            confidence: forecast.confidence,
            confidenceRationale: forecast.confidenceRationale,
          },
          createdByUserId: actor.userId,
          metadata: {
            invented: false,
            confidence: forecast.confidence,
            projectionWithheld:
              forecast.availability !== 'available' || forecast.projectedSeries == null,
          },
        })
        .returning();
      if (row) {
        snapshot = this.toForecastSnapshot(row);
        await this.recordAudit(actor, 'frf_forecast_generated', row.id, {
          kind: forecast.kind,
          availability: forecast.availability,
          confidence: forecast.confidence,
        });
      }
    }

    return { forecast, snapshot };
  }

  async createBudgetPlan(
    actor: FrfActor,
    input: CreateFrfBudgetPlanRequest,
  ): Promise<FrfBudgetPlanSummary> {
    this.assertWrite(actor);
    const reports = await this.computeAllReports(actor);
    const actualRevenueCents =
      reports.revenue.availability === 'available' ? reports.revenue.totalCents : null;
    const actualExpenseCents =
      reports.expense.availability === 'available' ? reports.expense.totalCents : null;
    const variance = buildFrfBudgetPlanVariance({
      budgetedRevenueCents: input.budgetedRevenueCents ?? null,
      budgetedExpenseCents: input.budgetedExpenseCents ?? null,
      actualRevenueCents,
      actualExpenseCents,
    });

    const [row] = await this.db
      .insert(frfBudgetPlans)
      .values({
        companyId: actor.companyId,
        name: input.name.trim(),
        currency: input.currency ?? reports.revenue.currency,
        periodStart: new Date(input.periodStart),
        periodEnd: new Date(input.periodEnd),
        budgetedRevenueCents: input.budgetedRevenueCents ?? null,
        budgetedExpenseCents: input.budgetedExpenseCents ?? null,
        actualRevenueCents,
        actualExpenseCents,
        revenueVarianceCents: variance.revenueVarianceCents,
        expenseVarianceCents: variance.expenseVarianceCents,
        notes: input.notes?.trim() || null,
        createdByUserId: actor.userId,
        metadata: { invented: false, actualsFrom: 'real_titan_reports' },
      })
      .returning();
    if (!row) {
      throw new FinanceReportingForecastError('INTERNAL', 'Unable to create budget plan');
    }
    await this.recordAudit(actor, 'frf_budget_plan_created', row.id, {
      name: row.name,
    });
    return this.toBudget(row);
  }

  async createInsight(
    actor: FrfActor,
    input: CreateFrfInsightRequest,
  ): Promise<FrfInsightSummary> {
    this.assertWrite(actor);
    const href = input.href?.trim() || frfInsightTargetHref(input.target);
    const [row] = await this.db
      .insert(frfInsights)
      .values({
        companyId: actor.companyId,
        target: input.target,
        status: 'open',
        title: input.title.trim(),
        insight: input.insight.trim(),
        href,
        sourceReportId: input.sourceReportId ?? null,
        sourceForecastId: input.sourceForecastId ?? null,
        createdByUserId: actor.userId,
        metadata: { invented: false, handoffOnly: true },
      })
      .returning();
    if (!row) {
      throw new FinanceReportingForecastError('INTERNAL', 'Unable to create insight');
    }
    await this.recordAudit(actor, 'frf_insight_created', row.id, {
      target: row.target,
    });
    return this.toInsight(row);
  }

  async refreshInsights(actor: FrfActor): Promise<FrfInsightSummary[]> {
    this.assertWrite(actor);
    const [reports, forecasts] = await Promise.all([
      this.computeAllReports(actor),
      this.computeAllForecasts(actor),
    ]);
    const drafts = buildFrfInsightDraftsFromSignals({
      revenue: reports.revenue,
      payment: reports.payment,
      expense: reports.expense,
      revenueForecast: forecasts.revenue,
      cashflowForecast: forecasts.cashflow,
    });
    const created: FrfInsightSummary[] = [];
    for (const draft of drafts) {
      created.push(await this.createInsight(actor, draft));
    }
    return created;
  }

  async generateActions(actor: FrfActor): Promise<FrfActionSummary[]> {
    this.assertWrite(actor);
    const [reports, forecasts] = await Promise.all([
      this.computeAllReports(actor),
      this.computeAllForecasts(actor),
    ]);
    const drafts = buildFrfActionDraftsFromSignals({
      revenueForecast: forecasts.revenue,
      expense: reports.expense,
      payment: reports.payment,
    });
    const created: FrfActionSummary[] = [];
    for (const draft of drafts) {
      created.push(await this.createAction(actor, { ...draft, submitForApproval: true }));
    }
    return created;
  }

  async createAction(actor: FrfActor, input: CreateFrfActionRequest): Promise<FrfActionSummary> {
    this.assertWrite(actor);
    const status = input.submitForApproval === false ? 'draft' : 'pending_approval';
    const [row] = await this.db
      .insert(frfActionRecommendations)
      .values({
        companyId: actor.companyId,
        kind: input.kind,
        status,
        title: input.title.trim(),
        recommendation: input.recommendation.trim(),
        sourceReportId: input.sourceReportId ?? null,
        sourceForecastId: input.sourceForecastId ?? null,
        autoExecuted: false,
        createdByUserId: actor.userId,
        metadata: { invented: false },
      })
      .returning();
    if (!row) {
      throw new FinanceReportingForecastError('INTERNAL', 'Unable to create action');
    }
    await this.recordAudit(actor, 'frf_action_created', row.id, {
      kind: row.kind,
      status: row.status,
    });
    return this.toAction(row);
  }

  async decideAction(
    actor: FrfActor,
    actionId: string,
    input: DecideFrfActionRequest,
  ): Promise<FrfActionSummary> {
    this.assertApprove(actor);
    const [existing] = await this.db
      .select()
      .from(frfActionRecommendations)
      .where(
        and(
          eq(frfActionRecommendations.id, actionId),
          eq(frfActionRecommendations.companyId, actor.companyId),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new FinanceReportingForecastError('NOT_FOUND', 'Action recommendation not found');
    }
    if (existing.status !== 'pending_approval' && existing.status !== 'draft') {
      throw new FinanceReportingForecastError(
        'CONFLICT',
        `Action is ${existing.status} and cannot be decided`,
      );
    }
    const nextStatus = input.decision === 'approve' ? 'approved' : 'rejected';
    const [row] = await this.db
      .update(frfActionRecommendations)
      .set({
        status: nextStatus,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: input.notes?.trim() || null,
        autoExecuted: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(frfActionRecommendations.id, actionId),
          eq(frfActionRecommendations.companyId, actor.companyId),
        ),
      )
      .returning();
    if (!row) {
      throw new FinanceReportingForecastError('INTERNAL', 'Unable to decide action');
    }
    await this.recordAudit(
      actor,
      nextStatus === 'approved' ? 'frf_action_approved' : 'frf_action_rejected',
      row.id,
      { decision: input.decision, autoExecuted: false },
    );
    return this.toAction(row);
  }

  async acknowledgeInsight(
    actor: FrfActor,
    insightId: string,
    input: AcknowledgeFrfInsightRequest,
  ): Promise<FrfInsightSummary> {
    this.assertWrite(actor);
    const [existing] = await this.db
      .select()
      .from(frfInsights)
      .where(and(eq(frfInsights.id, insightId), eq(frfInsights.companyId, actor.companyId)))
      .limit(1);
    if (!existing) {
      throw new FinanceReportingForecastError('NOT_FOUND', 'Insight not found');
    }
    const [row] = await this.db
      .update(frfInsights)
      .set({
        status: input.status,
        updatedAt: new Date(),
        metadata: {
          ...(existing.metadata ?? {}),
          acknowledgedByUserId: actor.userId,
        },
      })
      .where(and(eq(frfInsights.id, insightId), eq(frfInsights.companyId, actor.companyId)))
      .returning();
    if (!row) {
      throw new FinanceReportingForecastError('INTERNAL', 'Unable to update insight');
    }
    await this.recordAudit(actor, 'frf_insight_acknowledged', row.id, {
      status: input.status,
    });
    return this.toInsight(row);
  }

  async getDashboard(actor: FrfActor): Promise<FrfDashboard> {
    this.assertRead(actor);
    const [liveReports, liveForecasts, reportRows, forecastRows, budgetRows, insightRows, actionRows] =
      await Promise.all([
        this.computeAllReports(actor),
        this.computeAllForecasts(actor),
        this.db
          .select()
          .from(frfReportSnapshots)
          .where(eq(frfReportSnapshots.companyId, actor.companyId))
          .orderBy(desc(frfReportSnapshots.createdAt))
          .limit(50),
        this.db
          .select()
          .from(frfForecastSnapshots)
          .where(eq(frfForecastSnapshots.companyId, actor.companyId))
          .orderBy(desc(frfForecastSnapshots.createdAt))
          .limit(50),
        this.db
          .select()
          .from(frfBudgetPlans)
          .where(eq(frfBudgetPlans.companyId, actor.companyId))
          .orderBy(desc(frfBudgetPlans.createdAt))
          .limit(50),
        this.db
          .select()
          .from(frfInsights)
          .where(eq(frfInsights.companyId, actor.companyId))
          .orderBy(desc(frfInsights.createdAt))
          .limit(100),
        this.db
          .select()
          .from(frfActionRecommendations)
          .where(eq(frfActionRecommendations.companyId, actor.companyId))
          .orderBy(desc(frfActionRecommendations.createdAt))
          .limit(100),
      ]);

    const actions = actionRows.map((r) => this.toAction(r));
    const pendingApprovals = actions.filter((a) => a.status === 'pending_approval').length;

    return {
      summary: [
        liveReports.revenue.summary,
        liveForecasts.revenue.summary,
        pendingApprovals > 0
          ? `${pendingApprovals} action(s) pending Owner approval.`
          : 'No pending reporting/forecast actions.',
      ].join(' '),
      productClarification: { ...FRF_PRODUCT_COPY },
      policy: {
        autoExecuteEnabled: false,
        requiresOwnerApproval: true,
        technicianClientDenied: true,
        fakeDataInvented: false,
        forecastsExplainAssumptions: true,
      },
      reports: reportRows.map((r) => this.toReportSnapshot(r)),
      forecasts: forecastRows.map((r) => this.toForecastSnapshot(r)),
      budgetPlans: budgetRows.map((r) => this.toBudget(r)),
      insights: insightRows.map((r) => this.toInsight(r)),
      actions,
      auraConnections: listFrfAuraConnections(),
      pendingApprovals,
      liveReports,
      liveForecasts,
    };
  }
}
