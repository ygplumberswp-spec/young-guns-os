import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { isTechnicianRole } from '@titan/auth';
import type {
  CommunicationChannel,
  CommunicationDeliveryState,
  CommunicationSummary,
  CommunicationsStats,
  CommunicationVisibility,
  CreateCommunicationRequest,
  CreateMessageTemplateRequest,
  MessageTemplateSummary,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  communications,
  customers,
  integrationConnections,
  jobs,
  messageTemplates,
  users,
} from '@titan/db';
import { emitBusinessEvent } from '../lib/automation-events.js';
import {
  getJobIdsForUserIncludingCrew,
  userHasJobAccess,
} from './job-execution.service.js';
import type { ResendEmailService } from './resend-email.service.js';
import { ResendEmailError } from './resend-email.service.js';

export class CommunicationsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CommunicationsError';
  }
}

/** Marker stored in failureReason after Owner approves an outbound email request. */
const RESEND_APPROVED_MARKER = 'Approved — ready to execute via Resend';

export type AuraCommunicationsContext = {
  messageCount: number;
  templateCount: number;
  recentMessages: Array<{
    id: string;
    customerName: string;
    channel: string;
    direction: string;
    subject: string | null;
    bodyPreview: string;
    authorName: string;
    occurredAt: string;
  }>;
  templates: Array<{
    id: string;
    name: string;
    channel: string;
  }>;
  focusedCustomerMessages: Array<{
    channel: string;
    direction: string;
    subject: string | null;
    bodyPreview: string;
    authorName: string;
    occurredAt: string;
  }> | null;
};

type TenantScope = {
  companyId: string;
  userId: string;
  roleName?: string;
  permissions?: string[];
};

