import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import type {
  CreateInvoiceFromQuoteRequest,
  CreateInvoiceRequest,
  CreatePaymentRequest,
  CreateQuoteRequest,
  CreateQuoteVersionRequest,
  FinanceListQuery,
  FinanceStats,
  FinanceCatalogueItemSearchResult,
  InvoiceDetail,
  InvoiceSummary,
  JobFinanceChip,
  JobFinanceSummary,
  PaymentDetail,
  PaymentSummary,
  QuoteDetail,
  QuoteSummary,
  UpdateQuoteRequest,
  UpdateInvoiceRequest,
} from '@titan/shared';
import {
  calculateLineAmounts,
  calculateQuoteProfit,
  canEditInvoice,
  displayOfficialInvoiceNumber,
  displayOfficialQuoteNumber,
  pickPaymentInvoiceDisplayNumber,
  resolveQuoteDisplayNumberLabel,
  deriveJobPaymentLedger,
  deriveJob360HistoricalCompleteness,
  buildJob360DigitalFileRollup,
  formatInternalInvoiceNumber,
  formatMoney,
  inventoryItemToFinanceCatalogue,
  legacyFinanceDocumentTitle,
  mapCustomerReferenceFromStorage,
  mapCustomerReferenceToStorage,
  normalizeFinanceDocumentAddresses,
  resolveInvoiceIssuedAtUpdate,
  resolveQuoteIssuedAtUpdate,
  searchFinanceCatalogueItems,
  toFinanceDocumentAddressSnapshot,
  filterFinanceCatalogueCostFields,
  canViewFinanceProfit,
  sanitizeFinanceDocumentWriteRequest,
  resolveYoungGunsPricebookForTenant,
  assertQuoteEditable,
  assertQuoteStatusTransition,
  buildQuoteLifecycleAuditEvent,
  evaluateArchiveQuote,
  evaluateConvertQuote,
  evaluateIssueQuote,
  evaluateQuoteSendReadiness,
  evaluateVoidQuote,
  getAllowedQuoteActions,
  normalizeQuoteLifecycleRole,
  resolveProviderActionOutcome,
  applyProviderOutcomeToBusinessState,
  resolveQuotePaymentVisibility,
  toCanonicalQuoteLifecycleState,
  QuoteLifecycleError,
  type FinanceDocumentPreviewModel,
} from '@titan/shared';
import { FinanceDocumentSectionsService } from './finance-document-sections.service.js';
import {
  FinanceDocumentPreviewEnrichmentService,
  type FinancePreviewEnrichmentActor,
  type FinancePreviewEnrichmentRequest,
} from './finance-document-preview-enrichment.service.js';
import type { DatabaseClient } from '@titan/db';
import {
  companyFinanceSettings,
  companies,
  customers,
  alAssetRegistryProfiles,
  documents,
  invoiceLineItems,
  invoices,
  inventoryItems,
  jobs,
  jobMaterialLines,
  jobVisits,
  paymentReceipts,
  payments,
  quoteLineItems,
  quotes,
  securityAuditLogs,
} from '@titan/db';
import { emitBusinessEvent } from '../lib/automation-events.js';
import {
  buildTenantCacheKey,
  cachedTenantRead,
  CACHE_TTLS,
  invalidateFinanceListCaches,
} from './api-read-cache.js';

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
    status: string;
    customerName: string;
    amountCents: number;
    currency: string;
  }>;
  recentInvoices: Array<{
    id: string;
    invoiceNumber: string;
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
  private readonly documentSections: FinanceDocumentSectionsService;
  private readonly previewEnrichment: FinanceDocumentPreviewEnrichmentService;

  constructor(private readonly db: DatabaseClient) {
    this.documentSections = new FinanceDocumentSectionsService(db);
    this.previewEnrichment = new FinanceDocumentPreviewEnrichmentService(db, this.documentSections);
  }

  async listQuotes(companyId: string, query: FinanceListQuery = {}): Promise<QuoteSummary[]> {
    const rows = await this.db.query.quotes.findMany({
      where: and(eq(quotes.companyId, companyId), query.status ? eq(quotes.status, query.status as typeof quotes.status.enumValues[number]) : undefined, query.q ? or(ilike(quotes.quoteNumber, `%${query.q}%`), ilike(quotes.xeroQuoteNumber, `%${query.q}%`), ilike(quotes.notes, `%${query.q}%`), ilike(quotes.customerNotes, `%${query.q}%`)) : undefined),
      with: { customer: true, job: true },
      orderBy: [desc(quotes.updatedAt)],
    });

    return rows.map((row) => toQuoteSummary(row));
  }

  async listInvoices(companyId: string, query: FinanceListQuery = {}): Promise<InvoiceSummary[]> {
    const unfiltered = !query.status && !query.overdueOnly && !query.q;
    if (unfiltered) {
      return cachedTenantRead(
        buildTenantCacheKey(companyId, 'finance/list', 'invoices-all'),
        () => this.loadInvoiceList(companyId, query),
        CACHE_TTLS.list,
      );
    }
    return this.loadInvoiceList(companyId, query);
  }

  private async loadInvoiceList(
    companyId: string,
    query: FinanceListQuery = {},
  ): Promise<InvoiceSummary[]> {
    const rows = await this.db.query.invoices.findMany({
      where: and(eq(invoices.companyId, companyId), query.status ? eq(invoices.status, query.status as typeof invoices.status.enumValues[number]) : undefined, query.overdueOnly ? and(lte(invoices.dueDate, new Date()), inArray(invoices.status, ['sent', 'partial', 'overdue'])) : undefined, query.q ? or(ilike(invoices.invoiceNumber, `%${query.q}%`), ilike(invoices.internalNumber, `%${query.q}%`), ilike(invoices.xeroInvoiceNumber, `%${query.q}%`), ilike(invoices.notes, `%${query.q}%`), ilike(invoices.xeroReference, `%${query.q}%`)) : undefined),
      with: { customer: true, job: true, quote: true },
      orderBy: [desc(invoices.updatedAt)],
    });

    return rows.map(toInvoiceSummary);
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
    const sanitized = sanitizeFinanceDocumentWriteRequest(
      input,
      this.includeProfitForActor(actor),
    );
    if (!sanitized.lineItems?.length && (!sanitized.amountCents || sanitized.amountCents <= 0)) {
      throw new FinanceError('VALIDATION_ERROR', 'Quote line items or amount must be greater than zero');
    }
    const customer = await this.ensureCustomerBelongsToCompany(companyId, sanitized.customerId);
    const title = legacyFinanceDocumentTitle(customer.name);
    if (sanitized.jobId) await this.ensureJobBelongsToCompany(companyId, sanitized.jobId, sanitized.customerId);
    if (sanitized.clientActionId) {
      const existing = await this.db.query.quotes.findFirst({ where: and(eq(quotes.companyId, companyId), eq(quotes.clientActionId, sanitized.clientActionId)), with: { customer: true, job: true } });
      if (existing) return toQuoteSummary(existing);
    }
    const settings = await this.ensureFinanceSettings(companyId);
    const computed = quoteAmounts(sanitized.lineItems ?? legacyQuoteLines(sanitized.amountCents!, settings.defaultVatRateBps), settings.profitFloorMarginBps, sanitized.discountCents ?? 0);
    this.assertFloor(actor, computed.profit.belowFloor, sanitized.belowFloorOverride, sanitized.belowFloorReason, settings.allowBelowFloorWithOverride);
    const [created] = await this.db.insert(quotes).values({
      companyId, customerId: sanitized.customerId, jobId: sanitized.jobId ?? null, propertyId: sanitized.propertyId ?? null,
      leadId: sanitized.leadId ?? null, estimatorUserId: sanitized.estimatorUserId ?? actor.userId ?? null,
      quoteNumber: await this.nextQuoteNumber(companyId), title, status: sanitized.status ?? 'draft',
      amountCents: computed.totalCents, subtotalCents: computed.subtotalCents, vatCents: computed.vatCents,
      totalCents: computed.totalCents, estimatedCostCents: computed.profit.estimatedCostCents,
      grossProfitCents: computed.profit.grossProfitCents, markupBps: computed.profit.markupBps,
      marginBps: computed.profit.marginBps, profitFloorCents: computed.profit.profitFloorCents,
      targetPriceCents: computed.profit.targetPriceCents, discountCents: sanitized.discountCents ?? 0,
      belowFloorOverride: Boolean(sanitized.belowFloorOverride), belowFloorReason: normalizeOptionalText(sanitized.belowFloorReason),
      belowFloorAuthorizedBy: sanitized.belowFloorOverride ? actor.userId ?? null : null, currency: sanitized.currency?.trim() || settings.currency,
      validUntil: parseOptionalDate(sanitized.validUntil), scopeOfWork: normalizeOptionalText(sanitized.scopeOfWork), exclusions: normalizeOptionalText(sanitized.exclusions),
      assumptions: normalizeOptionalText(sanitized.assumptions), customerNotes: normalizeOptionalText(sanitized.customerNotes),
      internalNotes: normalizeOptionalText(sanitized.internalNotes), paymentTerms: normalizeOptionalText(sanitized.paymentTerms),
      depositPercent: sanitized.depositPercent ?? null, optionTier: normalizeOptionalText(sanitized.optionTier), notes: normalizeOptionalText(sanitized.notes),
      issuedAt: parseOptionalDate(sanitized.issuedAt),
      billingAddress: normalizeOptionalText(sanitized.billingAddress),
      siteAddress: normalizeOptionalText(sanitized.siteAddress),
      postalAddress: normalizeOptionalText(sanitized.postalAddress),
      clientActionId: normalizeOptionalText(sanitized.clientActionId),
    }).returning();
    if (!created) throw new FinanceError('CREATE_FAILED', 'Unable to create quote');
    await this.insertQuoteLines(created.id, companyId, computed.lines);
    if (sanitized.documentContent) {
      await this.documentSections.saveSections(toSectionsActor(actor), {
        quoteId: created.id,
        jobId: sanitized.jobId ?? null,
        documentNumber: displayOfficialQuoteNumber({ xeroQuoteNumber: created.xeroQuoteNumber }),
        title,
        customerId: sanitized.customerId,
        content: sanitized.documentContent,
      });
    }
    emitBusinessEvent({
      companyId,
      eventType: 'quote.created',
      entityType: 'quote',
      entityId: created.id,
      payload: {
        quote: {
          id: created.id,
          status: created.status,
          customerId: created.customerId,
          amountCents: created.amountCents,
        },
        customerId: created.customerId,
      },
    });
    return (await this.getQuote(companyId, created.id))!;
  }

  async createInvoice(actorOrCompany: FinanceActor | string, input: CreateInvoiceRequest): Promise<InvoiceSummary> {
    const actor = toActor(actorOrCompany);
    const companyId = actor.companyId;
    const sanitized = sanitizeFinanceDocumentWriteRequest(
      input,
      this.includeProfitForActor(actor),
    );

    if ((!sanitized.lineItems?.length && !sanitized.amountCents) || (sanitized.amountCents ?? 0) <= 0 && !sanitized.lineItems?.length) {
      throw new FinanceError('VALIDATION_ERROR', 'Invoice amount must be greater than zero');
    }

    const customer = await this.ensureCustomerBelongsToCompany(companyId, sanitized.customerId);
    const title = legacyFinanceDocumentTitle(customer.name);

    if (sanitized.jobId) {
      await this.ensureJobBelongsToCompany(companyId, sanitized.jobId, sanitized.customerId);
    }

    if (sanitized.quoteId) {
      await this.ensureQuoteBelongsToCompany(companyId, sanitized.quoteId, sanitized.customerId);
    }

    if (sanitized.clientActionId) {
      const existing = await this.db.query.invoices.findFirst({ where: and(eq(invoices.companyId, companyId), eq(invoices.clientActionId, sanitized.clientActionId)), with: { customer: true, job: true, quote: true } });
      if (existing) return toInvoiceSummary(existing);
    }
    const settings = await this.ensureFinanceSettings(companyId);
    const computed = quoteAmounts(sanitized.lineItems ?? legacyQuoteLines(sanitized.amountCents!, settings.defaultVatRateBps), settings.profitFloorMarginBps, 0);
    const invoiceNumber = await this.nextInvoiceNumber(companyId);

    const [created] = await this.db
      .insert(invoices)
      .values({
        companyId,
        customerId: sanitized.customerId,
        jobId: sanitized.jobId ?? null,
        quoteId: sanitized.quoteId ?? null,
        propertyId: sanitized.propertyId ?? null,
        invoiceNumber,
        internalNumber: invoiceNumber,
        numberAuthority: 'internal_pending_xero',
        title,
        status: sanitized.status ?? 'draft',
        stage: sanitized.stage ?? 'standard',
        amountCents: computed.totalCents,
        subtotalCents: computed.subtotalCents,
        vatCents: computed.vatCents,
        totalCents: computed.totalCents,
        currency: sanitized.currency?.trim() || settings.currency,
        dueDate: parseOptionalDate(sanitized.dueDate),
        issuedAt: parseOptionalDate(sanitized.issuedAt) ?? new Date(),
        paymentTerms: normalizeOptionalText(sanitized.paymentTerms),
        notes: normalizeOptionalText(sanitized.notes),
        xeroReference: mapCustomerReferenceToStorage(sanitized.customerReference),
        billingAddress: normalizeOptionalText(sanitized.billingAddress),
        siteAddress: normalizeOptionalText(sanitized.siteAddress),
        postalAddress: normalizeOptionalText(sanitized.postalAddress),
        clientActionId: normalizeOptionalText(sanitized.clientActionId),
      })
      .returning();

    if (!created) {
      throw new FinanceError('CREATE_FAILED', 'Unable to create invoice');
    }
    await this.insertInvoiceLines(created.id, companyId, computed.lines);

    if (sanitized.documentContent || sanitized.cocDocumentationId !== undefined) {
      await this.documentSections.saveSections(toSectionsActor(actor), {
        invoiceId: created.id,
        jobId: sanitized.jobId ?? null,
        documentNumber: displayOfficialInvoiceNumber({ xeroInvoiceNumber: created.xeroInvoiceNumber }),
        title,
        customerId: sanitized.customerId,
        content: sanitized.documentContent ?? undefined,
        cocDocumentationId: sanitized.cocDocumentationId ?? null,
      });
    }

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

    invalidateFinanceListCaches(companyId);
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
    const documentSections = await this.documentSections.loadSections({
      companyId,
      quoteId,
    });
    return {
      ...toQuoteSummary(row, profit), scopeOfWork: row.scopeOfWork, exclusions: row.exclusions, assumptions: row.assumptions,
      customerNotes: row.customerNotes, internalNotes: options.includeProfit ? row.internalNotes : null, paymentTerms: row.paymentTerms,
      notes: row.notes ?? null,
      addresses: toFinanceDocumentAddressSnapshot(row),
      depositPercent: row.depositPercent, optionTier: row.optionTier, discountCents: row.discountCents,
      belowFloorOverride: row.belowFloorOverride, belowFloorReason: options.includeProfit ? row.belowFloorReason : null,
      lineItems: row.lineItems.map((line) => ({
        id: line.id, position: line.position, category: line.category, description: line.description, quantity: Number(line.quantity),
        unitPriceCents: line.unitPriceCents, unitCostCents: options.includeProfit ? line.unitCostCents : null, vatRateBps: line.vatRateBps,
        lineSubtotalCents: line.lineSubtotalCents, lineVatCents: line.lineVatCents, lineTotalCents: line.lineTotalCents,
        lineCostCents: options.includeProfit ? line.lineCostCents : null, isOptional: line.isOptional, optionTier: line.optionTier,
      })), acceptance: row.acceptances[0] ? acceptanceSummary(row.acceptances[0]) : null, xeroQuoteId: row.xeroQuoteId,
      documentSections,
    };
  }

  async updateQuote(actorOrCompany: FinanceActor | string, quoteId: string, input: UpdateQuoteRequest): Promise<QuoteSummary> {
    const actor = toActor(actorOrCompany);
    const sanitized = sanitizeFinanceDocumentWriteRequest(
      input,
      this.includeProfitForActor(actor),
    );
    const current = await this.db.query.quotes.findFirst({ where: and(eq(quotes.id, quoteId), eq(quotes.companyId, actor.companyId)) });
    if (!current) throw new FinanceError('NOT_FOUND', 'Quote not found');
    try {
      assertQuoteEditable({
        id: current.id,
        status: current.status,
        isImmutable: current.isImmutable,
        cancelReason: current.cancelReason,
      });
    } catch (error) {
      throw this.mapQuoteLifecycleError(error);
    }
    const nextStatus = sanitized.status ?? current.status;
    if (nextStatus !== current.status) {
      try {
        assertQuoteStatusTransition({ from: current.status, to: nextStatus });
      } catch (error) {
        throw this.mapQuoteLifecycleError(error);
      }
    }
    const settings = await this.ensureFinanceSettings(actor.companyId);
    const computed = sanitized.lineItems ? quoteAmounts(sanitized.lineItems, settings.profitFloorMarginBps, sanitized.discountCents ?? current.discountCents) : null;
    if (computed) this.assertFloor(actor, computed.profit.belowFloor, sanitized.belowFloorOverride, sanitized.belowFloorReason, settings.allowBelowFloorWithOverride);
    let issuedAtUpdate: Date | null | undefined;
    try {
      issuedAtUpdate = resolveQuoteIssuedAtUpdate(current.issuedAt, sanitized.issuedAt, current.isImmutable);
    } catch {
      throw new FinanceError('VALIDATION_ERROR', 'Invalid quote date');
    }
    const addressUpdate = resolveDocumentAddressColumns(current, sanitized);
    await this.db.update(quotes).set({
      status: nextStatus, currency: sanitized.currency?.trim() || current.currency,
      jobId: sanitized.jobId === undefined ? current.jobId : sanitized.jobId ?? null,
      customerNotes: sanitized.customerNotes === undefined ? current.customerNotes : normalizeOptionalText(sanitized.customerNotes),
      validUntil: sanitized.validUntil === undefined ? current.validUntil : parseOptionalDate(sanitized.validUntil), notes: sanitized.notes === undefined ? current.notes : normalizeOptionalText(sanitized.notes),
      scopeOfWork: sanitized.scopeOfWork === undefined ? current.scopeOfWork : normalizeOptionalText(sanitized.scopeOfWork),
      exclusions: sanitized.exclusions === undefined ? current.exclusions : normalizeOptionalText(sanitized.exclusions),
      paymentTerms: sanitized.paymentTerms === undefined ? current.paymentTerms : normalizeOptionalText(sanitized.paymentTerms),
      ...(issuedAtUpdate !== undefined ? { issuedAt: issuedAtUpdate } : {}),
      ...(addressUpdate ?? {}),
      ...computed && { amountCents: computed.totalCents, subtotalCents: computed.subtotalCents, vatCents: computed.vatCents, totalCents: computed.totalCents, estimatedCostCents: computed.profit.estimatedCostCents, grossProfitCents: computed.profit.grossProfitCents, markupBps: computed.profit.markupBps, marginBps: computed.profit.marginBps, profitFloorCents: computed.profit.profitFloorCents, targetPriceCents: computed.profit.targetPriceCents },
      updatedAt: new Date(),
    }).where(eq(quotes.id, quoteId));
    if (computed) { await this.db.delete(quoteLineItems).where(eq(quoteLineItems.quoteId, quoteId)); await this.insertQuoteLines(quoteId, actor.companyId, computed.lines); }
    if (sanitized.documentContent !== undefined) {
      await this.documentSections.saveSections(toSectionsActor(actor), {
        quoteId,
        jobId: sanitized.jobId === undefined ? current.jobId : sanitized.jobId ?? null,
        documentNumber: displayOfficialQuoteNumber({ xeroQuoteNumber: current.xeroQuoteNumber }),
        title: current.title,
        customerId: current.customerId,
        content: sanitized.documentContent,
      });
    }
    const lifecycleEventType =
      current.status === 'draft' && nextStatus === 'internal_review'
        ? 'quote_approval_requested'
        : current.status === 'internal_review' && nextStatus === 'approved_for_sending'
          ? 'quote_approved'
          : nextStatus !== current.status
            ? 'quote_edited'
            : 'quote_edited';
    const audit = buildQuoteLifecycleAuditEvent({
      eventType: lifecycleEventType,
      companyId: actor.companyId,
      quoteId,
      quoteNumber: current.quoteNumber,
      displayQuoteNumber: displayOfficialQuoteNumber({ xeroQuoteNumber: current.xeroQuoteNumber }),
      actorId: actor.userId ?? null,
      fromState: current.status,
      toState: nextStatus,
      sourceProvider: current.sourceProvider,
    });
    emitBusinessEvent({
      companyId: audit.companyId,
      eventType: audit.eventType,
      entityType: audit.entityType,
      entityId: audit.entityId,
      payload: audit.payload,
    });
    return (await this.getQuote(actor.companyId, quoteId))!;
  }

  async issueQuote(actorOrCompany: FinanceActor | string, quoteId: string): Promise<QuoteSummary> {
    const actor = toActor(actorOrCompany);
    const quote = await this.db.query.quotes.findFirst({
      where: and(eq(quotes.id, quoteId), eq(quotes.companyId, actor.companyId)),
    });
    if (!quote) throw new FinanceError('NOT_FOUND', 'Quote not found');
    const decision = evaluateIssueQuote({
      id: quote.id,
      status: quote.status,
      isImmutable: quote.isImmutable,
      issuedAt: quote.issuedAt,
      sourceProvider: quote.sourceProvider,
      xeroQuoteId: quote.xeroQuoteId,
      xeroQuoteNumber: quote.xeroQuoteNumber,
    });
    if (decision.kind === 'idempotent') {
      return (await this.getQuote(actor.companyId, quoteId))!;
    }
    if (decision.kind === 'reject') {
      throw new FinanceError(decision.code ?? 'QUOTE_TRANSITION_NOT_ALLOWED', decision.message ?? 'Cannot issue quote');
    }
    this.assertFloor(actor, quote.totalCents < quote.profitFloorCents && quote.estimatedCostCents > 0, quote.belowFloorOverride, quote.belowFloorReason, true);
    // Issue marks send-ready / issued in TITAN. Staging proof must not send customer messages.
    await this.db.update(quotes).set({ status: 'sent', isImmutable: true, issuedAt: new Date(), updatedAt: new Date() }).where(eq(quotes.id, quoteId));
    const audit = buildQuoteLifecycleAuditEvent({
      eventType: 'quote_sent',
      companyId: actor.companyId,
      quoteId,
      quoteNumber: quote.quoteNumber,
      displayQuoteNumber: displayOfficialQuoteNumber({ xeroQuoteNumber: quote.xeroQuoteNumber }),
      actorId: actor.userId ?? null,
      fromState: quote.status,
      toState: 'sent',
      sourceProvider: quote.sourceProvider,
      reason: 'issueQuote — TITAN issued/send-ready; customer send not performed by this path',
      extra: { customerSend: false },
    });
    emitBusinessEvent({
      companyId: audit.companyId,
      eventType: audit.eventType,
      entityType: audit.entityType,
      entityId: audit.entityId,
      payload: audit.payload,
    });
    return (await this.getQuote(actor.companyId, quoteId))!;
  }

  async prepareQuoteSend(actorOrCompany: FinanceActor | string, quoteId: string) {
    const actor = toActor(actorOrCompany);
    const quote = await this.db.query.quotes.findFirst({
      where: and(eq(quotes.id, quoteId), eq(quotes.companyId, actor.companyId)),
    });
    if (!quote) throw new FinanceError('NOT_FOUND', 'Quote not found');
    const displayQuoteNumber = resolveQuoteDisplayNumberLabel({
      id: quote.id,
      quoteNumber: quote.quoteNumber,
      xeroQuoteNumber: quote.xeroQuoteNumber,
      xeroQuoteId: quote.xeroQuoteId,
      sourceProvider: quote.sourceProvider,
      sourceExternalId: quote.sourceExternalId,
    });
    const readiness = evaluateQuoteSendReadiness({
      record: {
        id: quote.id,
        status: quote.status,
        isImmutable: quote.isImmutable,
        issuedAt: quote.issuedAt,
        sourceProvider: quote.sourceProvider,
        xeroQuoteId: quote.xeroQuoteId,
        xeroQuoteNumber: quote.xeroQuoteNumber,
      },
      displayQuoteNumber,
      customerId: quote.customerId,
      totalCents: quote.totalCents,
      hasPdfContent: true,
      role: normalizeQuoteLifecycleRole(actor.roleName),
    });
    const audit = buildQuoteLifecycleAuditEvent({
      eventType: readiness.ready ? 'quote_send_prepared' : 'quote_action_blocked',
      companyId: actor.companyId,
      quoteId,
      quoteNumber: quote.quoteNumber,
      displayQuoteNumber,
      actorId: actor.userId ?? null,
      fromState: quote.status,
      toState: quote.status,
      sourceProvider: quote.sourceProvider,
      reason: readiness.ready ? 'Send readiness OK — customer send blocked in staging' : readiness.blockers.join('; '),
      extra: { customerSendAllowed: false, blockers: readiness.blockers },
    });
    emitBusinessEvent({
      companyId: audit.companyId,
      eventType: audit.eventType,
      entityType: audit.entityType,
      entityId: audit.entityId,
      payload: audit.payload,
    });
    return {
      readiness,
      customerSend: false as const,
      quote: await this.getQuote(actor.companyId, quoteId),
    };
  }

  async voidQuote(
    actorOrCompany: FinanceActor | string,
    quoteId: string,
    input: { reason?: string | null; allowProviderWrite?: boolean } = {},
  ): Promise<QuoteSummary> {
    const actor = toActor(actorOrCompany);
    const quote = await this.db.query.quotes.findFirst({
      where: and(eq(quotes.id, quoteId), eq(quotes.companyId, actor.companyId)),
    });
    if (!quote) throw new FinanceError('NOT_FOUND', 'Quote not found');
    const decision = evaluateVoidQuote({
      id: quote.id,
      status: quote.status,
      isImmutable: quote.isImmutable,
      issuedAt: quote.issuedAt,
      sourceProvider: quote.sourceProvider,
      xeroQuoteId: quote.xeroQuoteId,
      xeroQuoteNumber: quote.xeroQuoteNumber,
      cancelReason: quote.cancelReason,
    });
    if (decision.kind === 'idempotent') {
      return (await this.getQuote(actor.companyId, quoteId))!;
    }
    if (decision.kind === 'reject') {
      throw new FinanceError(decision.code ?? 'QUOTE_TRANSITION_NOT_ALLOWED', decision.message ?? 'Cannot void quote');
    }
    if (decision.kind === 'provider_gate') {
      // Unauthorised Xero writes remain blocked — do not fake VOIDED.
      const outcome = resolveProviderActionOutcome({
        requested: 'void',
        providerWriteAttempted: true,
        providerWriteAllowed: Boolean(input.allowProviderWrite),
        providerError: decision.message,
      });
      const applied = applyProviderOutcomeToBusinessState({
        currentStatus: quote.status,
        requestedToStatus: 'cancelled',
        outcome,
      });
      const audit = buildQuoteLifecycleAuditEvent({
        eventType: 'quote_action_blocked',
        companyId: actor.companyId,
        quoteId,
        quoteNumber: quote.quoteNumber,
        displayQuoteNumber: displayOfficialQuoteNumber({ xeroQuoteNumber: quote.xeroQuoteNumber }),
        actorId: actor.userId ?? null,
        fromState: quote.status,
        toState: applied.nextStatus,
        sourceProvider: quote.sourceProvider,
        reason: outcome.outcome === 'BLOCKED' ? outcome.reason : decision.message,
        extra: { providerOutcome: outcome.outcome, xeroWrite: false },
      });
      emitBusinessEvent({
        companyId: audit.companyId,
        eventType: audit.eventType,
        entityType: audit.entityType,
        entityId: audit.entityId,
        payload: audit.payload,
      });
      throw new FinanceError(
        'QUOTE_PROVIDER_ACTION_BLOCKED',
        decision.message ?? 'Xero-backed void blocked — business state unchanged',
      );
    }
    await this.db
      .update(quotes)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelReason: normalizeOptionalText(input.reason) ?? 'voided',
        updatedAt: new Date(),
      })
      .where(eq(quotes.id, quoteId));
    const audit = buildQuoteLifecycleAuditEvent({
      eventType: 'quote_voided',
      companyId: actor.companyId,
      quoteId,
      quoteNumber: quote.quoteNumber,
      displayQuoteNumber: displayOfficialQuoteNumber({ xeroQuoteNumber: quote.xeroQuoteNumber }),
      actorId: actor.userId ?? null,
      fromState: quote.status,
      toState: 'cancelled',
      sourceProvider: quote.sourceProvider,
      reason: input.reason ?? 'voided',
    });
    emitBusinessEvent({
      companyId: audit.companyId,
      eventType: audit.eventType,
      entityType: audit.entityType,
      entityId: audit.entityId,
      payload: audit.payload,
    });
    return (await this.getQuote(actor.companyId, quoteId))!;
  }

  async archiveQuote(
    actorOrCompany: FinanceActor | string,
    quoteId: string,
  ): Promise<QuoteSummary> {
    const actor = toActor(actorOrCompany);
    const quote = await this.db.query.quotes.findFirst({
      where: and(eq(quotes.id, quoteId), eq(quotes.companyId, actor.companyId)),
    });
    if (!quote) throw new FinanceError('NOT_FOUND', 'Quote not found');
    const decision = evaluateArchiveQuote({
      id: quote.id,
      status: quote.status,
      cancelReason: quote.cancelReason,
      isImmutable: quote.isImmutable,
    });
    if (decision.kind === 'idempotent') {
      return (await this.getQuote(actor.companyId, quoteId))!;
    }
    if (decision.kind === 'reject') {
      throw new FinanceError(decision.code ?? 'QUOTE_TRANSITION_NOT_ALLOWED', decision.message ?? 'Cannot archive quote');
    }
    await this.db
      .update(quotes)
      .set({
        status: 'cancelled',
        cancelledAt: quote.cancelledAt ?? new Date(),
        cancelReason: decision.cancelReason ?? 'archived: lifecycle archive preserves history',
        updatedAt: new Date(),
      })
      .where(eq(quotes.id, quoteId));
    const audit = buildQuoteLifecycleAuditEvent({
      eventType: 'quote_archived',
      companyId: actor.companyId,
      quoteId,
      quoteNumber: quote.quoteNumber,
      displayQuoteNumber: displayOfficialQuoteNumber({ xeroQuoteNumber: quote.xeroQuoteNumber }),
      actorId: actor.userId ?? null,
      fromState: quote.status,
      toState: 'cancelled',
      sourceProvider: quote.sourceProvider,
      reason: decision.cancelReason ?? null,
    });
    emitBusinessEvent({
      companyId: audit.companyId,
      eventType: audit.eventType,
      entityType: audit.entityType,
      entityId: audit.entityId,
      payload: audit.payload,
    });
    return (await this.getQuote(actor.companyId, quoteId))!;
  }

  async getQuoteLifecycle(actorOrCompany: FinanceActor | string, quoteId: string) {
    const actor = toActor(actorOrCompany);
    const quote = await this.db.query.quotes.findFirst({
      where: and(eq(quotes.id, quoteId), eq(quotes.companyId, actor.companyId)),
      with: { invoices: { columns: { id: true, status: true, amountPaidCents: true, totalCents: true, stage: true } } },
    });
    if (!quote) throw new FinanceError('NOT_FOUND', 'Quote not found');
    const role = normalizeQuoteLifecycleRole(actor.roleName);
    const linkedInvoiceCount = quote.invoices?.length ?? 0;
    const hasInvoice = linkedInvoiceCount > 0;
    const primaryInvoice = quote.invoices?.[0] ?? null;
    const paymentVisibility = resolveQuotePaymentVisibility({
      quoteStatus: quote.status,
      depositPercent: quote.depositPercent,
      hasLinkedInvoice: hasInvoice,
      invoiceStatus: primaryInvoice?.status ?? null,
      amountPaidCents: primaryInvoice?.amountPaidCents ?? null,
      invoiceTotalCents: primaryInvoice?.totalCents ?? null,
    });
    const displayQuoteNumber = resolveQuoteDisplayNumberLabel({
      id: quote.id,
      quoteNumber: quote.quoteNumber,
      xeroQuoteNumber: quote.xeroQuoteNumber,
      xeroQuoteId: quote.xeroQuoteId,
      sourceProvider: quote.sourceProvider,
      sourceExternalId: quote.sourceExternalId,
    });
    const allowedActions = getAllowedQuoteActions({
      status: quote.status,
      sourceProvider: quote.sourceProvider,
      xeroQuoteId: quote.xeroQuoteId,
      xeroQuoteNumber: quote.xeroQuoteNumber,
      isImmutable: quote.isImmutable,
      issuedAt: quote.issuedAt,
      validUntil: quote.validUntil,
      cancelReason: quote.cancelReason,
      role,
      hasInvoice,
      linkedInvoiceCount,
    });
    return {
      quoteId: quote.id,
      displayQuoteNumber,
      quoteNumber: quote.quoteNumber,
      xeroQuoteNumber: quote.xeroQuoteNumber,
      xeroQuoteId: quote.xeroQuoteId,
      sourceProvider: quote.sourceProvider,
      sourceExternalId: quote.sourceExternalId,
      status: quote.status,
      canonicalState: toCanonicalQuoteLifecycleState(quote.status, { cancelReason: quote.cancelReason }),
      allowedActions,
      paymentVisibility,
      linkedInvoiceCount,
      customerId: quote.customerId,
      jobId: quote.jobId,
      role,
    };
  }

  async createQuoteVersion(actorOrCompany: FinanceActor | string, quoteId: string, input: CreateQuoteVersionRequest): Promise<QuoteSummary> {
    const actor = toActor(actorOrCompany);
    const source = await this.db.query.quotes.findFirst({ where: and(eq(quotes.id, quoteId), eq(quotes.companyId, actor.companyId)), with: { lineItems: true } });
    if (!source) throw new FinanceError('NOT_FOUND', 'Quote not found');
    const replay = await this.db.query.quotes.findFirst({ where: and(eq(quotes.companyId, actor.companyId), eq(quotes.clientActionId, input.clientActionId)), with: { customer: true, job: true } });
    if (replay) return toQuoteSummary(replay);
    const next = await this.createQuote(actor, { customerId: source.customerId, jobId: source.jobId, propertyId: source.propertyId, leadId: source.leadId, currency: source.currency, validUntil: source.validUntil?.toISOString() ?? null, lineItems: source.lineItems.map(line => ({ category: line.category, description: line.description, quantity: Number(line.quantity), unitPriceCents: line.unitPriceCents, unitCostCents: line.unitCostCents, vatRateBps: line.vatRateBps, isOptional: line.isOptional, optionTier: line.optionTier })), clientActionId: input.clientActionId, notes: input.reason ?? source.notes, belowFloorOverride: source.belowFloorOverride, belowFloorReason: source.belowFloorReason });
    await this.db.update(quotes).set({ rootQuoteId: source.rootQuoteId ?? source.id, supersedesQuoteId: source.id, versionNumber: source.versionNumber + 1 }).where(eq(quotes.id, next.id));
    await this.db.update(quotes).set({ status: 'superseded', updatedAt: new Date() }).where(eq(quotes.id, source.id));
    return (await this.getQuote(actor.companyId, next.id))!;
  }

  async createInvoiceFromQuote(actorOrCompany: FinanceActor | string, quoteId: string, input: CreateInvoiceFromQuoteRequest): Promise<InvoiceSummary> {
    const actor = toActor(actorOrCompany);
    const quote = await this.db.query.quotes.findFirst({
      where: and(eq(quotes.id, quoteId), eq(quotes.companyId, actor.companyId)),
      with: { lineItems: true, job: true, invoices: { columns: { id: true, stage: true } } },
    });
    if (!quote) throw new FinanceError('NOT_FOUND', 'Quote not found');

    // Idempotent replay via clientActionId happens inside createInvoice.
    if (input.clientActionId) {
      const existingInvoice = await this.db.query.invoices.findFirst({
        where: and(eq(invoices.companyId, actor.companyId), eq(invoices.clientActionId, input.clientActionId)),
        with: { customer: true, job: true, quote: true },
      });
      if (existingInvoice) return toInvoiceSummary(existingInvoice);
    }

    const decision = evaluateConvertQuote({
      id: quote.id,
      status: quote.status,
      isImmutable: quote.isImmutable,
      sourceProvider: quote.sourceProvider,
      xeroQuoteId: quote.xeroQuoteId,
      xeroQuoteNumber: quote.xeroQuoteNumber,
      hasLinkedInvoice: (quote.invoices?.length ?? 0) > 0,
      linkedInvoiceCount: quote.invoices?.length ?? 0,
    });
    if (decision.kind === 'idempotent') {
      // Already converted — return existing final/standard invoice when present; never create another conversion.
      const existing = quote.invoices?.[0];
      if (existing) {
        const summary = await this.getInvoice(actor.companyId, existing.id);
        if (summary) return summary;
      }
      throw new FinanceError('QUOTE_ALREADY_CONVERTED', decision.message ?? 'Quote already converted');
    }
    if (decision.kind === 'reject') {
      throw new FinanceError(
        decision.code ?? 'QUOTE_NOT_ELIGIBLE_FOR_CONVERT',
        decision.message ?? 'Only accepted quotes can be invoiced',
      );
    }

    const conversionRequested = buildQuoteLifecycleAuditEvent({
      eventType: 'quote_conversion_requested',
      companyId: actor.companyId,
      quoteId: quote.id,
      quoteNumber: quote.quoteNumber,
      displayQuoteNumber: displayOfficialQuoteNumber({ xeroQuoteNumber: quote.xeroQuoteNumber }),
      actorId: actor.userId ?? null,
      fromState: quote.status,
      toState: input.stage === 'final' || !quote.lineItems.length ? 'converted' : 'accepted',
      sourceProvider: quote.sourceProvider,
      extra: { stage: input.stage ?? 'standard' },
    });
    emitBusinessEvent({
      companyId: conversionRequested.companyId,
      eventType: conversionRequested.eventType,
      entityType: conversionRequested.entityType,
      entityId: conversionRequested.entityId,
      payload: conversionRequested.payload,
    });

    // Local TITAN invoice creation only. Outbound Xero invoice_create remains approval-gated elsewhere.
    // Never mark converted when a provider write was requested and blocked.
    const providerOutcome = resolveProviderActionOutcome({
      requested: 'convert',
      providerWriteAttempted: false,
      providerWriteAllowed: false,
    });

    const lines = quote.lineItems.map(line => ({ category: line.category, description: line.description, quantity: Number(line.quantity), unitPriceCents: line.unitPriceCents, vatRateBps: line.vatRateBps }));
    const invoice = await this.createInvoice(actor, { customerId: quote.customerId, jobId: quote.jobId, quoteId: quote.id, propertyId: quote.propertyId, stage: input.stage, dueDate: input.dueDate, notes: input.notes, amountCents: input.amountCents ?? quote.totalCents, lineItems: lines, clientActionId: input.clientActionId });
    await this.db.update(invoices).set({ quoteVersionNumber: quote.versionNumber, xeroReference: quote.job?.jobNumber ?? null }).where(eq(invoices.id, invoice.id));

    const shouldConvert = input.stage === 'final' || !quote.lineItems.length;
    if (shouldConvert) {
      const applied = applyProviderOutcomeToBusinessState({
        currentStatus: quote.status,
        requestedToStatus: 'converted',
        outcome: providerOutcome,
      });
      if (applied.applied) {
        await this.db.update(quotes).set({ status: 'converted', updatedAt: new Date() }).where(eq(quotes.id, quote.id));
        const convertedAudit = buildQuoteLifecycleAuditEvent({
          eventType: 'quote_converted',
          companyId: actor.companyId,
          quoteId: quote.id,
          quoteNumber: quote.quoteNumber,
          displayQuoteNumber: displayOfficialQuoteNumber({ xeroQuoteNumber: quote.xeroQuoteNumber }),
          actorId: actor.userId ?? null,
          fromState: quote.status,
          toState: 'converted',
          sourceProvider: quote.sourceProvider,
          extra: { invoiceId: invoice.id, stage: input.stage ?? 'standard' },
        });
        emitBusinessEvent({
          companyId: convertedAudit.companyId,
          eventType: convertedAudit.eventType,
          entityType: convertedAudit.entityType,
          entityId: convertedAudit.entityId,
          payload: convertedAudit.payload,
        });
      }
    }
    return (await this.getInvoice(actor.companyId, invoice.id))!;
  }

  async createInvoiceFromJob(
    actorOrCompany: FinanceActor | string,
    jobId: string,
    input: CreateInvoiceFromQuoteRequest,
  ): Promise<InvoiceSummary> {
    const actor = toActor(actorOrCompany);
    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, actor.companyId)),
    });
    if (!job) throw new FinanceError('JOB_NOT_FOUND', 'Job not found');

    // Still Busy / multi-day: block final/standard invoicing until COMPLETE JOB.
    // Authorised deposit/progress stage billing may still proceed.
    const stage = input.stage ?? 'standard';
    const isProgressBilling = stage === 'deposit' || stage === 'progress';
    if (!isProgressBilling) {
      if (job.executionPhase === 'work_continues') {
        throw new FinanceError(
          'VALIDATION_ERROR',
          'Job is Still Busy / work continues — final COMPLETE JOB required before invoicing',
        );
      }
      const openVisit = await this.db.query.jobVisits.findFirst({
        where: and(
          eq(jobVisits.companyId, actor.companyId),
          eq(jobVisits.jobId, jobId),
          eq(jobVisits.status, 'open'),
        ),
        columns: { id: true },
      });
      if (openVisit) {
        throw new FinanceError(
          'VALIDATION_ERROR',
          'An open work visit is in progress — close the visit or complete the job before invoicing',
        );
      }
      if (
        stage === 'final' &&
        job.status !== 'completed' &&
        job.executionPhase !== 'completed'
      ) {
        throw new FinanceError(
          'VALIDATION_ERROR',
          'Final invoice requires COMPLETE JOB — Still Busy does not open Ready for Invoicing',
        );
      }
    }

    const acceptedQuote = await this.db.query.quotes.findFirst({
      where: and(
        eq(quotes.companyId, actor.companyId),
        eq(quotes.jobId, jobId),
        eq(quotes.status, 'accepted'),
      ),
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

  async getInvoiceDetail(
    companyId: string,
    invoiceId: string,
    _options: { includeProfit?: boolean } = {},
  ): Promise<InvoiceDetail | null> {
    const row = await this.db.query.invoices.findFirst({ where: and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)), with: { customer: true, job: true, quote: true, lineItems: true, payments: { with: { invoice: { with: { customer: true } } } } } });
    if (!row) return null;
    const documentSections = await this.documentSections.loadSections({ companyId, invoiceId });
    return {
      ...toInvoiceSummary(row),
      subtotalCents: row.subtotalCents,
      vatCents: row.vatCents,
      paymentTerms: row.paymentTerms,
      billingName: row.billingName,
      billingEmail: row.billingEmail,
      billingPhone: row.billingPhone,
      notes: row.notes,
      addresses: toFinanceDocumentAddressSnapshot(row),
      lineItems: row.lineItems.map((line) => ({
        id: line.id,
        position: line.position,
        category: line.category,
        description: line.description,
        quantity: Number(line.quantity),
        unitPriceCents: line.unitPriceCents,
        vatRateBps: line.vatRateBps,
        lineSubtotalCents: line.lineSubtotalCents,
        lineVatCents: line.lineVatCents,
        lineTotalCents: line.lineTotalCents,
      })),
      payments: row.payments.map(toPaymentSummary),
      documentSections,
    };
  }

  async updateInvoice(
    actorOrCompany: FinanceActor | string,
    invoiceId: string,
    input: UpdateInvoiceRequest,
  ): Promise<InvoiceDetail> {
    const actor = toActor(actorOrCompany);
    const sanitized = sanitizeFinanceDocumentWriteRequest(
      input,
      this.includeProfitForActor(actor),
    );
    const current = await this.db.query.invoices.findFirst({
      where: and(eq(invoices.id, invoiceId), eq(invoices.companyId, actor.companyId)),
    });
    if (!current) throw new FinanceError('NOT_FOUND', 'Invoice not found');
    if (!canEditInvoice(current)) {
      throw new FinanceError('SYNC_CONFLICT', 'Cannot edit synced invoice without approval workflow');
    }

    const settings = await this.ensureFinanceSettings(actor.companyId);
    const computed = sanitized.lineItems
      ? quoteAmounts(sanitized.lineItems, settings.profitFloorMarginBps, 0)
      : null;

    let issuedAtUpdate: Date | null | undefined;
    try {
      issuedAtUpdate = resolveInvoiceIssuedAtUpdate(current.issuedAt, sanitized.issuedAt);
    } catch {
      throw new FinanceError('VALIDATION_ERROR', 'Invalid invoice date');
    }
    const addressUpdate = resolveDocumentAddressColumns(current, sanitized);

    await this.db
      .update(invoices)
      .set({
        status: sanitized.status ?? current.status,
        stage: sanitized.stage ?? current.stage,
        currency: sanitized.currency?.trim() || current.currency,
        dueDate: sanitized.dueDate === undefined ? current.dueDate : parseOptionalDate(sanitized.dueDate),
        notes: sanitized.notes === undefined ? current.notes : normalizeOptionalText(sanitized.notes),
        paymentTerms:
          sanitized.paymentTerms === undefined ? current.paymentTerms : normalizeOptionalText(sanitized.paymentTerms),
        ...(sanitized.customerReference !== undefined
          ? { xeroReference: mapCustomerReferenceToStorage(sanitized.customerReference) }
          : {}),
        ...(issuedAtUpdate !== undefined ? { issuedAt: issuedAtUpdate } : {}),
        ...(addressUpdate ?? {}),
        ...(computed && {
          amountCents: computed.totalCents,
          subtotalCents: computed.subtotalCents,
          vatCents: computed.vatCents,
          totalCents: computed.totalCents,
        }),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));

    if (computed) {
      await this.db.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, invoiceId));
      await this.insertInvoiceLines(invoiceId, actor.companyId, computed.lines);
    }

    if (sanitized.documentContent !== undefined || sanitized.cocDocumentationId !== undefined) {
      await this.documentSections.saveSections(toSectionsActor(actor), {
        invoiceId,
        jobId: current.jobId,
        documentNumber: displayOfficialInvoiceNumber({ xeroInvoiceNumber: current.xeroInvoiceNumber }),
        title: current.title,
        customerId: current.customerId,
        content: sanitized.documentContent,
        cocDocumentationId: sanitized.cocDocumentationId,
      });
    }

    emitBusinessEvent({
      companyId: actor.companyId,
      eventType: 'invoice.created',
      entityType: 'invoice',
      entityId: invoiceId,
      payload: { invoiceId, updated: true },
      actorUserId: actor.userId,
    });

    return (await this.getInvoiceDetail(actor.companyId, invoiceId))!;
  }

  async getPaymentDetail(companyId: string, paymentId: string): Promise<PaymentDetail | null> {
    const row = await this.db.query.payments.findFirst({ where: and(eq(payments.id, paymentId), eq(payments.companyId, companyId)), with: { invoice: { with: { customer: true } }, receipt: true } });
    if (!row) return null;
    return { ...toPaymentSummary(row), notes: row.notes, receipt: row.receipt ? { id: row.receipt.id, receiptNumber: row.receipt.receiptNumber, issuedAt: row.receipt.issuedAt.toISOString(), payload: row.receipt.payload } : null };
  }

  async getJobFinanceSummary(companyId: string, jobId: string, options: { includeProfit?: boolean } = {}): Promise<JobFinanceSummary> {
    const [quoteRows, invoiceRows, paymentRows, jobRow, documentRows, visitRows, materialRows] = await Promise.all([
      this.db.query.quotes.findMany({ where: and(eq(quotes.companyId, companyId), eq(quotes.jobId, jobId)), with: { customer: true, job: true } }),
      this.db.query.invoices.findMany({ where: and(eq(invoices.companyId, companyId), eq(invoices.jobId, jobId)), with: { customer: true, job: true, quote: true } }),
      this.db.query.payments.findMany({ where: and(eq(payments.companyId, companyId), sql`exists (select 1 from invoices where invoices.id = ${payments.invoiceId} and invoices.job_id = ${jobId})`), with: { invoice: { with: { customer: true } } } }),
      this.db.query.jobs.findFirst({ where: and(eq(jobs.companyId, companyId), eq(jobs.id, jobId)) }),
      this.db.query.documents.findMany({
        where: and(eq(documents.companyId, companyId), eq(documents.jobId, jobId)),
        limit: 200,
      }),
      this.db.query.jobVisits.findMany({
        where: and(eq(jobVisits.companyId, companyId), eq(jobVisits.jobId, jobId)),
        limit: 200,
      }),
      this.db.query.jobMaterialLines.findMany({
        where: and(eq(jobMaterialLines.companyId, companyId), eq(jobMaterialLines.jobId, jobId)),
        limit: 500,
      }),
    ]);
    const quotesOut = quoteRows.map(row => toQuoteSummary(row, options.includeProfit ? profitFromQuote(row) : null));
    const invoicesOut = invoiceRows.map(toInvoiceSummary); const paymentsOut = paymentRows.map(toPaymentSummary);
    const currency = quotesOut[0]?.currency ?? invoicesOut[0]?.currency ?? 'ZAR';
    const quotedCents = quotesOut.reduce((sum, item) => sum + item.totalCents, 0);
    const accepted = quotesOut.find((item) => item.status === 'accepted') ?? null;
    const invoicedCents = invoicesOut.reduce((sum, item) => sum + item.totalCents, 0);
    const paidCents = paymentsOut.reduce((sum, item) => sum + item.amountCents, 0);
    const outstanding = invoicesOut.reduce((sum, item) => sum + item.outstandingCents, 0);
    const overdueCount = invoicesOut.filter((item) => item.isOverdue).length;
    const docText = documentRows.map((doc) => `${doc.title} ${doc.fileName} ${doc.description ?? ''}`.toLowerCase());
    const photoCount = docText.filter((text) => text.includes('photo') || text.includes('photophase=')).length;
    const hasPaymentProof = docText.some((text) => text.includes('proof of payment') || text.includes('payment_proof') || text.includes('pop'));
    const hasCoc = docText.some((text) => text.includes('coc') || text.includes('certificate of compliance'));
    const hasJobCard = docText.some((text) => text.includes('job card'));
    const hasReport = docText.some((text) => text.includes('report'));
    const hasSignature = docText.some((text) => text.includes('signature'));
    const isHistorical = Boolean(
      jobRow?.sourceProvider ||
        (Array.isArray(jobRow?.historicalFlags) && jobRow.historicalFlags.length > 0) ||
        quoteRows.some((row) => row.sourceProvider) ||
        invoiceRows.some((row) => row.sourceProvider),
    );
    const historicalCompleteness = deriveJob360HistoricalCompleteness({
      isHistorical,
      quoteCount: quotesOut.length,
      invoiceCount: invoicesOut.length,
      paymentCount: paymentsOut.length,
      hasPaymentProof,
      photoCount,
      hasCoc,
      hasJobCard,
      hasReport,
      hasSignature,
    });
    const equipmentCount = jobRow?.customerId
      ? (
          await this.db.query.alAssetRegistryProfiles.findMany({
            where: and(
              eq(alAssetRegistryProfiles.companyId, companyId),
              eq(alAssetRegistryProfiles.customerId, jobRow.customerId),
              ...(jobRow.propertyId
                ? [eq(alAssetRegistryProfiles.propertyId, jobRow.propertyId)]
                : []),
            ),
            limit: 100,
          })
        ).length
      : 0;
    const paymentProofCount = docText.filter(
      (text) =>
        text.includes('proof of payment') ||
        text.includes('payment_proof') ||
        text.includes('pop-') ||
        /\bpop\b/.test(text),
    ).length;
    const digitalFile = buildJob360DigitalFileRollup({
      hasCustomer: Boolean(jobRow?.customerId),
      hasProperty: Boolean(jobRow?.propertyId),
      quoteCount: quotesOut.length,
      invoiceCount: invoicesOut.length,
      paymentCount: paymentsOut.length,
      paymentProofCount,
      photoCount,
      documentCount: documentRows.length,
      visitCount: visitRows.length,
      materialLineCount: materialRows.length,
      equipmentCount,
      timelineEventCount:
        (jobRow ? 1 : 0) +
        quotesOut.length +
        invoicesOut.length +
        paymentsOut.length +
        visitRows.length +
        documentRows.length,
      hasJobCard,
      canViewFinance: options.includeProfit !== false,
    });
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
      historicalCompleteness,
      digitalFile,
    };
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

  async searchCatalogueItems(
    companyId: string,
    query: string,
    options: { includeCost?: boolean } = {},
  ): Promise<FinanceCatalogueItemSearchResult[]> {
    const trimmed = query.trim();
    if (trimmed.length < 1) return [];

    const pattern = `%${trimmed}%`;
    const inventoryRows = await this.db.query.inventoryItems.findMany({
      where: and(
        eq(inventoryItems.companyId, companyId),
        eq(inventoryItems.status, 'active'),
        or(
          ilike(inventoryItems.sku, pattern),
          ilike(inventoryItems.name, pattern),
          ilike(inventoryItems.description, pattern),
        ),
      ),
      orderBy: [desc(inventoryItems.updatedAt)],
      limit: 24,
    });

    const company = await this.db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });

    const catalogue = inventoryRows.map((row) =>
      inventoryItemToFinanceCatalogue({
        id: row.id,
        sku: row.sku,
        name: row.name,
        description: row.description,
        unit: row.unit,
        unitCostCents: row.unitCostCents,
        sellPriceCents: row.sellPriceCents,
      }),
    );

    const pricebook = resolveYoungGunsPricebookForTenant(companyId, company ?? null);
    const results = searchFinanceCatalogueItems(trimmed, [...catalogue, ...pricebook], { limit: 12 });
    return filterFinanceCatalogueCostFields(results, options.includeCost ?? false);
  }

  /** Read-only preview — enriches editor values with server-authoritative payment/review/COC data. */
  async previewDocument(
    actor: FinancePreviewEnrichmentActor,
    input: FinancePreviewEnrichmentRequest,
  ): Promise<FinanceDocumentPreviewModel> {
    return this.previewEnrichment.buildPreviewModel(actor, input);
  }

  async listJobCocEvidence(companyId: string, jobId: string) {
    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, companyId)),
    });
    if (!job) throw new FinanceError('JOB_NOT_FOUND', 'Job not found');
    return this.documentSections.listCocEvidence(companyId, jobId);
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
        quoteNumber: displayOfficialQuoteNumber({ xeroQuoteNumber: row.xeroQuoteNumber }),
        status: row.status,
        customerName: row.customer?.name ?? 'Unknown',
        amountCents: row.amountCents,
        currency: row.currency,
      })),
      recentInvoices: invoiceRows.map((row) => ({
        id: row.id,
        invoiceNumber: displayOfficialInvoiceNumber({ xeroInvoiceNumber: row.xeroInvoiceNumber }),
        status: row.status,
        customerName: row.customer?.name ?? 'Unknown',
        amountCents: row.amountCents,
        amountPaidCents: row.amountPaidCents,
        currency: row.currency,
      })),
      recentPayments: paymentRows.map((row) => ({
        id: row.id,
        invoiceNumber: pickPaymentInvoiceDisplayNumber({
          invoice: row.invoice
            ? {
                id: row.invoice.id,
                invoiceNumber: row.invoice.invoiceNumber,
                xeroInvoiceNumber: row.invoice.xeroInvoiceNumber,
                numberAuthority: row.invoice.numberAuthority,
                sourceProvider: row.invoice.sourceProvider,
                sourceExternalId: row.invoice.sourceExternalId,
              }
            : null,
        }),
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
  ): Promise<{ name: string }> {
    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.companyId, companyId)),
    });

    if (!customer) {
      throw new FinanceError('CUSTOMER_NOT_FOUND', 'Customer not found for this company');
    }
    return customer;
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

  private includeProfitForActor(actor: FinanceActor): boolean {
    return canViewFinanceProfit(actor.permissions ?? [], actor.roleName ?? null);
  }

  private mapQuoteLifecycleError(error: unknown): FinanceError {
    if (error instanceof QuoteLifecycleError) {
      return new FinanceError(error.code, error.message);
    }
    if (error instanceof FinanceError) return error;
    return new FinanceError('VALIDATION_ERROR', error instanceof Error ? error.message : 'Quote lifecycle error');
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
  quote?: {
    quoteNumber: string;
    xeroQuoteNumber?: string | null;
    xeroQuoteId?: string | null;
    sourceProvider?: string | null;
    sourceExternalId?: string | null;
    id?: string;
  } | null;
};

