import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  buildEcActionDraft,
  buildEcOpportunities,
  buildEcRisks,
  buildEcSummary,
  canAccessExecutiveCommandCentre,
  canApproveExecutiveCommandCentre,
  canManageExecutiveCommandCentreSettings,
  canWriteExecutiveCommandCentre,
  EC_PANEL_LABELS,
  EC_PRODUCT_COPY,
  ecMoney,
  ecPanelAvailability,
  listEcConnections,
  type AcknowledgeEcInsightRequest,
  type CreateEcActionDraftRequest,
  type CreateEcInsightRequest,
  type DecideEcActionRequest,
  type EcActionDraftSummary,
  type EcCashPanel,
  type EcDashboard,
  type EcFleetPanel,
  type EcInsightSummary,
  type EcJobsPanel,
  type EcMarketingPanel,
  type EcOutstandingPanel,
  type EcPanelKey,
  type EcProfitPanel,
  type EcRevenuePanel,
  type EcSalesPanel,
  type EcSettings,
  type EcStaffPanel,
  type RefreshEcInsightsRequest,
  type UpdateEcSettingsRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  ecActionDrafts,
  ecInsights,
  ecSettings,
  jobs,
  leads,
  marketingCampaigns,
  salesOpportunities,
  securityAuditLogs,
  users,
  vehicles,
} from '@titan/db';
import {
  FinanceCashflowProfitService,
  type FcpActor,
} from './finance-cashflow-profit.service.js';

export class ExecutiveCommandCentreError extends Error {
  constructor(
    public readonly code: 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'ExecutiveCommandCentreError';
  }
}

export type EcActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

const DENIED =
  'Executive Command Centre is Owner only. Technician, Client, Manager, Dispatcher, Accountant and Staff are denied because it exposes finance, payroll, margin, profit and strategy data.';

/**
 * Executive Command Centre — Owner-only unified business view.
 *
 * Composes existing sources rather than rebuilding them:
 * - revenue / profit / cash / receivables -> FinanceCashflowProfitService
 * - jobs, staff, fleet, marketing, sales   -> real rows, company scoped
 * - agent orchestration                    -> AURA Command Centre (linked, not rebuilt)
 *
 * Every query and mutation is scoped by companyId. No business figure is
 * stored here, so a metric can never drift from its real source, and a missing
 * figure is reported unavailable with a reason instead of being invented.
 */
export class ExecutiveCommandCentreService {
  private readonly finance: FinanceCashflowProfitService;

  constructor(private readonly db: DatabaseClient) {
    this.finance = new FinanceCashflowProfitService(db);
  }

  private assertRead(actor: EcActor): void {
    if (!canAccessExecutiveCommandCentre(actor)) {
      throw new ExecutiveCommandCentreError('FORBIDDEN', DENIED);
    }
  }

  private assertWrite(actor: EcActor): void {
    this.assertRead(actor);
    if (!canWriteExecutiveCommandCentre(actor)) {
      throw new ExecutiveCommandCentreError('FORBIDDEN', DENIED);
    }
  }

  private assertApprove(actor: EcActor): void {
    this.assertWrite(actor);
    if (!canApproveExecutiveCommandCentre(actor)) {
      throw new ExecutiveCommandCentreError(
        'FORBIDDEN',
        'Only the Company Owner or Platform Owner may decide an executive action draft.',
      );
    }
  }

  private assertSettings(actor: EcActor): void {
    this.assertWrite(actor);
    if (!canManageExecutiveCommandCentreSettings(actor)) {
      throw new ExecutiveCommandCentreError('FORBIDDEN', DENIED);
    }
  }

