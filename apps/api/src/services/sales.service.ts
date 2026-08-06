import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type {
  CreateSalesActivityRequest,
  CreateSalesOpportunityRequest,
  CreateSalesPipelineStageRequest,
  DetectedSalesOpportunity,
  SalesActivitySummary,
  SalesAuraContext,
  SalesOpportunitySummary,
  SalesPipelineMetrics,
  SalesPipelineStageSummary,
  SalesQuoteAssistanceContext,
  SalesRecommendationSummary,
  SalesStats,
  UpdateSalesOpportunityRequest,
  UpdateSalesPipelineStageRequest,
  UpdateSalesRecommendationRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  communications,
  customerActivities,
  customers,
  jobs,
  payments,
  quotes,
  salesActivities,
  salesOpportunities,
  salesPipelineStages,
  salesRecommendations,
} from '@titan/db';

export class SalesError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SalesError';
  }
}

type TenantScope = {
  companyId: string;
  userId: string;
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

export class SalesService {
  constructor(private readonly db: DatabaseClient) {}

  async getStats(companyId: string): Promise<SalesStats> {
    const [opportunities, stages, activities, recommendations, quoteRows] = await Promise.all([
      this.db.query.salesOpportunities.findMany({
        where: eq(salesOpportunities.companyId, companyId),
      }),
      this.db.query.salesPipelineStages.findMany({
        where: eq(salesPipelineStages.companyId, companyId),
      }),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(salesActivities)
        .where(eq(salesActivities.companyId, companyId)),
      this.db.query.salesRecommendations.findMany({
        where: and(
          eq(salesRecommendations.companyId, companyId),
          eq(salesRecommendations.status, 'pending'),
        ),
      }),
      this.db.query.quotes.findMany({
        where: eq(quotes.companyId, companyId),
      }),
    ]);

    const open = opportunities.filter((row) => row.status === 'open');
    const won = opportunities.filter((row) => row.status === 'won');
    const quotesSent = quoteRows.filter(
      (row) => row.status === 'sent' || row.status === 'accepted',
    ).length;
    const quotesAccepted = quoteRows.filter((row) => row.status === 'accepted').length;

    return {
      openOpportunityCount: open.length,
      wonOpportunityCount: won.length,
      pipelineValueCents: open.reduce((sum, row) => sum + (row.estimatedValueCents ?? 0), 0),
      stageCount: stages.length,
      activityCount: activities[0]?.count ?? 0,
      pendingRecommendationCount: recommendations.length,
      quoteConversionRatePercent:
        quotesSent > 0 ? Math.round((quotesAccepted / quotesSent) * 100) : null,
    };
  }

  async listPipelineStages(companyId: string): Promise<SalesPipelineStageSummary[]> {
    const rows = await this.db.query.salesPipelineStages.findMany({
      where: eq(salesPipelineStages.companyId, companyId),
      orderBy: [asc(salesPipelineStages.sortOrder), asc(salesPipelineStages.name)],
    });

    return Promise.all(
      rows.map(async (row) => {
        const [countRow] = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(salesOpportunities)
          .where(
            and(
              eq(salesOpportunities.companyId, companyId),
              eq(salesOpportunities.stageId, row.id),
              eq(salesOpportunities.status, 'open'),
            ),
          );

        return toStageSummary(row, countRow?.count ?? 0);
      }),
    );
  }

  async createPipelineStage(
    companyId: string,
    input: CreateSalesPipelineStageRequest,
  ): Promise<SalesPipelineStageSummary> {
    const stageKey = input.stageKey.trim();
    const name = input.name.trim();

    if (!stageKey || !name) {
      throw new SalesError('VALIDATION_ERROR', 'Stage key and name are required');
    }

    const [created] = await this.db
      .insert(salesPipelineStages)
      .values({
        companyId,
        stageKey,
        name,
        sortOrder: input.sortOrder ?? 0,
        probabilityPercent: input.probabilityPercent ?? 0,
        isClosedWon: input.isClosedWon ?? false,
        isClosedLost: input.isClosedLost ?? false,
      })
      .returning();

    if (!created) {
      throw new SalesError('CREATE_FAILED', 'Unable to create pipeline stage');
    }

    return toStageSummary(created, 0);
  }

  async updatePipelineStage(
    companyId: string,
    stageId: string,
    input: UpdateSalesPipelineStageRequest,
  ): Promise<SalesPipelineStageSummary> {
    const existing = await this.db.query.salesPipelineStages.findFirst({
      where: and(eq(salesPipelineStages.id, stageId), eq(salesPipelineStages.companyId, companyId)),
    });

    if (!existing) {
      throw new SalesError('NOT_FOUND', 'Pipeline stage not found');
    }

    await this.db
      .update(salesPipelineStages)
      .set({
        stageKey: input.stageKey?.trim() || existing.stageKey,
        name: input.name?.trim() || existing.name,
        sortOrder: input.sortOrder ?? existing.sortOrder,
        probabilityPercent: input.probabilityPercent ?? existing.probabilityPercent,
        isClosedWon: input.isClosedWon ?? existing.isClosedWon,
        isClosedLost: input.isClosedLost ?? existing.isClosedLost,
        updatedAt: new Date(),
      })
      .where(eq(salesPipelineStages.id, stageId));

    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(salesOpportunities)
      .where(
        and(
          eq(salesOpportunities.companyId, companyId),
          eq(salesOpportunities.stageId, stageId),
          eq(salesOpportunities.status, 'open'),
        ),
      );

    const updated = await this.db.query.salesPipelineStages.findFirst({
      where: eq(salesPipelineStages.id, stageId),
    });

    return toStageSummary(updated!, countRow?.count ?? 0);
  }

  async listOpportunities(companyId: string): Promise<SalesOpportunitySummary[]> {
    const rows = await this.db.query.salesOpportunities.findMany({
      where: eq(salesOpportunities.companyId, companyId),
      with: { customer: true, stage: true },
      orderBy: [desc(salesOpportunities.updatedAt)],
    });

    return rows.map(toOpportunitySummary);
  }

  async getOpportunity(
    companyId: string,
    opportunityId: string,
  ): Promise<SalesOpportunitySummary | null> {
    const row = await this.db.query.salesOpportunities.findFirst({
      where: and(
        eq(salesOpportunities.id, opportunityId),
        eq(salesOpportunities.companyId, companyId),
      ),
      with: { customer: true, stage: true },
    });

    return row ? toOpportunitySummary(row) : null;
  }

  async createOpportunity(
    scope: TenantScope,
    input: CreateSalesOpportunityRequest,
  ): Promise<SalesOpportunitySummary> {
    const title = input.title.trim();
    if (!title) {
      throw new SalesError('VALIDATION_ERROR', 'Opportunity title is required');
    }

    await this.ensureCustomerBelongsToCompany(scope.companyId, input.customerId);

    if (input.stageId) {
      await this.ensureStageBelongsToCompany(scope.companyId, input.stageId);
    }

    if (input.quoteId) {
      await this.ensureQuoteBelongsToCompany(scope.companyId, input.quoteId);
    }

    if (input.jobId) {
      await this.ensureJobBelongsToCompany(scope.companyId, input.jobId);
    }

    const [created] = await this.db
      .insert(salesOpportunities)
      .values({
        companyId: scope.companyId,
        customerId: input.customerId,
        stageId: input.stageId ?? null,
        opportunityType: input.opportunityType ?? 'custom',
        source: input.source ?? 'manual',
        title,
        description: input.description?.trim() || null,
        estimatedValueCents: input.estimatedValueCents ?? null,
        currency: input.currency?.trim() || 'USD',
        quoteId: input.quoteId ?? null,
        jobId: input.jobId ?? null,
        assignedUserId: input.assignedUserId ?? null,
        detectedReason: input.detectedReason ?? {},
        createdByUserId: scope.userId,
      })
      .returning();

    if (!created) {
      throw new SalesError('CREATE_FAILED', 'Unable to create opportunity');
    }

    return (await this.getOpportunity(scope.companyId, created.id))!;
  }

  async updateOpportunity(
    companyId: string,
    opportunityId: string,
    input: UpdateSalesOpportunityRequest,
  ): Promise<SalesOpportunitySummary> {
    const existing = await this.getOpportunity(companyId, opportunityId);
    if (!existing) {
      throw new SalesError('NOT_FOUND', 'Opportunity not found');
    }

    if (input.stageId) {
      await this.ensureStageBelongsToCompany(companyId, input.stageId);
    }

    const closedAt =
      input.status === 'won' || input.status === 'lost'
        ? new Date()
        : input.status === 'open'
          ? null
          : undefined;

    await this.db
      .update(salesOpportunities)
      .set({
        stageId: input.stageId !== undefined ? input.stageId : undefined,
        status: input.status ?? undefined,
        title: input.title?.trim() || undefined,
        description:
          input.description !== undefined ? input.description?.trim() || null : undefined,
        estimatedValueCents:
          input.estimatedValueCents !== undefined ? input.estimatedValueCents : undefined,
        assignedUserId: input.assignedUserId !== undefined ? input.assignedUserId : undefined,
        closedAt: closedAt !== undefined ? closedAt : undefined,
        updatedAt: new Date(),
      })
      .where(eq(salesOpportunities.id, opportunityId));

    return (await this.getOpportunity(companyId, opportunityId))!;
  }

  async listActivities(companyId: string, opportunityId?: string): Promise<SalesActivitySummary[]> {
    const rows = await this.db.query.salesActivities.findMany({
      where: opportunityId
        ? and(
            eq(salesActivities.companyId, companyId),
            eq(salesActivities.opportunityId, opportunityId),
          )
        : eq(salesActivities.companyId, companyId),
      with: { customer: true, author: true },
      orderBy: [desc(salesActivities.occurredAt)],
      limit: 100,
    });

    return rows.map(toActivitySummary);
  }

  async createActivity(
    scope: TenantScope,
    input: CreateSalesActivityRequest,
  ): Promise<SalesActivitySummary> {
    const body = input.body.trim();
    if (!body) {
      throw new SalesError('VALIDATION_ERROR', 'Activity body is required');
    }

    await this.ensureCustomerBelongsToCompany(scope.companyId, input.customerId);

    if (input.opportunityId) {
      const opportunity = await this.getOpportunity(scope.companyId, input.opportunityId);
      if (!opportunity) {
        throw new SalesError('NOT_FOUND', 'Opportunity not found');
      }
    }

    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      throw new SalesError('VALIDATION_ERROR', 'Invalid occurred date');
    }

    const [created] = await this.db
      .insert(salesActivities)
      .values({
        companyId: scope.companyId,
        customerId: input.customerId,
        opportunityId: input.opportunityId ?? null,
        activityType: input.activityType ?? 'note',
        subject: input.subject?.trim() || null,
        body,
        authorUserId: scope.userId,
        occurredAt,
      })
      .returning();

    if (!created) {
      throw new SalesError('CREATE_FAILED', 'Unable to create sales activity');
    }

    const row = await this.db.query.salesActivities.findFirst({
      where: eq(salesActivities.id, created.id),
      with: { customer: true, author: true },
    });

    return toActivitySummary(row!);
  }

  async detectOpportunities(companyId: string): Promise<DetectedSalesOpportunity[]> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - THIRTY_DAYS_MS);
    const sixtyDaysAgo = new Date(now.getTime() - SIXTY_DAYS_MS);

    const [customerRows, jobRows, quoteRows, paymentRows, communicationRows, activityRows] =
      await Promise.all([
        this.db.query.customers.findMany({
          where: eq(customers.companyId, companyId),
        }),
        this.db.query.jobs.findMany({
          where: eq(jobs.companyId, companyId),
          with: { customer: true },
        }),
        this.db.query.quotes.findMany({
          where: eq(quotes.companyId, companyId),
          with: { customer: true },
        }),
        this.db.query.payments.findMany({
          where: eq(payments.companyId, companyId),
          with: { invoice: { with: { customer: true } } },
        }),
        this.db.query.communications.findMany({
          where: eq(communications.companyId, companyId),
          orderBy: [desc(communications.occurredAt)],
        }),
        this.db.query.customerActivities.findMany({
          where: eq(customerActivities.companyId, companyId),
          orderBy: [desc(customerActivities.createdAt)],
        }),
      ]);

    const detected: DetectedSalesOpportunity[] = [];
    const currency = quoteRows[0]?.currency ?? paymentRows[0]?.currency ?? 'USD';

    const revenueByCustomer = new Map<string, number>();
    for (const payment of paymentRows) {
      const customerId = payment.invoice?.customerId;
      if (!customerId) continue;
      revenueByCustomer.set(
        customerId,
        (revenueByCustomer.get(customerId) ?? 0) + payment.amountCents,
      );
    }

    const completedJobsByCustomer = new Map<string, number>();
    for (const job of jobRows) {
      if (job.status !== 'completed') continue;
      completedJobsByCustomer.set(
        job.customerId,
        (completedJobsByCustomer.get(job.customerId) ?? 0) + 1,
      );
    }

    for (const [customerId, count] of completedJobsByCustomer) {
      if (count < 2) continue;
      const customer = customerRows.find((row) => row.id === customerId);
      if (!customer) continue;

      detected.push({
        opportunityType: 'recurring_service',
        customerId,
        customerName: customer.name,
        title: `Recurring service opportunity — ${customer.name}`,
        description: `${customer.name} has ${count} completed jobs. Consider a maintenance contract or recurring service plan.`,
        estimatedValueCents: null,
        currency,
        quoteId: null,
        jobId: null,
        priority: 'medium',
        reason: { completedJobCount: count },
      });
    }

    for (const quote of quoteRows) {
      if (!['sent', 'draft'].includes(quote.status)) continue;
      if (quote.updatedAt > thirtyDaysAgo) continue;
      if (!quote.customer) continue;

      detected.push({
        opportunityType: 'unconverted_quote',
        customerId: quote.customerId,
        customerName: quote.customer.name,
        title: `Unconverted quote — ${quote.quoteNumber}`,
        description: `Quote ${quote.quoteNumber} (${quote.status}) has not converted. Follow up with ${quote.customer.name}.`,
        estimatedValueCents: quote.amountCents,
        currency: quote.currency,
        quoteId: quote.id,
        jobId: quote.jobId,
        priority: quote.status === 'sent' ? 'high' : 'medium',
        reason: {
          quoteNumber: quote.quoteNumber,
          quoteStatus: quote.status,
          daysSinceUpdate: Math.floor(
            (now.getTime() - quote.updatedAt.getTime()) / (24 * 60 * 60 * 1000),
          ),
        },
      });
    }

    for (const job of jobRows) {
      if (!['new', 'scheduled', 'in_progress'].includes(job.status)) continue;
      if (!job.customer) continue;

      detected.push({
        opportunityType: 'incomplete_work',
        customerId: job.customerId,
        customerName: job.customer.name,
        title: `Incomplete work — ${job.title}`,
        description: `Job "${job.title}" is ${job.status.replace('_', ' ')}. Upsell or complete additional scope with ${job.customer.name}.`,
        estimatedValueCents: null,
        currency,
        quoteId: null,
        jobId: job.id,
        priority: job.status === 'in_progress' ? 'high' : 'medium',
        reason: { jobStatus: job.status },
      });
    }

    const revenueThreshold = [...revenueByCustomer.values()].sort((a, b) => b - a)[2] ?? 0;
    for (const [customerId, revenueCents] of revenueByCustomer) {
      if (revenueThreshold <= 0 || revenueCents < revenueThreshold) continue;
      const customer = customerRows.find((row) => row.id === customerId);
      if (!customer) continue;

      detected.push({
        opportunityType: 'high_value_customer',
        customerId,
        customerName: customer.name,
        title: `High value customer — ${customer.name}`,
        description: `${customer.name} has generated significant revenue. Prioritize relationship and upsell opportunities.`,
        estimatedValueCents: revenueCents,
        currency,
        quoteId: null,
        jobId: null,
        priority: 'high',
        reason: { lifetimeRevenueCents: revenueCents },
      });
    }

    const lastContactByCustomer = new Map<string, Date>();
    for (const row of [...communicationRows, ...activityRows]) {
      const customerId = 'customerId' in row ? row.customerId : null;
      if (!customerId) continue;
      const occurredAt = 'occurredAt' in row ? row.occurredAt : row.createdAt;
      const existing = lastContactByCustomer.get(customerId);
      if (!existing || occurredAt > existing) {
        lastContactByCustomer.set(customerId, occurredAt);
      }
    }

    for (const customer of customerRows) {
      const lastContact = lastContactByCustomer.get(customer.id);
      if (lastContact && lastContact > sixtyDaysAgo) continue;

      detected.push({
        opportunityType: 'follow_up',
        customerId: customer.id,
        customerName: customer.name,
        title: `Follow-up needed — ${customer.name}`,
        description: lastContact
          ? `No recent engagement with ${customer.name} in the last 60 days.`
          : `${customer.name} has no recorded communications or activities.`,
        estimatedValueCents: null,
        currency,
        quoteId: null,
        jobId: null,
        priority: 'medium',
        reason: {
          lastContactAt: lastContact?.toISOString() ?? null,
        },
      });
    }

    return dedupeDetectedOpportunities(detected).slice(0, 50);
  }

  async listRecommendations(companyId: string): Promise<SalesRecommendationSummary[]> {
    const rows = await this.db.query.salesRecommendations.findMany({
      where: and(
        eq(salesRecommendations.companyId, companyId),
        inArray(salesRecommendations.status, ['pending', 'accepted']),
      ),
      with: { customer: true },
      orderBy: [desc(salesRecommendations.updatedAt)],
      limit: 50,
    });

    return rows.map(toRecommendationSummary);
  }

  async generateRecommendations(companyId: string): Promise<SalesRecommendationSummary[]> {
    const detected = await this.detectOpportunities(companyId);
    if (detected.length === 0) {
      return [];
    }

    const inserted = await this.db
      .insert(salesRecommendations)
      .values(
        detected.map((signal) => ({
          companyId,
          customerId: signal.customerId,
          recommendationType: mapOpportunityTypeToRecommendation(signal.opportunityType),
          title: signal.title,
          description: signal.description,
          priority: signal.priority,
          status: 'pending' as const,
          context: {
            ...signal.reason,
            estimatedValueCents: signal.estimatedValueCents,
            quoteId: signal.quoteId,
            jobId: signal.jobId,
            opportunityType: signal.opportunityType,
          },
        })),
      )
      .returning();

    const rows = await this.db.query.salesRecommendations.findMany({
      where: inArray(
        salesRecommendations.id,
        inserted.map((row) => row.id),
      ),
      with: { customer: true },
    });

    return rows.map(toRecommendationSummary);
  }

  async updateRecommendation(
    companyId: string,
    recommendationId: string,
    input: UpdateSalesRecommendationRequest,
  ): Promise<SalesRecommendationSummary> {
    const existing = await this.db.query.salesRecommendations.findFirst({
      where: and(
        eq(salesRecommendations.id, recommendationId),
        eq(salesRecommendations.companyId, companyId),
      ),
    });

    if (!existing) {
      throw new SalesError('NOT_FOUND', 'Recommendation not found');
    }

    await this.db
      .update(salesRecommendations)
      .set({
        status: input.status,
        updatedAt: new Date(),
      })
      .where(eq(salesRecommendations.id, recommendationId));

    const row = await this.db.query.salesRecommendations.findFirst({
      where: eq(salesRecommendations.id, recommendationId),
      with: { customer: true },
    });

    return toRecommendationSummary(row!);
  }

  async getPipelineMetrics(companyId: string): Promise<SalesPipelineMetrics> {
    const [stages, opportunities] = await Promise.all([
      this.listPipelineStages(companyId),
      this.db.query.salesOpportunities.findMany({
        where: eq(salesOpportunities.companyId, companyId),
      }),
    ]);

    const won = opportunities.filter((row) => row.status === 'won').length;
    const lost = opportunities.filter((row) => row.status === 'lost').length;
    const closed = won + lost;

    const stageMetrics = stages.map((stage) => {
      const stageOpportunities = opportunities.filter(
        (row) => row.stageId === stage.id && row.status === 'open',
      );
      return {
        stageId: stage.id,
        stageKey: stage.stageKey,
        name: stage.name,
        opportunityCount: stageOpportunities.length,
        totalValueCents: stageOpportunities.reduce(
          (sum, row) => sum + (row.estimatedValueCents ?? 0),
          0,
        ),
        conversionRatePercent: stage.probabilityPercent,
      };
    });

    return {
      stages: stageMetrics,
      totalOpenValueCents: opportunities
        .filter((row) => row.status === 'open')
        .reduce((sum, row) => sum + (row.estimatedValueCents ?? 0), 0),
      wonCount: won,
      lostCount: lost,
      winRatePercent: closed > 0 ? Math.round((won / closed) * 100) : null,
    };
  }

  async getQuoteAssistanceContext(
    companyId: string,
    customerId: string,
  ): Promise<SalesQuoteAssistanceContext> {
    await this.ensureCustomerBelongsToCompany(companyId, customerId);

    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.companyId, companyId)),
    });

    if (!customer) {
      throw new SalesError('NOT_FOUND', 'Customer not found');
    }

    const [quoteRows, jobRows, paymentRows] = await Promise.all([
      this.db.query.quotes.findMany({
        where: and(eq(quotes.companyId, companyId), eq(quotes.customerId, customerId)),
        orderBy: [desc(quotes.createdAt)],
        limit: 10,
      }),
      this.db.query.jobs.findMany({
        where: and(eq(jobs.companyId, companyId), eq(jobs.customerId, customerId)),
        orderBy: [desc(jobs.updatedAt)],
        limit: 10,
      }),
      this.db.query.payments.findMany({
        where: eq(payments.companyId, companyId),
        with: { invoice: true },
      }),
    ]);

    const customerPayments = paymentRows.filter((row) => row.invoice?.customerId === customerId);
    const totalRevenueCents = customerPayments.reduce((sum, row) => sum + row.amountCents, 0);
    const currency = quoteRows[0]?.currency ?? 'USD';

    const recommendations: string[] = [];
    const openQuotes = quoteRows.filter((row) => row.status === 'sent' || row.status === 'draft');
    if (openQuotes.length > 0) {
      recommendations.push(
        `Customer has ${openQuotes.length} open quote(s). Review previous pricing before preparing a new quote.`,
      );
    }

    const completedJobs = jobRows.filter((row) => row.status === 'completed');
    if (completedJobs.length > 0) {
      recommendations.push(
        `Reference ${completedJobs.length} completed job(s) when scoping the quote.`,
      );
    }

    if (totalRevenueCents > 0) {
      recommendations.push(
        `Lifetime revenue: ${(totalRevenueCents / 100).toFixed(2)} ${currency}. Consider margin and relationship value.`,
      );
    }

    return {
      customerId,
      customerName: customer.name,
      previousQuotes: quoteRows.map((row) => ({
        id: row.id,
        quoteNumber: row.quoteNumber,
        title: row.title,
        status: row.status,
        amountCents: row.amountCents,
        currency: row.currency,
        createdAt: row.createdAt.toISOString(),
      })),
      completedJobs: completedJobs.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        completedAt: row.status === 'completed' ? row.updatedAt.toISOString() : null,
      })),
      totalRevenueCents,
      currency,
      recommendations,
    };
  }

  async buildAuraContext(companyId: string): Promise<SalesAuraContext> {
    const [stats, opportunities, detected] = await Promise.all([
      this.getStats(companyId),
      this.listOpportunities(companyId),
      this.detectOpportunities(companyId),
    ]);

    const openOpportunities = opportunities.filter((row) => row.status === 'open');

    return {
      openOpportunityCount: stats.openOpportunityCount,
      pendingRecommendationCount: stats.pendingRecommendationCount,
      pipelineValueCents: stats.pipelineValueCents,
      topOpportunities: openOpportunities.slice(0, 5).map((row) => ({
        id: row.id,
        title: row.title,
        customerName: row.customerName,
        status: row.status,
        estimatedValueCents: row.estimatedValueCents,
      })),
      detectedSignals: detected.slice(0, 10),
      summary: `${stats.openOpportunityCount} open opportunity(ies), ${detected.length} detected signal(s), pipeline value ${(stats.pipelineValueCents / 100).toFixed(2)}.`,
    };
  }

  private async ensureCustomerBelongsToCompany(
    companyId: string,
    customerId: string,
  ): Promise<void> {
    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.companyId, companyId)),
    });

    if (!customer) {
      throw new SalesError('NOT_FOUND', 'Customer not found');
    }
  }

  private async ensureStageBelongsToCompany(companyId: string, stageId: string): Promise<void> {
    const stage = await this.db.query.salesPipelineStages.findFirst({
      where: and(eq(salesPipelineStages.id, stageId), eq(salesPipelineStages.companyId, companyId)),
    });

    if (!stage) {
      throw new SalesError('NOT_FOUND', 'Pipeline stage not found');
    }
  }

  private async ensureQuoteBelongsToCompany(companyId: string, quoteId: string): Promise<void> {
    const quote = await this.db.query.quotes.findFirst({
      where: and(eq(quotes.id, quoteId), eq(quotes.companyId, companyId)),
    });

    if (!quote) {
      throw new SalesError('NOT_FOUND', 'Quote not found');
    }
  }

  private async ensureJobBelongsToCompany(companyId: string, jobId: string): Promise<void> {
    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, companyId)),
    });

    if (!job) {
      throw new SalesError('NOT_FOUND', 'Job not found');
    }
  }
}

