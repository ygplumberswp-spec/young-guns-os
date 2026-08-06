import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import {
  customers,
  integrationConnections,
  invoicePaymentLinkEvents,
  invoicePaymentLinks,
  invoices,
  jobs,
  mobileJobDocumentation,
  payments,
  titanDocuments,
  titanDocumentVersions,
  yocoWebhookDeliveries,
} from '@titan/db';
import {
  assertReportHasNoFinancialContent,
  buildDefaultSections,
  buildPaymentLinkIdempotencyKey,
  buildPaymentQrSvg,
  describeApproveAndIssue,
  evaluatePaymentLinkEligibility,
  isLivePaymentLinkStatus,
  normaliseDocumentPhotos,
  parseYocoPaymentWebhook,
  resolveCocAttachment,
  resolveDocumentEditScope,
  resolveExistingLinkAction,
  resolveWebhookOutcome,
  shouldInvalidatePreparedLink,
  type DocumentEditorIdentity,
  type DocumentPhoto,
  type DocumentSection,
  type PaymentLinkStatus,
  type TitanDocumentStatus,
  type TitanDocumentType,
  type TitanReportKind,
} from '@titan/shared';
import { decryptYocoCredentials } from '../lib/crypto.js';
import { YocoError } from '../lib/yoco.client.js';
import { YocoPaymentLinkClient } from '../lib/yoco-payment-links.client.js';
import {
  describeYocoSignatureFailure,
  extractYocoWebhookHeaders,
  verifyYocoWebhookSignature,
} from '../lib/yoco-webhook-signing.js';

export class DocumentEngineError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DocumentEngineError';
  }
}

/** Actor identity resolved by the auth middleware. Never taken from the request body. */
export type DocumentActor = DocumentEditorIdentity & {
  userId: string;
  companyId: string;
};

type DocumentEngineServiceDeps = {
  db: DatabaseClient;
  encryptionKey?: string;
  /** Injected in tests; production uses the real Yoco API client. */
  paymentLinkClientFactory?: (secretKey: string) => Pick<YocoPaymentLinkClient, 'createPaymentLink'>;
  recordAudit?: (entry: DocumentAuditEntry) => Promise<void> | void;
};

export type DocumentAuditEntry = {
  companyId: string;
  actorUserId: string | null;
  action: string;
  outcome: 'allowed' | 'denied' | 'failed';
  correlationId: string;
  detail: string;
  metadata?: Record<string, unknown>;
};

export class DocumentEngineService {
  private readonly db: DatabaseClient;
  private readonly encryptionKey?: string;
  private readonly paymentLinkClientFactory: (
    secretKey: string,
  ) => Pick<YocoPaymentLinkClient, 'createPaymentLink'>;
  private readonly recordAudit?: (entry: DocumentAuditEntry) => Promise<void> | void;

  constructor({
    db,
    encryptionKey,
    paymentLinkClientFactory,
    recordAudit,
  }: DocumentEngineServiceDeps) {
    this.db = db;
    this.encryptionKey = encryptionKey;
    this.paymentLinkClientFactory =
      paymentLinkClientFactory ?? ((secretKey) => new YocoPaymentLinkClient({ secretKey }));
    this.recordAudit = recordAudit;
  }

  // -------------------------------------------------------------------------
  // Documents
  // -------------------------------------------------------------------------

  async listDocuments(
    actor: DocumentActor,
    filter: { documentType?: TitanDocumentType; status?: TitanDocumentStatus } = {},
  ) {
    this.requireRead(actor);

    const conditions = [eq(titanDocuments.companyId, actor.companyId)];
    if (filter.documentType) conditions.push(eq(titanDocuments.documentType, filter.documentType));
    if (filter.status) conditions.push(eq(titanDocuments.status, filter.status));

    return this.db
      .select()
      .from(titanDocuments)
      .where(and(...conditions))
      .orderBy(desc(titanDocuments.createdAt))
      .limit(200);
  }

  /** Loads a document with its edit scope, COC state and any live payment link. */
  async getDocument(actor: DocumentActor, documentId: string) {
    this.requireRead(actor);
    const document = await this.loadDocument(actor.companyId, documentId);

    const scope = resolveDocumentEditScope(
      { ...actor, isAssignedTechnician: await this.isAssignedTechnician(actor, document.jobId) },
      { type: document.documentType, status: document.status },
    );

    const coc = await this.resolveCoc(actor.companyId, document.jobId, document.cocDocumentationId);
    const paymentLink =
      document.documentType === 'invoice' && document.invoiceId
        ? await this.findLiveLink(actor.companyId, document.invoiceId)
        : null;

    return {
      document,
      sections: normaliseSections(document.sections as unknown as DocumentSection[]),
      photos: normaliseDocumentPhotos((document.photos ?? []) as unknown as DocumentPhoto[]),
      coc,
      editScope: scope,
      paymentLink: paymentLink ? this.presentLink(paymentLink) : null,
    };
  }