  private async recordAudit(
    actor: EcActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'ai',
      action,
      entityType: 'executive_command_centre',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        ownerOnly: true,
        autoExecuted: false,
        technicianClientDenied: true,
        financialFiguresInvented: false,
        fakeDataInvented: false,
      },
    });
  }

  /** Owner-only actor forwarded to the finance service for real figures. */
  private financeActor(actor: EcActor): FcpActor {
    return {
      companyId: actor.companyId,
      userId: actor.userId,
      roleName: actor.roleName,
      permissions: actor.permissions,
    };
  }

  // ─── Panels ────────────────────────────────────────────────────────────────

  private async loadFinancePanels(
    actor: EcActor,
    enabled: boolean,
  ): Promise<{
    revenue: EcRevenuePanel;
    profit: EcProfitPanel;
    cash: EcCashPanel;
    outstanding: EcOutstandingPanel;
  }> {
    const currency = 'ZAR';
    if (!enabled) {
      const off = 'Finance panels are switched off in Executive Command Centre settings.';
      return {
        revenue: {
          availability: 'unavailable',
          invoicedCents: ecMoney(null, currency, off),
          collectedCents: ecMoney(null, currency, off),
          invoiceCount: 0,
          paymentCount: 0,
          rationale: off,
        },
        profit: {
          availability: 'unavailable',
          revenueCents: ecMoney(null, currency, off),
          costCents: ecMoney(null, currency, off),
          marginCents: ecMoney(null, currency, off),
          marginBps: null,
          jobCount: 0,
          jobsWithCostData: 0,
          labourCostRationale: off,
          rationale: off,
        },
        cash: {
          availability: 'unavailable',
          cashPositionCents: ecMoney(null, currency, off),
          incomingPaymentsCents: ecMoney(null, currency, off),
          expenseCents: ecMoney(null, currency, off),
          rationale: off,
        },
        outstanding: {
          availability: 'unavailable',
          outstandingReceivableCents: ecMoney(null, currency, off),
          overdueAmountCents: ecMoney(null, currency, off),
          overdueInvoiceCount: 0,
          rationale: off,
        },
      };
    }

    // Real figures from Cashflow & Profit Intelligence — company scoped inside.
    const financeActor = this.financeActor(actor);
    const [cashflow, profit] = await Promise.all([
      this.finance.computeCashflow(financeActor),
      this.finance.computeProfit(financeActor),
    ]);

    const noInvoices = 'No real invoice rows for this company yet.';
    const noPayments = 'No real payment rows for this company yet.';

    const invoiced = ecMoney(cashflow.incomeCents, cashflow.currency, noInvoices);
    const collected = ecMoney(
      cashflow.incomingPaymentsCents,
      cashflow.currency,
      noPayments,
    );
    const revenue: EcRevenuePanel = {
      availability: ecPanelAvailability([invoiced, collected]),
      invoicedCents: invoiced,
      collectedCents: collected,
      invoiceCount: cashflow.invoiceCount,
      paymentCount: cashflow.paymentCount,
      rationale:
        cashflow.availability === 'unavailable'
          ? cashflow.summary
          : 'Invoiced and collected figures read from real invoice and payment rows.',
    };

    const profitRevenue = ecMoney(profit.revenueCents, profit.currency, noInvoices);
    const profitCost = ecMoney(
      profit.costCents,
      profit.currency,
      profit.inventoryCostRationale ||
        'No real material unit costs captured, so cost is not estimated.',
    );
    const profitMargin = ecMoney(
      profit.marginCents,
      profit.currency,
      'Margin needs both real revenue and real cost; it is reported unavailable rather than estimated.',
    );
    const profitPanel: EcProfitPanel = {
      availability: ecPanelAvailability([profitRevenue, profitCost, profitMargin]),
      revenueCents: profitRevenue,
      costCents: profitCost,
      marginCents: profitMargin,
      marginBps: profit.marginBps,
      jobCount: profit.jobCount,
      jobsWithCostData: profit.jobsWithCostData,
      labourCostRationale: profit.labourCostRationale,
      rationale: profit.summary,
    };

    const cashPosition = ecMoney(
      cashflow.cashPositionCents,
      cashflow.currency,
      'Cash position needs both recorded income and recorded expenses; it is not estimated.',
    );
    const cashIncoming = ecMoney(
      cashflow.incomingPaymentsCents,
      cashflow.currency,
      noPayments,
    );
    const cashExpense = ecMoney(
      cashflow.expenseCents,
      cashflow.currency,
      'No real expense or purchase order rows captured yet.',
    );
    const cash: EcCashPanel = {
      availability: ecPanelAvailability([cashPosition, cashIncoming, cashExpense]),
      cashPositionCents: cashPosition,
      incomingPaymentsCents: cashIncoming,
      expenseCents: cashExpense,
      rationale: cashflow.summary,
    };

    const receivable = ecMoney(
      cashflow.outstandingReceivableCents,
      cashflow.currency,
      noInvoices,
    );
    const overdue = ecMoney(cashflow.overdueAmountCents, cashflow.currency, noInvoices);
    const outstanding: EcOutstandingPanel = {
      availability: ecPanelAvailability([receivable, overdue]),
      outstandingReceivableCents: receivable,
      overdueAmountCents: overdue,
      overdueInvoiceCount: cashflow.overdueInvoiceCount,
      rationale:
        cashflow.availability === 'unavailable'
          ? noInvoices
          : 'Outstanding and overdue balances read from real invoice rows.',
    };

    return { revenue, profit: profitPanel, cash, outstanding };
  }

  private async loadJobsPanel(companyId: string): Promise<EcJobsPanel> {
    const rows = await this.db
      .select({ status: jobs.status, count: sql<number>`count(*)::int` })
      .from(jobs)
      .where(eq(jobs.companyId, companyId))
      .groupBy(jobs.status);

    const byStatus = new Map(rows.map((r) => [r.status, Number(r.count)]));
    const newCount = byStatus.get('new') ?? 0;
    const scheduledCount = byStatus.get('scheduled') ?? 0;
    const inProgressCount = byStatus.get('in_progress') ?? 0;
    const completedCount = byStatus.get('completed') ?? 0;
    const cancelledCount = byStatus.get('cancelled') ?? 0;
    const total = newCount + scheduledCount + inProgressCount + completedCount + cancelledCount;

    return {
      availability: total > 0 ? 'available' : 'unavailable',
      total,
      newCount,
      scheduledCount,
      inProgressCount,
      completedCount,
      cancelledCount,
      openCount: newCount + scheduledCount + inProgressCount,
      rationale:
        total > 0
          ? 'Counted from real job rows for this company.'
          : 'No real job rows for this company yet.',
    };
  }

  private async loadStaffPanel(companyId: string): Promise<EcStaffPanel> {
    const rows = await this.db
      .select({ isActive: users.isActive, count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.companyId, companyId))
      .groupBy(users.isActive);

    let activeCount = 0;
    let inactiveCount = 0;
    for (const row of rows) {
      if (row.isActive) activeCount += Number(row.count);
      else inactiveCount += Number(row.count);
    }
    const total = activeCount + inactiveCount;

    return {
      availability: total > 0 ? 'available' : 'unavailable',
      activeCount,
      inactiveCount,
      total,
      rationale:
        total > 0
          ? 'Counted from real staff accounts for this company. Payroll and salary figures are not exposed here.'
          : 'No real staff accounts for this company yet.',
    };
  }

  private async loadFleetPanel(companyId: string): Promise<EcFleetPanel> {
    const rows = await this.db
      .select({ status: vehicles.status, count: sql<number>`count(*)::int` })
      .from(vehicles)
      .where(eq(vehicles.companyId, companyId))
      .groupBy(vehicles.status);

    const byStatus = new Map(rows.map((r) => [r.status, Number(r.count)]));
    const availableCount = byStatus.get('available') ?? 0;
    const inUseCount = byStatus.get('in_use') ?? 0;
    const maintenanceCount = byStatus.get('maintenance') ?? 0;
    const outOfServiceCount = byStatus.get('out_of_service') ?? 0;
    const total = availableCount + inUseCount + maintenanceCount + outOfServiceCount;

    return {
      availability: total > 0 ? 'available' : 'unavailable',
      total,
      availableCount,
      inUseCount,
      maintenanceCount,
      outOfServiceCount,
      rationale:
        total > 0
          ? 'Counted from real vehicle rows for this company.'
          : 'No real vehicle rows for this company yet.',
    };
  }

  private async loadMarketingPanel(companyId: string): Promise<EcMarketingPanel> {
    const rows = await this.db
      .select({ status: marketingCampaigns.status, count: sql<number>`count(*)::int` })
      .from(marketingCampaigns)
      .where(eq(marketingCampaigns.companyId, companyId))
      .groupBy(marketingCampaigns.status);

    const byStatus = new Map(rows.map((r) => [r.status, Number(r.count)]));
    const activeCount = byStatus.get('active') ?? 0;
    const draftCount = byStatus.get('draft') ?? 0;
    const completedCount = byStatus.get('completed') ?? 0;
    const total = rows.reduce((sum, r) => sum + Number(r.count), 0);

    return {
      availability: total > 0 ? 'available' : 'unavailable',
      total,
      activeCount,
      draftCount,
      completedCount,
      rationale:
        total > 0
          ? 'Counted from real marketing campaign rows for this company.'
          : 'No real marketing campaign rows for this company yet.',
    };
  }

  private async loadSalesPanel(companyId: string): Promise<EcSalesPanel> {
    const [oppRows, leadRows, pipelineRows] = await Promise.all([
      this.db
        .select({ status: salesOpportunities.status, count: sql<number>`count(*)::int` })
        .from(salesOpportunities)
        .where(eq(salesOpportunities.companyId, companyId))
        .groupBy(salesOpportunities.status),
      this.db
        .select({ status: leads.status, count: sql<number>`count(*)::int` })
        .from(leads)
        .where(eq(leads.companyId, companyId))
        .groupBy(leads.status),
      // Pipeline value only from open rows that carry a real estimated value.
      // Grouped by currency so mixed currencies are never summed together.
      this.db
        .select({
          currency: salesOpportunities.currency,
          total: sql<number>`coalesce(sum(${salesOpportunities.estimatedValueCents}), 0)::int`,
          valued: sql<number>`count(${salesOpportunities.estimatedValueCents})::int`,
        })
        .from(salesOpportunities)
        .where(
          and(
            eq(salesOpportunities.companyId, companyId),
            eq(salesOpportunities.status, 'open'),
            sql`${salesOpportunities.estimatedValueCents} is not null`,
          ),
        )
        .groupBy(salesOpportunities.currency),
    ]);

    const oppByStatus = new Map(oppRows.map((r) => [r.status, Number(r.count)]));
    const openOpportunityCount = oppByStatus.get('open') ?? 0;
    const wonOpportunityCount = oppByStatus.get('won') ?? 0;
    const lostOpportunityCount = oppByStatus.get('lost') ?? 0;
    const oppTotal = oppRows.reduce((sum, r) => sum + Number(r.count), 0);

    const leadByStatus = new Map(leadRows.map((r) => [r.status, Number(r.count)]));
    const leadTotal = leadRows.reduce((sum, r) => sum + Number(r.count), 0);
    const convertedLeadCount = leadByStatus.get('converted') ?? 0;
    const lostLeadCount = leadByStatus.get('lost') ?? 0;
    const duplicateLeadCount = leadByStatus.get('duplicate') ?? 0;
    const openLeadCount = Math.max(
      leadTotal - convertedLeadCount - lostLeadCount - duplicateLeadCount,
      0,
    );

    // Mixed currencies cannot be added without inventing a conversion rate.
    const currencies = pipelineRows.filter((r) => Number(r.valued) > 0);
    let openPipelineCents = ecMoney(
      null,
      'ZAR',
      'No open opportunity carries a real estimated value, so pipeline value is not estimated.',
    );
    if (currencies.length === 1) {
      const only = currencies[0]!;
      openPipelineCents = ecMoney(Number(only.total), only.currency, '');
    } else if (currencies.length > 1) {
      openPipelineCents = ecMoney(
        null,
        currencies[0]!.currency,
        `Open opportunities span ${currencies.length} currencies (${currencies
          .map((c) => c.currency)
          .join(', ')}). No exchange rate is invented, so a single pipeline total is not shown.`,
      );
    }

    const hasRows = oppTotal > 0 || leadTotal > 0;
    return {
      availability: hasRows ? 'available' : 'unavailable',
      openOpportunityCount,
      wonOpportunityCount,
      lostOpportunityCount,
      openLeadCount,
      convertedLeadCount,
      openPipelineCents,
      rationale: hasRows
        ? 'Counted from real lead and opportunity rows for this company.'
        : 'No real lead or opportunity rows for this company yet.',
    };
  }

  // ─── Settings ──────────────────────────────────────────────────────────────

  private toSettings(row: {
    id: string;
    financePanelsEnabled: boolean;
    operationsPanelsEnabled: boolean;
    riskDetectionEnabled: boolean;
    opportunityDetectionEnabled: boolean;
    notes: string | null;
    updatedAt: Date;
  }): EcSettings {
    return {
      id: row.id,
      autoExecuteActionsEnabled: false,
      inventFinancialFiguresEnabled: false,
      financePanelsEnabled: row.financePanelsEnabled,
      operationsPanelsEnabled: row.operationsPanelsEnabled,
      riskDetectionEnabled: row.riskDetectionEnabled,
      opportunityDetectionEnabled: row.opportunityDetectionEnabled,
      notes: row.notes,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async ensureSettingsRow(companyId: string) {
    const existing = await this.db.query.ecSettings.findFirst({
      where: eq(ecSettings.companyId, companyId),
    });
    if (existing) return existing;
    const [created] = await this.db
      .insert(ecSettings)
      .values({ companyId })
      .onConflictDoNothing()
      .returning();
    if (created) return created;
    const raced = await this.db.query.ecSettings.findFirst({
      where: eq(ecSettings.companyId, companyId),
    });
    if (!raced) {
      throw new ExecutiveCommandCentreError('NOT_FOUND', 'Settings row could not be created.');
    }
    return raced;
  }

  async getSettings(actor: EcActor): Promise<EcSettings> {
    this.assertRead(actor);
    const row = await this.ensureSettingsRow(actor.companyId);
    return this.toSettings(row);
  }

  async updateSettings(actor: EcActor, input: UpdateEcSettingsRequest): Promise<EcSettings> {
    this.assertSettings(actor);
    const current = await this.ensureSettingsRow(actor.companyId);
    const [updated] = await this.db
      .update(ecSettings)
      .set({
        financePanelsEnabled: input.financePanelsEnabled ?? current.financePanelsEnabled,
        operationsPanelsEnabled:
          input.operationsPanelsEnabled ?? current.operationsPanelsEnabled,
        riskDetectionEnabled: input.riskDetectionEnabled ?? current.riskDetectionEnabled,
        opportunityDetectionEnabled:
          input.opportunityDetectionEnabled ?? current.opportunityDetectionEnabled,
        notes: input.notes === undefined ? current.notes : input.notes,
        // Invariants can never be switched on.
        autoExecuteActionsEnabled: false,
        inventFinancialFiguresEnabled: false,
        updatedByUserId: actor.userId,
        updatedAt: new Date(),
      })
      .where(and(eq(ecSettings.id, current.id), eq(ecSettings.companyId, actor.companyId)))
      .returning();
    if (!updated) {
      throw new ExecutiveCommandCentreError('NOT_FOUND', 'Settings row not found.');
    }
    await this.recordAudit(actor, 'executive_command_centre.settings.update', updated.id, {
      financePanelsEnabled: updated.financePanelsEnabled,
      operationsPanelsEnabled: updated.operationsPanelsEnabled,
      riskDetectionEnabled: updated.riskDetectionEnabled,
      opportunityDetectionEnabled: updated.opportunityDetectionEnabled,
    });
    return this.toSettings(updated);
  }

  // ─── Action drafts (approval gated) ────────────────────────────────────────

  private toActionSummary(row: {
    id: string;
    title: string;
    body: string;
    panel: EcPanelKey | null;
    status: EcActionDraftSummary['status'];
    createdAt: Date;
    decidedAt: Date | null;
  }): EcActionDraftSummary {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      panel: row.panel,
      status: row.status,
      autoExecuted: false,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    };
  }

  async listActionDrafts(actor: EcActor): Promise<EcActionDraftSummary[]> {
    this.assertRead(actor);
    const rows = await this.db.query.ecActionDrafts.findMany({
      where: eq(ecActionDrafts.companyId, actor.companyId),
      orderBy: [desc(ecActionDrafts.createdAt)],
      limit: 50,
    });
    return rows.map((row) => this.toActionSummary(row));
  }

  async createActionDraft(
    actor: EcActor,
    input: CreateEcActionDraftRequest,
  ): Promise<EcActionDraftSummary> {
    this.assertWrite(actor);
    const title = input.title.trim();
    const body = input.body.trim();
    if (!title || !body) {
      throw new ExecutiveCommandCentreError('INVALID', 'Title and body are required.');
    }
    const [created] = await this.db
      .insert(ecActionDrafts)
      .values({
        companyId: actor.companyId,
        panel: input.panel ?? null,
        title,
        body,
        // Nothing executes on creation — a draft is only queued for Owner approval.
        status: input.submitForApproval ? 'pending_approval' : 'draft',
        autoExecuted: false,
        createdByUserId: actor.userId,
      })
      .returning();
    if (!created) {
      throw new ExecutiveCommandCentreError('INVALID', 'Action draft could not be created.');
    }
    await this.recordAudit(actor, 'executive_command_centre.action.create', created.id, {
      panel: created.panel,
      status: created.status,
      approvalRequired: true,
    });
    return this.toActionSummary(created);
  }

  async decideActionDraft(
    actor: EcActor,
    actionId: string,
    input: DecideEcActionRequest,
  ): Promise<EcActionDraftSummary> {
    this.assertApprove(actor);
    const existing = await this.db.query.ecActionDrafts.findFirst({
      where: and(
        eq(ecActionDrafts.id, actionId),
        eq(ecActionDrafts.companyId, actor.companyId),
      ),
    });
    if (!existing) {
      throw new ExecutiveCommandCentreError('NOT_FOUND', 'Executive action draft not found.');
    }
    if (!['draft', 'pending_approval'].includes(existing.status)) {
      throw new ExecutiveCommandCentreError(
        'INVALID',
        `Action draft is already ${existing.status}.`,
      );
    }
    const nextStatus =
      input.decision === 'approve'
        ? 'approved'
        : input.decision === 'reject'
          ? 'rejected'
          : 'acknowledged';

    const [updated] = await this.db
      .update(ecActionDrafts)
      .set({
        status: nextStatus,
        decisionNotes: input.notes ?? null,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        // Approval records an Owner decision; it never executes a change.
        autoExecuted: false,
        updatedAt: new Date(),
      })
      .where(
        and(eq(ecActionDrafts.id, actionId), eq(ecActionDrafts.companyId, actor.companyId)),
      )
      .returning();
    if (!updated) {
      throw new ExecutiveCommandCentreError('NOT_FOUND', 'Executive action draft not found.');
    }
    await this.recordAudit(actor, 'executive_command_centre.action.decide', updated.id, {
      decision: input.decision,
      status: updated.status,
      executedDownstreamChange: false,
    });
    return this.toActionSummary(updated);
  }

  // ─── Insights (AURA may summarise / recommend only) ────────────────────────

  private toInsightSummary(row: {
    id: string;
    panel: EcPanelKey | null;
    status: EcInsightSummary['status'];
    title: string;
    insight: string;
    href: string | null;
    sourceActionId: string | null;
    createdAt: Date;
  }): EcInsightSummary {
    return {
      id: row.id,
      panel: row.panel,
      status: row.status,
      title: row.title,
      insight: row.insight,
      href: row.href,
      sourceActionId: row.sourceActionId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listInsights(actor: EcActor): Promise<EcInsightSummary[]> {
    this.assertRead(actor);
    const rows = await this.db.query.ecInsights.findMany({
      where: eq(ecInsights.companyId, actor.companyId),
      orderBy: [desc(ecInsights.createdAt)],
      limit: 50,
    });
    return rows.map((row) => this.toInsightSummary(row));
  }

  async createInsight(
    actor: EcActor,
    input: CreateEcInsightRequest,
  ): Promise<EcInsightSummary> {
    this.assertWrite(actor);
    const title = input.title.trim();
    const insight = input.insight.trim();
    if (!title || !insight) {
      throw new ExecutiveCommandCentreError('INVALID', 'Title and insight are required.');
    }
    if (input.sourceActionId) {
      // Tenant isolation — a source draft from another company must not link here.
      const source = await this.db.query.ecActionDrafts.findFirst({
        where: and(
          eq(ecActionDrafts.id, input.sourceActionId),
          eq(ecActionDrafts.companyId, actor.companyId),
        ),
      });
      if (!source) {
        throw new ExecutiveCommandCentreError('NOT_FOUND', 'Source action draft not found.');
      }
    }
    const [created] = await this.db
      .insert(ecInsights)
      .values({
        companyId: actor.companyId,
        panel: input.panel ?? null,
        title,
        insight,
        href: input.href ?? null,
        sourceActionId: input.sourceActionId ?? null,
        createdByUserId: actor.userId,
      })
      .returning();
    if (!created) {
      throw new ExecutiveCommandCentreError('INVALID', 'Insight could not be created.');
    }
    await this.recordAudit(actor, 'executive_command_centre.insight.create', created.id, {
      panel: created.panel,
      summaryOnly: true,
    });
    return this.toInsightSummary(created);
  }

  async acknowledgeInsight(
    actor: EcActor,
    insightId: string,
    input: AcknowledgeEcInsightRequest,
  ): Promise<EcInsightSummary> {
    this.assertWrite(actor);
    const existing = await this.db.query.ecInsights.findFirst({
      where: and(eq(ecInsights.id, insightId), eq(ecInsights.companyId, actor.companyId)),
    });
    if (!existing) {
      throw new ExecutiveCommandCentreError('NOT_FOUND', 'Insight not found.');
    }
    const [updated] = await this.db
      .update(ecInsights)
      .set({ status: input.status, updatedAt: new Date() })
      .where(and(eq(ecInsights.id, insightId), eq(ecInsights.companyId, actor.companyId)))
      .returning();
    if (!updated) {
      throw new ExecutiveCommandCentreError('NOT_FOUND', 'Insight not found.');
    }
    await this.recordAudit(actor, 'executive_command_centre.insight.acknowledge', updated.id, {
      status: updated.status,
    });
    return this.toInsightSummary(updated);
  }

  /**
   * Turns the current real risk signals into executive action drafts.
   * Nothing executes — every generated row requires Owner approval, and no
   * figure is invented because each draft quotes the real signal it came from.
   */
  async refreshActionDrafts(
    actor: EcActor,
    input: RefreshEcInsightsRequest = {},
  ): Promise<EcActionDraftSummary[]> {
    this.assertWrite(actor);
    const dashboard = await this.getDashboard(actor);
    if (dashboard.risks.length === 0) {
      return this.listActionDrafts(actor);
    }

    const openRows = await this.db.query.ecActionDrafts.findMany({
      where: and(
        eq(ecActionDrafts.companyId, actor.companyId),
        inArray(ecActionDrafts.status, ['draft', 'pending_approval']),
      ),
    });
    const existingTitles = new Set(openRows.map((row) => row.title));

    const toInsert = dashboard.risks
      .map((risk) => {
        const panelKey: EcPanelKey =
          risk.kind === 'cash_shortfall'
            ? 'cash'
            : risk.kind === 'overdue_receivable'
              ? 'outstanding_invoices'
              : risk.kind === 'margin_unknown'
                ? 'profit'
                : risk.kind === 'job_backlog'
                  ? 'jobs'
                  : risk.kind === 'fleet_downtime'
                    ? 'fleet'
                    : risk.kind === 'staffing_gap'
                      ? 'staff'
                      : 'sales';
        const draft = buildEcActionDraft({
          panelLabel: EC_PANEL_LABELS[panelKey],
          title: risk.title,
          detail: risk.detail,
        });
        return { panelKey, ...draft };
      })
      .filter((draft) => !existingTitles.has(draft.title));

    if (toInsert.length > 0) {
      await this.db.insert(ecActionDrafts).values(
        toInsert.map((draft) => ({
          companyId: actor.companyId,
          panel: draft.panelKey,
          title: draft.title,
          body: draft.body,
          status: input.submitForApproval ? ('pending_approval' as const) : ('draft' as const),
          autoExecuted: false,
          createdByUserId: actor.userId,
        })),
      );
      await this.recordAudit(actor, 'executive_command_centre.action.refresh', actor.companyId, {
        generated: toInsert.length,
        approvalRequired: true,
        executedDownstreamChange: false,
      });
    }

    return this.listActionDrafts(actor);
  }

  // ─── Dashboard ─────────────────────────────────────────────────────────────

  async getDashboard(actor: EcActor): Promise<EcDashboard> {
    this.assertRead(actor);
    const companyId = actor.companyId;
    const settingsRow = await this.ensureSettingsRow(companyId);
    const settings = this.toSettings(settingsRow);

    const opsOff = 'Operations panels are switched off in Executive Command Centre settings.';
    const opsEnabled = settings.operationsPanelsEnabled;

    const disabledJobs: EcJobsPanel = {
      availability: 'unavailable',
      total: 0,
      newCount: 0,
      scheduledCount: 0,
      inProgressCount: 0,
      completedCount: 0,
      cancelledCount: 0,
      openCount: 0,
      rationale: opsOff,
    };
    const disabledStaff: EcStaffPanel = {
      availability: 'unavailable',
      activeCount: 0,
      inactiveCount: 0,
      total: 0,
      rationale: opsOff,
    };
    const disabledFleet: EcFleetPanel = {
      availability: 'unavailable',
      total: 0,
      availableCount: 0,
      inUseCount: 0,
      maintenanceCount: 0,
      outOfServiceCount: 0,
      rationale: opsOff,
    };
    const disabledMarketing: EcMarketingPanel = {
      availability: 'unavailable',
      total: 0,
      activeCount: 0,
      draftCount: 0,
      completedCount: 0,
      rationale: opsOff,
    };
    const disabledSales: EcSalesPanel = {
      availability: 'unavailable',
      openOpportunityCount: 0,
      wonOpportunityCount: 0,
      lostOpportunityCount: 0,
      openLeadCount: 0,
      convertedLeadCount: 0,
      openPipelineCents: ecMoney(null, 'ZAR', opsOff),
      rationale: opsOff,
    };

    const [finance, jobsPanel, staffPanel, fleetPanel, marketingPanel, salesPanel] =
      await Promise.all([
        this.loadFinancePanels(actor, settings.financePanelsEnabled),
        opsEnabled ? this.loadJobsPanel(companyId) : Promise.resolve(disabledJobs),
        opsEnabled ? this.loadStaffPanel(companyId) : Promise.resolve(disabledStaff),
        opsEnabled ? this.loadFleetPanel(companyId) : Promise.resolve(disabledFleet),
        opsEnabled ? this.loadMarketingPanel(companyId) : Promise.resolve(disabledMarketing),
        opsEnabled ? this.loadSalesPanel(companyId) : Promise.resolve(disabledSales),
      ]);

    const risks = settings.riskDetectionEnabled
      ? buildEcRisks({
          cash: finance.cash,
          outstanding: finance.outstanding,
          profit: finance.profit,
          jobs: jobsPanel,
          fleet: fleetPanel,
          sales: salesPanel,
          staff: staffPanel,
        })
      : [];
    const opportunities = settings.opportunityDetectionEnabled
      ? buildEcOpportunities({
          sales: salesPanel,
          jobs: jobsPanel,
          fleet: fleetPanel,
          marketing: marketingPanel,
          profit: finance.profit,
        })
      : [];

    const [actionDrafts, insights] = await Promise.all([
      this.listActionDrafts(actor),
      this.listInsights(actor),
    ]);

    const panelStates: Array<{ panel: EcPanelKey; availability: string; reason: string }> = [
      {
        panel: 'revenue',
        availability: finance.revenue.availability,
        reason: finance.revenue.rationale,
      },
      {
        panel: 'profit',
        availability: finance.profit.availability,
        reason: finance.profit.marginCents.rationale || finance.profit.rationale,
      },
      {
        panel: 'cash',
        availability: finance.cash.availability,
        reason: finance.cash.cashPositionCents.rationale || finance.cash.rationale,
      },
      {
        panel: 'outstanding_invoices',
        availability: finance.outstanding.availability,
        reason: finance.outstanding.rationale,
      },
      { panel: 'jobs', availability: jobsPanel.availability, reason: jobsPanel.rationale },
      { panel: 'staff', availability: staffPanel.availability, reason: staffPanel.rationale },
      { panel: 'fleet', availability: fleetPanel.availability, reason: fleetPanel.rationale },
      {
        panel: 'marketing',
        availability: marketingPanel.availability,
        reason: marketingPanel.rationale,
      },
      { panel: 'sales', availability: salesPanel.availability, reason: salesPanel.rationale },
    ];
    const unavailablePanels = panelStates
      .filter((state) => state.availability === 'unavailable')
      .map((state) => ({ panel: state.panel, reason: state.reason }));

    return {
      summary: buildEcSummary({
        revenue: finance.revenue,
        profit: finance.profit,
        cash: finance.cash,
        jobs: jobsPanel,
        riskCount: risks.length,
        opportunityCount: opportunities.length,
        unavailableCount: unavailablePanels.length,
      }),
      productClarification: {
        auraCommandCentre: EC_PRODUCT_COPY.auraCommandCentre,
        financeOps: EC_PRODUCT_COPY.financeOps,
        thisLayer: EC_PRODUCT_COPY.thisLayer,
      },
      policy: {
        ownerOnly: true,
        autoExecuteActionsEnabled: false,
        inventFinancialFiguresEnabled: false,
        requiresOwnerApproval: true,
        fakeBusinessData: false,
      },
      revenue: finance.revenue,
      profit: finance.profit,
      cash: finance.cash,
      outstandingInvoices: finance.outstanding,
      jobs: jobsPanel,
      staff: staffPanel,
      fleet: fleetPanel,
      marketing: marketingPanel,
      sales: salesPanel,
      risks,
      opportunities,
      actionDrafts,
      insights,
      connections: listEcConnections(),
      settings,
      pendingApprovals: actionDrafts.filter(
        (draft) => draft.status === 'draft' || draft.status === 'pending_approval',
      ).length,
      unavailablePanels,
    };
  }
}
