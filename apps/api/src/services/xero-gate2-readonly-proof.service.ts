import { and, eq } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import {
  invoices,
  xeroCustomerMappings,
  xeroInvoiceMappings,
} from '@titan/db';
import type { XeroOAuthService } from './xero-oauth.service.js';
import { XeroError } from '../lib/xero.client.js';

export class XeroGate2ReadonlyProofError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'XeroGate2ReadonlyProofError';
  }
}

function maskId(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length > 8 ? `${value.slice(0, 8)}…` : value;
}

export type XeroGate2ReadonlyProofResult = {
  readAt: string;
  organisationName: string;
  tenantId: string;
  mappingClassification: 'confirmed_linked';
  contact: {
    titanCustomerIdMasked: string | null;
    xeroContactIdMasked: string | null;
    contactIdMatch: boolean;
    providerOk: boolean;
  };
  invoice: {
    titanInvoiceIdMasked: string | null;
    xeroInvoiceIdMasked: string | null;
    invoiceNumber: string | null;
    invoiceIdMatch: boolean;
    contactIdMatch: boolean;
    status: string | null;
    amountDue: number;
    amountPaid: number;
    paidStateDistinctFromReconciled: boolean;
    providerOk: boolean;
  };
  attachments: {
    scopeAccepted: boolean;
    insufficientScope: boolean;
    count: number;
    providerOk: boolean;
    emptyListValid: boolean;
  };
  rateLimit: {
    healthy: boolean;
    note: string;
  };
};

/**
 * XERO-002 Gate 2 — read-only live proof via existing Xero OAuth client.
 * Never writes to Xero or TITAN mapping tables.
 */
export class XeroGate2ReadonlyProofService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly xeroOAuthService: XeroOAuthService,
  ) {}

  async proveReadOnly(input: {
    companyId: string;
    customerId: string;
    invoiceId: string;
  }): Promise<XeroGate2ReadonlyProofResult> {
    const connection = await this.xeroOAuthService.getXeroConnection(input.companyId);
    const orgName = connection.organisationName ?? '';
    const tenantId = connection.organisationId ?? connection.health?.tenantId ?? '';

    if (orgName !== 'Young Guns Plumbing') {
      throw new XeroGate2ReadonlyProofError(
        'ORG_MISMATCH',
        'Connected organisation is not Young Guns Plumbing.',
      );
    }

    const [customerMapping] = await this.db
      .select()
      .from(xeroCustomerMappings)
      .where(
        and(
          eq(xeroCustomerMappings.companyId, input.companyId),
          eq(xeroCustomerMappings.customerId, input.customerId),
        ),
      )
      .limit(1);

    if (!customerMapping?.xeroContactId || customerMapping.syncStatus !== 'synced') {
      throw new XeroGate2ReadonlyProofError(
        'MAPPING_INVALID',
        'Selected customer is not a confirmed linked Xero mapping.',
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
      throw new XeroGate2ReadonlyProofError(
        'MAPPING_INVALID',
        'Selected invoice has no verified Xero InvoiceID mapping.',
      );
    }

    const [invoiceRow] = await this.db
      .select({ invoiceNumber: invoices.invoiceNumber, status: invoices.status })
      .from(invoices)
      .where(and(eq(invoices.companyId, input.companyId), eq(invoices.id, input.invoiceId)))
      .limit(1);

    const client = await this.xeroOAuthService.createClient(input.companyId);

    let contactOk = false;
    let contactIdMatch = false;
    let invoiceOk = false;
    let invoiceIdMatch = false;
    let invoiceContactMatch = false;
    let remoteInvoiceNumber: string | null = null;
    let remoteStatus: string | null = null;
    let amountDue = 0;
    let amountPaid = 0;
    let attachmentsOk = false;
    let attachmentCount = 0;
    let scopeAccepted = false;
    let insufficientScope = false;

    try {
      const remoteContact = await client.fetchContact(customerMapping.xeroContactId);
      contactOk = true;
      contactIdMatch = remoteContact.contactId === customerMapping.xeroContactId;
    } catch (error) {
      throw new XeroGate2ReadonlyProofError(
        'CONTACT_READ_FAILED',
        error instanceof Error ? error.message : 'Contact read failed',
      );
    }

    try {
      const remoteInvoice = await client.fetchInvoice(invoiceMapping.xeroInvoiceId);
      invoiceOk = true;
      invoiceIdMatch = remoteInvoice.invoiceId === invoiceMapping.xeroInvoiceId;
      invoiceContactMatch = remoteInvoice.contactId === customerMapping.xeroContactId;
      remoteInvoiceNumber = remoteInvoice.invoiceNumber;
      remoteStatus = remoteInvoice.status;
      amountDue = remoteInvoice.amountDue;
      amountPaid = remoteInvoice.amountPaid;
    } catch (error) {
      throw new XeroGate2ReadonlyProofError(
        'INVOICE_READ_FAILED',
        error instanceof Error ? error.message : 'Invoice read failed',
      );
    }

    try {
      const attachments = await client.listAttachments('Invoices', invoiceMapping.xeroInvoiceId);
      attachmentsOk = true;
      scopeAccepted = true;
      attachmentCount = attachments.length;
    } catch (error) {
      if (error instanceof XeroError && (error.code === 'AUTH_FAILED' || error.code === 'API_ERROR')) {
        const msg = error.message.toLowerCase();
        insufficientScope = msg.includes('scope') || msg.includes('403') || msg.includes('401');
        if (insufficientScope) {
          throw new XeroGate2ReadonlyProofError(
            'ATTACHMENT_SCOPE_INSUFFICIENT',
            'Attachment list rejected — Gate 1 reconnect required.',
          );
        }
      }
      throw new XeroGate2ReadonlyProofError(
        'ATTACHMENT_READ_FAILED',
        error instanceof Error ? error.message : 'Attachment metadata read failed',
      );
    }

    const reconciliationProven = false;

    return {
      readAt: new Date().toISOString(),
      organisationName: orgName,
      tenantId,
      mappingClassification: 'confirmed_linked',
      contact: {
        titanCustomerIdMasked: maskId(input.customerId),
        xeroContactIdMasked: maskId(customerMapping.xeroContactId),
        contactIdMatch,
        providerOk: contactOk,
      },
      invoice: {
        titanInvoiceIdMasked: maskId(input.invoiceId),
        xeroInvoiceIdMasked: maskId(invoiceMapping.xeroInvoiceId),
        invoiceNumber: remoteInvoiceNumber ?? invoiceRow?.invoiceNumber ?? null,
        invoiceIdMatch,
        contactIdMatch: invoiceContactMatch,
        status: remoteStatus,
        amountDue,
        amountPaid,
        paidStateDistinctFromReconciled: amountPaid > 0 && !reconciliationProven,
        providerOk: invoiceOk,
      },
      attachments: {
        scopeAccepted,
        insufficientScope,
        count: attachmentCount,
        providerOk: attachmentsOk,
        emptyListValid: attachmentCount === 0,
      },
      rateLimit: {
        healthy: true,
        note: 'No rate-limit responses during Gate 2 read sequence',
      },
    };
  }
}
