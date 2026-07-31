import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { emitBusinessEvent } from '../lib/automation-events.js';
import type {
  CreateMarketingActivityRequest,
  CreateMarketingCampaignRequest,
  CreateMarketingSegmentRequest,
  MarketingActivitySummary,
  MarketingAuraContext,
  MarketingCampaignSummary,
  MarketingContentSuggestion,
  MarketingRecommendationSummary,
  MarketingSegmentSummary,
  MarketingSegmentType,
  MarketingStats,
  UpdateMarketingCampaignRequest,
  UpdateMarketingRecommendationRequest,
  UpdateMarketingSegmentRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  communications,
  customerActivities,
  customers,
  jobs,
  marketingActivities,
  marketingCampaigns,
  marketingRecommendations,
  marketingSegments,
  payments,
} from '@titan/db';

export class MarketingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'MarketingError';
  }
}

type TenantScope = {
  companyId: string;
  userId: string;
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

type CustomerProfile = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: Date;
  completedJobCount: number;
  revenueCents: number;
  communicationCount: number;
  activityCount: number;
  lastContactAt: Date | null;
};

export class MarketingService {
  constructor(private readonly db: DatabaseClient) {}

  async getStats(companyId: string): Promise<MarketingStats> {
    const [storedSegments, campaigns, activityCountRow, recommendations, computed] =
      await Promise.all([
        this.db.query.marketingSegments.findMany({
          where: eq(marketingSegments.companyId, companyId),
        }),
        this.db.query.marketingCampaigns.findMany({
          where: eq(marketingCampaigns.companyId, companyId),
        }),
        this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(marketingActivities)
          .where(eq(marketingActivities.companyId, companyId)),
        this.db.query.marketingRecommendations.findMany({
          where: and(
            eq(marketingRecommendations.companyId, companyId),
            eq(marketingRecommendations.status, 'pending'),
          ),
        }),
        this.computeCustomerSegments(companyId),
      ]);

    return {
      segmentCount: storedSegments.length,
      activeCampaignCount: campaigns.filter((row) => row.status === 'active').length,
      activityCount: activityCountRow[0]?.count ?? 0,
      pendingRecommendationCount: recommendations.length,
      computedSegmentCount: computed.length,
    };
  }

  async listSegments(companyId: string): Promise<MarketingSegmentSummary[]> {
    const [stored, computed] = await Promise.all([
      this.db.query.marketingSegments.findMany({
        where: eq(marketingSegments.companyId, companyId),
        orderBy: [marketingSegments.name],
      }),
      this.computeCustomerSegments(companyId),
    ]);

    const storedSummaries = stored.map((row) => ({
      id: row.id,
      segmentKey: row.segmentKey,
      name: row.name,
      description: row.description,
      segmentType: row.segmentType,
      customerCount: 0,
      isComputed: false,
      customers: [] as MarketingSegmentSummary['customers'],
    }));

    return [...computed, ...storedSummaries];
  }

  async createSegment(
    scope: TenantScope,
    input: CreateMarketingSegmentRequest,
  ): Promise<MarketingSegmentSummary> {
    const segmentKey = input.segmentKey.trim();
    const name = input.name.trim();

    if (!segmentKey || !name) {
      throw new MarketingError('VALIDATION_ERROR', 'Segment key and name are required');
    }

    const [created] = await this.db
      .insert(marketingSegments)
      .values({
        companyId: scope.companyId,
        segmentKey,
        name,
        description: input.description?.trim() || null,
        segmentType: input.segmentType ?? 'custom',
        criteria: input.criteria ?? {},
        createdByUserId: scope.userId,
      })
      .returning();

    if (!created) {
      throw new MarketingError('CREATE_FAILED', 'Unable to create marketing segment');
    }

    return {
      id: created.id,
      segmentKey: created.segmentKey,
      name: created.name,
      description: created.description,
      segmentType: created.segmentType,
      customerCount: 0,
      isComputed: false,
      customers: [],
    };
  }

