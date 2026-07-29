import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { emitBusinessEvent } from '../lib/automation-events.js';
import type {
  AcquisitionInsight,
  CreateLeadActivityRequest,
  CreateLeadRequest,
  CreateLeadSourceRequest,
  LeadActivitySummary,
  LeadAuraContext,
  LeadPipelineMetrics,
  LeadRecommendationSummary,
  LeadScoreSummary,
  LeadScoringResult,
  LeadSourceSummary,
  LeadStats,
  LeadStatus,
  LeadSummary,
  SalesHandoffPreview,
  UpdateLeadRecommendationRequest,
  UpdateLeadRequest,
  UpdateLeadSourceRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  communications,
  customerActivities,
  customers,
  jobs,
  leadActivities,
  leadRecommendations,
  leadScores,
  leadSources,
  leads,
  payments,
  quotes,
} from '@titan/db';

export class LeadsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'LeadsError';
  }
}

type TenantScope = {
  companyId: string;
  userId: string;
};


export class LeadsService {
  constructor(private readonly db: DatabaseClient) {}

  async getStats(companyId: string): Promise<LeadStats> {
    const [leadRows, sources, recommendations, crmLeads] = await Promise.all([
      this.db.query.leads.findMany({ where: eq(leads.companyId, companyId) }),
      this.db.query.leadSources.findMany({ where: eq(leadSources.companyId, companyId) }),
      this.db.query.leadRecommendations.findMany({
        where: and(eq(leadRecommendations.companyId, companyId), eq(leadRecommendations.status, 'pending')),
      }),
      this.db.query.customers.findMany({
        where: and(eq(customers.companyId, companyId), eq(customers.status, 'lead')),
      }),
    ]);

    const active = leadRows.filter((row) => !['converted', 'lost'].includes(row.status));

    return {
      totalLeadCount: leadRows.length,
      activeLeadCount: active.length,
      qualifiedLeadCount: leadRows.filter((row) =>
        ['qualified', 'contacted', 'opportunity'].includes(row.status),
      ).length,
      convertedLeadCount: leadRows.filter((row) => row.status === 'converted').length,
      sourceCount: sources.length,
      pendingRecommendationCount: recommendations.length,
      crmLeadCustomerCount: crmLeads.length,
    };
  }

  async listSources(companyId: string): Promise<LeadSourceSummary[]> {
    const rows = await this.db.query.leadSources.findMany({
      where: eq(leadSources.companyId, companyId),
      orderBy: [leadSources.name],
    });

    return Promise.all(
      rows.map(async (row) => {
        const [countRow] = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(leads)
          .where(and(eq(leads.companyId, companyId), eq(leads.sourceId, row.id)));

        return toSourceSummary(row, countRow?.count ?? 0);
      }),
    );
  }

  async createSource(scope: TenantScope, input: CreateLeadSourceRequest): Promise<LeadSourceSummary> {
    const sourceKey = input.sourceKey.trim();
    const name = input.name.trim();

    if (!sourceKey || !name) {
      throw new LeadsError('VALIDATION_ERROR', 'Source key and name are required');
    }

    const [created] = await this.db
      .insert(leadSources)
      .values({
        companyId: scope.companyId,
        sourceKey,
        name,
        description: input.description?.trim() || null,
        enabled: input.enabled ?? true,
      })
      .returning();

    if (!created) {
      throw new LeadsError('CREATE_FAILED', 'Unable to create lead source');
    }

    return toSourceSummary(created, 0);
  }

  async updateSource(
    companyId: string,
    sourceId: string,
    input: UpdateLeadSourceRequest,
  ): Promise<LeadSourceSummary> {
    const existing = await this.db.query.leadSources.findFirst({
      where: and(eq(leadSources.id, sourceId), eq(leadSources.companyId, companyId)),
    });

    if (!existing) {
      throw new LeadsError('NOT_FOUND', 'Lead source not found');
    }

    const [updated] = await this.db
      .update(leadSources)
      .set({
        sourceKey: input.sourceKey?.trim() || existing.sourceKey,
        name: input.name?.trim() || existing.name,
        description: input.description !== undefined ? input.description?.trim() || null : existing.description,
        enabled: input.enabled ?? existing.enabled,
        updatedAt: new Date(),
      })
      .where(eq(leadSources.id, sourceId))
      .returning();

    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(leads)
      .where(and(eq(leads.companyId, companyId), eq(leads.sourceId, sourceId)));

    return toSourceSummary(updated!, countRow?.count ?? 0);
  }

