import { and, eq, inArray, asc } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import {
  integrationConnections,
  xeroEntityCoverage,
  xeroTargetedRefreshJobs,
  xeroWebhookEvents,
} from '@titan/db';
import {
  formatFinanceFreshnessLabel,
  type XeroFinanceFreshnessSummary,
  type XeroIncrementalQuoteRefreshResult,
  type XeroWebhookEventCategory,
} from '@titan/shared';
import {
  extractXeroSignatureHeader,
  verifyXeroWebhookSignature,
} from '../lib/xero-webhook-signing.js';
import type { XeroRateBudgetService } from './xero-rate-budget.service.js';
import type { XeroSyncService } from './xero-sync.service.js';

export type XeroWebhookInboundEvent = {
  resourceUrl: string;
  resourceId: string;
  eventDateUtc?: string;
  eventType: string;
  eventCategory: string;
  tenantId: string;
  tenantType: string;
};

export type XeroWebhookPayload = {
  events: XeroWebhookInboundEvent[];
  firstEventSequence?: number;
  lastEventSequence?: number;
  entropy?: string;
};

const SUPPORTED_CATEGORIES = new Set<XeroWebhookEventCategory>([
  'CONTACT',
  'INVOICE',
  'CREDITNOTE',
]);

export class XeroRealtimeIntersyncService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly xeroSyncService: XeroSyncService,
    private readonly rateBudget: XeroRateBudgetService,
    private readonly webhookKey: string | null,
    private readonly webhooksEnabled: boolean,
  ) {}

  static create(input: {
    db: DatabaseClient;
    xeroSyncService: XeroSyncService;
    rateBudget: XeroRateBudgetService;
    webhookKey: string | null;
    webhooksEnabled: boolean;
  }): XeroRealtimeIntersyncService {
    return new XeroRealtimeIntersyncService(
      input.db,
      input.xeroSyncService,
      input.rateBudget,
      input.webhookKey,
      input.webhooksEnabled,
    );
  }

  /** Intent-to-receive: 200 on valid signature, 401 on invalid. Processing is async. */
  async handleWebhook(input: {
    rawBody: string;
    headers: Record<string, string | string[] | undefined>;
  }): Promise<{ status: number; body: Record<string, unknown> }> {
    if (!this.webhooksEnabled) {
      return { status: 503, body: { error: { code: 'WEBHOOKS_DISABLED', message: 'Webhooks disabled' } } };
    }

    if (!this.webhookKey) {
      return { status: 503, body: { error: { code: 'WEBHOOK_NOT_CONFIGURED', message: 'Webhook key not configured' } } };
    }

    const verify = verifyXeroWebhookSignature({
      webhookKey: this.webhookKey,
      rawBody: input.rawBody,
      signatureHeader: extractXeroSignatureHeader(input.headers),
    });

    if (!verify.ok) {
      return { status: 401, body: { error: { code: 'INVALID_SIGNATURE', message: 'Invalid webhook signature' } } };
    }

    let payload: XeroWebhookPayload;
    try {
      payload = JSON.parse(input.rawBody) as XeroWebhookPayload;
    } catch {
      return { status: 400, body: { error: { code: 'INVALID_PAYLOAD', message: 'Invalid JSON payload' } } };
    }

    const events = Array.isArray(payload.events) ? payload.events : [];
    void this.recordAndQueueEvents(events, payload).catch((error: unknown) => {
      console.error('[xero-webhook] async processing failed', error);
    });

    return { status: 200, body: { received: events.length } };
  }

  private async recordAndQueueEvents(
    events: XeroWebhookInboundEvent[],
    envelope: XeroWebhookPayload,
  ): Promise<void> {
    for (const event of events) {
      const category = event.eventCategory?.toUpperCase() ?? '';
      if (!SUPPORTED_CATEGORIES.has(category as XeroWebhookEventCategory)) {
        continue;
      }

      const dedupeKey = [
        event.tenantId,
        category,
        event.eventType,
        event.resourceId,
        envelope.lastEventSequence ?? event.eventDateUtc ?? '',
      ].join(':');

      const companyId = await this.resolveCompanyIdForTenant(event.tenantId);

      try {
        await this.db.insert(xeroWebhookEvents).values({
          companyId,
          xeroTenantId: event.tenantId,
          dedupeKey,
          eventCategory: category,
          eventType: event.eventType,
          resourceId: event.resourceId,
          resourceUrl: event.resourceUrl,
          eventDateUtc: event.eventDateUtc ? new Date(event.eventDateUtc) : null,
          firstEventSequence: envelope.firstEventSequence ?? null,
          lastEventSequence: envelope.lastEventSequence ?? null,
          processingStatus: companyId ? 'queued' : 'ignored',
          payloadSummary: {
            tenantType: event.tenantType,
            resourceUrlHost: safeUrlHost(event.resourceUrl),
          },
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          continue;
        }
        throw error;
      }

      if (!companyId) continue;

      if (category === 'INVOICE') {
        await this.enqueueTargetedRefresh({
          companyId,
          entityType: 'invoice',
          xeroEntityId: event.resourceId,
          priority: 'webhook',
        });
      }
    }

    void this.processPendingJobs();
  }

  async enqueueTargetedRefresh(input: {
    companyId: string;
    entityType: 'invoice' | 'quote' | 'credit_note';
    xeroEntityId: string;
    priority: 'webhook' | 'write_confirm' | 'background';
  }): Promise<void> {
    const dedupeKey = `${input.companyId}:${input.entityType}:${input.xeroEntityId}:${input.priority}`;
    try {
      await this.db.insert(xeroTargetedRefreshJobs).values({
        companyId: input.companyId,
        entityType: input.entityType,
        xeroEntityId: input.xeroEntityId,
        priority: input.priority,
        status: 'pending',
        dedupeKey,
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }

  async processPendingJobs(limit = 10): Promise<number> {
    const jobs = await this.db
      .select()
      .from(xeroTargetedRefreshJobs)
      .where(inArray(xeroTargetedRefreshJobs.status, ['pending', 'retry']))
      .orderBy(asc(xeroTargetedRefreshJobs.scheduledAt))
      .limit(limit);

    let processed = 0;
    for (const job of jobs) {
      if (await this.rateBudget.isPaused(job.companyId)) {
        continue;
      }
      if (!this.rateBudget.acquireConcurrentSlot(job.companyId)) {
        continue;
      }

      try {
        await this.db
          .update(xeroTargetedRefreshJobs)
          .set({ status: 'running', startedAt: new Date() })
          .where(eq(xeroTargetedRefreshJobs.id, job.id));

        if (job.entityType === 'invoice') {
          const result = await this.xeroSyncService.refreshTargetedInvoiceFromXero(
            job.companyId,
            job.xeroEntityId,
          );
          await this.db
            .update(xeroTargetedRefreshJobs)
            .set({
              status: result.failed ? 'failed' : 'completed',
              completedAt: new Date(),
              resultEntityId: result.invoiceId,
              lastError: result.failed ? 'Targeted invoice refresh failed' : null,
            })
            .where(eq(xeroTargetedRefreshJobs.id, job.id));
        } else {
          await this.db
            .update(xeroTargetedRefreshJobs)
            .set({ status: 'completed', completedAt: new Date() })
            .where(eq(xeroTargetedRefreshJobs.id, job.id));
        }

        processed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Refresh failed';
        await this.db
          .update(xeroTargetedRefreshJobs)
          .set({
            status: 'failed',
            lastError: message,
            retryCount: job.retryCount + 1,
          })
          .where(eq(xeroTargetedRefreshJobs.id, job.id));
      } finally {
        this.rateBudget.releaseConcurrentSlot(job.companyId);
      }
    }

    return processed;
  }

  async refreshQuotesForCompany(companyId: string): Promise<XeroIncrementalQuoteRefreshResult> {
    if (await this.rateBudget.isPaused(companyId)) {
      return {
        refreshedAt: new Date().toISOString(),
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        delayed: true,
        label: formatFinanceFreshnessLabel({ state: 'delayed', lastRefreshedAt: null }),
      };
    }

    if (!this.rateBudget.acquireConcurrentSlot(companyId)) {
      return {
        refreshedAt: new Date().toISOString(),
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        delayed: true,
        label: 'Update delayed',
      };
    }

    try {
      const result = await this.xeroSyncService.refreshQuotesIncrementalFromXero(companyId, {
        maxPages: 2,
      });
      const refreshedAt = result.syncedAt ?? new Date().toISOString();
      return {
        refreshedAt,
        createdCount: result.createdCount,
        updatedCount: result.updatedCount,
        skippedCount: result.skippedCount,
        delayed: result.delayed,
        label: formatFinanceFreshnessLabel({ state: 'current', lastRefreshedAt: refreshedAt }),
      };
    } finally {
      this.rateBudget.releaseConcurrentSlot(companyId);
    }
  }

  async getFinanceFreshness(companyId: string): Promise<XeroFinanceFreshnessSummary> {
    const rows = await this.db.query.xeroEntityCoverage.findMany({
      where: eq(xeroEntityCoverage.companyId, companyId),
    });
    const quotes = rows.find((row) => row.entity === 'quotes');
    const invoices = rows.find((row) => row.entity === 'invoices');
    const paused = await this.rateBudget.isPaused(companyId);

    const quoteState = paused ? 'delayed' : quotes?.lastSyncedAt ? 'current' : 'never_synced';
    const invoiceState = paused ? 'delayed' : invoices?.lastSyncedAt ? 'current' : 'never_synced';

    return {
      quotes: {
        state: quoteState,
        lastRefreshedAt: quotes?.lastSyncedAt?.toISOString() ?? null,
        label: formatFinanceFreshnessLabel({
          state: quoteState,
          lastRefreshedAt: quotes?.lastSyncedAt?.toISOString() ?? null,
        }),
      },
      invoices: {
        state: invoiceState,
        lastRefreshedAt: invoices?.lastSyncedAt?.toISOString() ?? null,
        label: formatFinanceFreshnessLabel({
          state: invoiceState,
          lastRefreshedAt: invoices?.lastSyncedAt?.toISOString() ?? null,
        }),
      },
      connectionAttentionRequired: paused,
    };
  }

  private async resolveCompanyIdForTenant(xeroTenantId: string): Promise<string | null> {
    const connections = await this.db.query.integrationConnections.findMany({
      where: and(
        eq(integrationConnections.provider, 'xero'),
        eq(integrationConnections.status, 'connected'),
      ),
    });

    for (const connection of connections) {
      if (connection.config?.tenantId === xeroTenantId) {
        return connection.companyId;
      }
    }

    return null;
  }

  resetForTests(): void {
    this.rateBudget.resetForTests();
  }
}

function safeUrlHost(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    ('code' in error ? (error as { code?: string }).code === '23505' : /unique/i.test(error.message))
  );
}
