import { and, desc, eq } from 'drizzle-orm';
import type {
  DispatchNcNotificationRequest,
  NcDeliveryChannel,
  NcDeliveryEventSummary,
  NcDeliveryJobSummary,
  NcModuleSource,
  NotificationType,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { ncDeliveryEvents, ncDeliveryJobs, ucProviderAdapters } from '@titan/db';
import type { NotificationService } from './notification.service.js';
import type { EnterpriseNotificationTemplateService } from './enterprise-notification-template.service.js';

type StaffScope = { companyId: string; userId: string };

const CHANNEL_TO_UC: Partial<Record<NcDeliveryChannel, string>> = {
  email: 'email',
  sms: 'sms',
  whatsapp: 'whatsapp',
  slack: 'slack',
  microsoft_teams: 'microsoft_teams',
};

export class EnterpriseNotificationDeliveryService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly notificationService: NotificationService,
    private readonly templateService: EnterpriseNotificationTemplateService,
  ) {}

  async listDeliveryJobs(companyId: string, options?: { status?: string }): Promise<NcDeliveryJobSummary[]> {
    const rows = await this.db.query.ncDeliveryJobs.findMany({
      where: options?.status
        ? and(
            eq(ncDeliveryJobs.companyId, companyId),
            eq(ncDeliveryJobs.status, options.status as typeof ncDeliveryJobs.status.enumValues[number]),
          )
        : eq(ncDeliveryJobs.companyId, companyId),
      orderBy: [desc(ncDeliveryJobs.createdAt)],
      limit: 200,
    });
    return rows.map(toDeliveryJobSummary);
  }

  async listDeliveryEvents(companyId: string, deliveryJobId: string): Promise<NcDeliveryEventSummary[]> {
    const rows = await this.db.query.ncDeliveryEvents.findMany({
      where: and(eq(ncDeliveryEvents.companyId, companyId), eq(ncDeliveryEvents.deliveryJobId, deliveryJobId)),
      orderBy: [desc(ncDeliveryEvents.occurredAt)],
      limit: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      deliveryJobId: row.deliveryJobId,
      eventType: row.eventType,
      status: row.status,
      occurredAt: row.occurredAt.toISOString(),
    }));
  }

  async dispatchNotification(
    scope: StaffScope,
    input: DispatchNcNotificationRequest,
  ): Promise<NcDeliveryJobSummary[]> {
    if (!input.moduleSource || !input.eventType || !input.title?.trim() || !input.body?.trim()) {
      throw new Error('Invalid notification dispatch — module, event, title, and body are required');
    }

    let title = input.title.trim();
    let body = input.body.trim();
    let templateId: string | null = null;

    if (input.templateKey) {
      const template = await this.templateService.getTemplateByKey(scope.companyId, input.templateKey);
      if (template) {
        const preview = this.templateService.previewTemplate(
          template.subjectTemplate,
          template.bodyTemplate,
          input.templateVariables ?? {},
        );
        title = preview.subject;
        body = preview.body;
        templateId = template.id;
      }
    }

    const channels = input.channels?.length ? input.channels : (['in_app'] as NcDeliveryChannel[]);
    const jobs: NcDeliveryJobSummary[] = [];

    for (const channel of channels) {
      const [job] = await this.db
        .insert(ncDeliveryJobs)
        .values({
          companyId: scope.companyId,
          recipientUserId: input.recipientUserId,
          templateId,
          channel,
          status: 'queued',
          moduleSource: input.moduleSource,
          eventType: input.eventType,
          title,
          body,
          metadata: {
            sourceEntityType: input.sourceEntityType ?? null,
            sourceEntityId: input.sourceEntityId ?? null,
            dispatchedByUserId: scope.userId,
          },
        })
        .returning();

      if (!job) continue;

      await this.recordDeliveryEvent(scope.companyId, job.id, 'queued', 'queued', {
        channel,
        moduleSource: input.moduleSource,
      });

      const result = await this.processDeliveryJob(scope, job.id, {
        channel,
        title,
        body,
        recipientUserId: input.recipientUserId,
        moduleSource: input.moduleSource,
        sourceEntityType: input.sourceEntityType,
        sourceEntityId: input.sourceEntityId,
      });

      jobs.push(result);
    }

    return jobs;
  }

  private async processDeliveryJob(
    scope: StaffScope,
    jobId: string,
    input: {
      channel: NcDeliveryChannel;
      title: string;
      body: string;
      recipientUserId: string;
      moduleSource: NcModuleSource;
      sourceEntityType?: string;
      sourceEntityId?: string;
    },
  ): Promise<NcDeliveryJobSummary> {
    if (input.channel === 'in_app') {
      const notification = await this.notificationService.createNotification({
        companyId: scope.companyId,
        recipientType: 'staff',
        recipientUserId: input.recipientUserId,
        notificationType: mapModuleToNotificationType(input.moduleSource),
        title: input.title,
        body: input.body,
        entityType: input.sourceEntityType,
        entityId: input.sourceEntityId,
      });

      const [updated] = await this.db
        .update(ncDeliveryJobs)
        .set({
          status: notification ? 'delivered' : 'failed',
          notificationId: notification?.id ?? null,
          deliveredAt: notification ? new Date() : null,
          failedAt: notification ? null : new Date(),
          errorMessage: notification ? null : 'Notification suppressed by user preferences',
          updatedAt: new Date(),
        })
        .where(and(eq(ncDeliveryJobs.id, jobId), eq(ncDeliveryJobs.companyId, scope.companyId)))
        .returning();

      await this.recordDeliveryEvent(
        scope.companyId,
        jobId,
        notification ? 'delivered' : 'failed',
        notification ? 'delivered' : 'failed',
        { channel: 'in_app' },
      );

      return toDeliveryJobSummary(updated!);
    }

    const ucChannel = CHANNEL_TO_UC[input.channel];
    let providerAdapterId: string | null = null;
    let status: typeof ncDeliveryJobs.status.enumValues[number] = 'failed';
    let errorMessage: string | null = null;

    if (ucChannel) {
      const adapter = await this.db.query.ucProviderAdapters.findFirst({
        where: and(
          eq(ucProviderAdapters.companyId, scope.companyId),
          eq(ucProviderAdapters.channel, ucChannel as typeof ucProviderAdapters.channel.enumValues[number]),
          eq(ucProviderAdapters.status, 'active'),
        ),
      });

      if (adapter) {
        providerAdapterId = adapter.id;
        status = 'queued';
        errorMessage = null;
      } else {
        errorMessage = `No active ${input.channel} provider adapter configured`;
      }
    } else {
      errorMessage = `No active ${input.channel} provider adapter configured`;
    }

    const [updated] = await this.db
      .update(ncDeliveryJobs)
      .set({
        status,
        providerAdapterId,
        failedAt: status === 'failed' ? new Date() : null,
        errorMessage,
        updatedAt: new Date(),
      })
      .where(and(eq(ncDeliveryJobs.id, jobId), eq(ncDeliveryJobs.companyId, scope.companyId)))
      .returning();

    await this.recordDeliveryEvent(scope.companyId, jobId, status, status, {
      channel: input.channel,
      providerAdapterId,
      errorMessage,
    });

    return toDeliveryJobSummary(updated!);
  }

  private async recordDeliveryEvent(
    companyId: string,
    deliveryJobId: string,
    eventType: string,
    status: typeof ncDeliveryJobs.status.enumValues[number],
    details: Record<string, unknown>,
  ) {
    await this.db.insert(ncDeliveryEvents).values({
      companyId,
      deliveryJobId,
      eventType,
      status,
      details,
    });
  }
}

function mapModuleToNotificationType(module: NcModuleSource): NotificationType {
  const mapping: Partial<Record<NcModuleSource, NotificationType>> = {
    jobs: 'job_update',
    quotes: 'quote_update',
    finance: 'invoice_reminder',
    scheduling: 'schedule_changed',
    dispatch: 'dispatch_alert',
    fleet: 'fleet_alert',
    inventory: 'inventory_request',
    security: 'security_alert',
    communications: 'comm_intel_alert',
    voice_reception: 'missed_call_alert',
    ai_agents: 'ai_orchestration_alert',
    mission_control: 'system_alert',
  };
  return mapping[module] ?? 'system_alert';
}

function toDeliveryJobSummary(row: typeof ncDeliveryJobs.$inferSelect): NcDeliveryJobSummary {
  return {
    id: row.id,
    alertId: row.alertId,
    notificationId: row.notificationId,
    recipientUserId: row.recipientUserId,
    channel: row.channel,
    status: row.status,
    moduleSource: row.moduleSource,
    eventType: row.eventType,
    title: row.title,
    scheduledFor: row.scheduledFor?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    failedAt: row.failedAt?.toISOString() ?? null,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
  };
}
