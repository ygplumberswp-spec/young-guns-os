import { and, desc, eq } from 'drizzle-orm';
import type {
  ResendDeliveryStatus,
  ResendDeliverySummary,
  ResendEmailPurpose,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  communications,
  integrationConnections,
  resendEmailDeliveries,
  resendWebhookEvents,
  securityAuditLogs,
} from '@titan/db';
import { decryptResendCredentials } from '../lib/crypto.js';
import { ResendClient, ResendError } from '../lib/resend.client.js';
import {
  extractResendWebhookHeaders,
  verifyResendWebhookSignature,
  type ResendWebhookHeaders,
} from '../lib/resend-signing.js';
import type { IntegrationHubService } from './integration-hub.service.js';

export class ResendEmailError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ResendEmailError';
  }
}

export type SendTransactionalEmailInput = {
  companyId: string;
  purpose: ResendEmailPurpose;
  toEmail: string;
  subject: string;
  html?: string;
  text?: string;
  /** When set, updates the CRM communication delivery state after send. */
  communicationId?: string | null;
  actorUserId?: string | null;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
};

export type SendTransactionalEmailResult = {
  deliveryId: string;
  resendEmailId: string;
  status: ResendDeliveryStatus;
  communicationId: string | null;
};

export type ResendWebhookHandleResult = {
  outcome: 'processed' | 'duplicate' | 'ignored' | 'unmatched';
  eventId: string;
  eventType: string;
  companyId: string | null;
  deliveryId: string | null;
};

type ResendEmailServiceDeps = {
  db: DatabaseClient;
  encryptionKey?: string;
  hubService?: IntegrationHubService;
  emailSendingEnabled: boolean;
  webhooksEnabled: boolean;
};

const BUSINESS_PURPOSES_REQUIRING_APPROVAL: ResendEmailPurpose[] = [
  'customer_quote',
  'invoice',
  'payment_receipt',
  'job_confirmation',
  'appointment_reminder',
  'maintenance_reminder',
  'outbound_message',
];

export class ResendEmailService {
  constructor(private readonly deps: ResendEmailServiceDeps) {}

  static create(deps: ResendEmailServiceDeps): ResendEmailService {
    return new ResendEmailService(deps);
  }

  isEmailSendingEnabled(): boolean {
    return this.deps.emailSendingEnabled;
  }

  requiresApproval(purpose: ResendEmailPurpose): boolean {
    return BUSINESS_PURPOSES_REQUIRING_APPROVAL.includes(purpose);
  }

  async listRecentDeliveries(companyId: string, limit = 20): Promise<ResendDeliverySummary[]> {
    const rows = await this.deps.db.query.resendEmailDeliveries.findMany({
      where: eq(resendEmailDeliveries.companyId, companyId),
      orderBy: [desc(resendEmailDeliveries.createdAt)],
      limit: Math.min(Math.max(limit, 1), 100),
    });

    return rows.map((row) => toDeliverySummary(row));
  }

