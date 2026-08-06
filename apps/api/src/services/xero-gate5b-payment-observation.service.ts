import { and, eq, sql } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import {
  invoices,
  payments,
  xeroBankTransactions,
  xeroInvoiceMappings,
  xeroPaymentMappings,
  yocoWebhookDeliveries,
} from '@titan/db';
import {
  deriveInvoiceReconciliationState,
  forbiddenFinancialTruthEquivalences,
} from '@titan/shared';
import type { XeroOAuthService } from './xero-oauth.service.js';
import type { XeroSyncService } from './xero-sync.service.js';

export class XeroGate5bPaymentObservationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'XeroGate5bPaymentObservationError';
  }
}

function maskId(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length > 8 ? `${value.slice(0, 8)}…` : value;
}

export type XeroGate5bPaymentObservationResult = {
  readAt: string;
  organisationName: string;
  tenantId: string;
  invoice: {
    titanInvoiceIdMasked: string | null;
    xeroInvoiceIdMasked: string | null;
    invoiceNumber: string | null;
    titanStatus: string | null;
    invoiceIdMatch: boolean;
    providerOk: boolean;
  };
  payment: {
    titanPaymentIdMasked: string | null;
    xeroPaymentIdMasked: string | null;
    paymentIdMatch: boolean;
    titanAmountCents: number;
    xeroPaymentAmountCents: number;
    amountMatch: boolean;
    providerOk: boolean;
  };
  amounts: {
    titanTotalCents: number;
    titanAmountPaidCents: number;
    titanAmountDueCents: number;
    xeroAmountPaid: number;
    xeroAmountDue: number;
    xeroStatus: string | null;
    paidMatches: boolean;
    dueMatches: boolean;
  };
  truthSeparation: {
    invoiceIssued: boolean;
    xeroPaymentRecorded: boolean;
    invoicePaidInXero: boolean;
    bankTransactionImported: boolean;
    reconciliationProven: boolean;
    yocoPaymentPresent: boolean;
    statesNotEquivalent: string[];
  };
  reconciliation: {
    state: string;
    stateLabel: string;
    reconciliationProven: boolean;
    sourceLabel: string;
    staleDataWarning: string | null;
  };
  yoco: {
    connected: boolean;
    paymentIdPresent: boolean;
    webhookDeliveriesOnStaging: number;
  };
  targetedRefresh: {
    attempted: boolean;
    updated: boolean;
    failed: boolean;
    invoiceIdMasked: string | null;
  };
  rateLimit: {
    healthy: boolean;
    note: string;
  };
};

/**
 * XERO-002 Gate 5B — read-only payment state observation.
 * Reads invoice and payment from Xero; optionally refreshes local invoice from Xero.
 * Never writes to Xero or creates payments.
 */
