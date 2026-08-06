import { and, desc, eq } from 'drizzle-orm';
import {
  buildMktAgentAnalyticsFromCounts,
  buildMktAgentContentTemplate,
  canAccessMarketingAgent,
  canApproveMarketingAgentPublish,
  canWriteMarketingAgent,
  listDefaultMktAgentContentTemplates,
  listMktAgentAuraConnections,
  MKT_AGENT_PRODUCT_COPY,
  type CreateMktAgentCampaignRequest,
  type CreateMktAgentContentDraftRequest,
  type CreateMktAgentGoalRequest,
  type CreateMktAgentRecommendationRequest,
  type DecideMktAgentDraftRequest,
  type DecideMktAgentRecommendationRequest,
  type GenerateMktAgentContentRequest,
  type MktAgentAnalytics,
  type MktAgentCampaignSummary,
  type MktAgentChannel,
  type MktAgentContentDraftSummary,
  type MktAgentDashboard,
  type MktAgentGoalSummary,
  type MktAgentRecommendationSummary,
  type RequestMktAgentPublishRequest,
  type UpdateMktAgentCampaignRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  mktAgentCampaigns,
  mktAgentContentDrafts,
  mktAgentGoals,
  mktAgentRecommendations,
  securityAuditLogs,
} from '@titan/db';

export class MarketingAgentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'MarketingAgentError';
  }
}

export type MktAgentActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

function asChannels(value: unknown): MktAgentChannel[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is MktAgentChannel => typeof v === 'string') as MktAgentChannel[];
}

function asHashtags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

export class MarketingAgentService {
  constructor(private readonly db: DatabaseClient) {}

  private assertRead(actor: MktAgentActor): void {
    if (!canAccessMarketingAgent(actor)) {
      throw new MarketingAgentError(
        'FORBIDDEN',
        'Marketing Agent requires marketing or marketing-intelligence access (Technician/Client denied).',
      );
    }
  }

  private assertWrite(actor: MktAgentActor): void {
    this.assertRead(actor);
    if (!canWriteMarketingAgent(actor)) {
      throw new MarketingAgentError(
        'FORBIDDEN',
        'Marketing Agent write actions require marketing:write or marketing_intelligence:write.',
      );
    }
  }

  private assertApprove(actor: MktAgentActor): void {
    this.assertWrite(actor);
    if (!canApproveMarketingAgentPublish(actor)) {
      throw new MarketingAgentError(
        'FORBIDDEN',
        'Only Company Owner (or marketing_intelligence:manage) may approve publish-sensitive marketing drafts.',
      );
    }
  }

