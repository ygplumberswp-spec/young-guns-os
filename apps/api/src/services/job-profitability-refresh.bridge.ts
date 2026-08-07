import type { BusinessEvent } from '../lib/automation-events.js';
import type { JobProfitabilityService } from './job-profitability.service.js';
import type { DatabaseClient } from '@titan/db';
import { invoices, purchaseOrders, quotes } from '@titan/db';
import { and, eq } from 'drizzle-orm';

/** Business events that may change job profitability when a job is linked. */
const PROFITABILITY_REFRESH_EVENT_TYPES = new Set<string>([
  'invoice.created',
  'payment.received',
  'quote.created',
  'job.material_used',
  'job.completed',
  'job.status_changed',
  'procurement.purchase_order_approved',
]);

export class JobProfitabilityRefreshBridge {
  constructor(
    private readonly db: DatabaseClient,
    private readonly profitabilityService: JobProfitabilityService,
  ) {}

  async handleBusinessEvent(event: BusinessEvent): Promise<void> {
    if (!PROFITABILITY_REFRESH_EVENT_TYPES.has(event.eventType)) {
      return;
    }

    const jobId = await this.resolveJobId(event);
    if (!jobId) {
      return;
    }

    try {
      await this.profitabilityService.recalculateJobProfitability(event.companyId, jobId, {
        includeSensitiveCosts: true,
      });
    } catch (error) {
      console.error('[job-profitability-refresh] snapshot refresh failed', {
        companyId: event.companyId,
        jobId,
        eventType: event.eventType,
        error,
      });
    }
  }

  private async resolveJobId(event: BusinessEvent): Promise<string | null> {
    const payload = event.payload;

    if (typeof payload.jobId === 'string' && payload.jobId) {
      return payload.jobId;
    }

    const job = payload.job as { id?: string } | undefined;
    if (job?.id) {
      return job.id;
    }

    if (event.eventType === 'job.completed' || event.eventType === 'job.status_changed') {
      return event.entityType === 'job' ? event.entityId : null;
    }

    if (event.eventType === 'job.material_used') {
      return typeof payload.jobId === 'string' ? payload.jobId : null;
    }

    if (event.entityType === 'invoice' || event.eventType === 'invoice.created') {
      const invoiceId =
        event.entityType === 'invoice'
          ? event.entityId
          : ((payload.invoice as { id?: string } | undefined)?.id ?? null);
      if (!invoiceId) return null;
      const row = await this.db.query.invoices.findFirst({
        where: and(eq(invoices.companyId, event.companyId), eq(invoices.id, invoiceId)),
        columns: { jobId: true },
      });
      return row?.jobId ?? null;
    }

    if (event.entityType === 'payment' || event.eventType === 'payment.received') {
      const invoicePayload = payload.invoice as { id?: string } | undefined;
      const paymentPayload = payload.payment as { invoiceId?: string } | undefined;
      const invoiceId = invoicePayload?.id ?? paymentPayload?.invoiceId ?? null;
      if (!invoiceId) return null;
      const row = await this.db.query.invoices.findFirst({
        where: and(eq(invoices.companyId, event.companyId), eq(invoices.id, invoiceId)),
        columns: { jobId: true },
      });
      return row?.jobId ?? null;
    }

    if (event.entityType === 'quote' || event.eventType === 'quote.created') {
      const quoteId =
        event.entityType === 'quote'
          ? event.entityId
          : ((payload.quote as { id?: string } | undefined)?.id ?? null);
      if (!quoteId) return null;
      const row = await this.db.query.quotes.findFirst({
        where: and(eq(quotes.companyId, event.companyId), eq(quotes.id, quoteId)),
        columns: { jobId: true },
      });
      return row?.jobId ?? null;
    }

    if (
      event.entityType === 'purchase_order' ||
      event.eventType === 'procurement.purchase_order_approved'
    ) {
      const poId =
        event.entityType === 'purchase_order'
          ? event.entityId
          : ((payload.purchaseOrder as { id?: string } | undefined)?.id ?? null);
      if (!poId) return null;
      const row = await this.db.query.purchaseOrders.findFirst({
        where: and(eq(purchaseOrders.companyId, event.companyId), eq(purchaseOrders.id, poId)),
        columns: { jobId: true },
      });
      return row?.jobId ?? null;
    }

    return null;
  }
}
