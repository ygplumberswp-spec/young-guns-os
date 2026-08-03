import { and, desc, eq } from 'drizzle-orm';
import type {
  CreateUcDispatchNotificationRequest,
  CreateUcOutboundCampaignRequest,
  CreateUcProviderAdapterRequest,
  EnterpriseUnifiedCommunicationsAuraContext,
  EnterpriseUnifiedCommunicationsDashboard,
  UcAnalyticsSummary,
  UcCustomerCommunicationCenter,
  UcDispatchNotificationSummary,
  UcOutboundCampaignSummary,
  UcPlatformConfigSummary,
  UcProviderAdapterSummary,
  UcTimelineEntrySummary,
  UcVoiceReceptionistSummary,
  UpdateUcPlatformConfigRequest,
} from '@titan/shared';
import { UC_PROVIDER_CHANNELS } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  commPlatformAccounts,
  customers,
  ucAnalyticsSnapshots,
  ucAuditLogs,
  ucDispatchNotifications,
  ucOutboundCallCampaigns,
  ucPlatformConfig,
  ucProviderAdapters,
  ucTimelineIndex,
} from '@titan/db';
import type { CommunicationsIntelligenceService } from './communications-intelligence.service.js';
import type { EnterpriseSaasPlatformService } from './enterprise-saas-platform.service.js';
import type { GmailOAuthService } from './gmail-oauth.service.js';
import type { IntegrationHubService } from './integration-hub.service.js';
import type { IntegrationsService } from './integrations.service.js';
import type { VoiceService } from './voice.service.js';
import type { WhatsappService } from './whatsapp.service.js';

export class EnterpriseUnifiedCommunicationsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseUnifiedCommunicationsError';
  }
}

type StaffScope = { companyId: string; userId: string };

type UnifiedCommsDeps = {
  db: DatabaseClient;
  enterpriseSaasPlatformService: EnterpriseSaasPlatformService;
  communicationsIntelligenceService: CommunicationsIntelligenceService;
  voiceService: VoiceService;
  whatsappService: WhatsappService;
  integrationsService: IntegrationsService;
  integrationHubService: IntegrationHubService;
  /** Optional — when present, Business Gmail is registered as a real UC adapter. */
  gmailOAuthService?: GmailOAuthService;
};

const GMAIL_UC_PROVIDER_KEY = 'gmail';
const GMAIL_UC_ADAPTER_NAME = 'Business Gmail';

export class EnterpriseUnifiedCommunicationsService {
  constructor(private readonly deps: UnifiedCommsDeps) {}

  async getDashboard(companyId: string): Promise<EnterpriseUnifiedCommunicationsDashboard> {
    const isPlatformOwner =
      await this.deps.enterpriseSaasPlatformService.isPlatformOwnerTenant(companyId);
    await this.ensureRegisteredChannelAdapters(companyId);
    const [
      platformConfig,
      providerAdapters,
      intelligence,
      analytics,
      recentTimeline,
      outboundCampaigns,
      dispatchNotifications,
      voiceReceptionist,
      whatsappStatus,
      fleetContext,
    ] = await Promise.all([
      this.getPlatformConfig(companyId),
      this.listProviderAdapters(companyId),
      this.deps.communicationsIntelligenceService.getUnifiedDashboard(companyId),
      this.getLatestAnalytics(companyId),
      this.listTimeline(companyId, { limit: 30 }),
      this.listOutboundCampaigns(companyId),
      this.listDispatchNotifications(companyId),
      this.getVoiceReceptionistSummary(companyId),
      this.isWhatsappConnected(companyId),
      this.deps.integrationsService.buildFleetTrackingContext(companyId),
    ]);

    const activeProviderCount = providerAdapters.filter((p) => p.status === 'active').length;

    return {
      summary: `${providerAdapters.length} provider adapter(s), ${activeProviderCount} active, ${intelligence.analytics.totalCommunications} communication(s), ${intelligence.analytics.missedCallCount} missed call(s).`,
      isPlatformOwner,
      platformConfig,
      providerAdapters,
      activeProviderCount,
      voiceReceptionist,
      intelligence,
      analytics,
      recentTimeline,
      outboundCampaigns,
      dispatchNotifications,
      supportedChannels: UC_PROVIDER_CHANNELS,
      whatsappConnected: whatsappStatus,
      cartrackConnected: fleetContext.cartrackConnected,
    };
  }

