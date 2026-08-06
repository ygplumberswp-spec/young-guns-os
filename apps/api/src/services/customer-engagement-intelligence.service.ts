import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import {
  aggregateCeiSatisfaction,
  buildCeiEtaUpdateDraft,
  buildCeiFollowUpDraft,
  buildCeiMaintenanceReminderDraft,
  buildCeiNotificationDraft,
  buildCeiReviewRequestDraft,
  canAccessCustomerEngagementIntelligence,
  canApproveCustomerEngagementOutreach,
  canWriteCustomerEngagementIntelligence,
  CEI_PRODUCT_COPY,
  detectCeiSentimentFromText,
  emptyCeiDraftKindCounts,
  resolveCeiJobEtaSuggestion,
  scoreCeiCustomerRelationship,
  type CeiChannel,
  type CeiCommunicationScoreSummary,
  type CeiDashboard,
  type CeiDraftKind,
  type CeiEtaSuggestion,
  type CeiFollowUpSuggestion,
  type CeiMaintenanceLinkSuggestion,
  type CeiOutreachDraftSummary,
  type CeiRelationshipScoreSummary,
  type CeiRetentionOpportunity,
  type CeiSatisfactionSummary,
  type CeiSentiment,
  type CreateCeiDraftRequest,
  type DecideCeiDraftRequest,
  type GenerateCeiEtaDraftsRequest,
  type GenerateCeiFollowUpDraftsRequest,
  type GenerateCeiMaintenanceReminderDraftsRequest,
  type GenerateCeiReviewRequestDraftsRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  ceiCommScoreSnapshots,
  ceiOutreachDrafts,
  ceiRelationshipScores,
  commAuraCustomerInsights,
  companies,
  customers,
  cxReviewsFeedback,
  jobs,
  opsRecurringMaintenancePlans,
  hsSubscriptions,
  hsRenewalOpportunities,
  hsMembershipPlans,
  securityAuditLogs,
} from '@titan/db';

export class CustomerEngagementIntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CustomerEngagementIntelligenceError';
  }
}

export type CeiActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

export class CustomerEngagementIntelligenceService {
  constructor(private readonly db: DatabaseClient) {}

  private assertRead(actor: CeiActor): void {
    if (!canAccessCustomerEngagementIntelligence(actor)) {
      throw new CustomerEngagementIntelligenceError(
        'FORBIDDEN',
        'Customer Engagement Intelligence requires CX/customers/communications access (Technician/Client denied).',
      );
    }
  }

  private assertWrite(actor: CeiActor): void {
    this.assertRead(actor);
    if (!canWriteCustomerEngagementIntelligence(actor)) {
      throw new CustomerEngagementIntelligenceError(
        'FORBIDDEN',
        'Write actions require customer_experience:write, customers:write, communications:write/manage, or portal:manage.',
      );
    }
  }

  private assertApprove(actor: CeiActor): void {
    this.assertWrite(actor);
    if (!canApproveCustomerEngagementOutreach(actor)) {
      throw new CustomerEngagementIntelligenceError(
        'FORBIDDEN',
        'Only Owner/ops (or elevated CX/communications manage) may approve outbound engagement drafts.',
      );
    }
  }