function toStageSummary(
  row: typeof salesPipelineStages.$inferSelect,
  opportunityCount: number,
): SalesPipelineStageSummary {
  return {
    id: row.id,
    stageKey: row.stageKey,
    name: row.name,
    sortOrder: row.sortOrder,
    probabilityPercent: row.probabilityPercent,
    isClosedWon: row.isClosedWon,
    isClosedLost: row.isClosedLost,
    opportunityCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toOpportunitySummary(
  row: typeof salesOpportunities.$inferSelect & {
    customer?: typeof customers.$inferSelect | null;
    stage?: typeof salesPipelineStages.$inferSelect | null;
  },
): SalesOpportunitySummary {
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customer?.name ?? null,
    stageId: row.stageId,
    stageName: row.stage?.name ?? null,
    opportunityType: row.opportunityType,
    source: row.source,
    status: row.status,
    title: row.title,
    description: row.description,
    estimatedValueCents: row.estimatedValueCents,
    currency: row.currency,
    quoteId: row.quoteId,
    jobId: row.jobId,
    assignedUserId: row.assignedUserId,
    createdByUserId: row.createdByUserId,
    closedAt: row.closedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toActivitySummary(
  row: typeof salesActivities.$inferSelect & {
    customer?: typeof customers.$inferSelect | null;
    author?: { firstName: string; lastName: string } | null;
  },
): SalesActivitySummary {
  return {
    id: row.id,
    opportunityId: row.opportunityId,
    customerId: row.customerId,
    customerName: row.customer?.name ?? null,
    activityType: row.activityType,
    subject: row.subject,
    body: row.body,
    authorUserId: row.authorUserId,
    authorName: row.author ? `${row.author.firstName} ${row.author.lastName}`.trim() : null,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function toRecommendationSummary(
  row: typeof salesRecommendations.$inferSelect & {
    customer?: typeof customers.$inferSelect | null;
  },
): SalesRecommendationSummary {
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customer?.name ?? null,
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

function mapOpportunityTypeToRecommendation(
  type: DetectedSalesOpportunity['opportunityType'],
): SalesRecommendationSummary['recommendationType'] {
  switch (type) {
    case 'unconverted_quote':
      return 'quote_conversion';
    case 'recurring_service':
      return 'recurring_service';
    case 'high_value_customer':
      return 'high_value';
    case 'follow_up':
      return 'follow_up';
    case 'maintenance_due':
      return 'maintenance';
    default:
      return 'engagement';
  }
}

function dedupeDetectedOpportunities(
  signals: DetectedSalesOpportunity[],
): DetectedSalesOpportunity[] {
  const seen = new Set<string>();
  const result: DetectedSalesOpportunity[] = [];

  for (const signal of signals) {
    const key = `${signal.customerId}:${signal.opportunityType}:${signal.quoteId ?? ''}:${signal.jobId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(signal);
  }

  return result.sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority));
}

function priorityRank(priority: DetectedSalesOpportunity['priority']): number {
  switch (priority) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    default:
      return 1;
  }
}