  async listLeads(companyId: string): Promise<LeadSummary[]> {
    const rows = await this.db.query.leads.findMany({
      where: eq(leads.companyId, companyId),
      with: { customer: true, source: true },
      orderBy: [desc(leads.updatedAt)],
    });

    return rows.map(toLeadSummary);
  }

  async getLead(companyId: string, leadId: string): Promise<LeadSummary | null> {
    const row = await this.db.query.leads.findFirst({
      where: and(eq(leads.id, leadId), eq(leads.companyId, companyId)),
      with: { customer: true, source: true },
    });

    return row ? toLeadSummary(row) : null;
  }

  async createLead(scope: TenantScope, input: CreateLeadRequest): Promise<LeadSummary> {
    const title = input.title.trim();
    const contactName = input.contactName.trim();

    if (!title || !contactName) {
      throw new LeadsError('VALIDATION_ERROR', 'Lead title and contact name are required');
    }

    if (input.customerId) {
      await this.ensureCustomerBelongsToCompany(scope.companyId, input.customerId);
    }

    if (input.sourceId) {
      await this.ensureSourceBelongsToCompany(scope.companyId, input.sourceId);
    }

    const [created] = await this.db
      .insert(leads)
      .values({
        companyId: scope.companyId,
        customerId: input.customerId ?? null,
        sourceId: input.sourceId ?? null,
        status: input.status ?? 'new',
        title,
        contactName,
        contactEmail: input.contactEmail?.trim() || null,
        contactPhone: input.contactPhone?.trim() || null,
        assignedUserId: input.assignedUserId ?? null,
        notes: input.notes?.trim() || null,
        metadata: input.metadata ?? {},
        createdByUserId: scope.userId,
      })
      .returning();

    if (!created) {
      throw new LeadsError('CREATE_FAILED', 'Unable to create lead');
    }

    const scored = await this.scoreLead(scope.companyId, created.id);
    await this.db
      .update(leads)
      .set({ score: scored.score, updatedAt: new Date() })
      .where(eq(leads.id, created.id));

    emitBusinessEvent({
      companyId: scope.companyId,
      eventType: 'lead.created',
      entityType: 'lead',
      entityId: created.id,
      payload: { lead: { id: created.id, status: created.status, title: created.title } },
      actorUserId: scope.userId,
    });

    return (await this.getLead(scope.companyId, created.id))!;
  }

  async updateLead(companyId: string, leadId: string, input: UpdateLeadRequest): Promise<LeadSummary> {
    const existing = await this.getLead(companyId, leadId);
    if (!existing) {
      throw new LeadsError('NOT_FOUND', 'Lead not found');
    }

    if (input.customerId) {
      await this.ensureCustomerBelongsToCompany(companyId, input.customerId);
    }

    if (input.sourceId) {
      await this.ensureSourceBelongsToCompany(companyId, input.sourceId);
    }

    const nextStatus = input.status ?? existing.status;
    const convertedAt =
      nextStatus === 'converted' && existing.status !== 'converted' ? new Date() : undefined;
    const lostAt = nextStatus === 'lost' && existing.status !== 'lost' ? new Date() : undefined;

    await this.db
      .update(leads)
      .set({
        customerId: input.customerId !== undefined ? input.customerId : undefined,
        sourceId: input.sourceId !== undefined ? input.sourceId : undefined,
        status: input.status ?? undefined,
        title: input.title?.trim() || undefined,
        contactName: input.contactName?.trim() || undefined,
        contactEmail: input.contactEmail !== undefined ? input.contactEmail?.trim() || null : undefined,
        contactPhone: input.contactPhone !== undefined ? input.contactPhone?.trim() || null : undefined,
        assignedUserId: input.assignedUserId !== undefined ? input.assignedUserId : undefined,
        notes: input.notes !== undefined ? input.notes?.trim() || null : undefined,
        metadata: input.metadata ?? undefined,
        convertedAt: convertedAt !== undefined ? convertedAt : undefined,
        lostAt: lostAt !== undefined ? lostAt : undefined,
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId));

    if (nextStatus === 'converted' && existing.status !== 'converted') {
      emitBusinessEvent({
        companyId,
        eventType: 'lead.converted',
        entityType: 'lead',
        entityId: leadId,
        payload: { lead: { id: leadId, status: 'converted' } },
      });
    }

    return (await this.getLead(companyId, leadId))!;
  }

