/** BANK-IMPORT-001 row classification after dry-run preview. */
export type BankStatementRowClassification =
  | 'ready_to_import'
  | 'existing_xero_transaction'
  | 'existing_manual_transaction'
  | 'possible_duplicate'
  | 'conflict'
  | 'invalid'
  | 'review_required';

export const BANK_STATEMENT_ROW_CLASSIFICATION_LABELS: Record<
  BankStatementRowClassification,
  string
> = {
  ready_to_import: 'Ready to import',
  existing_xero_transaction: 'Existing Xero transaction',
  existing_manual_transaction: 'Existing manual transaction',
  possible_duplicate: 'Possible duplicate',
  conflict: 'Conflict',
  invalid: 'Invalid',
  review_required: 'Review required',
};

/** Manual import rows always begin here — never auto paid/reconciled. */
export const BANK_STATEMENT_REVIEW_STATUS = 'imported_awaiting_review' as const;

export type BankStatementImportBatchStatus =
  | 'preview_ready'
  | 'approved'
  | 'imported'
  | 'reverted';

export type BankStatementColumnMapping = {
  date: string;
  amount: string;
  description?: string;
  reference?: string;
};

export type BankStatementPreviewRow = {
  rowIndex: number;
  transactionDate: string | null;
  amountCents: number | null;
  currency: string;
  reference: string | null;
  description: string | null;
  classification: BankStatementRowClassification;
  classificationLabel: string;
  reviewStatus: typeof BANK_STATEMENT_REVIEW_STATUS;
  suggestedMatchType: string | null;
  suggestedMatchLabel: string | null;
};

export type BankStatementImportPreview = {
  batchId: string;
  bankAccountCode: string;
  bankAccountName: string;
  status: BankStatementImportBatchStatus;
  fileChecksumSha256: string;
  sanitizedFilename: string;
  rowCount: number;
  summary: Record<BankStatementRowClassification, number>;
  rows: BankStatementPreviewRow[];
};

export type BankStatementBankAccountOption = {
  code: string;
  name: string;
  source: 'xero' | 'manual';
};

/** Supported and tested statement formats for BANK-IMPORT-001. */
export const BANK_STATEMENT_SUPPORTED_FORMATS = [
  { mimeType: 'text/csv', extension: '.csv', label: 'CSV (comma-separated)' },
] as const;

export const BANK_STATEMENT_MAX_FILE_BYTES = 5 * 1024 * 1024;

function hasFinancePermission(
  permissions: readonly string[],
  required: readonly string[],
): boolean {
  if (permissions.includes('*')) return true;
  return required.some((perm) => permissions.includes(perm));
}

export function canManageBankStatementImport(identity: {
  roleName: string;
  permissions: readonly string[];
}): boolean {
  if (identity.roleName === 'Technician' || identity.roleName === 'Client') {
    return false;
  }
  return hasFinancePermission(identity.permissions, ['finance:write']);
}

export function canViewBankStatementImport(identity: {
  roleName: string;
  permissions: readonly string[];
}): boolean {
  if (identity.roleName === 'Technician' || identity.roleName === 'Client') {
    return false;
  }
  return hasFinancePermission(identity.permissions, ['finance:read', 'finance:write']);
}

export function sanitizeBankStatementFilename(input: string): string {
  const base = (input.split(/[/\\]/).pop() ?? 'statement.csv').trim() || 'statement.csv';
  return base.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
}

export function isSupportedBankStatementMime(mimeType: string, filename: string): boolean {
  const normalized = mimeType.toLowerCase().split(';')[0]?.trim() ?? '';
  if (normalized === 'text/csv' || normalized === 'application/csv') return true;
  return filename.toLowerCase().endsWith('.csv');
}
