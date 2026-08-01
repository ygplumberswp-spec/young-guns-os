import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import type {
  CreateInvoiceFromQuoteRequest,
  CreateInvoiceRequest,
  CreatePaymentRequest,
  CreateQuoteRequest,
  CreateQuoteVersionRequest,
  FinanceListQuery,
  FinanceStats,
  InvoiceDetail,
  InvoiceSummary,
  JobFinanceChip,
  JobFinanceSummary,
  JobListFinanceSnapshot,
  PaymentDetail,
  PaymentSummary,
  QuoteDetail,
  QuoteSummary,
  UpdateQuoteRequest,
} from '@titan/shared';
import {
  calculateLineAmounts,
  calculateQuoteProfit,
  displayInvoiceNumber,
  formatInternalInvoiceNumber,
  formatMoney,
  resolveEffectiveInvoiceOutstandingCents,
  resolveEffectiveInvoiceTotalCents,
  deriveJobListFinanceSnapshot,
  deriveJobPaymentLedger,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  companyFinanceSettings,
  companies,
  customers,
  invoiceLineItems,
  invoices,
  jobs,
  paymentReceipts,
  payments,
  quoteLineItems,
  quotes,
  securityAuditLogs,
  xeroInvoiceMappings,
} from '@titan/db';
import { emitBusinessEvent } from '../lib/automation-events.js';
import { buildTenantCacheKey, cachedTenantRead, CACHE_TTLS } from './api-read-cache.js';

const OPEN_QUOTE_STATUSES = ['draft', 'sent'] as const;

export class FinanceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FinanceError';
  }
}

export type AuraFinanceContext = {
  openQuoteCount: number;
  revenueMtdCents: number;
  currency: string;
  quoteCount: number;
  invoiceCount: number;
  paymentCount: number;
  recentQuotes: Array<{
    id: string;
    quoteNumber: string;
    title: string;
    status: string;
    customerName: string;
    amountCents: number;
    currency: string;
  }>;
  recentInvoices: Array<{
    id: string;
    invoiceNumber: string;
    title: string;
    status: string;
    customerName: string;
    amountCents: number;
    amountPaidCents: number;
    currency: string;
  }>;
  recentPayments: Array<{
    id: string;
    invoiceNumber: string;
    customerName: string;
    amountCents: number;
    currency: string;
    paidAt: string;
  }>;
};

/** Auth context passed by finance routes. String company IDs remain supported for legacy callers. */
export type FinanceActor = {
  companyId: string;
  userId?: string;
  permissions?: string[];
  roleName?: string | null;
  canWrite?: boolean;
};

export class FinanceService {
  constructor(private readonly db: DatabaseClient) {}

  async listQuotes(companyId: string, query: FinanceListQuery = {}): Promise<QuoteSummary[]> {
    const rows = await this.db.query.quotes.findMany({
      where: and(eq(quotes.companyId, companyId), query.status ? eq(quotes.status, query.status as typeof quotes.status.enumValues[number]) : undefined, query.q ? or(ilike(quotes.quoteNumber, `%${query.q}%`), ilike(quotes.title, `%${query.q}%`)) : undefined),
      with: { customer: true, job: true },
      orderBy: [desc(quotes.updatedAt)],
    });

    return rows.map((row) => toQuoteSummary(row));
  }

  async listInvoices(companyId: string, query: FinanceListQuery = {}): Promise<InvoiceSummary[]> {
    const rows = await this.db.query.invoices.findMany({
      where: and(eq(invoices.companyId, companyId), query.status ? eq(invoices.status, query.status as typeof invoices.status.enumValues[number]) : undefined, query.overdueOnly ? and(lte(invoices.dueDate, new Date()), inArray(invoices.status, ['sent', 'partial', 'overdue'])) : undefined, query.q ? or(ilike(invoices.invoiceNumber, `%${query.q}%`), ilike(invoices.internalNumber, `%${query.q}%`), ilike(invoices.xeroInvoiceNumber, `%${query.q}%`), ilike(invoices.title, `%${query.q}%`)) : undefined),
      with: { customer: true, job: true, quote: true },
      orderBy: [desc(invoices.updatedAt)],
    });

    const mappings =
      rows.length > 0
        ? await this.db
            .select({
              id: xeroInvoiceMappings.id,
              companyId: xeroInvoiceMappings.companyId,
              invoiceId: xeroInvoiceMappings.invoiceId,
              xeroInvoiceId: xeroInvoiceMappings.xeroInvoiceId,
              xeroInvoiceNumber: xeroInvoiceMappings.xeroInvoiceNumber,
              xeroReference: xeroInvoiceMappings.xeroReference,
              syncStatus: xeroInvoiceMappings.syncStatus,
              lastSyncedAt: xeroInvoiceMappings.lastSyncedAt,
              lastSuccessfulSyncAt: xeroInvoiceMappings.lastSuccessfulSyncAt,
              lastError: xeroInvoiceMappings.lastError,
            })
            .from(xeroInvoiceMappings)
            .where(
              and(
                eq(xeroInvoiceMappings.companyId, companyId),
                inArray(
                  xeroInvoiceMappings.invoiceId,
                  rows.map((row) => row.id),
                ),
              ),
            )
        : [];
    const mappingByInvoiceId = new Map(mappings.map((mapping) => [mapping.invoiceId, mapping]));

    return rows.map((row) => toInvoiceSummary(row, mappingByInvoiceId.get(row.id)));
  }

  async listPayments(companyId: string, query: FinanceListQuery = {}): Promise<PaymentSummary[]> {
    const rows = await this.db.query.payments.findMany({
      where: and(eq(payments.companyId, companyId), query.q ? or(ilike(payments.reference, `%${query.q}%`), ilike(payments.notes, `%${query.q}%`)) : undefined),
      with: {
        invoice: {
          with: { customer: true },
        },
      },
      orderBy: [desc(payments.paidAt)],
    });

    return rows.map(toPaymentSummary);
  }

  async ensureFinanceSettings(companyId: string) {
    const [settings] = await this.db
      .insert(companyFinanceSettings)
      .values({ companyId, currency: 'ZAR', defaultVatRateBps: 1500, profitFloorMarginBps: 2000 })
      .onConflictDoNothing()
      .returning();
    return settings ?? (await this.db.query.companyFinanceSettings.findFirst({
      where: eq(companyFinanceSettings.companyId, companyId),
    }))!;
  }

