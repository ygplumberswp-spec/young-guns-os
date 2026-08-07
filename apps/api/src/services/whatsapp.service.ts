import { and, desc, eq, gt } from 'drizzle-orm';
import type {
  CreateWhatsappTemplateRequest,
  SaveWhatsappConnectionRequest,
  SendWhatsappMessageRequest,
  SendWhatsappTestMessageRequest,
  UpdateWhatsappTemplateRequest,
  WhatsappAutomationActionResult,
  WhatsappAutomationTriggerContext,
  WhatsappConnectionSummary,
  WhatsappConnectionTestResult,
  WhatsappMessageSummary,
  WhatsappStats,
  WhatsappTemplateCategory,
  WhatsappTemplateSummary,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  customers,
  securityAuditLogs,
  users,
  whatsappConnections,
  whatsappMessages,
  whatsappTemplates,
  workflows,
} from '@titan/db';
import {
  decryptWhatsappCredentials,
  encryptWhatsappCredentials,
  generateWebhookSecret,
} from '../lib/crypto.js';
import {
  parseIncomingWebhookMessages,
  parseWebhookDeliveryStatuses,
  redactWhatsappSecretMaterial,
  WhatsappClient,
  WhatsappError,
  type WhatsappWebhookPayload,
} from '../lib/whatsapp.client.js';
import type { IntegrationHubService } from './integration-hub.service.js';
import { emitBusinessEvent } from '../lib/automation-events.js';

export class WhatsappServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'WhatsappServiceError';
  }
}

export type AuraWhatsappContext = {
  connectionStatus: string;
  isConnected: boolean;
  displayPhoneNumber: string | null;
  featureEnabled: boolean;
  webhooksEnabled: boolean;
  outboundMessagesEnabled: boolean;
  runtimeNote: string | null;
  messageCount: number;
  incomingCount: number;
  outgoingCount: number;
  draftCount: number;
  pendingReplyCount: number;
  unmatchedInboundCount: number;
  templateCount: number;
  recentConversations: Array<{
    customerId: string | null;
    customerName: string | null;
    lastMessagePreview: string;
    direction: string;
    deliveryStatus: string;
    isDraft: boolean;
    occurredAt: string;
  }>;
  pendingReplies: Array<{
    customerId: string | null;
    customerName: string | null;
    messagePreview: string;
    receivedAt: string;
  }>;
  focusedCustomerMessages: Array<{
    direction: string;
    messagePreview: string;
    deliveryStatus: string;
    isDraft: boolean;
    occurredAt: string;
  }> | null;
  automationExamples: string[];
  /** AURA may summarise / draft only — never auto-send. */
  sendPolicy: {
    autoSendEnabled: false;
    draftApproveExecute: true;
  };
};

export type WhatsappInboundHubIndexInput = {
  companyId: string;
  externalMessageId: string;
  contactPhone: string;
  contactName: string | null;
  messagePreview: string;
  customerId: string | null;
  occurredAt: Date;
};

export type WhatsappInboundEnrichmentInput = {
  companyId: string;
  contactPhone: string;
  contactName: string | null;
  externalMessageId: string;
  customerId: string | null;
  messagePreview: string;
};

export type WhatsappRuntimeFlags = {
  whatsappEnabled: boolean;
  webhooksEnabled: boolean;
  outboundMessagesEnabled: boolean;
};

type TenantScope = {
  companyId: string;
  userId: string;
};

type WhatsappServiceDeps = {
  db: DatabaseClient;
  encryptionKey?: string;
  apiPublicUrl: string;
  hubService?: IntegrationHubService;
  runtime?: WhatsappRuntimeFlags;
  indexInboundMessage?: (input: WhatsappInboundHubIndexInput) => Promise<void>;
  recordInboundEnrichment?: (input: WhatsappInboundEnrichmentInput) => Promise<void>;
};

const NOTIFICATION_BODY_DEFAULTS: Record<WhatsappTemplateCategory, string> = {
  job_booked_confirmation:
    'Hi {{customer_name}}, your job "{{job_title}}" has been booked for {{scheduled_at}}.',
  technician_assigned:
    'Hi {{customer_name}}, {{technician_name}} has been assigned to your job "{{job_title}}".',
  technician_on_the_way:
    'Hi {{customer_name}}, your technician is on the way and expected to arrive {{eta}}.',
  job_completed:
    'Hi {{customer_name}}, your job "{{job_title}}" has been completed. Thank you for choosing us.',
  invoice_sent:
    'Hi {{customer_name}}, invoice {{invoice_number}} for {{amount}} has been sent. Due date: {{due_date}}.',
  payment_reminder:
    'Hi {{customer_name}}, this is a friendly reminder that invoice {{invoice_number}} for {{amount}} is overdue.',
  utility: 'Hi {{customer_name}}, {{message}}.',
  marketing: 'Hi {{customer_name}}, {{message}}.',
};

export class WhatsappService {
  private indexInboundMessage?: (input: WhatsappInboundHubIndexInput) => Promise<void>;
  private recordInboundEnrichment?: (input: WhatsappInboundEnrichmentInput) => Promise<void>;
  private runtime: WhatsappRuntimeFlags;

