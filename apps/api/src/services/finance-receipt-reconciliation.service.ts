/**
 * BANK-002 — Receipt reconciliation service.
 */
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import {
  bankTransactionAllocations,
  bankTransactions,
  documents,
  financeReceiptAuditLogs,
  financeReceiptRecords,
  financeReceiptTransactionLinks,
  jobDirectCostEntries,
  mobileJobDocumentation,
  supplierAliases,
  suppliers,
} from '@titan/db';
import type {
  FinanceReceiptRecordSummary,
  ReceiptLinkMethod,
  ReceiptReconciliationControlQueue,
  ReceiptTransactionMatchCandidate,
  SupplierSuggestion,
} from '@titan/shared';
import {
  buildReceiptMatchFingerprint,
  buildReceiptReconciliationDailySummary,
  canAutoLinkReceiptMatch,
  canManageReceiptReconciliation,
  canTechnicianUploadJobReceipt,
  canViewReceiptReconciliation,
  deriveBankReceiptStatus,
  detectPossibleDuplicateReceipt,
  isDeterministicReceiptTransactionMatch,
  resolveReceiptTaxFromMetadata,
  shouldEmitBankReceiptMissingFlag,
  suggestReceiptTransactionMatches,
  suggestSupplierWithAliases,
  sumActiveReceiptLinks,
  normaliseSupplierAlias,
} from '@titan/shared';
import type { JobCostControlService } from './job-cost-control.service.js';
import type { JobProfitabilityService } from './job-profitability.service.js';

export class FinanceReceiptReconciliationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FinanceReceiptReconciliationError';
  }
}

export type ReceiptReconciliationActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

export type CreateReceiptInput = {
  documentId?: string | null;
  evidenceSource?: 'document' | 'mobile_job_documentation';
  evidenceSourceId?: string | null;
  supplierId?: string | null;
  receiptNumber?: string | null;
  documentDate?: string | null;
  totalAmountCents?: number | null;
  vatAmountCents?: number | null;
  taxRateBps?: number | null;
  exclusiveTotalCents?: number | null;
  currency?: string;
  jobId?: string | null;
  directCostId?: string | null;
  notes?: string | null;
  fileChecksumSha256?: string | null;
  /** When receipt is created from a known bank transaction — deterministic link allowed. */
  createdFromBankTransactionId?: string | null;
};