  async createQuote(actorOrCompany: FinanceActor | string, input: CreateQuoteRequest): Promise<QuoteSummary> {
    const actor = toActor(actorOrCompany);
    const { companyId } = actor;
    const title = input.title?.trim() || 'Quote';
    if (!input.lineItems?.length && (!input.amountCents || input.amountCents <= 0)) {
      throw new FinanceError('VALIDATION_ERROR', 'Quote line items or amount must be greater than zero');
    }
    await this.ensureCustomerBelongsToCompany(companyId, input.customerId);
    if (input.jobId) await this.ensureJobBelongsToCompany(companyId, input.jobId, input.customerId);
    if (input.clientActionId) {
      const existing = await this.db.query.quotes.findFirst({ where: and(eq(quotes.companyId, companyId), eq(quotes.clientActionId, input.clientActionId)), with: { customer: true, job: true } });
      if (existing) return toQuoteSummary(existing);
    }
    const settings = await this.ensureFinanceSettings(companyId);
    const computed = quoteAmounts(input.lineItems ?? legacyQuoteLines(input.amountCents!, settings.defaultVatRateBps), settings.profitFloorMarginBps, input.discountCents ?? 0);
    this.assertFloor(actor, computed.profit.belowFloor, input.belowFloorOverride, input.belowFloorReason, settings.allowBelowFloorWithOverride);
    const [created] = await this.db.insert(quotes).values({
      companyId, customerId: input.customerId, jobId: input.jobId ?? null, propertyId: input.propertyId ?? null,
      leadId: input.leadId ?? null, estimatorUserId: input.estimatorUserId ?? actor.userId ?? null,
      quoteNumber: await this.nextQuoteNumber(companyId), title, status: input.status ?? 'draft',
      amountCents: computed.totalCents, subtotalCents: computed.subtotalCents, vatCents: computed.vatCents,
      totalCents: computed.totalCents, estimatedCostCents: computed.profit.estimatedCostCents,
      grossProfitCents: computed.profit.grossProfitCents, markupBps: computed.profit.markupBps,
      marginBps: computed.profit.marginBps, profitFloorCents: computed.profit.profitFloorCents,
      targetPriceCents: computed.profit.targetPriceCents, discountCents: input.discountCents ?? 0,
      belowFloorOverride: Boolean(input.belowFloorOverride), belowFloorReason: normalizeOptionalText(input.belowFloorReason),
      belowFloorAuthorizedBy: input.belowFloorOverride ? actor.userId ?? null : null, currency: input.currency?.trim() || settings.currency,
      validUntil: parseOptionalDate(input.validUntil), scopeOfWork: normalizeOptionalText(input.scopeOfWork), exclusions: normalizeOptionalText(input.exclusions),
      assumptions: normalizeOptionalText(input.assumptions), customerNotes: normalizeOptionalText(input.customerNotes),
      internalNotes: normalizeOptionalText(input.internalNotes), paymentTerms: normalizeOptionalText(input.paymentTerms),
      depositPercent: input.depositPercent ?? null, optionTier: normalizeOptionalText(input.optionTier), notes: normalizeOptionalText(input.notes),
      clientActionId: normalizeOptionalText(input.clientActionId),
    }).returning();
    if (!created) throw new FinanceError('CREATE_FAILED', 'Unable to create quote');
    await this.insertQuoteLines(created.id, companyId, computed.lines);
    emitBusinessEvent({ companyId, eventType: 'quote.created', entityType: 'quote', entityId: created.id, payload: { quote: { id: created.id, status: created.status, customerId: created.customerId, amountCents: created.amountCents }, customerId: created.customerId } });
    return (await this.getQuote(companyId, created.id))!;
  }

  async createInvoice(actorOrCompany: FinanceActor | string, input: CreateInvoiceRequest): Promise<InvoiceSummary> {
    const actor = toActor(actorOrCompany);
    const companyId = actor.companyId;
    const title = input.title.trim();

    if (!title) {
      throw new FinanceError('VALIDATION_ERROR', 'Invoice title is required');
    }

    if ((!input.lineItems?.length && !input.amountCents) || (input.amountCents ?? 0) <= 0 && !input.lineItems?.length) {
      throw new FinanceError('VALIDATION_ERROR', 'Invoice amount must be greater than zero');
    }

    await this.ensureCustomerBelongsToCompany(companyId, input.customerId);

    if (input.jobId) {
      await this.ensureJobBelongsToCompany(companyId, input.jobId, input.customerId);
    }

    if (input.quoteId) {
      await this.ensureQuoteBelongsToCompany(companyId, input.quoteId, input.customerId);
    }

    if (input.clientActionId) {
      const existing = await this.db.query.invoices.findFirst({ where: and(eq(invoices.companyId, companyId), eq(invoices.clientActionId, input.clientActionId)), with: { customer: true, job: true, quote: true } });
      if (existing) return toInvoiceSummary(existing);
    }
    const settings = await this.ensureFinanceSettings(companyId);
    const computed = quoteAmounts(input.lineItems ?? legacyQuoteLines(input.amountCents!, settings.defaultVatRateBps), settings.profitFloorMarginBps, 0);
    const invoiceNumber = await this.nextInvoiceNumber(companyId);

    const [created] = await this.db
      .insert(invoices)
      .values({
        companyId,
        customerId: input.customerId,
        jobId: input.jobId ?? null,
        quoteId: input.quoteId ?? null,
        propertyId: input.propertyId ?? null,
        invoiceNumber,
        internalNumber: invoiceNumber,
        numberAuthority: 'internal_pending_xero',
        title,
        status: input.status ?? 'draft',
        stage: input.stage ?? 'standard',
        amountCents: computed.totalCents,
        subtotalCents: computed.subtotalCents,
        vatCents: computed.vatCents,
        totalCents: computed.totalCents,
        currency: input.currency?.trim() || settings.currency,
        dueDate: parseOptionalDate(input.dueDate),
        issuedAt: parseOptionalDate(input.issuedAt) ?? new Date(),
        paymentTerms: normalizeOptionalText(input.paymentTerms),
        notes: normalizeOptionalText(input.notes),
        clientActionId: normalizeOptionalText(input.clientActionId),
      })
      .returning();

    if (!created) {
      throw new FinanceError('CREATE_FAILED', 'Unable to create invoice');
    }
    await this.insertInvoiceLines(created.id, companyId, computed.lines);

    const invoice = (await this.getInvoice(companyId, created.id))!;

    emitBusinessEvent({
      companyId,
      eventType: 'invoice.created',
      entityType: 'invoice',
      entityId: created.id,
      payload: {
        invoice: {
          id: created.id,
          status: created.status,
          customerId: created.customerId,
          amountCents: created.amountCents,
          dueDate: created.dueDate?.toISOString() ?? null,
        },
        customerId: created.customerId,
      },
    });

    return invoice;
  }

