import { and, desc, eq } from 'drizzle-orm';
import type {
  CreateNcActionDraftRequest,
  CreateNcAlertRequest,
  CreateNcNotificationRuleRequest,
  CreateNcNotificationTemplateRequest,
  DispatchNcNotificationRequest,
  EnterpriseNotificationsAuraContext,
  EnterpriseNotificationsDashboard,
  NcActionDraftSummary,
  NcAnalyticsSummary,
  NcAuditLogSummary,
  NcDeliveryChannel,
  NcInboxItemSummary,
  NcNotificationHealthSummary,
  NcNotificationRuleSummary,
  NcPlatformAlertSummary,
  NcPlatformConfigSummary,
  NcUserPreferenceSummary,
  UpdateNcInboxStateRequest,
  UpdateNcPlatformConfigRequest,
  UpdateNcUserPreferenceRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  ncActionDrafts,
  ncAnalyticsSnapshots,
  ncAuditLogs,
  ncInboxState,
  ncNotificationRules,
  ncPlatformAlerts,
  ncPlatformConfig,
  ncUserPreferences,
} from '@titan/db';
import type { NotificationService } from './notification.service.js';
import type { EnterpriseMissionControlService } from './enterprise-mission-control.service.js';
import { EnterpriseNotificationAlertService } from './enterprise-notification-alert.service.js';
import { EnterpriseNotificationEscalationService } from './enterprise-notification-escalation.service.js';
import { EnterpriseNotificationTemplateService } from './enterprise-notification-template.service.js';
import { EnterpriseNotificationDeliveryService } from './enterprise-notification-delivery.service.js';

export class EnterpriseNotificationsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseNotificationsError';
  }
}

type StaffScope = { companyId: string; userId: string };

type NotificationDeps = {
  db: DatabaseClient;
  notificationService: NotificationService;
  enterpriseMissionControlService: EnterpriseMissionControlService;
};

export class EnterpriseNotificationsService {
  private readonly alertService: EnterpriseNotificationAlertService;
  private readonly escalationService: EnterpriseNotificationEscalationService;
  private readonly templateService: EnterpriseNotificationTemplateService;
  private readonly deliveryService: EnterpriseNotificationDeliveryService;

  constructor(private readonly deps: NotificationDeps) {
    this.alertService = new EnterpriseNotificationAlertService(deps.db);
    this.escalationService = new EnterpriseNotificationEscalationService(deps.db);
    this.templateService = new EnterpriseNotificationTemplateService(deps.db);
    this.deliveryService = new EnterpriseNotificationDeliveryService(
      deps.db,
      deps.notificationService,
      this.templateService,
    );
  }

  async getDashboard(scope: StaffScope): Promise<EnterpriseNotificationsDashboard> {
    await this.ensurePlatformConfig(scope.companyId);

    const [
      platformConfig,
      inboxItems,
      alerts,
      escalations,
      templates,
      deliveryJobs,
      rules,
      userPreferences,
      analytics,
      platformAlerts,
    ] = await Promise.all([
      this.getPlatformConfig(scope.companyId),
      this.listInboxItems(scope),
      this.alertService.listAlerts(scope.companyId, { status: 'open' }),
      this.escalationService.listEscalations(scope.companyId, { status: 'pending' }),
      this.templateService.listTemplates(scope.companyId),
      this.deliveryService.listDeliveryJobs(scope.companyId),
      this.listRules(scope.companyId),
      this.listUserPreferences(scope),
      this.getLatestAnalytics(scope.companyId),
      this.listPlatformAlerts(scope.companyId, { status: 'open' }),
    ]);

    void this.deps.enterpriseMissionControlService.getMissionControlDashboard(scope.companyId).catch(() => null);

    const notificationHealth = this.buildNotificationHealth(alerts, deliveryJobs, escalations, platformAlerts);
    const criticalAlertCount = alerts.filter((a) => a.alertLevel === 'critical' || a.alertLevel === 'emergency').length;
    const overallNotificationHealthStatus =
      criticalAlertCount > 0 || notificationHealth.failedDeliveryCount > 10
        ? 'critical'
        : platformAlerts.length > 0 || notificationHealth.pendingEscalationCount > 5
          ? 'degraded'
          : 'healthy';

    return {
      summary: `${inboxItems.length} inbox item(s), ${alerts.length} active alert(s), ${deliveryJobs.filter((j) => j.status === 'queued').length} queued delivery job(s), ${platformAlerts.length} platform alert(s).`,
      platformConfig,
      notificationHealth,
      inboxItems,
      alerts,
      escalations,
      templates,
      deliveryJobs,
      rules,
      userPreferences,
      analytics,
      recentAlerts: platformAlerts.slice(0, 10),
      openAlertCount: platformAlerts.length,
      overallNotificationHealthStatus,
    };
  }

