import { and, desc, eq } from 'drizzle-orm';
import type {
  CreateVrActionDraftRequest,
  CreateVrBusinessHoursRequest,
  CreateVrCallIntelligenceRequest,
  CreateVrCallQueueRequest,
  CreateVrConversationDraftRequest,
  CreateVrEmergencyRuleRequest,
  CreateVrExtensionRequest,
  CreateVrLanguageConfigRequest,
  CreateVrLocationConfigRequest,
  CreateVrRingGroupRequest,
  CreateVrRoutingRuleRequest,
  CreateVrTelephonyProviderRequest,
  CreateVrVoicemailPolicyRequest,
  EnterpriseVoiceReceptionAuraContext,
  EnterpriseVoiceReceptionDashboard,
  UpdateVrAiReceptionistConfigRequest,
  UpdateVrPlatformConfigRequest,
  VrActionDraftSummary,
  VrAiReceptionistConfigSummary,
  VrAnalyticsSummary,
  VrAuditLogSummary,
  VrBusinessHoursSummary,
  VrCallIntelligenceSummary,
  VrCallQueueSummary,
  VrConversationDraftSummary,
  VrEmergencyRuleSummary,
  VrExtensionSummary,
  VrLanguageConfigSummary,
  VrLocationConfigSummary,
  VrPlatformConfigSummary,
  VrQualitySummary,
  VrRecordingPolicySummary,
  VrRingGroupSummary,
  VrRoutingRuleSummary,
  VrTelephonyProviderSummary,
  VrVoiceAlertSummary,
  VrVoicemailPolicySummary,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  vrActionDrafts,
  vrAiReceptionistConfig,
  vrAnalyticsSnapshots,
  vrAuditLogs,
  vrBusinessHours,
  vrCallIntelligenceRecords,
  vrCallQueues,
  vrConversationDrafts,
  vrEmergencyRules,
  vrExtensions,
  vrLanguageConfigs,
  vrLocationConfigs,
  vrPlatformConfig,
  vrQualitySnapshots,
  vrRecordingPolicies,
  vrRingGroups,
  vrRoutingRules,
  vrTelephonyProviderConfigs,
  vrVoiceAlerts,
  vrVoicemailPolicies,
} from '@titan/db';
import type { CommunicationsIntelligenceService } from './communications-intelligence.service.js';
import type { CrmService } from './crm.service.js';
import type { EnterpriseKnowledgeGraphService } from './enterprise-knowledge-graph.service.js';
import type { EnterpriseMissionControlService } from './enterprise-mission-control.service.js';
import type { EnterpriseUnifiedCommunicationsService } from './enterprise-unified-communications.service.js';
import type { JobsService } from './jobs.service.js';
import type { LeadsService } from './leads.service.js';
import type { SchedulingService } from './scheduling.service.js';
import type { VoiceService } from './voice.service.js';

export class EnterpriseVoiceReceptionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseVoiceReceptionError';
  }
}

type StaffScope = { companyId: string; userId: string };

type VoiceReceptionDeps = {
  db: DatabaseClient;
  voiceService: VoiceService;
  communicationsIntelligenceService: CommunicationsIntelligenceService;
  enterpriseUnifiedCommunicationsService: EnterpriseUnifiedCommunicationsService;
  crmService: CrmService;
  schedulingService: SchedulingService;
  jobsService: JobsService;
  leadsService: LeadsService;
  enterpriseKnowledgeGraphService: EnterpriseKnowledgeGraphService;
  enterpriseMissionControlService: EnterpriseMissionControlService;
};

export class EnterpriseVoiceReceptionService {
  constructor(private readonly deps: VoiceReceptionDeps) {}