  async updateSegment(
    companyId: string,
    segmentId: string,
    input: UpdateMarketingSegmentRequest,
  ): Promise<MarketingSegmentSummary> {
    const existing = await this.db.query.marketingSegments.findFirst({
      where: and(eq(marketingSegments.id, segmentId), eq(marketingSegments.companyId, companyId)),
    });

    if (!existing) {
      throw new MarketingError('NOT_FOUND', 'Marketing segment not found');
    }

    const [updated] = await this.db
      .update(marketingSegments)
      .set({
        segmentKey: input.segmentKey?.trim() || existing.segmentKey,
        name: input.name?.trim() || existing.name,
        description:
          input.description !== undefined
            ? input.description?.trim() || null
            : existing.description,
        segmentType: input.segmentType ?? existing.segmentType,
        criteria: input.criteria ?? existing.criteria,
        updatedAt: new Date(),
      })
      .where(eq(marketingSegments.id, segmentId))
      .returning();

    return {
      id: updated!.id,
      segmentKey: updated!.segmentKey,
      name: updated!.name,
      description: updated!.description,
      segmentType: updated!.segmentType,
      customerCount: 0,
      isComputed: false,
      customers: [],
    };
  }

  async listCampaigns(companyId: string): Promise<MarketingCampaignSummary[]> {
    const rows = await this.db.query.marketingCampaigns.findMany({
      where: eq(marketingCampaigns.companyId, companyId),
      with: { activities: true },
      orderBy: [desc(marketingCampaigns.updatedAt)],
    });

    return rows.map((row) => toCampaignSummary(row, row.activities.length));
  }

  async createCampaign(
    scope: TenantScope,
    input: CreateMarketingCampaignRequest,
  ): Promise<MarketingCampaignSummary> {
    const name = input.name.trim();
    if (!name) {
      throw new MarketingError('VALIDATION_ERROR', 'Campaign name is required');
    }

    const [created] = await this.db
      .insert(marketingCampaigns)
      .values({
        companyId: scope.companyId,
        name,
        description: input.description?.trim() || null,
        status: input.status ?? 'draft',
        campaignType: input.campaignType ?? 'custom',
        targetSegmentKey: input.targetSegmentKey?.trim() || null,
        config: input.config ?? {},
        createdByUserId: scope.userId,
        startedAt: input.status === 'active' ? new Date() : null,
      })
      .returning();

    if (!created) {
      throw new MarketingError('CREATE_FAILED', 'Unable to create marketing campaign');
    }

    return toCampaignSummary(created, 0);
  }

  async updateCampaign(
    companyId: string,
    campaignId: string,
    input: UpdateMarketingCampaignRequest,
  ): Promise<MarketingCampaignSummary> {
    const existing = await this.db.query.marketingCampaigns.findFirst({
      where: and(
        eq(marketingCampaigns.id, campaignId),
        eq(marketingCampaigns.companyId, companyId),
      ),
      with: { activities: true },
    });

    if (!existing) {
      throw new MarketingError('NOT_FOUND', 'Marketing campaign not found');
    }

    const nextStatus = input.status ?? existing.status;
    const startedAt =
      nextStatus === 'active' && existing.status !== 'active' ? new Date() : existing.startedAt;
    const completedAt =
      nextStatus === 'completed' && existing.status !== 'completed'
        ? new Date()
        : existing.completedAt;

    const [updated] = await this.db
      .update(marketingCampaigns)
      .set({
        name: input.name?.trim() || existing.name,
        description:
          input.description !== undefined
            ? input.description?.trim() || null
            : existing.description,
        status: nextStatus,
        campaignType: input.campaignType ?? existing.campaignType,
        targetSegmentKey:
          input.targetSegmentKey !== undefined
            ? input.targetSegmentKey?.trim() || null
            : existing.targetSegmentKey,
        config: input.config ?? existing.config,
        startedAt,
        completedAt,
        updatedAt: new Date(),
      })
      .where(eq(marketingCampaigns.id, campaignId))
      .returning();

    if (nextStatus === 'completed' && existing.status !== 'completed') {
      emitBusinessEvent({
        companyId,
        eventType: 'marketing.campaign.completed',
        entityType: 'marketing_campaign',
        entityId: campaignId,
        payload: { campaign: { id: campaignId, status: 'completed', name: existing.name } },
      });
    }

    return toCampaignSummary(updated!, existing.activities.length);
  }

