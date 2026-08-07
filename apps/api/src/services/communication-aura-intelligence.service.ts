import { and, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import {
  buildCommAuraFollowUpSuggestion,
  buildCommAuraSmartReply,
  canAccessCommunicationAuraIntelligence,
  canWriteCommunicationAuraIntelligence,
  COMM_AURA_PRODUCT_COPY,
  detectCommAuraSentiment,
  dominantCommAuraSentiment,
  emptyCommAuraPriorityCounts,
  scoreCommAuraMessage,
  type AnalyseCommAuraInboxItemRequest,
  type CommAuraChannel,
  type CommAuraCustomerInsight,
  type CommAuraDashboard,
  type CommAuraDraftSummary,
  type CommAuraFollowUpSummary,
  type CommAuraLinkProposalSummary,
  type CommAuraPrioritisedMessage,
  type CommAuraPriority,
  type CommAuraSentiment,
  type CommAuraSourceKind,
  type CreateCommAuraDraftRequest,
  type CreateCommAuraFollowUpRequest,
  type CreateCommAuraLinkProposalRequest,
  type DecideCommAuraDraftRequest,
  type DecideCommAuraFollowUpRequest,
  type DecideCommAuraLinkProposalRequest,
  type RunCommAuraScanRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  commAuraCustomerInsights,
  commAuraDrafts,
  commAuraFollowUps,
  commAuraLinkProposals,
  commAuraMessageScores,
  commPlatformInboxIndex,
  companies,
  customers,
  securityAuditLogs,
  ucTimelineIndex,
} from '@titan/db';

export class CommunicationAuraIntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CommunicationAuraIntelligenceError';
  }
}

export type CommAuraActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

type InboxRow = typeof commPlatformInboxIndex.$inferSelect;

export class CommunicationAuraIntelligenceService {
  constructor(private readonly db: DatabaseClient) {}

  private assertRead(actor: CommAuraActor): void {
    if (!canAccessCommunicationAuraIntelligence(actor)) {
      throw new CommunicationAuraIntelligenceError(
        'FORBIDDEN',
        'Communication AURA Intelligence requires business communications access (Technician/Client denied).',
      );
    }
  }

  private assertWrite(actor: CommAuraActor): void {
    this.assertRead(actor);
    if (!canWriteCommunicationAuraIntelligence(actor)) {
      throw new CommunicationAuraIntelligenceError(
        'FORBIDDEN',
        'Communication AURA Intelligence write actions require communications write/manage permission.',
      );
    }
  }