  async buildAuraContext(companyId: string): Promise<EnterpriseNotificationsAuraContext> {
    const dashboard = await this.getDashboard({ companyId, userId: '' });
    return {
      summary: dashboard.summary,
      activeAlertCount: dashboard.notificationHealth.activeAlertCount,
      failedDeliveryCount: dashboard.notificationHealth.failedDeliveryCount,
      pendingEscalationCount: dashboard.notificationHealth.pendingEscalationCount,
      openAlertCount: dashboard.openAlertCount,
      overallNotificationHealthStatus: dashboard.overallNotificationHealthStatus,
    };
  }

  async getPlatformConfig(companyId: string): Promise<NcPlatformConfigSummary> {
    return toPlatformConfigSummary(await this.ensurePlatformConfig(companyId));
  }

  async updatePlatformConfig(scope: StaffScope, input: UpdateNcPlatformConfigRequest): Promise<NcPlatformConfigSummary> {
    const existing = await this.ensurePlatformConfig(scope.companyId);
    const [updated] = await this.deps.db
      .update(ncPlatformConfig)
      .set({
        deliveryPolicy: input.deliveryPolicy ?? existing.deliveryPolicy,
        escalationPolicy: input.escalationPolicy ?? existing.escalationPolicy,
        quietHoursPolicy: input.quietHoursPolicy ?? existing.quietHoursPolicy,
        alertLevelConfig: input.alertLevelConfig ?? existing.alertLevelConfig,
        auditRetentionDays: input.auditRetentionDays ?? existing.auditRetentionDays,
        updatedAt: new Date(),
      })
      .where(eq(ncPlatformConfig.companyId, scope.companyId))
      .returning();
    await this.logAudit(scope, 'update_platform_config', 'nc_platform_config', updated?.id);
    return toPlatformConfigSummary(updated ?? existing);
  }

  async listInboxItems(scope: StaffScope): Promise<NcInboxItemSummary[]> {
    const notifications = await this.deps.notificationService.listForStaff({
      companyId: scope.companyId,
      userId: scope.userId,
    });

    const states = await this.deps.db.query.ncInboxState.findMany({
      where: and(eq(ncInboxState.companyId, scope.companyId), eq(ncInboxState.userId, scope.userId)),
    });
    const stateByNotificationId = new Map(states.map((s) => [s.notificationId, s]));

    return notifications.map((n) => {
      const state = stateByNotificationId.get(n.id);
      return {
        id: n.id,
        notificationType: n.notificationType,
        title: n.title,
        body: n.body,
        entityType: n.entityType,
        entityId: n.entityId,
        isRead: n.isRead,
        isPinned: state?.isPinned ?? false,
        isArchived: state?.isArchived ?? false,
        snoozedUntil: state?.snoozedUntil?.toISOString() ?? null,
        createdAt: n.createdAt,
      };
    });
  }

  async updateInboxState(scope: StaffScope, input: UpdateNcInboxStateRequest): Promise<NcInboxItemSummary[]> {
    const existing = await this.deps.db.query.ncInboxState.findFirst({
      where: and(
        eq(ncInboxState.companyId, scope.companyId),
        eq(ncInboxState.userId, scope.userId),
        eq(ncInboxState.notificationId, input.notificationId),
      ),
    });

    if (existing) {
      await this.deps.db
        .update(ncInboxState)
        .set({
          isPinned: input.isPinned ?? existing.isPinned,
          isArchived: input.isArchived ?? existing.isArchived,
          snoozedUntil: input.snoozedUntil === undefined ? existing.snoozedUntil : input.snoozedUntil ? new Date(input.snoozedUntil) : null,
          updatedAt: new Date(),
        })
        .where(eq(ncInboxState.id, existing.id));
    } else {
      await this.deps.db.insert(ncInboxState).values({
        companyId: scope.companyId,
        userId: scope.userId,
        notificationId: input.notificationId,
        isPinned: input.isPinned ?? false,
        isArchived: input.isArchived ?? false,
        snoozedUntil: input.snoozedUntil ? new Date(input.snoozedUntil) : null,
      });
    }

    await this.logAudit(scope, 'update_inbox_state', 'nc_inbox_state', input.notificationId);
    return this.listInboxItems(scope);
  }