  /** Ensures a draft Titan document exists for a finance quote or invoice editor. */
  async ensureFinanceDocument(
    actor: DocumentActor,
    input: {
      documentType: 'quote' | 'invoice';
      quoteId?: string | null;
      invoiceId?: string | null;
      documentNumber: string;
      title: string;
      customerId?: string | null;
      jobId?: string | null;
    },
  ) {
    this.requireRead(actor);

    const quoteId = input.quoteId ?? null;
    const invoiceId = input.invoiceId ?? null;
    if (input.documentType === 'quote' && !quoteId) {
      throw new DocumentEngineError('VALIDATION_ERROR', 'quoteId is required');
    }
    if (input.documentType === 'invoice' && !invoiceId) {
      throw new DocumentEngineError('VALIDATION_ERROR', 'invoiceId is required');
    }

    const existing = await this.db.query.titanDocuments.findFirst({
      where: and(
        eq(titanDocuments.companyId, actor.companyId),
        quoteId
          ? eq(titanDocuments.quoteId, quoteId)
          : eq(titanDocuments.invoiceId, invoiceId!),
      ),
    });

    if (existing) {
      return this.getDocument(actor, existing.id);
    }

    await this.createDocument(actor, {
      documentType: input.documentType,
      documentNumber: input.documentNumber,
      title: input.title,
      customerId: input.customerId ?? null,
      jobId: input.jobId ?? null,
      invoiceId,
      quoteId,
    });

    const created = await this.db.query.titanDocuments.findFirst({
      where: and(
        eq(titanDocuments.companyId, actor.companyId),
        quoteId
          ? eq(titanDocuments.quoteId, quoteId)
          : eq(titanDocuments.invoiceId, invoiceId!),
      ),
    });
    if (!created) {
      throw new DocumentEngineError('CREATE_FAILED', 'Unable to create finance document');
    }
    return this.getDocument(actor, created.id);
  }

  async createDocument(
    actor: DocumentActor,
    input: {
      documentType: TitanDocumentType;
      reportKind?: TitanReportKind | null;
      documentNumber: string;
      title: string;
      customerId?: string | null;
      propertyId?: string | null;
      jobId?: string | null;
      invoiceId?: string | null;
      quoteId?: string | null;
    },
  ) {
    const scope = resolveDocumentEditScope(actor, {
      type: input.documentType,
      status: 'draft',
    });
    if (!scope.canManageSections) {
      await this.audit(actor, 'document.create', 'denied', 'Actor may not create documents');
      throw new DocumentEngineError('FORBIDDEN', 'You do not have permission to create documents');
    }

    if (input.documentType === 'report' && !input.reportKind) {
      throw new DocumentEngineError('VALIDATION_ERROR', 'A report requires a report kind');
    }
    if (input.documentType !== 'report' && input.reportKind) {
      throw new DocumentEngineError(
        'VALIDATION_ERROR',
        'Only reports carry a report kind',
      );
    }

    const sections = buildDefaultSections(input.documentType, input.reportKind ?? null);

    const [created] = await this.db
      .insert(titanDocuments)
      .values({
        companyId: actor.companyId,
        documentType: input.documentType,
        reportKind: input.reportKind ?? null,
        status: 'draft',
        version: 1,
        documentNumber: input.documentNumber,
        title: input.title,
        customerId: input.customerId ?? null,
        propertyId: input.propertyId ?? null,
        jobId: input.jobId ?? null,
        invoiceId: input.invoiceId ?? null,
        quoteId: input.quoteId ?? null,
        sections: sections as unknown as unknown[],
        photos: [],
        createdByUserId: actor.userId,
      })
      .returning();

    await this.audit(
      actor,
      'document.create',
      'allowed',
      `Created ${input.documentType} ${input.documentNumber}`,
      { documentId: created!.id },
    );
    return created!;
  }

