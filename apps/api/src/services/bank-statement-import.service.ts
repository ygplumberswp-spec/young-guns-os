import { createHash, randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import {
  bankStatementImportAuditLogs,
  bankStatementImportBatches,
  bankStatementImportRows,
  xeroAccounts,
  xeroBankTransactions,
} from '@titan/db';
import {
  BANK_STATEMENT_REVIEW_STATUS,
  BANK_STATEMENT_ROW_CLASSIFICATION_LABELS,
  canManageBankStatementImport,
  canViewBankStatementImport,
  type BankStatementColumnMapping,
  type BankStatementImportPreview,
  type BankStatementPreviewRow,
  type BankStatementRowClassification,
  type BankStatementBankAccountOption,
} from '@titan/shared';
import {
  buildStatementRowFingerprint,
  detectColumnMapping,
  parseCsvContent,
  parseStatementAmountCents,
  parseStatementDate,
} from '../lib/bank-statement-csv.js';
import type { BankStatementStorageService } from './bank-statement-storage.service.js';
import { BankStatementStorageError } from './bank-statement-storage.service.js';

export class BankStatementImportError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BankStatementImportError';
  }
}

export type BankStatementImportActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

type ParsedStatementRow = {
  rowIndex: number;
  transactionDate: string | null;
  amountCents: number | null;
  currency: string;
  reference: string | null;
  description: string | null;
  rowFingerprint: string;
  rawData: Record<string, string>;
};

const SUGGESTED_MATCH_RULES: Array<{ type: string; label: string; pattern: RegExp }> = [
  { type: 'invoice_payment', label: 'Invoice payment', pattern: /\binv(oice)?\b|\bpayment received\b/i },
  { type: 'yoco_settlement', label: 'Yoco settlement', pattern: /\byoco\b/i },
  { type: 'supplier_payment', label: 'Supplier payment', pattern: /\bsupplier\b|\bvendor\b|\bpayable\b/i },
  { type: 'expense', label: 'Expense', pattern: /\bexpense\b|\bfuel\b|\bpurchase\b/i },
  { type: 'refund', label: 'Refund', pattern: /\brefund\b|\breversal\b/i },
  { type: 'transfer', label: 'Transfer', pattern: /\btransfer\b|\binter[- ]?account\b/i },
  { type: 'bank_fee', label: 'Bank fee', pattern: /\bfee\b|\bbank charge\b|\bservice charge\b/i },
];

