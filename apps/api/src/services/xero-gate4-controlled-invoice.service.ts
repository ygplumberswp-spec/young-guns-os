import { and, eq } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import { invoices, quotes, xeroCustomerMappings, xeroInvoiceMappings } from '@titan/db';
import type { XeroOAuthService } from './xero-oauth.service.js';
import type { XeroSyncService } from './xero-sync.service.js';
import { XeroWriteApprovalGate, XeroWriteApprovalGateError } from './xero-write-approval-gate.service.js';

export class XeroGate4ControlledInvoiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'XeroGate4ControlledInvoiceError';
  }
}

function maskId(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length > 8 ? `${value.slice(0, 8)}…` : value;
}

export type XeroGate4ControlledInvoicePushResult = {
  pushedAt: string;
  organisationName: string;
  mappingClassification: 'confirmed_linked';
  invoice: {
    titanInvoiceIdMasked: string | null;
    invoiceNumber: string | null;
    titlePrefix: string | null;
    linkedQuoteNumber: string | null;
  };
  xero: {
    xeroInvoiceIdMasked: string | null;
    xeroInvoiceNumber: string | null;
    status: string | null;
    isDraft: boolean;
  };
  push: {
    idempotent: boolean;
    providerOk: boolean;
  };
  targetedRefresh?: {
    attempted: boolean;
    updated: boolean;
    failed: boolean;
  };
};

/**
 * XERO-002 Gate 4 — controlled single-invoice DRAFT push with idempotent retry support.
 */