  async listActivities(
    companyId: string,
    campaignId?: string,
  ): Promise<MarketingActivitySummary[]> {
    const rows = await this.db.query.marketingActivities.findMany({
      where: campaignId
        ? and(
            eq(marketingActivities.companyId, companyId),
            eq(marketingActivities.campaignId, campaignId),
          )
        : eq(marketingActivities.companyId, companyId),
      with: { customer: true, author: true, campaign: true },
      orderBy: [desc(marketingActivities.occurredAt)],
      limit: 100,
    });

    return rows.map(toActivitySummary);
  }

  async createActivity(
    scope: TenantScope,
    input: CreateMarketingActivityRequest,
  ): Promise<MarketingActivitySummary> {
    const body = input.body.trim();
    if (!body) {
      throw new MarketingError('VALIDATION_ERROR', 'Activity body is required');
    }

    if (input.campaignId) {
      const campaign = await this.db.query.marketingCampaigns.findFirst({
        where: and(
          eq(marketingCampaigns.id, input.campaignId),
          eq(marketingCampaigns.companyId, scope.companyId),
        ),
      });
      if (!campaign) {
        throw new MarketingError('NOT_FOUND', 'Marketing campaign not found');
      }
    }

    if (input.customerId) {
      await this.ensureCustomerBelongsToCompany(scope.companyId, input.customerId);
    }

    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      throw new MarketingError('VALIDATION_ERROR', 'Invalid occurred date');
    }

    const [created] = await this.db
      .insert(marketingActivities)
      .values({
        companyId: scope.companyId,
        campaignId: input.campaignId ?? null,
        customerId: input.customerId ?? null,
        activityType: input.activityType ?? 'note',
        subject: input.subject?.trim() || null,
        body,
        authorUserId: scope.userId,
        occurredAt,
      })
      .returning();

    if (!created) {
      throw new MarketingError('CREATE_FAILED', 'Unable to create marketing activity');
    }

    const row = await this.db.query.marketingActivities.findFirst({
      where: eq(marketingActivities.id, created.id),
      with: { customer: true, author: true, campaign: true },
    });

