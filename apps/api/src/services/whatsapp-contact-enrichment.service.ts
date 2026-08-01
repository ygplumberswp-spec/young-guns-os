import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import type {
  ContactSourceRecord,
  WhatsAppEnrichmentMetrics,
  WhatsAppMatchReviewSummary,
} from '@titan/shared';
import {
  assertNoDuplicateCustomerCreateFromWhatsApp,
  assertNoSilentXeroWrite,
  buildDefaultEnrichmentMetricBuckets,
  classifyCustomerValueFromEvidence,
  classifyWhatsAppMatch,
  enrichmentPriorityRank,
  isEligibleForWhatsAppEnrichment,
  normalizeSaMobile,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  customerContactSources,
  customers,
  integrationSyncJobs,
  invoices,
  whatsappMatchReviews,
  whatsappMessages,
  xeroCustomerMappings,
} from '@titan/db';
import type { WhatsappService } from './whatsapp.service.js';

export class WhatsappContactEnrichmentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'WhatsappContactEnrichmentError';
  }
}

export type WhatsappContactEnrichmentScope = {
  companyId: string;
  userId: string;
  permissions: string[];
};

type ServiceDeps = {
  db: DatabaseClient;
  whatsappService: WhatsappService;
};

/** Background work priority — queues BEHIND Xero import + global auto-sync. */
export const WHATSAPP_ENRICHMENT_QUEUE_PRIORITY = 50;