export class CommunicationsService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly resendEmailService?: ResendEmailService,
  ) {}

  async listMessages(scope: TenantScope | string): Promise<CommunicationSummary[]> {
    const companyId = typeof scope === 'string' ? scope : scope.companyId;
    const technicianScoped =
      typeof scope !== 'string' &&
      Boolean(scope.roleName) &&
      isTechnicianRole({
        roleName: scope.roleName!,
        permissions: scope.permissions ?? [],
      });

    let whereClause = eq(communications.companyId, companyId);

    if (technicianScoped && typeof scope !== 'string') {
      const jobIds = await getJobIdsForUserIncludingCrew(this.db, companyId, scope.userId);
      if (jobIds.length === 0) {
        return [];
      }

      const assignedJobs = await this.db.query.jobs.findMany({
        where: and(eq(jobs.companyId, companyId), inArray(jobs.id, jobIds)),
        columns: { id: true, customerId: true },
      });
      const customerIds = Array.from(
        new Set(assignedJobs.map((job) => job.customerId).filter(Boolean)),
      ) as string[];

      whereClause = and(
        eq(communications.companyId, companyId),
        or(
          inArray(communications.jobId, jobIds),
          customerIds.length > 0 ? inArray(communications.customerId, customerIds) : sql`false`,
        ),
      )!;
    }

    const rows = await this.db.query.communications.findMany({
      where: whereClause,
      with: { customer: true, author: true, template: true, job: true },
      orderBy: [desc(communications.occurredAt)],
    });

    return rows.map((row) => toCommunicationSummary(row));
  }

  async listTemplates(companyId: string): Promise<MessageTemplateSummary[]> {
    const rows = await this.db.query.messageTemplates.findMany({
      where: eq(messageTemplates.companyId, companyId),
      orderBy: [desc(messageTemplates.updatedAt)],
    });

    return rows.map(toTemplateSummary);
  }

  async createMessage(
    scope: TenantScope,
    input: CreateCommunicationRequest,
  ): Promise<CommunicationSummary> {
    const body = input.body.trim();

    if (!body) {
      throw new CommunicationsError('VALIDATION_ERROR', 'Message body is required');
    }

    const clientActionId = input.clientActionId?.trim() || null;

    if (clientActionId) {
      const existing = await this.db.query.communications.findFirst({
        where: and(
          eq(communications.companyId, scope.companyId),
          eq(communications.clientActionId, clientActionId),
        ),
        with: { customer: true, author: true, template: true, job: true },
      });

      if (existing) {
        return toCommunicationSummary(existing, { idempotentReplay: true });
      }
    }

    await this.ensureCustomerBelongsToCompany(scope.companyId, input.customerId);

    if (input.templateId) {
      await this.ensureTemplateBelongsToCompany(scope.companyId, input.templateId);
    }

    if (input.jobId) {
      await this.ensureJobBelongsToCompany(scope.companyId, input.jobId);
    }

    const technicianScoped =
      Boolean(scope.roleName) &&
      isTechnicianRole({
        roleName: scope.roleName!,
        permissions: scope.permissions ?? [],
      });

    if (technicianScoped) {
      if (!input.jobId) {
        throw new CommunicationsError(
          'VALIDATION_ERROR',
          'Technicians must link communications to an assigned job',
        );
      }
      const allowed = await userHasJobAccess(
        this.db,
        scope.companyId,
        input.jobId,
        scope.userId,
      );
      if (!allowed) {
        throw new CommunicationsError(
          'FORBIDDEN',
          'Technicians may only communicate on assigned jobs',
        );
      }
    }

    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();

    if (Number.isNaN(occurredAt.getTime())) {
      throw new CommunicationsError('VALIDATION_ERROR', 'Invalid occurred date');
    }

    const channel: CommunicationChannel = input.channel ?? 'note';
    const direction = input.direction ?? 'outbound';
    const visibility = resolveVisibility(channel, direction, input.visibility);
    const { deliveryState, failureReason } = await this.resolveDeliveryOutcome(
      scope.companyId,
      channel,
      visibility,
    );

    const [created] = await this.db
      .insert(communications)
      .values({
        companyId: scope.companyId,
        customerId: input.customerId,
        jobId: input.jobId ?? null,
        authorUserId: scope.userId,
        templateId: input.templateId ?? null,
        channel,
        direction,
        visibility,
        deliveryState,
        subject: normalizeOptionalText(input.subject),
        body,
        failureReason,
        clientActionId,
        occurredAt,
      })
      .returning();

    if (!created) {
      throw new CommunicationsError('CREATE_FAILED', 'Unable to create communication record');
    }

    const row = await this.db.query.communications.findFirst({
      where: eq(communications.id, created.id),
      with: { customer: true, author: true, template: true, job: true },
    });

    if (!row) {
      throw new CommunicationsError('CREATE_FAILED', 'Unable to load communication record');
    }

    if (direction === 'inbound') {
      emitBusinessEvent({
        companyId: scope.companyId,
        eventType: 'communication.received',
        entityType: 'communication',
        entityId: row.id,
        payload: {
          communicationId: row.id,
          customerId: row.customerId,
          customerName: row.customer?.name ?? null,
          channel: row.channel,
          subject: row.subject,
        },
        actorUserId: scope.userId,
      });
    }

    return toCommunicationSummary(row);
  }

  /**
   * Owner approve step for outbound email requests (draft → approve → execute).
   * Does not send — executeOutboundEmail performs the Resend dispatch.
   */
  async approveOutboundEmail(
    scope: TenantScope,
    messageId: string,
  ): Promise<CommunicationSummary> {
    this.assertCanApproveOrExecute(scope);

    const row = await this.loadOutboundEmailRequest(scope.companyId, messageId);

    if (row.deliveryState !== 'requested') {
      throw new CommunicationsError(
        'INVALID_STATE',
        `Cannot approve a message in delivery state "${row.deliveryState}"`,
      );
    }

    const [updated] = await this.db
      .update(communications)
      .set({
        failureReason: RESEND_APPROVED_MARKER,
        updatedAt: new Date(),
      })
      .where(and(eq(communications.id, row.id), eq(communications.companyId, scope.companyId)))
      .returning();

    if (!updated) {
      throw new CommunicationsError('UPDATE_FAILED', 'Unable to approve outbound email');
    }

    const loaded = await this.db.query.communications.findFirst({
      where: eq(communications.id, updated.id),
      with: { customer: true, author: true, template: true, job: true },
    });
    if (!loaded) {
      throw new CommunicationsError('UPDATE_FAILED', 'Unable to load approved message');
    }
    return toCommunicationSummary(loaded);
  }

  /**
   * Execute an approved outbound email via Resend.
   * Requires EMAIL_SENDING_ENABLED + connected Resend + prior approve.
   */
  async executeOutboundEmail(
    scope: TenantScope,
    messageId: string,
  ): Promise<CommunicationSummary> {
    this.assertCanApproveOrExecute(scope);

    if (!this.resendEmailService) {
      throw new CommunicationsError(
        'NOT_CONFIGURED',
        'Resend email delivery is not configured on this API instance',
      );
    }

    const row = await this.loadOutboundEmailRequest(scope.companyId, messageId);

    if (row.deliveryState !== 'requested') {
      throw new CommunicationsError(
        'INVALID_STATE',
        `Cannot execute a message in delivery state "${row.deliveryState}"`,
      );
    }

    if (row.failureReason !== RESEND_APPROVED_MARKER) {
      throw new CommunicationsError(
        'NOT_APPROVED',
        'Outbound email must be approved before execute (approve → execute)',
      );
    }

    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, row.customerId), eq(customers.companyId, scope.companyId)),
    });
    const toEmail = customer?.email?.trim().toLowerCase() ?? '';
    if (!toEmail) {
      throw new CommunicationsError(
        'VALIDATION_ERROR',
        'Customer has no email address — cannot execute Resend delivery',
      );
    }

    try {
      await this.resendEmailService.sendTransactionalEmail({
        companyId: scope.companyId,
        purpose: 'outbound_message',
        toEmail,
        subject: row.subject?.trim() || 'Message from TITAN',
        text: row.body,
        html: `<p>${escapeHtml(row.body).replace(/\n/g, '<br/>')}</p>`,
        communicationId: row.id,
        actorUserId: scope.userId,
        idempotencyKey: `comm-${row.id}`,
      });
    } catch (error) {
      if (error instanceof ResendEmailError) {
        throw new CommunicationsError(error.code, error.message);
      }
      throw error;
    }

    const loaded = await this.db.query.communications.findFirst({
      where: eq(communications.id, row.id),
      with: { customer: true, author: true, template: true, job: true },
    });
    if (!loaded) {
      throw new CommunicationsError('EXECUTE_FAILED', 'Unable to load executed message');
    }
    return toCommunicationSummary(loaded);
  }

  async createTemplate(
    companyId: string,
    input: CreateMessageTemplateRequest,
  ): Promise<MessageTemplateSummary> {
    const name = input.name.trim();
    const body = input.body.trim();

    if (!name) {
      throw new CommunicationsError('VALIDATION_ERROR', 'Template name is required');
    }

    if (!body) {
      throw new CommunicationsError('VALIDATION_ERROR', 'Template body is required');
    }

    const [created] = await this.db
      .insert(messageTemplates)
      .values({
        companyId,
        name,
        channel: input.channel ?? 'note',
        subject: normalizeOptionalText(input.subject),
        body,
      })
      .returning();

    if (!created) {
      throw new CommunicationsError('CREATE_FAILED', 'Unable to create message template');
    }

    return toTemplateSummary(created);
  }

  async getStats(companyId: string): Promise<CommunicationsStats> {
    const [messageCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(communications)
      .where(eq(communications.companyId, companyId));

    const [templateCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(messageTemplates)
      .where(eq(messageTemplates.companyId, companyId));

    return {
      messageCount: messageCountRow?.count ?? 0,
      templateCount: templateCountRow?.count ?? 0,
    };
  }

  async buildAuraContext(
    companyId: string,
    customerId?: string,
  ): Promise<AuraCommunicationsContext> {
    const stats = await this.getStats(companyId);

    const messageRows = await this.db.query.communications.findMany({
      where: eq(communications.companyId, companyId),
      with: { customer: true, author: true },
      orderBy: [desc(communications.occurredAt)],
      limit: 15,
    });

    const templateRows = await this.db.query.messageTemplates.findMany({
      where: eq(messageTemplates.companyId, companyId),
      orderBy: [desc(messageTemplates.updatedAt)],
      limit: 10,
    });

    let focusedCustomerMessages: AuraCommunicationsContext['focusedCustomerMessages'] = null;

    if (customerId) {
      const focusedRows = await this.db.query.communications.findMany({
        where: and(
          eq(communications.companyId, companyId),
          eq(communications.customerId, customerId),
        ),
        with: { author: true },
        orderBy: [desc(communications.occurredAt)],
        limit: 10,
      });

      if (focusedRows.length > 0) {
        focusedCustomerMessages = focusedRows.map((row) => ({
          channel: row.channel,
          direction: row.direction,
          subject: row.subject,
          bodyPreview: previewBody(row.body),
          authorName: formatAuthorName(row.author),
          occurredAt: row.occurredAt.toISOString(),
        }));
      }
    }

    return {
      messageCount: stats.messageCount,
      templateCount: stats.templateCount,
      recentMessages: messageRows.map((row) => ({
        id: row.id,
        customerName: row.customer?.name ?? 'Unknown',
        channel: row.channel,
        direction: row.direction,
        subject: row.subject,
        bodyPreview: previewBody(row.body),
        authorName: formatAuthorName(row.author),
        occurredAt: row.occurredAt.toISOString(),
      })),
      templates: templateRows.map((row) => ({
        id: row.id,
        name: row.name,
        channel: row.channel,
      })),
      focusedCustomerMessages,
    };
  }

  private async ensureCustomerBelongsToCompany(companyId: string, customerId: string) {
    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.companyId, companyId)),
    });

    if (!customer) {
      throw new CommunicationsError('CUSTOMER_NOT_FOUND', 'Customer not found');
    }
  }

  private async ensureTemplateBelongsToCompany(companyId: string, templateId: string) {
    const template = await this.db.query.messageTemplates.findFirst({
      where: and(eq(messageTemplates.id, templateId), eq(messageTemplates.companyId, companyId)),
    });

    if (!template) {
      throw new CommunicationsError('TEMPLATE_NOT_FOUND', 'Message template not found');
    }
  }

  private async ensureJobBelongsToCompany(companyId: string, jobId: string) {
    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, companyId)),
    });

    if (!job) {
      throw new CommunicationsError('JOB_NOT_FOUND', 'Job not found');
    }
  }

  private async resolveDeliveryOutcome(
    companyId: string,
    channel: CommunicationChannel,
    visibility: CommunicationVisibility,
  ) {
    let resendConnected = false;
    if (channel === 'email') {
      const connection = await this.db.query.integrationConnections.findFirst({
        where: and(
          eq(integrationConnections.companyId, companyId),
          eq(integrationConnections.provider, 'resend'),
        ),
      });
      resendConnected =
        connection?.status === 'connected' && Boolean(connection.credentialsEncrypted);
    }

    return resolveDeliveryOutcomeStatic(channel, visibility, {
      resendConnected,
      emailSendingEnabled: this.resendEmailService?.isEmailSendingEnabled() ?? false,
    });
  }

  private assertCanApproveOrExecute(scope: TenantScope) {
    const isTechnician =
      Boolean(scope.roleName) &&
      isTechnicianRole({
        roleName: scope.roleName!,
        permissions: scope.permissions ?? [],
      });

    if (isTechnician) {
      throw new CommunicationsError(
        'FORBIDDEN',
        'Technicians cannot approve or execute outbound email sends',
      );
    }
  }

  private async loadOutboundEmailRequest(companyId: string, messageId: string) {
    const row = await this.db.query.communications.findFirst({
      where: and(eq(communications.id, messageId), eq(communications.companyId, companyId)),
    });

    if (!row) {
      throw new CommunicationsError('NOT_FOUND', 'Communication not found');
    }

    if (row.channel !== 'email' || row.visibility !== 'outbound_request') {
      throw new CommunicationsError(
        'INVALID_STATE',
        'Only outbound email requests can be approved or executed via Resend',
      );
    }

    return row;
  }
}