  async getDashboard(companyId: string): Promise<EnterpriseVoiceReceptionDashboard> {
    await this.ensurePlatformConfig(companyId);
    await this.ensureAiReceptionistConfig(companyId);

    const [
      platformConfig,
      voiceStats,
      callHistory,
      liveSessions,
      aiReceptionist,
      telephonyProviders,
      extensions,
      ringGroups,
      callQueues,
      routingRules,
      businessHours,
      emergencyRules,
      voicemailPolicies,
      languageConfigs,
      locationConfigs,
      callIntelligence,
      conversationDrafts,
      quality,
      analytics,
      alerts,
      recordings,
      ucDashboard,
    ] = await Promise.all([
      this.getPlatformConfig(companyId),
      this.deps.voiceService.getStats(companyId),
      this.deps.voiceService.getCallHistory(companyId),
      this.deps.voiceService.listSessions(companyId),
      this.getAiReceptionistConfig(companyId),
      this.listTelephonyProviders(companyId),
      this.listExtensions(companyId),
      this.listRingGroups(companyId),
      this.listCallQueues(companyId),
      this.listRoutingRules(companyId),
      this.listBusinessHours(companyId),
      this.listEmergencyRules(companyId),
      this.listVoicemailPolicies(companyId),
      this.listLanguageConfigs(companyId),
      this.listLocationConfigs(companyId),
      this.listCallIntelligence(companyId),
      this.listConversationDrafts(companyId),
      this.getQualitySummary(companyId),
      this.getLatestAnalytics(companyId),
      this.listVoiceAlerts(companyId, { status: 'open' }),
      this.deps.communicationsIntelligenceService.listRecordings(companyId),
      this.deps.enterpriseUnifiedCommunicationsService.getDashboard(companyId).catch(() => null),
    ]);

    void this.deps.enterpriseMissionControlService.getMissionControlDashboard(companyId).catch(() => null);

    const activeCalls = liveSessions.filter((s) => s.status === 'active');
    const missedCallCount = callHistory.filter((c) => c.status === 'missed' || c.status === 'abandoned').length;
    const queuedCallCount = callQueues.length > 0 ? 0 : 0;
    const activeProviderCount = telephonyProviders.filter((p) => p.enabled).length;
    const criticalAlertCount = alerts.filter((a) => a.severity === 'critical').length;
    const overallVoiceHealthStatus =
      criticalAlertCount > 0 || !aiReceptionist.enabled && activeCalls.length > 5
        ? 'critical'
        : alerts.length > 0 || missedCallCount > 10
          ? 'degraded'
          : 'healthy';

    return {
      summary: `${activeCalls.length} active call(s), ${missedCallCount} missed call(s), ${telephonyProviders.length} telephony provider(s), ${emergencyRules.length} emergency rule(s), ${alerts.length} open alert(s).`,
      platformConfig,
      voiceStats,
      activeCallCount: activeCalls.length,
      queuedCallCount,
      missedCallCount,
      aiReceptionist,
      legacyVoiceReceptionist: ucDashboard?.voiceReceptionist ?? null,
      telephonyProviders,
      providerAdapters: ucDashboard?.providerAdapters ?? [],
      activeProviderCount,
      extensions,
      ringGroups,
      callQueues,
      routingRules,
      businessHours,
      emergencyRules,
      voicemailPolicies,
      languageConfigs,
      locationConfigs,
      liveCalls: activeCalls.map((call, index) => ({
        ...call,
        queuePosition: index + 1,
        isEmergency: false,
      })),
      callHistory,
      recordings,
      callIntelligence,
      conversationDrafts,
      quality,
      analytics,
      recentAlerts: alerts.slice(0, 10),
      openAlertCount: alerts.length,
      communicationsIntelligence: ucDashboard?.intelligence ?? null,
      overallVoiceHealthStatus,
    };
  }

  async buildAuraContext(companyId: string): Promise<EnterpriseVoiceReceptionAuraContext> {
    const dashboard = await this.getDashboard(companyId);
    return {
      summary: dashboard.summary,
      activeCallCount: dashboard.activeCallCount,
      queuedCallCount: dashboard.queuedCallCount,
      missedCallCount: dashboard.missedCallCount,
      aiReceptionistEnabled: dashboard.aiReceptionist.enabled,
      openAlertCount: dashboard.openAlertCount,
      overallVoiceHealthStatus: dashboard.overallVoiceHealthStatus,
    };
  }

  async getPlatformConfig(companyId: string): Promise<VrPlatformConfigSummary> {
    return toPlatformConfigSummary(await this.ensurePlatformConfig(companyId));
  }

  async updatePlatformConfig(scope: StaffScope, input: UpdateVrPlatformConfigRequest): Promise<VrPlatformConfigSummary> {
    const existing = await this.ensurePlatformConfig(scope.companyId);
    const [updated] = await this.deps.db
      .update(vrPlatformConfig)
      .set({
        telephonyPolicy: input.telephonyPolicy ?? existing.telephonyPolicy,
        receptionistPolicy: input.receptionistPolicy ?? existing.receptionistPolicy,
        routingPolicy: input.routingPolicy ?? existing.routingPolicy,
        recordingPolicy: input.recordingPolicy ?? existing.recordingPolicy,
        languagePolicy: input.languagePolicy ?? existing.languagePolicy,
        auditRetentionDays: input.auditRetentionDays ?? existing.auditRetentionDays,
        updatedAt: new Date(),
      })
      .where(eq(vrPlatformConfig.companyId, scope.companyId))
      .returning();
    await this.logAudit(scope, 'update_platform_config', 'vr_platform_config', updated?.id);
    return toPlatformConfigSummary(updated ?? existing);
  }

  async getAiReceptionistConfig(companyId: string): Promise<VrAiReceptionistConfigSummary> {
    return toAiReceptionistSummary(await this.ensureAiReceptionistConfig(companyId));
  }

  async updateAiReceptionistConfig(
    scope: StaffScope,
    input: UpdateVrAiReceptionistConfigRequest,
  ): Promise<VrAiReceptionistConfigSummary> {
    const existing = await this.ensureAiReceptionistConfig(scope.companyId);
    const [updated] = await this.deps.db
      .update(vrAiReceptionistConfig)
      .set({
        enabled: input.enabled ?? existing.enabled,
        welcomeMessage: input.welcomeMessage ?? existing.welcomeMessage,
        confidenceThreshold: input.confidenceThreshold ?? existing.confidenceThreshold,
        escalationPolicy: input.escalationPolicy ?? existing.escalationPolicy,
        knowledgePolicy: input.knowledgePolicy ?? existing.knowledgePolicy,
        config: input.config ?? existing.config,
        updatedAt: new Date(),
      })
      .where(eq(vrAiReceptionistConfig.companyId, scope.companyId))
      .returning();
    await this.logAudit(scope, 'update_ai_receptionist_config', 'vr_ai_receptionist_config', updated?.id);
    return toAiReceptionistSummary(updated ?? existing);
  }

  async listTelephonyProviders(companyId: string): Promise<VrTelephonyProviderSummary[]> {
    const rows = await this.deps.db.query.vrTelephonyProviderConfigs.findMany({
      where: eq(vrTelephonyProviderConfigs.companyId, companyId),
      orderBy: [desc(vrTelephonyProviderConfigs.createdAt)],
    });
    return rows.map(toTelephonyProviderSummary);
  }