  /**
   * Applies a section/photo edit. Section kinds outside the actor's scope are
   * refused, and a report is re-checked for financial content before saving.
   */
  async updateDocument(
    actor: DocumentActor,
    documentId: string,
    patch: {
      title?: string;
      sections?: DocumentSection[];
      photos?: DocumentPhoto[];
      content?: Record<string, unknown>;
      cocDocumentationId?: string | null;
    },
  ) {
    const document = await this.loadDocument(actor.companyId, documentId);
    const scope = resolveDocumentEditScope(
      { ...actor, isAssignedTechnician: await this.isAssignedTechnician(actor, document.jobId) },
      { type: document.documentType, status: document.status },
    );

    if (scope.lockedReason) {
      await this.audit(actor, 'document.update', 'denied', scope.lockedReason, { documentId });
      throw new DocumentEngineError('DOCUMENT_LOCKED', scope.lockedReason);
    }

    if (patch.title !== undefined && !scope.canEditWording) {
      await this.audit(actor, 'document.update', 'denied', 'Actor may not edit wording', {
        documentId,
      });
      throw new DocumentEngineError('FORBIDDEN', 'You may not edit this document’s wording');
    }

    if (patch.sections) {
      const changed = changedSectionKinds(
        normaliseSections(document.sections as unknown as DocumentSection[]),
        patch.sections,
      );
      const outOfScope = changed.filter((kind) => !scope.editableSectionKinds.includes(kind));
      if (outOfScope.length > 0) {
        await this.audit(
          actor,
          'document.update',
          'denied',
          `Actor may not edit sections: ${outOfScope.join(', ')}`,
          { documentId },
        );
        throw new DocumentEngineError(
          'FORBIDDEN',
          `You may not edit these sections: ${outOfScope.join(', ')}`,
        );
      }
      if (document.documentType === 'report') {
        assertReportHasNoFinancialContent(patch.sections);
      }
    }

    if (patch.photos && !scope.canAttachPhotos) {
      throw new DocumentEngineError('FORBIDDEN', 'You may not change photos on this document');
    }
    if (patch.photos) {
      await this.assertPhotosBelongToCompany(actor.companyId, patch.photos);
    }

    if (patch.cocDocumentationId !== undefined) {
      if (!scope.canAttachCoc) {
        throw new DocumentEngineError('FORBIDDEN', 'You may not change the compliance certificate');
      }
      if (patch.cocDocumentationId) {
        await this.assertDocumentationBelongsToCompany(actor.companyId, patch.cocDocumentationId);
      }
    }

    const [updated] = await this.db
      .update(titanDocuments)
      .set({
        ...(patch.title === undefined ? {} : { title: patch.title }),
        ...(patch.sections === undefined
          ? {}
          : { sections: patch.sections as unknown as unknown[] }),
        ...(patch.photos === undefined
          ? {}
          : { photos: normaliseDocumentPhotos(patch.photos) as unknown as unknown[] }),
        ...(patch.content === undefined ? {} : { content: patch.content }),
        ...(patch.cocDocumentationId === undefined
          ? {}
          : { cocDocumentationId: patch.cocDocumentationId }),
        updatedAt: new Date(),
      })
      .where(
        and(eq(titanDocuments.id, documentId), eq(titanDocuments.companyId, actor.companyId)),
      )
      .returning();

    await this.audit(actor, 'document.update', 'allowed', 'Document draft saved', { documentId });
    return updated!;
  }

  /**
   * Issues a document: snapshots the current state into version history and
   * locks it. Historical issued documents are never mutated after this.
   */
  async issueDocument(actor: DocumentActor, documentId: string, changeSummary?: string) {
    const document = await this.loadDocument(actor.companyId, documentId);
    const scope = resolveDocumentEditScope(actor, {
      type: document.documentType,
      status: document.status,
    });

    if (!scope.canIssue) {
      await this.audit(actor, 'document.issue', 'denied', 'Actor may not issue documents', {
        documentId,
      });
      throw new DocumentEngineError('FORBIDDEN', 'You do not have permission to issue documents');
    }
    if (document.status === 'issued') {
      throw new DocumentEngineError('ALREADY_ISSUED', 'This document has already been issued');
    }
    if (document.documentType === 'report') {
      assertReportHasNoFinancialContent(
        normaliseSections(document.sections as unknown as DocumentSection[]),
      );
    }

    const issuedAt = new Date();
    const [issued] = await this.db
      .update(titanDocuments)
      .set({
        status: 'issued',
        issuedAt,
        lockedAt: issuedAt,
        issuedByUserId: actor.userId,
        updatedAt: issuedAt,
      })
      .where(
        and(eq(titanDocuments.id, documentId), eq(titanDocuments.companyId, actor.companyId)),
      )
      .returning();

    await this.db.insert(titanDocumentVersions).values({
      companyId: actor.companyId,
      documentId,
      version: document.version,
      status: 'issued',
      snapshot: { ...issued } as unknown as Record<string, unknown>,
      changeSummary: changeSummary ?? null,
      createdByUserId: actor.userId,
    });

    await this.audit(actor, 'document.issue', 'allowed', `Issued ${document.documentNumber}`, {
      documentId,
    });
    return issued!;
  }

  async listDocumentVersions(actor: DocumentActor, documentId: string) {
    this.requireRead(actor);
    await this.loadDocument(actor.companyId, documentId);
    return this.db
      .select()
      .from(titanDocumentVersions)
      .where(
        and(
          eq(titanDocumentVersions.companyId, actor.companyId),
          eq(titanDocumentVersions.documentId, documentId),
        ),
      )
      .orderBy(desc(titanDocumentVersions.version));
  }

  // -------------------------------------------------------------------------
  // AURA payment links: Draft -> Approve -> Execute
  // -------------------------------------------------------------------------

