import { and, desc, eq, inArray } from 'drizzle-orm';
import type {
  CommIntelAnalyticsDashboard,
  CommIntelAuraContext,
  CommIntelCallSummary,
  CommIntelChannel,
  CommIntelConversationInsightSummary,
  CommIntelDraftActionSummary,
  CommIntelEmailThreadSummary,
  CommIntelRecordingSummary,
  CommIntelSmsRecordSummary,
  CommIntelTimelineEntry,
  CommIntelUnifiedDashboard,
  CommunicationsChannelIntegration,
  CommunicationsIntegrationState,
  CommunicationsWorkspaceChannel,
  CommunicationsWorkspaceConversation,
  CommunicationsWorkspaceEntityLinks,
  CommunicationsWorkspaceQueue,
  CommunicationsWorkspaceResponse,
  CreateCommIntelCallIntelligenceRequest,
  CreateCommIntelConversationInsightRequest,
  CreateCommIntelDraftActionRequest,
  CreateCommIntelEmailThreadRequest,
  CreateCommIntelRecordingRequest,
  CreateCommIntelSmsRecordRequest,
} from '@titan/shared';
import {
  COMMUNICATIONS_WORKSPACE_CHANNEL_OPTIONS,
  COMMUNICATIONS_WORKSPACE_QUEUE_OPTIONS,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  commIntelCallIntelligence,
  commIntelConversationInsights,
  commIntelDraftActions,
  commIntelEmailThreads,
  commIntelRecordings,
  commIntelSmsRecords,
  communications,
  invoices,
  jobs,
  leads,
  personalCommAccounts,
  portalCustomerRequests,
  quotes,
  ucDispatchNotifications,
} from '@titan/db';
import type { CommunicationsService } from './communications.service.js';
import type { CustomerSupportService } from './customer-support.service.js';
import type { NotificationService } from './notification.service.js';
import type { VoiceService } from './voice.service.js';
import type { WhatsappService } from './whatsapp.service.js';

export class CommunicationsIntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CommunicationsIntelligenceError';
  }
}

type StaffScope = {
  companyId: string;
  userId: string;
  roleName?: string;
  permissions?: string[];
};

type ProviderStatusRow = {
  provider: string;
  connectionStatus: string;
  syncStatus?: string | null;
};