  async createTelephonyProvider(
    scope: StaffScope,
    input: CreateVrTelephonyProviderRequest,
  ): Promise<VrTelephonyProviderSummary> {
    const [created] = await this.deps.db
      .insert(vrTelephonyProviderConfigs)
      .values({
        companyId: scope.companyId,
        providerKey: input.providerKey.trim(),
        name: input.name.trim(),
        enabled: input.enabled ?? false,
        config: input.config ?? {},
      })
      .returning();
    if (!created) throw new EnterpriseVoiceReceptionError('CREATE_FAILED', 'Unable to create telephony provider');
    await this.logAudit(scope, 'create_telephony_provider', 'vr_telephony_provider_configs', created.id);
    return toTelephonyProviderSummary(created);
  }

  async listExtensions(companyId: string): Promise<VrExtensionSummary[]> {
    const rows = await this.deps.db.query.vrExtensions.findMany({
      where: eq(vrExtensions.companyId, companyId),
      orderBy: [desc(vrExtensions.createdAt)],
    });
    return rows.map(toExtensionSummary);
  }

  async createExtension(scope: StaffScope, input: CreateVrExtensionRequest): Promise<VrExtensionSummary> {
    const [created] = await this.deps.db
      .insert(vrExtensions)
      .values({
        companyId: scope.companyId,
        extensionKey: input.extensionKey.trim(),
        name: input.name.trim(),
        destinationType: input.destinationType.trim(),
        destinationRef: input.destinationRef?.trim() ?? null,
        locationKey: input.locationKey?.trim() ?? null,
      })
      .returning();
    if (!created) throw new EnterpriseVoiceReceptionError('CREATE_FAILED', 'Unable to create extension');
    await this.logAudit(scope, 'create_extension', 'vr_extensions', created.id);
    return toExtensionSummary(created);
  }

  async listRingGroups(companyId: string): Promise<VrRingGroupSummary[]> {
    const rows = await this.deps.db.query.vrRingGroups.findMany({
      where: eq(vrRingGroups.companyId, companyId),
      orderBy: [desc(vrRingGroups.createdAt)],
    });
    return rows.map(toRingGroupSummary);
  }

  async createRingGroup(scope: StaffScope, input: CreateVrRingGroupRequest): Promise<VrRingGroupSummary> {
    const [created] = await this.deps.db
      .insert(vrRingGroups)
      .values({
        companyId: scope.companyId,
        groupKey: input.groupKey.trim(),
        name: input.name.trim(),
        extensionIds: input.extensionIds ?? [],
        strategy: input.strategy ?? 'simultaneous',
      })
      .returning();
    if (!created) throw new EnterpriseVoiceReceptionError('CREATE_FAILED', 'Unable to create ring group');
    await this.logAudit(scope, 'create_ring_group', 'vr_ring_groups', created.id);
    return toRingGroupSummary(created);
  }

  async listCallQueues(companyId: string): Promise<VrCallQueueSummary[]> {
    const rows = await this.deps.db.query.vrCallQueues.findMany({
      where: eq(vrCallQueues.companyId, companyId),
      orderBy: [desc(vrCallQueues.createdAt)],
    });
    return rows.map(toCallQueueSummary);
  }

  async createCallQueue(scope: StaffScope, input: CreateVrCallQueueRequest): Promise<VrCallQueueSummary> {
    const [created] = await this.deps.db
      .insert(vrCallQueues)
      .values({
        companyId: scope.companyId,
        queueKey: input.queueKey.trim(),
        name: input.name.trim(),
        maxWaitSeconds: input.maxWaitSeconds ?? null,
        overflowDestination: input.overflowDestination?.trim() ?? null,
      })
      .returning();
    if (!created) throw new EnterpriseVoiceReceptionError('CREATE_FAILED', 'Unable to create call queue');
    await this.logAudit(scope, 'create_call_queue', 'vr_call_queues', created.id);
    return toCallQueueSummary(created);
  }

  async listRoutingRules(companyId: string): Promise<VrRoutingRuleSummary[]> {
    const rows = await this.deps.db.query.vrRoutingRules.findMany({
      where: eq(vrRoutingRules.companyId, companyId),
      orderBy: [desc(vrRoutingRules.priority)],
    });
    return rows.map(toRoutingRuleSummary);
  }

  async createRoutingRule(scope: StaffScope, input: CreateVrRoutingRuleRequest): Promise<VrRoutingRuleSummary> {
    const [created] = await this.deps.db
      .insert(vrRoutingRules)
      .values({
        companyId: scope.companyId,
        ruleKey: input.ruleKey.trim(),
        name: input.name.trim(),
        priority: input.priority ?? 100,
        matchCriteria: input.matchCriteria ?? {},
        destinationType: input.destinationType.trim(),
        destinationRef: input.destinationRef?.trim() ?? null,
      })
      .returning();
    if (!created) throw new EnterpriseVoiceReceptionError('CREATE_FAILED', 'Unable to create routing rule');
    await this.logAudit(scope, 'create_routing_rule', 'vr_routing_rules', created.id);
    return toRoutingRuleSummary(created);
  }

  async listBusinessHours(companyId: string): Promise<VrBusinessHoursSummary[]> {
    const rows = await this.deps.db.query.vrBusinessHours.findMany({
      where: eq(vrBusinessHours.companyId, companyId),
      orderBy: [desc(vrBusinessHours.createdAt)],
    });
    return rows.map(toBusinessHoursSummary);
  }

