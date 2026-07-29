import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type {
  CreateInvoiceRequest,
  CreatePaymentRequest,
  CreateQuoteRequest,
  FinanceStats,
  InvoiceSummary,
  PaymentSummary,
  QuoteSummary,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { customers, companies, invoices, jobs, payments, quotes } from '@titan/db';
import { emitBusinessEvent } from '../lib/automation-events.js';

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

export class FinanceService {
  constructor(private readonly db: DatabaseClient) {}

  async listQuotes(companyId: string): Promise<QuoteSummary[]> {
    const rows = await this.db.query.quotes.findMany({
      where: eq(quotes.companyId, companyId),
      with: { customer: true, job: true },
      orderBy: [desc(quotes.updatedAt)],
    });

    return rows.map(toQuoteSummary);
  }

  async listInvoices(companyId: string): Promise<InvoiceSummary[]> {
    const rows = await this.db.query.invoices.findMany({
      where: eq(invoices.companyId, companyId),
      with: { customer: true, job: true },
      orderBy: [desc(invoices.updatedAt)],
    });

    return rows.map(toInvoiceSummary);
  }

  async listPayments(companyId: string): Promise<PaymentSummary[]> {
    const rows = await this.db.query.payments.findMany({
      where: eq(payments.companyId, companyId),
      with: {
        invoice: {
          with: { customer: true },
        },
      },
      orderBy: [desc(payments.paidAt)],
    });

    return rows.map(toPaymentSummary);
  }

  async createQuote(companyId: string, input: CreateQuoteRequest): Promise<QuoteSummary> {
    const title = input.title.trim();

    if (!title) {
      throw new FinanceError('VALIDATION_ERROR', 'Quote title is required');
    }

    if (input.amountCents <= 0) {
      throw new FinanceError('VALIDATION_ERROR', 'Quote amount must be greater than zero');
    }

    await this.ensureCustomerBelongsToCompany(companyId, input.customerId);

    if (input.jobId) {
      await this.ensureJobBelongsToCompany(companyId, input.jobId, input.customerId);
    }

    const quoteNumber = await this.nextQuoteNumber(companyId);

    const [created] = await this.db
      .insert(quotes)
      .values({
        companyId,
        customerId: input.customerId,
        jobId: input.jobId ?? null,
        quoteNumber,
        title,
        status: input.status ?? 'draft',
        amountCents: input.amountCents,
        currency: input.currency?.trim() || 'USD',
        validUntil: parseOptionalDate(input.validUntil),
        notes: normalizeOptionalText(input.notes),
      })
      .returning();

    if (!created) {
      throw new FinanceError('CREATE_FAILED', 'Unable to create quote');
    }

    const quote = (await this.getQuote(companyId, created.id))!;

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

    return quote;
  }

  async createInvoice(companyId: string, input: CreateInvoiceRequest): Promise<InvoiceSummary> {
    const title = input.title.trim();

    if (!title) {
      throw new FinanceError('VALIDATION_ERROR', 'Invoice title is required');
    }

    if (input.amountCents <= 0) {
      throw new FinanceError('VALIDATION_ERROR', 'Invoice amount must be greater than zero');
    }

    await this.ensureCustomerBelongsToCompany(companyId, input.customerId);

    if (input.jobId) {
      await this.ensureJobBelongsToCompany(companyId, input.jobId, input.customerId);
    }

    if (input.quoteId) {
      await this.ensureQuoteBelongsToCompany(companyId, input.quoteId, input.customerId);
    }

    const invoiceNumber = await this.nextInvoiceNumber(companyId);

    const [created] = await this.db
      .insert(invoices)
      .values({
        companyId,
        customerId: input.customerId,
        jobId: input.jobId ?? null,
        quoteId: input.quoteId ?? null,
        invoiceNumber,
        title,
        status: input.status ?? 'draft',
        amountCents: input.amountCents,
        currency: input.currency?.trim() || 'USD',
        dueDate: parseOptionalDate(input.dueDate),
        issuedAt: parseOptionalDate(input.issuedAt) ?? new Date(),
        notes: normalizeOptionalText(input.notes),
      })
      .returning();

    if (!created) {
      throw new FinanceError('CREATE_FAILED', 'Unable to create invoice');
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

    return invoice;
  }

  async createPayment(companyId: string, input: CreatePaymentRequest): Promise<PaymentSummary> {
    if (input.amountCents <= 0) {
      throw new FinanceError('VALIDATION_ERROR', 'Payment amount must be greater than zero');
    }

    const invoice = await this.db.query.invoices.findFirst({
      where: and(eq(invoices.id, input.invoiceId), eq(invoices.companyId, companyId)),
    });

    if (!invoice) {
      throw new FinanceError('NOT_FOUND', 'Invoice not found');
    }

    if (invoice.status === 'cancelled') {
      throw new FinanceError('VALIDATION_ERROR', 'Cannot record payment against a cancelled invoice');
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

    return payment;
  }

  async getStats(companyId: string): Promise<FinanceStats> {
    const [openQuotesRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(quotes)
      .where(and(eq(quotes.companyId, companyId), inArray(quotes.status, [...OPEN_QUOTE_STATUSES])));

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
    };
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

    return `INV-${String((row?.count ?? 0) + 1).padStart(4, '0')}`;
  }

  private async resolveCurrency(companyId: string): Promise<string> {
    const company = await this.db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });

    return company?.preferences?.currency?.trim() || 'USD';
  }

  private async ensureCustomerBelongsToCompany(companyId: string, customerId: string): Promise<void> {
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
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, companyId), eq(jobs.customerId, customerId)),
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
      where: and(eq(quotes.id, quoteId), eq(quotes.companyId, companyId), eq(quotes.customerId, customerId)),
    });

    if (!quote) {
      throw new FinanceError('QUOTE_NOT_FOUND', 'Quote not found for this customer');
    }
  }
}

type QuoteWithRelations = typeof quotes.$inferSelect & {
  customer: { name: string } | null;
  job: { title: string } | null;
};

type InvoiceWithRelations = typeof invoices.$inferSelect & {
  customer: { name: string } | null;
  job: { title: string } | null;
};

type PaymentWithRelations = typeof payments.$inferSelect & {
  invoice: ({ invoiceNumber: string; title: string; customer: { name: string } | null } | null);
};

function toQuoteSummary(row: QuoteWithRelations): QuoteSummary {
  return {
    id: row.id,
    quoteNumber: row.quoteNumber,
    title: row.title,
    status: row.status,
    customerId: row.customerId,
    customerName: row.customer?.name ?? 'Unknown',
    jobId: row.jobId,
    jobTitle: row.job?.title ?? null,
    amountCents: row.amountCents,
    currency: row.currency,
    validUntil: row.validUntil ? row.validUntil.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toInvoiceSummary(row: InvoiceWithRelations): InvoiceSummary {
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    title: row.title,
    status: row.status,
    customerId: row.customerId,
    customerName: row.customer?.name ?? 'Unknown',
    jobId: row.jobId,
    jobTitle: row.job?.title ?? null,
    amountCents: row.amountCents,
    amountPaidCents: row.amountPaidCents,
    currency: row.currency,
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPaymentSummary(row: PaymentWithRelations): PaymentSummary {
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
    paidAt: row.paidAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
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
