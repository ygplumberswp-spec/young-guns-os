import { and, desc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';
import type {
  JobLinkageControlQueue,
  JobLinkageQueueItem,
  LinkageCandidate,
  LinkageConfidence,
  LinkageInvoiceDocument,
  LinkageQuoteDocument,
} from '@titan/shared';
import {
  buildLinkageEntityFingerprint,
  buildLinkageQueueItem,
  detectInvoiceLinkageConflicts,
  resolveLinkageMechanism,
  scoreLinkageCandidates,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  invoices,
  jobFinancialLinkageAudits,
  jobFinancialLinkageRejections,
  jobs,
  quotes,
  securityAuditLogs,
} from '@titan/db';
import type { JobCostControlService } from './job-cost-control.service.js';
import type { JobProfitabilityService } from './job-profitability.service.js';

export class JobLinkageControlError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'JobLinkageControlError';
  }
}

export type JobLinkageControlActor = {
  companyId: string;
  userId: string;
  roleName?: string | null;
  permissions: string[];
};

export type JobLinkageControlFilters = {
  documentType?: 'invoice' | 'quote' | 'all';
  customerId?: string;
  fromDate?: string;
  toDate?: string;
  confidence?: LinkageConfidence;
  reviewState?: 'unlinked' | 'suggested' | 'ambiguous' | 'linked' | 'rejected';
  jobId?: string;
  reference?: string;
  page?: number;
  pageSize?: number;
};

export type LinkCandidatesResult = {
  entityType: 'invoice' | 'quote';
  entityId: string;
  entityFingerprint: string;
  currentJobId: string | null;
  candidates: LinkageCandidate[];
  conflicts: ReturnType<typeof detectInvoiceLinkageConflicts>;
};