  /**
   * Send a transactional email via the tenant's connected Resend account.
   * Gated by EMAIL_SENDING_ENABLED && PROVIDERS_ENABLED (via emailSendingEnabled).
   * Does not bypass draft→approve→execute — callers must only invoke after approval
   * for business purposes (or for system_notification which may send directly when gated).
   */
  async sendTransactionalEmail(
    input: SendTransactionalEmailInput,
  ): Promise<SendTransactionalEmailResult> {
    if (!this.deps.emailSendingEnabled) {
      throw new ResendEmailError(
        'FEATURE_DISABLED',
        'Email sending is disabled (set PROVIDERS_ENABLED=true and EMAIL_SENDING_ENABLED=true)',
      );
    }

    if (!this.deps.encryptionKey) {
      throw new ResendEmailError(
        'CONFIG_ERROR',
        'INTEGRATIONS_ENCRYPTION_KEY is required to send via Resend',
      );
    }

    const toEmail = input.toEmail.trim().toLowerCase();
    const subject = input.subject.trim();
    if (!toEmail || !subject) {
      throw new ResendEmailError('VALIDATION_ERROR', 'Recipient email and subject are required');
    }
    if (!input.html?.trim() && !input.text?.trim()) {
      throw new ResendEmailError('VALIDATION_ERROR', 'Email html or text body is required');
    }

    const connection = await this.deps.db.query.integrationConnections.findFirst({
      where: and(
        eq(integrationConnections.companyId, input.companyId),
        eq(integrationConnections.provider, 'resend'),
      ),
    });

    if (
      !connection ||
      connection.status !== 'connected' ||
      !connection.credentialsEncrypted ||
      !connection.config.fromEmail
    ) {
      throw new ResendEmailError(
        'NOT_CONNECTED',
        'Resend is not connected. Connect an API key under Integrations → Resend before sending.',
      );
    }

    const credentials = decryptResendCredentials(
      connection.credentialsEncrypted,
      this.deps.encryptionKey,
    );

    const fromEmail = connection.config.fromEmail;
    const fromName = connection.config.fromName?.trim();
    const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

    const tags = [
      { name: 'titan_company_id', value: sanitizeTagValue(input.companyId) },
      { name: 'titan_purpose', value: sanitizeTagValue(input.purpose) },
    ];
    if (input.communicationId) {
      tags.push({
        name: 'titan_communication_id',
        value: sanitizeTagValue(input.communicationId),
      });
    }

    const client = new ResendClient({ apiKey: credentials.apiKey });
    const now = new Date();

    let sendResult: { id: string };
    try {
      sendResult = await client.sendEmail({
        from,
        to: toEmail,
        subject,
        html: input.html,
        text: input.text ?? (input.html ? undefined : ''),
        tags,
        idempotencyKey: input.idempotencyKey,
      });
    } catch (error) {
      const message = mapSendError(error);
      await this.updateConnectionDeliverySnapshot(connection.id, connection.config, {
        lastDeliveryAt: now.toISOString(),
        lastDeliveryStatus: 'failed',
        lastDeliveryError: message,
      });
      if (input.communicationId) {
        await this.deps.db
          .update(communications)
          .set({
            deliveryState: 'send_failed',
            failureReason: message,
            updatedAt: now,
          })
          .where(
            and(
              eq(communications.id, input.communicationId),
              eq(communications.companyId, input.companyId),
            ),
          );
      }
      await this.writeAudit(input.companyId, 'resend_email_send_failed', 'resend_email_delivery', null, {
        purpose: input.purpose,
        toEmail,
        error: message,
        actorUserId: input.actorUserId ?? null,
      });
      throw new ResendEmailError('SEND_FAILED', message);
    }

    const [delivery] = await this.deps.db
      .insert(resendEmailDeliveries)
      .values({
        companyId: input.companyId,
        integrationConnectionId: connection.id,
        communicationId: input.communicationId ?? null,
        purpose: input.purpose,
        toEmail,
        subject,
        status: 'sent',
        resendEmailId: sendResult.id,
        metadata: {
          ...(input.metadata ?? {}),
          purpose: input.purpose,
        },
        sentAt: now,
      })
      .returning();

    if (!delivery) {
      throw new ResendEmailError('CREATE_FAILED', 'Unable to record Resend delivery');
    }

    await this.updateConnectionDeliverySnapshot(connection.id, connection.config, {
      lastDeliveryAt: now.toISOString(),
      lastDeliveryStatus: 'sent',
      lastDeliveryError: null,
    });

    if (input.communicationId) {
      await this.deps.db
        .update(communications)
        .set({
          deliveryState: 'queued',
          failureReason: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(communications.id, input.communicationId),
            eq(communications.companyId, input.companyId),
          ),
        );
    }

    await this.writeAudit(
      input.companyId,
      'resend_email_sent',
      'resend_email_delivery',
      delivery.id,
      {
        purpose: input.purpose,
        toEmail,
        resendEmailId: sendResult.id,
        communicationId: input.communicationId ?? null,
        actorUserId: input.actorUserId ?? null,
      },
    );

    await this.deps.hubService?.recordProviderWebhookEvent({
      companyId: input.companyId,
      provider: 'resend',
      eventType: 'email.sent',
      status: 'processed',
    });

    return {
      deliveryId: delivery.id,
      resendEmailId: sendResult.id,
      status: 'sent',
      communicationId: input.communicationId ?? null,
    };
  }

