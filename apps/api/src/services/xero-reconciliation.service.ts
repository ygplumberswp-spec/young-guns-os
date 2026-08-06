import { eq } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import {
  invoices,
  payments,
  xeroBankTransactions,
  xeroCustomerMappings,
  xeroInvoiceMappings,
} from '@titan/db';
import type { XeroInvoiceReconciliationSnapshot } from '@titan/shared';
import { deriveInvoiceReconciliationState } from '@titan/shared';

export class XeroReconciliationService {
  constructor(private readonly db: DatabaseClient) {}

  static create(db: DatabaseClient): XeroReconciliationService {
    return new XeroReconciliationService(db);
  }

  async listInvoiceReconciliationSnapshots(
    companyId: string,
    limit = 50,
  ): Promise<XeroInvoiceReconciliationSnapshot[]> {
    const invoiceRows = await this.db.query.invoices.findMany({
      where: eq(invoices.companyId, companyId),
      limit,
      orderBy: (table, { desc }) => [desc(table.updatedAt)],
      columns: {
        id: true,
        invoiceNumber: true,
        xeroInvoiceNumber: true,
        totalCents: true,
        amountPaidCents: true,
        updatedAt: true,
      },
    });

    if (invoiceRows.length === 0) {
      return [];
    }

    const [xeroInvoiceMaps, paymentRows, bankTxRows] = await Promise.all([
      this.db.query.xeroInvoiceMappings.findMany({
        where: eq(xeroInvoiceMappings.companyId, companyId),
      }),
      this.db.query.payments.findMany({
        where: eq(payments.companyId, companyId),
      }),
      this.db.query.xeroBankTransactions.findMany({
        where: eq(xeroBankTransactions.companyId, companyId),
      }),
    ]);

    const xeroInvoiceByInvoiceId = new Map(
      xeroInvoiceMaps.map((m) => [m.invoiceId, m.xeroInvoiceId]),
    );

    return invoiceRows.map((invoice) => {
      const invoicePayments = paymentRows.filter((p) => p.invoiceId === invoice.id);
      const primaryPayment = invoicePayments[0];
      const xeroPaymentId =
        primaryPayment?.xeroPaymentId ??
        invoicePayments.find((p) => p.sourceExternalId)?.sourceExternalId ??
        null;
      const yocoPaymentEventId = primaryPayment?.yocoPaymentId ?? null;
      const xeroInvoiceId = xeroInvoiceByInvoiceId.get(invoice.id) ?? null;
      const bankMatch = bankTxRows.find((tx) =>
        xeroInvoiceId ? tx.reference?.includes(xeroInvoiceId) : false,
      );
      const balanceDueCents = Math.max(invoice.totalCents - invoice.amountPaidCents, 0);

      return deriveInvoiceReconciliationState({
        invoiceId: invoice.id,
        publicInvoiceNumber: invoice.xeroInvoiceNumber ?? invoice.invoiceNumber,
        invoiceTotalCents: invoice.totalCents,
        amountPaidCents: invoice.amountPaidCents,
        balanceDueCents,
        yocoPaymentEventId,
        xeroPaymentId,
        bankTransactionId: bankMatch?.xeroBankTransactionId ?? null,
        isReconciledInXero: bankMatch?.isReconciled ?? false,
        lastUpdatedAt: invoice.updatedAt?.toISOString() ?? null,
        hasRefund: false,
        hasCreditNote: false,
        hasOverpayment: false,
        hasPrepayment: false,
      });
    });
  }

  async getMappingCounts(companyId: string): Promise<{
    totalCustomers: number;
    mappedCustomers: number;
    unmappedCustomers: number;
  }> {
    const mappings = await this.db.query.xeroCustomerMappings.findMany({
      where: eq(xeroCustomerMappings.companyId, companyId),
      columns: { customerId: true, xeroContactId: true },
    });

    const mappedCustomers = mappings.filter((m) => Boolean(m.xeroContactId)).length;
    const totalFromMappings = new Set(mappings.map((m) => m.customerId)).size;

    return {
      totalCustomers: totalFromMappings,
      mappedCustomers,
      unmappedCustomers: Math.max(totalFromMappings - mappedCustomers, 0),
    };
  }
}