  private async recordAudit(
    actor: CeiActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'communications',
      action,
      entityType: 'customer_engagement_intelligence',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        autoSend: false,
      },
    });
  }

  private async companyName(companyId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    return row?.name ?? null;
  }

  private async customerName(
    companyId: string,
    customerId: string | null | undefined,
  ): Promise<string | null> {
    if (!customerId) return null;
    const [row] = await this.db
      .select({ name: customers.name })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.companyId, companyId)))
      .limit(1);
    return row?.name ?? null;
  }

  private toDraft(
    row: typeof ceiOutreachDrafts.$inferSelect,
    customerName: string | null,
  ): CeiOutreachDraftSummary {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      channel: row.channel,
      customerId: row.customerId,
      customerName,
      jobId: row.jobId,
      maintenancePlanId: row.maintenancePlanId ?? null,
      subject: row.subject,
      body: row.body,
      autoSend: false,
      etaSuggestionAt: row.etaSuggestionAt?.toISOString() ?? null,
      etaAvailability: row.etaAvailability === 'available' ? 'available' : 'unavailable',
      linkedCommAuraScoreId: row.linkedCommAuraScoreId,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    };
  }

  private async loadSatisfaction(companyId: string): Promise<CeiSatisfactionSummary> {
    const rows = await this.db
      .select({
        id: cxReviewsFeedback.id,
        customerId: cxReviewsFeedback.customerId,
        customerName: customers.name,
        jobId: cxReviewsFeedback.jobId,
        reviewType: cxReviewsFeedback.reviewType,
        rating: cxReviewsFeedback.rating,
        subject: cxReviewsFeedback.subject,
        feedback: cxReviewsFeedback.feedback,
        createdAt: cxReviewsFeedback.createdAt,
      })
      .from(cxReviewsFeedback)
      .leftJoin(customers, eq(customers.id, cxReviewsFeedback.customerId))
      .where(eq(cxReviewsFeedback.companyId, companyId))
      .orderBy(desc(cxReviewsFeedback.createdAt))
      .limit(100);

    const sentiments: CeiSentiment[] = rows.map(
      (r) => detectCeiSentimentFromText({ subject: r.subject, body: r.feedback }).sentiment,
    );
    const agg = aggregateCeiSatisfaction({
      ratings: rows.map((r) => r.rating),
      sentiments,
    });

    const byReviewType: Record<string, number> = {};
    for (const row of rows) {
      byReviewType[row.reviewType] = (byReviewType[row.reviewType] ?? 0) + 1;
    }

    return {
      availability: agg.availability,
      reviewCount: rows.length,
      averageRating: agg.averageRating,
      sentiment: agg.sentiment,
      byReviewType,
      recent: rows.slice(0, 20).map((r) => ({
        id: r.id,
        customerId: r.customerId,
        customerName: r.customerName ?? null,
        jobId: r.jobId,
        reviewType: r.reviewType,
        rating: r.rating,
        subject: r.subject,
        createdAt: r.createdAt.toISOString(),
      })),
      note: agg.note,
    };
  }

  private async loadEtaSuggestions(companyId: string, limit = 25): Promise<CeiEtaSuggestion[]> {
    const rows = await this.db
      .select({
        id: jobs.id,
        customerId: jobs.customerId,
        customerName: customers.name,
        title: jobs.title,
        status: jobs.status,
        assignedUserId: jobs.assignedUserId,
        scheduledAt: jobs.scheduledAt,
        scheduledEndAt: jobs.scheduledEndAt,
      })
      .from(jobs)
      .leftJoin(customers, eq(customers.id, jobs.customerId))
      .where(
        and(
          eq(jobs.companyId, companyId),
          inArray(jobs.status, ['new', 'scheduled', 'in_progress']),
        ),
      )
      .orderBy(desc(jobs.updatedAt))
      .limit(Math.min(Math.max(limit, 1), 100));

    return rows.map((row) =>
      resolveCeiJobEtaSuggestion({
        jobId: row.id,
        customerId: row.customerId,
        customerName: row.customerName ?? null,
        jobTitle: row.title,
        status: row.status,
        assignedUserId: row.assignedUserId,
        scheduledAt: row.scheduledAt,
        scheduledEndAt: row.scheduledEndAt,
      }),
    );
  }

  private async refreshCommunicationScores(
    actor: CeiActor,
  ): Promise<CeiCommunicationScoreSummary[]> {
    let insightRows: Array<typeof commAuraCustomerInsights.$inferSelect> = [];
    try {
      insightRows = await this.db
        .select()
        .from(commAuraCustomerInsights)
        .where(eq(commAuraCustomerInsights.companyId, actor.companyId))
        .orderBy(desc(commAuraCustomerInsights.updatedAt))
        .limit(50);
    } catch {
      insightRows = [];
    }

    if (insightRows.length === 0) {
      return [];
    }

    const customerIds = insightRows.map((r) => r.customerId);
    const customerRows = await this.db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(and(eq(customers.companyId, actor.companyId), inArray(customers.id, customerIds)));
    const nameById = new Map(customerRows.map((c) => [c.id, c.name]));

    const summaries: CeiCommunicationScoreSummary[] = [];
    for (const row of insightRows) {
      const availability =
        row.averageScore === null || row.messageCount === 0 ? 'unavailable' : 'available';
      const summary: CeiCommunicationScoreSummary = {
        customerId: row.customerId,
        customerName: nameById.get(row.customerId) ?? null,
        availability,
        averageScore: availability === 'available' ? row.averageScore : null,
        messageCount: row.messageCount,
        dominantSentiment: (row.dominantSentiment as CeiSentiment) ?? 'unavailable',
        lastCommunicationAt: row.lastCommunicationAt?.toISOString() ?? null,
        source: 'communication_aura_intelligence',
        summary:
          row.summary?.trim() ||
          (availability === 'available'
            ? `Linked Communication AURA score from ${row.messageCount} real message(s).`
            : 'Communication AURA insight present but average score unavailable.'),
      };
      summaries.push(summary);

      const [existing] = await this.db
        .select({ id: ceiCommScoreSnapshots.id })
        .from(ceiCommScoreSnapshots)
        .where(
          and(
            eq(ceiCommScoreSnapshots.companyId, actor.companyId),
            eq(ceiCommScoreSnapshots.customerId, row.customerId),
          ),
        )
        .limit(1);

      if (existing) {
        await this.db
          .update(ceiCommScoreSnapshots)
          .set({
            availability,
            averageScore: summary.averageScore,
            messageCount: row.messageCount,
            dominantSentiment: summary.dominantSentiment,
            lastCommunicationAt: row.lastCommunicationAt,
            source: 'communication_aura_intelligence',
            summary: summary.summary,
            metadata: { linkedCommAuraInsightId: row.id },
            updatedAt: new Date(),
          })
          .where(eq(ceiCommScoreSnapshots.id, existing.id));
      } else {
        await this.db.insert(ceiCommScoreSnapshots).values({
          companyId: actor.companyId,
          customerId: row.customerId,
          availability,
          averageScore: summary.averageScore,
          messageCount: row.messageCount,
          dominantSentiment: summary.dominantSentiment,
          lastCommunicationAt: row.lastCommunicationAt,
          source: 'communication_aura_intelligence',
          summary: summary.summary,
          metadata: { linkedCommAuraInsightId: row.id },
        });
      }
    }

    return summaries;
  }

  async getDashboard(actor: CeiActor): Promise<CeiDashboard> {
    this.assertRead(actor);

    const draftRows = await this.db
      .select()
      .from(ceiOutreachDrafts)
      .where(eq(ceiOutreachDrafts.companyId, actor.companyId))
      .orderBy(desc(ceiOutreachDrafts.createdAt))
      .limit(100);

    const customerIds = [
      ...new Set(draftRows.map((d) => d.customerId).filter((id): id is string => Boolean(id))),
    ];
    const customerNameRows =
      customerIds.length > 0
        ? await this.db
            .select({ id: customers.id, name: customers.name })
            .from(customers)
            .where(and(eq(customers.companyId, actor.companyId), inArray(customers.id, customerIds)))
        : [];
    const nameById = new Map(customerNameRows.map((c) => [c.id, c.name]));

    const draftCountsByKind = emptyCeiDraftKindCounts();
    let pendingDraftApprovals = 0;
    const draftQueue: CeiOutreachDraftSummary[] = [];
    for (const row of draftRows) {
      draftCountsByKind[row.kind] += 1;
      if (row.status === 'pending_approval' || row.status === 'draft') {
        if (row.status === 'pending_approval') pendingDraftApprovals += 1;
        draftQueue.push(
          this.toDraft(row, row.customerId ? nameById.get(row.customerId) ?? null : null),
        );
      }
    }

    const satisfaction = await this.loadSatisfaction(actor.companyId);
    const etaSuggestions = await this.loadEtaSuggestions(actor.companyId);
    const etaAvailability = etaSuggestions.some((e) => e.availability === 'available')
      ? 'available'
      : 'unavailable';

    let communicationScores: CeiCommunicationScoreSummary[] = [];
    let communicationAuraPresent = false;
    try {
      communicationScores = await this.refreshCommunicationScores(actor);
      communicationAuraPresent = communicationScores.length > 0;
    } catch {
      communicationScores = [];
      communicationAuraPresent = false;
    }

    const communicationScoreAvailability = communicationScores.some(
      (s) => s.availability === 'available',
    )
      ? 'available'
      : 'unavailable';

    const followUpSuggestions = await this.loadFollowUpSuggestions(actor.companyId);
    const relationshipScores = await this.computeRelationshipScores(actor);
    const relationshipScoreAvailability = relationshipScores.some(
      (s) => s.availability === 'available',
    )
      ? 'available'
      : 'unavailable';
    const maintenanceLinks = await this.loadMaintenanceLinks(actor.companyId);
    const maintenanceAvailability = maintenanceLinks.length > 0 ? 'available' : 'unavailable';
    const retentionOpportunities = await this.loadRetentionOpportunities(actor);
    const retentionAvailability = retentionOpportunities.length > 0 ? 'available' : 'unavailable';
    const homeShieldPresent = retentionOpportunities.some(
      (r) => r.homeShieldSubscriptionId !== null || r.homeShieldRenewalOpportunityId !== null,
    );

    return {
      summary:
        pendingDraftApprovals > 0
          ? `${pendingDraftApprovals} engagement draft(s) awaiting Owner/ops approval. Nothing is auto-sent.`
          : 'No pending engagement approvals. Satisfaction, ETA, follow-ups, relationship/retention scores use real tenant data only.',
      productClarification: { ...CEI_PRODUCT_COPY },
      pendingDraftApprovals,
      draftCountsByKind,
      satisfaction,
      etaSuggestions: etaSuggestions.slice(0, 25),
      etaAvailability,
      communicationScores: communicationScores.slice(0, 25),
      communicationScoreAvailability,
      draftQueue: draftQueue.slice(0, 50),
      followUpSuggestions: followUpSuggestions.slice(0, 25),
      relationshipScores: relationshipScores.slice(0, 25),
      relationshipScoreAvailability,
      maintenanceLinks: maintenanceLinks.slice(0, 25),
      maintenanceAvailability,
      retentionOpportunities: retentionOpportunities.slice(0, 25),
      retentionAvailability,
      connections: {
        communicationAuraIntelligence: communicationAuraPresent,
        communicationTimeline: communicationAuraPresent,
        contentReputationIntelligence: true,
        enterpriseCustomerExperience: true,
        recurringMaintenance: maintenanceLinks.length > 0,
        homeShieldExperience: homeShieldPresent,
        customer360: false,
      },
      sendPolicy: {
        autoSendEnabled: false,
        requiresOwnerApproval: true,
        draftApproveExecute: true,
      },
    };

  }

  async createDraft(actor: CeiActor, input: CreateCeiDraftRequest): Promise<CeiOutreachDraftSummary> {
    this.assertWrite(actor);

    if (input.customerId) {
      const [exists] = await this.db
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.id, input.customerId), eq(customers.companyId, actor.companyId)))
        .limit(1);
      if (!exists) {
        throw new CustomerEngagementIntelligenceError(
          'NOT_FOUND',
          'Customer not found in this tenant — drafts cannot invent customers.',
        );
      }
    }

    let jobTitle: string | null = null;
    let jobEta: ReturnType<typeof resolveCeiJobEtaSuggestion> | null = null;
    if (input.jobId) {
      const [job] = await this.db
        .select({
          id: jobs.id,
          customerId: jobs.customerId,
          title: jobs.title,
          status: jobs.status,
          assignedUserId: jobs.assignedUserId,
          scheduledAt: jobs.scheduledAt,
          scheduledEndAt: jobs.scheduledEndAt,
        })
        .from(jobs)
        .where(and(eq(jobs.id, input.jobId), eq(jobs.companyId, actor.companyId)))
        .limit(1);
      if (!job) {
        throw new CustomerEngagementIntelligenceError(
          'NOT_FOUND',
          'Job not found in this tenant — ETA drafts require real jobs.',
        );
      }
      jobTitle = job.title;
      const custName = await this.customerName(actor.companyId, input.customerId ?? job.customerId);
      jobEta = resolveCeiJobEtaSuggestion({
        jobId: job.id,
        customerId: input.customerId ?? job.customerId,
        customerName: custName,
        jobTitle: job.title,
        status: job.status,
        assignedUserId: job.assignedUserId,
        scheduledAt: job.scheduledAt,
        scheduledEndAt: job.scheduledEndAt,
      });
    }

    const company = await this.companyName(actor.companyId);
    const customerName = await this.customerName(actor.companyId, input.customerId);
    const channel: CeiChannel = input.channel ?? 'email';
    const kind: CeiDraftKind = input.kind;

    let subject = input.subject?.trim() ?? '';
    let body = input.body?.trim() ?? '';
    let etaSuggestionAt: Date | null = null;
    let etaAvailability: 'available' | 'unavailable' = 'unavailable';

    if (!subject || !body) {
      if (kind === 'eta_update') {
        const built = buildCeiEtaUpdateDraft({
          customerName,
          jobTitle,
          etaAt: jobEta?.etaAt ?? null,
          companyName: company,
        });
        subject = subject || built.subject;
        body = body || built.body;
        etaAvailability = built.etaAvailability;
        etaSuggestionAt = jobEta?.etaAt ? new Date(jobEta.etaAt) : null;
      } else if (kind === 'review_request' || kind === 'satisfaction_follow_up') {
        const built = buildCeiReviewRequestDraft({
          customerName,
          jobTitle,
          companyName: company,
        });
        subject = subject || built.subject;
        body = body || built.body;
      } else {
        const built = buildCeiNotificationDraft({
          customerName,
          subjectHint: input.subject,
          companyName: company,
        });
        subject = subject || built.subject;
        body = body || built.body;
      }
    } else if (kind === 'eta_update' && jobEta) {
      etaAvailability = jobEta.availability;
      etaSuggestionAt = jobEta.etaAt ? new Date(jobEta.etaAt) : null;
    }

    const status = input.submitForApproval ? 'pending_approval' : 'draft';
    const [inserted] = await this.db
      .insert(ceiOutreachDrafts)
      .values({
        companyId: actor.companyId,
        kind,
        status,
        channel,
        customerId: input.customerId ?? jobEta?.customerId ?? null,
        jobId: input.jobId ?? null,
        subject,
        body,
        autoSend: false,
        etaSuggestionAt,
        etaAvailability,
        createdByUserId: actor.userId,
        metadata: { source: 'manual_create' },
      })
      .returning();

    await this.recordAudit(actor, 'cei_draft_created', inserted.id, {
      kind,
      status,
      customerId: inserted.customerId,
      jobId: inserted.jobId,
    });

    return this.toDraft(inserted, customerName ?? jobEta?.customerName ?? null);
  }

  async generateEtaDrafts(
    actor: CeiActor,
    input: GenerateCeiEtaDraftsRequest = {},
  ): Promise<{ created: number; drafts: CeiOutreachDraftSummary[] }> {
    this.assertWrite(actor);
    const suggestions = await this.loadEtaSuggestions(actor.companyId, input.limit ?? 15);
    const available = suggestions.filter((s) => s.availability === 'available');
    if (available.length === 0) {
      return { created: 0, drafts: [] };
    }

    const company = await this.companyName(actor.companyId);
    const status = input.submitForApproval ? 'pending_approval' : 'draft';
    const drafts: CeiOutreachDraftSummary[] = [];

    for (const suggestion of available.slice(0, Math.min(input.limit ?? 15, 25))) {
      const built = buildCeiEtaUpdateDraft({
        customerName: suggestion.customerName,
        jobTitle: suggestion.jobTitle,
        etaAt: suggestion.etaAt,
        companyName: company,
      });
      const [inserted] = await this.db
        .insert(ceiOutreachDrafts)
        .values({
          companyId: actor.companyId,
          kind: 'eta_update',
          status,
          channel: 'email',
          customerId: suggestion.customerId,
          jobId: suggestion.jobId,
          subject: built.subject,
          body: built.body,
          autoSend: false,
          etaSuggestionAt: suggestion.etaAt ? new Date(suggestion.etaAt) : null,
          etaAvailability: 'available',
          createdByUserId: actor.userId,
          metadata: { source: 'eta_generate', rationale: suggestion.rationale },
        })
        .returning();
      drafts.push(this.toDraft(inserted, suggestion.customerName));
    }

    await this.recordAudit(actor, 'cei_eta_drafts_generated', actor.companyId, {
      created: drafts.length,
      autoSend: false,
    });

    return { created: drafts.length, drafts };
  }

  async generateReviewRequestDrafts(
    actor: CeiActor,
    input: GenerateCeiReviewRequestDraftsRequest = {},
  ): Promise<{ created: number; drafts: CeiOutreachDraftSummary[] }> {
    this.assertWrite(actor);
    const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);
    const completedJobs = await this.db
      .select({
        id: jobs.id,
        customerId: jobs.customerId,
        title: jobs.title,
        customerName: customers.name,
      })
      .from(jobs)
      .leftJoin(customers, eq(customers.id, jobs.customerId))
      .where(and(eq(jobs.companyId, actor.companyId), eq(jobs.status, 'completed')))
      .orderBy(desc(jobs.updatedAt))
      .limit(limit);

    if (completedJobs.length === 0) {
      return { created: 0, drafts: [] };
    }

    const company = await this.companyName(actor.companyId);
    const channel: CeiChannel = input.channel ?? 'email';
    const status = input.submitForApproval ? 'pending_approval' : 'draft';
    const drafts: CeiOutreachDraftSummary[] = [];

    for (const job of completedJobs) {
      if (!job.customerId) continue;
      const built = buildCeiReviewRequestDraft({
        customerName: job.customerName,
        jobTitle: job.title,
        companyName: company,
      });
      const [inserted] = await this.db
        .insert(ceiOutreachDrafts)
        .values({
          companyId: actor.companyId,
          kind: 'review_request',
          status,
          channel,
          customerId: job.customerId,
          jobId: job.id,
          subject: built.subject,
          body: built.body,
          autoSend: false,
          etaAvailability: 'unavailable',
          createdByUserId: actor.userId,
          metadata: { source: 'review_request_generate' },
        })
        .returning();
      drafts.push(this.toDraft(inserted, job.customerName ?? null));
    }

    await this.recordAudit(actor, 'cei_review_request_drafts_generated', actor.companyId, {
      created: drafts.length,
      autoSend: false,
    });

    return { created: drafts.length, drafts };
  }

  async decideDraft(
    actor: CeiActor,
    draftId: string,
    input: DecideCeiDraftRequest,
  ): Promise<CeiOutreachDraftSummary> {
    this.assertApprove(actor);

    const [row] = await this.db
      .select()
      .from(ceiOutreachDrafts)
      .where(and(eq(ceiOutreachDrafts.id, draftId), eq(ceiOutreachDrafts.companyId, actor.companyId)))
      .limit(1);

    if (!row) {
      throw new CustomerEngagementIntelligenceError('NOT_FOUND', 'Engagement draft not found.');
    }
    if (row.status !== 'pending_approval' && row.status !== 'draft') {
      throw new CustomerEngagementIntelligenceError(
        'INVALID_STATE',
        `Draft cannot be decided from status ${row.status}.`,
      );
    }

    const nextStatus = input.decision === 'approve' ? 'approved' : 'rejected';
    const [updated] = await this.db
      .update(ceiOutreachDrafts)
      .set({
        status: nextStatus,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: input.notes?.trim() || null,
        updatedAt: new Date(),
        autoSend: false,
      })
      .where(and(eq(ceiOutreachDrafts.id, draftId), eq(ceiOutreachDrafts.companyId, actor.companyId)))
      .returning();

    await this.recordAudit(
      actor,
      input.decision === 'approve' ? 'cei_draft_approved' : 'cei_draft_rejected',
      draftId,
      {
        kind: row.kind,
        note: 'Approval does not send — use Email Centre / approved outbound execute path.',
        autoSend: false,
      },
    );

    const customerName = await this.customerName(actor.companyId, updated.customerId);
    return this.toDraft(updated, customerName);
  }

  async listDrafts(actor: CeiActor): Promise<CeiOutreachDraftSummary[]> {
    this.assertRead(actor);
    const rows = await this.db
      .select()
      .from(ceiOutreachDrafts)
      .where(
        and(
          eq(ceiOutreachDrafts.companyId, actor.companyId),
          ne(ceiOutreachDrafts.status, 'cancelled'),
        ),
      )
      .orderBy(desc(ceiOutreachDrafts.createdAt))
      .limit(100);

    const customerIds = [
      ...new Set(rows.map((d) => d.customerId).filter((id): id is string => Boolean(id))),
    ];
    const customerNameRows =
      customerIds.length > 0
        ? await this.db
            .select({ id: customers.id, name: customers.name })
            .from(customers)
            .where(and(eq(customers.companyId, actor.companyId), inArray(customers.id, customerIds)))
        : [];
    const nameById = new Map(customerNameRows.map((c) => [c.id, c.name]));
    return rows.map((row) =>
      this.toDraft(row, row.customerId ? nameById.get(row.customerId) ?? null : null),
    );
  }

  async syncCommunicationScores(actor: CeiActor): Promise<{
    synced: number;
    availability: 'available' | 'unavailable';
    scores: CeiCommunicationScoreSummary[];
  }> {
    this.assertWrite(actor);
    const scores = await this.refreshCommunicationScores(actor);
    await this.recordAudit(actor, 'cei_comm_scores_synced', actor.companyId, {
      synced: scores.length,
      source: 'communication_aura_intelligence',
    });
    return {
      synced: scores.length,
      availability: scores.some((s) => s.availability === 'available') ? 'available' : 'unavailable',
      scores,
    };
  }

  private async loadMaintenanceLinks(companyId: string): Promise<CeiMaintenanceLinkSuggestion[]> {
    try {
      const rows = await this.db
        .select({
          id: opsRecurringMaintenancePlans.id,
          name: opsRecurringMaintenancePlans.name,
          customerId: opsRecurringMaintenancePlans.customerId,
          customerName: customers.name,
          jobId: opsRecurringMaintenancePlans.jobId,
          status: opsRecurringMaintenancePlans.status,
          nextDueAt: opsRecurringMaintenancePlans.nextDueAt,
        })
        .from(opsRecurringMaintenancePlans)
        .leftJoin(customers, eq(customers.id, opsRecurringMaintenancePlans.customerId))
        .where(eq(opsRecurringMaintenancePlans.companyId, companyId))
        .orderBy(desc(opsRecurringMaintenancePlans.updatedAt))
        .limit(50);

      return rows.map((row) => ({
        planId: row.id,
        planName: row.name,
        customerId: row.customerId,
        customerName: row.customerName ?? null,
        jobId: row.jobId,
        status: row.status,
        nextDueAt: row.nextDueAt?.toISOString() ?? null,
        recommendation: row.nextDueAt
          ? `Real maintenance plan "${row.name}" is due ${row.nextDueAt.toISOString()} — queue a reminder draft for Owner/ops approval.`
          : `Real maintenance plan "${row.name}" has no next-due date — reminder draft can still be drafted without inventing a due date.`,
        draftKind: 'maintenance_reminder' as const,
      }));
    } catch {
      return [];
    }
  }

  private async loadFollowUpSuggestions(companyId: string): Promise<CeiFollowUpSuggestion[]> {
    const suggestions: CeiFollowUpSuggestion[] = [];
    const completed = await this.db
      .select({
        id: jobs.id,
        customerId: jobs.customerId,
        customerName: customers.name,
        title: jobs.title,
      })
      .from(jobs)
      .leftJoin(customers, eq(customers.id, jobs.customerId))
      .where(and(eq(jobs.companyId, companyId), eq(jobs.status, 'completed')))
      .orderBy(desc(jobs.updatedAt))
      .limit(40);

    const reviewJobIds = new Set(
      (
        await this.db
          .select({ jobId: cxReviewsFeedback.jobId })
          .from(cxReviewsFeedback)
          .where(eq(cxReviewsFeedback.companyId, companyId))
          .limit(200)
      )
        .map((r) => r.jobId)
        .filter((id): id is string => Boolean(id)),
    );

    for (const job of completed) {
      if (!job.customerId || (job.id && reviewJobIds.has(job.id))) continue;
      suggestions.push({
        id: `follow-job-${job.id}`,
        customerId: job.customerId,
        customerName: job.customerName ?? null,
        jobId: job.id,
        maintenancePlanId: null,
        reason: 'completed_job_no_review',
        priority: 'normal',
        recommendation: `Completed job "${job.title}" has no linked CX review — suggest a follow-up or review-request draft (approval required).`,
        autoExecuted: false,
      });
    }

    const maint = await this.loadMaintenanceLinks(companyId);
    const now = Date.now();
    for (const plan of maint) {
      if (!plan.nextDueAt) continue;
      const due = new Date(plan.nextDueAt).getTime();
      if (Number.isNaN(due)) continue;
      const days = (due - now) / (1000 * 60 * 60 * 24);
      if (days <= 21) {
        suggestions.push({
          id: `follow-maint-${plan.planId}`,
          customerId: plan.customerId,
          customerName: plan.customerName,
          jobId: plan.jobId,
          maintenancePlanId: plan.planId,
          reason: 'upcoming_maintenance',
          priority: days < 0 ? 'high' : 'normal',
          recommendation: `Maintenance plan "${plan.planName}" is due soon — queue a maintenance reminder draft for approval.`,
          autoExecuted: false,
        });
      }
    }
    return suggestions.slice(0, 40);
  }

  private async computeRelationshipScores(actor: CeiActor): Promise<CeiRelationshipScoreSummary[]> {
    const customerRows = await this.db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(eq(customers.companyId, actor.companyId))
      .limit(100);
    if (customerRows.length === 0) return [];

    const jobRows = await this.db
      .select({
        customerId: jobs.customerId,
        status: jobs.status,
        updatedAt: jobs.updatedAt,
      })
      .from(jobs)
      .where(eq(jobs.companyId, actor.companyId))
      .limit(2000);

    const reviewRows = await this.db
      .select({
        customerId: cxReviewsFeedback.customerId,
        rating: cxReviewsFeedback.rating,
      })
      .from(cxReviewsFeedback)
      .where(eq(cxReviewsFeedback.companyId, actor.companyId))
      .limit(1000);

    let commRows: Array<{
      customerId: string;
      averageScore: number | null;
      messageCount: number;
      lastCommunicationAt: Date | null;
    }> = [];
    try {
      commRows = await this.db
        .select({
          customerId: ceiCommScoreSnapshots.customerId,
          averageScore: ceiCommScoreSnapshots.averageScore,
          messageCount: ceiCommScoreSnapshots.messageCount,
          lastCommunicationAt: ceiCommScoreSnapshots.lastCommunicationAt,
        })
        .from(ceiCommScoreSnapshots)
        .where(eq(ceiCommScoreSnapshots.companyId, actor.companyId))
        .limit(200);
    } catch {
      commRows = [];
    }

    let maintRows: Array<{ customerId: string | null; nextDueAt: Date | null; status: string }> = [];
    try {
      maintRows = await this.db
        .select({
          customerId: opsRecurringMaintenancePlans.customerId,
          nextDueAt: opsRecurringMaintenancePlans.nextDueAt,
          status: opsRecurringMaintenancePlans.status,
        })
        .from(opsRecurringMaintenancePlans)
        .where(eq(opsRecurringMaintenancePlans.companyId, actor.companyId))
        .limit(500);
    } catch {
      maintRows = [];
    }

    const now = Date.now();
    const out: CeiRelationshipScoreSummary[] = [];
    for (const customer of customerRows) {
      const cJobs = jobRows.filter((j) => j.customerId === customer.id);
      const cReviews = reviewRows.filter((r) => r.customerId === customer.id);
      const ratings = cReviews
        .map((r) => r.rating)
        .filter((r): r is number => typeof r === 'number');
      const avgRating =
        ratings.length > 0
          ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
          : null;
      const comm = commRows.find((c) => c.customerId === customer.id);
      const cMaint = maintRows.filter((m) => m.customerId === customer.id);
      const overdue = cMaint.filter((m) => m.nextDueAt && m.nextDueAt.getTime() < now).length;
      const scored = scoreCeiCustomerRelationship({
        jobCount: cJobs.length,
        completedJobCount: cJobs.filter((j) => j.status === 'completed').length,
        averageRating: avgRating,
        reviewCount: cReviews.length,
        communicationAverageScore: comm?.averageScore ?? null,
        communicationMessageCount: comm?.messageCount ?? 0,
        openMaintenancePlans: cMaint.length,
        overdueMaintenancePlans: overdue,
      });
      const lastJob = cJobs
        .map((j) => j.updatedAt)
        .filter((d): d is Date => Boolean(d))
        .sort((a, b) => b.getTime() - a.getTime())[0];
      const summary: CeiRelationshipScoreSummary = {
        customerId: customer.id,
        customerName: customer.name,
        availability: scored.availability,
        relationshipScore: scored.relationshipScore,
        band: scored.band,
        components: scored.components,
        jobCount: scored.jobCount,
        reviewCount: scored.reviewCount,
        openMaintenancePlans: scored.openMaintenancePlans,
        lastJobAt: lastJob?.toISOString() ?? null,
        lastCommunicationAt: comm?.lastCommunicationAt?.toISOString() ?? null,
        summary: scored.summary,
        customer360: false,
      };
      out.push(summary);

      try {
        const [existing] = await this.db
          .select({ id: ceiRelationshipScores.id })
          .from(ceiRelationshipScores)
          .where(
            and(
              eq(ceiRelationshipScores.companyId, actor.companyId),
              eq(ceiRelationshipScores.customerId, customer.id),
            ),
          )
          .limit(1);
        const values = {
          availability: summary.availability,
          relationshipScore: summary.relationshipScore,
          band: summary.band,
          jobCount: summary.jobCount,
          reviewCount: summary.reviewCount,
          openMaintenancePlans: summary.openMaintenancePlans,
          components: summary.components,
          summary: summary.summary,
          lastJobAt: lastJob ?? null,
          lastCommunicationAt: comm?.lastCommunicationAt ?? null,
          metadata: { customer360: false as const },
          updatedAt: new Date(),
        };
        if (existing) {
          await this.db
            .update(ceiRelationshipScores)
            .set(values)
            .where(eq(ceiRelationshipScores.id, existing.id));
        } else {
          await this.db.insert(ceiRelationshipScores).values({
            companyId: actor.companyId,
            customerId: customer.id,
            ...values,
          });
        }
      } catch {
        // persistence optional for dashboard readability
      }
    }
    return out
      .filter((s) => s.availability === 'available')
      .sort((a, b) => (b.relationshipScore ?? 0) - (a.relationshipScore ?? 0));
  }

  private async loadRetentionOpportunities(actor: CeiActor): Promise<CeiRetentionOpportunity[]> {
    const out: CeiRetentionOpportunity[] = [];
    try {
      const reviews = await this.db
        .select({
          id: cxReviewsFeedback.id,
          customerId: cxReviewsFeedback.customerId,
          customerName: customers.name,
          rating: cxReviewsFeedback.rating,
          subject: cxReviewsFeedback.subject,
          feedback: cxReviewsFeedback.feedback,
        })
        .from(cxReviewsFeedback)
        .leftJoin(customers, eq(customers.id, cxReviewsFeedback.customerId))
        .where(eq(cxReviewsFeedback.companyId, actor.companyId))
        .orderBy(desc(cxReviewsFeedback.createdAt))
        .limit(80);
      for (const row of reviews) {
        const sentiment = detectCeiSentimentFromText({ subject: row.subject, body: row.feedback }).sentiment;
        const unhappy = (typeof row.rating === 'number' && row.rating <= 2) || sentiment === 'negative';
        if (!unhappy || !row.customerId) continue;
        out.push({
          id: `retention-unhappy-${row.id}`,
          customerId: row.customerId,
          customerName: row.customerName ?? null,
          reason: 'unhappy_satisfaction',
          priority: 'high',
          recommendation:
            'Negative satisfaction signal detected — suggest a personal follow-up draft (Owner/ops approval required; nothing auto-sent).',
          homeShieldSubscriptionId: null,
          homeShieldRenewalOpportunityId: null,
          autoExecuted: false,
        });
      }
    } catch {}
    try {
      const scores = await this.db
        .select({
          customerId: ceiCommScoreSnapshots.customerId,
          averageScore: ceiCommScoreSnapshots.averageScore,
          dominantSentiment: ceiCommScoreSnapshots.dominantSentiment,
        })
        .from(ceiCommScoreSnapshots)
        .where(eq(ceiCommScoreSnapshots.companyId, actor.companyId))
        .limit(50);
      const ids = scores.map((s) => s.customerId);
      const nameRows = ids.length
        ? await this.db
            .select({ id: customers.id, name: customers.name })
            .from(customers)
            .where(and(eq(customers.companyId, actor.companyId), inArray(customers.id, ids)))
        : [];
      const nameById = new Map(nameRows.map((c) => [c.id, c.name]));
      for (const s of scores) {
        const neg = s.dominantSentiment === 'negative' || (typeof s.averageScore === 'number' && s.averageScore < 40);
        if (!neg) continue;
        out.push({
          id: `retention-comm-${s.customerId}`,
          customerId: s.customerId,
          customerName: nameById.get(s.customerId) ?? null,
          reason: 'negative_communication',
          priority: 'high',
          recommendation:
            'Communication AURA score/sentiment suggests risk — queue a follow-up draft for Owner approval.',
          homeShieldSubscriptionId: null,
          homeShieldRenewalOpportunityId: null,
          autoExecuted: false,
        });
      }
    } catch {}
    try {
      const renewals = await this.db
        .select({
          id: hsRenewalOpportunities.id,
          customerId: hsRenewalOpportunities.customerId,
          customerName: customers.name,
          title: hsRenewalOpportunities.title,
          status: hsRenewalOpportunities.status,
          subscriptionId: hsRenewalOpportunities.subscriptionId,
        })
        .from(hsRenewalOpportunities)
        .leftJoin(customers, eq(customers.id, hsRenewalOpportunities.customerId))
        .where(eq(hsRenewalOpportunities.companyId, actor.companyId))
        .orderBy(desc(hsRenewalOpportunities.updatedAt))
        .limit(40);
      for (const r of renewals) {
        if (r.status === 'cancelled' || r.status === 'rejected') continue;
        out.push({
          id: `retention-hs-renewal-${r.id}`,
          customerId: r.customerId,
          customerName: r.customerName ?? null,
          reason: 'homeshield_renewal',
          priority: 'normal',
          recommendation: `HomeShield renewal opportunity "${r.title}" — suggest engagement/follow-up draft (never auto-bill; Owner approval).`,
          homeShieldSubscriptionId: r.subscriptionId,
          homeShieldRenewalOpportunityId: r.id,
          autoExecuted: false,
        });
      }
      const subs = await this.db
        .select({
          id: hsSubscriptions.id,
          customerId: hsSubscriptions.customerId,
          customerName: customers.name,
          status: hsSubscriptions.status,
          planName: hsMembershipPlans.name,
        })
        .from(hsSubscriptions)
        .leftJoin(customers, eq(customers.id, hsSubscriptions.customerId))
        .leftJoin(hsMembershipPlans, eq(hsMembershipPlans.id, hsSubscriptions.planId))
        .where(eq(hsSubscriptions.companyId, actor.companyId))
        .orderBy(desc(hsSubscriptions.updatedAt))
        .limit(50);
      for (const s of subs) {
        if (s.status === 'active' || s.status === 'draft') continue;
        out.push({
          id: `retention-hs-inactive-${s.id}`,
          customerId: s.customerId,
          customerName: s.customerName ?? null,
          reason: 'homeshield_inactive',
          priority: 'high',
          recommendation: `HomeShield subscription (${s.planName ?? 'plan'}) status is ${s.status} — retention follow-up draft recommended (approval required).`,
          homeShieldSubscriptionId: s.id,
          homeShieldRenewalOpportunityId: null,
          autoExecuted: false,
        });
      }
    } catch {}
    const seen = new Set<string>();
    const unique: CeiRetentionOpportunity[] = [];
    for (const item of out) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      unique.push(item);
    }
    return unique.slice(0, 40);
  }

  async generateFollowUpDrafts(
    actor: CeiActor,
    input: GenerateCeiFollowUpDraftsRequest = {},
  ): Promise<{ created: number; drafts: CeiOutreachDraftSummary[] }> {
    this.assertWrite(actor);
    const suggestions = await this.loadFollowUpSuggestions(actor.companyId);
    const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);
    const company = await this.companyName(actor.companyId);
    const status = input.submitForApproval ? 'pending_approval' : 'draft';
    const drafts: CeiOutreachDraftSummary[] = [];
    for (const suggestion of suggestions.slice(0, limit)) {
      if (!suggestion.customerId) continue;
      const built = buildCeiFollowUpDraft({
        customerName: suggestion.customerName,
        reason: suggestion.reason,
        jobTitle: null,
        maintenancePlanName: null,
        companyName: company,
      });
      const [inserted] = await this.db
        .insert(ceiOutreachDrafts)
        .values({
          companyId: actor.companyId,
          kind: 'follow_up',
          status,
          channel: 'email',
          customerId: suggestion.customerId,
          jobId: suggestion.jobId,
          maintenancePlanId: suggestion.maintenancePlanId,
          subject: built.subject,
          body: built.body,
          autoSend: false,
          etaAvailability: 'unavailable',
          createdByUserId: actor.userId,
          metadata: { source: 'follow_up_generate', reason: suggestion.reason },
        })
        .returning();
      drafts.push(this.toDraft(inserted, suggestion.customerName));
    }
    await this.recordAudit(actor, 'cei_follow_up_drafts_generated', actor.companyId, {
      created: drafts.length,
      autoSend: false,
    });
    return { created: drafts.length, drafts };
  }

  async generateMaintenanceReminderDrafts(
    actor: CeiActor,
    input: GenerateCeiMaintenanceReminderDraftsRequest = {},
  ): Promise<{ created: number; drafts: CeiOutreachDraftSummary[] }> {
    this.assertWrite(actor);
    const links = await this.loadMaintenanceLinks(actor.companyId);
    const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);
    const company = await this.companyName(actor.companyId);
    const status = input.submitForApproval ? 'pending_approval' : 'draft';
    const drafts: CeiOutreachDraftSummary[] = [];
    for (const link of links.slice(0, limit)) {
      if (!link.customerId) continue;
      const built = buildCeiMaintenanceReminderDraft({
        customerName: link.customerName,
        planName: link.planName,
        nextDueAt: link.nextDueAt,
        companyName: company,
      });
      const [inserted] = await this.db
        .insert(ceiOutreachDrafts)
        .values({
          companyId: actor.companyId,
          kind: 'maintenance_reminder',
          status,
          channel: 'email',
          customerId: link.customerId,
          jobId: link.jobId,
          maintenancePlanId: link.planId,
          subject: built.subject,
          body: built.body,
          autoSend: false,
          etaAvailability: 'unavailable',
          createdByUserId: actor.userId,
          metadata: { source: 'maintenance_reminder_generate' },
        })
        .returning();
      drafts.push(this.toDraft(inserted, link.customerName));
    }
    await this.recordAudit(actor, 'cei_maintenance_reminder_drafts_generated', actor.companyId, {
      created: drafts.length,
      autoSend: false,
    });
    return { created: drafts.length, drafts };
  }
}