  async handleWebhook(input: {
    rawBody: string;
    headers: Record<string, string | string[] | undefined>;
  }): Promise<ResendWebhookHandleResult> {
    if (!this.deps.webhooksEnabled) {
      throw new ResendEmailError(
        'FEATURE_DISABLED',
        'Resend webhooks are disabled (WEBHOOKS_ENABLED)',
      );
    }

    if (!this.deps.encryptionKey) {
      throw new ResendEmailError(
        'CONFIG_ERROR',
        'INTEGRATIONS_ENCRYPTION_KEY is required to verify Resend webhooks',
      );
    }

    const webhookHeaders = extractResendWebhookHeaders(input.headers);
    const tenant = await this.resolveTenantBySignature(input.rawBody, webhookHeaders);
    if (!tenant) {
      throw new ResendEmailError('INVALID_SIGNATURE', 'Resend webhook signature rejected');
    }

    let event: ParsedResendEvent;
    try {
      event = parseResendEvent(input.rawBody);
    } catch (error) {
      throw new ResendEmailError(
        'INVALID_PAYLOAD',
        error instanceof Error ? error.message : 'Invalid Resend webhook payload',
      );
    }

    const svixId = webhookHeaders.svixId?.trim() || event.id;
    await this.writeAudit(tenant.companyId, 'resend_webhook_received', 'resend_webhook_event', null, {
      eventType: event.type,
      svixId,
      connectionId: tenant.connectionId,
    });

    const existing = await this.deps.db.query.resendWebhookEvents.findFirst({
      where: and(
        eq(resendWebhookEvents.companyId, tenant.companyId),
        eq(resendWebhookEvents.svixId, svixId),
      ),
    });
    if (existing) {
      return {
        outcome: 'duplicate',
        eventId: svixId,
        eventType: event.type,
        companyId: tenant.companyId,
        deliveryId: existing.deliveryId,
      };
    }

    const delivery = event.emailId
      ? await this.deps.db.query.resendEmailDeliveries.findFirst({
          where: and(
            eq(resendEmailDeliveries.companyId, tenant.companyId),
            eq(resendEmailDeliveries.resendEmailId, event.emailId),
          ),
        })
      : null;

    const [receipt] = await this.deps.db
      .insert(resendWebhookEvents)
      .values({
        companyId: tenant.companyId,
        integrationConnectionId: tenant.connectionId,
        deliveryId: delivery?.id ?? null,
        svixId,
        eventType: event.type,
        resendEmailId: event.emailId,
        eventStatus: 'received',
        payloadSummary: {
          type: event.type,
          emailId: event.emailId,
          createdAt: event.createdAt,
        },
      })
      .onConflictDoNothing({
        target: [resendWebhookEvents.companyId, resendWebhookEvents.svixId],
      })
      .returning();

    if (!receipt) {
      return {
        outcome: 'duplicate',
        eventId: svixId,
        eventType: event.type,
        companyId: tenant.companyId,
        deliveryId: delivery?.id ?? null,
      };
    }

    if (!delivery) {
      await this.finalizeWebhookEvent(receipt.id, {
        eventStatus: 'ignored',
        outcome: 'unmatched',
        errorMessage: event.emailId
          ? 'No matching Resend delivery for this tenant'
          : 'Webhook payload missing email id',
      });
      return {
        outcome: 'unmatched',
        eventId: svixId,
        eventType: event.type,
        companyId: tenant.companyId,
        deliveryId: null,
      };
    }

    const now = new Date();
    const mapped = mapWebhookToDeliveryStatus(event.type);

    if (mapped === 'ignored') {
      await this.finalizeWebhookEvent(receipt.id, {
        eventStatus: 'ignored',
        outcome: 'ignored',
      });
      return {
        outcome: 'ignored',
        eventId: svixId,
        eventType: event.type,
        companyId: tenant.companyId,
        deliveryId: delivery.id,
      };
    }

    if (mapped === 'delivered') {
      await this.deps.db
        .update(resendEmailDeliveries)
        .set({
          status: 'delivered',
          deliveredAt: now,
          failureReason: null,
          updatedAt: now,
        })
        .where(eq(resendEmailDeliveries.id, delivery.id));

      if (delivery.communicationId) {
        await this.deps.db
          .update(communications)
          .set({
            deliveryState: 'provider_delivered',
            failureReason: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(communications.id, delivery.communicationId),
              eq(communications.companyId, tenant.companyId),
            ),
          );
      }

      await this.updateConnectionDeliverySnapshot(tenant.connectionId, {}, {
        lastDeliveryAt: now.toISOString(),
        lastDeliveryStatus: 'delivered',
        lastDeliveryError: null,
      });
    } else if (mapped === 'failed') {
      const reason = event.failureReason || `Resend event: ${event.type}`;
      await this.deps.db
        .update(resendEmailDeliveries)
        .set({
          status: 'failed',
          failedAt: now,
          failureReason: reason,
          updatedAt: now,
        })
        .where(eq(resendEmailDeliveries.id, delivery.id));

      if (delivery.communicationId) {
        await this.deps.db
          .update(communications)
          .set({
            deliveryState: 'send_failed',
            failureReason: reason,
            updatedAt: now,
          })
          .where(
            and(
              eq(communications.id, delivery.communicationId),
              eq(communications.companyId, tenant.companyId),
            ),
          );
      }

      await this.updateConnectionDeliverySnapshot(tenant.connectionId, {}, {
        lastDeliveryAt: now.toISOString(),
        lastDeliveryStatus: 'failed',
        lastDeliveryError: reason,
      });
    } else if (mapped === 'sent') {
      // email.sent — keep status as sent if not already delivered
      if (delivery.status !== 'delivered') {
        await this.deps.db
          .update(resendEmailDeliveries)
          .set({ status: 'sent', sentAt: delivery.sentAt ?? now, updatedAt: now })
          .where(eq(resendEmailDeliveries.id, delivery.id));
      }
    }

    await this.finalizeWebhookEvent(receipt.id, {
      eventStatus: 'processed',
      outcome: 'processed',
    });

    await this.deps.hubService?.recordProviderWebhookEvent({
      companyId: tenant.companyId,
      provider: 'resend',
      eventType: event.type,
      status: 'processed',
    });

    return {
      outcome: 'processed',
      eventId: svixId,
      eventType: event.type,
      companyId: tenant.companyId,
      deliveryId: delivery.id,
    };
  }