type PaymentWithRelations = typeof payments.$inferSelect & {
  invoice: {
    id?: string;
    invoiceNumber: string;
    xeroInvoiceNumber?: string | null;
    numberAuthority?: string | null;
    sourceProvider?: string | null;
    sourceExternalId?: string | null;
    customer: { name: string } | null;
  } | null;
};

function toQuoteSummary(row: QuoteWithRelations & Record<string, any>, profit: QuoteSummary['profit'] = null): QuoteSummary {
  return {
    id: row.id,
    quoteNumber: row.quoteNumber,
    xeroQuoteNumber: row.xeroQuoteNumber ?? null,
    displayQuoteNumber: displayOfficialQuoteNumber({
      xeroQuoteNumber: row.xeroQuoteNumber,
      quoteNumber: row.quoteNumber,
      id: row.id,
      xeroQuoteId: row.xeroQuoteId,
      sourceExternalId: row.sourceExternalId,
      sourceProvider: row.sourceProvider,
    }),
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
    sourceProvider: row.sourceProvider ?? null,
    sourceExternalId: row.sourceExternalId ?? null,
    xeroQuoteId: row.xeroQuoteId ?? null,
    ...(profit ? { profit } : {}),
  };
}

function toInvoiceSummary(row: InvoiceWithRelations & Record<string, any>): InvoiceSummary {
  const officialInvoice = displayOfficialInvoiceNumber({
    xeroInvoiceNumber: row.xeroInvoiceNumber,
    invoiceNumber: row.invoiceNumber,
    internalNumber: row.internalNumber,
    id: row.id,
    sourceExternalId: row.sourceExternalId,
    sourceProvider: row.sourceProvider,
    numberAuthority: row.numberAuthority,
  });
  const linkedQuoteNumber = row.quote
    ? resolveQuoteDisplayNumberLabel({
        id: row.quote.id,
        quoteNumber: row.quote.quoteNumber,
        xeroQuoteNumber: row.quote.xeroQuoteNumber,
        xeroQuoteId: row.quote.xeroQuoteId,
        sourceExternalId: row.quote.sourceExternalId,
        sourceProvider: row.quote.sourceProvider,
      })
    : null;
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    internalNumber: row.internalNumber ?? row.invoiceNumber,
    displayInvoiceNumber: officialInvoice,
    displayOfficialInvoiceNumber: officialInvoice,
    xeroInvoiceNumber: row.xeroInvoiceNumber ?? null,
    xeroReference: row.xeroReference ?? null,
    numberAuthority: (row.numberAuthority ?? 'internal_pending_xero') as InvoiceSummary['numberAuthority'],
    status: row.status,
    stage: row.stage ?? 'standard',
    customerId: row.customerId,
    customerName: row.customer?.name ?? 'Unknown',
    jobId: row.jobId,
    jobTitle: row.job?.title ?? null,
    jobNumber: row.job?.jobNumber ?? null,
    quoteId: row.quoteId ?? null,
    quoteNumber: linkedQuoteNumber,
    quoteVersionNumber: row.quoteVersionNumber ?? null,
    amountCents: row.amountCents,
    totalCents: row.totalCents ?? row.amountCents,
    amountPaidCents: row.amountPaidCents,
    outstandingCents: Math.max(0, (row.totalCents ?? row.amountCents) - row.amountPaidCents),
    isOverdue: Boolean(row.dueDate && row.dueDate < new Date() && ['sent', 'partial', 'overdue'].includes(row.status)),
    currency: row.currency,
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    issuedAt: row.issuedAt?.toISOString() ?? null,
    customerReference: mapCustomerReferenceFromStorage(row.xeroReference),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPaymentSummary(row: PaymentWithRelations & Record<string, any>): PaymentSummary {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    invoiceNumber: pickPaymentInvoiceDisplayNumber({
      invoice: row.invoice
        ? {
            id: row.invoice.id ?? row.invoiceId,
            invoiceNumber: row.invoice.invoiceNumber,
            xeroInvoiceNumber: row.invoice.xeroInvoiceNumber,
            numberAuthority: row.invoice.numberAuthority,
            sourceProvider: row.invoice.sourceProvider,
            sourceExternalId: row.invoice.sourceExternalId,
          }
        : null,
    }),
    invoiceTitle: row.invoice?.customer?.name ?? 'Unknown',
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

function toSectionsActor(actor: FinanceActor): { companyId: string; userId: string | null } {
  return { companyId: actor.companyId, userId: actor.userId ?? null };
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

function resolveDocumentAddressColumns(
  current: {
    billingAddress?: string | null;
    siteAddress?: string | null;
    postalAddress?: string | null;
  },
  input: {
    billingAddress?: string | null;
    siteAddress?: string | null;
    postalAddress?: string | null;
  },
):
  | {
      billingAddress: string | null;
      siteAddress: string | null;
      postalAddress: string | null;
    }
  | undefined {
  if (
    input.billingAddress === undefined &&
    input.siteAddress === undefined &&
    input.postalAddress === undefined
  ) {
    return undefined;
  }

  return normalizeFinanceDocumentAddresses({
    billingAddress: input.billingAddress === undefined ? current.billingAddress : input.billingAddress,
    siteAddress: input.siteAddress === undefined ? current.siteAddress : input.siteAddress,
    postalAddress: input.postalAddress === undefined ? current.postalAddress : input.postalAddress,
  });
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
