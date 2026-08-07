import { and, desc, eq, inArray } from 'drizzle-orm';
import { isCompanyOwnerRole } from '@titan/auth';
import type { DatabaseClient } from '@titan/db';
import { companies, invoicePaymentLinks, invoices, quotes } from '@titan/db';
import {
  buildFinanceDocumentPreviewModel,
  displayOfficialInvoiceNumber,
  displayOfficialQuoteNumber,
  isYocoPaymentUrl,
  sanitizeFinancePreviewReviewUrl,
  type FinanceDocumentPreviewInput,
  type FinanceDocumentPreviewModel,
} from '@titan/shared';
import type { FinanceDocumentSectionsService } from './finance-document-sections.service.js';

export type FinancePreviewEnrichmentActor = {
  companyId: string;
  userId: string | null;
  roleName: string | null;
  permissions: readonly string[];
};

export type FinancePreviewEnrichmentRequest = FinanceDocumentPreviewInput & {
  quoteId?: string | null;
  invoiceId?: string | null;
  cocDocumentationId?: string | null;
};

export class FinanceDocumentPreviewEnrichmentService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly sectionsService: FinanceDocumentSectionsService,
  ) {}

  async buildPreviewModel(
    actor: FinancePreviewEnrichmentActor,
    input: FinancePreviewEnrichmentRequest,
  ): Promise<FinanceDocumentPreviewModel> {
    const enriched = await this.enrichPreviewInput(actor, input);
    return buildFinanceDocumentPreviewModel(enriched);
  }

  async enrichPreviewInput(
    actor: FinancePreviewEnrichmentActor,
    input: FinancePreviewEnrichmentRequest,
  ): Promise<FinanceDocumentPreviewInput> {
    const {
      paymentUrl: _ignoredPayment,
      reviewUrl: _ignoredReview,
      coc: _ignoredCoc,
      xeroQuoteNumber: _ignoredXq,
      xeroInvoiceNumber: _ignoredXi,
      status: _ignoredStatus,
      amountPaidCents: _ignoredPaid,
      depositReceivedCents: _ignoredDeposit,
      showPaymentDetails: clientShowPayment,
      ...editorInput
    } = input;

    const enriched: FinanceDocumentPreviewInput = { ...editorInput };

    if (input.kind === 'quote' && input.quoteId) {
      const quote = await this.db.query.quotes.findFirst({
        where: and(eq(quotes.id, input.quoteId), eq(quotes.companyId, actor.companyId)),
      });
      if (quote) {
        enriched.xeroQuoteNumber = quote.xeroQuoteNumber;
        enriched.status = quote.status;
      }
    }

    if (input.kind === 'invoice' && input.invoiceId) {
      const invoice = await this.db.query.invoices.findFirst({
        where: and(eq(invoices.id, input.invoiceId), eq(invoices.companyId, actor.companyId)),
      });
      if (invoice) {
        enriched.xeroInvoiceNumber = invoice.xeroInvoiceNumber;
        enriched.status = invoice.status;
        enriched.amountPaidCents = invoice.amountPaidCents;
      }

      const paymentUrl = await this.resolveYocoPaymentUrl(actor.companyId, input.invoiceId);
      if (paymentUrl) {
        enriched.paymentUrl = paymentUrl;
      }
    } else {
      enriched.paymentUrl = null;
    }

    const company = await this.db.query.companies.findFirst({
      where: eq(companies.id, actor.companyId),
    });
    const reviewUrl = sanitizeFinancePreviewReviewUrl(
      (company?.preferences as { googleReviewUrl?: string | null } | null)?.googleReviewUrl,
    );
    enriched.reviewUrl = reviewUrl;

    const jobId = input.invoiceId
      ? (
          await this.db.query.invoices.findFirst({
            where: and(eq(invoices.id, input.invoiceId), eq(invoices.companyId, actor.companyId)),
          })
        )?.jobId ?? null
      : null;

    const cocDocumentationId =
      input.cocDocumentationId ??
      (input.invoiceId
        ? (
            await this.sectionsService.loadSections({
              companyId: actor.companyId,
              invoiceId: input.invoiceId,
            })
          ).cocDocumentationId
        : null);

    if (input.kind === 'invoice' && cocDocumentationId && jobId) {
      enriched.coc = await this.sectionsService.resolveCocAttachment(
        actor.companyId,
        jobId,
        cocDocumentationId,
      );
    } else if (input.kind === 'invoice') {
      enriched.coc = { status: 'not_attached' };
    }

    enriched.showPaymentDetails = this.resolveShowPaymentDetails(actor, enriched, clientShowPayment);

    return enriched;
  }

  private resolveShowPaymentDetails(
    actor: FinancePreviewEnrichmentActor,
    input: FinanceDocumentPreviewInput,
    clientOverride: boolean | null | undefined,
  ): boolean | null {
    if (input.kind !== 'invoice') return false;
    const status = (input.status ?? 'draft').toLowerCase();
    const lifecycleVisible = ['sent', 'paid', 'partial', 'overdue'].includes(status);
    const isOwner = isCompanyOwnerRole({
      roleName: actor.roleName ?? '',
      permissions: [...actor.permissions],
    });

    if (clientOverride === true) {
      if (status === 'draft' && !isOwner) return false;
      return true;
    }
    if (clientOverride === false) return false;
    if (status === 'draft') return false;
    return lifecycleVisible ? null : false;
  }

  private async resolveYocoPaymentUrl(companyId: string, invoiceId: string): Promise<string | null> {
    const rows = await this.db
      .select({ paymentUrl: invoicePaymentLinks.paymentUrl, status: invoicePaymentLinks.status })
      .from(invoicePaymentLinks)
      .where(
        and(
          eq(invoicePaymentLinks.companyId, companyId),
          eq(invoicePaymentLinks.invoiceId, invoiceId),
          inArray(invoicePaymentLinks.status, ['prepared', 'active']),
        ),
      )
      .orderBy(desc(invoicePaymentLinks.createdAt))
      .limit(1);

    const url = rows[0]?.paymentUrl;
    return isYocoPaymentUrl(url) ? url.trim() : null;
  }
}

export function officialPreviewDocumentNumber(input: FinanceDocumentPreviewInput): string {
  if (input.kind === 'quote') {
    return displayOfficialQuoteNumber({ xeroQuoteNumber: input.xeroQuoteNumber });
  }
  return displayOfficialInvoiceNumber({ xeroInvoiceNumber: input.xeroInvoiceNumber });
}