  async listActivities(companyId: string, leadId: string): Promise<LeadActivitySummary[]> {
    await this.ensureLeadBelongsToCompany(companyId, leadId);

    const rows = await this.db.query.leadActivities.findMany({
      where: and(eq(leadActivities.companyId, companyId), eq(leadActivities.leadId, leadId)),
      with: { author: true },
      orderBy: [desc(leadActivities.occurredAt)],
    });

    return rows.map(toActivitySummary);
  }

  async createActivity(
    scope: TenantScope,
    leadId: string,
    input: CreateLeadActivityRequest,
  ): Promise<LeadActivitySummary> {
    await this.ensureLeadBelongsToCompany(scope.companyId, leadId);

    const body = input.body.trim();
    if (!body) {
      throw new LeadsError('VALIDATION_ERROR', 'Activity body is required');
    }

    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      throw new LeadsError('VALIDATION_ERROR', 'Invalid occurred date');
    }

    const [created] = await this.db
      .insert(leadActivities)
      .values({
        companyId: scope.companyId,
        leadId,
        activityType: input.activityType ?? 'note',
        subject: input.subject?.trim() || null,
        body,
        authorUserId: scope.userId,
        occurredAt,
      })
      .returning();

    if (!created) {
      throw new LeadsError('CREATE_FAILED', 'Unable to create lead activity');
    }

    const row = await this.db.query.leadActivities.findFirst({
      where: eq(leadActivities.id, created.id),
      with: { author: true },
    });