  async markAllRead(scope: StaffScope): Promise<NcInboxItemSummary[]> {
    const items = await this.listInboxItems(scope);
    for (const item of items) {
      if (!item.isRead) {
        await this.deps.notificationService.markReadStaff(
          { companyId: scope.companyId, userId: scope.userId },
          item.id,
        );
      }
    }
    await this.logAudit(scope, 'mark_all_read', 'notifications');
    return this.listInboxItems(scope);
  }

  async listRules(companyId: string): Promise<NcNotificationRuleSummary[]> {
    const rows = await this.deps.db.query.ncNotificationRules.findMany({
      where: eq(ncNotificationRules.companyId, companyId),
      orderBy: [desc(ncNotificationRules.priority), desc(ncNotificationRules.createdAt)],
      limit: 200,
    });
    return rows.map(toRuleSummary);
  }

  async createRule(scope: StaffScope, input: CreateNcNotificationRuleRequest): Promise<NcNotificationRuleSummary> {
    const [created] = await this.deps.db
      .insert(ncNotificationRules)
      .values({
        companyId: scope.companyId,
        name: input.name.trim(),
        scope: input.scope ?? 'company',
        scopeRefId: input.scopeRefId ?? null,
        moduleSource: input.moduleSource ?? null,
        eventType: input.eventType?.trim() ?? null,
        severity: input.severity ?? null,
        deliveryMode: input.deliveryMode ?? 'immediate',
        channels: input.channels ?? ['in_app'],
        quietHoursEnabled: input.quietHoursEnabled ?? false,
        digestEnabled: input.digestEnabled ?? false,
        priority: input.priority ?? 0,
        conditions: input.conditions ?? {},
      })
      .returning();
    if (!created) throw new EnterpriseNotificationsError('CREATE_FAILED', 'Unable to create notification rule');
    await this.logAudit(scope, 'create_rule', 'nc_notification_rules', created.id);
    return toRuleSummary(created);
  }

  async listUserPreferences(scope: StaffScope): Promise<NcUserPreferenceSummary[]> {
    const rows = await this.deps.db.query.ncUserPreferences.findMany({
      where: and(eq(ncUserPreferences.companyId, scope.companyId), eq(ncUserPreferences.userId, scope.userId)),
    });
    return rows.map(toUserPreferenceSummary);
  }

  async updateUserPreference(
    scope: StaffScope,
    input: UpdateNcUserPreferenceRequest,
  ): Promise<NcUserPreferenceSummary[]> {
    const existing = await this.deps.db.query.ncUserPreferences.findFirst({
      where: and(
        eq(ncUserPreferences.companyId, scope.companyId),
        eq(ncUserPreferences.userId, scope.userId),
        eq(ncUserPreferences.channel, input.channel),
      ),
    });

    if (existing) {
      await this.deps.db
        .update(ncUserPreferences)
        .set({
          moduleSource: input.moduleSource ?? existing.moduleSource,
          eventType: input.eventType ?? existing.eventType,
          enabled: input.enabled ?? existing.enabled,
          deliveryMode: input.deliveryMode ?? existing.deliveryMode,
          quietHoursEnabled: input.quietHoursEnabled ?? existing.quietHoursEnabled,
          updatedAt: new Date(),
        })
        .where(eq(ncUserPreferences.id, existing.id));
    } else {
      await this.deps.db.insert(ncUserPreferences).values({
        companyId: scope.companyId,
        userId: scope.userId,
        channel: input.channel,
        moduleSource: input.moduleSource ?? null,
        eventType: input.eventType ?? null,
        enabled: input.enabled ?? true,
        deliveryMode: input.deliveryMode ?? 'immediate',
        quietHoursEnabled: input.quietHoursEnabled ?? false,
      });
    }

    await this.logAudit(scope, 'update_user_preference', 'nc_user_preferences');
    return this.listUserPreferences(scope);
  }

  createAlert(scope: StaffScope, input: CreateNcAlertRequest) {
    return this.alertService.createAlert(scope, input);
  }

  acknowledgeAlert(scope: StaffScope, alertId: string) {
    return this.alertService.acknowledgeAlert(scope, alertId);
  }