    return toActivitySummary(row!);
  }

  async listRecommendations(companyId: string): Promise<MarketingRecommendationSummary[]> {
    const rows = await this.db.query.marketingRecommendations.findMany({
      where: and(
        eq(marketingRecommendations.companyId, companyId),
        inArray(marketingRecommendations.status, ['pending', 'accepted']),
      ),
      with: { customer: true },
      orderBy: [desc(marketingRecommendations.updatedAt)],
      limit: 50,
    });

    return rows.map(toRecommendationSummary);
  }

  async generateRecommendations(companyId: string): Promise<MarketingRecommendationSummary[]> {
    const signals = await this.buildRecommendationSignals(companyId);
    if (signals.length === 0) {
      return [];
    }

    const inserted = await this.db
      .insert(marketingRecommendations)
      .values(
        signals.map((signal) => ({
          companyId,
          customerId: signal.customerId,
          recommendationType: signal.recommendationType,
          title: signal.title,
          description: signal.description,
          priority: signal.priority,
          status: 'pending' as const,
          context: signal.context,
        })),
      )
      .returning();

    const rows = await this.db.query.marketingRecommendations.findMany({
      where: inArray(
        marketingRecommendations.id,
        inserted.map((row) => row.id),
      ),
      with: { customer: true },
    });

    return rows.map(toRecommendationSummary);
  }

  async updateRecommendation(
    companyId: string,
    recommendationId: string,
    input: UpdateMarketingRecommendationRequest,
  ): Promise<MarketingRecommendationSummary> {
    const existing = await this.db.query.marketingRecommendations.findFirst({
      where: and(
        eq(marketingRecommendations.id, recommendationId),
        eq(marketingRecommendations.companyId, companyId),
      ),
    });

    if (!existing) {
      throw new MarketingError('NOT_FOUND', 'Marketing recommendation not found');
    }

    await this.db
      .update(marketingRecommendations)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(marketingRecommendations.id, recommendationId));

    const row = await this.db.query.marketingRecommendations.findFirst({
      where: eq(marketingRecommendations.id, recommendationId),
      with: { customer: true },
    });

    return toRecommendationSummary(row!);
  }

  async getContentSuggestions(companyId: string): Promise<MarketingContentSuggestion[]> {
    const segments = await this.computeCustomerSegments(companyId);
    const suggestions: MarketingContentSuggestion[] = [];

    for (const segment of segments) {
      if (segment.customerCount === 0) continue;

      if (segment.segmentType === 'dormant') {
        suggestions.push({
          title: `Re-engagement campaign for ${segment.name}`,
          description: `${segment.customerCount} dormant customer(s) may respond to a service check-in or seasonal offer.`,
          channel: 'email_or_whatsapp',
          targetSegmentKey: segment.segmentKey,
          messagingGuidance:
            'Use a friendly, professional tone. Reference past service history if available. Offer value — do not pressure.',
        });
      }

      if (segment.segmentType === 'repeat_service') {
        suggestions.push({
          title: `Maintenance reminder for ${segment.name}`,
          description: `${segment.customerCount} repeat customer(s) may benefit from a preventive maintenance campaign.`,
          channel: 'email_or_whatsapp',
          targetSegmentKey: segment.segmentKey,
          messagingGuidance:
            'Highlight reliability and preventive care. Reference completed jobs. Keep messaging brand-consistent and concise.',
        });
      }

      if (segment.segmentType === 'high_value') {
        suggestions.push({
          title: `VIP retention outreach for ${segment.name}`,
          description: `${segment.customerCount} high-value customer(s) deserve personalised retention communication.`,
          channel: 'personal_outreach',
          targetSegmentKey: segment.segmentKey,
          messagingGuidance:
            'Personalise the message. Acknowledge their loyalty. Offer priority scheduling or exclusive service options.',
        });
      }
    }

    const month = new Date().getMonth();
    if (month >= 8 || month <= 1) {
      suggestions.push({
        title: 'Seasonal service campaign',
        description:
          'Seasonal maintenance and preparation services may resonate with existing customers.',
        channel: 'email_or_whatsapp',
        targetSegmentKey: 'seasonal',
        messagingGuidance:
          'Focus on seasonal readiness (e.g. winter plumbing checks, summer irrigation). Use local, practical language.',
      });
    }

    return suggestions.slice(0, 10);
  }

  async buildAuraContext(companyId: string): Promise<MarketingAuraContext> {
    const [stats, segments, recommendations, contentSuggestions] = await Promise.all([
      this.getStats(companyId),
      this.computeCustomerSegments(companyId),
      this.listRecommendations(companyId),
      this.getContentSuggestions(companyId),
    ]);

    const topSegments = segments
      .filter((segment) => segment.customerCount > 0)
      .sort((a, b) => b.customerCount - a.customerCount)
      .slice(0, 5)
      .map((segment) => ({
        segmentKey: segment.segmentKey,
        name: segment.name,
        customerCount: segment.customerCount,
        segmentType: segment.segmentType,
      }));

    return {
      activeCampaignCount: stats.activeCampaignCount,
      pendingRecommendationCount: stats.pendingRecommendationCount,
      topSegments,
      topRecommendations: recommendations.slice(0, 5).map((row) => ({
        title: row.title,
        recommendationType: row.recommendationType,
        priority: row.priority,
      })),
      contentSuggestions: contentSuggestions.slice(0, 5),
      summary: `${stats.activeCampaignCount} active campaign(s), ${topSegments.length} segment(s) with customers, ${stats.pendingRecommendationCount} pending recommendation(s).`,
    };
  }

  private async computeCustomerSegments(companyId: string): Promise<MarketingSegmentSummary[]> {
    const profiles = await this.loadCustomerProfiles(companyId);
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - THIRTY_DAYS_MS);
    const sixtyDaysAgo = new Date(now.getTime() - SIXTY_DAYS_MS);

    const revenueValues = profiles.map((profile) => profile.revenueCents).sort((a, b) => b - a);
    const highValueThreshold = revenueValues[2] ?? revenueValues[0] ?? 0;

    const segments: MarketingSegmentSummary[] = [
      buildComputedSegment(
        'high_value',
        'High value customers',
        'high_value',
        profiles.filter((p) => p.revenueCents >= highValueThreshold && highValueThreshold > 0),
      ),
      buildComputedSegment(
        'repeat_service',
        'Repeat service customers',
        'repeat_service',
        profiles.filter((p) => p.completedJobCount >= 2),
      ),
      buildComputedSegment(
        'dormant',
        'Dormant customers',
        'dormant',
        profiles.filter((p) => !p.lastContactAt || p.lastContactAt < sixtyDaysAgo),
      ),
      buildComputedSegment(
        'new_customer',
        'New customers',
        'new_customer',
        profiles.filter((p) => p.createdAt >= thirtyDaysAgo),
      ),
      buildComputedSegment(
        'high_engagement',
        'Highly engaged customers',
        'high_engagement',
        profiles.filter((p) => p.communicationCount + p.activityCount >= 3),
      ),
    ];

    return segments;
  }

  private async buildRecommendationSignals(companyId: string) {
    const profiles = await this.loadCustomerProfiles(companyId);
    const now = new Date();
    const sixtyDaysAgo = new Date(now.getTime() - SIXTY_DAYS_MS);
    const ninetyDaysAgo = new Date(now.getTime() - NINETY_DAYS_MS);
    const signals: Array<{
      customerId: string | null;
      recommendationType: MarketingRecommendationSummary['recommendationType'];
      title: string;
      description: string;
      priority: string;
      context: Record<string, unknown>;
    }> = [];

    for (const profile of profiles) {
      if (
        profile.completedJobCount >= 2 &&
        (!profile.lastContactAt || profile.lastContactAt < ninetyDaysAgo)
      ) {
        signals.push({
          customerId: profile.id,
          recommendationType: 'maintenance_reminder',
          title: `Maintenance reminder — ${profile.name}`,
          description: `${profile.name} has repeat service history but no recent contact. Consider a maintenance reminder campaign.`,
          priority: 'high',
          context: {
            completedJobCount: profile.completedJobCount,
            lastContactAt: profile.lastContactAt?.toISOString() ?? null,
          },
        });
      }

      if (!profile.lastContactAt || profile.lastContactAt < sixtyDaysAgo) {
        signals.push({
          customerId: profile.id,
          recommendationType: 'retention',
          title: `Retention outreach — ${profile.name}`,
          description: `${profile.name} has been inactive. A retention campaign may prevent churn.`,
          priority: 'medium',
          context: { lastContactAt: profile.lastContactAt?.toISOString() ?? null },
        });
      }

      if (profile.completedJobCount >= 1 && profile.revenueCents > 0) {
        signals.push({
          customerId: profile.id,
          recommendationType: 'service_interest',
          title: `Service upsell — ${profile.name}`,
          description: `${profile.name} may be interested in additional services based on job and payment history.`,
          priority: 'medium',
          context: {
            completedJobCount: profile.completedJobCount,
            revenueCents: profile.revenueCents,
          },
        });
      }
    }

    const month = new Date().getMonth();
    if (month >= 8 || month <= 1) {
      signals.push({
        customerId: null,
        recommendationType: 'seasonal',
        title: 'Seasonal marketing opportunity',
        description:
          'Consider a seasonal maintenance campaign targeting repeat and dormant customer segments.',
        priority: 'medium',
        context: { season: month >= 8 ? 'pre_winter' : 'pre_summer' },
      });
    }

    if (profiles.filter((p) => p.communicationCount + p.activityCount === 0).length > 0) {
      signals.push({
        customerId: null,
        recommendationType: 'engagement',
        title: 'Engagement campaign opportunity',
        description:
          'Some customers have no recorded engagement. A welcome or re-introduction campaign may help.',
        priority: 'low',
        context: {
          unengagedCustomerCount: profiles.filter(
            (p) => p.communicationCount + p.activityCount === 0,
          ).length,
        },
      });
    }

    return dedupeSignals(signals).slice(0, 30);
  }

  private async loadCustomerProfiles(companyId: string): Promise<CustomerProfile[]> {
    const [customerRows, jobRows, paymentRows, communicationRows, activityRows] = await Promise.all(
      [
        this.db.query.customers.findMany({ where: eq(customers.companyId, companyId) }),
        this.db.query.jobs.findMany({ where: eq(jobs.companyId, companyId) }),
        this.db.query.payments.findMany({
          where: eq(payments.companyId, companyId),
          with: { invoice: true },
        }),
        this.db.query.communications.findMany({ where: eq(communications.companyId, companyId) }),
        this.db.query.customerActivities.findMany({
          where: eq(customerActivities.companyId, companyId),
        }),
      ],
    );

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

    const communicationsByCustomer = new Map<string, number>();
    for (const row of communicationRows) {
      communicationsByCustomer.set(
        row.customerId,
        (communicationsByCustomer.get(row.customerId) ?? 0) + 1,
      );
    }

    const activitiesByCustomer = new Map<string, number>();
    for (const row of activityRows) {
      activitiesByCustomer.set(row.customerId, (activitiesByCustomer.get(row.customerId) ?? 0) + 1);
    }

    const lastContactByCustomer = new Map<string, Date>();
    for (const row of [...communicationRows, ...activityRows]) {
      const customerId = row.customerId;
      const occurredAt = 'occurredAt' in row ? row.occurredAt : row.createdAt;
      const existing = lastContactByCustomer.get(customerId);
      if (!existing || occurredAt > existing) {
        lastContactByCustomer.set(customerId, occurredAt);
      }
    }

    return customerRows.map((customer) => ({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      createdAt: customer.createdAt,
      completedJobCount: completedJobsByCustomer.get(customer.id) ?? 0,
      revenueCents: revenueByCustomer.get(customer.id) ?? 0,
      communicationCount: communicationsByCustomer.get(customer.id) ?? 0,
      activityCount: activitiesByCustomer.get(customer.id) ?? 0,
      lastContactAt: lastContactByCustomer.get(customer.id) ?? null,
    }));
  }

  private async ensureCustomerBelongsToCompany(
    companyId: string,
    customerId: string,
  ): Promise<void> {
    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.companyId, companyId)),
    });

    if (!customer) {
      throw new MarketingError('NOT_FOUND', 'Customer not found');
    }
  }
}

