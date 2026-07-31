import { and, desc, eq } from 'drizzle-orm';
import type {
  AnalyzePersonalCommMediaRequest,
  AnalyzePersonalCommVoiceRequest,
  CreatePersonalCommAccountRequest,
  CreatePersonalCommActionRequest,
  OverridePersonalCommClassificationRequest,
  PersonalCommAccountSummary,
  PersonalCommActionSummary,
  PersonalCommAuraContext,
  PersonalCommClassification,
  PersonalCommConversationSummary,
  PersonalCommDocumentAnalysisSummary,
  PersonalCommExecutiveDashboard,
  PersonalCommFollowUpSummary,
  PersonalCommLeadSignalSummary,
  PersonalCommMediaAnalysisSummary,
  PersonalCommMediaItemSummary,
  PersonalCommPrivacySettings,
  PersonalCommSignalType,
  PersonalCommVoiceAnalysisSummary,
  UpdatePersonalCommPrivacyRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  personalCommAccounts,
  personalCommActions,
  personalCommClassificationCorrections,
  personalCommConversations,
  personalCommDocumentAnalyses,
  personalCommFollowUps,
  personalCommLeadSignals,
  personalCommMediaAnalyses,
  personalCommMediaItems,
  personalCommPrivacySettings,
  personalCommVoiceAnalyses,
  whatsappConnections,
  whatsappMessages,
} from '@titan/db';
import type { AiOrchestrationService } from './ai-orchestration.service.js';
import type { CommunicationsIntelligenceService } from './communications-intelligence.service.js';
import type { NotificationService } from './notification.service.js';
import type { WhatsappService } from './whatsapp.service.js';

export class PersonalCommunicationsIntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PersonalCommunicationsIntelligenceError';
  }
}

type StaffScope = {
  companyId: string;
  userId: string;
};

const MEDIA_PLACEHOLDERS = [
  '[audio message]',
  '[image message]',
  '[video message]',
  '[document message]',
  '[voice message]',
];

const EMERGENCY_KEYWORDS = [
  'emergency',
  'burst',
  'flooding',
  'urgent',
  'no water',
  'gas leak',
  'sewer',
];
const QUOTE_KEYWORDS = ['quote', 'estimate', 'pricing', 'how much', 'cost'];
const BOOKING_KEYWORDS = ['book', 'appointment', 'schedule', 'when can you'];
const PAYMENT_KEYWORDS = ['paid', 'payment', 'eft', 'proof of payment'];
const INVOICE_KEYWORDS = ['invoice', 'statement', 'bill'];
const COMPLAINT_KEYWORDS = ['complaint', 'unhappy', 'disappointed', 'bad service'];
const COMPLIMENT_KEYWORDS = ['thank you', 'great job', 'excellent', 'well done'];

