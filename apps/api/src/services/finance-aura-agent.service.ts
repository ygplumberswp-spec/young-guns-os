import { and, desc, eq } from 'drizzle-orm';
import {
  answerFinanceAuraQuestion,
  buildFinanceAuraAlertDraftsFromSignals,
  buildFinanceAuraBusinessContext,
  buildFinanceAuraInsightBodies,
  buildFinanceAuraRecommendationDraftsFromSignals,
  canAccessFinanceAuraAgent,
  canApproveFinanceAuraAgent,
  canWriteFinanceAuraAgent,
  emptyFinanceAuraXeroLinkStatus,
  FINANCE_AURA_AGENT_CAPABILITIES,
  FINANCE_AURA_AGENT_PRODUCT_COPY,
  getFinanceAuraAgentIdentity,
  listFinanceAuraAuraConnections,
  type AcknowledgeFinanceAuraAlertRequest,
  type AskFinanceAuraQuestionRequest,
  type CreateFinanceAuraRecommendationRequest,
  type DecideFinanceAuraRecommendationRequest,
  type FinanceAuraAgentDashboard,
  type FinanceAuraAlertSummary,
  type FinanceAuraBusinessContext,
  type FinanceAuraInsightSummary,
  type FinanceAuraQuestionAnswer,
  type FinanceAuraRecommendationSummary,
  type FinanceAuraXeroLinkStatus,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  auraCommandAgentRegistry,
  finAuraAlerts,
  finAuraInsights,
  finAuraRecommendations,
  integrationConnections,
  invoices,
  payments,
  securityAuditLogs,
} from '@titan/db';

export class FinanceAuraAgentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FinanceAuraAgentError';
  }
}

export type FinanceAuraActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

const OPEN_INVOICE_STATUSES = ['sent', 'partial', 'overdue'] as const;

export class FinanceAuraAgentService {
  constructor(private readonly db: DatabaseClient) {}

  private assertRead(actor: FinanceAuraActor): void {
    if (!canAccessFinanceAuraAgent(actor)) {
      throw new FinanceAuraAgentError(
        'FORBIDDEN',
        'Finance AURA Agent requires Owner or finance access (Technician/Client denied).',
      );
    }
  }

  private assertWrite(actor: FinanceAuraActor): void {
    this.assertRead(actor);
    if (!canWriteFinanceAuraAgent(actor)) {
      throw new FinanceAuraAgentError(
        'FORBIDDEN',
        'Finance AURA Agent write actions require Owner or finance:write.',
      );
    }
  }

  private assertApprove(actor: FinanceAuraActor): void {
    this.assertWrite(actor);
    if (!canApproveFinanceAuraAgent(actor)) {
      throw new FinanceAuraAgentError(
        'FORBIDDEN',
        'Only Company Owner or Platform Owner may approve finance recommendations/actions.',
      );
    }
  }