  constructor(
    private readonly db: DatabaseClient,
    private readonly encryptionKey?: string,
    private readonly apiPublicUrl?: string,
    private readonly hubService?: IntegrationHubService,
    runtime?: WhatsappRuntimeFlags,
    indexInboundMessage?: (input: WhatsappInboundHubIndexInput) => Promise<void>,
    recordInboundEnrichment?: (input: WhatsappInboundEnrichmentInput) => Promise<void>,
  ) {
    this.runtime = runtime ?? {
      whatsappEnabled: true,
      webhooksEnabled: true,
      outboundMessagesEnabled: true,
    };
    this.indexInboundMessage = indexInboundMessage;
    this.recordInboundEnrichment = recordInboundEnrichment;
  }

  static create(deps: WhatsappServiceDeps): WhatsappService {
    return new WhatsappService(
      deps.db,
      deps.encryptionKey,
      deps.apiPublicUrl,
      deps.hubService,
      deps.runtime,
      deps.indexInboundMessage,
      deps.recordInboundEnrichment,
    );
  }

  /** Wire Hub/enrichment after construction to avoid circular create order. */
  setInboundHooks(hooks: {
    indexInboundMessage?: (input: WhatsappInboundHubIndexInput) => Promise<void>;
    recordInboundEnrichment?: (input: WhatsappInboundEnrichmentInput) => Promise<void>;
  }): void {
    if (hooks.indexInboundMessage) this.indexInboundMessage = hooks.indexInboundMessage;
    if (hooks.recordInboundEnrichment) {
      this.recordInboundEnrichment = hooks.recordInboundEnrichment;
    }
  }

  getRuntimeFlags(): WhatsappRuntimeFlags {
    return this.runtime;
  }

  async getConnection(companyId: string): Promise<WhatsappConnectionSummary> {
    const connection = await this.getOrCreateConnection(companyId);

    return this.toConnectionSummary(connection);
  }

  /**
   * LIVE-001B — Safe read-only Test Connection.
   * Uses stored tenant credentials for ONE Meta GET on the phone number resource.
   * Never calls /messages, never mutates credentials, never requires outbound flag.
   */
  async testStoredConnection(
    companyId: string,
    actorUserId?: string,
  ): Promise<{ result: WhatsappConnectionTestResult; connection: WhatsappConnectionSummary }> {
    this.ensureWhatsappFeatureEnabled('connect');

    const connection = await this.requireConnectedConnection(companyId);
    const client = this.createClient(connection);

    try {
      const verified = await client.verifyConnection();

      const [updated] = await this.db
        .update(whatsappConnections)
        .set({
          status: 'connected',
          displayPhoneNumber: verified.displayPhoneNumber ?? connection.displayPhoneNumber,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(whatsappConnections.id, connection.id),
            eq(whatsappConnections.companyId, companyId),
          ),
        )
        .returning();

      await this.recordAudit(
        companyId,
        actorUserId,
        'whatsapp_business_test_connection',
        updated!.id,
        {
          phoneNumberId: connection.phoneNumberId,
          displayPhoneNumber: verified.displayPhoneNumber,
          verifiedName: verified.verifiedName,
          providerWritePerformed: false,
          outboundMessageSent: false,
        },
      );

      const result: WhatsappConnectionTestResult = {
        ok: true,
        status: 'connected',
        phoneNumberId: connection.phoneNumberId!,
        businessAccountId: connection.businessAccountId,
        displayPhoneNumber: verified.displayPhoneNumber,
        verifiedName: verified.verifiedName,
        providerWritePerformed: false,
        outboundMessageSent: false,
      };

      return { result, connection: this.toConnectionSummary(updated!) };
    } catch (error) {
      const code = error instanceof WhatsappError ? error.code : 'CONNECTION_FAILED';
      const rawMessage =
        error instanceof Error ? error.message : 'WhatsApp test connection failed';
      const message = redactWhatsappSecretMaterial(rawMessage);
      const status: WhatsappConnectionTestResult['status'] =
        code === 'RATE_LIMITED' || code === 'TIMEOUT' ? 'degraded' : 'error';

      await this.db
        .update(whatsappConnections)
        .set({
          // Keep credentials; mark degraded/error honestly for Operator UI.
          status: status === 'degraded' ? 'error' : 'error',
          lastError: message,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(whatsappConnections.id, connection.id),
            eq(whatsappConnections.companyId, companyId),
          ),
        );

      await this.recordAudit(
        companyId,
        actorUserId,
        'whatsapp_business_test_connection_failed',
        connection.id,
        {
          phoneNumberId: connection.phoneNumberId,
          code,
          providerWritePerformed: false,
          outboundMessageSent: false,
        },
      );

      throw new WhatsappServiceError(
        code === 'AUTH_EXPIRED' ||
          code === 'FORBIDDEN' ||
          code === 'RATE_LIMITED' ||
          code === 'TIMEOUT' ||
          code === 'PROVIDER_ERROR'
          ? code
          : 'CONNECTION_FAILED',
        message,
      );
    }
  }

