import { and, desc, eq, sql } from 'drizzle-orm';
import type {
  CommunicationSummary,
  CommunicationsStats,
  CreateCommunicationRequest,
  CreateMessageTemplateRequest,
  MessageTemplateSummary,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { communications, customers, messageTemplates, users } from '@titan/db';
import { emitBusinessEvent } from '../lib/automation-events.js';

export class CommunicationsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CommunicationsError';
  }
}

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
};

export class CommunicationsService {
  constructor(private readonly db: DatabaseClient) {}

  async listMessages(companyId: string): Promise<CommunicationSummary[]> {
    const rows = await this.db.query.communications.findMany({
      where: eq(communications.companyId, companyId),
      with: { customer: true, author: true, template: true },
      orderBy: [desc(communications.occurredAt)],
    });

    return rows.map(toCommunicationSummary);
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

    await this.ensureCustomerBelongsToCompany(scope.companyId, input.customerId);

    if (input.templateId) {
      await this.ensureTemplateBelongsToCompany(scope.companyId, input.templateId);
    }

    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();

    if (Number.isNaN(occurredAt.getTime())) {
      throw new CommunicationsError('VALIDATION_ERROR', 'Invalid occurred date');
    }

    const [created] = await this.db
      .insert(communications)
      .values({
        companyId: scope.companyId,
        customerId: input.customerId,
        authorUserId: scope.userId,
        templateId: input.templateId ?? null,
        channel: input.channel ?? 'note',
        direction: input.direction ?? 'outbound',
        subject: normalizeOptionalText(input.subject),
        body,
        occurredAt,
      })
      .returning();

    if (!created) {
      throw new CommunicationsError('CREATE_FAILED', 'Unable to create communication record');
    }

    const row = await this.db.query.communications.findFirst({
      where: eq(communications.id, created.id),
      with: { customer: true, author: true, template: true },
    });

    if (!row) {
      throw new CommunicationsError('CREATE_FAILED', 'Unable to load communication record');
    }

    const direction = input.direction ?? 'outbound';
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
}

function toCommunicationSummary(
  row: typeof communications.$inferSelect & {
    customer: typeof customers.$inferSelect | null;
    author: typeof users.$inferSelect | null;
    template: typeof messageTemplates.$inferSelect | null;
  },
): CommunicationSummary {
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customer?.name ?? 'Unknown',
    authorUserId: row.authorUserId,
    authorName: formatAuthorName(row.author),
    templateId: row.templateId,
    templateName: row.template?.name ?? null,
    channel: row.channel,
    direction: row.direction,
    subject: row.subject,
    body: row.body,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
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
