import { and, eq, inArray } from 'drizzle-orm';
import type {
  XeroAttributedAmount,
  XeroCustomerFinancialHistory,
  XeroCustomerFinancialRecord,
  XeroFinancialAttribution,
  XeroHistoryCoverage,
} from '@titan/shared';
import { buildUnavailableAttribution } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  customers,
  invoices,
  payments,
  quotes,
  securityAuditLogs,
  xeroCreditNotes,
  xeroCustomerMappings,
  xeroInvoiceMappings,
  xeroPaymentMappings,
  xeroQuoteMappings,
} from '@titan/db';
import type { XeroSyncService } from './xero-sync.service.js';

export class XeroFinancialMemoryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'XeroFinancialMemoryError';
  }
}

export type XeroFinancialMemoryActor = {
  companyId: string;
  userId: string;
  role: string;
};

/**
 * Roles permitted to read financial history. Technician and Client are denied — this is
 * Owner/Admin/Accountant territory, enforced here in the service as well as at the router gate.
 *
 * The tenant's owner role is named "Company Owner"; leaving it out locked the one person this
 * history exists for out of it. Platform Owner is deliberately absent — it is a cross-tenant
 * platform role, not a reader of one tenant's ledger.
 */
const FINANCE_HISTORY_ROLES = new Set([
  'company owner',
  'owner',
  'admin',
  'accountant',
  'manager',
]);

/**
 * Read layer over imported Xero financial history.
 *
 * Reads from source records every time. It never stores or caches an authoritative balance,
 * because a stored balance is a second ledger waiting to drift from Xero.
 */