  async saveConnection(
    companyId: string,
    input: SaveWhatsappConnectionRequest,
    actorUserId?: string,
  ): Promise<WhatsappConnectionSummary> {
    this.ensureWhatsappFeatureEnabled('connect');
    this.ensureEncryptionKey();

    const accessToken = input.accessToken?.trim() ?? '';
    const phoneNumberId = input.phoneNumberId.trim();
    const businessAccountId = input.businessAccountId.trim();

    if (!phoneNumberId || !businessAccountId) {
      throw new WhatsappServiceError(
        'VALIDATION_ERROR',
        'Phone number ID and business account ID are required',
      );
    }

    const connection = await this.getOrCreateConnection(companyId);

    if (!accessToken && !connection.credentialsEncrypted) {
      throw new WhatsappServiceError('VALIDATION_ERROR', 'Access token is required');
    }

    const resolvedAccessToken =
      accessToken ||
      (connection.credentialsEncrypted
        ? decryptWhatsappCredentials(connection.credentialsEncrypted, this.encryptionKey!)
            .accessToken
        : '');
    const webhookVerifyToken =
      input.webhookVerifyToken?.trim() || connection.webhookVerifyToken || generateWebhookSecret();

    await this.db
      .update(whatsappConnections)
      .set({
        status: 'pending',
        phoneNumberId,
        businessAccountId,
        webhookVerifyToken,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(whatsappConnections.id, connection.id));

    try {
      const client = new WhatsappClient({ accessToken: resolvedAccessToken, phoneNumberId });
      const verified = await client.verifyConnection();

      const [updated] = await this.db
        .update(whatsappConnections)
        .set({
          status: 'connected',
          credentialsEncrypted: encryptWhatsappCredentials(
            { accessToken: resolvedAccessToken },
            this.encryptionKey!,
          ),
          displayPhoneNumber: verified.displayPhoneNumber,
          connectedAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(whatsappConnections.id, connection.id))
        .returning();

      await this.recordAudit(companyId, actorUserId, 'whatsapp_business_connected', updated!.id, {
        phoneNumberId,
        businessAccountId,
        displayPhoneNumber: updated!.displayPhoneNumber,
      });

      return this.toConnectionSummary(updated!);
    } catch (error) {
      const message = redactWhatsappSecretMaterial(
        error instanceof WhatsappError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'WhatsApp connection failed',
      );

      await this.db
        .update(whatsappConnections)
        .set({
          status: 'error',
          lastError: message,
          updatedAt: new Date(),
        })
        .where(eq(whatsappConnections.id, connection.id));

      throw new WhatsappServiceError('CONNECTION_FAILED', message);
    }
  }

  async disconnect(companyId: string, actorUserId?: string): Promise<WhatsappConnectionSummary> {
    const connection = await this.getOrCreateConnection(companyId);

    const [updated] = await this.db
      .update(whatsappConnections)
      .set({
        status: 'disconnected',
        credentialsEncrypted: null,
        phoneNumberId: null,
        businessAccountId: null,
        displayPhoneNumber: null,
        lastError: null,
        connectedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(whatsappConnections.id, connection.id))
      .returning();

    await this.recordAudit(companyId, actorUserId, 'whatsapp_business_disconnected', connection.id, {
      previousStatus: connection.status,
    });

    return this.toConnectionSummary(updated!);
  }

  async getStats(companyId: string): Promise<WhatsappStats> {
    const messages = await this.db.query.whatsappMessages.findMany({
      where: eq(whatsappMessages.companyId, companyId),
    });

    const templates = await this.db.query.whatsappTemplates.findMany({
      where: eq(whatsappTemplates.companyId, companyId),
    });

    const incomingWithoutReply = await this.countPendingReplies(companyId);

    return {
      totalMessages: messages.length,
      incomingCount: messages.filter((message) => message.direction === 'incoming').length,
      outgoingCount: messages.filter((message) => message.direction === 'outgoing').length,
      draftCount: messages.filter((message) => message.isDraft).length,
      pendingReplyCount: incomingWithoutReply,
      templateCount: templates.length,
      approvedTemplateCount: templates.filter((template) => template.status === 'approved').length,
    };
  }

  async listTemplates(companyId: string): Promise<WhatsappTemplateSummary[]> {
    const rows = await this.db.query.whatsappTemplates.findMany({
      where: eq(whatsappTemplates.companyId, companyId),
      orderBy: [desc(whatsappTemplates.updatedAt)],
    });

    return rows.map(toTemplateSummary);
  }

  async createTemplate(
    companyId: string,
    input: CreateWhatsappTemplateRequest,
  ): Promise<WhatsappTemplateSummary> {
    const name = input.name.trim();
    const body = input.body.trim();

    if (!name || !body) {
      throw new WhatsappServiceError('VALIDATION_ERROR', 'Template name and body are required');
    }

    const [created] = await this.db
      .insert(whatsappTemplates)
      .values({
        companyId,
        name,
        externalTemplateId: input.externalTemplateId?.trim() || null,
        category: input.category ?? 'utility',
        language: input.language?.trim() || 'en',
        body,
        variables: input.variables ?? [],
        status: input.status ?? 'pending',
      })
      .returning();

    return toTemplateSummary(created!);
  }

  async updateTemplate(
    companyId: string,
    templateId: string,
    input: UpdateWhatsappTemplateRequest,
  ): Promise<WhatsappTemplateSummary> {
    const existing = await this.db.query.whatsappTemplates.findFirst({
      where: and(eq(whatsappTemplates.id, templateId), eq(whatsappTemplates.companyId, companyId)),
    });

    if (!existing) {
      throw new WhatsappServiceError('NOT_FOUND', 'WhatsApp template not found');
    }

    const [updated] = await this.db
      .update(whatsappTemplates)
      .set({
        name: input.name?.trim() ?? existing.name,
        externalTemplateId:
          input.externalTemplateId !== undefined
            ? input.externalTemplateId?.trim() || null
            : existing.externalTemplateId,
        category: input.category ?? existing.category,
        language: input.language?.trim() ?? existing.language,
        body: input.body?.trim() ?? existing.body,
        variables: input.variables ?? existing.variables,
        status: input.status ?? existing.status,
        updatedAt: new Date(),
      })
      .where(eq(whatsappTemplates.id, templateId))
      .returning();

    return toTemplateSummary(updated!);
  }

  async deleteTemplate(companyId: string, templateId: string): Promise<void> {
    const existing = await this.db.query.whatsappTemplates.findFirst({
      where: and(eq(whatsappTemplates.id, templateId), eq(whatsappTemplates.companyId, companyId)),
    });

    if (!existing) {
      throw new WhatsappServiceError('NOT_FOUND', 'WhatsApp template not found');
    }

    await this.db.delete(whatsappTemplates).where(eq(whatsappTemplates.id, templateId));
  }

  async listMessages(
    companyId: string,
    filters?: { customerId?: string },
  ): Promise<WhatsappMessageSummary[]> {
    const whereClause = filters?.customerId
      ? and(
          eq(whatsappMessages.companyId, companyId),
          eq(whatsappMessages.customerId, filters.customerId),
        )
      : eq(whatsappMessages.companyId, companyId);

    const rows = await this.db.query.whatsappMessages.findMany({
      where: whereClause,
      with: { customer: true, template: true, approvedBy: true },
      orderBy: [desc(whatsappMessages.createdAt)],
    });

    return rows.map(toMessageSummary);
  }

  async createAutomationDraft(
    scope: TenantScope,
    input: {
      customerId: string;
      messageContent: string;
      templateId?: string | null;
      notificationCategory?: WhatsappTemplateCategory | null;
    },
  ): Promise<WhatsappMessageSummary> {
    return this.createDraftMessage(scope, input);
  }

  async sendMessage(
    scope: TenantScope,
    input: SendWhatsappMessageRequest,
  ): Promise<WhatsappMessageSummary> {
    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, input.customerId), eq(customers.companyId, scope.companyId)),
    });