  async createBusinessHours(scope: StaffScope, input: CreateVrBusinessHoursRequest): Promise<VrBusinessHoursSummary> {
    const [created] = await this.deps.db
      .insert(vrBusinessHours)
      .values({
        companyId: scope.companyId,
        scheduleKey: input.scheduleKey.trim(),
        name: input.name.trim(),
        timezone: input.timezone ?? 'UTC',
        weeklySchedule: input.weeklySchedule ?? {},
        holidayOverrides: input.holidayOverrides ?? {},
        afterHoursDestination: input.afterHoursDestination?.trim() ?? null,
      })
      .returning();
    if (!created) throw new EnterpriseVoiceReceptionError('CREATE_FAILED', 'Unable to create business hours');
    await this.logAudit(scope, 'create_business_hours', 'vr_business_hours', created.id);
    return toBusinessHoursSummary(created);
  }

  async listEmergencyRules(companyId: string): Promise<VrEmergencyRuleSummary[]> {
    const rows = await this.deps.db.query.vrEmergencyRules.findMany({
      where: eq(vrEmergencyRules.companyId, companyId),
      orderBy: [desc(vrEmergencyRules.priority)],
    });
    return rows.map(toEmergencyRuleSummary);
  }

  async createEmergencyRule(scope: StaffScope, input: CreateVrEmergencyRuleRequest): Promise<VrEmergencyRuleSummary> {
    const [created] = await this.deps.db
      .insert(vrEmergencyRules)
      .values({
        companyId: scope.companyId,
        ruleKey: input.ruleKey.trim(),
        name: input.name.trim(),
        triggerKeywords: input.triggerKeywords ?? [],
        escalationWorkflow: input.escalationWorkflow ?? {},
        priority: input.priority ?? 1,
      })
      .returning();
    if (!created) throw new EnterpriseVoiceReceptionError('CREATE_FAILED', 'Unable to create emergency rule');
    await this.logAudit(scope, 'create_emergency_rule', 'vr_emergency_rules', created.id);
    return toEmergencyRuleSummary(created);
  }

  async listVoicemailPolicies(companyId: string): Promise<VrVoicemailPolicySummary[]> {
    const rows = await this.deps.db.query.vrVoicemailPolicies.findMany({
      where: eq(vrVoicemailPolicies.companyId, companyId),
      orderBy: [desc(vrVoicemailPolicies.createdAt)],
    });
    return rows.map(toVoicemailPolicySummary);
  }

  async createVoicemailPolicy(
    scope: StaffScope,
    input: CreateVrVoicemailPolicyRequest,
  ): Promise<VrVoicemailPolicySummary> {
    const [created] = await this.deps.db
      .insert(vrVoicemailPolicies)
      .values({
        companyId: scope.companyId,
        policyKey: input.policyKey.trim(),
        name: input.name.trim(),
        greetingText: input.greetingText?.trim() ?? null,
        retentionDays: input.retentionDays ?? 30,
        config: input.config ?? {},
      })
      .returning();
    if (!created) throw new EnterpriseVoiceReceptionError('CREATE_FAILED', 'Unable to create voicemail policy');
    await this.logAudit(scope, 'create_voicemail_policy', 'vr_voicemail_policies', created.id);
    return toVoicemailPolicySummary(created);
  }

  async listLanguageConfigs(companyId: string): Promise<VrLanguageConfigSummary[]> {
    const rows = await this.deps.db.query.vrLanguageConfigs.findMany({
      where: eq(vrLanguageConfigs.companyId, companyId),
      orderBy: [desc(vrLanguageConfigs.createdAt)],
    });
    return rows.map(toLanguageConfigSummary);
  }

  async createLanguageConfig(
    scope: StaffScope,
    input: CreateVrLanguageConfigRequest,
  ): Promise<VrLanguageConfigSummary> {
    const [created] = await this.deps.db
      .insert(vrLanguageConfigs)
      .values({
        companyId: scope.companyId,
        languageCode: input.languageCode.trim(),
        name: input.name.trim(),
        isDefault: input.isDefault ?? false,
        config: input.config ?? {},
      })
      .returning();
    if (!created) throw new EnterpriseVoiceReceptionError('CREATE_FAILED', 'Unable to create language config');
    await this.logAudit(scope, 'create_language_config', 'vr_language_configs', created.id);
    return toLanguageConfigSummary(created);
  }

  async listLocationConfigs(companyId: string): Promise<VrLocationConfigSummary[]> {
    const rows = await this.deps.db.query.vrLocationConfigs.findMany({
      where: eq(vrLocationConfigs.companyId, companyId),
      orderBy: [desc(vrLocationConfigs.createdAt)],
    });
    return rows.map(toLocationConfigSummary);
  }

  async createLocationConfig(
    scope: StaffScope,
    input: CreateVrLocationConfigRequest,
  ): Promise<VrLocationConfigSummary> {
    const [created] = await this.deps.db
      .insert(vrLocationConfigs)
      .values({
        companyId: scope.companyId,
        locationKey: input.locationKey.trim(),
        name: input.name.trim(),
        routingConfig: input.routingConfig ?? {},
        businessHoursId: input.businessHoursId ?? null,
      })
      .returning();
    if (!created) throw new EnterpriseVoiceReceptionError('CREATE_FAILED', 'Unable to create location config');
    await this.logAudit(scope, 'create_location_config', 'vr_location_configs', created.id);
    return toLocationConfigSummary(created);
  }