    return toActivitySummary(row!);
  }

  async analyzeLeadScore(companyId: string, leadId: string): Promise<LeadScoringResult> {
    const lead = await this.db.query.leads.findFirst({
      where: and(eq(leads.id, leadId), eq(leads.companyId, companyId)),
    });

    if (!lead) {
      throw new LeadsError('NOT_FOUND', 'Lead not found');
    }

    const signals = await this.buildScoringSignals(companyId, lead);
    const score = computeScoreFromSignals(signals);

    return {
      leadId,
      score,
      signals,
      summary: `Lead scored ${score}/100 based on ${Object.keys(signals).length} real data signal(s).`,
    };
  }

  async scoreLead(companyId: string, leadId: string): Promise<LeadScoringResult> {
    const result = await this.analyzeLeadScore(companyId, leadId);

    await this.db.insert(leadScores).values({
      companyId,
      leadId: result.leadId,
      score: result.score,
      signals: result.signals,
    });

    await this.db
      .update(leads)
      .set({ score: result.score, updatedAt: new Date() })
      .where(eq(leads.id, leadId));

    return result;
  }

  async listScores(companyId: string, leadId: string): Promise<LeadScoreSummary[]> {
    await this.ensureLeadBelongsToCompany(companyId, leadId);

    const rows = await this.db.query.leadScores.findMany({
      where: and(eq(leadScores.companyId, companyId), eq(leadScores.leadId, leadId)),
      orderBy: [desc(leadScores.scoredAt)],
      limit: 20,
    });

    return rows.map(toScoreSummary);
  }

  async getPipelineMetrics(companyId: string): Promise<LeadPipelineMetrics> {
    const leadRows = await this.db.query.leads.findMany({
      where: eq(leads.companyId, companyId),
    });

    const statuses: LeadStatus[] = ['new', 'qualified', 'contacted', 'opportunity', 'converted', 'lost'];
    const stages = statuses.map((status) => {
      const stageLeads = leadRows.filter((row) => row.status === status);
      const averageScore =
        stageLeads.length > 0
          ? Math.round(stageLeads.reduce((sum, row) => sum + row.score, 0) / stageLeads.length)
          : 0;

      return { status, count: stageLeads.length, averageScore };
    });

    const converted = leadRows.filter((row) => row.status === 'converted').length;
    const lost = leadRows.filter((row) => row.status === 'lost').length;
    const closed = converted + lost;

    return {
      stages,
      totalActive: leadRows.filter((row) => !['converted', 'lost'].includes(row.status)).length,
      convertedCount: converted,
      lostCount: lost,
      conversionRatePercent: closed > 0 ? Math.round((converted / closed) * 100) : null,
    };
  }

  async getAcquisitionInsights(companyId: string): Promise<AcquisitionInsight[]> {
    const [leadRows, crmLeads, quoteRows, jobRows] = await Promise.all([
      this.listLeads(companyId),
      this.db.query.customers.findMany({
        where: and(eq(customers.companyId, companyId), eq(customers.status, 'lead')),
      }),
      this.db.query.quotes.findMany({ where: eq(quotes.companyId, companyId) }),
      this.db.query.jobs.findMany({ where: eq(jobs.companyId, companyId) }),
    ]);

    const insights: AcquisitionInsight[] = [];

    const highScoreLeads = leadRows
      .filter((row) => row.score >= 70 && !['converted', 'lost'].includes(row.status))
      .sort((a, b) => b.score - a.score);

    if (highScoreLeads.length > 0) {
      insights.push({
        insightType: 'high_potential_leads',
        title: 'High-potential leads need attention',
        description: `${highScoreLeads.length} lead(s) scored 70+ and may be ready for sales handoff.`,
        priority: 'high',
        context: { leadIds: highScoreLeads.slice(0, 10).map((row) => row.id) },
      });
    }

    if (crmLeads.length > 0) {
      insights.push({
        insightType: 'crm_lead_customers',
        title: 'CRM lead-status customers',
        description: `${crmLeads.length} CRM customer(s) have lead status and may need qualification.`,
        priority: 'medium',
        context: { customerIds: crmLeads.slice(0, 10).map((row) => row.id) },
      });
    }

    const sourceCounts = new Map<string, number>();
    for (const lead of leadRows) {
      if (!lead.sourceName) continue;
      sourceCounts.set(lead.sourceName, (sourceCounts.get(lead.sourceName) ?? 0) + 1);
    }

    const topSource = [...sourceCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topSource) {
      insights.push({
        insightType: 'lead_source',
        title: `Top lead source: ${topSource[0]}`,
        description: `${topSource[1]} lead(s) tracked from this source.`,
        priority: 'low',
        context: { sourceName: topSource[0], count: topSource[1] },
      });
    }

    const serviceDemand = new Map<string, number>();
    for (const job of jobRows) {
      const key = job.title.trim().toLowerCase().slice(0, 40);
      serviceDemand.set(key, (serviceDemand.get(key) ?? 0) + 1);
    }

    const topService = [...serviceDemand.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topService && topService[1] >= 2) {
      insights.push({
        insightType: 'service_demand',
        title: 'Service demand signal',
        description: `"${topService[0]}" appears in ${topService[1]} job(s) — potential acquisition focus.`,
        priority: 'medium',
        context: { serviceTitle: topService[0], jobCount: topService[1] },
      });
    }

    const openQuotes = quoteRows.filter((row) => ['draft', 'sent'].includes(row.status));
    if (openQuotes.length > 0) {
      insights.push({
        insightType: 'quote_interest',
        title: 'Open quotes indicate acquisition interest',
        description: `${openQuotes.length} open quote(s) may represent warm acquisition opportunities.`,
        priority: 'medium',
        context: { quoteCount: openQuotes.length },
      });
    }

    return insights.slice(0, 15);
  }

  async getSalesHandoffPreview(companyId: string, leadId: string): Promise<SalesHandoffPreview> {
    const lead = await this.getLead(companyId, leadId);
    if (!lead) {
      throw new LeadsError('NOT_FOUND', 'Lead not found');
    }

    if (['converted', 'lost'].includes(lead.status)) {
      throw new LeadsError('INVALID_STATUS', 'Lead is already closed');
    }

    return {
      leadId: lead.id,
      leadTitle: lead.title,
      contactName: lead.contactName,
      currentScore: lead.score,
      suggestedOpportunityTitle: `Opportunity — ${lead.title}`,
      suggestedOpportunityType: lead.score >= 70 ? 'high_value_customer' : 'follow_up',
      requiresApproval: true,
    };
  }

  async listRecommendations(companyId: string): Promise<LeadRecommendationSummary[]> {
    const rows = await this.db.query.leadRecommendations.findMany({
      where: and(
        eq(leadRecommendations.companyId, companyId),
        inArray(leadRecommendations.status, ['pending', 'accepted']),
      ),
      with: { lead: true },
      orderBy: [desc(leadRecommendations.updatedAt)],
      limit: 50,
    });

    return rows.map(toRecommendationSummary);
  }

  async generateRecommendations(companyId: string): Promise<LeadRecommendationSummary[]> {
    const [leadRows, insights] = await Promise.all([
      this.listLeads(companyId),
      this.getAcquisitionInsights(companyId),
    ]);

    const signals: Array<{
      leadId: string | null;
      recommendationType: LeadRecommendationSummary['recommendationType'];
      title: string;
      description: string;
      priority: string;
      context: Record<string, unknown>;
    }> = [];

    for (const lead of leadRows) {
      if (['converted', 'lost'].includes(lead.status)) continue;

      if (lead.score >= 70 && ['qualified', 'contacted', 'opportunity'].includes(lead.status)) {
        signals.push({
          leadId: lead.id,
          recommendationType: 'handoff',
          title: `Sales handoff — ${lead.title}`,
          description: `${lead.contactName} scored ${lead.score}/100. Recommend sales opportunity handoff for approval.`,
          priority: 'high',
          context: { score: lead.score, status: lead.status },
        });
      } else if (lead.status === 'new') {
        signals.push({
          leadId: lead.id,
          recommendationType: 'qualification',
          title: `Qualify lead — ${lead.title}`,
          description: `New lead ${lead.contactName} needs qualification and initial contact.`,
          priority: 'medium',
          context: { score: lead.score },
        });
      } else if (lead.status === 'contacted') {
        signals.push({
          leadId: lead.id,
          recommendationType: 'follow_up',
          title: `Follow up — ${lead.title}`,
          description: `${lead.contactName} was contacted. Schedule a follow-up task.`,
          priority: 'medium',
          context: { score: lead.score },
        });
      }
    }

    for (const insight of insights.slice(0, 5)) {
      signals.push({
        leadId: null,
        recommendationType:
          insight.insightType === 'high_potential_leads'
            ? 'conversion'
            : insight.insightType === 'crm_lead_customers'
              ? 'engagement'
              : 'retention',
        title: insight.title,
        description: insight.description,
        priority: insight.priority,
        context: insight.context,
      });
    }

    if (signals.length === 0) {
      return [];
    }

    const inserted = await this.db.insert(leadRecommendations).values(
      signals.map((signal) => ({
        companyId,
        leadId: signal.leadId,
        recommendationType: signal.recommendationType,
        title: signal.title,
        description: signal.description,
        priority: signal.priority,
        status: 'pending' as const,
        context: signal.context,
      })),
    ).returning();

    const rows = await this.db.query.leadRecommendations.findMany({
      where: inArray(
        leadRecommendations.id,
        inserted.map((row) => row.id),
      ),
      with: { lead: true },
    });

    return rows.map(toRecommendationSummary);
  }

  async updateRecommendation(
    companyId: string,
    recommendationId: string,
    input: UpdateLeadRecommendationRequest,
  ): Promise<LeadRecommendationSummary> {
    const existing = await this.db.query.leadRecommendations.findFirst({
      where: and(
        eq(leadRecommendations.id, recommendationId),
        eq(leadRecommendations.companyId, companyId),
      ),
    });

    if (!existing) {
      throw new LeadsError('NOT_FOUND', 'Lead recommendation not found');
    }

    await this.db
      .update(leadRecommendations)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(leadRecommendations.id, recommendationId));

    const row = await this.db.query.leadRecommendations.findFirst({
      where: eq(leadRecommendations.id, recommendationId),
      with: { lead: true },
    });

    return toRecommendationSummary(row!);
  }

  async buildAuraContext(companyId: string): Promise<LeadAuraContext> {
    const [stats, leadRows, insights] = await Promise.all([
      this.getStats(companyId),
      this.listLeads(companyId),
      this.getAcquisitionInsights(companyId),
    ]);

    const activeLeads = leadRows.filter((row) => !['converted', 'lost'].includes(row.status));
    const averageScore =
      activeLeads.length > 0
        ? Math.round(activeLeads.reduce((sum, row) => sum + row.score, 0) / activeLeads.length)
        : 0;

    return {
      activeLeadCount: stats.activeLeadCount,
      qualifiedLeadCount: stats.qualifiedLeadCount,
      pendingRecommendationCount: stats.pendingRecommendationCount,
      averageScore,
      topLeads: [...activeLeads]
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((row) => ({
          id: row.id,
          title: row.title,
          contactName: row.contactName,
          status: row.status,
          score: row.score,
        })),
      acquisitionInsights: insights.slice(0, 8),
      summary: `${stats.activeLeadCount} active lead(s), ${stats.crmLeadCustomerCount} CRM lead customer(s), average score ${averageScore}.`,
    };
  }

  private async buildScoringSignals(
    companyId: string,
    lead: typeof leads.$inferSelect,
  ): Promise<Record<string, unknown>> {
    const signals: Record<string, unknown> = {
      status: lead.status,
      hasEmail: Boolean(lead.contactEmail),
      hasPhone: Boolean(lead.contactPhone),
    };

    const [activityCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(leadActivities)
      .where(eq(leadActivities.leadId, lead.id));

    signals.activityCount = activityCountRow?.count ?? 0;

    if (!lead.customerId) {
      return signals;
    }

    const [customer, jobRows, quoteRows, communicationRows, activityRows, paymentRows] = await Promise.all([
      this.db.query.customers.findFirst({
        where: and(eq(customers.id, lead.customerId), eq(customers.companyId, companyId)),
      }),
      this.db.query.jobs.findMany({
        where: and(eq(jobs.companyId, companyId), eq(jobs.customerId, lead.customerId)),
      }),
      this.db.query.quotes.findMany({
        where: and(eq(quotes.companyId, companyId), eq(quotes.customerId, lead.customerId)),
      }),
      this.db.query.communications.findMany({
        where: and(eq(communications.companyId, companyId), eq(communications.customerId, lead.customerId)),
      }),
      this.db.query.customerActivities.findMany({
        where: and(eq(customerActivities.companyId, companyId), eq(customerActivities.customerId, lead.customerId)),
      }),
      this.db.query.payments.findMany({
        where: eq(payments.companyId, companyId),
        with: { invoice: true },
      }),
    ]);

    if (customer) {
      signals.customerStatus = customer.status;
      signals.customerAgeDays = Math.floor(
        (Date.now() - customer.createdAt.getTime()) / (24 * 60 * 60 * 1000),
      );
    }

    signals.completedJobCount = jobRows.filter((row) => row.status === 'completed').length;
    signals.openQuoteCount = quoteRows.filter((row) => ['draft', 'sent'].includes(row.status)).length;
    signals.communicationCount = communicationRows.length;
    signals.crmActivityCount = activityRows.length;

    const revenueCents = paymentRows
      .filter((row) => row.invoice?.customerId === lead.customerId)
      .reduce((sum, row) => sum + row.amountCents, 0);
    signals.revenueCents = revenueCents;

    const lastContactDates = [
      ...communicationRows.map((row) => row.occurredAt),
      ...activityRows.map((row) => row.createdAt),
    ];
    if (lastContactDates.length > 0) {
      signals.daysSinceLastContact = Math.floor(
        (Date.now() - Math.max(...lastContactDates.map((date) => date.getTime()))) / (24 * 60 * 60 * 1000),
      );
    }

    return signals;
  }

  private async ensureCustomerBelongsToCompany(companyId: string, customerId: string): Promise<void> {
    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.companyId, companyId)),
    });

    if (!customer) {
      throw new LeadsError('NOT_FOUND', 'Customer not found');
    }
  }

  private async ensureSourceBelongsToCompany(companyId: string, sourceId: string): Promise<void> {
    const source = await this.db.query.leadSources.findFirst({
      where: and(eq(leadSources.id, sourceId), eq(leadSources.companyId, companyId)),
    });

    if (!source) {
      throw new LeadsError('NOT_FOUND', 'Lead source not found');
    }
  }

  private async ensureLeadBelongsToCompany(companyId: string, leadId: string): Promise<void> {
    const lead = await this.getLead(companyId, leadId);
    if (!lead) {
      throw new LeadsError('NOT_FOUND', 'Lead not found');
    }
  }
}