    if (!customer) {
      throw new WhatsappServiceError('NOT_FOUND', 'Customer not found');
    }

    if (!customer.phone?.trim()) {
      throw new WhatsappServiceError('VALIDATION_ERROR', 'Customer does not have a phone number');
    }

    const messageContent = input.messageContent.trim();

    if (!messageContent) {
      throw new WhatsappServiceError('VALIDATION_ERROR', 'Message content is required');
    }

    if (input.asDraft) {
      return this.createDraftMessage(scope, {
        customerId: customer.id,
        messageContent,
        templateId: input.templateId ?? null,
      });
    }

    this.ensureWhatsappFeatureEnabled('send');
    this.ensureOutboundEnabled();

    const connection = await this.requireConnectedConnection(scope.companyId);
    const client = this.createClient(connection);

    let externalMessageId: string;

    if (input.templateId) {
      const template = await this.db.query.whatsappTemplates.findFirst({
        where: and(
          eq(whatsappTemplates.id, input.templateId),
          eq(whatsappTemplates.companyId, scope.companyId),
        ),
      });

      if (!template) {
        throw new WhatsappServiceError('NOT_FOUND', 'WhatsApp template not found');
      }

      if (template.status !== 'approved') {
        throw new WhatsappServiceError(
          'VALIDATION_ERROR',
          'Only approved templates can be sent via WhatsApp',
        );
      }

      externalMessageId = await client.sendTemplateMessage({
        to: customer.phone,
        templateName: template.name,
        languageCode: template.language,
        components: buildTemplateComponents(template.variables, input.templateVariables ?? {}),
      });
    } else {
      externalMessageId = await client.sendTextMessage({
        to: customer.phone,
        body: messageContent,
      });
    }

    const [created] = await this.db
      .insert(whatsappMessages)
      .values({
        companyId: scope.companyId,
        customerId: customer.id,
        direction: 'outgoing',
        messageContent,
        externalMessageId,
        deliveryStatus: 'sent',
        templateId: input.templateId ?? null,
        isDraft: false,
        approvedByUserId: scope.userId,
        sentAt: new Date(),
      })
      .returning();

    const row = await this.db.query.whatsappMessages.findFirst({
      where: eq(whatsappMessages.id, created!.id),
      with: { customer: true, template: true, approvedBy: true },
    });