export class XeroFinancialMemoryService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly xeroSyncService: XeroSyncService,
  ) {}

  private assertCanReadFinancialHistory(actor: XeroFinancialMemoryActor): void {
    if (!FINANCE_HISTORY_ROLES.has(actor.role.toLowerCase())) {
      throw new XeroFinancialMemoryError(
        'FORBIDDEN',
        'Financial history is restricted to Owner, Admin, Accountant and Manager roles.',
      );
    }
  }

  private async recordAccess(
    actor: XeroFinancialMemoryActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      userId: actor.userId,
      category: 'integrations',
      action,
      entityType: 'xero_financial_history',
      entityId,
      metadata,
    });
  }

  async getHistoryCoverage(actor: XeroFinancialMemoryActor): Promise<XeroHistoryCoverage> {
    this.assertCanReadFinancialHistory(actor);
    return this.xeroSyncService.getHistoryCoverage(actor.companyId);
  }

  /**
   * Complete financial relationship for one customer, built from imported Xero records.
   *
   * Every figure carries attribution and an "as at" sync timestamp, and reports
   * available / partial / unavailable with a rationale rather than being coerced to zero.
   */
  async getCustomerFinancialHistory(
    actor: XeroFinancialMemoryActor,
    customerId: string,
  ): Promise<XeroCustomerFinancialHistory> {
    this.assertCanReadFinancialHistory(actor);

    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.companyId, actor.companyId)),
      columns: { id: true },
    });

    if (!customer) {
      throw new XeroFinancialMemoryError('NOT_FOUND', 'Customer not found for this company.');
    }

    const coverage = await this.xeroSyncService.getHistoryCoverage(actor.companyId);
    const asAt = coverage.lastIncrementalSyncAt;

    const [invoiceRows, quoteRows, paymentRows, contactMapping] = await Promise.all([
      this.db.query.invoices.findMany({
        where: and(eq(invoices.companyId, actor.companyId), eq(invoices.customerId, customerId)),
      }),
      this.db.query.quotes.findMany({
        where: and(eq(quotes.companyId, actor.companyId), eq(quotes.customerId, customerId)),
      }),
      this.db.query.payments.findMany({
        where: eq(payments.companyId, actor.companyId),
      }),
      this.db.query.xeroCustomerMappings.findFirst({
        where: and(
          eq(xeroCustomerMappings.companyId, actor.companyId),
          eq(xeroCustomerMappings.customerId, customerId),
        ),
      }),
    ]);

    const invoiceIds = invoiceRows.map((row) => row.id);
    const invoiceMappings = invoiceIds.length
      ? await this.db.query.xeroInvoiceMappings.findMany({
          where: and(
            eq(xeroInvoiceMappings.companyId, actor.companyId),
            inArray(xeroInvoiceMappings.invoiceId, invoiceIds),
          ),
        })
      : [];
    const xeroInvoiceIdByInvoice = new Map(
      invoiceMappings.map((row) => [row.invoiceId, row.xeroInvoiceId]),
    );

    const quoteIds = quoteRows.map((row) => row.id);
    const quoteMappings = quoteIds.length
      ? await this.db.query.xeroQuoteMappings.findMany({
          where: and(
            eq(xeroQuoteMappings.companyId, actor.companyId),
            inArray(xeroQuoteMappings.quoteId, quoteIds),
          ),
        })
      : [];
    const xeroQuoteIdByQuote = new Map(quoteMappings.map((row) => [row.quoteId, row.xeroQuoteId]));

    const customerPayments = paymentRows.filter((row) => invoiceIds.includes(row.invoiceId));
    const paymentIds = customerPayments.map((row) => row.id);
    const paymentMappings = paymentIds.length
      ? await this.db.query.xeroPaymentMappings.findMany({
          where: and(
            eq(xeroPaymentMappings.companyId, actor.companyId),
            inArray(xeroPaymentMappings.paymentId, paymentIds),
          ),
        })
      : [];
    const xeroPaymentIdByPayment = new Map(
      paymentMappings.map((row) => [row.paymentId, row.xeroPaymentId]),
    );

    const creditNotes = contactMapping?.xeroContactId
      ? await this.db.query.xeroCreditNotes.findMany({
          where: and(
            eq(xeroCreditNotes.companyId, actor.companyId),
            eq(xeroCreditNotes.xeroContactId, contactMapping.xeroContactId),
          ),
        })
      : [];

    const currency = invoiceRows[0]?.currency ?? 'ZAR';

    const invoiceRecords: XeroCustomerFinancialRecord[] = invoiceRows.map((row) => ({
      recordType: 'invoice',
      xeroId: xeroInvoiceIdByInvoice.get(row.id) ?? null,
      titanId: row.id,
      reference: row.invoiceNumber,
      status: row.status,
      amountCents: row.amountCents ?? 0,
      amountPaidCents: row.amountPaidCents ?? 0,
      amountDueCents: Math.max((row.amountCents ?? 0) - (row.amountPaidCents ?? 0), 0),
      currency: row.currency ?? currency,
      issuedAt: row.issuedAt?.toISOString() ?? null,
      dueAt: row.dueDate?.toISOString() ?? null,
      jobId: row.jobId ?? null,
    }));

    const quoteRecords: XeroCustomerFinancialRecord[] = quoteRows.map((row) => ({
      recordType: 'quote',
      xeroId: xeroQuoteIdByQuote.get(row.id) ?? null,
      titanId: row.id,
      reference: row.quoteNumber,
      status: row.status,
      amountCents: row.totalCents ?? row.amountCents ?? 0,
      amountPaidCents: null,
      amountDueCents: null,
      currency: row.currency ?? currency,
      issuedAt: row.issuedAt?.toISOString() ?? null,
      dueAt: row.validUntil?.toISOString() ?? null,
      jobId: row.jobId ?? null,
    }));

    const paymentRecords: XeroCustomerFinancialRecord[] = customerPayments.map((row) => ({
      recordType: 'payment',
      xeroId: xeroPaymentIdByPayment.get(row.id) ?? null,
      titanId: row.id,
      reference: row.reference,
      status: null,
      amountCents: row.amountCents ?? 0,
      amountPaidCents: row.amountCents ?? 0,
      amountDueCents: null,
      currency: row.currency ?? currency,
      issuedAt: row.paidAt?.toISOString() ?? null,
      dueAt: null,
      jobId: null,
    }));

    const creditNoteRecords: XeroCustomerFinancialRecord[] = creditNotes.map((row) => ({
      recordType: 'credit_note',
      xeroId: row.xeroCreditNoteId,
      titanId: row.id,
      reference: row.creditNoteNumber,
      status: row.status,
      amountCents: row.totalCents,
      amountPaidCents: null,
      amountDueCents: row.remainingCreditCents,
      currency: row.currency ?? currency,
      issuedAt: row.issueDate ?? null,
      dueAt: null,
      jobId: null,
    }));

    const invoiceCoverage = coverage.entities.find((entity) => entity.entity === 'invoices');
    const paymentCoverage = coverage.entities.find((entity) => entity.entity === 'payments');

    const lifetimeRevenue = this.buildAmount({
      records: invoiceRecords.filter((record) => record.status !== 'cancelled'),
      amountOf: (record) => record.amountPaidCents ?? 0,
      currency,
      asAt,
      method: 'Sum of amounts paid on imported Xero ACCREC invoices for this customer',
      entityCoverage: invoiceCoverage,
      unavailableReason:
        'No Xero invoices have been imported for this customer, so lifetime revenue cannot be stated.',
    });

    const outstandingBalance = this.buildAmount({
      records: invoiceRecords.filter(
        (record) => record.status !== 'cancelled' && (record.amountDueCents ?? 0) > 0,
      ),
      amountOf: (record) => record.amountDueCents ?? 0,
      currency,
      asAt,
      method: 'Sum of amounts due on open imported Xero ACCREC invoices for this customer',
      entityCoverage: invoiceCoverage,
      unavailableReason:
        'No Xero invoices have been imported for this customer, so an outstanding balance cannot be stated.',
    });

    const now = Date.now();
    const overdueExposure = this.buildAmount({
      records: invoiceRecords.filter(
        (record) =>
          record.status !== 'cancelled' &&
          (record.amountDueCents ?? 0) > 0 &&
          record.dueAt !== null &&
          new Date(record.dueAt).getTime() < now,
      ),
      amountOf: (record) => record.amountDueCents ?? 0,
      currency,
      asAt,
      method: 'Sum of amounts due on imported Xero invoices past their Xero due date',
      entityCoverage: invoiceCoverage,
      unavailableReason:
        'No overdue Xero invoices have been imported for this customer, so overdue exposure cannot be stated.',
    });

    return {
      customerId,
      currency,
      invoices: invoiceRecords,
      quotes: quoteRecords,
      payments: paymentRecords,
      creditNotes: creditNoteRecords,
      lifetimeRevenue,
      outstandingBalance,
      overdueExposure,
      averageDaysToPay: this.buildAverageDaysToPay({
        invoiceRecords,
        paymentRecords,
        asAt,
        entityCoverage: paymentCoverage,
      }),
      coverage,
    };
  }

  /**
   * Sum a set of records into an attributed amount. Returns a null amount — never zero — when
   * there is nothing real behind the figure.
   */
  private buildAmount(input: {
    records: XeroCustomerFinancialRecord[];
    amountOf: (record: XeroCustomerFinancialRecord) => number;
    currency: string;
    asAt: string | null;
    method: string;
    entityCoverage:
      | { coverage: 'complete' | 'partial' | 'unavailable'; coverageRationale: string }
      | undefined;
    unavailableReason: string;
  }): XeroAttributedAmount {
    if (input.records.length === 0) {
      return {
        amountCents: null,
        currency: input.currency,
        attribution: buildUnavailableAttribution(input.unavailableReason, input.method),
      };
    }

    const dates = input.records
      .map((record) => record.issuedAt)
      .filter((value): value is string => value !== null)
      .sort();

    return {
      amountCents: input.records.reduce((total, record) => total + input.amountOf(record), 0),
      currency: input.currency,
      attribution: {
        source: 'xero',
        sourceRecordIds: input.records
          .map((record) => record.xeroId ?? record.titanId)
          .filter((value): value is string => Boolean(value)),
        asAt: input.asAt,
        // Coverage of the figure can never exceed coverage of the entity it is built from.
        coverage: input.entityCoverage?.coverage ?? 'partial',
        coverageRationale:
          input.entityCoverage?.coverageRationale ??
          'Import coverage for invoices has not been recorded, so this figure cannot be claimed complete.',
        classification: 'xero_fact',
        recordCount: input.records.length,
        dateRange: dates.length > 0 ? { from: dates[0]!, to: dates[dates.length - 1]! } : null,
        method: input.method,
      },
    };
  }

  /**
   * Average days to pay, reported only where there is enough real history. Below the threshold it
   * returns null with the reason rather than a number computed from one or two invoices.
   */
  private buildAverageDaysToPay(input: {
    invoiceRecords: XeroCustomerFinancialRecord[];
    paymentRecords: XeroCustomerFinancialRecord[];
    asAt: string | null;
    entityCoverage:
      | { coverage: 'complete' | 'partial' | 'unavailable'; coverageRationale: string }
      | undefined;
  }): { value: number | null; attribution: XeroFinancialAttribution } {
    const minimumSample = 3;
    const paidInvoices = input.invoiceRecords.filter(
      (record) => record.issuedAt !== null && (record.amountPaidCents ?? 0) > 0,
    );

    if (paidInvoices.length < minimumSample) {
      return {
        value: null,
        attribution: buildUnavailableAttribution(
          `Only ${paidInvoices.length} paid invoice(s) imported for this customer; at least ${minimumSample} are needed before a payment-behaviour signal is meaningful.`,
          'Mean days between Xero invoice date and the payment that settled it',
        ),
      };
    }

    const durations = paidInvoices
      .map((invoice) => {
        const settling = input.paymentRecords
          .filter(
            (payment) =>
              payment.issuedAt !== null &&
              new Date(payment.issuedAt).getTime() >= new Date(invoice.issuedAt!).getTime(),
          )
          .sort((a, b) => new Date(a.issuedAt!).getTime() - new Date(b.issuedAt!).getTime())[0];

        if (!settling?.issuedAt) {
          return null;
        }

        return (
          (new Date(settling.issuedAt).getTime() - new Date(invoice.issuedAt!).getTime()) /
          86_400_000
        );
      })
      .filter((value): value is number => value !== null && Number.isFinite(value));

    if (durations.length < minimumSample) {
      return {
        value: null,
        attribution: buildUnavailableAttribution(
          'Imported payments could not be matched to enough invoices to establish a payment-behaviour signal.',
          'Mean days between Xero invoice date and the payment that settled it',
        ),
      };
    }

    return {
      value: Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length),
      attribution: {
        source: 'xero',
        sourceRecordIds: paidInvoices
          .map((record) => record.xeroId ?? record.titanId)
          .filter((value): value is string => Boolean(value)),
        asAt: input.asAt,
        coverage: input.entityCoverage?.coverage ?? 'partial',
        coverageRationale:
          input.entityCoverage?.coverageRationale ??
          'Payment import coverage has not been recorded, so this signal cannot be claimed complete.',
        // Derived from Xero facts rather than read from Xero, so it is not itself a Xero fact.
        classification: 'calculated',
        recordCount: durations.length,
        dateRange: null,
        method: `Mean days between Xero invoice date and settling payment across ${durations.length} invoices`,
      },
    };
  }

  /** Audited entry point used by routes so financial-history access leaves a trail. */
  async getCustomerFinancialHistoryAudited(
    actor: XeroFinancialMemoryActor,
    customerId: string,
  ): Promise<XeroCustomerFinancialHistory> {
    const history = await this.getCustomerFinancialHistory(actor, customerId);
    await this.recordAccess(actor, 'xero_customer_financial_history_read', customerId, {
      invoiceCount: history.invoices.length,
      paymentCount: history.payments.length,
      coverage: history.coverage.overallCoverage,
    });
    return history;
  }
}