  private async recordAudit(
    actor: CommAuraActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'communications',
      action,
      entityType: 'communication_aura_intelligence',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        autoSend: false,
        autoLinked: false,
        autoExecuted: false,
      },
    });
  }

  private sourceKindFromAccount(accountKind: string): CommAuraSourceKind | null {
    if (accountKind === 'business_gmail') return 'business_gmail';
    if (accountKind === 'business_whatsapp') return 'business_whatsapp';
    return null;
  }

  private channelFromKind(sourceKind: CommAuraSourceKind): CommAuraChannel {
    return sourceKind === 'business_whatsapp' ? 'whatsapp' : 'email';
  }

  private resolveLinks(row: InboxRow): {
    linkedCustomerId: string | null;
    linkedLeadId: string | null;
    linkedJobId: string | null;
    hasCrmLink: boolean;
  } {
    const linkedCustomerId = row.linkTargetType === 'customer' ? row.linkTargetId : null;
    const linkedLeadId = row.linkTargetType === 'lead' ? row.linkTargetId : null;
    const linkedJobId = row.assignedJobId ?? (row.linkTargetType === 'job' ? row.linkTargetId : null);
    const hasCrmLink = Boolean(row.linkTargetType && row.linkTargetId) || Boolean(row.assignedJobId);
    return { linkedCustomerId, linkedLeadId, linkedJobId, hasCrmLink };
  }

  private toPrioritised(
    scoreRow: typeof commAuraMessageScores.$inferSelect,
    inbox: InboxRow | null,
  ): CommAuraPrioritisedMessage {
    const breakdown =
      scoreRow.scoreBreakdown && typeof scoreRow.scoreBreakdown === 'object'
        ? (scoreRow.scoreBreakdown as CommAuraPrioritisedMessage['scoreBreakdown'])
        : {
            urgencyPoints: 0,
            unreadPoints: 0,
            agePoints: 0,
            attachmentPoints: 0,
            unlinkedPoints: 0,
            sentimentPoints: 0,
          };

    return {
      id: scoreRow.id,
      sourceKind: scoreRow.sourceKind,
      channel: scoreRow.channel,
      inboxItemId: scoreRow.inboxItemId,
      subject: inbox?.subject ?? null,
      preview: inbox?.preview ?? null,
      participantLabel: inbox?.participantLabel ?? null,
      occurredAt: inbox?.occurredAt?.toISOString() ?? null,
      unread: inbox?.unread ?? false,
      urgent: inbox?.urgent ?? false,
      priority: scoreRow.priority,
      communicationScore: scoreRow.communicationScore,
      scoreBreakdown: breakdown,
      sentiment: scoreRow.sentiment,
      sentimentConfidence: scoreRow.sentimentConfidence,
      sentimentSignals: scoreRow.sentimentSignals ?? [],
      linkedCustomerId: scoreRow.linkedCustomerId,
      linkedLeadId: scoreRow.linkedLeadId,
      linkedJobId: scoreRow.linkedJobId,
      timelineLinked: scoreRow.timelineLinked,
      followUpSuggested: scoreRow.followUpSuggested,
    };
  }

  private toDraft(row: typeof commAuraDrafts.$inferSelect): CommAuraDraftSummary {
    return {
      id: row.id,
      draftType: row.draftType,
      status: row.status,
      channel: row.channel,
      inboxItemId: row.inboxItemId,
      customerId: row.customerId,
      jobId: row.jobId,
      subject: row.subject,
      body: row.body,
      autoSend: false,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    };
  }

  private toFollowUp(row: typeof commAuraFollowUps.$inferSelect): CommAuraFollowUpSummary {
    return {
      id: row.id,
      status: row.status,
      inboxItemId: row.inboxItemId,
      customerId: row.customerId,
      jobId: row.jobId,
      subject: row.subject,
      recommendation: row.recommendation,
      dueHint: row.dueHint,
      autoExecuted: false,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toLink(row: typeof commAuraLinkProposals.$inferSelect): CommAuraLinkProposalSummary {
    return {
      id: row.id,
      inboxItemId: row.inboxItemId,
      linkTargetType: row.linkTargetType,
      linkTargetId: row.linkTargetId,
      status: row.status,
      subject: row.subject,
      recommendation: row.recommendation,
      autoLinked: false,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    };
  }

  private async loadBusinessInboxItem(
    actor: CommAuraActor,
    inboxItemId: string,
  ): Promise<InboxRow> {
    const [row] = await this.db
      .select()
      .from(commPlatformInboxIndex)
      .where(
        and(
          eq(commPlatformInboxIndex.id, inboxItemId),
          eq(commPlatformInboxIndex.companyId, actor.companyId),
          or(
            eq(commPlatformInboxIndex.accountKind, 'business_gmail'),
            eq(commPlatformInboxIndex.accountKind, 'business_whatsapp'),
          ),
        ),
      )
      .limit(1);

    if (!row) {
      throw new CommunicationAuraIntelligenceError(
        'NOT_FOUND',
        'Business inbox item not found (Personal WhatsApp is never sourced here).',
      );
    }
    if (row.accountKind === 'personal_whatsapp') {
      throw new CommunicationAuraIntelligenceError(
        'FORBIDDEN',
        'Personal WhatsApp is never available to Communication AURA Intelligence.',
      );
    }
    return row;
  }

  private async analyseInboxRow(
    actor: CommAuraActor,
    row: InboxRow,
    contextText?: string,
  ): Promise<typeof commAuraMessageScores.$inferSelect> {
    const sourceKind = this.sourceKindFromAccount(row.accountKind);
    if (!sourceKind) {
      throw new CommunicationAuraIntelligenceError(
        'FORBIDDEN',
        'Only business_gmail and business_whatsapp inbox rows can be analysed.',
      );
    }

    const channel = this.channelFromKind(sourceKind);
    const links = this.resolveLinks(row);
    const sentiment = detectCommAuraSentiment({
      subject: row.subject,
      preview: row.preview,
      contextText,
    });
    const scored = scoreCommAuraMessage({
      urgent: row.urgent,
      unread: row.unread,
      occurredAt: row.occurredAt,
      attachmentCount: row.attachmentCount,
      hasCrmLink: links.hasCrmLink,
      sentiment: sentiment.sentiment,
      preview: row.preview,
      subject: row.subject,
    });
    const followUp = buildCommAuraFollowUpSuggestion({
      participantLabel: row.participantLabel,
      subject: row.subject,
      preview: row.preview,
      unread: row.unread,
      occurredAt: row.occurredAt?.toISOString() ?? null,
      hasCrmLink: links.hasCrmLink,
    });

    const [timelineHit] = await this.db
      .select({ id: ucTimelineIndex.id })
      .from(ucTimelineIndex)
      .where(
        and(
          eq(ucTimelineIndex.companyId, actor.companyId),
          eq(ucTimelineIndex.sourceModule, 'communication_aura_intelligence'),
          eq(ucTimelineIndex.sourceEntityId, row.id),
        ),
      )
      .limit(1);

    const values = {
      companyId: actor.companyId,
      inboxItemId: row.id,
      sourceKind,
      channel,
      priority: scored.priority,
      communicationScore: scored.score,
      scoreBreakdown: scored.breakdown,
      sentiment: sentiment.sentiment,
      sentimentConfidence: sentiment.confidence,
      sentimentSignals: sentiment.signals,
      sentimentRationale: sentiment.rationale,
      linkedCustomerId: links.linkedCustomerId,
      linkedLeadId: links.linkedLeadId,
      linkedJobId: links.linkedJobId,
      timelineLinked: Boolean(timelineHit),
      followUpSuggested: followUp.suggested,
      analysedByUserId: actor.userId,
      metadata: {
        accountKind: row.accountKind,
        neverPersonalWhatsapp: true,
        autoSend: false,
      },
      updatedAt: new Date(),
    };

    const [existing] = await this.db
      .select()
      .from(commAuraMessageScores)
      .where(
        and(
          eq(commAuraMessageScores.companyId, actor.companyId),
          eq(commAuraMessageScores.inboxItemId, row.id),
        ),
      )
      .limit(1);

    if (existing) {
      const [updated] = await this.db
        .update(commAuraMessageScores)
        .set(values)
        .where(eq(commAuraMessageScores.id, existing.id))
        .returning();
      return updated!;
    }

    const [created] = await this.db.insert(commAuraMessageScores).values(values).returning();
    return created!;
  }

  async getDashboard(actor: CommAuraActor): Promise<CommAuraDashboard> {
    this.assertRead(actor);

    const scoreRows = await this.db
      .select()
      .from(commAuraMessageScores)
      .where(eq(commAuraMessageScores.companyId, actor.companyId))
      .orderBy(desc(commAuraMessageScores.communicationScore))
      .limit(100);

    const inboxIds = scoreRows.map((r) => r.inboxItemId);
    const inboxRows =
      inboxIds.length === 0
        ? []
        : await this.db
            .select()
            .from(commPlatformInboxIndex)
            .where(
              and(
                eq(commPlatformInboxIndex.companyId, actor.companyId),
                inArray(commPlatformInboxIndex.id, inboxIds),
              ),
            );
    const inboxById = new Map(inboxRows.map((r) => [r.id, r]));

    const byPriority = emptyCommAuraPriorityCounts();
    let sentimentAvailableCount = 0;
    let sentimentUnavailableCount = 0;
    let scoreSum = 0;
    const prioritisedMessages = scoreRows.map((row) => {
      byPriority[row.priority as CommAuraPriority] += 1;
      if (row.sentiment === 'unavailable') sentimentUnavailableCount += 1;
      else sentimentAvailableCount += 1;
      scoreSum += row.communicationScore;
      return this.toPrioritised(row, inboxById.get(row.inboxItemId) ?? null);
    });

    const draftQueue = (
      await this.db
        .select()
        .from(commAuraDrafts)
        .where(
          and(
            eq(commAuraDrafts.companyId, actor.companyId),
            eq(commAuraDrafts.status, 'pending_approval'),
          ),
        )
        .orderBy(desc(commAuraDrafts.createdAt))
        .limit(40)
    ).map((r) => this.toDraft(r));

    const followUpQueue = (
      await this.db
        .select()
        .from(commAuraFollowUps)
        .where(
          and(
            eq(commAuraFollowUps.companyId, actor.companyId),
            eq(commAuraFollowUps.status, 'pending_approval'),
          ),
        )
        .orderBy(desc(commAuraFollowUps.createdAt))
        .limit(40)
    ).map((r) => this.toFollowUp(r));

    const linkQueue = (
      await this.db
        .select()
        .from(commAuraLinkProposals)
        .where(
          and(
            eq(commAuraLinkProposals.companyId, actor.companyId),
            eq(commAuraLinkProposals.status, 'pending_approval'),
          ),
        )
        .orderBy(desc(commAuraLinkProposals.createdAt))
        .limit(40)
    ).map((r) => this.toLink(r));

    const customerInsights = await this.listCustomerInsights(actor);

    const averageCommunicationScore =
      scoreRows.length === 0 ? null : Math.round(scoreSum / scoreRows.length);

    return {
      summary:
        scoreRows.length === 0
          ? 'No scored business communications yet. Run an AURA scan against indexed business Gmail / WhatsApp inbox rows — Personal WhatsApp is never sourced.'
          : `Scored ${scoreRows.length} business communication(s). Sentiment shown only when lexical signals exist; drafts require Owner approval before send.`,
      productClarification: { ...COMM_AURA_PRODUCT_COPY },
      usesPersonalWhatsapp: false,
      totalScored: scoreRows.length,
      byPriority,
      sentimentAvailableCount,
      sentimentUnavailableCount,
      pendingDraftApprovals: draftQueue.length,
      pendingFollowUps: followUpQueue.length,
      pendingLinkApprovals: linkQueue.length,
      averageCommunicationScore,
      prioritisedMessages: prioritisedMessages.slice(0, 40),
      draftQueue,
      followUpQueue,
      linkQueue,
      customerInsights: customerInsights.slice(0, 30),
      sendPolicy: {
        autoSendEnabled: false,
        requiresOwnerApproval: true,
        draftApproveExecute: true,
      },
    };
  }

  async listPrioritised(actor: CommAuraActor): Promise<CommAuraPrioritisedMessage[]> {
    const dashboard = await this.getDashboard(actor);
    return dashboard.prioritisedMessages;
  }

  async listCustomerInsights(actor: CommAuraActor): Promise<CommAuraCustomerInsight[]> {
    this.assertRead(actor);

    const rows = await this.db
      .select({
        insight: commAuraCustomerInsights,
        customerName: customers.name,
      })
      .from(commAuraCustomerInsights)
      .leftJoin(
        customers,
        and(
          eq(customers.id, commAuraCustomerInsights.customerId),
          eq(customers.companyId, actor.companyId),
        ),
      )
      .where(eq(commAuraCustomerInsights.companyId, actor.companyId))
      .orderBy(desc(commAuraCustomerInsights.updatedAt))
      .limit(50);

    return rows.map(({ insight, customerName }) => ({
      id: insight.id,
      customerId: insight.customerId,
      customerName: customerName ?? null,
      messageCount: insight.messageCount,
      unreadCount: insight.unreadCount,
      averageScore: insight.averageScore,
      dominantSentiment: insight.dominantSentiment,
      sentimentAvailability:
        insight.sentimentAvailability === 'available' ? 'available' : 'unavailable',
      openFollowUps: insight.openFollowUps,
      pendingDrafts: insight.pendingDrafts,
      linkedJobCount: insight.linkedJobCount,
      lastCommunicationAt: insight.lastCommunicationAt?.toISOString() ?? null,
      summary: insight.summary,
    }));
  }

  async analyseInboxItem(
    actor: CommAuraActor,
    input: AnalyseCommAuraInboxItemRequest,
  ): Promise<CommAuraPrioritisedMessage> {
    this.assertWrite(actor);
    const row = await this.loadBusinessInboxItem(actor, input.inboxItemId);
    const scoreRow = await this.analyseInboxRow(actor, row, input.contextText);
    await this.recordAudit(actor, 'comm_aura_message_analysed', scoreRow.id, {
      inboxItemId: row.id,
      priority: scoreRow.priority,
      sentiment: scoreRow.sentiment,
    });
    return this.toPrioritised(scoreRow, row);
  }

  async runScan(
    actor: CommAuraActor,
    input: RunCommAuraScanRequest = {},
  ): Promise<{
    analysed: number;
    draftsCreated: number;
    followUpsCreated: number;
    insightsUpdated: number;
  }> {
    this.assertWrite(actor);

    const limit = Math.min(Math.max(input.limit ?? 40, 1), 100);
    const inboxRows = await this.db
      .select()
      .from(commPlatformInboxIndex)
      .where(
        and(
          eq(commPlatformInboxIndex.companyId, actor.companyId),
          or(
            eq(commPlatformInboxIndex.accountKind, 'business_gmail'),
            eq(commPlatformInboxIndex.accountKind, 'business_whatsapp'),
          ),
          ne(commPlatformInboxIndex.accountKind, 'personal_whatsapp'),
        ),
      )
      .orderBy(desc(commPlatformInboxIndex.occurredAt))
      .limit(limit);

    let analysed = 0;
    let draftsCreated = 0;
    let followUpsCreated = 0;

    const [company] = await this.db
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.id, actor.companyId))
      .limit(1);

    for (const row of inboxRows) {
      const scoreRow = await this.analyseInboxRow(actor, row);
      analysed += 1;

      if (input.generateDrafts) {
        const existingDraft = await this.db
          .select({ id: commAuraDrafts.id })
          .from(commAuraDrafts)
          .where(
            and(
              eq(commAuraDrafts.companyId, actor.companyId),
              eq(commAuraDrafts.inboxItemId, row.id),
              eq(commAuraDrafts.draftType, 'smart_reply'),
              eq(commAuraDrafts.status, 'pending_approval'),
            ),
          )
          .limit(1);

        if (existingDraft.length === 0) {
          const draft = buildCommAuraSmartReply({
            channel: scoreRow.channel,
            participantLabel: row.participantLabel,
            subject: row.subject,
            preview: row.preview,
            companyName: company?.name ?? null,
          });
          const links = this.resolveLinks(row);
          await this.db.insert(commAuraDrafts).values({
            companyId: actor.companyId,
            inboxItemId: row.id,
            draftType: 'smart_reply',
            status: 'pending_approval',
            channel: scoreRow.channel,
            customerId: links.linkedCustomerId,
            jobId: links.linkedJobId,
            subject: draft.subject,
            body: draft.body,
            autoSend: false,
            metadata: { source: 'comm_aura_scan', autoSend: false },
          });
          draftsCreated += 1;
        }

        const followUp = buildCommAuraFollowUpSuggestion({
          participantLabel: row.participantLabel,
          subject: row.subject,
          preview: row.preview,
          unread: row.unread,
          occurredAt: row.occurredAt?.toISOString() ?? null,
          hasCrmLink: this.resolveLinks(row).hasCrmLink,
        });
        if (followUp.suggested) {
          const existingFu = await this.db
            .select({ id: commAuraFollowUps.id })
            .from(commAuraFollowUps)
            .where(
              and(
                eq(commAuraFollowUps.companyId, actor.companyId),
                eq(commAuraFollowUps.inboxItemId, row.id),
                eq(commAuraFollowUps.status, 'pending_approval'),
              ),
            )
            .limit(1);
          if (existingFu.length === 0) {
            const links = this.resolveLinks(row);
            await this.db.insert(commAuraFollowUps).values({
              companyId: actor.companyId,
              inboxItemId: row.id,
              customerId: links.linkedCustomerId,
              jobId: links.linkedJobId,
              status: 'pending_approval',
              subject: followUp.subject,
              recommendation: followUp.recommendation,
              dueHint: followUp.dueHint,
              autoExecuted: false,
              metadata: { source: 'comm_aura_scan', autoExecuted: false },
            });
            followUpsCreated += 1;
          }
        }
      }
    }

    const insightsUpdated = await this.refreshCustomerInsights(actor);

    await this.recordAudit(actor, 'comm_aura_scan_completed', actor.companyId, {
      analysed,
      draftsCreated,
      followUpsCreated,
      insightsUpdated,
      generateDrafts: Boolean(input.generateDrafts),
    });

    return { analysed, draftsCreated, followUpsCreated, insightsUpdated };
  }

  private async refreshCustomerInsights(actor: CommAuraActor): Promise<number> {
    const linkedScores = await this.db
      .select()
      .from(commAuraMessageScores)
      .where(
        and(
          eq(commAuraMessageScores.companyId, actor.companyId),
          sql`${commAuraMessageScores.linkedCustomerId} IS NOT NULL`,
        ),
      );

    const byCustomer = new Map<string, typeof linkedScores>();
    for (const row of linkedScores) {
      if (!row.linkedCustomerId) continue;
      const list = byCustomer.get(row.linkedCustomerId) ?? [];
      list.push(row);
      byCustomer.set(row.linkedCustomerId, list);
    }

    let updated = 0;
    for (const [customerId, rows] of byCustomer) {
      const inboxIds = rows.map((r) => r.inboxItemId);
      const inboxRows =
        inboxIds.length === 0
          ? []
          : await this.db
              .select()
              .from(commPlatformInboxIndex)
              .where(
                and(
                  eq(commPlatformInboxIndex.companyId, actor.companyId),
                  inArray(commPlatformInboxIndex.id, inboxIds),
                ),
              );

      const unreadCount = inboxRows.filter((r) => r.unread).length;
      const sentiments = rows.map((r) => r.sentiment as CommAuraSentiment);
      const dominant = dominantCommAuraSentiment(sentiments);
      const avg =
        rows.length === 0
          ? null
          : Math.round(rows.reduce((sum, r) => sum + r.communicationScore, 0) / rows.length);
      const lastAt = inboxRows
        .map((r) => r.occurredAt)
        .filter(Boolean)
        .sort((a, b) => (b!.getTime() - a!.getTime()))[0] ?? null;
      const linkedJobCount = new Set(
        rows.map((r) => r.linkedJobId).filter((id): id is string => Boolean(id)),
      ).size;

      const [openFollowUps] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(commAuraFollowUps)
        .where(
          and(
            eq(commAuraFollowUps.companyId, actor.companyId),
            eq(commAuraFollowUps.customerId, customerId),
            eq(commAuraFollowUps.status, 'pending_approval'),
          ),
        );
      const [pendingDrafts] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(commAuraDrafts)
        .where(
          and(
            eq(commAuraDrafts.companyId, actor.companyId),
            eq(commAuraDrafts.customerId, customerId),
            eq(commAuraDrafts.status, 'pending_approval'),
          ),
        );

      const summary =
        dominant.availability === 'unavailable'
          ? `${rows.length} linked business message(s); sentiment unavailable (no clear lexical signal).`
          : `${rows.length} linked business message(s); dominant sentiment ${dominant.sentiment} from available signals only.`;

      const payload = {
        companyId: actor.companyId,
        customerId,
        messageCount: rows.length,
        unreadCount,
        averageScore: avg,
        dominantSentiment: dominant.sentiment,
        sentimentAvailability: dominant.availability,
        openFollowUps: openFollowUps?.count ?? 0,
        pendingDrafts: pendingDrafts?.count ?? 0,
        linkedJobCount,
        lastCommunicationAt: lastAt,
        summary,
        metadata: { source: 'comm_aura_scan', fabricated: false },
        updatedAt: new Date(),
      };

      const [existing] = await this.db
        .select()
        .from(commAuraCustomerInsights)
        .where(
          and(
            eq(commAuraCustomerInsights.companyId, actor.companyId),
            eq(commAuraCustomerInsights.customerId, customerId),
          ),
        )
        .limit(1);

      if (existing) {
        await this.db
          .update(commAuraCustomerInsights)
          .set(payload)
          .where(eq(commAuraCustomerInsights.id, existing.id));
      } else {
        await this.db.insert(commAuraCustomerInsights).values(payload);
      }
      updated += 1;
    }

    return updated;
  }

  async createDraft(
    actor: CommAuraActor,
    input: CreateCommAuraDraftRequest,
  ): Promise<CommAuraDraftSummary> {
    this.assertWrite(actor);
    const row = await this.loadBusinessInboxItem(actor, input.inboxItemId);
    const sourceKind = this.sourceKindFromAccount(row.accountKind)!;
    const channel = this.channelFromKind(sourceKind);
    const links = this.resolveLinks(row);

    const [company] = await this.db
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.id, actor.companyId))
      .limit(1);

    const generated =
      input.draftType === 'smart_reply'
        ? buildCommAuraSmartReply({
            channel,
            participantLabel: row.participantLabel,
            subject: row.subject,
            preview: row.preview,
            companyName: company?.name ?? null,
          })
        : {
            subject: input.subject?.trim() || `Follow-up draft — ${row.participantLabel ?? 'contact'}`,
            body:
              input.body?.trim() ||
              'Suggested follow-up draft for Owner approval only. Nothing was sent.',
          };

    const [created] = await this.db
      .insert(commAuraDrafts)
      .values({
        companyId: actor.companyId,
        inboxItemId: row.id,
        draftType: input.draftType,
        status: 'pending_approval',
        channel,
        customerId: links.linkedCustomerId,
        jobId: links.linkedJobId,
        subject: input.subject?.trim() || generated.subject,
        body: input.body?.trim() || generated.body,
        autoSend: false,
        metadata: { source: 'manual', autoSend: false },
      })
      .returning();

    await this.recordAudit(actor, 'comm_aura_draft_created', created!.id, {
      draftType: input.draftType,
      autoSend: false,
    });

    return this.toDraft(created!);
  }

  async decideDraft(
    actor: CommAuraActor,
    draftId: string,
    input: DecideCommAuraDraftRequest,
  ): Promise<CommAuraDraftSummary> {
    this.assertWrite(actor);

    const [draft] = await this.db
      .select()
      .from(commAuraDrafts)
      .where(and(eq(commAuraDrafts.id, draftId), eq(commAuraDrafts.companyId, actor.companyId)))
      .limit(1);

    if (!draft) {
      throw new CommunicationAuraIntelligenceError('NOT_FOUND', 'Draft not found');
    }
    if (draft.status !== 'pending_approval') {
      throw new CommunicationAuraIntelligenceError(
        'INVALID_STATE',
        'Draft is not pending approval',
      );
    }

    // Approve marks the draft approved for handoff — never sends from this layer.
    const status = input.decision === 'approve' ? 'approved' : 'rejected';
    const [updated] = await this.db
      .update(commAuraDrafts)
      .set({
        status,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: input.notes ?? null,
        autoSend: false,
        updatedAt: new Date(),
      })
      .where(eq(commAuraDrafts.id, draft.id))
      .returning();

    await this.recordAudit(
      actor,
      input.decision === 'approve' ? 'comm_aura_draft_approved' : 'comm_aura_draft_rejected',
      draft.id,
      { autoSend: false, note: 'Approval does not send — use Email Centre / Gmail execute path.' },
    );

    return this.toDraft(updated!);
  }

  async createFollowUp(
    actor: CommAuraActor,
    input: CreateCommAuraFollowUpRequest,
  ): Promise<CommAuraFollowUpSummary> {
    this.assertWrite(actor);

    let inboxItemId: string | null = input.inboxItemId ?? null;
    let customerId = input.customerId ?? null;
    let jobId = input.jobId ?? null;

    if (input.inboxItemId) {
      const row = await this.loadBusinessInboxItem(actor, input.inboxItemId);
      const links = this.resolveLinks(row);
      inboxItemId = row.id;
      customerId = customerId ?? links.linkedCustomerId;
      jobId = jobId ?? links.linkedJobId;
    }

    const [created] = await this.db
      .insert(commAuraFollowUps)
      .values({
        companyId: actor.companyId,
        inboxItemId,
        customerId,
        jobId,
        status: 'pending_approval',
        subject: input.subject.trim(),
        recommendation: input.recommendation.trim(),
        dueHint: input.dueHint ?? null,
        autoExecuted: false,
        metadata: { source: 'manual', autoExecuted: false },
      })
      .returning();

    await this.recordAudit(actor, 'comm_aura_follow_up_created', created!.id, {
      autoExecuted: false,
    });

    return this.toFollowUp(created!);
  }

  async decideFollowUp(
    actor: CommAuraActor,
    followUpId: string,
    input: DecideCommAuraFollowUpRequest,
  ): Promise<CommAuraFollowUpSummary> {
    this.assertWrite(actor);

    const [row] = await this.db
      .select()
      .from(commAuraFollowUps)
      .where(
        and(eq(commAuraFollowUps.id, followUpId), eq(commAuraFollowUps.companyId, actor.companyId)),
      )
      .limit(1);

    if (!row) {
      throw new CommunicationAuraIntelligenceError('NOT_FOUND', 'Follow-up not found');
    }
    if (row.status !== 'pending_approval') {
      throw new CommunicationAuraIntelligenceError(
        'INVALID_STATE',
        'Follow-up is not pending approval',
      );
    }

    const status = input.decision === 'approve' ? 'approved' : 'rejected';
    const [updated] = await this.db
      .update(commAuraFollowUps)
      .set({
        status,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: input.notes ?? null,
        autoExecuted: false,
        updatedAt: new Date(),
      })
      .where(eq(commAuraFollowUps.id, row.id))
      .returning();

    await this.recordAudit(
      actor,
      input.decision === 'approve'
        ? 'comm_aura_follow_up_approved'
        : 'comm_aura_follow_up_rejected',
      row.id,
      { autoExecuted: false },
    );

    return this.toFollowUp(updated!);
  }

  async createLinkProposal(
    actor: CommAuraActor,
    input: CreateCommAuraLinkProposalRequest,
  ): Promise<CommAuraLinkProposalSummary> {
    this.assertWrite(actor);
    const row = await this.loadBusinessInboxItem(actor, input.inboxItemId);

    const subject =
      input.subject?.trim() ||
      `Link communication → ${input.linkTargetType}`;
    const recommendation =
      input.recommendation?.trim() ||
      `Owner approval required to connect this business inbox item to ${input.linkTargetType}. Nothing is auto-linked.`;

    const [created] = await this.db
      .insert(commAuraLinkProposals)
      .values({
        companyId: actor.companyId,
        inboxItemId: row.id,
        linkTargetType: input.linkTargetType,
        linkTargetId: input.linkTargetId ?? null,
        status: 'pending_approval',
        subject,
        recommendation,
        notes: input.notes ?? null,
        autoLinked: false,
        metadata: { source: 'manual', autoLinked: false },
      })
      .returning();

    await this.recordAudit(actor, 'comm_aura_link_proposed', created!.id, {
      linkTargetType: input.linkTargetType,
      autoLinked: false,
    });

    return this.toLink(created!);
  }

  async decideLinkProposal(
    actor: CommAuraActor,
    proposalId: string,
    input: DecideCommAuraLinkProposalRequest,
  ): Promise<CommAuraLinkProposalSummary> {
    this.assertWrite(actor);

    const [proposal] = await this.db
      .select()
      .from(commAuraLinkProposals)
      .where(
        and(
          eq(commAuraLinkProposals.id, proposalId),
          eq(commAuraLinkProposals.companyId, actor.companyId),
        ),
      )
      .limit(1);

    if (!proposal) {
      throw new CommunicationAuraIntelligenceError('NOT_FOUND', 'Link proposal not found');
    }
    if (proposal.status !== 'pending_approval') {
      throw new CommunicationAuraIntelligenceError(
        'INVALID_STATE',
        'Proposal is not pending approval',
      );
    }

    if (input.decision === 'reject') {
      const [updated] = await this.db
        .update(commAuraLinkProposals)
        .set({
          status: 'rejected',
          decidedByUserId: actor.userId,
          decidedAt: new Date(),
          notes: input.notes ?? proposal.notes,
          autoLinked: false,
          updatedAt: new Date(),
        })
        .where(eq(commAuraLinkProposals.id, proposal.id))
        .returning();

      await this.recordAudit(actor, 'comm_aura_link_rejected', proposal.id, {
        linkTargetType: proposal.linkTargetType,
      });

      return this.toLink(updated!);
    }

    await this.executeApprovedLink(actor, proposal);

    const [updated] = await this.db
      .update(commAuraLinkProposals)
      .set({
        status: 'executed',
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        executedAt: new Date(),
        notes: input.notes ?? proposal.notes,
        autoLinked: false,
        updatedAt: new Date(),
      })
      .where(eq(commAuraLinkProposals.id, proposal.id))
      .returning();

    await this.recordAudit(actor, 'comm_aura_link_approved', proposal.id, {
      linkTargetType: proposal.linkTargetType,
      linkTargetId: proposal.linkTargetId,
      executed: true,
      autoLinked: false,
    });

    return this.toLink(updated!);
  }

  private async executeApprovedLink(
    actor: CommAuraActor,
    proposal: typeof commAuraLinkProposals.$inferSelect,
  ): Promise<void> {
    if (!proposal.inboxItemId) return;

    const row = await this.loadBusinessInboxItem(actor, proposal.inboxItemId);

    if (
      proposal.linkTargetType !== 'timeline' &&
      proposal.linkTargetId &&
      (proposal.linkTargetType === 'customer' ||
        proposal.linkTargetType === 'lead' ||
        proposal.linkTargetType === 'job' ||
        proposal.linkTargetType === 'quote' ||
        proposal.linkTargetType === 'invoice' ||
        proposal.linkTargetType === 'property' ||
        proposal.linkTargetType === 'supplier' ||
        proposal.linkTargetType === 'staff')
    ) {
      await this.db
        .update(commPlatformInboxIndex)
        .set({
          linkTargetType: proposal.linkTargetType,
          linkTargetId: proposal.linkTargetId,
          assignedJobId:
            proposal.linkTargetType === 'job' ? proposal.linkTargetId : row.assignedJobId,
        })
        .where(
          and(
            eq(commPlatformInboxIndex.id, row.id),
            eq(commPlatformInboxIndex.companyId, actor.companyId),
          ),
        );
    }

    const customerId =
      proposal.linkTargetType === 'customer' ? proposal.linkTargetId : row.linkTargetType === 'customer'
        ? row.linkTargetId
        : null;
    const jobId =
      proposal.linkTargetType === 'job'
        ? proposal.linkTargetId
        : row.assignedJobId;

    await this.db.insert(ucTimelineIndex).values({
      companyId: actor.companyId,
      customerId,
      jobId,
      entryType: 'internal_note',
      channel: row.channel === 'whatsapp' ? 'whatsapp' : 'email',
      title: proposal.subject,
      summary: proposal.recommendation,
      sourceModule: 'communication_aura_intelligence',
      sourceEntityId: row.id,
      occurredAt: row.occurredAt ?? new Date(),
      metadata: {
        proposalId: proposal.id,
        linkTargetType: proposal.linkTargetType,
        linkTargetId: proposal.linkTargetId,
        autoLinked: false,
        autoSend: false,
      },
    });

    const scorePatch: {
      timelineLinked: boolean;
      linkedCustomerId?: string | null;
      linkedLeadId?: string | null;
      linkedJobId?: string | null;
      updatedAt: Date;
    } = {
      timelineLinked: true,
      updatedAt: new Date(),
    };
    if (proposal.linkTargetType === 'customer') {
      scorePatch.linkedCustomerId = proposal.linkTargetId;
    }
    if (proposal.linkTargetType === 'lead') {
      scorePatch.linkedLeadId = proposal.linkTargetId;
    }
    if (proposal.linkTargetType === 'job') {
      scorePatch.linkedJobId = proposal.linkTargetId;
    }

    await this.db
      .update(commAuraMessageScores)
      .set(scorePatch)
      .where(
        and(
          eq(commAuraMessageScores.companyId, actor.companyId),
          eq(commAuraMessageScores.inboxItemId, row.id),
        ),
      );
  }
}