  resolveAlert(scope: StaffScope, alertId: string) {
    return this.alertService.resolveAlert(scope, alertId);
  }

  listAlerts(companyId: string, options?: { status?: string }) {
    return this.alertService.listAlerts(companyId, options);
  }

  listEscalations(companyId: string, options?: { status?: string }) {
    return this.escalationService.listEscalations(companyId, options);
  }

  acknowledgeEscalation(scope: StaffScope, escalationId: string) {
    return this.escalationService.acknowledgeEscalation(scope, escalationId);
  }

  resolveEscalation(scope: StaffScope, escalationId: string) {
    return this.escalationService.resolveEscalation(scope, escalationId);
  }

  listTemplates(companyId: string) {
    return this.templateService.listTemplates(companyId);
  }

  createTemplate(scope: StaffScope, input: CreateNcNotificationTemplateRequest) {
    return this.templateService.createTemplate(scope, input);
  }

  previewTemplate(companyId: string, templateId: string, variables?: Record<string, string>) {
    return this.templateService.previewTemplateById(companyId, templateId, variables);
  }

  listDeliveryJobs(companyId: string, options?: { status?: string }) {
    return this.deliveryService.listDeliveryJobs(companyId, options);
  }

  listDeliveryEvents(companyId: string, deliveryJobId: string) {
    return this.deliveryService.listDeliveryEvents(companyId, deliveryJobId);
  }

  dispatchNotification(scope: StaffScope, input: DispatchNcNotificationRequest) {
    return this.deliveryService.dispatchNotification(scope, input);
  }

  async syncPlatformAlerts(scope: StaffScope): Promise<NcPlatformAlertSummary[]> {
    const deliveryJobs = await this.deliveryService.listDeliveryJobs(scope.companyId);
    const alerts = await this.alertService.listAlerts(scope.companyId, { status: 'open' });
    const escalations = await this.escalationService.listEscalations(scope.companyId, { status: 'pending' });
    const synced: NcPlatformAlertSummary[] = [];

    const failedDeliveries = deliveryJobs.filter((j) => j.status === 'failed');
    if (failedDeliveries.length > 0) {
      synced.push(
        await this.upsertPlatformAlert(scope.companyId, {
          alertType: 'failed_deliveries',
          severity: failedDeliveries.length > 10 ? 'critical' : 'warning',
          title: 'Failed notification deliveries',
          description: `${failedDeliveries.length} delivery job(s) failed.`,
        }),
      );
    }

    const queuedDeliveries = deliveryJobs.filter((j) => j.status === 'queued');
    if (queuedDeliveries.length > 20) {
      synced.push(
        await this.upsertPlatformAlert(scope.companyId, {
          alertType: 'delivery_backlog',
          severity: 'warning',
          title: 'Delivery queue backlog',
          description: `${queuedDeliveries.length} delivery job(s) queued.`,
        }),
      );
    }

    const criticalAlerts = alerts.filter((a) => a.alertLevel === 'critical' || a.alertLevel === 'emergency');
    if (criticalAlerts.length > 0) {
      synced.push(
        await this.upsertPlatformAlert(scope.companyId, {
          alertType: 'critical_incidents',
          severity: 'critical',
          title: 'Critical notification alerts',
          description: `${criticalAlerts.length} critical/emergency alert(s) open.`,
        }),
      );
    }

    if (escalations.length > 0) {
      synced.push(
        await this.upsertPlatformAlert(scope.companyId, {
          alertType: 'escalation_queue',
          severity: escalations.length > 5 ? 'warning' : 'info',
          title: 'Pending escalations',
          description: `${escalations.length} escalation(s) pending.`,
        }),
      );
    }

    await this.escalationService.processPendingEscalations(scope.companyId);
    await this.alertService.expireStaleAlerts(scope.companyId);
    await this.logAudit(scope, 'sync_platform_alerts', 'nc_platform_alerts');
    return synced;
  }

  async captureAnalytics(scope: StaffScope): Promise<NcAnalyticsSummary> {
    const dashboard = await this.getDashboard(scope);
    const [created] = await this.deps.db
      .insert(ncAnalyticsSnapshots)
      .values({
        companyId: scope.companyId,
        metrics: {
          notificationHealth: dashboard.notificationHealth,
          inboxCount: dashboard.inboxItems.length,
          templateCount: dashboard.templates.length,
          ruleCount: dashboard.rules.length,
          deliveryJobCount: dashboard.deliveryJobs.length,
          overallNotificationHealthStatus: dashboard.overallNotificationHealthStatus,
        },
      })
      .returning();
    if (!created) throw new EnterpriseNotificationsError('CREATE_FAILED', 'Unable to capture analytics');
    await this.logAudit(scope, 'capture_analytics', 'nc_analytics_snapshots', created.id);
    return toAnalyticsSummary(created);
  }