export class FinanceReceiptReconciliationService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly profitabilityService?: JobProfitabilityService,
    private readonly costControlService?: JobCostControlService,
  ) {}

  private assertView(actor: ReceiptReconciliationActor): void {
    if (!canViewReceiptReconciliation(actor)) {
      throw new FinanceReceiptReconciliationError(
        'FORBIDDEN',
        'Receipt reconciliation requires finance access.',
      );
    }
  }

  private assertManage(actor: ReceiptReconciliationActor): void {
    this.assertView(actor);
    if (!canManageReceiptReconciliation(actor)) {
      throw new FinanceReceiptReconciliationError(
        'FORBIDDEN',
        'Receipt reconciliation management requires finance:write.',
      );
    }
  }

  private async audit(
    companyId: string,
    actorUserId: string,
    action: string,
    metadata: Record<string, unknown>,
    receiptRecordId?: string | null,
    bankTransactionId?: string | null,
  ): Promise<void> {
    await this.db.insert(financeReceiptAuditLogs).values({
      companyId,
      receiptRecordId: receiptRecordId ?? null,
      bankTransactionId: bankTransactionId ?? null,
      action,
      actorUserId,
      metadata,
    });
  }

  private async loadSupplierNames(companyId: string): Promise<Map<string, string>> {
    const rows = await this.db.query.suppliers.findMany({
      where: eq(suppliers.companyId, companyId),
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  private mapReceiptSummary(
    row: typeof financeReceiptRecords.$inferSelect,
    supplierNames: Map<string, string>,
    bankTransactionIds: string[],
    linkedReceiptTotalCents: number,
  ): FinanceReceiptRecordSummary {
    return {
      id: row.id,
      documentId: row.documentId,
      evidenceSource: row.evidenceSource as FinanceReceiptRecordSummary['evidenceSource'],
      evidenceSourceId: row.evidenceSourceId,
      supplierId: row.supplierId,
      supplierName: row.supplierId ? supplierNames.get(row.supplierId) ?? null : null,
      receiptNumber: row.receiptNumber,
      documentDate: row.documentDate,
      totalAmountCents: row.totalAmountCents,
      vatAmountCents: row.vatAmountCents,
      currency: row.currency,
      matchStatus: row.matchStatus as FinanceReceiptRecordSummary['matchStatus'],
      verificationStatus: row.verificationStatus as FinanceReceiptRecordSummary['verificationStatus'],
      duplicateFlag: row.duplicateFlag as FinanceReceiptRecordSummary['duplicateFlag'],
      jobId: row.jobId,
      directCostId: row.directCostId,
      bankTransactionIds,
      linkedReceiptTotalCents,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async getControlQueue(actor: ReceiptReconciliationActor): Promise<ReceiptReconciliationControlQueue> {
    this.assertView(actor);

    const today = new Date().toISOString().slice(0, 10);
    const supplierNames = await this.loadSupplierNames(actor.companyId);

    const transactions = await this.db.query.bankTransactions.findMany({
      where: eq(bankTransactions.companyId, actor.companyId),
      orderBy: [desc(bankTransactions.transactionDate)],
      limit: 500,
    });

    const receiptLinks = await this.db.query.financeReceiptTransactionLinks.findMany({
      where: and(
        eq(financeReceiptTransactionLinks.companyId, actor.companyId),
        eq(financeReceiptTransactionLinks.isActive, true),
      ),
    });

    const linksByTx = new Map<string, typeof receiptLinks>();
    for (const link of receiptLinks) {
      if (!link.bankTransactionId) continue;
      const list = linksByTx.get(link.bankTransactionId) ?? [];
      list.push(link);
      linksByTx.set(link.bankTransactionId, list);
    }

    const missingReceipts = transactions
      .filter((tx) => shouldEmitBankReceiptMissingFlag(tx.receiptStatus))
      .map((tx) => ({
        bankTransactionId: tx.id,
        transactionDate: tx.transactionDate,
        description: tx.description,
        amountCents: tx.amountCents,
        receiptStatus: tx.receiptStatus,
        suggestedSupplierName: tx.suggestedSupplierId
          ? supplierNames.get(tx.suggestedSupplierId) ?? null
          : null,
        jobId: null as string | null,
        flag: 'BANK_RECEIPT_MISSING' as const,
      }));

    const supplierUnknown = transactions
      .filter((tx) => tx.direction === 'debit' && !tx.confirmedSupplierId)
      .slice(0, 50)
      .map((tx) => ({
        bankTransactionId: tx.id,
        transactionDate: tx.transactionDate,
        description: tx.description,
        amountCents: tx.amountCents,
        suggestedSupplier: null as SupplierSuggestion | null,
      }));

    const aliasRows = await this.db.query.supplierAliases.findMany({
      where: eq(supplierAliases.companyId, actor.companyId),
    });
    const supplierList = [...supplierNames.entries()].map(([id, name]) => ({ id, name }));

    for (const item of supplierUnknown) {
      const tx = transactions.find((row) => row.id === item.bankTransactionId);
      if (!tx) continue;
      item.suggestedSupplier = suggestSupplierWithAliases({
        description: tx.description,
        reference: tx.reference,
        merchantName: tx.merchantName,
        suppliers: supplierList,
        aliases: aliasRows.map((row) => ({
          supplierId: row.supplierId,
          aliasText: row.aliasText,
          normalisedAlias: row.normalisedAlias,
          isEnabled: row.isEnabled,
        })),
      });
    }

    const receipts = await this.db.query.financeReceiptRecords.findMany({
      where: eq(financeReceiptRecords.companyId, actor.companyId),
      orderBy: [desc(financeReceiptRecords.createdAt)],
      limit: 500,
    });

    const linksByReceipt = new Map<string, typeof receiptLinks>();
    for (const link of receiptLinks) {
      const list = linksByReceipt.get(link.receiptRecordId) ?? [];
      list.push(link);
      linksByReceipt.set(link.receiptRecordId, list);
    }

    const receiptSummaries = receipts.map((row) => {
      const links = linksByReceipt.get(row.id) ?? [];
      return this.mapReceiptSummary(
        row,
        supplierNames,
        links.map((l) => l.bankTransactionId).filter(Boolean) as string[],
        sumActiveReceiptLinks(links),
      );
    });

    const unmatchedReceipts = receiptSummaries.filter(
      (row) => row.matchStatus === 'awaiting_transaction_match',
    );

    const verificationRequired = receiptSummaries.filter(
      (row) => row.verificationStatus === 'needs_review' || row.matchStatus === 'needs_review',
    );

    const receiptMatchSuggestions: ReceiptReconciliationControlQueue['receiptMatchSuggestions'] = [];
    for (const receipt of receipts.filter((row) => row.matchStatus === 'awaiting_transaction_match')) {
      const candidates = suggestReceiptTransactionMatches({
        receipt: {
          id: receipt.id,
          totalAmountCents: receipt.totalAmountCents,
          documentDate: receipt.documentDate,
          supplierId: receipt.supplierId,
          receiptNumber: receipt.receiptNumber,
          updatedAt: receipt.updatedAt.toISOString(),
        },
        transactions: transactions.map((tx) => ({
          id: tx.id,
          transactionDate: tx.transactionDate,
          amountCents: tx.amountCents,
          direction: tx.direction,
          description: tx.description,
          reference: tx.reference,
          merchantName: tx.merchantName,
          confirmedSupplierId: tx.confirmedSupplierId,
          allocatedAmountCents: tx.allocatedAmountCents,
          receiptStatus: tx.receiptStatus,
          updatedAt: tx.updatedAt.toISOString(),
          hasActiveReceiptLink: (linksByTx.get(tx.id)?.length ?? 0) > 0,
        })),
      });
      if (candidates.length > 0) {
        receiptMatchSuggestions.push({
          receiptId: receipt.id,
          receiptTotalCents: receipt.totalAmountCents,
          candidates: candidates.slice(0, 5),
        });
      }
    }

    const daily = buildReceiptReconciliationDailySummary({
      date: today,
      transactions: transactions.map((tx) => ({
        direction: tx.direction,
        transactionDate: tx.transactionDate,
        receiptStatus: tx.receiptStatus,
        amountCents: tx.amountCents,
        confirmedSupplierId: tx.confirmedSupplierId,
        reconciliationStatus: tx.reconciliationStatus,
      })),
      unmatchedReceipts,
    });

    return {
      summary: {
        ...daily,
        verificationRequiredCount: verificationRequired.length,
        receiptMatchSuggestionsCount: receiptMatchSuggestions.length,
        unmatchedReceiptsCount: unmatchedReceipts.length,
      },
      missingReceipts,
      unmatchedReceipts,
      receiptMatchSuggestions,
      supplierUnknown,
      verificationRequired,
    };
  }

  async getReceipt(actor: ReceiptReconciliationActor, receiptId: string): Promise<FinanceReceiptRecordSummary> {
    this.assertView(actor);

    const row = await this.db.query.financeReceiptRecords.findFirst({
      where: and(
        eq(financeReceiptRecords.id, receiptId),
        eq(financeReceiptRecords.companyId, actor.companyId),
      ),
    });
    if (!row) {
      throw new FinanceReceiptReconciliationError('NOT_FOUND', 'Receipt not found.');
    }

    const links = await this.db.query.financeReceiptTransactionLinks.findMany({
      where: and(
        eq(financeReceiptTransactionLinks.receiptRecordId, receiptId),
        eq(financeReceiptTransactionLinks.isActive, true),
      ),
    });

    const supplierNames = await this.loadSupplierNames(actor.companyId);
    return this.mapReceiptSummary(
      row,
      supplierNames,
      links.map((l) => l.bankTransactionId).filter(Boolean) as string[],
      sumActiveReceiptLinks(links),
    );
  }

  async createReceipt(
    actor: ReceiptReconciliationActor,
    input: CreateReceiptInput,
  ): Promise<FinanceReceiptRecordSummary> {
    const isTechnicianJobUpload =
      actor.roleName === 'Technician' &&
      Boolean(input.jobId) &&
      input.evidenceSource === 'mobile_job_documentation';

    if (isTechnicianJobUpload) {
      if (!canTechnicianUploadJobReceipt(actor)) {
        throw new FinanceReceiptReconciliationError('FORBIDDEN', 'Technician receipt upload not permitted.');
      }
    } else {
      this.assertManage(actor);
    }

    if (input.documentId) {
      const doc = await this.db.query.documents.findFirst({
        where: and(eq(documents.id, input.documentId), eq(documents.companyId, actor.companyId)),
      });
      if (!doc) {
        throw new FinanceReceiptReconciliationError('NOT_FOUND', 'Document not found.');
      }
    }

    if (input.evidenceSource === 'mobile_job_documentation' && input.evidenceSourceId) {
      const mobileDoc = await this.db.query.mobileJobDocumentation.findFirst({
        where: and(
          eq(mobileJobDocumentation.id, input.evidenceSourceId),
          eq(mobileJobDocumentation.companyId, actor.companyId),
        ),
      });
      if (!mobileDoc) {
        throw new FinanceReceiptReconciliationError('NOT_FOUND', 'Mobile documentation not found.');
      }
    }

    const existing = await this.db.query.financeReceiptRecords.findMany({
      where: eq(financeReceiptRecords.companyId, actor.companyId),
      limit: 1000,
    });

    const duplicate = detectPossibleDuplicateReceipt({
      fileChecksumSha256: input.fileChecksumSha256,
      receiptNumber: input.receiptNumber,
      supplierId: input.supplierId,
      documentDate: input.documentDate,
      totalAmountCents: input.totalAmountCents,
      existing,
    });

    const [created] = await this.db
      .insert(financeReceiptRecords)
      .values({
        companyId: actor.companyId,
        documentId: input.documentId ?? null,
        evidenceSource: input.evidenceSource ?? 'document',
        evidenceSourceId: input.evidenceSourceId ?? null,
        supplierId: input.supplierId ?? null,
        receiptNumber: input.receiptNumber ?? null,
        documentDate: input.documentDate ?? null,
        totalAmountCents: input.totalAmountCents ?? null,
        vatAmountCents: input.vatAmountCents ?? null,
        taxRateBps: input.taxRateBps ?? null,
        exclusiveTotalCents: input.exclusiveTotalCents ?? null,
        currency: input.currency ?? 'ZAR',
        matchStatus: input.createdFromBankTransactionId ? 'linked' : 'awaiting_transaction_match',
        jobId: input.jobId ?? null,
        directCostId: input.directCostId ?? null,
        notes: input.notes ?? null,
        fileChecksumSha256: input.fileChecksumSha256 ?? null,
        duplicateFlag: duplicate?.duplicateFlag ?? null,
        createdByUserId: actor.userId,
      })
      .returning();

    await this.audit(actor.companyId, actor.userId, 'receipt_created', {
      receiptId: created!.id,
      duplicateOf: duplicate?.matchingReceiptId ?? null,
    }, created!.id);

    if (input.createdFromBankTransactionId) {
      await this.linkReceiptToTransaction(actor, created!.id, {
        bankTransactionId: input.createdFromBankTransactionId,
        linkMethod: 'deterministic',
        amountCents: input.totalAmountCents ?? null,
      });
    }

    return this.getReceipt(actor, created!.id);
  }

  async attachReceiptToTransaction(
    actor: ReceiptReconciliationActor,
    bankTransactionId: string,
    input: {
      documentId?: string;
      receiptRecordId?: string;
      amountCents?: number | null;
      linkMethod?: ReceiptLinkMethod;
      notes?: string | null;
      metadata?: CreateReceiptInput;
    },
  ): Promise<{ receipt: FinanceReceiptRecordSummary; bankTransactionId: string }> {
    this.assertManage(actor);

    let receiptId = input.receiptRecordId;

    if (!receiptId && input.documentId) {
      const receipt = await this.createReceipt(actor, {
        documentId: input.documentId,
        createdFromBankTransactionId: bankTransactionId,
        ...input.metadata,
      });
      return { receipt, bankTransactionId };
    }

    if (!receiptId) {
      throw new FinanceReceiptReconciliationError(
        'VALIDATION_ERROR',
        'documentId or receiptRecordId required.',
      );
    }

    await this.linkReceiptToTransaction(actor, receiptId, {
      bankTransactionId,
      linkMethod: input.linkMethod ?? 'manual',
      amountCents: input.amountCents ?? null,
      notes: input.notes ?? null,
    });

    const receipt = await this.getReceipt(actor, receiptId);
    return { receipt, bankTransactionId };
  }

  private async linkReceiptToTransaction(
    actor: ReceiptReconciliationActor,
    receiptId: string,
    input: {
      bankTransactionId: string;
      linkMethod: ReceiptLinkMethod;
      amountCents?: number | null;
      notes?: string | null;
    },
  ): Promise<void> {
    const receipt = await this.db.query.financeReceiptRecords.findFirst({
      where: and(
        eq(financeReceiptRecords.id, receiptId),
        eq(financeReceiptRecords.companyId, actor.companyId),
      ),
    });
    if (!receipt) {
      throw new FinanceReceiptReconciliationError('NOT_FOUND', 'Receipt not found.');
    }

    const tx = await this.db.query.bankTransactions.findFirst({
      where: and(
        eq(bankTransactions.id, input.bankTransactionId),
        eq(bankTransactions.companyId, actor.companyId),
      ),
    });
    if (!tx) {
      throw new FinanceReceiptReconciliationError('NOT_FOUND', 'Bank transaction not found.');
    }

    const deterministic = isDeterministicReceiptTransactionMatch({
      createdFromBankTransactionId: input.linkMethod === 'deterministic' ? input.bankTransactionId : null,
      targetBankTransactionId: input.bankTransactionId,
    });

    if (!canAutoLinkReceiptMatch({ linkMethod: input.linkMethod, deterministic }) && input.linkMethod !== 'manual' && input.linkMethod !== 'owner_approved_match') {
      throw new FinanceReceiptReconciliationError(
        'FORBIDDEN',
        'Only deterministic or owner-approved matches may auto-link.',
      );
    }

    const existingLink = await this.db.query.financeReceiptTransactionLinks.findFirst({
      where: and(
        eq(financeReceiptTransactionLinks.receiptRecordId, receiptId),
        eq(financeReceiptTransactionLinks.bankTransactionId, input.bankTransactionId),
        eq(financeReceiptTransactionLinks.isActive, true),
      ),
    });
    if (existingLink) {
      throw new FinanceReceiptReconciliationError('CONFLICT', 'Receipt already linked to this transaction.');
    }

    await this.db.insert(financeReceiptTransactionLinks).values({
      companyId: actor.companyId,
      receiptRecordId: receiptId,
      bankTransactionId: input.bankTransactionId,
      amountCents: input.amountCents ?? receipt.totalAmountCents,
      linkMethod: input.linkMethod,
      linkedByUserId: actor.userId,
      notes: input.notes ?? null,
    });

    await this.syncBankTransactionReceiptState(actor.companyId, input.bankTransactionId);
    await this.syncDirectCostReceiptFromLinks(actor.companyId, receiptId);

    await this.db
      .update(financeReceiptRecords)
      .set({
        matchStatus: 'linked',
        linkMethod: input.linkMethod,
        linkedByUserId: actor.userId,
        linkedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(financeReceiptRecords.id, receiptId));

    await this.audit(
      actor.companyId,
      actor.userId,
      'receipt_linked',
      { receiptId, bankTransactionId: input.bankTransactionId, linkMethod: input.linkMethod },
      receiptId,
      input.bankTransactionId,
    );
  }

  async unlinkReceiptFromTransaction(
    actor: ReceiptReconciliationActor,
    bankTransactionId: string,
    receiptId: string,
  ): Promise<void> {
    this.assertManage(actor);

    await this.db
      .update(financeReceiptTransactionLinks)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(financeReceiptTransactionLinks.companyId, actor.companyId),
          eq(financeReceiptTransactionLinks.bankTransactionId, bankTransactionId),
          eq(financeReceiptTransactionLinks.receiptRecordId, receiptId),
          eq(financeReceiptTransactionLinks.isActive, true),
        ),
      );

    await this.syncBankTransactionReceiptState(actor.companyId, bankTransactionId);

    const remainingLinks = await this.db.query.financeReceiptTransactionLinks.findMany({
      where: and(
        eq(financeReceiptTransactionLinks.receiptRecordId, receiptId),
        eq(financeReceiptTransactionLinks.isActive, true),
        sql`${financeReceiptTransactionLinks.bankTransactionId} IS NOT NULL`,
      ),
    });

    if (remainingLinks.length === 0) {
      await this.db
        .update(financeReceiptRecords)
        .set({
          matchStatus: 'awaiting_transaction_match',
          verificationStatus: 'not_verified',
          updatedAt: new Date(),
        })
        .where(eq(financeReceiptRecords.id, receiptId));
    }

    await this.audit(
      actor.companyId,
      actor.userId,
      'receipt_unlinked',
      { receiptId, bankTransactionId },
      receiptId,
      bankTransactionId,
    );
  }

  async approveReceiptMatch(
    actor: ReceiptReconciliationActor,
    receiptId: string,
    input: {
      bankTransactionId: string;
      sourceFingerprint: string;
      amountCents?: number | null;
    },
  ): Promise<FinanceReceiptRecordSummary> {
    this.assertManage(actor);

    const receipt = await this.db.query.financeReceiptRecords.findFirst({
      where: and(
        eq(financeReceiptRecords.id, receiptId),
        eq(financeReceiptRecords.companyId, actor.companyId),
      ),
    });
    if (!receipt) {
      throw new FinanceReceiptReconciliationError('NOT_FOUND', 'Receipt not found.');
    }

    const tx = await this.db.query.bankTransactions.findFirst({
      where: and(
        eq(bankTransactions.id, input.bankTransactionId),
        eq(bankTransactions.companyId, actor.companyId),
      ),
    });
    if (!tx) {
      throw new FinanceReceiptReconciliationError('NOT_FOUND', 'Bank transaction not found.');
    }

    const currentFingerprint = buildReceiptMatchFingerprint({
      receiptId: receipt.id,
      bankTransactionId: tx.id,
      receiptUpdatedAt: receipt.updatedAt.toISOString(),
      transactionUpdatedAt: tx.updatedAt.toISOString(),
      transactionAllocatedAmountCents: tx.allocatedAmountCents,
      transactionReceiptStatus: tx.receiptStatus,
    });

    if (currentFingerprint !== input.sourceFingerprint) {
      throw new FinanceReceiptReconciliationError(
        'STALE_MATCH',
        'Match candidate is stale — revalidate before approving.',
      );
    }

    await this.linkReceiptToTransaction(actor, receiptId, {
      bankTransactionId: input.bankTransactionId,
      linkMethod: 'owner_approved_match',
      amountCents: input.amountCents ?? receipt.totalAmountCents,
    });

    return this.getReceipt(actor, receiptId);
  }

  async verifyReceipt(
    actor: ReceiptReconciliationActor,
    receiptId: string,
    input?: { notes?: string | null },
  ): Promise<FinanceReceiptRecordSummary> {
    this.assertManage(actor);

    const receipt = await this.db.query.financeReceiptRecords.findFirst({
      where: and(
        eq(financeReceiptRecords.id, receiptId),
        eq(financeReceiptRecords.companyId, actor.companyId),
      ),
    });
    if (!receipt) {
      throw new FinanceReceiptReconciliationError('NOT_FOUND', 'Receipt not found.');
    }

    const links = await this.db.query.financeReceiptTransactionLinks.findMany({
      where: and(
        eq(financeReceiptTransactionLinks.receiptRecordId, receiptId),
        eq(financeReceiptTransactionLinks.isActive, true),
      ),
    });

    let verificationStatus: 'verified' | 'needs_review' = 'verified';
    for (const link of links) {
      if (!link.bankTransactionId) continue;
      const tx = await this.db.query.bankTransactions.findFirst({
        where: eq(bankTransactions.id, link.bankTransactionId),
      });
      if (!tx) continue;
      const receiptTotal = receipt.totalAmountCents ?? 0;
      const linkAmount = link.amountCents ?? receiptTotal;
      if (receiptTotal > 0 && linkAmount > 0 && linkAmount !== tx.amountCents) {
        const allLinksTotal = sumActiveReceiptLinks(links);
        if (allLinksTotal !== tx.amountCents) {
          verificationStatus = 'needs_review';
        }
      }
    }

    await this.db
      .update(financeReceiptRecords)
      .set({
        verificationStatus,
        matchStatus: verificationStatus === 'verified' ? 'verified' : 'needs_review',
        verifiedByUserId: actor.userId,
        verifiedAt: new Date(),
        notes: input?.notes ?? receipt.notes,
        updatedAt: new Date(),
      })
      .where(eq(financeReceiptRecords.id, receiptId));

    for (const link of links) {
      if (link.bankTransactionId) {
        await this.syncBankTransactionReceiptState(actor.companyId, link.bankTransactionId);
      }
    }

    if (receipt.directCostId && receipt.totalAmountCents != null) {
      await this.applyReceiptTaxToDirectCost(actor.companyId, receipt);
    }

    await this.audit(actor.companyId, actor.userId, 'receipt_verified', {
      receiptId,
      verificationStatus,
    }, receiptId);

    if (receipt.jobId) {
      await this.refreshJobFinancials(actor.companyId, receipt.jobId);
    }

    return this.getReceipt(actor, receiptId);
  }

  async assignSupplierToReceipt(
    actor: ReceiptReconciliationActor,
    receiptId: string,
    supplierId: string,
  ): Promise<FinanceReceiptRecordSummary> {
    this.assertManage(actor);

    const supplier = await this.db.query.suppliers.findFirst({
      where: and(eq(suppliers.id, supplierId), eq(suppliers.companyId, actor.companyId)),
    });
    if (!supplier) {
      throw new FinanceReceiptReconciliationError('NOT_FOUND', 'Supplier not found.');
    }

    await this.db
      .update(financeReceiptRecords)
      .set({ supplierId, updatedAt: new Date() })
      .where(
        and(
          eq(financeReceiptRecords.id, receiptId),
          eq(financeReceiptRecords.companyId, actor.companyId),
        ),
      );

    await this.audit(actor.companyId, actor.userId, 'receipt_supplier_assigned', {
      receiptId,
      supplierId,
    }, receiptId);

    return this.getReceipt(actor, receiptId);
  }

  async confirmSupplierForTransaction(
    actor: ReceiptReconciliationActor,
    bankTransactionId: string,
    supplierId: string,
  ): Promise<void> {
    this.assertManage(actor);

    const supplier = await this.db.query.suppliers.findFirst({
      where: and(eq(suppliers.id, supplierId), eq(suppliers.companyId, actor.companyId)),
    });
    if (!supplier) {
      throw new FinanceReceiptReconciliationError('NOT_FOUND', 'Supplier not found.');
    }

    await this.db
      .update(bankTransactions)
      .set({ confirmedSupplierId: supplierId, updatedAt: new Date() })
      .where(
        and(
          eq(bankTransactions.id, bankTransactionId),
          eq(bankTransactions.companyId, actor.companyId),
        ),
      );

    await this.audit(
      actor.companyId,
      actor.userId,
      'transaction_supplier_confirmed',
      { bankTransactionId, supplierId },
      null,
      bankTransactionId,
    );
  }

  async createSupplierAlias(
    actor: ReceiptReconciliationActor,
    supplierId: string,
    input: { aliasText: string; notes?: string | null },
  ): Promise<{ id: string; aliasText: string; normalisedAlias: string }> {
    this.assertManage(actor);

    const supplier = await this.db.query.suppliers.findFirst({
      where: and(eq(suppliers.id, supplierId), eq(suppliers.companyId, actor.companyId)),
    });
    if (!supplier) {
      throw new FinanceReceiptReconciliationError('NOT_FOUND', 'Supplier not found.');
    }

    const normalisedAlias = normaliseSupplierAlias(input.aliasText);
    if (!normalisedAlias) {
      throw new FinanceReceiptReconciliationError('VALIDATION_ERROR', 'Alias text is required.');
    }

    const [created] = await this.db
      .insert(supplierAliases)
      .values({
        companyId: actor.companyId,
        supplierId,
        aliasText: input.aliasText.trim(),
        normalisedAlias,
        approvedByUserId: actor.userId,
        notes: input.notes ?? null,
      })
      .returning();

    await this.audit(actor.companyId, actor.userId, 'supplier_alias_approved', {
      supplierId,
      aliasId: created!.id,
      aliasText: input.aliasText,
    });

    return {
      id: created!.id,
      aliasText: created!.aliasText,
      normalisedAlias: created!.normalisedAlias,
    };
  }

  async getTransactionCandidates(
    actor: ReceiptReconciliationActor,
    receiptId: string,
  ): Promise<ReceiptTransactionMatchCandidate[]> {
    this.assertView(actor);

    const receipt = await this.db.query.financeReceiptRecords.findFirst({
      where: and(
        eq(financeReceiptRecords.id, receiptId),
        eq(financeReceiptRecords.companyId, actor.companyId),
      ),
    });
    if (!receipt) {
      throw new FinanceReceiptReconciliationError('NOT_FOUND', 'Receipt not found.');
    }

    const transactions = await this.db.query.bankTransactions.findMany({
      where: and(
        eq(bankTransactions.companyId, actor.companyId),
        eq(bankTransactions.direction, 'debit'),
      ),
      orderBy: [desc(bankTransactions.transactionDate)],
      limit: 200,
    });

    const links = await this.db.query.financeReceiptTransactionLinks.findMany({
      where: and(
        eq(financeReceiptTransactionLinks.companyId, actor.companyId),
        eq(financeReceiptTransactionLinks.isActive, true),
      ),
    });
    const linksByTx = new Set(
      links.filter((l) => l.bankTransactionId).map((l) => l.bankTransactionId!),
    );

    return suggestReceiptTransactionMatches({
      receipt: {
        id: receipt.id,
        totalAmountCents: receipt.totalAmountCents,
        documentDate: receipt.documentDate,
        supplierId: receipt.supplierId,
        receiptNumber: receipt.receiptNumber,
        updatedAt: receipt.updatedAt.toISOString(),
      },
      transactions: transactions.map((tx) => ({
        id: tx.id,
        transactionDate: tx.transactionDate,
        amountCents: tx.amountCents,
        direction: tx.direction,
        description: tx.description,
        reference: tx.reference,
        merchantName: tx.merchantName,
        confirmedSupplierId: tx.confirmedSupplierId,
        allocatedAmountCents: tx.allocatedAmountCents,
        receiptStatus: tx.receiptStatus,
        updatedAt: tx.updatedAt.toISOString(),
        hasActiveReceiptLink: linksByTx.has(tx.id),
      })),
    });
  }

  private async syncBankTransactionReceiptState(
    companyId: string,
    bankTransactionId: string,
  ): Promise<void> {
    const tx = await this.db.query.bankTransactions.findFirst({
      where: and(
        eq(bankTransactions.id, bankTransactionId),
        eq(bankTransactions.companyId, companyId),
      ),
    });
    if (!tx) return;

    const links = await this.db.query.financeReceiptTransactionLinks.findMany({
      where: and(
        eq(financeReceiptTransactionLinks.bankTransactionId, bankTransactionId),
        eq(financeReceiptTransactionLinks.isActive, true),
      ),
    });

    const receipts = links.length
      ? await this.db.query.financeReceiptRecords.findMany({
          where: inArray(
            financeReceiptRecords.id,
            links.map((l) => l.receiptRecordId),
          ),
        })
      : [];

    const receiptTotal = sumActiveReceiptLinks(links);
    const verifiedCount = receipts.filter((r) => r.verificationStatus === 'verified').length;
    const needsReview = receipts.some(
      (r) => r.verificationStatus === 'needs_review' || r.matchStatus === 'needs_review',
    );

    const primaryReceipt = receipts[0];
    const receiptStatus = deriveBankReceiptStatus({
      direction: tx.direction,
      receiptDocumentId: primaryReceipt?.documentId ?? tx.receiptDocumentId,
      linkedReceiptCount: links.length,
      verifiedReceiptCount: verifiedCount,
      receiptTotalCents: receiptTotal,
      transactionAmountCents: tx.amountCents,
      verificationStatus: needsReview ? 'needs_review' : verifiedCount > 0 ? 'verified' : 'not_verified',
    });

    await this.db
      .update(bankTransactions)
      .set({
        receiptDocumentId: primaryReceipt?.documentId ?? tx.receiptDocumentId,
        receiptStatus,
        updatedAt: new Date(),
      })
      .where(eq(bankTransactions.id, bankTransactionId));
  }

  private async syncDirectCostReceiptFromLinks(
    companyId: string,
    receiptId: string,
  ): Promise<void> {
    const receipt = await this.db.query.financeReceiptRecords.findFirst({
      where: and(
        eq(financeReceiptRecords.id, receiptId),
        eq(financeReceiptRecords.companyId, companyId),
      ),
    });
    if (!receipt?.documentId) return;

    const directCostId = receipt.directCostId;
    if (directCostId) {
      await this.db
        .update(jobDirectCostEntries)
        .set({
          receiptDocumentId: receipt.documentId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(jobDirectCostEntries.id, directCostId),
            eq(jobDirectCostEntries.companyId, companyId),
          ),
        );
      return;
    }

    const links = await this.db.query.financeReceiptTransactionLinks.findMany({
      where: and(
        eq(financeReceiptTransactionLinks.receiptRecordId, receiptId),
        eq(financeReceiptTransactionLinks.isActive, true),
      ),
    });

    for (const link of links) {
      if (!link.bankTransactionId) continue;
      const allocations = await this.db.query.bankTransactionAllocations.findMany({
        where: and(
          eq(bankTransactionAllocations.transactionId, link.bankTransactionId),
          eq(bankTransactionAllocations.isActive, true),
          sql`${bankTransactionAllocations.directCostId} IS NOT NULL`,
        ),
      });
      for (const alloc of allocations) {
        if (!alloc.directCostId) continue;
        await this.db
          .update(jobDirectCostEntries)
          .set({
            receiptDocumentId: receipt.documentId,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(jobDirectCostEntries.id, alloc.directCostId),
              eq(jobDirectCostEntries.companyId, companyId),
              isNull(jobDirectCostEntries.receiptDocumentId),
            ),
          );
      }
    }
  }

  private async applyReceiptTaxToDirectCost(
    companyId: string,
    receipt: typeof financeReceiptRecords.$inferSelect,
  ): Promise<void> {
    if (!receipt.directCostId || receipt.totalAmountCents == null) return;

    const tax = resolveReceiptTaxFromMetadata({
      totalAmountCents: receipt.totalAmountCents,
      vatAmountCents: receipt.vatAmountCents,
      exclusiveTotalCents: receipt.exclusiveTotalCents,
      taxRateBps: receipt.taxRateBps,
    });

    if (tax.taxBasis === 'unknown') return;

    const noteSuffix = `[Receipt verified: ${tax.taxBasis} R${((tax.economicExVatCents ?? 0) / 100).toFixed(2)} ex-VAT]`;
    const cost = await this.db.query.jobDirectCostEntries.findFirst({
      where: eq(jobDirectCostEntries.id, receipt.directCostId),
    });
    if (!cost) return;

    const notes = cost.notes?.includes('[Receipt verified:')
      ? cost.notes
      : `${cost.notes ?? ''} ${noteSuffix}`.trim();

    await this.db
      .update(jobDirectCostEntries)
      .set({ notes, updatedAt: new Date() })
      .where(
        and(
          eq(jobDirectCostEntries.id, receipt.directCostId),
          eq(jobDirectCostEntries.companyId, companyId),
        ),
      );
  }

  private async refreshJobFinancials(companyId: string, jobId: string): Promise<void> {
    if (this.profitabilityService) {
      await this.profitabilityService.recalculateJobProfitability(companyId, jobId, {
        includeSensitiveCosts: true,
      });
    }
    if (this.costControlService) {
      await this.costControlService.invalidateFinancialReviewIfStale(companyId, jobId);
    }
  }
}