/**
 * Decision 4 / UX-G honesty defaults. Callers may pass an explicit
 * visibility; otherwise it is derived from channel/direction so a plain
 * internal note never silently becomes an "outbound request".
 */
function resolveVisibility(
  channel: CommunicationChannel,
  direction: 'inbound' | 'outbound',
  requested: CommunicationVisibility | null | undefined,
): CommunicationVisibility {
  if (requested) {
    return requested;
  }

  if (channel === 'note') {
    return 'internal_note';
  }

  if (direction === 'inbound') {
    return 'customer_visible';
  }

  return 'outbound_request';
}

/**
 * Decision 4 / UX-G comms honesty contract:
 * - internal_note / customer_visible are logged_only — never dispatched here.
 * - outbound_request stays requested until Owner approve → execute via Resend
 *   (when connected and EMAIL_SENDING_ENABLED). Creating a message never auto-sends.
 */
async function resolveDeliveryOutcomeStatic(
  channel: CommunicationChannel,
  visibility: CommunicationVisibility,
  options: {
    resendConnected: boolean;
    emailSendingEnabled: boolean;
  },
): Promise<{ deliveryState: CommunicationDeliveryState; failureReason: string | null }> {
  if (visibility === 'internal_note') {
    return { deliveryState: 'logged_only', failureReason: null };
  }

  if (visibility === 'customer_visible') {
    return { deliveryState: 'logged_only', failureReason: null };
  }

  if (channel === 'email') {
    if (options.resendConnected && options.emailSendingEnabled) {
      return {
        deliveryState: 'requested',
        failureReason:
          'Resend is connected — awaiting Owner approve → execute. TITAN has not sent this email yet.',
      };
    }
    if (options.resendConnected && !options.emailSendingEnabled) {
      return {
        deliveryState: 'requested',
        failureReason:
          'Resend is connected but EMAIL_SENDING_ENABLED is false — logged as requested only. TITAN did not send.',
      };
    }
    return {
      deliveryState: 'requested',
      failureReason:
        'No connected Resend provider — this send was logged as requested only. TITAN did not call a provider.',
    };
  }

  if (channel === 'sms') {
    return {
      deliveryState: 'requested',
      failureReason:
        'No connected SMS provider dispatch path exists yet — ' +
        'this send was logged as requested only. TITAN did not call a provider.',
    };
  }

  return {
    deliveryState: 'requested',
    failureReason: 'Logged as requested only — no automated dispatch has run for this channel.',
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toCommunicationSummary(
  row: typeof communications.$inferSelect & {
    customer: typeof customers.$inferSelect | null;
    author: typeof users.$inferSelect | null;
    template: typeof messageTemplates.$inferSelect | null;
    job?: typeof jobs.$inferSelect | null;
  },
  options?: { idempotentReplay?: boolean },
): CommunicationSummary {
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customer?.name ?? 'Unknown',
    jobId: row.jobId,
    jobNumber: row.job?.jobNumber ?? null,
    authorUserId: row.authorUserId,
    authorName: formatAuthorName(row.author),
    templateId: row.templateId,
    templateName: row.template?.name ?? null,
    channel: row.channel,
    direction: row.direction,
    visibility: row.visibility,
    deliveryState: row.deliveryState,
    subject: row.subject,
    body: row.body,
    failureReason: row.failureReason,
    clientActionId: row.clientActionId,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    ...(options?.idempotentReplay ? { idempotentReplay: true } : {}),
  };
}

function toTemplateSummary(row: typeof messageTemplates.$inferSelect): MessageTemplateSummary {
  return {
    id: row.id,
    name: row.name,
    channel: row.channel,
    subject: row.subject,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function formatAuthorName(author: typeof users.$inferSelect | null | undefined): string {
  if (!author) {
    return 'Unknown';
  }

  return `${author.firstName} ${author.lastName}`.trim();
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function previewBody(body: string, maxLength = 120): string {
  const trimmed = body.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength)}…`;
}