  async createPayment(actorOrCompany: FinanceActor | string, input: CreatePaymentRequest): Promise<PaymentSummary> {
    const actor = toActor(actorOrCompany);
    const companyId = actor.companyId;
    if (input.amountCents <= 0) {
      throw new FinanceError('VALIDATION_ERROR', 'Payment amount must be greater than zero');
    }
    if (input.clientActionId) {
      const existing = await this.db.query.payments.findFirst({ where: and(eq(payments.companyId, companyId), eq(payments.clientActionId, input.clientActionId)), with: { invoice: { with: { customer: true } } } });
      if (existing) return toPaymentSummary(existing);
    }

    const invoice = await this.db.query.invoices.findFirst({
      where: and(eq(invoices.id, input.invoiceId), eq(invoices.companyId, companyId)),
    });

    if (!invoice) {
      throw new FinanceError('NOT_FOUND', 'Invoice not found');
    }

    if (invoice.status === 'cancelled') {
      throw new FinanceError(
        'VALIDATION_ERROR',
        'Cannot record payment against a cancelled invoice',
      );
    }

    const currency = input.currency?.trim() || invoice.currency;
    const paidAt = input.paidAt ? parseRequiredDate(input.paidAt) : new Date();

    const result = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(payments)
        .values({
          companyId,
          invoiceId: invoice.id,
          amountCents: input.amountCents,
          currency,
          method: input.method ?? 'other',
          reference: normalizeOptionalText(input.reference),
          paidAt,
          notes: normalizeOptionalText(input.notes),
          clientActionId: normalizeOptionalText(input.clientActionId),
          recordedByUserId: actor.userId ?? null,
        })
        .returning();

      if (!created) {
        throw new FinanceError('CREATE_FAILED', 'Unable to create payment');
      }

      const nextPaid = invoice.amountPaidCents + input.amountCents;
      const nextStatus =
        nextPaid >= invoice.amountCents ? 'paid' : nextPaid > 0 ? 'partial' : invoice.status;

      await tx
        .update(invoices)
        .set({
          amountPaidCents: nextPaid,
          status: nextStatus,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, invoice.id));

      const [receiptCount] = await tx.select({ count: sql<number>`count(*)::int` }).from(paymentReceipts).where(eq(paymentReceipts.companyId, companyId));
      await tx.insert(paymentReceipts).values({ companyId, paymentId: created.id, invoiceId: invoice.id, receiptNumber: `RCP-${String((receiptCount?.count ?? 0) + 1).padStart(6, '0')}`, payload: { amountCents: created.amountCents, reference: created.reference } });
      return { payment: created, nextStatus };
    });

    const payment = (await this.getPayment(companyId, result.payment.id))!;

    emitBusinessEvent({
      companyId,
      eventType: 'payment.received',
      entityType: 'payment',
      entityId: result.payment.id,
      payload: {
        payment: {
          id: result.payment.id,
          invoiceId: invoice.id,
          amountCents: result.payment.amountCents,
        },
        invoice: {
          id: invoice.id,
          status: result.nextStatus,
          customerId: invoice.customerId,
          amountCents: invoice.amountCents,
        },
        customerId: invoice.customerId,
      },
    });
    await this.db.insert(securityAuditLogs).values({ companyId, category: 'security', action: 'payment_recorded', entityType: 'payment', entityId: result.payment.id, userId: actor.userId ?? null, metadata: { invoiceId: invoice.id, amountCents: input.amountCents } });

    return payment;
  }

  async getQuoteDetail(companyId: string, quoteId: string, options: { includeProfit?: boolean } = {}): Promise<QuoteDetail | null> {
    const row = await this.db.query.quotes.findFirst({ where: and(eq(quotes.id, quoteId), eq(quotes.companyId, companyId)), with: { customer: true, job: true, lineItems: true, acceptances: true } });
    if (!row) return null;
    const profit = options.includeProfit ? profitFromQuote(row) : null;
    return {
      ...toQuoteSummary(row, profit), scopeOfWork: row.scopeOfWork, exclusions: row.exclusions, assumptions: row.assumptions,
      customerNotes: row.customerNotes, internalNotes: options.includeProfit ? row.internalNotes : null, paymentTerms: row.paymentTerms,
      depositPercent: row.depositPercent, optionTier: row.optionTier, discountCents: row.discountCents,
      belowFloorOverride: row.belowFloorOverride, belowFloorReason: options.includeProfit ? row.belowFloorReason : null,
      lineItems: row.lineItems.map((line) => ({
        id: line.id, position: line.position, category: line.category, description: line.description, quantity: Number(line.quantity),
        unitPriceCents: line.unitPriceCents, unitCostCents: options.includeProfit ? line.unitCostCents : null, vatRateBps: line.vatRateBps,
        lineSubtotalCents: line.lineSubtotalCents, lineVatCents: line.lineVatCents, lineTotalCents: line.lineTotalCents,
        lineCostCents: options.includeProfit ? line.lineCostCents : null, isOptional: line.isOptional, optionTier: line.optionTier,
      })), acceptance: row.acceptances[0] ? acceptanceSummary(row.acceptances[0]) : null, xeroQuoteId: row.xeroQuoteId,
    };
  }

  async updateQuote(actorOrCompany: FinanceActor | string, quoteId: string, input: UpdateQuoteRequest): Promise<QuoteSummary> {
    const actor = toActor(actorOrCompany);
    const current = await this.db.query.quotes.findFirst({ where: and(eq(quotes.id, quoteId), eq(quotes.companyId, actor.companyId)) });
    if (!current) throw new FinanceError('NOT_FOUND', 'Quote not found');
    if (current.isImmutable) throw new FinanceError('VALIDATION_ERROR', 'Issued quotes are immutable; create a version');
    const settings = await this.ensureFinanceSettings(actor.companyId);
    const computed = input.lineItems ? quoteAmounts(input.lineItems, settings.profitFloorMarginBps, input.discountCents ?? current.discountCents) : null;
    if (computed) this.assertFloor(actor, computed.profit.belowFloor, input.belowFloorOverride, input.belowFloorReason, settings.allowBelowFloorWithOverride);
    await this.db.update(quotes).set({
      title: input.title?.trim() || current.title,
      status: input.status ?? current.status,
      jobId: input.jobId === undefined ? current.jobId : input.jobId,
      currency: input.currency?.trim() || current.currency,
      validUntil: input.validUntil === undefined ? current.validUntil : parseOptionalDate(input.validUntil),
      notes: input.notes === undefined ? current.notes : normalizeOptionalText(input.notes),
      scopeOfWork: input.scopeOfWork === undefined ? current.scopeOfWork : normalizeOptionalText(input.scopeOfWork),
      exclusions: input.exclusions === undefined ? current.exclusions : normalizeOptionalText(input.exclusions),
      assumptions: input.assumptions === undefined ? current.assumptions : normalizeOptionalText(input.assumptions),
      internalNotes: input.internalNotes === undefined ? current.internalNotes : normalizeOptionalText(input.internalNotes),
      paymentTerms: input.paymentTerms === undefined ? current.paymentTerms : normalizeOptionalText(input.paymentTerms),
      belowFloorOverride: input.belowFloorOverride === undefined ? current.belowFloorOverride : Boolean(input.belowFloorOverride),
      belowFloorReason: input.belowFloorReason === undefined ? current.belowFloorReason : normalizeOptionalText(input.belowFloorReason),
      belowFloorAuthorizedBy:
        input.belowFloorOverride === undefined
          ? current.belowFloorAuthorizedBy
          : input.belowFloorOverride
            ? actor.userId ?? null
            : null,
      ...computed && { amountCents: computed.totalCents, subtotalCents: computed.subtotalCents, vatCents: computed.vatCents, totalCents: computed.totalCents, estimatedCostCents: computed.profit.estimatedCostCents, grossProfitCents: computed.profit.grossProfitCents, markupBps: computed.profit.markupBps, marginBps: computed.profit.marginBps, profitFloorCents: computed.profit.profitFloorCents, targetPriceCents: computed.profit.targetPriceCents },
      updatedAt: new Date(),
    }).where(eq(quotes.id, quoteId));
    if (computed) { await this.db.delete(quoteLineItems).where(eq(quoteLineItems.quoteId, quoteId)); await this.insertQuoteLines(quoteId, actor.companyId, computed.lines); }
    return (await this.getQuote(actor.companyId, quoteId))!;
  }

  async issueQuote(actorOrCompany: FinanceActor | string, quoteId: string): Promise<QuoteSummary> {
    const actor = toActor(actorOrCompany); const quote = await this.db.query.quotes.findFirst({ where: and(eq(quotes.id, quoteId), eq(quotes.companyId, actor.companyId)) });
    if (!quote) throw new FinanceError('NOT_FOUND', 'Quote not found');
    if (quote.isImmutable) throw new FinanceError('VALIDATION_ERROR', 'Quote is already issued');
    if (quote.status !== 'approved_for_sending') {
      throw new FinanceError('VALIDATION_ERROR', 'Quote must be approved for sending before issue');
    }
    this.assertFloor(actor, quote.totalCents < quote.profitFloorCents && quote.estimatedCostCents > 0, quote.belowFloorOverride, quote.belowFloorReason, true);
    await this.db.update(quotes).set({ status: 'sent', isImmutable: true, issuedAt: new Date(), updatedAt: new Date() }).where(eq(quotes.id, quoteId));
    return (await this.getQuote(actor.companyId, quoteId))!;
  }

  async createQuoteVersion(actorOrCompany: FinanceActor | string, quoteId: string, input: CreateQuoteVersionRequest): Promise<QuoteSummary> {
    const actor = toActor(actorOrCompany);
    const source = await this.db.query.quotes.findFirst({ where: and(eq(quotes.id, quoteId), eq(quotes.companyId, actor.companyId)), with: { lineItems: true } });
    if (!source) throw new FinanceError('NOT_FOUND', 'Quote not found');
    const replay = await this.db.query.quotes.findFirst({ where: and(eq(quotes.companyId, actor.companyId), eq(quotes.clientActionId, input.clientActionId)), with: { customer: true, job: true } });
    if (replay) return toQuoteSummary(replay);
    const next = await this.createQuote(actor, { customerId: source.customerId, jobId: source.jobId, propertyId: source.propertyId, leadId: source.leadId, title: source.title, currency: source.currency, validUntil: source.validUntil?.toISOString() ?? null, lineItems: source.lineItems.map(line => ({ category: line.category, description: line.description, quantity: Number(line.quantity), unitPriceCents: line.unitPriceCents, unitCostCents: line.unitCostCents, vatRateBps: line.vatRateBps, isOptional: line.isOptional, optionTier: line.optionTier })), clientActionId: input.clientActionId, notes: input.reason ?? source.notes, belowFloorOverride: source.belowFloorOverride, belowFloorReason: source.belowFloorReason });
    await this.db.update(quotes).set({ rootQuoteId: source.rootQuoteId ?? source.id, supersedesQuoteId: source.id, versionNumber: source.versionNumber + 1 }).where(eq(quotes.id, next.id));
    await this.db.update(quotes).set({ status: 'superseded', updatedAt: new Date() }).where(eq(quotes.id, source.id));
    return (await this.getQuote(actor.companyId, next.id))!;
  }

  async createInvoiceFromQuote(actorOrCompany: FinanceActor | string, quoteId: string, input: CreateInvoiceFromQuoteRequest): Promise<InvoiceSummary> {
    const actor = toActor(actorOrCompany);
    const quote = await this.db.query.quotes.findFirst({ where: and(eq(quotes.id, quoteId), eq(quotes.companyId, actor.companyId)), with: { lineItems: true, job: true } });
    if (!quote) throw new FinanceError('NOT_FOUND', 'Quote not found');
    if (quote.status !== 'accepted') throw new FinanceError('VALIDATION_ERROR', 'Only accepted quotes can be invoiced');
    const lines = quote.lineItems.map(line => ({ category: line.category, description: line.description, quantity: Number(line.quantity), unitPriceCents: line.unitPriceCents, vatRateBps: line.vatRateBps }));
    const invoice = await this.createInvoice(actor, { customerId: quote.customerId, jobId: quote.jobId, quoteId: quote.id, propertyId: quote.propertyId, title: quote.title, stage: input.stage, dueDate: input.dueDate, notes: input.notes, amountCents: input.amountCents ?? quote.totalCents, lineItems: lines, clientActionId: input.clientActionId });
    await this.db.update(invoices).set({ quoteVersionNumber: quote.versionNumber, xeroReference: quote.job?.jobNumber ?? null }).where(eq(invoices.id, invoice.id));
    if (input.stage === 'final' || !quote.lineItems.length) await this.db.update(quotes).set({ status: 'converted', updatedAt: new Date() }).where(eq(quotes.id, quote.id));
    return (await this.getInvoice(actor.companyId, invoice.id))!;
  }

  async createInvoiceFromJob(actorOrCompany: FinanceActor | string, jobId: string, input: CreateInvoiceFromQuoteRequest): Promise<InvoiceSummary> {
    const actor = toActor(actorOrCompany);
    const job = await this.db.query.jobs.findFirst({ where: and(eq(jobs.id, jobId), eq(jobs.companyId, actor.companyId)) });
    if (!job) throw new FinanceError('JOB_NOT_FOUND', 'Job not found');
    const acceptedQuote = await this.db.query.quotes.findFirst({
      where: and(eq(quotes.companyId, actor.companyId), eq(quotes.jobId, jobId), eq(quotes.status, 'accepted')),
      orderBy: [desc(quotes.updatedAt)],
    });
    if (!acceptedQuote) {
      throw new FinanceError(
        'VALIDATION_ERROR',
        'No accepted quote is linked to this job — accept a quote before creating an invoice',
      );
    }
    return this.createInvoiceFromQuote(actor, acceptedQuote.id, input);
  }

  async getInvoiceDetail(companyId: string, invoiceId: string): Promise<InvoiceDetail | null> {
    const row = await this.db.query.invoices.findFirst({ where: and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)), with: { customer: true, job: true, quote: true, lineItems: true, payments: { with: { invoice: { with: { customer: true } } } } } });
    if (!row) return null;
    return { ...toInvoiceSummary(row), subtotalCents: row.subtotalCents, vatCents: row.vatCents, paymentTerms: row.paymentTerms, billingName: row.billingName, billingEmail: row.billingEmail, billingPhone: row.billingPhone, notes: row.notes, lineItems: row.lineItems.map(line => ({ id: line.id, position: line.position, category: line.category, description: line.description, quantity: Number(line.quantity), unitPriceCents: line.unitPriceCents, vatRateBps: line.vatRateBps, lineSubtotalCents: line.lineSubtotalCents, lineVatCents: line.lineVatCents, lineTotalCents: line.lineTotalCents })), payments: row.payments.map(toPaymentSummary) };
  }

  async getPaymentDetail(companyId: string, paymentId: string): Promise<PaymentDetail | null> {
    const row = await this.db.query.payments.findFirst({ where: and(eq(payments.id, paymentId), eq(payments.companyId, companyId)), with: { invoice: { with: { customer: true } }, receipt: true } });
    if (!row) return null;
    return { ...toPaymentSummary(row), notes: row.notes, receipt: row.receipt ? { id: row.receipt.id, receiptNumber: row.receipt.receiptNumber, issuedAt: row.receipt.issuedAt.toISOString(), payload: row.receipt.payload } : null };
  }

  async getJobFinanceSummary(companyId: string, jobId: string, options: { includeProfit?: boolean } = {}): Promise<JobFinanceSummary> {
    const [quoteRows, invoiceRows, paymentRows] = await Promise.all([
      this.db.query.quotes.findMany({ where: and(eq(quotes.companyId, companyId), eq(quotes.jobId, jobId)), with: { customer: true, job: true } }),
      this.db.query.invoices.findMany({ where: and(eq(invoices.companyId, companyId), eq(invoices.jobId, jobId)), with: { customer: true, job: true, quote: true } }),
      this.db.query.payments.findMany({ where: and(eq(payments.companyId, companyId), sql`exists (select 1 from invoices where invoices.id = ${payments.invoiceId} and invoices.job_id = ${jobId})`), with: { invoice: { with: { customer: true } } } }),
    ]);
    const quotesOut = quoteRows.map(row => toQuoteSummary(row, options.includeProfit ? profitFromQuote(row) : null));
    const invoicesOut = invoiceRows.map((row) => toInvoiceSummary(row)); const paymentsOut = paymentRows.map(toPaymentSummary);
    const currency = quotesOut[0]?.currency ?? invoicesOut[0]?.currency ?? 'ZAR';
    const quotedCents = quotesOut.reduce((sum, item) => sum + item.totalCents, 0);
    const accepted = quotesOut.find((item) => item.status === 'accepted') ?? null;
    const invoicedCents = invoicesOut.reduce((sum, item) => sum + item.totalCents, 0);
    const paidCents = paymentsOut.reduce((sum, item) => sum + item.amountCents, 0);
    const outstanding = invoicesOut.reduce((sum, item) => sum + item.outstandingCents, 0);
    const overdueCount = invoicesOut.filter((item) => item.isOverdue).length;
    const chips: JobFinanceChip[] = [
      {
        kind: 'quoted',
        label: 'Quoted',
        value: formatMoney(quotedCents, currency),
        href: quotesOut[0] ? `/finance/quotes/${quotesOut[0].id}` : null,
      },
      {
        kind: 'accepted',
        label: 'Accepted',
        value: accepted ? formatMoney(accepted.totalCents, currency) : '—',
        href: accepted ? `/finance/quotes/${accepted.id}` : null,
      },
      {
        kind: 'invoiced',
        label: 'Invoiced',
        value: formatMoney(invoicedCents, currency),
        href: invoicesOut[0] ? `/finance/invoices/${invoicesOut[0].id}` : null,
      },
      {
        kind: 'paid',
        label: 'Paid',
        value: formatMoney(paidCents, currency),
        href: paymentsOut[0] ? `/finance/payments/${paymentsOut[0].id}` : null,
      },
      {
        kind: 'outstanding',
        label: 'Outstanding',
        value: formatMoney(outstanding, currency),
        href: invoicesOut.find((item) => item.outstandingCents > 0)
          ? `/finance/invoices/${invoicesOut.find((item) => item.outstandingCents > 0)!.id}`
          : null,
      },
    ];
    if (overdueCount > 0) {
      chips.push({
        kind: 'overdue',
        label: 'Overdue',
        value: String(overdueCount),
        href: `/finance/invoices?overdueOnly=true`,
      });
    }
    if (options.includeProfit) {
      const withProfit = quotesOut.find((item) => item.profit);
      if (withProfit?.profit) {
        chips.push({
          kind: 'profit',
          label: 'Margin',
          value: `${(withProfit.profit.marginBps / 100).toFixed(1)}%`,
          href: `/finance/quotes/${withProfit.id}`,
          internalOnly: true,
        });
      }
    }
    return {
      jobId,
      quotes: quotesOut,
      invoices: invoicesOut,
      payments: paymentsOut,
      chips,
      ledger: deriveJobPaymentLedger({
        quotes: quotesOut,
        invoices: invoicesOut,
        payments: paymentsOut,
        currency,
      }),
    };
  }

  /** Batch payment ledger snapshots for job list enrichment (integer cents, tenant-scoped). */
  async batchJobFinanceSnapshots(companyId: string, jobIds: string[]): Promise<Map<string, JobListFinanceSnapshot>> {
    const result = new Map<string, JobListFinanceSnapshot>();
    if (jobIds.length === 0) return result;

    const [quoteRows, invoiceRows] = await Promise.all([
      this.db.query.quotes.findMany({
        where: and(eq(quotes.companyId, companyId), inArray(quotes.jobId, jobIds)),
        with: { customer: true, job: true },
        orderBy: [desc(quotes.updatedAt)],
      }),
      this.db.query.invoices.findMany({
        where: and(eq(invoices.companyId, companyId), inArray(invoices.jobId, jobIds)),
        with: { customer: true, job: true, quote: true },
        orderBy: [desc(invoices.updatedAt)],
      }),
    ]);

    const invoiceIds = invoiceRows.map((row) => row.id);
    const paymentRows =
      invoiceIds.length > 0
        ? await this.db.query.payments.findMany({
            where: and(eq(payments.companyId, companyId), inArray(payments.invoiceId, invoiceIds)),
            with: { invoice: { with: { customer: true } } },
            orderBy: [desc(payments.paidAt)],
          })
        : [];

    const quotesByJob = groupRowsByJobId(quoteRows);
    const invoicesByJob = groupRowsByJobId(invoiceRows);
    const paymentsByJob = new Map<string, PaymentSummary[]>();

    for (const paymentRow of paymentRows) {
      const jobId = paymentRow.invoice?.jobId;
      if (!jobId) continue;
      const list = paymentsByJob.get(jobId) ?? [];
      list.push(toPaymentSummary(paymentRow));
      paymentsByJob.set(jobId, list);
    }

    for (const jobId of jobIds) {
      const quotesOut = (quotesByJob.get(jobId) ?? []).map((row) => toQuoteSummary(row));
      const invoicesOut = (invoicesByJob.get(jobId) ?? []).map((row) => toInvoiceSummary(row));
      const paymentsOut = paymentsByJob.get(jobId) ?? [];
      result.set(
        jobId,
        deriveJobListFinanceSnapshot({
          quotes: quotesOut,
          invoices: invoicesOut,
          payments: paymentsOut,
        }),
      );
    }

    return result;
  }

  async getStats(companyId: string): Promise<FinanceStats> {
    return cachedTenantRead(
      buildTenantCacheKey(companyId, 'finance/stats'),
      async () => {
        const [openQuotesRow] = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(quotes)
          .where(
            and(eq(quotes.companyId, companyId), inArray(quotes.status, [...OPEN_QUOTE_STATUSES])),
          );

        const [invoiceCountRow] = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(invoices)
          .where(eq(invoices.companyId, companyId));

        const [paymentCountRow] = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(payments)
          .where(eq(payments.companyId, companyId));

        const monthStart = startOfMonth(new Date());

        const [revenueRow] = await this.db
          .select({ total: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
          .from(payments)
          .where(and(eq(payments.companyId, companyId), gte(payments.paidAt, monthStart)));

        const currency = await this.resolveCurrency(companyId);

        return {
          openQuoteCount: openQuotesRow?.count ?? 0,
          revenueMtdCents: revenueRow?.total ?? 0,
          currency,
          invoiceCount: invoiceCountRow?.count ?? 0,
          paymentCount: paymentCountRow?.count ?? 0,
          outstandingCents: 0,
          overdueInvoiceCount: 0,
        };
      },
      CACHE_TTLS.stats,
    );
  }

  async buildAuraContext(companyId: string): Promise<AuraFinanceContext> {
    const stats = await this.getStats(companyId);

    const quoteRows = await this.db.query.quotes.findMany({
      where: eq(quotes.companyId, companyId),
      with: { customer: true },
      orderBy: [desc(quotes.updatedAt)],
      limit: 15,
    });

    const invoiceRows = await this.db.query.invoices.findMany({
      where: eq(invoices.companyId, companyId),
      with: { customer: true },
      orderBy: [desc(invoices.updatedAt)],
      limit: 15,
    });

    const paymentRows = await this.db.query.payments.findMany({
      where: eq(payments.companyId, companyId),
      with: {
        invoice: {
          with: { customer: true },
        },
      },
      orderBy: [desc(payments.paidAt)],
      limit: 15,
    });

    const [quoteCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(quotes)
      .where(eq(quotes.companyId, companyId));

    return {
      openQuoteCount: stats.openQuoteCount,
      revenueMtdCents: stats.revenueMtdCents,
      currency: stats.currency,
      quoteCount: quoteCountRow?.count ?? 0,
      invoiceCount: stats.invoiceCount,
      paymentCount: stats.paymentCount,
      recentQuotes: quoteRows.map((row) => ({
        id: row.id,
        quoteNumber: row.quoteNumber,
        title: row.title,
        status: row.status,
        customerName: row.customer?.name ?? 'Unknown',
        amountCents: row.amountCents,
        currency: row.currency,
      })),
      recentInvoices: invoiceRows.map((row) => ({
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        title: row.title,
        status: row.status,
        customerName: row.customer?.name ?? 'Unknown',
        amountCents: row.amountCents,
        amountPaidCents: row.amountPaidCents,
        currency: row.currency,
      })),
      recentPayments: paymentRows.map((row) => ({
        id: row.id,
        invoiceNumber: row.invoice?.invoiceNumber ?? 'Unknown',
        customerName: row.invoice?.customer?.name ?? 'Unknown',
        amountCents: row.amountCents,
        currency: row.currency,
        paidAt: row.paidAt.toISOString(),
      })),
    };
  }

  private async getQuote(companyId: string, quoteId: string): Promise<QuoteSummary | null> {
    const row = await this.db.query.quotes.findFirst({
      where: and(eq(quotes.id, quoteId), eq(quotes.companyId, companyId)),
      with: { customer: true, job: true },
    });

    return row ? toQuoteSummary(row) : null;
  }

  private async getInvoice(companyId: string, invoiceId: string): Promise<InvoiceSummary | null> {
    const row = await this.db.query.invoices.findFirst({
      where: and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)),
      with: { customer: true, job: true },
    });

    return row ? toInvoiceSummary(row) : null;
  }

  private async getPayment(companyId: string, paymentId: string): Promise<PaymentSummary | null> {
    const row = await this.db.query.payments.findFirst({
      where: and(eq(payments.id, paymentId), eq(payments.companyId, companyId)),
      with: {
        invoice: {
          with: { customer: true },
        },
      },
    });

    return row ? toPaymentSummary(row) : null;
  }

  private async nextQuoteNumber(companyId: string): Promise<string> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(quotes)
      .where(eq(quotes.companyId, companyId));

    return `Q-${String((row?.count ?? 0) + 1).padStart(4, '0')}`;
  }

  private async nextInvoiceNumber(companyId: string): Promise<string> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(invoices)
      .where(eq(invoices.companyId, companyId));

    return formatInternalInvoiceNumber((row?.count ?? 0) + 1);
  }

  private async resolveCurrency(companyId: string): Promise<string> {
    const company = await this.db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });

    return company?.preferences?.currency?.trim() || 'ZAR';
  }

  private async ensureCustomerBelongsToCompany(
    companyId: string,
    customerId: string,
  ): Promise<void> {
    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.companyId, companyId)),
    });

    if (!customer) {
      throw new FinanceError('CUSTOMER_NOT_FOUND', 'Customer not found for this company');
    }
  }

  private async ensureJobBelongsToCompany(
    companyId: string,
    jobId: string,
    customerId: string,
  ): Promise<void> {
    const job = await this.db.query.jobs.findFirst({
      where: and(
        eq(jobs.id, jobId),
        eq(jobs.companyId, companyId),
        eq(jobs.customerId, customerId),
      ),
    });

    if (!job) {
      throw new FinanceError('JOB_NOT_FOUND', 'Job not found for this customer');
    }
  }

  private async ensureQuoteBelongsToCompany(
    companyId: string,
    quoteId: string,
    customerId: string,
  ): Promise<void> {
    const quote = await this.db.query.quotes.findFirst({
      where: and(
        eq(quotes.id, quoteId),
        eq(quotes.companyId, companyId),
        eq(quotes.customerId, customerId),
      ),
    });

    if (!quote) {
      throw new FinanceError('QUOTE_NOT_FOUND', 'Quote not found for this customer');
    }
  }

  private assertFloor(actor: FinanceActor, belowFloor: boolean, override?: boolean, reason?: string | null, allowed = true) {
    if (!belowFloor) return;
    if (!override || !reason?.trim() || !allowed || actor.canWrite === false) {
      throw new FinanceError('VALIDATION_ERROR', 'Quote is below the configured profit floor and requires an authorized reason');
    }
  }

  private async insertQuoteLines(quoteId: string, companyId: string, lines: ReturnType<typeof quoteAmounts>['lines']) {
    if (!lines.length) return;
    await this.db.insert(quoteLineItems).values(lines.map((line, position) => ({
      companyId, quoteId, position, category: line.category ?? 'other', description: line.description.trim(),
      quantity: String(line.quantity), unitPriceCents: line.unitPriceCents, unitCostCents: line.unitCostCents ?? 0,
      vatRateBps: line.vatRateBps, lineSubtotalCents: line.lineSubtotalCents, lineVatCents: line.lineVatCents,
      lineTotalCents: line.lineTotalCents, lineCostCents: line.lineCostCents, isOptional: Boolean(line.isOptional), optionTier: line.optionTier ?? null,
    })));
  }

  private async insertInvoiceLines(invoiceId: string, companyId: string, lines: ReturnType<typeof quoteAmounts>['lines']) {
    if (!lines.length) return;
    await this.db.insert(invoiceLineItems).values(lines.map((line, position) => ({
      companyId, invoiceId, position, category: line.category ?? 'other', description: line.description.trim(),
      quantity: String(line.quantity), unitPriceCents: line.unitPriceCents, vatRateBps: line.vatRateBps,
      lineSubtotalCents: line.lineSubtotalCents, lineVatCents: line.lineVatCents, lineTotalCents: line.lineTotalCents,
    })));
  }
}

