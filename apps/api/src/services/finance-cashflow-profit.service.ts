import { and, desc, eq, gt, sql } from 'drizzle-orm';
import {
  buildFcpActionDraftsFromSignals,
  buildFcpCashflowIntelligence,
  buildFcpInsightDraftsFromSignals,
  buildFcpProfitIntelligence,
  canAccessFinanceCashflowProfit,
  canApproveFinanceCashflowProfit,
  canWriteFinanceCashflowProfit,
  FCP_PRODUCT_COPY,
  listFcpAuraConnections,
  type AcknowledgeFcpInsightRequest,
  type CreateFcpActionRequest,
  type DecideFcpActionRequest,
  type FcpActionSummary,
  type FcpCashflowIntelligence,
  type FcpDashboard,
  type FcpInsightSummary,
  type FcpProfitIntelligence,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  fcpActionRecommendations,
  fcpInsights,
  inventoryItems,
  invoices,
  jobMaterialLines,
  jobs,
  mobileTimeEntries,
  payments,
  purchaseOrders,
  securityAuditLogs,
  wiTimesheets,
} from '@titan/db';

export class FinanceCashflowProfitError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FinanceCashflowProfitError';
  }
}

export type FcpActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

export class FinanceCashflowProfitService {
  constructor(private readonly db: DatabaseClient) {}

  private assertRead(actor: FcpActor): void {
    if (!canAccessFinanceCashflowProfit(actor)) {
      throw new FinanceCashflowProfitError(
        'FORBIDDEN',
        'Cashflow & Profit Intelligence requires Owner or finance access (Technician/Client denied).',
      );
    }
  }

  private assertWrite(actor: FcpActor): void {
    this.assertRead(actor);
    if (!canWriteFinanceCashflowProfit(actor)) {
      throw new FinanceCashflowProfitError(
        'FORBIDDEN',
        'Write actions require Owner or finance:write.',
      );
    }
  }

  private assertApprove(actor: FcpActor): void {
    this.assertWrite(actor);
    if (!canApproveFinanceCashflowProfit(actor)) {
      throw new FinanceCashflowProfitError(
        'FORBIDDEN',
        'Only Company Owner or Platform Owner may approve cashflow/profit recommended actions.',
      );
    }
  }