  /**
   * Step 1 (Draft). Describes exactly what issuing will do, without contacting
   * Yoco. Nothing external happens until the Owner approves.
   */
  async prepareInvoicePaymentLink(actor: DocumentActor, invoiceId: string) {
    const invoice = await this.loadInvoice(actor.companyId, invoiceId);
    const scope = resolveDocumentEditScope(actor, { type: 'invoice', status: 'issued' });
    if (!scope.canManagePaymentLinks) {
      await this.audit(actor, 'payment_link.prepare', 'denied', 'Actor may not manage payment links');
      throw new DocumentEngineError('FORBIDDEN', 'You may not create payment links');
    }

    const outstandingCents = invoiceOutstandingCents(invoice);
    const eligibility = evaluatePaymentLinkEligibility({
      documentType: 'invoice',
      invoiceStatus: invoice.status,
      isIssued: invoice.status !== 'draft',
      outstandingCents,
      currency: 'ZAR',
    });

    const yoco = await this.loadYocoCredentials(actor.companyId);
    const customer = invoice.customerId
      ? await this.loadCustomer(actor.companyId, invoice.customerId)
      : null;

    const summary = describeApproveAndIssue({
      customerName: customer?.name ?? 'this customer',
      invoiceNumber: invoiceNumberOf(invoice),
      outstandingCents,
      currency: 'ZAR',
      yocoConnected: Boolean(yoco),
      eligibility,
    });

    const existing = await this.findLiveLink(actor.companyId, invoiceId);
    const documentVersion = await this.resolveInvoiceDocumentVersion(actor.companyId, invoiceId);

    // A balance change invalidates a prepared request before anything is sent.
    if (
      existing &&
      existing.status === 'prepared' &&
      shouldInvalidatePreparedLink(
        { amountCents: existing.amountCents, documentVersion: existing.documentVersion },
        { outstandingCents, documentVersion },
      )
    ) {
      await this.cancelLink(actor, existing.id, 'Outstanding balance changed before issue');
    }

    const stillLive = await this.findLiveLink(actor.companyId, invoiceId);
    const action = resolveExistingLinkAction(
      stillLive
        ? {
            status: stillLive.status as PaymentLinkStatus,
            amountCents: stillLive.amountCents,
            documentVersion: stillLive.documentVersion,
          }
        : null,
      { outstandingCents, documentVersion },
    );

    return {
      invoiceId,
      invoiceNumber: invoiceNumberOf(invoice),
      customerName: customer?.name ?? null,
      outstandingCents,
      currency: 'ZAR',
      documentVersion,
      eligibility,
      yocoConnected: Boolean(yoco),
      summary,
      action,
      existingLink: stillLive ? this.presentLink(stillLive) : null,
      /** Nothing has been sent to Yoco at this point. */
      externalCallMade: false,
    };
  }