export class JobLinkageControlService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly profitabilityService: JobProfitabilityService,
    private readonly costControlService?: JobCostControlService,
  ) {}

  async getLinkageControlQueue(
    companyId: string,
    filters: JobLinkageControlFilters = {},
  ): Promise<JobLinkageControlQueue> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));
    const rejections = await this.loadRejections(companyId);
    const jobs = await this.loadCompanyJobs(companyId);

    const [invoiceRows, quoteRows, recentAudits] = await Promise.all([
      this.loadInvoiceDocuments(companyId, filters),
      this.loadQuoteDocuments(companyId, filters),
      this.loadRecentLinkageAudits(companyId),
    ]);

    const duplicateExternalIds = await this.findDuplicateExternalInvoiceIds(companyId);

    const invoiceItems = invoiceRows.map((row) =>
      this.buildInvoiceQueueItem(row, jobs, rejections, duplicateExternalIds),
    );
    const quoteItems = quoteRows.map((row) =>
      this.buildQuoteQueueItem(row, jobs, rejections),
    );

    const allOrphans = [...invoiceItems, ...quoteItems];
    const suggested = allOrphans.filter((row) => row.linkageState === 'suggested');
    const ambiguous = allOrphans.filter((row) => row.linkageState === 'ambiguous');
    const unlinkedInvoices = invoiceItems.filter((row) => row.linkageState === 'unlinked');
    const unlinkedQuotes = quoteItems.filter((row) => row.linkageState === 'unlinked');

    let filtered = allOrphans;
    if (filters.reviewState) {
      filtered = allOrphans.filter((row) => row.linkageState === filters.reviewState);
    }
    if (filters.confidence) {
      filtered = filtered.filter((row) => row.topCandidate?.confidence === filters.confidence);
    }
    if (filters.documentType === 'invoice') filtered = invoiceItems;
    if (filters.documentType === 'quote') filtered = quoteItems;

    const total = filtered.length;
    const offset = (page - 1) * pageSize;
    const pageItems = filtered.slice(offset, offset + pageSize);

    const recentlyLinked = await this.buildRecentlyLinkedItems(companyId, recentAudits);

    return {
      summary: {
        unlinkedInvoicesCount: unlinkedInvoices.length,
        unlinkedInvoicesValueCents: unlinkedInvoices.reduce((sum, row) => sum + row.amountCents, 0),
        unlinkedQuotesCount: unlinkedQuotes.length,
        unlinkedQuotesValueCents: unlinkedQuotes.reduce((sum, row) => sum + row.amountCents, 0),
        highConfidenceSuggestions: suggested.filter(
          (row) => row.topCandidate?.confidence === 'high' || row.topCandidate?.isDeterministic,
        ).length,
        ambiguousRecords: ambiguous.length,
        linkageConflicts: allOrphans.filter((row) => row.conflicts.length > 0).length,
        recentlyLinkedCount: recentlyLinked.length,
      },
      unlinkedInvoices: pageItems.filter((row) => row.entityType === 'invoice' && row.linkageState === 'unlinked'),
      unlinkedQuotes: pageItems.filter((row) => row.entityType === 'quote' && row.linkageState === 'unlinked'),
      suggested: pageItems.filter((row) => row.linkageState === 'suggested'),
      ambiguous: pageItems.filter((row) => row.linkageState === 'ambiguous'),
      recentlyLinked,
      rejected: pageItems.filter((row) => row.linkageState === 'rejected'),
      pagination: { page, pageSize, total },
    };
  }

  async getInvoiceCandidates(companyId: string, invoiceId: string): Promise<LinkCandidatesResult> {
    const row = await this.requireInvoice(companyId, invoiceId);
    const document = this.toInvoiceDocument(row);
    const jobs = await this.loadCandidateJobs(companyId, row.customerId);
    const rejections = await this.loadRejectionsForEntity(companyId, 'invoice', invoiceId);
    const linkedQuote = row.quoteId
      ? await this.db.query.quotes.findFirst({
          where: and(eq(quotes.companyId, companyId), eq(quotes.id, row.quoteId)),
        })
      : null;
    const duplicateExternalIds = await this.findDuplicateExternalInvoiceIds(companyId);
    const candidates = scoreLinkageCandidates({
      document,
      jobs,
      linkedQuote: linkedQuote
        ? {
            quoteId: linkedQuote.id,
            quoteJobId: linkedQuote.jobId,
            quoteTotalCents: linkedQuote.totalCents,
            quoteStatus: linkedQuote.status,
          }
        : null,
      rejectedJobIds: rejections,
    });
    const conflicts = detectInvoiceLinkageConflicts(
      document,
      linkedQuote
        ? {
            quoteId: linkedQuote.id,
            quoteJobId: linkedQuote.jobId,
            quoteTotalCents: linkedQuote.totalCents,
            quoteStatus: linkedQuote.status,
          }
        : null,
      row.sourceExternalId && duplicateExternalIds.includes(row.sourceExternalId)
        ? [row.sourceExternalId]
        : [],
    );
    return {
      entityType: 'invoice',
      entityId: invoiceId,
      entityFingerprint: buildLinkageEntityFingerprint(document, 'invoice'),
      currentJobId: row.jobId,
      candidates: candidates.slice(0, 10),
      conflicts,
    };
  }

  async getQuoteCandidates(companyId: string, quoteId: string): Promise<LinkCandidatesResult> {
    const row = await this.requireQuote(companyId, quoteId);
    const document = this.toQuoteDocument(row);
    const jobs = await this.loadCandidateJobs(companyId, row.customerId);
    const rejections = await this.loadRejectionsForEntity(companyId, 'quote', quoteId);
    const candidates = scoreLinkageCandidates({ document, jobs, rejectedJobIds: rejections });
    return {
      entityType: 'quote',
      entityId: quoteId,
      entityFingerprint: buildLinkageEntityFingerprint(document, 'quote'),
      currentJobId: row.jobId,
      candidates: candidates.slice(0, 10),
      conflicts: [],
    };
  }

  async linkInvoice(
    actor: JobLinkageControlActor,
    invoiceId: string,
    input: { jobId: string; reason: string; entityFingerprint?: string; allowDeterministicOnly?: boolean },
  ): Promise<LinkCandidatesResult> {
    const invoice = await this.requireInvoice(actor.companyId, invoiceId);
    const currentFingerprint = buildLinkageEntityFingerprint(this.toInvoiceDocument(invoice), 'invoice');
    if (input.entityFingerprint && input.entityFingerprint !== currentFingerprint) {
      throw new JobLinkageControlError(
        'STALE_CANDIDATE',
        'Financial document changed since suggestion — re-review candidates before linking.',
      );
    }

    const job = await this.requireJob(actor.companyId, input.jobId);
    if (job.customerId !== invoice.customerId) {
      throw new JobLinkageControlError(
        'VALIDATION_ERROR',
        'Target job must belong to the same customer as the invoice.',
      );
    }

    const preview = await this.getInvoiceCandidates(actor.companyId, invoiceId);
    const selected = preview.candidates.find((row) => row.jobId === input.jobId);
    if (!selected) {
      throw new JobLinkageControlError('VALIDATION_ERROR', 'Selected job is not a valid linkage candidate.');
    }
    if (input.allowDeterministicOnly && !selected.isDeterministic) {
      throw new JobLinkageControlError(
        'FORBIDDEN',
        'Automatic linkage is limited to deterministic matches — owner approval required.',
      );
    }
    if (preview.conflicts.some((c) => c.type === 'QUOTE_INVOICE_JOB_MISMATCH')) {
      throw new JobLinkageControlError(
        'CONFLICT',
        'Invoice/quote job mismatch must be resolved before linking.',
      );
    }

    const previousJobId = invoice.jobId;
    if (previousJobId === input.jobId) {
      return preview;
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(invoices)
        .set({ jobId: input.jobId, updatedAt: new Date() })
        .where(and(eq(invoices.companyId, actor.companyId), eq(invoices.id, invoiceId)));

      await tx.insert(jobFinancialLinkageAudits).values({
        companyId: actor.companyId,
        entityType: 'invoice',
        entityId: invoiceId,
        previousJobId,
        newJobId: input.jobId,
        mechanism: resolveLinkageMechanism(actor.roleName, selected.confidence, previousJobId),
        confidence: selected.confidence,
        score: selected.score,
        evidence: selected.evidence,
        reason: input.reason.trim(),
        entityFingerprint: currentFingerprint,
        actorUserId: actor.userId,
      });

      await tx.insert(securityAuditLogs).values({
        companyId: actor.companyId,
        category: 'financial',
        action: previousJobId ? 'jfl_invoice_reassigned' : 'jfl_invoice_linked',
        entityType: 'invoice',
        entityId: invoiceId,
        userId: actor.userId,
        metadata: {
          previousJobId,
          newJobId: input.jobId,
          confidence: selected.confidence,
          reasons: selected.reasons,
          fakeDataInvented: false,
        },
      });
    });

    await this.refreshJobsAfterLinkage(actor.companyId, previousJobId, input.jobId);
    return this.getInvoiceCandidates(actor.companyId, invoiceId);
  }

  async linkQuote(
    actor: JobLinkageControlActor,
    quoteId: string,
    input: { jobId: string; reason: string; entityFingerprint?: string },
  ): Promise<LinkCandidatesResult> {
    const quote = await this.requireQuote(actor.companyId, quoteId);
    const currentFingerprint = buildLinkageEntityFingerprint(this.toQuoteDocument(quote), 'quote');
    if (input.entityFingerprint && input.entityFingerprint !== currentFingerprint) {
      throw new JobLinkageControlError(
        'STALE_CANDIDATE',
        'Financial document changed since suggestion — re-review candidates before linking.',
      );
    }

    const job = await this.requireJob(actor.companyId, input.jobId);
    if (job.customerId !== quote.customerId) {
      throw new JobLinkageControlError(
        'VALIDATION_ERROR',
        'Target job must belong to the same customer as the quote.',
      );
    }

    const preview = await this.getQuoteCandidates(actor.companyId, quoteId);
    const selected = preview.candidates.find((row) => row.jobId === input.jobId);
    if (!selected) {
      throw new JobLinkageControlError('VALIDATION_ERROR', 'Selected job is not a valid linkage candidate.');
    }

    const previousJobId = quote.jobId;
    if (previousJobId === input.jobId) {
      return preview;
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(quotes)
        .set({ jobId: input.jobId, updatedAt: new Date() })
        .where(and(eq(quotes.companyId, actor.companyId), eq(quotes.id, quoteId)));

      await tx.insert(jobFinancialLinkageAudits).values({
        companyId: actor.companyId,
        entityType: 'quote',
        entityId: quoteId,
        previousJobId,
        newJobId: input.jobId,
        mechanism: resolveLinkageMechanism(actor.roleName, selected.confidence, previousJobId),
        confidence: selected.confidence,
        score: selected.score,
        evidence: selected.evidence,
        reason: input.reason.trim(),
        entityFingerprint: currentFingerprint,
        actorUserId: actor.userId,
      });

      await tx.insert(securityAuditLogs).values({
        companyId: actor.companyId,
        category: 'financial',
        action: previousJobId ? 'jfl_quote_reassigned' : 'jfl_quote_linked',
        entityType: 'quote',
        entityId: quoteId,
        userId: actor.userId,
        metadata: {
          previousJobId,
          newJobId: input.jobId,
          confidence: selected.confidence,
          reasons: selected.reasons,
          fakeDataInvented: false,
        },
      });
    });

    await this.refreshJobsAfterLinkage(actor.companyId, previousJobId, input.jobId);
    return this.getQuoteCandidates(actor.companyId, quoteId);
  }

  async unlinkInvoice(
    actor: JobLinkageControlActor,
    invoiceId: string,
    input: { reason: string },
  ): Promise<LinkCandidatesResult> {
    const invoice = await this.requireInvoice(actor.companyId, invoiceId);
    if (!invoice.jobId) {
      return this.getInvoiceCandidates(actor.companyId, invoiceId);
    }

    const previousJobId = invoice.jobId;
    const currentFingerprint = buildLinkageEntityFingerprint(this.toInvoiceDocument(invoice), 'invoice');

    await this.db.transaction(async (tx) => {
      await tx
        .update(invoices)
        .set({ jobId: null, updatedAt: new Date() })
        .where(and(eq(invoices.companyId, actor.companyId), eq(invoices.id, invoiceId)));

      await tx.insert(jobFinancialLinkageAudits).values({
        companyId: actor.companyId,
        entityType: 'invoice',
        entityId: invoiceId,
        previousJobId,
        newJobId: null,
        mechanism: 'unlinked',
        confidence: null,
        score: null,
        evidence: [],
        reason: input.reason.trim(),
        entityFingerprint: currentFingerprint,
        actorUserId: actor.userId,
      });

      await tx.insert(securityAuditLogs).values({
        companyId: actor.companyId,
        category: 'financial',
        action: 'jfl_invoice_unlinked',
        entityType: 'invoice',
        entityId: invoiceId,
        userId: actor.userId,
        metadata: { previousJobId, fakeDataInvented: false },
      });
    });

    await this.refreshJobsAfterLinkage(actor.companyId, previousJobId, null);
    return this.getInvoiceCandidates(actor.companyId, invoiceId);
  }

  async rejectSuggestion(
    actor: JobLinkageControlActor,
    entityType: 'invoice' | 'quote',
    entityId: string,
    input: { jobId: string; reason: string },
  ): Promise<void> {
    await this.requireJob(actor.companyId, input.jobId);
    if (entityType === 'invoice') await this.requireInvoice(actor.companyId, entityId);
    else await this.requireQuote(actor.companyId, entityId);

    await this.db
      .insert(jobFinancialLinkageRejections)
      .values({
        companyId: actor.companyId,
        entityType,
        entityId,
        rejectedJobId: input.jobId,
        reason: input.reason.trim(),
        rejectedByUserId: actor.userId,
      })
      .onConflictDoNothing();

    await this.db.insert(jobFinancialLinkageAudits).values({
      companyId: actor.companyId,
      entityType,
      entityId,
      previousJobId: null,
      newJobId: null,
      mechanism: 'rejected',
      confidence: null,
      score: null,
      evidence: [{ code: 'rejected', message: input.reason.trim(), weight: 0 }],
      reason: input.reason.trim(),
      entityFingerprint: null,
      actorUserId: actor.userId,
    });
  }

  /** READ-ONLY staging/backlog analysis — never writes job IDs. */
  async runReadOnlyLinkageAnalysis(companyId: string) {
    const jobs = await this.loadCompanyJobs(companyId);
    const rejections = await this.loadRejections(companyId);
    const duplicateExternalIds = await this.findDuplicateExternalInvoiceIds(companyId);

    const [invoiceTotals, quoteTotals] = await Promise.all([
      this.db
        .select({
          count: sql<number>`count(*)::int`,
          totalValueCents: sql<number>`coalesce(sum(${invoices.totalCents}), 0)::int`,
        })
        .from(invoices)
        .where(and(eq(invoices.companyId, companyId), isNull(invoices.jobId))),
      this.db
        .select({
          count: sql<number>`count(*)::int`,
          totalValueCents: sql<number>`coalesce(sum(${quotes.totalCents}), 0)::int`,
        })
        .from(quotes)
        .where(and(eq(quotes.companyId, companyId), isNull(quotes.jobId))),
    ]);

    const invoiceRows = await this.loadInvoiceDocuments(companyId, { documentType: 'invoice' });
    const quoteRows = await this.loadQuoteDocuments(companyId, { documentType: 'quote' });

    let deterministic = 0;
    let highConfidence = 0;
    let ambiguous = 0;
    let noCandidate = 0;
    const examples: Array<{
      entityType: 'invoice' | 'quote';
      entityId: string;
      documentNumber: string;
      candidateJobNumber: string | null;
      confidence: string | null;
      evidence: string[];
    }> = [];

    for (const row of invoiceRows) {
      const item = this.buildInvoiceQueueItem(row, jobs, rejections, duplicateExternalIds);
      if (item.topCandidate?.isDeterministic) deterministic += 1;
      else if (item.topCandidate?.confidence === 'high') highConfidence += 1;
      else if (item.linkageState === 'ambiguous') ambiguous += 1;
      else if (!item.topCandidate) noCandidate += 1;
      if (examples.length < 10 && item.topCandidate) {
        examples.push({
          entityType: 'invoice',
          entityId: item.entityId,
          documentNumber: item.documentNumber,
          candidateJobNumber: item.topCandidate.jobNumber,
          confidence: item.topCandidate.confidence,
          evidence: item.topCandidate.reasons.slice(0, 4),
        });
      }
    }

    for (const row of quoteRows) {
      const item = this.buildQuoteQueueItem(row, jobs, rejections);
      if (item.topCandidate?.isDeterministic) deterministic += 1;
      else if (item.topCandidate?.confidence === 'high') highConfidence += 1;
      else if (item.linkageState === 'ambiguous') ambiguous += 1;
      else if (!item.topCandidate) noCandidate += 1;
      if (examples.length < 10 && item.topCandidate) {
        examples.push({
          entityType: 'quote',
          entityId: item.entityId,
          documentNumber: item.documentNumber,
          candidateJobNumber: item.topCandidate.jobNumber,
          confidence: item.topCandidate.confidence,
          evidence: item.topCandidate.reasons.slice(0, 4),
        });
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      readOnly: true,
      historicalJobIdsWritten: 0,
      categories: {
        unlinkedInvoices: {
          count: invoiceTotals[0]?.count ?? 0,
          totalValueCents: invoiceTotals[0]?.totalValueCents ?? 0,
        },
        unlinkedQuotes: {
          count: quoteTotals[0]?.count ?? 0,
          totalValueCents: quoteTotals[0]?.totalValueCents ?? 0,
        },
        deterministicMatches: { count: deterministic, totalValueCents: null },
        highConfidenceSuggestions: { count: highConfidence, totalValueCents: null },
        ambiguous: { count: ambiguous, totalValueCents: null },
        noCandidate: { count: noCandidate, totalValueCents: null },
      },
      examples,
    };
  }

  private async refreshJobsAfterLinkage(
    companyId: string,
    previousJobId: string | null,
    newJobId: string | null,
  ): Promise<void> {
    const touched = new Set<string>();
    if (previousJobId) touched.add(previousJobId);
    if (newJobId) touched.add(newJobId);
    for (const jobId of touched) {
      await this.profitabilityService.recalculateJobProfitability(companyId, jobId, {
        includeSensitiveCosts: true,
      });
      await this.costControlService?.invalidateFinancialReviewIfStale(companyId, jobId);
    }
  }

  private async loadCompanyJobs(companyId: string) {
    const rows = await this.db.query.jobs.findMany({
      where: eq(jobs.companyId, companyId),
      columns: {
        id: true,
        jobNumber: true,
        customerId: true,
        propertyId: true,
        title: true,
        status: true,
        snapshotFormattedAddress: true,
        snapshotSuburb: true,
        scheduledAt: true,
        updatedAt: true,
      },
      limit: 5000,
    });
    return rows.map((row) => ({
      id: row.id,
      jobNumber: row.jobNumber,
      customerId: row.customerId,
      propertyId: row.propertyId,
      title: row.title,
      status: row.status,
      snapshotFormattedAddress: row.snapshotFormattedAddress,
      snapshotSuburb: row.snapshotSuburb,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  private async loadCandidateJobs(companyId: string, customerId: string) {
    const rows = await this.db.query.jobs.findMany({
      where: and(eq(jobs.companyId, companyId), eq(jobs.customerId, customerId)),
      columns: {
        id: true,
        jobNumber: true,
        customerId: true,
        propertyId: true,
        title: true,
        status: true,
        snapshotFormattedAddress: true,
        snapshotSuburb: true,
        scheduledAt: true,
        updatedAt: true,
      },
      orderBy: [desc(jobs.updatedAt)],
      limit: 200,
    });
    return rows.map((row) => ({
      id: row.id,
      jobNumber: row.jobNumber,
      customerId: row.customerId,
      propertyId: row.propertyId,
      title: row.title,
      status: row.status,
      snapshotFormattedAddress: row.snapshotFormattedAddress,
      snapshotSuburb: row.snapshotSuburb,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  private async loadInvoiceDocuments(companyId: string, filters: JobLinkageControlFilters) {
    const conditions = [eq(invoices.companyId, companyId), isNull(invoices.jobId)];
    if (filters.customerId) conditions.push(eq(invoices.customerId, filters.customerId));
    if (filters.fromDate) conditions.push(gte(invoices.issuedAt, new Date(filters.fromDate)));
    if (filters.toDate) conditions.push(lte(invoices.issuedAt, new Date(filters.toDate)));
    if (filters.reference) {
      conditions.push(
        or(
          sql`${invoices.xeroReference} ILIKE ${`%${filters.reference}%`}`,
          sql`${invoices.invoiceNumber} ILIKE ${`%${filters.reference}%`}`,
        )!,
      );
    }

    return this.db.query.invoices.findMany({
      where: and(...conditions),
      with: { customer: true, quote: true },
      orderBy: [desc(invoices.issuedAt), desc(invoices.updatedAt)],
      limit: 500,
    });
  }

  private async loadQuoteDocuments(companyId: string, filters: JobLinkageControlFilters) {
    const conditions = [eq(quotes.companyId, companyId), isNull(quotes.jobId)];
    if (filters.customerId) conditions.push(eq(quotes.customerId, filters.customerId));
    if (filters.fromDate) conditions.push(gte(quotes.issuedAt, new Date(filters.fromDate)));
    if (filters.toDate) conditions.push(lte(quotes.issuedAt, new Date(filters.toDate)));
    if (filters.reference) {
      conditions.push(sql`${quotes.quoteNumber} ILIKE ${`%${filters.reference}%`}`);
    }

    return this.db.query.quotes.findMany({
      where: and(...conditions),
      with: { customer: true },
      orderBy: [desc(quotes.issuedAt), desc(quotes.updatedAt)],
      limit: 500,
    });
  }

  private async loadRejections(companyId: string): Promise<Map<string, string[]>> {
    try {
      const rows = await this.db.query.jobFinancialLinkageRejections.findMany({
        where: eq(jobFinancialLinkageRejections.companyId, companyId),
      });
      const map = new Map<string, string[]>();
      for (const row of rows) {
        const key = `${row.entityType}:${row.entityId}`;
        const existing = map.get(key) ?? [];
        existing.push(row.rejectedJobId);
        map.set(key, existing);
      }
      return map;
    } catch {
      return new Map();
    }
  }

  private async loadRejectionsForEntity(
    companyId: string,
    entityType: 'invoice' | 'quote',
    entityId: string,
  ): Promise<string[]> {
    try {
      const rows = await this.db.query.jobFinancialLinkageRejections.findMany({
        where: and(
          eq(jobFinancialLinkageRejections.companyId, companyId),
          eq(jobFinancialLinkageRejections.entityType, entityType),
          eq(jobFinancialLinkageRejections.entityId, entityId),
        ),
      });
      return rows.map((row) => row.rejectedJobId);
    } catch {
      return [];
    }
  }

  private async loadRecentLinkageAudits(companyId: string) {
    try {
      return await this.db.query.jobFinancialLinkageAudits.findMany({
        where: and(
          eq(jobFinancialLinkageAudits.companyId, companyId),
          sql`${jobFinancialLinkageAudits.newJobId} IS NOT NULL`,
        ),
        orderBy: [desc(jobFinancialLinkageAudits.createdAt)],
        limit: 20,
      });
    } catch {
      return [];
    }
  }

  private async findDuplicateExternalInvoiceIds(companyId: string): Promise<string[]> {
    const rows = await this.db
      .select({
        sourceExternalId: invoices.sourceExternalId,
        count: sql<number>`count(*)::int`,
      })
      .from(invoices)
      .where(
        and(eq(invoices.companyId, companyId), sql`${invoices.sourceExternalId} IS NOT NULL`),
      )
      .groupBy(invoices.sourceExternalId)
      .having(sql`count(*) > 1`);
    return rows.map((row) => row.sourceExternalId!).filter(Boolean);
  }

  private toInvoiceDocument(row: Awaited<ReturnType<typeof this.requireInvoice>>): LinkageInvoiceDocument {
    return {
      entityType: 'invoice',
      id: row.id,
      companyId: row.companyId,
      customerId: row.customerId,
      jobId: row.jobId,
      quoteId: row.quoteId,
      invoiceNumber: row.invoiceNumber,
      xeroReference: row.xeroReference,
      totalCents: row.totalCents,
      siteAddress: row.siteAddress,
      issuedAt: row.issuedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
      sourceProvider: row.sourceProvider,
      sourceExternalId: row.sourceExternalId,
      status: row.status,
    };
  }

  private toQuoteDocument(row: Awaited<ReturnType<typeof this.requireQuote>>): LinkageQuoteDocument {
    return {
      entityType: 'quote',
      id: row.id,
      companyId: row.companyId,
      customerId: row.customerId,
      jobId: row.jobId,
      quoteNumber: row.quoteNumber,
      totalCents: row.totalCents,
      siteAddress: row.siteAddress,
      issuedAt: row.issuedAt?.toISOString() ?? null,
      acceptedAt: row.acceptedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
      status: row.status,
    };
  }

  private buildInvoiceQueueItem(
    row: Awaited<ReturnType<typeof this.loadInvoiceDocuments>>[number],
    jobs: Awaited<ReturnType<typeof this.loadCompanyJobs>>,
    rejections: Map<string, string[]>,
    duplicateExternalIds: string[],
  ): JobLinkageQueueItem {
    const document = this.toInvoiceDocument(row);
    const customerJobs = jobs.filter((job) => job.customerId === row.customerId);
    const rejectedJobIds = rejections.get(`invoice:${row.id}`) ?? [];
    const candidates = scoreLinkageCandidates({
      document,
      jobs: customerJobs,
      linkedQuote: row.quote
        ? {
            quoteId: row.quote.id,
            quoteJobId: row.quote.jobId,
            quoteTotalCents: row.quote.totalCents,
            quoteStatus: row.quote.status,
          }
        : null,
      rejectedJobIds,
    });
    const conflicts = detectInvoiceLinkageConflicts(
      document,
      row.quote
        ? {
            quoteId: row.quote.id,
            quoteJobId: row.quote.jobId,
            quoteTotalCents: row.quote.totalCents,
            quoteStatus: row.quote.status,
          }
        : null,
      row.sourceExternalId && duplicateExternalIds.includes(row.sourceExternalId)
        ? [row.sourceExternalId]
        : [],
    );
    return buildLinkageQueueItem(
      document,
      candidates,
      conflicts,
      rejectedJobIds,
      row.customer?.name ?? null,
      row.currency,
      null,
    );
  }

  private buildQuoteQueueItem(
    row: Awaited<ReturnType<typeof this.loadQuoteDocuments>>[number],
    jobs: Awaited<ReturnType<typeof this.loadCompanyJobs>>,
    rejections: Map<string, string[]>,
  ): JobLinkageQueueItem {
    const document = this.toQuoteDocument(row);
    const customerJobs = jobs.filter((job) => job.customerId === row.customerId);
    const rejectedJobIds = rejections.get(`quote:${row.id}`) ?? [];
    const candidates = scoreLinkageCandidates({
      document,
      jobs: customerJobs,
      rejectedJobIds,
    });
    return buildLinkageQueueItem(
      document,
      candidates,
      [],
      rejectedJobIds,
      row.customer?.name ?? null,
      row.currency,
      null,
    );
  }

  private async buildRecentlyLinkedItems(
    companyId: string,
    audits: Array<{
      entityType: 'invoice' | 'quote';
      entityId: string;
      newJobId: string | null;
      createdAt: Date;
      confidence: string | null;
    }>,
  ): Promise<JobLinkageQueueItem[]> {
    const items: JobLinkageQueueItem[] = [];
    for (const audit of audits.slice(0, 10)) {
      if (!audit.newJobId) continue;
      if (audit.entityType === 'invoice') {
        const row = await this.db.query.invoices.findFirst({
          where: and(eq(invoices.companyId, companyId), eq(invoices.id, audit.entityId)),
          with: { customer: true, job: true },
        });
        if (!row?.jobId) continue;
        items.push({
          entityType: 'invoice',
          entityId: row.id,
          documentNumber: row.invoiceNumber,
          customerId: row.customerId,
          customerName: row.customer?.name ?? null,
          amountCents: row.totalCents,
          currency: row.currency,
          documentDate: row.issuedAt?.toISOString() ?? null,
          reference: row.xeroReference ?? row.invoiceNumber,
          linkageState: 'linked',
          currentJobId: row.jobId,
          currentJobNumber: row.job?.jobNumber ?? null,
          topCandidate: null,
          candidateCount: 0,
          conflicts: [],
          entityFingerprint: buildLinkageEntityFingerprint(this.toInvoiceDocument(row), 'invoice'),
        });
      }
    }
    return items;
  }

  private async requireInvoice(companyId: string, invoiceId: string) {
    const row = await this.db.query.invoices.findFirst({
      where: and(eq(invoices.companyId, companyId), eq(invoices.id, invoiceId)),
      with: { customer: true, quote: true },
    });
    if (!row) throw new JobLinkageControlError('NOT_FOUND', 'Invoice not found');
    return row;
  }

  private async requireQuote(companyId: string, quoteId: string) {
    const row = await this.db.query.quotes.findFirst({
      where: and(eq(quotes.companyId, companyId), eq(quotes.id, quoteId)),
      with: { customer: true },
    });
    if (!row) throw new JobLinkageControlError('NOT_FOUND', 'Quote not found');
    return row;
  }

  private async requireJob(companyId: string, jobId: string) {
    const row = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.companyId, companyId), eq(jobs.id, jobId)),
    });
    if (!row) throw new JobLinkageControlError('NOT_FOUND', 'Job not found');
    return row;
  }
}
