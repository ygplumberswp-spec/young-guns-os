import { and, eq } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import { quotes, xeroCustomerMappings, xeroQuoteMappings } from '@titan/db';
import type { XeroOAuthService } from './xero-oauth.service.js';
import type { XeroSyncService } from './xero-sync.service.js';
import { XeroWriteApprovalGate, XeroWriteApprovalGateError } from './xero-write-approval-gate.service.js';

export class XeroGate3ControlledQuoteError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'XeroGate3ControlledQuoteError';
  }
}

function maskId(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length > 8 ? `${value.slice(0, 8)}…` : value;
}

export type XeroGate3ControlledQuotePushResult = {
  pushedAt: string;
  organisationName: string;
  mappingClassification: 'confirmed_linked';
  quote: {
    titanQuoteIdMasked: string | null;
    quoteNumber: string | null;
    titlePrefix: string | null;
  };
  xero: {
    xeroQuoteIdMasked: string | null;
    xeroQuoteNumber: string | null;
    status: string | null;
    isDraft: boolean;
  };
  push: {
    idempotent: boolean;
    providerOk: boolean;
  };
};

/**
 * XERO-002 Gate 3 — controlled single-quote DRAFT push with idempotent retry support.
 */
export class XeroGate3ControlledQuoteService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly xeroOAuthService: XeroOAuthService,
    private readonly xeroSyncService: XeroSyncService,
    private readonly writeApprovalGate: XeroWriteApprovalGate,
  ) {}

  async pushApprovedDraftQuote(input: {
    companyId: string;
    quoteId: string;
    actorUserId: string;
  }): Promise<XeroGate3ControlledQuotePushResult> {
    const connection = await this.xeroOAuthService.getXeroConnection(input.companyId);
    const orgName = connection.organisationName ?? '';

    if (orgName !== 'Young Guns Plumbing') {
      throw new XeroGate3ControlledQuoteError(
        'ORG_MISMATCH',
        'Connected organisation is not Young Guns Plumbing.',
      );
    }

    const [quoteRow] = await this.db
      .select({
        id: quotes.id,
        quoteNumber: quotes.quoteNumber,
        title: quotes.title,
        customerId: quotes.customerId,
        status: quotes.status,
      })
      .from(quotes)
      .where(and(eq(quotes.companyId, input.companyId), eq(quotes.id, input.quoteId)))
      .limit(1);

    if (!quoteRow) {
      throw new XeroGate3ControlledQuoteError('NOT_FOUND', 'Quote not found.');
    }

    if (quoteRow.status !== 'draft') {
      throw new XeroGate3ControlledQuoteError(
        'VALIDATION',
        'Gate 3 quote must remain in draft status — send/issue is forbidden.',
      );
    }

    const titlePrefix = quoteRow.title?.startsWith('TITAN XERO E2E TEST') ? 'TITAN XERO E2E TEST' : null;
    if (!titlePrefix) {
      throw new XeroGate3ControlledQuoteError(
        'VALIDATION',
        'Gate 3 quote must be labelled with TITAN XERO E2E TEST prefix.',
      );
    }

    const [customerMapping] = await this.db
      .select()
      .from(xeroCustomerMappings)
      .where(
        and(
          eq(xeroCustomerMappings.companyId, input.companyId),
          eq(xeroCustomerMappings.customerId, quoteRow.customerId),
        ),
      )
      .limit(1);

    if (!customerMapping?.xeroContactId || customerMapping.syncStatus !== 'synced') {
      throw new XeroGate3ControlledQuoteError(
        'MAPPING_INVALID',
        'Quote customer is not a confirmed linked Xero mapping.',
      );
    }

    let approvalId: string;
    try {
      const approval = await this.writeApprovalGate.assertWriteApproved({
        companyId: input.companyId,
        entityType: 'quote',
        entityId: input.quoteId,
        operation: 'quote_create',
      });
      approvalId = approval.approvalId;
    } catch (error) {
      if (error instanceof XeroWriteApprovalGateError) {
        throw new XeroGate3ControlledQuoteError(error.code, error.message);
      }
      throw error;
    }

    const pushResult = await this.xeroSyncService.executeApprovedQuotePush({
      companyId: input.companyId,
      quoteId: input.quoteId,
      approvalId,
      actorUserId: input.actorUserId,
    });

    const xeroQuoteId = String(pushResult.xeroQuoteId ?? '');
    const [mapping] = await this.db
      .select({ xeroQuoteId: xeroQuoteMappings.xeroQuoteId, syncStatus: xeroQuoteMappings.syncStatus })
      .from(xeroQuoteMappings)
      .where(
        and(
          eq(xeroQuoteMappings.companyId, input.companyId),
          eq(xeroQuoteMappings.quoteId, input.quoteId),
        ),
      )
      .limit(1);

    if (!mapping?.xeroQuoteId) {
      throw new XeroGate3ControlledQuoteError(
        'MAPPING_MISSING',
        'Xero quote mapping was not stored after push.',
      );
    }

    const client = await this.xeroOAuthService.createClient(input.companyId);
    const remote = await client.fetchQuote(mapping.xeroQuoteId);
    const status = remote.status ?? (pushResult.status as string | null) ?? null;

    if (status && status.toUpperCase() !== 'DRAFT') {
      throw new XeroGate3ControlledQuoteError(
        'QUOTE_NOT_DRAFT',
        'Gate 3 forbids sending or authorising quotes — expected DRAFT in Xero.',
      );
    }

    return {
      pushedAt: new Date().toISOString(),
      organisationName: orgName,
      mappingClassification: 'confirmed_linked',
      quote: {
        titanQuoteIdMasked: maskId(input.quoteId),
        quoteNumber: quoteRow.quoteNumber,
        titlePrefix,
      },
      xero: {
        xeroQuoteIdMasked: maskId(xeroQuoteId),
        xeroQuoteNumber: remote.quoteNumber ?? (pushResult.xeroQuoteNumber as string | null) ?? null,
        status,
        isDraft: !status || status.toUpperCase() === 'DRAFT',
      },
      push: {
        idempotent: Boolean(pushResult.idempotent),
        providerOk: Boolean(xeroQuoteId),
      },
    };
  }
}