type QuoteWithRelations = typeof quotes.$inferSelect & {
  customer: { name: string } | null;
  job: { title: string; jobNumber?: string | null } | null;
};

type InvoiceWithRelations = typeof invoices.$inferSelect & {
  customer: { name: string } | null;
  job: { title: string; jobNumber?: string | null } | null;
  quote?: { quoteNumber: string } | null;
};

type PaymentWithRelations = typeof payments.$inferSelect & {
  invoice: { invoiceNumber: string; title: string; customer: { name: string } | null } | null;
};

function toQuoteSummary(row: QuoteWithRelations & Record<string, any>, profit: QuoteSummary['profit'] = null): QuoteSummary {
  return {
    id: row.id,
    quoteNumber: row.quoteNumber,
    title: row.title,
    status: row.status,
    versionNumber: row.versionNumber ?? 1,
    isImmutable: row.isImmutable ?? false,
    customerId: row.customerId,
    customerName: row.customer?.name ?? 'Unknown',
    jobId: row.jobId,
    jobTitle: row.job?.title ?? null,
    jobNumber: row.job?.jobNumber ?? null,
    propertyId: row.propertyId ?? null,
    leadId: row.leadId ?? null,
    estimatorUserId: row.estimatorUserId ?? null,
    amountCents: row.amountCents,
    subtotalCents: row.subtotalCents ?? row.amountCents,
    vatCents: row.vatCents ?? 0,
    totalCents: row.totalCents ?? row.amountCents,
    currency: row.currency,
    validUntil: row.validUntil ? row.validUntil.toISOString() : null,
    depositPercent: row.depositPercent ?? null,
    issuedAt: row.issuedAt?.toISOString() ?? null,
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(profit ? { profit } : {}),
  };
}