  async listCallIntelligence(companyId: string): Promise<VrCallIntelligenceSummary[]> {
    const rows = await this.deps.db.query.vrCallIntelligenceRecords.findMany({
      where: eq(vrCallIntelligenceRecords.companyId, companyId),
      orderBy: [desc(vrCallIntelligenceRecords.capturedAt)],
      limit: 100,
    });
    return rows.map(toCallIntelligenceSummary);
  }

  async captureCallIntelligence(
    scope: StaffScope,
    input: CreateVrCallIntelligenceRequest,
  ): Promise<VrCallIntelligenceSummary> {
    if (input.voiceSessionId) {
      const session = await this.deps.voiceService.getSession(scope.companyId, input.voiceSessionId);
      if (!session) {
        throw new EnterpriseVoiceReceptionError('NOT_FOUND', 'Voice session not found');
      }
    }

    const [created] = await this.deps.db
      .insert(vrCallIntelligenceRecords)
      .values({
        companyId: scope.companyId,
        voiceSessionId: input.voiceSessionId ?? null,
        durationSeconds: input.durationSeconds ?? null,
        queueTimeSeconds: input.queueTimeSeconds ?? null,
        holdTimeSeconds: input.holdTimeSeconds ?? null,
        transferCount: input.transferCount ?? 0,
        outcome: input.outcome?.trim() ?? null,
        sentiment: input.sentiment?.trim() ?? null,
        intent: input.intent?.trim() ?? null,
        category: input.category?.trim() ?? null,
        actionItems: input.actionItems ?? [],
        followUps: input.followUps ?? [],
        metrics: input.metrics ?? {},
      })
      .returning();
    if (!created) throw new EnterpriseVoiceReceptionError('CREATE_FAILED', 'Unable to capture call intelligence');
    await this.logAudit(scope, 'capture_call_intelligence', 'vr_call_intelligence_records', created.id);
    return toCallIntelligenceSummary(created);
  }

  async listConversationDrafts(companyId: string): Promise<VrConversationDraftSummary[]> {
    const rows = await this.deps.db.query.vrConversationDrafts.findMany({
      where: eq(vrConversationDrafts.companyId, companyId),
      orderBy: [desc(vrConversationDrafts.createdAt)],
      limit: 50,
    });
    return rows.map(toConversationDraftSummary);
  }

  async createConversationDraft(
    scope: StaffScope,
    input: CreateVrConversationDraftRequest,
  ): Promise<VrConversationDraftSummary> {
    const [created] = await this.deps.db
      .insert(vrConversationDrafts)
      .values({
        companyId: scope.companyId,
        voiceSessionId: input.voiceSessionId ?? null,
        draftType: input.draftType.trim(),
        title: input.title.trim(),
        content: input.content.trim(),
        approvalRequired: input.approvalRequired ?? true,
      })
      .returning();
    if (!created) throw new EnterpriseVoiceReceptionError('CREATE_FAILED', 'Unable to create conversation draft');
    await this.logAudit(scope, 'create_conversation_draft', 'vr_conversation_drafts', created.id);
    return toConversationDraftSummary(created);
  }

  async listActionDrafts(companyId: string): Promise<VrActionDraftSummary[]> {
    const rows = await this.deps.db.query.vrActionDrafts.findMany({
      where: eq(vrActionDrafts.companyId, companyId),
      orderBy: [desc(vrActionDrafts.createdAt)],
      limit: 50,
    });
    return rows.map(toActionDraftSummary);
  }

  async createActionDraft(scope: StaffScope, input: CreateVrActionDraftRequest): Promise<VrActionDraftSummary> {
    const [created] = await this.deps.db
      .insert(vrActionDrafts)
      .values({
        companyId: scope.companyId,
        draftType: input.draftType.trim(),
        title: input.title.trim(),
        content: input.content.trim(),
        sourceRecords: input.sourceRecords ?? {},
        aiGenerated: input.aiGenerated ?? false,
      })
      .returning();
    if (!created) throw new EnterpriseVoiceReceptionError('CREATE_FAILED', 'Unable to create action draft');
    await this.logAudit(scope, 'create_action_draft', 'vr_action_drafts', created.id);
    return toActionDraftSummary(created);
  }

  async listVoiceAlerts(companyId: string, filters?: { status?: string }): Promise<VrVoiceAlertSummary[]> {
    const rows = await this.deps.db.query.vrVoiceAlerts.findMany({
      where: filters?.status
        ? and(eq(vrVoiceAlerts.companyId, companyId), eq(vrVoiceAlerts.status, filters.status as never))
        : eq(vrVoiceAlerts.companyId, companyId),
      orderBy: [desc(vrVoiceAlerts.createdAt)],
      limit: 50,
    });
    return rows.map(toVoiceAlertSummary);
  }