  /**
   * Steps 2 and 3 (Approve then Execute). One Owner approval authorises exactly
   * one link creation. Retries reuse the same idempotency key.
   */
  async approveAndCreateInvoicePaymentLink(
    actor: DocumentActor,
    invoiceId: string,
    options: { approvedOutstandingCents: number; documentId?: string | null },
  ) {
    const correlationId = randomUUID();
    const invoice = await this.loadInvoice(actor.companyId, invoiceId);
    const scope = resolveDocumentEditScope(actor, { type: 'invoice', status: 'issued' });
    if (!scope.canManagePaymentLinks) {
      await this.audit(
        actor,
        'payment_link.create',
        'denied',
        'Actor may not manage payment links',
        { invoiceId },
        correlationId,
      );
      throw new DocumentEngineError('FORBIDDEN', 'You may not create payment links');
    }

    const outstandingCents = invoiceOutstandingCents(invoice);

    // The Owner approved a specific amount; if it moved, stop rather than invite the wrong one.
    if (options.approvedOutstandingCents !== outstandingCents) {
      await this.audit(
        actor,
        'payment_link.create',
        'denied',
        `Approved ${options.approvedOutstandingCents} cents but the balance is now ${outstandingCents}`,
        { invoiceId },
        correlationId,
      );
      throw new DocumentEngineError(
        'BALANCE_CHANGED',
        'The outstanding balance changed since you approved. Review the invoice and approve again.',
      );
    }

    const eligibility = evaluatePaymentLinkEligibility({
      documentType: 'invoice',
      invoiceStatus: invoice.status,
      isIssued: invoice.status !== 'draft',
      outstandingCents,
      currency: 'ZAR',
    });
    if (!eligibility.eligible) {
      throw new DocumentEngineError(eligibility.code, eligibility.reason);
    }

    const yoco = await this.loadYocoCredentials(actor.companyId);
    if (!yoco) {
      // Honest failure: never a placeholder link.
      throw new DocumentEngineError(
        'YOCO_NOT_CONNECTED',
        'Yoco is not connected for this company, so no payment link can be created',
      );
    }

    const documentVersion = await this.resolveInvoiceDocumentVersion(actor.companyId, invoiceId);
    const existing = await this.findLiveLink(actor.companyId, invoiceId);
    const action = resolveExistingLinkAction(
      existing
        ? {
            status: existing.status as PaymentLinkStatus,
            amountCents: existing.amountCents,
            documentVersion: existing.documentVersion,
          }
        : null,
      { outstandingCents, documentVersion },
    );

    if (action.action === 'reuse' && existing?.paymentUrl) {
      return {
        link: this.presentLink(existing),
        reused: true,
        correlationId,
      };
    }
    if (action.action === 'regenerate' && existing) {
      await this.cancelLink(
        actor,
        existing.id,
        'Superseded because the outstanding balance changed',
        'superseded',
      );
    }

    const customer = invoice.customerId
      ? await this.loadCustomer(actor.companyId, invoice.customerId)
      : null;
    if (!customer) {
      throw new DocumentEngineError(
        'CUSTOMER_REQUIRED',
        'An invoice needs a customer before a payment link can be created',
      );
    }

    const idempotencyKey = buildPaymentLinkIdempotencyKey({
      invoiceId,
      documentVersion,
      outstandingCents,
    });

    // Record the approved intent first so a provider failure is still auditable.
    const [prepared] = await this.db
      .insert(invoicePaymentLinks)
      .values({
        companyId: actor.companyId,
        invoiceId,
        customerId: customer.id,
        documentId: options.documentId ?? null,
        provider: 'yoco',
        status: 'prepared',
        documentVersion,
        amountCents: outstandingCents,
        currency: 'ZAR',
        idempotencyKey,
        auditCorrelationId: correlationId,
        preparedByUserId: actor.userId,
        approvedByUserId: actor.userId,
        approvedAt: new Date(),
      })
      .returning();

    await this.recordLinkEvent(actor, prepared!.id, invoiceId, 'approved', correlationId, {
      amountCents: outstandingCents,
      detail: 'Owner approved one payment-link creation',
    });

    const client = this.paymentLinkClientFactory(yoco.secretKey);

    try {
      const result = await client.createPaymentLink({
        invoiceNumber: invoiceNumberOf(invoice),
        customerName: customer.name,
        customerReference: customer.id,
        outstandingCents,
        currency: 'ZAR',
        companyTradingName: 'Young Guns Plumbing',
        correlationId,
        invoiceId,
        customerId: customer.id,
        companyId: actor.companyId,
        idempotencyKey,
      });

      const [active] = await this.db
        .update(invoicePaymentLinks)
        .set({
          status: 'active',
          providerPaymentLinkId: result.paymentLinkId,
          providerOrderId: result.orderId,
          paymentUrl: result.paymentUrl,
          providerStatus: result.status,
          issuedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(invoicePaymentLinks.id, prepared!.id))
        .returning();

      await this.recordLinkEvent(actor, prepared!.id, invoiceId, 'created', correlationId, {
        amountCents: outstandingCents,
        detail: 'Yoco payment link created',
      });
      await this.audit(
        actor,
        'payment_link.create',
        'allowed',
        `Created Yoco payment link for ${invoiceNumberOf(invoice)}`,
        { invoiceId, paymentLinkId: result.paymentLinkId },
        correlationId,
      );

      return { link: this.presentLink(active!), reused: false, correlationId };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Yoco failure';
      await this.db
        .update(invoicePaymentLinks)
        .set({ status: 'failed', lastError: message, updatedAt: new Date() })
        .where(eq(invoicePaymentLinks.id, prepared!.id));

      await this.recordLinkEvent(
        actor,
        prepared!.id,
        invoiceId,
        'creation_failed',
        correlationId,
        { amountCents: outstandingCents, detail: message },
      );
      await this.audit(
        actor,
        'payment_link.create',
        'failed',
        message,
        { invoiceId },
        correlationId,
      );

      if (error instanceof YocoError) {
        throw new DocumentEngineError(
          'YOCO_FAILED',
          `Yoco could not create the payment link: ${error.message}`,
        );
      }
      throw error;
    }
  }

  /** Presents a link plus its QR, which is always derived from the stored URL. */
  private presentLink(link: typeof invoicePaymentLinks.$inferSelect) {
    const live = isLivePaymentLinkStatus(link.status as PaymentLinkStatus);
    return {
      id: link.id,
      invoiceId: link.invoiceId,
      status: link.status,
      amountCents: link.amountCents,
      currency: link.currency,
      documentVersion: link.documentVersion,
      paymentUrl: link.paymentUrl,
      providerPaymentLinkId: link.providerPaymentLinkId,
      providerOrderId: link.providerOrderId,
      // No URL means no QR. There is no placeholder path.
      qrSvg:
        link.paymentUrl && live
          ? buildPaymentQrSvg(link.paymentUrl, { title: 'Scan to pay this invoice' })
          : null,
      payable: live && Boolean(link.paymentUrl),
      lastError: link.lastError,
      paidAt: link.paidAt?.toISOString() ?? null,
      auditCorrelationId: link.auditCorrelationId,
    };
  }

  private async cancelLink(
    actor: DocumentActor,
    linkId: string,
    reason: string,
    status: 'cancelled' | 'superseded' = 'cancelled',
  ) {
    await this.db
      .update(invoicePaymentLinks)
      .set({
        status,
        lastError: reason,
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(invoicePaymentLinks.id, linkId), eq(invoicePaymentLinks.companyId, actor.companyId)),
      );

    await this.recordLinkEvent(
      actor,
      linkId,
      null,
      status === 'superseded' ? 'superseded' : 'cancelled',
      null,
      { detail: reason },
    );
  }

  // -------------------------------------------------------------------------
  // Yoco webhook
  // -------------------------------------------------------------------------

  /**
   * Verified webhook intake. A delivery is recorded once; retries are answered
   * from the stored row. Nothing is written to Xero.
   */
  async handleYocoWebhook(input: {
    rawBody: string;
    headers: Record<string, string | string[] | undefined>;
  }) {
    const event = parseYocoPaymentWebhook(JSON.parse(input.rawBody || '{}'));
    const headers = extractYocoWebhookHeaders(input.headers);

    // Match the tenant on Yoco's own identifiers, never on request-supplied ids.
    const link = await this.findLinkByProviderIds(event.paymentLinkId, event.orderId);
    if (!link) {
      throw new DocumentEngineError(
        'UNKNOWN_PAYMENT_LINK',
        'No payment link matches this Yoco event',
      );
    }

    const credentials = await this.loadYocoCredentials(link.companyId);
    if (!credentials?.webhookSecret) {
      await this.recordWebhookDelivery(link, event, {
        signatureVerified: false,
        applied: false,
        rejectionReason: 'No Yoco webhook secret is stored for this company',
      });
      throw new DocumentEngineError(
        'WEBHOOK_SECRET_MISSING',
        'No Yoco webhook secret is stored for this company',
      );
    }

    const verification = verifyYocoWebhookSignature({
      webhookSecret: credentials.webhookSecret,
      rawBody: input.rawBody,
      headers,
    });
    if (!verification.ok) {
      const reason = describeYocoSignatureFailure(verification.reason);
      await this.recordWebhookDelivery(link, event, {
        signatureVerified: false,
        applied: false,
        rejectionReason: reason,
      });
      throw new DocumentEngineError('INVALID_SIGNATURE', reason);
    }

    const existing = await this.db
      .select()
      .from(yocoWebhookDeliveries)
      .where(
        and(
          eq(yocoWebhookDeliveries.companyId, link.companyId),
          eq(yocoWebhookDeliveries.providerEventId, event.eventId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      // Idempotent: a retry changes nothing.
      return { applied: false, duplicate: true, deliveryId: existing[0]!.id };
    }

    const outcome = resolveWebhookOutcome(event);
    if (!outcome.recordPayment) {
      const delivery = await this.recordWebhookDelivery(link, event, {
        signatureVerified: true,
        applied: false,
        rejectionReason: outcome.note,
      });
      return { applied: false, duplicate: false, deliveryId: delivery.id, note: outcome.note };
    }

    if (event.amountCents !== link.amountCents) {
      const reason = `Yoco reported ${event.amountCents} cents for a link created at ${link.amountCents} cents`;
      const delivery = await this.recordWebhookDelivery(link, event, {
        signatureVerified: true,
        applied: false,
        rejectionReason: reason,
      });
      return { applied: false, duplicate: false, deliveryId: delivery.id, note: reason };
    }

    const [payment] = await this.db
      .insert(payments)
      .values({
        companyId: link.companyId,
        invoiceId: link.invoiceId,
        amountCents: event.amountCents,
        currency: event.currency,
        // Yoco settles by card; the provider is recorded in sourceProvider.
        method: 'card',
        reference: link.reference ?? event.paymentId,
        yocoPaymentId: event.paymentId,
        sourceProvider: 'yoco',
        sourceExternalId: event.paymentId,
        sourceSyncedAt: new Date(),
        paidAt: new Date(),
      })
      .returning();

    await this.db
      .update(invoicePaymentLinks)
      .set({ status: 'paid', paidAt: new Date(), updatedAt: new Date() })
      .where(eq(invoicePaymentLinks.id, link.id));

    const delivery = await this.recordWebhookDelivery(link, event, {
      signatureVerified: true,
      applied: true,
      paymentId: payment?.id ?? null,
    });

    await this.db.insert(invoicePaymentLinkEvents).values({
      companyId: link.companyId,
      paymentLinkId: link.id,
      invoiceId: link.invoiceId,
      eventType: 'webhook_payment_created',
      auditCorrelationId: link.auditCorrelationId,
      amountCents: event.amountCents,
      detail: outcome.note,
      metadata: { providerEventId: event.eventId, providerPaymentId: event.paymentId },
    });

    return {
      applied: true,
      duplicate: false,
      deliveryId: delivery.id,
      /** Xero remains the source of truth; this records a provider event only. */
      financiallyReconciled: outcome.financiallyReconciled,
      note: outcome.note,
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private requireRead(actor: DocumentActor) {
    const allowed = actor.permissions.some(
      (permission) =>
        permission === '*' ||
        permission === 'documents:read' ||
        permission === 'documents:write' ||
        permission === 'finance:read',
    );
    if (!allowed) {
      throw new DocumentEngineError('FORBIDDEN', 'You do not have permission to read documents');
    }
  }

  private async loadDocument(companyId: string, documentId: string) {
    const rows = await this.db
      .select()
      .from(titanDocuments)
      .where(and(eq(titanDocuments.id, documentId), eq(titanDocuments.companyId, companyId)))
      .limit(1);

    if (rows.length === 0) {
      // Same message whether it is missing or another tenant's: no existence leak.
      throw new DocumentEngineError('NOT_FOUND', 'Document not found');
    }
    return rows[0]!;
  }

  private async loadInvoice(companyId: string, invoiceId: string) {
    const rows = await this.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)))
      .limit(1);
    if (rows.length === 0) {
      throw new DocumentEngineError('NOT_FOUND', 'Invoice not found');
    }
    return rows[0]!;
  }

  private async loadCustomer(companyId: string, customerId: string) {
    const rows = await this.db
      .select()
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.companyId, companyId)))
      .limit(1);
    return rows[0] ?? null;
  }

  private async findLiveLink(companyId: string, invoiceId: string) {
    const rows = await this.db
      .select()
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
    return rows[0] ?? null;
  }

  private async findLinkByProviderIds(paymentLinkId: string | null, orderId: string | null) {
    if (paymentLinkId) {
      const rows = await this.db
        .select()
        .from(invoicePaymentLinks)
        .where(eq(invoicePaymentLinks.providerPaymentLinkId, paymentLinkId))
        .limit(1);
      if (rows.length > 0) return rows[0]!;
    }
    if (orderId) {
      const rows = await this.db
        .select()
        .from(invoicePaymentLinks)
        .where(eq(invoicePaymentLinks.providerOrderId, orderId))
        .limit(1);
      if (rows.length > 0) return rows[0]!;
    }
    return null;
  }

  /** Payment links are scoped to the issued invoice document version. */
  private async resolveInvoiceDocumentVersion(companyId: string, invoiceId: string) {
    const rows = await this.db
      .select({ version: titanDocuments.version })
      .from(titanDocuments)
      .where(
        and(eq(titanDocuments.companyId, companyId), eq(titanDocuments.invoiceId, invoiceId)),
      )
      .orderBy(desc(titanDocuments.version))
      .limit(1);
    return rows[0]?.version ?? 1;
  }

  private async loadYocoCredentials(companyId: string) {
    if (!this.encryptionKey) return null;
    const rows = await this.db
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.companyId, companyId),
          eq(integrationConnections.provider, 'yoco'),
        ),
      )
      .limit(1);

    const connection = rows[0];
    // Never infer a connection: it must be connected and hold credentials.
    if (!connection || connection.status !== 'connected' || !connection.credentialsEncrypted) {
      return null;
    }
    try {
      return decryptYocoCredentials(connection.credentialsEncrypted, this.encryptionKey);
    } catch {
      return null;
    }
  }

  private async resolveCoc(
    companyId: string,
    jobId: string | null,
    documentationId: string | null,
  ) {
    if (!jobId || !documentationId) return resolveCocAttachment({ hasStoredFile: false });

    const rows = await this.db
      .select()
      .from(mobileJobDocumentation)
      .where(
        and(
          eq(mobileJobDocumentation.id, documentationId),
          eq(mobileJobDocumentation.companyId, companyId),
        ),
      )
      .limit(1);

    const record = rows[0];
    return resolveCocAttachment({
      documentId: record?.id ?? null,
      jobId,
      fileName: record?.fileName ?? null,
      mimeType: record?.mimeType ?? null,
      sizeBytes: record?.sizeBytes ?? null,
      // Only a record with stored bytes counts as attached.
      hasStoredFile: Boolean(record?.storageKey),
    });
  }

  private async assertDocumentationBelongsToCompany(companyId: string, documentationId: string) {
    const rows = await this.db
      .select({ id: mobileJobDocumentation.id })
      .from(mobileJobDocumentation)
      .where(
        and(
          eq(mobileJobDocumentation.id, documentationId),
          eq(mobileJobDocumentation.companyId, companyId),
        ),
      )
      .limit(1);
    if (rows.length === 0) {
      throw new DocumentEngineError('NOT_FOUND', 'Attachment not found');
    }
  }

  private async assertPhotosBelongToCompany(companyId: string, photos: DocumentPhoto[]) {
    const ids = [...new Set(photos.map((photo) => photo.documentationId))];
    if (ids.length === 0) return;

    const rows = await this.db
      .select({ id: mobileJobDocumentation.id })
      .from(mobileJobDocumentation)
      .where(
        and(
          eq(mobileJobDocumentation.companyId, companyId),
          inArray(mobileJobDocumentation.id, ids),
        ),
      );
    if (rows.length !== ids.length) {
      throw new DocumentEngineError(
        'NOT_FOUND',
        'One or more photos are not available for this company',
      );
    }
  }

  /** Assignment is read from the job row, never taken from the request. */
  private async isAssignedTechnician(actor: DocumentActor, jobId: string | null) {
    if (actor.roleName !== 'Technician' || !jobId) return false;

    const rows = await this.db
      .select({ assignedUserId: jobs.assignedUserId })
      .from(jobs)
      .where(and(eq(jobs.id, jobId), eq(jobs.companyId, actor.companyId)))
      .limit(1);

    return rows[0]?.assignedUserId === actor.userId;
  }

  private async recordLinkEvent(
    actor: DocumentActor,
    paymentLinkId: string,
    invoiceId: string | null,
    eventType:
      | 'prepared'
      | 'approved'
      | 'created'
      | 'creation_failed'
      | 'regenerated'
      | 'superseded'
      | 'cancelled'
      | 'webhook_payment_created'
      | 'webhook_rejected',
    correlationId: string | null,
    extra: { amountCents?: number; detail?: string } = {},
  ) {
    await this.db.insert(invoicePaymentLinkEvents).values({
      companyId: actor.companyId,
      paymentLinkId,
      invoiceId,
      eventType,
      auditCorrelationId: correlationId,
      actorUserId: actor.userId,
      amountCents: extra.amountCents ?? null,
      detail: extra.detail ?? null,
    });
  }

  private async recordWebhookDelivery(
    link: typeof invoicePaymentLinks.$inferSelect,
    event: ReturnType<typeof parseYocoPaymentWebhook>,
    outcome: {
      signatureVerified: boolean;
      applied: boolean;
      rejectionReason?: string;
      paymentId?: string | null;
    },
  ) {
    const [delivery] = await this.db
      .insert(yocoWebhookDeliveries)
      .values({
        companyId: link.companyId,
        providerEventId: event.eventId,
        eventType: event.type,
        providerPaymentId: event.paymentId,
        providerPaymentLinkId: event.paymentLinkId,
        paymentLinkId: link.id,
        invoiceId: link.invoiceId,
        paymentId: outcome.paymentId ?? null,
        amountCents: event.amountCents,
        currency: event.currency,
        signatureVerified: outcome.signatureVerified,
        applied: outcome.applied,
        rejectionReason: outcome.rejectionReason ?? null,
        processedAt: new Date(),
      })
      .returning();
    return delivery!;
  }

  private async audit(
    actor: DocumentActor,
    action: string,
    outcome: 'allowed' | 'denied' | 'failed',
    detail: string,
    metadata: Record<string, unknown> = {},
    correlationId = randomUUID(),
  ) {
    await this.recordAudit?.({
      companyId: actor.companyId,
      actorUserId: actor.userId,
      action,
      outcome,
      correlationId,
      detail,
      metadata,
    });
  }
}