function computeScoreFromSignals(signals: Record<string, unknown>): number {
  let score = 10;

  if (signals.hasEmail) score += 10;
  if (signals.hasPhone) score += 10;

  const status = String(signals.status ?? 'new');
  if (status === 'qualified') score += 15;
  if (status === 'contacted') score += 10;
  if (status === 'opportunity') score += 20;

  score += Math.min(Number(signals.activityCount ?? 0) * 5, 15);
  score += Math.min(Number(signals.completedJobCount ?? 0) * 8, 20);
  score += Math.min(Number(signals.openQuoteCount ?? 0) * 10, 20);
  score += Math.min(Number(signals.communicationCount ?? 0) * 3, 12);
  score += Math.min(Number(signals.crmActivityCount ?? 0) * 3, 12);

  const revenueCents = Number(signals.revenueCents ?? 0);
  if (revenueCents > 0) score += 10;
  if (revenueCents > 100_000) score += 10;

  const daysSince = signals.daysSinceLastContact;
  if (typeof daysSince === 'number' && daysSince <= 30) score += 8;

  if (signals.customerStatus === 'lead') score += 5;

  return Math.max(0, Math.min(100, score));
}

function toSourceSummary(
  row: typeof leadSources.$inferSelect,
  leadCount: number,
): LeadSourceSummary {
  return {
    id: row.id,
    sourceKey: row.sourceKey,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    leadCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toLeadSummary(
  row: typeof leads.$inferSelect & {
    customer?: typeof customers.$inferSelect | null;
    source?: typeof leadSources.$inferSelect | null;
  },
): LeadSummary {
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customer?.name ?? null,
    sourceId: row.sourceId,
    sourceName: row.source?.name ?? null,
    status: row.status,
    title: row.title,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    score: row.score,
    assignedUserId: row.assignedUserId,
    notes: row.notes,
    convertedAt: row.convertedAt?.toISOString() ?? null,
    lostAt: row.lostAt?.toISOString() ?? null,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toActivitySummary(
  row: typeof leadActivities.$inferSelect & {
    author?: { firstName: string; lastName: string } | null;
  },
): LeadActivitySummary {
  return {
    id: row.id,
    leadId: row.leadId,
    activityType: row.activityType,
    subject: row.subject,
    body: row.body,
    authorUserId: row.authorUserId,
    authorName: row.author ? `${row.author.firstName} ${row.author.lastName}`.trim() : null,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function toScoreSummary(row: typeof leadScores.$inferSelect): LeadScoreSummary {
  return {
    id: row.id,
    leadId: row.leadId,
    score: row.score,
    signals: row.signals ?? {},
    scoredAt: row.scoredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function toRecommendationSummary(
  row: typeof leadRecommendations.$inferSelect & {
    lead?: typeof leads.$inferSelect | null;
  },
): LeadRecommendationSummary {
  return {
    id: row.id,
    leadId: row.leadId,
    leadTitle: row.lead?.title ?? null,
    recommendationType: row.recommendationType,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    context: row.context ?? {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