  private async recordAudit(
    actor: MktAgentActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'ai',
      action,
      entityType: 'marketing_agent',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        autoPublish: false,
        autoExecuted: false,
        socialPublishAvailable: false,
      },
    });
  }

  private toCampaign(row: typeof mktAgentCampaigns.$inferSelect): MktAgentCampaignSummary {
    return {
      id: row.id,
      name: row.name,
      objective: row.objective,
      status: row.status,
      channels: asChannels(row.channels),
      startDate: row.startDate?.toISOString() ?? null,
      endDate: row.endDate?.toISOString() ?? null,
      goalId: row.goalId,
      notes: row.notes,
      autoPublish: false,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toDraft(row: typeof mktAgentContentDrafts.$inferSelect): MktAgentContentDraftSummary {
    return {
      id: row.id,
      campaignId: row.campaignId,
      contentKind: row.contentKind,
      channel: row.channel,
      status: row.status,
      title: row.title,
      body: row.body,
      hashtags: asHashtags(row.hashtags),
      autoPublish: false,
      socialPublishAvailable: false,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toGoal(row: typeof mktAgentGoals.$inferSelect): MktAgentGoalSummary {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      targetMetric: row.targetMetric,
      currentValue: row.currentValue,
      targetValue: row.targetValue,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toRecommendation(
    row: typeof mktAgentRecommendations.$inferSelect,
  ): MktAgentRecommendationSummary {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      title: row.title,
      recommendation: row.recommendation,
      channel: row.channel,
      campaignId: row.campaignId,
      autoExecuted: false,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    };
  }

  private async buildAnalytics(actor: MktAgentActor): Promise<MktAgentAnalytics> {
    const [campaigns, drafts, goals, recommendations] = await Promise.all([
      this.db
        .select()
        .from(mktAgentCampaigns)
        .where(eq(mktAgentCampaigns.companyId, actor.companyId)),
      this.db
        .select()
        .from(mktAgentContentDrafts)
        .where(eq(mktAgentContentDrafts.companyId, actor.companyId)),
      this.db
        .select()
        .from(mktAgentGoals)
        .where(eq(mktAgentGoals.companyId, actor.companyId)),
      this.db
        .select()
        .from(mktAgentRecommendations)
        .where(eq(mktAgentRecommendations.companyId, actor.companyId)),
    ]);

    const pendingApprovals = drafts.filter((d) => d.status === 'pending_approval').length;
    const approvedDrafts = drafts.filter((d) => d.status === 'approved' || d.status === 'publish_gated')
      .length;
    const rejectedDrafts = drafts.filter((d) => d.status === 'rejected').length;
    const activeGoals = goals.filter((g) => g.status === 'active').length;
    const pendingRecommendations = recommendations.filter(
      (r) => r.status === 'pending_approval',
    ).length;

    const opportunities: MktAgentAnalytics['opportunities'] = [];
    if (pendingApprovals > 0) {
      opportunities.push({
        id: 'opp-pending-drafts',
        title: 'Drafts awaiting Owner approval',
        detail: `${pendingApprovals} content draft(s) pending approval. Nothing will publish without Owner decision.`,
        source: 'stored_drafts',
      });
    }
    if (campaigns.filter((c) => c.status === 'draft' || c.status === 'planned').length > 0) {
      opportunities.push({
        id: 'opp-planned-campaigns',
        title: 'Campaigns in draft/planned state',
        detail: 'Review planned campaigns and attach approved content drafts before any publish path.',
        source: 'stored_campaigns',
      });
    }
    if (activeGoals > 0 && drafts.length === 0) {
      opportunities.push({
        id: 'opp-goals-without-content',
        title: 'Goals without content drafts',
        detail: 'Active marketing goals exist but no content drafts yet — generate drafts for Owner review.',
        source: 'stored_goals',
      });
    }
    for (const rec of recommendations.filter((r) => r.status === 'pending_approval').slice(0, 5)) {
      opportunities.push({
        id: rec.id,
        title: rec.title,
        detail: rec.recommendation,
        source: 'recommendation',
      });
    }

    return buildMktAgentAnalyticsFromCounts({
      campaignCount: campaigns.length,
      draftCount: drafts.length,
      pendingApprovals,
      approvedDrafts,
      rejectedDrafts,
      activeGoals,
      pendingRecommendations,
      opportunities,
    });
  }

  async getDashboard(actor: MktAgentActor): Promise<MktAgentDashboard> {
    this.assertRead(actor);

    const [campaigns, drafts, goals, recommendations, analytics] = await Promise.all([
      this.listCampaigns(actor),
      this.listContentDrafts(actor),
      this.listGoals(actor),
      this.listRecommendations(actor),
      this.buildAnalytics(actor),
    ]);

    const empty =
      campaigns.length === 0 &&
      drafts.length === 0 &&
      goals.length === 0 &&
      recommendations.length === 0;

    return {
      summary: empty
        ? 'No marketing agent activity stored yet. Create campaigns, goals, or generate content drafts for Owner approval. Engagement metrics stay unavailable until social integrations provide real data.'
        : `Loaded ${campaigns.length} campaign(s), ${drafts.length} draft(s), ${goals.length} goal(s). Engagement remains unavailable without live social integrations. Approval never auto-publishes.`,
      productClarification: { ...MKT_AGENT_PRODUCT_COPY },
      publishPolicy: {
        autoPublishEnabled: false,
        requiresOwnerApproval: true,
        draftApprovePublishGated: true,
        socialIntegrationsLive: false,
      },
      campaigns,
      contentDrafts: drafts,
      goals,
      recommendations,
      analytics,
      auraConnections: listMktAgentAuraConnections(),
      contentTemplates: listDefaultMktAgentContentTemplates(),
    };
  }

  async listCampaigns(actor: MktAgentActor): Promise<MktAgentCampaignSummary[]> {
    this.assertRead(actor);
    const rows = await this.db
      .select()
      .from(mktAgentCampaigns)
      .where(eq(mktAgentCampaigns.companyId, actor.companyId))
      .orderBy(desc(mktAgentCampaigns.updatedAt));
    return rows.map((r) => this.toCampaign(r));
  }

  async createCampaign(
    actor: MktAgentActor,
    input: CreateMktAgentCampaignRequest,
  ): Promise<MktAgentCampaignSummary> {
    this.assertWrite(actor);

    const [created] = await this.db
      .insert(mktAgentCampaigns)
      .values({
        companyId: actor.companyId,
        name: input.name.trim(),
        objective: input.objective.trim(),
        status: 'draft',
        channels: input.channels ?? [],
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
        goalId: input.goalId ?? null,
        notes: input.notes?.trim() ?? null,
        autoPublish: false,
        createdByUserId: actor.userId,
        metadata: { source: 'marketing_agent', autoPublish: false },
      })
      .returning();

    await this.recordAudit(actor, 'mkt_agent_campaign_created', created!.id, {
      status: 'draft',
    });

    return this.toCampaign(created!);
  }

  async updateCampaign(
    actor: MktAgentActor,
    campaignId: string,
    input: UpdateMktAgentCampaignRequest,
  ): Promise<MktAgentCampaignSummary> {
    this.assertWrite(actor);

    const [existing] = await this.db
      .select()
      .from(mktAgentCampaigns)
      .where(
        and(eq(mktAgentCampaigns.id, campaignId), eq(mktAgentCampaigns.companyId, actor.companyId)),
      )
      .limit(1);

    if (!existing) {
      throw new MarketingAgentError('NOT_FOUND', 'Campaign not found');
    }

    const [updated] = await this.db
      .update(mktAgentCampaigns)
      .set({
        name: input.name?.trim() ?? existing.name,
        objective: input.objective?.trim() ?? existing.objective,
        status: input.status ?? existing.status,
        channels: input.channels ?? existing.channels,
        startDate:
          input.startDate === undefined
            ? existing.startDate
            : input.startDate
              ? new Date(input.startDate)
              : null,
        endDate:
          input.endDate === undefined
            ? existing.endDate
            : input.endDate
              ? new Date(input.endDate)
              : null,
        goalId: input.goalId === undefined ? existing.goalId : input.goalId,
        notes: input.notes === undefined ? existing.notes : input.notes,
        autoPublish: false,
        updatedAt: new Date(),
      })
      .where(eq(mktAgentCampaigns.id, existing.id))
      .returning();

    await this.recordAudit(actor, 'mkt_agent_campaign_updated', existing.id, {
      status: updated!.status,
    });

    return this.toCampaign(updated!);
  }

  async listContentDrafts(actor: MktAgentActor): Promise<MktAgentContentDraftSummary[]> {
    this.assertRead(actor);
    const rows = await this.db
      .select()
      .from(mktAgentContentDrafts)
      .where(eq(mktAgentContentDrafts.companyId, actor.companyId))
      .orderBy(desc(mktAgentContentDrafts.createdAt));
    return rows.map((r) => this.toDraft(r));
  }

  async createContentDraft(
    actor: MktAgentActor,
    input: CreateMktAgentContentDraftRequest,
  ): Promise<MktAgentContentDraftSummary> {
    this.assertWrite(actor);

    if (input.campaignId) {
      const [campaign] = await this.db
        .select()
        .from(mktAgentCampaigns)
        .where(
          and(
            eq(mktAgentCampaigns.id, input.campaignId),
            eq(mktAgentCampaigns.companyId, actor.companyId),
          ),
        )
        .limit(1);
      if (!campaign) {
        throw new MarketingAgentError('NOT_FOUND', 'Campaign not found for this tenant');
      }
    }

    const status = input.submitForApproval ? 'pending_approval' : 'draft';

    const [created] = await this.db
      .insert(mktAgentContentDrafts)
      .values({
        companyId: actor.companyId,
        campaignId: input.campaignId ?? null,
        contentKind: input.contentKind,
        channel: input.channel,
        status,
        title: input.title.trim(),
        body: input.body.trim(),
        hashtags: input.hashtags ?? [],
        autoPublish: false,
        socialPublishAvailable: false,
        createdByUserId: actor.userId,
        metadata: { source: 'manual', autoPublish: false },
      })
      .returning();

    await this.recordAudit(actor, 'mkt_agent_content_draft_created', created!.id, {
      status,
      contentKind: input.contentKind,
    });

    return this.toDraft(created!);
  }

  async generateContentDraft(
    actor: MktAgentActor,
    input: GenerateMktAgentContentRequest,
  ): Promise<MktAgentContentDraftSummary> {
    this.assertWrite(actor);

    const template = buildMktAgentContentTemplate({
      contentKind: input.contentKind,
      channel: input.channel,
      topicHint: input.topicHint,
    });

    return this.createContentDraft(actor, {
      campaignId: input.campaignId,
      contentKind: template.contentKind,
      channel: template.channel,
      title: template.title,
      body: template.body,
      hashtags: template.hashtags,
      submitForApproval: input.submitForApproval ?? true,
    });
  }

  async decideContentDraft(
    actor: MktAgentActor,
    draftId: string,
    input: DecideMktAgentDraftRequest,
  ): Promise<MktAgentContentDraftSummary> {
    this.assertApprove(actor);

    const [draft] = await this.db
      .select()
      .from(mktAgentContentDrafts)
      .where(
        and(
          eq(mktAgentContentDrafts.id, draftId),
          eq(mktAgentContentDrafts.companyId, actor.companyId),
        ),
      )
      .limit(1);

    if (!draft) {
      throw new MarketingAgentError('NOT_FOUND', 'Content draft not found');
    }
    if (draft.status !== 'pending_approval' && draft.status !== 'draft') {
      throw new MarketingAgentError('INVALID_STATE', 'Draft is not awaiting approval');
    }

    // Approve marks ready for publish handoff — never posts to social platforms.
    const status = input.decision === 'approve' ? 'approved' : 'rejected';
    const [updated] = await this.db
      .update(mktAgentContentDrafts)
      .set({
        status,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: input.notes ?? null,
        autoPublish: false,
        socialPublishAvailable: false,
        updatedAt: new Date(),
      })
      .where(eq(mktAgentContentDrafts.id, draft.id))
      .returning();

    await this.recordAudit(
      actor,
      input.decision === 'approve'
        ? 'mkt_agent_content_draft_approved'
        : 'mkt_agent_content_draft_rejected',
      draft.id,
      {
        note: 'Approval does not publish — social integrations are not live; publish execute remains gated.',
      },
    );

    return this.toDraft(updated!);
  }

  /**
   * Publish path is honestly gated: social platform integrations are not live.
   * Moves approved drafts to publish_gated; never posts externally.
   */
  async requestPublish(
    actor: MktAgentActor,
    draftId: string,
    input: RequestMktAgentPublishRequest = {},
  ): Promise<{
    draft: MktAgentContentDraftSummary;
    published: false;
    gated: true;
    reason: string;
  }> {
    this.assertApprove(actor);

    const [draft] = await this.db
      .select()
      .from(mktAgentContentDrafts)
      .where(
        and(
          eq(mktAgentContentDrafts.id, draftId),
          eq(mktAgentContentDrafts.companyId, actor.companyId),
        ),
      )
      .limit(1);

    if (!draft) {
      throw new MarketingAgentError('NOT_FOUND', 'Content draft not found');
    }
    if (draft.status !== 'approved' && draft.status !== 'publish_gated') {
      throw new MarketingAgentError(
        'INVALID_STATE',
        'Only Owner-approved drafts may enter the publish path',
      );
    }

    const reason =
      'Social platform integrations (Facebook, Instagram, TikTok, LinkedIn, Google Business) are not live. Publish execute is gated — nothing was posted.';

    const [updated] = await this.db
      .update(mktAgentContentDrafts)
      .set({
        status: 'publish_gated',
        autoPublish: false,
        socialPublishAvailable: false,
        decisionNotes: input.notes ?? draft.decisionNotes,
        metadata: {
          ...(draft.metadata ?? {}),
          publishRequestedAt: new Date().toISOString(),
          publishRequestedBy: actor.userId,
          publishGated: true,
          published: false,
        },
        updatedAt: new Date(),
      })
      .where(eq(mktAgentContentDrafts.id, draft.id))
      .returning();

    await this.recordAudit(actor, 'mkt_agent_publish_gated', draft.id, {
      published: false,
      gated: true,
      reason,
    });

    return {
      draft: this.toDraft(updated!),
      published: false,
      gated: true,
      reason,
    };
  }

  async listGoals(actor: MktAgentActor): Promise<MktAgentGoalSummary[]> {
    this.assertRead(actor);
    const rows = await this.db
      .select()
      .from(mktAgentGoals)
      .where(eq(mktAgentGoals.companyId, actor.companyId))
      .orderBy(desc(mktAgentGoals.createdAt));
    return rows.map((r) => this.toGoal(r));
  }

  async createGoal(
    actor: MktAgentActor,
    input: CreateMktAgentGoalRequest,
  ): Promise<MktAgentGoalSummary> {
    this.assertWrite(actor);

    const [created] = await this.db
      .insert(mktAgentGoals)
      .values({
        companyId: actor.companyId,
        title: input.title.trim(),
        description: input.description.trim(),
        status: 'active',
        targetMetric: input.targetMetric?.trim() ?? null,
        currentValue: null,
        targetValue: input.targetValue ?? null,
        createdByUserId: actor.userId,
        metadata: { source: 'marketing_agent' },
      })
      .returning();

    await this.recordAudit(actor, 'mkt_agent_goal_created', created!.id, {});
    return this.toGoal(created!);
  }

  async listRecommendations(actor: MktAgentActor): Promise<MktAgentRecommendationSummary[]> {
    this.assertRead(actor);
    const rows = await this.db
      .select()
      .from(mktAgentRecommendations)
      .where(eq(mktAgentRecommendations.companyId, actor.companyId))
      .orderBy(desc(mktAgentRecommendations.createdAt));
    return rows.map((r) => this.toRecommendation(r));
  }

  async createRecommendation(
    actor: MktAgentActor,
    input: CreateMktAgentRecommendationRequest,
  ): Promise<MktAgentRecommendationSummary> {
    this.assertWrite(actor);

    const [created] = await this.db
      .insert(mktAgentRecommendations)
      .values({
        companyId: actor.companyId,
        kind: input.kind,
        status: 'pending_approval',
        title: input.title.trim(),
        recommendation: input.recommendation.trim(),
        channel: input.channel ?? null,
        campaignId: input.campaignId ?? null,
        autoExecuted: false,
        createdByUserId: actor.userId,
        metadata: { source: 'marketing_agent', autoExecuted: false },
      })
      .returning();

    await this.recordAudit(actor, 'mkt_agent_recommendation_created', created!.id, {
      kind: input.kind,
    });

    return this.toRecommendation(created!);
  }

  async decideRecommendation(
    actor: MktAgentActor,
    recommendationId: string,
    input: DecideMktAgentRecommendationRequest,
  ): Promise<MktAgentRecommendationSummary> {
    this.assertApprove(actor);

    const [row] = await this.db
      .select()
      .from(mktAgentRecommendations)
      .where(
        and(
          eq(mktAgentRecommendations.id, recommendationId),
          eq(mktAgentRecommendations.companyId, actor.companyId),
        ),
      )
      .limit(1);

    if (!row) {
      throw new MarketingAgentError('NOT_FOUND', 'Recommendation not found');
    }
    if (row.status !== 'pending_approval') {
      throw new MarketingAgentError('INVALID_STATE', 'Recommendation is not pending approval');
    }

    const status = input.decision === 'approve' ? 'approved' : 'rejected';
    const [updated] = await this.db
      .update(mktAgentRecommendations)
      .set({
        status,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: input.notes ?? null,
        autoExecuted: false,
        updatedAt: new Date(),
      })
      .where(eq(mktAgentRecommendations.id, row.id))
      .returning();

    await this.recordAudit(
      actor,
      input.decision === 'approve'
        ? 'mkt_agent_recommendation_approved'
        : 'mkt_agent_recommendation_rejected',
      row.id,
      { autoExecuted: false },
    );

    return this.toRecommendation(updated!);
  }

  async getAnalytics(actor: MktAgentActor): Promise<MktAgentAnalytics> {
    this.assertRead(actor);
    return this.buildAnalytics(actor);
  }
}