    return toMessageSummary(row!);
  }

  async sendTestMessage(
    companyId: string,
    input: SendWhatsappTestMessageRequest,
  ): Promise<{ externalMessageId: string }> {
    this.ensureWhatsappFeatureEnabled('send');
    this.ensureOutboundEnabled();

    const connection = await this.requireConnectedConnection(companyId);
    const client = this.createClient(connection);
    const messageContent = input.messageContent.trim();
    const phoneNumber = input.phoneNumber.trim();

    if (!messageContent || !phoneNumber) {
      throw new WhatsappServiceError(
        'VALIDATION_ERROR',
        'Phone number and message content are required',
      );
    }

    const externalMessageId = await client.sendTextMessage({
      to: phoneNumber,
      body: messageContent,
    });

    return { externalMessageId };
  }

  async approveDraft(scope: TenantScope, messageId: string): Promise<WhatsappMessageSummary> {
    this.ensureWhatsappFeatureEnabled('send');
    this.ensureOutboundEnabled();

    const draft = await this.db.query.whatsappMessages.findFirst({
      where: and(
        eq(whatsappMessages.id, messageId),
        eq(whatsappMessages.companyId, scope.companyId),
        eq(whatsappMessages.isDraft, true),
      ),
      with: { customer: true, template: true },
    });

    if (!draft) {
      throw new WhatsappServiceError('NOT_FOUND', 'WhatsApp draft message not found');
    }

    if (!draft.customer?.phone?.trim()) {
      throw new WhatsappServiceError('VALIDATION_ERROR', 'Customer does not have a phone number');
    }

    const connection = await this.requireConnectedConnection(scope.companyId);
    const client = this.createClient(connection);

    let externalMessageId: string;

    if (draft.templateId && draft.template) {
      externalMessageId = await client.sendTemplateMessage({
        to: draft.customer.phone,
        templateName: draft.template.name,
        languageCode: draft.template.language,
      });
    } else {
      externalMessageId = await client.sendTextMessage({
        to: draft.customer.phone,
        body: draft.messageContent,
      });
    }

    const [updated] = await this.db
      .update(whatsappMessages)
      .set({
        isDraft: false,
        deliveryStatus: 'sent',
        externalMessageId,
        approvedByUserId: scope.userId,
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(whatsappMessages.id, messageId))
      .returning();

    const row = await this.db.query.whatsappMessages.findFirst({
      where: eq(whatsappMessages.id, updated!.id),
      with: { customer: true, template: true, approvedBy: true },
    });

    return toMessageSummary(row!);
  }

  verifyWebhookChallenge(
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
    expectedToken: string | null | undefined,
  ): string | null {
    if (mode === 'subscribe' && token && challenge && token === expectedToken) {
      return challenge;
    }

    return null;
  }

  async handleWebhook(payload: WhatsappWebhookPayload): Promise<{ processed: number }> {
    if (!this.runtime.whatsappEnabled || !this.runtime.webhooksEnabled) {
      throw new WhatsappServiceError(
        'FEATURE_DISABLED',
        !this.runtime.whatsappEnabled
          ? 'WhatsApp is disabled (WHATSAPP_ENABLED / PROVIDERS_ENABLED)'
          : 'WhatsApp webhooks are disabled (WEBHOOKS_ENABLED)',
      );
    }

    let processed = 0;

    for (const incoming of parseIncomingWebhookMessages(payload)) {
      const connection = await this.db.query.whatsappConnections.findFirst({
        where: eq(whatsappConnections.phoneNumberId, incoming.phoneNumberId),
      });

      if (!connection) {
        continue;
      }

      const existing = await this.db.query.whatsappMessages.findFirst({
        where: and(
          eq(whatsappMessages.companyId, connection.companyId),
          eq(whatsappMessages.externalMessageId, incoming.externalMessageId),
        ),
      });

      if (existing) {
        continue;
      }

      const customer = await this.findCustomerByPhone(connection.companyId, incoming.from);
      const occurredAt = incoming.timestamp
        ? new Date(Number.parseInt(incoming.timestamp, 10) * 1000)
        : new Date();

      await this.db.insert(whatsappMessages).values({
        companyId: connection.companyId,
        customerId: customer?.id ?? null,
        direction: 'incoming',
        messageContent: incoming.body,
        externalMessageId: incoming.externalMessageId,
        deliveryStatus: 'delivered',
        deliveredAt: occurredAt,
      });

      emitBusinessEvent({
        companyId: connection.companyId,
        eventType: 'whatsapp.message.received',
        entityType: 'whatsapp_message',
        entityId: incoming.externalMessageId,
        payload: {
          message: {
            body: incoming.body,
            from: incoming.from,
            contactName: incoming.contactName,
          },
          customerId: customer?.id ?? null,
        },
      });

      if (this.indexInboundMessage) {
        try {
          await this.indexInboundMessage({
            companyId: connection.companyId,
            externalMessageId: incoming.externalMessageId,
            contactPhone: incoming.from,
            contactName: incoming.contactName,
            messagePreview: incoming.body.slice(0, 400),
            customerId: customer?.id ?? null,
            occurredAt,
          });
        } catch {
          // Indexing must not fail webhook ack — message is already durable.
        }
      }

      if (this.recordInboundEnrichment) {
        try {
          await this.recordInboundEnrichment({
            companyId: connection.companyId,
            contactPhone: incoming.from,
            contactName: incoming.contactName,
            externalMessageId: incoming.externalMessageId,
            customerId: customer?.id ?? null,
            messagePreview: incoming.body.slice(0, 400),
          });
        } catch {
          // Enrichment queue is best-effort; never block Meta delivery ack.
        }
      }

      processed += 1;
    }

    for (const statusUpdate of parseWebhookDeliveryStatuses(payload)) {
      const connection = await this.db.query.whatsappConnections.findFirst({
        where: eq(whatsappConnections.phoneNumberId, statusUpdate.phoneNumberId),
      });

      if (!connection) {
        continue;
      }

      const deliveryStatus = mapDeliveryStatus(statusUpdate.status);
      const timestamp = statusUpdate.timestamp
        ? new Date(Number.parseInt(statusUpdate.timestamp, 10) * 1000)
        : new Date();

      await this.db
        .update(whatsappMessages)
        .set({
          deliveryStatus,
          deliveredAt:
            deliveryStatus === 'delivered' || deliveryStatus === 'read' ? timestamp : undefined,
          readAt: deliveryStatus === 'read' ? timestamp : undefined,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(whatsappMessages.companyId, connection.companyId),
            eq(whatsappMessages.externalMessageId, statusUpdate.externalMessageId),
          ),
        );

      processed += 1;
    }

    if (this.hubService && processed > 0) {
      const firstPhoneNumberId =
        parseIncomingWebhookMessages(payload)[0]?.phoneNumberId ??
        parseWebhookDeliveryStatuses(payload)[0]?.phoneNumberId;

      if (firstPhoneNumberId) {
        const connection = await this.db.query.whatsappConnections.findFirst({
          where: eq(whatsappConnections.phoneNumberId, firstPhoneNumberId),
        });

        if (connection) {
          await this.hubService.recordProviderWebhookEvent({
            companyId: connection.companyId,
            provider: 'whatsapp',
            eventType: 'message',
            status: 'processed',
          });
        }
      }
    }

    return { processed };
  }

  async processAutomationTrigger(
    companyId: string,
    context: WhatsappAutomationTriggerContext,
  ): Promise<WhatsappAutomationActionResult[]> {
    const triggerType =
      context.triggerType === 'invoice_overdue' ? 'invoice_overdue' : 'job_status_changed';

    const activeWorkflows = await this.db.query.workflows.findMany({
      where: and(eq(workflows.companyId, companyId), eq(workflows.status, 'active')),
      with: {
        triggers: true,
        actions: true,
      },
    });

    const results: WhatsappAutomationActionResult[] = [];

    for (const workflow of activeWorkflows) {
      const matchingTrigger = workflow.triggers.find((trigger) => {
        if (trigger.triggerType !== triggerType) {
          return false;
        }

        if (triggerType === 'job_status_changed') {
          const expectedStatus = String(trigger.config.jobStatus ?? 'scheduled');
          return context.jobStatus === expectedStatus;
        }

        return true;
      });

      if (!matchingTrigger) {
        continue;
      }

      for (const action of workflow.actions) {
        if (
          action.actionType !== 'send_whatsapp_template' &&
          action.actionType !== 'send_whatsapp_draft'
        ) {
          continue;
        }

        const category =
          (action.config.category as WhatsappTemplateCategory | undefined) ??
          (action.actionType === 'send_whatsapp_draft'
            ? 'payment_reminder'
            : 'job_booked_confirmation');

        if (!context.customerId) {
          continue;
        }

        const preview = await this.buildNotificationPreview(
          companyId,
          context.customerId,
          category,
          action.config,
        );
        const draft = await this.createDraftMessage(
          { companyId, userId: workflow.createdByUserId },
          {
            customerId: context.customerId,
            messageContent: preview,
            notificationCategory: category,
            templateId:
              typeof action.config.templateId === 'string' ? action.config.templateId : null,
          },
        );

        results.push({
          workflowId: workflow.id,
          workflowName: workflow.name,
          actionType: action.actionType,
          draftMessageId: draft.id,
          category,
          preview,
        });
      }
    }

    return results;
  }

  async buildAuraContext(companyId: string, customerId?: string): Promise<AuraWhatsappContext> {
    const connection = await this.getOrCreateConnection(companyId);
    const stats = await this.getStats(companyId);
    const runtimeNote = this.buildRuntimeNote(connection.status === 'connected');

    const unmatchedInbound = await this.db.query.whatsappMessages.findMany({
      where: and(
        eq(whatsappMessages.companyId, companyId),
        eq(whatsappMessages.direction, 'incoming'),
      ),
      columns: { id: true, customerId: true },
      limit: 500,
    });
    const unmatchedInboundCount = unmatchedInbound.filter((row) => !row.customerId).length;

    const recentRows = await this.db.query.whatsappMessages.findMany({
      where: eq(whatsappMessages.companyId, companyId),
      with: { customer: true },
      orderBy: [desc(whatsappMessages.createdAt)],
      limit: 10,
    });

    const pendingReplyRows = await this.db.query.whatsappMessages.findMany({
      where: and(
        eq(whatsappMessages.companyId, companyId),
        eq(whatsappMessages.direction, 'incoming'),
      ),
      with: { customer: true },
      orderBy: [desc(whatsappMessages.createdAt)],
      limit: 20,
    });

    const pendingReplies = [];

    for (const message of pendingReplyRows) {
      if (!message.customerId) {
        pendingReplies.push({
          customerId: null,
          customerName: null,
          messagePreview: truncate(message.messageContent, 160),
          receivedAt: message.createdAt.toISOString(),
        });
        continue;
      }

      const hasReply = await this.db.query.whatsappMessages.findFirst({
        where: and(
          eq(whatsappMessages.companyId, companyId),
          eq(whatsappMessages.direction, 'outgoing'),
          eq(whatsappMessages.customerId, message.customerId),
          gt(whatsappMessages.createdAt, message.createdAt),
        ),
      });

      if (!hasReply) {
        pendingReplies.push({
          customerId: message.customerId,
          customerName: message.customer?.name ?? null,
          messagePreview: truncate(message.messageContent, 160),
          receivedAt: message.createdAt.toISOString(),
        });
      }

      if (pendingReplies.length >= 5) {
        break;
      }
    }

    let focusedCustomerMessages: AuraWhatsappContext['focusedCustomerMessages'] = null;

    if (customerId) {
      const focusedRows = await this.db.query.whatsappMessages.findMany({
        where: and(
          eq(whatsappMessages.companyId, companyId),
          eq(whatsappMessages.customerId, customerId),
        ),
        orderBy: [desc(whatsappMessages.createdAt)],
        limit: 10,
      });

      focusedCustomerMessages = focusedRows.map((message) => ({
        direction: message.direction,
        messagePreview: truncate(message.messageContent, 160),
        deliveryStatus: message.deliveryStatus,
        isDraft: message.isDraft,
        occurredAt: message.createdAt.toISOString(),
      }));
    }

    return {
      connectionStatus: connection.status,
      isConnected: connection.status === 'connected',
      displayPhoneNumber: connection.displayPhoneNumber,
      featureEnabled: this.runtime.whatsappEnabled,
      webhooksEnabled: this.runtime.webhooksEnabled,
      outboundMessagesEnabled: this.runtime.outboundMessagesEnabled,
      runtimeNote,
      messageCount: stats.totalMessages,
      incomingCount: stats.incomingCount,
      outgoingCount: stats.outgoingCount,
      draftCount: stats.draftCount,
      pendingReplyCount: stats.pendingReplyCount,
      unmatchedInboundCount,
      templateCount: stats.templateCount,
      recentConversations: recentRows.map((message) => ({
        customerId: message.customerId,
        customerName: message.customer?.name ?? null,
        lastMessagePreview: truncate(message.messageContent, 120),
        direction: message.direction,
        deliveryStatus: message.deliveryStatus,
        isDraft: message.isDraft,
        occurredAt: message.createdAt.toISOString(),
      })),
      pendingReplies,
      focusedCustomerMessages,
      automationExamples: [
        'Trigger job_status_changed (scheduled) → send_whatsapp_template draft for job booked confirmation',
        'Trigger invoice_overdue → send_whatsapp_draft payment reminder (requires user approval before send)',
        'Summarise unmatched inbound WhatsApp threads for Owner review — never auto-create customers',
        'Draft a reply for pending WhatsApp conversation — send only after explicit approve',
      ],
      sendPolicy: {
        autoSendEnabled: false,
        draftApproveExecute: true,
      },
    };
  }

  private async buildNotificationPreview(
    companyId: string,
    customerId: string,
    category: WhatsappTemplateCategory,
    config: Record<string, unknown>,
  ): Promise<string> {
    const template = await this.db.query.whatsappTemplates.findFirst({
      where: and(
        eq(whatsappTemplates.companyId, companyId),
        eq(whatsappTemplates.category, category),
        eq(whatsappTemplates.status, 'approved'),
      ),
    });

    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.companyId, companyId)),
    });

    const body = template?.body ?? NOTIFICATION_BODY_DEFAULTS[category];
    const variables: Record<string, string> = {
      customer_name: customer?.name ?? 'Customer',
      job_title: String(config.jobTitle ?? 'your service'),
      scheduled_at: String(config.scheduledAt ?? 'the scheduled time'),
      technician_name: String(config.technicianName ?? 'your technician'),
      eta: String(config.eta ?? 'soon'),
      invoice_number: String(config.invoiceNumber ?? 'your invoice'),
      amount: String(config.amount ?? 'the outstanding amount'),
      due_date: String(config.dueDate ?? 'the due date'),
      message: String(config.message ?? ''),
    };

    return interpolateTemplate(body, variables);
  }

  private async createDraftMessage(
    scope: TenantScope,
    input: {
      customerId: string;
      messageContent: string;
      templateId?: string | null;
      notificationCategory?: WhatsappTemplateCategory | null;
    },
  ): Promise<WhatsappMessageSummary> {
    const [created] = await this.db
      .insert(whatsappMessages)
      .values({
        companyId: scope.companyId,
        customerId: input.customerId,
        direction: 'outgoing',
        messageContent: input.messageContent,
        deliveryStatus: 'draft',
        templateId: input.templateId ?? null,
        notificationCategory: input.notificationCategory ?? null,
        isDraft: true,
      })
      .returning();

    const row = await this.db.query.whatsappMessages.findFirst({
      where: eq(whatsappMessages.id, created!.id),
      with: { customer: true, template: true, approvedBy: true },
    });

    return toMessageSummary(row!);
  }

  private async getOrCreateConnection(companyId: string) {
    const existing = await this.db.query.whatsappConnections.findFirst({
      where: eq(whatsappConnections.companyId, companyId),
    });

    if (existing) {
      return existing;
    }

    const [created] = await this.db.insert(whatsappConnections).values({ companyId }).returning();

    return created!;
  }

  private async requireConnectedConnection(companyId: string) {
    const connection = await this.getOrCreateConnection(companyId);

    if (
      connection.status !== 'connected' ||
      !connection.credentialsEncrypted ||
      !connection.phoneNumberId
    ) {
      throw new WhatsappServiceError('NOT_CONNECTED', 'WhatsApp is not connected');
    }

    return connection;
  }

  private createClient(connection: typeof whatsappConnections.$inferSelect) {
    this.ensureEncryptionKey();
    const credentials = decryptWhatsappCredentials(
      connection.credentialsEncrypted!,
      this.encryptionKey!,
    );

    return new WhatsappClient({
      accessToken: credentials.accessToken,
      phoneNumberId: connection.phoneNumberId!,
    });
  }

  private async recordAudit(
    companyId: string,
    userId: string | undefined,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.db.insert(securityAuditLogs).values({
        companyId,
        category: 'integrations',
        action,
        entityType: 'whatsapp_connection',
        entityId,
        userId: userId ?? null,
        metadata,
      });
    } catch {
      // Audit must not block connect/disconnect.
    }
  }

  private ensureEncryptionKey() {
    if (!this.encryptionKey) {
      throw new WhatsappServiceError(
        'ENCRYPTION_NOT_CONFIGURED',
        'Integration encryption is not configured on the server',
      );
    }
  }

  private ensureWhatsappFeatureEnabled(action: 'connect' | 'send' | 'webhook'): void {
    if (!this.runtime.whatsappEnabled) {
      throw new WhatsappServiceError(
        'FEATURE_DISABLED',
        `WhatsApp ${action} is disabled (set WHATSAPP_ENABLED=true and PROVIDERS_ENABLED=true)`,
      );
    }
  }

  private ensureOutboundEnabled(): void {
    if (!this.runtime.outboundMessagesEnabled) {
      throw new WhatsappServiceError(
        'FEATURE_DISABLED',
        'Outbound WhatsApp messages are disabled (OUTBOUND_MESSAGES_ENABLED=false)',
      );
    }
  }

  private buildRuntimeNote(_isConnected: boolean): string | null {
    const notes: string[] = [];
    if (!this.runtime.whatsappEnabled) {
      notes.push('Business WhatsApp is turned off for this environment');
    }
    if (!this.runtime.webhooksEnabled) {
      notes.push('Incoming messages are paused');
    }
    if (!this.runtime.outboundMessagesEnabled) {
      notes.push('Outgoing messages are paused');
    }
    if (notes.length === 0) {
      return null;
    }
    return notes.join('. ') + '.';
  }

  private toConnectionSummary(
    connection: typeof whatsappConnections.$inferSelect,
  ): WhatsappConnectionSummary {
    const isConnected = connection.status === 'connected';
    return {
      provider: connection.provider,
      status: connection.status,
      phoneNumberId: connection.phoneNumberId,
      businessAccountId: connection.businessAccountId,
      displayPhoneNumber: connection.displayPhoneNumber,
      hasCredentials: Boolean(connection.credentialsEncrypted),
      webhookVerifyTokenHint: connection.webhookVerifyToken
        ? maskSecret(connection.webhookVerifyToken)
        : null,
      lastError: connection.lastError,
      connectedAt: connection.connectedAt?.toISOString() ?? null,
      webhookUrl: `${this.apiPublicUrl ?? 'http://localhost:3000'}/api/v1/webhooks/whatsapp`,
      featureEnabled: this.runtime.whatsappEnabled,
      webhooksEnabled: this.runtime.webhooksEnabled,
      outboundMessagesEnabled: this.runtime.outboundMessagesEnabled,
      runtimeNote: this.buildRuntimeNote(isConnected),
    };
  }

  private async findCustomerByPhone(companyId: string, phone: string) {
    const normalized = phone.replace(/\D/g, '');
    const rows = await this.db.query.customers.findMany({
      where: eq(customers.companyId, companyId),
    });

    return (
      rows.find(
        (customer) => customer.phone && customer.phone.replace(/\D/g, '').endsWith(normalized),
      ) ??
      rows.find(
        (customer) => customer.phone && normalized.endsWith(customer.phone.replace(/\D/g, '')),
      ) ??
      null
    );
  }

  private async countPendingReplies(companyId: string): Promise<number> {
    const incoming = await this.db.query.whatsappMessages.findMany({
      where: and(
        eq(whatsappMessages.companyId, companyId),
        eq(whatsappMessages.direction, 'incoming'),
      ),
      orderBy: [desc(whatsappMessages.createdAt)],
    });

    let count = 0;

    for (const message of incoming) {
      if (!message.customerId) {
        count += 1;
        continue;
      }

      const reply = await this.db.query.whatsappMessages.findFirst({
        where: and(
          eq(whatsappMessages.companyId, companyId),
          eq(whatsappMessages.customerId, message.customerId),
          eq(whatsappMessages.direction, 'outgoing'),
          gt(whatsappMessages.createdAt, message.createdAt),
        ),
      });

      if (!reply) {
        count += 1;
      }
    }

    return count;
  }
}