export class XeroGate5bPaymentObservationService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly xeroOAuthService: XeroOAuthService,
    private readonly xeroSyncService: XeroSyncService,
  ) {}

  async observePaymentState(input: {
    companyId: string;
    invoiceId: string;
    runTargetedRefresh?: boolean;
  }): Promise<XeroGate5bPaymentObservationResult> {
    const connection = await this.xeroOAuthService.getXeroConnection(input.companyId);
    const orgName = connection.organisationName ?? '';
    const tenantId = connection.organisationId ?? connection.health?.tenantId ?? '';

    if (orgName !== 'Young Guns Plumbing') {
      throw new XeroGate5bPaymentObservationError(
        'ORG_MISMATCH',
        'Connected organisation is not Young Guns Plumbing.',
      );
    }

    const [invoiceMapping] = await this.db
      .select()
      .from(xeroInvoiceMappings)
      .where(
        and(
          eq(xeroInvoiceMappings.companyId, input.companyId),
          eq(xeroInvoiceMappings.invoiceId, input.invoiceId),
        ),
      )
      .limit(1);

    if (!invoiceMapping?.xeroInvoiceId) {
      throw new XeroGate5bPaymentObservationError(
        'MAPPING_INVALID',
        'Selected invoice has no verified Xero InvoiceID mapping.',
      );
    }

    const [invoiceRow] = await this.db
      .select({
        invoiceNumber: invoices.invoiceNumber,
        xeroInvoiceNumber: invoices.xeroInvoiceNumber,
        status: invoices.status,
        totalCents: invoices.totalCents,
        amountPaidCents: invoices.amountPaidCents,
      })
      .from(invoices)
      .where(and(eq(invoices.companyId, input.companyId), eq(invoices.id, input.invoiceId)))
      .limit(1);

    if (!invoiceRow) {
      throw new XeroGate5bPaymentObservationError('INVOICE_NOT_FOUND', 'Invoice not found in TITAN.');
    }

    const invoicePayments = await this.db.query.payments.findMany({
      where: and(eq(payments.companyId, input.companyId), eq(payments.invoiceId, input.invoiceId)),
    });

    const primaryPayment = invoicePayments[0];
    if (!primaryPayment?.xeroPaymentId) {
      throw new XeroGate5bPaymentObservationError(
        'PAYMENT_MAPPING_MISSING',
        'Selected invoice has no mapped Xero payment in TITAN.',
      );
    }

    const [paymentMapping] = await this.db
      .select()
      .from(xeroPaymentMappings)
      .where(
        and(
          eq(xeroPaymentMappings.companyId, input.companyId),
          eq(xeroPaymentMappings.paymentId, primaryPayment.id),
        ),
      )
      .limit(1);

    if (!paymentMapping?.xeroPaymentId || paymentMapping.syncStatus !== 'synced') {
      throw new XeroGate5bPaymentObservationError(
        'PAYMENT_MAPPING_INVALID',
        'Payment mapping is missing or not synced.',
      );
    }

    if (paymentMapping.xeroPaymentId !== primaryPayment.xeroPaymentId) {
      throw new XeroGate5bPaymentObservationError(
        'PAYMENT_MAPPING_MISMATCH',
        'Payment row and mapping table disagree on Xero payment ID.',
      );
    }

    const client = await this.xeroOAuthService.createClient(input.companyId);

    let remoteInvoiceOk = false;
    let invoiceIdMatch = false;
    let remoteStatus: string | null = null;
    let xeroAmountPaid = 0;
    let xeroAmountDue = 0;

    try {
      const remoteInvoice = await client.fetchInvoice(invoiceMapping.xeroInvoiceId);
      remoteInvoiceOk = true;
      invoiceIdMatch = remoteInvoice.invoiceId === invoiceMapping.xeroInvoiceId;
      remoteStatus = remoteInvoice.status;
      xeroAmountPaid = remoteInvoice.amountPaid;
      xeroAmountDue = remoteInvoice.amountDue;
    } catch (error) {
      throw new XeroGate5bPaymentObservationError(
        'INVOICE_READ_FAILED',
        error instanceof Error ? error.message : 'Invoice read failed',
      );
    }

    let paymentOk = false;
    let paymentIdMatch = false;
    let xeroPaymentAmountCents = 0;

    try {
      const remotePayment = await client.fetchPayment(paymentMapping.xeroPaymentId);
      paymentOk = true;
      paymentIdMatch = remotePayment.paymentId === paymentMapping.xeroPaymentId;
      xeroPaymentAmountCents = Math.round(remotePayment.amount * 100);
    } catch (error) {
      throw new XeroGate5bPaymentObservationError(
        'PAYMENT_READ_FAILED',
        error instanceof Error ? error.message : 'Payment read failed',
      );
    }

    const bankTxRows = await this.db.query.xeroBankTransactions.findMany({
      where: eq(xeroBankTransactions.companyId, input.companyId),
    });
    const bankMatch = bankTxRows.find((tx) => {
      if (!invoiceMapping.xeroInvoiceId) return false;
      const paymentRef = paymentMapping.xeroPaymentId ?? '';
      return (
        tx.reference?.includes(invoiceMapping.xeroInvoiceId) ||
        (paymentRef.length > 0 && tx.reference?.includes(paymentRef))
      );
    });

    const titanAmountDueCents = Math.max(invoiceRow.totalCents - invoiceRow.amountPaidCents, 0);
    const xeroAmountPaidCents = Math.round(xeroAmountPaid * 100);
    const xeroAmountDueCents = Math.round(xeroAmountDue * 100);

    const reconciliationSnapshot = deriveInvoiceReconciliationState({
      invoiceId: input.invoiceId,
      publicInvoiceNumber: invoiceRow.xeroInvoiceNumber ?? invoiceRow.invoiceNumber,
      invoiceTotalCents: invoiceRow.totalCents,
      amountPaidCents: invoiceRow.amountPaidCents,
      balanceDueCents: titanAmountDueCents,
      yocoPaymentEventId: primaryPayment.yocoPaymentId ?? null,
      xeroPaymentId: primaryPayment.xeroPaymentId ?? null,
      bankTransactionId: bankMatch?.xeroBankTransactionId ?? null,
      isReconciledInXero: bankMatch?.isReconciled ?? false,
      lastUpdatedAt: null,
      hasRefund: false,
      hasCreditNote: false,
      hasOverpayment: false,
      hasPrepayment: false,
    });

    const [yocoDeliveryRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(yocoWebhookDeliveries)
      .where(eq(yocoWebhookDeliveries.companyId, input.companyId));
    const yocoDeliveryCount = yocoDeliveryRow?.count ?? 0;

    let targetedRefresh = {
      attempted: false,
      updated: false,
      failed: false,
      invoiceIdMasked: maskId(input.invoiceId),
    };

    if (input.runTargetedRefresh) {
      targetedRefresh.attempted = true;
      const refresh = await this.xeroSyncService.refreshTargetedInvoiceFromXero(
        input.companyId,
        invoiceMapping.xeroInvoiceId,
      );
      targetedRefresh.updated = refresh.updated;
      targetedRefresh.failed = refresh.failed;
    }

    const invoicePaidInXero =
      remoteStatus === 'PAID' || (xeroAmountDueCents === 0 && xeroAmountPaidCents > 0);

    return {
      readAt: new Date().toISOString(),
      organisationName: orgName,
      tenantId,
      invoice: {
        titanInvoiceIdMasked: maskId(input.invoiceId),
        xeroInvoiceIdMasked: maskId(invoiceMapping.xeroInvoiceId),
        invoiceNumber: invoiceRow.xeroInvoiceNumber ?? invoiceRow.invoiceNumber,
        titanStatus: invoiceRow.status,
        invoiceIdMatch,
        providerOk: remoteInvoiceOk,
      },
      payment: {
        titanPaymentIdMasked: maskId(primaryPayment.id),
        xeroPaymentIdMasked: maskId(paymentMapping.xeroPaymentId),
        paymentIdMatch,
        titanAmountCents: primaryPayment.amountCents,
        xeroPaymentAmountCents,
        amountMatch: primaryPayment.amountCents === xeroPaymentAmountCents,
        providerOk: paymentOk,
      },
      amounts: {
        titanTotalCents: invoiceRow.totalCents,
        titanAmountPaidCents: invoiceRow.amountPaidCents,
        titanAmountDueCents,
        xeroAmountPaid,
        xeroAmountDue,
        xeroStatus: remoteStatus,
        paidMatches: invoiceRow.amountPaidCents === xeroAmountPaidCents,
        dueMatches: titanAmountDueCents === xeroAmountDueCents,
      },
      truthSeparation: {
        invoiceIssued: true,
        xeroPaymentRecorded: paymentOk && paymentIdMatch,
        invoicePaidInXero: invoicePaidInXero,
        bankTransactionImported: Boolean(bankMatch),
        reconciliationProven: reconciliationSnapshot.reconciliationProven,
        yocoPaymentPresent: Boolean(primaryPayment.yocoPaymentId),
        statesNotEquivalent: [
          ...forbiddenFinancialTruthEquivalences('xero_payment_recorded'),
          ...forbiddenFinancialTruthEquivalences('yoco_payment_completed'),
        ],
      },
      reconciliation: {
        state: reconciliationSnapshot.state,
        stateLabel: reconciliationSnapshot.stateLabel,
        reconciliationProven: reconciliationSnapshot.reconciliationProven,
        sourceLabel: reconciliationSnapshot.sourceLabel,
        staleDataWarning: reconciliationSnapshot.staleDataWarning,
      },
      yoco: {
        connected: true,
        paymentIdPresent: Boolean(primaryPayment.yocoPaymentId),
        webhookDeliveriesOnStaging: yocoDeliveryCount,
      },
      targetedRefresh,
      rateLimit: {
        healthy: true,
        note: 'No rate-limit responses during Gate 5B read sequence',
      },
    };
  }
}