  async syncVoiceAlerts(scope: StaffScope): Promise<VrVoiceAlertSummary[]> {
    const dashboard = await this.getDashboard(scope.companyId);
    const alerts: VrVoiceAlertSummary[] = [];

    if (dashboard.missedCallCount > 5) {
      alerts.push(
        await this.upsertVoiceAlert(scope.companyId, {
          alertType: 'missed_calls_high',
          severity: dashboard.missedCallCount > 15 ? 'critical' : 'warning',
          title: 'High missed call volume',
          description: `${dashboard.missedCallCount} missed call(s) detected.`,
          sourceModule: 'voice_reception',
        }),
      );
    }

    if (!dashboard.aiReceptionist.enabled && dashboard.activeCallCount > 0) {
      alerts.push(
        await this.upsertVoiceAlert(scope.companyId, {
          alertType: 'ai_receptionist_disabled',
          severity: 'warning',
          title: 'AI receptionist disabled with active calls',
          description: 'Inbound calls are active but AI receptionist is not enabled.',
          sourceModule: 'voice_reception',
        }),
      );
    }

    if (dashboard.activeProviderCount === 0 && dashboard.telephonyProviders.length > 0) {
      alerts.push(
        await this.upsertVoiceAlert(scope.companyId, {
          alertType: 'telephony_provider_inactive',
          severity: 'critical',
          title: 'No active telephony providers',
          description: 'All configured telephony providers are disabled.',
          sourceModule: 'voice_reception',
        }),
      );
    }

    if (dashboard.emergencyRules.length === 0) {
      alerts.push(
        await this.upsertVoiceAlert(scope.companyId, {
          alertType: 'emergency_routing_unconfigured',
          severity: 'info',
          title: 'Emergency routing not configured',
          description: 'No emergency routing rules are configured.',
          sourceModule: 'voice_reception',
        }),
      );
    }

    await this.logAudit(scope, 'sync_voice_alerts', 'vr_voice_alerts', undefined, { alertCount: alerts.length });
    return alerts;
  }

  async captureAnalytics(scope: StaffScope): Promise<VrAnalyticsSummary> {
    const dashboard = await this.getDashboard(scope.companyId);
    const metrics = {
      activeCallCount: dashboard.activeCallCount,
      missedCallCount: dashboard.missedCallCount,
      queuedCallCount: dashboard.queuedCallCount,
      totalSessionCount: dashboard.voiceStats.totalSessionCount,
      completedSessionCount: dashboard.voiceStats.completedSessionCount,
      followUpRequiredCount: dashboard.voiceStats.followUpRequiredCount,
      appointmentRequestCount: dashboard.voiceStats.appointmentRequestCount,
      quoteRequestCount: dashboard.voiceStats.quoteRequestCount,
      aiReceptionistEnabled: dashboard.aiReceptionist.enabled,
      activeProviderCount: dashboard.activeProviderCount,
      openAlertCount: dashboard.openAlertCount,
      transferRate: dashboard.quality.transferRate,
      escalationRate: dashboard.quality.escalationRate,
      bookingSuccessRate: dashboard.quality.bookingSuccessRate,
      resolutionRate: dashboard.quality.resolutionRate,
    };

    const [created] = await this.deps.db
      .insert(vrAnalyticsSnapshots)
      .values({ companyId: scope.companyId, metrics })
      .returning();
    if (!created) throw new EnterpriseVoiceReceptionError('CREATE_FAILED', 'Unable to capture analytics');
    await this.logAudit(scope, 'capture_analytics', 'vr_analytics_snapshots', created.id);
    return toAnalyticsSummary(created);
  }

  async captureQualityMetrics(scope: StaffScope): Promise<VrQualitySummary> {
    const dashboard = await this.getDashboard(scope.companyId);
    const total = dashboard.voiceStats.totalSessionCount || 1;
    const completed = dashboard.voiceStats.completedSessionCount;
    const followUps = dashboard.voiceStats.followUpRequiredCount;
    const appointments = dashboard.voiceStats.appointmentRequestCount;

    const metrics = {
      callQualityScore: completed > 0 ? Math.min(100, Math.round((completed / total) * 100)) : null,
      responseQualityScore: dashboard.aiReceptionist.enabled ? dashboard.aiReceptionist.confidenceThreshold : null,
      transferRate: 0,
      escalationRate: followUps / total,
      bookingSuccessRate: appointments / total,
      customerSatisfactionScore: null,
      resolutionRate: completed / total,
    };

    const [created] = await this.deps.db
      .insert(vrQualitySnapshots)
      .values({ companyId: scope.companyId, metrics })
      .returning();
    if (!created) throw new EnterpriseVoiceReceptionError('CREATE_FAILED', 'Unable to capture quality metrics');
    await this.logAudit(scope, 'capture_quality_metrics', 'vr_quality_snapshots', created.id);
    return toQualitySummary(metrics, created.capturedAt.toISOString());
  }

  async listAuditLogs(companyId: string): Promise<VrAuditLogSummary[]> {
    const rows = await this.deps.db.query.vrAuditLogs.findMany({
      where: eq(vrAuditLogs.companyId, companyId),
      orderBy: [desc(vrAuditLogs.createdAt)],
      limit: 100,
    });
    return rows.map(toAuditLogSummary);
  }

  async listRecordingPolicies(companyId: string): Promise<VrRecordingPolicySummary[]> {
    const rows = await this.deps.db.query.vrRecordingPolicies.findMany({
      where: eq(vrRecordingPolicies.companyId, companyId),
      orderBy: [desc(vrRecordingPolicies.createdAt)],
    });
    return rows.map(toRecordingPolicySummary);
  }