function toTemplateSummary(row: typeof whatsappTemplates.$inferSelect): WhatsappTemplateSummary {
  return {
    id: row.id,
    name: row.name,
    externalTemplateId: row.externalTemplateId,
    category: row.category,
    language: row.language,
    body: row.body,
    variables: row.variables ?? [],
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMessageSummary(
  row: typeof whatsappMessages.$inferSelect & {
    customer?: typeof customers.$inferSelect | null;
    template?: typeof whatsappTemplates.$inferSelect | null;
    approvedBy?: typeof users.$inferSelect | null;
  },
): WhatsappMessageSummary {
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customer?.name ?? null,
    direction: row.direction,
    messageContent: row.messageContent,
    externalMessageId: row.externalMessageId,
    deliveryStatus: row.deliveryStatus,
    templateId: row.templateId,
    templateName: row.template?.name ?? null,
    notificationCategory: row.notificationCategory,
    isDraft: row.isDraft,
    approvedByUserId: row.approvedByUserId,
    approvedByName: row.approvedBy
      ? `${row.approvedBy.firstName} ${row.approvedBy.lastName}`.trim()
      : null,
    sentAt: row.sentAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapDeliveryStatus(
  status: string,
): (typeof whatsappMessages.$inferSelect)['deliveryStatus'] {
  switch (status) {
    case 'sent':
      return 'sent';
    case 'delivered':
      return 'delivered';
    case 'read':
      return 'read';
    case 'failed':
      return 'failed';
    default:
      return 'pending';
  }
}

function buildTemplateComponents(variables: string[], values: Record<string, string>) {
  if (variables.length === 0) {
    return undefined;
  }

  return [
    {
      type: 'body',
      parameters: variables.map((variable) => ({
        type: 'text',
        text: values[variable] ?? '',
      })),
    },
  ];
}

function interpolateTemplate(body: string, variables: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => variables[key] ?? '');
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function maskSecret(value: string): string {
  if (value.length <= 4) {
    return '****';
  }

  return `${value.slice(0, 2)}…${value.slice(-2)}`;
}
