import type { DatabaseClient } from '@titan/db';
import { jobs, ucDispatchNotifications, ucProviderAdapters } from '@titan/db';
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  assessDispatchCommunicationReadiness,
  buildDispatchCommunicationDraftBody,
  communicationHookToNotificationType,
  mapDualTrackToDispatcherStatus,
  mapDispatcherStepToCommunicationHook,
  mapWorkflowActionToCommunicationHook,
  type DispatchCommunicationHookType,
  type DispatchCommunicationReadiness,
  type UcProviderChannel,
} from '@titan/shared';
import type { EnterpriseUnifiedCommunicationsService } from './enterprise-unified-communications.service.js';

export type DispatchCommunicationScope = {
  companyId: string;
  userId: string;
};

/**
 * Dispatch CX communication readiness — WhatsApp / Email / SMS hooks.
 * Prepares drafts and queues only after explicit approval. Never auto-sends.
 */
export class DispatchCommunicationService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly ucService: EnterpriseUnifiedCommunicationsService,
  ) {}

  /**
   * Assess readiness for a job's current dual-track state (or a specific hook).
   * Does not insert queue rows.
   */
  async assessJobCommunicationReadiness(
    companyId: string,
    jobId: string,
    options?: { hookType?: DispatchCommunicationHookType },
  ): Promise<DispatchCommunicationReadiness | null> {
    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.companyId, companyId), eq(jobs.id, jobId)),
      with: { assignedUser: true, customer: true },
    });
    if (!job) return null;

    const step = mapDualTrackToDispatcherStatus({
      status: job.status,
      executionPhase: job.executionPhase,
    });
    const hookType = options?.hookType ?? mapDispatcherStepToCommunicationHook(step);
    if (!hookType) {
      return null;
    }

    const activeChannels = await this.listActiveOutboundChannels(companyId);
    const recipient =
      job.snapshotSiteContactMobile?.trim() ||
      job.snapshotSiteContactEmail?.trim() ||
      null;
    const technicianName = job.assignedUser
      ? `${job.assignedUser.firstName} ${job.assignedUser.lastName}`.trim()
      : null;
    const customerName =
      job.snapshotCustomerName?.trim() || job.customer?.name?.trim() || 'Customer';
    const notificationType = communicationHookToNotificationType(hookType);

    const existing = await this.db.query.ucDispatchNotifications.findFirst({
      where: and(
        eq(ucDispatchNotifications.companyId, companyId),
        eq(ucDispatchNotifications.jobId, jobId),
        eq(ucDispatchNotifications.notificationType, notificationType),
        inArray(ucDispatchNotifications.status, ['pending', 'sent']),
      ),
      orderBy: [desc(ucDispatchNotifications.createdAt)],
      columns: { id: true },
    });

    const etaLabel = job.scheduledAt
      ? `Planned window ${job.scheduledAt.toLocaleString([], {
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })}`
      : null;

    return assessDispatchCommunicationReadiness({
      hookType,
      customerName,
      jobTitle: job.title,
      technicianName,
      scheduledAt: job.scheduledAt?.toISOString() ?? null,
      etaLabel,
      recipientAddress: recipient,
      activeChannels,
      alreadyQueued: Boolean(existing),
    });
  }

  /**
   * Readiness assessment after a workflow action — for hooks only.
   * Does not queue or send.
   */
  assessWorkflowActionHook(action: string): DispatchCommunicationHookType | null {
    return mapWorkflowActionToCommunicationHook(action);
  }

  /**
   * Build an in-memory draft for review. Does not persist or send.
   */
  async prepareDraft(
    companyId: string,
    jobId: string,
    hookType: DispatchCommunicationHookType,
  ): Promise<DispatchCommunicationReadiness | null> {
    return this.assessJobCommunicationReadiness(companyId, jobId, { hookType });
  }

  /**
   * Explicit approve → queue into UC dispatch-notifications (pending/skipped).
   * Adapter gates still apply; no fake send.
   */
  async queueApprovedDraft(
    scope: DispatchCommunicationScope,
    input: {
      jobId: string;
      hookType: DispatchCommunicationHookType;
      channel?: UcProviderChannel;
      recipientAddress?: string;
      messageBody?: string;
      etaMinutes?: number;
    },
  ) {
    const readiness = await this.assessJobCommunicationReadiness(scope.companyId, input.jobId, {
      hookType: input.hookType,
    });
    if (!readiness || readiness.state === 'not_applicable') {
      throw new DispatchCommunicationError(
        'NOT_APPLICABLE',
        'No dispatch communication hook applies for this job state',
      );
    }
    if (readiness.state === 'already_queued') {
      throw new DispatchCommunicationError(
        'ALREADY_QUEUED',
        'A notification of this type is already pending or sent',
      );
    }

    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.companyId, scope.companyId), eq(jobs.id, input.jobId)),
      columns: { customerId: true },
    });
    if (!job) {
      throw new DispatchCommunicationError('JOB_NOT_FOUND', 'Job not found');
    }

    const channel = input.channel ?? readiness.preferredChannel ?? undefined;
    const recipient = input.recipientAddress ?? readiness.recipientAddress ?? undefined;
    const messageBody =
      input.messageBody ??
      readiness.draftMessageBody ??
      buildDispatchCommunicationDraftBody({
        hookType: input.hookType,
        customerName: 'Customer',
        jobTitle: 'Job',
        technicianName: null,
        scheduledAt: null,
        etaLabel: null,
      });

    return this.ucService.queueDispatchNotification(scope, {
      jobId: input.jobId,
      customerId: job.customerId,
      notificationType: communicationHookToNotificationType(input.hookType),
      channel,
      recipientAddress: recipient,
      messageBody,
      etaMinutes: input.etaMinutes,
    });
  }

  private async listActiveOutboundChannels(companyId: string): Promise<UcProviderChannel[]> {
    const rows = await this.db.query.ucProviderAdapters.findMany({
      where: and(
        eq(ucProviderAdapters.companyId, companyId),
        eq(ucProviderAdapters.status, 'active'),
        inArray(ucProviderAdapters.channel, ['whatsapp', 'sms', 'email']),
      ),
      columns: { channel: true },
    });
    return rows.map((row) => row.channel as UcProviderChannel);
  }
}

export class DispatchCommunicationError extends Error {
  constructor(
    readonly code: 'NOT_APPLICABLE' | 'ALREADY_QUEUED' | 'JOB_NOT_FOUND' | 'VALIDATION_ERROR',
    message: string,
  ) {
    super(message);
    this.name = 'DispatchCommunicationError';
  }
}