  async getCustomerCommunicationCenter(
    companyId: string,
    customerId: string,
  ): Promise<UcCustomerCommunicationCenter> {
    const customer = await this.deps.db.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.companyId, companyId)),
    });
    if (!customer) {
      throw new EnterpriseUnifiedCommunicationsError('NOT_FOUND', 'Customer not found');
    }

    const [timeline, intelligence] = await Promise.all([
      this.listTimeline(companyId, { customerId, limit: 50 }),
      this.deps.communicationsIntelligenceService.getUnifiedDashboard(companyId),
    ]);

    const customerTimeline = intelligence.recentTimeline.filter(
      (entry) => entry.customerId === customerId || entry.customerName === customer.name,
    );

    return {
      customerId,
      customerName: customer.name,
      timeline:
        timeline.length > 0 ? timeline : customerTimeline.map((e) => this.commIntelToTimeline(e)),
      recentCalls: timeline.filter((e) => e.entryType === 'call').length,
      recentWhatsapp: timeline.filter((e) => e.entryType === 'whatsapp').length,
      recentEmail: timeline.filter((e) => e.entryType === 'email').length,
      pendingDraftCount: intelligence.pendingDrafts.length,
    };
  }

  async syncTimelineFromModules(companyId: string): Promise<UcTimelineEntrySummary[]> {
    const commTimeline = await this.deps.communicationsIntelligenceService.buildTimeline(
      companyId,
      {
        limit: 100,
      },
    );

    const created: UcTimelineEntrySummary[] = [];
    for (const entry of commTimeline) {
      const sourceModule = entry.entityType ?? entry.channel;
      const sourceEntityId = entry.entityId ?? entry.id;
      const existing = await this.deps.db.query.ucTimelineIndex.findFirst({
        where: and(
          eq(ucTimelineIndex.companyId, companyId),
          eq(ucTimelineIndex.sourceModule, sourceModule),
          eq(ucTimelineIndex.sourceEntityId, sourceEntityId),
        ),
      });
      if (existing) {
        created.push(this.toTimelineSummary(existing));
        continue;
      }

      const entryType = mapChannelToEntryType(
        entry.channel,
      ) as typeof ucTimelineIndex.$inferInsert.entryType;
      const [row] = await this.deps.db
        .insert(ucTimelineIndex)
        .values({
          companyId,
          customerId: entry.customerId,
          jobId: (entry.metadata?.jobId as string | undefined) ?? null,
          entryType,
          channel: mapCommIntelChannel(entry.channel),
          title: entry.title,
          summary: entry.preview,
          sourceModule,
          sourceEntityId,
          occurredAt: new Date(entry.occurredAt),
          metadata: entry.metadata ?? {},
        })
        .returning();
      created.push(this.toTimelineSummary(row!));
    }

    return created;
  }

  async createProviderAdapter(
    scope: StaffScope,
    input: CreateUcProviderAdapterRequest,
  ): Promise<UcProviderAdapterSummary> {
    const [created] = await this.deps.db
      .insert(ucProviderAdapters)
      .values({
        companyId: scope.companyId,
        channel: input.channel,
        providerKey: input.providerKey,
        name: input.name,
        endpointUrl: input.endpointUrl ?? null,
        credentialsVaultKey: input.credentialsVaultKey ?? null,
        isPrimary: input.isPrimary ?? false,
        config: input.config ?? {},
        status: 'inactive',
      })
      .returning();

    await this.logAudit(
      scope,
      'provider_adapter_created',
      'uc_provider_adapter',
      created!.id,
      input.channel,
    );
    return this.toAdapterSummary(created!);
  }

  async testProviderAdapter(
    scope: StaffScope,
    adapterId: string,
  ): Promise<UcProviderAdapterSummary> {
    const adapter = await this.ensureAdapter(scope.companyId, adapterId);

    let status = 'failed';
    let message = 'Provider connectivity test failed — configure credentials and endpoint.';

    if (adapter.channel === 'whatsapp') {
      const connected = await this.isWhatsappConnected(scope.companyId);
      if (connected) {
        status = 'passed';
        message = 'WhatsApp connection verified via existing integration.';
      }
    } else if (adapter.channel === 'email') {
      if (adapter.providerKey === GMAIL_UC_PROVIDER_KEY) {
        const gmail = await this.getBusinessGmailAdapterState(scope.companyId);
        if (gmail.connected) {
          status = 'passed';
          message = `Business Gmail OAuth verified${gmail.emailAddress ? ` (${gmail.emailAddress})` : ''}.`;
        } else if (!gmail.oauthConfigured) {
          status = 'failed';
          message =
            'Business Gmail is not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the API.';
        } else {
          status = 'failed';
          message = 'Business Gmail OAuth is available but not connected. Use Connect Gmail in Channel Settings.';
        }
      } else {
        const connected = await this.isEmailConnected(scope.companyId);
        if (connected) {
          status = 'passed';
          message = 'Email integration verified via existing SMTP configuration.';
        }
      }
    } else if (adapter.endpointUrl) {
      status = 'pending';
      message = 'Endpoint configured — live connectivity test requires provider credentials.';
    }

    const [updated] = await this.deps.db
      .update(ucProviderAdapters)
      .set({
        lastTestAt: new Date(),
        lastTestStatus: status,
        lastTestMessage: message,
        updatedAt: new Date(),
      })
      .where(eq(ucProviderAdapters.id, adapterId))
      .returning();

    return this.toAdapterSummary(updated!);
  }

  async disableProviderAdapter(
    scope: StaffScope,
    adapterId: string,
  ): Promise<UcProviderAdapterSummary> {
    const adapter = await this.ensureAdapter(scope.companyId, adapterId);
    const [updated] = await this.deps.db
      .update(ucProviderAdapters)
      .set({ status: 'inactive', isPrimary: false, updatedAt: new Date() })
      .where(eq(ucProviderAdapters.id, adapter.id))
      .returning();

    await this.logAudit(
      scope,
      'provider_adapter_disabled',
      'uc_provider_adapter',
      adapter.id,
      adapter.channel,
    );
    return this.toAdapterSummary(updated!);
  }

  async createOutboundCampaign(
    scope: StaffScope,
    input: CreateUcOutboundCampaignRequest,
  ): Promise<UcOutboundCampaignSummary> {
    const [created] = await this.deps.db
      .insert(ucOutboundCallCampaigns)
      .values({
        companyId: scope.companyId,
        createdByUserId: scope.userId,
        campaignType: input.campaignType,
        status: 'pending_approval',
        subject: input.subject,
        scriptTemplate: input.scriptTemplate ?? null,
        targetFilter: input.targetFilter ?? {},
        consentRequired: input.consentRequired ?? true,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      })
      .returning();

    await this.logAudit(
      scope,
      'outbound_campaign_created',
      'uc_outbound_call_campaign',
      created!.id,
    );
    return this.toCampaignSummary(created!);
  }

  async queueDispatchNotification(
    scope: StaffScope,
    input: CreateUcDispatchNotificationRequest,
  ): Promise<UcDispatchNotificationSummary> {
    const activeAdapter = input.channel
      ? await this.deps.db.query.ucProviderAdapters.findFirst({
          where: and(
            eq(ucProviderAdapters.companyId, scope.companyId),
            eq(ucProviderAdapters.status, 'active'),
            eq(ucProviderAdapters.channel, input.channel),
          ),
        })
      : await this.deps.db.query.ucProviderAdapters.findFirst({
          where: and(
            eq(ucProviderAdapters.companyId, scope.companyId),
            eq(ucProviderAdapters.status, 'active'),
          ),
        });

    const [created] = await this.deps.db
      .insert(ucDispatchNotifications)
      .values({
        companyId: scope.companyId,
        jobId: input.jobId,
        customerId: input.customerId,
        notificationType: input.notificationType,
        channel: input.channel ?? activeAdapter?.channel ?? null,
        providerAdapterId: activeAdapter?.id ?? null,
        status: activeAdapter ? 'pending' : 'skipped',
        recipientAddress: input.recipientAddress ?? null,
        messageBody: input.messageBody ?? null,
        etaMinutes: input.etaMinutes ?? null,
        errorMessage: activeAdapter ? null : 'No active provider configured for this channel',
      })
      .returning();

    await this.logAudit(
      scope,
      'dispatch_notification_queued',
      'uc_dispatch_notification',
      created!.id,
    );
    return this.toDispatchSummary(created!);
  }

  async captureAnalytics(companyId: string): Promise<UcAnalyticsSummary> {
    const intelligence =
      await this.deps.communicationsIntelligenceService.getAnalyticsDashboard(companyId);
    const voiceSessions = await this.deps.voiceService.getCallHistory(companyId);

    const answered = voiceSessions.filter((s) => s.status === 'completed').length;
    const missed = intelligence.missedCallCount;
    const total = intelligence.totalCommunications;

    const channelUsage: Record<string, number> = {};
    for (const row of intelligence.channelUsage) {
      channelUsage[row.channel] = row.count;
    }

    const [snapshot] = await this.deps.db
      .insert(ucAnalyticsSnapshots)
      .values({
        companyId,
        callsAnswered: answered,
        callsMissed: missed,
        aiResolutionRate:
          total > 0
            ? String(Math.round((answered / Math.max(voiceSessions.length, 1)) * 100))
            : null,
        humanTransferRate: null,
        channelUsage,
        providerPerformance: {},
      })
      .returning();

    return this.toAnalyticsSummary(snapshot!);
  }

  async updatePlatformConfig(
    scope: StaffScope,
    input: UpdateUcPlatformConfigRequest,
  ): Promise<UcPlatformConfigSummary> {
    const existing = await this.ensurePlatformConfig(scope.companyId);
    const [updated] = await this.deps.db
      .update(ucPlatformConfig)
      .set({
        globalPolicies: input.globalPolicies ?? existing.globalPolicies,
        aiVoiceSettings: input.aiVoiceSettings ?? existing.aiVoiceSettings,
        recordingPolicy: input.recordingPolicy ?? existing.recordingPolicy,
        retentionDays: input.retentionDays ?? existing.retentionDays,
        consentRequired: input.consentRequired ?? existing.consentRequired,
        routingRules: input.routingRules ?? existing.routingRules,
        notificationTemplates: input.notificationTemplates ?? existing.notificationTemplates,
        updatedAt: new Date(),
      })
      .where(eq(ucPlatformConfig.id, existing.id))
      .returning();

    await this.logAudit(scope, 'platform_config_updated', 'uc_platform_config', updated!.id);
    return this.toPlatformConfigSummary(updated!);
  }

  async buildAuraContext(companyId: string): Promise<EnterpriseUnifiedCommunicationsAuraContext> {
    const dashboard = await this.getDashboard(companyId);
    return {
      summary: dashboard.summary,
      activeProviderCount: dashboard.activeProviderCount,
      pendingDraftCount: dashboard.intelligence.pendingDrafts.length,
      missedCallCount: dashboard.intelligence.analytics.missedCallCount,
      totalCommunications: dashboard.intelligence.analytics.totalCommunications,
      whatsappConnected: dashboard.whatsappConnected,
    };
  }

  private async getVoiceReceptionistSummary(
    companyId: string,
  ): Promise<UcVoiceReceptionistSummary> {
    const [stats, sessions, followUps] = await Promise.all([
      this.deps.voiceService.getStats(companyId),
      this.deps.voiceService.getCallHistory(companyId),
      this.deps.voiceService.listFollowUps(companyId),
    ]);

    return {
      activeSessionCount: sessions.filter((s) => s.status === 'active').length,
      totalSessionCount: sessions.length,
      missedCallCount: sessions.filter((s) => s.status === 'missed').length,
      pendingFollowUpCount: followUps.filter((f) => f.status === 'pending').length,
      aiVoiceEnabled: Boolean(stats),
    };
  }

  private async listTimeline(
    companyId: string,
    options: { customerId?: string; limit?: number },
  ): Promise<UcTimelineEntrySummary[]> {
    const rows = await this.deps.db.query.ucTimelineIndex.findMany({
      where: options.customerId
        ? and(
            eq(ucTimelineIndex.companyId, companyId),
            eq(ucTimelineIndex.customerId, options.customerId),
          )
        : eq(ucTimelineIndex.companyId, companyId),
      orderBy: [desc(ucTimelineIndex.occurredAt)],
      limit: options.limit ?? 50,
    });
    return rows.map((row) => this.toTimelineSummary(row));
  }

  private async listProviderAdapters(companyId: string): Promise<UcProviderAdapterSummary[]> {
    const rows = await this.deps.db.query.ucProviderAdapters.findMany({
      where: eq(ucProviderAdapters.companyId, companyId),
      orderBy: [desc(ucProviderAdapters.createdAt)],
    });
    return rows.map((row) => this.toAdapterSummary(row));
  }

  /**
   * Register real Communications Platform channel adapters (Gmail) so the hub
   * Providers tab never shows a false empty registry when OAuth wiring exists.
   * Status is honest — never claims Connected without a live OAuth connection.
   */
  private async ensureRegisteredChannelAdapters(companyId: string): Promise<void> {
    const gmail = await this.getBusinessGmailAdapterState(companyId);
    const existing = await this.deps.db.query.ucProviderAdapters.findFirst({
      where: and(
        eq(ucProviderAdapters.companyId, companyId),
        eq(ucProviderAdapters.channel, 'email'),
        eq(ucProviderAdapters.providerKey, GMAIL_UC_PROVIDER_KEY),
      ),
    });

    const status: UcProviderAdapterSummary['status'] = gmail.connected ? 'active' : 'inactive';
    const lastTestMessage = gmail.connected
      ? `Connected via Google OAuth${gmail.emailAddress ? ` (${gmail.emailAddress})` : ''}.`
      : !gmail.oauthConfigured
        ? 'Not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the API.'
        : 'Google OAuth is configured. Platform Owner can Connect Gmail in Channel Settings.';
    const lastTestStatus = gmail.connected
      ? 'passed'
      : !gmail.oauthConfigured
        ? 'not_configured'
        : 'not_connected';
    const config = {
      source: 'communications_platform',
      oauthConfigured: gmail.oauthConfigured,
      emailAddress: gmail.emailAddress,
      connectPath: '/communications-hub',
    };

    if (existing) {
      await this.deps.db
        .update(ucProviderAdapters)
        .set({
          name: GMAIL_UC_ADAPTER_NAME,
          status,
          isPrimary: true,
          lastTestStatus,
          lastTestMessage,
          lastTestAt: gmail.connected ? (existing.lastTestAt ?? new Date()) : existing.lastTestAt,
          config: { ...(existing.config ?? {}), ...config },
          updatedAt: new Date(),
        })
        .where(eq(ucProviderAdapters.id, existing.id));
      return;
    }

    await this.deps.db.insert(ucProviderAdapters).values({
      companyId,
      channel: 'email',
      providerKey: GMAIL_UC_PROVIDER_KEY,
      name: GMAIL_UC_ADAPTER_NAME,
      status,
      isPrimary: true,
      lastTestStatus,
      lastTestMessage,
      config,
    });
  }

  private async getBusinessGmailAdapterState(companyId: string): Promise<{
    oauthConfigured: boolean;
    connected: boolean;
    emailAddress: string | null;
  }> {
    const oauthConfigured = this.deps.gmailOAuthService?.isAppConfigured() ?? false;
    const [account] = await this.deps.db
      .select()
      .from(commPlatformAccounts)
      .where(
        and(
          eq(commPlatformAccounts.companyId, companyId),
          eq(commPlatformAccounts.accountKind, 'business_gmail'),
        ),
      )
      .limit(1);

    const connected =
      oauthConfigured &&
      account?.status === 'connected' &&
      Boolean(account.credentialsEncrypted);

    return {
      oauthConfigured,
      connected,
      emailAddress: account?.externalAddress ?? null,
    };
  }

  private async listOutboundCampaigns(companyId: string): Promise<UcOutboundCampaignSummary[]> {
    const rows = await this.deps.db.query.ucOutboundCallCampaigns.findMany({
      where: eq(ucOutboundCallCampaigns.companyId, companyId),
      orderBy: [desc(ucOutboundCallCampaigns.createdAt)],
      limit: 20,
    });
    return rows.map((row) => this.toCampaignSummary(row));
  }

  private async listDispatchNotifications(
    companyId: string,
  ): Promise<UcDispatchNotificationSummary[]> {
    const rows = await this.deps.db.query.ucDispatchNotifications.findMany({
      where: eq(ucDispatchNotifications.companyId, companyId),
      orderBy: [desc(ucDispatchNotifications.createdAt)],
      limit: 30,
    });
    return rows.map((row) => this.toDispatchSummary(row));
  }

  private async getLatestAnalytics(companyId: string): Promise<UcAnalyticsSummary | null> {
    const row = await this.deps.db.query.ucAnalyticsSnapshots.findFirst({
      where: eq(ucAnalyticsSnapshots.companyId, companyId),
      orderBy: [desc(ucAnalyticsSnapshots.capturedAt)],
    });
    return row ? this.toAnalyticsSummary(row) : null;
  }

  private async getPlatformConfig(companyId: string): Promise<UcPlatformConfigSummary> {
    const row = await this.ensurePlatformConfig(companyId);
    return this.toPlatformConfigSummary(row);
  }

  private async ensurePlatformConfig(companyId: string) {
    const existing = await this.deps.db.query.ucPlatformConfig.findFirst({
      where: eq(ucPlatformConfig.companyId, companyId),
    });
    if (existing) return existing;

    const [created] = await this.deps.db.insert(ucPlatformConfig).values({ companyId }).returning();
    return created!;
  }

  private async ensureAdapter(companyId: string, adapterId: string) {
    const adapter = await this.deps.db.query.ucProviderAdapters.findFirst({
      where: and(eq(ucProviderAdapters.id, adapterId), eq(ucProviderAdapters.companyId, companyId)),
    });
    if (!adapter)
      throw new EnterpriseUnifiedCommunicationsError('NOT_FOUND', 'Provider adapter not found');
    return adapter;
  }

  private async logAudit(
    scope: StaffScope,
    actionType: string,
    entityType: string,
    entityId: string,
    channel?: string,
  ) {
    await this.deps.db.insert(ucAuditLogs).values({
      companyId: scope.companyId,
      userId: scope.userId,
      actionType,
      entityType,
      entityId,
      channel: channel as UcProviderAdapterSummary['channel'] | undefined,
      metadata: {},
    });
  }

  private commIntelToTimeline(entry: {
    id: string;
    customerId: string | null;
    channel: string;
    title: string;
    preview: string;
    entityType: string | null;
    entityId: string | null;
    occurredAt: string;
  }): UcTimelineEntrySummary {
    return {
      id: entry.id,
      customerId: entry.customerId,
      entryType: mapChannelToEntryType(entry.channel),
      channel: mapCommIntelChannel(entry.channel),
      title: entry.title,
      summary: entry.preview,
      sourceModule: entry.entityType ?? entry.channel,
      sourceEntityId: entry.entityId ?? entry.id,
      occurredAt: entry.occurredAt,
    };
  }

  private async isWhatsappConnected(companyId: string): Promise<boolean> {
    const providers = await this.deps.integrationHubService.listProviderStatuses(companyId);
    const whatsapp = providers.find((p) => p.provider === 'whatsapp');
    return whatsapp?.connectionStatus === 'connected';
  }

  private async isEmailConnected(companyId: string): Promise<boolean> {
    const gmail = await this.getBusinessGmailAdapterState(companyId);
    if (gmail.connected) return true;
    const providers = await this.deps.integrationHubService.listProviderStatuses(companyId);
    const email = providers.find((p) => p.provider === 'email');
    const gmailHub = providers.find((p) => p.provider === 'gmail');
    return (
      email?.connectionStatus === 'connected' || gmailHub?.connectionStatus === 'connected'
    );
  }

  private toPlatformConfigSummary(
    row: typeof ucPlatformConfig.$inferSelect,
  ): UcPlatformConfigSummary {
    return {
      globalPolicies: row.globalPolicies ?? {},
      aiVoiceSettings: row.aiVoiceSettings ?? {},
      recordingPolicy: row.recordingPolicy ?? {},
      retentionDays: row.retentionDays,
      consentRequired: row.consentRequired,
      routingRules: row.routingRules ?? {},
      notificationTemplates: row.notificationTemplates ?? {},
    };
  }

  private toAdapterSummary(row: typeof ucProviderAdapters.$inferSelect): UcProviderAdapterSummary {
    const config = (row.config ?? {}) as {
      oauthConfigured?: boolean;
      emailAddress?: string | null;
      connectPath?: string | null;
    };
    return {
      id: row.id,
      channel: row.channel,
      providerKey: row.providerKey,
      name: row.name,
      status: row.status,
      endpointUrl: row.endpointUrl,
      isPrimary: row.isPrimary,
      lastTestAt: row.lastTestAt?.toISOString() ?? null,
      lastTestStatus: row.lastTestStatus,
      lastTestMessage: row.lastTestMessage,
      oauthConfigured: config.oauthConfigured,
      emailAddress: config.emailAddress ?? null,
      connectPath: config.connectPath ?? null,
    };
  }

  private toTimelineSummary(row: typeof ucTimelineIndex.$inferSelect): UcTimelineEntrySummary {
    return {
      id: row.id,
      customerId: row.customerId,
      jobId: row.jobId ?? null,
      entryType: row.entryType,
      channel: row.channel,
      title: row.title,
      summary: row.summary,
      sourceModule: row.sourceModule,
      sourceEntityId: row.sourceEntityId,
      occurredAt: row.occurredAt.toISOString(),
    };
  }

  private toAnalyticsSummary(row: typeof ucAnalyticsSnapshots.$inferSelect): UcAnalyticsSummary {
    return {
      callsAnswered: row.callsAnswered,
      callsMissed: row.callsMissed,
      avgResponseTimeSeconds:
        row.avgResponseTimeSeconds != null ? Number(row.avgResponseTimeSeconds) : null,
      aiResolutionRate: row.aiResolutionRate != null ? Number(row.aiResolutionRate) : null,
      humanTransferRate: row.humanTransferRate != null ? Number(row.humanTransferRate) : null,
      bookingConversionRate:
        row.bookingConversionRate != null ? Number(row.bookingConversionRate) : null,
      leadConversionRate: row.leadConversionRate != null ? Number(row.leadConversionRate) : null,
      customerSatisfactionScore:
        row.customerSatisfactionScore != null ? Number(row.customerSatisfactionScore) : null,
      channelUsage: row.channelUsage ?? {},
      providerPerformance: row.providerPerformance ?? {},
      capturedAt: row.capturedAt.toISOString(),
    };
  }

  private toCampaignSummary(
    row: typeof ucOutboundCallCampaigns.$inferSelect,
  ): UcOutboundCampaignSummary {
    return {
      id: row.id,
      campaignType: row.campaignType,
      status: row.status,
      subject: row.subject,
      consentRequired: row.consentRequired,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toDispatchSummary(
    row: typeof ucDispatchNotifications.$inferSelect,
  ): UcDispatchNotificationSummary {
    return {
      id: row.id,
      jobId: row.jobId,
      customerId: row.customerId,
      notificationType: row.notificationType,
      channel: row.channel,
      status: row.status,
      sentAt: row.sentAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

function mapChannelToEntryType(channel: string): UcTimelineEntrySummary['entryType'] {
  if (channel === 'phone') return 'call';
  if (channel === 'whatsapp') return 'whatsapp';
  if (channel === 'email') return 'email';
  if (channel === 'sms') return 'sms';
  if (channel === 'support') return 'live_chat';
  if (channel === 'portal') return 'portal_message';
  return 'internal_note';
}

function mapCommIntelChannel(channel: string): UcProviderAdapterSummary['channel'] | null {
  if (channel === 'phone') return 'voice';
  if (channel === 'whatsapp') return 'whatsapp';
  if (channel === 'email') return 'email';
  if (channel === 'sms') return 'sms';
  if (channel === 'support') return 'live_chat';
  if (channel === 'portal') return 'website_chat';
  return null;
}
