import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
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
  computeDirectCostSettlementAfterAllocation,
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
  idempotencyKey?: string | null;
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
          eq(bankTransactions.bankAccountId, account.id),
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

      try {
        const inserted = await this.db
          .insert(bankTransactions)
          .values({
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
          })
          .onConflictDoNothing({
            target: [
              bankTransactions.companyId,
              bankTransactions.bankAccountId,
              bankTransactions.sourceFingerprint,
            ],
          })
          .returning({ id: bankTransactions.id });
        if (inserted.length === 0) skipped += 1;
        else imported += 1;
      } catch {
        skipped += 1;
      }
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
    confirmedSupplierName?: string | null,
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
      confirmedSupplierName: confirmedSupplierName ?? null,
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

  private async sumActiveAllocationsForDirectCost(
    db: DatabaseClient,
    companyId: string,
    directCostId: string,
    excludeAllocationIds: string[] = [],
  ): Promise<number> {
    const rows = await db
      .select({ amountCents: bankTransactionAllocations.amountCents, id: bankTransactionAllocations.id })
      .from(bankTransactionAllocations)
      .where(
        and(
          eq(bankTransactionAllocations.companyId, companyId),
          eq(bankTransactionAllocations.directCostId, directCostId),
          eq(bankTransactionAllocations.isActive, true),
        ),
      );
    return rows
      .filter((row) => !excludeAllocationIds.includes(row.id))
      .reduce((sum, row) => sum + row.amountCents, 0);
  }

  private async syncDirectCostSettlement(
    db: DatabaseClient,
    companyId: string,
    directCostId: string,
    paidAt?: Date | null,
  ): Promise<void> {
    const cost = await db.query.jobDirectCostEntries.findFirst({
      where: and(
        eq(jobDirectCostEntries.id, directCostId),
        eq(jobDirectCostEntries.companyId, companyId),
      ),
    });
    if (!cost) return;

    const allocatedCents = await this.sumActiveAllocationsForDirectCost(db, companyId, directCostId);
    const amountPaidCents = Math.min(cost.amountCents, allocatedCents);
    const isPaid = amountPaidCents >= cost.amountCents;

    await db
      .update(jobDirectCostEntries)
      .set({
        amountPaidCents,
        isPaid,
        paidAt: amountPaidCents > 0 ? (paidAt ?? cost.paidAt ?? new Date()) : null,
        updatedAt: new Date(),
      })
      .where(eq(jobDirectCostEntries.id, directCostId));
  }

  async allocate(
    actor: BankTransactionControlActor,
    transactionId: string,
    lines: AllocateBankTransactionInput[],
    reason?: string,
  ): Promise<BankTransactionDetail> {
    this.assertManage(actor);

    const affectedJobIds = new Set<string>();
    const affectedDirectCostIds = new Set<string>();

    await this.db.transaction(async (tx) => {
      const locked = await tx
        .select()
        .from(bankTransactions)
        .where(
          and(
            eq(bankTransactions.id, transactionId),
            eq(bankTransactions.companyId, actor.companyId),
          ),
        )
        .for('update');

      const txRow = locked[0];
      if (!txRow) {
        throw new BankTransactionControlError('NOT_FOUND', 'Bank transaction not found.');
      }
      if (txRow.allocationStatus === 'ignored') {
        throw new BankTransactionControlError('CONFLICT', 'Ignored transactions cannot be allocated.');
      }

      const existingAllocations = await tx.query.bankTransactionAllocations.findMany({
        where: and(
          eq(bankTransactionAllocations.transactionId, transactionId),
          eq(bankTransactionAllocations.isActive, true),
        ),
      });

      const linesToApply: AllocateBankTransactionInput[] = [];
      for (const line of lines) {
        if (line.idempotencyKey) {
          const dup = existingAllocations.find(
            (row) => row.idempotencyKey === line.idempotencyKey,
          );
          if (dup) continue;
        }
        linesToApply.push(line);
      }

      if (linesToApply.length === 0) return;

      const proposedTotal = [
        ...existingAllocations.map((a) => ({ amountCents: a.amountCents })),
        ...linesToApply.map((l) => ({ amountCents: l.amountCents })),
      ];
      assertAllocationWithinTransaction(txRow.amountCents, proposedTotal);

      for (const line of linesToApply) {
        if (
          line.allocationType === 'direct_job_cost' &&
          !line.jobId &&
          !line.directCostId &&
          !line.createDirectCost
        ) {
          throw new BankTransactionControlError(
            'VALIDATION_ERROR',
            'Direct job cost allocation requires jobId, directCostId, or createDirectCost.',
          );
        }

        let directCostId = line.directCostId ?? null;

        if (line.directCostId) {
          const cost = await tx.query.jobDirectCostEntries.findFirst({
            where: and(
              eq(jobDirectCostEntries.id, line.directCostId),
              eq(jobDirectCostEntries.companyId, actor.companyId),
            ),
          });
          if (!cost) {
            throw new BankTransactionControlError('NOT_FOUND', 'Direct cost not found.');
          }

          const alreadyAllocated = await this.sumActiveAllocationsForDirectCost(
            tx as unknown as DatabaseClient,
            actor.companyId,
            cost.id,
          );
          if (alreadyAllocated + line.amountCents > cost.amountCents) {
            throw new BankTransactionControlError(
              'OVER_ALLOCATION',
              `Allocation would exceed direct cost amount (${alreadyAllocated + line.amountCents} > ${cost.amountCents}).`,
            );
          }

          const preview = computeDirectCostSettlementAfterAllocation({
            amountCents: cost.amountCents,
            currentAmountPaidCents: cost.amountPaidCents ?? 0,
            allocationAmountCents: line.amountCents,
          });

          directCostId = cost.id;
          affectedDirectCostIds.add(cost.id);
          if (cost.jobId) affectedJobIds.add(cost.jobId);

          await tx
            .update(jobDirectCostEntries)
            .set({
              amountPaidCents: preview.amountPaidCents,
              isPaid: preview.isPaid,
              paidAt: preview.amountPaidCents > 0 ? new Date(txRow.transactionDate) : null,
              updatedAt: new Date(),
            })
            .where(eq(jobDirectCostEntries.id, cost.id));
        } else if (line.createDirectCost && line.jobId) {
          const [cost] = await tx
            .insert(jobDirectCostEntries)
            .values({
              companyId: actor.companyId,
              jobId: line.jobId,
              category: (line.directCostCategory ?? 'miscellaneous') as typeof jobDirectCostEntries.$inferInsert.category,
              description: line.directCostDescription?.trim() || txRow.description || 'Bank transaction cost',
              amountCents: line.amountCents,
              amountPaidCents: line.amountCents,
              sourceType: 'bank_transaction',
              sourceId: `${transactionId}:${line.idempotencyKey ?? randomUUID()}`,
              costDate: new Date(txRow.transactionDate),
              enteredByUserId: actor.userId,
              isPaid: true,
              paidAt: new Date(txRow.transactionDate),
              supplierId: line.supplierId ?? null,
              notes: line.notes?.trim() || null,
            })
            .returning();
          directCostId = cost!.id;
          affectedDirectCostIds.add(cost!.id);
          affectedJobIds.add(line.jobId);
        }

        if (line.jobId && allocationAffectsJobProfitability(line.allocationType)) {
          affectedJobIds.add(line.jobId);
        }

        await tx.insert(bankTransactionAllocations).values({
          companyId: actor.companyId,
          transactionId,
          amountCents: line.amountCents,
          allocationType: line.allocationType,
          category: line.category ?? null,
          jobId: line.jobId ?? null,
          supplierId: line.supplierId ?? null,
          directCostId,
          notes: line.notes?.trim() || null,
          idempotencyKey: line.idempotencyKey ?? null,
          createdByUserId: actor.userId,
        });
      }

      for (const directCostId of affectedDirectCostIds) {
        await this.syncDirectCostSettlement(
          tx as unknown as DatabaseClient,
          actor.companyId,
          directCostId,
          new Date(txRow.transactionDate),
        );
      }

      const allActive = await tx.query.bankTransactionAllocations.findMany({
        where: and(
          eq(bankTransactionAllocations.transactionId, transactionId),
          eq(bankTransactionAllocations.isActive, true),
        ),
      });
      const totals = computeAllocationTotals(txRow.amountCents, allActive);

      const primaryType = linesToApply[0]?.allocationType ?? null;
      const receiptStatus = deriveReceiptStatus({
        direction: txRow.direction,
        allocationType: primaryType,
        category: linesToApply[0]?.category ?? null,
        receiptDocumentId: txRow.receiptDocumentId,
      });

      await tx
        .update(bankTransactions)
        .set({
          allocatedAmountCents: totals.allocatedAmountCents,
          allocationStatus: totals.allocationStatus,
          receiptStatus,
          updatedAt: new Date(),
        })
        .where(eq(bankTransactions.id, transactionId));

      await tx.insert(bankTransactionAuditLogs).values({
        companyId: actor.companyId,
        transactionId,
        action: 'transaction_allocated',
        actorUserId: actor.userId,
        metadata: { lines: linesToApply, reason: reason ?? null },
      });
    });

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
    const affectedDirectCostIds = new Set<string>();

    await this.db.transaction(async (tx) => {
      const locked = await tx
        .select()
        .from(bankTransactions)
        .where(
          and(
            eq(bankTransactions.id, transactionId),
            eq(bankTransactions.companyId, actor.companyId),
          ),
        )
        .for('update');

      if (!locked[0]) {
        throw new BankTransactionControlError('NOT_FOUND', 'Bank transaction not found.');
      }

      for (const allocId of input.deactivateAllocationIds) {
        const alloc = await tx.query.bankTransactionAllocations.findFirst({
          where: and(
            eq(bankTransactionAllocations.id, allocId),
            eq(bankTransactionAllocations.companyId, actor.companyId),
            eq(bankTransactionAllocations.transactionId, transactionId),
          ),
        });
        if (!alloc) continue;

        if (alloc.jobId) oldJobIds.add(alloc.jobId);
        if (alloc.directCostId) affectedDirectCostIds.add(alloc.directCostId);

        await tx
          .update(bankTransactionAllocations)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(bankTransactionAllocations.id, allocId));

        await tx.insert(bankTransactionAuditLogs).values({
          companyId: actor.companyId,
          transactionId,
          action: 'allocation_deactivated',
          actorUserId: actor.userId,
          metadata: {
            allocationId: allocId,
            oldAmountCents: alloc.amountCents,
            oldJobId: alloc.jobId,
            oldDirectCostId: alloc.directCostId,
            reason: input.reason,
          },
        });
      }

      for (const directCostId of affectedDirectCostIds) {
        await this.syncDirectCostSettlement(
          tx as unknown as DatabaseClient,
          actor.companyId,
          directCostId,
        );
      }
    });

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
