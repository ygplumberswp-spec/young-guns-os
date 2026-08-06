import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  answerSalesIntelligenceQuestion,
  buildSalesIntelligenceBusinessContext,
  buildSalesIntelligenceInsightBodies,
  buildSalesIntelligenceQualificationSample,
  buildSalesIntelligenceRecommendationDraftsFromSignals,
  buildSalesIntelligenceSignalDraftsFromSignals,
  canAccessSalesIntelligenceAgent,
  canApproveSalesIntelligenceAgent,
  canWriteSalesIntelligenceAgent,
  getSalesIntelligenceAgentIdentity,
  listSalesIntelligenceAuraConnections,
  SALES_INTELLIGENCE_AGENT_CAPABILITIES,
  SALES_INTELLIGENCE_AGENT_PRODUCT_COPY,
  type AskSalesIntelligenceQuestionRequest,
  type CreateSalesIntelligenceRecommendationRequest,
  type DecideSalesIntelligenceRecommendationRequest,
  type SalesIntelligenceAgentDashboard,
  type SalesIntelligenceBusinessContext,
  type SalesIntelligenceInsightSummary,
  type SalesIntelligenceQuestionAnswer,
  type SalesIntelligenceRecommendationSummary,
  type SalesIntelligenceSignalSummary,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  auraCommandAgentRegistry,
  communications,
  customers,
  leadConversions,
  leadSources,
  leads,
  quotes,
  salesOpportunities,
  salesPipelineStages,
  securityAuditLogs,
  siaInsights,
  siaOpportunitySignals,
  siaRecommendations,
} from '@titan/db';

export class SalesIntelligenceAgentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SalesIntelligenceAgentError';
  }
}

export type SalesIntelligenceActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

const OPEN_LEAD_STATUSES = [
  'new',
  'attempted_contact',
  'contacted',
  'qualified',
  'awaiting_information',
  'quote_required',
  'ready_to_book',
  'opportunity',
] as const;

const UNCONVERTED_QUOTE_STATUSES = ['sent', 'viewed', 'accepted'] as const;

export class SalesIntelligenceAgentService {
  constructor(private readonly db: DatabaseClient) {}

  private assertRead(actor: SalesIntelligenceActor): void {
    if (!canAccessSalesIntelligenceAgent(actor)) {
      throw new SalesIntelligenceAgentError(
        'FORBIDDEN',
        'Sales Intelligence Agent requires Owner or sales/leads access (Technician/Client denied).',
      );
    }
  }

  private assertWrite(actor: SalesIntelligenceActor): void {
    this.assertRead(actor);
    if (!canWriteSalesIntelligenceAgent(actor)) {
      throw new SalesIntelligenceAgentError(
        'FORBIDDEN',
        'Sales Intelligence Agent write actions require Owner or sales/leads write access.',
      );
    }
  }

  private assertApprove(actor: SalesIntelligenceActor): void {
    this.assertWrite(actor);
    if (!canApproveSalesIntelligenceAgent(actor)) {
      throw new SalesIntelligenceAgentError(
        'FORBIDDEN',
        'Only Company Owner or Platform Owner may approve sales outreach / recommendations.',
      );
    }
  }