export class PersonalCommunicationsIntelligenceService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly whatsappService: WhatsappService,
    private readonly communicationsIntelligenceService: CommunicationsIntelligenceService,
    private readonly aiOrchestrationService: AiOrchestrationService,
    private readonly notificationService: NotificationService,
  ) {}

  async getExecutiveDashboard(companyId: string): Promise<PersonalCommExecutiveDashboard> {
    const [
      conversations,
      leadSignals,
      followUps,
      pendingActions,
      voiceAnalyses,
      documentAnalyses,
      mediaItems,
    ] = await Promise.all([
      this.listBusinessConversations(companyId),
      this.db.query.personalCommLeadSignals.findMany({
        where: eq(personalCommLeadSignals.companyId, companyId),
        orderBy: [desc(personalCommLeadSignals.createdAt)],
        limit: 100,
      }),
      this.listFollowUpQueue(companyId),
      this.listActions(companyId, 'pending_approval'),
      this.db.query.personalCommVoiceAnalyses.findMany({
        where: eq(personalCommVoiceAnalyses.companyId, companyId),
      }),
      this.db.query.personalCommDocumentAnalyses.findMany({
        where: eq(personalCommDocumentAnalyses.companyId, companyId),
      }),
      this.db.query.personalCommMediaItems.findMany({
        where: eq(personalCommMediaItems.companyId, companyId),
      }),
    ]);

    const businessCount = conversations.filter(
      (row) => !row.excludedFromReports && row.privacyMode === 'business',
    ).length;
    const personalCount = conversations.filter((row) => row.privacyMode === 'personal').length;
    const whatsappContext = await this.whatsappService.buildAuraContext(companyId);

    const hourMap = new Map<number, number>();
    const languageMap = new Map<string, number>();
    for (const row of conversations) {
      if (row.lastMessageAt) {
        const hour = new Date(row.lastMessageAt).getHours();
        hourMap.set(hour, (hourMap.get(hour) ?? 0) + 1);
      }
      languageMap.set('en', (languageMap.get('en') ?? 0) + 1);
    }

    const awaitingReply = followUps.filter((item) => item.followUpType === 'awaiting_reply').length;

    return {
      summary: `${businessCount} business conversation(s), ${leadSignals.length} lead signal(s), ${followUps.length} follow-up item(s), ${pendingActions.length} pending action(s).`,
      totalBusinessConversations: businessCount,
      totalPersonalConversations: personalCount,
      personalVsBusinessRatio:
        businessCount + personalCount > 0
          ? Math.round((personalCount / (businessCount + personalCount)) * 100) / 100
          : null,
      newLeadsDetected: leadSignals.filter((row) => row.signalType === 'new_lead').length,
      averageResponseMinutes: null,
      missedOpportunityCount: awaitingReply,
      pendingFollowUpCount: followUps.length,
      pendingActionCount: pendingActions.length,
      voiceNotesProcessed: voiceAnalyses.filter((row) => row.status === 'completed').length,
      documentsAnalysed: documentAnalyses.filter((row) => row.status === 'completed').length,
      mediaReceivedCount: mediaItems.length,
      busiestHours: [...hourMap.entries()]
        .map(([hour, count]) => ({ hour, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      languageUsage: [...languageMap.entries()].map(([language, count]) => ({ language, count })),
      whatsappConnected: whatsappContext.isConnected,
      recentLeadSignals: leadSignals.slice(0, 10).map((row) => ({
        id: row.id,
        conversationId: row.conversationId,
        signalType: row.signalType,
        subject: row.subject,
        recommendation: row.recommendation,
        customerId: row.customerId,
        draftType: row.draftType,
        confidence: row.confidence,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async listAccounts(companyId: string): Promise<PersonalCommAccountSummary[]> {
    const rows = await this.db.query.personalCommAccounts.findMany({
      where: eq(personalCommAccounts.companyId, companyId),
      orderBy: [desc(personalCommAccounts.createdAt)],
    });

    return rows.map((row) => ({
      id: row.id,
      accountType: row.accountType,
      label: row.label,
      phoneNumber: row.phoneNumber,
      whatsappConnectionId: row.whatsappConnectionId,
      isActive: row.isActive,
      syncEnabled: row.syncEnabled,
      lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    }));
  }

  async createAccount(
    scope: StaffScope,
    input: CreatePersonalCommAccountRequest,
  ): Promise<PersonalCommAccountSummary> {
    const label = input.label.trim();
    if (!label) {
      throw new PersonalCommunicationsIntelligenceError(
        'VALIDATION_ERROR',
        'Account label is required',
      );
    }

    if (input.whatsappConnectionId) {
      const connection = await this.db.query.whatsappConnections.findFirst({
        where: and(
          eq(whatsappConnections.id, input.whatsappConnectionId),
          eq(whatsappConnections.companyId, scope.companyId),
        ),
      });
      if (!connection) {
        throw new PersonalCommunicationsIntelligenceError(
          'NOT_FOUND',
          'WhatsApp connection not found',
        );
      }
    }

    const [created] = await this.db
      .insert(personalCommAccounts)
      .values({
        companyId: scope.companyId,
        accountType: input.accountType,
        label,
        phoneNumber: input.phoneNumber?.trim() || null,
        whatsappConnectionId: input.whatsappConnectionId ?? null,
        syncEnabled: input.syncEnabled ?? true,
      })
      .returning();

    const accounts = await this.listAccounts(scope.companyId);
    return accounts.find((item) => item.id === created!.id)!;
  }

  async syncConversations(companyId: string): Promise<PersonalCommConversationSummary[]> {
    const messages = await this.whatsappService.listMessages(companyId);
    const accounts = await this.listAccounts(companyId);
    const businessAccount =
      accounts.find((row) => row.accountType === 'business') ??
      (await this.ensureDefaultBusinessAccount(companyId));

    const grouped = new Map<string, typeof messages>();
    for (const message of messages) {
      const threadKey = message.customerId ?? `unknown:${message.id}`;
      const list = grouped.get(threadKey) ?? [];
      list.push(message);
      grouped.set(threadKey, list);
    }

    for (const [threadKey, threadMessages] of grouped) {
      const sorted = [...threadMessages].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      const last = sorted[sorted.length - 1]!;
      const customerId = last.customerId;

      const existing = await this.db.query.personalCommConversations.findFirst({
        where: and(
          eq(personalCommConversations.companyId, companyId),
          eq(personalCommConversations.threadKey, threadKey),
        ),
      });

      const classification = classifyMessageText(
        sorted.map((item) => item.messageContent).join('\n'),
        Boolean(customerId),
      );

      if (existing) {
        await this.db
          .update(personalCommConversations)
          .set({
            accountId: businessAccount.id,
            customerId,
            lastMessageAt: new Date(last.createdAt),
            messageCount: sorted.length,
            classification: existing.manualClassificationOverride ?? classification.classification,
            classificationConfidence: classification.confidence,
            updatedAt: new Date(),
          })
          .where(eq(personalCommConversations.id, existing.id));
      } else {
        await this.db.insert(personalCommConversations).values({
          companyId,
          accountId: businessAccount.id,
          customerId,
          threadKey,
          lastMessageAt: new Date(last.createdAt),
          messageCount: sorted.length,
          classification: classification.classification,
          classificationConfidence: classification.confidence,
          privacyMode: 'business',
        });
      }

      for (const message of sorted) {
        await this.indexMessageMedia(companyId, message.id, message.messageContent, threadKey);
      }
    }

    if (businessAccount.id) {
      await this.db
        .update(personalCommAccounts)
        .set({ lastSyncAt: new Date(), updatedAt: new Date() })
        .where(eq(personalCommAccounts.id, businessAccount.id));
    }

    return this.listBusinessConversations(companyId);
  }

  async listBusinessConversations(companyId: string): Promise<PersonalCommConversationSummary[]> {
    const privacy = await this.getPrivacySettings(companyId);
    const rows = await this.db.query.personalCommConversations.findMany({
      where: eq(personalCommConversations.companyId, companyId),
      with: { account: true, customer: true },
      orderBy: [desc(personalCommConversations.lastMessageAt)],
      limit: 500,
    });

    return rows
      .filter((row) => {
        if (privacy.businessOnlyMode && row.privacyMode === 'personal') return false;
        if (privacy.personalOnlyMode && row.privacyMode === 'business') return false;
        if (row.isHidden) return false;
        return true;
      })
      .map((row) => ({
        id: row.id,
        accountId: row.accountId,
        accountLabel: row.account?.label ?? null,
        customerId: row.customerId,
        customerName: row.customer?.name ?? null,
        contactPhone: row.contactPhone,
        contactName: row.contactName,
        threadKey: row.threadKey,
        lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
        messageCount: row.messageCount,
        classification: row.manualClassificationOverride ?? row.classification,
        classificationConfidence: row.classificationConfidence,
        manualClassificationOverride: row.manualClassificationOverride,
        privacyMode: row.privacyMode as 'business' | 'personal' | 'hidden',
        isHidden: row.isHidden,
        isLocked: row.isLocked,
        excludedFromReports: row.excludedFromReports,
      }));
  }

  async overrideClassification(
    scope: StaffScope,
    conversationId: string,
    input: OverridePersonalCommClassificationRequest,
  ): Promise<PersonalCommConversationSummary> {
    const existing = await this.db.query.personalCommConversations.findFirst({
      where: and(
        eq(personalCommConversations.id, conversationId),
        eq(personalCommConversations.companyId, scope.companyId),
      ),
    });

    if (!existing) {
      throw new PersonalCommunicationsIntelligenceError('NOT_FOUND', 'Conversation not found');
    }

    await this.db.insert(personalCommClassificationCorrections).values({
      companyId: scope.companyId,
      conversationId,
      previousClassification: existing.manualClassificationOverride ?? existing.classification,
      correctedClassification: input.classification,
      notes: input.notes?.trim() || null,
      correctedByUserId: scope.userId,
    });

    await this.db
      .update(personalCommConversations)
      .set({
        manualClassificationOverride: input.classification,
        classificationConfidence: 100,
        updatedAt: new Date(),
      })
      .where(eq(personalCommConversations.id, conversationId));

    const conversations = await this.listBusinessConversations(scope.companyId);
    return conversations.find((item) => item.id === conversationId)!;
  }

  async listMediaItems(companyId: string): Promise<PersonalCommMediaItemSummary[]> {
    const rows = await this.db.query.personalCommMediaItems.findMany({
      where: eq(personalCommMediaItems.companyId, companyId),
      orderBy: [desc(personalCommMediaItems.indexedAt)],
      limit: 500,
    });

    return rows.map((row) => ({
      id: row.id,
      conversationId: row.conversationId,
      whatsappMessageId: row.whatsappMessageId,
      mediaType: row.mediaType,
      mimeType: row.mimeType,
      fileName: row.fileName,
      excluded: row.excluded,
      indexedAt: row.indexedAt.toISOString(),
    }));
  }

  async analyzeVoiceNote(
    companyId: string,
    input: AnalyzePersonalCommVoiceRequest,
  ): Promise<PersonalCommVoiceAnalysisSummary> {
    const routing = await this.aiOrchestrationService.resolveRoutingForCategory(
      companyId,
      'speech',
    );
    const summarizationRouting = await this.aiOrchestrationService.resolveRoutingForCategory(
      companyId,
      'summarization',
    );

    let messageContent: string | null = null;
    let whatsappMessageId = input.whatsappMessageId ?? null;
    let mediaItemId = input.mediaItemId ?? null;

    if (input.whatsappMessageId) {
      const message = await this.db.query.whatsappMessages.findFirst({
        where: and(
          eq(whatsappMessages.id, input.whatsappMessageId),
          eq(whatsappMessages.companyId, companyId),
        ),
      });
      messageContent = message?.messageContent ?? null;
    } else if (input.mediaItemId) {
      const media = await this.db.query.personalCommMediaItems.findFirst({
        where: and(
          eq(personalCommMediaItems.id, input.mediaItemId),
          eq(personalCommMediaItems.companyId, companyId),
        ),
      });
      mediaItemId = media?.id ?? null;
      whatsappMessageId = media?.whatsappMessageId ?? null;
      if (media?.whatsappMessageId) {
        const message = await this.db.query.whatsappMessages.findFirst({
          where: eq(whatsappMessages.id, media.whatsappMessageId),
        });
        messageContent = message?.messageContent ?? null;
      }
    }

    const isPlaceholder = !messageContent || isMediaPlaceholder(messageContent);
    const languageDetected = messageContent ? detectLanguage(messageContent) : null;

    const [created] = await this.db
      .insert(personalCommVoiceAnalyses)
      .values({
        companyId,
        mediaItemId,
        whatsappMessageId,
        transcription: isPlaceholder ? null : messageContent,
        summary: isPlaceholder ? null : summarizeText(messageContent!),
        keyPoints: isPlaceholder ? [] : extractKeyPoints(messageContent!),
        actionItems: isPlaceholder ? [] : extractActionItems(messageContent!),
        customerIntent: isPlaceholder ? null : detectIntent(messageContent!),
        urgencyScore: isPlaceholder ? null : detectUrgency(messageContent!),
        sentiment: isPlaceholder ? null : detectSentiment(messageContent!),
        languageDetected,
        routingProviderKey: routing.providerKey ?? summarizationRouting.providerKey,
        routingModelKey: routing.modelKey ?? summarizationRouting.modelKey,
        status: isPlaceholder ? 'unavailable' : 'completed',
        metadata: {
          routingRuleId: routing.routingRuleId,
          summarizationRoutingRuleId: summarizationRouting.routingRuleId,
          note: isPlaceholder ? 'Transcription unavailable until provider media is synced.' : null,
        },
      })
      .returning();

    return toVoiceAnalysisSummary(created!);
  }

  async analyzeMedia(
    companyId: string,
    input: AnalyzePersonalCommMediaRequest,
  ): Promise<PersonalCommMediaAnalysisSummary> {
    const media = await this.db.query.personalCommMediaItems.findFirst({
      where: and(
        eq(personalCommMediaItems.id, input.mediaItemId),
        eq(personalCommMediaItems.companyId, companyId),
      ),
    });

    if (!media) {
      throw new PersonalCommunicationsIntelligenceError('NOT_FOUND', 'Media item not found');
    }

    const routing = await this.aiOrchestrationService.resolveRoutingForCategory(
      companyId,
      'image_understanding',
    );
    let messageContent: string | null = null;

    if (media.whatsappMessageId) {
      const message = await this.db.query.whatsappMessages.findFirst({
        where: eq(whatsappMessages.id, media.whatsappMessageId),
      });
      messageContent = message?.messageContent ?? null;
    }

    const isPlaceholder = !messageContent || isMediaPlaceholder(messageContent);
    const detectedIssues = isPlaceholder ? [] : detectPlumbingIssues(messageContent!);

    const [created] = await this.db
      .insert(personalCommMediaAnalyses)
      .values({
        companyId,
        mediaItemId: media.id,
        issueSummary: detectedIssues.length > 0 ? detectedIssues.join('; ') : null,
        confidenceScore: detectedIssues.length > 0 ? 70 : null,
        recommendedServiceCategory: detectedIssues[0] ?? null,
        detectedIssues,
        routingProviderKey: routing.providerKey,
        routingModelKey: routing.modelKey,
        status: isPlaceholder ? 'unavailable' : detectedIssues.length > 0 ? 'completed' : 'pending',
        metadata: { routingRuleId: routing.routingRuleId },
      })
      .returning();

    return toMediaAnalysisSummary(created!);
  }

  async analyzeDocument(
    companyId: string,
    input: AnalyzePersonalCommMediaRequest,
  ): Promise<PersonalCommDocumentAnalysisSummary> {
    const media = await this.db.query.personalCommMediaItems.findFirst({
      where: and(
        eq(personalCommMediaItems.id, input.mediaItemId),
        eq(personalCommMediaItems.companyId, companyId),
        eq(personalCommMediaItems.mediaType, 'document'),
      ),
    });

    if (!media) {
      throw new PersonalCommunicationsIntelligenceError(
        'NOT_FOUND',
        'Document media item not found',
      );
    }

    const routing = await this.aiOrchestrationService.resolveRoutingForCategory(
      companyId,
      'document_analysis',
    );
    let messageContent: string | null = null;

    if (media.whatsappMessageId) {
      const message = await this.db.query.whatsappMessages.findFirst({
        where: eq(whatsappMessages.id, media.whatsappMessageId),
      });
      messageContent = message?.messageContent ?? null;
    }

    const isPlaceholder = !messageContent || isMediaPlaceholder(messageContent);
    const extractedData = isPlaceholder ? {} : extractDocumentFields(messageContent!);

    const [created] = await this.db
      .insert(personalCommDocumentAnalyses)
      .values({
        companyId,
        mediaItemId: media.id,
        documentType: inferDocumentType(messageContent),
        extractedData,
        routingProviderKey: routing.providerKey,
        routingModelKey: routing.modelKey,
        status: isPlaceholder
          ? 'unavailable'
          : Object.keys(extractedData).length > 0
            ? 'completed'
            : 'pending',
        metadata: { routingRuleId: routing.routingRuleId },
      })
      .returning();

    return toDocumentAnalysisSummary(created!);
  }

  async detectLeadSignals(companyId: string): Promise<PersonalCommLeadSignalSummary[]> {
    const conversations = await this.listBusinessConversations(companyId);
    const messages = await this.whatsappService.listMessages(companyId);
    const generated: PersonalCommLeadSignalSummary[] = [];

    for (const conversation of conversations.slice(0, 50)) {
      if (conversation.privacyMode === 'personal' || conversation.excludedFromReports) continue;

      const threadMessages = messages.filter(
        (message) => (message.customerId ?? `unknown:${message.id}`) === conversation.threadKey,
      );
      const text = threadMessages.map((item) => item.messageContent).join('\n');
      const signal = detectLeadSignal(text, conversation.classification, conversation.customerId);

      if (!signal) continue;

      const [created] = await this.db
        .insert(personalCommLeadSignals)
        .values({
          companyId,
          conversationId: conversation.id,
          signalType: signal.signalType,
          subject: signal.subject,
          recommendation: signal.recommendation,
          customerId: conversation.customerId,
          draftType: signal.draftType,
          confidence: signal.confidence,
        })
        .returning();

      generated.push({
        id: created!.id,
        conversationId: created!.conversationId,
        signalType: created!.signalType,
        subject: created!.subject,
        recommendation: created!.recommendation,
        customerId: created!.customerId,
        draftType: created!.draftType,
        confidence: created!.confidence,
        createdAt: created!.createdAt.toISOString(),
      });
    }

    return generated;
  }

  async generateFollowUpQueue(companyId: string): Promise<PersonalCommFollowUpSummary[]> {
    const [conversations, whatsappContext, callHistory] = await Promise.all([
      this.listBusinessConversations(companyId),
      this.whatsappService.buildAuraContext(companyId),
      this.communicationsIntelligenceService.getCallHistory(companyId),
    ]);

    const generated: PersonalCommFollowUpSummary[] = [];

    for (const pending of whatsappContext.pendingReplies.slice(0, 20)) {
      const conversation = conversations.find((row) => row.customerId === pending.customerId);
      const [created] = await this.db
        .insert(personalCommFollowUps)
        .values({
          companyId,
          conversationId: conversation?.id ?? null,
          followUpType: 'awaiting_reply',
          status: 'pending',
          subject: `Awaiting reply: ${pending.customerName ?? 'Customer'}`,
          recommendation: `Review incoming WhatsApp message and draft a reply for approval. Never send automatically.`,
          waitingSince: new Date(pending.receivedAt),
          priority: 80,
        })
        .returning();

      generated.push(toFollowUpSummary(created!));
    }

    const missedCalls = callHistory.filter(
      (call) => call.outcome === 'missed' || call.callType === 'missed',
    );
    for (const call of missedCalls.slice(0, 10)) {
      const [created] = await this.db
        .insert(personalCommFollowUps)
        .values({
          companyId,
          followUpType: 'missed_voice_call',
          status: 'pending',
          subject: `Missed call follow-up`,
          recommendation: `Missed call recorded — draft follow-up for approval. Do not contact customer automatically.`,
          waitingSince: call.startedAt ? new Date(call.startedAt) : new Date(call.createdAt),
          priority: 90,
        })
        .returning();

      generated.push(toFollowUpSummary(created!));
    }

    if (generated.length === 0) {
      const [created] = await this.db
        .insert(personalCommFollowUps)
        .values({
          companyId,
          followUpType: 'unread_business',
          status: 'pending',
          subject: 'No urgent follow-ups detected',
          recommendation: 'Re-run after more WhatsApp or call activity is recorded.',
          priority: 10,
        })
        .returning();
      generated.push(toFollowUpSummary(created!));
    }

    return generated;
  }

  async listFollowUpQueue(companyId: string): Promise<PersonalCommFollowUpSummary[]> {
    const rows = await this.db.query.personalCommFollowUps.findMany({
      where: eq(personalCommFollowUps.companyId, companyId),
      orderBy: [desc(personalCommFollowUps.priority), desc(personalCommFollowUps.createdAt)],
      limit: 200,
    });

    return rows.map(toFollowUpSummary);
  }

  async listVoiceAnalyses(companyId: string): Promise<PersonalCommVoiceAnalysisSummary[]> {
    const rows = await this.db.query.personalCommVoiceAnalyses.findMany({
      where: eq(personalCommVoiceAnalyses.companyId, companyId),
      orderBy: [desc(personalCommVoiceAnalyses.createdAt)],
      limit: 200,
    });
    return rows.map(toVoiceAnalysisSummary);
  }

  async listMediaAnalyses(companyId: string): Promise<PersonalCommMediaAnalysisSummary[]> {
    const rows = await this.db.query.personalCommMediaAnalyses.findMany({
      where: eq(personalCommMediaAnalyses.companyId, companyId),
      orderBy: [desc(personalCommMediaAnalyses.createdAt)],
      limit: 200,
    });
    return rows.map(toMediaAnalysisSummary);
  }

  async listDocumentAnalyses(companyId: string): Promise<PersonalCommDocumentAnalysisSummary[]> {
    const rows = await this.db.query.personalCommDocumentAnalyses.findMany({
      where: eq(personalCommDocumentAnalyses.companyId, companyId),
      orderBy: [desc(personalCommDocumentAnalyses.createdAt)],
      limit: 200,
    });
    return rows.map(toDocumentAnalysisSummary);
  }

  async getPrivacySettings(companyId: string): Promise<PersonalCommPrivacySettings> {
    const row = await this.db.query.personalCommPrivacySettings.findFirst({
      where: eq(personalCommPrivacySettings.companyId, companyId),
    });

    if (!row) {
      return {
        businessOnlyMode: false,
        personalOnlyMode: false,
        excludedContacts: [],
        excludedGroups: [],
        excludedMediaTypes: [],
      };
    }

    return {
      businessOnlyMode: row.businessOnlyMode,
      personalOnlyMode: row.personalOnlyMode,
      excludedContacts: row.excludedContacts,
      excludedGroups: row.excludedGroups,
      excludedMediaTypes: row.excludedMediaTypes,
    };
  }

  async updatePrivacySettings(
    scope: StaffScope,
    input: UpdatePersonalCommPrivacyRequest,
  ): Promise<PersonalCommPrivacySettings> {
    const existing = await this.db.query.personalCommPrivacySettings.findFirst({
      where: eq(personalCommPrivacySettings.companyId, scope.companyId),
    });

    if (existing) {
      await this.db
        .update(personalCommPrivacySettings)
        .set({
          businessOnlyMode: input.businessOnlyMode ?? existing.businessOnlyMode,
          personalOnlyMode: input.personalOnlyMode ?? existing.personalOnlyMode,
          excludedContacts: input.excludedContacts ?? existing.excludedContacts,
          excludedGroups: input.excludedGroups ?? existing.excludedGroups,
          excludedMediaTypes: input.excludedMediaTypes ?? existing.excludedMediaTypes,
          updatedByUserId: scope.userId,
          updatedAt: new Date(),
        })
        .where(eq(personalCommPrivacySettings.id, existing.id));
    } else {
      await this.db.insert(personalCommPrivacySettings).values({
        companyId: scope.companyId,
        businessOnlyMode: input.businessOnlyMode ?? false,
        personalOnlyMode: input.personalOnlyMode ?? false,
        excludedContacts: input.excludedContacts ?? [],
        excludedGroups: input.excludedGroups ?? [],
        excludedMediaTypes: input.excludedMediaTypes ?? [],
        updatedByUserId: scope.userId,
      });
    }

    return this.getPrivacySettings(scope.companyId);
  }

  async listActions(companyId: string, status?: string): Promise<PersonalCommActionSummary[]> {
    const rows = await this.db.query.personalCommActions.findMany({
      where: status
        ? and(
            eq(personalCommActions.companyId, companyId),
            eq(personalCommActions.status, status as never),
          )
        : eq(personalCommActions.companyId, companyId),
      orderBy: [desc(personalCommActions.createdAt)],
      limit: 200,
    });

    return rows.map((row) => ({
      id: row.id,
      actionType: row.actionType,
      status: row.status,
      subject: row.subject,
      recommendation: row.recommendation,
      conversationId: row.conversationId,
      payload: row.payload,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createAction(
    scope: StaffScope,
    input: CreatePersonalCommActionRequest,
  ): Promise<PersonalCommActionSummary> {
    const subject = input.subject.trim();
    const recommendation = input.recommendation.trim();
    if (!subject || !recommendation) {
      throw new PersonalCommunicationsIntelligenceError(
        'VALIDATION_ERROR',
        'Subject and recommendation are required',
      );
    }

    const [created] = await this.db
      .insert(personalCommActions)
      .values({
        companyId: scope.companyId,
        actionType: input.actionType,
        status: 'pending_approval',
        subject,
        recommendation,
        conversationId: input.conversationId ?? null,
        payload: input.payload ?? {},
        createdByUserId: scope.userId,
      })
      .returning();

    await this.notificationService.createNotification({
      companyId: scope.companyId,
      recipientType: 'staff',
      recipientUserId: scope.userId,
      notificationType: 'personal_comm_alert',
      title: 'Communication action pending approval',
      body: subject,
      entityType: 'personal_comm_action',
      entityId: created!.id,
    });

    const actions = await this.listActions(scope.companyId);
    return actions.find((item) => item.id === created!.id)!;
  }

  async buildPersonalCommunicationsAuraContext(
    companyId: string,
  ): Promise<PersonalCommAuraContext> {
    const dashboard = await this.getExecutiveDashboard(companyId);
    return {
      summary: dashboard.summary,
      totalBusinessConversations: dashboard.totalBusinessConversations,
      pendingFollowUpCount: dashboard.pendingFollowUpCount,
      pendingActionCount: dashboard.pendingActionCount,
      newLeadsDetected: dashboard.newLeadsDetected,
      whatsappConnected: dashboard.whatsappConnected,
    };
  }

  private async ensureDefaultBusinessAccount(
    companyId: string,
  ): Promise<PersonalCommAccountSummary> {
    const connection = await this.db.query.whatsappConnections.findFirst({
      where: eq(whatsappConnections.companyId, companyId),
    });

    const [created] = await this.db
      .insert(personalCommAccounts)
      .values({
        companyId,
        accountType: 'business',
        label: 'Business WhatsApp',
        phoneNumber: connection?.displayPhoneNumber ?? null,
        whatsappConnectionId: connection?.id ?? null,
        syncEnabled: true,
      })
      .returning();

    return {
      id: created!.id,
      accountType: created!.accountType,
      label: created!.label,
      phoneNumber: created!.phoneNumber,
      whatsappConnectionId: created!.whatsappConnectionId,
      isActive: created!.isActive,
      syncEnabled: created!.syncEnabled,
      lastSyncAt: created!.lastSyncAt?.toISOString() ?? null,
    };
  }

  private async indexMessageMedia(
    companyId: string,
    whatsappMessageId: string,
    messageContent: string,
    threadKey: string,
  ) {
    const mediaType = detectMediaType(messageContent);
    if (!mediaType) return;

    const conversation = await this.db.query.personalCommConversations.findFirst({
      where: and(
        eq(personalCommConversations.companyId, companyId),
        eq(personalCommConversations.threadKey, threadKey),
      ),
    });

    const existing = await this.db.query.personalCommMediaItems.findFirst({
      where: and(
        eq(personalCommMediaItems.companyId, companyId),
        eq(personalCommMediaItems.whatsappMessageId, whatsappMessageId),
      ),
    });

    if (existing) return;

    await this.db.insert(personalCommMediaItems).values({
      companyId,
      conversationId: conversation?.id ?? null,
      whatsappMessageId,
      mediaType,
      fileName: null,
      metadata: { source: 'whatsapp_message_content' },
    });
  }
}

function classifyMessageText(
  text: string,
  hasCustomer: boolean,
): { classification: PersonalCommClassification; confidence: number } {
  const lower = text.toLowerCase();

  if (/spam|winner|click here|lottery/.test(lower)) {
    return { classification: 'spam', confidence: 85 };
  }
  if (/supplier|invoice from|purchase order|delivery note/.test(lower)) {
    return { classification: 'supplier', confidence: 75 };
  }
  if (/marketing|promotion|special offer|newsletter/.test(lower)) {
    return { classification: 'marketing', confidence: 70 };
  }
  if (hasCustomer) {
    return { classification: 'existing_customer', confidence: 80 };
  }
  if (
    QUOTE_KEYWORDS.some((keyword) => lower.includes(keyword)) ||
    BOOKING_KEYWORDS.some((keyword) => lower.includes(keyword))
  ) {
    return { classification: 'new_lead', confidence: 75 };
  }
  if (/family|mom|dad|brother|sister/.test(lower)) {
    return { classification: 'family', confidence: 60 };
  }
  if (/friend|bra|mate/.test(lower)) {
    return { classification: 'friend', confidence: 55 };
  }

  return { classification: 'unknown', confidence: 40 };
}

function detectMediaType(content: string): 'voice' | 'image' | 'video' | 'document' | null {
  const lower = content.toLowerCase();
  if (lower.includes('[audio message]') || lower.includes('[voice message]')) return 'voice';
  if (lower.includes('[image message]')) return 'image';
  if (lower.includes('[video message]')) return 'video';
  if (lower.includes('[document message]')) return 'document';
  return null;
}

function isMediaPlaceholder(content: string): boolean {
  return MEDIA_PLACEHOLDERS.some((placeholder) => content.toLowerCase().includes(placeholder));
}

function detectLanguage(text: string): string {
  if (/\b(hallo|dankie|asseblief|probleem|lekkage|afrikaans)\b/i.test(text)) return 'af';
  return 'en';
}

function summarizeText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 160) return trimmed;
  return `${trimmed.slice(0, 157)}...`;
}

function extractKeyPoints(text: string): string[] {
  return text
    .split(/[.!?\n]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 12)
    .slice(0, 5);
}

function extractActionItems(text: string): string[] {
  const lower = text.toLowerCase();
  const items: string[] = [];
  if (QUOTE_KEYWORDS.some((keyword) => lower.includes(keyword)))
    items.push('Prepare quote recommendation for approval');
  if (BOOKING_KEYWORDS.some((keyword) => lower.includes(keyword)))
    items.push('Draft booking follow-up for approval');
  if (EMERGENCY_KEYWORDS.some((keyword) => lower.includes(keyword)))
    items.push('Review emergency priority and draft dispatch recommendation');
  return items;
}

function detectIntent(text: string): string | null {
  const lower = text.toLowerCase();
  if (EMERGENCY_KEYWORDS.some((keyword) => lower.includes(keyword))) return 'emergency_service';
  if (QUOTE_KEYWORDS.some((keyword) => lower.includes(keyword))) return 'quote_request';
  if (BOOKING_KEYWORDS.some((keyword) => lower.includes(keyword))) return 'booking_request';
  if (INVOICE_KEYWORDS.some((keyword) => lower.includes(keyword))) return 'invoice_request';
  if (PAYMENT_KEYWORDS.some((keyword) => lower.includes(keyword))) return 'payment_confirmation';
  return null;
}

function detectUrgency(text: string): number {
  const lower = text.toLowerCase();
  if (EMERGENCY_KEYWORDS.some((keyword) => lower.includes(keyword))) return 95;
  if (COMPLAINT_KEYWORDS.some((keyword) => lower.includes(keyword))) return 75;
  if (QUOTE_KEYWORDS.some((keyword) => lower.includes(keyword))) return 55;
  return 30;
}

function detectSentiment(text: string): string {
  const lower = text.toLowerCase();
  if (COMPLAINT_KEYWORDS.some((keyword) => lower.includes(keyword))) return 'negative';
  if (COMPLIMENT_KEYWORDS.some((keyword) => lower.includes(keyword))) return 'positive';
  return 'neutral';
}

function detectPlumbingIssues(text: string): string[] {
  const lower = text.toLowerCase();
  const issues: string[] = [];
  const map: Record<string, string> = {
    leak: 'plumbing_leak',
    burst: 'burst_pipe',
    geyser: 'geyser',
    toilet: 'toilet',
    drain: 'blocked_drain',
    sewer: 'sewer_issue',
    flooding: 'water_damage',
    valve: 'valve',
    pump: 'pump',
    meter: 'meter',
    roof: 'roof',
    ceiling: 'ceiling',
    wall: 'wall_damage',
    insurance: 'insurance_evidence',
  };

  for (const [keyword, category] of Object.entries(map)) {
    if (lower.includes(keyword)) issues.push(category);
  }

  return [...new Set(issues)];
}

function extractDocumentFields(text: string): Record<string, unknown> {
  const extracted: Record<string, unknown> = {};
  const phoneMatch = text.match(/(?:\+27|0)\d{9,10}/);
  const emailMatch = text.match(/[\w.-]+@[\w.-]+\.[A-Za-z]{2,}/);
  const invoiceMatch = text.match(/invoice\s*#?\s*([A-Z0-9-]+)/i);
  const referenceMatch = text.match(/ref(?:erence)?\s*#?\s*([A-Z0-9-]+)/i);

  if (phoneMatch) extracted.phoneNumber = phoneMatch[0];
  if (emailMatch) extracted.email = emailMatch[0];
  if (invoiceMatch) extracted.invoiceNumber = invoiceMatch[1];
  if (referenceMatch) extracted.referenceNumber = referenceMatch[1];

  return extracted;
}

function inferDocumentType(text: string | null): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  if (lower.includes('invoice')) return 'invoice';
  if (lower.includes('quote') || lower.includes('quotation')) return 'quotation';
  if (lower.includes('purchase order')) return 'purchase_order';
  if (lower.includes('warranty')) return 'warranty';
  if (lower.includes('municipal')) return 'municipal_document';
  if (lower.includes('insurance')) return 'insurance_document';
  return 'document';
}

function detectLeadSignal(
  text: string,
  classification: PersonalCommClassification,
  customerId: string | null,
): {
  signalType: PersonalCommSignalType;
  subject: string;
  recommendation: string;
  draftType: string;
  confidence: number;
} | null {
  const lower = text.toLowerCase();

  if (EMERGENCY_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return {
      signalType: 'emergency_request',
      subject: 'Emergency service request detected',
      recommendation:
        'Draft emergency dispatch recommendation for approval — never dispatch automatically.',
      draftType: 'draft_job',
      confidence: 90,
    };
  }
  if (QUOTE_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return {
      signalType: 'quote_request',
      subject: 'Quote request detected',
      recommendation: 'Draft quote follow-up for approval — do not contact customer automatically.',
      draftType: 'draft_follow_up',
      confidence: 80,
    };
  }
  if (BOOKING_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return {
      signalType: 'booking_request',
      subject: 'Booking request detected',
      recommendation: 'Draft booking response for approval.',
      draftType: 'draft_follow_up',
      confidence: 75,
    };
  }
  if (PAYMENT_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return {
      signalType: 'payment_confirmation',
      subject: 'Payment confirmation detected',
      recommendation: 'Review payment confirmation and draft finance follow-up for approval.',
      draftType: 'draft_follow_up',
      confidence: 70,
    };
  }
  if (COMPLAINT_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return {
      signalType: 'complaint',
      subject: 'Customer complaint detected',
      recommendation: 'Draft support response for approval.',
      draftType: 'draft_customer_reply',
      confidence: 80,
    };
  }
  if (COMPLIMENT_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return {
      signalType: 'compliment',
      subject: 'Customer compliment detected',
      recommendation: 'Draft thank-you follow-up for approval.',
      draftType: 'draft_follow_up',
      confidence: 65,
    };
  }
  if (!customerId && classification === 'new_lead') {
    return {
      signalType: 'new_lead',
      subject: 'Potential new lead detected',
      recommendation: 'Draft lead record for approval — never create CRM records automatically.',
      draftType: 'draft_lead',
      confidence: 70,
    };
  }

  return null;
}

function toVoiceAnalysisSummary(
  row: typeof personalCommVoiceAnalyses.$inferSelect,
): PersonalCommVoiceAnalysisSummary {
  return {
    id: row.id,
    mediaItemId: row.mediaItemId,
    whatsappMessageId: row.whatsappMessageId,
    transcription: row.transcription,
    summary: row.summary,
    keyPoints: row.keyPoints,
    actionItems: row.actionItems,
    customerIntent: row.customerIntent,
    urgencyScore: row.urgencyScore,
    sentiment: row.sentiment,
    languageDetected: row.languageDetected,
    routingProviderKey: row.routingProviderKey,
    routingModelKey: row.routingModelKey,
    status: row.status,
  };
}

function toMediaAnalysisSummary(
  row: typeof personalCommMediaAnalyses.$inferSelect,
): PersonalCommMediaAnalysisSummary {
  return {
    id: row.id,
    mediaItemId: row.mediaItemId,
    issueSummary: row.issueSummary,
    confidenceScore: row.confidenceScore,
    recommendedServiceCategory: row.recommendedServiceCategory,
    detectedIssues: row.detectedIssues,
    routingProviderKey: row.routingProviderKey,
    routingModelKey: row.routingModelKey,
    status: row.status,
  };
}

function toDocumentAnalysisSummary(
  row: typeof personalCommDocumentAnalyses.$inferSelect,
): PersonalCommDocumentAnalysisSummary {
  return {
    id: row.id,
    mediaItemId: row.mediaItemId,
    documentType: row.documentType,
    extractedData: row.extractedData,
    routingProviderKey: row.routingProviderKey,
    routingModelKey: row.routingModelKey,
    status: row.status,
  };
}

function toFollowUpSummary(
  row: typeof personalCommFollowUps.$inferSelect,
): PersonalCommFollowUpSummary {
  return {
    id: row.id,
    conversationId: row.conversationId,
    followUpType: row.followUpType,
    status: row.status,
    subject: row.subject,
    recommendation: row.recommendation,
    waitingSince: row.waitingSince?.toISOString() ?? null,
    priority: row.priority,
  };
}