function buildComputedSegment(
  segmentKey: string,
  name: string,
  segmentType: MarketingSegmentType,
  members: CustomerProfile[],
): MarketingSegmentSummary {
  return {
    id: null,
    segmentKey,
    name,
    description: `Computed from real tenant CRM, job, and engagement data.`,
    segmentType,
    customerCount: members.length,
    isComputed: true,
    customers: members.slice(0, 20).map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      phone: member.phone,
    })),
  };
}

function toCampaignSummary(
  row: typeof marketingCampaigns.$inferSelect,
  activityCount: number,
): MarketingCampaignSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    campaignType: row.campaignType,
    targetSegmentKey: row.targetSegmentKey,
    activityCount,
    createdByUserId: row.createdByUserId,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toActivitySummary(
  row: typeof marketingActivities.$inferSelect & {
    customer?: typeof customers.$inferSelect | null;
    author?: { firstName: string; lastName: string } | null;
    campaign?: typeof marketingCampaigns.$inferSelect | null;
  },
): MarketingActivitySummary {
  return {
    id: row.id,
    campaignId: row.campaignId,
    campaignName: row.campaign?.name ?? null,
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
  row: typeof marketingRecommendations.$inferSelect & {
    customer?: typeof customers.$inferSelect | null;
  },
): MarketingRecommendationSummary {
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

function dedupeSignals<
  T extends { customerId: string | null; recommendationType: string; title: string },
>(signals: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const signal of signals) {
    const key = `${signal.customerId ?? 'global'}:${signal.recommendationType}:${signal.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(signal);
  }

  return result;
}