type XeroInvoiceMappingSummary = Pick<
  typeof xeroInvoiceMappings.$inferSelect,
  | 'id'
  | 'companyId'
  | 'invoiceId'
  | 'xeroInvoiceId'
  | 'xeroInvoiceNumber'
  | 'xeroReference'
  | 'syncStatus'
  | 'lastSyncedAt'
  | 'lastSuccessfulSyncAt'
  | 'lastError'
>;

function toInvoiceSummary(
  row: InvoiceWithRelations & Record<string, any>,
  mapping?: XeroInvoiceMappingSummary,
): InvoiceSummary {
  const xeroSyncStatus = mapping?.syncStatus ?? null;
  const xeroInvoiceNumber =
    row.xeroInvoiceNumber ?? mapping?.xeroInvoiceNumber ?? (xeroSyncStatus === 'synced' ? row.invoiceNumber : null);
  const numberAuthority: InvoiceSummary['numberAuthority'] =
    row.numberAuthority === 'xero' || xeroSyncStatus === 'synced'
      ? 'xero'
      : 'internal_pending_xero';
  const totalCents = resolveEffectiveInvoiceTotalCents({
    amountCents: row.amountCents,
    totalCents: row.totalCents,
  });
  const financialDataComplete = totalCents > 0;

  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    internalNumber: row.internalNumber ?? row.invoiceNumber,
    displayInvoiceNumber: displayInvoiceNumber({
      xeroInvoiceNumber,
      internalNumber: row.internalNumber,
      invoiceNumber: row.invoiceNumber,
      numberAuthority,
    }),
    xeroInvoiceNumber,
    xeroReference: row.xeroReference ?? mapping?.xeroReference ?? null,
    numberAuthority,
    title: row.title,
    status: row.status,
    stage: row.stage ?? 'standard',
    customerId: row.customerId,
    customerName: row.customer?.name ?? 'Unknown',
    jobId: row.jobId,
    jobTitle: row.job?.title ?? null,
    jobNumber: row.job?.jobNumber ?? null,
    quoteId: row.quoteId ?? null,
    quoteNumber: row.quote?.quoteNumber ?? null,
    quoteVersionNumber: row.quoteVersionNumber ?? null,
    amountCents: row.amountCents,
    totalCents,
    amountPaidCents: row.amountPaidCents,
    outstandingCents: resolveEffectiveInvoiceOutstandingCents({
      amountCents: row.amountCents,
      totalCents: row.totalCents,
      amountPaidCents: row.amountPaidCents,
    }),
    isOverdue: Boolean(row.dueDate && row.dueDate < new Date() && ['sent', 'partial', 'overdue'].includes(row.status)),
    currency: row.currency,
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    xeroSyncStatus,
    financialDataComplete,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPaymentSummary(row: PaymentWithRelations & Record<string, any>): PaymentSummary {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    invoiceNumber: row.invoice?.invoiceNumber ?? 'Unknown',
    invoiceTitle: row.invoice?.title ?? 'Unknown',
    customerName: row.invoice?.customer?.name ?? 'Unknown',
    amountCents: row.amountCents,
    currency: row.currency,
    method: row.method,
    reference: row.reference,
    xeroPaymentId: row.xeroPaymentId ?? null,
    receiptNumber: row.receipt?.receiptNumber ?? null,
    paidAt: row.paidAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function toActor(actor: FinanceActor | string): FinanceActor {
  return typeof actor === 'string' ? { companyId: actor, canWrite: true } : actor;
}

function legacyQuoteLines(amountCents: number, vatRateBps: number) {
  const subtotal = Math.round((amountCents * 10_000) / (10_000 + vatRateBps));
  return [{ description: 'Quote total', quantity: 1, unitPriceCents: subtotal, vatRateBps, category: 'other' as const }];
}

function quoteAmounts(lines: NonNullable<CreateQuoteRequest['lineItems']>, floor: number, discountCents: number) {
  const calculated = lines.map((line) => ({ ...line, quantity: line.quantity ?? 1, vatRateBps: line.vatRateBps ?? 1500, ...calculateLineAmounts({ quantity: line.quantity ?? 1, unitPriceCents: line.unitPriceCents, unitCostCents: line.unitCostCents, vatRateBps: line.vatRateBps ?? 1500 }) }));
  const subtotalCents = calculated.reduce((sum, line) => sum + line.lineSubtotalCents, 0) - discountCents;
  const vatCents = calculated.reduce((sum, line) => sum + line.lineVatCents, 0);
  const totalCents = subtotalCents + vatCents;
  const profit = calculateQuoteProfit({ totalCents, estimatedCostCents: calculated.reduce((sum, line) => sum + line.lineCostCents, 0), profitFloorMarginBps: floor });
  return { lines: calculated, subtotalCents, vatCents, totalCents, profit };
}

function profitFromQuote(row: Record<string, any>) {
  return { estimatedCostCents: row.estimatedCostCents, grossProfitCents: row.grossProfitCents, markupBps: row.markupBps, marginBps: row.marginBps, profitFloorCents: row.profitFloorCents, targetPriceCents: row.targetPriceCents, belowFloor: row.totalCents < row.profitFloorCents && row.estimatedCostCents > 0, missingCostWarning: row.estimatedCostCents <= 0 };
}

function acceptanceSummary(row: Record<string, any>) {
  return { id: row.id, decision: row.decision, acceptedVersionNumber: row.acceptedVersionNumber, accepterName: row.accepterName, accepterEmail: row.accepterEmail, declineReason: row.declineReason, changeRequestMessage: row.changeRequestMessage, createdAt: row.createdAt.toISOString() };
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (!value?.trim()) {
    return null;
  }

  return parseRequiredDate(value);
}

function parseRequiredDate(value: string): Date {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new FinanceError('VALIDATION_ERROR', 'Invalid date');
  }

  return parsed;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function groupRowsByJobId<T extends { jobId: string | null }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.jobId) continue;
    const list = grouped.get(row.jobId) ?? [];
    list.push(row);
    grouped.set(row.jobId, list);
  }
  return grouped;
}