export class CommunicationsIntelligenceService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly communicationsService: CommunicationsService,
    private readonly voiceService: VoiceService,
    private readonly whatsappService: WhatsappService,
    private readonly customerSupportService: CustomerSupportService,
    private readonly notificationService: NotificationService,
  ) {}

  async getUnifiedDashboard(companyId: string): Promise<CommIntelUnifiedDashboard> {
    const [analytics, recentTimeline, pendingDrafts] = await Promise.all([
      this.getAnalyticsDashboard(companyId),
      this.buildTimeline(companyId, { limit: 20 }),
      this.listDraftActions(companyId, 'pending_approval'),
    ]);

    return {
      summary: `${analytics.totalCommunications} communication(s), ${analytics.missedCallCount} missed call(s), ${pendingDrafts.length} pending draft(s).`,
      analytics,
      recentTimeline,
      pendingDrafts,
    };
  }

  async getAnalyticsDashboard(companyId: string): Promise<CommIntelAnalyticsDashboard> {
    const [
      voiceSessions,
      whatsappRows,
      commRows,
      supportConversations,
      supportEscalations,
      smsRows,
      pendingDrafts,
    ] = await Promise.all([
      this.voiceService.getCallHistory(companyId),
      this.whatsappService.listMessages(companyId),
      this.communicationsService.listMessages(companyId),
      this.customerSupportService.listConversations(companyId),
      this.customerSupportService.listEscalations(companyId),
      this.listSmsRecords(companyId),
      this.db.query.commIntelDraftActions.findMany({
        where: and(
          eq(commIntelDraftActions.companyId, companyId),
          eq(commIntelDraftActions.status, 'pending_approval'),
        ),
      }),
    ]);

    const missedCallCount = voiceSessions.filter((session) => session.status === 'missed').length;
    const channelUsage: Array<{ channel: CommIntelChannel; count: number }> = [
      { channel: 'phone', count: voiceSessions.length },
      { channel: 'whatsapp', count: whatsappRows.length },
      {
        channel: 'email',
        count: commRows.filter((row) => row.channel === 'email').length,
      },
      {
        channel: 'sms',
        count: smsRows.length + commRows.filter((row) => row.channel === 'sms').length,
      },
      { channel: 'support', count: supportConversations.length },
    ].filter((row): row is { channel: CommIntelChannel; count: number } => row.count > 0);

    const feedbackRows = await this.customerSupportService.listFeedback(companyId);
    const satisfactionTrend = buildSatisfactionTrend(feedbackRows);

    return {
      totalCommunications:
        voiceSessions.length + whatsappRows.length + commRows.length + supportConversations.length,
      missedCallCount,
      averageResponseMinutes: null,
      customerSatisfactionTrend: satisfactionTrend,
      channelUsage,
      communicationVolumeTrend: buildVolumeTrend([
        ...voiceSessions.map((row) => row.startedAt),
        ...whatsappRows.map((row) => row.createdAt),
        ...commRows.map((row) => row.occurredAt),
      ]),
      supportResponsePerformance: {
        openConversationCount: supportConversations.filter((row) =>
          ['open', 'in_progress', 'waiting_customer', 'escalated'].includes(row.status),
        ).length,
        escalatedCount: supportEscalations.filter((row) =>
          ['pending', 'assigned', 'in_progress'].includes(row.status),
        ).length,
        averageResolutionHours: null,
      },
      pendingDraftCount: pendingDrafts.length,
      whatsappUnreadCount: whatsappRows.filter(
        (row) => row.direction === 'incoming' && row.deliveryStatus !== 'read',
      ).length,
    };
  }

  async buildTimeline(
    companyId: string,
    options?: { customerId?: string; limit?: number },
  ): Promise<CommIntelTimelineEntry[]> {
    const limit = options?.limit ?? 100;
    const entries: CommIntelTimelineEntry[] = [];

    const [voiceSessions, whatsappRows, commRows, supportConversations, portalRequests] =
      await Promise.all([
        this.voiceService.getCallHistory(companyId),
        this.whatsappService.listMessages(
          companyId,
          options?.customerId ? { customerId: options.customerId } : undefined,
        ),
        this.communicationsService.listMessages(companyId),
        this.customerSupportService.listConversations(companyId),
        this.db.query.portalCustomerRequests.findMany({
          where: eq(portalCustomerRequests.companyId, companyId),
          orderBy: [desc(portalCustomerRequests.createdAt)],
          limit: 100,
        }),
      ]);

    for (const session of voiceSessions) {
      if (options?.customerId && session.customerId !== options.customerId) continue;
      entries.push({
        id: session.id,
        channel: 'phone',
        direction: 'inbound',
        title: session.callerName ?? session.callerPhone ?? 'Phone call',
        preview: session.summary ?? `${session.status} call`,
        customerId: session.customerId,
        customerName: session.customerName,
        entityType: 'voice_session',
        entityId: session.id,
        occurredAt: session.startedAt,
        metadata: { status: session.status, durationSeconds: session.durationSeconds },
      });
    }

    for (const message of whatsappRows) {
      entries.push({
        id: message.id,
        channel: 'whatsapp',
        direction: message.direction === 'incoming' ? 'inbound' : 'outbound',
        title: message.customerName ?? 'WhatsApp message',
        preview: message.messageContent,
        customerId: message.customerId,
        customerName: message.customerName,
        entityType: 'whatsapp_message',
        entityId: message.id,
        occurredAt: message.sentAt ?? message.createdAt,
        metadata: { deliveryStatus: message.deliveryStatus },
      });
    }

    for (const message of commRows) {
      if (options?.customerId && message.customerId !== options.customerId) continue;
      const channel = mapCommunicationChannel(message.channel);
      entries.push({
        id: message.id,
        channel,
        direction: message.direction,
        title: message.subject ?? `${message.channel} message`,
        preview: message.body,
        customerId: message.customerId,
        customerName: message.customerName,
        entityType: 'communication',
        entityId: message.id,
        occurredAt: message.occurredAt,
        metadata: { channel: message.channel },
      });
    }

    for (const conversation of supportConversations) {
      if (options?.customerId && conversation.customerId !== options.customerId) continue;
      entries.push({
        id: conversation.id,
        channel: 'support',
        direction: 'inbound',
        title: conversation.subject,
        preview: conversation.outcome ?? conversation.status,
        customerId: conversation.customerId,
        customerName: conversation.customerName,
        entityType: 'support_conversation',
        entityId: conversation.id,
        occurredAt: conversation.createdAt,
        metadata: { status: conversation.status, channel: conversation.channel },
      });
    }

    for (const request of portalRequests) {
      if (options?.customerId && request.customerId !== options.customerId) continue;
      entries.push({
        id: request.id,
        channel: 'portal',
        direction: 'inbound',
        title: request.subject,
        preview: request.message,
        customerId: request.customerId,
        customerName: null,
        entityType: 'portal_request',
        entityId: request.id,
        occurredAt: request.createdAt.toISOString(),
        metadata: { requestType: request.requestType, status: request.status },
      });
    }

    return entries
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, limit);
  }

  async getCallHistory(companyId: string): Promise<CommIntelCallSummary[]> {
    const [sessions, intelligenceRows] = await Promise.all([
      this.voiceService.getCallHistory(companyId),
      this.db.query.commIntelCallIntelligence.findMany({
        where: eq(commIntelCallIntelligence.companyId, companyId),
        with: { assignedStaff: true, voiceSession: true },
        orderBy: [desc(commIntelCallIntelligence.createdAt)],
      }),
    ]);

    const intelligenceBySession = new Map(intelligenceRows.map((row) => [row.voiceSessionId, row]));

    return sessions.map((session) => {
      const intel = intelligenceBySession.get(session.id);
      return {
        id: intel?.id ?? session.id,
        voiceSessionId: session.id,
        customerId: intel?.customerId ?? session.customerId,
        customerName: session.customerName,
        callType: intel?.callType ?? mapSessionToCallType(session.status),
        queueName: intel?.queueName ?? null,
        assignedStaffId: intel?.assignedStaffId ?? null,
        assignedStaffName: intel?.assignedStaff
          ? `${intel.assignedStaff.firstName} ${intel.assignedStaff.lastName}`.trim()
          : null,
        outcome: intel?.outcome ?? null,
        sentiment: intel?.sentiment ?? null,
        intent: intel?.intent ?? null,
        followUpStatus: intel?.followUpStatus ?? (session.followUpRequired ? 'pending' : 'none'),
        durationSeconds: intel?.durationSeconds ?? session.durationSeconds,
        recordingId: intel?.recordingId ?? null,
        callerName: session.callerName,
        callerPhone: session.callerPhone,
        sessionStatus: session.status,
        sessionSummary: session.summary,
        startedAt: session.startedAt,
        createdAt: intel?.createdAt.toISOString() ?? session.createdAt,
      };
    });
  }

  async listRecordings(companyId: string): Promise<CommIntelRecordingSummary[]> {
    const rows = await this.db.query.commIntelRecordings.findMany({
      where: eq(commIntelRecordings.companyId, companyId),
      orderBy: [desc(commIntelRecordings.createdAt)],
    });
    return rows.map(toRecordingSummary);
  }

  async createRecording(
    scope: StaffScope,
    input: CreateCommIntelRecordingRequest,
  ): Promise<CommIntelRecordingSummary> {
    if (input.voiceSessionId) {
      const session = await this.voiceService.getSession(scope.companyId, input.voiceSessionId);
      if (!session) {
        throw new CommunicationsIntelligenceError('NOT_FOUND', 'Voice session not found');
      }
    }

    const [created] = await this.db
      .insert(commIntelRecordings)
      .values({
        companyId: scope.companyId,
        voiceSessionId: input.voiceSessionId ?? null,
        storageReference: input.storageReference?.trim() || null,
        retentionPolicyDays: input.retentionPolicyDays ?? null,
        consentStatus:
          (input.consentStatus as 'granted' | 'denied' | 'unknown' | 'revoked') ?? 'unknown',
        transcriptReference: input.transcriptReference?.trim() || null,
        aiSummary: input.aiSummary?.trim() || null,
        recordingStatus: input.storageReference ? 'available' : 'pending',
      })
      .returning();

    return toRecordingSummary(created!);
  }

  async createCallIntelligence(
    scope: StaffScope,
    input: CreateCommIntelCallIntelligenceRequest,
  ): Promise<CommIntelCallSummary> {
    const session = await this.voiceService.getSession(scope.companyId, input.voiceSessionId);
    if (!session) {
      throw new CommunicationsIntelligenceError('NOT_FOUND', 'Voice session not found');
    }

    const [created] = await this.db
      .insert(commIntelCallIntelligence)
      .values({
        companyId: scope.companyId,
        voiceSessionId: input.voiceSessionId,
        customerId: input.customerId ?? session.customerId,
        callType: input.callType,
        queueName: input.queueName?.trim() || null,
        assignedStaffId: input.assignedStaffId ?? null,
        outcome: input.outcome ?? null,
        sentiment: input.sentiment ?? null,
        intent: input.intent?.trim() || null,
        followUpStatus: input.followUpStatus?.trim() || 'none',
        recordingId: input.recordingId ?? null,
        durationSeconds: session.durationSeconds,
      })
      .returning();

    const history = await this.getCallHistory(scope.companyId);
    return history.find((row) => row.voiceSessionId === created!.voiceSessionId)!;
  }

  async listConversationInsights(
    companyId: string,
  ): Promise<CommIntelConversationInsightSummary[]> {
    const rows = await this.db.query.commIntelConversationInsights.findMany({
      where: eq(commIntelConversationInsights.companyId, companyId),
      with: { customer: true },
      orderBy: [desc(commIntelConversationInsights.createdAt)],
      limit: 100,
    });

    return rows.map((row) => ({
      id: row.id,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      customerId: row.customerId,
      customerName: row.customer?.name ?? null,
      channel: row.channel,
      sentiment: row.sentiment,
      urgencyScore: row.urgencyScore,
      hasComplaint: row.hasComplaint,
      hasCompliment: row.hasCompliment,
      buyingIntent: row.buyingIntent,
      cancellationRisk: row.cancellationRisk,
      escalationRisk: row.escalationRisk,
      followUpRecommendation: row.followUpRecommendation,
      aiSummary: row.aiSummary,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async getConversationSummary(
    companyId: string,
    sourceType: string,
    sourceId: string,
  ): Promise<CommIntelConversationInsightSummary | null> {
    const row = await this.db.query.commIntelConversationInsights.findFirst({
      where: and(
        eq(commIntelConversationInsights.companyId, companyId),
        eq(commIntelConversationInsights.sourceType, sourceType as never),
        eq(commIntelConversationInsights.sourceId, sourceId),
      ),
      with: { customer: true },
      orderBy: [desc(commIntelConversationInsights.createdAt)],
    });

    if (!row) return null;

    return {
      id: row.id,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      customerId: row.customerId,
      customerName: row.customer?.name ?? null,
      channel: row.channel,
      sentiment: row.sentiment,
      urgencyScore: row.urgencyScore,
      hasComplaint: row.hasComplaint,
      hasCompliment: row.hasCompliment,
      buyingIntent: row.buyingIntent,
      cancellationRisk: row.cancellationRisk,
      escalationRisk: row.escalationRisk,
      followUpRecommendation: row.followUpRecommendation,
      aiSummary: row.aiSummary,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async createConversationInsight(
    scope: StaffScope,
    input: CreateCommIntelConversationInsightRequest,
  ): Promise<CommIntelConversationInsightSummary> {
    const [created] = await this.db
      .insert(commIntelConversationInsights)
      .values({
        companyId: scope.companyId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        customerId: input.customerId ?? null,
        channel: input.channel,
        sentiment: input.sentiment ?? 'neutral',
        urgencyScore: input.urgencyScore ?? 0,
        hasComplaint: input.hasComplaint ?? false,
        hasCompliment: input.hasCompliment ?? false,
        buyingIntent: input.buyingIntent ?? false,
        cancellationRisk: input.cancellationRisk ?? false,
        escalationRisk: input.escalationRisk ?? false,
        followUpRecommendation: input.followUpRecommendation?.trim() || null,
        aiSummary: input.aiSummary?.trim() || null,
      })
      .returning();

    return (await this.getConversationSummary(
      scope.companyId,
      created!.sourceType,
      created!.sourceId,
    ))!;
  }

  async listEmailThreads(companyId: string): Promise<CommIntelEmailThreadSummary[]> {
    await this.syncEmailThreadsFromCommunications(companyId);

    const rows = await this.db.query.commIntelEmailThreads.findMany({
      where: eq(commIntelEmailThreads.companyId, companyId),
      with: { customer: true },
      orderBy: [desc(commIntelEmailThreads.lastMessageAt)],
      limit: 100,
    });

    return rows.map((row) => ({
      id: row.id,
      customerId: row.customerId,
      customerName: row.customer?.name ?? 'Unknown',
      subject: row.subject,
      threadKey: row.threadKey,
      communicationIds: row.communicationIds,
      sentiment: row.sentiment,
      priority: row.priority,
      aiSummary: row.aiSummary,
      lastMessageAt: row.lastMessageAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async syncEmailThreadsFromCommunications(companyId: string): Promise<void> {
    const emailMessages = await this.db.query.communications.findMany({
      where: and(eq(communications.companyId, companyId), eq(communications.channel, 'email')),
      orderBy: [desc(communications.occurredAt)],
      limit: 200,
    });

    const grouped = new Map<string, typeof emailMessages>();

    for (const message of emailMessages) {
      const threadKey = `${message.customerId}:${(message.subject ?? 'no-subject').trim().toLowerCase()}`;
      const bucket = grouped.get(threadKey) ?? [];
      bucket.push(message);
      grouped.set(threadKey, bucket);
    }

    for (const [threadKey, messages] of grouped.entries()) {
      const latest = messages[0]!;
      const existing = await this.db.query.commIntelEmailThreads.findFirst({
        where: and(
          eq(commIntelEmailThreads.companyId, companyId),
          eq(commIntelEmailThreads.threadKey, threadKey),
        ),
      });

      if (existing) {
        await this.db
          .update(commIntelEmailThreads)
          .set({
            communicationIds: messages.map((row) => row.id),
            lastMessageAt: latest.occurredAt,
            updatedAt: new Date(),
          })
          .where(eq(commIntelEmailThreads.id, existing.id));
      } else {
        await this.db.insert(commIntelEmailThreads).values({
          companyId,
          customerId: latest.customerId,
          subject: latest.subject ?? 'No subject',
          threadKey,
          communicationIds: messages.map((row) => row.id),
          lastMessageAt: latest.occurredAt,
        });
      }
    }
  }

  async createEmailThread(
    scope: StaffScope,
    input: CreateCommIntelEmailThreadRequest,
  ): Promise<CommIntelEmailThreadSummary> {
    const [created] = await this.db
      .insert(commIntelEmailThreads)
      .values({
        companyId: scope.companyId,
        customerId: input.customerId,
        subject: input.subject.trim(),
        threadKey: input.threadKey.trim(),
        communicationIds: input.communicationIds ?? [],
        sentiment: input.sentiment ?? 'neutral',
        priority: input.priority?.trim() || 'normal',
        aiSummary: input.aiSummary?.trim() || null,
      })
      .returning();

    const threads = await this.listEmailThreads(scope.companyId);
    return threads.find((row) => row.id === created!.id)!;
  }

  async listSmsRecords(companyId: string): Promise<CommIntelSmsRecordSummary[]> {
    const rows = await this.db.query.commIntelSmsRecords.findMany({
      where: eq(commIntelSmsRecords.companyId, companyId),
      with: { customer: true },
      orderBy: [desc(commIntelSmsRecords.createdAt)],
      limit: 100,
    });

    return rows.map((row) => ({
      id: row.id,
      customerId: row.customerId,
      customerName: row.customer?.name ?? null,
      communicationId: row.communicationId,
      templateId: row.templateId,
      campaignKey: row.campaignKey,
      direction: row.direction,
      status: row.status,
      bodyPreview: row.bodyPreview,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createSmsRecord(
    scope: StaffScope,
    input: CreateCommIntelSmsRecordRequest,
  ): Promise<CommIntelSmsRecordSummary> {
    const bodyPreview = input.bodyPreview.trim();
    if (!bodyPreview) {
      throw new CommunicationsIntelligenceError('VALIDATION_ERROR', 'Body preview is required');
    }

    const [created] = await this.db
      .insert(commIntelSmsRecords)
      .values({
        companyId: scope.companyId,
        customerId: input.customerId ?? null,
        communicationId: input.communicationId ?? null,
        templateId: input.templateId ?? null,
        campaignKey: input.campaignKey?.trim() || null,
        direction: input.direction,
        status: input.status ?? 'sent',
        bodyPreview,
      })
      .returning();

    const records = await this.listSmsRecords(scope.companyId);
    return records.find((row) => row.id === created!.id)!;
  }

  async listDraftActions(
    companyId: string,
    status?: string,
  ): Promise<CommIntelDraftActionSummary[]> {
    const rows = await this.db.query.commIntelDraftActions.findMany({
      where: status
        ? and(
            eq(commIntelDraftActions.companyId, companyId),
            eq(commIntelDraftActions.status, status as never),
          )
        : eq(commIntelDraftActions.companyId, companyId),
      with: { customer: true },
      orderBy: [desc(commIntelDraftActions.createdAt)],
      limit: 100,
    });

    return rows.map((row) => ({
      id: row.id,
      draftType: row.draftType,
      status: row.status,
      channel: row.channel,
      customerId: row.customerId,
      customerName: row.customer?.name ?? null,
      subject: row.subject,
      body: row.body,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createDraftAction(
    scope: StaffScope,
    input: CreateCommIntelDraftActionRequest,
  ): Promise<CommIntelDraftActionSummary> {
    const body = input.body.trim();
    if (!body) {
      throw new CommunicationsIntelligenceError('VALIDATION_ERROR', 'Draft body is required');
    }

    const [created] = await this.db
      .insert(commIntelDraftActions)
      .values({
        companyId: scope.companyId,
        draftType: input.draftType,
        status: 'pending_approval',
        channel: input.channel,
        customerId: input.customerId ?? null,
        subject: input.subject?.trim() || null,
        body,
        sourceType: input.sourceType ?? null,
        sourceId: input.sourceId ?? null,
        jobId: input.jobId ?? null,
        quoteId: input.quoteId ?? null,
        invoiceId: input.invoiceId ?? null,
        supportConversationId: input.supportConversationId ?? null,
        createdByUserId: scope.userId,
      })
      .returning();

    await this.notificationService.createNotification({
      companyId: scope.companyId,
      recipientType: 'staff',
      recipientUserId: scope.userId,
      notificationType: 'comm_intel_alert',
      title: 'Communication draft pending approval',
      body: input.subject?.trim() || body.slice(0, 120),
      entityType: 'comm_intel_draft',
      entityId: created!.id,
    });

    const drafts = await this.listDraftActions(scope.companyId);
    return drafts.find((row) => row.id === created!.id)!;
  }

  async buildCommunicationsIntelligenceAuraContext(
    companyId: string,
  ): Promise<CommIntelAuraContext> {
    const dashboard = await this.getAnalyticsDashboard(companyId);
    const topChannel =
      [...dashboard.channelUsage].sort((a, b) => b.count - a.count)[0]?.channel ?? null;

    return {
      summary: `${dashboard.totalCommunications} communication(s), ${dashboard.missedCallCount} missed call(s), ${dashboard.pendingDraftCount} pending draft(s).`,
      totalCommunications: dashboard.totalCommunications,
      missedCallCount: dashboard.missedCallCount,
      pendingDraftCount: dashboard.pendingDraftCount,
      openSupportCount: dashboard.supportResponsePerformance.openConversationCount,
      whatsappMessageCount:
        dashboard.channelUsage.find((row) => row.channel === 'whatsapp')?.count ?? 0,
      topChannel,
    };
  }

  async buildCommunicationsWorkspace(
    scope: StaffScope,
    options: {
      providerStatuses: ProviderStatusRow[];
      personalWhatsappAccountCount: number;
    },
  ): Promise<CommunicationsWorkspaceResponse> {
    const messageScope = {
      companyId: scope.companyId,
      userId: scope.userId,
      roleName: scope.roleName,
      permissions: scope.permissions,
    };

    const [
      timeline,
      insights,
      callHistory,
      commRows,
      dispatchRows,
      pendingDraftRows,
      supportEscalations,
    ] = await Promise.all([
      this.buildTimeline(scope.companyId, { limit: 200 }),
      this.listConversationInsights(scope.companyId),
      this.getCallHistory(scope.companyId),
      this.communicationsService.listMessages(messageScope),
      this.db.query.ucDispatchNotifications.findMany({
        where: eq(ucDispatchNotifications.companyId, scope.companyId),
        orderBy: [desc(ucDispatchNotifications.createdAt)],
        limit: 50,
      }),
      this.db.query.commIntelDraftActions.findMany({
        where: and(
          eq(commIntelDraftActions.companyId, scope.companyId),
          eq(commIntelDraftActions.status, 'pending_approval'),
        ),
        with: { customer: true },
        orderBy: [desc(commIntelDraftActions.createdAt)],
        limit: 100,
      }),
      this.customerSupportService.listEscalations(scope.companyId),
    ]);

    const insightBySource = new Map(
      insights.map((row) => [`${row.sourceType}:${row.sourceId}`, row]),
    );
    const callBySession = new Map(callHistory.map((row) => [row.voiceSessionId, row]));
    const commById = new Map(commRows.map((row) => [row.id, row]));

    const customerIds = Array.from(
      new Set(
        [
          ...timeline.map((entry) => entry.customerId),
          ...pendingDraftRows.map((draft) => draft.customerId),
        ].filter(Boolean),
      ),
    ) as string[];

    const jobIds = Array.from(
      new Set(
        [
          ...commRows.map((row) => row.jobId),
          ...pendingDraftRows.map((row) => row.jobId),
          ...dispatchRows.map((row) => row.jobId),
        ].filter(Boolean),
      ),
    ) as string[];

    const entityIndex = await this.loadWorkspaceEntityIndex(scope.companyId, customerIds, jobIds);

    const conversations: CommunicationsWorkspaceConversation[] = [];

    for (const entry of timeline) {
      const workspaceChannel = mapTimelineToWorkspaceChannel(entry);
      const insight = insightBySource.get(`${entry.entityType}:${entry.entityId}`);
      const entityId = entry.entityId;
      const commRow =
        entry.entityType === 'communication' && entityId ? commById.get(entityId) : null;
      const callRow =
        entry.entityType === 'voice_session' && entityId ? callBySession.get(entityId) : null;
      const queues = classifyWorkspaceQueues(entry, {
        hasComplaint: insight?.hasComplaint ?? false,
        escalationRisk: insight?.escalationRisk ?? false,
      });

      conversations.push({
        id: entry.id,
        channel: workspaceChannel,
        queues,
        direction: entry.direction,
        subject: entry.title,
        preview: entry.preview,
        isUnread: isWorkspaceUnread(entry),
        occurredAt: entry.occurredAt,
        sourceType: entry.entityType ?? 'timeline',
        sourceId: entry.entityId ?? entry.id,
        entities: resolveWorkspaceEntities({
          customerId: entry.customerId,
          customerName: entry.customerName,
          jobId: commRow?.jobId ?? null,
          jobNumber: commRow?.jobNumber ?? null,
          staffId: callRow?.assignedStaffId ?? commRow?.authorUserId ?? null,
          staffName: callRow?.assignedStaffName ?? commRow?.authorName ?? null,
          entityIndex,
        }),
      });
    }

    for (const draft of pendingDraftRows) {
      conversations.push({
        id: `draft-${draft.id}`,
        channel: mapCommIntelToWorkspaceChannel(draft.channel),
        queues: ['needs_reply'],
        direction: 'outbound',
        subject: draft.subject ?? 'Draft awaiting approval',
        preview: draft.body,
        isUnread: true,
        occurredAt: draft.createdAt.toISOString(),
        sourceType: 'draft_action',
        sourceId: draft.id,
        entities: resolveWorkspaceEntities({
          customerId: draft.customerId,
          customerName: draft.customer?.name ?? null,
          jobId: draft.jobId,
          jobNumber: draft.jobId ? (entityIndex.jobsById.get(draft.jobId)?.number ?? null) : null,
          staffId: draft.staffUserId ?? draft.technicianId,
          staffName: null,
          entityIndex,
          draftLeadId: draft.leadId,
          draftQuoteId: draft.quoteId,
          draftInvoiceId: draft.invoiceId,
        }),
      });
    }

    for (const notification of dispatchRows) {
      const preview = notification.notificationType.replace(/_/g, ' ');
      conversations.push({
        id: `dispatch-${notification.id}`,
        channel: mapDispatchChannel(notification.channel),
        queues: classifyDispatchQueues(notification.notificationType),
        direction: 'outbound',
        subject: preview,
        preview: notification.status,
        isUnread: false,
        occurredAt: notification.sentAt?.toISOString() ?? notification.createdAt.toISOString(),
        sourceType: 'dispatch_notification',
        sourceId: notification.id,
        entities: resolveWorkspaceEntities({
          customerId: notification.customerId,
          customerName: null,
          jobId: notification.jobId,
          jobNumber: null,
          staffId: null,
          staffName: null,
          entityIndex,
        }),
      });
    }

    for (const escalation of supportEscalations.filter((row) =>
      ['pending', 'assigned', 'in_progress'].includes(row.status),
    )) {
      conversations.push({
        id: `escalation-${escalation.id}`,
        channel: 'system',
        queues: ['escalated'],
        direction: 'inbound',
        subject: escalation.reason ?? 'Support escalation',
        preview: escalation.status,
        isUnread: true,
        occurredAt: escalation.createdAt,
        sourceType: 'support_escalation',
        sourceId: escalation.id,
        entities: resolveWorkspaceEntities({
          customerId: escalation.customerId ?? null,
          customerName: escalation.customerName ?? null,
          jobId: null,
          jobNumber: null,
          staffId: escalation.assignedUserId ?? null,
          staffName: escalation.assignedUserName ?? null,
          entityIndex,
        }),
      });
    }

    conversations.sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );

    const queueSummaries = COMMUNICATIONS_WORKSPACE_QUEUE_OPTIONS.map((option) => ({
      queue: option.value,
      label: option.label,
      count: conversations.filter((row) => row.queues.includes(option.value)).length,
    }));

    const integrations = buildWorkspaceIntegrations(
      options.providerStatuses,
      options.personalWhatsappAccountCount,
    );

    return {
      summary: `${conversations.length} conversation(s) across ${integrations.filter((row) => row.state === 'connected').length} connected channel(s).`,
      integrations,
      queueSummaries,
      conversations,
    };
  }

  private async loadWorkspaceEntityIndex(
    companyId: string,
    customerIds: string[],
    jobIds: string[],
  ) {
    if (customerIds.length === 0) {
      return {
        leadsByCustomer: new Map<string, { id: string; name: string }>(),
        quotesByCustomer: new Map<string, { id: string; number: string }>(),
        invoicesByCustomer: new Map<string, { id: string; number: string }>(),
        jobsById: new Map<string, { id: string; number: string | null }>(),
      };
    }

    const [leadRows, quoteRows, invoiceRows] = await Promise.all([
      this.db.query.leads.findMany({
        where: and(eq(leads.companyId, companyId), inArray(leads.customerId, customerIds)),
        columns: { id: true, customerId: true, title: true, contactName: true },
        orderBy: [desc(leads.updatedAt)],
      }),
      this.db.query.quotes.findMany({
        where: and(eq(quotes.companyId, companyId), inArray(quotes.customerId, customerIds)),
        columns: { id: true, customerId: true, quoteNumber: true },
        orderBy: [desc(quotes.updatedAt)],
      }),
      this.db.query.invoices.findMany({
        where: and(eq(invoices.companyId, companyId), inArray(invoices.customerId, customerIds)),
        columns: { id: true, customerId: true, invoiceNumber: true },
        orderBy: [desc(invoices.updatedAt)],
      }),
    ]);

    const leadsByCustomer = new Map<string, { id: string; name: string }>();
    for (const row of leadRows) {
      if (!row.customerId || leadsByCustomer.has(row.customerId)) continue;
      leadsByCustomer.set(row.customerId, {
        id: row.id,
        name: row.title || row.contactName,
      });
    }

    const quotesByCustomer = new Map<string, { id: string; number: string }>();
    for (const row of quoteRows) {
      if (quotesByCustomer.has(row.customerId)) continue;
      quotesByCustomer.set(row.customerId, { id: row.id, number: row.quoteNumber });
    }

    const invoicesByCustomer = new Map<string, { id: string; number: string }>();
    for (const row of invoiceRows) {
      if (invoicesByCustomer.has(row.customerId)) continue;
      invoicesByCustomer.set(row.customerId, { id: row.id, number: row.invoiceNumber });
    }

    const jobRows =
      jobIds.length > 0
        ? await this.db.query.jobs.findMany({
            where: and(eq(jobs.companyId, companyId), inArray(jobs.id, jobIds)),
            columns: { id: true, jobNumber: true },
          })
        : [];

    const jobsById = new Map(jobRows.map((row) => [row.id, { id: row.id, number: row.jobNumber }]));

    return { leadsByCustomer, quotesByCustomer, invoicesByCustomer, jobsById };
  }

  async countPersonalWhatsappAccounts(companyId: string): Promise<number> {
    const rows = await this.db.query.personalCommAccounts.findMany({
      where: and(
        eq(personalCommAccounts.companyId, companyId),
        eq(personalCommAccounts.accountType, 'personal'),
      ),
      columns: { id: true },
    });
    return rows.length;
  }
}

function mapTimelineToWorkspaceChannel(entry: CommIntelTimelineEntry): CommunicationsWorkspaceChannel {
  if (entry.metadata?.accountType === 'personal' || entry.metadata?.source === 'personal_whatsapp') {
    return 'personal_whatsapp';
  }
  if (entry.channel === 'whatsapp') return 'whatsapp_business';
  if (entry.channel === 'phone') return 'calls';
  if (entry.channel === 'email') return 'email';
  if (entry.channel === 'sms') return 'sms';
  return 'system';
}

function mapCommIntelToWorkspaceChannel(channel: CommIntelChannel): CommunicationsWorkspaceChannel {
  if (channel === 'whatsapp') return 'whatsapp_business';
  if (channel === 'phone') return 'calls';
  if (channel === 'email') return 'email';
  if (channel === 'sms') return 'sms';
  return 'system';
}

function mapDispatchChannel(channel: string | null): CommunicationsWorkspaceChannel {
  if (channel === 'whatsapp') return 'whatsapp_business';
  if (channel === 'sms') return 'sms';
  if (channel === 'email') return 'email';
  if (channel === 'voice') return 'calls';
  return 'system';
}

function isWorkspaceUnread(entry: CommIntelTimelineEntry): boolean {
  const meta = entry.metadata ?? {};
  if (entry.direction !== 'inbound') return false;
  if (meta.deliveryStatus && meta.deliveryStatus !== 'read') return true;
  if (meta.status === 'open' || meta.status === 'in_progress') return true;
  return false;
}

function classifyWorkspaceQueues(
  entry: CommIntelTimelineEntry,
  flags: { hasComplaint: boolean; escalationRisk: boolean },
): CommunicationsWorkspaceQueue[] {
  const queues: CommunicationsWorkspaceQueue[] = [];
  const meta = entry.metadata ?? {};
  const haystack = `${entry.title} ${entry.preview}`.toLowerCase();

  if (isWorkspaceUnread(entry)) queues.push('unread');
  if (
    entry.direction === 'inbound' &&
    (meta.followUpStatus === 'pending' ||
      meta.status === 'open' ||
      meta.status === 'in_progress' ||
      meta.status === 'escalated')
  ) {
    queues.push('needs_reply');
  }
  if (entry.direction === 'outbound' && meta.status === 'waiting_customer') {
    queues.push('waiting_for_customer');
  }
  if (/book|appointment|schedule/.test(haystack) || meta.requestType === 'booking') {
    queues.push('booking');
  }
  if (/eta|delay|en route|en_route|technician/.test(haystack)) {
    queues.push('eta_delay');
  }
  if (/quote|estimate|proposal/.test(haystack)) queues.push('quote_followup');
  if (/payment|invoice|pay|overdue/.test(haystack)) queues.push('payment_followup');
  if (flags.hasComplaint || /complaint|unhappy|refund/.test(haystack)) queues.push('complaint');
  if (meta.source === 'supplier' || /supplier|procurement|purchase order/.test(haystack)) {
    queues.push('supplier');
  }
  if (/cv|resume|recruit|job application/.test(haystack)) queues.push('cv_recruitment');
  if (/opt.?out|unsubscribe|stop messaging/.test(haystack)) queues.push('marketing_opt_out');
  if (meta.status === 'escalated' || flags.escalationRisk) queues.push('escalated');

  return queues;
}

function classifyDispatchQueues(
  notificationType: string,
): CommunicationsWorkspaceQueue[] {
  if (notificationType.includes('eta') || notificationType.includes('en_route')) {
    return ['eta_delay'];
  }
  if (notificationType.includes('appointment') || notificationType.includes('confirmation')) {
    return ['booking'];
  }
  if (notificationType.includes('invoice') || notificationType.includes('payment')) {
    return ['payment_followup'];
  }
  return ['waiting_for_customer'];
}

function resolveWorkspaceEntities(input: {
  customerId: string | null;
  customerName: string | null;
  jobId: string | null;
  jobNumber: string | null;
  staffId: string | null;
  staffName: string | null;
  entityIndex: {
    leadsByCustomer: Map<string, { id: string; name: string }>;
    quotesByCustomer: Map<string, { id: string; number: string }>;
    invoicesByCustomer: Map<string, { id: string; number: string }>;
    jobsById: Map<string, { id: string; number: string | null }>;
  };
  draftLeadId?: string | null;
  draftQuoteId?: string | null;
  draftInvoiceId?: string | null;
}): CommunicationsWorkspaceEntityLinks {
  const customerId = input.customerId;
  const lead = customerId ? input.entityIndex.leadsByCustomer.get(customerId) : null;
  const quote = customerId ? input.entityIndex.quotesByCustomer.get(customerId) : null;
  const invoice = customerId ? input.entityIndex.invoicesByCustomer.get(customerId) : null;
  const resolvedJobNumber =
    input.jobNumber ??
    (input.jobId ? (input.entityIndex.jobsById.get(input.jobId)?.number ?? null) : null);

  return {
    leadId: input.draftLeadId ?? lead?.id ?? null,
    leadName: lead?.name ?? null,
    customerId,
    customerName: input.customerName,
    jobId: input.jobId,
    jobNumber: resolvedJobNumber,
    quoteId: input.draftQuoteId ?? quote?.id ?? null,
    quoteNumber: quote?.number ?? null,
    invoiceId: input.draftInvoiceId ?? invoice?.id ?? null,
    invoiceNumber: invoice?.number ?? null,
    supplierId: null,
    supplierName: null,
    staffId: input.staffId,
    staffName: input.staffName,
  };
}

function buildWorkspaceIntegrations(
  providerStatuses: ProviderStatusRow[],
  personalAccountCount: number,
): CommunicationsChannelIntegration[] {
  const whatsapp = providerStatuses.find((row) => row.provider === 'whatsapp');
  const email = providerStatuses.find((row) => row.provider === 'email');
  const sms = providerStatuses.find((row) => row.provider === 'sms');

  const mapState = (row: ProviderStatusRow | undefined): CommunicationsIntegrationState => {
    if (!row) return 'not_configured';
    if (row.connectionStatus === 'connected') {
      return row.syncStatus === 'running' ? 'syncing' : 'connected';
    }
    if (row.connectionStatus === 'error') return 'error';
    return 'not_configured';
  };

  return COMMUNICATIONS_WORKSPACE_CHANNEL_OPTIONS.map((option) => {
    if (option.value === 'whatsapp_business') {
      const state = mapState(whatsapp);
      return {
        channel: option.value,
        label: option.label,
        state,
        detail:
          state === 'connected' || state === 'syncing'
            ? 'WhatsApp Business provider connected on staging.'
            : 'WhatsApp Business not configured — connect Meta credentials in Integrations.',
      };
    }
    if (option.value === 'personal_whatsapp') {
      if (personalAccountCount === 0) {
        return {
          channel: option.value,
          label: option.label,
          state: 'provider_unavailable',
          detail: 'Provider feature unavailable — personal WhatsApp is not connected.',
        };
      }
      return {
        channel: option.value,
        label: option.label,
        state: 'not_configured',
        detail: 'Personal account registered but no live personal WhatsApp sync on staging.',
      };
    }
    if (option.value === 'email') {
      const state = mapState(email);
      return {
        channel: option.value,
        label: option.label,
        state,
        detail:
          state === 'connected' || state === 'syncing'
            ? 'Email provider connected.'
            : 'Email SMTP/IMAP not configured on staging.',
      };
    }
    if (option.value === 'sms') {
      const state = mapState(sms);
      return {
        channel: option.value,
        label: option.label,
        state: state === 'not_configured' ? 'provider_unavailable' : state,
        detail: 'SMS provider not integrated on staging.',
      };
    }
    if (option.value === 'calls') {
      return {
        channel: option.value,
        label: option.label,
        state: 'not_configured',
        detail: 'Voice/calls adapter present — no live telephony provider on staging.',
      };
    }
    return {
      channel: option.value,
      label: option.label,
      state: 'connected',
      detail: 'Internal system messages, portal requests, and support escalations.',
    };
  });
}

function toRecordingSummary(
  row: typeof commIntelRecordings.$inferSelect,
): CommIntelRecordingSummary {
  return {
    id: row.id,
    voiceSessionId: row.voiceSessionId,
    storageReference: row.storageReference,
    retentionPolicyDays: row.retentionPolicyDays,
    consentStatus: row.consentStatus,
    recordingStatus: row.recordingStatus,
    transcriptionStatus: row.transcriptionStatus,
    transcriptReference: row.transcriptReference,
    aiSummary: row.aiSummary,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapCommunicationChannel(channel: string): CommIntelChannel {
  if (channel === 'email') return 'email';
  if (channel === 'sms') return 'sms';
  if (channel === 'phone') return 'phone';
  return 'internal';
}

function mapSessionToCallType(status: string): CreateCommIntelCallIntelligenceRequest['callType'] {
  if (status === 'missed') return 'missed';
  if (status === 'abandoned') return 'callback';
  return 'inbound';
}

function buildVolumeTrend(dates: string[]): Array<{ period: string; count: number }> {
  const buckets = new Map<string, number>();
  for (const value of dates) {
    const date = new Date(value);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, count]) => ({ period, count }));
}

function buildSatisfactionTrend(
  feedbackRows: Array<{ sentiment: string; createdAt: string }>,
): Array<{ period: string; positiveCount: number; negativeCount: number }> {
  const buckets = new Map<string, { positiveCount: number; negativeCount: number }>();
  for (const row of feedbackRows) {
    const date = new Date(row.createdAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const entry = buckets.get(key) ?? { positiveCount: 0, negativeCount: 0 };
    if (row.sentiment === 'positive') entry.positiveCount += 1;
    if (row.sentiment === 'negative') entry.negativeCount += 1;
    buckets.set(key, entry);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, counts]) => ({ period, ...counts }));
}