function normaliseSections(sections: DocumentSection[] | null | undefined): DocumentSection[] {
  if (!Array.isArray(sections)) return [];
  return [...sections].sort((a, b) => a.position - b.position);
}

function changedSectionKinds(
  before: DocumentSection[],
  after: DocumentSection[],
): DocumentSection['kind'][] {
  const beforeById = new Map(before.map((section) => [section.id, section]));
  const changed = new Set<DocumentSection['kind']>();

  for (const section of after) {
    const previous = beforeById.get(section.id);
    if (!previous) {
      changed.add(section.kind);
      continue;
    }
    if (
      previous.title !== section.title ||
      previous.visible !== section.visible ||
      previous.position !== section.position ||
      JSON.stringify(previous.payload) !== JSON.stringify(section.payload)
    ) {
      changed.add(section.kind);
    }
  }

  const afterIds = new Set(after.map((section) => section.id));
  for (const section of before) {
    if (!afterIds.has(section.id)) changed.add(section.kind);
  }

  return [...changed];
}

function invoiceOutstandingCents(invoice: typeof invoices.$inferSelect): number {
  const total = invoice.totalCents ?? 0;
  const paid = invoice.amountPaidCents ?? 0;
  return Math.max(0, total - paid);
}

function invoiceNumberOf(invoice: typeof invoices.$inferSelect): string {
  return invoice.xeroInvoiceNumber ?? invoice.invoiceNumber ?? invoice.id;
}