  private async recordAudit(
    actor: FcpActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'ai',
      action,
      entityType: 'finance_cashflow_profit',
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

  private toInsight(row: typeof fcpInsights.$inferSelect): FcpInsightSummary {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      title: row.title,
      body: row.body,
      metricLabel: row.metricLabel,
      metricValueCents: row.metricValueCents,
      currency: row.currency,
      sourceInvoiceCount: row.sourceInvoiceCount,
      sourcePaymentCount: row.sourcePaymentCount,
      sourceJobCount: row.sourceJobCount,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toAction(row: typeof fcpActionRecommendations.$inferSelect): FcpActionSummary {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      title: row.title,
      recommendation: row.recommendation,
      sourceInvoiceId: row.sourceInvoiceId,
      sourceJobId: row.sourceJobId,
      sourceInsightId: row.sourceInsightId,
      autoExecuted: false,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    };
  }

  async computeCashflow(actor: FcpActor): Promise<FcpCashflowIntelligence> {
    this.assertRead(actor);
    const [invoiceRows, paymentRows, poRows] = await Promise.all([
      this.db
        .select({
          id: invoices.id,
          status: invoices.status,
          totalCents: invoices.totalCents,
          amountCents: invoices.amountCents,
          amountPaidCents: invoices.amountPaidCents,
          dueDate: invoices.dueDate,
          issuedAt: invoices.issuedAt,
          createdAt: invoices.createdAt,
          xeroInvoiceNumber: invoices.xeroInvoiceNumber,
          currency: invoices.currency,
        })
        .from(invoices)
        .where(eq(invoices.companyId, actor.companyId)),
      this.db
        .select({
          id: payments.id,
          amountCents: payments.amountCents,
          paidAt: payments.paidAt,
          xeroPaymentId: payments.xeroPaymentId,
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
    ]);

    const currency =
      paymentRows[0]?.currency ?? invoiceRows[0]?.currency ?? 'ZAR';

    return buildFcpCashflowIntelligence({
      currency,
      invoices: invoiceRows,
      payments: paymentRows,
      purchaseOrders: poRows,
    });
  }

  async computeProfit(actor: FcpActor): Promise<FcpProfitIntelligence> {
    this.assertRead(actor);
    const [
      jobRows,
      invoiceRows,
      materialRows,
      inventoryCostCountRows,
      mobileLabourRows,
      timesheetRows,
    ] = await Promise.all([
      this.db
        .select({
          id: jobs.id,
          jobNumber: jobs.jobNumber,
          title: jobs.title,
          jobType: jobs.jobType,
        })
        .from(jobs)
        .where(eq(jobs.companyId, actor.companyId)),
      this.db
        .select({
          jobId: invoices.jobId,
          status: invoices.status,
          totalCents: invoices.totalCents,
          amountCents: invoices.amountCents,
          amountPaidCents: invoices.amountPaidCents,
          currency: invoices.currency,
        })
        .from(invoices)
        .where(eq(invoices.companyId, actor.companyId)),
      this.db
        .select({
          jobId: jobMaterialLines.jobId,
          status: jobMaterialLines.status,
          quantity: jobMaterialLines.quantity,
          fulfilledQuantity: jobMaterialLines.fulfilledQuantity,
          unitCostCents: jobMaterialLines.unitCostCents,
          materialSource: jobMaterialLines.materialSource,
          inventoryItemId: jobMaterialLines.inventoryItemId,
        })
        .from(jobMaterialLines)
        .where(eq(jobMaterialLines.companyId, actor.companyId)),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(inventoryItems)
        .where(
          and(eq(inventoryItems.companyId, actor.companyId), gt(inventoryItems.unitCostCents, 0)),
        ),
      this.db
        .select({
          jobId: mobileTimeEntries.jobId,
          durationMinutes: mobileTimeEntries.durationMinutes,
        })
        .from(mobileTimeEntries)
        .where(eq(mobileTimeEntries.companyId, actor.companyId)),
      this.db
        .select({
          jobId: wiTimesheets.jobId,
          standardHours: wiTimesheets.standardHours,
          overtimeHours: wiTimesheets.overtimeHours,
          travelHours: wiTimesheets.travelHours,
          status: wiTimesheets.status,
        })
        .from(wiTimesheets)
        .where(eq(wiTimesheets.companyId, actor.companyId)),
    ]);

    const currency = invoiceRows[0]?.currency ?? 'ZAR';
    const inventoryItemsWithCost = Number(inventoryCostCountRows[0]?.count ?? 0);

    const labourByJob: Array<{ jobId: string; durationMinutes: number }> = [];
    for (const row of mobileLabourRows) {
      if (!row.jobId || row.durationMinutes == null || row.durationMinutes <= 0) continue;
      labourByJob.push({ jobId: row.jobId, durationMinutes: row.durationMinutes });
    }
    for (const row of timesheetRows) {
      if (!row.jobId) continue;
      // Prefer approved/submitted timesheets; still include draft hours as real recorded time.
      const hours =
        Number(row.standardHours ?? 0) +
        Number(row.overtimeHours ?? 0) +
        Number(row.travelHours ?? 0);
      if (!Number.isFinite(hours) || hours <= 0) continue;
      labourByJob.push({ jobId: row.jobId, durationMinutes: Math.round(hours * 60) });
    }

    return buildFcpProfitIntelligence({
      currency,
      jobs: jobRows,
      invoices: invoiceRows,
      materialLines: materialRows.map((row) => ({
        ...row,
        quantity: String(row.quantity),
        fulfilledQuantity: row.fulfilledQuantity != null ? String(row.fulfilledQuantity) : null,
      })),
      labourByJob,
      inventoryItemsWithCost,
    });
  }

  async listInsights(actor: FcpActor): Promise<FcpInsightSummary[]> {
    this.assertRead(actor);
    const rows = await this.db
      .select()
      .from(fcpInsights)
      .where(eq(fcpInsights.companyId, actor.companyId))
      .orderBy(desc(fcpInsights.createdAt))
      .limit(100);
    return rows.map((r) => this.toInsight(r));
  }

  async listActions(actor: FcpActor): Promise<FcpActionSummary[]> {
    this.assertRead(actor);
    const rows = await this.db
      .select()
      .from(fcpActionRecommendations)
      .where(eq(fcpActionRecommendations.companyId, actor.companyId))
      .orderBy(desc(fcpActionRecommendations.createdAt))
      .limit(100);
    return rows.map((r) => this.toAction(r));
  }

  async refreshInsights(actor: FcpActor): Promise<FcpInsightSummary[]> {
    this.assertWrite(actor);
    const [cashflow, profit] = await Promise.all([
      this.computeCashflow(actor),
      this.computeProfit(actor),
    ]);
    const drafts = buildFcpInsightDraftsFromSignals({ cashflow, profit });
    const created: FcpInsightSummary[] = [];

    for (const draft of drafts) {
      const [row] = await this.db
        .insert(fcpInsights)
        .values({
          companyId: actor.companyId,
          kind: draft.kind,
          status: 'open',
          title: draft.title,
          body: draft.body,
          metricLabel: draft.metricLabel,
          metricValueCents: draft.metricValueCents,
          currency: draft.currency,
          sourceInvoiceCount: draft.sourceInvoiceCount,
          sourcePaymentCount: draft.sourcePaymentCount,
          sourceJobCount: draft.sourceJobCount,
          createdByUserId: actor.userId,
          metadata: { generatedFrom: 'real_titan_signals', invented: false },
        })
        .returning();
      if (row) {
        created.push(this.toInsight(row));
        await this.recordAudit(actor, 'fcp_insight_generated', row.id, {
          kind: row.kind,
        });
      }
    }

    return created;
  }

  async generateActions(actor: FcpActor): Promise<FcpActionSummary[]> {
    this.assertWrite(actor);
    const [cashflow, profit] = await Promise.all([
      this.computeCashflow(actor),
      this.computeProfit(actor),
    ]);
    const drafts = buildFcpActionDraftsFromSignals({ cashflow, profit });
    const created: FcpActionSummary[] = [];

    for (const draft of drafts) {
      const [row] = await this.db
        .insert(fcpActionRecommendations)
        .values({
          companyId: actor.companyId,
          kind: draft.kind,
          status: 'pending_approval',
          title: draft.title,
          recommendation: draft.recommendation,
          sourceJobId: draft.sourceJobId ?? null,
          autoExecuted: false,
          createdByUserId: actor.userId,
          metadata: { generatedFrom: 'real_titan_signals', invented: false },
        })
        .returning();
      if (row) {
        created.push(this.toAction(row));
        await this.recordAudit(actor, 'fcp_action_generated', row.id, {
          kind: row.kind,
          status: row.status,
        });
      }
    }

    return created;
  }

  async createAction(actor: FcpActor, input: CreateFcpActionRequest): Promise<FcpActionSummary> {
    this.assertWrite(actor);
    const status = input.submitForApproval === false ? 'draft' : 'pending_approval';
    const [row] = await this.db
      .insert(fcpActionRecommendations)
      .values({
        companyId: actor.companyId,
        kind: input.kind,
        status,
        title: input.title.trim(),
        recommendation: input.recommendation.trim(),
        sourceInvoiceId: input.sourceInvoiceId ?? null,
        sourceJobId: input.sourceJobId ?? null,
        sourceInsightId: input.sourceInsightId ?? null,
        autoExecuted: false,
        createdByUserId: actor.userId,
        metadata: { invented: false },
      })
      .returning();
    if (!row) {
      throw new FinanceCashflowProfitError('INTERNAL', 'Unable to create action recommendation');
    }
    await this.recordAudit(actor, 'fcp_action_created', row.id, {
      kind: row.kind,
      status: row.status,
    });
    return this.toAction(row);
  }

  async decideAction(
    actor: FcpActor,
    actionId: string,
    input: DecideFcpActionRequest,
  ): Promise<FcpActionSummary> {
    this.assertApprove(actor);
    const [existing] = await this.db
      .select()
      .from(fcpActionRecommendations)
      .where(
        and(
          eq(fcpActionRecommendations.id, actionId),
          eq(fcpActionRecommendations.companyId, actor.companyId),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new FinanceCashflowProfitError('NOT_FOUND', 'Action recommendation not found');
    }
    if (existing.status !== 'pending_approval' && existing.status !== 'draft') {
      throw new FinanceCashflowProfitError(
        'CONFLICT',
        `Action is ${existing.status} and cannot be decided`,
      );
    }
    const nextStatus = input.decision === 'approve' ? 'approved' : 'rejected';
    const [row] = await this.db
      .update(fcpActionRecommendations)
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
          eq(fcpActionRecommendations.id, actionId),
          eq(fcpActionRecommendations.companyId, actor.companyId),
        ),
      )
      .returning();
    if (!row) {
      throw new FinanceCashflowProfitError('INTERNAL', 'Unable to decide action');
    }
    await this.recordAudit(
      actor,
      nextStatus === 'approved' ? 'fcp_action_approved' : 'fcp_action_rejected',
      row.id,
      { decision: input.decision, autoExecuted: false },
    );
    return this.toAction(row);
  }

  async acknowledgeInsight(
    actor: FcpActor,
    insightId: string,
    input: AcknowledgeFcpInsightRequest,
  ): Promise<FcpInsightSummary> {
    this.assertWrite(actor);
    const [existing] = await this.db
      .select()
      .from(fcpInsights)
      .where(and(eq(fcpInsights.id, insightId), eq(fcpInsights.companyId, actor.companyId)))
      .limit(1);
    if (!existing) {
      throw new FinanceCashflowProfitError('NOT_FOUND', 'Insight not found');
    }
    const [row] = await this.db
      .update(fcpInsights)
      .set({
        status: input.status,
        updatedAt: new Date(),
        metadata: {
          ...(existing.metadata ?? {}),
          acknowledgedByUserId: actor.userId,
        },
      })
      .where(and(eq(fcpInsights.id, insightId), eq(fcpInsights.companyId, actor.companyId)))
      .returning();
    if (!row) {
      throw new FinanceCashflowProfitError('INTERNAL', 'Unable to update insight');
    }
    await this.recordAudit(actor, 'fcp_insight_acknowledged', row.id, {
      status: input.status,
    });
    return this.toInsight(row);
  }

  async getDashboard(actor: FcpActor): Promise<FcpDashboard> {
    this.assertRead(actor);
    const [cashflow, profit, insights, actions] = await Promise.all([
      this.computeCashflow(actor),
      this.computeProfit(actor),
      this.listInsights(actor),
      this.listActions(actor),
    ]);

    const pendingApprovals = actions.filter((a) => a.status === 'pending_approval').length;
    const summaryParts = [cashflow.summary, profit.summary];
    if (pendingApprovals > 0) {
      summaryParts.push(`${pendingApprovals} action(s) pending Owner approval.`);
    }

    return {
      summary: summaryParts.join(' '),
      productClarification: { ...FCP_PRODUCT_COPY },
      policy: {
        autoExecuteEnabled: false,
        requiresOwnerApproval: true,
        technicianClientDenied: true,
        fakeDataInvented: false,
      },
      cashflow,
      profit,
      insights,
      actions,
      auraConnections: listFcpAuraConnections(),
      pendingApprovals,
    };
  }
}
