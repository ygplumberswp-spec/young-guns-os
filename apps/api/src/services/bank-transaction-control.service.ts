import { createHash } from 'node:crypto';
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import {
  bankAccounts,
  bankStatementImportBatches,
  bankStatementImportRows,
  bankTransactionAllocations,
  bankTransactionAuditLogs,
  bankTransactions,
  documents,
  jobDirectCostEntries,
  suppliers,
} from '@titan/db';
import type {
  BankMatchCandidate,
  BankTransactionAllocationType,
  BankTransactionControlQueue,
  BankTransactionDetail,
  BankTransactionSummary,
} from '@titan/shared';
import {
  absoluteBankTransactionAmountCents,
  assertAllocationWithinTransaction,
  buildBankTransactionFingerprintCanonical,
  canManageBankTransactionControl,
  canViewBankTransactionControl,
  computeAllocationTotals,
  creditRequiresManualReview,
  deriveBankTransactionDirection,
  deriveReceiptStatus,
  allocationAffectsJobProfitability,
  suggestDirectCostMatches,
  suggestSupplierFromDescription,
} from '@titan/shared';
import type { JobCostControlService } from './job-cost-control.service.js';
import type { JobProfitabilityService } from './job-profitability.service.js';

export class BankTransactionControlError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BankTransactionControlError';
  }
}

export type BankTransactionControlActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

export type AllocateBankTransactionInput = {
  amountCents: number;
  allocationType: BankTransactionAllocationType;
  category?: string | null;
  jobId?: string | null;
  supplierId?: string | null;
  directCostId?: string | null;
  notes?: string | null;
  /** When true, create a new direct job cost instead of only linking. */
  createDirectCost?: boolean;
  directCostDescription?: string | null;
  directCostCategory?: string | null;
};