  private async getQualitySummary(companyId: string): Promise<VrQualitySummary> {
    const latest = await this.deps.db.query.vrQualitySnapshots.findFirst({
      where: eq(vrQualitySnapshots.companyId, companyId),
      orderBy: [desc(vrQualitySnapshots.capturedAt)],
    });
    if (latest) {
      const metrics = latest.metrics as Record<string, unknown>;
      return toQualitySummary(metrics, latest.capturedAt.toISOString());
    }

    const [stats] = await Promise.all([this.deps.voiceService.getStats(companyId)]);
    const total = stats.totalSessionCount || 1;
    return {
      callQualityScore: stats.completedSessionCount > 0 ? Math.round((stats.completedSessionCount / total) * 100) : null,
      responseQualityScore: null,
      transferRate: 0,
      escalationRate: stats.followUpRequiredCount / total,
      bookingSuccessRate: stats.appointmentRequestCount / total,
      customerSatisfactionScore: null,
      resolutionRate: stats.completedSessionCount / total,
      capturedAt: null,
    };
  }

  private async getLatestAnalytics(companyId: string): Promise<VrAnalyticsSummary | null> {
    const row = await this.deps.db.query.vrAnalyticsSnapshots.findFirst({
      where: eq(vrAnalyticsSnapshots.companyId, companyId),
      orderBy: [desc(vrAnalyticsSnapshots.capturedAt)],
    });
    return row ? toAnalyticsSummary(row) : null;
  }

  private async upsertVoiceAlert(
    companyId: string,
    input: {
      alertType: string;
      severity: 'info' | 'warning' | 'critical';
      title: string;
      description: string;
      sourceModule: string;
    },
  ): Promise<VrVoiceAlertSummary> {
    const existing = await this.deps.db.query.vrVoiceAlerts.findFirst({
      where: and(
        eq(vrVoiceAlerts.companyId, companyId),
        eq(vrVoiceAlerts.alertType, input.alertType),
        eq(vrVoiceAlerts.status, 'open'),
      ),
    });

    if (existing) {
      const [updated] = await this.deps.db
        .update(vrVoiceAlerts)
        .set({
          severity: input.severity,
          title: input.title,
          description: input.description,
          updatedAt: new Date(),
        })
        .where(eq(vrVoiceAlerts.id, existing.id))
        .returning();
      return toVoiceAlertSummary(updated ?? existing);
    }

    const [created] = await this.deps.db
      .insert(vrVoiceAlerts)
      .values({
        companyId,
        alertType: input.alertType,
        severity: input.severity,
        title: input.title,
        description: input.description,
        sourceModule: input.sourceModule,
      })
      .returning();
    return toVoiceAlertSummary(created!);
  }

  private async ensurePlatformConfig(companyId: string) {
    const existing = await this.deps.db.query.vrPlatformConfig.findFirst({
      where: eq(vrPlatformConfig.companyId, companyId),
    });
    if (existing) return existing;

    const [created] = await this.deps.db
      .insert(vrPlatformConfig)
      .values({ companyId })
      .returning();
    return created!;
  }

  private async ensureAiReceptionistConfig(companyId: string) {
    const existing = await this.deps.db.query.vrAiReceptionistConfig.findFirst({
      where: eq(vrAiReceptionistConfig.companyId, companyId),
    });
    if (existing) return existing;

    const [created] = await this.deps.db
      .insert(vrAiReceptionistConfig)
      .values({ companyId })
      .returning();
    return created!;
  }

  private async logAudit(
    scope: StaffScope,
    actionType: string,
    entityType?: string,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.deps.db.insert(vrAuditLogs).values({
      companyId: scope.companyId,
      actionType,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      userId: scope.userId,
      metadata: metadata ?? {},
    });
  }
}

function toPlatformConfigSummary(row: typeof vrPlatformConfig.$inferSelect): VrPlatformConfigSummary {
  return {
    telephonyPolicy: row.telephonyPolicy ?? {},
    receptionistPolicy: row.receptionistPolicy ?? {},
    routingPolicy: row.routingPolicy ?? {},
    recordingPolicy: row.recordingPolicy ?? {},
    languagePolicy: row.languagePolicy ?? {},
    auditRetentionDays: row.auditRetentionDays,
  };
}

function toAiReceptionistSummary(row: typeof vrAiReceptionistConfig.$inferSelect): VrAiReceptionistConfigSummary {
  return {
    enabled: row.enabled,
    welcomeMessage: row.welcomeMessage,
    confidenceThreshold: row.confidenceThreshold,
    escalationPolicy: row.escalationPolicy ?? {},
    knowledgePolicy: row.knowledgePolicy ?? {},
  };
}