  private async recordAudit(
    actor: FinanceAuraActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'ai',
      action,
      entityType: 'finance_aura_agent',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        autoExecuted: false,
        technicianClientDenied: true,
      },
    });
  }

  private toRecommendation(
    row: typeof finAuraRecommendations.$inferSelect,
  ): FinanceAuraRecommendationSummary {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      title: row.title,
      recommendation: row.recommendation,
      sourceInvoiceId: row.sourceInvoiceId,
      sourcePaymentId: row.sourcePaymentId,
      sourceJobId: row.sourceJobId,
      sourceCustomerId: row.sourceCustomerId,
      autoExecuted: false,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    };
  }

  private toInsight(row: typeof finAuraInsights.$inferSelect): FinanceAuraInsightSummary {
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      metricLabel: row.metricLabel,
      metricValueCents: row.metricValueCents,
      currency: row.currency,
      sourceInvoiceCount: row.sourceInvoiceCount,
      sourcePaymentCount: row.sourcePaymentCount,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toAlert(row: typeof finAuraAlerts.$inferSelect): FinanceAuraAlertSummary {
    return {
      id: row.id,
      kind: row.kind,
      severity: row.severity,
      status: row.status,
      title: row.title,
      detail: row.detail,
      relatedInvoiceId: row.relatedInvoiceId,
      relatedCustomerId: row.relatedCustomerId,
      amountCents: row.amountCents,
      currency: row.currency,
      createdAt: row.createdAt.toISOString(),
      acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    };
  }

  /**
   * Register / refresh Finance agent identity on Command Centre registry.
   * Extends existing finance key — does not duplicate a parallel registry.
   */
  async ensureAgentRegistered(actor: FinanceAuraActor): Promise<{
    commandCentreStatus: string;
    note: string;
  }> {
    this.assertWrite(actor);

    const capabilities = [...FINANCE_AURA_AGENT_CAPABILITIES];
    const note =
      'Finance AURA Agent Foundation active — recommendations/insights/alerts from real TITAN finance data; Owner approval required; no auto-execute.';

    const [existing] = await this.db
      .select()
      .from(auraCommandAgentRegistry)
      .where(
        and(
          eq(auraCommandAgentRegistry.companyId, actor.companyId),
          eq(auraCommandAgentRegistry.agentKey, 'finance'),
        ),
      )
      .limit(1);

    if (!existing) {
      const [created] = await this.db
        .insert(auraCommandAgentRegistry)
        .values({
          companyId: actor.companyId,
          agentKey: 'finance',
          status: 'registered',
          capabilities,
          notes: note,
          createdByUserId: actor.userId,
          updatedByUserId: actor.userId,
        })
        .returning();

      await this.recordAudit(actor, 'fin_aura_agent_registered', created!.id, {
        status: 'registered',
        registry: 'aura_command_agent_registry',
      });

      return {
        commandCentreStatus: 'registered',
        note: 'Finance agent registered in Command Centre registry.',
      };
    }

    const nextStatus =
      existing.status === 'paused' ? 'paused' : existing.status === 'planned' ? 'registered' : existing.status;

    await this.db
      .update(auraCommandAgentRegistry)
      .set({
        status: nextStatus,
        capabilities,
        notes: note,
        updatedByUserId: actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(auraCommandAgentRegistry.id, existing.id));

    await this.recordAudit(actor, 'fin_aura_agent_registry_refreshed', existing.id, {
      status: nextStatus,
      registry: 'aura_command_agent_registry',
    });

    return {
      commandCentreStatus: nextStatus,
      note: 'Finance agent identity refreshed in Command Centre registry (Agent Network uses the same finance key).',
    };
  }

  private async readXeroLinkStatus(companyId: string): Promise<FinanceAuraXeroLinkStatus> {
    const [connection] = await this.db
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.companyId, companyId),
          eq(integrationConnections.provider, 'xero'),
        ),
      )
      .limit(1);

    const invoiceRows = await this.db
      .select({
        id: invoices.id,
        xeroInvoiceNumber: invoices.xeroInvoiceNumber,
      })
      .from(invoices)
      .where(eq(invoices.companyId, companyId));

    const paymentRows = await this.db
      .select({
        id: payments.id,
        xeroPaymentId: payments.xeroPaymentId,
      })
      .from(payments)
      .where(eq(payments.companyId, companyId));

    const invoicesWithXeroNumber = invoiceRows.filter((r) => Boolean(r.xeroInvoiceNumber)).length;
    const paymentsWithXeroId = paymentRows.filter((r) => Boolean(r.xeroPaymentId)).length;

    if (!connection && invoicesWithXeroNumber === 0 && paymentsWithXeroId === 0) {
      return emptyFinanceAuraXeroLinkStatus();
    }

    if (!connection) {
      return {
        availability: 'available',
        connectionStatus: null,
        lastSyncAt: null,
        invoicesWithXeroNumber,
        paymentsWithXeroId,
        rationale:
          'No active Xero connection row, but imported Xero markers exist on TITAN invoices/payments. Live Xero API was not called.',
      };
    }

    return {
      availability: 'available',
      connectionStatus: connection.status,
      lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
      invoicesWithXeroNumber,
      paymentsWithXeroId,
      rationale: `Xero connection status "${connection.status}" from TITAN integration_connections. Invoice/payment Xero markers counted from stored rows only — no live Xero API call.`,
    };
  }

  async getBusinessContext(actor: FinanceAuraActor): Promise<FinanceAuraBusinessContext> {
    this.assertRead(actor);

    const invoiceRows = await this.db
      .select({
        id: invoices.id,
        customerId: invoices.customerId,
        jobId: invoices.jobId,
        status: invoices.status,
        amountCents: invoices.amountCents,
        totalCents: invoices.totalCents,
        amountPaidCents: invoices.amountPaidCents,
        currency: invoices.currency,
        dueDate: invoices.dueDate,
      })
      .from(invoices)
      .where(eq(invoices.companyId, actor.companyId));

    const paymentRows = await this.db
      .select({
        id: payments.id,
        amountCents: payments.amountCents,
        currency: payments.currency,
        paidAt: payments.paidAt,
      })
      .from(payments)
      .where(eq(payments.companyId, actor.companyId));

    const xero = await this.readXeroLinkStatus(actor.companyId);
    const currency = invoiceRows[0]?.currency ?? paymentRows[0]?.currency ?? 'ZAR';
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now - 30 * dayMs;

    let outstandingReceivableCents = 0;
    let overdueInvoiceCount = 0;
    let overdueAmountCents = 0;
    let paidInFullInvoiceCount = 0;
    let jobLinkedInvoiceCount = 0;
    const customerIds = new Set<string>();

    for (const inv of invoiceRows) {
      customerIds.add(inv.customerId);
      if (inv.jobId) jobLinkedInvoiceCount += 1;
      const total = inv.totalCents ?? inv.amountCents;
      const outstanding = Math.max(0, total - inv.amountPaidCents);
      if (inv.status === 'paid' || outstanding === 0) {
        paidInFullInvoiceCount += 1;
        continue;
      }
      if (OPEN_INVOICE_STATUSES.includes(inv.status as (typeof OPEN_INVOICE_STATUSES)[number])) {
        outstandingReceivableCents += outstanding;
        const overdue =
          inv.status === 'overdue' ||
          Boolean(inv.dueDate && inv.dueDate.getTime() < now && outstanding > 0);
        if (overdue) {
          overdueInvoiceCount += 1;
          overdueAmountCents += outstanding;
        }
      }
    }

    let recentPaymentCount30d = 0;
    let recentPaymentTotalCents = 0;
    for (const pay of paymentRows) {
      if (pay.paidAt.getTime() >= thirtyDaysAgo) {
        recentPaymentCount30d += 1;
        recentPaymentTotalCents += pay.amountCents;
      }
    }

    return buildFinanceAuraBusinessContext({
      currency,
      invoiceCount: invoiceRows.length,
      paymentCount: paymentRows.length,
      jobLinkedInvoiceCount,
      customerWithInvoicesCount: customerIds.size,
      outstandingReceivableCents,
      overdueInvoiceCount,
      overdueAmountCents,
      paidInFullInvoiceCount,
      recentPaymentCount30d,
      recentPaymentTotalCents,
      xero,
    });
  }

  private async collectSignals(actor: FinanceAuraActor) {
    const invoiceRows = await this.db
      .select({
        id: invoices.id,
        customerId: invoices.customerId,
        jobId: invoices.jobId,
        status: invoices.status,
        amountCents: invoices.amountCents,
        totalCents: invoices.totalCents,
        amountPaidCents: invoices.amountPaidCents,
        currency: invoices.currency,
        dueDate: invoices.dueDate,
      })
      .from(invoices)
      .where(eq(invoices.companyId, actor.companyId));

    const paymentRows = await this.db
      .select({ id: payments.id, paidAt: payments.paidAt })
      .from(payments)
      .where(eq(payments.companyId, actor.companyId));

    const xero = await this.readXeroLinkStatus(actor.companyId);
    const currency = invoiceRows[0]?.currency ?? 'ZAR';
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const overdueInvoices: Array<{
      invoiceId: string;
      customerId: string | null;
      outstandingCents: number;
      currency: string;
      daysOverdue: number | null;
    }> = [];

    let outstandingReceivableCents = 0;
    let jobUnlinkedOpenInvoiceCount = 0;

    for (const inv of invoiceRows) {
      const total = inv.totalCents ?? inv.amountCents;
      const outstanding = Math.max(0, total - inv.amountPaidCents);
      const isOpen =
        outstanding > 0 &&
        OPEN_INVOICE_STATUSES.includes(inv.status as (typeof OPEN_INVOICE_STATUSES)[number]);
      if (!isOpen) continue;
      outstandingReceivableCents += outstanding;
      if (!inv.jobId) jobUnlinkedOpenInvoiceCount += 1;
      const overdue =
        inv.status === 'overdue' ||
        Boolean(inv.dueDate && inv.dueDate.getTime() < now && outstanding > 0);
      if (overdue) {
        overdueInvoices.push({
          invoiceId: inv.id,
          customerId: inv.customerId,
          outstandingCents: outstanding,
          currency: inv.currency,
          daysOverdue: inv.dueDate
            ? Math.max(0, Math.floor((now - inv.dueDate.getTime()) / (24 * 60 * 60 * 1000)))
            : null,
        });
      }
    }

    overdueInvoices.sort((a, b) => b.outstandingCents - a.outstandingCents);

    const recentPaymentCount30d = paymentRows.filter((p) => p.paidAt.getTime() >= thirtyDaysAgo)
      .length;

    return {
      overdueInvoices,
      outstandingReceivableCents,
      recentPaymentCount30d,
      invoiceCount: invoiceRows.length,
      paymentCount: paymentRows.length,
      xero,
      jobUnlinkedOpenInvoiceCount,
      currency,
    };
  }

  async getDashboard(actor: FinanceAuraActor): Promise<FinanceAuraAgentDashboard> {
    this.assertRead(actor);

    let registry = {
      commandCentreStatus: 'planned',
      note: 'Finance agent key exists in Command Centre / Agent Network catalogs. Call register to refresh tenant registry row.',
    };

    if (canWriteFinanceAuraAgent(actor)) {
      registry = await this.ensureAgentRegistered(actor);
    } else {
      const [existing] = await this.db
        .select()
        .from(auraCommandAgentRegistry)
        .where(
          and(
            eq(auraCommandAgentRegistry.companyId, actor.companyId),
            eq(auraCommandAgentRegistry.agentKey, 'finance'),
          ),
        )
        .limit(1);
      if (existing) {
        registry = {
          commandCentreStatus: existing.status,
          note: existing.notes ?? 'Finance agent present in Command Centre registry.',
        };
      }
    }

    const [businessContext, recommendations, insights, alerts] = await Promise.all([
      this.getBusinessContext(actor),
      this.listRecommendations(actor),
      this.listInsights(actor),
      this.listAlerts(actor),
    ]);

    const empty =
      businessContext.availability === 'unavailable' &&
      recommendations.length === 0 &&
      insights.length === 0 &&
      alerts.length === 0;

    return {
      summary: empty
        ? 'No finance agent activity or TITAN invoice/payment records yet. Insights and recommendations stay unavailable until real finance data exists — nothing is invented.'
        : `Finance AURA Agent loaded with ${businessContext.invoiceCount} invoice(s), ${businessContext.paymentCount} payment(s), ${recommendations.length} recommendation(s), ${insights.length} insight(s), ${alerts.filter((a) => a.status === 'open').length} open alert(s). Financial mutations never auto-execute.`,
      identity: getFinanceAuraAgentIdentity(),
      productClarification: { ...FINANCE_AURA_AGENT_PRODUCT_COPY },
      policy: {
        autoExecuteEnabled: false,
        requiresOwnerApproval: true,
        technicianClientDenied: true,
        fakeDataInvented: false,
      },
      registry,
      businessContext,
      recommendations,
      insights,
      alerts,
      auraConnections: listFinanceAuraAuraConnections(),
    };
  }

  async listRecommendations(actor: FinanceAuraActor): Promise<FinanceAuraRecommendationSummary[]> {
    this.assertRead(actor);
    const rows = await this.db
      .select()
      .from(finAuraRecommendations)
      .where(eq(finAuraRecommendations.companyId, actor.companyId))
      .orderBy(desc(finAuraRecommendations.createdAt));
    return rows.map((r) => this.toRecommendation(r));
  }

  async createRecommendation(
    actor: FinanceAuraActor,
    input: CreateFinanceAuraRecommendationRequest,
  ): Promise<FinanceAuraRecommendationSummary> {
    this.assertWrite(actor);

    const [created] = await this.db
      .insert(finAuraRecommendations)
      .values({
        companyId: actor.companyId,
        kind: input.kind,
        status: 'pending_approval',
        title: input.title.trim(),
        recommendation: input.recommendation.trim(),
        sourceInvoiceId: input.sourceInvoiceId ?? null,
        sourcePaymentId: input.sourcePaymentId ?? null,
        sourceJobId: input.sourceJobId ?? null,
        sourceCustomerId: input.sourceCustomerId ?? null,
        autoExecuted: false,
        createdByUserId: actor.userId,
        metadata: { source: 'finance_aura_agent', autoExecuted: false },
      })
      .returning();

    await this.recordAudit(actor, 'fin_aura_recommendation_created', created!.id, {
      kind: input.kind,
      autoExecuted: false,
    });

    return this.toRecommendation(created!);
  }

  async generateRecommendationsFromSignals(
    actor: FinanceAuraActor,
  ): Promise<FinanceAuraRecommendationSummary[]> {
    this.assertWrite(actor);
    const signals = await this.collectSignals(actor);
    const drafts = buildFinanceAuraRecommendationDraftsFromSignals(signals);

    if (drafts.length === 0) {
      await this.recordAudit(actor, 'fin_aura_recommendations_generate_empty', actor.companyId, {
        reason: 'No grounded signals for draft recommendations',
        invoiceCount: signals.invoiceCount,
        paymentCount: signals.paymentCount,
      });
      return [];
    }

    const created: FinanceAuraRecommendationSummary[] = [];
    for (const draft of drafts) {
      created.push(await this.createRecommendation(actor, draft));
    }

    await this.recordAudit(actor, 'fin_aura_recommendations_generated', actor.companyId, {
      count: created.length,
      autoExecuted: false,
    });

    return created;
  }

  async decideRecommendation(
    actor: FinanceAuraActor,
    recommendationId: string,
    input: DecideFinanceAuraRecommendationRequest,
  ): Promise<FinanceAuraRecommendationSummary> {
    this.assertApprove(actor);

    const [row] = await this.db
      .select()
      .from(finAuraRecommendations)
      .where(
        and(
          eq(finAuraRecommendations.id, recommendationId),
          eq(finAuraRecommendations.companyId, actor.companyId),
        ),
      )
      .limit(1);

    if (!row) {
      throw new FinanceAuraAgentError('NOT_FOUND', 'Recommendation not found');
    }
    if (row.status !== 'pending_approval') {
      throw new FinanceAuraAgentError('INVALID_STATE', 'Recommendation is not pending approval');
    }

    const status = input.decision === 'approve' ? 'approved' : 'rejected';
    const [updated] = await this.db
      .update(finAuraRecommendations)
      .set({
        status,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: input.notes ?? null,
        autoExecuted: false,
        updatedAt: new Date(),
      })
      .where(eq(finAuraRecommendations.id, row.id))
      .returning();

    await this.recordAudit(
      actor,
      input.decision === 'approve'
        ? 'fin_aura_recommendation_approved'
        : 'fin_aura_recommendation_rejected',
      row.id,
      {
        autoExecuted: false,
        note: 'Approval records Owner decision only — no invoice, payment, or Xero mutation was executed.',
      },
    );

    return this.toRecommendation(updated!);
  }

  async listInsights(actor: FinanceAuraActor): Promise<FinanceAuraInsightSummary[]> {
    this.assertRead(actor);
    const rows = await this.db
      .select()
      .from(finAuraInsights)
      .where(eq(finAuraInsights.companyId, actor.companyId))
      .orderBy(desc(finAuraInsights.createdAt));
    return rows.map((r) => this.toInsight(r));
  }

  async refreshInsights(actor: FinanceAuraActor): Promise<FinanceAuraInsightSummary[]> {
    this.assertWrite(actor);
    const context = await this.getBusinessContext(actor);
    const bodies = buildFinanceAuraInsightBodies(context);

    await this.db
      .delete(finAuraInsights)
      .where(eq(finAuraInsights.companyId, actor.companyId));

    const created: FinanceAuraInsightSummary[] = [];
    for (const body of bodies) {
      const [row] = await this.db
        .insert(finAuraInsights)
        .values({
          companyId: actor.companyId,
          kind: body.kind,
          title: body.title,
          body: body.body,
          metricLabel: body.metricLabel,
          metricValueCents: body.metricValueCents,
          currency: body.currency,
          sourceInvoiceCount: body.sourceInvoiceCount,
          sourcePaymentCount: body.sourcePaymentCount,
          createdByUserId: actor.userId,
          metadata: {
            source: 'finance_aura_agent',
            availability: context.availability,
            invented: false,
          },
        })
        .returning();
      created.push(this.toInsight(row!));
    }

    await this.recordAudit(actor, 'fin_aura_insights_refreshed', actor.companyId, {
      count: created.length,
      availability: context.availability,
    });

    return created;
  }

  async listAlerts(actor: FinanceAuraActor): Promise<FinanceAuraAlertSummary[]> {
    this.assertRead(actor);
    const rows = await this.db
      .select()
      .from(finAuraAlerts)
      .where(eq(finAuraAlerts.companyId, actor.companyId))
      .orderBy(desc(finAuraAlerts.createdAt));
    return rows.map((r) => this.toAlert(r));
  }

  async refreshAlerts(actor: FinanceAuraActor): Promise<FinanceAuraAlertSummary[]> {
    this.assertWrite(actor);
    const signals = await this.collectSignals(actor);
    const drafts = buildFinanceAuraAlertDraftsFromSignals(signals);

    // Replace open alerts so refresh stays honest to current signals.
    await this.db
      .delete(finAuraAlerts)
      .where(
        and(eq(finAuraAlerts.companyId, actor.companyId), eq(finAuraAlerts.status, 'open')),
      );

    const created: FinanceAuraAlertSummary[] = [];
    for (const draft of drafts) {
      const [row] = await this.db
        .insert(finAuraAlerts)
        .values({
          companyId: actor.companyId,
          kind: draft.kind,
          severity: draft.severity,
          status: 'open',
          title: draft.title,
          detail: draft.detail,
          relatedInvoiceId: draft.relatedInvoiceId,
          relatedCustomerId: draft.relatedCustomerId,
          amountCents: draft.amountCents,
          currency: draft.currency,
          createdByUserId: actor.userId,
          metadata: { source: 'finance_aura_agent', autoExecuted: false },
        })
        .returning();
      created.push(this.toAlert(row!));
    }

    await this.recordAudit(actor, 'fin_aura_alerts_refreshed', actor.companyId, {
      count: created.length,
      autoExecuted: false,
    });

    return created;
  }

  async acknowledgeAlert(
    actor: FinanceAuraActor,
    alertId: string,
    input: AcknowledgeFinanceAuraAlertRequest = {},
  ): Promise<FinanceAuraAlertSummary> {
    this.assertApprove(actor);

    const [row] = await this.db
      .select()
      .from(finAuraAlerts)
      .where(and(eq(finAuraAlerts.id, alertId), eq(finAuraAlerts.companyId, actor.companyId)))
      .limit(1);

    if (!row) {
      throw new FinanceAuraAgentError('NOT_FOUND', 'Alert not found');
    }
    if (row.status !== 'open') {
      throw new FinanceAuraAgentError('INVALID_STATE', 'Alert is not open');
    }

    const [updated] = await this.db
      .update(finAuraAlerts)
      .set({
        status: 'acknowledged',
        acknowledgedByUserId: actor.userId,
        acknowledgedAt: new Date(),
        metadata: {
          ...(row.metadata ?? {}),
          acknowledgeNotes: input.notes ?? null,
        },
        updatedAt: new Date(),
      })
      .where(eq(finAuraAlerts.id, row.id))
      .returning();

    await this.recordAudit(actor, 'fin_aura_alert_acknowledged', row.id, {
      kind: row.kind,
      autoExecuted: false,
    });

    return this.toAlert(updated!);
  }

  async askQuestion(
    actor: FinanceAuraActor,
    input: AskFinanceAuraQuestionRequest,
  ): Promise<FinanceAuraQuestionAnswer> {
    this.assertRead(actor);
    const context = await this.getBusinessContext(actor);
    const answer = answerFinanceAuraQuestion({
      question: input.question,
      context,
    });

    await this.recordAudit(actor, 'fin_aura_question_answered', actor.companyId, {
      availability: answer.availability,
      groundedIn: answer.groundedIn,
      autoExecuted: false,
      questionLength: input.question.trim().length,
    });

    return answer;
  }
}