export class XeroGate4ControlledInvoiceService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly xeroOAuthService: XeroOAuthService,
    private readonly xeroSyncService: XeroSyncService,
    private readonly writeApprovalGate: XeroWriteApprovalGate,
  ) {}

  async pushApprovedDraftInvoice(input: {
    companyId: string;
    invoiceId: string;
    actorUserId: string;
    runTargetedRefresh?: boolean;
  }): Promise<XeroGate4ControlledInvoicePushResult> {
    const connection = await this.xeroOAuthService.getXeroConnection(input.companyId);
    const orgName = connection.organisationName ?? '';

    if (orgName !== 'Young Guns Plumbing') {
      throw new XeroGate4ControlledInvoiceError(
        'ORG_MISMATCH',
        'Connected organisation is not Young Guns Plumbing.',
      );
    }

    const [invoiceRow] = await this.db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        title: invoices.title,
        customerId: invoices.customerId,
        status: invoices.status,
        quoteId: invoices.quoteId,
        xeroInvoiceNumber: invoices.xeroInvoiceNumber,
      })
      .from(invoices)
      .where(and(eq(invoices.companyId, input.companyId), eq(invoices.id, input.invoiceId)))
      .limit(1);

    if (!invoiceRow) {
      throw new XeroGate4ControlledInvoiceError('NOT_FOUND', 'Invoice not found.');
    }

    if (invoiceRow.status !== 'draft') {
      throw new XeroGate4ControlledInvoiceError(
        'VALIDATION',
        'Gate 4 invoice must remain in draft status — email/authorise is forbidden.',
      );
    }

    const titlePrefix = invoiceRow.title?.startsWith('TITAN XERO E2E TEST') ? 'TITAN XERO E2E TEST' : null;
    if (!titlePrefix) {
      throw new XeroGate4ControlledInvoiceError(
        'VALIDATION',
        'Gate 4 invoice must be labelled with TITAN XERO E2E TEST prefix.',
      );
    }

    let linkedQuoteNumber: string | null = null;
    if (invoiceRow.quoteId) {
      const [quoteRow] = await this.db
        .select({ quoteNumber: quotes.quoteNumber })
        .from(quotes)
        .where(and(eq(quotes.companyId, input.companyId), eq(quotes.id, invoiceRow.quoteId)))
        .limit(1);
      linkedQuoteNumber = quoteRow?.quoteNumber ?? null;
    }

    const [customerMapping] = await this.db
      .select()
      .from(xeroCustomerMappings)
      .where(
        and(
          eq(xeroCustomerMappings.companyId, input.companyId),
          eq(xeroCustomerMappings.customerId, invoiceRow.customerId),
        ),
      )
      .limit(1);

    if (!customerMapping?.xeroContactId || customerMapping.syncStatus !== 'synced') {
      throw new XeroGate4ControlledInvoiceError(
        'MAPPING_INVALID',
        'Invoice customer is not a confirmed linked Xero mapping.',
      );
    }

    let approvalId: string;
    try {
      const approval = await this.writeApprovalGate.assertWriteApproved({
        companyId: input.companyId,
        entityType: 'invoice',
        entityId: input.invoiceId,
        operation: 'invoice_create',
      });
      approvalId = approval.approvalId;
    } catch (error) {
      if (error instanceof XeroWriteApprovalGateError) {
        throw new XeroGate4ControlledInvoiceError(error.code, error.message);
      }
      throw error;
    }

    const pushResult = await this.xeroSyncService.executeApprovedInvoicePush({
      companyId: input.companyId,
      invoiceId: input.invoiceId,
      approvalId,
      actorUserId: input.actorUserId,
    });

    const xeroInvoiceId = String(pushResult.xeroInvoiceId ?? '');
    const [mapping] = await this.db
      .select({
        xeroInvoiceId: xeroInvoiceMappings.xeroInvoiceId,
        xeroInvoiceNumber: xeroInvoiceMappings.xeroInvoiceNumber,
        syncStatus: xeroInvoiceMappings.syncStatus,
      })
      .from(xeroInvoiceMappings)
      .where(
        and(
          eq(xeroInvoiceMappings.companyId, input.companyId),
          eq(xeroInvoiceMappings.invoiceId, input.invoiceId),
        ),
      )
      .limit(1);

    if (!mapping?.xeroInvoiceId) {
      throw new XeroGate4ControlledInvoiceError(
        'MAPPING_MISSING',
        'Xero invoice mapping was not stored after push.',
      );
    }

    const officialNumber =
      (pushResult.xeroInvoiceNumber as string | null) ??
      mapping.xeroInvoiceNumber ??
      invoiceRow.xeroInvoiceNumber;
    if (!officialNumber?.trim()) {
      throw new XeroGate4ControlledInvoiceError(
        'OFFICIAL_NUMBER_MISSING',
        'Official Xero invoice number was not stored after push.',
      );
    }

    const client = await this.xeroOAuthService.createClient(input.companyId);
    const remote = await client.fetchInvoice(mapping.xeroInvoiceId);
    const status = remote.status ?? (pushResult.status as string | null) ?? null;

    if (status && status.toUpperCase() !== 'DRAFT') {
      throw new XeroGate4ControlledInvoiceError(
        'INVOICE_NOT_DRAFT',
        'Gate 4 forbids emailing or authorising invoices — expected DRAFT in Xero.',
      );
    }

    let targetedRefresh: XeroGate4ControlledInvoicePushResult['targetedRefresh'];
    if (input.runTargetedRefresh) {
      const refresh = await this.xeroSyncService.refreshTargetedInvoiceFromXero(
        input.companyId,
        mapping.xeroInvoiceId,
      );
      targetedRefresh = {
        attempted: true,
        updated: refresh.updated,
        failed: refresh.failed,
      };
    }

    return {
      pushedAt: new Date().toISOString(),
      organisationName: orgName,
      mappingClassification: 'confirmed_linked',
      invoice: {
        titanInvoiceIdMasked: maskId(input.invoiceId),
        invoiceNumber: invoiceRow.invoiceNumber,
        titlePrefix,
        linkedQuoteNumber,
      },
      xero: {
        xeroInvoiceIdMasked: maskId(xeroInvoiceId),
        xeroInvoiceNumber: officialNumber,
        status,
        isDraft: !status || status.toUpperCase() === 'DRAFT',
      },
      push: {
        idempotent: Boolean(pushResult.idempotent),
        providerOk: Boolean(xeroInvoiceId),
      },
      targetedRefresh,
    };
  }
}