  private async resolveTenantBySignature(
    rawBody: string,
    headers: ResendWebhookHeaders,
  ): Promise<{ companyId: string; connectionId: string } | null> {
    const connections = await this.deps.db.query.integrationConnections.findMany({
      where: and(
        eq(integrationConnections.provider, 'resend'),
        eq(integrationConnections.status, 'connected'),
      ),
    });

    const matches: Array<{ companyId: string; connectionId: string }> = [];

    for (const connection of connections) {
      if (!connection.credentialsEncrypted || !this.deps.encryptionKey) continue;
      let webhookSecret: string | null | undefined;
      try {
        webhookSecret = decryptResendCredentials(
          connection.credentialsEncrypted,
          this.deps.encryptionKey,
        ).webhookSecret;
      } catch {
        continue;
      }
      if (!webhookSecret) continue;

      const result = verifyResendWebhookSignature({
        webhookSecret,
        rawBody,
        headers,
      });
      if (result.ok) {
        matches.push({ companyId: connection.companyId, connectionId: connection.id });
      }
    }

    if (matches.length === 1) return matches[0]!;
    return null;
  }

  private async updateConnectionDeliverySnapshot(
    connectionId: string,
    existingConfig: Record<string, unknown>,
    snapshot: {
      lastDeliveryAt: string | null;
      lastDeliveryStatus: ResendDeliveryStatus | null;
      lastDeliveryError: string | null;
    },
  ) {
    const connection = await this.deps.db.query.integrationConnections.findFirst({
      where: eq(integrationConnections.id, connectionId),
    });
    if (!connection) return;

    await this.deps.db
      .update(integrationConnections)
      .set({
        config: {
          ...connection.config,
          ...existingConfig,
          lastDeliveryAt: snapshot.lastDeliveryAt,
          lastDeliveryStatus: snapshot.lastDeliveryStatus,
          lastDeliveryError: snapshot.lastDeliveryError,
        },
        lastError:
          snapshot.lastDeliveryStatus === 'failed'
            ? snapshot.lastDeliveryError
            : connection.lastError,
        updatedAt: new Date(),
      })
      .where(eq(integrationConnections.id, connectionId));
  }

