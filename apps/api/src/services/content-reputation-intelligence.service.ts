import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  buildCriContentTemplate,
  buildCriReputationSnapshot,
  buildCriReviewResponseDraft,
  canAccessContentReputationIntelligence,
  canApproveContentReputationDrafts,
  canWriteContentReputationIntelligence,
  CRI_PRODUCT_COPY,
  detectCriReviewSentiment,
  listCriAuraConnections,
  listDefaultCriContentTemplates,
  scoreCriContentQuality,
  type AcknowledgeCriInsightRequest,
  type CreateCriAuraInsightRequest,
  type CreateCriCompetitorRequest,
  type CreateCriObservationRequest,
  type CreateCriReviewRequest,
  type CreateCriReviewResponseDraftRequest,
  type CriAuraInsightSummary,
  type CriCompetitorObservationSummary,
  type CriCompetitorSummary,
  type CriContentSuggestionSummary,
  type CriDashboard,
  type CriReviewResponseDraftSummary,
  type CriReviewSummary,
  type DecideCriReviewResponseRequest,
  type DecideCriSuggestionRequest,
  type GenerateCriContentSuggestionRequest,
  type ScoreCriContentRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  criAuraInsights,
  criCompetitorObservations,
  criCompetitors,
  criContentSuggestions,
  criReviewResponseDrafts,
  criReviews,
  mktAgentContentDrafts,
  securityAuditLogs,
} from '@titan/db';

export class ContentReputationIntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ContentReputationIntelligenceError';
  }
}

export type CriActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

function asHashtags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

export class ContentReputationIntelligenceService {
  constructor(private readonly db: DatabaseClient) {}

  private assertRead(actor: CriActor): void {
    if (!canAccessContentReputationIntelligence(actor)) {
      throw new ContentReputationIntelligenceError(
        'FORBIDDEN',
        'Content & Reputation Intelligence requires marketing access (Technician/Client denied).',
      );
    }
  }

  private assertWrite(actor: CriActor): void {
    this.assertRead(actor);
    if (!canWriteContentReputationIntelligence(actor)) {
      throw new ContentReputationIntelligenceError(
        'FORBIDDEN',
        'Write actions require marketing:write or marketing_intelligence:write.',
      );
    }
  }

  private assertApprove(actor: CriActor): void {
    this.assertWrite(actor);
    if (!canApproveContentReputationDrafts(actor)) {
      throw new ContentReputationIntelligenceError(
        'FORBIDDEN',
        'Only Company Owner (or marketing_intelligence:manage) may approve outbound content/reputation drafts.',
      );
    }
  }