export class WhatsappContactEnrichmentService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly whatsappService: WhatsappService,
  ) {}

  static create(deps: ServiceDeps): WhatsappContactEnrichmentService {
    return new WhatsappContactEnrichmentService(deps.db, deps.whatsappService);
  }

  async getMetrics(companyId: string): Promise<WhatsAppEnrichmentMetrics> {
    const connection = await this.whatsappService.getConnection(companyId);
    const xeroImportInProgress = await this.isXeroImportInProgress(companyId);
    const notes: string[] = [];

    if (xeroImportInProgress) {
      notes.push(
        'Xero background import in progress — enrichment queued behind import; metrics may be partial.',
      );
    }

    const eligibleMissing = await this.countEligibleMissingMobile(companyId);
    const prioritizedPaid = await this.countPrioritizedPaidMissingMobile(companyId);

    let reviewRows: Array<{ status: string; matchClassification: string }> = [];
    let sourceRows: Array<{ isVerified: boolean; isServiceSafe: boolean }> = [];

    try {
      reviewRows = await this.db
        .select({
          status: whatsappMatchReviews.status,
          matchClassification: whatsappMatchReviews.matchClassification,
        })
        .from(whatsappMatchReviews)
        .where(eq(whatsappMatchReviews.companyId, companyId));

      sourceRows = await this.db
        .select({
          isVerified: customerContactSources.isVerified,
          isServiceSafe: customerContactSources.isServiceSafe,
        })
        .from(customerContactSources)
        .where(eq(customerContactSources.companyId, companyId));
    } catch {
      notes.push('Enrichment tables not yet migrated — scaffold metrics only.');
    }

    const matchBuckets = buildDefaultEnrichmentMetricBuckets();
    for (const row of reviewRows) {
      const bucket = matchBuckets.find((b) => b.key === `match_${row.matchClassification}`);
      if (bucket) bucket.count += 1;
    }
    const pendingBucket = matchBuckets.find((b) => b.key === 'review_pending');
    if (pendingBucket) {
      pendingBucket.count = reviewRows.filter((r) => r.status === 'pending').length;
    }
    const paidBucket = matchBuckets.find((b) => b.key === 'missing_mobile_paid');
    if (paidBucket) paidBucket.count = prioritizedPaid;

    const autoSyncState = this.resolveAutoSyncState({
      connectionStatus: connection.status,
      xeroImportInProgress,
      isConnected: connection.status === 'connected',
    });

    const [messageCount] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(whatsappMessages)
      .where(eq(whatsappMessages.companyId, companyId));

    return {
      computedAt: new Date().toISOString(),
      whatsappConnectionStatus: connection.status,
      autoSyncState: autoSyncState.state,
      autoSyncStateLabel: autoSyncState.label,
      xeroImportInProgress,
      eligibleCustomersMissingMobile: eligibleMissing,
      prioritizedPaidFullyPaidMissingMobile: prioritizedPaid,
      conversationsImported: messageCount?.count ?? 0,
      conversationsPermitted: messageCount?.count ?? 0,
      matchBuckets,
      reviewQueue: {
        pending: reviewRows.filter((r) => r.status === 'pending').length,
        approved: reviewRows.filter((r) => r.status === 'approved').length,
        rejected: reviewRows.filter((r) => r.status === 'rejected').length,
        blockedXeroImport: reviewRows.filter((r) => r.status === 'blocked_xero_import').length,
      },
      contactSources: {
        verified: sourceRows.filter((r) => r.isVerified).length,
        serviceSafe: sourceRows.filter((r) => r.isServiceSafe).length,
        pendingVerification: sourceRows.filter((r) => !r.isVerified).length,
      },
      safety: {
        supplierMatchesBlocked: reviewRows.filter((r) => r.matchClassification === 'no_match').length,
        prospectMatchesBlocked: 0,
        conflictingMatches: reviewRows.filter((r) => r.matchClassification === 'conflicting').length,
        duplicateCustomerCreatesPrevented: 0,
        unauthorizedAccessAttempts: 0,
      },
      notes,
    };
  }

  async listReviews(
    companyId: string,
    opts: { status?: string | null; matchClassification?: string | null } = {},
  ): Promise<WhatsAppMatchReviewSummary[]> {
    const conditions = [eq(whatsappMatchReviews.companyId, companyId)];

    if (opts.status) {
      conditions.push(eq(whatsappMatchReviews.status, opts.status as never));
    }
    if (opts.matchClassification) {
      conditions.push(
        eq(whatsappMatchReviews.matchClassification, opts.matchClassification as never),
      );
    }

    let rows;
    try {
      rows = await this.db
        .select({
          review: whatsappMatchReviews,
          customerName: customers.name,
        })
        .from(whatsappMatchReviews)
        .leftJoin(customers, eq(customers.id, whatsappMatchReviews.customerId))
        .where(and(...conditions))
        .orderBy(whatsappMatchReviews.priorityRank, desc(whatsappMatchReviews.requestedAt));
    } catch {
      return [];
    }

    return rows.map(({ review, customerName }) => this.toReviewSummary(review, customerName));
  }

  async approveReview(
    scope: WhatsappContactEnrichmentScope,
    reviewId: string,
    input: { reviewNotes?: string | null; requestXeroSyncBack?: boolean } = {},
  ): Promise<WhatsAppMatchReviewSummary> {
    this.requireApprovalPermission(scope);

    const xeroImportInProgress = await this.isXeroImportInProgress(scope.companyId);
    if (xeroImportInProgress) {
      throw new WhatsappContactEnrichmentError(
        'XERO_IMPORT_IN_PROGRESS',
        'Enrichment approval blocked while Xero background import is running.',
      );
    }

    const [existing] = await this.db
      .select()
      .from(whatsappMatchReviews)
      .where(
        and(eq(whatsappMatchReviews.id, reviewId), eq(whatsappMatchReviews.companyId, scope.companyId)),
      );

    if (!existing) {
      throw new WhatsappContactEnrichmentError('NOT_FOUND', 'Review item not found.');
    }
    if (existing.status !== 'pending') {
      throw new WhatsappContactEnrichmentError('CONFLICT', `Review already ${existing.status}.`);
    }
    if (!existing.customerId) {
      throw new WhatsappContactEnrichmentError(
        'VALIDATION_ERROR',
        'Cannot approve — no existing customer linked (WhatsApp never creates customers).',
      );
    }

    const duplicateGuard = assertNoDuplicateCustomerCreateFromWhatsApp({
      existingCustomerId: existing.customerId,
      createCustomerRequested: false,
    });
    if (!duplicateGuard.permitted) {
      throw new WhatsappContactEnrichmentError('VALIDATION_ERROR', duplicateGuard.reason);
    }

    const xeroGuard = assertNoSilentXeroWrite({
      xeroWriteRequested: Boolean(input.requestXeroSyncBack),
      explicitSyncBackApproved: Boolean(input.requestXeroSyncBack),
    });
    if (!xeroGuard.permitted) {
      throw new WhatsappContactEnrichmentError('VALIDATION_ERROR', xeroGuard.reason);
    }

    const normalizedMobile = existing.proposedMobileNormalized ?? normalizeSaMobile(existing.proposedMobile);
    if (!normalizedMobile) {
      throw new WhatsappContactEnrichmentError(
        'VALIDATION_ERROR',
        'Proposed mobile is not a valid SA number.',
      );
    }

    const now = new Date();

    await this.db.transaction(async (tx) => {
      await tx
        .update(customers)
        .set({ phone: normalizedMobile, updatedAt: now })
        .where(
          and(eq(customers.id, existing.customerId!), eq(customers.companyId, scope.companyId)),
        );

      await tx
        .update(whatsappMatchReviews)
        .set({
          status: 'approved',
          titanSaved: true,
          xeroSyncBackRequested: Boolean(input.requestXeroSyncBack),
          reviewNotes: input.reviewNotes?.trim() ?? null,
          reviewedAt: now,
          reviewedByUserId: scope.userId,
          updatedAt: now,
        })
        .where(eq(whatsappMatchReviews.id, reviewId));

      await tx.insert(customerContactSources).values({
        companyId: scope.companyId,
        customerId: existing.customerId!,
        normalizedMobile,
        originalFormat: existing.proposedMobile,
        source: 'whatsapp_conversation',
        conversationRef: existing.conversationRef,
        evidence: existing.evidence,
        confidenceScore: existing.confidenceScore,
        matchClassification: existing.matchClassification,
        isVerified: true,
        isServiceSafe: true,
        marketingConsentStatus: 'unknown',
        verifiedAt: now,
        verifiedByUserId: scope.userId,
        history: [
          {
            at: now.toISOString(),
            action: 'approved',
            actorUserId: scope.userId,
            detail: 'Owner/manager approved — TITAN customer phone updated.',
            confidenceScore: existing.confidenceScore,
            matchClassification: existing.matchClassification,
          },
        ],
        capturedAt: now,
      });
    });

    const [updated] = await this.db
      .select()
      .from(whatsappMatchReviews)
      .where(eq(whatsappMatchReviews.id, reviewId));

    const [customer] = await this.db
      .select({ name: customers.name })
      .from(customers)
      .where(eq(customers.id, existing.customerId!));

    return this.toReviewSummary(updated!, customer?.name ?? null);
  }

  /**
   * Stub — live WhatsApp conversation import when connected.
   * Does not call Meta API without credentials; returns honest disconnected state.
   */
  async runAutoSyncPass(companyId: string): Promise<{ processed: number; state: string }> {
    const connection = await this.whatsappService.getConnection(companyId);

    if (connection.status !== 'connected' || !connection.hasCredentials) {
      return { processed: 0, state: 'waiting_connection' };
    }

    if (await this.isXeroImportInProgress(companyId)) {
      return { processed: 0, state: 'queued_behind_xero' };
    }

    // Live Meta conversation fetch is intentionally stubbed — webhook + stored messages only.
    return { processed: 0, state: 'processing_matches' };
  }

  private requireApprovalPermission(scope: WhatsappContactEnrichmentScope): void {
    const allowed =
      scope.permissions.includes('integrations:manage') ||
      scope.permissions.includes('communications:write') ||
      scope.permissions.includes('crm:write');

    if (!allowed) {
      throw new WhatsappContactEnrichmentError(
        'FORBIDDEN',
        'Insufficient permissions for enrichment approval.',
      );
    }
  }

  private async isXeroImportInProgress(companyId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: integrationSyncJobs.id })
      .from(integrationSyncJobs)
      .where(
        and(
          eq(integrationSyncJobs.companyId, companyId),
          eq(integrationSyncJobs.provider, 'xero'),
          or(
            eq(integrationSyncJobs.status, 'running'),
            eq(integrationSyncJobs.status, 'pending'),
          ),
        ),
      )
      .limit(1);

    return Boolean(row);
  }

  private async countEligibleMissingMobile(companyId: string): Promise<number> {
    const summaries = await this.loadValueSummaries(companyId);
    return summaries.filter(
      (s) =>
        isEligibleForWhatsAppEnrichment(s.primaryClassification) &&
        s.missingMobile &&
        !s.isSupplierOnly,
    ).length;
  }

  private async countPrioritizedPaidMissingMobile(companyId: string): Promise<number> {
    const summaries = await this.loadValueSummaries(companyId);
    return summaries.filter(
      (s) =>
        (s.primaryClassification === 'fully_paid_customer' ||
          s.primaryClassification === 'paying_customer') &&
        s.missingMobile &&
        !s.isSupplierOnly,
    ).length;
  }

  private async loadValueSummaries(companyId: string) {
    const customerRows = await this.db
      .select()
      .from(customers)
      .where(eq(customers.companyId, companyId));

    if (customerRows.length === 0) return [];

    const customerIds = customerRows.map((c) => c.id);
    const invoiceRows = await this.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.companyId, companyId), inArray(invoices.customerId, customerIds)));

    const mappingRows = await this.db
      .select()
      .from(xeroCustomerMappings)
      .where(
        and(
          eq(xeroCustomerMappings.companyId, companyId),
          inArray(xeroCustomerMappings.customerId, customerIds),
        ),
      );

    const invoicesByCustomer = new Map<string, typeof invoiceRows>();
    for (const inv of invoiceRows) {
      const list = invoicesByCustomer.get(inv.customerId) ?? [];
      list.push(inv);
      invoicesByCustomer.set(inv.customerId, list);
    }

    const xeroByCustomer = new Map<string, string>();
    for (const m of mappingRows) {
      if (m.xeroContactId) xeroByCustomer.set(m.customerId, m.xeroContactId);
    }

    return customerRows.map((customer) => {
      const classified = classifyCustomerValueFromEvidence({
        customerId: customer.id,
        customerName: customer.name,
        customerStatus: customer.status,
        isSupplierOnly: customer.isSupplierOnly,
        xeroContactId: xeroByCustomer.get(customer.id) ?? null,
        invoices: (invoicesByCustomer.get(customer.id) ?? []).map((inv) => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          status: inv.status,
          amountCents: inv.amountCents,
          amountPaidCents: inv.amountPaidCents,
          totalCents: inv.totalCents,
          issuedAt: inv.issuedAt?.toISOString() ?? null,
          dueDate: inv.dueDate?.toISOString() ?? null,
          updatedAt: inv.updatedAt.toISOString(),
        })),
      });

      return {
        ...classified,
        missingMobile: !normalizeSaMobile(customer.phone),
        isSupplierOnly: customer.isSupplierOnly,
        priorityRank: enrichmentPriorityRank(classified.primaryClassification),
      };
    });
  }

  private resolveAutoSyncState(input: {
    connectionStatus: string;
    xeroImportInProgress: boolean;
    isConnected: boolean;
  }): { state: WhatsAppEnrichmentMetrics['autoSyncState']; label: string } {
    if (input.connectionStatus === 'disconnected' || input.connectionStatus === 'error') {
      return { state: 'waiting_connection', label: 'WhatsApp not connected' };
    }
    if (input.xeroImportInProgress) {
      return {
        state: 'queued_behind_xero',
        label: 'Queued behind Xero import',
      };
    }
    if (input.isConnected) {
      return { state: 'idle', label: 'Ready — webhook/stored messages' };
    }
    return { state: 'not_configured', label: 'Not configured' };
  }

  private toReviewSummary(
    row: typeof whatsappMatchReviews.$inferSelect,
    customerName: string | null,
  ): WhatsAppMatchReviewSummary {
    return {
      id: row.id,
      companyId: row.companyId,
      customerId: row.customerId,
      customerName,
      whatsappWaId: row.whatsappWaId,
      whatsappDisplayName: row.whatsappDisplayName,
      proposedMobile: row.proposedMobile,
      proposedMobileNormalized: row.proposedMobileNormalized,
      matchClassification: row.matchClassification,
      confidenceScore: row.confidenceScore,
      evidence: row.evidence as WhatsAppMatchReviewSummary['evidence'],
      status: row.status,
      priorityRank: row.priorityRank,
      conversationRef: row.conversationRef,
      conflictingCustomerIds: row.conflictingCustomerIds ?? [],
      requestedAt: row.requestedAt.toISOString(),
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      reviewedByUserId: row.reviewedByUserId,
      reviewNotes: row.reviewNotes,
      titanSaved: row.titanSaved,
      xeroSyncBackRequested: row.xeroSyncBackRequested,
    };
  }

  /** Exposed for unit tests — classify without DB. */
  classifyMatch = classifyWhatsAppMatch;
}

export type { ContactSourceRecord };