function hashFingerprint(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function emptySummary(): Record<BankStatementRowClassification, number> {
  return {
    ready_to_import: 0,
    existing_xero_transaction: 0,
    existing_manual_transaction: 0,
    possible_duplicate: 0,
    conflict: 0,
    invalid: 0,
    review_required: 0,
  };
}

function detectSuggestedMatch(reference: string | null, description: string | null): {
  type: string | null;
  label: string | null;
} {
  const haystack = `${reference ?? ''} ${description ?? ''}`.trim();
  if (!haystack) return { type: null, label: null };
  for (const rule of SUGGESTED_MATCH_RULES) {
    if (rule.pattern.test(haystack)) {
      return { type: rule.type, label: rule.label };
    }
  }
  return { type: null, label: null };
}

export class BankStatementImportService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly storage: BankStatementStorageService,
  ) {}

  private assertView(actor: BankStatementImportActor): void {
    if (!canViewBankStatementImport(actor)) {
      throw new BankStatementImportError(
        'FORBIDDEN',
        'Bank statement import requires authorised finance access.',
      );
    }
  }

  private assertManage(actor: BankStatementImportActor): void {
    this.assertView(actor);
    if (!canManageBankStatementImport(actor)) {
      throw new BankStatementImportError(
        'FORBIDDEN',
        'Bank statement import management requires finance:write.',
      );
    }
  }

  private async audit(
    batchId: string,
    companyId: string,
    actorUserId: string,
    action: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const safeMetadata = { ...metadata };
    delete safeMetadata.fileContent;
    delete safeMetadata.accountNumber;
    delete safeMetadata.iban;

    await this.db.insert(bankStatementImportAuditLogs).values({
      batchId,
      companyId,
      action,
      actorUserId,
      metadata: safeMetadata,
    });
  }

  async listBankAccounts(companyId: string): Promise<BankStatementBankAccountOption[]> {
    const rows = await this.db.query.xeroAccounts.findMany({
      where: and(eq(xeroAccounts.companyId, companyId), eq(xeroAccounts.type, 'BANK')),
      columns: { code: true, name: true },
      orderBy: (table, { asc }) => [asc(table.name)],
    });

    return rows
      .filter((row) => row.code?.trim())
      .map((row) => ({
        code: row.code!.trim(),
        name: row.name,
        source: 'xero' as const,
      }));
  }

  private async resolveBankAccount(
    companyId: string,
    bankAccountCode: string,
  ): Promise<{ code: string; name: string }> {
    const account = await this.db.query.xeroAccounts.findFirst({
      where: and(
        eq(xeroAccounts.companyId, companyId),
        eq(xeroAccounts.code, bankAccountCode),
        eq(xeroAccounts.type, 'BANK'),
      ),
      columns: { code: true, name: true },
    });
    if (!account?.code) {
      throw new BankStatementImportError('NOT_FOUND', 'Bank account not found for this tenant.');
    }
    return { code: account.code.trim(), name: account.name };
  }

  private parseRows(input: {
    content: string;
    bankAccountCode: string;
    columnMapping?: BankStatementColumnMapping;
  }): { mapping: BankStatementColumnMapping; rows: ParsedStatementRow[] } {
    const parsed = parseCsvContent(input.content);
    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      throw new BankStatementImportError('INVALID_FILE', 'CSV statement contains no data rows.');
    }

    const mapping = input.columnMapping ?? detectColumnMapping(parsed.headers);
    if (!mapping) {
      throw new BankStatementImportError(
        'COLUMN_MAPPING_REQUIRED',
        'Could not detect date and amount columns — provide column mapping.',
      );
    }

    const headerIndex = new Map(parsed.headers.map((header, index) => [header, index]));
    const dateIdx = headerIndex.get(mapping.date);
    const amountIdx = headerIndex.get(mapping.amount);
    if (dateIdx === undefined || amountIdx === undefined) {
      throw new BankStatementImportError('INVALID_MAPPING', 'Column mapping references unknown headers.');
    }

    const descIdx = mapping.description ? headerIndex.get(mapping.description) : undefined;
    const refIdx = mapping.reference ? headerIndex.get(mapping.reference) : undefined;

    const rows: ParsedStatementRow[] = parsed.rows.map((cells, rowIndex) => {
      const rawData: Record<string, string> = {};
      parsed.headers.forEach((header, idx) => {
        rawData[header] = cells[idx] ?? '';
      });

      const transactionDate = parseStatementDate(cells[dateIdx]);
      const amountCents = parseStatementAmountCents(cells[amountIdx]);
      const reference = refIdx !== undefined ? cells[refIdx]?.trim() || null : null;
      const description = descIdx !== undefined ? cells[descIdx]?.trim() || null : null;
      const rawFingerprint = buildStatementRowFingerprint({
        bankAccountCode: input.bankAccountCode,
        transactionDate,
        amountCents,
        reference,
        description,
      });

      return {
        rowIndex,
        transactionDate,
        amountCents,
        currency: 'ZAR',
        reference,
        description,
        rowFingerprint: hashFingerprint(rawFingerprint),
        rawData,
      };
    });

    return { mapping, rows };
  }

  private async loadExistingFingerprints(companyId: string): Promise<Set<string>> {
    const importedBatchIds = await this.db
      .select({ id: bankStatementImportBatches.id })
      .from(bankStatementImportBatches)
      .where(
        and(
          eq(bankStatementImportBatches.companyId, companyId),
          inArray(bankStatementImportBatches.status, ['approved', 'imported']),
        ),
      );

    if (importedBatchIds.length === 0) return new Set();

    const rows = await this.db
      .select({ fingerprint: bankStatementImportRows.rowFingerprint })
      .from(bankStatementImportRows)
      .where(
        and(
          eq(bankStatementImportRows.companyId, companyId),
          inArray(
            bankStatementImportRows.batchId,
            importedBatchIds.map((batch) => batch.id),
          ),
        ),
      );

    return new Set(rows.map((row) => row.fingerprint));
  }

  private async loadXeroMatches(
    companyId: string,
    bankAccountCode: string,
    rows: ParsedStatementRow[],
  ): Promise<Set<string>> {
    const validRows = rows.filter((row) => row.transactionDate && row.amountCents !== null);
    if (validRows.length === 0) return new Set();

    const xeroRows = await this.db.query.xeroBankTransactions.findMany({
      where: and(
        eq(xeroBankTransactions.companyId, companyId),
        eq(xeroBankTransactions.bankAccountCode, bankAccountCode),
      ),
      columns: {
        transactionDate: true,
        amountCents: true,
        reference: true,
        description: true,
      },
    });

    const matches = new Set<string>();
    for (const row of validRows) {
      const hit = xeroRows.some(
        (xero) =>
          xero.transactionDate === row.transactionDate &&
          xero.amountCents === row.amountCents &&
          (xero.reference?.trim().toLowerCase() === row.reference?.trim().toLowerCase() ||
            xero.description?.trim().toLowerCase() === row.description?.trim().toLowerCase() ||
            (!row.reference && !row.description)),
      );
      if (hit) matches.add(row.rowFingerprint);
    }
    return matches;
  }

  private classifyRows(input: {
    rows: ParsedStatementRow[];
    existingManual: Set<string>;
    existingXero: Set<string>;
  }): Array<ParsedStatementRow & { classification: BankStatementRowClassification; suggestedMatchType: string | null; suggestedMatchLabel: string | null }> {
    const seenInFile = new Map<string, number>();
    const amountDateCounts = new Map<string, number>();

    for (const row of input.rows) {
      seenInFile.set(row.rowFingerprint, (seenInFile.get(row.rowFingerprint) ?? 0) + 1);
      if (row.transactionDate && row.amountCents !== null) {
        const key = `${row.transactionDate}|${row.amountCents}`;
        amountDateCounts.set(key, (amountDateCounts.get(key) ?? 0) + 1);
      }
    }

    return input.rows.map((row) => {
      const suggested = detectSuggestedMatch(row.reference, row.description);
      const matchFields = {
        suggestedMatchType: suggested.type,
        suggestedMatchLabel: suggested.label,
      };

      if (!row.transactionDate || row.amountCents === null) {
        return { ...row, classification: 'invalid' as const, ...matchFields };
      }

      if (input.existingXero.has(row.rowFingerprint)) {
        return { ...row, classification: 'existing_xero_transaction' as const, ...matchFields };
      }

      if (input.existingManual.has(row.rowFingerprint)) {
        return { ...row, classification: 'existing_manual_transaction' as const, ...matchFields };
      }

      if ((seenInFile.get(row.rowFingerprint) ?? 0) > 1) {
        return { ...row, classification: 'conflict' as const, ...matchFields };
      }

      const amountDateKey = `${row.transactionDate}|${row.amountCents}`;
      if ((amountDateCounts.get(amountDateKey) ?? 0) > 1) {
        return { ...row, classification: 'possible_duplicate' as const, ...matchFields };
      }

      if (suggested.type) {
        return { ...row, classification: 'review_required' as const, ...matchFields };
      }

      return {
        ...row,
        classification: 'ready_to_import' as const,
        suggestedMatchType: null,
        suggestedMatchLabel: null,
      };
    });
  }

  private buildPreview(
    batch: typeof bankStatementImportBatches.$inferSelect,
    classifiedRows: Array<{
      rowIndex: number;
      transactionDate: string | null;
      amountCents: number | null;
      currency: string;
      reference: string | null;
      description: string | null;
      classification: BankStatementRowClassification;
      suggestedMatchType: string | null;
      suggestedMatchLabel: string | null;
    }>,
  ): BankStatementImportPreview {
    const summary = emptySummary();
    for (const row of classifiedRows) summary[row.classification] += 1;

    const rows: BankStatementPreviewRow[] = classifiedRows.map((row) => ({
      rowIndex: row.rowIndex,
      transactionDate: row.transactionDate,
      amountCents: row.amountCents,
      currency: row.currency,
      reference: row.reference,
      description: row.description,
      classification: row.classification,
      classificationLabel: BANK_STATEMENT_ROW_CLASSIFICATION_LABELS[row.classification],
      reviewStatus: BANK_STATEMENT_REVIEW_STATUS,
      suggestedMatchType: row.suggestedMatchType,
      suggestedMatchLabel: row.suggestedMatchLabel,
    }));

    return {
      batchId: batch.id,
      bankAccountCode: batch.bankAccountCode,
      bankAccountName: batch.bankAccountName,
      status: batch.status as BankStatementImportPreview['status'],
      fileChecksumSha256: batch.fileChecksumSha256,
      sanitizedFilename: batch.sanitizedFilename,
      rowCount: batch.rowCount,
      summary,
      rows,
    };
  }

  async createPreview(
    actor: BankStatementImportActor,
    input: {
      bankAccountCode: string;
      filename: string;
      mimeType: string;
      content: Buffer;
      columnMapping?: BankStatementColumnMapping;
    },
  ): Promise<BankStatementImportPreview> {
    this.assertManage(actor);

    const account = await this.resolveBankAccount(actor.companyId, input.bankAccountCode);
    const batchId = randomUUID();

    let stored;
    try {
      stored = await this.storage.store({
        companyId: actor.companyId,
        batchId,
        filename: input.filename,
        mimeType: input.mimeType,
        content: input.content,
      });
    } catch (error) {
      if (error instanceof BankStatementStorageError) {
        throw new BankStatementImportError(error.code, error.message);
      }
      throw error;
    }

    const { mapping, rows } = this.parseRows({
      content: input.content.toString('utf8'),
      bankAccountCode: account.code,
      columnMapping: input.columnMapping,
    });

    const existingManual = await this.loadExistingFingerprints(actor.companyId);
    const existingXero = await this.loadXeroMatches(actor.companyId, account.code, rows);
    const classified = this.classifyRows({ rows, existingManual, existingXero });

    const summary = emptySummary();
    for (const row of classified) summary[row.classification] += 1;

    const [batch] = await this.db
      .insert(bankStatementImportBatches)
      .values({
        id: batchId,
        companyId: actor.companyId,
        bankAccountCode: account.code,
        bankAccountName: account.name,
        status: 'preview_ready',
        originalFilename: input.filename,
        sanitizedFilename: stored.sanitizedFilename,
        storageKey: stored.storageKey,
        mimeType: stored.mimeType,
        fileSizeBytes: stored.sizeBytes,
        fileChecksumSha256: stored.checksumSha256,
        columnMapping: mapping,
        rowCount: classified.length,
        readyCount: summary.ready_to_import,
        duplicateCount:
          summary.possible_duplicate +
          summary.existing_xero_transaction +
          summary.existing_manual_transaction,
        invalidCount: summary.invalid,
        reviewRequiredCount: summary.review_required,
        createdByUserId: actor.userId,
      })
      .returning();

    await this.db.insert(bankStatementImportRows).values(
      classified.map((row) => ({
        batchId,
        companyId: actor.companyId,
        rowIndex: row.rowIndex,
        transactionDate: row.transactionDate,
        amountCents: row.amountCents,
        currency: row.currency,
        reference: row.reference,
        description: row.description,
        rowFingerprint: row.rowFingerprint,
        classification: row.classification,
        reviewStatus: BANK_STATEMENT_REVIEW_STATUS,
        suggestedMatchType: row.suggestedMatchType,
        suggestedMatchLabel: row.suggestedMatchLabel,
        rawData: rows[row.rowIndex]?.rawData ?? {},
      })),
    );

    await this.audit(batchId, actor.companyId, actor.userId, 'preview_created', {
      rowCount: classified.length,
      fileChecksumSha256: stored.checksumSha256,
      bankAccountCode: account.code,
    });

    return this.buildPreview(batch!, classified);
  }

  async getBatch(actor: BankStatementImportActor, batchId: string): Promise<BankStatementImportPreview> {
    this.assertView(actor);

    const batch = await this.db.query.bankStatementImportBatches.findFirst({
      where: and(
        eq(bankStatementImportBatches.id, batchId),
        eq(bankStatementImportBatches.companyId, actor.companyId),
      ),
    });
    if (!batch) {
      throw new BankStatementImportError('NOT_FOUND', 'Import batch not found.');
    }

    const rows = await this.db.query.bankStatementImportRows.findMany({
      where: and(
        eq(bankStatementImportRows.batchId, batchId),
        eq(bankStatementImportRows.companyId, actor.companyId),
      ),
      orderBy: (table, { asc }) => [asc(table.rowIndex)],
    });

    const classified = rows.map((row) => ({
      rowIndex: row.rowIndex,
      transactionDate: row.transactionDate,
      amountCents: row.amountCents,
      currency: row.currency,
      reference: row.reference,
      description: row.description,
      classification: row.classification as BankStatementRowClassification,
      suggestedMatchType: row.suggestedMatchType,
      suggestedMatchLabel: row.suggestedMatchLabel,
    }));

    return this.buildPreview(batch, classified);
  }

  async approveBatch(actor: BankStatementImportActor, batchId: string): Promise<BankStatementImportPreview> {
    this.assertManage(actor);

    const batch = await this.db.query.bankStatementImportBatches.findFirst({
      where: and(
        eq(bankStatementImportBatches.id, batchId),
        eq(bankStatementImportBatches.companyId, actor.companyId),
      ),
    });
    if (!batch) {
      throw new BankStatementImportError('NOT_FOUND', 'Import batch not found.');
    }
    if (batch.status !== 'preview_ready') {
      throw new BankStatementImportError('CONFLICT', 'Only preview-ready batches can be approved.');
    }

    const now = new Date();
    const [updated] = await this.db
      .update(bankStatementImportBatches)
      .set({
        status: 'imported',
        approvedByUserId: actor.userId,
        approvedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(bankStatementImportBatches.id, batchId),
          eq(bankStatementImportBatches.companyId, actor.companyId),
        ),
      )
      .returning();

    await this.audit(batchId, actor.companyId, actor.userId, 'batch_approved', {
      rowCount: batch.rowCount,
      accountingTruth: 'rows remain imported_awaiting_review — not paid or reconciled',
    });

    const preview = await this.getBatch(actor, batchId);
    preview.status = updated?.status as BankStatementImportPreview['status'];
    return preview;
  }

  async revertBatch(actor: BankStatementImportActor, batchId: string): Promise<BankStatementImportPreview> {
    this.assertManage(actor);

    const batch = await this.db.query.bankStatementImportBatches.findFirst({
      where: and(
        eq(bankStatementImportBatches.id, batchId),
        eq(bankStatementImportBatches.companyId, actor.companyId),
      ),
    });
    if (!batch) {
      throw new BankStatementImportError('NOT_FOUND', 'Import batch not found.');
    }
    if (batch.status !== 'preview_ready') {
      throw new BankStatementImportError(
        'CONFLICT',
        'Only unconfirmed preview batches can be reverted.',
      );
    }

    const now = new Date();
    await this.db
      .update(bankStatementImportBatches)
      .set({ status: 'reverted', revertedAt: now, updatedAt: now })
      .where(
        and(
          eq(bankStatementImportBatches.id, batchId),
          eq(bankStatementImportBatches.companyId, actor.companyId),
        ),
      );

    await this.audit(batchId, actor.companyId, actor.userId, 'batch_reverted', {
      previousStatus: batch.status,
    });

    return this.getBatch(actor, batchId);
  }

  /** Detect CSV headers without persisting — used before preview submission. */
  detectHeaders(content: string): { headers: string[]; suggestedMapping: BankStatementColumnMapping | null } {
    const parsed = parseCsvContent(content);
    return {
      headers: parsed.headers,
      suggestedMapping: detectColumnMapping(parsed.headers),
    };
  }
}