  private async recordAudit(
    actor: CriActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'ai',
      action,
      entityType: 'content_reputation_intelligence',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        autoPublish: false,
        autoReply: false,
      },
    });
  }

  private toSuggestion(
    row: typeof criContentSuggestions.$inferSelect,
  ): CriContentSuggestionSummary {
    return {
      id: row.id,
      category: row.category,
      channel: row.channel,
      status: row.status,
      title: row.title,
      body: row.body,
      hashtags: asHashtags(row.hashtags),
      marketingDraftId: row.marketingDraftId,
      qualityScore: row.qualityScore,
      qualityAvailability:
        row.qualityAvailability === 'available' ? 'available' : 'unavailable',
      autoPublish: false,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    };
  }

  private toReview(row: typeof criReviews.$inferSelect): CriReviewSummary {
    return {
      id: row.id,
      source: row.source,
      platform: row.platform,
      authorName: row.authorName,
      rating: row.rating,
      body: row.body,
      occurredAt: row.occurredAt?.toISOString() ?? null,
      sentiment: row.sentiment,
      sentimentConfidence: row.sentimentConfidence,
      socialItemId: row.socialItemId,
      customerId: row.customerId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toResponseDraft(
    row: typeof criReviewResponseDrafts.$inferSelect,
  ): CriReviewResponseDraftSummary {
    return {
      id: row.id,
      reviewId: row.reviewId,
      status: row.status,
      title: row.title,
      body: row.body,
      autoReply: false,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    };
  }

  private toCompetitor(row: typeof criCompetitors.$inferSelect): CriCompetitorSummary {
    return {
      id: row.id,
      name: row.name,
      website: row.website,
      notes: row.notes,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toObservation(
    row: typeof criCompetitorObservations.$inferSelect,
  ): CriCompetitorObservationSummary {
    return {
      id: row.id,
      competitorId: row.competitorId,
      kind: row.kind,
      title: row.title,
      body: row.body,
      observedAt: row.observedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toInsight(row: typeof criAuraInsights.$inferSelect): CriAuraInsightSummary {
    return {
      id: row.id,
      target: row.target,
      status: row.status,
      title: row.title,
      insight: row.insight,
      href: row.href,
      sourceSuggestionId: row.sourceSuggestionId,
      sourceReviewId: row.sourceReviewId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async getDashboard(actor: CriActor): Promise<CriDashboard> {
    this.assertRead(actor);

    const [suggestions, reviews, responseDrafts, competitors, observations, insights] =
      await Promise.all([
        this.db
          .select()
          .from(criContentSuggestions)
          .where(eq(criContentSuggestions.companyId, actor.companyId))
          .orderBy(desc(criContentSuggestions.createdAt))
          .limit(50),
        this.db
          .select()
          .from(criReviews)
          .where(eq(criReviews.companyId, actor.companyId))
          .orderBy(desc(criReviews.createdAt))
          .limit(50),
        this.db
          .select()
          .from(criReviewResponseDrafts)
          .where(eq(criReviewResponseDrafts.companyId, actor.companyId))
          .orderBy(desc(criReviewResponseDrafts.createdAt))
          .limit(50),
        this.db
          .select()
          .from(criCompetitors)
          .where(eq(criCompetitors.companyId, actor.companyId))
          .orderBy(desc(criCompetitors.createdAt))
          .limit(50),
        this.db
          .select()
          .from(criCompetitorObservations)
          .where(eq(criCompetitorObservations.companyId, actor.companyId))
          .orderBy(desc(criCompetitorObservations.createdAt))
          .limit(50),
        this.db
          .select()
          .from(criAuraInsights)
          .where(eq(criAuraInsights.companyId, actor.companyId))
          .orderBy(desc(criAuraInsights.createdAt))
          .limit(50),
      ]);

    // Import real social monitoring review rows when table exists (best-effort).
    const socialReviews = await this.loadSocialMonitoringReviews(actor.companyId);

    const allReviewInputs = [
      ...reviews.map((r) => ({ rating: r.rating, sentiment: r.sentiment })),
      ...socialReviews.map((r) => ({
        rating: null as number | null,
        sentiment: detectCriReviewSentiment({ body: r.body }).sentiment,
      })),
    ];

    const reputation = buildCriReputationSnapshot({ reviews: allReviewInputs });

    const pendingApprovals =
      suggestions.filter((s) => s.status === 'pending_approval').length +
      responseDrafts.filter((d) => d.status === 'pending_approval').length;

    const summaryParts = [
      `${suggestions.length} content suggestion(s)`,
      `${reviews.length + socialReviews.length} review signal(s)`,
      `${competitors.length} Owner-entered competitor(s)`,
      reputation.availability === 'available'
        ? `reputation score ${reputation.reputationScore}`
        : 'reputation unavailable without real review signals',
    ];

    return {
      summary: `Content & Reputation Intelligence — ${summaryParts.join('; ')}.`,
      productClarification: {
        marketingAgent: CRI_PRODUCT_COPY.marketingAgent,
        socialMedia: CRI_PRODUCT_COPY.socialMedia,
        thisLayer: CRI_PRODUCT_COPY.thisLayer,
      },
      publishPolicy: {
        autoPublishEnabled: false,
        autoReplyEnabled: false,
        requiresOwnerApproval: true,
      },
      contentSuggestions: suggestions.map((s) => this.toSuggestion(s)),
      reviews: [
        ...reviews.map((r) => this.toReview(r)),
        ...socialReviews.map((r) => ({
          id: `social:${r.id}`,
          source: 'social_monitoring' as const,
          platform: r.platform,
          authorName: r.authorName,
          rating: null,
          body: r.body,
          occurredAt: r.occurredAt,
          sentiment: detectCriReviewSentiment({ body: r.body }).sentiment,
          sentimentConfidence: detectCriReviewSentiment({ body: r.body }).confidence,
          socialItemId: r.id,
          customerId: null,
          createdAt: r.createdAt,
        })),
      ],
      reviewResponseDrafts: responseDrafts.map((d) => this.toResponseDraft(d)),
      reputation,
      competitors: competitors.map((c) => this.toCompetitor(c)),
      observations: observations.map((o) => this.toObservation(o)),
      auraInsights: insights.map((i) => this.toInsight(i)),
      auraConnections: listCriAuraConnections(),
      contentTemplates: listDefaultCriContentTemplates(),
      pendingApprovals,
    };
  }

  private async loadSocialMonitoringReviews(companyId: string): Promise<
    Array<{
      id: string;
      platform: string | null;
      authorName: string | null;
      body: string;
      occurredAt: string | null;
      createdAt: string;
    }>
  > {
    try {
      // Best-effort read of Social Media Integration monitored reviews when 3.2 tables exist.
      const rows = await this.db.execute(sql`
        SELECT id::text AS id,
               platform::text AS platform,
               author_name,
               body,
               occurred_at,
               created_at
        FROM social_media_items
        WHERE company_id = ${companyId}::uuid
          AND item_kind = 'review'
        ORDER BY created_at DESC
        LIMIT 25
      `);
      const list = Array.isArray(rows) ? rows : [];
      return list
        .map((raw) => {
          const r = raw as Record<string, unknown>;
          if (typeof r.id !== 'string' || typeof r.body !== 'string') return null;
          const occurred =
            r.occurred_at instanceof Date
              ? r.occurred_at.toISOString()
              : typeof r.occurred_at === 'string'
                ? r.occurred_at
                : null;
          const created =
            r.created_at instanceof Date
              ? r.created_at.toISOString()
              : typeof r.created_at === 'string'
                ? r.created_at
                : new Date(0).toISOString();
          return {
            id: r.id,
            platform: typeof r.platform === 'string' ? r.platform : null,
            authorName: typeof r.author_name === 'string' ? r.author_name : null,
            body: r.body,
            occurredAt: occurred,
            createdAt: created,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x != null);
    } catch {
      // social_media_items may not exist until Social Media Integration migration is applied.
      return [];
    }
  }

  async scoreContent(actor: CriActor, input: ScoreCriContentRequest) {
    this.assertRead(actor);
    let title = input.title ?? '';
    let body = input.body;
    let hashtags = input.hashtags ?? [];

    if (input.marketingDraftId) {
      const [draft] = await this.db
        .select()
        .from(mktAgentContentDrafts)
        .where(
          and(
            eq(mktAgentContentDrafts.id, input.marketingDraftId),
            eq(mktAgentContentDrafts.companyId, actor.companyId),
          ),
        )
        .limit(1);
      if (!draft) {
        throw new ContentReputationIntelligenceError(
          'NOT_FOUND',
          'Marketing Agent content draft not found for this tenant.',
        );
      }
      title = draft.title;
      body = draft.body;
      hashtags = asHashtags(draft.hashtags);
    }

    const quality = scoreCriContentQuality({ title, body, hashtags, allowHeuristic: true });
    await this.recordAudit(actor, 'cri_content_scored', input.marketingDraftId ?? actor.companyId, {
      availability: quality.availability,
      overallScore: quality.overallScore,
      marketingDraftId: input.marketingDraftId ?? null,
    });
    return quality;
  }

  async generateSuggestion(actor: CriActor, input: GenerateCriContentSuggestionRequest) {
    this.assertWrite(actor);

    let sourceTitle = '';
    let sourceBody = input.sourceText?.trim() ?? '';
    let sourceHashtags: string[] = [];

    if (input.marketingDraftId) {
      const [draft] = await this.db
        .select()
        .from(mktAgentContentDrafts)
        .where(
          and(
            eq(mktAgentContentDrafts.id, input.marketingDraftId),
            eq(mktAgentContentDrafts.companyId, actor.companyId),
          ),
        )
        .limit(1);
      if (!draft) {
        throw new ContentReputationIntelligenceError(
          'NOT_FOUND',
          'Marketing Agent content draft not found for this tenant.',
        );
      }
      sourceTitle = draft.title;
      sourceBody = draft.body;
      sourceHashtags = asHashtags(draft.hashtags);
    }

    const template = buildCriContentTemplate({
      category: input.category,
      channel: input.channel,
      topicHint: input.topicHint,
    });

    const quality = scoreCriContentQuality({
      title: sourceTitle || template.title,
      body: sourceBody || template.body,
      hashtags: sourceHashtags.length ? sourceHashtags : template.hashtags,
      allowHeuristic: true,
    });

    const status = input.submitForApproval ? 'pending_approval' : 'draft';
    const [row] = await this.db
      .insert(criContentSuggestions)
      .values({
        companyId: actor.companyId,
        category: input.category,
        channel: input.channel ?? template.channel,
        status,
        title: template.title,
        body: template.body,
        hashtags: template.hashtags,
        marketingDraftId: input.marketingDraftId ?? null,
        qualityScore: quality.overallScore,
        qualityAvailability: quality.availability,
        qualityDetails: quality as unknown as Record<string, unknown>,
        autoPublish: false,
        createdByUserId: actor.userId,
      })
      .returning();

    await this.recordAudit(actor, 'cri_content_suggestion_created', row!.id, {
      category: input.category,
      status,
      qualityAvailability: quality.availability,
    });

    return this.toSuggestion(row!);
  }

  async decideSuggestion(
    actor: CriActor,
    suggestionId: string,
    input: DecideCriSuggestionRequest,
  ) {
    this.assertApprove(actor);
    const [existing] = await this.db
      .select()
      .from(criContentSuggestions)
      .where(
        and(
          eq(criContentSuggestions.id, suggestionId),
          eq(criContentSuggestions.companyId, actor.companyId),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new ContentReputationIntelligenceError('NOT_FOUND', 'Content suggestion not found.');
    }
    if (existing.status !== 'pending_approval' && existing.status !== 'draft') {
      throw new ContentReputationIntelligenceError(
        'INVALID_STATE',
        `Cannot decide suggestion in status ${existing.status}.`,
      );
    }

    const status = input.decision === 'approve' ? 'approved' : 'rejected';
    const [row] = await this.db
      .update(criContentSuggestions)
      .set({
        status,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: input.notes ?? null,
        updatedAt: new Date(),
        autoPublish: false,
      })
      .where(
        and(
          eq(criContentSuggestions.id, suggestionId),
          eq(criContentSuggestions.companyId, actor.companyId),
        ),
      )
      .returning();

    await this.recordAudit(
      actor,
      status === 'approved' ? 'cri_content_suggestion_approved' : 'cri_content_suggestion_rejected',
      suggestionId,
      { notes: input.notes ?? null, autoPublish: false },
    );
    return this.toSuggestion(row!);
  }

  async createReview(actor: CriActor, input: CreateCriReviewRequest) {
    this.assertWrite(actor);
    const body = input.body.trim();
    if (!body) {
      throw new ContentReputationIntelligenceError('VALIDATION', 'Review body is required.');
    }
    const sentiment = detectCriReviewSentiment({ body, rating: input.rating ?? null });
    const [row] = await this.db
      .insert(criReviews)
      .values({
        companyId: actor.companyId,
        source: input.source ?? 'owner_entered',
        platform: input.platform ?? null,
        authorName: input.authorName ?? null,
        rating: input.rating ?? null,
        body,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : null,
        sentiment: sentiment.sentiment,
        sentimentConfidence: sentiment.confidence,
        socialItemId: input.socialItemId ?? null,
        customerId: input.customerId ?? null,
        createdByUserId: actor.userId,
      })
      .returning();

    await this.recordAudit(actor, 'cri_review_created', row!.id, {
      source: input.source ?? 'owner_entered',
      sentiment: sentiment.sentiment,
      invented: false,
    });
    return this.toReview(row!);
  }

  async createReviewResponseDraft(
    actor: CriActor,
    input: CreateCriReviewResponseDraftRequest,
  ) {
    this.assertWrite(actor);
    const [review] = await this.db
      .select()
      .from(criReviews)
      .where(and(eq(criReviews.id, input.reviewId), eq(criReviews.companyId, actor.companyId)))
      .limit(1);
    if (!review) {
      throw new ContentReputationIntelligenceError('NOT_FOUND', 'Review not found.');
    }

    const generated = buildCriReviewResponseDraft({
      authorName: review.authorName,
      body: review.body,
      sentiment: review.sentiment,
      rating: review.rating,
    });

    const status = input.submitForApproval ? 'pending_approval' : 'draft';
    const [row] = await this.db
      .insert(criReviewResponseDrafts)
      .values({
        companyId: actor.companyId,
        reviewId: review.id,
        status,
        title: input.title?.trim() || generated.title,
        body: input.body?.trim() || generated.body,
        autoReply: false,
        createdByUserId: actor.userId,
      })
      .returning();

    await this.recordAudit(actor, 'cri_review_response_draft_created', row!.id, {
      reviewId: review.id,
      status,
      autoReply: false,
    });
    return this.toResponseDraft(row!);
  }

  async decideReviewResponse(
    actor: CriActor,
    draftId: string,
    input: DecideCriReviewResponseRequest,
  ) {
    this.assertApprove(actor);
    const [existing] = await this.db
      .select()
      .from(criReviewResponseDrafts)
      .where(
        and(
          eq(criReviewResponseDrafts.id, draftId),
          eq(criReviewResponseDrafts.companyId, actor.companyId),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new ContentReputationIntelligenceError(
        'NOT_FOUND',
        'Review response draft not found.',
      );
    }
    if (existing.status !== 'pending_approval' && existing.status !== 'draft') {
      throw new ContentReputationIntelligenceError(
        'INVALID_STATE',
        `Cannot decide draft in status ${existing.status}.`,
      );
    }

    const status = input.decision === 'approve' ? 'approved' : 'rejected';
    const [row] = await this.db
      .update(criReviewResponseDrafts)
      .set({
        status,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: input.notes ?? null,
        updatedAt: new Date(),
        autoReply: false,
      })
      .where(
        and(
          eq(criReviewResponseDrafts.id, draftId),
          eq(criReviewResponseDrafts.companyId, actor.companyId),
        ),
      )
      .returning();

    await this.recordAudit(
      actor,
      status === 'approved'
        ? 'cri_review_response_approved'
        : 'cri_review_response_rejected',
      draftId,
      { autoReply: false, published: false },
    );
    return this.toResponseDraft(row!);
  }

  async createCompetitor(actor: CriActor, input: CreateCriCompetitorRequest) {
    this.assertWrite(actor);
    const name = input.name.trim();
    if (!name) {
      throw new ContentReputationIntelligenceError('VALIDATION', 'Competitor name is required.');
    }
    const [row] = await this.db
      .insert(criCompetitors)
      .values({
        companyId: actor.companyId,
        name,
        website: input.website?.trim() || null,
        notes: input.notes?.trim() || null,
        active: true,
        createdByUserId: actor.userId,
      })
      .returning();

    await this.recordAudit(actor, 'cri_competitor_created', row!.id, {
      name,
      invented: false,
      ownerEntered: true,
    });
    return this.toCompetitor(row!);
  }

  async createObservation(actor: CriActor, input: CreateCriObservationRequest) {
    this.assertWrite(actor);
    if (input.competitorId) {
      const [comp] = await this.db
        .select()
        .from(criCompetitors)
        .where(
          and(
            eq(criCompetitors.id, input.competitorId),
            eq(criCompetitors.companyId, actor.companyId),
          ),
        )
        .limit(1);
      if (!comp) {
        throw new ContentReputationIntelligenceError(
          'NOT_FOUND',
          'Competitor not found for this tenant.',
        );
      }
    }

    const [row] = await this.db
      .insert(criCompetitorObservations)
      .values({
        companyId: actor.companyId,
        competitorId: input.competitorId ?? null,
        kind: input.kind,
        title: input.title.trim(),
        body: input.body.trim(),
        observedAt: input.observedAt ? new Date(input.observedAt) : null,
        createdByUserId: actor.userId,
      })
      .returning();

    await this.recordAudit(actor, 'cri_observation_created', row!.id, {
      kind: input.kind,
      competitorId: input.competitorId ?? null,
      scraping: false,
    });
    return this.toObservation(row!);
  }

  async createAuraInsight(actor: CriActor, input: CreateCriAuraInsightRequest) {
    this.assertWrite(actor);
    const [row] = await this.db
      .insert(criAuraInsights)
      .values({
        companyId: actor.companyId,
        target: input.target,
        status: 'open',
        title: input.title.trim(),
        insight: input.insight.trim(),
        href: input.href ?? null,
        sourceSuggestionId: input.sourceSuggestionId ?? null,
        sourceReviewId: input.sourceReviewId ?? null,
        createdByUserId: actor.userId,
      })
      .returning();

    await this.recordAudit(actor, 'cri_aura_insight_created', row!.id, {
      target: input.target,
      invented: false,
    });
    return this.toInsight(row!);
  }

  async acknowledgeInsight(
    actor: CriActor,
    insightId: string,
    input: AcknowledgeCriInsightRequest,
  ) {
    this.assertWrite(actor);
    const [existing] = await this.db
      .select()
      .from(criAuraInsights)
      .where(
        and(eq(criAuraInsights.id, insightId), eq(criAuraInsights.companyId, actor.companyId)),
      )
      .limit(1);
    if (!existing) {
      throw new ContentReputationIntelligenceError('NOT_FOUND', 'AURA insight not found.');
    }

    const [row] = await this.db
      .update(criAuraInsights)
      .set({ status: input.status, updatedAt: new Date() })
      .where(
        and(eq(criAuraInsights.id, insightId), eq(criAuraInsights.companyId, actor.companyId)),
      )
      .returning();

    await this.recordAudit(actor, 'cri_aura_insight_updated', insightId, {
      status: input.status,
    });
    return this.toInsight(row!);
  }

  async syncSocialReviewsIntoFoundation(actor: CriActor): Promise<{ imported: number }> {
    this.assertWrite(actor);
    const social = await this.loadSocialMonitoringReviews(actor.companyId);
    if (social.length === 0) return { imported: 0 };

    const socialIds = social.map((s) => s.id);
    const existing =
      socialIds.length === 0
        ? []
        : await this.db
            .select({ socialItemId: criReviews.socialItemId })
            .from(criReviews)
            .where(
              and(
                eq(criReviews.companyId, actor.companyId),
                inArray(criReviews.socialItemId, socialIds),
              ),
            );
    const have = new Set(
      existing.map((e) => e.socialItemId).filter((id): id is string => Boolean(id)),
    );

    let imported = 0;
    for (const item of social) {
      if (have.has(item.id)) continue;
      const sentiment = detectCriReviewSentiment({ body: item.body });
      await this.db.insert(criReviews).values({
        companyId: actor.companyId,
        source: 'social_monitoring',
        platform: item.platform,
        authorName: item.authorName,
        rating: null,
        body: item.body,
        occurredAt: item.occurredAt ? new Date(item.occurredAt) : null,
        sentiment: sentiment.sentiment,
        sentimentConfidence: sentiment.confidence,
        socialItemId: item.id,
        createdByUserId: actor.userId,
      });
      imported += 1;
    }

    await this.recordAudit(actor, 'cri_social_reviews_synced', actor.companyId, {
      imported,
      invented: false,
    });
    return { imported };
  }
}