  async createActionDraft(scope: StaffScope, input: CreateNcActionDraftRequest): Promise<NcActionDraftSummary> {
    const [created] = await this.deps.db
      .insert(ncActionDrafts)
      .values({
        companyId: scope.companyId,
        draftType: input.draftType.trim(),
        title: input.title.trim(),
        content: input.content.trim(),
        sourceRecords: input.sourceRecords ?? {},
        aiGenerated: input.aiGenerated ?? false,
      })
      .returning();
    if (!created) throw new EnterpriseNotificationsError('CREATE_FAILED', 'Unable to create action draft');
    await this.logAudit(scope, 'create_action_draft', 'nc_action_drafts', created.id);
    return toActionDraftSummary(created);
  }

  async listActionDrafts(companyId: string): Promise<NcActionDraftSummary[]> {
    const rows = await this.deps.db.query.ncActionDrafts.findMany({
      where: eq(ncActionDrafts.companyId, companyId),
      orderBy: [desc(ncActionDrafts.createdAt)],
      limit: 100,
    });
    return rows.map(toActionDraftSummary);
  }

  async listAuditLogs(companyId: string): Promise<NcAuditLogSummary[]> {
    const rows = await this.deps.db.query.ncAuditLogs.findMany({
      where: eq(ncAuditLogs.companyId, companyId),
      orderBy: [desc(ncAuditLogs.createdAt)],
      limit: 200,
    });
    return rows.map(toAuditLogSummary);
  }

  async listPlatformAlerts(companyId: string, options?: { status?: string }): Promise<NcPlatformAlertSummary[]> {
    const rows = await this.deps.db.query.ncPlatformAlerts.findMany({
      where: options?.status
        ? and(
            eq(ncPlatformAlerts.companyId, companyId),
            eq(ncPlatformAlerts.status, options.status as typeof ncPlatformAlerts.status.enumValues[number]),
          )
        : eq(ncPlatformAlerts.companyId, companyId),
      orderBy: [desc(ncPlatformAlerts.createdAt)],
      limit: 100,
    });
    return rows.map(toPlatformAlertSummary);
  }

  private async ensurePlatformConfig(companyId: string) {
    const existing = await this.deps.db.query.ncPlatformConfig.findFirst({
      where: eq(ncPlatformConfig.companyId, companyId),
    });
    if (existing) return existing;

    const [created] = await this.deps.db
      .insert(ncPlatformConfig)
      .values({
        companyId,
        deliveryPolicy: { defaultChannels: ['in_app'] },
        escalationPolicy: { defaultEscalateAfterMinutes: 30 },
        quietHoursPolicy: { enabled: false },
        alertLevelConfig: {
          info: { color: '#3b82f6', icon: 'info' },
          success: { color: '#22c55e', icon: 'check' },
          warning: { color: '#f59e0b', icon: 'alert-triangle' },
          critical: { color: '#ef4444', icon: 'alert-circle' },
          emergency: { color: '#dc2626', icon: 'siren' },
        },
      })
      .returning();
    return created!;
  }

  private async upsertPlatformAlert(
    companyId: string,
    input: { alertType: string; severity: 'info' | 'warning' | 'critical'; title: string; description?: string },
  ): Promise<NcPlatformAlertSummary> {
    const existing = await this.deps.db.query.ncPlatformAlerts.findFirst({
      where: and(
        eq(ncPlatformAlerts.companyId, companyId),
        eq(ncPlatformAlerts.alertType, input.alertType),
        eq(ncPlatformAlerts.status, 'open'),
      ),
    });

    if (existing) {
      const [updated] = await this.deps.db
        .update(ncPlatformAlerts)
        .set({
          severity: input.severity,
          title: input.title,
          description: input.description ?? null,
          updatedAt: new Date(),
        })
        .where(eq(ncPlatformAlerts.id, existing.id))
        .returning();
      return toPlatformAlertSummary(updated ?? existing);
    }

    const [created] = await this.deps.db
      .insert(ncPlatformAlerts)
      .values({
        companyId,
        alertType: input.alertType,
        severity: input.severity,
        title: input.title,
        description: input.description ?? null,
      })
      .returning();
    return toPlatformAlertSummary(created!);
  }