function hashFingerprint(canonical: string): string {
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export class BankTransactionControlService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly profitabilityService?: JobProfitabilityService,
    private readonly costControlService?: JobCostControlService,
  ) {}

  private assertView(actor: BankTransactionControlActor): void {
    if (!canViewBankTransactionControl(actor)) {
      throw new BankTransactionControlError('FORBIDDEN', 'Bank transaction control requires finance access.');
    }
  }

  private assertManage(actor: BankTransactionControlActor): void {
    this.assertView(actor);
    if (!canManageBankTransactionControl(actor)) {
      throw new BankTransactionControlError('FORBIDDEN', 'Bank transaction management requires finance:write.');
    }
  }

  private async audit(
    companyId: string,
    actorUserId: string,
    action: string,
    metadata: Record<string, unknown>,
    transactionId?: string | null,
    importBatchId?: string | null,
  ): Promise<void> {
    const safe = { ...metadata };
    delete safe.password;
    delete safe.otp;
    delete safe.credentials;

    await this.db.insert(bankTransactionAuditLogs).values({
      companyId,
      transactionId: transactionId ?? null,
      importBatchId: importBatchId ?? null,
      action,
      actorUserId,
      metadata: safe,
    });
  }

  async ensureBankAccount(
    companyId: string,
    bankAccountCode: string,
    bankAccountName: string,
  ): Promise<{ id: string; name: string; bankAccountCode: string | null }> {
    const existing = await this.db.query.bankAccounts.findFirst({
      where: and(
        eq(bankAccounts.companyId, companyId),
        eq(bankAccounts.bankAccountCode, bankAccountCode),
      ),
    });
    if (existing) return existing;

    const [created] = await this.db
      .insert(bankAccounts)
      .values({
        companyId,
        name: bankAccountName,
        bankAccountCode,
        provider: 'xero',
      })
      .returning();
    return created!;
  }

  async ingestFromImportBatch(
    actor: BankTransactionControlActor,
    batchId: string,
  ): Promise<{ imported: number; skipped: number }> {
    this.assertManage(actor);

    const batch = await this.db.query.bankStatementImportBatches.findFirst({
      where: and(
        eq(bankStatementImportBatches.id, batchId),
        eq(bankStatementImportBatches.companyId, actor.companyId),
      ),
    });
    if (!batch) {
      throw new BankTransactionControlError('NOT_FOUND', 'Import batch not found.');
    }

    const account = await this.ensureBankAccount(
      actor.companyId,
      batch.bankAccountCode,
      batch.bankAccountName,
    );

    const importRows = await this.db.query.bankStatementImportRows.findMany({
      where: and(
        eq(bankStatementImportRows.batchId, batchId),
        eq(bankStatementImportRows.companyId, actor.companyId),
      ),
    });

    let imported = 0;
    let skipped = 0;

    for (const row of importRows) {
      if (row.classification !== 'ready_to_import') {
        skipped += 1;
        continue;
      }
      if (!row.transactionDate || row.amountCents === null) {
        skipped += 1;
        continue;
      }

      const direction = deriveBankTransactionDirection(row.amountCents);
      const amountCents = absoluteBankTransactionAmountCents(row.amountCents);
      const fingerprint = hashFingerprint(
        buildBankTransactionFingerprintCanonical({
          companyId: actor.companyId,
          bankAccountId: account.id,
          provider: 'manual_import',
          externalTransactionId: null,
          transactionDate: row.transactionDate,
          amountCents,
          direction,
          reference: row.reference,
          description: row.description,
        }),
      );

      const existing = await this.db.query.bankTransactions.findFirst({
        where: and(
          eq(bankTransactions.companyId, actor.companyId),
          eq(bankTransactions.sourceFingerprint, fingerprint),
        ),
      });
      if (existing) {
        skipped += 1;
        continue;
      }

      const receiptStatus = deriveReceiptStatus({
        direction,
        category: null,
        receiptDocumentId: null,
      });

      const allocationStatus = creditRequiresManualReview(direction) ? 'needs_review' : 'unallocated';

      await this.db.insert(bankTransactions).values({
        companyId: actor.companyId,
        bankAccountId: account.id,
        provider: 'manual_import',
        transactionDate: row.transactionDate,
        amountCents,
        direction,
        description: row.description,
        reference: row.reference,
        sourceFingerprint: fingerprint,
        importBatchId: batchId,
        importRowId: row.id,
        receiptStatus,
        allocationStatus,
        rawProviderMetadata: { importRowIndex: row.rowIndex },
      });

      imported += 1;
    }

    await this.audit(actor.companyId, actor.userId, 'import_batch_ingested', {
      batchId,
      imported,
      skipped,
    }, null, batchId);

    return { imported, skipped };
  }

  private async loadAccountNames(companyId: string): Promise<Map<string, string>> {
    const accounts = await this.db.query.bankAccounts.findMany({
      where: eq(bankAccounts.companyId, companyId),
    });
    return new Map(accounts.map((a) => [a.id, a.name]));
  }

  private mapSummary(
    row: typeof bankTransactions.$inferSelect,
    accountName: string,
    supplierName?: string | null,
  ): BankTransactionSummary {
    const unallocatedAmountCents = Math.max(0, row.amountCents - row.allocatedAmountCents);
    return {
      id: row.id,
      bankAccountId: row.bankAccountId,
      bankAccountName: accountName,
      transactionDate: row.transactionDate,
      postedDate: row.postedDate,
      description: row.description,
      reference: row.reference,
      amountCents: row.amountCents,
      direction: row.direction,
      currency: row.currency,
      allocationStatus: row.allocationStatus,
      reconciliationStatus: row.reconciliationStatus,
      receiptStatus: row.receiptStatus,
      allocatedAmountCents: row.allocatedAmountCents,
      unallocatedAmountCents,
      merchantName: row.merchantName,
      suggestedSupplierName: supplierName ?? null,
      receiptDocumentId: row.receiptDocumentId,
      provider: row.provider,
      importBatchId: row.importBatchId,
    };
  }

  async getControlQueue(actor: BankTransactionControlActor): Promise<BankTransactionControlQueue> {
    this.assertView(actor);

    const today = new Date().toISOString().slice(0, 10);
    const accountNames = await this.loadAccountNames(actor.companyId);

    const rows = await this.db.query.bankTransactions.findMany({
      where: eq(bankTransactions.companyId, actor.companyId),
      orderBy: [desc(bankTransactions.transactionDate)],
      limit: 500,
    });

    const summaries = rows.map((row) =>
      this.mapSummary(row, accountNames.get(row.bankAccountId) ?? ''),
    );

    const unallocatedDebits = summaries.filter(
      (row) => row.direction === 'debit' && row.allocationStatus === 'unallocated',
    );
    const missingReceipts = summaries.filter((row) => row.receiptStatus === 'receipt_missing');
    const suggestedMatches = summaries.filter((row) => row.allocationStatus === 'suggested');
    const partiallyAllocated = summaries.filter(
      (row) => row.allocationStatus === 'partially_allocated',
    );
    const allocated = summaries.filter((row) => row.allocationStatus === 'allocated');
    const creditsNeedingReview = summaries.filter(
      (row) => row.direction === 'credit' && row.allocationStatus === 'needs_review',
    );

    const todayRows = summaries.filter((row) => row.transactionDate === today);
    const moneyInTodayCents = todayRows
      .filter((row) => row.direction === 'credit')
      .reduce((sum, row) => sum + row.amountCents, 0);
    const moneyOutTodayCents = todayRows
      .filter((row) => row.direction === 'debit')
      .reduce((sum, row) => sum + row.amountCents, 0);

    return {
      summary: {
        moneyInTodayCents,
        moneyOutTodayCents,
        unallocatedDebitsCents: unallocatedDebits.reduce((s, r) => s + r.unallocatedAmountCents, 0),
        unallocatedDebitsCount: unallocatedDebits.length,
        missingReceiptsCount: missingReceipts.length,
        jobAttributedSpendingCents: allocated
          .filter((row) => row.direction === 'debit')
          .reduce((s, r) => s + r.allocatedAmountCents, 0),
        overheadSpendingCents: 0,
        creditsNeedingReviewCount: creditsNeedingReview.length,
      },
      unallocatedDebits,
      missingReceipts,
      suggestedMatches,
      partiallyAllocated,
      allocated,
      creditsNeedingReview,
    };
  }

  async listTransactions(
    actor: BankTransactionControlActor,
    filters: {
      allocationStatus?: string;
      direction?: string;
      dateFrom?: string;
      dateTo?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ items: BankTransactionSummary[]; total: number }> {
    this.assertView(actor);

    const conditions = [eq(bankTransactions.companyId, actor.companyId)];
    if (filters.allocationStatus) {
      conditions.push(
        eq(
          bankTransactions.allocationStatus,
          filters.allocationStatus as typeof bankTransactions.$inferSelect.allocationStatus,
        ),
      );
    }
    if (filters.direction) {
      conditions.push(
        eq(
          bankTransactions.direction,
          filters.direction as typeof bankTransactions.$inferSelect.direction,
        ),
      );
    }
    if (filters.dateFrom) {
      conditions.push(gte(bankTransactions.transactionDate, filters.dateFrom));
    }
    if (filters.dateTo) {
      conditions.push(lte(bankTransactions.transactionDate, filters.dateTo));
    }

    const limit = Math.min(filters.limit ?? 50, 200);
    const offset = filters.offset ?? 0;

    const accountNames = await this.loadAccountNames(actor.companyId);

    const rows = await this.db.query.bankTransactions.findMany({
      where: and(...conditions),
      orderBy: [desc(bankTransactions.transactionDate)],
      limit,
      offset,
    });

    const countResult = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(bankTransactions)
      .where(and(...conditions));

    return {
      items: rows.map((row) =>
        this.mapSummary(row, accountNames.get(row.bankAccountId) ?? ''),
      ),
      total: countResult[0]?.count ?? 0,
    };
  }

  async getTransaction(actor: BankTransactionControlActor, transactionId: string): Promise<BankTransactionDetail> {
    this.assertView(actor);

    const row = await this.db.query.bankTransactions.findFirst({
      where: and(
        eq(bankTransactions.id, transactionId),
        eq(bankTransactions.companyId, actor.companyId),
      ),
    });
    if (!row) {
      throw new BankTransactionControlError('NOT_FOUND', 'Bank transaction not found.');
    }

    const account = await this.db.query.bankAccounts.findFirst({
      where: eq(bankAccounts.id, row.bankAccountId),
    });

    const allocations = await this.db.query.bankTransactionAllocations.findMany({
      where: and(
        eq(bankTransactionAllocations.transactionId, transactionId),
        eq(bankTransactionAllocations.isActive, true),
      ),
    });

    const auditHistory = await this.db.query.bankTransactionAuditLogs.findMany({
      where: and(
        eq(bankTransactionAuditLogs.transactionId, transactionId),
        eq(bankTransactionAuditLogs.companyId, actor.companyId),
      ),
      orderBy: [desc(bankTransactionAuditLogs.createdAt)],
      limit: 50,
    });

    const directCosts = await this.loadDirectCostMatchCandidates(actor.companyId);
    const candidates = suggestDirectCostMatches({
      transactionAmountCents: row.amountCents * (row.direction === 'debit' ? 1 : -1),
      transactionDate: row.transactionDate,
      description: row.description,
      reference: row.reference,
      merchantName: row.merchantName,
      directCosts,
    });

    const summary = this.mapSummary(row, account?.name ?? '');

    return {
      ...summary,
      allocations: allocations.map((alloc) => ({
        id: alloc.id,
        amountCents: alloc.amountCents,
        allocationType: alloc.allocationType,
        category: alloc.category,
        jobId: alloc.jobId,
        supplierId: alloc.supplierId,
        directCostId: alloc.directCostId,
        notes: alloc.notes,
        createdAt: alloc.createdAt.toISOString(),
      })),
      candidateMatches: candidates,
      auditHistory: auditHistory.map((entry) => ({
        action: entry.action,
        actorUserId: entry.actorUserId,
        createdAt: entry.createdAt.toISOString(),
        metadata: entry.metadata ?? {},
      })),
    };
  }

  private async loadDirectCostMatchCandidates(companyId: string) {
    const rows = await this.db.query.jobDirectCostEntries.findMany({
      where: eq(jobDirectCostEntries.companyId, companyId),
      limit: 500,
    });
    const supplierIds = [...new Set(rows.map((r) => r.supplierId).filter(Boolean))] as string[];
    const supplierRows =
      supplierIds.length > 0
        ? await this.db.query.suppliers.findMany({
            where: and(eq(suppliers.companyId, companyId), inArray(suppliers.id, supplierIds)),
          })
        : [];
    const supplierMap = new Map(supplierRows.map((s) => [s.id, s.name]));

    return rows.map((row) => ({
      id: row.id,
      jobId: row.jobId,
      description: row.description,
      amountCents: row.amountCents,
      supplierId: row.supplierId,
      supplierName: row.supplierId ? supplierMap.get(row.supplierId) ?? null : null,
      isPaid: row.isPaid,
      costDate: row.costDate?.toISOString() ?? null,
    }));
  }

  async getCandidates(
    actor: BankTransactionControlActor,
    transactionId: string,
  ): Promise<BankMatchCandidate[]> {
    const detail = await this.getTransaction(actor, transactionId);
    return detail.candidateMatches;
  }

  async allocate(
    actor: BankTransactionControlActor,
    transactionId: string,
    lines: AllocateBankTransactionInput[],
    reason?: string,
  ): Promise<BankTransactionDetail> {
    this.assertManage(actor);

    const tx = await this.db.query.bankTransactions.findFirst({
      where: and(
        eq(bankTransactions.id, transactionId),
        eq(bankTransactions.companyId, actor.companyId),
      ),
    });
    if (!tx) {
      throw new BankTransactionControlError('NOT_FOUND', 'Bank transaction not found.');
    }
    if (tx.allocationStatus === 'ignored') {
      throw new BankTransactionControlError('CONFLICT', 'Ignored transactions cannot be allocated.');
    }

    const existingAllocations = await this.db.query.bankTransactionAllocations.findMany({
      where: and(
        eq(bankTransactionAllocations.transactionId, transactionId),
        eq(bankTransactionAllocations.isActive, true),
      ),
    });

    const proposedTotal = [
      ...existingAllocations.map((a) => ({ amountCents: a.amountCents })),
      ...lines.map((l) => ({ amountCents: l.amountCents })),
    ];
    assertAllocationWithinTransaction(tx.amountCents, proposedTotal);

    const affectedJobIds = new Set<string>();

    for (const line of lines) {
      if (line.allocationType === 'direct_job_cost' && !line.jobId && !line.directCostId && !line.createDirectCost) {
        throw new BankTransactionControlError(
          'VALIDATION_ERROR',
          'Direct job cost allocation requires jobId, directCostId, or createDirectCost.',
        );
      }

      let directCostId = line.directCostId ?? null;

      if (line.directCostId) {
        const cost = await this.db.query.jobDirectCostEntries.findFirst({
          where: and(
            eq(jobDirectCostEntries.id, line.directCostId),
            eq(jobDirectCostEntries.companyId, actor.companyId),
          ),
        });
        if (!cost) {
          throw new BankTransactionControlError('NOT_FOUND', 'Direct cost not found.');
        }
        if (cost.isPaid) {
          throw new BankTransactionControlError('CONFLICT', 'Direct cost is already marked paid.');
        }

        // Match existing cost — do NOT duplicate economic cost
        await this.db
          .update(jobDirectCostEntries)
          .set({
            isPaid: true,
            paidAt: new Date(tx.transactionDate),
            updatedAt: new Date(),
          })
          .where(eq(jobDirectCostEntries.id, cost.id));

        directCostId = cost.id;
        if (cost.jobId) affectedJobIds.add(cost.jobId);
      } else if (line.createDirectCost && line.jobId) {
        const [cost] = await this.db
          .insert(jobDirectCostEntries)
          .values({
            companyId: actor.companyId,
            jobId: line.jobId,
            category: (line.directCostCategory ?? 'miscellaneous') as typeof jobDirectCostEntries.$inferInsert.category,
            description: line.directCostDescription?.trim() || tx.description || 'Bank transaction cost',
            amountCents: line.amountCents,
            sourceType: 'bank_transaction',
            sourceId: transactionId,
            costDate: new Date(tx.transactionDate),
            enteredByUserId: actor.userId,
            isPaid: true,
            paidAt: new Date(tx.transactionDate),
            supplierId: line.supplierId ?? null,
            notes: line.notes?.trim() || null,
          })
          .returning();
        directCostId = cost!.id;
        affectedJobIds.add(line.jobId);
      }

      if (line.jobId && allocationAffectsJobProfitability(line.allocationType)) {
        affectedJobIds.add(line.jobId);
      }

      await this.db.insert(bankTransactionAllocations).values({
        companyId: actor.companyId,
        transactionId,
        amountCents: line.amountCents,
        allocationType: line.allocationType,
        category: line.category ?? null,
        jobId: line.jobId ?? null,
        supplierId: line.supplierId ?? null,
        directCostId,
        notes: line.notes?.trim() || null,
        createdByUserId: actor.userId,
      });
    }

    const allActive = await this.db.query.bankTransactionAllocations.findMany({
      where: and(
        eq(bankTransactionAllocations.transactionId, transactionId),
        eq(bankTransactionAllocations.isActive, true),
      ),
    });
    const totals = computeAllocationTotals(tx.amountCents, allActive);

    const primaryType = lines[0]?.allocationType ?? null;
    const receiptStatus = deriveReceiptStatus({
      direction: tx.direction,
      allocationType: primaryType,
      category: lines[0]?.category ?? null,
      receiptDocumentId: tx.receiptDocumentId,
    });

    await this.db
      .update(bankTransactions)
      .set({
        allocatedAmountCents: totals.allocatedAmountCents,
        allocationStatus: totals.allocationStatus,
        receiptStatus,
        updatedAt: new Date(),
      })
      .where(eq(bankTransactions.id, transactionId));

    await this.audit(actor.companyId, actor.userId, 'transaction_allocated', {
      transactionId,
      lines,
      reason: reason ?? null,
    }, transactionId);

    for (const jobId of affectedJobIds) {
      await this.refreshJobFinancials(actor.companyId, jobId);
    }

    return this.getTransaction(actor, transactionId);
  }

  async reallocate(
    actor: BankTransactionControlActor,
    transactionId: string,
    input: {
      deactivateAllocationIds: string[];
      newLines: AllocateBankTransactionInput[];
      reason: string;
    },
  ): Promise<BankTransactionDetail> {
    this.assertManage(actor);

    const oldJobIds = new Set<string>();

    for (const allocId of input.deactivateAllocationIds) {
      const alloc = await this.db.query.bankTransactionAllocations.findFirst({
        where: and(
          eq(bankTransactionAllocations.id, allocId),
          eq(bankTransactionAllocations.companyId, actor.companyId),
          eq(bankTransactionAllocations.transactionId, transactionId),
        ),
      });
      if (!alloc) continue;

      if (alloc.jobId) oldJobIds.add(alloc.jobId);

      await this.db
        .update(bankTransactionAllocations)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(bankTransactionAllocations.id, allocId));

      await this.audit(actor.companyId, actor.userId, 'allocation_deactivated', {
        allocationId: allocId,
        oldAmountCents: alloc.amountCents,
        oldJobId: alloc.jobId,
        oldDirectCostId: alloc.directCostId,
        reason: input.reason,
      }, transactionId);
    }

    const result = await this.allocate(actor, transactionId, input.newLines, input.reason);

    for (const jobId of oldJobIds) {
      await this.refreshJobFinancials(actor.companyId, jobId);
    }

    return result;
  }

  async attachReceipt(
    actor: BankTransactionControlActor,
    transactionId: string,
    documentId: string,
  ): Promise<BankTransactionDetail> {
    this.assertManage(actor);

    const doc = await this.db.query.documents.findFirst({
      where: and(eq(documents.id, documentId), eq(documents.companyId, actor.companyId)),
    });
    if (!doc) {
      throw new BankTransactionControlError('NOT_FOUND', 'Document not found.');
    }

    await this.db
      .update(bankTransactions)
      .set({
        receiptDocumentId: documentId,
        receiptStatus: 'receipt_attached',
        updatedAt: new Date(),
      })
      .where(and(
        eq(bankTransactions.id, transactionId),
        eq(bankTransactions.companyId, actor.companyId),
      ));

    await this.audit(actor.companyId, actor.userId, 'receipt_attached', { documentId }, transactionId);

    return this.getTransaction(actor, transactionId);
  }

  async ignore(
    actor: BankTransactionControlActor,
    transactionId: string,
    reason: string,
  ): Promise<BankTransactionDetail> {
    this.assertManage(actor);

    await this.db
      .update(bankTransactions)
      .set({
        allocationStatus: 'ignored',
        updatedAt: new Date(),
      })
      .where(and(
        eq(bankTransactions.id, transactionId),
        eq(bankTransactions.companyId, actor.companyId),
      ));

    await this.audit(actor.companyId, actor.userId, 'transaction_ignored', { reason }, transactionId);

    return this.getTransaction(actor, transactionId);
  }

  async suggestSupplierForTransaction(
    actor: BankTransactionControlActor,
    transactionId: string,
  ): Promise<{ supplierId: string; supplierName: string; confidence: string } | null> {
    this.assertView(actor);

    const tx = await this.db.query.bankTransactions.findFirst({
      where: and(
        eq(bankTransactions.id, transactionId),
        eq(bankTransactions.companyId, actor.companyId),
      ),
    });
    if (!tx) return null;

    const supplierList = await this.db.query.suppliers.findMany({
      where: eq(suppliers.companyId, actor.companyId),
      limit: 500,
    });

    const suggestion = suggestSupplierFromDescription(tx.description, supplierList);
    if (!suggestion) return null;

    // Suggestion only — do not auto-write supplier_id unless Owner approves via separate action
    return suggestion;
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