  private async recordAudit(
    actor: SalesIntelligenceActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'ai',
      action,
      entityType: 'sales_intelligence_agent',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        autoExecuted: false,
        outreachSent: false,
        spamProhibited: true,
        technicianClientDenied: true,
      },
    });
  }

  private toRecommendation(
    row: typeof siaRecommendations.$inferSelect,
  ): SalesIntelligenceRecommendationSummary {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      title: row.title,
      recommendation: row.recommendation,
      draftOutreach: row.draftOutreach,
      sourceLeadId: row.sourceLeadId,
      sourceOpportunityId: row.sourceOpportunityId,
      sourceQuoteId: row.sourceQuoteId,
      sourceCustomerId: row.sourceCustomerId,
      autoExecuted: false,
      outreachSent: false,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    };
  }

  private toInsight(row: typeof siaInsights.$inferSelect): SalesIntelligenceInsightSummary {
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      metricLabel: row.metricLabel,
      metricValue: row.metricValue,
      metricValueCents: row.metricValueCents,
      currency: row.currency,
      sourceLeadCount: row.sourceLeadCount,
      sourceOpportunityCount: row.sourceOpportunityCount,
      sourceQuoteCount: row.sourceQuoteCount,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toSignal(row: typeof siaOpportunitySignals.$inferSelect): SalesIntelligenceSignalSummary {
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      detail: row.detail,
      priority: row.priority,
      sourceLeadId: row.sourceLeadId,
      sourceOpportunityId: row.sourceOpportunityId,
      sourceQuoteId: row.sourceQuoteId,
      sourceCustomerId: row.sourceCustomerId,
      sourceLeadSourceId: row.sourceLeadSourceId,
      estimatedValueCents: row.estimatedValueCents,
      currency: row.currency,
      dismissed: row.dismissed,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * Register / refresh Sales agent identity on Command Centre registry.
   * Extends existing sales key — does not duplicate a parallel registry.
   */
  async ensureAgentRegistered(actor: SalesIntelligenceActor): Promise<{
    commandCentreStatus: string;
    note: string;
  }> {
    this.assertWrite(actor);

    const capabilities = [...SALES_INTELLIGENCE_AGENT_CAPABILITIES];
    const note =
      'Sales Intelligence Agent Foundation active — lead hunting/qualification/pipeline insights from real TITAN CRM data; Owner approval required; no auto-outreach / no spam.';

    const [existing] = await this.db
      .select()
      .from(auraCommandAgentRegistry)
      .where(
        and(
          eq(auraCommandAgentRegistry.companyId, actor.companyId),
          eq(auraCommandAgentRegistry.agentKey, 'sales'),
        ),
      )
      .limit(1);

    if (!existing) {
      const [created] = await this.db
        .insert(auraCommandAgentRegistry)
        .values({
          companyId: actor.companyId,
          agentKey: 'sales',
          status: 'registered',
          capabilities,
          notes: note,
          createdByUserId: actor.userId,
          updatedByUserId: actor.userId,
        })
        .returning();

      await this.recordAudit(actor, 'sia_agent_registered', created!.id, {
        status: 'registered',
        registry: 'aura_command_agent_registry',
      });

      return {
        commandCentreStatus: 'registered',
        note: 'Sales agent registered in Command Centre registry.',
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

    await this.recordAudit(actor, 'sia_agent_registry_refreshed', existing.id, {
      status: nextStatus,
      registry: 'aura_command_agent_registry',
    });

    return {
      commandCentreStatus: nextStatus,
      note: 'Sales agent identity refreshed in Command Centre registry (Agent Network uses the same sales key).',
    };
  }

  async getBusinessContext(actor: SalesIntelligenceActor): Promise<SalesIntelligenceBusinessContext> {
    this.assertRead(actor);

    const [
      customerRows,
      leadRows,
      opportunityRows,
      quoteRows,
      stageRows,
      sourceRows,
      conversionRows,
      communicationRows,
    ] = await Promise.all([
      this.db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.companyId, actor.companyId)),
      this.db
        .select({
          id: leads.id,
          title: leads.title,
          status: leads.status,
          urgency: leads.urgency,
          score: leads.score,
          serviceType: leads.serviceType,
          notes: leads.notes,
          customerId: leads.customerId,
          nextActionDueAt: leads.nextActionDueAt,
        })
        .from(leads)
        .where(eq(leads.companyId, actor.companyId)),
      this.db
        .select({
          id: salesOpportunities.id,
          status: salesOpportunities.status,
          estimatedValueCents: salesOpportunities.estimatedValueCents,
          currency: salesOpportunities.currency,
          title: salesOpportunities.title,
          customerId: salesOpportunities.customerId,
        })
        .from(salesOpportunities)
        .where(eq(salesOpportunities.companyId, actor.companyId)),
      this.db
        .select({
          id: quotes.id,
          status: quotes.status,
          amountCents: quotes.amountCents,
          totalCents: quotes.totalCents,
          currency: quotes.currency,
          title: quotes.title,
          customerId: quotes.customerId,
          leadId: quotes.leadId,
        })
        .from(quotes)
        .where(eq(quotes.companyId, actor.companyId)),
      this.db
        .select({ id: salesPipelineStages.id })
        .from(salesPipelineStages)
        .where(eq(salesPipelineStages.companyId, actor.companyId)),
      this.db
        .select({ id: leadSources.id, name: leadSources.name, enabled: leadSources.enabled })
        .from(leadSources)
        .where(eq(leadSources.companyId, actor.companyId)),
      this.db
        .select({ id: leadConversions.id })
        .from(leadConversions)
        .where(eq(leadConversions.companyId, actor.companyId)),
      this.db
        .select({ id: communications.id })
        .from(communications)
        .where(eq(communications.companyId, actor.companyId)),
    ]);

    const currency =
      opportunityRows[0]?.currency ?? quoteRows[0]?.currency ?? 'ZAR';
    const now = Date.now();

    const openLeads = leadRows.filter((l) =>
      OPEN_LEAD_STATUSES.includes(l.status as (typeof OPEN_LEAD_STATUSES)[number]),
    );
    const highScoreLeadCount = openLeads.filter((l) => l.score >= 70).length;
    const followUpDueCount = openLeads.filter(
      (l) => l.nextActionDueAt != null && l.nextActionDueAt.getTime() <= now,
    ).length;

    const openOpportunities = opportunityRows.filter((o) => o.status === 'open');
    const wonOpportunityCount = opportunityRows.filter((o) => o.status === 'won').length;
    const lostOpportunityCount = opportunityRows.filter((o) => o.status === 'lost').length;
    let openPipelineValueCents: number | null = null;
    for (const opp of openOpportunities) {
      if (opp.estimatedValueCents != null) {
        openPipelineValueCents = (openPipelineValueCents ?? 0) + opp.estimatedValueCents;
      }
    }

    const unconvertedQuotes = quoteRows.filter((q) =>
      UNCONVERTED_QUOTE_STATUSES.includes(q.status as (typeof UNCONVERTED_QUOTE_STATUSES)[number]),
    );
    const sentQuoteCount = unconvertedQuotes.length;

    const quoteValueByLead = new Map<string, number>();
    for (const quote of quoteRows) {
      if (!quote.leadId) continue;
      const value = quote.totalCents || quote.amountCents;
      const prev = quoteValueByLead.get(quote.leadId);
      if (prev == null || value > prev) quoteValueByLead.set(quote.leadId, value);
    }

    const qualificationSamples = openLeads.slice(0, 8).map((lead) =>
      buildSalesIntelligenceQualificationSample({
        leadId: lead.id,
        title: lead.title,
        status: lead.status,
        urgency: lead.urgency,
        score: lead.score,
        serviceType: lead.serviceType,
        notes: lead.notes,
        linkedQuoteValueCents: quoteValueByLead.get(lead.id) ?? null,
      }),
    );

    return buildSalesIntelligenceBusinessContext({
      currency,
      customerCount: customerRows.length,
      leadCount: leadRows.length,
      openLeadCount: openLeads.length,
      opportunityCount: opportunityRows.length,
      openOpportunityCount: openOpportunities.length,
      quoteCount: quoteRows.length,
      sentQuoteCount,
      conversionCount: conversionRows.length,
      communicationCount: communicationRows.length,
      leadSourceCount: sourceRows.length,
      highScoreLeadCount,
      unconvertedQuoteCount: unconvertedQuotes.length,
      stageCount: stageRows.length,
      wonOpportunityCount,
      lostOpportunityCount,
      openPipelineValueCents,
      followUpDueCount,
      qualificationSamples,
    });
  }

  private async collectSignals(actor: SalesIntelligenceActor) {
    const [leadRows, opportunityRows, quoteRows, sourceRows, conversionRows, communicationRows] =
      await Promise.all([
        this.db
          .select({
            id: leads.id,
            title: leads.title,
            status: leads.status,
            urgency: leads.urgency,
            score: leads.score,
            customerId: leads.customerId,
            nextActionDueAt: leads.nextActionDueAt,
          })
          .from(leads)
          .where(eq(leads.companyId, actor.companyId)),
        this.db
          .select({
            id: salesOpportunities.id,
            title: salesOpportunities.title,
            status: salesOpportunities.status,
            estimatedValueCents: salesOpportunities.estimatedValueCents,
            currency: salesOpportunities.currency,
            customerId: salesOpportunities.customerId,
          })
          .from(salesOpportunities)
          .where(eq(salesOpportunities.companyId, actor.companyId)),
        this.db
          .select({
            id: quotes.id,
            title: quotes.title,
            status: quotes.status,
            amountCents: quotes.amountCents,
            totalCents: quotes.totalCents,
            currency: quotes.currency,
            customerId: quotes.customerId,
          })
          .from(quotes)
          .where(eq(quotes.companyId, actor.companyId)),
        this.db
          .select({ id: leadSources.id, name: leadSources.name, enabled: leadSources.enabled })
          .from(leadSources)
          .where(eq(leadSources.companyId, actor.companyId)),
        this.db
          .select({ id: leadConversions.id })
          .from(leadConversions)
          .where(eq(leadConversions.companyId, actor.companyId)),
        this.db
          .select({ id: communications.id })
          .from(communications)
          .where(eq(communications.companyId, actor.companyId)),
      ]);

    const currency = opportunityRows[0]?.currency ?? quoteRows[0]?.currency ?? 'ZAR';
    const now = Date.now();
    const openLeads = leadRows
      .filter((l) => OPEN_LEAD_STATUSES.includes(l.status as (typeof OPEN_LEAD_STATUSES)[number]))
      .map((l) => ({
        leadId: l.id,
        customerId: l.customerId,
        title: l.title,
        status: l.status,
        score: l.score,
        urgency: l.urgency,
        nextActionDueAt:
          l.nextActionDueAt != null && l.nextActionDueAt.getTime() <= now
            ? l.nextActionDueAt.toISOString()
            : null,
      }));

    const unconvertedQuotes = quoteRows
      .filter((q) =>
        UNCONVERTED_QUOTE_STATUSES.includes(q.status as (typeof UNCONVERTED_QUOTE_STATUSES)[number]),
      )
      .map((q) => ({
        quoteId: q.id,
        customerId: q.customerId,
        title: q.title,
        amountCents: q.totalCents || q.amountCents,
        status: q.status,
      }));

    const openOpportunities = opportunityRows
      .filter((o) => o.status === 'open')
      .map((o) => ({
        opportunityId: o.id,
        customerId: o.customerId,
        title: o.title,
        estimatedValueCents: o.estimatedValueCents,
        status: o.status,
      }));

    return {
      currency,
      openLeads,
      unconvertedQuotes,
      openOpportunities,
      leadSources: sourceRows.map((s) => ({
        sourceId: s.id,
        name: s.name,
        enabled: s.enabled,
      })),
      conversionCount: conversionRows.length,
      communicationCount: communicationRows.length,
      followUpDueCount: openLeads.filter((l) => l.nextActionDueAt != null).length,
    };
  }

  async getDashboard(actor: SalesIntelligenceActor): Promise<SalesIntelligenceAgentDashboard> {
    this.assertRead(actor);

    let registry = {
      commandCentreStatus: 'planned',
      note: 'Sales agent key exists in Command Centre / Agent Network catalogs. Call register to refresh tenant registry row.',
    };

    if (canWriteSalesIntelligenceAgent(actor)) {
      registry = await this.ensureAgentRegistered(actor);
    } else {
      const [existing] = await this.db
        .select()
        .from(auraCommandAgentRegistry)
        .where(
          and(
            eq(auraCommandAgentRegistry.companyId, actor.companyId),
            eq(auraCommandAgentRegistry.agentKey, 'sales'),
          ),
        )
        .limit(1);
      if (existing) {
        registry = {
          commandCentreStatus: existing.status,
          note: existing.notes ?? 'Sales agent present in Command Centre registry.',
        };
      }
    }

    const [businessContext, recommendations, insights, signals] = await Promise.all([
      this.getBusinessContext(actor),
      this.listRecommendations(actor),
      this.listInsights(actor),
      this.listSignals(actor),
    ]);

    const empty =
      businessContext.availability === 'unavailable' &&
      recommendations.length === 0 &&
      insights.length === 0 &&
      signals.length === 0;

    return {
      summary: empty
        ? 'No sales agent activity or TITAN leads/opportunities/quotes yet. Insights and recommendations stay unavailable until real CRM/sales data exists — nothing is invented, and no outreach is sent.'
        : `Sales Intelligence Agent loaded with ${businessContext.leadCount} lead(s), ${businessContext.openOpportunityCount} open opportunit(ies), ${businessContext.quoteCount} quote(s), ${recommendations.length} recommendation(s), ${insights.length} insight(s), ${signals.filter((s) => !s.dismissed).length} active signal(s). Outreach never auto-sends.`,
      identity: getSalesIntelligenceAgentIdentity(),
      productClarification: { ...SALES_INTELLIGENCE_AGENT_PRODUCT_COPY },
      policy: {
        autoExecuteEnabled: false,
        autoOutreachEnabled: false,
        requiresOwnerApproval: true,
        technicianClientDenied: true,
        fakeDataInvented: false,
        spamProhibited: true,
      },
      registry,
      businessContext,
      recommendations,
      insights,
      signals,
      auraConnections: listSalesIntelligenceAuraConnections(),
    };
  }

  async askQuestion(
    actor: SalesIntelligenceActor,
    input: AskSalesIntelligenceQuestionRequest,
  ): Promise<SalesIntelligenceQuestionAnswer> {
    this.assertRead(actor);
    const context = await this.getBusinessContext(actor);
    const answer = answerSalesIntelligenceQuestion({
      question: input.question,
      context,
    });
    await this.recordAudit(actor, 'sia_question_answered', actor.companyId, {
      availability: answer.availability,
      groundedIn: answer.groundedIn,
      autoExecuted: false,
      outreachSent: false,
    });
    return answer;
  }

  async listRecommendations(
    actor: SalesIntelligenceActor,
  ): Promise<SalesIntelligenceRecommendationSummary[]> {
    this.assertRead(actor);
    const rows = await this.db
      .select()
      .from(siaRecommendations)
      .where(eq(siaRecommendations.companyId, actor.companyId))
      .orderBy(desc(siaRecommendations.createdAt));
    return rows.map((r) => this.toRecommendation(r));
  }

  async createRecommendation(
    actor: SalesIntelligenceActor,
    input: CreateSalesIntelligenceRecommendationRequest,
  ): Promise<SalesIntelligenceRecommendationSummary> {
    this.assertWrite(actor);

    const [created] = await this.db
      .insert(siaRecommendations)
      .values({
        companyId: actor.companyId,
        kind: input.kind,
        status: 'pending_approval',
        title: input.title.trim(),
        recommendation: input.recommendation.trim(),
        draftOutreach: input.draftOutreach?.trim() || null,
        sourceLeadId: input.sourceLeadId ?? null,
        sourceOpportunityId: input.sourceOpportunityId ?? null,
        sourceQuoteId: input.sourceQuoteId ?? null,
        sourceCustomerId: input.sourceCustomerId ?? null,
        autoExecuted: false,
        outreachSent: false,
        createdByUserId: actor.userId,
        metadata: {
          source: 'sales_intelligence_agent',
          autoExecuted: false,
          outreachSent: false,
          spamProhibited: true,
        },
      })
      .returning();

    await this.recordAudit(actor, 'sia_recommendation_created', created!.id, {
      kind: input.kind,
      autoExecuted: false,
      outreachSent: false,
    });

    return this.toRecommendation(created!);
  }

  async generateRecommendationsFromSignals(
    actor: SalesIntelligenceActor,
  ): Promise<SalesIntelligenceRecommendationSummary[]> {
    this.assertWrite(actor);
    const signals = await this.collectSignals(actor);
    const drafts = buildSalesIntelligenceRecommendationDraftsFromSignals(signals);

    if (drafts.length === 0) {
      await this.recordAudit(actor, 'sia_recommendations_generate_empty', actor.companyId, {
        reason: 'No grounded signals for draft recommendations',
        leadCount: signals.openLeads.length,
        quoteCount: signals.unconvertedQuotes.length,
      });
      return [];
    }

    const created: SalesIntelligenceRecommendationSummary[] = [];
    for (const draft of drafts) {
      created.push(await this.createRecommendation(actor, draft));
    }

    await this.recordAudit(actor, 'sia_recommendations_generated', actor.companyId, {
      count: created.length,
      autoExecuted: false,
      outreachSent: false,
    });

    return created;
  }

  async decideRecommendation(
    actor: SalesIntelligenceActor,
    recommendationId: string,
    input: DecideSalesIntelligenceRecommendationRequest,
  ): Promise<SalesIntelligenceRecommendationSummary> {
    this.assertApprove(actor);

    const [row] = await this.db
      .select()
      .from(siaRecommendations)
      .where(
        and(
          eq(siaRecommendations.id, recommendationId),
          eq(siaRecommendations.companyId, actor.companyId),
        ),
      )
      .limit(1);

    if (!row) {
      throw new SalesIntelligenceAgentError('NOT_FOUND', 'Recommendation not found');
    }
    if (row.status !== 'pending_approval') {
      throw new SalesIntelligenceAgentError('INVALID_STATE', 'Recommendation is not pending approval');
    }

    const status = input.decision === 'approve' ? 'approved' : 'rejected';
    const [updated] = await this.db
      .update(siaRecommendations)
      .set({
        status,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: input.notes ?? null,
        autoExecuted: false,
        outreachSent: false,
        updatedAt: new Date(),
      })
      .where(eq(siaRecommendations.id, row.id))
      .returning();

    await this.recordAudit(
      actor,
      input.decision === 'approve'
        ? 'sia_recommendation_approved'
        : 'sia_recommendation_rejected',
      row.id,
      {
        autoExecuted: false,
        outreachSent: false,
        note:
          input.decision === 'approve'
            ? 'Owner approved draft recommendation only — no outreach message was sent and no CRM mutation was executed.'
            : 'Owner rejected recommendation — no outreach was sent.',
      },
    );

    return this.toRecommendation(updated!);
  }

  async listInsights(actor: SalesIntelligenceActor): Promise<SalesIntelligenceInsightSummary[]> {
    this.assertRead(actor);
    const rows = await this.db
      .select()
      .from(siaInsights)
      .where(eq(siaInsights.companyId, actor.companyId))
      .orderBy(desc(siaInsights.createdAt));
    return rows.map((r) => this.toInsight(r));
  }

  async refreshInsights(actor: SalesIntelligenceActor): Promise<SalesIntelligenceInsightSummary[]> {
    this.assertWrite(actor);
    const context = await this.getBusinessContext(actor);
    const bodies = buildSalesIntelligenceInsightBodies(context);

    const existing = await this.db
      .select({ id: siaInsights.id })
      .from(siaInsights)
      .where(eq(siaInsights.companyId, actor.companyId));
    if (existing.length > 0) {
      await this.db
        .delete(siaInsights)
        .where(
          and(
            eq(siaInsights.companyId, actor.companyId),
            inArray(
              siaInsights.id,
              existing.map((r) => r.id),
            ),
          ),
        );
    }

    const created: SalesIntelligenceInsightSummary[] = [];
    for (const body of bodies) {
      const [row] = await this.db
        .insert(siaInsights)
        .values({
          companyId: actor.companyId,
          kind: body.kind,
          title: body.title,
          body: body.body,
          metricLabel: body.metricLabel,
          metricValue: body.metricValue,
          metricValueCents: body.metricValueCents,
          currency: body.currency,
          sourceLeadCount: body.sourceLeadCount,
          sourceOpportunityCount: body.sourceOpportunityCount,
          sourceQuoteCount: body.sourceQuoteCount,
          createdByUserId: actor.userId,
          metadata: { source: 'sales_intelligence_agent', fakeDataInvented: false },
        })
        .returning();
      created.push(this.toInsight(row!));
    }

    await this.recordAudit(actor, 'sia_insights_refreshed', actor.companyId, {
      count: created.length,
      availability: context.availability,
    });

    return created;
  }

  async listSignals(actor: SalesIntelligenceActor): Promise<SalesIntelligenceSignalSummary[]> {
    this.assertRead(actor);
    const rows = await this.db
      .select()
      .from(siaOpportunitySignals)
      .where(eq(siaOpportunitySignals.companyId, actor.companyId))
      .orderBy(desc(siaOpportunitySignals.createdAt));
    return rows.map((r) => this.toSignal(r));
  }

  async refreshSignals(actor: SalesIntelligenceActor): Promise<SalesIntelligenceSignalSummary[]> {
    this.assertWrite(actor);
    const signals = await this.collectSignals(actor);
    const drafts = buildSalesIntelligenceSignalDraftsFromSignals(signals);

    const existing = await this.db
      .select({ id: siaOpportunitySignals.id })
      .from(siaOpportunitySignals)
      .where(
        and(
          eq(siaOpportunitySignals.companyId, actor.companyId),
          eq(siaOpportunitySignals.dismissed, false),
        ),
      );
    if (existing.length > 0) {
      await this.db
        .delete(siaOpportunitySignals)
        .where(
          and(
            eq(siaOpportunitySignals.companyId, actor.companyId),
            inArray(
              siaOpportunitySignals.id,
              existing.map((r) => r.id),
            ),
          ),
        );
    }

    if (drafts.length === 0) {
      await this.recordAudit(actor, 'sia_signals_refresh_empty', actor.companyId, {
        reason: 'No grounded lead/quote/opportunity signals',
      });
      return this.listSignals(actor);
    }

    const created: SalesIntelligenceSignalSummary[] = [];
    for (const draft of drafts) {
      const [row] = await this.db
        .insert(siaOpportunitySignals)
        .values({
          companyId: actor.companyId,
          kind: draft.kind,
          title: draft.title,
          detail: draft.detail,
          priority: draft.priority,
          sourceLeadId: draft.sourceLeadId,
          sourceOpportunityId: draft.sourceOpportunityId,
          sourceQuoteId: draft.sourceQuoteId,
          sourceCustomerId: draft.sourceCustomerId,
          sourceLeadSourceId: draft.sourceLeadSourceId,
          estimatedValueCents: draft.estimatedValueCents,
          currency: draft.currency,
          dismissed: false,
          createdByUserId: actor.userId,
          metadata: { source: 'sales_intelligence_agent', fakeDataInvented: false },
        })
        .returning();
      created.push(this.toSignal(row!));
    }

    await this.recordAudit(actor, 'sia_signals_refreshed', actor.companyId, {
      count: created.length,
      autoExecuted: false,
    });

    return created;
  }
}