  private async finalizeWebhookEvent(
    id: string,
    update: { eventStatus: string; outcome: string; errorMessage?: string },
  ) {
    await this.deps.db
      .update(resendWebhookEvents)
      .set({
        eventStatus: update.eventStatus,
        outcome: update.outcome,
        errorMessage: update.errorMessage ?? null,
        processedAt: new Date(),
      })
      .where(eq(resendWebhookEvents.id, id));
  }

  private async writeAudit(
    companyId: string,
    action: string,
    entityType: string,
    entityId: string | null,
    metadata: Record<string, unknown>,
  ) {
    await this.deps.db.insert(securityAuditLogs).values({
      companyId,
      category: 'integrations',
      action,
      entityType,
      entityId,
      metadata,
    });
  }
}

type ParsedResendEvent = {
  id: string;
  type: string;
  emailId: string | null;
  createdAt: string | null;
  failureReason: string | null;
};

function parseResendEvent(rawBody: string): ParsedResendEvent {
  const parsed = JSON.parse(rawBody) as Record<string, unknown>;
  const type =
    (typeof parsed.type === 'string' && parsed.type) ||
    (typeof parsed.event === 'string' && parsed.event) ||
    '';
  if (!type) {
    throw new Error('Missing Resend event type');
  }

  const data = asRecord(parsed.data) ?? {};
  const emailId =
    pickString(data, ['email_id', 'emailId', 'id']) ??
    pickString(parsed, ['email_id', 'emailId']);

  const id =
    pickString(parsed, ['id']) ||
    emailId ||
    `${type}:${pickString(data, ['created_at', 'createdAt']) ?? Date.now()}`;

  const failureReason =
    pickString(data, ['bounce', 'reason', 'error', 'message']) ??
    (typeof data.failed === 'object' && data.failed
      ? pickString(asRecord(data.failed) ?? {}, ['message', 'reason'])
      : null);

  return {
    id,
    type,
    emailId,
    createdAt: pickString(parsed, ['created_at', 'createdAt']) ?? pickString(data, ['created_at']),
    failureReason,
  };
}

function mapWebhookToDeliveryStatus(
  eventType: string,
): ResendDeliveryStatus | 'ignored' {
  switch (eventType) {
    case 'email.sent':
      return 'sent';
    case 'email.delivered':
      return 'delivered';
    case 'email.bounced':
    case 'email.failed':
    case 'email.complained':
      return 'failed';
    case 'email.delivery_delayed':
    case 'email.opened':
    case 'email.clicked':
      return 'ignored';
    default:
      return 'ignored';
  }
}

function toDeliverySummary(
  row: typeof resendEmailDeliveries.$inferSelect,
): ResendDeliverySummary {
  const status =
    row.status === 'delivered' || row.status === 'failed' || row.status === 'sent'
      ? row.status
      : 'sent';

  return {
    id: row.id,
    purpose: row.purpose as ResendEmailPurpose,
    toEmail: row.toEmail,
    subject: row.subject,
    status,
    resendEmailId: row.resendEmailId,
    communicationId: row.communicationId,
    failureReason: row.failureReason,
    sentAt: row.sentAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    failedAt: row.failedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function sanitizeTagValue(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 256);
}

function mapSendError(error: unknown): string {
  if (error instanceof ResendError || error instanceof ResendEmailError) {
    return error.message;
  }
  return error instanceof Error ? error.message : 'Resend send failed';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}