  private buildNotificationHealth(
    alerts: Awaited<ReturnType<EnterpriseNotificationAlertService['listAlerts']>>,
    deliveryJobs: Awaited<ReturnType<EnterpriseNotificationDeliveryService['listDeliveryJobs']>>,
    escalations: Awaited<ReturnType<EnterpriseNotificationEscalationService['listEscalations']>>,
    platformAlerts: NcPlatformAlertSummary[],
  ): NcNotificationHealthSummary {
    return {
      activeAlertCount: alerts.length,
      criticalAlertCount: alerts.filter((a) => a.alertLevel === 'critical' || a.alertLevel === 'emergency').length,
      failedDeliveryCount: deliveryJobs.filter((j) => j.status === 'failed').length,
      queuedDeliveryCount: deliveryJobs.filter((j) => j.status === 'queued').length,
      pendingEscalationCount: escalations.length,
      openPlatformAlertCount: platformAlerts.length,
    };
  }

  private async getLatestAnalytics(companyId: string): Promise<NcAnalyticsSummary | null> {
    const row = await this.deps.db.query.ncAnalyticsSnapshots.findFirst({
      where: eq(ncAnalyticsSnapshots.companyId, companyId),
      orderBy: [desc(ncAnalyticsSnapshots.capturedAt)],
    });
    return row ? toAnalyticsSummary(row) : null;
  }

  private async logAudit(
    scope: StaffScope,
    actionType: string,
    entityType?: string,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.deps.db.insert(ncAuditLogs).values({
      companyId: scope.companyId,
      userId: scope.userId,
      actionType,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      metadata: metadata ?? {},
    });
  }
}

function toPlatformConfigSummary(row: typeof ncPlatformConfig.$inferSelect): NcPlatformConfigSummary {
  return {
    deliveryPolicy: row.deliveryPolicy ?? {},
    escalationPolicy: row.escalationPolicy ?? {},
    quietHoursPolicy: row.quietHoursPolicy ?? {},
    alertLevelConfig: row.alertLevelConfig ?? {},
    auditRetentionDays: row.auditRetentionDays,
  };
}

function toRuleSummary(row: typeof ncNotificationRules.$inferSelect): NcNotificationRuleSummary {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    scopeRefId: row.scopeRefId,
    moduleSource: row.moduleSource,
    eventType: row.eventType,
    severity: row.severity,
    deliveryMode: row.deliveryMode,
    channels: (row.channels ?? []) as NcDeliveryChannel[],
    quietHoursEnabled: row.quietHoursEnabled,
    digestEnabled: row.digestEnabled,
    isActive: row.isActive,
    priority: row.priority,
    createdAt: row.createdAt.toISOString(),
  };
}

function toUserPreferenceSummary(row: typeof ncUserPreferences.$inferSelect): NcUserPreferenceSummary {
  return {
    id: row.id,
    channel: row.channel,
    moduleSource: row.moduleSource,
    eventType: row.eventType,
    enabled: row.enabled,
    deliveryMode: row.deliveryMode,
    quietHoursEnabled: row.quietHoursEnabled,
  };
}

function toPlatformAlertSummary(row: typeof ncPlatformAlerts.$inferSelect): NcPlatformAlertSummary {
  return {
    id: row.id,
    alertType: row.alertType,
    severity: row.severity,
    status: row.status,
    title: row.title,
    description: row.description,
    deliveryJobId: row.deliveryJobId,
    alertId: row.alertId,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAnalyticsSummary(row: typeof ncAnalyticsSnapshots.$inferSelect): NcAnalyticsSummary {
  return {
    id: row.id,
    metrics: row.metrics ?? {},
    capturedAt: row.capturedAt.toISOString(),
  };
}

function toActionDraftSummary(row: typeof ncActionDrafts.$inferSelect): NcActionDraftSummary {
  return {
    id: row.id,
    draftType: row.draftType,
    title: row.title,
    content: row.content,
    aiGenerated: row.aiGenerated,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAuditLogSummary(row: typeof ncAuditLogs.$inferSelect): NcAuditLogSummary {
  return {
    id: row.id,
    actionType: row.actionType,
    entityType: row.entityType,
    entityId: row.entityId,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
  };
}