function toTelephonyProviderSummary(row: typeof vrTelephonyProviderConfigs.$inferSelect): VrTelephonyProviderSummary {
  return {
    id: row.id,
    providerKey: row.providerKey,
    name: row.name,
    enabled: row.enabled,
    workflowStatus: row.workflowStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

function toExtensionSummary(row: typeof vrExtensions.$inferSelect): VrExtensionSummary {
  return {
    id: row.id,
    extensionKey: row.extensionKey,
    name: row.name,
    destinationType: row.destinationType,
    destinationRef: row.destinationRef,
    locationKey: row.locationKey,
    workflowStatus: row.workflowStatus,
  };
}

function toRingGroupSummary(row: typeof vrRingGroups.$inferSelect): VrRingGroupSummary {
  return {
    id: row.id,
    groupKey: row.groupKey,
    name: row.name,
    extensionIds: row.extensionIds ?? [],
    strategy: row.strategy,
    workflowStatus: row.workflowStatus,
  };
}

function toCallQueueSummary(row: typeof vrCallQueues.$inferSelect): VrCallQueueSummary {
  return {
    id: row.id,
    queueKey: row.queueKey,
    name: row.name,
    maxWaitSeconds: row.maxWaitSeconds,
    overflowDestination: row.overflowDestination,
    workflowStatus: row.workflowStatus,
  };
}

function toRoutingRuleSummary(row: typeof vrRoutingRules.$inferSelect): VrRoutingRuleSummary {
  return {
    id: row.id,
    ruleKey: row.ruleKey,
    name: row.name,
    priority: row.priority,
    destinationType: row.destinationType,
    destinationRef: row.destinationRef,
    workflowStatus: row.workflowStatus,
  };
}

function toBusinessHoursSummary(row: typeof vrBusinessHours.$inferSelect): VrBusinessHoursSummary {
  return {
    id: row.id,
    scheduleKey: row.scheduleKey,
    name: row.name,
    timezone: row.timezone,
    afterHoursDestination: row.afterHoursDestination,
    workflowStatus: row.workflowStatus,
  };
}

function toEmergencyRuleSummary(row: typeof vrEmergencyRules.$inferSelect): VrEmergencyRuleSummary {
  return {
    id: row.id,
    ruleKey: row.ruleKey,
    name: row.name,
    triggerKeywords: row.triggerKeywords ?? [],
    priority: row.priority,
    workflowStatus: row.workflowStatus,
  };
}

function toVoicemailPolicySummary(row: typeof vrVoicemailPolicies.$inferSelect): VrVoicemailPolicySummary {
  return {
    id: row.id,
    policyKey: row.policyKey,
    name: row.name,
    greetingText: row.greetingText,
    retentionDays: row.retentionDays,
    workflowStatus: row.workflowStatus,
  };
}

function toLanguageConfigSummary(row: typeof vrLanguageConfigs.$inferSelect): VrLanguageConfigSummary {
  return {
    id: row.id,
    languageCode: row.languageCode,
    name: row.name,
    isDefault: row.isDefault,
  };
}

function toLocationConfigSummary(row: typeof vrLocationConfigs.$inferSelect): VrLocationConfigSummary {
  return {
    id: row.id,
    locationKey: row.locationKey,
    name: row.name,
    businessHoursId: row.businessHoursId,
  };
}

function toCallIntelligenceSummary(row: typeof vrCallIntelligenceRecords.$inferSelect): VrCallIntelligenceSummary {
  return {
    id: row.id,
    voiceSessionId: row.voiceSessionId,
    durationSeconds: row.durationSeconds,
    queueTimeSeconds: row.queueTimeSeconds,
    holdTimeSeconds: row.holdTimeSeconds,
    transferCount: row.transferCount,
    outcome: row.outcome,
    sentiment: row.sentiment,
    intent: row.intent,
    category: row.category,
    actionItems: row.actionItems ?? [],
    followUps: row.followUps ?? [],
    capturedAt: row.capturedAt.toISOString(),
  };
}

function toConversationDraftSummary(row: typeof vrConversationDrafts.$inferSelect): VrConversationDraftSummary {
  return {
    id: row.id,
    voiceSessionId: row.voiceSessionId,
    draftType: row.draftType,
    title: row.title,
    content: row.content,
    approvalRequired: row.approvalRequired,
    workflowStatus: row.workflowStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

function toActionDraftSummary(row: typeof vrActionDrafts.$inferSelect): VrActionDraftSummary {
  return {
    id: row.id,
    draftType: row.draftType,
    title: row.title,
    content: row.content,
    aiGenerated: row.aiGenerated,
    workflowStatus: row.workflowStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

function toVoiceAlertSummary(row: typeof vrVoiceAlerts.$inferSelect): VrVoiceAlertSummary {
  return {
    id: row.id,
    alertType: row.alertType,
    severity: row.severity,
    status: row.status,
    title: row.title,
    description: row.description,
    sourceModule: row.sourceModule,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAnalyticsSummary(row: typeof vrAnalyticsSnapshots.$inferSelect): VrAnalyticsSummary {
  return {
    id: row.id,
    metrics: row.metrics ?? {},
    capturedAt: row.capturedAt.toISOString(),
  };
}

function toAuditLogSummary(row: typeof vrAuditLogs.$inferSelect): VrAuditLogSummary {
  return {
    id: row.id,
    actionType: row.actionType,
    entityType: row.entityType,
    entityId: row.entityId,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
  };
}

function toRecordingPolicySummary(row: typeof vrRecordingPolicies.$inferSelect): VrRecordingPolicySummary {
  return {
    id: row.id,
    policyKey: row.policyKey,
    name: row.name,
    consentRequired: row.consentRequired,
    retentionDays: row.retentionDays,
    workflowStatus: row.workflowStatus,
  };
}

function toQualitySummary(metrics: Record<string, unknown>, capturedAt: string | null): VrQualitySummary {
  return {
    callQualityScore: typeof metrics.callQualityScore === 'number' ? metrics.callQualityScore : null,
    responseQualityScore: typeof metrics.responseQualityScore === 'number' ? metrics.responseQualityScore : null,
    transferRate: typeof metrics.transferRate === 'number' ? metrics.transferRate : 0,
    escalationRate: typeof metrics.escalationRate === 'number' ? metrics.escalationRate : 0,
    bookingSuccessRate: typeof metrics.bookingSuccessRate === 'number' ? metrics.bookingSuccessRate : 0,
    customerSatisfactionScore:
      typeof metrics.customerSatisfactionScore === 'number' ? metrics.customerSatisfactionScore : null,
    resolutionRate: typeof metrics.resolutionRate === 'number' ? metrics.resolutionRate : 0,
    capturedAt,
  };
}
